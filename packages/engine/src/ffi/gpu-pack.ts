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

export const CMD_SHAPE_RECT = 1
export const STRIDE_SHAPE_RECT = 80

export const CMD_SHAPE_RECT_CORNERS = 2
export const STRIDE_SHAPE_RECT_CORNERS = 96

export const CMD_GLOW = 6
export const STRIDE_GLOW = 48

export const CMD_IMAGE = 9
export const STRIDE_IMAGE = 32

export const CMD_IMAGE_TRANSFORM = 10
export const STRIDE_IMAGE_TRANSFORM = 48

export const CMD_LINEAR_GRADIENT = 12
export const STRIDE_LINEAR_GRADIENT = 80

export const CMD_RADIAL_GRADIENT = 13
export const STRIDE_RADIAL_GRADIENT = 80

export const CMD_SHADOW = 20
export const STRIDE_SHADOW = 80

/**
 * Pack BridgeShapeRectInstance (20 floats, 80 bytes) directly into DataView for cmd_kind=1.
 */
export function packShapeRectDirect(
  v: DataView, offset: number,
  x: number, y: number, w: number, h: number,
  boxW: number, boxH: number, radius: number,
  fill: number, stroke: number, strokeWidth: number,
): void {
  const hasFill = (fill & 0xff) > 0 ? 1.0 : 0.0
  const hasStroke = strokeWidth > 0 && (stroke & 0xff) > 0 ? 1.0 : 0.0
  vf32(v, offset, x); vf32(v, offset + 4, y); vf32(v, offset + 8, w); vf32(v, offset + 12, h)
  writeColorF32(v, offset + 16, fill)
  writeColorF32(v, offset + 32, stroke)
  vf32(v, offset + 48, radius); vf32(v, offset + 52, strokeWidth); vf32(v, offset + 56, hasFill); vf32(v, offset + 60, hasStroke)
  vf32(v, offset + 64, boxW); vf32(v, offset + 68, boxH); vf32(v, offset + 72, 0); vf32(v, offset + 76, 0)
}

/**
 * Pack BridgeShapeRectCornersInstance (24 floats, 96 bytes) directly into DataView for cmd_kind=2.
 */
export function packShapeRectCornersDirect(
  v: DataView, offset: number,
  x: number, y: number, w: number, h: number,
  boxW: number, boxH: number, radii: WgpuCanvasCornerRadii,
  fill: number, stroke: number, strokeWidth: number,
): void {
  const hasFill = (fill & 0xff) > 0 ? 1.0 : 0.0
  const hasStroke = strokeWidth > 0 && (stroke & 0xff) > 0 ? 1.0 : 0.0
  vf32(v, offset, x); vf32(v, offset + 4, y); vf32(v, offset + 8, w); vf32(v, offset + 12, h)
  writeColorF32(v, offset + 16, fill)
  writeColorF32(v, offset + 32, stroke)
  vf32(v, offset + 48, radii.tl); vf32(v, offset + 52, radii.tr); vf32(v, offset + 56, radii.br); vf32(v, offset + 60, radii.bl)
  vf32(v, offset + 64, strokeWidth); vf32(v, offset + 68, hasFill); vf32(v, offset + 72, hasStroke); vf32(v, offset + 76, boxW)
  vf32(v, offset + 80, boxH); vf32(v, offset + 84, 0); vf32(v, offset + 88, 0); vf32(v, offset + 92, 0)
}

/**
 * Pack BridgeGlowInstance (12 floats, 48 bytes) directly into DataView for cmd_kind=6.
 */
export function packGlowDirect(
  v: DataView, offset: number,
  x: number, y: number, w: number, h: number,
  color: number, intensity: number,
): void {
  vf32(v, offset, x); vf32(v, offset + 4, y); vf32(v, offset + 8, w); vf32(v, offset + 12, h)
  writeColorF32(v, offset + 16, color)
  vf32(v, offset + 32, intensity); vf32(v, offset + 36, 0); vf32(v, offset + 40, 0); vf32(v, offset + 44, 0)
}

/**
 * Pack BridgeShadowInstance (20 floats, 80 bytes) directly into DataView for cmd_kind=20.
 */
export function packShadowDirect(
  v: DataView, offset: number,
  x: number, y: number, w: number, h: number,
  color: number, radii: WgpuCanvasCornerRadii,
  boxW: number, boxH: number,
  offsetX: number, offsetY: number, blur: number,
): void {
  const bytes = packShadowInstance(x, y, w, h, color, radii, boxW, boxH, offsetX, offsetY, blur)
  new Uint8Array(v.buffer, v.byteOffset + offset, 80).set(bytes)
}

