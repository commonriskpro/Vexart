import { createApp } from "vexart"
import { ProbeScene, createProbeState } from "./public-consumer"

let state: ReturnType<typeof createProbeState> | undefined
const app = await createApp(() => {
  state ??= createProbeState()
  return <ProbeScene state={state} />
}, {
  quit: [],
  onReady(context) {
    console.log(JSON.stringify({ marker: "packaged-ready", terminal: context.terminal.kind, version: process.env.VEXART_PROBE_VERSION ?? "unknown" }))
    setTimeout(() => {
      context.destroy()
      console.log(JSON.stringify({ marker: "packaged-destroyed", selected: state?.snapshot().selected ?? null }))
      process.exit(0)
    }, 220)
  },
  onError(error) {
    console.error(JSON.stringify({ marker: "packaged-error", error: String(error) }))
    process.exitCode = 1
  },
})

void app
