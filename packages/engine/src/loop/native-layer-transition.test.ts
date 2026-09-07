import { expect, test } from "bun:test"
import { join } from "node:path"
import { inflateSync } from "node:zlib"

type KittyPacket = {
  header: string
  payload: string
}

function parsePackets(stdout: string): KittyPacket[] {
  const packets: KittyPacket[] = []
  for (const part of stdout.split("\x1b_G").slice(1)) {
    const end = part.indexOf("\x1b\\")
    if (end < 0) continue
    const body = part.slice(0, end)
    const separator = body.indexOf(";")
    if (separator < 0) continue
    packets.push({ header: body.slice(0, separator), payload: body.slice(separator + 1) })
  }
  return packets
}

async function runFixture(extraEnv: Record<string, string>) {
  const fixture = join(import.meta.dir, "native-layer-transition-fixture.ts")
  const child = Bun.spawn([process.execPath, "--conditions=browser", fixture], {
    cwd: join(import.meta.dir, "../../../.."),
    env: { ...process.env, VEXART_NATIVE_PRESENTATION: "1", ...extraEnv },
    stdout: "pipe",
    stderr: "pipe",
  })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill()
  }, 15_000)
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  clearTimeout(timeout)
  expect(timedOut, "native layer fixture exceeded timeout").toBe(false)
  expect(exitCode, stderr).toBe(0)
  return parsePackets(stdout)
}

test("uses one complete-frame presenter across final and layered strategy changes", async () => {
  const packets = await runFixture({ VEXART_NATIVE_LAYER_INVERSE: "1" })
  const headers = packets.map((packet) => packet.header)
  const layerTransmits = headers.filter((header) => header.includes("s=40,v=40"))
  expect(layerTransmits).toEqual([])

  const frameHeaders = headers.filter((header) => header.includes("s=320,v=200"))
  expect(frameHeaders.length).toBeGreaterThanOrEqual(3)
  expect(new Set(frameHeaders.map((header) => /i=(\d+)/.exec(header)?.[1])).size).toBe(1)
})

test("keeps moved retained content in the exact complete-frame geometry", async () => {
  const packets = await runFixture({ VEXART_NATIVE_LAYER_MOVE_ONLY: "1" })
  const headers = packets.map((packet) => packet.header)
  expect(headers.filter((header) => header.includes("s=40,v=40"))).toEqual([])
  const updates = packets.filter((packet) => packet.header.includes("a=f") && packet.header.includes("s=320,v=200"))
  expect(updates.length).toBeGreaterThan(0)

  const lastUpdate = updates.at(-1)!
  const rgba = inflateSync(Buffer.from(lastUpdate.payload, "base64"))
  const pixel = (x: number, y: number) => Array.from(rgba.slice((y * 320 + x) * 4, (y * 320 + x + 1) * 4))
  // Root padding (21,37) plus the moved 60px spacer places the target at
  // (81,37). The old (41,37) placement is now occupied by the spacer.
  expect(pixel(85, 42)).toEqual([255, 0, 0, 255])
  expect(pixel(45, 42)).not.toEqual([255, 0, 0, 255])
})
