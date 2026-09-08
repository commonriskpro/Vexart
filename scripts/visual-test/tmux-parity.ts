/**
 * Native packet/pixel parity check for Kitty direct and tmux SHM placeholder
 * presentation.
 *
 * This intentionally runs each route in a fresh Bun process. The child owns
 * the GPU context and emits real native Kitty bytes; this process only decodes
 * those bytes and compares them with the child's offscreen readback. It does
 * not prove that a physical terminal displays the result.
 *
 * Usage:
 *   bun --conditions=browser run scripts/visual-test/tmux-parity.ts --out=/tmp/vexart-parity
 *   bun --conditions=browser run scripts/visual-test/tmux-parity.ts --scene=hello --out=/tmp/vexart-hello
 */

import { createHash } from "node:crypto"
import { inflateSync } from "node:zlib"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { tmpdir } from "node:os"
import { createCanvas } from "@napi-rs/canvas"
import { readAndUnlinkTmuxShm, validateRawRgbaFrame } from "./tmux-shm-reader"

type Packet = { header: string; payload: string }
type DecodedFrame = { width: number; height: number; imageId: number; rgba: Uint8Array; action: "T" | "f"; transport: "direct" | "shm" }
type ParsedOutput = {
  packets: Packet[]
  frames: DecodedFrame[]
  wrappedApcCount: number
  bareApcCount: number
  outsideBytes: number
  placeholderChars: number
}
type NativeStats = {
  version: number
  mode: number
  rgbaBytesRead: number
  transport: number
  flags: number
  [key: string]: number
}
type ChildMetadata = {
  version: number
  scene: string
  mode: "direct" | "tmux-shm"
  width: number
  height: number
  pixelBytes: number
  oracle: { status: "passed" | "failed" | "not-provided"; error?: string }
  nativeStats: NativeStats
}
type SceneEntry = { path: string; id: string; artifact: string }

const ROOT = resolve(import.meta.dir, "../..")
const FIXTURE = join(import.meta.dir, "tmux-parity-fixture.ts")
const PREFIX = "__VEXART_TMUX_PARITY__"
const PLACEHOLDER = String.fromCodePoint(0x10eeee)
const CELL_WIDTH = 8
const CELL_HEIGHT = 16

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
    packet: { header: body.slice(0, separator), payload: body.slice(separator + 1) },
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

