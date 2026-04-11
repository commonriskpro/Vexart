/**
 * Kitty Unicode Placeholders — tmux-confined pixel-perfect rendering.
 *
 * Instead of placing images directly (which are global in tmux and
 * bleed across panes), we use U+10EEEE placeholder characters that
 * the terminal recognizes and replaces with image pixels.
 *
 * Protocol:
 *   1. Transmit image with a=t,q=2 (store only, suppress response)
 *   2. Create virtual placement: a=p,U=1,i={id},c={cols},r={rows}
 *   3. Write U+10EEEE per cell with fg=image_id_rgb, row/col via diacritics
 *
 * Since placeholders are normal text characters, tmux treats them as
 * text and confines them to the pane.
 *
 * @see https://sw.kovidgoyal.net/kitty/graphics-protocol/#unicode-placeholders
 */

import type { PixelBuffer } from "@tge/pixel"

const CHUNK_SIZE = 4096

/** U+10EEEE — Kitty image placeholder (Supplementary Private Use Area-B). */
const PH = "\u{10EEEE}"

/**
 * Combining diacritics for row/column encoding (indices 0..255).
 * Derived from kitty's rowcolumn-diacritics.txt — combining marks
 * of Unicode class 230 (above base character).
 */
const DIACRITICS: number[] = [
  0x0305, 0x030d, 0x030e, 0x0310, 0x0312, 0x033d, 0x033e, 0x033f, 0x0346, 0x034a, 0x034b, 0x034c, 0x0350, 0x0351,
  0x0352, 0x0357, 0x035b, 0x0363, 0x0364, 0x0365, 0x0366, 0x0367, 0x0368, 0x0369, 0x036a, 0x036b, 0x036c, 0x036d,
  0x036e, 0x036f, 0x0483, 0x0484, 0x0485, 0x0486, 0x0487, 0x0592, 0x0593, 0x0594, 0x0595, 0x0597, 0x0598, 0x0599,
  0x059c, 0x059d, 0x059e, 0x059f, 0x05a0, 0x05a1, 0x05a8, 0x05a9, 0x05ab, 0x05ac, 0x05af, 0x05c4, 0x0610, 0x0611,
  0x0612, 0x0613, 0x0614, 0x0615, 0x0616, 0x0617, 0x0657, 0x0658, 0x0659, 0x065a, 0x065b, 0x065d, 0x065e, 0x06d6,
  0x06d7, 0x06d8, 0x06d9, 0x06da, 0x06db, 0x06dc, 0x06df, 0x06e0, 0x06e1, 0x06e2, 0x06e4, 0x06e7, 0x06e8, 0x06eb,
  0x06ec, 0x0730, 0x0732, 0x0733, 0x0735, 0x0736, 0x073a, 0x073d, 0x073f, 0x0740, 0x0741, 0x0743, 0x0745, 0x0747,
  0x0749, 0x074a, 0x07eb, 0x07ec, 0x07ed, 0x07ee, 0x07ef, 0x07f0, 0x07f1, 0x07f3, 0x0816, 0x0817, 0x0818, 0x0819,
  0x081b, 0x081c, 0x081d, 0x081e, 0x081f, 0x0820, 0x0821, 0x0822, 0x0823, 0x0825, 0x0826, 0x0827, 0x0829, 0x082a,
  0x082b, 0x082c, 0x082d, 0x0951, 0x0953, 0x0954, 0x0f82, 0x0f83, 0x0f86, 0x0f87, 0x135d, 0x135e, 0x135f, 0x17dd,
  0x193a, 0x1a17, 0x1a75, 0x1a76, 0x1a77, 0x1a78, 0x1a79, 0x1a7a, 0x1a7b, 0x1a7c, 0x1b6b, 0x1b6d, 0x1b6e, 0x1b6f,
  0x1b70, 0x1b71, 0x1b72, 0x1b73, 0x1cd0, 0x1cd1, 0x1cd2, 0x1cda, 0x1cdb, 0x1ce0, 0x1dc0, 0x1dc1, 0x1dc3, 0x1dc4,
  0x1dc5, 0x1dc6, 0x1dc7, 0x1dc8, 0x1dc9, 0x1dcb, 0x1dcc, 0x1dd1, 0x1dd2, 0x1dd3, 0x1dd4, 0x1dd5, 0x1dd6, 0x1dd7,
  0x1dd8, 0x1dd9, 0x1dda, 0x1ddb, 0x1ddc, 0x1ddd, 0x1dde, 0x1ddf, 0x1de0, 0x1de1, 0x1de2, 0x1de3, 0x1de4, 0x1de5,
  0x1de6, 0x1dfe, 0x20d0, 0x20d1, 0x20d4, 0x20d5, 0x20d6, 0x20d7, 0x20db, 0x20dc, 0x20e1, 0x20e7, 0x20e9, 0x20f0,
  0x2cef, 0x2cf0, 0x2cf1, 0x2de0, 0x2de1, 0x2de2, 0x2de3, 0x2de4, 0x2de5, 0x2de6, 0x2de7, 0x2de8, 0x2de9, 0x2dea,
  0x2deb, 0x2dec, 0x2ded, 0x2dee, 0x2def, 0x2df0, 0x2df1, 0x2df2, 0x2df3, 0x2df4, 0x2df5, 0x2df6, 0x2df7, 0x2df8,
  0x2df9, 0x2dfa, 0x2dfb, 0x2dfc, 0x2dfd, 0x2dfe, 0x2dff, 0xa66f, 0xa67c, 0xa67d, 0xa6f0, 0xa6f1, 0xa8e0, 0xa8e1,
  0xa8e2, 0xa8e3, 0xa8e4, 0xa8e5, 0xa8e6, 0xa8e7, 0xa8e8, 0xa8e9, 0xa8ea, 0xa8eb, 0xa8ec, 0xa8ed, 0xa8ee, 0xa8ef,
  0xa8f0, 0xa8f1,
]

