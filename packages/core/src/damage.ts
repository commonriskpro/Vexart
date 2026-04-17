export type DamageRect = { x: number; y: number; width: number; height: number }

export function rectRight(rect: DamageRect): number { return rect.x + rect.width }
export function rectBottom(rect: DamageRect): number { return rect.y + rect.height }
export function isEmptyRect(rect: DamageRect | null | undefined): boolean { return !rect || rect.width <= 0 || rect.height <= 0 }

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

export function unionRect(a: DamageRect, b: DamageRect): DamageRect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const right = Math.max(rectRight(a), rectRight(b))
  const bottom = Math.max(rectBottom(a), rectBottom(b))
  return { x, y, width: right - x, height: bottom - y }
}

export function expandRect(rect: DamageRect, padding: number): DamageRect {
  return { x: rect.x - padding, y: rect.y - padding, width: rect.width + padding * 2, height: rect.height + padding * 2 }
}

export function translateRect(rect: DamageRect, dx: number, dy: number): DamageRect {
  return { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height }
}