export function decodeFrames(packets: Packet[], allowShm = false): DecodedFrame[] {
  const frames: DecodedFrame[] = []
  let current: { action: "T" | "f"; width: number; height: number; imageId: number; payload: string } | null = null
  const validateChunk = (payload: string, more: boolean) => {
    if (payload.length > 4096) fail("Kitty upload chunk exceeds the 4096-byte protocol limit")
    if (more && (payload.length === 0 || payload.length % 4 !== 0)) fail("non-final Kitty upload chunk must have a non-zero base64 length divisible by 4")
  }
  const finish = () => {
    if (!current) fail("Kitty continuation ended without an upload")
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(current.payload) || current.payload.length % 4 !== 0) {
      fail("invalid base64 in Kitty upload")
    }
    let rgba: Buffer
    try {
      rgba = inflateSync(Buffer.from(current.payload, "base64"))
    } catch (error) {
      fail(`Kitty zlib payload failed to inflate: ${error instanceof Error ? error.message : String(error)}`)
    }
    const expected = current.width * current.height * 4
    if (rgba.byteLength !== expected) fail(`Kitty frame has ${rgba.byteLength} RGBA bytes; expected ${expected}`)
    frames.push({ action: current.action, width: current.width, height: current.height, imageId: current.imageId, rgba: new Uint8Array(rgba), transport: "direct" })
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
      const m = header.get("m")
      if (m !== "0" && m !== "1") fail("Kitty upload is missing a valid m field")
      validateChunk(packet.payload, m === "1")
      current = {
        action,
        width: integer(header, "s"),
        height: integer(header, "v"),
        imageId: integer(header, "i"),
        payload: packet.payload,
      }
      if (m === "0") finish()
      continue
    }
    if (header.get("m") !== undefined) {
      if (!current || (action !== undefined && action !== "")) fail("Kitty continuation is out of sequence")
      if (header.size !== 1 || (header.get("m") !== "0" && header.get("m") !== "1")) fail("malformed Kitty continuation")
      validateChunk(packet.payload, header.get("m") === "1")
      current.payload += packet.payload
      if (header.get("m") === "0") finish()
      continue
    }
    if (current) fail("Kitty command interleaved before the upload continuation completed")
    if (action === "d" || action === "p" || action === "a") {
      if (packet.payload !== "") fail(`Kitty ${action} command unexpectedly has a payload`)
      continue
    }
    if (action === "t") {
      if (!allowShm) fail("SHM Kitty upload appeared in the direct parity route")
      continue
    }
    fail(`unsupported Kitty action: ${action ?? "missing a"}`)
  }
  if (current) fail("truncated Kitty upload at end of output")
  return frames
}

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
    const next = [dcs, apc].filter((entry) => entry >= 0).sort((a, b) => a - b)[0]
    if (next === undefined) {
      const outside = text.slice(cursor)
      outsideBytes += Buffer.byteLength(outside)
      placeholderChars += outside.split(PLACEHOLDER).length - 1
      break
    }
    const outside = text.slice(cursor, next)
    outsideBytes += Buffer.byteLength(outside)
    placeholderChars += outside.split(PLACEHOLDER).length - 1
    if (tmux && next === dcs) {
      const unwrapped = unwrapTmux(text, next)
      let bodyCursor = 0
      if (unwrapped.body.length === 0) fail("empty tmux passthrough wrapper")
      const parsed = parsePacket(unwrapped.body, bodyCursor)
      packets.push(parsed.packet)
      wrappedApcCount++
      bodyCursor = parsed.end
      if (bodyCursor !== unwrapped.body.length) fail("tmux passthrough wrapper must contain exactly one Kitty APC")
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
  if (text.includes("\x1bP") && !text.includes("\x1bPtmux;")) fail("unexpected DCS in native output")
  const frames = [...decodeFrames(packets, shmFrames.length > 0), ...shmFrames]
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
      if (Number(header.get("c")) !== Math.ceil(width / CELL_WIDTH) || Number(header.get("r")) !== Math.ceil(height / CELL_HEIGHT)) fail("tmux placeholder grid dimensions do not match the synthetic terminal")
    } else if (header.has("U")) fail("direct upload unexpectedly used Unicode placeholders")
  }
  if (tmux && placeholderChars === 0) fail("tmux route emitted no Unicode placeholder grid")
  if (tmux && bareApcCount !== 0) fail("tmux route emitted a bare APC")
  if (!tmux && wrappedApcCount !== 0) fail("direct route emitted a wrapped APC")
  const frameIds = new Set(frames.map((frame) => frame.imageId))
  for (const packet of packets) {
    const header = fields(packet.header)
    if (header.get("a") !== "d") continue
    const imageId = integer(header, "i")
    if (!frameIds.has(imageId)) fail("Kitty delete targeted an image not emitted by this child")
  }
  return { packets, frames, wrappedApcCount, bareApcCount, outsideBytes, placeholderChars }
}

export type StreamOutputResult = {
  shmFrames: DecodedFrame[]
  shmNames: string[]
  shmPlacements: number[]
  shmObjects: Array<{ name: string; mode: number; size: number }>
}

type TmuxImageSession = {
  imageId: number
  placements: number[]
  cells: number
}

/**
 * Incremental outer-output decoder.  SHM must be consumed before the child
 * waits in its native drain, so parsing a complete t=s APC here is not an
 * optimization over parseOutput: it is the lifetime boundary of the test.
 */
