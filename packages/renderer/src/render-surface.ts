import { clear, create } from "./pixel-buffer"

export type RawRgbaFrame = {
  data: Uint8Array
  width: number
  height: number
}

/**
 * Neutral raster surface contract for renderer-internal staging.
 *
 * This intentionally mirrors the memory layout needed by the current paint
 * primitives, but it is NOT owned by @tge/pixel anymore. The renderer talks in
 * terms of RasterSurface; pixel-buffer is only one implementation detail that
 * can operate on it.
 */
export type RasterSurface = {
  data: Uint8Array
  width: number
  height: number
  stride: number
}

export function createRasterSurface(width: number, height: number): RasterSurface {
  return create(width, height)
}

export function clearRasterSurface(surface: RasterSurface, color = 0x00000000) {
  clear(surface, color)
}

export function asRawRgbaFrame(surface: RasterSurface): RawRgbaFrame {
  return {
    data: surface.data,
    width: surface.width,
    height: surface.height,
  }
}

export function compositeSurfaceOnBlack(surface: RasterSurface): RawRgbaFrame {
  const w = surface.width
  const h = surface.height
  const out = new Uint8Array(w * h * 4)
  const sd = surface.data
  const ss = surface.stride
  const bgR = 0x04
  const bgG = 0x04
  const bgB = 0x0a

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
        continue
      }
      if (a === 0) {
        out[di] = bgR
        out[di + 1] = bgG
        out[di + 2] = bgB
        out[di + 3] = 0xff
        continue
      }
      const inv = 255 - a
      out[di] = (sd[si] * a + bgR * inv + 127) / 255
      out[di + 1] = (sd[si + 1] * a + bgG * inv + 127) / 255
      out[di + 2] = (sd[si + 2] * a + bgB * inv + 127) / 255
      out[di + 3] = 0xff
    }
  }

  return { data: out, width: w, height: h }
}
