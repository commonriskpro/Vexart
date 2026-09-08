import { existsSync, writeFileSync } from "node:fs"
import { deflateSync } from "node:zlib"
import { prepareNativeKittyShm, releaseNativeKittyShm, type NativeKittyShmHandle } from "../../packages/engine/src/output/kitty-shm-native"
import { tmuxPassthroughState, wrapPassthrough } from "../../packages/engine/src/terminal/tmux"

const GRID_COLS = 8
const GRID_ROWS = 4
const DIRECT_ID_OFFSET = 1
const SHM_ID_OFFSET = 2
const QUERY_ID_OFFSET = 3
const DIRECT_CHUNK_BYTES = 4096
const MAX_WIDTH = 4096
const MAX_HEIGHT = 4096
const MAX_FRAMES = 120
const MAX_TIMEOUT = 60_000

const ROW_COLUMN_DIACRITICS = [
  0x0305, 0x030D, 0x030E, 0x0310, 0x0312, 0x033D, 0x033E, 0x033F,
]
// Image IDs below are fixed to the 0x70xxxxxx process-owned range. Index 112
// in Kitty's official table is U+081B, so the high-byte mark remains valid
// without carrying the entire 297-entry table into this small experiment.
const HIGH_ID_DIACRITIC = 0x081B

const HELP = `Usage: bun experiments/tmux-shm/probe.ts --live [options]

Transport-only experiment for Kitty direct-vs-SHM virtual placement through tmux.
No arguments (or --help) has no terminal effects.

Options:
  --live             Run against the current tmux pane (required for effects)
  --width N          Deterministic RGBA width (default: 320, max: ${MAX_WIDTH})
  --height N         Deterministic RGBA height (default: 200, max: ${MAX_HEIGHT})
  --frames N         Frames per mode, reusing each mode's image ID (default: 20, max: ${MAX_FRAMES})
  --timeout N        ACK timeout in milliseconds (default: 2000, max: ${MAX_TIMEOUT})
  --out PATH         Write JSON to a new file (never overwrites); use - for stdout
  --help             Show this help

The experiment measures preparation, outbound PTY bytes, and complete ACK RTT.
An ACK is transport acceptance, not proof that a frame was visibly displayed.
`

type Options = {
  live: boolean
  width: number
  height: number
  frames: number
  timeout: number
  out: string | null
}

type Ack = {
  id: number
  status: string | null
  outcome: "ok" | "error" | "timeout" | "aborted"
  rttMs: number | null
}

type PendingAck = {
  resolve: (ack: Ack) => void
  timer: ReturnType<typeof setTimeout>
  started: number
}

type ByteCounter = {
  ptyBytes: number
  apcBytes: number
  gridBytes: number
}

type FrameResult = {
  frame: number
  preparationMs: number
  ptyBytes: number
  ackRttMs: number | null
  ack: string | null
  outcome: Ack["outcome"]
  accepted: boolean
  compressedBytes?: number
  encodedBytes?: number
  shmBytes?: number
}

type ModeResult = {
  action: "T"
  medium: "d" | "s"
  imageId: number
  framesRequested: number
  framesSent: number
  framesAcked: number
  grid: {
    columns: number
    rows: number
    drawn: boolean
    bytes: number
  }
  totals: {
    preparationMs: number
    ptyBytes: number
    apcBytes: number
    gridBytes: number
    ackRttMs: number[]
  }
  frames: FrameResult[]
  skippedReason?: string
}

type ProbeReport = {
  schema: "vexart-tmux-shm-probe/v1"
  transportAckIsNotDisplayedFrame: string
  config: {
    width: number
    height: number
    frames: number
    timeoutMs: number
    gridColumns: number
    gridRows: number
    rgbaPattern: string
    zlibLevel: number
  }
  tmux: {
    passthrough: "enabled"
    pane: string | null
  }
  query: {
    action: "q"
    medium: "s"
    id: number
    preparationMs: number
    ptyBytes: number
    ackRttMs: number | null
    ack: string | null
    outcome: Ack["outcome"]
    accepted: boolean
  }
  modes: {
    direct: ModeResult
    shm: ModeResult
  }
  aborted: boolean
}

function usageError(message: string): never {
  throw new Error(`${message}\n\n${HELP}`)
}

function numberOption(name: string, value: string | undefined, min: number, max: number): number {
  if (!value || !/^\d+$/.test(value)) usageError(`${name} must be an integer between ${min} and ${max}`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    usageError(`${name} must be an integer between ${min} and ${max}`)
  }
  return parsed
}