/** Internal test helper for fixtures that must consume SHM before child exit. */
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
    // Keep enough bytes to recognize a control introducer split across two
    // stdout reads. Native output is ASCII controls, so seven bytes covers
    // ESC Ptmux; and ESC_G without retaining unbounded diagnostic output.
    return final ? this.text.length : Math.max(this.cursor, this.text.length - 7)
  }

  private scan(final: boolean): void {
    while (this.cursor < this.text.length) {
      const dcs = this.text.indexOf("\x1bPtmux;", this.cursor)
      const apc = this.text.indexOf("\x1b_G", this.cursor)
      const candidates = [dcs, apc].filter((entry) => entry >= 0)
      if (candidates.length === 0) {
        const end = this.outsideEnd(final)
        this.cursor = end
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
    if (end < 0) return null
    return parsePacket(data, start)
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
    if (header.get("f") !== "32" || header.get("U") !== "1" || header.get("q") !== "1") fail("tmux SHM upload is missing native fields")
    if (header.has("o") || header.has("m")) fail("tmux SHM upload unexpectedly used compression or continuation")
    const frameWidth = integer(header, "s")
    const frameHeight = integer(header, "v")
    const imageId = integer(header, "i")
    const placement = integer(header, "p")
    const expected = frameWidth * frameHeight * 4
    if (this.width !== null && this.height !== null && (frameWidth !== this.width || frameHeight !== this.height)) fail("tmux SHM dimensions differ from the child readback")
    if (Number(header.get("S")) !== expected) fail("tmux SHM payload byte count is not raw RGBA")
    if (this.width !== null && this.height !== null && (Number(header.get("c")) !== Math.ceil(this.width / CELL_WIDTH) || Number(header.get("r")) !== Math.ceil(this.height / CELL_HEIGHT))) fail("tmux SHM grid dimensions do not match the synthetic terminal")
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(packet.payload) || packet.payload.length % 4 !== 0) fail("tmux SHM name is not valid base64")
    const name = Buffer.from(packet.payload, "base64").toString("utf8")
    if (!name || Buffer.from(name).toString("base64") !== packet.payload) fail("tmux SHM name has non-canonical base64")
    const read = readAndUnlinkTmuxShm(name, expected)
    this.shmNames.push(name)
    this.shmPlacements.push(placement)
    this.shmObjects.push({ name: read.name, mode: read.mode, size: read.size })
    this.shmFrames.push({ action: "T", width: frameWidth, height: frameHeight, imageId, rgba: validateRawRgbaFrame(read.rgba, frameWidth, frameHeight), transport: "shm" })
    // A placement is part of the native contract even though the parity
    // decoder only needs it to reject zero/omitted placement values.
    void placement
  }
}

function compareBytes(a: Uint8Array, b: Uint8Array): { equal: boolean; mismatches: number } {
  if (a.length !== b.length) return { equal: false, mismatches: Math.max(a.length, b.length) }
  let mismatches = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) mismatches++
  return { equal: mismatches === 0, mismatches }
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function safeArtifactName(id: string): string {
  return id.replaceAll("/", "__").replaceAll("\\", "__").replace(/[^A-Za-z0-9_.-]/g, "_")
}

