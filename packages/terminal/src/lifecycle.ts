/**
 * Terminal lifecycle management.
 *
 * Handles entering and exiting "TGE mode":
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

  // Kitty keyboard protocol
  kittyKbEnter: "\x1b[>1u",
  kittyKbLeave: "\x1b[<u",

  // Clear screen + move cursor home
  clear: "\x1b[2J\x1b[H",

  // Reset all attributes
  reset: "\x1b[0m",
} as const

export type LifecycleState = {
  active: boolean
  rawModeWas: boolean
}

/**
 * Enter TGE mode — prepare the terminal for pixel rendering.
 *
 * Must be called before any rendering. Returns a cleanup function
 * that restores the terminal to its original state.
 */
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

  // Enable Kitty keyboard protocol
  if (caps.kittyKeyboard) {
    write(ESC.kittyKbEnter)
  }

  return state
}

/**
 * Leave TGE mode — restore the terminal to its original state.
 *
 * Reverses everything `enter()` did. Safe to call multiple times.
 */
export function leave(
  stdin: NodeJS.ReadStream,
  write: (data: string) => void,
  caps: Capabilities,
  state: LifecycleState,
) {
  if (!state.active) return
  state.active = false

  // Disable Kitty keyboard protocol
  if (caps.kittyKeyboard) {
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

/**
 * Begin synchronized output frame.
 *
 * Wraps a batch of writes so the terminal holds rendering
 * until the end marker, eliminating tearing.
 */
export function beginSync(write: (data: string) => void) {
  write(ESC.syncBegin)
}

/** End synchronized output frame. */
export function endSync(write: (data: string) => void) {
  write(ESC.syncEnd)
}

/**
 * Install process exit handlers that guarantee terminal cleanup.
 *
 * Catches: exit, SIGINT, SIGTERM, uncaughtException, unhandledRejection.
 * Each handler calls `leave()` exactly once, then re-raises.
 */
export function installExitHandlers(
  stdin: NodeJS.ReadStream,
  write: (data: string) => void,
  caps: Capabilities,
  state: LifecycleState,
): () => void {
  const cleanup = () => leave(stdin, write, caps, state)

  const onExit = () => cleanup()
  const onSignal = () => {
    cleanup()
    process.exit(128 + 2)
  }
  const onError = () => {
    cleanup()
    process.exit(1)
  }

  process.on("exit", onExit)
  process.on("SIGINT", onSignal)
  process.on("SIGTERM", onSignal)
  process.on("uncaughtException", onError)
  process.on("unhandledRejection", onError)

  return () => {
    process.off("exit", onExit)
    process.off("SIGINT", onSignal)
    process.off("SIGTERM", onSignal)
    process.off("uncaughtException", onError)
    process.off("unhandledRejection", onError)
  }
}
