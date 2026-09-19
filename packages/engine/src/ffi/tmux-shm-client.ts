import type { TmuxClientInfo, TmuxClientState } from "../terminal/tmux"
import { inTmux } from "../terminal/tmux"

export type { TmuxClientInfo, TmuxClientState }

/** Check if two tmux client descriptors refer to the same client tty and terminal name. */
export function sameTmuxClient(left: TmuxClientInfo, right: TmuxClientInfo): boolean {
  return left.tty === right.tty && left.termName === right.termName
}

/** Check if a tmux client has passthrough all and RGB enabled. */
export function tmuxClientCanReceiveGraphics(client: TmuxClientInfo): boolean {
  return client.passthroughAll && client.rgb
}

/** Format actionable error from a TmuxClientState. */
export function formatClientStateError(label: string, state: TmuxClientState): Error {
  if (state.kind === "multiple") {
    return new Error(`[vexart] ${label} presentation failed: tmux SHM presentation requires one attached client during recovery (found ${state.count})`)
  }
  if (state.kind === "unknown") {
    return new Error(`[vexart] ${label} presentation failed: could not verify tmux client during recovery: ${state.reason}`)
  }
  return new Error(`[vexart] ${label} presentation failed: tmux SHM presentation cannot recover without the original attached client`)
}

/** Discover current client state, handling exceptions safely. */
export function discoverTmuxClientState(getClientState?: () => TmuxClientState): TmuxClientState {
  if (!getClientState) {
    return { kind: "unknown", reason: "tmux client recovery is unavailable" }
  }
  try {
    return getClientState()
  } catch (error) {
    return { kind: "unknown", reason: String(error) }
  }
}

export type RecoveryValidationResult =
  | { status: "detached" }
  | { status: "recovered"; client: TmuxClientInfo }
  | { status: "failed"; error: Error }

/** Validate tmux client state during recovery polling. */
export function validateClientRecovery(
  state: TmuxClientState,
  expectedClient: TmuxClientInfo | null,
  label: string,
): RecoveryValidationResult {
  if (state.kind === "zero") {
    return { status: "detached" }
  }
  if (state.kind !== "single") {
    return { status: "failed", error: formatClientStateError(label, state) }
  }
  if (expectedClient === null || !sameTmuxClient(expectedClient, state.client)) {
    return {
      status: "failed",
      error: new Error(`[vexart] ${label} presentation failed: tmux SHM presentation client identity changed during recovery; restart Vexart to reprobe the new client`),
    }
  }
  if (!tmuxClientCanReceiveGraphics(state.client) || !tmuxClientCanReceiveGraphics(expectedClient)) {
    return {
      status: "failed",
      error: new Error(`[vexart] ${label} presentation failed: tmux SHM presentation client capability changed during recovery; restart Vexart to reprobe the new client`),
    }
  }
  return { status: "recovered", client: state.client }
}

export type TimeoutValidationResult =
  | { status: "detached" }
  | { status: "failed"; error: Error }

/** Validate client state when a presentation frame times out. */
export function validateClientAtTimeout(
  state: TmuxClientState | null,
  expectedClient: TmuxClientInfo | null,
  label: string,
  timeoutError: Error,
): TimeoutValidationResult {
  if (state?.kind === "zero" && expectedClient !== null && tmuxClientCanReceiveGraphics(expectedClient)) {
    return { status: "detached" }
  }
  if (state && state.kind !== "zero") {
    if (state.kind === "single" && !sameTmuxClient(expectedClient ?? state.client, state.client)) {
      return {
        status: "failed",
        error: new Error(`[vexart] ${label} presentation failed: tmux SHM presentation client identity changed; restart Vexart to reprobe the new client`),
      }
    }
    if (state.kind === "single" && !tmuxClientCanReceiveGraphics(state.client)) {
      return {
        status: "failed",
        error: new Error(`[vexart] ${label} presentation failed: tmux SHM presentation client capability is unavailable`),
      }
    }
    if (state.kind === "single") {
      return { status: "failed", error: timeoutError }
    }
    return { status: "failed", error: formatClientStateError(label, state) }
  }
  return { status: "failed", error: timeoutError }
}

export type TmuxPaneDimensions = {
  cols: number
  rows: number
  windowWidth?: number
  windowHeight?: number
}

/** Query live tmux pane dimensions with bounded execution. */
export function queryTmuxPaneDimensions(paneId?: string, timeoutMs = 100): TmuxPaneDimensions | null {
  if (!inTmux()) return null
  const pane = paneId ?? process.env["TMUX_PANE"]
  const args = ["display-message", "-p"]
  if (pane) args.push("-t", pane)
  args.push("#{pane_width}\t#{pane_height}\t#{window_width}\t#{window_height}")
  try {
    const result = Bun.spawnSync(["tmux", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: Math.max(1, Math.floor(timeoutMs)),
    })
    if (result.exitCode !== 0) return null
    const parts = result.stdout.toString().trim().split("\t")
    if (parts.length < 2) return null
    const cols = parseInt(parts[0], 10)
    const rows = parseInt(parts[1], 10)
    if (Number.isNaN(cols) || Number.isNaN(rows)) return null
    const windowWidth = parts[2] ? parseInt(parts[2], 10) : undefined
    const windowHeight = parts[3] ? parseInt(parts[3], 10) : undefined
    return {
      cols,
      rows,
      windowWidth: Number.isNaN(windowWidth) ? undefined : windowWidth,
      windowHeight: Number.isNaN(windowHeight) ? undefined : windowHeight,
    }
  } catch {
    return null
  }
}

/** Calculate pixel dimensions per terminal cell. */
export function resolveTmuxCellDimensions(
  widthPixels: number,
  heightPixels: number,
  cols: number,
  rows: number,
): { cellWidth: number; cellHeight: number } {
  const safeCols = Math.max(1, cols)
  const safeRows = Math.max(1, rows)
  return {
    cellWidth: widthPixels / safeCols,
    cellHeight: heightPixels / safeRows,
  }
}
