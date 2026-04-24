/**
 * Layer compositor — multi-image rendering with z-index.
 *
 * Phase 2: single native composite path via Kitty protocol.
 * CPU/GPU switch removed per design §11 (REQ-NB-002, DEC-005).
 * vexart_composite_merge handles GPU-side layer merging.
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

import * as kitty from "./kitty"
import type { CompressMode, TransmissionMode } from "./kitty"
import { resolveKittyTransportMode } from "./transport-manager"

export type LayerEntry = {
  id: number
  imageId: number
  z: number
  x: number
  y: number
  width: number
  height: number
}

/** @public */
export type LayerComposer = {
  /** Render raw RGBA bytes directly, avoiding a PixelBuffer wrapper upstream. */
  renderLayerRaw: (
    data: Uint8Array,
    width: number,
    height: number,
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

  /** Re-place an already transmitted image without re-uploading pixels. */
  placeLayer: (
    imageId: number,
    pixelX: number,
    pixelY: number,
    z: number,
    cellW: number,
    cellH: number,
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
 * @param write - Write function for Kitty graphics escapes.
 * @param rawWrite - Write function reserved for cursor positioning hooks.
 * @param mode - Transmission mode.
 */
/** @public */
export function createLayerComposer(
  write: (data: string) => void,
  rawWrite: (data: string) => void,
  mode: TransmissionMode = "direct",
  compress: CompressMode = "auto",
): LayerComposer {
  /** Track which image IDs are active in the terminal. */
  const activeIds = new Set<number>()

  const placementIdForLayer = (imageId: number) => imageId

  return {
    renderLayerRaw(data, width, height, imageId, pixelX, pixelY, z, cellW, cellH) {
      const effectiveMode = resolveKittyTransportMode(mode)
      const col = Math.floor(pixelX / cellW)
      const row = Math.floor(pixelY / cellH)

      if (activeIds.has(imageId) && effectiveMode !== "shm") {
        kitty.remove(write, imageId)
      }

      if (z < 0) {
        // Raw path currently assumes the caller already prepared the final bytes.
        // Keep behavior explicit: no extra alpha compositing here.
         kitty.transmitRawAt(write, { data, width, height }, imageId, col, row, { z, placementId: placementIdForLayer(imageId), mode: effectiveMode, compress, format: 32 })
      } else {
         kitty.transmitRawAt(write, { data, width, height }, imageId, col, row, { z, placementId: placementIdForLayer(imageId), mode: effectiveMode, compress, format: 32 })
      }
      activeIds.add(imageId)
    },

    patchLayer(regionData, imageId, rx, ry, rw, rh) {
      if (!activeIds.has(imageId)) return false
      kitty.patchRegion(write, imageId, regionData, rx, ry, rw, rh, { mode: resolveKittyTransportMode(mode), compress })
      return true
    },

    placeLayer(imageId, pixelX, pixelY, z, cellW, cellH) {
      if (!activeIds.has(imageId)) return false
      const col = Math.floor(pixelX / cellW)
      const row = Math.floor(pixelY / cellH)
      kitty.place(write, imageId, col, row, { z, placementId: placementIdForLayer(imageId) })
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
