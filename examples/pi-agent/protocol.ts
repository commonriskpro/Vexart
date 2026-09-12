import type { SessionSummary } from "./sessions"

/** JSON values accepted by the Pi JSONL protocol. */
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonRecord = { [key: string]: JsonValue }

export type PiContent = JsonRecord & {
  type: string
  text?: string
}

export type PiMessage = JsonRecord & {
  role: string
  content?: string | PiContent[]
  timestamp?: number
}

export type PiModel = JsonRecord & {
  id?: string
  name?: string
  provider?: string
  api?: string
  reasoning?: boolean
  contextWindow?: number
  maxTokens?: number
}

export type PiSessionState = JsonRecord & {
  model?: PiModel | null
  thinkingLevel?: string
  isStreaming?: boolean
  isCompacting?: boolean
  steeringMode?: "all" | "one-at-a-time"
  followUpMode?: "all" | "one-at-a-time"
  sessionFile?: string
  sessionId?: string
  sessionName?: string
  autoCompactionEnabled?: boolean
  messageCount?: number
  pendingMessageCount?: number
}

export type PiTreeNode = JsonRecord & {
  entry: JsonRecord
  children: PiTreeNode[]
  label?: string
  labelTimestamp?: string
}

export interface PiTree {
  tree: PiTreeNode[]
  leafId: string | null
}

export type PiCommandInfo = JsonRecord & {
  name: string
  description?: string
  source?: string
  sourceInfo?: JsonRecord
}

export interface PiQueue {
  steering: string[]
  followUp: string[]
}

export type PiExtensionRequest = JsonRecord & {
  id: string
  method: string
  title?: string
  message?: string
  options?: string[]
  placeholder?: string
  prefill?: string
  timeout?: number
}

export type PiStats = JsonRecord & {
  sessionFile?: string
  sessionId?: string
  userMessages?: number
  assistantMessages?: number
  toolCalls?: number
  toolResults?: number
  totalMessages?: number
  tokens?: JsonRecord
  cost?: number
  contextUsage?: JsonRecord
}

/** One event emitted by `pi --mode rpc` that is not a command response. */
export type PiEvent = JsonRecord & {
  type: string
}

export interface PiSnapshot {
  connected: boolean
  extensionTitle?: string
  busy: boolean
  compacting: boolean
  error?: string
  state: PiSessionState | null
  messages: PiMessage[]
  models: PiModel[]
  commands: PiCommandInfo[]
  tree: PiTree | null
  stats: PiStats | null
  queue: PiQueue
  extensionRequests: PiExtensionRequest[]
  extensionStatus: Record<string, string>
  extensionWidgets: Record<string, string[]>
  events: PiEvent[]
}

export type SubmitMode = "prompt" | "steer" | "follow_up"

export interface PiControllerOptions {
  cwd: string
  executable?: string
  agentDir?: string
  sessionDir?: string
  args?: string[]
  shutdownTimeoutMs?: number
}

export interface PiController {
  start(): Promise<void>
  close(): Promise<void>
  stop(): Promise<void>
  subscribe(listener: () => void): () => void
  snapshot(): PiSnapshot
  submit(text: string, mode?: SubmitMode): Promise<void>
  command(type: string, fields?: Record<string, unknown>): Promise<unknown>
  refresh(): Promise<void>
  listSessions(all?: boolean): Promise<SessionSummary[]>
  respond(id: string, fields: Record<string, unknown>): void
}

export interface JsonlParserOptions {
  onValue: (value: unknown) => void
  onError?: (error: Error, line: string) => void
}

export type RpcResponseRecord = JsonRecord & {
  type: "response"
  command: string
  success: boolean
  id?: string
}

/** Strict LF-delimited JSON parser. U+2028 and U+2029 remain JSON content. */
export class JsonlParser {
  private readonly decoder = new TextDecoder()
  private buffer = ""
  private readonly options: JsonlParserOptions

  constructor(options: JsonlParserOptions) {
    this.options = options
  }

  push(chunk: Uint8Array | string): void {
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true })
    this.drain()
  }

  end(): void {
    this.buffer += this.decoder.decode()
    if (this.buffer.length > 0) {
      this.emit(this.buffer)
      this.buffer = ""
    }
  }

  private drain(): void {
    while (true) {
      const newline = this.buffer.indexOf("\n")
      if (newline < 0) return
      const raw = this.buffer.slice(0, newline)
      this.emit(raw.endsWith("\r") ? raw.slice(0, -1) : raw)
      this.buffer = this.buffer.slice(newline + 1)
    }
  }

  private emit(line: string): void {
    let value: unknown
    try {
      value = JSON.parse(line) as unknown
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error)
      this.options.onError?.(new Error(`Invalid Pi JSONL record: ${detail}`), line)
      return
    }
    this.options.onValue(value)
  }
}

export function serializeJsonLine(value: JsonValue): string {
  return `${JSON.stringify(value)}\n`
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (typeof value !== "object") return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Object.values(value).every(isJsonValue)
}

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) && isJsonValue(value)
}

export function isPiEvent(value: unknown): value is PiEvent {
  return isJsonRecord(value) && typeof value.type === "string" && value.type !== "response"
}

export function isRpcResponse(value: unknown): value is RpcResponseRecord {
  return isJsonRecord(value) && value.type === "response" && typeof value.command === "string" && typeof value.success === "boolean" && (value.id === undefined || typeof value.id === "string")
}
