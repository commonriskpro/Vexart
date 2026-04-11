/**
 * @tge/terminal — Terminal detection, capabilities, lifecycle, and raw I/O.
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
import { inTmux, parentTerminal, passthroughSupported, createWriter, wrapPassthrough } from "./tmux"
import { inferCaps, probeKittyGraphics, queryColors, type Capabilities } from "./caps"
import { getSize, queryPixelSize, onResize, type TerminalSize, type ResizeHandler } from "./size"
import { enter, leave, beginSync, endSync, installExitHandlers, type LifecycleState } from "./lifecycle"

// ── Types ──

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
  /** Destroy the terminal — restore original state, remove handlers */
  destroy: () => void
}

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
 * Create and initialize a Terminal.
 *
 * Performs:
 *   1. Detect terminal emulator
 *   2. Infer capabilities from env
 *   3. (optional) Probe for Kitty graphics support
 *   4. (optional) Query terminal colors
 *   5. Query pixel dimensions
 *   6. Enter TGE mode (raw, alt screen, mouse, etc.)
 *   7. Install exit handlers for cleanup
 *
 * Returns a Terminal object that the rest of TGE uses.
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
    size.cols = newSize.cols
    size.rows = newSize.rows
    // Recalculate pixel dimensions from cell size
    if (size.cellWidth > 0) {
      size.pixelWidth = size.cols * size.cellWidth
      size.pixelHeight = size.rows * size.cellHeight
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
    onResize: (handler: ResizeHandler) => onResize(stdout, handler),
    onData: (handler: (data: Buffer) => void) => {
      stdin.on("data", handler)
      return () => { stdin.off("data", handler) }
    },
    bgColor,
    fgColor,
    isDark,
    destroy: () => {
      unsubResize()
      removeExitHandlers()
      leave(stdin, rawWrite, caps, lifecycleState)
    },
  }
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
