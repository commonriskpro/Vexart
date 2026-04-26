/**
 * @vexart/engine — Terminal detection, capabilities, lifecycle, and raw I/O.
 *
 * This is the lowest layer. It talks directly to the terminal:
 * - Detects which terminal emulator is running
 * - Queries capabilities (Kitty graphics, 24-bit color, mouse, keyboard)
 * - Manages lifecycle (alternate screen, raw mode, resize, cleanup)
 * - Provides the write function (handles tmux passthrough transparently)
 *
 * Usage:
 *   const term = await createTerminal()
 *   // term.caps.kittyGraphics → boolean
 *   // term.size → { cols, rows, pixelWidth, pixelHeight, cellWidth, cellHeight }
 *   // term.write(data) → writes to stdout (tmux-wrapped if needed)
 *   // term.destroy() → restores terminal
 */

import { detect, type TerminalKind } from "./detect"
import { appendFileSync } from "node:fs"
import { inTmux, parentTerminal, passthroughSupported, createWriter, wrapPassthrough } from "./tmux"
import { inferCaps, probeKittyGraphics, queryColors, type Capabilities } from "./caps"
import { getSize, queryPixelSize, onResize, type TerminalSize, type ResizeHandler } from "./size"
import { enter, leave, beginSync, endSync, installExitHandlers, type LifecycleState } from "./lifecycle"

const DEBUG_KITTY_PROBE = process.env.TGE_DEBUG_KITTY === "1" || process.env.TGE_DEBUG_KITTY_SHM === "1"
const DEBUG_RESIZE = process.env.TGE_DEBUG_RESIZE === "1"
const RESIZE_DEBUG_LOG = "/tmp/tge-resize.log"

function logTerminalResize(message: string) {
  if (!DEBUG_RESIZE) return
  appendFileSync(RESIZE_DEBUG_LOG, `[terminal:index] ${message}\n`)
}

// ── Types ──

/** @public */
export type Terminal = {
  /** Terminal emulator kind */
  kind: TerminalKind
  /** Resolved capabilities */
  caps: Capabilities
  /** Current terminal size */
  size: TerminalSize
  /** Write to stdout (tmux passthrough-wrapped for Kitty graphics) */
  write: (data: string) => void
  /** Write to stdout WITHOUT tmux wrapping (for ANSI sequences, cursor, SGR) */
  rawWrite: (data: string) => void
  /** Write raw bytes to stdout */
  writeBytes: (data: Uint8Array) => void
  /** Begin synchronized output frame */
  beginSync: () => void
  /** End synchronized output frame */
  endSync: () => void
  /** Subscribe to resize events. Returns unsubscribe. */
  onResize: (handler: ResizeHandler) => () => void
  /** Subscribe to stdin data. Returns unsubscribe. */
  onData: (handler: (data: Buffer) => void) => () => void
  /** Terminal background color (queried), null if unavailable */
  bgColor: [number, number, number] | null
  /** Terminal foreground color (queried), null if unavailable */
  fgColor: [number, number, number] | null
  /** Whether terminal background is dark */
  isDark: boolean
  /** Set the terminal window title via OSC 2 */
  setTitle: (title: string) => void
  /** Write text to system clipboard via OSC 52 */
  writeClipboard: (text: string) => void
  /** Suspend TGE mode — restore terminal for external process ($EDITOR). Call resume() to re-enter. */
  suspend: () => void
  /** Resume TGE mode after suspend — re-enter raw mode, alt screen, mouse, etc. */
  resume: () => void
  /** Destroy the terminal — restore original state, remove handlers */
  destroy: () => void
}

/** @public */
export type TerminalOptions = {
  /** stdin stream (default: process.stdin) */
  stdin?: NodeJS.ReadStream
  /** stdout stream (default: process.stdout) */
  stdout?: NodeJS.WriteStream
  /** Skip active probing (faster init, uses static inference only) */
  skipProbe?: boolean
  /** Skip color query */
  skipColors?: boolean
  /** Probe timeout in ms */
  probeTimeout?: number
}

// ── Factory ──

/**
 * Create and initialize a terminal handle.
 *
 * @public
 */
