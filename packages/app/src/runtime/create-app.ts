import type { JSX } from "solid-js"
import { createTerminal, mount, onInput } from "@vexart/engine"
import type { KeyEvent, MountHandle, MountOptions, Terminal } from "@vexart/engine"
import { TerminalContext } from "./terminal-context"

/** @public */
export type CreateAppOptions = {
  /** Keys that trigger app exit. Default: ["ctrl+c"] */
  quit?: string[]
  /** Optional pre-created terminal instance */
  terminal?: Terminal
  /** Engine mount options (maxFps, experimental, etc.) */
  mount?: MountOptions
  /** Called when app is mounted and running */
  onReady?: (ctx: AppContext) => void
  /** Called on unhandled error. Default: console.error + process.exit(1) */
  onError?: (error: Error) => void
}

/** @public */
export type AppContext = {
  /** The terminal instance */
  terminal: Terminal
  /** The mount handle for suspend/resume/destroy */
  handle: MountHandle
  /** Gracefully shut down the app */
  destroy: () => void
}

/** @public */
export async function createApp(
  component: () => JSX.Element,
  options: CreateAppOptions = {},
): Promise<AppContext> {
  const quit = options.quit ?? ["ctrl+c"]
  const mountOpts = options.mount
  const onReady = options.onReady
  const onError = options.onError ?? defaultErrorHandler

  let terminal: Terminal
  try {
    terminal = options.terminal ?? await createTerminal()
  } catch (err) {
    onError(toError(err))
    process.exit(1)
  }

  const quitSet = new Set(quit.map(normalizeKey))
  const WrappedComponent = () => TerminalContext.Provider({
    value: terminal,
    get children() {
      return component()
    },
  })

  let handle: MountHandle
  try {
    handle = mount(WrappedComponent, terminal, mountOpts)
  } catch (err) {
    terminal.destroy()
    onError(toError(err))
    process.exit(1)
  }

  let closed = false
  let stopInput: () => void = () => {}
  const onSigint = () => {
    ctx.destroy()
    process.exit(130)
  }
  const onSigterm = () => {
    ctx.destroy()
    process.exit(143)
  }
  const onSighup = () => {
    ctx.destroy()
    process.exit(129)
  }

  process.prependListener("SIGINT", onSigint)
  process.prependListener("SIGTERM", onSigterm)
  process.prependListener("SIGHUP", onSighup)

  const ctx: AppContext = {
    terminal,
    handle,
    destroy: () => {
      if (closed) return
      closed = true
      process.off("SIGINT", onSigint)
      process.off("SIGTERM", onSigterm)
      process.off("SIGHUP", onSighup)
      stopInput()
      handle.destroy()
      terminal.destroy()
    },
  }

  stopInput = onInput((event) => {
    if (event.type !== "key") return
    const key = normalizeInputKey(event)
    if (!quitSet.has(key)) return
    ctx.destroy()
    process.exit(0)
  })

  onReady?.(ctx)

  return ctx
}

function defaultErrorHandler(error: Error) {
  console.error("[vexart] Fatal error:", error)
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err
  return new Error(String(err))
}

/** Normalize user-facing key spec ("ctrl+c", "q", "escape") to lookup format. */
function normalizeKey(spec: string): string {
  return spec.toLowerCase().replace(/\s+/g, "")
}

/** Normalize an input event to the same format as normalizeKey. */
function normalizeInputKey(event: KeyEvent): string {
  const parts: string[] = []
  if (event.mods.ctrl) parts.push("ctrl")
  if (event.mods.alt) parts.push("alt")
  if (event.mods.shift) parts.push("shift")
  parts.push(event.key.toLowerCase())
  return parts.join("+")
}
