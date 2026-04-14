/**
 * Kitty terminal remote control helpers.
 *
 * Discovers the kitty socket, launches windows, sends inputs,
 * captures screenshots via macOS screencapture + CGWindowID lookup.
 */

import { $ } from "bun"
import { existsSync } from "fs"
import { readdir } from "fs/promises"

// ── Types ──

export type KittyWindow = {
  id: number
  title: string
  cwd: string
  columns: number
  lines: number
  pid: number
}

export type KittyTab = {
  id: number
  title: string
  isActive: boolean
  windows: KittyWindow[]
}

export type KittyOSWindow = {
  id: number
  platformWindowId: number
  isActive: boolean
  isFocused: boolean
  tabs: KittyTab[]
}

// ── Socket discovery ──

/** Find the kitty remote control socket. Pattern: /tmp/kitty-{PID} */
export async function findKittySocket(): Promise<string | null> {
  // 1. Check KITTY_LISTEN_ON env var
  const envSocket = process.env.KITTY_LISTEN_ON
  if (envSocket) {
    const path = envSocket.replace("unix:", "")
    if (existsSync(path)) return path
  }

  // 2. Scan /tmp for kitty-* sockets
  const entries = await readdir("/tmp").catch(() => [])
  const sockets = entries
    .filter(e => e.startsWith("kitty"))
    .map(e => `/tmp/${e}`)
    .filter(p => existsSync(p))

  if (sockets.length === 1) return sockets[0]

  // 3. Multiple sockets — pick the one whose PID is still alive
  for (const sock of sockets) {
    const match = sock.match(/kitty-(\d+)$/)
    if (!match) continue
    const pid = match[1]
    try {
      const result = await $`kill -0 ${pid} 2>/dev/null`.quiet()
      if (result.exitCode === 0) return sock
    } catch {
      // PID not running, stale socket
    }
  }

  // 4. If named /tmp/kitty (no PID suffix)
  if (sockets.some(s => s === "/tmp/kitty")) return "/tmp/kitty"

  return sockets[0] ?? null
}

// ── Remote control commands ──

async function kittyCmd(socket: string, ...args: string[]): Promise<string> {
  const result = await $`kitty @ --to unix:${socket} ${args}`.quiet()
  return result.text()
}

/** List all OS windows, tabs, and windows */
export async function listWindows(socket: string): Promise<KittyOSWindow[]> {
  const raw = await kittyCmd(socket, "ls")
  const data = JSON.parse(raw)
  return data.map((osWin: any) => ({
    id: osWin.id,
    platformWindowId: osWin.platform_window_id,
    isActive: osWin.is_active,
    isFocused: osWin.is_focused,
    tabs: osWin.tabs.map((tab: any) => ({
      id: tab.id,
      title: tab.title,
      isActive: tab.is_active,
      windows: tab.windows.map((win: any) => ({
        id: win.id,
        title: win.title,
        cwd: win.cwd,
        columns: win.columns,
        lines: win.lines,
        pid: win.pid,
      })),
    })),
  }))
}

/** Launch a command in a new kitty tab. Returns the new window ID. */
export async function launchTab(
  socket: string,
  opts: { title: string; cwd: string; cmd: string[]; env?: Record<string, string> }
): Promise<number> {
  const args = ["launch", "--type=tab", `--title=${opts.title}`, `--cwd=${opts.cwd}`]
  if (opts.env) {
    for (const [k, v] of Object.entries(opts.env)) {
      args.push(`--env=${k}=${v}`)
    }
  }
  args.push(...opts.cmd)
  const raw = await kittyCmd(socket, ...args)
  return parseInt(raw.trim(), 10)
}

/** Send text to a kitty window */
export async function sendText(socket: string, windowId: number, text: string): Promise<void> {
  await kittyCmd(socket, "send-text", `--match=id:${windowId}`, text)
}

/** Send a key press to a kitty window */
export async function sendKey(socket: string, windowId: number, key: string): Promise<void> {
  await kittyCmd(socket, "send-key", `--match=id:${windowId}`, key)
}

/** Focus a kitty window */
export async function focusWindow(socket: string, windowId: number): Promise<void> {
  await kittyCmd(socket, "focus-window", `--match=id:${windowId}`)
}

/** Close a kitty window */
export async function closeWindow(socket: string, windowId: number): Promise<void> {
  await kittyCmd(socket, "close-window", `--match=id:${windowId}`)
}

/** Get text content from a kitty window */
export async function getText(socket: string, windowId: number): Promise<string> {
  return kittyCmd(socket, "get-text", `--match=id:${windowId}`)
}

// ── Screenshot via macOS screencapture ──

/**
 * Find the CGWindowID for kitty windows.
 * Uses Swift + CoreGraphics to enumerate windows.
 * The kitty OS window that contains our demo tab is what we screenshot.
 */