/** Pre-computed diacritics as strings. */
const DIA = DIACRITICS.map((cp) => String.fromCodePoint(cp))

function dia(n: number): string {
  return DIA[n & 0xff]
}

// ── Transmission ──

/**
 * Transmit an image for Unicode placeholder display.
 *
 * 1. Transmit pixel data with a=t,q=2 (store only, no display)
 * 2. Create virtual placement with U=1 (cols × rows cells)
 *
 * The image is NOT displayed until placeholder chars are written.
 */
export function transmit(
  write: (data: string) => void,
  buf: PixelBuffer,
  id: number,
  cols: number,
  rows: number,
) {
  const b64 = Buffer.from(buf.data).toString("base64")
  const meta = `a=t,q=2,f=32,i=${id},s=${buf.width},v=${buf.height}`

  const chunks: string[] = []
  for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
    chunks.push(b64.slice(i, i + CHUNK_SIZE))
  }

  if (chunks.length === 0) return

  if (chunks.length === 1) {
    write(`\x1b_G${meta};${chunks[0]}\x1b\\`)
  } else {
    write(`\x1b_G${meta},m=1;${chunks[0]}\x1b\\`)
    for (let i = 1; i < chunks.length - 1; i++) {
      write(`\x1b_Gm=1;${chunks[i]}\x1b\\`)
    }
    write(`\x1b_Gm=0;${chunks[chunks.length - 1]}\x1b\\`)
  }

  // Create virtual placement — U=1 marks it as placeholder prototype
  write(`\x1b_Ga=p,U=1,i=${id},c=${cols},r=${rows},q=2;AAAA\x1b\\`)
}

/** Delete a virtual placeholder by image ID. */
export function remove(write: (data: string) => void, id: number) {
  write(`\x1b_Ga=d,d=i,i=${id},q=2;\x1b\\`)
}

// ── Grid generation ──

/**
 * Build placeholder text for an entire grid (rows × cols).
 *
 * Returns an array of strings — one per row. Each string contains
 * U+10EEEE placeholder chars with combining diacritics for row/col.
 *
 * The caller renders each row at the correct terminal position
 * with fg color encoding the image ID.
 */
export function grid(cols: number, rows: number): string[] {
  const out: string[] = []
  for (let r = 0; r < rows; r++) {
    // First cell: placeholder + row diacritic + col diacritic (col=0)
    let s = PH + dia(r) + dia(0)
    // Subsequent cells: just placeholder (terminal auto-inherits)
    for (let c = 1; c < cols; c++) s += PH
    out.push(s)
  }
  return out
}

/**
 * Render placeholders at a position with the image ID encoded in fg color.
 *
 * Writes ANSI SGR truecolor fg + cursor positioning + placeholder text
 * for each row of the grid.
 */
export function render(
  write: (data: string) => void,
  id: number,
  col: number,
  row: number,
  cols: number,
  rows: number,
) {
  const lines = grid(cols, rows)
  const [r, g, b] = idToRgb(id)

  for (let i = 0; i < lines.length; i++) {
    write(`\x1b[${row + i + 1};${col + 1}H`) // move cursor
    write(`\x1b[38;2;${r};${g};${b}m`)        // set fg to image ID
    write(lines[i])
  }
  write(`\x1b[0m`) // reset attributes
}

// ── ID encoding ──

/**
 * Encode a 24-bit image ID as RGB components.
 * The terminal reads fg color bytes as the image ID.
 */
export function idToRgb(id: number): [number, number, number] {
  return [(id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff]
}
