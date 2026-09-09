/**
 * Physical Kitty transport parity gate for Grid v1.x.
 *
 * This command is intentionally different from the offscreen visual runner:
 * it refuses mocks, renderToBuffer, synthetic SHM receivers, and arbitrary
 * scene discovery. It must be launched from an attached Kitty terminal and
 * runs exactly `scenes/grid-dashboard` once directly and once through a
 * private tmux server attached to that same physical terminal.
 *
 * Usage:
 *   bun --conditions=browser run scripts/visual-test/tmux-parity.ts \
 *     --scene=scenes/grid-dashboard --out=artifacts/grid-parity/<run-id>
 */

import { createHash } from "node:crypto"
import { inflateSync } from "node:zlib"
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { readAndUnlinkTmuxShm, validateRawRgbaFrame } from "./tmux-shm-reader"

const ROOT = resolve(import.meta.dir, "../..")
const SCENE_ID = "scenes/grid-dashboard"
const SCENE_PATH = join(ROOT, "scripts/visual-test/scenes/grid-dashboard.tsx")
const CELL_WIDTH = 8
const CELL_HEIGHT = 16
const PHYSICAL_COMMAND = "bun --conditions=browser run scripts/visual-test/tmux-parity.ts --scene=scenes/grid-dashboard --out=artifacts/grid-parity/<run-id>"

type Packet = { header: string; payload: string; wrapped: boolean }
type DecodedFrame = {
  width: number
  height: number
  imageId: number
  rgba: Uint8Array
  action: "T" | "f"
}
type ParsedOutput = {
  packets: Packet[]
  frames: DecodedFrame[]
  wrappedApcCount: number
  bareApcCount: number
  outsideBytes: number
  placeholderChars: number
}

type PhysicalPacketReport = {
  packets: Packet[]
  frames: DecodedFrame[]
  wrappedApcCount: number
  bareApcCount: number
  shmUploads: Array<{ name: string; width: number; height: number; bytes: number; imageId: number; placement: number; cols: number; rows: number }>
  deletes: number[]
}

type PhysicalCaptureRoute = "direct" | "tmux-producer" | "tmux-outer"

type PhysicalCheck = { name: string; ok: boolean; detail: string }
export type PhysicalTerminalEvidence = { available: boolean; checks: PhysicalCheck[] }

export type PhysicalViewport = {
  width: number
  height: number
  cols: number
  rows: number
  cellWidth: number
  cellHeight: number
}

export type PhysicalGridParityResult = {
  status: "PASS" | "BLOCKED" | "FAILED"
  out: string
  scene: string
  evidence: PhysicalTerminalEvidence
  error?: string
  report?: unknown
}

export class PhysicalBlocker extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PhysicalBlocker"
  }
}

/**
 * The script(1) wrapper and its child must stay attached to the caller's
 * physical Kitty tty. The wrapper captures the complete PTY transcript,
 * including native writes made directly to stdout's file descriptor; the
 * generated child also keeps a JS-level capture for diagnostics. Keeping this
 * contract in one value makes it testable without pretending that a non-tty
 * test process is physical hardware.
 */
export const PHYSICAL_CHILD_SPAWN = Object.freeze({
  stdin: "inherit",
  stdout: "inherit",
  stderr: "pipe",
} as const)

export type PhysicalChildIo = {
  readonly stdinTTY: boolean
  readonly stdoutTTY: boolean
  readonly stderrTTY: boolean
  readonly stdinFd: number | null
  readonly stdoutFd: number | null
  readonly stderrFd: number | null
}

export function physicalChildIo(): PhysicalChildIo {
  const stdin = process.stdin as NodeJS.ReadStream & { readonly fd?: number }
  const stdout = process.stdout as NodeJS.WriteStream & { readonly fd?: number }
  const stderr = process.stderr as NodeJS.WriteStream & { readonly fd?: number }
  return {
    stdinTTY: !!stdin.isTTY,
    stdoutTTY: !!stdout.isTTY,
    stderrTTY: !!stderr.isTTY,
    stdinFd: typeof stdin.fd === "number" ? stdin.fd : null,
    stdoutFd: typeof stdout.fd === "number" ? stdout.fd : null,
    stderrFd: typeof stderr.fd === "number" ? stderr.fd : null,
  }
}

function value(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
}

function fail(message: string): never {
  throw new Error(message)
}

function parsePositive(name: string, input: string | undefined, fallback: number): number {
  const parsed = input === undefined ? fallback : Number(input)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail(`--${name} must be a positive integer`)
  return parsed
}

function parsePacket(data: string, start: number): { packet: Packet; end: number } {
  if (!data.startsWith("\x1b_G", start)) fail("expected a complete Kitty APC")
  const end = data.indexOf("\x1b\\", start + 3)
  if (end < 0) fail("unterminated Kitty APC")
  const body = data.slice(start + 3, end)
  const separator = body.indexOf(";")
  if (separator < 0) fail("Kitty APC is missing its header separator")
  return {
    packet: { header: body.slice(0, separator), payload: body.slice(separator + 1), wrapped: false },
    end: end + 2,
  }
}

function unwrapTmux(data: string, start: number): { body: string; end: number } {
  const prefix = "\x1bPtmux;"
  if (!data.startsWith(prefix, start)) fail("expected tmux passthrough DCS")
  let cursor = start + prefix.length
  let body = ""
  while (cursor < data.length) {
    const char = data[cursor]
    if (char !== "\x1b") {
      body += char
      cursor++
      continue
    }
    if (data[cursor + 1] === "\x1b") {
      body += "\x1b"
      cursor += 2
      continue
    }
    if (data[cursor + 1] === "\\") return { body, end: cursor + 2 }
    fail("malformed tmux passthrough escape")
  }
  fail("unterminated tmux passthrough DCS")
}

function fields(header: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const field of header.split(",")) {
    const separator = field.indexOf("=")
    if (separator <= 0) fail(`malformed Kitty header field: ${field}`)
    const key = field.slice(0, separator)
    if (result.has(key)) fail(`duplicate Kitty header field: ${key}`)
    result.set(key, field.slice(separator + 1))
  }
  return result
}

function integer(field: Map<string, string>, name: string): number {
  const parsed = Number(field.get(name))
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail(`invalid Kitty ${name} field`)
  return parsed
}

/** Decode direct Kitty zlib uploads. SHM uploads are intentionally rejected. */
export function decodeFrames(packets: Array<{ header: string; payload: string }>, allowShm = false): DecodedFrame[] {
  const frames: DecodedFrame[] = []
  let current: { action: "T" | "f"; width: number; height: number; imageId: number; payload: string } | null = null
  const validateChunk = (payload: string, more: boolean) => {
    if (payload.length > 4096) fail("Kitty upload chunk exceeds the 4096-byte protocol limit")
    if (more && (payload.length === 0 || payload.length % 4 !== 0)) fail("non-final Kitty upload chunk must have a non-zero base64 length divisible by 4")
  }
  const finish = () => {
    if (!current) fail("Kitty continuation ended without an upload")
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(current.payload) || current.payload.length % 4 !== 0) fail("invalid base64 in Kitty upload")
    let rgba: Buffer
    try {
      rgba = inflateSync(Buffer.from(current.payload, "base64"))
    } catch (error) {
      fail(`Kitty zlib payload failed to inflate: ${error instanceof Error ? error.message : String(error)}`)
    }
    const expected = current.width * current.height * 4
    if (rgba.byteLength !== expected) fail(`Kitty frame has ${rgba.byteLength} RGBA bytes; expected ${expected}`)
    frames.push({ action: current.action, width: current.width, height: current.height, imageId: current.imageId, rgba: new Uint8Array(rgba) })
    current = null
  }

  for (const packet of packets) {
    const header = fields(packet.header)
    const action = header.get("a")
    if ((action === "T" || action === "f") && header.get("t") === "s") {
      if (!allowShm) fail("SHM Kitty upload appeared in the direct parity route")
      continue
    }
    if (action === "T" || action === "f") {
      if (current) fail("Kitty upload started before the previous continuation completed")
      if (header.get("f") !== "32" || header.get("o") !== "z") fail("Kitty upload is not RGBA zlib data")
      const marker = header.get("m")
      if (marker !== "0" && marker !== "1") fail("Kitty upload is missing a valid m field")
      validateChunk(packet.payload, marker === "1")
      current = {
        action,
        width: integer(header, "s"),
        height: integer(header, "v"),
        imageId: integer(header, "i"),
        payload: packet.payload,
      }
      if (marker === "0") finish()
      continue
    }
    if (header.get("m") !== undefined) {
      if (!current || (action !== undefined && action !== "")) fail("Kitty continuation ended without an upload")
      if (header.size !== 1 || (header.get("m") !== "0" && header.get("m") !== "1")) fail("malformed Kitty continuation")
      validateChunk(packet.payload, header.get("m") === "1")
      current.payload += packet.payload
      if (header.get("m") === "0") finish()
      continue
    }
    // Kitty probes and responses are not image frames. They are allowed in a
    // physical capture but never count as transport evidence.
    if (action === "q" || action === "i") continue
    if (current) fail("Kitty command interleaved before the upload continuation completed")
    if (action === "d" || action === "p" || action === "a") continue
    if (action === "t") {
      if (!allowShm) fail("SHM Kitty upload appeared in the direct parity route")
      continue
    }
    fail(`unsupported Kitty action: ${action ?? "missing a"}`)
  }
  if (current) fail("truncated Kitty upload at end of output")
  return frames
}

