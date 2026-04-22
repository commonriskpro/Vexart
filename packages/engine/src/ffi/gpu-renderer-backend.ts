// gpu-renderer-backend.ts — Phase 2 native path
// Rewired from tge_wgpu_canvas_* bridge calls to vexart_paint_dispatch + vexart_composite_*
// per design §11, §8.2 cmd_kind allocation. Shadow preserved at L1502-1521 as glow (cmd_kind=6).
// Per §17.3: shadow emits GlowInstance with offset (s.x,s.y), padding (s.blur*2).
// wgpu-canvas-bridge.ts is still imported for canvas sprite helpers (deleted in Slice 11).

import { appendFileSync } from "node:fs"
import { ptr } from "bun:ffi"
import { CanvasContext } from "./canvas"
import { getAtlas } from "./font-atlas"
import { transformBounds, transformPoint } from "./matrix"
import type { BackdropRenderMetadata, EffectRenderOp, ImageRenderOp, RectangleRenderOp, RenderGraphOp, TextRenderOp, BorderRenderOp } from "./render-graph"
import type {
  RendererBackend,
  RendererBackendFrameContext,
  RendererBackendFramePlan,
  RendererBackendFrameResult,
  RendererBackendPaintContext,
} from "./renderer-backend"
import { chooseGpuLayerStrategy, type GpuLayerStrategyMode } from "./gpu-layer-strategy"
import { getFont, layoutText } from "./text-layout"
import { openVexartLibrary } from "./vexart-bridge"
import {
  GRAPH_MAGIC, GRAPH_VERSION,
} from "./vexart-buffer"
// Phase 2 / Slice 11B: gpu-stub.ts removed. GPU target lifecycle and compositing
// operations still route through wgpu-canvas-bridge.ts (old libwgpu_canvas_bridge dylib)
// until Phase 2b ports full compositing to libvexart. Paint primitives already route
// through vexart_paint_dispatch (cmd_kinds 0-17).
// flushImages/flushTransformedImages → vexart_paint_dispatch cmd_kinds 9/10.
// flushGlyphs → DEC-011 no-op.
import {
  beginWgpuCanvasTargetLayer,
  compositeWgpuCanvasTargetImageLayer,
  createWgpuCanvasContext,
  createWgpuCanvasImage,
  createWgpuCanvasTarget,
  destroyWgpuCanvasImage,
  destroyWgpuCanvasTarget,
  endWgpuCanvasTargetLayer,
  filterWgpuCanvasImageBackdrop,
  maskWgpuCanvasImageRoundedRectCorners,
  maskWgpuCanvasImageRoundedRect,
  probeWgpuCanvasBridge,
  readbackWgpuCanvasTargetRGBA,
  renderWgpuCanvasTargetLinearGradientsLayer,
  renderWgpuCanvasTargetRadialGradientsLayer,
  renderWgpuCanvasTargetTransformedImagesLayer,
  supportsWgpuCanvasGlyphLayer,
  copyWgpuCanvasTargetRegionToImage,
  type WgpuCanvasContextHandle,
  type WgpuCanvasGlyphInstance,
  type WgpuCanvasGlow,
  type WgpuCanvasImageHandle,
  type WgpuCanvasRectFill,
  type WgpuCanvasShapeRectCorners,
  type WgpuCanvasShapeRect,
  type WgpuCanvasTargetHandle,
} from "./wgpu-canvas-bridge"
// NOTE: batchMixedSceneOps / collectSupportedMixedScene (from wgpu-mixed-scene) are
// no longer imported in Phase 2. getCanvasSprite() is short-circuited to return null
// since the showcase does not use canvas nodes. wgpu-mixed-scene becomes a 0-consumer
// orphan (deleted in Slice 11). Per design §11 Phase 2 scope.

// ── Inline gpu-raster-staging helpers ───────────────────────────────────────
// gpu-raster-staging.ts is an orphan deleted in Slice 11. The two functions it
// provides (copyGpuTargetRegionToImage, createEmptyGpuImage) are inlined here
// to avoid making gpu-raster-staging a live consumer, satisfying the orphan gate.

type GpuRasterImage = { handle: WgpuCanvasImageHandle; width: number; height: number }

function copyGpuTargetRegionToImage(
  context: WgpuCanvasContextHandle,
  target: WgpuCanvasTargetHandle,
  region: { x: number; y: number; width: number; height: number },
): GpuRasterImage {
  const copied = copyWgpuCanvasTargetRegionToImage(context, target, region)
  return { handle: copied.handle, width: region.width, height: region.height }
}

function createEmptyGpuImage(
  context: WgpuCanvasContextHandle,
  width: number,
  height: number,
): GpuRasterImage {
  const target = createWgpuCanvasTarget(context, { width, height })
  try {
    beginWgpuCanvasTargetLayer(context, target, 0, 0x00000000)
    endWgpuCanvasTargetLayer(context, target)
    return copyGpuTargetRegionToImage(context, target, { x: 0, y: 0, width, height })
  } finally {
    destroyWgpuCanvasTarget(context, target)
  }
}

// ── vexart graph buffer helpers ─────────────────────────────────────────────
// Per design §8: 16-byte header + 8-byte per-command prefix + body.
// Used by flushVexartBatch() to build the packed buffer and call vexart_paint_dispatch.

/** Write u16 little-endian at offset in DataView */
function vu16(view: DataView, offset: number, val: number) { view.setUint16(offset, val, true) }
/** Write u32 little-endian at offset in DataView */
function vu32(view: DataView, offset: number, val: number) { view.setUint32(offset, val, true) }
/** Write f32 little-endian at offset in DataView */
function vf32(view: DataView, offset: number, val: number) { view.setFloat32(offset, val, true) }

// Image upload registry: WeakMap<Uint8Array, u64 handle> for vexart_paint_upload_image.
// Handles are stored as BigInt since FFI u64 may exceed safe integer range.
const _vexartImageHandles = new WeakMap<Uint8Array, bigint>()

/** Upload an RGBA image via vexart_paint_upload_image. Returns u64 handle or 0n on failure. */
function vexartUploadImage(ctx: bigint, data: Uint8Array, width: number, height: number): bigint {
  const cached = _vexartImageHandles.get(data)
  if (cached !== undefined) return cached
  const { symbols } = openVexartLibrary()
  const handleBuf = new BigUint64Array(1)
  const handlePtr = ptr(handleBuf)
  const result = symbols.vexart_paint_upload_image(
    ctx, ptr(data), data.byteLength, width, height, 0 /* format=RGBA */, handlePtr
  ) as number
  if (result !== 0) return 0n
  const handle = handleBuf[0]
  _vexartImageHandles.set(data, handle)
  return handle
}

/** Release a vexart image handle. */
function vexartRemoveImage(ctx: bigint, handle: bigint) {
  if (!handle) return
  const { symbols } = openVexartLibrary()
  symbols.vexart_paint_remove_image(ctx, handle)
}

/** Readback RGBA from vexart context default target. Returns Uint8Array or null. */
function vexartReadbackRgba(ctx: bigint, width: number, height: number): Uint8Array | null {
  const { symbols } = openVexartLibrary()
  const size = width * height * 4
  const dst = new Uint8Array(size)
  const statsPtr = null as unknown as Uint8Array  // null ptr
  const result = symbols.vexart_composite_readback_rgba(
    ctx, 0n /* target=0: context default */, ptr(dst), size, ptr(new Uint8Array(32))
  ) as number
  if (result !== 0) return null
  return dst
}

/**
 * Build a §8 graph buffer containing the given instances and call vexart_paint_dispatch.
 * instanceData: flat packed bytes for all instances of this cmd_kind.
 * cmd_kind: one of 0-17 per §8.2.
 */
function flushVexartBatch(ctx: bigint, cmdKind: number, instanceData: Uint8Array): void {
  if (instanceData.byteLength === 0) return
  const { symbols } = openVexartLibrary()
  const PREFIX = 8
  const HEADER = 16
  const total = HEADER + PREFIX + instanceData.byteLength
  const buf = new ArrayBuffer(total)
  const view = new DataView(buf)
  // Header
  vu32(view, 0, GRAPH_MAGIC)
  vu32(view, 4, GRAPH_VERSION)
  vu32(view, 8, 1)   // cmd_count = 1
  vu32(view, 12, PREFIX + instanceData.byteLength)  // payload_bytes
  // Command prefix
  vu16(view, 16, cmdKind)
  vu16(view, 18, 0)  // flags = 0
  vu32(view, 20, instanceData.byteLength)
  // Instance data
  new Uint8Array(buf).set(instanceData, HEADER + PREFIX)
  const statsOut = new Uint8Array(32)
  symbols.vexart_paint_dispatch(ctx, 0n, ptr(new Uint8Array(buf)), total, ptr(statsOut))
}

/** Pack BridgeRectInstance (8 floats: x,y,w,h,r,g,b,a) for cmd_kind=0. */
function packRectInstance(x: number, y: number, w: number, h: number, color: number): Uint8Array {
  const r = ((color >>> 24) & 0xff) / 255
  const g = ((color >>> 16) & 0xff) / 255
  const b = ((color >>> 8) & 0xff) / 255
  const a = (color & 0xff) / 255
  const buf = new ArrayBuffer(32)
  const v = new DataView(buf)
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  vf32(v, 16, r); vf32(v, 20, g); vf32(v, 24, b); vf32(v, 28, a)
  return new Uint8Array(buf)
}

/**
 * Pack BridgeShapeRectInstance (20 floats: x,y,w,h + fill rgba + stroke rgba +
 * radius + strokeWidth + hasFill + hasStroke + sizeX + sizeY + pad*2) for cmd_kind=1.
 */
function packShapeRectInstance(x: number, y: number, w: number, h: number, boxW: number, boxH: number, radius: number, fill: number, stroke: number, strokeWidth: number): Uint8Array {
  const buf = new ArrayBuffer(80)
  const v = new DataView(buf)
  const fr = ((fill >>> 24) & 0xff) / 255; const fg = ((fill >>> 16) & 0xff) / 255; const fb = ((fill >>> 8) & 0xff) / 255; const fa = (fill & 0xff) / 255
  const sr = ((stroke >>> 24) & 0xff) / 255; const sg = ((stroke >>> 16) & 0xff) / 255; const sb = ((stroke >>> 8) & 0xff) / 255; const sa = (stroke & 0xff) / 255
  const hasFill = (fill & 0xff) > 0 ? 1.0 : 0.0
  const hasStroke = strokeWidth > 0 && (stroke & 0xff) > 0 ? 1.0 : 0.0
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  vf32(v, 16, fr); vf32(v, 20, fg); vf32(v, 24, fb); vf32(v, 28, fa)
  vf32(v, 32, sr); vf32(v, 36, sg); vf32(v, 40, sb); vf32(v, 44, sa)
  vf32(v, 48, radius); vf32(v, 52, strokeWidth); vf32(v, 56, hasFill); vf32(v, 60, hasStroke)
  vf32(v, 64, boxW); vf32(v, 68, boxH); vf32(v, 72, 0); vf32(v, 76, 0)
  return new Uint8Array(buf)
}

/**
 * Pack BridgeShapeRectCornersInstance (24 floats) for cmd_kind=2.
 */
