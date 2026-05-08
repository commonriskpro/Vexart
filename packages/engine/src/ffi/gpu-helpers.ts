/**
 * gpu-helpers.ts — Record types, bounds helpers, and pure utility functions
 * for the GPU renderer backend.
 *
 * Extracted from gpu-renderer-backend.ts to isolate type definitions and
 * stateless helper functions that don't depend on closure state.
 */

import { transformBounds } from "./matrix"
import type { EffectRenderOp, RectangleRenderOp, RenderGraphOp } from "./render-graph"
import type { TransformQuad } from "./damage"
import type { VexartTargetHandle, VexartImageHandle } from "./gpu-composite-ops"

// ── Record types (used by cache Maps inside createGpuRendererBackend) ─────

export type TargetRecord = {
  key: string
  width: number
  height: number
  handle: VexartTargetHandle
}

export type RenderedLayerRecord = {
  key: string
  z: number
  x: number
  y: number
  width: number
  height: number
  handle: VexartTargetHandle
  isBackground: boolean
  subtreeTransform: TransformQuad | null
  opacity: number
}

export type ImageRecord = {
  handle: VexartImageHandle
  width: number
  height: number
}

export type TransformSpriteRecord = {
  key: string
  handle: VexartImageHandle
  width: number
  height: number
}

export type CanvasSpriteRecord = {
  key: string
  handle: VexartImageHandle
  width: number
  height: number
  data: Uint8Array
}

export type BackdropSourceRecord = {
  key: string
  frameId: number
  bounds: IntBounds
  handle: VexartImageHandle
}

export type BackdropSpriteRecord = {
  key: string
  frameId: number
  bounds: IntBounds
  handle: VexartImageHandle
  width: number
  height: number
}

export type ImageInstance = {
  x: number
  y: number
  w: number
  h: number
  opacity: number
}

export type TransformedImageInstance = TransformQuad & {
  opacity: number
}

export type ImageGroup = {
  handle: VexartImageHandle
  instances: ImageInstance[]
}

export type TransformedImageGroup = {
  handle: VexartImageHandle
  instances: TransformedImageInstance[]
}

// ── IntBounds (left/top/right/bottom for GPU-side int math) ──────────────

export type IntBounds = {
  left: number
  top: number
  right: number
  bottom: number
}

export function unionBounds(a: IntBounds | null, b: IntBounds | null) {
  if (!a) return b
  if (!b) return a
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  }
}

export function boundsKey(bounds: IntBounds) {
  return `${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}`
}

export function clampBackdropBounds(bounds: { x: number; y: number; width: number; height: number }, width: number, height: number): IntBounds | null {
  const left = Math.max(0, Math.floor(bounds.x))
  const top = Math.max(0, Math.floor(bounds.y))
  const right = Math.min(width, Math.ceil(bounds.x + bounds.width))
  const bottom = Math.min(height, Math.ceil(bounds.y + bounds.height))
  if (right <= left || bottom <= top) return null
  return { left, top, right, bottom }
}

// ── Pure utility functions ───────────────────────────────────────────────

export function clampShapeRadius(radius: number, width: number, height: number) {
  return Math.max(0, Math.min(radius, width / 2, height / 2))
}

export function applyOpacityToColor(color: number, opacity: number) {
  const alpha = color & 0xff
  const nextAlpha = Math.max(0, Math.min(255, Math.round(alpha * opacity)))
  return (color & 0xffffff00) | nextAlpha
}

const matrixHashBuffer = new ArrayBuffer(8)
const matrixHashView = new DataView(matrixHashBuffer)

export function hashMatrix(matrix: Float64Array | undefined) {
  if (!matrix) return 0
  let hash = 0x811c9dc5
  for (let i = 0; i < matrix.length; i++) {
    const value = Number.isFinite(matrix[i]) ? matrix[i] : 0
    matrixHashView.setFloat64(0, value, true)
    for (let j = 0; j < 8; j++) {
      hash ^= matrixHashView.getUint8(j)
      hash = Math.imul(hash, 0x01000193)
    }
  }
  return hash >>> 0
}

// ── Op support checks ────────────────────────────────────────────────────

export function isSupportedRectangle(op: RectangleRenderOp) {
  return !op.image && !op.canvas && !op.effect
}

export function isSupportedEffect(_op: EffectRenderOp) {
  return true
}

export function isSupportedOp(op: RenderGraphOp) {
  if (op.kind === "rectangle") return isSupportedRectangle(op)
  if (op.kind === "effect") return isSupportedEffect(op)
  if (op.kind === "border") return true
  if (op.kind === "text") return true
  if (op.kind === "image") return true
  if (op.kind === "canvas") return true
  return false
}

export function getUnsupportedGpuOps(ops: RenderGraphOp[]) {
  return ops.filter((op) => !isSupportedOp(op))
}

export function opBounds(op: RenderGraphOp, width: number, height: number) {
  const x = Math.round(op.x)
  const y = Math.round(op.y)
  const w = Math.round(op.width)
  const h = Math.round(op.height)
  let left = x
  let top = y
  let right = x + w
  let bottom = y + h

  if (op.kind === "border") {
    const pad = Math.max(1, op.borderWidth)
    left -= pad
    top -= pad
    right += pad
    bottom += pad
  }

  if (op.kind === "effect") {
    if (op.effect.transform) {
      const bounds = transformBounds(op.effect.transform, w, h)
      left = Math.min(left, x + bounds.x)
      top = Math.min(top, y + bounds.y)
      right = Math.max(right, x + bounds.x + bounds.width)
      bottom = Math.max(bottom, y + bounds.y + bounds.height)
    }
    if (op.effect.glow) {
      const pad = op.effect.glow.radius * 2
      left -= pad
      top -= pad
      right += pad
      bottom += pad
    }
    if (op.effect.shadow) {
      const shadows = Array.isArray(op.effect.shadow) ? op.effect.shadow : [op.effect.shadow]
      for (const s of shadows) {
        const pad = Math.ceil(s.blur) * 2
        left = Math.min(left, x + Math.min(0, s.x) - pad)
        top = Math.min(top, y + Math.min(0, s.y) - pad)
        right = Math.max(right, x + w + Math.max(0, s.x) + pad)
        bottom = Math.max(bottom, y + h + Math.max(0, s.y) + pad)
      }
    }
  }

  left = Math.max(0, left)
  top = Math.max(0, top)
  right = Math.min(width, right)
  bottom = Math.min(height, bottom)
  if (right <= left || bottom <= top) return null
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}
