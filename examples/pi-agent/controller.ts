import { PiRpcClient } from "./rpc"
import { listSessions, type SessionSummary } from "./sessions"
import {
  isJsonRecord,
  isJsonValue,
  isPiEvent,
  type JsonRecord,
  type PiCommandInfo,
  type PiController,
  type PiControllerOptions,
  type PiEvent,
  type PiExtensionRequest,
  type PiMessage,
  type PiModel,
  type PiQueue,
  type RpcResponseRecord,
  type PiSessionState,
  type PiSnapshot,
  type PiStats,
  type PiTree,
  type PiTreeNode,
  type SubmitMode,
} from "./protocol"

export type { PiController, PiControllerOptions, PiSnapshot, SubmitMode }

const STARTUP_DIALOG_ERROR = "Pi 0.85.1 RPC cannot resolve startup extension dialogs; use Pi TUI or adapt extension"

export function createPiController(options: PiControllerOptions): PiController {
  return new PiControllerImpl(options)
}

class PiControllerImpl implements PiController {
  private readonly rpc: PiRpcClient
  private readonly options: PiControllerOptions
  private readonly listeners = new Set<() => void>()
  private readonly value: PiSnapshot = initialSnapshot()
  private stopRpc: (() => void) | null = null
  private refreshTask: Promise<void> | null = null
  private refreshGeneration = 0
  private sessionMutationTail: Promise<void> = Promise.resolve()
  private streamingIndex = -1
  private activeMessageIndex = -1
  private readonly manualBash = new Set<symbol>()
  private lifecycle = 0
  private sessionMutationInFlight = false
  private startupHandshake = false
  private startupFailure: Error | null = null

  constructor(options: PiControllerOptions) {
    this.options = options
    this.rpc = new PiRpcClient(options)
    this.stopRpc = this.rpc.onRecord((record) => this.handleRecord(record))
  }

  async start(): Promise<void> {
    if (this.value.connected) throw new Error("Pi controller is already started")
    if (!this.stopRpc) this.stopRpc = this.rpc.onRecord((record) => this.handleRecord(record))
    this.value.error = undefined
    this.startupHandshake = true
    this.startupFailure = null
    try {
      await this.rpc.start()
      this.value.connected = true
      this.emit()
      await this.refresh()
      this.startupHandshake = false
    } catch (error: unknown) {
      const failure = this.startupFailure ?? (error instanceof Error ? error : new Error(String(error)))
      await this.rpc.close()
      this.value.connected = false
      this.setError(failure)
      throw failure
    }
  }

