import { createApp, useAppTerminal } from "@vexart/app"
import { useTerminalDimensions } from "@vexart/engine"
import { StudioApp } from "./studio"
import { MissionControlApp } from "./mission-control"
import { EffectsPlaygroundApp } from "./effects-playground"

const name = Bun.argv[2] ?? "studio"
if (!["studio", "mission", "effects"].includes(name)) {
  console.error("Usage: bun --conditions=browser run examples/demos/main.tsx [studio|mission|effects]")
  process.exit(1)
}

function App() {
  const terminal = useAppTerminal()
  const size = useTerminalDimensions(terminal)
  if (name === "mission") return <MissionControlApp width={size.width()} height={size.height()} />
  if (name === "effects") return <EffectsPlaygroundApp width={size.width()} height={size.height()} copy={text => terminal.writeClipboard(text)} />
  return <StudioApp width={size.width()} height={size.height()} />
}

await createApp(() => <App />, { quit: ["ctrl+c"] })