function packShapeRectCornersInstance(x: number, y: number, w: number, h: number, boxW: number, boxH: number, radii: { tl: number; tr: number; br: number; bl: number }, fill: number, stroke: number, strokeWidth: number): Uint8Array {
  const buf = new ArrayBuffer(96)
  const v = new DataView(buf)
  const fr = ((fill >>> 24) & 0xff) / 255; const fg = ((fill >>> 16) & 0xff) / 255; const fb = ((fill >>> 8) & 0xff) / 255; const fa = (fill & 0xff) / 255
  const sr = ((stroke >>> 24) & 0xff) / 255; const sg = ((stroke >>> 16) & 0xff) / 255; const sb = ((stroke >>> 8) & 0xff) / 255; const sa = (stroke & 0xff) / 255
  const hasFill = (fill & 0xff) > 0 ? 1.0 : 0.0
  const hasStroke = strokeWidth > 0 && (stroke & 0xff) > 0 ? 1.0 : 0.0
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  vf32(v, 16, fr); vf32(v, 20, fg); vf32(v, 24, fb); vf32(v, 28, fa)
  vf32(v, 32, sr); vf32(v, 36, sg); vf32(v, 40, sb); vf32(v, 44, sa)
  vf32(v, 48, radii.tl); vf32(v, 52, radii.tr); vf32(v, 56, radii.br); vf32(v, 60, radii.bl)
  vf32(v, 64, strokeWidth); vf32(v, 68, hasFill); vf32(v, 72, hasStroke); vf32(v, 76, boxW)
  vf32(v, 80, boxH); vf32(v, 84, 0); vf32(v, 88, 0); vf32(v, 92, 0)
  return new Uint8Array(buf)
}

/**
 * Pack BridgeGlowInstance (12 floats: x,y,w,h + r,g,b,a + intensity + pad*3) for cmd_kind=6.
 * Used for both glow and shadow (shadow = glow with offset-adjusted rect per §17.3).
 */
function packGlowInstance(x: number, y: number, w: number, h: number, color: number, intensity: number): Uint8Array {
  const buf = new ArrayBuffer(48)
  const v = new DataView(buf)
  const r = ((color >>> 24) & 0xff) / 255; const g = ((color >>> 16) & 0xff) / 255; const b = ((color >>> 8) & 0xff) / 255; const a = (color & 0xff) / 255
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  vf32(v, 16, r); vf32(v, 20, g); vf32(v, 24, b); vf32(v, 28, a)
  vf32(v, 32, intensity); vf32(v, 36, 0); vf32(v, 40, 0); vf32(v, 44, 0)
  return new Uint8Array(buf)
}

/**
 * Pack BridgeLinearGradientInstance (20 floats) for cmd_kind=12.
 */
function packLinearGradientInstance(x: number, y: number, w: number, h: number, boxW: number, boxH: number, radius: number, from: number, to: number, dirX: number, dirY: number): Uint8Array {
  const buf = new ArrayBuffer(80)
  const v = new DataView(buf)
  const fr = ((from >>> 24) & 0xff) / 255; const fg = ((from >>> 16) & 0xff) / 255; const fb = ((from >>> 8) & 0xff) / 255; const fa = (from & 0xff) / 255
  const tr = ((to >>> 24) & 0xff) / 255; const tg = ((to >>> 16) & 0xff) / 255; const tb = ((to >>> 8) & 0xff) / 255; const ta = (to & 0xff) / 255
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  vf32(v, 16, boxW); vf32(v, 20, boxH); vf32(v, 24, radius); vf32(v, 28, 0)
  vf32(v, 32, fr); vf32(v, 36, fg); vf32(v, 40, fb); vf32(v, 44, fa)
  vf32(v, 48, tr); vf32(v, 52, tg); vf32(v, 56, tb); vf32(v, 60, ta)
  vf32(v, 64, dirX); vf32(v, 68, dirY); vf32(v, 72, 0); vf32(v, 76, 0)
  return new Uint8Array(buf)
}

/**
 * Pack BridgeRadialGradientInstance (20 floats) for cmd_kind=13.
 */
function packRadialGradientInstance(x: number, y: number, w: number, h: number, boxW: number, boxH: number, radius: number, from: number, to: number): Uint8Array {
  const buf = new ArrayBuffer(80)
  const v = new DataView(buf)
  const fr = ((from >>> 24) & 0xff) / 255; const fg = ((from >>> 16) & 0xff) / 255; const fb = ((from >>> 8) & 0xff) / 255; const fa = (from & 0xff) / 255
  const tr = ((to >>> 24) & 0xff) / 255; const tg = ((to >>> 16) & 0xff) / 255; const tb = ((to >>> 8) & 0xff) / 255; const ta = (to & 0xff) / 255
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  vf32(v, 16, boxW); vf32(v, 20, boxH); vf32(v, 24, radius); vf32(v, 28, 0)
  vf32(v, 32, fr); vf32(v, 36, fg); vf32(v, 40, fb); vf32(v, 44, fa)
  vf32(v, 48, tr); vf32(v, 52, tg); vf32(v, 56, tb); vf32(v, 60, ta)
  vf32(v, 64, 0); vf32(v, 68, 0); vf32(v, 72, 0); vf32(v, 76, 0)
  return new Uint8Array(buf)
}

/**
 * Pack BridgeImageInstance (8 floats: x,y,w,h, opacity, _pad×3) for cmd_kind=9.
 * Per native/libvexart/src/paint/instances.rs BridgeImageInstance.
 * Byte size: 8 × 4 = 32 bytes.
 */
function packImageInstance(x: number, y: number, w: number, h: number, opacity: number): Uint8Array {
  const buf = new ArrayBuffer(32)
  const v = new DataView(buf)
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  vf32(v, 16, opacity); vf32(v, 20, 0); vf32(v, 24, 0); vf32(v, 28, 0)
  return new Uint8Array(buf)
}

/**
 * Pack BridgeImageTransformInstance (12 floats: p0x/p0y, p1x/p1y, p2x/p2y, p3x/p3y, opacity, _pad×3) for cmd_kind=10.
 * Per native/libvexart/src/paint/instances.rs BridgeImageTransformInstance.
 * Byte size: 12 × 4 = 48 bytes.
 */
function packImageTransformInstance(
  p0x: number, p0y: number, p1x: number, p1y: number,
  p2x: number, p2y: number, p3x: number, p3y: number,
  opacity: number,
): Uint8Array {
  const buf = new ArrayBuffer(48)
  const v = new DataView(buf)
  vf32(v, 0,  p0x); vf32(v, 4,  p0y)
  vf32(v, 8,  p1x); vf32(v, 12, p1y)
  vf32(v, 16, p2x); vf32(v, 20, p2y)
  vf32(v, 24, p3x); vf32(v, 28, p3y)
  vf32(v, 32, opacity); vf32(v, 36, 0); vf32(v, 40, 0); vf32(v, 44, 0)
  return new Uint8Array(buf)
}

export type GpuRendererBackend = RendererBackend & {
  getLastStrategy: () => GpuLayerStrategyMode | null
}

export type GpuRendererBackendCacheStats = {
  layerTargetCount: number
  layerTargetBytes: number
  textImageCount: number
  textImageBytes: number
  glyphAtlasCount: number
  glyphAtlasBytes: number
  canvasSpriteCount: number
  canvasSpriteBytes: number
  transformSpriteCount: number
  transformSpriteBytes: number
  fallbackSpriteCount: number
  fallbackSpriteBytes: number
  backdropSourceCount: number
  backdropSourceBytes: number
  backdropSpriteCount: number
  backdropSpriteBytes: number
}

const MAX_GPU_GLYPH_ATLASES = 32
const MAX_GPU_CANVAS_SPRITES = 64
const MAX_GPU_TRANSFORM_SPRITES = 64

let gpuRendererBackendStatsProvider: (() => GpuRendererBackendCacheStats) | null = null

function touchMapEntry<K, V>(cache: Map<K, V>, key: K, value: V) {
  cache.delete(key)
  cache.set(key, value)
}

export function getGpuRendererBackendCacheStats(): GpuRendererBackendCacheStats {
  return gpuRendererBackendStatsProvider?.() ?? {
    layerTargetCount: 0,
    layerTargetBytes: 0,
    textImageCount: 0,
    textImageBytes: 0,
    glyphAtlasCount: 0,
    glyphAtlasBytes: 0,
    canvasSpriteCount: 0,
    canvasSpriteBytes: 0,
    transformSpriteCount: 0,
    transformSpriteBytes: 0,
    fallbackSpriteCount: 0,
    fallbackSpriteBytes: 0,
    backdropSourceCount: 0,
    backdropSourceBytes: 0,
    backdropSpriteCount: 0,
    backdropSpriteBytes: 0,
  }
}

const GPU_RENDERER_DEBUG = process.env.TGE_DEBUG_GPU_RENDERER === "1"
const GPU_RENDERER_DEBUG_LOG = "/tmp/tge-gpu-renderer.log"
const RESIZE_DEBUG = process.env.TGE_DEBUG_RESIZE === "1"
const FORCED_LAYER_STRATEGY = process.env.TGE_GPU_FORCE_LAYER_STRATEGY === "layered-raw" || process.env.TGE_GPU_FORCE_LAYER_STRATEGY === "final-frame-raw"
  ? process.env.TGE_GPU_FORCE_LAYER_STRATEGY
  : null

function logGpuRenderer(message: string) {
  if (!GPU_RENDERER_DEBUG) return
  appendFileSync(GPU_RENDERER_DEBUG_LOG, message + "\n")
}

function logGpuResize(message: string) {
  if (!RESIZE_DEBUG) return
  appendFileSync(GPU_RENDERER_DEBUG_LOG, `[resize] ${message}\n`)
}

function failGpuOnly(message: string): never {
  throw new Error(`TGE GPU-only renderer: ${message}`)
}

type TargetRecord = {
  key: string
  width: number
  height: number
  handle: WgpuCanvasTargetHandle
}

type RenderedLayerRecord = {
  key: string
  z: number
  x: number
  y: number
  width: number
  height: number
  handle: WgpuCanvasTargetHandle
  isBackground: boolean
  subtreeTransform:
    | {
        p0: { x: number; y: number }
        p1: { x: number; y: number }
        p2: { x: number; y: number }
        p3: { x: number; y: number }
      }
    | null
}

type ImageRecord = {
  handle: WgpuCanvasImageHandle
  width: number
  height: number
}

type GlyphAtlasRecord = {
  handle: WgpuCanvasImageHandle
  cellWidth: number
  cellHeight: number
  columns: number
  rows: number
  glyphWidths: Float32Array
  ascender: number
  /** Returns glyphIndex for a codepoint, or -1 if not in atlas. */
  indexFor: (cp: number) => number
}

type CanvasSpriteRecord = {
  key: string
  handle: WgpuCanvasImageHandle
  width: number
  height: number
  usedThisFrame: boolean
  unusedFrames: number
}

type TransformSpriteRecord = {
  key: string
  handle: WgpuCanvasImageHandle
  width: number
  height: number
}

type BackdropSourceRecord = {
  key: string
  frameId: number
  bounds: IntBounds
  handle: WgpuCanvasImageHandle
}

type BackdropSpriteRecord = {
  key: string
  frameId: number
  bounds: IntBounds
  handle: WgpuCanvasImageHandle
  width: number
  height: number
}

type ImageInstance = {
  x: number
  y: number
  w: number
  h: number
  opacity: number
}

type TransformedImageInstance = {
  p0: { x: number; y: number }
  p1: { x: number; y: number }
  p2: { x: number; y: number }
  p3: { x: number; y: number }
  opacity: number
}

type ImageGroup = {
  handle: WgpuCanvasImageHandle
  instances: ImageInstance[]
}

type GlyphGroup = {
  handle: WgpuCanvasImageHandle
  instances: WgpuCanvasGlyphInstance[]
}

type TransformedImageGroup = {
  handle: WgpuCanvasImageHandle
  instances: TransformedImageInstance[]
}

type DirtyBoundsRect = {
  left: number
  top: number
  right: number
  bottom: number
}

type IntBounds = {
  left: number
  top: number
  right: number
  bottom: number
}

function unionBounds(a: IntBounds | null, b: IntBounds | null) {
  if (!a) return b
  if (!b) return a
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  }
}

function boundsKey(bounds: IntBounds) {
  return `${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}`
}

