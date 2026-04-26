import { useTerminalDimensions } from "@vexart/engine"
import type { MountOptions } from "@vexart/engine"
import { createApp, useAppTerminal } from "@vexart/app"
import { OpenCodeCosmicShellApp } from "./opencode-cosmic-shell/app"

const OPEN_CODE_MOUNT_OPTIONS: MountOptions = {
  maxFps: 120,
  experimental: {
    idleMaxFps: 60,
    interactionMaxFps: 120,
    frameBudgetMs: 8,
    forceLayerRepaint: false,
    nativePresentation: true,
    nativeLayerRegistry: true,
  },
}

function App() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)
  return <OpenCodeCosmicShellApp width={dims.width()} height={dims.height()} />
}

await createApp(() => <App />, {
  quit: ["q", "ctrl+c"],
  mount: OPEN_CODE_MOUNT_OPTIONS,
})
