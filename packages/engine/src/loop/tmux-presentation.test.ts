import { expect, test } from "bun:test"
import { deflateSync, inflateSync } from "node:zlib"
import { join } from "node:path"
import { StreamOutputDecoder } from "../../../../scripts/visual-test/tmux-parity"

type Packet = {
  header: string
  payload: string
}

type Frame = {
  width: number
  height: number
  imageId: number
  header: string
  rgba: Uint8Array
}

type ShmFrame = {
  width: number
  height: number
  imageId: number
  rgba: Uint8Array
}

type FixtureReport = {
  tmux: boolean
  lifecycle: { suspend: number; resume: number }
  reports: Array<{
    label: string
    cols: number
    rows: number
    width: number
    height: number
    rgbaBytesRead: number | null
    transport: number | null
    flags: number | null
    compressUs: number | null
    rawBytes: number | null
    payloadBytes: number | null
  }>
}

type ParsedOutput = {
  packets: Packet[]
  frames: Frame[]
  wrappedCount: number
  bareApcCount: number
  outside: string
}

function parsePacket(data: string, start: number): { packet: Packet; end: number } | null {
  const prefix = "\x1b_G"
  if (!data.startsWith(prefix, start)) return null
  const end = data.indexOf("\x1b\\", start + prefix.length)
  if (end < 0) return null
  const body = data.slice(start + prefix.length, end)
  const separator = body.indexOf(";")
  if (separator < 0) return null
  return {
    packet: { header: body.slice(0, separator), payload: body.slice(separator + 1) },
    end: end + 2,
  }
}

function unwrapDcsBody(data: string, start: number): { body: string; end: number } | null {
  const prefix = "\x1bPtmux;"
  if (!data.startsWith(prefix, start)) return null
  let cursor = start + prefix.length
  let end = -1
  while (cursor < data.length - 1) {
    if (data[cursor] !== "\x1b") {
      cursor += 1
      continue
    }
    if (data[cursor + 1] === "\x1b") {
      cursor += 2
      continue
    }
    if (data[cursor + 1] === "\\") {
      end = cursor
      break
    }
    cursor += 1
  }
  if (end < 0) return null

  let body = ""
  for (let index = start + prefix.length; index < end; index += 1) {
    if (data[index] === "\x1b" && data[index + 1] === "\x1b") index += 1
    body += data[index]
  }
  return { body, end: end + 2 }
}

function parseFields(header: string): Map<string, string> {
  const fields = new Map<string, string>()
  for (const field of header.split(",")) {
    const separator = field.indexOf("=")
    if (separator > 0) fields.set(field.slice(0, separator), field.slice(separator + 1))
  }
  return fields
}

function decodeFrames(packets: Packet[], shmFrames: ShmFrame[] = []): Frame[] {
  const frames: Frame[] = []
  let current: { packet: Packet; payload: string } | null = null
  const finish = () => {
    if (!current) return
    const fields = parseFields(current.packet.header)
    const width = Number(fields.get("s"))
    const height = Number(fields.get("v"))
    const imageId = Number(fields.get("i"))
    const rgba = new Uint8Array(inflateSync(Buffer.from(current.payload, "base64")))
    expect(rgba.byteLength).toBe(width * height * 4)
    frames.push({ width, height, imageId, header: current.packet.header, rgba })
    current = null
  }

  for (const packet of packets.filter((entry) => parseFields(entry.header).get("t") !== "s")) {
    const fields = parseFields(packet.header)
    if (fields.get("a") === "T" || fields.get("a") === "f") {
      finish()
      current = { packet, payload: packet.payload }
      if (fields.get("m") !== "1") finish()
      continue
    }
    if (current && fields.get("m") !== undefined) {
      current.payload += packet.payload
      if (fields.get("m") === "0") finish()
    }
  }
  finish()
  const shmPackets = packets.filter((entry) => parseFields(entry.header).get("t") === "s")
  expect(shmPackets.length).toBe(shmFrames.length)
  return frames.concat(shmFrames.map((frame, index) => ({ ...frame, header: shmPackets[index].header })))
}