function parseArgs(argv: string[]): Options | null {
  if (argv.length === 0) return null

  const options: Options = {
    live: false,
    width: 320,
    height: 200,
    frames: 20,
    timeout: 2_000,
    out: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help" || arg === "-h") return null
    if (arg === "--live") {
      options.live = true
      continue
    }

    const separator = arg.indexOf("=")
    const name = separator >= 0 ? arg.slice(0, separator) : arg
    const inline = separator >= 0 ? arg.slice(separator + 1) : undefined
    const next = inline ?? argv[++index]
    if (name === "--width") options.width = numberOption(name, next, 1, MAX_WIDTH)
    else if (name === "--height") options.height = numberOption(name, next, 1, MAX_HEIGHT)
    else if (name === "--frames") options.frames = numberOption(name, next, 1, MAX_FRAMES)
    else if (name === "--timeout") options.timeout = numberOption(name, next, 1, MAX_TIMEOUT)
    else if (name === "--out") {
      if (!next) usageError("--out requires a path")
      options.out = next
    } else {
      usageError(`unknown option: ${arg}`)
    }
  }

  if (options.width * options.height > 16_000_000) {
    usageError("width × height must not exceed 16,000,000 pixels")
  }
  return options
}

function makeRgba(width: number, height: number, frame: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      rgba[offset] = (x * 13 + y * 7 + frame * 17) & 0xff
      rgba[offset + 1] = (x * 3 + y * 19 + frame * 29) & 0xff
      rgba[offset + 2] = (x * 23 + y * 5 + frame * 11) & 0xff
      rgba[offset + 3] = 0xff
    }
  }
  return rgba
}

function imageIdBase(): number {
  // Keep IDs in a high, process-owned range. Random low bits avoid collisions
  // when two probe processes happen to share a PID namespace; the low three
  // IDs are reserved for direct, SHM, and query below.
  const entropy = new Uint32Array(1)
  crypto.getRandomValues(entropy)
  return 0x70000000 | (entropy[0] & 0x00fffffc)
}

function runToken(): string {
  return `${process.pid.toString(36)}${Date.now().toString(36).slice(-7)}`
}

function shmName(token: string, mode: "q" | "s", frame: number): string {
  // POSIX SHM names are intentionally short for macOS and unique per run.
  return `/vx-${token}-${mode}${frame.toString(36)}`
}

function makeApc(header: string, payload = ""): string {
  return `\x1b_G${header};${payload}\x1b\\`
}

function directApcs(rgba: Uint8Array, width: number, height: number, imageId: number): { apcs: string[]; compressedBytes: number; encodedBytes: number } {
  const compressed = deflateSync(rgba, { level: 6 })
  const encoded = Buffer.from(compressed).toString("base64")
  const chunks = encoded.match(new RegExp(`.{1,${DIRECT_CHUNK_BYTES}}`, "g")) ?? [""]
  const apcs = chunks.map((chunk, index) => {
    const first = index === 0
    const last = index === chunks.length - 1
    if (!first) return makeApc(`m=${last ? 0 : 1},q=0`, chunk)
    return makeApc(`a=T,U=1,f=32,t=d,s=${width},v=${height},i=${imageId},p=1,c=${GRID_COLS},r=${GRID_ROWS},C=1,q=0,o=z,m=${last ? 0 : 1}`, chunk)
  })
  return { apcs, compressedBytes: compressed.byteLength, encodedBytes: encoded.length }
}

function shmApc(name: string, width: number, height: number, imageId: number): string {
  const encodedName = Buffer.from(name).toString("base64")
  return makeApc(`a=T,U=1,f=32,t=s,s=${width},v=${height},i=${imageId},p=1,c=${GRID_COLS},r=${GRID_ROWS},C=1,q=0`, encodedName)
}

function shmQueryApc(name: string, width: number, height: number, imageId: number): string {
  const encodedName = Buffer.from(name).toString("base64")
  return makeApc(`a=q,t=s,f=32,s=${width},v=${height},i=${imageId},q=0`, encodedName)
}

function gridFor(imageId: number): string {
  const red = (imageId >>> 16) & 0xff
  const green = (imageId >>> 8) & 0xff
  const blue = imageId & 0xff
  const highByte = imageId >>> 24
  if (highByte !== 0x70) throw new Error(`unexpected experiment image-id high byte: 0x${highByte.toString(16)}`)
  let grid = `\x1b7\x1b[?7l\x1b[38;2;${red};${green};${blue}m`
  for (let row = 0; row < GRID_ROWS; row += 1) {
    grid += `\x1b[${row + 1};1H`
    const rowMark = ROW_COLUMN_DIACRITICS[row]
    for (let col = 0; col < GRID_COLS; col += 1) {
      grid += String.fromCodePoint(0x10eeee, rowMark, ROW_COLUMN_DIACRITICS[col], HIGH_ID_DIACRITIC)
    }
  }
  return `${grid}\x1b[39m\x1b[?7h\x1b8`
}

