/**
 * Terminal size detection and resize handling.
 *
 * Provides terminal dimensions in both cells and pixels.
 * Pixel dimensions are essential for Vexart — they determine
 * the resolution of the pixel buffer.
 *
 * Cell pixel size (cellWidth, cellHeight) is derived from:
 *   pixelWidth / cols  and  pixelHeight / rows
 *
 * This gives us the "downsample factor" — how many pixels
 * fit in one terminal cell. Typically ~8x16 or ~10x20.
 */

import { appendFileSync } from "node:fs"

/** @public */
export type TerminalSize = {
  /** Terminal width in columns (cells) */
  cols: number
  /** Terminal height in rows (cells) */
  rows: number
  /** Terminal width in pixels (0 if unavailable) */
  pixelWidth: number
  /** Terminal height in pixels (0 if unavailable) */
  pixelHeight: number
  /** Single cell width in pixels */
  cellWidth: number
  /** Single cell height in pixels */
  cellHeight: number
}

/** @public */
export function getSize(stdout: NodeJS.WriteStream): TerminalSize {
  const cols = stdout.columns || 80
  const rows = stdout.rows || 24

  // Bun supports getWindowSize() which returns [width, height] in pixels
  // on the third and fourth elements: [cols, rows, pixelWidth, pixelHeight]
  // But Node/Bun stdout.getWindowSize() only returns [cols, rows]
  // Pixel dimensions come from ioctl TIOCGWINSZ — available via Bun
  let pixelWidth = 0
  let pixelHeight = 0

  // Try Bun's process.stdout.getWindowSize() — returns [cols, rows]
  // Pixel size needs ioctl which we'll do via escape query
  // For now, use common defaults and let queryPixelSize() refine later
  const cellWidth = pixelWidth > 0 ? Math.floor(pixelWidth / cols) : 0
  const cellHeight = pixelHeight > 0 ? Math.floor(pixelHeight / rows) : 0

  return { cols, rows, pixelWidth, pixelHeight, cellWidth, cellHeight }
}

/**
 * Query terminal pixel dimensions.
 *
 * @public
 */
export function queryPixelSize(
  write: (data: string) => void,
  onData: (handler: (data: Buffer) => void) => void,
  offData: (handler: (data: Buffer) => void) => void,
  cols: number,
  rows: number,
  timeout = 1000,
): Promise<{ pixelWidth: number; pixelHeight: number; cellWidth: number; cellHeight: number }> {
  return new Promise((resolve) => {
    let done = false

    const cleanup = () => {
      if (done) return
      done = true
      offData(handler)
      clearTimeout(timer)
    }

    const handler = (data: Buffer) => {
      const str = data.toString()
      // Response: \x1b[4;{height};{width}t
      const match = str.match(/\x1b\[4;(\d+);(\d+)t/)
      if (match) {
        const pixelHeight = parseInt(match[1], 10)
        const pixelWidth = parseInt(match[2], 10)
        cleanup()
        resolve({
          pixelWidth,
          pixelHeight,
          cellWidth: cols > 0 ? Math.floor(pixelWidth / cols) : 0,
          cellHeight: rows > 0 ? Math.floor(pixelHeight / rows) : 0,
        })
      }
    }

    const timer = setTimeout(() => {
      cleanup()
      // Fallback: assume 8x16 cells (common default)
      resolve({
        pixelWidth: cols * 8,
        pixelHeight: rows * 16,
        cellWidth: 8,
        cellHeight: 16,
      })
    }, timeout)

    onData(handler)

    // CSI 14t — report text area size in pixels
    write("\x1b[14t")
  })
}

/** @public */
export type ResizeHandler = (size: TerminalSize) => void

const RESIZE_DEBUG = process.env.VEXART_DEBUG_RESIZE === "1"
const RESIZE_DEBUG_LOG = "/tmp/tge-resize.log"

function logResize(message: string) {
  if (!RESIZE_DEBUG) return
  appendFileSync(RESIZE_DEBUG_LOG, `[terminal:size] ${message}\n`)
}

/** @public */
export function onResize(stdout: NodeJS.WriteStream, handler: ResizeHandler): () => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  let last = getSize(stdout)

  const sameSize = (a: TerminalSize, b: TerminalSize) => {
    return a.cols === b.cols &&
      a.rows === b.rows &&
      a.pixelWidth === b.pixelWidth &&
      a.pixelHeight === b.pixelHeight &&
      a.cellWidth === b.cellWidth &&
      a.cellHeight === b.cellHeight
  }

  const emit = () => {
    timeout = null
    const next = getSize(stdout)
    if (sameSize(last, next)) {
      logResize(`emit skipped cols=${next.cols} rows=${next.rows} pw=${next.pixelWidth} ph=${next.pixelHeight} cw=${next.cellWidth} ch=${next.cellHeight}`)
      return
    }
    last = next
    logResize(`emit cols=${next.cols} rows=${next.rows} pw=${next.pixelWidth} ph=${next.pixelHeight} cw=${next.cellWidth} ch=${next.cellHeight}`)
    handler(next)
  }

  const listener = () => {
    logResize(`listener fired cols=${stdout.columns || 0} rows=${stdout.rows || 0}`)
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(emit, 0)
  }

  stdout.on("resize", listener)
  process.on("SIGWINCH", listener)

  return () => {
    if (timeout) clearTimeout(timeout)
    stdout.off("resize", listener)
    process.off("SIGWINCH", listener)
  }
}
