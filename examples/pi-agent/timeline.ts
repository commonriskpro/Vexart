import type { PiContent, PiEvent, PiMessage } from "./protocol"

export type TimelineToolState = "running" | "done" | "error"

export type TimelineTool = {
  kind: "tool"
  id: string
  name: string
  detail: string
  summary?: string
  state: TimelineToolState
}

export type TimelineCommentary = {
  kind: "commentary"
  id: string
  text: string
  thinking: boolean
}

export type TimelineWorkItem = TimelineTool | TimelineCommentary

export type TimelineBlock =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | { kind: "work"; id: string; items: TimelineWorkItem[]; open: boolean; startedAt?: number; durationMs?: number }
  | { kind: "system"; id: string; text: string }

type RecordLike = Record<string, unknown>

function record(value: unknown): RecordLike | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RecordLike
    : null
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value
  const data = record(value)
  if (!data) return ""
  if (typeof data.text === "string") return data.text
  if (typeof data.thinking === "string") return data.thinking
  if (typeof data.content === "string") return data.content
  return ""
}

export function contentText(content: PiMessage["content"]): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .filter((part) => (part as PiContent).type === "text")
    .map(textOf)
    .filter(Boolean)
    .join("\n")
}

function compact(value: unknown): string {
  if (typeof value === "string") return value
  const data = record(value)
  if (data && Array.isArray(data.content)) return contentText(data.content as PiContent[])
  if (value === undefined || value === null) return ""
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function toolsOf(message: PiMessage, index: number): TimelineTool[] {
  if (!Array.isArray(message.content)) return []
  return message.content.flatMap((part, partIndex) => {
    const item = part as PiContent
    if (item.type !== "toolCall" && item.type !== "tool_call") return []
    const data = item as RecordLike
    const name = typeof data.name === "string" ? data.name : "tool"
    const id = typeof data.id === "string" ? data.id : `tool-${index}-${partIndex}`
    const args = data.arguments ?? data.args ?? data.input
    const fields = record(args)
    const summary = fields ? compact(fields.command ?? fields.path ?? fields.file_path) : ""
    return [{ kind: "tool", id, name, summary, detail: compact(args), state: "running" } satisfies TimelineTool]
  })
}

function thinkingOf(message: PiMessage, index: number): TimelineCommentary[] {
  if (!Array.isArray(message.content)) return []
  return message.content.flatMap((part, partIndex) => {
    const item = part as PiContent
    if (item.type !== "thinking" && item.type !== "reasoning") return []
    const text = textOf(part)
    if (!text) return []
    return [{ kind: "commentary", id: `thinking-${index}-${partIndex}`, text, thinking: true } satisfies TimelineCommentary]
  })
}

function resultOf(message: PiMessage, index: number): TimelineTool[] {
  const data = message as RecordLike
  const id = typeof data.toolCallId === "string"
    ? data.toolCallId
    : typeof data.tool_call_id === "string"
      ? data.tool_call_id
      : `result-${index}`
  const error = data.isError === true || data.is_error === true
  const detail = contentText(message.content) || compact(data.result ?? data.output)
  return [{ kind: "tool", id, name: typeof data.toolName === "string" ? data.toolName : "tool result", detail, state: error ? "error" : "done" }]
}

function bashResultOf(message: PiMessage, index: number): TimelineTool[] {
  const data = message as RecordLike
  const command = typeof data.command === "string" ? data.command : ""
  const output = typeof data.output === "string" ? data.output : contentText(message.content)
  const exitCode = typeof data.exitCode === "number" ? data.exitCode : undefined
  const cancelled = data.cancelled === true
  const error = cancelled || (exitCode !== undefined && exitCode !== 0)
  const detail = [command ? `$ ${command}` : "", output, exitCode === undefined ? "" : `exit ${exitCode}`].filter(Boolean).join("\n")
  return [{ kind: "tool", id: messageId(message, index), name: "bash", detail, state: error ? "error" : "done" }]
}

function eventTools(events: readonly PiEvent[]): TimelineTool[] {
  const entries = new Map<string, TimelineTool>()
  events.forEach((event, index) => {
    if (event.reconciled === true) return
    const isTool = event.type === "tool_execution_start" || event.type === "tool_execution_update" || event.type === "tool_execution_end"
    const isBash = event.type === "bash_execution_update" || event.type === "bash_execution_end"
    if (!isTool && !isBash) return
    const id = typeof event.toolCallId === "string"
      ? event.toolCallId
      : typeof event.id === "string" ? event.id : isBash ? "bash" : `event-tool-${index}`
    const name = isBash ? "bash" : typeof event.toolName === "string" ? event.toolName : "tool"
    const detail = compact(event.result ?? event.partialResult ?? event.delta ?? event.args ?? event.command)
    const state: TimelineToolState = event.type === "tool_execution_end" || event.type === "bash_execution_end"
      ? event.isError === true ? "error" : "done"
      : "running"
    const previous = entries.get(id)
    entries.set(id, {
      kind: "tool",
      id,
      name: previous?.name || name,
      detail: isBash && previous?.detail ? `${previous.detail}${detail}` : detail || previous?.detail || "",
      state: state === "error" || previous?.state === "error" ? "error" : state,
    })
  })
  return [...entries.values()]
}

function toolInWork(work: Extract<TimelineBlock, { kind: "work" }>, tool: TimelineTool): boolean {
  const index = work.items.findIndex((entry) => entry.kind === "tool" && entry.id === tool.id)
  if (index < 0) return false
  const previous = work.items[index]
  if (previous.kind !== "tool") return false
  const next = [...work.items]
  next[index] = {
    ...previous,
    name: tool.name === "tool result" ? previous.name : tool.name,
    detail: tool.detail || previous.detail,
    state: tool.state === "error" || previous.state === "error" ? "error" : tool.state,
  }
  work.items = next
  return true
}

function toolInBlocks(blocks: TimelineBlock[], tool: TimelineTool): boolean {
  for (const block of blocks) {
    if (block.kind === "work" && toolInWork(block, tool)) return true
  }
  return false
}

function hasToolAfterInTurn(messages: readonly PiMessage[], index: number): boolean {
  for (const message of messages.slice(index + 1)) {
    const role = message.role.toLowerCase()
    if (role === "user") return false
    if (role === "assistant" && toolsOf(message, index).length > 0) return true
  }
  return false
}

/**
 * Convert Pi's authoritative messages and transient RPC events into the
 * Codex-style presentation model. Work is grouped, while the final assistant
 * response remains an ordinary block outside that disclosure.
 */
export function buildTimeline(messages: readonly PiMessage[], events: readonly PiEvent[] = [], busy = false): TimelineBlock[] {
  const blocks: TimelineBlock[] = []
  let work: Extract<TimelineBlock, { kind: "work" }> | null = null
  let timestamp: number | undefined

  const flush = () => {
    if (!work) return
    if (work.startedAt !== undefined && timestamp !== undefined && timestamp >= work.startedAt) work.durationMs = timestamp - work.startedAt
    blocks.push(work)
    work = null
  }
  const addTool = (tool: TimelineTool) => {
    if (!work) work = { kind: "work", id: `work-${blocks.length}`, items: [], open: false, startedAt: timestamp }
    const index = work.items.findIndex((entry) => entry.kind === "tool" && entry.id === tool.id)
    if (index < 0) {
      work.items = [...work.items, tool]
      return
    }
    const previous = work.items[index]
    if (previous.kind !== "tool") return
    const next = [...work.items]
    next[index] = {
      ...previous,
      name: tool.name === "tool result" ? previous.name : tool.name,
      detail: tool.detail || previous.detail,
      state: tool.state === "error" || previous.state === "error" ? "error" : tool.state,
    }
    work.items = next
  }
  const addCommentary = (commentary: TimelineCommentary) => {
    if (!work) work = { kind: "work", id: `work-${blocks.length}`, items: [], open: false, startedAt: timestamp }
    work.items = [...work.items, commentary]
  }

  messages.forEach((message, index) => {
    timestamp = typeof message.timestamp === "number" && Number.isFinite(message.timestamp) ? message.timestamp : undefined
    const role = message.role.toLowerCase()
    if (role === "user") {
      flush()
      const text = contentText(message.content)
      if (text) blocks.push({ kind: "user", id: messageId(message, index), text })
      return
    }
    if (role === "assistant") {
      const tools = toolsOf(message, index)
      const thinking = thinkingOf(message, index)
      const text = contentText(message.content)
      const toolAfter = hasToolAfterInTurn(messages, index)
      thinking.forEach(addCommentary)
      if (tools.length) {
        if (text) addCommentary({ kind: "commentary", id: `${messageId(message, index)}-commentary`, text, thinking: false })
        tools.forEach(addTool)
      } else if (text) {
        if (work && !toolAfter) {
          flush()
          blocks.push({ kind: "assistant", id: messageId(message, index), text, streaming: false })
        } else if (toolAfter) {
          addCommentary({ kind: "commentary", id: `${messageId(message, index)}-commentary`, text, thinking: false })
        } else {
          blocks.push({ kind: "assistant", id: messageId(message, index), text, streaming: false })
        }
      }
      return
    }
    if (role === "tool" || role === "toolresult" || role === "tool_result") {
      resultOf(message, index).forEach(addTool)
      return
    }
    if (role === "bashexecution" || role === "bash_execution") {
      bashResultOf(message, index).forEach(addTool)
      return
    }
    flush()
    const text = contentText(message.content)
    if (text) blocks.push({ kind: "system", id: messageId(message, index), text })
  })

  timestamp = undefined
  const hasBashResult = messages.some((message) => ["bashexecution", "bash_execution"].includes(message.role.toLowerCase()))
  eventTools(events).forEach((tool) => {
    if (work && toolInWork(work, tool)) return
    if (toolInBlocks(blocks, tool)) return
    // Unmatched events are live only while a request is active. A standalone
    // bash event is useful before its authoritative bashExecution message is
    // returned, but stale completed updates are not a second transcript.
    if (busy || (tool.name === "bash" && !hasBashResult)) addTool(tool)
  })
  const currentWork = work as Extract<TimelineBlock, { kind: "work" }> | null
  if (currentWork) {
    currentWork.open = busy
    blocks.push(currentWork)
    work = null
  }
  return blocks
}

function messageId(message: PiMessage, index: number): string {
  const data = message as RecordLike
  if (typeof data.id === "string") return data.id
  return `message-${index}`
}
