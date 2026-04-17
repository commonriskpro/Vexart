import type { DamageRect } from "./damage"

export function rectArea(rect: DamageRect | null | undefined) {
  if (!rect) return 0
  if (rect.width <= 0 || rect.height <= 0) return 0
  return rect.width * rect.height
}

export function sumOverlapArea(rects: DamageRect[]) {
  let overlap = 0
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const left = Math.max(rects[i].x, rects[j].x)
      const top = Math.max(rects[i].y, rects[j].y)
      const right = Math.min(rects[i].x + rects[i].width, rects[j].x + rects[j].width)
      const bottom = Math.min(rects[i].y + rects[i].height, rects[j].y + rects[j].height)
      if (right <= left || bottom <= top) continue
      overlap += (right - left) * (bottom - top)
    }
  }
  return overlap
}

export function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function findDirtyRegion(prev: Uint8Array, curr: Uint8Array, width: number, height: number): { x: number; y: number; w: number; h: number; dirtyPixels: number } | null {
  let minX = width, minY = height, maxX = -1, maxY = -1, dirtyPixels = 0
  const stride = width * 4
  for (let y = 0; y < height; y++) {
    const row = y * stride
    for (let x = 0; x < width; x++) {
      const off = row + x * 4
      if (prev[off] === curr[off] && prev[off + 1] === curr[off + 1] && prev[off + 2] === curr[off + 2] && prev[off + 3] === curr[off + 3]) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      dirtyPixels++
    }
  }
  if (maxX < minX || maxY < minY) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, dirtyPixels }
}

export function extractRegion(data: Uint8Array, bufWidth: number, rx: number, ry: number, rw: number, rh: number): Uint8Array {
  const out = new Uint8Array(rw * rh * 4)
  const srcStride = bufWidth * 4
  const dstStride = rw * 4
  for (let y = 0; y < rh; y++) {
    const srcOff = (ry + y) * srcStride + rx * 4
    const dstOff = y * dstStride
    out.set(data.subarray(srcOff, srcOff + dstStride), dstOff)
  }
  return out
}
