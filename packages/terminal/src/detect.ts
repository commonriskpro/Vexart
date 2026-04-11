/**
 * Terminal identification.
 *
 * Detects which terminal emulator is running by inspecting
 * environment variables. Each terminal sets specific env vars
 * that uniquely identify it.
 *
 * Detection order matters — more specific checks first.
 */

export type TerminalKind =
  | "ghostty"
  | "kitty"
  | "wezterm"
  | "iterm2"
  | "alacritty"
  | "foot"
  | "contour"
  | "xterm"
  | "unknown"

/** Detect the terminal emulator from environment variables. */
export function detect(): TerminalKind {
  const env = process.env

  // Ghostty sets GHOSTTY_RESOURCES_DIR
  if (env["GHOSTTY_RESOURCES_DIR"]) return "ghostty"

  // Kitty sets KITTY_PID or KITTY_WINDOW_ID
  if (env["KITTY_PID"] || env["KITTY_WINDOW_ID"]) return "kitty"

  // WezTerm sets WEZTERM_EXECUTABLE or WEZTERM_PANE
  if (env["WEZTERM_EXECUTABLE"] || env["WEZTERM_PANE"]) return "wezterm"

  // iTerm2 sets ITERM_SESSION_ID or LC_TERMINAL=iTerm2
  if (env["ITERM_SESSION_ID"]) return "iterm2"
  if (env["LC_TERMINAL"]?.toLowerCase().includes("iterm")) return "iterm2"

  // Alacritty sets ALACRITTY_LOG or ALACRITTY_WINDOW_ID
  if (env["ALACRITTY_LOG"] || env["ALACRITTY_WINDOW_ID"]) return "alacritty"

  // Foot sets TERM=foot or TERM=foot-extra
  if (env["TERM"]?.startsWith("foot")) return "foot"

  // Contour sets TERMINAL_NAME=contour
  if (env["TERMINAL_NAME"] === "contour") return "contour"

  // TERM_PROGRAM can catch some terminals
  const prog = env["TERM_PROGRAM"]?.toLowerCase()
  if (prog === "ghostty") return "ghostty"
  if (prog === "wezterm") return "wezterm"
  if (prog === "iterm.app") return "iterm2"

  // xterm-compatible catch-all
  if (env["TERM"]?.includes("xterm") || env["TERM"]?.includes("256color")) return "xterm"

  return "unknown"
}