/** Parse captured protocol while preserving the direct-vs-passthrough boundary. */
export function parseOutput(raw: Buffer, tmux: boolean, width: number, height: number, shmFrames: DecodedFrame[] = []): ParsedOutput {
  const text = raw.toString("utf8")
  if (!Buffer.from(text).equals(raw)) fail("native output is not valid UTF-8")
  const packets: Packet[] = []
  let wrappedApcCount = 0
  let bareApcCount = 0
  let outsideBytes = 0
  let placeholderChars = 0
  let cursor = 0

  while (cursor < text.length) {
    const dcs = text.indexOf("\x1bPtmux;", cursor)
    const apc = text.indexOf("\x1b_G", cursor)
    const candidates = [dcs, apc].filter((entry) => entry >= 0)
    if (candidates.length === 0) {
      const outside = text.slice(cursor)
      outsideBytes += Buffer.byteLength(outside)
      placeholderChars += outside.split(String.fromCodePoint(0x10eeee)).length - 1
      break
    }
    const next = Math.min(...candidates)
    const outside = text.slice(cursor, next)
    outsideBytes += Buffer.byteLength(outside)
    placeholderChars += outside.split(String.fromCodePoint(0x10eeee)).length - 1
    if (tmux && next === dcs) {
      const unwrapped = unwrapTmux(text, next)
      if (unwrapped.body.length === 0) fail("empty tmux passthrough wrapper")
      const parsed = parsePacket(unwrapped.body, 0)
      packets.push({ ...parsed.packet, wrapped: true })
      wrappedApcCount++
      if (parsed.end !== unwrapped.body.length) fail("tmux passthrough wrapper must contain exactly one Kitty APC")
      cursor = unwrapped.end
      continue
    }
    if (!tmux && next === dcs) fail("unexpected tmux passthrough wrapper in direct route")
    if (tmux && next === apc) fail("bare Kitty APC in tmux SHM route")
    const parsed = parsePacket(text, next)
    packets.push(parsed.packet)
    bareApcCount++
    cursor = parsed.end
  }

  const framePackets = packets.filter((packet) => fields(packet.header).get("a") !== "q" && fields(packet.header).get("a") !== "i")
  const frames = [...decodeFrames(framePackets, shmFrames.length > 0), ...shmFrames]
  if (frames.length === 0) fail("native output contained no complete Kitty frame")
  for (const frame of frames) {
    if (frame.width !== width || frame.height !== height) fail(`Kitty frame dimensions ${frame.width}x${frame.height} differ from ${width}x${height}`)
  }
  for (const packet of packets) {
    const header = fields(packet.header)
    const action = header.get("a")
    if (tmux && (action === "f" || action === "a")) fail(`tmux placeholder route emitted unsupported animation action ${action}`)
    if (action !== "T" && action !== "f") continue
    if (tmux) {
      if (header.get("t") !== "s" || header.get("f") !== "32" || header.get("U") !== "1" || header.get("q") !== "1" || header.has("o") || header.has("m") || integer(header, "p") <= 0) fail("tmux upload is missing native SHM placeholder fields")
      if (Number(header.get("c")) !== Math.ceil(width / CELL_WIDTH) || Number(header.get("r")) !== Math.ceil(height / CELL_HEIGHT)) fail("tmux placeholder grid dimensions do not match the terminal")
    } else if (header.has("U")) fail("direct upload unexpectedly used Unicode placeholders")
  }
  if (tmux && placeholderChars === 0) fail("tmux route emitted no Unicode placeholder grid")
  if (tmux && bareApcCount !== 0) fail("tmux route emitted a bare APC")
  if (!tmux && wrappedApcCount !== 0) fail("direct route emitted a wrapped APC")
  const frameIds = new Set(frames.map((frame) => frame.imageId))
  for (const packet of packets) {
    const header = fields(packet.header)
    if (header.get("a") !== "d") continue
    if (!frameIds.has(integer(header, "i"))) fail("Kitty delete targeted an image not emitted by this child")
  }
  return { packets, frames, wrappedApcCount, bareApcCount, outsideBytes, placeholderChars }
}

export type StreamOutputResult = {
  shmFrames: DecodedFrame[]
  shmNames: string[]
  shmPlacements: number[]
  shmObjects: Array<{ name: string; mode: number; size: number }>
}

/**
 * Compatibility decoder used by the pre-existing controller regression test.
 * G-037 never invokes it: the physical runner below sends output to Kitty and
 * lets Kitty consume real SHM, while this class only serves the unit fixture
 * that injects a local receiver.
 */
export class StreamOutputDecoder {
  private readonly decoder = new TextDecoder("utf-8", { fatal: true })
  private text = ""
  private cursor = 0
  private readonly shmFrames: DecodedFrame[] = []
  private readonly shmNames: string[] = []
  private readonly shmPlacements: number[] = []
  private readonly shmObjects: Array<{ name: string; mode: number; size: number }> = []

  constructor(private readonly tmux: boolean, private readonly width: number | null, private readonly height: number | null) {}

  feed(chunk: Uint8Array): void {
    try {
      this.text += this.decoder.decode(chunk, { stream: true })
    } catch (error) {
      fail(`native output is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`)
    }
    this.scan(false)
  }

  finish(): StreamOutputResult {
    try {
      this.text += this.decoder.decode()
    } catch (error) {
      fail(`native output is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`)
    }
    this.scan(true)
    return { shmFrames: this.shmFrames, shmNames: this.shmNames, shmPlacements: this.shmPlacements, shmObjects: this.shmObjects }
  }

  private outsideEnd(final: boolean): number {
    return final ? this.text.length : Math.max(this.cursor, this.text.length - 7)
  }

  private scan(final: boolean): void {
    while (this.cursor < this.text.length) {
      const dcs = this.text.indexOf("\x1bPtmux;", this.cursor)
      const apc = this.text.indexOf("\x1b_G", this.cursor)
      const candidates = [dcs, apc].filter((entry) => entry >= 0)
      if (candidates.length === 0) {
        this.cursor = this.outsideEnd(final)
        if (!final) return
        continue
      }
      const next = Math.min(...candidates)
      this.cursor = next
      if (next === dcs) {
        if (!this.tmux) fail("unexpected tmux passthrough wrapper in direct route")
        const unwrapped = this.unwrapMaybe(next)
        if (!unwrapped) {
          if (final) fail("unterminated tmux passthrough DCS")
          return
        }
        const packet = this.packetMaybe(unwrapped.body, 0)
        if (!packet) {
          if (final) fail("tmux passthrough wrapper contains an incomplete Kitty APC")
          return
        }
        if (packet.end !== unwrapped.body.length) fail("tmux passthrough wrapper must contain exactly one Kitty APC")
        this.record(packet.packet)
        this.cursor = unwrapped.end
        continue
      }
      if (this.tmux) fail("bare Kitty APC in tmux SHM route")
      const packet = this.packetMaybe(this.text, next)
      if (!packet) {
        if (final) fail("unterminated Kitty APC")
        return
      }
      this.record(packet.packet)
      this.cursor = packet.end
    }
  }