function parseOutput(stdout: string, tmux: boolean, shmFrames: ShmFrame[] = []): ParsedOutput {
  const packets: Packet[] = []
  let wrappedCount = 0
  let bareApcCount = 0
  let outside = ""
  let cursor = 0

  while (cursor < stdout.length) {
    const tmuxStart = stdout.indexOf("\x1bPtmux;", cursor)
    const apcStart = stdout.indexOf("\x1b_G", cursor)
    const next = [tmuxStart, apcStart].filter((value) => value >= 0).sort((a, b) => a - b)[0]
    if (next === undefined) {
      outside += stdout.slice(cursor)
      break
    }
    outside += stdout.slice(cursor, next)

    if (tmux && next === tmuxStart) {
      const unwrapped = unwrapDcsBody(stdout, next)
      expect(unwrapped, "unterminated tmux passthrough DCS").not.toBeNull()
      // Current native output wraps each APC independently. Accept a single
      // wrapper containing several APCs too, so the parser remains useful
      // against older native builds while still checking every APC payload.
      let bodyCursor = 0
      while (bodyCursor < unwrapped!.body.length) {
        const packet = parsePacket(unwrapped!.body, bodyCursor)
        expect(packet, "tmux DCS must contain Kitty APCs only").not.toBeNull()
        packets.push(packet!.packet)
        wrappedCount += 1
        bodyCursor = packet!.end
      }
      cursor = unwrapped!.end
      continue
    }

    if (tmux) expect(next).toBe(tmuxStart)
    if (!tmux) expect(next).not.toBe(tmuxStart)
    const packet = parsePacket(stdout, next)
    expect(packet, "unterminated Kitty APC").not.toBeNull()
    packets.push(packet!.packet)
    bareApcCount += 1
    cursor = packet!.end
  }

  return { packets, frames: decodeFrames(packets, shmFrames), wrappedCount, bareApcCount, outside }
}

function parseReport(stderr: string): FixtureReport {
  const prefix = "__VEXART_TMUX_PRESENTATION_REPORT__"
  const line = stderr.split("\n").find((entry) => entry.startsWith(prefix))
  expect(line, stderr).toBeDefined()
  return JSON.parse(line!.slice(prefix.length)) as FixtureReport
}

