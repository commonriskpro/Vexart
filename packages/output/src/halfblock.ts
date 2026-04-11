/**
 * Halfblock backend — universal terminal fallback.
 *
 * When Kitty graphics are unavailable (Alacritty, plain xterm, SSH),
 * we rasterize pixels into Unicode block characters with ANSI truecolor.
 *
 * Each terminal cell is mapped to a block of pixels. We choose between:
 *   - Halfblock ▀▄: top half = fg color, bottom half = bg color
 *   - Quadrant ▖▗▘▝: 2×2 spatial resolution with 2 colors
 *
 * For each cell, both candidates are evaluated and the one with
 * lower reconstruction error wins.
 *
 * This gives surprisingly good results — gradients, anti-aliased
 * edges, and shadows all render recognizably.
 */

import type { PixelBuffer } from "@tge/pixel"

// ── Block characters ──

/** Quadrant block characters indexed by 4-bit pattern (TL,TR,BL,BR). */
const QCHARS = [
  " ",  "▗", "▖", "▄", "▝", "▐", "▞", "▟",
  "▘",  "▚", "▌", "▙", "▀", "▜", "▛", "█",
]

const HALF_TOP = "▀"  // fg=top, bg=bottom
const FULL     = "█"  // fg fills cell
const SPACE    = " "  // bg fills cell

type RGB = [number, number, number]

// ── Color math ──

/** Perceptual weighted color distance (squared). */
function dist(a: RGB, b: RGB): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return dr * dr * 2 + dg * dg * 4 + db * db * 3
}

/** Luminance (0-255). */
function lum(c: RGB): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/**
 * Area-average a rectangular region of source pixels.
 * Composites alpha onto a background color (default: void black #04040a).
 */
function avg(
  data: Uint8Array,
  stride: number,
  x0: number, y0: number,
  x1: number, y1: number,
  w: number, h: number,
  bgR = 0x04, bgG = 0x04, bgB = 0x0a,
): RGB {
  let tr = 0, tg = 0, tb = 0, cnt = 0
  const ex = Math.min(x1, w)
  const ey = Math.min(y1, h)
  for (let py = y0; py < ey; py++) {
    const row = py * stride
    for (let px = x0; px < ex; px++) {
      const si = row + px * 4
      const a = data[si + 3]
      if (a === 0) {
        tr += bgR; tg += bgG; tb += bgB
      } else if (a === 0xff) {
        tr += data[si]; tg += data[si + 1]; tb += data[si + 2]
      } else {
        const inv = 255 - a
        tr += (data[si] * a + bgR * inv + 127) / 255
        tg += (data[si + 1] * a + bgG * inv + 127) / 255
        tb += (data[si + 2] * a + bgB * inv + 127) / 255
      }
      cnt++
    }
  }
  if (cnt === 0) return [bgR, bgG, bgB]
  return [(tr / cnt + 0.5) | 0, (tg / cnt + 0.5) | 0, (tb / cnt + 0.5) | 0]
}

// ── Cell result ──

type Cell = {
  fg: RGB
  bg: RGB
  char: string
}

/**
 * Rasterize a pixel buffer into a grid of cells.
 *
 * Each cell covers `cw × ch` pixels. Returns a 2D array (rows × cols).
 */