function createAckReader(stdin: NodeJS.ReadStream, timeout: number, onAbort: () => void) {
  let buffer = ""
  let closed = false
  const pending = new Map<number, PendingAck>()
  const onData = (data: Buffer) => {
    if (closed) return
    if (data.includes(0x03)) {
      onAbort()
      abort()
      return
    }
    buffer += data.toString("utf8")
    if (buffer.length > 64 * 1024) buffer = buffer.slice(-64 * 1024)

    const pattern = /\x1b_G([^;\x1b\r\n]*);([^\x1b\r\n]*)\x1b\\/g
    let match: RegExpExecArray | null
    let consumed = 0
    while ((match = pattern.exec(buffer)) !== null) {
      consumed = pattern.lastIndex
      const idField = match[1].split(",").find((field) => /^i=\d+$/.test(field))
      if (!idField) continue
      const id = Number(idField.slice(2))
      const entry = pending.get(id)
      if (!entry) continue
      pending.delete(id)
      clearTimeout(entry.timer)
      const status = match[2].trim()
      entry.resolve({ id, status, outcome: status === "OK" ? "ok" : "error", rttMs: performance.now() - entry.started })
    }
    if (consumed > 0) buffer = buffer.slice(consumed)
  }
  const abort = () => {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer)
      entry.resolve({ id, status: null, outcome: "aborted", rttMs: null })
    }
    pending.clear()
  }
  return {
    start: () => stdin.on("data", onData),
    stop: () => {
      if (closed) return
      closed = true
      stdin.off("data", onData)
      abort()
    },
    abort,
    waitFor: (id: number): Promise<Ack> => {
      if (closed) return Promise.resolve({ id, status: null, outcome: "aborted", rttMs: null })
      if (pending.has(id)) throw new Error(`already waiting for ACK id ${id}`)
      return new Promise((resolve) => {
        const started = performance.now()
        const timer = setTimeout(() => {
          pending.delete(id)
          resolve({ id, status: null, outcome: "timeout", rttMs: null })
        }, timeout)
        pending.set(id, { resolve, timer, started })
      })
    },
  }
}

type AckReader = ReturnType<typeof createAckReader>

function writeMeasured(data: string, counter: ByteCounter | null, kind: "apc" | "grid" | "other" = "other") {
  const bytes = Buffer.byteLength(data)
  process.stdout.write(data)
  if (!counter) return
  counter.ptyBytes += bytes
  if (kind === "apc") counter.apcBytes += bytes
  if (kind === "grid") counter.gridBytes += bytes
}

async function sendApcs(apcs: string[], id: number, reader: AckReader, counter: ByteCounter): Promise<Ack> {
  const pending = reader.waitFor(id)
  for (const apc of apcs) writeMeasured(wrapPassthrough(apc), counter, "apc")
  return pending
}

function drawGrid(imageId: number, counter: ByteCounter) {
  writeMeasured(gridFor(imageId), counter, "grid")
}

function emptyMode(medium: "d" | "s", imageId: number, frames: number, skippedReason?: string): ModeResult {
  return {
    action: "T",
    medium,
    imageId,
    framesRequested: frames,
    framesSent: 0,
    framesAcked: 0,
    grid: { columns: GRID_COLS, rows: GRID_ROWS, drawn: false, bytes: 0 },
    totals: { preparationMs: 0, ptyBytes: 0, apcBytes: 0, gridBytes: 0, ackRttMs: [] },
    frames: [],
    ...(skippedReason ? { skippedReason } : {}),
  }
}

async function runDirectFrame(
  rgba: Uint8Array,
  frame: number,
  options: Options,
  imageId: number,
  reader: AckReader,
  result: ModeResult,
  counter: ByteCounter,
): Promise<Ack> {
  const started = performance.now()
  const prepared = directApcs(rgba, options.width, options.height, imageId)
  const preparationMs = performance.now() - started
  const before = counter.ptyBytes
  const ack = await sendApcs(prepared.apcs, imageId, reader, counter)
  result.frames.push({
    frame,
    preparationMs,
    ptyBytes: counter.ptyBytes - before,
    ackRttMs: ack.rttMs,
    ack: ack.status,
    outcome: ack.outcome,
    accepted: ack.outcome === "ok",
    compressedBytes: prepared.compressedBytes,
    encodedBytes: prepared.encodedBytes,
  })
  return ack
}

