/**
 * 3×3 projective matrix for 2D affine transforms + pseudo-perspective.
 *
 * Stored as 9 floats in row-major order:
 *   | a  c  tx |     index: [0  1  2]
 *   | b  d  ty |            [3  4  5]
 *   | p  q  w  |            [6  7  8]
 *
 * For pure 2D affine (translate/rotate/scale/skew): p=0, q=0, w=1.
 * For pseudo-perspective: p,q ≠ 0 — produces CSS-like perspective foreshortening.
 *
 * Usage:
 *   const m = identity()
 *   const rotated = multiply(m, rotate(45))
 *   const pt = transformPoint(rotated, 100, 200)
 */

// ── Type ──

/** 3×3 matrix as 9-element Float64Array (row-major) */
export type Matrix3 = Float64Array

// ── Constructors ──

/** Identity matrix — no transform */
export function identity(): Matrix3 {
  //  a  c  tx
  //  b  d  ty
  //  p  q  w
  return new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
}

/** Translation matrix */
export function translate(tx: number, ty: number): Matrix3 {
  return new Float64Array([1, 0, tx, 0, 1, ty, 0, 0, 1])
}

/** Rotation matrix (degrees, counter-clockwise) */
export function rotate(degrees: number): Matrix3 {
  const rad = (degrees * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return new Float64Array([c, -s, 0, s, c, 0, 0, 0, 1])
}

/** Uniform scale matrix */
export function scale(s: number): Matrix3 {
  return new Float64Array([s, 0, 0, 0, s, 0, 0, 0, 1])
}

/** Non-uniform scale matrix */
export function scaleXY(sx: number, sy: number): Matrix3 {
  return new Float64Array([sx, 0, 0, 0, sy, 0, 0, 0, 1])
}

/** Skew matrix (degrees) */
export function skew(degreesX: number, degreesY: number): Matrix3 {
  const tx = Math.tan((degreesX * Math.PI) / 180)
  const ty = Math.tan((degreesY * Math.PI) / 180)
  return new Float64Array([1, tx, 0, ty, 1, 0, 0, 0, 1])
}

/**
 * Pseudo-perspective matrix.
 *
 * Simulates CSS `perspective(d) rotateX(rx) rotateY(ry)` in 2D.
 * The trick: a 3D perspective rotation projected onto 2D produces
 * a projective (homogeneous) 2×2 transform — exactly our p,q terms.
 *
 * @param distance  Perspective distance (higher = subtler effect, 0 = off)
 * @param rotateX   Tilt around X axis in degrees (vertical foreshortening)
 * @param rotateY   Tilt around Y axis in degrees (horizontal foreshortening)
 */
export function perspective(distance: number, rotateX = 0, rotateY = 0): Matrix3 {
  if (distance <= 0) return identity()

  const rxRad = (rotateX * Math.PI) / 180
  const ryRad = (rotateY * Math.PI) / 180

  // Project 3D rotation onto 2D homogeneous coordinates.
  // For rotateY: the X axis gets foreshortened, producing horizontal p term.
  // For rotateX: the Y axis gets foreshortened, producing vertical q term.
  const cosX = Math.cos(rxRad)
  const cosY = Math.cos(ryRad)
  const sinX = Math.sin(rxRad)
  const sinY = Math.sin(ryRad)

  // Perspective divisor terms
  const p = -sinY / distance // horizontal vanishing
  const q = sinX / distance  // vertical vanishing

  // Scale factors from 3D projection (foreshortening)
  const a = cosY             // X scale from Y rotation
  const d = cosX             // Y scale from X rotation

  return new Float64Array([a, 0, 0, 0, d, 0, p, q, 1])
}

// ── Operations ──

/** Multiply two 3×3 matrices: result = A × B */
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

/** Invert a 3×3 matrix. Returns null if singular (det ≈ 0). */
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
  return new Float64Array([
    A * inv, D * inv, G * inv,
    B * inv, E * inv, H * inv,
    C * inv, F * inv, I * inv,
  ])
}

/**
 * Transform a point through the matrix (projective division included).
 * Returns the transformed (x, y) coordinates.
 */
export function transformPoint(m: Matrix3, x: number, y: number): { x: number; y: number } {
  const w = m[6] * x + m[7] * y + m[8]
  if (Math.abs(w) < 1e-12) return { x: 0, y: 0 }
  return {
    x: (m[0] * x + m[1] * y + m[2]) / w,
    y: (m[3] * x + m[4] * y + m[5]) / w,
  }
}

/**
 * Compute the axis-aligned bounding box of a rectangle after transformation.
 * Used to determine the output buffer size for a transformed element.
 */
export function transformBounds(
  m: Matrix3,
  w: number,
  h: number
): { x: number; y: number; width: number; height: number } {
  // Transform all 4 corners (origin at 0,0)
  const p0 = transformPoint(m, 0, 0)
  const p1 = transformPoint(m, w, 0)
  const p2 = transformPoint(m, w, h)
  const p3 = transformPoint(m, 0, h)

  const minX = Math.min(p0.x, p1.x, p2.x, p3.x)
  const minY = Math.min(p0.y, p1.y, p2.y, p3.y)
  const maxX = Math.max(p0.x, p1.x, p2.x, p3.x)
  const maxY = Math.max(p0.y, p1.y, p2.y, p3.y)

  return {
    x: Math.floor(minX),
    y: Math.floor(minY),
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
  }
}

/**
 * Build a complete transform matrix from declarative props.
 * Applies transforms in CSS order: translate → rotate → scale → skew → perspective.
 * The transformOrigin shifts the coordinate system before rotation/scale/skew.
 *
 * @param config   Declarative transform config from JSX props
 * @param originX  Origin X in pixels (relative to element's own coordinate space)
 * @param originY  Origin Y in pixels (relative to element's own coordinate space)
 */
export function fromConfig(
  config: {
    translateX?: number
    translateY?: number
    rotate?: number
    scale?: number
    scaleX?: number
    scaleY?: number
    skewX?: number
    skewY?: number
    perspective?: number
    rotateX?: number
    rotateY?: number
  },
  originX: number,
  originY: number
): Matrix3 {
  let m = identity()

  // 1. Translate to position
  if (config.translateX || config.translateY) {
    m = multiply(m, translate(config.translateX || 0, config.translateY || 0))
  }

  // 2. Move origin to transform center
  if (originX !== 0 || originY !== 0) {
    m = multiply(m, translate(originX, originY))
  }

  // 3. Perspective (must be before rotate/scale for proper foreshortening)
  if (config.perspective && (config.rotateX || config.rotateY)) {
    m = multiply(m, perspective(config.perspective, config.rotateX, config.rotateY))
  }

  // 4. Rotate
  if (config.rotate) {
    m = multiply(m, rotate(config.rotate))
  }

  // 5. Scale
  const sx = config.scaleX ?? config.scale ?? 1
  const sy = config.scaleY ?? config.scale ?? 1
  if (sx !== 1 || sy !== 1) {
    m = multiply(m, scaleXY(sx, sy))
  }

  // 6. Skew
  if (config.skewX || config.skewY) {
    m = multiply(m, skew(config.skewX || 0, config.skewY || 0))
  }

  // 7. Move origin back
  if (originX !== 0 || originY !== 0) {
    m = multiply(m, translate(-originX, -originY))
  }

  return m
}

/**
 * Check if a matrix is the identity (no transform needed).
 * Used to skip the transform pipeline for untransformed nodes.
 */
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