export async function createTerminal(opts: TerminalOptions = {}): Promise<Terminal> {
  const stdin = opts.stdin ?? process.stdin
  const stdout = opts.stdout ?? process.stdout

  // Step 1 + 2: detect and infer
  const kind = detect()
  const caps = inferCaps(kind)

  // Resolve tmux parent
  if (caps.tmux) {
    caps.parentKind = parentTerminal()
  }

  // Write function — handles tmux passthrough transparently
  const rawWrite = (data: string) => { stdout.write(data) }
  const write = createWriter(rawWrite)

  // Stdin helpers — for probe and query functions
  const addDataHandler = (handler: (data: Buffer) => void) => {
    stdin.on("data", handler)
  }
  const removeDataHandler = (handler: (data: Buffer) => void) => {
    stdin.off("data", handler)
  }

  // We need raw mode temporarily for probing
  const wasRaw = stdin.isRaw ?? false
  if (stdin.isTTY && !stdin.isRaw) {
    stdin.setRawMode(true)
  }

  // Step 3: probe kitty graphics (if not skipped)
  if (!opts.skipProbe && (caps.kittyGraphics || caps.kittyPlaceholder)) {
    const supported = await probeKittyGraphics(
      rawWrite,
      addDataHandler,
      removeDataHandler,
      opts.probeTimeout ?? 2000,
    )
    if (!supported) {
      caps.kittyGraphics = false
      caps.kittyPlaceholder = false
    }
  }

  // Step 3b: probe transmission mode (shm → file → direct)
  // Only for local connections with kitty graphics support
  let transportProbe = { shm: false, file: false }
  if (!opts.skipProbe && caps.kittyGraphics && !caps.tmux && !isRemoteConnection()) {
    const { probeShm, probeFile } = await import("../output/kitty")
    const shmOk = await probeShm(write, addDataHandler, removeDataHandler, opts.probeTimeout ?? 2000)
    transportProbe.shm = shmOk
    const fileOk = await probeFile(write, addDataHandler, removeDataHandler, opts.probeTimeout ?? 2000)
    transportProbe.file = fileOk
    if (shmOk) {
      caps.transmissionMode = "shm"
    } else if (fileOk) {
      caps.transmissionMode = "file"
    }
  }

  const forcedTransmissionMode = process.env.TGE_FORCE_TRANSMISSION_MODE
  const { configureKittyTransportManager, resolveKittyTransportMode } = await import("../output/transport-manager")
  if (forcedTransmissionMode === "direct" || forcedTransmissionMode === "file" || forcedTransmissionMode === "shm") {
    configureKittyTransportManager({
      preferredMode: forcedTransmissionMode,
      probe: transportProbe,
    })
    caps.transmissionMode = resolveKittyTransportMode(forcedTransmissionMode)
  } else {
    configureKittyTransportManager({
      preferredMode: caps.transmissionMode,
      probe: transportProbe,
    })
    caps.transmissionMode = resolveKittyTransportMode(caps.transmissionMode)
  }

  if (DEBUG_KITTY_PROBE) {
    console.error("[tge/terminal] transmission mode decision", {
      kittyGraphics: caps.kittyGraphics,
      kittyPlaceholder: caps.kittyPlaceholder,
      tmux: caps.tmux,
      transmissionMode: caps.transmissionMode,
    })
  }

  // Step 4: query colors
  let bgColor: [number, number, number] | null = null
  let fgColor: [number, number, number] | null = null
  if (!opts.skipColors) {
    const colors = await queryColors(rawWrite, addDataHandler, removeDataHandler, 1000)
    bgColor = colors.bg
    fgColor = colors.fg
  }

  // Step 5: get size + query pixel dimensions
  const baseSize = getSize(stdout)
  const pixelInfo = await queryPixelSize(
    rawWrite,
    addDataHandler,
    removeDataHandler,
    baseSize.cols,
    baseSize.rows,
    1000,
  )

  // Restore raw mode before we enter lifecycle
  if (stdin.isTTY && !wasRaw) {
    stdin.setRawMode(false)
  }

  const size: TerminalSize = {
    cols: baseSize.cols,
    rows: baseSize.rows,
    pixelWidth: pixelInfo.pixelWidth,
    pixelHeight: pixelInfo.pixelHeight,
    cellWidth: pixelInfo.cellWidth,
    cellHeight: pixelInfo.cellHeight,
  }
  const resizeHandlers = new Set<ResizeHandler>()

  // Determine dark/light
  const isDark = bgColor
    ? (0.299 * bgColor[0] + 0.587 * bgColor[1] + 0.114 * bgColor[2]) / 255 < 0.5
    : true // assume dark

  // Step 6: enter TGE mode
  const lifecycleState = enter(stdin, rawWrite, caps)

  // Step 7: install exit handlers
  const removeExitHandlers = installExitHandlers(stdin, rawWrite, caps, lifecycleState)

  // Resize tracking — keep size object updated
  const unsubResize = onResize(stdout, (newSize) => {
    logTerminalResize(`source cols=${newSize.cols} rows=${newSize.rows} pw=${newSize.pixelWidth} ph=${newSize.pixelHeight} cw=${newSize.cellWidth} ch=${newSize.cellHeight}`)
    size.cols = newSize.cols
    size.rows = newSize.rows
    if (newSize.pixelWidth > 0 && newSize.pixelHeight > 0) {
      size.pixelWidth = newSize.pixelWidth
      size.pixelHeight = newSize.pixelHeight
    } else if (size.cellWidth > 0) {
      size.pixelWidth = size.cols * size.cellWidth
      size.pixelHeight = size.rows * size.cellHeight
    }
    if (newSize.cellWidth > 0) size.cellWidth = newSize.cellWidth
    if (newSize.cellHeight > 0) size.cellHeight = newSize.cellHeight
    logTerminalResize(`normalized cols=${size.cols} rows=${size.rows} pw=${size.pixelWidth} ph=${size.pixelHeight} cw=${size.cellWidth} ch=${size.cellHeight} subscribers=${resizeHandlers.size}`)
    for (const handler of resizeHandlers) {
      handler(size)
    }
  })

  return {
    kind,
    caps,
    size,
    write,
    rawWrite,
    writeBytes: (data: Uint8Array) => { stdout.write(data) },
    beginSync: () => beginSync(rawWrite),
    endSync: () => endSync(rawWrite),
    onResize: (handler: ResizeHandler) => {
      resizeHandlers.add(handler)
      logTerminalResize(`subscribe subscribers=${resizeHandlers.size}`)
      return () => {
        resizeHandlers.delete(handler)
        logTerminalResize(`unsubscribe subscribers=${resizeHandlers.size}`)
      }
    },
    onData: (handler: (data: Buffer) => void) => {
      stdin.on("data", handler)
      return () => { stdin.off("data", handler) }
    },
    bgColor,
    fgColor,
    isDark,
    setTitle: (title: string) => { rawWrite(`\x1b]2;${title}\x07`) },
    writeClipboard: (text: string) => {
      const encoded = Buffer.from(text, "utf-8").toString("base64")
      rawWrite(`\x1b]52;c;${encoded}\x07`)
    },
    suspend: () => {
      leave(stdin, rawWrite, caps, lifecycleState)
    },
    resume: () => {
      // Re-enter TGE mode (enter() is safe to call — just re-sends escape sequences)
      const newState = enter(stdin, rawWrite, caps)
      lifecycleState.active = newState.active
    },
    destroy: () => {
      unsubResize()
      removeExitHandlers()
      leave(stdin, rawWrite, caps, lifecycleState)
    },
  }
}

// ── Helpers ──

/**
 * Detect if we're running over a remote connection (SSH).
 * Remote connections cannot use shm or file transmission.
 */
function isRemoteConnection(): boolean {
  return !!(process.env["SSH_CLIENT"] || process.env["SSH_TTY"] || process.env["SSH_CONNECTION"])
}

// ── Re-exports ──

export type { TerminalKind } from "./detect"
export type { Capabilities } from "./caps"
export type { TerminalSize, ResizeHandler } from "./size"

export { detect } from "./detect"
export { inferCaps, probeKittyGraphics, queryColors } from "./caps"
export { getSize, queryPixelSize, onResize } from "./size"
export { enter, leave, beginSync, endSync } from "./lifecycle"
export { inTmux, parentTerminal, passthroughSupported, createWriter, wrapPassthrough } from "./tmux"