async function runShmFrame(
  rgba: Uint8Array,
  frame: number,
  token: string,
  options: Options,
  imageId: number,
  reader: AckReader,
  result: ModeResult,
  counter: ByteCounter,
): Promise<Ack> {
  const started = performance.now()
  const name = shmName(token, "s", frame)
  let prepared: NativeKittyShmHandle | null = null
  try {
    prepared = prepareNativeKittyShm(name, rgba, 0o600)
    const apc = shmApc(name, options.width, options.height, imageId)
    const preparationMs = performance.now() - started
    const before = counter.ptyBytes
    const ack = await sendApcs([apc], imageId, reader, counter)
    result.frames.push({
      frame,
      preparationMs,
      ptyBytes: counter.ptyBytes - before,
      ackRttMs: ack.rttMs,
      ack: ack.status,
      outcome: ack.outcome,
      accepted: ack.outcome === "ok",
      shmBytes: rgba.byteLength,
    })
    return ack
  } finally {
    if (prepared) releaseNativeKittyShm(prepared.handle, true)
  }
}

function finishMode(result: ModeResult, counter: ByteCounter) {
  result.framesSent = result.frames.length
  result.framesAcked = result.frames.filter((frame) => frame.accepted).length
  result.grid.bytes = counter.gridBytes
  result.grid.drawn = counter.gridBytes > 0
  result.totals = {
    preparationMs: result.frames.reduce((sum, frame) => sum + frame.preparationMs, 0),
    ptyBytes: counter.ptyBytes,
    apcBytes: counter.apcBytes,
    gridBytes: counter.gridBytes,
    ackRttMs: result.frames.flatMap((frame) => frame.ackRttMs === null ? [] : [frame.ackRttMs]),
  }
}

function deleteImage(imageId: number) {
  // IDs are generated by this process and are the only IDs ever sent with
  // d=I. q=2 keeps cleanup from adding response traffic during teardown.
  const apc = makeApc(`a=d,d=I,i=${imageId},q=2`)
  writeMeasured(wrapPassthrough(apc), null)
}

