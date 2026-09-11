/**
 * Terminal lifecycle management.
 *
 * Handles entering and exiting "Vexart mode":
 *   - Raw mode (no line buffering, no echo)
 *   - Alternate screen buffer (preserves user's scrollback)
 *   - Mouse tracking (SGR extended mode)
 *   - Focus events
 *   - Cursor hiding
 *   - Synchronized output
 *   - Bracketed paste
 *
 * All setup is done in `enter()`, all teardown in `leave()`.
 * `leave()` is also installed as process exit handler to
 * guarantee terminal restoration even on crash/SIGINT.
 */

import type { Capabilities } from "./caps"

/** ANSI/DEC escape sequences for terminal mode control. */
const ESC = {
  // Alternate screen buffer
  altScreenEnter: "\x1b[?1049h",
  altScreenLeave: "\x1b[?1049l",

  // Cursor visibility
  cursorHide: "\x1b[?25l",
  cursorShow: "\x1b[?25h",

  // Mouse tracking — SGR extended mode (1006) with any-event (1003)
  mouseEnter: "\x1b[?1003h\x1b[?1006h",
  mouseLeave: "\x1b[?1003l\x1b[?1006l",

  // Focus events (1004)
  focusEnter: "\x1b[?1004h",
  focusLeave: "\x1b[?1004l",

  // Bracketed paste (2004)
  pasteEnter: "\x1b[?2004h",
  pasteLeave: "\x1b[?2004l",

  // Synchronized output (2026)
  syncBegin: "\x1b[?2026h",
  syncEnd: "\x1b[?2026l",

  // Kitty keyboard protocol (direct terminal). tmux uses its xterm-style
  // extended-key negotiation instead; it does not transparently forward
  // Kitty's CSI >1u mode.
  kittyKbEnter: "\x1b[>1u",
  kittyKbLeave: "\x1b[<u",
  tmuxExtendedKeysEnter: "\x1b[>4;1m",
  tmuxExtendedKeysLeave: "\x1b[>4;0m",

  // Clear screen + move cursor home
  clear: "\x1b[2J\x1b[H",

  // Reset all attributes
  reset: "\x1b[0m",
} as const

/** @public */
export type LifecycleState = {
  active: boolean
  rawModeWas: boolean
}

/** @public */
export type ExitHandlerOptions = {
  manageProcessSignals?: boolean
  signal?: AbortSignal
}

class ProcessSignalHubImpl {
  private handlers = new Set<() => void>()
  private attached = false
  private dispatching = false

  private onExit = () => {
    this.dispatch(0)
  }

  private onSigint = () => {
    this.dispatch(130)
  }

  private onSigterm = () => {
    this.dispatch(143)
  }

  private onSighup = () => {
    this.dispatch(129)
  }

  private onError = (error: unknown) => {
    try {
      const message = error instanceof Error
        ? (error.stack ?? error.message)
        : String(error)
      process.stderr.write(`${message}\n`)
    } catch {
      // Fail-safe: ignore stderr write failure to guarantee terminal restoration
    }
    this.dispatch(1)
  }

  get activeCount(): number {
    return this.handlers.size
  }

  get isAttached(): boolean {
    return this.attached
  }

  register(cleanup: () => void): () => void {
    const prevSize = this.handlers.size
    this.handlers.add(cleanup)
    if (prevSize === 0 && this.handlers.size === 1) {
      this.attach()
    }
    return () => {
      this.unregister(cleanup)
    }
  }

  unregister(cleanup: () => void): void {
    const deleted = this.handlers.delete(cleanup)
    if (deleted && this.handlers.size === 0) {
      this.detach()
    }
  }

  private attach(): void {
    if (this.attached) return
    this.attached = true
    process.on("exit", this.onExit)
    process.on("SIGINT", this.onSigint)
    process.on("SIGTERM", this.onSigterm)
    process.on("SIGHUP", this.onSighup)
    process.on("uncaughtException", this.onError)
    process.on("unhandledRejection", this.onError)
  }

  private detach(): void {
    if (!this.attached) return
    this.attached = false
    process.off("exit", this.onExit)
    process.off("SIGINT", this.onSigint)
    process.off("SIGTERM", this.onSigterm)
    process.off("SIGHUP", this.onSighup)
    process.off("uncaughtException", this.onError)
    process.off("unhandledRejection", this.onError)
  }

  private dispatch(exitCode?: number): void {
    if (this.dispatching) return
    this.dispatching = true

    const snapshot = Array.from(this.handlers)
    this.handlers.clear()
    this.detach()

    for (const handler of snapshot) {
      try {
        handler()
      } catch {
        // Fail-safe: ignore handler errors to guarantee other cleanups run
      }
    }

    if (exitCode !== undefined && exitCode !== 0) {
      process.exit(exitCode)
    }
  }

  resetForTesting(): void {
    this.handlers.clear()
    this.detach()
    this.dispatching = false
  }
}