  private packetMaybe(data: string, start: number): { packet: Packet; end: number } | null {
    const end = data.indexOf("\x1b\\", start + 3)
    return end < 0 ? null : parsePacket(data, start)
  }

  private unwrapMaybe(start: number): { body: string; end: number } | null {
    const prefix = "\x1bPtmux;"
    if (!this.text.startsWith(prefix, start)) fail("expected tmux passthrough DCS")
    let cursor = start + prefix.length
    let body = ""
    while (cursor < this.text.length) {
      const char = this.text[cursor]
      if (char !== "\x1b") {
        body += char
        cursor++
        continue
      }
      if (cursor + 1 >= this.text.length) return null
      if (this.text[cursor + 1] === "\x1b") {
        body += "\x1b"
        cursor += 2
        continue
      }
      if (this.text[cursor + 1] === "\\") return { body, end: cursor + 2 }
      fail("malformed tmux passthrough escape")
    }
    return null
  }

  private record(packet: Packet): void {
    const header = fields(packet.header)
    if (header.get("a") !== "T" || header.get("t") !== "s") return
    if (!this.tmux) fail("SHM Kitty upload appeared in the direct parity route")
    if (header.get("f") !== "32" || header.get("U") !== "1" || header.get("q") !== "1" || header.has("o") || header.has("m")) fail("tmux SHM upload is missing native fields")
    const frameWidth = integer(header, "s")
    const frameHeight = integer(header, "v")
    const imageId = integer(header, "i")
    const placement = integer(header, "p")
    const expected = frameWidth * frameHeight * 4
    if (this.width !== null && this.height !== null && (frameWidth !== this.width || frameHeight !== this.height)) fail("tmux SHM dimensions differ from the child readback")
    if (Number(header.get("S")) !== expected) fail("tmux SHM payload byte count is not raw RGBA")
    if (this.width !== null && this.height !== null && (Number(header.get("c")) !== Math.ceil(this.width / CELL_WIDTH) || Number(header.get("r")) !== Math.ceil(this.height / CELL_HEIGHT))) fail("tmux SHM grid dimensions do not match the test terminal")
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(packet.payload) || packet.payload.length % 4 !== 0) fail("tmux SHM name is not valid base64")
    const name = Buffer.from(packet.payload, "base64").toString("utf8")
    if (!name || Buffer.from(name).toString("base64") !== packet.payload) fail("tmux SHM name has non-canonical base64")
    const read = readAndUnlinkTmuxShm(name, expected)
    this.shmNames.push(name)
    this.shmPlacements.push(placement)
    this.shmObjects.push({ name: read.name, mode: read.mode, size: read.size })
    this.shmFrames.push({ action: "T", width: frameWidth, height: frameHeight, imageId, rgba: validateRawRgbaFrame(read.rgba, frameWidth, frameHeight) })
  }
}

function commandPath(name: string): string | null {
  const result = Bun.spawnSync(["sh", "-lc", `command -v ${name}`])
  if (result.exitCode !== 0) return null
  const path = new TextDecoder().decode(result.stdout).trim()
  return path || null
}

function commandVersion(name: string): string {
  const result = Bun.spawnSync([name, "-V"])
  return result.exitCode === 0 ? new TextDecoder().decode(result.stdout).trim() : "unavailable"
}

/** Build the portable `script(1)` argv used to keep a physical route attached. */
export function scriptPtyArgs(outputPath: string, command: readonly string[]): string[] {
  // BSD script (including macOS) spells flush `-F`; util-linux uses `-f`.
  const flush = process.platform === "darwin" ? "-F" : "-f"
  return ["-q", flush, outputPath, ...command]
}

/** Wrap a child command in a physical PTY transcript without piping stdout. */
export function physicalCaptureCommand(scriptPath: string, outputPath: string, command: readonly string[]): string[] {
  return [scriptPath, ...scriptPtyArgs(outputPath, command)]
}

/** Build the inner pane capture: producer bytes are recorded before tmux. */
export function physicalTmuxProducerCommand(scriptPath: string, outputPath: string, command: readonly string[]): string[] {
  return physicalCaptureCommand(scriptPath, outputPath, command)
}

/** Private tmux server configuration must be loaded with its first session. */
export function physicalTmuxConfig(): string {
  return [
    "set-option -g allow-passthrough all",
    "set-option -g status off",
    "set-option -g default-terminal tmux-256color",
    "set-option -g terminal-features ',xterm-kitty:RGB'",
    "",
  ].join("\n")
}

