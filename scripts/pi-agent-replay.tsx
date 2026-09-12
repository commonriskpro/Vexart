/** Re-render a recorded real-provider test session through installed Pi RPC.
 * No provider requests are made. Only a disposable copy of the supplied session
 * is opened; its cwd metadata is relocated so session discovery can find it.
 */
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createCanvas } from "@napi-rs/canvas"
import { focusedId, setFocus } from "@vexart/engine"
import { createPiController } from "../examples/pi-agent/controller"
import { PiApp } from "../examples/pi-agent/ui"
import { buildTimeline } from "../examples/pi-agent/timeline"
import { renderToBufferAfterInteractions } from "../packages/engine/src/testing/render-to-buffer"

assert(process.argv[2] && process.argv[3], "Usage: pi-agent-replay.tsx <recorded-session.jsonl> <output> [width] [height]")
const source = resolve(process.argv[2])
const output = resolve(process.argv[3])
const width = Number(process.argv[4] ?? 780)
const height = Number(process.argv[5] ?? 870)
const root = await mkdtemp(join(tmpdir(), "vexart-pi-replay-"))
const cwd = join(root, "vexart")
const sessionDir = join(root, "sessions")
await Promise.all([mkdir(cwd), mkdir(sessionDir), mkdir(output, { recursive: true })])
const lines = (await Bun.file(source).text()).trim().split("\n")
const header = JSON.parse(lines[0])
assert.equal(header.type, "session")
lines[0] = JSON.stringify({ ...header, cwd })
const sessionPath = join(sessionDir, "recorded-provider.jsonl")
await Bun.write(sessionPath, lines.join("\n") + "\n")
const controller = createPiController({ cwd, sessionDir, args: ["--offline", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes"] })
try {
  await controller.start()
  await controller.command("switch_session", { sessionPath })
  await controller.refresh()
  assert(controller.snapshot().messages.some(message => message.role === "assistant"))
  const work = buildTimeline(controller.snapshot().messages).find(block => block.kind === "work")
  assert(work)
  const scene = () => <PiApp controller={controller} cwd={cwd} width={width} height={height} />
  const paths: string[] = []
  for (const view of ["conversation", "expanded", "sessions", "tree", "settings", "commands", "model"]) {
    const result = await renderToBufferAfterInteractions(scene, width, height, async (ui) => {
      if (view === "expanded") {
        setFocus(`pi-work-${work.id}`)
        assert.equal(focusedId(), `pi-work-${work.id}`)
        await ui.keyPress("enter")
        setFocus("pi-composer")
      } else if (["sessions", "tree", "settings"].includes(view)) {
        setFocus(`pi-rail-${view}`)
        assert.equal(focusedId(), `pi-rail-${view}`)
        await ui.keyPress("enter")
        await controller.listSessions()
      } else {
        setFocus("pi-composer")
        if (view === "commands" || view === "model") {
          for (const char of view === "commands" ? "/" : "/model") await ui.keyPress(char, char)
          if (view === "model") await ui.keyPress("enter")
        }
      }
      await ui.frame()
    })
    const canvas = createCanvas(width, height)
    const context = canvas.getContext("2d")
    const frame = context.createImageData(width, height)
    frame.data.set(result.pixels)
    context.putImageData(frame, 0, 0)
    const path = join(output, `${view}.png`)
    await Bun.write(path, canvas.toBuffer("image/png"))
    paths.push(path)
  }
  console.log(JSON.stringify({ source, providerCall: false, recordedProviderSession: true, nativeGpu: true, width, height, paths }, null, 2))
} finally {
  await controller.close()
  await rm(root, { recursive: true, force: true })
}