export async function findCGWindowId(opts: { title?: string; platformWindowId?: number }): Promise<number | null> {
  // Cache the Swift binary lookup — compile once, reuse
  const swift = `
import CoreGraphics
let windowList = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as! [[String: Any]]
for w in windowList {
    let owner = w[kCGWindowOwnerName as String] as? String ?? ""
    if !owner.lowercased().contains("kitty") { continue }
    let wid = w[kCGWindowNumber as String] as? Int ?? 0
    let name = w[kCGWindowName as String] as? String ?? ""
    let bounds = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let h = bounds["Height"] as? Int ?? 0
    let ww = bounds["Width"] as? Int ?? 0
    if h > 50 && ww > 50 {
        print("\\(wid)|\\(name)|\\(ww)x\\(h)")
    }
}
`
  try {
    const result = await $`swift -e ${swift}`.quiet()
    const lines = result.text().trim().split("\n").filter(Boolean)

    // Parse all visible kitty windows
    const windows = lines.map(line => {
      const parts = line.split("|")
      return { cgId: parseInt(parts[0], 10), name: parts[1] || "", size: parts[2] || "" }
    })

    // 1. Match by title substring
    if (opts.title) {
      const match = windows.find(w => w.name.includes(opts.title!))
      if (match) return match.cgId
    }

    // 2. Prefer windows that look like active kitty (have a title, not empty name)
    const named = windows.filter(w => w.name.length > 0)
    if (named.length > 0) return named[0].cgId

    // 3. Fallback to first visible kitty window
    if (windows.length > 0) return windows[0].cgId
  } catch {
    // Swift not available
  }

  return null
}

/** List all visible kitty CGWindowIDs with their titles (for debugging) */
export async function listCGWindows(): Promise<Array<{ cgId: number; name: string; size: string }>> {
  const swift = `
import CoreGraphics
let windowList = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as! [[String: Any]]
for w in windowList {
    let owner = w[kCGWindowOwnerName as String] as? String ?? ""
    if !owner.lowercased().contains("kitty") { continue }
    let wid = w[kCGWindowNumber as String] as? Int ?? 0
    let name = w[kCGWindowName as String] as? String ?? ""
    let bounds = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let h = bounds["Height"] as? Int ?? 0
    let ww = bounds["Width"] as? Int ?? 0
    if h > 50 && ww > 50 {
        print("\\(wid)|\\(name)|\\(ww)x\\(h)")
    }
}
`
  try {
    const result = await $`swift -e ${swift}`.quiet()
    return result.text().trim().split("\n").filter(Boolean).map(line => {
      const parts = line.split("|")
      return { cgId: parseInt(parts[0], 10), name: parts[1] || "", size: parts[2] || "" }
    })
  } catch {
    return []
  }
}

/** Capture a screenshot of a kitty window. Returns the PNG file path. */
export async function screenshot(
  cgWindowId: number,
  outPath = "/tmp/tge-screenshot.png"
): Promise<string> {
  const result = await $`screencapture -l ${cgWindowId} -o -x ${outPath}`.quiet()
  if (result.exitCode !== 0) {
    throw new Error(`screencapture failed (exit ${result.exitCode})`)
  }
  if (!existsSync(outPath)) {
    throw new Error("screencapture produced no output file")
  }
  return outPath
}

// ── Mouse input via kitty escape sequences ──

/**
 * Send a mouse click at terminal cell coordinates.
 * Kitty uses SGR mouse encoding: ESC[<button;col;row;M (press) / m (release)
 * button: 0=left, 1=middle, 2=right, 32+=motion, 64+=scroll
 */
export async function sendMouseClick(
  socket: string,
  windowId: number,
  col: number,
  row: number,
  button: 0 | 1 | 2 = 0
): Promise<void> {
  // SGR mouse press then release
  const press = `\x1b[<${button};${col};${row}M`
  const release = `\x1b[<${button};${col};${row}m`
  await sendText(socket, windowId, press)
  // Small delay for TGE to process the press
  await Bun.sleep(50)
  await sendText(socket, windowId, release)
}

/**
 * Send a mouse drag from (startCol, startRow) to (endCol, endRow).
 * Generates press → motion events → release.
 */
export async function sendMouseDrag(
  socket: string,
  windowId: number,
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
  button: 0 | 1 | 2 = 0,
  steps = 10
): Promise<void> {
  // Press at start
  await sendText(socket, windowId, `\x1b[<${button};${startCol};${startRow}M`)
  await Bun.sleep(30)

  // Motion events (button + 32 for motion)
  const motionBtn = button + 32
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const col = Math.round(startCol + (endCol - startCol) * t)
    const row = Math.round(startRow + (endRow - startRow) * t)
    await sendText(socket, windowId, `\x1b[<${motionBtn};${col};${row}M`)
    await Bun.sleep(16) // ~60fps
  }

  // Release at end
  await sendText(socket, windowId, `\x1b[<${button};${endCol};${endRow}m`)
}

/** Send mouse scroll events */
export async function sendMouseScroll(
  socket: string,
  windowId: number,
  col: number,
  row: number,
  direction: "up" | "down",
  count = 3
): Promise<void> {
  // SGR scroll: 64 = scroll up, 65 = scroll down
  const btn = direction === "up" ? 64 : 65
  for (let i = 0; i < count; i++) {
    await sendText(socket, windowId, `\x1b[<${btn};${col};${row}M`)
    await Bun.sleep(30)
  }
}