export function inspectPhysicalTerminal(options: {
  env?: NodeJS.ProcessEnv
  stdinTTY?: boolean
  stdoutTTY?: boolean
} = {}): PhysicalTerminalEvidence {
  const env = options.env ?? process.env
  const stdinTTY = options.stdinTTY ?? !!process.stdin.isTTY
  const stdoutTTY = options.stdoutTTY ?? !!process.stdout.isTTY
  const tmux = commandPath("tmux")
  const script = commandPath("script")
  const kittyIdentity = env.KITTY_WINDOW_ID !== undefined && env.KITTY_WINDOW_ID !== ""
    && (env.TERM_PROGRAM?.toLowerCase() === "kitty" || env.TERM === "xterm-kitty")
  const checks: PhysicalCheck[] = [
    { name: "stdin-tty", ok: stdinTTY, detail: stdinTTY ? "stdin is an attached tty" : "stdin is not a tty" },
    { name: "stdout-tty", ok: stdoutTTY, detail: stdoutTTY ? "stdout is an attached tty" : "stdout is not a tty" },
    { name: "kitty-identity", ok: kittyIdentity, detail: kittyIdentity ? `KITTY_WINDOW_ID=${env.KITTY_WINDOW_ID}` : "TERM/TERM_PROGRAM and KITTY_WINDOW_ID do not identify Kitty" },
    { name: "outside-tmux", ok: !env.TMUX, detail: env.TMUX ? "direct route would already be inside tmux" : "direct route starts outside tmux" },
    { name: "tmux", ok: tmux !== null, detail: tmux ?? "tmux executable not found" },
    { name: "script-pty", ok: script !== null, detail: script ?? "script(1) executable not found" },
  ]
  return { available: checks.every((check) => check.ok), checks }
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`
}

function writeOwnedJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" })
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function compareBytes(left: Uint8Array, right: Uint8Array): { equal: boolean; mismatches: number } {
  if (left.length !== right.length) return { equal: false, mismatches: Math.max(left.length, right.length) }
  let mismatches = 0
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) mismatches++
  return { equal: mismatches === 0, mismatches }
}

export function generatedPhysicalFixture(args: { scene: string; mode: "direct" | "tmux-shm"; raw: string; metadata: string; rects: string; status: string; viewport?: PhysicalViewport }): string {
  const terminalImport = JSON.stringify(join(ROOT, "packages/engine/src/terminal/index.ts"))
  const loopImport = JSON.stringify(join(ROOT, "packages/engine/src/loop/loop.ts"))
  const reconcilerImport = JSON.stringify(join(ROOT, "packages/engine/src/reconciler/reconciler.ts"))
  const dirtyImport = JSON.stringify(join(ROOT, "packages/engine/src/reconciler/dirty.ts"))
  const backendImport = JSON.stringify(join(ROOT, "packages/engine/src/ffi/renderer-backend.ts"))
  return `// G-037 physical child; this file is removed after the route.\n// @ts-nocheck\nimport { createHash } from "node:crypto"\nimport { appendFileSync, statSync, writeFileSync } from "node:fs"\nimport { detect } from ${JSON.stringify(join(ROOT, "packages/engine/src/terminal/detect.ts"))}\nimport { inferCaps } from ${JSON.stringify(join(ROOT, "packages/engine/src/terminal/caps.ts"))}\nimport { createTerminal } from ${terminalImport}\nimport { createRenderLoop } from ${loopImport}\nimport { render as solidRender } from ${reconcilerImport}\nimport { markDirty } from ${dirtyImport}\nimport { getRendererBackend } from ${backendImport}\n\nconst scenePath = ${JSON.stringify(args.scene)}\nconst mode = ${JSON.stringify(args.mode)}\nconst rawPath = ${JSON.stringify(args.raw)}\nconst metadataPath = ${JSON.stringify(args.metadata)}\nconst rectsPath = ${JSON.stringify(args.rects)}\nconst statusPath = ${JSON.stringify(args.status)}\nconst viewportOverride = ${JSON.stringify(args.viewport ?? null)}\nconst sceneId = ${JSON.stringify(SCENE_ID)}\nconst inferredKind = detect()\nconst inferredCaps = inferCaps(inferredKind)\nconst io = () => ({\n  stdinTTY: !!process.stdin.isTTY, stdoutTTY: !!process.stdout.isTTY, stderrTTY: !!process.stderr.isTTY,\n  stdinFd: typeof process.stdin.fd === "number" ? process.stdin.fd : null,\n  stdoutFd: typeof process.stdout.fd === "number" ? process.stdout.fd : null,\n  stderrFd: typeof process.stderr.fd === "number" ? process.stderr.fd : null,\n})\nlet probeBytes = 0\nlet probeEvents = 0\nlet kittyResponses = 0\nlet probeText = ""\nconst observeInput = (chunk) => {\n  probeEvents++\n  probeBytes += chunk.byteLength\n  probeText = (probeText + chunk.toString("utf8")).slice(-16 * 1024)\n  kittyResponses = (probeText.match(/\\x1b_Gi=\\d+;[^\\x1b\\r\\n]*\\x1b\\\\/g) || []).length\n}\nprocess.stdin.on("data", observeInput)\nlet terminal = null\nlet loop = null\nlet dispose = null\n\nfunction writeJson(path, value) { writeFileSync(path, JSON.stringify(value, null, 2) + "\\n", { flag: "wx" }) }\nfunction appendOutput() {\n  return new Proxy(process.stdout, { get(target, property, receiver) {\n    if (property !== "write") return Reflect.get(target, property, receiver)\n    return (chunk, ...rest) => {\n      const bytes = typeof chunk === "string" ? Buffer.from(chunk, typeof rest[0] === "string" ? rest[0] : "utf8") : Buffer.from(chunk)\n      appendFileSync(rawPath, bytes)\n      return target.write(chunk, ...rest)\n    }\n  } })\n}\nfunction capturedBytes() {\n  try { return statSync(rawPath).size } catch { return 0 }\n}\nfunction childEvidence() { return { io: io(), capture: { rawPath, bytes: capturedBytes(), forwardedTo: "stdout" }, probe: { inputEvents: probeEvents, inputBytes: probeBytes, kittyResponses } } }\nfunction terminalEvidence() {\n  return terminal ? { kind: terminal.kind, caps: terminal.caps, size: terminal.size } : { kind: inferredKind, caps: inferredCaps, resolved: false }\n}\nfunction collectRects(root) {\n  const result = []\n  const visit = (node) => {\n    const rect = node.layout\n    result.push({ id: node.id, kind: node.kind, text: node.kind === "text" ? node.text : undefined, x: rect.x, y: rect.y, width: rect.width, height: rect.height })\n    node.children.forEach(visit)\n  }\n  visit(root)\n  return result\n}\nfunction hashReadback(backend, width, height) {\n  if (!backend || typeof backend.readbackForTest !== "function") return null\n  const value = backend.readbackForTest(width, height)\n  if (!value) return null\n  const pixels = new Uint8Array(value)\n  return { width, height, bytes: pixels.byteLength, sha256: createHash("sha256").update(pixels).digest("hex") }\n}\nfunction routeFailure(expectedTmux, caps) {\n  const mismatches = []\n  if (caps.tmux !== expectedTmux) mismatches.push(\`tmux expected=\${expectedTmux} actual=\${caps.tmux}\`)\n  if (mode === "direct") {\n    if (caps.transmissionMode !== "direct") mismatches.push(\`transmissionMode expected=direct actual=\${caps.transmissionMode}\`)\n    if (!caps.kittyGraphics) mismatches.push("kittyGraphics=false (Kitty probe returned no usable acknowledgement)")\n  } else {\n    if (caps.transmissionMode !== "shm") mismatches.push(\`transmissionMode expected=shm actual=\${caps.transmissionMode}\`)\n    if (!caps.kittyPlaceholder) mismatches.push("kittyPlaceholder=false")\n  }\n  return mismatches.length === 0 ? null : mismatches.join(", ")\n}\n\ntry {\n  const mod = await import(scenePath)\n  if (typeof mod.Scene !== "function") throw new Error("grid-dashboard does not export Scene")\n  if (!io().stdinTTY || !io().stdoutTTY) throw new Error(\`physical child requires inherited stdin/stdout TTY: \${JSON.stringify(childEvidence())}\`)\n  const expectedTmux = mode === "tmux-shm"\n  terminal = await createTerminal({ stdin: process.stdin, stdout: appendOutput(), probeTimeout: 2000 })\n  const routeError = routeFailure(expectedTmux, terminal.caps)\n  if (routeError) throw new Error(\`physical \${mode} transport capability mismatch: \${routeError}; caps=\${JSON.stringify(terminal.caps)}; child=\${JSON.stringify(childEvidence())}\`)\n  // TerminalSize uses pixelWidth/pixelHeight (not the report's width/height\n  // aliases). Copy each field explicitly so a tmux fallback query can never\n  // leave the old 2656px pixel width attached to the render loop.\n  if (viewportOverride) Object.assign(terminal.size, {\n    cols: viewportOverride.cols,\n    rows: viewportOverride.rows,\n    pixelWidth: viewportOverride.width,\n    pixelHeight: viewportOverride.height,\n    cellWidth: viewportOverride.cellWidth,\n    cellHeight: viewportOverride.cellHeight,\n  })\n  const viewport = { width: terminal.size.pixelWidth || terminal.size.cols * (terminal.size.cellWidth || 8), height: terminal.size.pixelHeight || terminal.size.rows * (terminal.size.cellHeight || 16) }\n  loop = createRenderLoop(terminal, { experimental: { nativePresentation: true, nativeLayerRegistry: true, forceLayerRepaint: true } })\n  dispose = solidRender(() => mod.Scene(), loop.root)\n  markDirty()\n  loop.frame()\n  await Bun.sleep(expectedTmux ? 1600 : 350)\n  markDirty()\n  loop.frame()\n  await Bun.sleep(expectedTmux ? 1600 : 350)\n  const backend = getRendererBackend()\n  const metadata = {\n    version: 2, scene: sceneId, mode, physical: true,\n    terminal: terminalEvidence(), child: childEvidence(),\n    viewport, viewportSource: viewportOverride ? "direct-measured" : "terminal-query", rectCount: collectRects(loop.root).length,\n    readback: hashReadback(backend, viewport.width, viewport.height),\n  }\n  writeJson(rectsPath, collectRects(loop.root))\n  writeJson(metadataPath, metadata)\n  if (dispose) dispose()\n  dispose = null\n  if (loop) loop.destroy()\n  loop = null\n  if (terminal) terminal.destroy()\n  terminal = null\n  writeFileSync(statusPath, "0\\n", { flag: "wx" })\n} catch (error) {\n  const failure = { version: 2, scene: sceneId, mode, physical: true, error: error instanceof Error ? error.message : String(error), terminal: terminalEvidence(), child: childEvidence(), environment: { TERM: process.env.TERM ?? null, TERM_PROGRAM: process.env.TERM_PROGRAM ?? null, KITTY_WINDOW_ID: process.env.KITTY_WINDOW_ID ?? null, TMUX: !!process.env.TMUX, TMUX_PANE: process.env.TMUX_PANE ?? null } }\n  try { writeJson(metadataPath, failure) } catch {}\n  try { writeFileSync(statusPath, "1\\n", { flag: "wx" }) } catch {}\n  process.exitCode = 1\n} finally {\n  process.stdin.off("data", observeInput)\n  try { if (dispose) dispose() } catch {}\n  try { if (loop) loop.destroy() } catch {}\n  try { if (terminal) terminal.destroy() } catch {}\n  process.stdin.pause()\n}\n`
}

