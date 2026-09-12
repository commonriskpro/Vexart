/**
 * tmux detection and passthrough support.
 *
 * When running inside tmux, Kitty graphics escape sequences must be
 * wrapped in DCS passthrough so the parent terminal receives them.
 *
 * Requirements for graphics passthrough:
 *   - tmux >= 3.4
 *   - `set -g allow-passthrough all` in tmux.conf (required for hidden panes)
 *   - Parent terminal supports Kitty graphics
 *
 * Inside passthrough, every \x1b in the inner payload is doubled
 * to \x1b\x1b so tmux doesn't intercept them.
 */

import { detect, type TerminalKind } from "./detect"

const KITTY_GRAPHICS_PARENTS = new Set<TerminalKind>(["kitty", "ghostty", "wezterm", "herdr"])

/** State returned when checking tmux's live passthrough option. */
export type TmuxPassthroughState = "enabled" | "disabled" | "unknown" | "not-tmux"

/** Internal identity and capability snapshot for the one tmux client. */
export type TmuxClientInfo = {
  tty: string
  termName: string
  termFeatures: string
  passthroughAll: boolean
  rgb: boolean
}

/** Internal bounded result used by the tmux SHM recovery state machine. */
export type TmuxClientState =
  | { kind: "zero" }
  | { kind: "single"; client: TmuxClientInfo }
  | { kind: "multiple"; count: number }
  | { kind: "unknown"; reason: string }

/**
 * Detect if we're inside tmux.
 *
 * Both TMUX and the screen/tmux TERM prefix are required. A terminal launched
 * from a tmux pane can inherit TMUX while restoring its own TERM, and is not
 * itself a tmux pane in that case.
 */
function inTmuxEnv(env: Readonly<Record<string, string | undefined>>): boolean {
  if (!env["TMUX"]) return false
  const term = env["TERM"] ?? ""
  return term.startsWith("screen") || term.startsWith("tmux")
}

/** @public */
export function inTmux(): boolean {
  return inTmuxEnv(process.env)
}

/**
 * Detect the parent terminal behind tmux.
 *
 * Terminal identity variables are inherited by tmux panes in the common case,
 * so use the same detector as the outer process rather than assuming the
 * inner screen/tmux TERM identifies the parent.
 */
export function parentTerminalFromEnv(env: Readonly<Record<string, string | undefined>>): TerminalKind {
  if (!inTmuxEnv(env)) return "unknown"

  // These variables are set by the outer emulator and usually survive into
  // tmux. Do not infer the parent from the pane's screen/tmux TERM.
  if (env["HERDR_ENV"] === "1") return "herdr"
  if (env["GHOSTTY_RESOURCES_DIR"] || env["TERM_PROGRAM"]?.toLowerCase() === "ghostty") return "ghostty"
  if (env["KITTY_PID"] || env["KITTY_WINDOW_ID"] || env["TERM"] === "xterm-kitty" || env["TERM_PROGRAM"]?.toLowerCase() === "kitty") return "kitty"
  if (env["WEZTERM_EXECUTABLE"] || env["WEZTERM_PANE"] || env["TERM_PROGRAM"]?.toLowerCase() === "wezterm") return "wezterm"
  if (env["ITERM_SESSION_ID"] || env["LC_TERMINAL"]?.toLowerCase().includes("iterm") || env["TERM_PROGRAM"]?.toLowerCase() === "iterm.app") return "iterm2"
  if (env["ALACRITTY_LOG"] || env["ALACRITTY_WINDOW_ID"] || env["TERM_PROGRAM"]?.toLowerCase() === "alacritty") return "alacritty"
  if (env["TERMINAL_NAME"] === "contour") return "contour"
  return "unknown"
}

/** @public */
export function parentTerminal(): TerminalKind {
  if (!inTmux()) return detect()
  return parentTerminalFromEnv(process.env)
}

/** Whether a parent terminal is a supported Kitty graphics target. */
export function parentSupportsKittyGraphics(kind: TerminalKind | null): boolean {
  return kind !== null && KITTY_GRAPHICS_PARENTS.has(kind)
}

/** Whether the parent is one of the terminals with the native U=1 path. */
export function parentSupportsKittyPlaceholder(kind: TerminalKind | null): boolean {
  return kind === "kitty" || kind === "ghostty" || kind === "herdr"
}

/** Check the static prerequisites for tmux passthrough wrapping. */
/** @public */
export function passthroughSupported(): boolean {
  return inTmux() && parentSupportsKittyGraphics(parentTerminal())
}

/**
 * Parse the output of `tmux show-options -p -A -v -t <pane> allow-passthrough`.
 *
 * tmux reports the choice as off/on/all (and some versions/tools expose its
 * numeric value), so accept both forms while treating every other value as
 * unknown rather than guessing.
 */
export function parsePassthroughOption(value: string | Uint8Array | null | undefined): TmuxPassthroughState {
  if (value == null) return "unknown"
  const text = typeof value === "string" ? value : Buffer.from(value).toString("utf8")
  switch (text.trim().toLowerCase()) {
    case "on":
    case "all":
    case "1":
    case "2":
      return "enabled"
    case "off":
    case "0":
      return "disabled"
    default:
      return "unknown"
  }
}

/**
 * Read tmux's live passthrough setting without changing it.
 *
 * This intentionally uses a read-only tmux command. A failed query is
 * reported as unknown and is handled conservatively by createTerminal().
 */
export function tmuxPassthroughState(): TmuxPassthroughState {
  if (!inTmux()) return "not-tmux"

  try {
    // -p reads the effective pane option and -A includes inherited
    // window/global values. Without -A, tmux prints a blank value when the
    // option is inherited from the global setting.
    const args = ["tmux", "show-options", "-p", "-A", "-v"]
    const pane = process.env["TMUX_PANE"]
    if (pane) args.push("-t", pane)
    args.push("allow-passthrough")
    const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" })
    if (result.exitCode !== 0) return "unknown"
    return parsePassthroughOption(result.stdout)
  } catch {
    return "unknown"
  }
}

