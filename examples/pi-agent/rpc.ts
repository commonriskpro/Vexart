import { JsonlParser, isJsonRecord, isPiEvent, isRpcResponse, isJsonValue, serializeJsonLine, type JsonRecord, type RpcResponseRecord } from "./protocol"

const MAX_STDERR_CHARS = 32_768

export interface PiRpcOptions {
  cwd: string
  executable?: string
  agentDir?: string
  sessionDir?: string
  args?: string[]
  shutdownTimeoutMs?: number
}

export type PiRpcListener = (record: JsonRecord) => void

export class PiRpcClient {
  private process: Bun.Subprocess | null = null
  private readonly options: PiRpcOptions
  private readonly pending = new Map<string, { resolve: (record: RpcResponseRecord) => void; reject: (error: Error) => void }>()
  private readonly listeners = new Set<PiRpcListener>()
  private parser: JsonlParser | null = null
  private requestNumber = 0
  private stderrText = ""
  private readonly stderrDecoder = new TextDecoder()
  private processError: Error | null = null
  private closing = false
  private stopReading = false

  constructor(options: PiRpcOptions) {
    this.options = options
  }

  get stderr(): string {
    return this.stderrText
  }

  onRecord(listener: PiRpcListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(): Promise<void> {
    if (this.process) throw new Error("Pi RPC client is already started")
    this.processError = null
    this.stderrText = ""
    this.closing = false
    this.stopReading = false

    const env = Object.entries(process.env).reduce<Record<string, string>>((result, [key, value]) => {
      if (value !== undefined) result[key] = value
      return result
    }, {})
    if (this.options.agentDir) env.PI_CODING_AGENT_DIR = this.options.agentDir
    if (this.options.sessionDir) env.PI_CODING_AGENT_SESSION_DIR = this.options.sessionDir
    else if (this.options.agentDir) delete env.PI_CODING_AGENT_SESSION_DIR
    const executable = this.options.executable ?? "pi"
    const args = [executable, "--mode", "rpc", ...(this.options.args ?? [])]
    const child = Bun.spawn(args, {
      cwd: this.options.cwd,
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    this.process = child
    this.parser = new JsonlParser({
      onValue: (value) => {
        try {
          this.handleValue(value)
        } catch (error: unknown) {
          this.fail(error instanceof Error ? error : new Error(String(error)))
        }
      },
      onError: (error) => this.fail(error),
    })
    void this.readStdout(child)
    void this.readStderr(child)
    void this.watchExit(child)
    await Promise.resolve()
    if (this.processError) throw this.processError
  }

  async close(): Promise<void> {
    const child = this.process
    if (!child) return
    this.closing = true
    this.stopReading = true
    this.parser?.end()
    this.parser = null
    try {
      const stdin = getStdin(child)
      stdin.end()
    } catch {
      // The process exit path below remains authoritative if stdin is already closed.
    }

    const timeout = this.options.shutdownTimeoutMs ?? 2000
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([child.exited, new Promise<number>((resolve) => { timer = setTimeout(() => resolve(-1), timeout) })])
    if (timer) clearTimeout(timer)
    if (child.exitCode === null) {
      child.kill()
      await child.exited
    }
    this.process = null
    this.rejectPending(new Error("Pi RPC client closed"))
  }

  async request(type: string, fields?: Record<string, unknown>): Promise<RpcResponseRecord> {
    const child = this.process
    if (!child || this.processError) throw this.processError ?? new Error("Pi RPC client is not started")
    if (child.exitCode !== null) {
      const error = new Error(`Pi RPC process exited with code ${child.exitCode}.${this.stderrText ? ` Stderr: ${this.stderrText}` : ""}`)
      this.fail(error)
      throw error
    }
    const id = `vexart-${++this.requestNumber}`
    const body: JsonRecord = { id, type }
    for (const [key, value] of Object.entries(fields ?? {})) {
      if (key === "id" || key === "type" || value === undefined) continue
      if (!isJsonValue(value)) throw new Error(`Pi RPC field ${key} is not JSON serializable`)
      body[key] = value
    }
    const line = serializeJsonLine(body)
    return new Promise<RpcResponseRecord>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        const stdin = getStdin(child)
        stdin.write(line)
        stdin.flush()
      } catch (error: unknown) {
        this.pending.delete(id)
        const detail = error instanceof Error ? error.message : String(error)
        const writeError = new Error(`Unable to write Pi RPC command: ${detail}`)
        this.fail(writeError)
        reject(writeError)
      }
    })
  }

  write(value: JsonRecord): void {
    const child = this.process
    if (!child || this.processError) throw this.processError ?? new Error("Pi RPC client is not started")
    const line = serializeJsonLine(value)
    const stdin = getStdin(child)
    stdin.write(line)
    stdin.flush()
  }

  private async readStdout(child: Bun.Subprocess): Promise<void> {
    const stdout = getReadable(child.stdout, "stdout")
    for await (const chunk of stdout) {
      if (this.stopReading) continue
      this.parser?.push(chunk)
    }
    if (!this.stopReading) this.parser?.end()
  }

  private async readStderr(child: Bun.Subprocess): Promise<void> {
    const stderr = getReadable(child.stderr, "stderr")
    for await (const chunk of stderr) {
      const text = typeof chunk === "string" ? chunk : this.stderrDecoder.decode(chunk, { stream: true })
      this.stderrText = `${this.stderrText}${text}`.slice(-MAX_STDERR_CHARS)
    }
  }

  private async watchExit(child: Bun.Subprocess): Promise<void> {
    const code = await child.exited
    if (this.process !== child) return
    if (!this.closing && code !== 0) {
      const suffix = this.stderrText ? ` Stderr: ${this.stderrText}` : ""
      this.processError = new Error(`Pi RPC process exited with code ${code}.${suffix}`)
    } else if (!this.closing && code === 0) {
      this.processError = new Error("Pi RPC process exited unexpectedly.")
    }
    if (!this.closing) this.emit({ type: "process_exit", exitCode: code, error: this.processError?.message ?? "Pi RPC process exited" })
    if (!this.closing) this.rejectPending(this.processError ?? new Error("Pi RPC process exited"))
  }

  private emit(record: JsonRecord): void {
    for (const listener of this.listeners) listener(record)
  }

  private handleValue(value: unknown): void {
    if (!isJsonRecord(value)) {
      this.fail(new Error("Pi RPC stdout record must be a JSON object"))
      return
    }
    if (isRpcResponse(value)) {
      const id = value.id
      if (id) {
        const pending = this.pending.get(id)
        if (pending) {
          this.pending.delete(id)
          pending.resolve(value)
          return
        }
        this.fail(new Error(`Pi RPC response has unknown request id ${id}`))
        return
      }
      this.fail(new Error("Pi RPC response is missing a request id"))
      return
    }
    if (!isPiEvent(value)) {
      this.fail(new Error("Pi RPC event record is missing a string type"))
      return
    }
    this.emit(value)
  }

  private fail(error: Error): void {
    if (!this.processError) this.processError = error
    this.rejectPending(this.processError)
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}

function getStdin(child: Bun.Subprocess): Bun.FileSink {
  if (!child.stdin || typeof child.stdin === "number") throw new Error("Pi RPC stdin is not writable")
  return child.stdin
}

function getReadable(value: number | ReadableStream<Uint8Array> | undefined, name: string): ReadableStream<Uint8Array> {
  if (!value || typeof value === "number") throw new Error(`Pi RPC ${name} is not readable`)
  return value
}
