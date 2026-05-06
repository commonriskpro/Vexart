/**
 * gpu-pack.ts — GPU instance buffer packing helpers.
 *
 * Pre-allocated scratch buffers and type-safe pack functions for each
 * WGPU cmd_kind. Extracted from gpu-renderer-backend.ts to reduce its
 * 2500+ line size and isolate the buffer packing concern.
 *
 * All pack functions write into a shared scratch buffer and return a
 * subarray view — callers must consume or copy before the next pack call.
 */

// ── Scratch buffers (reused across all pack calls) ───────────────────────

const PACK_MAX = 256
const _packBuf = new ArrayBuffer(PACK_MAX)
const _packView = new DataView(_packBuf)

/** Shared scratch buffer — exported for direct byte-copy in hot paths (HP-3). */
export const _packU8 = new Uint8Array(_packBuf)

// ── DataView write helpers ───────────────────────────────────────────────

/** Write u16 little-endian at offset in DataView */
export function vu16(view: DataView, offset: number, val: number) { view.setUint16(offset, val, true) }
/** Write u32 little-endian at offset in DataView */
export function vu32(view: DataView, offset: number, val: number) { view.setUint32(offset, val, true) }
/** Write f32 little-endian at offset in DataView */
export function vf32(view: DataView, offset: number, val: number) { view.setFloat32(offset, val, true) }

/** Write RGBA u32 as 4 floats at the given byte offset. */
export function writeColorF32(v: DataView, offset: number, color: number) {
  vf32(v, offset, ((color >>> 24) & 0xff) / 255)
  vf32(v, offset + 4, ((color >>> 16) & 0xff) / 255)
  vf32(v, offset + 8, ((color >>> 8) & 0xff) / 255)
  vf32(v, offset + 12, (color & 0xff) / 255)
}

// ── Shape types ──────────────────────────────────────────────────────────

import type { CornerRadii } from "./node"
export type WgpuCanvasCornerRadii = CornerRadii

export type WgpuCanvasShapeRect = {
  x: number; y: number; w: number; h: number
  boxW: number; boxH: number
  radius: number; strokeWidth: number
  fill?: number; stroke?: number
}

export type WgpuCanvasShapeRectCorners = {
  x: number; y: number; w: number; h: number
  boxW: number; boxH: number
  radii: WgpuCanvasCornerRadii
  strokeWidth: number
  fill?: number; stroke?: number
}

export type WgpuCanvasGlow = { x: number; y: number; w: number; h: number; color: number; intensity: number }

export type WgpuCanvasShadow = {
  x: number; y: number; w: number; h: number
  color: number
  radii: WgpuCanvasCornerRadii
  boxW: number; boxH: number
  offsetX: number; offsetY: number
  blur: number
}

// ── Pack functions ───────────────────────────────────────────────────────

/**
 * Pack BridgeShapeRectInstance (20 floats) for cmd_kind=1.
 */
export function packShapeRectInstance(x: number, y: number, w: number, h: number, boxW: number, boxH: number, radius: number, fill: number, stroke: number, strokeWidth: number): Uint8Array {
  const v = _packView
  const hasFill = (fill & 0xff) > 0 ? 1.0 : 0.0
  const hasStroke = strokeWidth > 0 && (stroke & 0xff) > 0 ? 1.0 : 0.0
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  writeColorF32(v, 16, fill)
  writeColorF32(v, 32, stroke)
  vf32(v, 48, radius); vf32(v, 52, strokeWidth); vf32(v, 56, hasFill); vf32(v, 60, hasStroke)
  vf32(v, 64, boxW); vf32(v, 68, boxH); vf32(v, 72, 0); vf32(v, 76, 0)
  return _packU8.subarray(0, 80)
}

/**
 * Pack BridgeShapeRectCornersInstance (24 floats) for cmd_kind=2.
 */
export function packShapeRectCornersInstance(x: number, y: number, w: number, h: number, boxW: number, boxH: number, radii: WgpuCanvasCornerRadii, fill: number, stroke: number, strokeWidth: number): Uint8Array {
  const v = _packView
  const hasFill = (fill & 0xff) > 0 ? 1.0 : 0.0
  const hasStroke = strokeWidth > 0 && (stroke & 0xff) > 0 ? 1.0 : 0.0
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  writeColorF32(v, 16, fill)
  writeColorF32(v, 32, stroke)
  vf32(v, 48, radii.tl); vf32(v, 52, radii.tr); vf32(v, 56, radii.br); vf32(v, 60, radii.bl)
  vf32(v, 64, strokeWidth); vf32(v, 68, hasFill); vf32(v, 72, hasStroke); vf32(v, 76, boxW)
  vf32(v, 80, boxH); vf32(v, 84, 0); vf32(v, 88, 0); vf32(v, 92, 0)
  return _packU8.subarray(0, 96)
}