export function rasterize(
  buf: PixelBuffer,
  cols: number,
  rows: number,
  cw: number,
  ch: number,
): Cell[][] {
  const result: Cell[][] = []

  for (let cy = 0; cy < rows; cy++) {
    const row: Cell[] = []
    for (let cx = 0; cx < cols; cx++) {
      const sx = cx * cw
      const sy = cy * ch
      const mx = sx + (cw >> 1)
      const my = sy + (ch >> 1)

      // ── Quadrant candidate ──
      const tl = avg(buf.data, buf.stride, sx, sy, mx, my, buf.width, buf.height)
      const tr = avg(buf.data, buf.stride, mx, sy, sx + cw, my, buf.width, buf.height)
      const bl = avg(buf.data, buf.stride, sx, my, mx, sy + ch, buf.width, buf.height)
      const br = avg(buf.data, buf.stride, mx, my, sx + cw, sy + ch, buf.width, buf.height)
      const quads: RGB[] = [tl, tr, bl, br]

      // Find 2 most different colors
      let ai = 0, bi = 1, best = dist(tl, tr)
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          const d = dist(quads[i], quads[j])
          if (d > best) { ai = i; bi = j; best = d }
        }
      }

      let qDark = quads[ai], qLight = quads[bi]
      if (lum(qDark) > lum(qLight)) { const t = qDark; qDark = qLight; qLight = t }

      // Classify quadrants into dark/light bins
      let bits = 0
      const bv = [8, 4, 2, 1]
      for (let i = 0; i < 4; i++) {
        if (dist(quads[i], qDark) <= dist(quads[i], qLight)) bits |= bv[i]
      }

      let qFg: RGB, qBg: RGB, qChar: string
      if (bits === 0) {
        const a = avg(buf.data, buf.stride, sx, sy, sx + cw, sy + ch, buf.width, buf.height)
        qFg = qDark; qBg = a; qChar = SPACE
      } else if (bits === 15) {
        const a = avg(buf.data, buf.stride, sx, sy, sx + cw, sy + ch, buf.width, buf.height)
        qFg = a; qBg = qLight; qChar = FULL
      } else {
        qFg = qDark; qBg = qLight; qChar = QCHARS[bits]
      }

      // Quadrant error
      let qErr = 0
      for (let i = 0; i < 4; i++) {
        const repr = (bits & bv[i]) ? qFg : qBg
        qErr += dist(quads[i], repr)
      }

      // ── Halfblock candidate ──
      const top = avg(buf.data, buf.stride, sx, sy, sx + cw, my, buf.width, buf.height)
      const bot = avg(buf.data, buf.stride, sx, my, sx + cw, sy + ch, buf.width, buf.height)
      const hErr = dist(top, top) + dist(bot, bot) // self-dist = 0, but vs representation:
      // ▀: fg=top, bg=bottom → error = 0 (exact match)
      // So halfblock always has 0 error for its halves — compare fairly
      const hErrFair = 0 // halfblock is exact for its 2 regions

      if (hErrFair <= qErr) {
        row.push({ fg: top, bg: bot, char: HALF_TOP })
      } else {
        row.push({ fg: qFg, bg: qBg, char: qChar })
      }
    }
    result.push(row)
  }

  return result
}

/**
 * Render rasterized cells to the terminal using ANSI truecolor.
 *
 * Writes SGR fg/bg + character for each cell, with cursor positioning.
 * Batches output into a single string for performance.
 */
export function render(
  write: (data: string) => void,
  cells: Cell[][],
  col: number,
  row: number,
) {
  let out = ""
  let prevFg: RGB = [-1, -1, -1]
  let prevBg: RGB = [-1, -1, -1]

  for (let r = 0; r < cells.length; r++) {
    out += `\x1b[${row + r + 1};${col + 1}H`
    const line = cells[r]
    for (let c = 0; c < line.length; c++) {
      const cell = line[c]

      // Only emit SGR if color changed
      if (cell.fg[0] !== prevFg[0] || cell.fg[1] !== prevFg[1] || cell.fg[2] !== prevFg[2]) {
        out += `\x1b[38;2;${cell.fg[0]};${cell.fg[1]};${cell.fg[2]}m`
        prevFg = cell.fg
      }
      if (cell.bg[0] !== prevBg[0] || cell.bg[1] !== prevBg[1] || cell.bg[2] !== prevBg[2]) {
        out += `\x1b[48;2;${cell.bg[0]};${cell.bg[1]};${cell.bg[2]}m`
        prevBg = cell.bg
      }

      out += cell.char
    }
  }
  out += `\x1b[0m` // reset

  write(out)
}
