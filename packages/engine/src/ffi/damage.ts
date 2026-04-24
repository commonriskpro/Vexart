/** @public */
export type DamageRect = { x: number; y: number; width: number; height: number }

/** @public */
export function rectRight(rect: DamageRect): number { return rect.x + rect.width }
/** @public */
export function rectBottom(rect: DamageRect): number { return rect.y + rect.height }
/** @public */
export function isEmptyRect(rect: DamageRect | null | undefined): boolean { return !rect || rect.width <= 0 || rect.height <= 0 }

/** @public */
export function intersectRect(a: DamageRect, b: DamageRect): DamageRect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(rectRight(a), rectRight(b))
  const bottom = Math.min(rectBottom(a), rectBottom(b))
  const width = right - x
  const height = bottom - y
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

/** @public */
export function unionRect(a: DamageRect, b: DamageRect): DamageRect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const right = Math.max(rectRight(a), rectRight(b))
  const bottom = Math.max(rectBottom(a), rectBottom(b))
  return { x, y, width: right - x, height: bottom - y }
}

/** @public */
export function expandRect(rect: DamageRect, padding: number): DamageRect {
  return { x: rect.x - padding, y: rect.y - padding, width: rect.width + padding * 2, height: rect.height + padding * 2 }
}

/** @public */
export function translateRect(rect: DamageRect, dx: number, dy: number): DamageRect {
  return { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height }
}

/** @public */
export function rectArea(rect: DamageRect | null | undefined) {
  if (!rect) return 0
  if (rect.width <= 0 || rect.height <= 0) return 0
  return rect.width * rect.height
}

/** @public */
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
