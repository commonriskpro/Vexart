import { onInput, useTerminalDimensions } from "@vexart/engine"
import { createApp, useAppTerminal } from "@vexart/app"
import { onCleanup } from "solid-js"
import { appendFileSync } from "node:fs"
import { LightcodeOsApp } from "./lightcode/app"

const DRAG_LOG = "/tmp/lightcode-drag.log"

function logDebug(message: string) {
  if (process.env.LIGHTCODE_DRAG_DEBUG !== "1") return
  appendFileSync(DRAG_LOG, `${Date.now()} ${message}\n`)
}

function App() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)
  const unsub = onInput((event) => {
    if (event.type !== "mouse") return
    logDebug(`input action=${event.action} button=${event.button} cell=${event.x},${event.y}`)
  })
  onCleanup(unsub)

  return <LightcodeOsApp width={dims.width()} height={dims.height()} />
}

process.env.VEXART_GPU_FORCE_LAYER_STRATEGY = "final-frame"

await createApp(() => <App />, {
  quit: ["q", "ctrl+c"],
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