async function runFixture(tmux: boolean): Promise<{ output: ParsedOutput; report: FixtureReport; stdout: string; stderr: string }> {
  const fixture = join(import.meta.dir, "tmux-presentation-fixture.ts")
  const child = Bun.spawn([process.execPath, "--conditions=browser", fixture], {
    cwd: join(import.meta.dir, "../../../.."),
    env: {
      ...process.env,
      VEXART_GPU_FORCE_LAYER_STRATEGY: "final-frame",
      VEXART_NATIVE_PRESENTATION: "1",
      VEXART_FIXTURE_TMUX: tmux ? "1" : "0",
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill()
  }, 30_000)
  const decoder = tmux ? new StreamOutputDecoder(true, null, null) : null
  const stdoutChunks: Uint8Array[] = []
  const stdoutReader = child.stdout.getReader()
  const stderrPromise = new Response(child.stderr).text()
  while (true) {
    const next = await stdoutReader.read()
    if (next.done) break
    stdoutChunks.push(next.value)
    decoder?.feed(next.value)
  }
  stdoutReader.releaseLock()
  const stdout = Buffer.concat(stdoutChunks.map((chunk) => Buffer.from(chunk))).toString("utf8")
  const stderr = await stderrPromise
  const exitCode = await child.exited
  clearTimeout(timeout)
  expect(timedOut, "tmux presentation fixture exceeded timeout").toBe(false)
  expect(exitCode, stderr).toBe(0)
  const streamed = decoder?.finish()
  const output = parseOutput(stdout, tmux, streamed?.shmFrames)
  return { output, report: parseReport(stderr), stdout, stderr }
}

test("tmux SHM frames match normal full-frame pixels and lifecycle updates", async () => {
  const normal = await runFixture(false)
  const tmux = await runFixture(true)

  expect(normal.report.tmux).toBe(false)
  expect(tmux.report.tmux).toBe(true)
  expect(normal.report.lifecycle).toEqual({ suspend: 1, resume: 1 })
  expect(tmux.report.lifecycle).toEqual({ suspend: 1, resume: 1 })
  expect(normal.output.frames.length).toBeGreaterThanOrEqual(3)
  expect(tmux.output.frames.length).toBeGreaterThanOrEqual(normal.output.frames.length)

  for (let index = 0; index < normal.output.frames.length; index += 1) {
    const expected = normal.output.frames[index]
    const actual = tmux.output.frames[index]
    expect({ width: actual.width, height: actual.height }).toEqual({ width: expected.width, height: expected.height })
    expect(actual.rgba).toEqual(expected.rgba)
    expect(actual.header).toContain("a=T")
    expect(actual.header).toContain("U=1")
    const fields = parseFields(actual.header)
    expect(fields.get("t")).toBe("s")
    expect(fields.get("f")).toBe("32")
    expect(fields.get("q")).toBe("1")
    expect(fields.has("o")).toBe(false)
    expect([Number(fields.get("c")), Number(fields.get("r"))]).toEqual(index < 2 ? [40, 13] : [44, 14])
  }

  const imageIds = new Set(tmux.output.frames.map((frame) => frame.imageId))
  expect(imageIds.size).toBe(1)
  const imageId = tmux.output.frames[0].imageId
  expect(imageId).toBeGreaterThan(0x40000000)
  expect(imageId).toBeLessThanOrEqual(0xffffffff)
  expect(tmux.output.frames.at(-1)!.rgba).toEqual(tmux.output.frames.at(-2)!.rgba)
  expect(tmux.output.frames[1].rgba).not.toEqual(tmux.output.frames[0].rgba)
  expect(tmux.output.frames.at(-1)!.width).toBe(352)
  expect(tmux.output.frames.at(-1)!.height).toBe(224)
  const placements = tmux.output.frames.map((frame) => Number(parseFields(frame.header).get("p")))
  expect(placements).toEqual([1, 2, 3, 4])

  // Every graphics APC is individually passthrough wrapped; ANSI cursor/grid
  // bytes remain outside DCS wrappers and are therefore consumed by tmux.
  expect(tmux.output.wrappedCount).toBe(tmux.output.packets.length)
  expect(tmux.output.bareApcCount).toBe(0)
  expect(tmux.output.outside).toContain("\x1b[")
  expect(tmux.stdout).not.toContain("a=f")
  expect(tmux.stdout).not.toContain("a=a")

  const placeholder = String.fromCodePoint(0x10eeee)
  expect(tmux.output.outside.split(placeholder).length - 1).toBe(40 * 13 + 44 * 14 + 44 * 14)

  expect(tmux.report.reports.length).toBe(4)
  expect(tmux.report.reports.every((entry) => entry.rgbaBytesRead === 0)).toBe(true)
  expect(tmux.report.reports.every((entry) => entry.transport === 2 && (entry.flags! & 1) !== 0 && (entry.flags! & 4) !== 0 && (entry.flags! & 2) === 0 && (entry.flags! & 8) === 0 && entry.compressUs === 0)).toBe(true)
  expect(tmux.report.reports.every((entry) => entry.rawBytes === 352 * 224 * 4 || entry.rawBytes === 320 * 200 * 4)).toBe(true)
  expect(tmux.report.reports.every((entry) => entry.payloadBytes === entry.rawBytes)).toBe(true)
  expect(tmux.report.reports.map((entry) => [entry.cols, entry.rows])).toEqual([
    [40, 13], [40, 13], [44, 14], [44, 14],
  ])

  const deletes = tmux.output.packets.filter((packet) => parseFields(packet.header).get("d") === "I")
  expect(deletes.length).toBeGreaterThanOrEqual(1)
  expect(deletes.every((packet) => Number(parseFields(packet.header).get("i")) === imageId)).toBe(true)
  expect(tmux.stdout).not.toContain("d=A")
  expect(tmux.stdout).not.toContain("d=J")
})

test("decodes a chunked zlib Kitty upload without losing bytes", () => {
  const rgba = Uint8Array.from({ length: 32 * 32 * 4 }, (_, index) => (index * 73 + 19) & 0xff)
  const encoded = deflateSync(Buffer.from(rgba)).toString("base64")
  const split = Math.max(1, Math.floor(encoded.length / 2))
  const frames = decodeFrames([
    { header: "a=T,f=32,s=32,v=32,i=1073741866,m=1", payload: encoded.slice(0, split) },
    { header: "m=0", payload: encoded.slice(split) },
  ])
  expect(frames).toHaveLength(1)
  expect(frames[0].rgba).toEqual(rgba)
})
