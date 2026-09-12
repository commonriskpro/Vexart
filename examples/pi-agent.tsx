import { onInput } from "@vexart/engine"
import type { AppContext } from "@vexart/app"
import { createApp } from "@vexart/app"
import { onCleanup } from "solid-js"
import { resolve } from "node:path"
import { createPiController } from "./pi-agent/controller"
import { PiApp } from "./pi-agent/ui"
import type { PiControllerOptions } from "./pi-agent/protocol"

export { PiApp } from "./pi-agent/ui"
export type { PiAppProps } from "./pi-agent/ui"
export { createPiController } from "./pi-agent/controller"
export type { PiController, PiControllerOptions, PiSnapshot, SubmitMode } from "./pi-agent/protocol"

function flag(name: string): string | undefined {
  const index = Bun.argv.indexOf(name)
  const value = index >= 0 ? Bun.argv[index + 1] : undefined
  return value && !value.startsWith("-") ? value : undefined
}

const cwd = resolve(flag("--cwd") ?? process.cwd())
const options: PiControllerOptions = {
  cwd,
  ...(flag("--pi") ? { executable: flag("--pi") } : {}),
  ...(flag("--agent-dir") ? { agentDir: flag("--agent-dir") } : {}),
  ...(flag("--session-dir") ? { sessionDir: flag("--session-dir") } : {}),
}

const controller = createPiController(options)

let app: AppContext | undefined
let closing: Promise<void> | undefined
function shutdown() {
  if (closing) return closing
  closing = (async () => {
    try {
      if (controller.snapshot().connected && controller.snapshot().busy) await controller.stop()
    } finally {
      try { await controller.close() } finally { app?.destroy() }
    }
  })()
  void closing.then(() => process.exit(0), (error: unknown) => { console.error("[pi-vexart] shutdown", error); process.exit(1) })
  return closing
}

function Root() {
  const stop = onInput((event) => {
    if (event.type === "key" && event.mods.ctrl && (event.key === "c" || event.key === "d")) void shutdown()
  })
  onCleanup(stop)
  return <PiApp controller={controller} cwd={cwd} />
}

app = await createApp(() => <Root />, {
  // Own asynchronous Pi teardown; createApp's default quit exits synchronously.
  quit: [],
  onError: (error) => { console.error("[pi-vexart]", error); void shutdown() },
  onReady: () => void controller.start().catch((error: unknown) => console.error("[pi-vexart] unable to start Pi RPC", error)),
})
process.once("SIGTERM", shutdown)
process.once("SIGINT", shutdown)
