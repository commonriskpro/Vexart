/** Opt-in paid/provider integration check. Uses normal Pi authentication, never copies it.
 * The provider receives only the disposable source below. No user project is exposed.
 * Run explicitly: bun --conditions=browser run scripts/pi-agent-live.tsx <capture-directory>
 */
import assert from "node:assert/strict"
import { mkdtemp, rm, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createCanvas } from "@napi-rs/canvas"
import { focusedId, setFocus } from "@vexart/engine"
import { createPiController } from "../examples/pi-agent/controller"
import { PiApp } from "../examples/pi-agent/ui"
import { buildTimeline, contentText } from "../examples/pi-agent/timeline"
import { renderToBufferAfterInteractions, type RenderToBufferResult } from "../packages/engine/src/testing/render-to-buffer"

const cwd = await mkdtemp(join(tmpdir(), "vexart-pi-live-"))
const output = resolve(process.argv[2] ?? join(cwd, "captures"))
await mkdir(output, { recursive: true })
await Bun.write(join(cwd, "session.ts"), `export async function restoreSession(queue: string[], load: () => Promise<void>, send: (message: string) => void) {
  queue.length = 0
  await load()
  for (const message of queue) send(message)
}
`)
await Bun.write(join(cwd, "session.test.ts"), `import { test, expect } from "bun:test"
import { restoreSession } from "./session"
test("restore preserves pending messages until the session is ready", async () => {
  const queue = ["Keep this message", "And this one"]
  const sent: string[] = []
  let ready = false
  await restoreSession(queue, async () => { ready = true }, message => { expect(ready).toBe(true); sent.push(message) })
  expect(sent).toEqual(["Keep this message", "And this one"])
  expect(queue).toEqual([])
})
`)
const controller = createPiController({ cwd, sessionDir: join(cwd, "sessions"), args: ["--offline", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes"] })
let dispose: (() => void) | undefined
let timeout: ReturnType<typeof setTimeout> | undefined
try {
  await controller.start()
  const selected = controller.snapshot().state?.model
  assert(selected && selected.id !== "unknown", "No configured provider available")
  const events = new Set<string>()
  const finished = new Promise<void>((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("Provider turn did not settle in 120 seconds")), 120000)
    dispose = controller.subscribe(() => {
      const snapshot = controller.snapshot()
      for (const event of snapshot.events) events.add(event.type)
      if (snapshot.error) reject(new Error(snapshot.error))
      if (!events.has("agent_end")) return
      clearTimeout(timeout)
      resolve()
    })
  })
  const width = 780
  const height = 870
  const scene = () => <PiApp controller={controller} cwd={cwd} width={width} height={height} />
  const result = await renderToBufferAfterInteractions(scene, width, height, async (ui) => {
    setFocus("pi-composer")
    assert.equal(focusedId(), "pi-composer")
    const prompt = "Corrige la restauración sin perder mensajes en cola. Lee session.ts y session.test.ts, cambia solo session.ts y ejecuta bun test. No uses internet, subagentes ni otros archivos. Termina con una explicación breve en español."
    for (const char of prompt) await ui.keyPress(char, char)
    await ui.keyPress("enter")
    await finished
    await controller.refresh()
    await controller.command("set_session_name", { name: "Restaurar mensajes en cola" })
    await controller.refresh()
    await ui.frame()
  })
  const snapshot = controller.snapshot()
  if (snapshot.state?.sessionFile) {
    await Bun.write(join(output, "provider-session.jsonl"), Bun.file(snapshot.state.sessionFile))
  }
  assert(events.has("tool_execution_start"), "Provider did not call tools")
  assert(events.has("tool_execution_end"), "Provider tool never finished")
  assert(snapshot.messages.some(message => message.role === "toolResult"), "Missing authoritative tool result")
  const answers = snapshot.messages.filter(message => message.role === "assistant").map(message => contentText(message.content)).filter(Boolean)
  assert(answers.length > 0, "No model answer")
  const test = Bun.spawn(["bun", "test"], { cwd, stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([test.exited, new Response(test.stdout).text(), new Response(test.stderr).text()])
  assert.equal(code, 0, `Provider fix failed independent regression test: ${stdout}${stderr}`)
  const save = async (name: string, result: RenderToBufferResult) => {
    const canvas = createCanvas(width, height)
    const context = canvas.getContext("2d")
    const frame = context.createImageData(width, height)
    frame.data.set(result.pixels)
    context.putImageData(frame, 0, 0)
    await Bun.write(join(output, `${name}.png`), canvas.toBuffer("image/png"))
  }
  await save("provider-conversation", result)
  const work = buildTimeline(snapshot.messages, snapshot.events).find(block => block.kind === "work")
  assert(work, "Real tool activity must yield a work disclosure")
  await save("provider-expanded", await renderToBufferAfterInteractions(scene, width, height, async (ui) => {
    setFocus(`pi-work-${work.id}`)
    assert.equal(focusedId(), `pi-work-${work.id}`)
    await ui.keyPress("enter")
    setFocus("pi-composer")
    await ui.frame()
  }))
  for (const view of ["sessions", "tree", "settings", "commands", "model"]) {
    await save(`provider-${view}`, await renderToBufferAfterInteractions(scene, width, height, async (ui) => {
      if (["sessions", "tree", "settings"].includes(view)) {
        setFocus(`pi-rail-${view}`)
        assert.equal(focusedId(), `pi-rail-${view}`)
        await ui.keyPress("enter")
        await controller.listSessions()
        await ui.frame()
        return
      }
      setFocus("pi-composer")
      for (const char of view === "commands" ? "/" : "/model") await ui.keyPress(char, char)
      if (view === "model") await ui.keyPress("enter")
      await ui.frame()
    }))
  }
  const report = { providerCall: true, provider: selected.provider, model: selected.id, nativeGpu: true, composerKeyboard: true, toolsExecuted: true, independentCodeTest: "passed", finalAnswer: answers.at(-1), events: [...events], screenshot: join(output, "provider-conversation.png") }
  await Bun.write(join(output, "provider-check.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  if (timeout) clearTimeout(timeout)
  dispose?.()
  await controller.command("abort").catch(() => {})
  await controller.close()
  await rm(cwd, { recursive: true, force: true })
}
