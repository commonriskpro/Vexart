/**
 * Transition-only subtree transform staging.
 * This post-pass exists because some transform paths still require temporary
 * raster surfaces before the renderer can stay GPU-native end to end.
 */

import { paint } from "./pixel-buffer"
import { createRasterSurface, type RasterSurface } from "./render-surface"
import type { Matrix3 } from "./matrix"

export function applySubtreeTransformToSurface(params: {
  surface: RasterSurface
  snapshot: RasterSurface | null
  regionX: number
  regionY: number
  width: number
  height: number
  inverse: Matrix3
  bounds: { x: number; y: number; width: number; height: number }
}) {
  const { surface, snapshot, regionX, regionY, width, height, inverse, bounds } = params
  const tmp = createRasterSurface(width, height)

  for (let row = 0; row < height; row++) {
    const sy = regionY + row
    if (sy < 0 || sy >= surface.height) continue
    const srcOff = sy * surface.stride
    const dstOff = row * tmp.stride
    for (let col = 0; col < width; col++) {
      const sx = regionX + col
      if (sx < 0 || sx >= surface.width) continue
      const si = srcOff + sx * 4
      const di = dstOff + col * 4
      tmp.data[di] = surface.data[si]
      tmp.data[di + 1] = surface.data[si + 1]
      tmp.data[di + 2] = surface.data[si + 2]
      tmp.data[di + 3] = surface.data[si + 3]
    }
  }

  if (snapshot) {
    for (let row = 0; row < height; row++) {
      const sy = regionY + row
      if (sy < 0 || sy >= surface.height) continue
      const bufOff = sy * surface.stride
      const snapOff = row * snapshot.stride
      for (let col = 0; col < width; col++) {
        const sx = regionX + col
        if (sx < 0 || sx >= surface.width) continue
        const bi = bufOff + sx * 4
        const si = snapOff + col * 4
        surface.data[bi] = snapshot.data[si]
        surface.data[bi + 1] = snapshot.data[si + 1]
        surface.data[bi + 2] = snapshot.data[si + 2]
        surface.data[bi + 3] = snapshot.data[si + 3]
      }
    }
  } else {
    for (let row = 0; row < height; row++) {
      const sy = regionY + row
      if (sy < 0 || sy >= surface.height) continue
      const off = sy * surface.stride
      for (let col = 0; col < width; col++) {
        const sx = regionX + col
        if (sx < 0 || sx >= surface.width) continue
        const i = off + sx * 4
        surface.data[i] = 0
        surface.data[i + 1] = 0
        surface.data[i + 2] = 0
        surface.data[i + 3] = 0
      }
    }
  }

  paint.affineBlit(surface, tmp, inverse, regionX + bounds.x, regionY + bounds.y, bounds.width, bounds.height)
}