function parseRectFile(path: string): Array<{ id: number; kind: string; text?: string; x: number; y: number; width: number; height: number }> {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Array<{ id: number; kind: string; text?: string; x: number; y: number; width: number; height: number }>
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error(`rect dump is empty: ${path}`)
  for (const rect of parsed) {
    if (!Number.isSafeInteger(rect.id) || !Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) throw new Error(`rect dump contains a non-finite rect: ${path}`)
  }
  return parsed
}

function packetList(raw: Buffer, route: PhysicalCaptureRoute): { packets: Packet[]; wrappedApcCount: number; bareApcCount: number } {
  const text = raw.toString("utf8")
  if (!Buffer.from(text).equals(raw)) fail("physical Kitty capture is not valid UTF-8")
  const packets: Packet[] = []
  let wrappedApcCount = 0
  let bareApcCount = 0
  let cursor = 0
  while (cursor < text.length) {
    const dcs = text.indexOf("\x1bPtmux;", cursor)
    const apc = text.indexOf("\x1b_G", cursor)
    const candidates = [dcs, apc].filter((entry) => entry >= 0)
    if (candidates.length === 0) break
    const next = Math.min(...candidates)
    if (next === dcs) {
      if (route === "direct" || route === "tmux-outer") fail(`${route === "direct" ? "physical direct" : "physical tmux outer"} capture contains an unexpected tmux passthrough wrapper`)
      const unwrapped = unwrapTmux(text, next)
      const parsed = parsePacket(unwrapped.body, 0)
      if (parsed.end !== unwrapped.body.length) fail("physical tmux passthrough wrapper contains more than one APC")
      packets.push({ ...parsed.packet, wrapped: true })
      wrappedApcCount++
      cursor = unwrapped.end
      continue
    }
    if (route === "tmux-producer") fail("physical tmux producer capture contains a bare Kitty APC")
    const parsed = parsePacket(text, next)
    packets.push(parsed.packet)
    bareApcCount++
    cursor = parsed.end
  }
  return { packets, wrappedApcCount, bareApcCount }
}

/** Parse a physical capture at its transport boundary.
 *
 * The producer is captured inside the tmux pane and must still contain a
 * passthrough DCS. The outer capture is after tmux has consumed that DCS and
 * therefore contains the forwarded bare APC. The synthetic parseOutput()
 * contract below remains stricter and intentionally rejects bare tmux APCs.
 */
export function parsePhysicalCapture(raw: Buffer, route: PhysicalCaptureRoute): { packets: Packet[]; wrappedApcCount: number; bareApcCount: number } {
  return packetList(raw, route)
}

function ownedShmName(name: string): boolean {
  return /^\/vx-[0-9a-f]+-[0-9a-f]+$/.test(name) && name.length <= 31
}

function inspectPhysicalPackets(raw: Buffer, route: "direct" | "tmux", width: number, height: number, expectedCols: number, expectedRows: number): PhysicalPacketReport {
  const parsed = packetList(raw, route === "direct" ? "direct" : "tmux-outer")
  const shmUploads: PhysicalPacketReport["shmUploads"] = []
  const deletes: number[] = []
  for (const packet of parsed.packets) {
    const header = fields(packet.header)
    const action = header.get("a")
    if (action === "q" || action === "i" || action === "p" || action === "a") continue
    if (action === "d") {
      deletes.push(integer(header, "i"))
      continue
    }
    if (action !== "T" && action !== "f") continue
    if (route === "direct") continue
    if (header.get("t") !== "s" || header.get("f") !== "32" || header.get("U") !== "1" || header.get("q") !== "1" || header.has("o") || header.has("m")) throw new Error("physical tmux upload is not raw Kitty SHM")
    const uploadWidth = integer(header, "s")
    const uploadHeight = integer(header, "v")
    const bytes = integer(header, "S")
    const cols = integer(header, "c")
    const rows = integer(header, "r")
    const imageId = integer(header, "i")
    const placement = integer(header, "p")
    if (uploadWidth !== width || uploadHeight !== height || bytes !== width * height * 4 || cols !== expectedCols || rows !== expectedRows) throw new Error("physical tmux SHM geometry does not match its terminal viewport")
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(packet.payload) || packet.payload.length % 4 !== 0) throw new Error("physical tmux SHM name is not canonical base64")
    const name = Buffer.from(packet.payload, "base64").toString("utf8")
    if (!ownedShmName(name)) throw new Error(`physical tmux emitted an unsafe SHM name: ${name}`)
    shmUploads.push({ name, width: uploadWidth, height: uploadHeight, bytes, imageId, placement, cols, rows })
  }
  const frames = route === "direct"
    ? decodeFrames(parsed.packets.filter((packet) => { const action = fields(packet.header).get("a"); return action !== "q" && action !== "i" }), false)
    : []
  for (const frame of frames) if (frame.width !== width || frame.height !== height) throw new Error("physical direct frame dimensions differ from terminal viewport")
  return { packets: parsed.packets, frames, wrappedApcCount: parsed.wrappedApcCount, bareApcCount: parsed.bareApcCount, shmUploads, deletes }
}

function inspectProducerShmPackets(raw: Buffer, width: number, height: number, expectedCols: number, expectedRows: number): PhysicalPacketReport {
  const parsed = packetList(raw, "tmux-producer")
  const shmUploads: PhysicalPacketReport["shmUploads"] = []
  const deletes: number[] = []
  for (const packet of parsed.packets) {
    const header = fields(packet.header)
    const action = header.get("a")
    if (action === "q" || action === "i" || action === "p" || action === "a") continue
    if (action === "d") {
      deletes.push(integer(header, "i"))
      continue
    }
    if (action !== "T" && action !== "f") continue
    if (header.get("t") !== "s" || header.get("f") !== "32" || header.get("U") !== "1" || header.get("q") !== "1" || header.has("o") || header.has("m")) throw new Error("physical tmux producer did not emit raw SHM")
    const uploadWidth = integer(header, "s")
    const uploadHeight = integer(header, "v")
    const bytes = integer(header, "S")
    const cols = integer(header, "c")
    const rows = integer(header, "r")
    const imageId = integer(header, "i")
    const placement = integer(header, "p")
    if (uploadWidth !== width || uploadHeight !== height || bytes !== width * height * 4 || cols !== expectedCols || rows !== expectedRows) throw new Error("physical tmux producer SHM geometry does not match its terminal viewport")
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(packet.payload) || packet.payload.length % 4 !== 0) throw new Error("physical tmux producer SHM name is not canonical base64")
    const name = Buffer.from(packet.payload, "base64").toString("utf8")
    if (!ownedShmName(name)) throw new Error(`physical tmux producer emitted an unsafe SHM name: ${name}`)
    shmUploads.push({ name, width: uploadWidth, height: uploadHeight, bytes, imageId, placement, cols, rows })
  }
  if (shmUploads.length === 0) throw new PhysicalBlocker("physical tmux producer emitted no SHM upload")
  return { packets: parsed.packets, frames: [], wrappedApcCount: parsed.wrappedApcCount, bareApcCount: parsed.bareApcCount, shmUploads, deletes }
}

type ChildMetadata = {
  version: number
  scene: string
  mode: "direct" | "tmux-shm"
  physical: boolean
  terminal?: { kind: string; caps: Record<string, unknown>; size?: { cols: number; rows: number; pixelWidth: number; pixelHeight: number; cellWidth: number; cellHeight: number }; resolved?: boolean }
  child?: { io: PhysicalChildIo; capture: { rawPath: string; bytes: number; forwardedTo: string }; probe: { inputEvents: number; inputBytes: number; kittyResponses: number } }
  environment?: { TERM: string | null; TERM_PROGRAM: string | null; KITTY_WINDOW_ID: string | null; TMUX: boolean; TMUX_PANE: string | null }
  viewport?: { width: number; height: number }
  viewportSource?: "direct-measured" | "terminal-query"
  rectCount?: number
  readback?: { width: number; height: number; bytes: number; sha256: string } | null
  error?: string
}