/** Require tmux's `all` mode, which forwards graphics from hidden panes too. */
export function tmuxPassthroughAllowsAll(): boolean {
  if (!inTmux()) return false
  try {
    const args = ["tmux", "show-options", "-p", "-A", "-v"]
    const pane = process.env["TMUX_PANE"]
    if (pane) args.push("-t", pane)
    args.push("allow-passthrough")
    const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" })
    return result.exitCode === 0 && result.stdout.toString().trim().toLowerCase() === "all"
  } catch {
    return false
  }
}

/** Parse one `tmux list-clients -F '#{client_tty}'` output. */
export function attachedClientCount(value: string | Uint8Array): number {
  const text = typeof value === "string" ? value : Buffer.from(value).toString("utf8")
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).length
}

/** Return true only when this tmux server has exactly one attached client. */
export function tmuxHasSingleAttachedClient(): boolean {
  if (!inTmux()) return false
  try {
    const result = Bun.spawnSync(["tmux", "list-clients", "-F", "#{client_tty}"], { stdout: "pipe", stderr: "pipe" })
    if (result.exitCode !== 0) return false
    return attachedClientCount(result.stdout) === 1
  } catch {
    return false
  }
}

/** Parse tmux's comma-separated `client_termfeatures` format. */
export function tmuxClientSupportsRgbFromFeatures(value: string | Uint8Array | null | undefined): boolean {
  if (value == null) return false
  const text = typeof value === "string" ? value : Buffer.from(value).toString("utf8")
  return text.split(",").some((feature) => feature.trim().toUpperCase() === "RGB")
}

function runTmuxReadonly(args: string[], timeoutMs: number): string | null {
  try {
    const result = Bun.spawnSync(["tmux", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: Math.max(1, Math.floor(timeoutMs)),
    })
    if (result.exitCode !== 0) return null
    return result.stdout.toString()
  } catch {
    return null
  }
}

/** Parse one tmux client record without consulting a live tmux server. */
export function parseTmuxClientRecords(value: string | Uint8Array): TmuxClientInfo[] | null {
  const text = typeof value === "string" ? value : Buffer.from(value).toString("utf8")
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const records: TmuxClientInfo[] = []
  for (const line of lines) {
    const fields = line.split("\t")
    if (fields.length !== 3 || fields.some((field) => field.length === 0)) return null
    const [tty, termName, termFeatures] = fields
    records.push({ tty, termName, termFeatures, passthroughAll: false, rgb: tmuxClientSupportsRgbFromFeatures(termFeatures) })
  }
  return records
}

/**
 * Read the attached-client identity and graphics capacity with bounded,
 * read-only tmux commands. This is intentionally not used on normal frames.
 */
export function queryTmuxClientState(timeoutMs = 100): TmuxClientState {
  if (!inTmux()) return { kind: "unknown", reason: "not inside tmux" }
  const clientOutput = runTmuxReadonly([
    "list-clients", "-F", "#{client_tty}\t#{client_termname}\t#{client_termfeatures}",
  ], timeoutMs)
  if (clientOutput === null) return { kind: "unknown", reason: "could not query tmux client list" }
  const records = parseTmuxClientRecords(clientOutput)
  if (records === null) return { kind: "unknown", reason: "could not parse tmux client list" }
  if (records.length === 0) return { kind: "zero" }
  if (records.length > 1) return { kind: "multiple", count: records.length }

  const pane = process.env["TMUX_PANE"]
  const passthrough = runTmuxReadonly([
    "show-options", "-p", "-A", "-v",
    ...(pane ? ["-t", pane] : []),
    "allow-passthrough",
  ], timeoutMs)
  if (passthrough === null) return { kind: "unknown", reason: "could not read tmux passthrough capability" }
  const state = parsePassthroughOption(passthrough)
  if (state === "unknown" || state === "not-tmux") {
    return { kind: "unknown", reason: "could not parse tmux passthrough capability" }
  }
  const client = records[0]
  client.passthroughAll = passthrough.trim().toLowerCase() === "all"
  return { kind: "single", client }
}

/** Check the effective RGB capability of the attached client, read-only. */
export function tmuxClientSupportsRgb(): boolean {
  if (!inTmux()) return false
  const pane = process.env["TMUX_PANE"]
  if (!pane) return false
  try {
    const result = Bun.spawnSync(["tmux", "display-message", "-p", "-t", pane, "#{client_termfeatures}"], { stdout: "pipe", stderr: "pipe" })
    if (result.exitCode !== 0) return false
    return tmuxClientSupportsRgbFromFeatures(result.stdout)
  } catch {
    return false
  }
}

/**
 * Wrap a raw escape sequence for tmux DCS passthrough.
 *
 * Input:  "\x1b_G...;\x1b\\"
 * Output: "\x1bPtmux;\x1b\x1b_G...;\x1b\x1b\\\x1b\\"
 *
 * Every \x1b inside the payload gets doubled.
 */
/** @public */
export function wrapPassthrough(raw: string): string {
  const inner = raw.replaceAll("\x1b", "\x1b\x1b")
  return `\x1bPtmux;${inner}\x1b\\`
}

/**
 * Create a write function that auto-wraps for tmux passthrough.
 *
 * This is for graphics and other payloads intended for the outer terminal.
 * Mode-control ANSI must use the caller's raw writer instead.
 */
/** @public */
export function createWriter(write: (data: string) => void): (data: string) => void {
  if (!passthroughSupported()) return write
  return (data: string) => write(wrapPassthrough(data))
}
