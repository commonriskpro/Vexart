/**
 * Buffer-level compositing operations.
 *
 * Composites one PixelBuffer onto another with src-over blending.
 * Used when combining layers (e.g. shadow + shape, or opacity groups).
 */

import type { PixelBuffer } from "./buffer"

/** Composite `src` onto `dst` at position (dx, dy) using src-over. */
export function over(dst: PixelBuffer, src: PixelBuffer, dx: number, dy: number) {
  const x0 = Math.max(0, dx | 0)
  const y0 = Math.max(0, dy | 0)
  const x1 = Math.min(dst.width, (dx + src.width) | 0)
  const y1 = Math.min(dst.height, (dy + src.height) | 0)

  for (let py = y0; py < y1; py++) {
    const srcRow = (py - dy) * src.stride
    for (let px = x0; px < x1; px++) {
      const srcOff = srcRow + (px - dx) * 4
      const sa = src.data[srcOff + 3]
      if (sa === 0) continue

      const dstOff = py * dst.stride + px * 4
      if (sa === 0xff) {
        dst.data[dstOff] = src.data[srcOff]
        dst.data[dstOff + 1] = src.data[srcOff + 1]
        dst.data[dstOff + 2] = src.data[srcOff + 2]
        dst.data[dstOff + 3] = 0xff
        continue
      }

      const da = dst.data[dstOff + 3]
      const inv = 255 - sa
      const oa = sa * 255 + da * inv
      if (oa === 0) continue

      dst.data[dstOff] = (src.data[srcOff] * sa * 255 + dst.data[dstOff] * da * inv + (oa >> 1)) / oa
      dst.data[dstOff + 1] = (src.data[srcOff + 1] * sa * 255 + dst.data[dstOff + 1] * da * inv + (oa >> 1)) / oa
      dst.data[dstOff + 2] = (src.data[srcOff + 2] * sa * 255 + dst.data[dstOff + 2] * da * inv + (oa >> 1)) / oa
      const outA = (oa + 127) / 255
      dst.data[dstOff + 3] = outA > 255 ? 255 : outA
    }
  }
}

/** Composite `src` onto `dst` with a uniform opacity multiplier (0-1). */
export function withOpacity(dst: PixelBuffer, src: PixelBuffer, dx: number, dy: number, opacity: number) {
  if (opacity <= 0) return
  if (opacity >= 1) return over(dst, src, dx, dy)

  const x0 = Math.max(0, dx | 0)
  const y0 = Math.max(0, dy | 0)
  const x1 = Math.min(dst.width, (dx + src.width) | 0)
  const y1 = Math.min(dst.height, (dy + src.height) | 0)
  const mul = Math.round(opacity * 255)

  for (let py = y0; py < y1; py++) {
    const srcRow = (py - dy) * src.stride
    for (let px = x0; px < x1; px++) {
      const srcOff = srcRow + (px - dx) * 4
      const sa = (src.data[srcOff + 3] * mul) >> 8
      if (sa === 0) continue

      const dstOff = py * dst.stride + px * 4
      if (sa >= 255) {
        dst.data[dstOff] = src.data[srcOff]
        dst.data[dstOff + 1] = src.data[srcOff + 1]
        dst.data[dstOff + 2] = src.data[srcOff + 2]
        dst.data[dstOff + 3] = 0xff
        continue
      }

      const da = dst.data[dstOff + 3]
      const inv = 255 - sa
      const oa = sa * 255 + da * inv
      if (oa === 0) continue

      dst.data[dstOff] = (src.data[srcOff] * sa * 255 + dst.data[dstOff] * da * inv + (oa >> 1)) / oa
      dst.data[dstOff + 1] = (src.data[srcOff + 1] * sa * 255 + dst.data[dstOff + 1] * da * inv + (oa >> 1)) / oa
      dst.data[dstOff + 2] = (src.data[srcOff + 2] * sa * 255 + dst.data[dstOff + 2] * da * inv + (oa >> 1)) / oa
      const outA = (oa + 127) / 255
      dst.data[dstOff + 3] = outA > 255 ? 255 : outA
    }
  }
}