type SuccessfulChildMetadata = ChildMetadata & {
  terminal: { kind: string; caps: Record<string, unknown>; size: { cols: number; rows: number; pixelWidth: number; pixelHeight: number; cellWidth: number; cellHeight: number } }
  viewport: { width: number; height: number }
  rectCount: number
  readback: { width: number; height: number; bytes: number; sha256: string } | null
}

type PhysicalRun = {
  metadata: SuccessfulChildMetadata
  rects: ReturnType<typeof parseRectFile>
  stderr: string
  raw: Buffer
  outerRaw?: Buffer
  childRaw?: Buffer
  producerRaw?: Buffer
  packets: PhysicalPacketReport
  producerPackets?: PhysicalPacketReport
}

function readChildMetadata(path: string): SuccessfulChildMetadata {
  const metadata = JSON.parse(readFileSync(path, "utf8")) as ChildMetadata
  if (metadata.scene !== SCENE_ID || metadata.physical !== true) throw new Error("physical child metadata identity is invalid")
  if (metadata.error) throw new Error(formatPhysicalChildDiagnostic(metadata))
  if (!metadata.terminal?.size || !metadata.viewport || typeof metadata.rectCount !== "number" || !Object.hasOwn(metadata, "readback")) {
    throw new Error(`physical child metadata is incomplete: ${formatPhysicalChildDiagnostic(metadata)}`)
  }
  return metadata as SuccessfulChildMetadata
}

export function physicalViewportFromDirect(metadata: Pick<SuccessfulChildMetadata, "viewport" | "terminal">): PhysicalViewport {
  const size = metadata.terminal.size
  const measured = metadata.viewport
  const values = [measured.width, measured.height, size.cols, size.rows, size.pixelWidth, size.pixelHeight, size.cellWidth, size.cellHeight]
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) throw new PhysicalBlocker("direct physical metadata has an invalid measured viewport")
  if (measured.width !== size.pixelWidth || measured.height !== size.pixelHeight) throw new PhysicalBlocker("direct physical metadata viewport does not match terminal measurement")
  return {
    width: measured.width,
    height: measured.height,
    cols: size.cols,
    rows: size.rows,
    cellWidth: size.cellWidth,
    cellHeight: size.cellHeight,
  }
}

export function formatPhysicalChildDiagnostic(metadata: ChildMetadata): string {
  const io = metadata.child?.io
  const probe = metadata.child?.probe
  const terminal = metadata.terminal
  const details = [
    metadata.error ?? "child failed without an error message",
    terminal ? `terminal=${JSON.stringify(terminal)}` : "terminal=unavailable",
    io ? `io=${JSON.stringify(io)}` : "io=unavailable",
    probe ? `probe=${JSON.stringify(probe)}` : "probe=unavailable",
    metadata.environment ? `env=${JSON.stringify(metadata.environment)}` : "env=unavailable",
  ]
  return details.join("; ")
}

function childFailure(path: string): string {
  if (!existsSync(path)) return "child did not write metadata (inspect stderr and inherited TTY)"
  try {
    const metadata = JSON.parse(readFileSync(path, "utf8")) as ChildMetadata
    return metadata.scene === SCENE_ID && metadata.physical === true
      ? formatPhysicalChildDiagnostic(metadata)
      : "child metadata identity is invalid"
  } catch (error) {
    return `child metadata could not be decoded: ${error instanceof Error ? error.message : String(error)}`
  }
}

/** Preserve child evidence even if its session already took down the server. */
export function formatTmuxChildFailure(statusPath: string, metadataPath: string, attachExit: number | null, stderr: string): string {
  const status = existsSync(statusPath) ? readFileSync(statusPath, "utf8").trim() : null
  return `tmux+SHM child failed (status=${status ?? "missing"}, attachExit=${attachExit ?? "missing"}): ${childFailure(metadataPath)}; stderr=${stderr.trim() || "no diagnostic"}`
}

async function runDirectPhysical(fixture: string, out: string, timeoutMs: number): Promise<PhysicalRun> {
  const rawPath = join(out, "direct.raw")
  const childRawPath = join(out, "direct.child.raw")
  const metadataPath = join(out, "direct.metadata.json")
  const rectsPath = join(out, "direct.rects.json")
  const statusPath = join(out, "direct.exit")
  writeFileSync(rawPath, Buffer.alloc(0), { flag: "wx" })
  writeFileSync(childRawPath, Buffer.alloc(0), { flag: "wx" })
  const scriptPath = commandPath("script")
  if (!scriptPath) throw new PhysicalBlocker("script(1) disappeared after physical preflight")
  // Native presentation writes directly to fd 1 and bypasses the JS stdout
  // Proxy. Keep the child attached to the inherited Kitty terminal through a
  // physical PTY, and use script(1)'s transcript as the authoritative wire
  // capture. direct.child.raw remains a JS-level diagnostic only.
  const child = Bun.spawn(physicalCaptureCommand(scriptPath, rawPath, [process.execPath, "--conditions=browser", fixture]), {
    cwd: ROOT,
    env: { ...process.env, TMUX: undefined, VEXART_NATIVE_PRESENTATION: "1", VEXART_FORCE_TRANSMISSION_MODE: "direct" },
    ...PHYSICAL_CHILD_SPAWN,
  })
  const stderrPromise = new Response(child.stderr).text()
  const timer = setTimeout(() => { try { child.kill() } catch {} }, timeoutMs)
  const exitCode = await child.exited
  clearTimeout(timer)
  const stderr = await stderrPromise
  writeFileSync(join(out, "direct.stderr.log"), stderr, { flag: "wx" })
  if (exitCode !== 0 || !existsSync(statusPath)) throw new PhysicalBlocker(`Kitty direct child failed (exit=${exitCode}): ${childFailure(metadataPath)}; stderr=${stderr.trim() || "no diagnostic"}`)
  const metadata = readChildMetadata(metadataPath)
  const rects = parseRectFile(rectsPath)
  const raw = readFileSync(rawPath)
  const packets = inspectPhysicalPackets(raw, "direct", metadata.viewport.width, metadata.viewport.height, metadata.terminal.size.cols, metadata.terminal.size.rows)
  if (packets.frames.length === 0) throw new PhysicalBlocker("Kitty direct capture contained no decoded physical frame")
  return { metadata, rects, stderr, raw, outerRaw: raw, childRaw: readFileSync(childRawPath), packets }
}

function tmuxCommand(socket: string, args: string[], env: NodeJS.ProcessEnv, config = "/dev/null"): string {
  const result = Bun.spawnSync(["tmux", "-S", socket, "-f", config, ...args], { env })
  if (result.exitCode !== 0) {
    throw new PhysicalBlocker(`tmux command failed: ${args.join(" ")}\n${new TextDecoder().decode(result.stderr).trim()}`)
  }
  return new TextDecoder().decode(result.stdout).trim()
}

/** Kill the private session/server without masking a route's child evidence. */
export function bestEffortTmuxCleanup(socket: string, session: string, env: NodeJS.ProcessEnv): void {
  try { tmuxCommand(socket, ["kill-session", "-t", session], env) } catch {}
  try { tmuxCommand(socket, ["kill-server"], env) } catch {}
}

export function physicalTranscriptPanic(path: string): string | null {
  if (!existsSync(path)) return null
  try {
    const size = statSync(path).size
    const bytes = readFileSync(path)
    const text = bytes.subarray(Math.max(0, size - 64 * 1024)).toString("utf8")
    const marker = /(?:thread [^\r\n]* panicked|panicked at|Dimension [A-Z] value [^\r\n]* exceeds the limit of \d+)/i.exec(text)
    if (!marker) return null
    return text.slice(Math.max(0, marker.index - 120), Math.min(text.length, marker.index + 600))
  } catch {
    return null
  }
}