async function runChild(scene: SceneEntry, mode: "direct" | "tmux-shm", timeoutMs: number, out: string): Promise<{ metadata: ChildMetadata; pixels: Uint8Array; output: ParsedOutput; stdoutBytes: number; stderr: string; exitCode: number; shmNames: string[]; shmPlacements: number[]; shmObjects: StreamOutputResult["shmObjects"]; imageSessions: TmuxImageSession[] }> {
  const temp = mkdtempSync(join(tmpdir(), "vexart-tmux-parity-"))
  const pixelsPath = join(temp, "pixels.rgba")
  const metadataPath = join(temp, "metadata.json")
  const child = Bun.spawn([
    process.execPath,
    "--conditions=browser",
    FIXTURE,
    `--scene=${scene.path}`,
    `--mode=${mode}`,
    `--pixels=${pixelsPath}`,
    `--meta=${metadataPath}`,
  ], {
    cwd: ROOT,
    env: { ...process.env, VEXART_NATIVE_PRESENTATION: "1", VEXART_GPU_FORCE_LAYER_STRATEGY: "final-frame" },
    stdout: "pipe",
    stderr: "pipe",
  })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; child.kill() }, timeoutMs)
  const streamDecoder = new StreamOutputDecoder(mode === "tmux-shm", null, null)
  const stdoutChunks: Uint8Array[] = []
  let stdoutBytes = 0
  let stderr = ""
  let exitCode = -1
  let imageSessions: TmuxImageSession[] = []
  try {
    // Keep decoding stdout while the fixture is alive.  The fixture waits
    // for its final SHM segment to be unlinked before it exits, so consuming
    // only after child.exited would deadlock the production controller.
    const stdoutReader = child.stdout.getReader()
    const stderrPromise = new Response(child.stderr).text()
    while (true) {
      const next = await stdoutReader.read()
      if (next.done) break
      stdoutChunks.push(next.value)
      stdoutBytes += next.value.byteLength
      streamDecoder.feed(next.value)
    }
    stdoutReader.releaseLock()
    stderr = await stderrPromise
    exitCode = await child.exited
    if (timedOut) fail(`${mode} child exceeded ${timeoutMs}ms`)
    if (!existsSync(metadataPath) || !existsSync(pixelsPath)) fail(`${mode} child did not produce both sidecars`)
    const markerLines = stderr.split("\n").filter((line: string) => line.startsWith(PREFIX))
    if (markerLines.length !== 1) fail(`${mode} child emitted ${markerLines.length} metadata markers`)
    let metadata: ChildMetadata
    try {
      metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as ChildMetadata
      const marker = JSON.parse(markerLines[0].slice(PREFIX.length)) as ChildMetadata
      if (JSON.stringify(marker) !== JSON.stringify(metadata)) fail(`${mode} metadata marker differs from sidecar`)
    } catch (error) {
      fail(`${mode} metadata is invalid: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (metadata.version !== 1 || metadata.scene !== scene.path || metadata.mode !== mode) fail(`${mode} metadata identity mismatch`)
    if (exitCode !== 0 && metadata.oracle.status !== "failed") fail(`${mode} child exited ${exitCode}: ${stderr}`)
    if (!Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height) || metadata.width <= 0 || metadata.height <= 0) fail(`${mode} metadata dimensions are invalid`)
    const pixels = new Uint8Array(readFileSync(pixelsPath))
    if (metadata.pixelBytes !== pixels.byteLength || pixels.byteLength !== metadata.width * metadata.height * 4) fail(`${mode} readback sidecar is truncated or tampered`)
    const nativeStats = metadata.nativeStats
    if (!nativeStats || nativeStats.version < 1 || nativeStats.mode !== 1 || nativeStats.rgbaBytesRead !== 0 || (nativeStats.flags & 1) === 0 || (nativeStats.flags & 4) === 0) fail(`${mode} did not report a valid native zero-RGBA presentation`)
    const outputBuffer = Buffer.concat(stdoutChunks.map((chunk) => Buffer.from(chunk)))
    const streamResult = streamDecoder.finish()
    const output = parseOutput(outputBuffer, mode === "tmux-shm", metadata.width, metadata.height, streamResult.shmFrames)
    if (mode === "tmux-shm") {
      if (nativeStats.transport !== 2 || (nativeStats.flags & 2) !== 0 || (nativeStats.flags & 8) !== 0) fail("tmux route did not use native, uncompressed SHM transport")
      if (nativeStats.rawBytes !== metadata.pixelBytes || nativeStats.payloadBytes !== metadata.pixelBytes || nativeStats.compressUs !== 0) fail("tmux SHM stats do not describe a raw RGBA payload")
      if (streamResult.shmFrames.length === 0 || streamResult.shmNames.length !== streamResult.shmFrames.length) fail("tmux route did not consume every SHM frame while the child was alive")
      // A scene may intentionally mount more than one render session (for
      // example, a dark and light theme side-by-side in one fixture). Image
      // IDs must remain stable within each session, while a d=I cleanup marks
      // the legitimate boundary before the next backend allocates an ID.
      const sessions: TmuxImageSession[] = []
      let currentSession: TmuxImageSession | null = null
      let uploadCount = 0
      for (const packet of output.packets) {
        const header = fields(packet.header)
        if (header.get("a") === "T" || header.get("a") === "f") {
          if (header.get("t") !== "s") fail("tmux route emitted a direct/file Kitty upload instead of SHM")
          const imageId = integer(header, "i")
          const placement = integer(header, "p")
          const sessionCells = integer(header, "c") * integer(header, "r")
          uploadCount++
          if (!currentSession) currentSession = { imageId, placements: [], cells: sessionCells }
          if (currentSession.imageId !== imageId) fail("tmux route changed its Kitty image ID within a render session")
          if (currentSession.placements.length > 0 && placement <= currentSession.placements.at(-1)!) fail("tmux route did not advance its virtual placement for each frame")
          currentSession.placements.push(placement)
          continue
        }
        if (header.get("a") === "d") {
          if (header.get("d") !== "I") fail("tmux route emitted a delete outside its owned final-frame image")
          if (!currentSession || integer(header, "i") !== currentSession.imageId) fail("tmux route emitted a delete outside its active image session")
          sessions.push(currentSession)
          currentSession = null
        }
      }
      if (currentSession) fail("tmux route left its owned image session without d=I cleanup")
      if (uploadCount !== streamResult.shmFrames.length || sessions.length === 0 || sessions.some((session) => session.placements.length === 0)) fail("tmux route did not delimit every SHM render session")
      imageSessions = sessions
      const cells = Math.ceil(metadata.width / CELL_WIDTH) * Math.ceil(metadata.height / CELL_HEIGHT)
      if (sessions.some((session) => session.cells !== cells) || output.placeholderChars !== cells * sessions.length) fail(`tmux route emitted ${output.placeholderChars} placeholder cells; expected one ${cells}-cell grid per render session`)
      if (output.bareApcCount !== 0 || output.wrappedApcCount === 0) fail("tmux route did not wrap every Kitty graphic in tmux passthrough")
    }
    return { metadata, pixels, output, stdoutBytes: outputBuffer.byteLength, stderr, exitCode, shmNames: streamResult.shmNames, shmPlacements: streamResult.shmPlacements, shmObjects: streamResult.shmObjects, imageSessions }
  } catch (error) {
    // A malformed packet/SHM object can fail while the child is still blocked
    // in its native drain.  Stop only this private fixture child so no GPU or
    // SHM process survives a decoder failure.
    if (exitCode < 0) {
      try { child.kill() } catch { /* already exited */ }
      try { exitCode = await child.exited } catch { /* preserve decoder failure */ }
    }
    // Preserve enough evidence to diagnose malformed/truncated output after
    // the private child directory is removed. This is intentionally an
    // artifact, not a terminal write or a golden update.
    const failurePath = join(out, `${scene.artifact}.${mode}.failure.json`)
    if (!existsSync(failurePath)) {
      const sidecar = existsSync(metadataPath) ? readFileSync(metadataPath, "utf8") : null
      writeFileSync(failurePath, `${JSON.stringify({
        version: 1,
        scene: scene.id,
        mode,
        error: error instanceof Error ? error.message : String(error),
        exitCode,
        timedOut,
        stdoutBytes,
        stdoutBase64: Buffer.concat(stdoutChunks.map((chunk) => Buffer.from(chunk))).toString("base64"),
        stderr,
        metadata: sidecar,
      }, null, 2)}\n`, { flag: "wx" })
    }
    throw error
  } finally {
    clearTimeout(timer)
    rmSync(temp, { recursive: true, force: true })
  }
}

function sceneFiles(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => join(directory, entry.name))
}

function discoverScenes(filter: string | undefined): SceneEntry[] {
  const directories = [join(ROOT, "scripts/visual-test/scenes"), join(ROOT, "scripts/visual-test/tmux-scenes")]
  const paths = directories.flatMap(sceneFiles).sort((a, b) => a.localeCompare(b))
  const all = paths.map((path) => {
    const group = relative(join(ROOT, "scripts/visual-test"), dirname(path)).split(sep).join("/")
    const id = `${group}/${basename(path, ".tsx")}`
    return { path, id, artifact: safeArtifactName(id) }
  })
  if (!filter) return all
  const normalized = filter.replace(/\.tsx$/, "").replaceAll("\\", "/")
  const matches = all.filter((entry) => entry.id === normalized || basename(entry.path, ".tsx") === normalized)
  if (matches.length === 0) fail(`no scene matches --scene=${filter}`)
  if (matches.length > 1) fail(`--scene=${filter} is ambiguous; use one of ${matches.map((entry) => entry.id).join(", ")}`)
  return matches
}

function writePng(path: string, pixels: Uint8Array, width: number, height: number): void {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext("2d")
  const image = ctx.createImageData(width, height)
  image.data.set(pixels)
  ctx.putImageData(image, 0, 0)
  writeFileSync(path, canvas.toBuffer("image/png"), { flag: "wx" })
}

async function compareScene(scene: SceneEntry, out: string, timeoutMs: number): Promise<void> {
  const direct = await runChild(scene, "direct", timeoutMs, out)
  const tmux = await runChild(scene, "tmux-shm", timeoutMs, out)
  const directFrame = direct.output.frames.at(-1)!
  const tmuxFrame = tmux.output.frames.at(-1)!
  const directReadback = compareBytes(directFrame.rgba, direct.pixels)
  const tmuxReadback = compareBytes(tmuxFrame.rgba, tmux.pixels)
  const routes = compareBytes(directFrame.rgba, tmuxFrame.rgba)
  const width = direct.metadata.width
  const height = direct.metadata.height
  const prefix = join(out, scene.artifact)
  const parityFailed = !directReadback.equal || !tmuxReadback.equal || !routes.equal
  const oracleFailed = direct.metadata.oracle.status === "failed" || tmux.metadata.oracle.status === "failed"
  writePng(`${prefix}.direct.png`, directFrame.rgba, width, height)
  writePng(`${prefix}.tmux.png`, tmuxFrame.rgba, width, height)
  writePng(`${prefix}.offscreen.png`, direct.pixels, width, height)
  const artifact = {
    version: 1,
    scene: scene.id,
    source: scene.path,
    width,
    height,
    status: parityFailed ? "pixel-mismatch" : oracleFailed ? "oracle-failed" : "passed",
    classification: direct.metadata.oracle.status === "not-provided" ? "differential-only" : "differential-plus-oracle",
    oracle: { direct: direct.metadata.oracle, tmux: tmux.metadata.oracle },
    pixelParity: { directVsReadback: directReadback.equal, tmuxVsReadback: tmuxReadback.equal, directVsTmux: routes.equal, sha256: digest(directFrame.rgba) },
    direct: { stdoutBytes: direct.stdoutBytes, packetCount: direct.output.packets.length, frameCount: direct.output.frames.length, outsideBytes: direct.output.outsideBytes, bareApcCount: direct.output.bareApcCount, wrappedApcCount: direct.output.wrappedApcCount, nativeStats: direct.metadata.nativeStats },
    tmux: { stdoutBytes: tmux.stdoutBytes, packetCount: tmux.output.packets.length, frameCount: tmux.output.frames.length, outsideBytes: tmux.output.outsideBytes, bareApcCount: tmux.output.bareApcCount, wrappedApcCount: tmux.output.wrappedApcCount, placeholderChars: tmux.output.placeholderChars, shmNames: tmux.shmNames, shmPlacements: tmux.shmPlacements, shmObjects: tmux.shmObjects, imageSessions: tmux.imageSessions, nativeStats: tmux.metadata.nativeStats },
    note: "Decoded native output plus a synthetic parent SHM receiver; this harness observes no terminal ACK, real tmux forwarding, physical display or FPS.",
  }
  writeFileSync(`${prefix}.json`, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx" })
  if (parityFailed) fail(`${scene.id} pixel parity failed (direct readback ${directReadback.mismatches}, tmux readback ${tmuxReadback.mismatches}, routes ${routes.mismatches})`)
  if (oracleFailed) fail(`${scene.id} scene oracle failed: ${direct.metadata.oracle.error ?? tmux.metadata.oracle.error ?? "unspecified"}`)
}

async function main(): Promise<void> {
  const out = value("out")
  if (!out) fail("--out=<new artifact directory> is required")
  const timeoutMs = parsePositive("timeout", value("timeout"), 30_000)
  const outputDirectory = resolve(out)
  if (existsSync(outputDirectory)) fail(`refusing to overwrite existing --out path: ${outputDirectory}`)
  const scenes = discoverScenes(value("scene"))
  if (scenes.length === 0) fail("no .tsx scenes found")
  mkdirSync(outputDirectory)
  let passed = 0
  let failed = 0
  const summary: Array<{ scene: string; status: "passed" | "failed"; error?: string }> = []
  for (const scene of scenes) {
    process.stderr.write(`tmux parity: ${scene.id}\n`)
    try {
      await compareScene(scene, outputDirectory, timeoutMs)
      passed++
      summary.push({ scene: scene.id, status: "passed" })
      process.stderr.write(`  passed (${passed}/${scenes.length})\n`)
    } catch (error) {
      failed++
      const message = error instanceof Error ? error.message : String(error)
      summary.push({ scene: scene.id, status: "failed", error: message })
      // A scene may have failed before the normal artifact could be written;
      // retain a small owned record rather than silently dropping the reason.
      const failurePath = join(outputDirectory, `${scene.artifact}.failure.json`)
      if (!existsSync(failurePath)) writeFileSync(failurePath, `${JSON.stringify({ version: 1, scene: scene.id, status: "failed", error: message }, null, 2)}\n`, { flag: "wx" })
      process.stderr.write(`  failed: ${message}\n`)
    }
  }
  writeFileSync(join(outputDirectory, "summary.json"), `${JSON.stringify({ version: 1, passed, failed, scenes: summary, note: "Packet/pixel parity only; no physical terminal display or ACK receiver is involved." }, null, 2)}\n`, { flag: "wx" })
  console.log(`tmux parity: ${passed} passed, ${failed} failed; artifacts in ${outputDirectory}`)
  if (failed > 0) fail(`${failed} scene${failed === 1 ? "" : "s"} failed`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`tmux parity failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
