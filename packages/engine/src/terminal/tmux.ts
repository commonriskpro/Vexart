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

/**
 * Detect if we're inside tmux.
 *
 * Checks both TMUX env var AND TERM prefix. When Ghostty is launched
 * from within tmux (e.g., `ghostty -e /bin/zsh`), the child process
 * inherits TMUX from the parent — but TERM will be "xterm-ghostty"
 * (set by Ghostty itself), not "screen-*" or "tmux-*" (set by tmux).
 * Both must match to confirm we're actually inside a tmux session.
 */
export function inTmux(): boolean {
  if (!process.env["TMUX"]) return false
  const term = process.env["TERM"] ?? ""
  return term.startsWith("screen") || term.startsWith("tmux")
}

/**
 * Detect the parent terminal behind tmux.
 *
 * Inside tmux, env vars from the parent terminal are often
 * inherited. We check those to identify the real terminal.
 */
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

/** Check if tmux passthrough can work (known parent + tmux present). */
export function passthroughSupported(): boolean {
  if (!inTmux()) return false
  return parentTerminal() !== "unknown"
}

/**
 * Wrap a raw escape sequence for tmux DCS passthrough.
 *
 * Input:  "\x1b_G...;\x1b\\"
 * Output: "\x1bPtmux;\x1b\x1b_G...;\x1b\x1b\\\x1b\\"
 *
 * Every \x1b inside the payload gets doubled.
 */
export function wrapPassthrough(raw: string): string {
  const inner = raw.replaceAll("\x1b", "\x1b\x1b")
  return `\x1bPtmux;${inner}\x1b\\`
}

/**
 * Create a write function that auto-wraps for tmux passthrough.
 *
 * If we're in tmux with a capable parent, wraps every write.
 * Otherwise returns a plain write-through.
 */
export function createWriter(write: (data: string) => void): (data: string) => void {
  if (!passthroughSupported()) return write
  return (data: string) => write(wrapPassthrough(data))
}