/** Wait for tmux completion while surfacing panic/attach death immediately. */
export async function waitForTmuxCompletion(
  statusPath: string,
  transcriptPath: string,
  attach: { exited: Promise<number> },
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let attachExit: number | null = null
  let attachError: unknown = null
  void attach.exited.then((value) => { attachExit = value }, (error) => { attachError = error })
  while (true) {
    const panic = physicalTranscriptPanic(transcriptPath)
    if (panic) throw new PhysicalBlocker(`physical tmux child panic; transcript=${transcriptPath}; excerpt=${panic}`)
    if (existsSync(statusPath)) return readFileSync(statusPath, "utf8").trim()
    if (attachError) throw new PhysicalBlocker(`physical tmux attach failed before child status: ${String(attachError)}; transcript=${transcriptPath}`)
    if (attachExit !== null) throw new PhysicalBlocker(`physical tmux attach exited ${attachExit} before child status; transcript=${transcriptPath}`)
    if (Date.now() >= deadline) throw new PhysicalBlocker(`physical tmux child did not produce ${statusPath} within ${timeoutMs}ms; transcript=${transcriptPath}`)
    await Bun.sleep(20)
  }
}

/** Wait for the outer script(1) to flush its PTY transcript before cleanup. */
export async function waitForPhysicalExit(
  attach: { exited: Promise<number> },
  timeoutMs: number,
  transcriptPath: string,
): Promise<number> {
  const result = await Promise.race([
    attach.exited.then((exit) => ({ kind: "exit" as const, exit }), (error) => ({ kind: "error" as const, error })),
    Bun.sleep(timeoutMs).then(() => ({ kind: "timeout" as const })),
  ])
  if (result.kind === "timeout") throw new PhysicalBlocker(`physical tmux attach did not exit within ${timeoutMs}ms; transcript=${transcriptPath}`)
  if (result.kind === "error") throw new PhysicalBlocker(`physical tmux attach failed while flushing transcript: ${String(result.error)}; transcript=${transcriptPath}`)
  return result.exit
}

async function runTmuxPhysical(fixture: string, out: string, timeoutMs: number, cols: number, rows: number): Promise<PhysicalRun> {
  const socket = join(out, "tmux.sock")
  const session = `vexart-grid-${process.pid}`
  const rawPath = join(out, "tmux.producer.raw")
  const childRawPath = join(out, "tmux.child.raw")
  const outerPath = join(out, "tmux.outer.raw")
  const metadataPath = join(out, "tmux.metadata.json")
  const rectsPath = join(out, "tmux.rects.json")
  const statusPath = join(out, "tmux.exit")
  const gatePath = join(out, "tmux.start")
  const configPath = join(out, "tmux.conf")
  writeFileSync(rawPath, Buffer.alloc(0), { flag: "wx" })
  writeFileSync(childRawPath, Buffer.alloc(0), { flag: "wx" })
  writeFileSync(configPath, physicalTmuxConfig(), { flag: "wx" })
  const env = { ...process.env, TERM: "xterm-kitty", TERM_PROGRAM: "kitty", COLORTERM: "truecolor", VEXART_NATIVE_PRESENTATION: "1" }
  const childCommand = [
    process.execPath, "--conditions=browser", fixture,
  ]
  const scriptPath = commandPath("script")
  if (!scriptPath) throw new PhysicalBlocker("script(1) disappeared after physical preflight")
  const producerCommand = physicalTmuxProducerCommand(scriptPath, rawPath, childCommand).map(shellQuote).join(" ")
  const producerDonePath = join(out, "tmux.producer.exit")
  const shell = `while [ ! -e ${shellQuote(gatePath)} ]; do sleep 0.02; done; ${producerCommand}; producer_status=$?; printf '%s\\n' "$producer_status" > ${shellQuote(producerDonePath)}; exit "$producer_status"`
  // Starting a server without a session lets tmux exit before the following
  // set-option calls. Load the complete private config while creating the
  // first detached session so the server is durable and the pane receives
  // Kitty/tmux capabilities from its first byte.
  tmuxCommand(socket, ["new-session", "-d", "-s", session, "-x", String(cols), "-y", String(rows), "-c", ROOT, "/bin/sh", "-lc", shell], env, configPath)
  // The generated child path is captured by script(1) inside the pane before
  // tmux consumes its passthrough DCS. Its JS proxy writes to childRawPath;
  // native fd writes are captured separately in producer rawPath.
  const attach = Bun.spawn([scriptPath, ...scriptPtyArgs(outerPath, ["tmux", "-S", socket, "-f", "/dev/null", "attach-session", "-t", session])], {
    cwd: ROOT,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "pipe",
  })
  const stderrPromise = new Response(attach.stderr).text()
  let childStatus: string | null = null
  let producerStatus: string | null = null
  let attachExit: number | null = null
  let attachStderr = ""
  try {
    const deadline = Date.now() + timeoutMs
    writeFileSync(gatePath, "1\n", { flag: "wx" })
    childStatus = await waitForTmuxCompletion(statusPath, outerPath, attach, Math.max(1, deadline - Date.now()))
    producerStatus = await waitForTmuxCompletion(producerDonePath, outerPath, attach, Math.max(1, deadline - Date.now()))
    attachExit = await waitForPhysicalExit(attach, Math.max(1, deadline - Date.now()), outerPath)
    attachStderr = await stderrPromise
  } catch (error) {
    // A panic/timeout can leave script(1) attached even after the pane dies.
    // Kill the PTY wrapper before server cleanup so this command is bounded.
    try { attach.kill() } catch {}
    throw error
  } finally {
    bestEffortTmuxCleanup(socket, session, env)
  }
  const stderr = attachStderr
  writeFileSync(join(out, "tmux.stderr.log"), stderr, { flag: "wx" })
  if (!existsSync(metadataPath) || childStatus !== "0" || producerStatus !== "0") throw new PhysicalBlocker(formatTmuxChildFailure(statusPath, metadataPath, attachExit, stderr))
  if (attachExit !== 0) throw new PhysicalBlocker(`physical tmux attach exited ${attachExit}: ${stderr.trim() || "no diagnostic"}`)
  const metadata = readChildMetadata(metadataPath)
  const rects = parseRectFile(rectsPath)
  const raw = readFileSync(outerPath)
  const producerRaw = readFileSync(rawPath)
  const packets = inspectPhysicalPackets(raw, "tmux", metadata.viewport.width, metadata.viewport.height, cols, rows)
  const producerPackets = inspectProducerShmPackets(producerRaw, metadata.viewport.width, metadata.viewport.height, cols, rows)
  if (packets.shmUploads.length === 0 || producerPackets.shmUploads.length === 0) throw new PhysicalBlocker("physical tmux route emitted no SHM upload")
  return { metadata, rects, stderr, raw, outerRaw: raw, childRaw: readFileSync(childRawPath), producerRaw, packets, producerPackets }
}

function canonicalRects(rects: PhysicalRun["rects"]): string {
  return JSON.stringify(rects.map((rect) => ({ id: rect.id, kind: rect.kind, text: rect.text ?? null, x: rect.x, y: rect.y, width: rect.width, height: rect.height })))
}

function makePhysicalFixture(out: string, mode: "direct" | "tmux-shm", viewport?: PhysicalViewport): string {
  const fixture = join(out, `${mode}.fixture.ts`)
  writeFileSync(fixture, generatedPhysicalFixture({
    scene: SCENE_PATH,
    mode,
    raw: join(out, mode === "direct" ? "direct.child.raw" : "tmux.child.raw"),
    metadata: join(out, mode === "direct" ? "direct.metadata.json" : "tmux.metadata.json"),
    rects: join(out, mode === "direct" ? "direct.rects.json" : "tmux.rects.json"),
    status: join(out, mode === "direct" ? "direct.exit" : "tmux.exit"),
    viewport,
  }), { flag: "wx" })
  return fixture
}

function transcriptEvidence(out: string): { path: string; bytes: number; panic: string | null } | null {
  const path = join(out, "tmux.outer.raw")
  if (!existsSync(path)) return null
  return { path: "tmux.outer.raw", bytes: statSync(path).size, panic: physicalTranscriptPanic(path) }
}

