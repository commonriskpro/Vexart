import { onInput, useTerminalDimensions, createTerminal } from "@vexart/engine"
import { mountApp } from "@vexart/app"
import { appendFileSync } from "node:fs"
import { LightcodeOsApp } from "./lightcode/app"

const DRAG_LOG = "/tmp/lightcode-drag.log"

function logDebug(message: string) {
  if (process.env.LIGHTCODE_DRAG_DEBUG !== "1") return
  appendFileSync(DRAG_LOG, `${Date.now()} ${message}\n`)
}

function App(props: { terminal: Parameters<typeof useTerminalDimensions>[0] }) {
  const dims = useTerminalDimensions(props.terminal)
  return <LightcodeOsApp width={dims.width()} height={dims.height()} />
}

async function main() {
  process.env.VEXART_GPU_FORCE_LAYER_STRATEGY = "final-frame"
  const terminal = await createTerminal()
  const cleanup = await mountApp(() => <App terminal={terminal} />, {
    terminal,
    mount: {
      experimental: {
        // Lightcode is currently a monolithic desktop compositor scene: multiple
        // overlapping windows live inside one large layer. The retained native
        // presentation path can leave stale terminal regions when focus/z-order
        // changes across those windows. Until windows become explicit engine
        // layers (or native presentation has per-window invalidation), force a
        // single final-frame presentation for this stress demo: no retained
        // terminal layers, no regional presentation, no native scene dispatch.
        forceLayerRepaint: true,
        nativePresentation: false,
        nativeLayerRegistry: false,
      },
    },
  })

  onInput((event) => {
    if (event.type === "mouse") {
      logDebug(`input action=${event.action} button=${event.button} cell=${event.x},${event.y}`)
    }
    if (event.type !== "key") return
    if (event.key !== "q" && !(event.key === "c" && event.mods.ctrl)) return
    cleanup.destroy()
    terminal.destroy()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