async function runLive(options: Options): Promise<ProbeReport> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("--live requires both stdin and stdout to be TTYs; use a free tmux pane")
  }

  const passthrough = tmuxPassthroughState()
  if (passthrough !== "enabled") {
    if (passthrough === "not-tmux") throw new Error("--live must run inside a tmux pane")
    if (passthrough === "disabled") throw new Error("tmux allow-passthrough is off; enable it yourself, then retry")
    throw new Error("could not verify tmux allow-passthrough; no configuration was changed")
  }

  const optionsBeforeRaw = process.stdin.isRaw ?? false
  let rawChanged = false
  let alternateScreen = false
  let aborted = false
  const reader = createAckReader(process.stdin, options.timeout, () => { aborted = true })
  const ownedImageIds = new Set<number>()
  const token = runToken()
  const base = imageIdBase()
  const directId = base + DIRECT_ID_OFFSET
  const shmId = base + SHM_ID_OFFSET
  const queryId = base + QUERY_ID_OFFSET
  const onSignal = () => {
    aborted = true
    reader.abort()
  }

  const queryCounter: ByteCounter = { ptyBytes: 0, apcBytes: 0, gridBytes: 0 }
  let query: ProbeReport["query"] | null = null
  let direct = emptyMode("d", directId, options.frames)
  let shm = emptyMode("s", shmId, options.frames)

  process.on("SIGINT", onSignal)
  process.on("SIGTERM", onSignal)
  try {
    if (!optionsBeforeRaw) {
      process.stdin.setRawMode(true)
      rawChanged = true
    }
    process.stdout.write("\x1b7\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H")
    alternateScreen = true
    reader.start()

    // Keep deterministic RGBA generation outside the preparation timing, just
    // as it is for the direct and placement routes.
    const queryRgba = makeRgba(options.width, options.height, 0)
    const queryStarted = performance.now()
    const queryName = shmName(token, "q", 0)
    let queryHandle: NativeKittyShmHandle | null = null
    let queryAck: Ack
    let queryPreparationMs = 0
    try {
      queryHandle = prepareNativeKittyShm(queryName, queryRgba, 0o600)
      const queryApc = shmQueryApc(queryName, options.width, options.height, queryId)
      queryPreparationMs = performance.now() - queryStarted
      const pending = reader.waitFor(queryId)
      writeMeasured(wrapPassthrough(queryApc), queryCounter, "apc")
      queryAck = await pending
    } finally {
      if (queryHandle) releaseNativeKittyShm(queryHandle.handle, true)
    }
    query = {
      action: "q",
      medium: "s",
      id: queryId,
      preparationMs: queryPreparationMs,
      ptyBytes: queryCounter.ptyBytes,
      ackRttMs: queryAck.rttMs,
      ack: queryAck.status,
      outcome: queryAck.outcome,
      accepted: queryAck.outcome === "ok",
    }

    const directCounter: ByteCounter = { ptyBytes: 0, apcBytes: 0, gridBytes: 0 }
    const shmCounter: ByteCounter = { ptyBytes: 0, apcBytes: 0, gridBytes: 0 }

    for (let frame = 0; frame < options.frames && !aborted; frame += 1) {
      // Generate one deterministic dataset and feed it to both routes. RGBA
      // generation is intentionally outside each route's preparation timer.
      const rgba = makeRgba(options.width, options.height, frame)
      if (frame === 0) ownedImageIds.add(directId)
      const directAck = await runDirectFrame(rgba, frame, options, directId, reader, direct, directCounter)
      if (directAck.outcome === "ok" && !direct.grid.drawn) {
        drawGrid(directId, directCounter)
        direct.grid.drawn = true
      }
      const directStopped = directAck.outcome === "timeout" || directAck.outcome === "aborted"

      if (query.accepted && !aborted) {
        if (frame === 0) ownedImageIds.add(shmId)
        const shmAck = await runShmFrame(rgba, frame, token, options, shmId, reader, shm, shmCounter)
        if (shmAck.outcome === "ok" && !shm.grid.drawn) {
          drawGrid(shmId, shmCounter)
          shm.grid.drawn = true
        }
        if (shmAck.outcome === "timeout" || shmAck.outcome === "aborted") break
      }
      if (directStopped) break
    }
    finishMode(direct, directCounter)
    if (query.accepted) finishMode(shm, shmCounter)
    else shm = emptyMode("s", shmId, options.frames, "SHM query did not return OK")
  } finally {
    for (const imageId of ownedImageIds) {
      try { deleteImage(imageId) } catch {}
    }
    reader.stop()
    if (alternateScreen) process.stdout.write("\x1b[0m\x1b[?25h\x1b[?1049l\x1b8")
    process.off("SIGINT", onSignal)
    process.off("SIGTERM", onSignal)
    if (rawChanged) process.stdin.setRawMode(optionsBeforeRaw)
    process.stdin.pause()
  }

  if (!query) throw new Error("internal error: SHM query did not complete")
  return {
    schema: "vexart-tmux-shm-probe/v1",
    transportAckIsNotDisplayedFrame: "A complete Kitty ACK confirms command processing/acceptance only; it does not prove a visible frame was displayed.",
    config: {
      width: options.width,
      height: options.height,
      frames: options.frames,
      timeoutMs: options.timeout,
      gridColumns: GRID_COLS,
      gridRows: GRID_ROWS,
      rgbaPattern: "RGBA gradient: x/y/frame arithmetic, alpha=255",
      zlibLevel: 6,
    },
    tmux: { passthrough: "enabled", pane: process.env.TMUX_PANE ?? null },
    query,
    modes: { direct, shm },
    aborted,
  }
}

function writeJson(path: string, json: string) {
  if (path === "-") {
    process.stdout.write(`${json}\n`)
    return
  }
  writeFileSync(path, `${json}\n`, { encoding: "utf8", flag: "wx" })
}

async function main(argv: string[]) {
  try {
    const options = parseArgs(argv)
    if (!options) {
      process.stdout.write(HELP)
      return
    }
    if (!options.live) usageError("--live is required to run the experiment")

    // Check before entering raw/alternate-screen mode. The final write still
    // uses wx, so a concurrent creator cannot be overwritten either.
    if (options.out && options.out !== "-" && existsSync(options.out)) {
      throw new Error(`refusing to overwrite existing output file: ${options.out}`)
    }
    const report = await runLive(options)
    const json = JSON.stringify(report, null, 2)
    if (options.out) writeJson(options.out, json)
    else process.stdout.write(`${json}\n`)
    if (report.aborted) process.exitCode = 130
    else if (
      !report.query.accepted ||
      report.modes.direct.framesAcked !== report.config.frames ||
      report.modes.shm.framesAcked !== report.config.frames
    ) process.exitCode = 2
  } catch (error) {
    process.stderr.write(`tmux-shm probe: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

if (import.meta.main) void main(process.argv.slice(2))
