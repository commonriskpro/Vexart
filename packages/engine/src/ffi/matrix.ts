/** 3×3 matrix as 9-element Float64Array (row-major) */
export type Matrix3 = Float64Array

export function identity(): Matrix3 {
  return new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
}

export function translate(tx: number, ty: number): Matrix3 {
  return new Float64Array([1, 0, tx, 0, 1, ty, 0, 0, 1])
}

export function rotate(degrees: number): Matrix3 {
  const rad = (degrees * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return new Float64Array([c, -s, 0, s, c, 0, 0, 0, 1])
}

export function scale(s: number): Matrix3 {
  return new Float64Array([s, 0, 0, 0, s, 0, 0, 0, 1])
}

export function scaleXY(sx: number, sy: number): Matrix3 {
  return new Float64Array([sx, 0, 0, 0, sy, 0, 0, 0, 1])
}

export function skew(degreesX: number, degreesY: number): Matrix3 {
  const tx = Math.tan((degreesX * Math.PI) / 180)
  const ty = Math.tan((degreesY * Math.PI) / 180)
  return new Float64Array([1, tx, 0, ty, 1, 0, 0, 0, 1])
}

export function perspective(distance: number, rotateX = 0, rotateY = 0): Matrix3 {
  if (distance <= 0) return identity()
  const rxRad = (rotateX * Math.PI) / 180
  const ryRad = (rotateY * Math.PI) / 180
  const cosX = Math.cos(rxRad)
  const cosY = Math.cos(ryRad)
  const sinX = Math.sin(rxRad)
  const sinY = Math.sin(ryRad)
  const p = -sinY / distance
  const q = sinX / distance
  const a = cosY
  const d = cosX
  return new Float64Array([a, 0, 0, 0, d, 0, p, q, 1])
}

export function multiply(a: Matrix3, b: Matrix3): Matrix3 {
  return new Float64Array([
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ])
}

export function invert(m: Matrix3): Matrix3 | null {
  const a = m[0], b = m[1], c = m[2]
  const d = m[3], e = m[4], f = m[5]
  const g = m[6], h = m[7], i = m[8]
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const D = -(b * i - c * h)
  const E = a * i - c * g
  const F = -(a * h - b * g)
  const G = b * f - c * e
  const H = -(a * f - c * d)
  const I = a * e - b * d
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-12) return null
  const inv = 1 / det
  return new Float64Array([A * inv, D * inv, G * inv, B * inv, E * inv, H * inv, C * inv, F * inv, I * inv])
}

export function transformPoint(m: Matrix3, x: number, y: number): { x: number; y: number } {
  const w = m[6] * x + m[7] * y + m[8]
  if (Math.abs(w) < 1e-12) return { x: 0, y: 0 }
  return {
    x: (m[0] * x + m[1] * y + m[2]) / w,
    y: (m[3] * x + m[4] * y + m[5]) / w,
  }
}

export function transformBounds(m: Matrix3, w: number, h: number): { x: number; y: number; width: number; height: number } {
  const p0 = transformPoint(m, 0, 0)
  const p1 = transformPoint(m, w, 0)
  const p2 = transformPoint(m, w, h)
  const p3 = transformPoint(m, 0, h)
  const minX = Math.min(p0.x, p1.x, p2.x, p3.x)
  const minY = Math.min(p0.y, p1.y, p2.y, p3.y)
  const maxX = Math.max(p0.x, p1.x, p2.x, p3.x)
  const maxY = Math.max(p0.y, p1.y, p2.y, p3.y)
  return { x: Math.floor(minX), y: Math.floor(minY), width: Math.ceil(maxX - minX), height: Math.ceil(maxY - minY) }
}

export function fromConfig(config: { translateX?: number; translateY?: number; rotate?: number; scale?: number; scaleX?: number; scaleY?: number; skewX?: number; skewY?: number; perspective?: number; rotateX?: number; rotateY?: number }, originX: number, originY: number): Matrix3 {
  let m = identity()
  if (config.translateX || config.translateY) m = multiply(m, translate(config.translateX || 0, config.translateY || 0))
  if (originX !== 0 || originY !== 0) m = multiply(m, translate(originX, originY))
  if (config.perspective && (config.rotateX || config.rotateY)) m = multiply(m, perspective(config.perspective, config.rotateX, config.rotateY))
  if (config.rotate) m = multiply(m, rotate(config.rotate))
  const sx = config.scaleX ?? config.scale ?? 1
  const sy = config.scaleY ?? config.scale ?? 1
  if (sx !== 1 || sy !== 1) m = multiply(m, scaleXY(sx, sy))
  if (config.skewX || config.skewY) m = multiply(m, skew(config.skewX || 0, config.skewY || 0))
  if (originX !== 0 || originY !== 0) m = multiply(m, translate(-originX, -originY))
  return m
}

export function isIdentity(m: Matrix3): boolean {
  return (
    Math.abs(m[0] - 1) < 1e-6 &&
    Math.abs(m[1]) < 1e-6 &&
    Math.abs(m[2]) < 1e-6 &&
    Math.abs(m[3]) < 1e-6 &&
    Math.abs(m[4] - 1) < 1e-6 &&
    Math.abs(m[5]) < 1e-6 &&
    Math.abs(m[6]) < 1e-6 &&
    Math.abs(m[7]) < 1e-6 &&
    Math.abs(m[8] - 1) < 1e-6
  )
}
