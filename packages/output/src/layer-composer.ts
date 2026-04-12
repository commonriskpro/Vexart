/**
 * Layer compositor — multi-image rendering with z-index.
 *
 * Browser-style compositing: each layer is a separate Kitty image
 * with its own ID and z-order. The terminal's GPU composites them.
 *
 * Only dirty layers are retransmitted. Clean layers stay in terminal
 * VRAM — zero I/O cost.
 *
 * Kitty protocol used:
 *   - a=T: transmit + display at cursor position
 *   - z=N: z-index for stacking order
 *   - a=d,d=I,i=N: delete image by ID (frees VRAM)
 *
 * Works with: Kitty, Ghostty (direct mode, no tmux)
 */

import type { PixelBuffer } from "@tge/pixel"
import * as kitty from "./kitty"
import type { TransmissionMode } from "./kitty"

export type LayerEntry = {
  id: number
  imageId: number
  z: number
  x: number
  y: number
  width: number
  height: number
}

export type LayerComposer = {
  /**
   * Render a single layer. Only call for dirty layers.
   * Transmits the pixel buffer as a Kitty image at the specified position.
   */
  renderLayer: (
    buf: PixelBuffer,
    imageId: number,
    pixelX: number,
    pixelY: number,
    z: number,
    cellW: number,
    cellH: number,
  ) => void

  /**
   * [Experimental] Patch a dirty region of an existing layer.
   * Uses Kitty animation frame protocol (a=f) to update only the changed pixels.
   * Returns false if the image hasn't been transmitted yet (caller should use renderLayer).
   */
  patchLayer: (
    regionData: Uint8Array,
    imageId: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
  ) => boolean

  /** Remove a layer's image from the terminal. */
  removeLayer: (imageId: number) => void

  /** Remove all layer images. */
  clear: () => void

  /** Destroy — clean up all images. */
  destroy: () => void
}

/**
 * Create a layer compositor for the kitty direct backend.
 *
 * @param write — write function for Kitty graphics escapes
 * @param rawWrite — write function for ANSI cursor positioning
 * @param mode — transmission mode: "shm" | "file" | "direct"
 */
export function createLayerComposer(
  write: (data: string) => void,
  rawWrite: (data: string) => void,
  mode: TransmissionMode = "direct",
  compress = false,
): LayerComposer {
  /** Track which image IDs are active in the terminal. */
  const activeIds = new Set<number>()

  /**
   * Composite pixel buffer onto void black, producing an opaque buffer.
   * Kitty protocol doesn't support alpha in the traditional sense —
   * we pre-composite onto the background color.
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

  return {
    renderLayer(buf, imageId, pixelX, pixelY, z, cellW, cellH) {
      // Convert pixel coordinates to cell coordinates
      const col = Math.floor(pixelX / cellW)
      const row = Math.floor(pixelY / cellH)

      // Delete old image before re-transmit — Kitty requires explicit removal
      // to update the visible placement reliably.
      if (activeIds.has(imageId)) {
        kitty.remove(write, imageId)
      }

      // Transmit with RGBA (f=32) — Kitty composites alpha layers over
      // lower z-index images. NO compositeOnBlack here — that would make
      // transparent areas opaque and cover layers below.
      // Only the background layer (z=-1) needs compositing on black.
      if (z < 0) {
        // Background layer — pre-composite on black (nothing behind it)
        const opaque = compositeOnBlack(buf)
        kitty.transmitAt(write, opaque, imageId, col, row, { z, mode, compress })
      } else {
        // Content layer — keep alpha for terminal compositing
        kitty.transmitAt(write, buf, imageId, col, row, { z, mode, compress })
      }
      activeIds.add(imageId)
    },

    patchLayer(regionData, imageId, rx, ry, rw, rh) {
      if (!activeIds.has(imageId)) return false
      kitty.patchRegion(write, imageId, regionData, rx, ry, rw, rh, { mode, compress })
      return true
    },

    removeLayer(imageId) {
      if (activeIds.has(imageId)) {
        kitty.remove(write, imageId)
        activeIds.delete(imageId)
      }
    },

    clear() {
      for (const id of activeIds) {
        kitty.remove(write, id)
      }
      activeIds.clear()
    },

    destroy() {
      kitty.clearAll(write)
      activeIds.clear()
    },
  }
}