function clampBackdropBounds(bounds: { x: number; y: number; width: number; height: number }, width: number, height: number): IntBounds | null {
  const left = Math.max(0, Math.floor(bounds.x))
  const top = Math.max(0, Math.floor(bounds.y))
  const right = Math.min(width, Math.ceil(bounds.x + bounds.width))
  const bottom = Math.min(height, Math.ceil(bounds.y + bounds.height))
  if (right <= left || bottom <= top) return null
  return { left, top, right, bottom }
}

function clampShapeRadius(radius: number, width: number, height: number) {
  return Math.max(0, Math.min(radius, width / 2, height / 2))
}

function applyOpacityToColor(color: number, opacity: number) {
  const alpha = color & 0xff
  const nextAlpha = Math.max(0, Math.min(255, Math.round(alpha * opacity)))
  return (color & 0xffffff00) | nextAlpha
}

const matrixHashBuffer = new ArrayBuffer(8)
const matrixHashView = new DataView(matrixHashBuffer)

function hashMatrix(matrix: Float64Array | undefined) {
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

function isSupportedRectangle(op: RectangleRenderOp) {
  return !op.inputs.image && !op.inputs.canvas && !op.inputs.effect
}

function isSupportedEffect(op: EffectRenderOp) {
  return true
}

function isSupportedBorder(_op: BorderRenderOp) {
  return true
}

function isSupportedText(_op: TextRenderOp) {
  return true
}

function isSupportedImage(_op: ImageRenderOp) {
  return true
}

function isSupportedOp(op: RenderGraphOp) {
  if (op.kind === "rectangle") return isSupportedRectangle(op)
  if (op.kind === "effect") return isSupportedEffect(op)
  if (op.kind === "border") return isSupportedBorder(op)
  if (op.kind === "text") return isSupportedText(op)
  if (op.kind === "image") return isSupportedImage(op)
  if (op.kind === "canvas") return true
  return false
}

function getUnsupportedGpuOps(ops: RenderGraphOp[]) {
  return ops.filter((op) => !isSupportedOp(op))
}

function opBounds(op: RenderGraphOp, width: number, height: number) {
  const x = Math.round(op.command.x)
  const y = Math.round(op.command.y)
  const w = Math.round(op.command.width)
  const h = Math.round(op.command.height)
  let left = x
  let top = y
  let right = x + w
  let bottom = y + h

  if (op.kind === "border") {
    const pad = Math.max(1, op.inputs.width)
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

export function createGpuRendererBackend(): GpuRendererBackend {
  const probe = probeWgpuCanvasBridge()
  const gpuAvailable = probe.available
  const context = gpuAvailable ? createWgpuCanvasContext() : null

  // vexart context handle — allocated on first use.
  // Phase 2: used for vexart_paint_dispatch (flush) and readback.
  let _vexartCtx: bigint | null = null
  function getVexartCtx(): bigint {
    if (_vexartCtx !== null) return _vexartCtx
    const { symbols } = openVexartLibrary()
    const ctxBuf = new BigUint64Array(1)
    // Bun FFI rejects zero-length ArrayBufferView for ptr(); use 1-byte dummy.
    const optsPtr = ptr(new Uint8Array(1))
    const result = symbols.vexart_context_create(optsPtr, 0, ptr(ctxBuf)) as number
    if (result !== 0) return 0n
    _vexartCtx = ctxBuf[0]
    return _vexartCtx
  }
  let lastStrategy: GpuLayerStrategyMode | null = null
  let standaloneTarget: TargetRecord | null = null
  let finalFrameTarget: TargetRecord | null = null
  const layerTargets = new Map<string, TargetRecord>()
  const glyphAtlases = new Map<string, GlyphAtlasRecord>()
  const imageCache = new WeakMap<Uint8Array, ImageRecord>()
  const canvasSpriteCache = new Map<string, CanvasSpriteRecord>()
  const transformSpriteCache = new Map<string, TransformSpriteRecord>()
  const backdropSourceCache = new Map<string, BackdropSourceRecord>()
  const backdropSpriteCache = new Map<string, BackdropSpriteRecord>()
  const canvasFunctionIds = new WeakMap<Function, number>()
  let nextCanvasFunctionId = 1
  let frameGeneration = 0
  let framesSinceStrategyChange = 0
  let currentFrame: RendererBackendFrameContext | null = null
  let currentFrameLayers: RenderedLayerRecord[] = []
  let renderOpToImage: ((op: RenderGraphOp, width: number, height: number, offsetX: number, offsetY: number) => WgpuCanvasImageHandle | null) | null = null
  const activeLayerKeys = new Set<string>()
  let suppressFinalPresentation = false
  let lastStrategyTelemetry: {
    preferred: GpuLayerStrategyMode | null
    chosen: GpuLayerStrategyMode | null
    estimatedLayeredBytes: number
    estimatedFinalBytes: number
  } = {
    preferred: null,
    chosen: null,
    estimatedLayeredBytes: 0,
    estimatedFinalBytes: 0,
  }
  const rects: WgpuCanvasRectFill[] = []
  const shapeRects: WgpuCanvasShapeRect[] = []
  const shapeRectCorners: WgpuCanvasShapeRectCorners[] = []
  const linearGradients: Parameters<typeof renderWgpuCanvasTargetLinearGradientsLayer>[2] = []
  const radialGradients: Parameters<typeof renderWgpuCanvasTargetRadialGradientsLayer>[2] = []
  const glows: WgpuCanvasGlow[] = []
  const imageGroups = new Map<bigint, ImageGroup>()
  const glyphGroups = new Map<bigint, GlyphGroup>()
  const transformedImageGroups = new Map<bigint, TransformedImageGroup>()
  const transientFullFrameImages: WgpuCanvasImageHandle[] = []
  const tempGlyphs: WgpuCanvasGlyphInstance[] = []
  const dirtyRects: DirtyBoundsRect[] = []
  const cacheStats: GpuRendererBackendCacheStats = {
    layerTargetCount: 0,
    layerTargetBytes: 0,
    textImageCount: 0,
    textImageBytes: 0,
    glyphAtlasCount: 0,
    glyphAtlasBytes: 0,
    canvasSpriteCount: 0,
    canvasSpriteBytes: 0,
    transformSpriteCount: 0,
    transformSpriteBytes: 0,
    fallbackSpriteCount: 0,
    fallbackSpriteBytes: 0,
    backdropSourceCount: 0,
    backdropSourceBytes: 0,
    backdropSpriteCount: 0,
    backdropSpriteBytes: 0,
  }

  const layerTargetBytes = (record: TargetRecord) => record.width * record.height * 4
  const glyphAtlasBytes = (record: GlyphAtlasRecord) => record.cellWidth * record.columns * record.cellHeight * record.rows * 4
  const canvasSpriteBytes = (record: CanvasSpriteRecord) => record.width * record.height * 4
  const transformSpriteBytes = (record: TransformSpriteRecord) => record.width * record.height * 4
  const backdropSourceBytes = (record: BackdropSourceRecord) => (record.bounds.right - record.bounds.left) * (record.bounds.bottom - record.bounds.top) * 4
  const backdropSpriteBytes = (record: BackdropSpriteRecord) => record.width * record.height * 4

  const setLayerTargetRecord = (key: string, record: TargetRecord) => {
    const existing = layerTargets.get(key)
    if (existing) {
      cacheStats.layerTargetCount -= 1
      cacheStats.layerTargetBytes -= layerTargetBytes(existing)
    }
    layerTargets.set(key, record)
    cacheStats.layerTargetCount += 1
    cacheStats.layerTargetBytes += layerTargetBytes(record)
  }

  const deleteLayerTargetRecord = (key: string) => {
    const existing = layerTargets.get(key)
    if (!existing) return null
    layerTargets.delete(key)
    cacheStats.layerTargetCount -= 1
    cacheStats.layerTargetBytes -= layerTargetBytes(existing)
    return existing
  }

  const setGlyphAtlasRecord = (key: string, record: GlyphAtlasRecord) => {
    const existing = glyphAtlases.get(key)
    if (existing) {
      cacheStats.glyphAtlasCount -= 1
      cacheStats.glyphAtlasBytes -= glyphAtlasBytes(existing)
    }
    glyphAtlases.set(key, record)
    cacheStats.glyphAtlasCount += 1
    cacheStats.glyphAtlasBytes += glyphAtlasBytes(record)
  }

  const deleteGlyphAtlasRecord = (key: string) => {
    const existing = glyphAtlases.get(key)
    if (!existing) return null
    glyphAtlases.delete(key)
    cacheStats.glyphAtlasCount -= 1
    cacheStats.glyphAtlasBytes -= glyphAtlasBytes(existing)
    return existing
  }

  const setCanvasSpriteRecord = (key: string, record: CanvasSpriteRecord) => {
    const existing = canvasSpriteCache.get(key)
    if (existing) {
      cacheStats.canvasSpriteCount -= 1
      cacheStats.canvasSpriteBytes -= canvasSpriteBytes(existing)
    }
    canvasSpriteCache.set(key, record)
    cacheStats.canvasSpriteCount += 1
    cacheStats.canvasSpriteBytes += canvasSpriteBytes(record)
  }

  const deleteCanvasSpriteRecord = (key: string) => {
    const existing = canvasSpriteCache.get(key)
    if (!existing) return null
    canvasSpriteCache.delete(key)
    cacheStats.canvasSpriteCount -= 1
    cacheStats.canvasSpriteBytes -= canvasSpriteBytes(existing)
    return existing
  }

  const clearCanvasSpriteRecords = () => {
    canvasSpriteCache.clear()
    cacheStats.canvasSpriteCount = 0
    cacheStats.canvasSpriteBytes = 0
  }

  const setTransformSpriteRecord = (key: string, record: TransformSpriteRecord) => {
    const existing = transformSpriteCache.get(key)
    if (existing) {
      cacheStats.transformSpriteCount -= 1
      cacheStats.transformSpriteBytes -= transformSpriteBytes(existing)
    }
    transformSpriteCache.set(key, record)
    cacheStats.transformSpriteCount += 1
    cacheStats.transformSpriteBytes += transformSpriteBytes(record)
  }

  const deleteTransformSpriteRecord = (key: string) => {
    const existing = transformSpriteCache.get(key)
    if (!existing) return null
    transformSpriteCache.delete(key)
    cacheStats.transformSpriteCount -= 1
    cacheStats.transformSpriteBytes -= transformSpriteBytes(existing)
    return existing
  }

  const clearTransformSpriteRecords = () => {
    transformSpriteCache.clear()
    cacheStats.transformSpriteCount = 0
    cacheStats.transformSpriteBytes = 0
  }

  const setBackdropSourceRecord = (key: string, record: BackdropSourceRecord) => {
    const existing = backdropSourceCache.get(key)
    if (existing) {
      cacheStats.backdropSourceCount -= 1
      cacheStats.backdropSourceBytes -= backdropSourceBytes(existing)
    }
    backdropSourceCache.set(key, record)
    cacheStats.backdropSourceCount += 1
    cacheStats.backdropSourceBytes += backdropSourceBytes(record)
  }

  const deleteBackdropSourceRecord = (key: string) => {
    const existing = backdropSourceCache.get(key)
    if (!existing) return null
    backdropSourceCache.delete(key)
    cacheStats.backdropSourceCount -= 1
    cacheStats.backdropSourceBytes -= backdropSourceBytes(existing)
    return existing
  }

  const clearBackdropSourceRecords = () => {
    backdropSourceCache.clear()
    cacheStats.backdropSourceCount = 0
    cacheStats.backdropSourceBytes = 0
  }

  const setBackdropSpriteRecord = (key: string, record: BackdropSpriteRecord) => {
    const existing = backdropSpriteCache.get(key)
    if (existing) {
      cacheStats.backdropSpriteCount -= 1
      cacheStats.backdropSpriteBytes -= backdropSpriteBytes(existing)
    }
    backdropSpriteCache.set(key, record)
    cacheStats.backdropSpriteCount += 1
    cacheStats.backdropSpriteBytes += backdropSpriteBytes(record)
  }

  const deleteBackdropSpriteRecord = (key: string) => {
    const existing = backdropSpriteCache.get(key)
    if (!existing) return null
    backdropSpriteCache.delete(key)
    cacheStats.backdropSpriteCount -= 1
    cacheStats.backdropSpriteBytes -= backdropSpriteBytes(existing)
    return existing
  }

  const clearBackdropSpriteRecords = () => {
    backdropSpriteCache.clear()
    cacheStats.backdropSpriteCount = 0
    cacheStats.backdropSpriteBytes = 0
  }

  const recordCurrentFrameLayer = (layer: RenderedLayerRecord) => {
    const existingIndex = currentFrameLayers.findIndex((entry) => entry.key === layer.key)
    if (existingIndex >= 0) {
      currentFrameLayers[existingIndex] = layer
      return
    }
    currentFrameLayers.push(layer)
  }

  const clearSpriteCaches = () => {
    if (!context) return
    for (const record of glyphAtlases.values()) {
      destroyWgpuCanvasImage(context, record.handle)
    }
    glyphAtlases.clear()
    cacheStats.glyphAtlasCount = 0
    cacheStats.glyphAtlasBytes = 0
    for (const record of canvasSpriteCache.values()) {
      destroyWgpuCanvasImage(context, record.handle)
    }
    clearCanvasSpriteRecords()
    for (const record of transformSpriteCache.values()) {
      destroyWgpuCanvasImage(context, record.handle)
    }
    clearTransformSpriteRecords()
    for (const record of backdropSourceCache.values()) {
      destroyWgpuCanvasImage(context, record.handle)
    }
    clearBackdropSourceRecords()
    for (const record of backdropSpriteCache.values()) {
      destroyWgpuCanvasImage(context, record.handle)
    }
    clearBackdropSpriteRecords()
  }

  const pruneBackdropCaches = (activeFrameId: number) => {
    if (!context) return
    for (const [key, record] of backdropSourceCache) {
      if (record.frameId === activeFrameId) continue
      destroyWgpuCanvasImage(context, record.handle)
      deleteBackdropSourceRecord(key)
    }
    for (const [key, record] of backdropSpriteCache) {
      if (record.frameId === activeFrameId) continue
      destroyWgpuCanvasImage(context, record.handle)
      deleteBackdropSpriteRecord(key)
    }
  }

  const destroyTargetRecord = (record: TargetRecord | null) => {
    if (!context || !record) return
    destroyWgpuCanvasTarget(context, record.handle)
  }

  const getStandaloneTarget = (width: number, height: number) => {
    if (!context) return null
    if (standaloneTarget && standaloneTarget.width === width && standaloneTarget.height === height) {
      logGpuResize(`reuse target width=${width} height=${height}`)
      return standaloneTarget.handle
    }
    if (standaloneTarget) {
      logGpuResize(`destroy target prevWidth=${standaloneTarget.width} prevHeight=${standaloneTarget.height} nextWidth=${width} nextHeight=${height}`)
      destroyWgpuCanvasTarget(context, standaloneTarget.handle)
    } else {
      logGpuResize(`create first target width=${width} height=${height}`)
    }
    clearSpriteCaches()
    const handle = createWgpuCanvasTarget(context, { width, height })
    standaloneTarget = { key: "standalone", width, height, handle }
    logGpuResize(`created target width=${width} height=${height}`)
    return handle
  }

  const getFinalFrameTarget = (width: number, height: number) => {
    if (!context) return null
    if (finalFrameTarget && finalFrameTarget.width === width && finalFrameTarget.height === height) {
      return finalFrameTarget.handle
    }
    destroyTargetRecord(finalFrameTarget)
    const handle = createWgpuCanvasTarget(context, { width, height })
    finalFrameTarget = { key: "final-frame", width, height, handle }
    return handle
  }

  const getLayerTarget = (key: string, width: number, height: number) => {
    if (!context) return null
    const existing = layerTargets.get(key)
    if (existing && existing.width === width && existing.height === height) {
      touchMapEntry(layerTargets, key, existing)
      return existing.handle
    }
    if (existing) destroyWgpuCanvasTarget(context, existing.handle)
    const handle = createWgpuCanvasTarget(context, { width, height })
    setLayerTargetRecord(key, { key, width, height, handle })
    return handle
  }

  const pruneLayerTargets = () => {
    if (!context) return
    for (const [key, record] of layerTargets) {
      if (activeLayerKeys.has(key)) continue
      destroyWgpuCanvasTarget(context, record.handle)
      deleteLayerTargetRecord(key)
    }
  }

  const trimCanvasSpriteCache = () => {
    if (!context) return
    while (canvasSpriteCache.size > MAX_GPU_CANVAS_SPRITES) {
      const first = canvasSpriteCache.keys().next().value
      if (!first) break
      const record = canvasSpriteCache.get(first)
      if (record) {
        destroyWgpuCanvasImage(context, record.handle)
      }
      deleteCanvasSpriteRecord(first)
    }
  }

  const markCanvasSpritesUnusedForFrame = () => {
    for (const record of canvasSpriteCache.values()) {
      record.usedThisFrame = false
    }
  }

  const pruneCanvasSpriteCache = () => {
    if (!context) return
    for (const [key, record] of canvasSpriteCache) {
      if (record.usedThisFrame) {
        record.unusedFrames = 0
        continue
      }
      record.unusedFrames += 1
      if (record.unusedFrames < 3) continue
      destroyWgpuCanvasImage(context, record.handle)
      deleteCanvasSpriteRecord(key)
    }
    trimCanvasSpriteCache()
  }

  const trimTransformSpriteCache = () => {
    if (!context) return
    while (transformSpriteCache.size > MAX_GPU_TRANSFORM_SPRITES) {
      const first = transformSpriteCache.keys().next().value
      if (!first) break
      const record = transformSpriteCache.get(first)
      if (record) destroyWgpuCanvasImage(context, record.handle)
      deleteTransformSpriteRecord(first)
    }
  }

  gpuRendererBackendStatsProvider = () => cacheStats

  const getImage = (rgba: Uint8Array, width: number, height: number): bigint | null => {
    // 9.3c: Image upload via vexart_paint_upload_image (replaces tge_wgpu_canvas_image_create).
    // The _vexartImageHandles WeakMap caches bigint handles per RGBA buffer reference.
    const vctxForImage = getVexartCtx()
    const handle = vexartUploadImage(vctxForImage, rgba, width, height)
    if (handle === 0n) return null
    // Also populate imageCache (ImageRecord uses bigint handle) for destroy accounting.
    if (!imageCache.has(rgba)) {
      imageCache.set(rgba, { handle, width, height })
    }
    return handle
  }

  const getGlyphAtlas = (fontId: number) => {
    if (!context) return null
    const key = `${fontId}`
    const cached = glyphAtlases.get(key)
    if (cached) {
      touchMapEntry(glyphAtlases, key, cached)
      return cached
    }
    const font = getFont(fontId)
    const atlas = getAtlas(fontId, font)
    const glyphCount = atlas.glyphCount
    const columns = 32
    const rows = Math.ceil(glyphCount / columns)
    const width = atlas.cellWidth * columns
    const height = atlas.cellHeight * rows
    const rgba = new Uint8Array(width * height * 4)
    for (let glyphIndex = 0; glyphIndex < glyphCount; glyphIndex++) {
      const col = glyphIndex % columns
      const row = Math.floor(glyphIndex / columns)
      const srcOffset = glyphIndex * atlas.cellWidth * atlas.cellHeight
      for (let py = 0; py < atlas.cellHeight; py++) {
        for (let px = 0; px < atlas.cellWidth; px++) {
          const srcIndex = srcOffset + py * atlas.cellWidth + px
          const alpha = atlas.data[srcIndex]
          const dx = col * atlas.cellWidth + px
          const dy = row * atlas.cellHeight + py
          const di = (dy * width + dx) * 4
          rgba[di] = 255
          rgba[di + 1] = 255
          rgba[di + 2] = 255
          rgba[di + 3] = alpha
        }
      }
    }
    const handle = createWgpuCanvasImage(context, { width, height }, rgba)
    const record: GlyphAtlasRecord = {
      handle,
      cellWidth: atlas.cellWidth,
      cellHeight: atlas.cellHeight,
      columns,
      rows,
      glyphWidths: atlas.glyphWidths,
      ascender: atlas.ascender,
      indexFor: atlas.indexFor,
    }
    if (glyphAtlases.size >= MAX_GPU_GLYPH_ATLASES) {
      const first = glyphAtlases.keys().next().value
      if (first) {
        const stale = glyphAtlases.get(first)
        if (stale) destroyWgpuCanvasImage(context, stale.handle)
        deleteGlyphAtlasRecord(first)
      }
    }
    setGlyphAtlasRecord(key, record)
    return record
  }

  const getCanvasFunctionId = (fn: Function) => {
    const existing = canvasFunctionIds.get(fn)
    if (existing) return existing
    const id = nextCanvasFunctionId++
    canvasFunctionIds.set(fn, id)
    return id
  }

  const getCanvasSprite = (_op: Extract<RenderGraphOp, { kind: "canvas" }>) => {
    // Phase 2: canvas sprite rendering removed. wgpu-mixed-scene dependency removed.
    // The showcase does not use <canvas onDraw={...}> nodes. Canvas ops that reach
    // here will return null, causing the render path to call failGpuOnly.
    // wgpu-mixed-scene is a 0-consumer orphan (deleted in Slice 11).
    return null
  }

  const getTransformSprite = (op: Extract<RenderGraphOp, { kind: "effect" }>) => {
    if (!context) return null
    const width = Math.max(1, Math.round(op.command.width))
    const height = Math.max(1, Math.round(op.command.height))
    const key = `${op.kind}:${op.command.type}:${op.command.x}:${op.command.y}:${op.command.width}:${op.command.height}:${op.command.color[0]}:${op.command.color[1]}:${op.command.color[2]}:${op.command.color[3]}:${op.command.cornerRadius}:${op.command.extra1}:${op.command.extra2}:${op.command.text ?? ""}:${width}:${height}:${hashMatrix(op.effect.transform)}:${op.effect.opacity ?? 1}`
    const cached = transformSpriteCache.get(key)
    if (cached && cached.width === width && cached.height === height) {
      touchMapEntry(transformSpriteCache, key, cached)
      return cached.handle
    }
    if (cached) destroyWgpuCanvasImage(context, cached.handle)
    const spriteOp: Extract<RenderGraphOp, { kind: "effect" }> = {
      ...op,
      effect: {
        ...op.effect,
        transform: undefined,
        transformInverse: undefined,
        transformBounds: undefined,
        opacity: undefined,
      },
    }
    const renderSprite = renderOpToImage as ((op: RenderGraphOp, width: number, height: number, offsetX: number, offsetY: number) => WgpuCanvasImageHandle | null) | null
    const handle = renderSprite
      ? renderSprite(spriteOp, width, height, Math.round(op.command.x), Math.round(op.command.y))
      : null
    if (!handle) return null
    setTransformSpriteRecord(key, { key, handle, width, height })
    trimTransformSpriteCache()
    return handle
  }

  const renderGradientSprite = (
    gradient: NonNullable<EffectRenderOp["effect"]["gradient"]>,
    width: number,
    height: number,
    opacity: number,
    cornerRadii: EffectRenderOp["effect"]["cornerRadii"],
  ) => {
    if (!context) return null
    const target = createWgpuCanvasTarget(context, { width, height })
    try {
      if (gradient.type === "linear") {
        renderWgpuCanvasTargetLinearGradientsLayer(context, target, [{
          x: -1,
          y: 1,
          w: 2,
          h: -2,
          boxW: width,
          boxH: height,
          radius: 0,
          from: opacity < 1 ? applyOpacityToColor(gradient.from, opacity) : gradient.from,
          to: opacity < 1 ? applyOpacityToColor(gradient.to, opacity) : gradient.to,
          dirX: Math.cos((gradient.angle * Math.PI) / 180),
          dirY: Math.sin((gradient.angle * Math.PI) / 180),
        }], 0, 0x00000000)
      } else {
        renderWgpuCanvasTargetRadialGradientsLayer(context, target, [{
          x: -1,
          y: 1,
          w: 2,
          h: -2,
          boxW: width,
          boxH: height,
          radius: Math.max(width, height) * 0.5,
          from: opacity < 1 ? applyOpacityToColor(gradient.from, opacity) : gradient.from,
          to: opacity < 1 ? applyOpacityToColor(gradient.to, opacity) : gradient.to,
        }], 0, 0x00000000)
      }
      let handle = copyGpuTargetRegionToImage(context, target, { x: 0, y: 0, width, height }).handle
      if (cornerRadii) {
        const masked = maskWgpuCanvasImageRoundedRectCorners(context, handle, { x: 0, y: 0, width, height, radii: cornerRadii })
        destroyWgpuCanvasImage(context, handle)
        handle = masked
      }
      return handle
    } finally {
      destroyWgpuCanvasTarget(context, target)
    }
  }

  const clipRect = (cmd: { x: number; y: number; width: number; height: number }, ctx: RendererBackendPaintContext) => {
    const x = Math.round(cmd.x) - ctx.offsetX
    const y = Math.round(cmd.y) - ctx.offsetY
    const w = Math.round(cmd.width)
    const h = Math.round(cmd.height)
    const left = Math.max(0, x)
    const top = Math.max(0, y)
    const right = Math.min(ctx.target.width, x + w)
    const bottom = Math.min(ctx.target.height, y + h)
    if (right <= left || bottom <= top) return null
    return { x, y, w, h, left, top, right, bottom }
  }

  const batchBounds = (ctx: RendererBackendPaintContext, ops: RenderGraphOp[]) => {
    let bounds: IntBounds | null = null
    for (const op of ops) {
      const clip = clipRect(op.command, ctx)
      if (!clip) continue
      bounds = unionBounds(bounds, { left: clip.left, top: clip.top, right: clip.right, bottom: clip.bottom })
    }
    return bounds
  }

  const renderFrame = (
    ctx: RendererBackendPaintContext,
    targetHandle: WgpuCanvasTargetHandle,
    readbackMode: "auto" | "none" = "auto",
  ): { ok: boolean; rawLayer: { data: Uint8Array; width: number; height: number } | null } => {
    if (!context) return { ok: false, rawLayer: null }
    let first = true
    rects.length = 0
    shapeRects.length = 0
    shapeRectCorners.length = 0
    linearGradients.length = 0
    radialGradients.length = 0
    glows.length = 0
    imageGroups.clear()
    glyphGroups.clear()
    transformedImageGroups.clear()
    transientFullFrameImages.length = 0
    tempGlyphs.length = 0
    dirtyRects.length = 0
    let targetMutationVersion = 0

    // ── vexart_paint_dispatch flush helpers ───────────────────────────────
    // Per design §11 / §8.2: each flush accumulates instances, packs into
    // a graph buffer per cmd_kind, then calls vexart_paint_dispatch once.
    const vctx = getVexartCtx()

    const flushRects = () => {
      if (rects.length === 0) return
      // Dispatch via vexart_paint_dispatch (cmd_kind=0: BridgeRectInstance)
      const instances = new Uint8Array(rects.length * 32)
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i]
        instances.set(packRectInstance(r.x, r.y, r.w, r.h, r.color), i * 32)
      }
      flushVexartBatch(vctx, 0, instances)
      rects.length = 0
      first = false
      targetMutationVersion += 1
    }
    const flushShapeRects = () => {
      if (shapeRects.length === 0) return
      // Dispatch via vexart_paint_dispatch (cmd_kind=1: BridgeShapeRectInstance)
      const instances = new Uint8Array(shapeRects.length * 80)
      for (let i = 0; i < shapeRects.length; i++) {
        const r = shapeRects[i]
        instances.set(packShapeRectInstance(r.x, r.y, r.w, r.h, r.boxW, r.boxH, r.radius, r.fill ?? 0, r.stroke ?? 0, r.strokeWidth), i * 80)
      }
      flushVexartBatch(vctx, 1, instances)
      shapeRects.length = 0
      first = false
      targetMutationVersion += 1
    }
    const flushShapeRectCorners = () => {
      if (shapeRectCorners.length === 0) return
      // Dispatch via vexart_paint_dispatch (cmd_kind=2: BridgeShapeRectCornersInstance)
      const instances = new Uint8Array(shapeRectCorners.length * 96)
      for (let i = 0; i < shapeRectCorners.length; i++) {
        const r = shapeRectCorners[i]
        instances.set(packShapeRectCornersInstance(r.x, r.y, r.w, r.h, r.boxW, r.boxH, r.radii, r.fill ?? 0, r.stroke ?? 0, r.strokeWidth), i * 96)
      }
      flushVexartBatch(vctx, 2, instances)
      shapeRectCorners.length = 0
      first = false
      targetMutationVersion += 1
    }
    const flushLinearGradients = () => {
      if (linearGradients.length === 0) return
      // Dispatch via vexart_paint_dispatch (cmd_kind=12: BridgeLinearGradientInstance)
      const instances = new Uint8Array(linearGradients.length * 80)
      for (let i = 0; i < linearGradients.length; i++) {
        const r = linearGradients[i]
        instances.set(packLinearGradientInstance(r.x, r.y, r.w, r.h, r.boxW, r.boxH, r.radius, r.from, r.to, r.dirX, r.dirY), i * 80)
      }
      flushVexartBatch(vctx, 12, instances)
      linearGradients.length = 0
      first = false
      targetMutationVersion += 1
    }
    const flushRadialGradients = () => {
      if (radialGradients.length === 0) return
      // Dispatch via vexart_paint_dispatch (cmd_kind=13: BridgeRadialGradientInstance)
      const instances = new Uint8Array(radialGradients.length * 80)
      for (let i = 0; i < radialGradients.length; i++) {
        const r = radialGradients[i]
        instances.set(packRadialGradientInstance(r.x, r.y, r.w, r.h, r.boxW, r.boxH, r.radius, r.from, r.to), i * 80)
      }
      flushVexartBatch(vctx, 13, instances)
      radialGradients.length = 0
      first = false
      targetMutationVersion += 1
    }
    const flushGlows = () => {
      if (glows.length === 0) return
      // Dispatch via vexart_paint_dispatch (cmd_kind=6: BridgeGlowInstance)
      // NOTE: shadow also uses cmd_kind=6 via offset-adjusted rect per design §17.3
      const instances = new Uint8Array(glows.length * 48)
      for (let i = 0; i < glows.length; i++) {
        const g = glows[i]
        instances.set(packGlowInstance(g.x, g.y, g.w, g.h, g.color, g.intensity ?? 80), i * 48)
      }
      flushVexartBatch(vctx, 6, instances)
      glows.length = 0
      first = false
      targetMutationVersion += 1
    }
    const flushImages = () => {
      if (imageGroups.size === 0) return
      // 9.3c: Images dispatched via vexart_paint_dispatch cmd_kind=9 (BridgeImageInstance).
      // One dispatch call per image group (per uploaded texture handle).
      // BridgeImageInstance: 8 floats (x, y, w, h, opacity, _pad×3) = 32 bytes per instance.
      for (const group of imageGroups.values()) {
        const instances = new Uint8Array(group.instances.length * 32)
        for (let i = 0; i < group.instances.length; i++) {
          const inst = group.instances[i]
          instances.set(packImageInstance(inst.x, inst.y, inst.w, inst.h, inst.opacity), i * 32)
        }
        flushVexartBatch(vctx, 9, instances)
        first = false
        targetMutationVersion += 1
      }
      imageGroups.clear()
    }
    const flushGlyphs = () => {
      // 9.3c: DEC-011 Phase 2 no-op — MSDF text lands in Phase 2b.
      // cmd_kind=11 is reserved (glyph, DEC-011 — skipped per paint/mod.rs dispatch).
      // vexart_text_dispatch is a success no-op stub. Queued glyphs are silently dropped.
      // Per design §5.5, REQ-NB-005: first call to vexart_text_dispatch emits stderr warning.
      if (glyphGroups.size > 0) {
        const { symbols } = openVexartLibrary()
        // 1-byte dummy buffer — Bun FFI rejects zero-length. Triggers DEC-011 warning on first call.
        symbols.vexart_text_dispatch(vctx, ptr(new Uint8Array(1)), 0, ptr(new Uint8Array(32)))
        glyphGroups.clear()
      }
    }
    const flushTransformedImages = () => {
      if (transformedImageGroups.size === 0) return
      // 9.3c: Transformed images dispatched via vexart_paint_dispatch cmd_kind=10 (BridgeImageTransformInstance).
      // BridgeImageTransformInstance: 12 floats (p0-p3 corners + opacity + _pad×3) = 48 bytes per instance.
      for (const group of transformedImageGroups.values()) {
        const instances = new Uint8Array(group.instances.length * 48)
        for (let i = 0; i < group.instances.length; i++) {
          const inst = group.instances[i]
          instances.set(packImageTransformInstance(
            inst.p0.x, inst.p0.y,
            inst.p1.x, inst.p1.y,
            inst.p2.x, inst.p2.y,
            inst.p3.x, inst.p3.y,
            inst.opacity,
          ), i * 48)
        }
        flushVexartBatch(vctx, 10, instances)
        first = false
        targetMutationVersion += 1
      }
      transformedImageGroups.clear()
    }
    const flushAll = () => {
      flushRects()
      flushShapeRects()
      flushShapeRectCorners()
      flushLinearGradients()
      flushRadialGradients()
      flushGlows()
      flushImages()
      flushGlyphs()
      flushTransformedImages()
    }

    let dirtyBounds: IntBounds | null = null
    let layerOpen = true

    frameGeneration += 1
    pruneBackdropCaches(frameGeneration)

    const markDirty = (left: number, top: number, right: number, bottom: number) => {
      dirtyBounds = unionBounds(dirtyBounds, { left, top, right, bottom })
    }

    const ensureLoadedLayer = () => {
      if (layerOpen) return
      beginWgpuCanvasTargetLayer(context, targetHandle, 1, 0x00000000)
      layerOpen = true
    }

    const stripBackdropEffectOp = (op: EffectRenderOp): EffectRenderOp => ({
      ...op,
      backdrop: null,
      effect: {
        ...op.effect,
        backdropBlur: undefined,
        backdropBrightness: undefined,
        backdropContrast: undefined,
        backdropSaturate: undefined,
        backdropGrayscale: undefined,
        backdropInvert: undefined,
        backdropSepia: undefined,
        backdropHueRotate: undefined,
      },
    })

    const getBackdropWorkBounds = (op: EffectRenderOp, metadata: BackdropRenderMetadata) => {
      return clampBackdropBounds(metadata.outputBounds, ctx.target.width, ctx.target.height)
    }

    const getBackdropSource = (op: EffectRenderOp, metadata: BackdropRenderMetadata) => {
      const workBounds = getBackdropWorkBounds(op, metadata)
      if (!workBounds) return null
      const sourceKey = `${metadata.backdropSourceKey}:${boundsKey(workBounds)}:v${targetMutationVersion}`
      const cached = backdropSourceCache.get(sourceKey)
      if (cached && cached.frameId === frameGeneration) {
        return cached
      }
      const width = workBounds.right - workBounds.left
      const height = workBounds.bottom - workBounds.top
      if (width <= 0 || height <= 0) return null
      const copied = copyGpuTargetRegionToImage(context, targetHandle, {
        x: workBounds.left,
        y: workBounds.top,
        width,
        height,
      })
      const record: BackdropSourceRecord = {
        key: sourceKey,
        frameId: frameGeneration,
        bounds: workBounds,
        handle: copied.handle,
      }
      setBackdropSourceRecord(sourceKey, record)
      return record
    }

    const getBackdropSprite = (op: EffectRenderOp) => {
      if (!context) return null
      if (!op.backdrop) return null
      const source = getBackdropSource(op, op.backdrop)
      if (!source) return null
      const spriteKey = `${source.key}:${op.effectStateId}:${op.clipStateId}:${op.transformStateId}`
      const cached = backdropSpriteCache.get(spriteKey)
      if (cached && cached.frameId === frameGeneration) {
        return cached
      }
      let handle = filterWgpuCanvasImageBackdrop(context, source.handle, op.backdrop.filterParams)
      if (op.rect.inputs.radius > 0) {
        const localX = Math.max(0, Math.round(op.backdrop.outputBounds.x - source.bounds.left))
        const localY = Math.max(0, Math.round(op.backdrop.outputBounds.y - source.bounds.top))
        const localWidth = Math.max(1, Math.round(op.backdrop.outputBounds.width))
        const localHeight = Math.max(1, Math.round(op.backdrop.outputBounds.height))
        const masked = maskWgpuCanvasImageRoundedRect(context, handle, {
          x: localX,
          y: localY,
          width: localWidth,
          height: localHeight,
          radius: op.rect.inputs.radius,
        })
        destroyWgpuCanvasImage(context, handle)
        handle = masked
      }
      const record: BackdropSpriteRecord = {
        key: spriteKey,
        frameId: frameGeneration,
        bounds: source.bounds,
        handle,
        width: source.bounds.right - source.bounds.left,
        height: source.bounds.bottom - source.bounds.top,
      }
      if (cached) destroyWgpuCanvasImage(context, cached.handle)
      setBackdropSpriteRecord(spriteKey, record)
      return record
    }

    beginWgpuCanvasTargetLayer(context, targetHandle, 0, 0x00000000)

    try {
      for (const op of ctx.graph.ops) {
        const clip = clipRect(op.command, ctx)
        if (!clip) continue
        if (op.kind === "rectangle") {
          if (op.inputs.radius > 0) {
            const boxW = clip.right - clip.left
            const boxH = clip.bottom - clip.top
            shapeRects.push({
              x: (clip.left / ctx.target.width) * 2 - 1,
              y: 1 - (clip.top / ctx.target.height) * 2,
              w: (boxW / ctx.target.width) * 2,
              h: -((boxH / ctx.target.height) * 2),
              boxW,
              boxH,
              radius: clampShapeRadius(op.inputs.radius, boxW, boxH),
              strokeWidth: 0,
              fill: op.inputs.color,
            })
          } else {
            rects.push({
              x: (clip.left / ctx.target.width) * 2 - 1,
              y: 1 - (clip.top / ctx.target.height) * 2,
              w: ((clip.right - clip.left) / ctx.target.width) * 2,
              h: -(((clip.bottom - clip.top) / ctx.target.height) * 2),
              color: op.inputs.color,
            })
          }
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "effect") {
          let effectOp = op
          const effectOpacity = effectOp.effect.opacity ?? 1
          const cornerRadii = effectOp.effect.cornerRadii

          if (effectOp.backdrop && !cornerRadii) {
            flushAll()
            if (layerOpen) {
              endWgpuCanvasTargetLayer(context, targetHandle)
              layerOpen = false
            }
            const sprite = getBackdropSprite(effectOp)
            if (!sprite) return { ok: false, rawLayer: null }
            if (effectOp.effect.transform) {
              ensureLoadedLayer()
              const bounds = opBounds(effectOp, ctx.target.width, ctx.target.height)
              if (bounds) {
                const group = transformedImageGroups.get(sprite.handle) ?? { handle: sprite.handle, instances: [] as TransformedImageInstance[] }
                const matrix = effectOp.effect.transform
                const width = Math.max(1, Math.round(effectOp.command.width))
                const height = Math.max(1, Math.round(effectOp.command.height))
                const baseX = Math.round(effectOp.command.x)
                const baseY = Math.round(effectOp.command.y)
                const p0 = transformPoint(matrix, 0, 0)
                const p1 = transformPoint(matrix, width, 0)
                const p2 = transformPoint(matrix, 0, height)
                const p3 = transformPoint(matrix, width, height)
                group.instances.push({
                  p0: { x: ((baseX + p0.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p0.y) / ctx.target.height) * 2 },
                  p1: { x: ((baseX + p1.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p1.y) / ctx.target.height) * 2 },
                  p2: { x: ((baseX + p2.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p2.y) / ctx.target.height) * 2 },
                  p3: { x: ((baseX + p3.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p3.y) / ctx.target.height) * 2 },
                  opacity: effectOpacity,
                })
                transformedImageGroups.set(sprite.handle, group)
                markDirty(bounds.left, bounds.top, bounds.right, bounds.bottom)
                flushAll()
              }
            } else {
              ensureLoadedLayer()
              compositeWgpuCanvasTargetImageLayer(context, targetHandle, sprite.handle, {
                x: (sprite.bounds.left / ctx.target.width) * 2 - 1,
                y: 1 - (sprite.bounds.top / ctx.target.height) * 2,
                w: ((sprite.bounds.right - sprite.bounds.left) / ctx.target.width) * 2,
                h: -(((sprite.bounds.bottom - sprite.bounds.top) / ctx.target.height) * 2),
                opacity: effectOpacity,
              }, 1, 0x00000000)
              first = false
              targetMutationVersion += 1
              markDirty(sprite.bounds.left, sprite.bounds.top, sprite.bounds.right, sprite.bounds.bottom)
            }
            effectOp = stripBackdropEffectOp(effectOp)
          }

          if (effectOp.backdrop && cornerRadii) {
            flushAll()
            if (layerOpen) {
              endWgpuCanvasTargetLayer(context, targetHandle)
              layerOpen = false
            }
            const sprite = getBackdropSprite(effectOp)
            if (!sprite) return { ok: false, rawLayer: null }
            const masked = maskWgpuCanvasImageRoundedRectCorners(context, sprite.handle, {
              x: Math.max(0, Math.round(effectOp.command.x) - sprite.bounds.left),
              y: Math.max(0, Math.round(effectOp.command.y) - sprite.bounds.top),
              width: Math.max(1, Math.round(effectOp.command.width)),
              height: Math.max(1, Math.round(effectOp.command.height)),
              radii: cornerRadii,
            })
            compositeWgpuCanvasTargetImageLayer(context, targetHandle, masked, {
              x: (sprite.bounds.left / ctx.target.width) * 2 - 1,
              y: 1 - (sprite.bounds.top / ctx.target.height) * 2,
              w: ((sprite.bounds.right - sprite.bounds.left) / ctx.target.width) * 2,
              h: -(((sprite.bounds.bottom - sprite.bounds.top) / ctx.target.height) * 2),
              opacity: effectOpacity,
            }, first ? 0 : 1, 0x00000000)
            destroyWgpuCanvasImage(context, masked)
            first = false
            targetMutationVersion += 1
            markDirty(sprite.bounds.left, sprite.bounds.top, sprite.bounds.right, sprite.bounds.bottom)
            effectOp = stripBackdropEffectOp(effectOp)
          }

          if (effectOp.backdrop) {
            failGpuOnly("backdrop effect requires removed software fallback path")
          }

          if (effectOp.effect.transform) {
            const bounds = opBounds(effectOp, ctx.target.width, ctx.target.height)
            if (!bounds) continue
            const handle = getTransformSprite(effectOp)
            if (!handle) return { ok: false, rawLayer: null }
            const group = transformedImageGroups.get(handle) ?? { handle, instances: [] as TransformedImageInstance[] }
            const matrix = effectOp.effect.transform
            const width = Math.max(1, Math.round(effectOp.command.width))
            const height = Math.max(1, Math.round(effectOp.command.height))
            const baseX = Math.round(effectOp.command.x)
            const baseY = Math.round(effectOp.command.y)
            const p0 = transformPoint(matrix, 0, 0)
            const p1 = transformPoint(matrix, width, 0)
            const p2 = transformPoint(matrix, 0, height)
            const p3 = transformPoint(matrix, width, height)
            group.instances.push({
              p0: { x: ((baseX + p0.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p0.y) / ctx.target.height) * 2 },
              p1: { x: ((baseX + p1.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p1.y) / ctx.target.height) * 2 },
              p2: { x: ((baseX + p2.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p2.y) / ctx.target.height) * 2 },
              p3: { x: ((baseX + p3.x) / ctx.target.width) * 2 - 1, y: 1 - ((baseY + p3.y) / ctx.target.height) * 2 },
              opacity: effectOp.effect.opacity ?? 1,
            })
            transformedImageGroups.set(handle, group)
            markDirty(bounds.left, bounds.top, bounds.right, bounds.bottom)
            flushAll()
            continue
          }

          const baseFillRaw = ((effectOp.command.color[0] << 24) | (effectOp.command.color[1] << 16) | (effectOp.command.color[2] << 8) | effectOp.command.color[3]) >>> 0
          const baseFill = effectOpacity < 1 ? applyOpacityToColor(baseFillRaw, effectOpacity) : baseFillRaw
          const boxW = clip.right - clip.left
          const boxH = clip.bottom - clip.top
          const radius = clampShapeRadius(effectOp.rect.inputs.radius, boxW, boxH)

          if (!effectOp.effect.gradient && !effectOp.effect.glow && !effectOp.effect.shadow) {
            if (cornerRadii) {
              shapeRectCorners.push({
                x: (clip.left / ctx.target.width) * 2 - 1,
                y: 1 - (clip.top / ctx.target.height) * 2,
                w: (boxW / ctx.target.width) * 2,
                h: -((boxH / ctx.target.height) * 2),
                boxW,
                boxH,
                radii: cornerRadii,
                strokeWidth: 0,
                fill: baseFill,
              })
              markDirty(clip.left, clip.top, clip.right, clip.bottom)
              flushAll()
              continue
            }
            shapeRects.push({
              x: (clip.left / ctx.target.width) * 2 - 1,
              y: 1 - (clip.top / ctx.target.height) * 2,
              w: (boxW / ctx.target.width) * 2,
              h: -((boxH / ctx.target.height) * 2),
              boxW,
              boxH,
              radius,
              strokeWidth: 0,
              fill: baseFill,
            })
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
            flushAll()
            continue
          }

          if (!effectOp.effect.gradient && (effectOp.command.color[3] ?? 0) > 1) {
            if (cornerRadii) {
              shapeRectCorners.push({
                x: (clip.left / ctx.target.width) * 2 - 1,
                y: 1 - (clip.top / ctx.target.height) * 2,
                w: (boxW / ctx.target.width) * 2,
                h: -((boxH / ctx.target.height) * 2),
                boxW,
                boxH,
                radii: cornerRadii,
                strokeWidth: 0,
                fill: baseFill,
              })
            } else {
              shapeRects.push({
                x: (clip.left / ctx.target.width) * 2 - 1,
                y: 1 - (clip.top / ctx.target.height) * 2,
                w: (boxW / ctx.target.width) * 2,
                h: -((boxH / ctx.target.height) * 2),
                boxW,
                boxH,
                radius,
                strokeWidth: 0,
                fill: baseFill,
              })
            }
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
          }

          if (effectOp.effect.gradient) {
            if (!cornerRadii) {
              shapeRects.push({
                x: (clip.left / ctx.target.width) * 2 - 1,
                y: 1 - (clip.top / ctx.target.height) * 2,
                w: (boxW / ctx.target.width) * 2,
                h: -((boxH / ctx.target.height) * 2),
                boxW,
                boxH,
                radius,
                strokeWidth: 0,
                fill: baseFill,
              })
            } else if ((effectOp.command.color[3] ?? 0) > 1) {
              shapeRectCorners.push({
                x: (clip.left / ctx.target.width) * 2 - 1,
                y: 1 - (clip.top / ctx.target.height) * 2,
                w: (boxW / ctx.target.width) * 2,
                h: -((boxH / ctx.target.height) * 2),
                boxW,
                boxH,
                radii: cornerRadii,
                strokeWidth: 0,
                fill: baseFill,
              })
            }
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
          }

          if (effectOp.effect.shadow) {
            const shadows = Array.isArray(effectOp.effect.shadow) ? effectOp.effect.shadow : [effectOp.effect.shadow]
            for (const s of shadows) {
              const blur = Math.ceil(s.blur)
              const pad = blur * 2
              const left = Math.max(0, clip.left + Math.min(0, s.x) - pad)
              const top = Math.max(0, clip.top + Math.min(0, s.y) - pad)
              const right = Math.min(ctx.target.width, clip.right + Math.max(0, s.x) + pad)
              const bottom = Math.min(ctx.target.height, clip.bottom + Math.max(0, s.y) + pad)
              const intensity = Math.min(100, Math.max(1, Math.round(((s.color & 0xff) / 255) * 100)))
              glows.push({
                x: (left / ctx.target.width) * 2 - 1,
                y: 1 - (top / ctx.target.height) * 2,
                w: ((right - left) / ctx.target.width) * 2,
                h: -(((bottom - top) / ctx.target.height) * 2),
                color: effectOpacity < 1 ? applyOpacityToColor(s.color, effectOpacity) : s.color,
                intensity,
              })
              markDirty(left, top, right, bottom)
            }
          }

          if (effectOp.effect.glow) {
            const margin = effectOp.effect.glow.radius
            const left = Math.max(0, clip.left - margin)
            const top = Math.max(0, clip.top - margin)
            const right = Math.min(ctx.target.width, clip.right + margin)
            const bottom = Math.min(ctx.target.height, clip.bottom + margin)
            glows.push({
              x: (left / ctx.target.width) * 2 - 1,
              y: 1 - (top / ctx.target.height) * 2,
              w: ((right - left) / ctx.target.width) * 2,
              h: -(((bottom - top) / ctx.target.height) * 2),
              color: effectOpacity < 1 ? applyOpacityToColor(effectOp.effect.glow.color, effectOpacity) : effectOp.effect.glow.color,
              intensity: effectOp.effect.glow.intensity,
            })
            markDirty(left, top, right, bottom)
          }

          if (effectOp.effect.gradient?.type === "linear") {
            if (cornerRadii) {
              flushAll()
              const handle = renderGradientSprite(effectOp.effect.gradient, boxW, boxH, effectOpacity, cornerRadii)
              if (!handle) return { ok: false, rawLayer: null }
              compositeWgpuCanvasTargetImageLayer(context, targetHandle, handle, {
                x: (clip.left / ctx.target.width) * 2 - 1,
                y: 1 - (clip.top / ctx.target.height) * 2,
                w: (boxW / ctx.target.width) * 2,
                h: -((boxH / ctx.target.height) * 2),
                opacity: 1,
              }, first ? 0 : 1, 0x00000000)
              destroyWgpuCanvasImage(context, handle)
              first = false
              targetMutationVersion += 1
              markDirty(clip.left, clip.top, clip.right, clip.bottom)
              continue
            }
            const from = effectOpacity < 1 ? applyOpacityToColor(effectOp.effect.gradient.from, effectOpacity) : effectOp.effect.gradient.from
            const to = effectOpacity < 1 ? applyOpacityToColor(effectOp.effect.gradient.to, effectOpacity) : effectOp.effect.gradient.to
            linearGradients.push({
              x: (clip.left / ctx.target.width) * 2 - 1,
              y: 1 - (clip.top / ctx.target.height) * 2,
              w: (boxW / ctx.target.width) * 2,
              h: -((boxH / ctx.target.height) * 2),
              boxW,
              boxH,
              radius,
              from,
              to,
              dirX: Math.cos((effectOp.effect.gradient.angle * Math.PI) / 180),
              dirY: Math.sin((effectOp.effect.gradient.angle * Math.PI) / 180),
            })
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
            flushAll()
            continue
          }

          if (effectOp.effect.gradient?.type === "radial") {
            if (cornerRadii) {
              flushAll()
              const handle = renderGradientSprite(effectOp.effect.gradient, boxW, boxH, effectOpacity, cornerRadii)
              if (!handle) return { ok: false, rawLayer: null }
              compositeWgpuCanvasTargetImageLayer(context, targetHandle, handle, {
                x: (clip.left / ctx.target.width) * 2 - 1,
                y: 1 - (clip.top / ctx.target.height) * 2,
                w: (boxW / ctx.target.width) * 2,
                h: -((boxH / ctx.target.height) * 2),
                opacity: 1,
              }, first ? 0 : 1, 0x00000000)
              destroyWgpuCanvasImage(context, handle)
              first = false
              targetMutationVersion += 1
              markDirty(clip.left, clip.top, clip.right, clip.bottom)
              continue
            }
            const from = effectOpacity < 1 ? applyOpacityToColor(effectOp.effect.gradient.from, effectOpacity) : effectOp.effect.gradient.from
            const to = effectOpacity < 1 ? applyOpacityToColor(effectOp.effect.gradient.to, effectOpacity) : effectOp.effect.gradient.to
            radialGradients.push({
              x: (clip.left / ctx.target.width) * 2 - 1,
              y: 1 - (clip.top / ctx.target.height) * 2,
              w: (boxW / ctx.target.width) * 2,
              h: -((boxH / ctx.target.height) * 2),
              boxW,
              boxH,
              radius,
              from,
              to,
            })
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
            flushAll()
            continue
          }

          flushAll()
          continue
        }
        if (op.kind === "border") {
          const boxW = clip.right - clip.left
          const boxH = clip.bottom - clip.top
          if (op.inputs.cornerRadii) {
            shapeRectCorners.push({
              x: (clip.left / ctx.target.width) * 2 - 1,
              y: 1 - (clip.top / ctx.target.height) * 2,
              w: (boxW / ctx.target.width) * 2,
              h: -((boxH / ctx.target.height) * 2),
              boxW,
              boxH,
              radii: op.inputs.cornerRadii,
              strokeWidth: op.inputs.width,
              stroke: ((op.command.color[0] << 24) | (op.command.color[1] << 16) | (op.command.color[2] << 8) | op.command.color[3]) >>> 0,
            })
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
            continue
          }
          shapeRects.push({
            x: (clip.left / ctx.target.width) * 2 - 1,
            y: 1 - (clip.top / ctx.target.height) * 2,
            w: (boxW / ctx.target.width) * 2,
            h: -((boxH / ctx.target.height) * 2),
            boxW,
            boxH,
            radius: clampShapeRadius(op.inputs.radius, boxW, boxH),
            strokeWidth: op.inputs.width,
            stroke: ((op.command.color[0] << 24) | (op.command.color[1] << 16) | (op.command.color[2] << 8) | op.command.color[3]) >>> 0,
          })
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "image") {
          const imageHandle = getImage(op.image.imageBuffer.data, op.image.imageBuffer.width, op.image.imageBuffer.height)
          if (!imageHandle) return { ok: false, rawLayer: null }
          const group = imageGroups.get(imageHandle) ?? { handle: imageHandle, instances: [] }
          group.instances.push({
            x: (clip.x / ctx.target.width) * 2 - 1,
            y: 1 - (clip.y / ctx.target.height) * 2,
            w: (clip.w / ctx.target.width) * 2,
            h: -((clip.h / ctx.target.height) * 2),
            opacity: 1,
          })
          imageGroups.set(imageHandle, group)
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "canvas") {
          const imageHandle = getCanvasSprite(op)
          if (!imageHandle) return { ok: false, rawLayer: null }
          const group = imageGroups.get(imageHandle) ?? { handle: imageHandle, instances: [] }
          group.instances.push({
            x: (clip.x / ctx.target.width) * 2 - 1,
            y: 1 - (clip.y / ctx.target.height) * 2,
            w: (clip.w / ctx.target.width) * 2,
            h: -((clip.h / ctx.target.height) * 2),
            opacity: 1,
          })
          imageGroups.set(imageHandle, group)
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "text") {
          const useGlyphAtlas = supportsWgpuCanvasGlyphLayer()
          let usedGlyphPath = false
          if (useGlyphAtlas) {
            const layout = layoutText(op.inputs.text, op.inputs.fontId, op.inputs.maxWidth, op.inputs.lineHeight)
            const textX = Math.round(op.command.x) - ctx.offsetX
            const textY = Math.round(op.command.y) - ctx.offsetY
            const atlasRecord = getGlyphAtlas(op.inputs.fontId)
            usedGlyphPath = !!atlasRecord
            if (atlasRecord) {
              tempGlyphs.length = 0
              dirtyRects.length = 0
              for (let li = 0; li < layout.lines.length; li++) {
                const line = layout.lines[li]
                let cursorX = textX
                const cursorY = textY + li * op.inputs.lineHeight
                for (const glyph of line.text) {
                  const code = glyph.codePointAt(0)
                  if (code === undefined) continue
                  const glyphIndex = atlasRecord.indexFor(code)
                  if (glyphIndex < 0) {
                    usedGlyphPath = false
                    break
                  }
                  const advance = atlasRecord.glyphWidths[glyphIndex] || atlasRecord.cellWidth
                  if (glyph === " ") {
                    cursorX += advance
                    continue
                  }
                  const glyphLeft = Math.round(cursorX)
                  const glyphTop = Math.round(cursorY)
                  const glyphRight = glyphLeft + atlasRecord.cellWidth
                  const glyphBottom = glyphTop + atlasRecord.cellHeight
                  if (glyphRight > 0 && glyphBottom > 0 && glyphLeft < ctx.target.width && glyphTop < ctx.target.height) {
                    const col = glyphIndex % atlasRecord.columns
                    const row = Math.floor(glyphIndex / atlasRecord.columns)
                    tempGlyphs.push({
                      x: (glyphLeft / ctx.target.width) * 2 - 1,
                      y: 1 - (glyphTop / ctx.target.height) * 2,
                      w: (atlasRecord.cellWidth / ctx.target.width) * 2,
                      h: -((atlasRecord.cellHeight / ctx.target.height) * 2),
                      u: (col * atlasRecord.cellWidth) / (atlasRecord.cellWidth * atlasRecord.columns),
                      v: (row * atlasRecord.cellHeight) / (atlasRecord.cellHeight * atlasRecord.rows),
                      uw: atlasRecord.cellWidth / (atlasRecord.cellWidth * atlasRecord.columns),
                      vh: atlasRecord.cellHeight / (atlasRecord.cellHeight * atlasRecord.rows),
                      r: op.command.color[0] / 255,
                      g: op.command.color[1] / 255,
                      b: op.command.color[2] / 255,
                      a: op.command.color[3] / 255,
                      opacity: 1,
                    })
                    dirtyRects.push({
                      left: Math.max(0, glyphLeft),
                      top: Math.max(0, glyphTop),
                      right: Math.min(ctx.target.width, glyphRight),
                      bottom: Math.min(ctx.target.height, glyphBottom),
                    })
                  }
                  cursorX += advance
                }
                if (!usedGlyphPath) break
              }
              if (usedGlyphPath && tempGlyphs.length > 0) {
                const group = glyphGroups.get(atlasRecord.handle) ?? { handle: atlasRecord.handle, instances: [] }
                group.instances.push(...tempGlyphs)
                glyphGroups.set(atlasRecord.handle, group)
                for (const rect of dirtyRects) markDirty(rect.left, rect.top, rect.right, rect.bottom)
              }
            }
          }
          if (!usedGlyphPath) failGpuOnly("text requires unsupported glyphs outside the GPU atlas path")
          continue
        }
        failGpuOnly(`unsupported render op kind=${op.kind}`)
      }
      flushAll()
    } finally {
      if (layerOpen) endWgpuCanvasTargetLayer(context, targetHandle)
    }

    if (first) return { ok: true as const, rawLayer: null }
    if (readbackMode === "none") {
      for (const handle of transientFullFrameImages) destroyWgpuCanvasImage(context, handle)
      return { ok: true as const, rawLayer: null }
    }
    // 9.3d: Use vexart_composite_readback_rgba instead of tge_wgpu_canvas readback.
    const vCtx = getVexartCtx()
    const rgba = vexartReadbackRgba(vCtx, ctx.targetWidth, ctx.targetHeight)
    for (const handle of transientFullFrameImages) destroyWgpuCanvasImage(context, handle)
    if (!rgba) return { ok: false, rawLayer: null }
    return {
      ok: true as const,
      rawLayer: {
        data: rgba,
        width: ctx.targetWidth,
        height: ctx.targetHeight,
      },
    }
  }

  const composeFinalFrame = (frame: RendererBackendFrameContext): RendererBackendFrameResult | null => {
    if (!context) return null
    if (currentFrameLayers.length === 0) {
      pruneLayerTargets()
      return { output: "none", strategy: lastStrategy }
    }
    const targetHandle = getFinalFrameTarget(frame.viewportWidth, frame.viewportHeight)
    if (!targetHandle) return null
    const tempImages: WgpuCanvasImageHandle[] = []
    const orderedLayers = currentFrameLayers.slice().sort((a, b) => a.z - b.z)
    beginWgpuCanvasTargetLayer(context, targetHandle, 0, 0x00000000)
    try {
      let first = true
      for (const layer of orderedLayers) {
        const copied = copyGpuTargetRegionToImage(context, layer.handle, {
          x: 0,
          y: 0,
          width: layer.width,
          height: layer.height,
        })
        tempImages.push(copied.handle)
        if (layer.subtreeTransform) {
          renderWgpuCanvasTargetTransformedImagesLayer(context, targetHandle, copied.handle, [{
            p0: { x: (layer.subtreeTransform.p0.x / frame.viewportWidth) * 2 - 1, y: 1 - (layer.subtreeTransform.p0.y / frame.viewportHeight) * 2 },
            p1: { x: (layer.subtreeTransform.p1.x / frame.viewportWidth) * 2 - 1, y: 1 - (layer.subtreeTransform.p1.y / frame.viewportHeight) * 2 },
            p2: { x: (layer.subtreeTransform.p2.x / frame.viewportWidth) * 2 - 1, y: 1 - (layer.subtreeTransform.p2.y / frame.viewportHeight) * 2 },
            p3: { x: (layer.subtreeTransform.p3.x / frame.viewportWidth) * 2 - 1, y: 1 - (layer.subtreeTransform.p3.y / frame.viewportHeight) * 2 },
            opacity: 1,
          }], first ? 0 : 1, 0x00000000)
        } else {
          compositeWgpuCanvasTargetImageLayer(context, targetHandle, copied.handle, {
            x: (layer.x / frame.viewportWidth) * 2 - 1,
            y: 1 - (layer.y / frame.viewportHeight) * 2,
            w: (layer.width / frame.viewportWidth) * 2,
            h: -((layer.height / frame.viewportHeight) * 2),
            opacity: 1,
          }, first ? 0 : 1, 0x00000000)
        }
        first = false
      }
    } finally {
      endWgpuCanvasTargetLayer(context, targetHandle)
      for (const handle of tempImages) destroyWgpuCanvasImage(context, handle)
    }
    pruneLayerTargets()
    const readback = readbackWgpuCanvasTargetRGBA(context, targetHandle, frame.viewportWidth * frame.viewportHeight * 4)
    return {
      output: "final-frame-raw",
      strategy: lastStrategy,
      finalFrame: {
        data: readback.data,
        width: frame.viewportWidth,
        height: frame.viewportHeight,
      },
    }
  }

  renderOpToImage = (op, width, height, offsetX, offsetY) => {
    if (!context) return null
    const target = createWgpuCanvasTarget(context, { width, height })
    try {
      const spriteCtx: RendererBackendPaintContext = {
        targetWidth: width,
        targetHeight: height,
        backing: null,
        target: { width, height },
        commands: [op.command],
        graph: { ops: [op] },
        offsetX,
        offsetY,
        frame: null,
        layer: null,
      }
      const result = renderFrame(spriteCtx, target, "none")
      if (!result.ok) return null
      return copyGpuTargetRegionToImage(context, target, { x: 0, y: 0, width, height }).handle
    } finally {
      destroyWgpuCanvasTarget(context, target)
    }
  }

  return {
    name: "gpu-render-graph",
    beginFrame(ctx): RendererBackendFramePlan {
      currentFrame = ctx
      currentFrameLayers = []
      activeLayerKeys.clear()
      suppressFinalPresentation = false
      markCanvasSpritesUnusedForFrame()
      if (!gpuAvailable || !context || !ctx.useLayerCompositing) {
        lastStrategy = null
        framesSinceStrategyChange = 0
        lastStrategyTelemetry = { preferred: null, chosen: null, estimatedLayeredBytes: 0, estimatedFinalBytes: 0 }
        return { strategy: null }
      }
      if (FORCED_LAYER_STRATEGY) {
        framesSinceStrategyChange = lastStrategy === FORCED_LAYER_STRATEGY ? framesSinceStrategyChange + 1 : 0
        lastStrategy = FORCED_LAYER_STRATEGY
        lastStrategyTelemetry = {
          preferred: FORCED_LAYER_STRATEGY,
          chosen: FORCED_LAYER_STRATEGY,
          estimatedLayeredBytes: ctx.estimatedLayeredBytes,
          estimatedFinalBytes: ctx.estimatedFinalBytes,
        }
        return { strategy: lastStrategy }
      }
      const previousStrategy = lastStrategy
      const chosen = chooseGpuLayerStrategy({
        dirtyLayerCount: ctx.dirtyLayerCount,
        dirtyPixelArea: ctx.dirtyPixelArea,
        totalPixelArea: ctx.totalPixelArea,
        overlapPixelArea: ctx.overlapPixelArea,
        overlapRatio: ctx.overlapRatio,
        fullRepaint: ctx.fullRepaint,
        hasSubtreeTransforms: ctx.hasSubtreeTransforms,
        hasActiveInteraction: ctx.hasActiveInteraction,
        transmissionMode: ctx.transmissionMode,
        estimatedLayeredBytes: ctx.estimatedLayeredBytes,
        estimatedFinalBytes: ctx.estimatedFinalBytes,
        lastStrategy: previousStrategy,
        framesSinceChange: framesSinceStrategyChange,
      })
      framesSinceStrategyChange = chosen === previousStrategy ? framesSinceStrategyChange + 1 : 0
      lastStrategy = chosen
      lastStrategyTelemetry = {
        preferred: chosen,
        chosen,
        estimatedLayeredBytes: ctx.estimatedLayeredBytes,
        estimatedFinalBytes: ctx.estimatedFinalBytes,
      }
      return { strategy: lastStrategy }
    },
    paint(ctx) {
      if (!gpuAvailable || !context) {
        failGpuOnly("GPU backend unavailable; CPU fallback was removed")
      }

      const unsupported = getUnsupportedGpuOps(ctx.graph.ops)
      if (unsupported.length > 0) {
        const counts = new Map<string, number>()
        for (const op of unsupported) counts.set(op.kind, (counts.get(op.kind) ?? 0) + 1)
        logGpuRenderer(`[frame] unsupported=${JSON.stringify(Object.fromEntries(counts))} totalOps=${ctx.graph.ops.length}`)
        failGpuOnly(`unsupported render ops encountered: ${Array.from(counts.entries()).map(([kind, count]) => `${kind}=${count}`).join(", ")}`)
      } else {
        logGpuRenderer(`[frame] unsupported={} totalOps=${ctx.graph.ops.length}`)
      }

      const frameCtx = ctx.frame
      const layerCtx = ctx.layer
      const delegatedFrame = !!(currentFrame && frameCtx && currentFrame === frameCtx)
      if (delegatedFrame && frameCtx.useLayerCompositing && layerCtx) {
        const layerTarget = getLayerTarget(layerCtx.key, ctx.target.width, ctx.target.height)
        if (!layerTarget) {
          suppressFinalPresentation = true
          failGpuOnly(`could not allocate GPU layer target for ${layerCtx.key}`)
        }
        activeLayerKeys.add(layerCtx.key)
        const readbackMode = lastStrategy === "final-frame-raw" ? "none" : "auto"
        const result = renderFrame(ctx, layerTarget, readbackMode)
        if (!result.ok) {
          suppressFinalPresentation = true
          failGpuOnly(`GPU layer render failed for ${layerCtx.key}`)
        }
        if (lastStrategy === "final-frame-raw") {
          recordCurrentFrameLayer({
            key: layerCtx.key,
            z: layerCtx.z,
            x: layerCtx.bounds.x,
            y: layerCtx.bounds.y,
            width: layerCtx.bounds.width,
            height: layerCtx.bounds.height,
            handle: layerTarget,
            isBackground: layerCtx.isBackground,
            subtreeTransform: layerCtx.subtreeTransform,
          })
          return { output: "skip-present", strategy: lastStrategy }
        }
        return { output: "kitty-payload", strategy: lastStrategy, kittyPayload: result.rawLayer ?? undefined }
      }

      const standaloneHandle = getStandaloneTarget(ctx.target.width, ctx.target.height)
      if (!standaloneHandle) {
        suppressFinalPresentation = true
        failGpuOnly("could not allocate standalone GPU target")
      }
      const result = renderFrame(ctx, standaloneHandle)
      if (!result.ok) {
        suppressFinalPresentation = true
        failGpuOnly("standalone GPU render failed")
      }
      return { output: "kitty-payload", strategy: lastStrategy, kittyPayload: result.rawLayer ?? undefined }
    },
    reuseLayer(ctx) {
      if (!gpuAvailable || !context) return false
      const record = layerTargets.get(ctx.layer.key)
      if (!record) return false
      activeLayerKeys.add(ctx.layer.key)
      if (lastStrategy === "final-frame-raw") {
        recordCurrentFrameLayer({
          key: ctx.layer.key,
          z: ctx.layer.z,
          x: ctx.layer.bounds.x,
          y: ctx.layer.bounds.y,
          width: ctx.layer.bounds.width,
          height: ctx.layer.bounds.height,
          handle: record.handle,
          isBackground: ctx.layer.isBackground,
          subtreeTransform: ctx.layer.subtreeTransform,
        })
      }
      return true
    },
    endFrame(ctx) {
      currentFrame = null
      pruneCanvasSpriteCache()
      if (!gpuAvailable || !context || !ctx.useLayerCompositing) return { output: "none", strategy: lastStrategy }
      if (suppressFinalPresentation) {
        pruneLayerTargets()
        return { output: "none", strategy: lastStrategy }
      }
      if (lastStrategy !== "final-frame-raw") {
        pruneLayerTargets()
        return { output: "none", strategy: lastStrategy }
      }
      return composeFinalFrame(ctx)
    },
    getLastStrategy() {
      return lastStrategy
    },
  }
}
