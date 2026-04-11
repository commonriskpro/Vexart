/**
 * Kitty graphics protocol — direct image transmission.
 *
 * Transmits pixel buffers to the terminal using the Kitty graphics
 * protocol. Images are transmitted as chunked base64-encoded RGBA
 * data, then placed at cell positions.
 *
 * This is the highest-quality backend — pixel-perfect rendering.
 * Works in Kitty, Ghostty, WezTerm, foot, Contour (not tmux).
 *
 * For tmux, use the placeholder backend instead.
 *
 * @see https://sw.kovidgoyal.net/kitty/graphics-protocol/
 */

import type { PixelBuffer } from "@tge/pixel"

const CHUNK_SIZE = 4096

// ── Transmission ──

/**
 * Transmit a pixel buffer as a Kitty graphics image.
 *
 * The image is assigned an ID and either:
 *   - "T": transmit + display immediately at cursor
 *   - "t": transmit only (display later with `place`)
 *   - "p": display a previously transmitted image
 */
export function transmit(
  write: (data: string) => void,
  buf: PixelBuffer,
  id: number,
  opts?: { action?: "t" | "T" | "p"; format?: 24 | 32 },
) {
  const action = opts?.action ?? "T"
  const format = opts?.format ?? 32
  const data = format === 32 ? buf.data : stripAlpha(buf.data, buf.width * buf.height)

  const b64 = Buffer.from(data).toString("base64")
  const chunks = chunk(b64)
  if (chunks.length === 0) return

  const meta = `a=${action},f=${format},i=${id},s=${buf.width},v=${buf.height},q=2`

  if (chunks.length === 1) {
    write(`\x1b_G${meta};${chunks[0]}\x1b\\`)
    return
  }

  write(`\x1b_G${meta},m=1;${chunks[0]}\x1b\\`)
  for (let i = 1; i < chunks.length - 1; i++) {
    write(`\x1b_Gm=1;${chunks[i]}\x1b\\`)
  }
  write(`\x1b_Gm=0;${chunks[chunks.length - 1]}\x1b\\`)
}

/** Place an already-transmitted image at a cell position. */
export function place(
  write: (data: string) => void,
  id: number,
  col: number,
  row: number,
) {
  // Move cursor to position, then place
  write(`\x1b[${row + 1};${col + 1}H`)
  write(`\x1b_Ga=p,i=${id},q=2;AAAA\x1b\\`)
}

/** Transmit + place in one operation. Moves cursor, transmits at position. */
export function transmitAt(
  write: (data: string) => void,
  buf: PixelBuffer,
  id: number,
  col: number,
  row: number,
) {
  write(`\x1b7`) // save cursor
  write(`\x1b[${row + 1};${col + 1}H`) // move cursor
  transmit(write, buf, id, { action: "T" })
  write(`\x1b8`) // restore cursor
}

/** Delete an image by ID. */
export function remove(write: (data: string) => void, id: number) {
  write(`\x1b_Ga=d,d=i,i=${id},q=2;\x1b\\`)
}

/** Delete all images. */
export function clearAll(write: (data: string) => void) {
  write(`\x1b_Ga=d,d=a,q=2;\x1b\\`)
}

// ── Helpers ──

function stripAlpha(data: Uint8Array, pixels: number): Uint8Array {
  const out = new Uint8Array(pixels * 3)
  for (let i = 0; i < pixels; i++) {
    out[i * 3] = data[i * 4]
    out[i * 3 + 1] = data[i * 4 + 1]
    out[i * 3 + 2] = data[i * 4 + 2]
  }
  return out
}

function chunk(str: string): string[] {
  const result: string[] = []
  for (let i = 0; i < str.length; i += CHUNK_SIZE) {
    result.push(str.slice(i, i + CHUNK_SIZE))
  }
  return result
}
