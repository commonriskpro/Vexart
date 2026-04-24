/**
 * tmux detection and passthrough support.
 *
 * When running inside tmux, Kitty graphics escape sequences must be
 * wrapped in DCS passthrough so the parent terminal receives them.
 *
 * Requirements for graphics passthrough:
 *   - tmux >= 3.4
 *   - `set -g allow-passthrough on` in tmux.conf
 *   - Parent terminal supports Kitty graphics
 *
 * Inside passthrough, every \x1b in the inner payload is doubled
 * to \x1b\x1b so tmux doesn't intercept them.
 */

import { detect, type TerminalKind } from "./detect"

/** @public */
export function inTmux(): boolean {
  if (!process.env["TMUX"]) return false
  const term = process.env["TERM"] ?? ""
  return term.startsWith("screen") || term.startsWith("tmux")
}

/** @public */
export function parentTerminal(): TerminalKind {
  if (!inTmux()) return detect()

  const env = process.env

  // These env vars survive into tmux from the parent
  if (env["GHOSTTY_RESOURCES_DIR"]) return "ghostty"
  if (env["KITTY_PID"] || env["KITTY_WINDOW_ID"]) return "kitty"
  if (env["WEZTERM_EXECUTABLE"] || env["WEZTERM_PANE"]) return "wezterm"
  if (env["ITERM_SESSION_ID"]) return "iterm2"
  if (env["LC_TERMINAL"]?.toLowerCase().includes("iterm")) return "iterm2"

  return "unknown"
}

/** @public */
export function passthroughSupported(): boolean {
  if (!inTmux()) return false
  return parentTerminal() !== "unknown"
}

/** @public */
export function wrapPassthrough(raw: string): string {
  const inner = raw.replaceAll("\x1b", "\x1b\x1b")
  return `\x1bPtmux;${inner}\x1b\\`
}

/** @public */
export function createWriter(write: (data: string) => void): (data: string) => void {
  if (!passthroughSupported()) return write
  return (data: string) => write(wrapPassthrough(data))
}
