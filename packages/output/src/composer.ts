/**
 * Output composer — selects the best backend and renders frames.
 *
 * The composer is the single entry point for output. It:
 *   1. Selects backend based on terminal capabilities
 *   2. Composites the pixel buffer onto void black (for transmission)
 *   3. Transmits the frame via the selected backend
 *   4. Tracks a simple hash to skip unchanged frames
 *
 * Backend priority:
 *   1. Kitty direct (pixel-perfect, fastest — direct terminal)
 *   2. Kitty placeholders (pixel-perfect — tmux-safe)
 *   3. Halfblock (universal fallback — any truecolor terminal)
 */

import type { PixelBuffer } from "@tge/pixel"
import type { Capabilities } from "@tge/terminal"
import * as kitty from "./kitty"
import * as placeholder from "./placeholder"
import * as halfblock from "./halfblock"
import { resolveKittyTransportMode } from "./transport-manager"

export type BackendKind = "kitty" | "placeholder" | "halfblock"

export type Composer = {
  /** Which backend is active */
  backend: BackendKind
  /** Render a frame — transmits the pixel buffer to the terminal */
  render: (buf: PixelBuffer, col: number, row: number, cols: number, rows: number, cellW: number, cellH: number) => void
  /** Clear all images from the terminal */
  clear: () => void
  /** Destroy the composer — clean up resources */
  destroy: () => void
}

/**
 * Create an output composer based on terminal capabilities.
 *
 * @param gfxWrite — write function for Kitty graphics escapes (tmux passthrough-wrapped)
 * @param rawWrite — write function for ANSI sequences (cursor, SGR colors, text — NOT wrapped)
 * @param caps — terminal capabilities from @tge/terminal
 */
export function createComposer(
  gfxWrite: (data: string) => void,
  rawWrite: (data: string) => void,
  caps: Capabilities,
): Composer {
  // Select backend
  const backend: BackendKind = caps.kittyGraphics
    ? "kitty"
    : caps.kittyPlaceholder
      ? "placeholder"
      : "halfblock"

  // State
  let imageId = 1
  let active = false

  // Placeholder state
  let phCols = 0
  let phRows = 0

  /**
   * Composite pixel buffer onto void black, producing an opaque buffer.
   * Kitty protocol doesn't support alpha — we must pre-composite.
   */
  function compositeOnBlack(src: PixelBuffer): PixelBuffer {
    const w = src.width
    const h = src.height
    const out = new Uint8Array(w * h * 4)
    const sd = src.data
    const ss = src.stride
    const bgR = 0x04, bgG = 0x04, bgB = 0x0a

    for (let y = 0; y < h; y++) {
      const sr = y * ss
      const dr = y * w * 4
      for (let x = 0; x < w; x++) {
        const si = sr + x * 4
        const di = dr + x * 4
        const a = sd[si + 3]
        if (a === 0xff) {
          out[di] = sd[si]
          out[di + 1] = sd[si + 1]
          out[di + 2] = sd[si + 2]
          out[di + 3] = 0xff
        } else if (a === 0) {
          out[di] = bgR
          out[di + 1] = bgG
          out[di + 2] = bgB
          out[di + 3] = 0xff
        } else {
          const inv = 255 - a
          out[di] = (sd[si] * a + bgR * inv + 127) / 255
          out[di + 1] = (sd[si + 1] * a + bgG * inv + 127) / 255
          out[di + 2] = (sd[si + 2] * a + bgB * inv + 127) / 255
          out[di + 3] = 0xff
        }
      }
    }

    return { data: out, width: w, height: h, stride: w * 4 }
  }

  function renderKitty(buf: PixelBuffer, col: number, row: number) {
    const effectiveMode = resolveKittyTransportMode(caps.transmissionMode)
    // Double-buffer: transmit with new ID, then delete old
    const prevId = imageId
    const wasActive = active
    imageId = imageId === 1 ? 2 : 1

    const opaque = compositeOnBlack(buf)
    rawWrite(`\x1b7`) // save cursor
    rawWrite(`\x1b[${row + 1};${col + 1}H`) // move cursor
    kitty.transmit(gfxWrite, opaque, imageId, { action: "T", mode: effectiveMode, compress: "auto" })
    rawWrite(`\x1b8`) // restore cursor

    if (wasActive) kitty.remove(gfxWrite, prevId)
    active = true
  }

  function renderPlaceholder(buf: PixelBuffer, col: number, row: number, cols: number, rows: number) {
    // Double-buffer: transmit new image with a DIFFERENT ID, render it,
    // THEN delete the old one. This avoids the flash where neither image
    // is visible between remove and transmit.
    const prevId = imageId
    const wasActive = active
    imageId = imageId === 1 ? 2 : 1

    const opaque = compositeOnBlack(buf)
    // Transmit new image data via Kitty graphics (needs passthrough)
    placeholder.transmit(gfxWrite, opaque, imageId, cols, rows)
    // Render placeholder chars with new image ID
    placeholder.render(rawWrite, imageId, col, row, cols, rows)

    // Now remove the old image — new one is already visible
    if (wasActive) placeholder.remove(gfxWrite, prevId)

    phCols = cols
    phRows = rows
    active = true
  }

  function renderHalfblock(buf: PixelBuffer, col: number, row: number, cols: number, rows: number, cellW: number, cellH: number) {
    const cells = halfblock.rasterize(buf, cols, rows, cellW, cellH)
    halfblock.render(rawWrite, cells, col, row)
  }

  return {
    backend,

    render(buf, col, row, cols, rows, cellW, cellH) {
      switch (backend) {
        case "kitty":
          renderKitty(buf, col, row)
          break
        case "placeholder":
          renderPlaceholder(buf, col, row, cols, rows)
          break
        case "halfblock":
          renderHalfblock(buf, col, row, cols, rows, cellW, cellH)
          break
      }
    },

    clear() {
      if (backend === "kitty" && active) {
        kitty.clearAll(gfxWrite)
      } else if (backend === "placeholder" && active) {
        placeholder.remove(gfxWrite, 1)
        placeholder.remove(gfxWrite, 2)
      }
      active = false
    },

    destroy() {
      if (backend === "kitty" && active) {
        kitty.clearAll(gfxWrite)
      } else if (backend === "placeholder" && active) {
        placeholder.remove(gfxWrite, 1)
        placeholder.remove(gfxWrite, 2)
      }
      active = false
    },
  }
}
