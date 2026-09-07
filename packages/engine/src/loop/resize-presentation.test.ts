import { expect, test } from "bun:test"
import { join } from "node:path"

type ResizeReport = {
  roots: Array<{ label: string; width: number; height: number }>
}

type KittyFrame = {
  action: "T" | "f"
  width: number
  height: number
  payload: string
}

function parseReport(stderr: string): ResizeReport {
  const line = stderr.split("\n").find((entry) => entry.startsWith("__VEXART_RESIZE_REPORT__"))
  expect(line).toBeDefined()
  return JSON.parse(line!.slice("__VEXART_RESIZE_REPORT__".length)) as ResizeReport
}

function parseFrames(stdout: string): KittyFrame[] {
  const frames: KittyFrame[] = []
  const pattern = /\x1b_Ga=(T|f)([^;]*);([^\x1b]*)\x1b\\/g
  for (const match of stdout.matchAll(pattern)) {
    const width = /(?:^|,)s=(\d+)(?:,|$)/.exec(match[2])
    const height = /(?:^|,)v=(\d+)(?:,|$)/.exec(match[2])
    expect(width).not.toBeNull()
    expect(height).not.toBeNull()
    frames.push({ action: match[1] as KittyFrame["action"], width: Number(width![1]), height: Number(height![1]), payload: match[3] })
  }
  return frames
}

test("native presentation starts a new Kitty canvas after every resize", async () => {
  const fixture = join(import.meta.dir, "resize-presentation-fixture.ts")
  const child = Bun.spawn([process.execPath, "--conditions=browser", fixture], {
    cwd: join(import.meta.dir, "../../../.."),
    env: {
      ...process.env,
      VEXART_GPU_FORCE_LAYER_STRATEGY: "final-frame",
      VEXART_NATIVE_PRESENTATION: "1",
    },
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

  expect(timedOut, "resize fixture exceeded timeout").toBe(false)
  expect(exitCode, stderr).toBe(0)
  const report = parseReport(stderr)
  expect(report.roots).toEqual([
    { label: "initial", width: 200, height: 120 },
    { label: "grow", width: 320, height: 180 },
    { label: "grow-update", width: 320, height: 180 },
    { label: "shrink", width: 120, height: 80 },
    { label: "shrink-update", width: 120, height: 80 },
  ])
  expect(parseFrames(stdout)).toEqual([
    { action: "T", width: 200, height: 120, payload: expect.any(String) },
    { action: "T", width: 320, height: 180, payload: expect.any(String) },
    { action: "f", width: 320, height: 180, payload: expect.any(String) },
    { action: "T", width: 120, height: 80, payload: expect.any(String) },
    { action: "f", width: 120, height: 80, payload: expect.any(String) },
  ])

  const frames = parseFrames(stdout)
  expect(frames[2].payload).not.toBe(frames[1].payload)
  expect(frames[4].payload).not.toBe(frames[3].payload)
})
