import { createTerminal, onInput, useTerminalDimensions } from "@vexart/engine"
import type { MountOptions } from "@vexart/engine"
import { mountApp } from "@vexart/app"
import { OpenCodeCosmicShellApp } from "./opencode-cosmic-shell/app"

type CleanupHandle = Awaited<ReturnType<typeof mountApp>>

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

function App(props: { terminal: Parameters<typeof useTerminalDimensions>[0] }) {
  const dims = useTerminalDimensions(props.terminal)
  return <OpenCodeCosmicShellApp width={dims.width()} height={dims.height()} />
}

async function main() {
  const terminal = await createTerminal()
  let cleanup: CleanupHandle | null = null
  const destroy = () => {
    cleanup?.destroy()
    terminal.destroy()
  }

  process.once("uncaughtException", (error) => {
    destroy()
    console.error(error)
    process.exit(1)
  })
  process.once("unhandledRejection", (error) => {
    destroy()
    console.error(error)
    process.exit(1)
  })

  try {
    cleanup = await mountApp(() => <App terminal={terminal} />, { terminal, mount: OPEN_CODE_MOUNT_OPTIONS })
  } catch (error) {
    destroy()
    throw error
  }

  onInput((event) => {
    if (event.type !== "key") return
    if (event.key !== "q" && !(event.key === "c" && event.mods.ctrl)) return
    destroy()
    process.exit(0)
  })
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