/**
 * Pack BridgeLinearGradientInstance (20 floats, 80 bytes) directly into DataView for cmd_kind=12.
 */
export function packLinearGradientDirect(
  v: DataView, offset: number,
  x: number, y: number, w: number, h: number,
  boxW: number, boxH: number, radius: number,
  from: number, to: number, dirX: number, dirY: number,
): void {
  vf32(v, offset, x); vf32(v, offset + 4, y); vf32(v, offset + 8, w); vf32(v, offset + 12, h)
  vf32(v, offset + 16, boxW); vf32(v, offset + 20, boxH); vf32(v, offset + 24, radius); vf32(v, offset + 28, 0)
  writeColorF32(v, offset + 32, from)
  writeColorF32(v, offset + 48, to)
  vf32(v, offset + 64, dirX); vf32(v, offset + 68, dirY); vf32(v, offset + 72, 0); vf32(v, offset + 76, 0)
}

/**
 * Pack BridgeRadialGradientInstance (20 floats, 80 bytes) directly into DataView for cmd_kind=13.
 */
export function packRadialGradientDirect(
  v: DataView, offset: number,
  x: number, y: number, w: number, h: number,
  boxW: number, boxH: number, radius: number,
  from: number, to: number,
): void {
  vf32(v, offset, x); vf32(v, offset + 4, y); vf32(v, offset + 8, w); vf32(v, offset + 12, h)
  vf32(v, offset + 16, boxW); vf32(v, offset + 20, boxH); vf32(v, offset + 24, radius); vf32(v, offset + 28, 0)
  writeColorF32(v, offset + 32, from)
  writeColorF32(v, offset + 48, to)
  vf32(v, offset + 64, 0); vf32(v, offset + 68, 0); vf32(v, offset + 72, 0); vf32(v, offset + 76, 0)
}

/**
 * Pack BridgeShapeRectInstance (20 floats) for cmd_kind=1.
 */
export function packShapeRectInstance(x: number, y: number, w: number, h: number, boxW: number, boxH: number, radius: number, fill: number, stroke: number, strokeWidth: number): Uint8Array {
  packShapeRectDirect(_packView, 0, x, y, w, h, boxW, boxH, radius, fill, stroke, strokeWidth)
  return _packU8.subarray(0, 80)
}

/**
 * Pack BridgeShapeRectCornersInstance (24 floats) for cmd_kind=2.
 */
export function packShapeRectCornersInstance(x: number, y: number, w: number, h: number, boxW: number, boxH: number, radii: WgpuCanvasCornerRadii, fill: number, stroke: number, strokeWidth: number): Uint8Array {
  packShapeRectCornersDirect(_packView, 0, x, y, w, h, boxW, boxH, radii, fill, stroke, strokeWidth)
  return _packU8.subarray(0, 96)
}

/**
 * Pack BridgeGlowInstance (12 floats) for cmd_kind=6.
 */
export function packGlowInstance(x: number, y: number, w: number, h: number, color: number, intensity: number): Uint8Array {
  packGlowDirect(_packView, 0, x, y, w, h, color, intensity)
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
  packLinearGradientDirect(_packView, 0, x, y, w, h, boxW, boxH, radius, from, to, dirX, dirY)
  return _packU8.subarray(0, 80)
}

/**
 * Pack BridgeRadialGradientInstance (20 floats) for cmd_kind=13.
 */
export function packRadialGradientInstance(x: number, y: number, w: number, h: number, boxW: number, boxH: number, radius: number, from: number, to: number): Uint8Array {
  packRadialGradientDirect(_packView, 0, x, y, w, h, boxW, boxH, radius, from, to)
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
  fitX = 0,
  fitY = 0,
): Uint8Array {
  const v = _packView
  vf32(v, 0,  p0x); vf32(v, 4,  p0y)
  vf32(v, 8,  p1x); vf32(v, 12, p1y)
  vf32(v, 16, p2x); vf32(v, 20, p2y)
  vf32(v, 24, p3x); vf32(v, 28, p3y)
  vf32(v, 32, opacity); vf32(v, 36, fitX); vf32(v, 40, fitY); vf32(v, 44, 0)
  return _packU8.subarray(0, 48)
}
