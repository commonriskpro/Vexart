/** Real Pi RPC + native GPU smoke test. No provider calls or user sessions. */
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createCanvas } from "@napi-rs/canvas"
import { focusedId, setFocus } from "@vexart/engine"
import { createPiController } from "../examples/pi-agent/controller"
import { PiApp } from "../examples/pi-agent/ui"
import {
  renderToBuffer,
  renderToBufferAfterInteractions,
  type RenderToBufferResult,
} from "../packages/engine/src/testing/render-to-buffer"

const root = await mkdtemp(join(tmpdir(), "vexart-pi-visual-"))
const cwd = join(root, "project")
const agentDir = join(root, "agent")
const output = resolve(process.argv[2] ?? join(root, "captures"))
await Promise.all([mkdir(cwd), mkdir(agentDir), mkdir(output, { recursive: true })])
const controller = createPiController({
  cwd,
  agentDir,
  sessionDir: join(agentDir, "sessions"),
  args: ["--offline", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes"],
})
const width = Number(process.argv[3] ?? 1440)
const height = Number(process.argv[4] ?? 1000)
assert(Number.isInteger(width) && width >= 480, "Capture width must be at least 480")
assert(Number.isInteger(height) && height >= 480, "Capture height must be at least 480")

async function save(name: string, result: RenderToBufferResult) {
  assert.equal(result.pixels.length, width * height * 4)
  const canvas = createCanvas(width, height)
  const context = canvas.getContext("2d")
  const frame = context.createImageData(width, height)
  frame.data.set(result.pixels)
  context.putImageData(frame, 0, 0)
  const path = join(output, `${name}.png`)
  await Bun.write(path, canvas.toBuffer("image/png"))
  return path
}

try {
  await controller.start()
  assert.equal(controller.snapshot().connected, true)
  await controller.command("bash", { command: "printf 'VEXART_REAL_PI_RPC_OK\\n'" })
  await controller.refresh()
  assert.match(JSON.stringify(controller.snapshot().messages), /VEXART_REAL_PI_RPC_OK/)
  const scene = () => <PiApp controller={controller} cwd={cwd} width={width} height={height} />
  const paths = [await save("conversation", await renderToBuffer(scene, width, height))]
  const checks: string[] = ["real Pi bash result present in controller state"]
  const composed = await renderToBufferAfterInteractions(scene, width, height, async (ui) => {
    setFocus("pi-composer")
    assert.equal(focusedId(), "pi-composer")
    for (const char of "!printf UI_COMPOSER_RPC_OK") await ui.keyPress(char, char)
    const completed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        stop()
        reject(new Error("Composer did not execute the command through Pi"))
      }, 10000)
      const stop = controller.subscribe(() => {
        if (controller.snapshot().messages.some((message) => message.role === "bashExecution" && message.output === "UI_COMPOSER_RPC_OK")) {
          clearTimeout(timer)
          stop()
          resolve()
        }
      })
    })
    await ui.keyPress("enter")
    await completed
    await ui.frame()
    setFocus("pi-work-work-0")
    assert.equal(focusedId(), "pi-work-work-0")
    await ui.keyPress("enter")
    await ui.frame()
    setFocus("pi-composer")
    await ui.frame()
  })
  paths.push(await save("conversation-expanded", composed))
  checks.push("composer keystrokes executed real Pi bash and opened work disclosure")
  for (const view of ["sessions", "tree", "settings"]) {
    const result = await renderToBufferAfterInteractions(scene, width, height, async (ui) => {
      const id = `pi-rail-${view}`
      setFocus(id)
      assert.equal(focusedId(), id, `Missing focus target ${id}`)
      await ui.keyPress("enter")
      await controller.refresh()
      await ui.frame()
      if (view === "settings") {
        const before = controller.snapshot().state?.autoCompactionEnabled
        assert.equal(typeof before, "boolean")
        setFocus("pi-setting-auto-compaction")
        assert.equal(focusedId(), "pi-setting-auto-compaction")
        const changed = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            stop()
            reject(new Error("UI setting did not update real Pi state"))
          }, 10000)
          const stop = controller.subscribe(() => {
            if (controller.snapshot().state?.autoCompactionEnabled === !before) {
              clearTimeout(timer)
              stop()
              resolve()
            }
          })
        })
        await ui.keyPress("enter")
        await changed
        await ui.frame()
        checks.push("settings keypress changed Pi auto-compaction through RPC")
      }
    })
    paths.push(await save(view, result))
  }
  for (const view of ["commands", "model"]) {
    const result = await renderToBufferAfterInteractions(scene, width, height, async (ui) => {
      setFocus("pi-composer")
      assert.equal(focusedId(), "pi-composer")
      for (const char of view === "commands" ? "/" : "/model") await ui.keyPress(char, char)
      if (view === "model") {
        await ui.keyPress("enter")
        await ui.frame()
        assert.notEqual(focusedId(), "pi-composer", "Model dialog must own focus")
      } else {
        setFocus("pi-command-model")
        assert.equal(focusedId(), "pi-command-model", "Built-in model command must be discoverable")
      }
    })
    paths.push(await save(view, result))
  }
  checks.push("slash suggestions and model dialog receive keyboard focus")
  for (const action of ["enter", "tab", "down", "escape"]) {
    const users = controller.snapshot().messages.filter(message => message.role === "user").length
    const result = await renderToBufferAfterInteractions(scene, width, height, async (ui) => {
      setFocus("pi-composer")
      for (const char of action === "enter" || action === "tab" ? "/m" : "/") await ui.keyPress(char, char)
      if (action === "down") {
        await ui.keyPress("down")
        await ui.keyPress("enter")
        setFocus("pi-session-search")
        assert.equal(focusedId(), "pi-session-search", "Arrow-selected resume must open sessions")
      } else {
        await ui.keyPress(action)
        if (action === "enter") {
          setFocus("pi-model-search")
          assert.equal(focusedId(), "pi-model-search", "Enter must resolve /m to the local model command")
        } else {
          assert.equal(focusedId(), "pi-composer", `${action} must leave the editor focused`)
          if (action === "escape") {
            setFocus("pi-command-model")
            assert.notEqual(focusedId(), "pi-command-model", "Escape must remove the command palette")
          }
        }
      }
      await controller.refresh()
      assert.equal(controller.snapshot().messages.filter(message => message.role === "user").length, users, "Palette navigation must not submit a provider prompt")
      assert.equal(controller.snapshot().error, undefined)
      await ui.frame()
    })
    if (action === "tab") paths.push(await save("commands-tab", result))
    checks.push(`native slash palette ${action} interaction passed without a provider prompt`)
  }
  // Exercise both real stop entry points, not just the controller command.
  for (const action of ["button", "escape"]) {
    await renderToBufferAfterInteractions(scene, width, height, async (ui) => {
      setFocus("pi-composer")
      const marker = `UI_CANCEL_${action.toUpperCase()}`
      const command = `printf ${marker}; sleep 30`
      for (const char of `!${command}`) await ui.keyPress(char, char)
      const started = waitFor(() => controller.snapshot().events.some((event) =>
        event.type === "bash_execution_update" && JSON.stringify(event).includes(marker)), `${action}: Bash did not start`)
      await ui.keyPress("enter")
      await started
      await ui.frame()
      const cancelled = waitFor(() => !controller.snapshot().busy && controller.snapshot().messages.some((message) =>
        message.role === "bashExecution" && message.command === command && message.cancelled === true), `${action}: Bash was not cancelled`)
      if (action === "button") {
        setFocus("pi-abort")
        assert.equal(focusedId(), "pi-abort")
        await ui.keyPress("enter")
      } else {
        setFocus("pi-composer")
        await ui.keyPress("escape")
      }
      await cancelled
      assert.equal(controller.snapshot().busy, false)
    })
    checks.push(`${action} cancelled a real long-running Pi bash command`)
  }
  console.log(JSON.stringify({ providerCall: false, nativeGpu: true, realPiRpc: true, checks, paths }, null, 2))
} finally {
  await controller.close()
  // Captures are the deliverable. Remove only this harness's isolated state.
  await Promise.all([rm(cwd, { recursive: true, force: true }), rm(agentDir, { recursive: true, force: true })])
}

function waitFor(predicate: () => boolean, message: string) {
  if (predicate()) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      stop()
      reject(new Error(message))
    }, 10000)
    const stop = controller.subscribe(() => {
      if (!predicate()) return
      clearTimeout(timer)
      stop()
      resolve()
    })
  })
}