  async close(): Promise<void> {
    this.lifecycle += 1
    this.refreshGeneration += 1
    await this.rpc.close()
    this.value.connected = false
    this.value.busy = false
    this.value.compacting = false
    this.manualBash.clear()
    this.sessionMutationInFlight = false
    this.stopRpc?.()
    this.stopRpc = null
    this.emit()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot(): PiSnapshot {
    return {
      ...this.value,
      messages: this.value.messages.map((message) => structuredClone(message)),
      models: this.value.models.map((model) => structuredClone(model)),
      commands: this.value.commands.map((command) => structuredClone(command)),
      tree: this.value.tree ? structuredClone(this.value.tree) : null,
      stats: this.value.stats ? structuredClone(this.value.stats) : null,
      queue: { steering: [...this.value.queue.steering], followUp: [...this.value.queue.followUp] },
      extensionRequests: this.value.extensionRequests.map((request) => structuredClone(request)),
      extensionStatus: { ...this.value.extensionStatus },
      extensionWidgets: Object.fromEntries(Object.entries(this.value.extensionWidgets).map(([key, lines]) => [key, [...lines]])),
      events: this.value.events.map((event) => structuredClone(event)),
    }
  }

  async submit(text: string, mode: SubmitMode = "prompt"): Promise<void> {
    if (text.length === 0) throw new Error("Pi prompt cannot be empty")
    try {
      await this.command(mode, { message: text })
      await this.refreshState()
    } catch (error: unknown) {
      this.setError(error)
      throw error
    }
  }

  async stop(): Promise<void> {
    // User-bash has a distinct abort controller in Pi; agent abort does not
    // cancel it. Both may be active when an extension starts concurrent work.
    const requests: Promise<unknown>[] = []
    if (this.manualBash.size > 0) requests.push(this.command("abort_bash"))
    if (this.value.state?.isStreaming || this.manualBash.size === 0) requests.push(this.command("abort"))
    await Promise.all(requests)
  }

  async command(type: string, fields?: Record<string, unknown>): Promise<unknown> {
    if (requiresSessionRefresh(type)) return this.queueSessionMutation(type, fields)
    return this.commandNow(type, fields)
  }

  private async queueSessionMutation(type: string, fields?: Record<string, unknown>): Promise<unknown> {
    const previous = this.sessionMutationTail
    let release: () => void = () => {}
    const current = new Promise<void>((resolve) => { release = resolve })
    this.sessionMutationTail = previous.then(() => current)
    await previous
    try {
      return await this.commandNow(type, fields)
    } finally {
      release()
    }
  }

  private async commandNow(type: string, fields?: Record<string, unknown>): Promise<unknown> {
    const lifecycle = this.lifecycle
    const token = Symbol(type)
    const sessionMutation = requiresSessionRefresh(type)
    if (sessionMutation) {
      this.refreshGeneration += 1
      this.sessionMutationInFlight = true
    }
    const manualBash = type === "bash"
    if (manualBash) this.refreshGeneration += 1
    if (manualBash) {
      this.manualBash.add(token)
      this.value.busy = true
      this.emit()
    }
    try {
      const response = await this.rpc.request(type, fields)
      if (lifecycle !== this.lifecycle) throw new Error("Pi request belongs to a closed controller")
      const data = response.success ? response.data : undefined
      if (!response.success) throw new Error(`${type}: ${typeof response.error === "string" ? response.error : "Pi rejected the command"}`)
      this.applyResponse(type, data)
      this.value.error = undefined
      this.emit()
      if (requiresStateRefresh(type)) await this.refreshState()
      if (sessionMutation) {
        // Invalidate reads started while the runtime was rebinding. A forced
        // read is required because refresh() intentionally coalesces work.
        this.refreshGeneration += 1
        if (!isCancelled(data)) this.resetTransientSession()
        await this.refreshFresh()
      } else if (type === "bash") {
        // Pi records user-bash results before resolving the RPC request. Read
        // the authoritative transcript/stats/tree instead of leaving a
        // transient tool event as the only representation.
        this.refreshGeneration += 1
        await this.refreshFresh()
        // RPC bash events carry the request ID, unlike persisted messages.
        // Retire exactly this request only after its authoritative read lands.
        this.value.events = this.value.events.map((event) => event.id === response.id && event.type.startsWith("bash_execution_") ? { ...event, reconciled: true } : event)
        this.emit()
      }
      return data
    } catch (error: unknown) {
      if (lifecycle === this.lifecycle) this.setError(error)
      throw error
    } finally {
      if (sessionMutation && lifecycle === this.lifecycle) this.sessionMutationInFlight = false
      if (manualBash) {
        this.manualBash.delete(token)
        if (lifecycle === this.lifecycle) {
          this.value.busy = this.manualBash.size > 0 || this.value.state?.isStreaming === true
          this.emit()
        }
      }
    }
  }

  async refresh(): Promise<void> {
    if (this.refreshTask) return this.refreshTask
    const task = this.refreshNow(this.refreshGeneration)
    this.refreshTask = task
    try {
      await task
    } finally {
      if (this.refreshTask === task) this.refreshTask = null
    }
  }

  private async refreshFresh(): Promise<void> {
    const task = this.refreshNow(this.refreshGeneration)
    this.refreshTask = task
    try {
      await task
    } finally {
      if (this.refreshTask === task) this.refreshTask = null
    }
  }

  async listSessions(all = false): Promise<SessionSummary[]> {
    return listSessions({
      cwd: this.options.cwd,
      agentDir: this.options.agentDir,
      sessionDir: this.options.sessionDir,
      all,
    })
  }

  respond(id: string, fields: Record<string, unknown>): void {
    if (id.length === 0) throw new Error("Pi extension response id cannot be empty")
    const response: JsonRecord = { type: "extension_ui_response", id }
    for (const [key, value] of Object.entries(fields)) {
      if (key === "type" || key === "id" || value === undefined) continue
      if (!isJsonValue(value)) throw new Error(`Pi extension response field ${key} is not JSON serializable`)
      response[key] = value
    }
    try {
      this.rpc.write(response)
      this.value.extensionRequests = this.value.extensionRequests.filter((request) => request.id !== id)
      this.value.error = undefined
      this.emit()
    } catch (error: unknown) {
      this.setError(error)
      throw error
    }
  }

  private async refreshNow(generation: number): Promise<void> {
    try {
      const responses = await Promise.all([
        this.rpc.request("get_state"),
        this.rpc.request("get_messages"),
        this.rpc.request("get_available_models"),
        this.rpc.request("get_commands"),
        this.rpc.request("get_tree"),
        this.rpc.request("get_session_stats"),
      ])
      for (const response of responses) {
        if (!response.success) throw new Error(`${response.command}: ${typeof response.error === "string" ? response.error : "Pi rejected the command"}`)
      }
      if (generation !== this.refreshGeneration) return
      const nextState = asSessionState(responses[0].data)
      const previousSessionId = this.value.state?.sessionId
      if (previousSessionId && nextState.sessionId && previousSessionId !== nextState.sessionId) this.resetTransientSession()
      this.applyResponse("get_state", responses[0].data)
      this.applyResponse("get_messages", responses[1].data)
      this.applyResponse("get_available_models", responses[2].data)
      this.applyResponse("get_commands", responses[3].data)
      this.applyResponse("get_tree", responses[4].data)
      this.applyResponse("get_session_stats", responses[5].data)
      this.value.connected = true
      this.value.error = undefined
      this.emit()
    } catch (error: unknown) {
      if (generation !== this.refreshGeneration) return
      this.setError(error)
      throw error
    }
  }

  private async refreshState(): Promise<void> {
    const generation = this.refreshGeneration
    let response: RpcResponseRecord
    try {
      response = await this.rpc.request("get_state")
    } catch (error: unknown) {
      if (generation !== this.refreshGeneration) return
      throw error
    }
    if (!response.success) {
      if (generation !== this.refreshGeneration) return
      throw new Error(`get_state: ${typeof response.error === "string" ? response.error : "Pi rejected the command"}`)
    }
    if (generation !== this.refreshGeneration) return
    this.applyResponse("get_state", response.data)
    this.emit()
  }

  private applyResponse(command: string, data: unknown): void {
    switch (command) {
      case "get_state":
        this.value.state = asSessionState(data)
        this.value.busy = this.manualBash.size > 0 || this.value.state.isStreaming === true
        this.value.compacting = this.value.state.isCompacting === true
        return
      case "get_messages":
        this.value.messages = asMessages(data)
        this.streamingIndex = -1
        this.activeMessageIndex = -1
        return
      case "get_available_models":
        this.value.models = asModels(asRecord(data, command).models)
        return
      case "get_commands":
        this.value.commands = asCommands(asRecord(data, command).commands)
        return
      case "get_tree":
        this.value.tree = asTree(data)
        return
      case "get_session_stats":
        this.value.stats = asStats(data)
        return
      case "clear_queue": {
        asQueue(data)
        this.value.queue = { steering: [], followUp: [] }
        return
      }
      case "new_session":
      case "switch_session":
      case "fork":
      case "clone":
        return
      default:
        return
    }
  }

  private handleRecord(record: JsonRecord): void {
    if (!isPiEvent(record)) {
      if (record.type === "response") return
      return
    }
    const event = record as PiEvent
    if (this.startupHandshake && isBlockingStartupDialog(event)) {
      this.startupFailure = new Error(STARTUP_DIALOG_ERROR)
      this.value.connected = false
      this.value.busy = false
      this.value.compacting = false
      this.setError(this.startupFailure)
      // Defer shutdown until the JSONL callback has returned. Calling end()
      // re-entrantly from a parser callback would replay its current frame.
      queueMicrotask(() => void this.rpc.close())
      return
    }
    if (this.sessionMutationInFlight && isSessionTransientEvent(event)) return
    this.appendEvent(event)
    this.applyEvent(event)
    this.emit()
    if (event.type === "agent_settled" || event.type === "entry_appended" || event.type === "session_info_changed") this.scheduleRefresh()
  }

  private applyEvent(event: PiEvent): void {
    switch (event.type) {
      case "process_exit":
        this.value.connected = false
        this.value.busy = false
        this.value.compacting = false
        if (typeof event.error === "string") this.value.error = event.error
        else if (typeof event.exitCode === "number" && event.exitCode !== 0) this.value.error = `Pi RPC process exited with code ${event.exitCode}`
        return
      case "agent_start":
      case "turn_start":
      case "tool_execution_start":
        this.value.busy = true
        return
      case "agent_end":
        if (event.willRetry !== true) this.value.busy = this.manualBash.size > 0
        return
      case "agent_settled":
        this.value.busy = this.manualBash.size > 0
        return
      case "compaction_start":
        this.value.compacting = true
        return
      case "compaction_end":
        this.value.compacting = false
        return
      case "queue_update":
        this.value.queue = asQueue(event)
        return
      case "session_info_changed":
        if (this.value.state && (event.name === undefined || typeof event.name === "string")) this.value.state.sessionName = event.name
        return
      case "thinking_level_changed":
        if (this.value.state && typeof event.level === "string") this.value.state.thinkingLevel = event.level
        return
      case "message_start":
        this.startMessage(event)
        return
      case "message_update":
        this.updateStreamingMessage(event)
        return
      case "message_end":
        this.finishMessage(event)
        return
      case "extension_ui_request":
        this.applyExtensionRequest(event)
        return
      default:
        return
    }
  }

  private appendEvent(event: PiEvent): void {
    if (event.type === "message_update") return
    const highFrequency = eventKey(event) !== null
    if (!highFrequency) {
      this.value.events = [...this.value.events, event]
      return
    }
    const key = eventKey(event)
    if (!key) return
    const index = this.value.events.findIndex((previous) => eventKey(previous) === key)
    const previous = index >= 0 ? this.value.events[index] : undefined
    const next = event.type === "bash_execution_update" && previous && typeof previous.delta === "string" && typeof event.delta === "string"
      ? { ...event, delta: `${previous.delta}${event.delta}` }
      : event
    if (index < 0) this.value.events = [...this.value.events, next]
    else this.value.events = this.value.events.map((item, itemIndex) => itemIndex === index ? next : item)
  }

  private applyExtensionRequest(event: PiEvent): void {
    if (typeof event.id !== "string" || typeof event.method !== "string") return
    if (event.method === "setStatus") {
      if (typeof event.statusKey !== "string") return
      if (typeof event.statusText === "string") this.value.extensionStatus[event.statusKey] = event.statusText
      else delete this.value.extensionStatus[event.statusKey]
      return
    }
    if (event.method === "setWidget") {
      if (typeof event.widgetKey !== "string") return
      if (event.widgetLines === undefined) delete this.value.extensionWidgets[event.widgetKey]
      else if (Array.isArray(event.widgetLines) && event.widgetLines.every((line) => typeof line === "string")) this.value.extensionWidgets[event.widgetKey] = event.widgetLines
      return
    }
    if (event.method === "setTitle") {
      if (typeof event.title === "string") this.value.extensionTitle = event.title
      return
    }
    if (event.method === "set_editor_text") return
    const request = toExtensionRequest(event)
    if (!request) return
    this.value.extensionRequests = this.value.extensionRequests.filter((item) => item.id !== request.id).concat(request)
  }

  private startMessage(event: PiEvent): void {
    const message = asEventMessage(event)
    if (!message) return
    this.activeMessageIndex = this.value.messages.length
    if (message.role === "assistant") {
      this.streamingIndex = this.value.messages.length
      this.value.messages = [...this.value.messages, message]
      return
    }
    this.value.messages = [...this.value.messages, message]
  }

  private updateStreamingMessage(event: PiEvent): void {
    if (this.streamingIndex < 0) return
    const message = this.value.messages[this.streamingIndex]
    const update = isJsonRecord(event.assistantMessageEvent) ? event.assistantMessageEvent : null
    if (!message || !update || typeof update.type !== "string") return
    const content = Array.isArray(message.content) ? message.content.map((block) => ({ ...block })) : []
    const index = typeof update.contentIndex === "number" ? update.contentIndex : -1
    const current = index >= 0 && isJsonRecord(content[index]) ? content[index] : undefined
    if (index < 0) return
    if (update.type === "text_start" || update.type === "thinking_start") {
      content[index] = { type: update.type.startsWith("text") ? "text" : "thinking", [update.type.startsWith("text") ? "text" : "thinking"]: "" }
    } else if (update.type === "text_delta" && typeof update.delta === "string") {
      content[index] = { ...(current ?? { type: "text" }), type: "text", text: `${typeof current?.text === "string" ? current.text : ""}${update.delta}` }
    } else if (update.type === "thinking_delta" && typeof update.delta === "string") {
      content[index] = { ...(current ?? { type: "thinking" }), type: "thinking", thinking: `${typeof current?.thinking === "string" ? current.thinking : ""}${update.delta}` }
    } else if (update.type === "text_end" && typeof update.content === "string") {
      content[index] = { ...(current ?? { type: "text" }), type: "text", text: update.content }
    } else if (update.type === "thinking_end" && typeof update.content === "string") {
      content[index] = { ...(current ?? { type: "thinking" }), type: "thinking", thinking: update.content }
    } else if (update.type === "toolcall_start") {
      content[index] = { type: "toolCall", ...(typeof update.id === "string" ? { id: update.id } : {}), ...(typeof update.toolName === "string" ? { name: update.toolName } : {}) }
    } else {
      return
    }
    this.value.messages = this.value.messages.map((item, itemIndex) => itemIndex === this.streamingIndex ? { ...item, content } : item)
  }

  private finishMessage(event: PiEvent): void {
    const message = asEventMessage(event)
    if (!message) return
    if (this.activeMessageIndex < 0 || this.activeMessageIndex >= this.value.messages.length) return
    this.value.messages = this.value.messages.map((item, index) => index === this.activeMessageIndex ? message : item)
    this.streamingIndex = -1
    this.activeMessageIndex = -1
  }

  private resetTransientSession(): void {
    this.streamingIndex = -1
    this.activeMessageIndex = -1
    this.value.events = []
    this.value.queue = { steering: [], followUp: [] }
    this.value.extensionRequests = []
    this.value.extensionTitle = undefined
    this.value.extensionStatus = {}
    this.value.extensionWidgets = {}
  }

  private scheduleRefresh(): void {
    void this.refresh().catch((error: unknown) => this.setError(error))
  }

  private setError(error: unknown): void {
    this.value.error = error instanceof Error ? error.message : String(error)
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

function initialSnapshot(): PiSnapshot {
  return {
    connected: false,
    busy: false,
    compacting: false,
    state: null,
    messages: [],
    models: [],
    commands: [],
    tree: null,
    stats: null,
    queue: { steering: [], followUp: [] },
    extensionRequests: [],
    extensionStatus: {},
    extensionWidgets: {},
    events: [],
  }
}

function requiresStateRefresh(type: string): boolean {
  return ["set_model", "cycle_model", "set_thinking_level", "cycle_thinking_level", "set_steering_mode", "set_follow_up_mode", "set_auto_compaction", "set_auto_retry"].includes(type)
}

function requiresSessionRefresh(type: string): boolean {
  return ["new_session", "switch_session", "fork", "clone"].includes(type)
}

function isCancelled(value: unknown): boolean {
  return isJsonRecord(value) && value.cancelled === true
}

function isBlockingStartupDialog(event: PiEvent): boolean {
  return event.type === "extension_ui_request" && ["select", "confirm", "input", "editor"].includes(typeof event.method === "string" ? event.method : "")
}

function isSessionTransientEvent(event: PiEvent): boolean {
  return [
    "agent_start",
    "agent_end",
    "agent_settled",
    "turn_start",
    "turn_end",
    "message_start",
    "message_update",
    "message_end",
    "tool_execution_start",
    "tool_execution_update",
    "tool_execution_end",
    "bash_execution_start",
    "bash_execution_update",
    "bash_execution_end",
    "queue_update",
    "compaction_start",
    "compaction_end",
    "entry_appended",
    "session_info_changed",
  ].includes(event.type)
}

function asRecord(value: unknown, command: string): JsonRecord {
  if (!isJsonRecord(value)) throw new Error(`${command}: Pi returned an invalid object`)
  return value
}

function asSessionState(value: unknown): PiSessionState {
  const state = asRecord(value, "get_state") as PiSessionState
  if (state.model !== undefined && state.model !== null && !isJsonRecord(state.model)) throw new Error("get_state: invalid model")
  return state
}

function asMessages(value: unknown): PiMessage[] {
  const messages = asRecord(value, "get_messages").messages
  if (!Array.isArray(messages)) throw new Error("get_messages: invalid messages")
  return messages.map((message) => {
    if (!isJsonRecord(message) || typeof message.role !== "string") throw new Error("get_messages: invalid message")
    return message as PiMessage
  })
}

function asModels(value: unknown): PiModel[] {
  if (!Array.isArray(value)) throw new Error("get_available_models: invalid models")
  return value.map((model) => {
    if (!isJsonRecord(model)) throw new Error("get_available_models: invalid model")
    return model as PiModel
  })
}

function asCommands(value: unknown): PiCommandInfo[] {
  if (!Array.isArray(value)) throw new Error("get_commands: invalid commands")
  return value.map((command) => {
    if (!isJsonRecord(command) || typeof command.name !== "string") throw new Error("get_commands: invalid command")
    return command as PiCommandInfo
  })
}

function asTree(value: unknown): PiTree {
  const record = asRecord(value, "get_tree")
  if (!Array.isArray(record.tree) || (record.leafId !== null && typeof record.leafId !== "string")) throw new Error("get_tree: invalid tree")
  return { tree: record.tree.map((node) => asTreeNode(node)), leafId: record.leafId }
}

function asTreeNode(value: unknown): PiTreeNode {
  if (!isJsonRecord(value) || !isJsonRecord(value.entry) || !Array.isArray(value.children)) throw new Error("get_tree: invalid tree node")
  if (!value.children.every((child) => isJsonRecord(child))) throw new Error("get_tree: invalid tree children")
  return {
    ...(value as PiTreeNode),
    entry: value.entry,
    children: value.children.map((child) => asTreeNode(child)),
  }
}

function asStats(value: unknown): PiStats {
  return asRecord(value, "get_session_stats") as PiStats
}

function asEventMessage(event: PiEvent): PiMessage | null {
  if (!isJsonRecord(event.message) || typeof event.message.role !== "string") return null
  return event.message as PiMessage
}

function asQueue(value: unknown): PiQueue {
  const record = asRecord(value, "queue_update")
  if (!Array.isArray(record.steering) || !Array.isArray(record.followUp) || !record.steering.every((item) => typeof item === "string") || !record.followUp.every((item) => typeof item === "string")) throw new Error("queue_update: invalid queue")
  return { steering: record.steering, followUp: record.followUp }
}

function toExtensionRequest(event: PiEvent): PiExtensionRequest | null {
  if (event.method === "setStatus" || event.method === "setWidget" || event.method === "setTitle" || event.method === "set_editor_text") return null
  if (typeof event.id !== "string" || typeof event.method !== "string") return null
  if (event.options !== undefined && (!Array.isArray(event.options) || !event.options.every((option) => typeof option === "string"))) return null
  if (event.title !== undefined && typeof event.title !== "string") return null
  if (event.message !== undefined && typeof event.message !== "string") return null
  if (event.placeholder !== undefined && typeof event.placeholder !== "string") return null
  if (event.prefill !== undefined && typeof event.prefill !== "string") return null
  if (event.timeout !== undefined && typeof event.timeout !== "number") return null
  return event as unknown as PiExtensionRequest
}

function eventKey(event: PiEvent): string | null {
  if (["tool_execution_start", "tool_execution_update", "tool_execution_end"].includes(event.type)) return `tool:${typeof event.toolCallId === "string" ? event.toolCallId : "unknown"}`
  if (["bash_execution_update", "bash_execution_end"].includes(event.type)) return `bash:${typeof event.id === "string" ? event.id : "default"}`
  return null
}