function writeBlocker(out: string, evidence: PhysicalTerminalEvidence, error: string): void {
  writeOwnedJson(join(out, "blocker.json"), { version: 1, status: "BLOCKED", scene: SCENE_ID, physical: true, error, evidence, transcript: transcriptEvidence(out), command: PHYSICAL_COMMAND })
  writeOwnedJson(join(out, "summary.json"), { version: 1, status: "BLOCKED", scene: SCENE_ID, physical: true, command: PHYSICAL_COMMAND, blocker: error })
}

export async function runPhysicalGridParity(options: { out: string; timeoutMs?: number }): Promise<PhysicalGridParityResult> {
  const out = resolve(options.out)
  if (existsSync(out)) throw new Error(`refusing to overwrite existing --out path: ${out}`)
  mkdirSync(out, { recursive: true })
  const evidence = inspectPhysicalTerminal()
  if (!evidence.available) {
    const error = evidence.checks.filter((check) => !check.ok).map((check) => `${check.name}: ${check.detail}`).join("; ")
    writeBlocker(out, evidence, error)
    return { status: "BLOCKED", out, scene: SCENE_ID, evidence, error }
  }

  const timeoutMs = options.timeoutMs ?? 45_000
  const directFixture = makePhysicalFixture(out, "direct")
  try {
    const direct = await runDirectPhysical(directFixture, out, timeoutMs)
    const directViewport = physicalViewportFromDirect(direct.metadata)
    const tmuxFixture = makePhysicalFixture(out, "tmux-shm", directViewport)
    const tmux = await runTmuxPhysical(tmuxFixture, out, timeoutMs, directViewport.cols, directViewport.rows)
    const directFrame = direct.packets.frames.at(-1)!
    const directReadback = direct.metadata.readback
    const tmuxReadback = tmux.metadata.readback
    const comparisons = {
      viewports: JSON.stringify(direct.metadata.viewport) === JSON.stringify(tmux.metadata.viewport),
      rects: canonicalRects(direct.rects) === canonicalRects(tmux.rects),
      directWireVsGpuReadback: directReadback !== null && directFrame.rgba.byteLength === directReadback.bytes && digest(directFrame.rgba) === directReadback.sha256,
      gpuReadbackDirectVsTmux: directReadback !== null && tmuxReadback !== null && directReadback.bytes === tmuxReadback.bytes && directReadback.sha256 === tmuxReadback.sha256,
      shmSizes: tmux.packets.shmUploads.every((upload) => upload.bytes === (tmuxReadback?.bytes ?? -1)),
      producerVsOuterUploadCount: tmux.producerPackets?.shmUploads.length === tmux.packets.shmUploads.length,
      producerVsOuterShmNames: JSON.stringify(tmux.producerPackets?.shmUploads.map((upload) => upload.name)) === JSON.stringify(tmux.packets.shmUploads.map((upload) => upload.name)),
      producerPassthrough: (tmux.producerPackets?.wrappedApcCount ?? 0) > 0 && (tmux.producerPackets?.bareApcCount ?? 0) === 0,
      outerForwardedBareApc: tmux.packets.bareApcCount > 0 && tmux.packets.wrappedApcCount === 0,
      directNotPassthrough: direct.packets.bareApcCount > 0 && direct.packets.wrappedApcCount === 0,
      physicalChildren: direct.metadata.physical && tmux.metadata.physical,
    }
    const report = {
      version: 1, status: Object.values(comparisons).every(Boolean) ? "PASS" : "FAILED", scene: SCENE_ID, physical: true,
      command: PHYSICAL_COMMAND,
      childSpawn: PHYSICAL_CHILD_SPAWN,
      environment: { platform: process.platform, release: process.release, bun: Bun.version, tmux: commandVersion("tmux"), kitty: process.env.TERM_PROGRAM ?? process.env.TERM ?? "unknown" },
      comparisons,
      direct: { viewport: direct.metadata.viewport, viewportSource: direct.metadata.viewportSource ?? "terminal-query", rectCount: direct.rects.length, protocolBytes: direct.raw.byteLength, packetCount: direct.packets.packets.length, frames: direct.packets.frames.map((frame) => ({ width: frame.width, height: frame.height, bytes: frame.rgba.byteLength, sha256: digest(frame.rgba) })), deletes: direct.packets.deletes, readback: directReadback, capture: { transcript: "direct.raw", source: "script(1) PTY", includesNativeFdWrites: true, jsProxyBytes: direct.childRaw?.byteLength ?? 0 } },
      tmux: { viewport: tmux.metadata.viewport, viewportSource: tmux.metadata.viewportSource ?? "terminal-query", rectCount: tmux.rects.length, outer: { protocolBytes: tmux.raw.byteLength, packetCount: tmux.packets.packets.length, shmUploads: tmux.packets.shmUploads, deletes: tmux.packets.deletes, forwardedBareApcCount: tmux.packets.bareApcCount, wrappedApcCount: tmux.packets.wrappedApcCount }, producer: { protocolBytes: tmux.producerRaw?.byteLength ?? 0, childProxyBytes: tmux.childRaw?.byteLength ?? 0, packetCount: tmux.producerPackets?.packets.length ?? 0, shmUploads: tmux.producerPackets?.shmUploads ?? [], deletes: tmux.producerPackets?.deletes ?? [], wrappedApcCount: tmux.producerPackets?.wrappedApcCount ?? 0, bareApcCount: tmux.producerPackets?.bareApcCount ?? 0, capture: "script(1) PTY inside tmux pane" }, readback: tmuxReadback, passthrough: { producerWrappedApcCount: tmux.producerPackets?.wrappedApcCount ?? 0, producerBareApcCount: tmux.producerPackets?.bareApcCount ?? 0, outerForwardedBareApcCount: tmux.packets.bareApcCount }, physicalTerminalConsumption: "inferred from successful native SHM completion and Kitty probe; no synthetic receiver was used" },
      note: "Physical Kitty direct and private tmux+SHM routes only. Offscreen render and synthetic SHM receiver are prohibited by G-037.",
    }
    writeOwnedJson(join(out, "report.json"), report)
    writeOwnedJson(join(out, "summary.json"), { version: 1, status: report.status, scene: SCENE_ID, physical: true, command: PHYSICAL_COMMAND, report: "report.json" })
    if (report.status !== "PASS") return { status: "FAILED", out, scene: SCENE_ID, evidence, error: "physical parity comparison failed", report }
    return { status: "PASS", out, scene: SCENE_ID, evidence, report }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const blocker = error instanceof PhysicalBlocker
    writeOwnedJson(join(out, blocker ? "blocker.json" : "failure.json"), { version: 1, status: blocker ? "BLOCKED" : "FAILED", scene: SCENE_ID, physical: true, error: message, evidence, transcript: transcriptEvidence(out), command: PHYSICAL_COMMAND })
    writeOwnedJson(join(out, "summary.json"), { version: 1, status: blocker ? "BLOCKED" : "FAILED", scene: SCENE_ID, physical: true, command: PHYSICAL_COMMAND, error: message })
    return { status: blocker ? "BLOCKED" : "FAILED", out, scene: SCENE_ID, evidence, error: message }
  }
}

async function main(): Promise<void> {
  const scene = value("scene")
  if (scene !== SCENE_ID) fail(`G-037 requires --scene=${SCENE_ID}`)
  const out = value("out")
  if (!out) fail("--out=<new artifact directory> is required")
  const result = await runPhysicalGridParity({ out: resolve(out), timeoutMs: parsePositive("timeout", value("timeout"), 45_000) })
  if (result.status === "BLOCKED") {
    console.error(`BLOCKED physical terminal gate: ${result.error ?? "hardware unavailable"}`)
    process.exitCode = 2
    return
  }
  if (result.status !== "PASS") {
    console.error(`FAILED physical terminal parity: ${result.error ?? "comparison failed"}`)
    process.exitCode = 1
    return
  }
  console.log(`PASS physical Kitty direct + tmux SHM parity: ${result.out}`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`tmux parity gate failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
