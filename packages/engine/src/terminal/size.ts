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

  // Bun/Node expose cell dimensions here, while pixel dimensions generally
  // require a terminal query. queryPixelSize() fills those in at startup.
  const pixelWidth = 0
  const pixelHeight = 0
  const cellWidth = 0
  const cellHeight = 0

  return { cols, rows, pixelWidth, pixelHeight, cellWidth, cellHeight }
}

/** Parsed terminal reports used by CSI 14t (area) and CSI 16t (cell size). */
type PixelReports = {
  area: { width: number; height: number } | null
  cell: { width: number; height: number } | null
}

/**
 * Parse one or more xterm window-operation reports.
 *
 * CSI 14t reports the text area as `CSI 4;height;width t`. tmux emits this
 * using the current pane dimensions. CSI 16t reports one cell as
 * `CSI 6;cell-height;cell-width t`; tmux sources the values from the outer
 * client's terminal cell size. Keeping this parser separate makes fragmented
 * PTY replies straightforward to test without a terminal.
 */
export function parsePixelReports(data: string, reports: PixelReports = { area: null, cell: null }): PixelReports {
  const pattern = /\x1b\[([46]);(\d+);(\d+)t/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(data)) !== null) {
    const height = Number(match[2])
    const width = Number(match[3])
    if (height <= 0 || width <= 0) continue
    if (match[1] === "4") reports.area = { width, height }
    else reports.cell = { width, height }
  }
  return reports
}

function dimensions(
  reports: PixelReports,
  cols: number,
  rows: number,
): { pixelWidth: number; pixelHeight: number; cellWidth: number; cellHeight: number } {
  const cellWidth = reports.cell?.width ?? (reports.area && cols > 0 ? Math.floor(reports.area.width / cols) : 0)
  const cellHeight = reports.cell?.height ?? (reports.area && rows > 0 ? Math.floor(reports.area.height / rows) : 0)
  const pixelWidth = reports.area?.width ?? (cellWidth > 0 ? cols * cellWidth : 0)
  const pixelHeight = reports.area?.height ?? (cellHeight > 0 ? rows * cellHeight : 0)

  if (pixelWidth > 0 && pixelHeight > 0 && cellWidth > 0 && cellHeight > 0) {
    return { pixelWidth, pixelHeight, cellWidth, cellHeight }
  }

  // Keep the old fallback for terminals that do not answer either query.
  return {
    pixelWidth: pixelWidth || cols * 8,
    pixelHeight: pixelHeight || rows * 16,
    cellWidth: cellWidth || 8,
    cellHeight: cellHeight || 16,
  }
}

/**
 * Query terminal pixel dimensions.
 *
 * Prefer the explicit CSI 16t cell report when available and derive from the
 * CSI 14t area report otherwise. Both reports are sent for every terminal;
 * tmux's CSI 14t area is already pane-relative to the querying process.
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
    let received = ""
    const reports: PixelReports = { area: null, cell: null }

    const cleanup = () => {
      if (done) return
      done = true
      offData(handler)
      clearTimeout(timer)
    }

    const finish = () => {
      cleanup()
      resolve(dimensions(reports, cols, rows))
    }

    const handler = (data: Buffer) => {
      // Responses can be split across multiple reads (especially through a
      // tmux PTY). Retain enough trailing data for an incomplete CSI report.
      received += data.toString()
      if (received.length > 16 * 1024) received = received.slice(-16 * 1024)
      parsePixelReports(received, reports)
      if (reports.area && reports.cell) finish()
    }

    const timer = setTimeout(finish, timeout)

    onData(handler)

    // CSI 16t: cell size; CSI 14t: pane/text-area size. tmux 3.6a responds
    // with CSI 6;cellHeight;cellWidth t and CSI 4;paneHeight;paneWidth t.
    write("\x1b[16t\x1b[14t")
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