/**
 * Pack BridgeGlowInstance (12 floats) for cmd_kind=6.
 */
export function packGlowInstance(x: number, y: number, w: number, h: number, color: number, intensity: number): Uint8Array {
  const v = _packView
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  writeColorF32(v, 16, color)
  vf32(v, 32, intensity); vf32(v, 36, 0); vf32(v, 40, 0); vf32(v, 44, 0)
  return _packU8.subarray(0, 48)
}

/**
 * Pack BridgeShadowInstance (20 floats) for cmd_kind=20.
 */
export function packShadowInstance(
  x: number, y: number, w: number, h: number,
  color: number, radii: WgpuCanvasCornerRadii,
  boxW: number, boxH: number,
  offsetX: number, offsetY: number, blur: number,
): Uint8Array {
  const v = _packView
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  writeColorF32(v, 16, color)
  vf32(v, 32, radii.tl); vf32(v, 36, radii.tr); vf32(v, 40, radii.br); vf32(v, 44, radii.bl)
  vf32(v, 48, boxW); vf32(v, 52, boxH); vf32(v, 56, offsetX); vf32(v, 60, offsetY)
  vf32(v, 64, blur); vf32(v, 68, 0); vf32(v, 72, 0); vf32(v, 76, 0)
  return _packU8.subarray(0, 80)
}

/**
 * Pack BridgeLinearGradientInstance (20 floats) for cmd_kind=12.
 */
export function packLinearGradientInstance(x: number, y: number, w: number, h: number, boxW: number, boxH: number, radius: number, from: number, to: number, dirX: number, dirY: number): Uint8Array {
  const v = _packView
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  vf32(v, 16, boxW); vf32(v, 20, boxH); vf32(v, 24, radius); vf32(v, 28, 0)
  writeColorF32(v, 32, from)
  writeColorF32(v, 48, to)
  vf32(v, 64, dirX); vf32(v, 68, dirY); vf32(v, 72, 0); vf32(v, 76, 0)
  return _packU8.subarray(0, 80)
}

/**
 * Pack BridgeRadialGradientInstance (20 floats) for cmd_kind=13.
 */
export function packRadialGradientInstance(x: number, y: number, w: number, h: number, boxW: number, boxH: number, radius: number, from: number, to: number): Uint8Array {
  const v = _packView
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  vf32(v, 16, boxW); vf32(v, 20, boxH); vf32(v, 24, radius); vf32(v, 28, 0)
  writeColorF32(v, 32, from)
  writeColorF32(v, 48, to)
  vf32(v, 64, 0); vf32(v, 68, 0); vf32(v, 72, 0); vf32(v, 76, 0)
  return _packU8.subarray(0, 80)
}

/**
 * Pack BridgeImageInstance (8 floats) for cmd_kind=9.
 */
export function packImageInstance(x: number, y: number, w: number, h: number, opacity: number): Uint8Array {
  const v = _packView
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  vf32(v, 16, opacity); vf32(v, 20, 0); vf32(v, 24, 0); vf32(v, 28, 0)
  return _packU8.subarray(0, 32)
}

/**
 * Pack BridgeImageTransformInstance (12 floats) for cmd_kind=10.
 */
export function packImageTransformInstance(
  p0x: number, p0y: number, p1x: number, p1y: number,
  p2x: number, p2y: number, p3x: number, p3y: number,
  opacity: number,
): Uint8Array {
  const v = _packView
  vf32(v, 0,  p0x); vf32(v, 4,  p0y)
  vf32(v, 8,  p1x); vf32(v, 12, p1y)
  vf32(v, 16, p2x); vf32(v, 20, p2y)
  vf32(v, 24, p3x); vf32(v, 28, p3y)
  vf32(v, 32, opacity); vf32(v, 36, 0); vf32(v, 40, 0); vf32(v, 44, 0)
  return _packU8.subarray(0, 48)
}
