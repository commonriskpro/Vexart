/** @public A 2D point. */
export type Point2D = { x: number; y: number }

/** @public Axis-aligned rectangle (origin + size). */
export type Rect = { x: number; y: number; width: number; height: number }

/** @public Alias kept for API compat — prefer `Rect` in new code. */
export type DamageRect = Rect

/** @public Four-corner quad produced by transforming a rect through a matrix chain. */
export type TransformQuad = { p0: Point2D; p1: Point2D; p2: Point2D; p3: Point2D }

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
export function sumOverlapArea(rects: DamageRect[]): number {
  if (rects.length <= 1) return 0

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let totalArea = 0

  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]
    if (!r || r.width <= 0 || r.height <= 0) continue
    totalArea += r.width * r.height
    if (r.x < minX) minX = r.x
    if (r.y < minY) minY = r.y
    const right = r.x + r.width
    const bottom = r.y + r.height
    if (right > maxX) maxX = right
    if (bottom > maxY) maxY = bottom
  }

  if (minX === Infinity) return 0
  const boundingArea = (maxX - minX) * (maxY - minY)

  let overlap = 0
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i]
    if (!a || a.width <= 0 || a.height <= 0) continue
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j]
      if (!b || b.width <= 0 || b.height <= 0) continue
      const left = Math.max(a.x, b.x)
      const top = Math.max(a.y, b.y)
      const right = Math.min(a.x + a.width, b.x + b.width)
      const bottom = Math.min(a.y + a.height, b.y + b.height)
      if (right <= left || bottom <= top) continue
      overlap += (right - left) * (bottom - top)
    }
  }

  return Math.min(overlap, boundingArea, totalArea)
}