/** @public */
export const ProcessSignalHub = new ProcessSignalHubImpl()
/** @public */
export type ProcessSignalHub = ProcessSignalHubImpl

/** @public */
export function enter(
  stdin: NodeJS.ReadStream,
  write: (data: string) => void,
  caps: Capabilities,
): LifecycleState {
  const state: LifecycleState = {
    active: true,
    rawModeWas: stdin.isRaw ?? false,
  }

  // Enter raw mode — no line buffering, no echo, byte-by-byte input
  if (stdin.isTTY && !stdin.isRaw) {
    stdin.setRawMode(true)
  }

  // Alternate screen — don't destroy user's scrollback
  write(ESC.altScreenEnter)

  // Hide cursor — we paint pixels, no text cursor
  write(ESC.cursorHide)

  // Clear the alternate screen
  write(ESC.clear)

  // Enable mouse tracking (SGR extended)
  if (caps.mouse) {
    write(ESC.mouseEnter)
  }

  // Enable focus events
  if (caps.focus) {
    write(ESC.focusEnter)
  }

  // Enable bracketed paste
  if (caps.bracketedPaste) {
    write(ESC.pasteEnter)
  }

  // tmux has its own xterm-style extended-key mode. Keep this raw so tmux
  // can negotiate it; only direct terminals use Kitty keyboard mode.
  if (caps.tmux) {
    write(ESC.tmuxExtendedKeysEnter)
  } else if (caps.kittyKeyboard) {
    write(ESC.kittyKbEnter)
  }

  return state
}

/** @public */
export function leave(
  stdin: NodeJS.ReadStream,
  write: (data: string) => void,
  caps: Capabilities,
  state: LifecycleState,
) {
  if (!state.active) return
  state.active = false

  // Disable the keyboard mode negotiated on enter.
  if (caps.tmux) {
    write(ESC.tmuxExtendedKeysLeave)
  } else if (caps.kittyKeyboard) {
    write(ESC.kittyKbLeave)
  }

  // Disable bracketed paste
  if (caps.bracketedPaste) {
    write(ESC.pasteLeave)
  }

  // Disable focus events
  if (caps.focus) {
    write(ESC.focusLeave)
  }

  // Disable mouse tracking
  if (caps.mouse) {
    write(ESC.mouseLeave)
  }

  // Reset attributes
  write(ESC.reset)

  // Show cursor
  write(ESC.cursorShow)

  // Leave alternate screen — restores scrollback
  write(ESC.altScreenLeave)

  // Restore raw mode to original state
  if (stdin.isTTY && !state.rawModeWas) {
    stdin.setRawMode(false)
  }
}

/** @public */
export function beginSync(write: (data: string) => void) {
  write(ESC.syncBegin)
}

/** @public */
export function endSync(write: (data: string) => void) {
  write(ESC.syncEnd)
}

/**
 * Install process exit handlers that guarantee terminal cleanup.
 *
 * Catches: exit, SIGHUP, SIGINT, SIGTERM, uncaughtException, unhandledRejection
 * via the centralized ProcessSignalHub.
 * Each handler invokes the optional transport cleanup, then calls `leave()`
 * exactly once.
 *
 * @public
 */
export function installExitHandlers(
  stdin: NodeJS.ReadStream,
  write: (data: string) => void,
  caps: Capabilities,
  state: LifecycleState,
  beforeLeave?: (() => void) | ExitHandlerOptions,
  options?: ExitHandlerOptions,
): () => void {
  let beforeLeaveFn: (() => void) | undefined
  let resolvedOptions: ExitHandlerOptions | undefined

  if (typeof beforeLeave === "function") {
    beforeLeaveFn = beforeLeave
    resolvedOptions = options
  } else if (beforeLeave && typeof beforeLeave === "object") {
    resolvedOptions = options ? { ...beforeLeave, ...options } : beforeLeave
  } else {
    resolvedOptions = options
  }

  const shouldManageSignals = resolvedOptions?.manageProcessSignals !== false

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    try {
      beforeLeaveFn?.()
    } finally {
      try {
        leave(stdin, write, caps, state)
      } finally {
        if (shouldManageSignals) {
          ProcessSignalHub.unregister(cleanup)
        }
      }
    }
  }

  if (shouldManageSignals) {
    ProcessSignalHub.register(cleanup)
  }

  let onAbort: (() => void) | undefined
  const abortSignal = resolvedOptions?.signal
  if (abortSignal) {
    onAbort = () => {
      cleanup()
    }
    if (abortSignal.aborted) {
      cleanup()
    } else {
      abortSignal.addEventListener("abort", onAbort, { once: true })
    }
  }

  return () => {
    if (onAbort && abortSignal) {
      abortSignal.removeEventListener("abort", onAbort)
    }
    if (shouldManageSignals) {
      ProcessSignalHub.unregister(cleanup)
    }
  }
}

/** @public */
export const setupExitHandlers = installExitHandlers
