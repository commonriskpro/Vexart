// gpu-renderer-backend.ts — Phase 2b native path
// All GPU target lifecycle, compositing, readback, and backdrop/mask operations
// rewired to vexart_composite_* FFI (Phase 2b Slice 2). wgpu-canvas-bridge deleted.
// Per design §11, §8.2 cmd_kind allocation. Shadow uses dedicated cmd_kind=20.
// Phase 2b Native Presentation: final-frame and layer presentation can route
// through native Rust Kitty output when nativePresentation flag is active.

import { appendFileSync } from "node:fs"
import { ptr } from "bun:ffi"
import { CanvasContext } from "./canvas"
import { getAtlas, loadFontAtlas, ATLAS_RANGES } from "./font-atlas"
import { transformBounds, transformPoint } from "./matrix"
import type { BackdropRenderMetadata, EffectRenderOp, ImageRenderOp, RectangleRenderOp, RenderGraphOp, TextRenderOp, BorderRenderOp } from "./render-graph"
import type {
  RendererBackend,
  RendererBackendFrameContext,
  RendererBackendFramePlan,
  RendererBackendProfile,
  RendererBackendFrameResult,
  RendererBackendPaintContext,
  RendererBackendRetainedLayer,
} from "./renderer-backend"
import { chooseGpuLayerStrategy, type GpuLayerStrategyMode } from "./gpu-layer-strategy"
import { nativeChooseFrameStrategy, NATIVE_FRAME_STRATEGY, NATIVE_FRAME_TRANSPORT, type NativeFramePlan } from "./native-frame-orchestrator"
import { builtinFontScale, getFont, layoutText } from "./text-layout"
import { openVexartLibrary } from "./vexart-bridge"
import {
  GRAPH_MAGIC, GRAPH_VERSION,
} from "./vexart-buffer"
import {
  allocNativeStatsBuf,
  decodeNativePresentationStats,
  type NativePresentationStats,
} from "./native-presentation-stats"
import {
  isNativePresentationCapable,
  disableNativePresentation,
  logNativePresentationFallback,
} from "./native-presentation-flags"
import {
  nativeLayerPresentDirty,
  nativeLayerReuse,
  nativeLayerUpsert,
} from "./native-layer-registry"
import { ensureNativeKittyTransport, nativeEmitLayerTarget, nativeEmitRegionTarget } from "./native-presentation-ops"
import type { NativeScenePaintOpRef } from "./native-render-graph"
// Phase 2b: All paint + composite ops route through libvexart.
// Paint primitives: vexart_paint_dispatch cmd_kinds 0-20.
// Target lifecycle: vexart_composite_target_create/destroy/begin_layer/end_layer.
// Compositing: vexart_composite_render_image_layer.
// Copy region: vexart_composite_copy_region_to_image.
// Backdrop filter: vexart_composite_image_filter_backdrop.
// Mask: vexart_composite_image_mask_rounded_rect.
// Readback: vexart_composite_readback_rgba.
// Images: vexart_paint_upload_image / vexart_paint_remove_image.
// Glyphs: DEC-011 no-op.

// ── Handle types (bigint u64 — same shape as bridge was) ─────────────────────
type VexartTargetHandle = bigint
type VexartImageHandle = bigint

// ── Vexart composite helpers ─────────────────────────────────────────────────
// Inline wrappers for new Phase 2b composite FFI exports.

/** Create an offscreen RGBA8 render target. Returns bigint handle or 0n on failure. */
function vexartCompositeTargetCreate(vctx: bigint, width: number, height: number): bigint {
  const { symbols } = openVexartLibrary()
  const out = new BigUint64Array(1)
  const result = symbols.vexart_composite_target_create(vctx, width, height, ptr(out)) as number
  if (result !== 0) return 0n
  return out[0]
}

/** Destroy an offscreen render target. */
function vexartCompositeTargetDestroy(vctx: bigint, target: bigint): void {
  if (!target) return
  const { symbols } = openVexartLibrary()
  symbols.vexart_composite_target_destroy(vctx, target)
}

/** Begin a render layer on the target. loadMode=0 clears to clearRgba. */
function vexartCompositeTargetBeginLayer(vctx: bigint, target: bigint, loadMode: 0 | 1, clearRgba: number): void {
  const { symbols } = openVexartLibrary()
  const result = symbols.vexart_composite_target_begin_layer(vctx, target, loadMode, clearRgba >>> 0) as number
  if (result !== 0) throw new Error(`vexart_composite_target_begin_layer failed: ${result}`)
}

/** End the active render layer and submit GPU work. */
function vexartCompositeTargetEndLayer(vctx: bigint, target: bigint): void {
  const { symbols } = openVexartLibrary()
  const result = symbols.vexart_composite_target_end_layer(vctx, target) as number
  if (result !== 0) throw new Error(`vexart_composite_target_end_layer failed: ${result}`)
}

/** Composite an image onto a target. x/y/w/h are pixel coordinates. */
function vexartCompositeRenderImageLayer(
  vctx: bigint,
  target: bigint,
  image: bigint,
  x: number, y: number, w: number, h: number,
  z: number,
  clearRgba: number,
): void {
  const { symbols } = openVexartLibrary()
  const result = symbols.vexart_composite_render_image_layer(vctx, target, image, x, y, w, h, z, clearRgba >>> 0) as number
  if (result !== 0) throw new Error(`vexart_composite_render_image_layer failed: ${result}`)
}

/** Extract a rectangular region from a target into a new image handle. Returns 0n on failure. */
function vexartCompositeCopyRegionToImage(
  vctx: bigint,
  target: bigint,
  x: number, y: number, w: number, h: number,
): bigint {
  const { symbols } = openVexartLibrary()
  const out = new BigUint64Array(1)
  const result = symbols.vexart_composite_copy_region_to_image(vctx, target, x, y, w, h, ptr(out)) as number
  if (result !== 0) return 0n
  return out[0]
}

/** Apply backdrop filter params to an image. params: float32 array [blur, brightness, contrast, saturate, grayscale, invert, sepia, hueRotate]. NaN means "not requested". Returns 0n on failure. */
function vexartCompositeImageFilterBackdrop(
  vctx: bigint,
  image: bigint,
  params: WgpuBackdropFilterParams,
): bigint {
  const { symbols } = openVexartLibrary()
  const paramBuf = new Float32Array(8)
  paramBuf[0] = params.blur ?? Number.NaN
  paramBuf[1] = params.brightness ?? Number.NaN
  paramBuf[2] = params.contrast ?? Number.NaN
  paramBuf[3] = params.saturate ?? Number.NaN
  paramBuf[4] = params.grayscale ?? Number.NaN
  paramBuf[5] = params.invert ?? Number.NaN
  paramBuf[6] = params.sepia ?? Number.NaN
  paramBuf[7] = params.hueRotate ?? Number.NaN
  const out = new BigUint64Array(1)
  const result = symbols.vexart_composite_image_filter_backdrop(
    vctx, image, ptr(new Uint8Array(paramBuf.buffer)), paramBuf.byteLength, ptr(out)
  ) as number
  if (result !== 0) return 0n
  return out[0]
}

/** Apply rounded-rect mask. rectBuf = 6×f32: radius_uniform, tl, tr, br, bl, mode (0=uniform 1=per-corner). Returns 0n on failure. */
function vexartCompositeImageMaskRoundedRect(
  vctx: bigint,
  image: bigint,
  rectBuf: Float32Array,
): bigint {
  const { symbols } = openVexartLibrary()
  const out = new BigUint64Array(1)
  const result = symbols.vexart_composite_image_mask_rounded_rect(
    vctx, image, ptr(new Uint8Array(rectBuf.buffer)), ptr(out)
  ) as number
  if (result !== 0) return 0n
  return out[0]
}

/** Full readback from a vexart target. Returns Uint8Array or null. */
function vexartCompositeReadbackRgba(vctx: bigint, target: bigint, byteLength: number): Uint8Array | null {
  const { symbols } = openVexartLibrary()
  const data = new Uint8Array(byteLength)
  const statsOut = new Uint8Array(32)
  const result = symbols.vexart_composite_readback_rgba(vctx, target, ptr(data), byteLength, ptr(statsOut)) as number
  if (result !== 0) return null
  return data
}

/** Region readback from a vexart target. Region is target-local pixels. */
function vexartCompositeReadbackRegionRgba(
  vctx: bigint,
  target: bigint,
  region: { x: number; y: number; width: number; height: number },
): Uint8Array | null {
  const { symbols } = openVexartLibrary()
  const data = new Uint8Array(region.width * region.height * 4)
  const rect = new Uint8Array(16)
  const view = new DataView(rect.buffer)
  view.setUint32(0, region.x, true)
  view.setUint32(4, region.y, true)
  view.setUint32(8, region.width, true)
  view.setUint32(12, region.height, true)
  const statsOut = new Uint8Array(32)
  const result = symbols.vexart_composite_readback_region_rgba(
    vctx,
    target,
    ptr(rect),
    ptr(data),
    data.byteLength,
    ptr(statsOut),
  ) as number
  if (result !== 0) return null
  return data
}

// ── Backdrop filter params type (mirror of WgpuBackdropFilterParams) ─────────
type WgpuBackdropFilterParams = {
  blur: number | null
  brightness: number | null
  contrast: number | null
  saturate: number | null
  grayscale: number | null
  invert: number | null
  sepia: number | null
  hueRotate: number | null
}

// ── Native GPU image helpers ────────────────────────────────────────────────
// These helpers copy regions between native composite targets and native image
// handles. They are binding-shell utilities, not a separate TS raster pipeline.

type GpuRasterImage = { handle: VexartImageHandle; width: number; height: number }

function copyGpuTargetRegionToImage(
  vctx: bigint,
  target: VexartTargetHandle,
  region: { x: number; y: number; width: number; height: number },
): GpuRasterImage {
  const handle = vexartCompositeCopyRegionToImage(vctx, target, region.x, region.y, region.width, region.height)
  return { handle, width: region.width, height: region.height }
}

function createEmptyGpuImage(
  vctx: bigint,
  width: number,
  height: number,
): GpuRasterImage {
  const target = vexartCompositeTargetCreate(vctx, width, height)
  try {
    vexartCompositeTargetBeginLayer(vctx, target, 0, 0x00000000)
    vexartCompositeTargetEndLayer(vctx, target)
    return copyGpuTargetRegionToImage(vctx, target, { x: 0, y: 0, width, height })
  } finally {
    vexartCompositeTargetDestroy(vctx, target)
  }
}

// ── Glyph instance type (retained for type-compatibility inside getGlyphAtlas) ─
type WgpuCanvasGlyphInstance = {
  x: number; y: number; w: number; h: number
  u: number; v: number; uw: number; vh: number
  r: number; g: number; b: number; a: number
  opacity: number
}

// ── ShapeRect / ShapeRectCorners types (used by push arrays) ─────────────────
type WgpuCanvasShapeRect = {
  x: number; y: number; w: number; h: number
  boxW: number; boxH: number
  radius: number; strokeWidth: number
  fill?: number; stroke?: number
}

type WgpuCanvasCornerRadii = { tl: number; tr: number; br: number; bl: number }

type WgpuCanvasShapeRectCorners = {
  x: number; y: number; w: number; h: number
  boxW: number; boxH: number
  radii: WgpuCanvasCornerRadii
  strokeWidth: number
  fill?: number; stroke?: number
}

type WgpuCanvasGlow = { x: number; y: number; w: number; h: number; color: number; intensity: number }

type WgpuCanvasShadow = {
  x: number; y: number; w: number; h: number
  color: number
  radii: WgpuCanvasCornerRadii
  boxW: number; boxH: number
  offsetX: number; offsetY: number
  blur: number
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
 * cmd_kind: one of 0-20 per §8.2.
 * target: 0n = default context target, non-zero = specific registry target.
 */
function flushVexartBatch(ctx: bigint, cmdKind: number, instanceData: Uint8Array, target: bigint = 0n): void {
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
  symbols.vexart_paint_dispatch(ctx, target, ptr(new Uint8Array(buf)), total, ptr(statsOut))
}

/**
 * Flush a single-instance batch to a specific vexart target handle.
 * Convenience wrapper over flushVexartBatch for sprite rendering.
 */
function flushVexartBatchToTarget(ctx: bigint, target: bigint, cmdKind: number, instanceData: Uint8Array): void {
  flushVexartBatch(ctx, cmdKind, instanceData, target)
}

function dispatchNativeScenePaint(
  ctx: bigint,
  scene: bigint,
  target: bigint,
  targetWidth: number,
  targetHeight: number,
  offsetX: number,
  offsetY: number,
  refs: NativeScenePaintOpRef[],
) {
  if (!scene || refs.length === 0) return null
  const { symbols } = openVexartLibrary()
  const HEADER = 24
  const REF = 16
  const config = new Uint8Array(HEADER + refs.length * REF)
  const view = new DataView(config.buffer)
  view.setUint32(0, Math.max(0, Math.round(targetWidth)), true)
  view.setUint32(4, Math.max(0, Math.round(targetHeight)), true)
  view.setFloat32(8, offsetX, true)
  view.setFloat32(12, offsetY, true)
  view.setUint32(16, refs.length, true)
  view.setUint32(20, 0, true)
  for (let i = 0; i < refs.length; i++) {
    const off = HEADER + i * REF
    view.setBigUint64(off, refs[i].nodeId, true)
    view.setUint32(off + 8, refs[i].kind, true)
    view.setUint32(off + 12, 0, true)
  }
  const statsOut = new Uint8Array(32)
  const rc = symbols.vexart_scene_paint_dispatch(ctx, scene, target, ptr(config), config.byteLength, ptr(statsOut)) as number
  if (rc !== 0) return null
  const stats = new DataView(statsOut.buffer, statsOut.byteOffset, statsOut.byteLength)
  return {
    gpuTimeUs: Number(stats.getBigUint64(0, true)),
    cpuTimeUs: Number(stats.getBigUint64(8, true)),
    drawCalls: stats.getUint32(16, true),
    primitives: stats.getUint32(20, true),
  }
}

function compositeTargetUniformToTarget(ctx: bigint, target: bigint, sourceTarget: bigint, instanceData: Uint8Array): boolean {
  const { symbols } = openVexartLibrary()
  const rc = symbols.vexart_composite_update_uniform(ctx, target, sourceTarget, ptr(instanceData), 0) as number
  return rc === 0
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
 * Pack BridgeShadowInstance (20 floats) for cmd_kind=20.
 */
function packShadowInstance(
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  radii: WgpuCanvasCornerRadii,
  boxW: number,
  boxH: number,
  offsetX: number,
  offsetY: number,
  blur: number,
): Uint8Array {
  const buf = new ArrayBuffer(80)
  const v = new DataView(buf)
  const r = ((color >>> 24) & 0xff) / 255; const g = ((color >>> 16) & 0xff) / 255; const b = ((color >>> 8) & 0xff) / 255; const a = (color & 0xff) / 255
  vf32(v, 0, x); vf32(v, 4, y); vf32(v, 8, w); vf32(v, 12, h)
  vf32(v, 16, r); vf32(v, 20, g); vf32(v, 24, b); vf32(v, 28, a)
  vf32(v, 32, radii.tl); vf32(v, 36, radii.tr); vf32(v, 40, radii.br); vf32(v, 44, radii.bl)
  vf32(v, 48, boxW); vf32(v, 52, boxH); vf32(v, 56, offsetX); vf32(v, 60, offsetY)
  vf32(v, 64, blur); vf32(v, 68, 0); vf32(v, 72, 0); vf32(v, 76, 0)
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

/** @public */
export type GpuRendererBackend = RendererBackend & {
  getLastStrategy: () => GpuLayerStrategyMode | null
}

type NativeScenePaintContext = Omit<RendererBackendPaintContext, "graph"> & {
  scene: bigint
  refs: NativeScenePaintOpRef[]
}

type NativeScenePaintBackendResult = ReturnType<RendererBackend["paint"]>

/** @public */
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
const MAX_GPU_TRANSFORM_SPRITES = 64

let gpuRendererBackendStatsProvider: (() => GpuRendererBackendCacheStats) | null = null

function touchMapEntry<K, V>(cache: Map<K, V>, key: K, value: V) {
  cache.delete(key)
  cache.set(key, value)
}

/** @public */
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
function getForcedLayerStrategy(): GpuLayerStrategyMode | null {
  const forcedStrategyValue = process.env.TGE_GPU_FORCE_LAYER_STRATEGY
  if (forcedStrategyValue === "skip-present") return "skip-present"
  if (forcedStrategyValue === "layered-dirty" || forcedStrategyValue === "layered-raw") return "layered-dirty"
  if (forcedStrategyValue === "layered-region") return "layered-region"
  if (forcedStrategyValue === "final-frame" || forcedStrategyValue === "final-frame-raw") return "final-frame"
  return null
}

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
  handle: VexartTargetHandle
}

type RenderedLayerRecord = {
  key: string
  z: number
  x: number
  y: number
  width: number
  height: number
  handle: VexartTargetHandle
  isBackground: boolean
  subtreeTransform:
    | {
        p0: { x: number; y: number }
        p1: { x: number; y: number }
        p2: { x: number; y: number }
        p3: { x: number; y: number }
      }
    | null
  opacity: number
}

type ImageRecord = {
  handle: VexartImageHandle
  width: number
  height: number
}

type GlyphAtlasRecord = {
  handle: VexartImageHandle
  /** Atlas texture cell dimensions (supersampled, for UV calculation). */
  cellWidth: number
  cellHeight: number
  /** Display cell dimensions (original size, for quad sizing). */
  displayCellWidth: number
  displayCellHeight: number
  columns: number
  rows: number
  glyphWidths: Float32Array
  ascender: number
  /** Returns glyphIndex for a codepoint, or -1 if not in atlas. */
  indexFor: (cp: number) => number
}

type TransformSpriteRecord = {
  key: string
  handle: VexartImageHandle
  width: number
  height: number
}

type BackdropSourceRecord = {
  key: string
  frameId: number
  bounds: IntBounds
  handle: VexartImageHandle
}

type BackdropSpriteRecord = {
  key: string
  frameId: number
  bounds: IntBounds
  handle: VexartImageHandle
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
  handle: VexartImageHandle
  instances: ImageInstance[]
}

type GlyphGroup = {
  handle: VexartImageHandle
  instances: WgpuCanvasGlyphInstance[]
}

type TransformedImageGroup = {
  handle: VexartImageHandle
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

/** @public */
export function createGpuRendererBackend(): GpuRendererBackend {
  // Phase 2b: GPU is always available via libvexart — no bridge probe needed.
  const gpuAvailable = true

  // vexart context handle — allocated on first use.
  // Phase 2b: used for all vexart_paint_dispatch + vexart_composite_* calls.
  let _vexartCtx: bigint | null = null
  let _defaultAtlasLoaded = false
  function getVexartCtx(): bigint {
    if (_vexartCtx !== null) return _vexartCtx
    const { symbols } = openVexartLibrary()
    const ctxBuf = new BigUint64Array(1)
    // Bun FFI rejects zero-length ArrayBufferView for ptr(); use 1-byte dummy.
    const optsPtr = ptr(new Uint8Array(1))
    const result = symbols.vexart_context_create(optsPtr, 0, ptr(ctxBuf)) as number
    if (result !== 0) return 0n
    _vexartCtx = ctxBuf[0]
    // Load default font atlas (fontId=0) into the Rust GPU text pipeline.
    if (!_defaultAtlasLoaded) {
      _defaultAtlasLoaded = true
      const defaultDesc = getFont(0) // { family: "monospace", size: 14, weight: 400 }
      loadFontAtlas(_vexartCtx, 0, defaultDesc)
    }
    return _vexartCtx
  }
  let lastStrategy: GpuLayerStrategyMode | null = null
  let lastNativeFramePlan: NativeFramePlan | null = null
  let standaloneTarget: TargetRecord | null = null
  let finalFrameTarget: TargetRecord | null = null
  const layerTargets = new Map<string, TargetRecord>()
  const glyphAtlases = new Map<string, GlyphAtlasRecord>()
  const imageCache = new WeakMap<Uint8Array, ImageRecord>()
  const transformSpriteCache = new Map<string, TransformSpriteRecord>()
  const backdropSourceCache = new Map<string, BackdropSourceRecord>()
  const backdropSpriteCache = new Map<string, BackdropSpriteRecord>()
  const canvasFunctionIds = new WeakMap<Function, number>()
  let nextCanvasFunctionId = 1
  let frameGeneration = 0
  let framesSinceStrategyChange = 0
  let currentFrame: RendererBackendFrameContext | null = null
  let currentFrameLayers: RenderedLayerRecord[] = []
  let renderOpToImage: ((op: RenderGraphOp, width: number, height: number, offsetX: number, offsetY: number) => VexartImageHandle | null) | null = null
  const activeLayerKeys = new Set<string>()
  let suppressFinalPresentation = false
  const backendProfile: RendererBackendProfile = {
    compositeMs: 0,
    readbackMs: 0,
    nativeEmitMs: 0,
    nativeReadbackMs: 0,
    nativeCompressMs: 0,
    nativeShmPrepareMs: 0,
    nativeWriteMs: 0,
    nativeRawBytes: 0,
    nativePayloadBytes: 0,
    uniformUpdateMs: 0,
  }
  const resetBackendProfile = () => {
    backendProfile.compositeMs = 0
    backendProfile.readbackMs = 0
    backendProfile.nativeEmitMs = 0
    backendProfile.nativeReadbackMs = 0
    backendProfile.nativeCompressMs = 0
    backendProfile.nativeShmPrepareMs = 0
    backendProfile.nativeWriteMs = 0
    backendProfile.nativeRawBytes = 0
    backendProfile.nativePayloadBytes = 0
    backendProfile.uniformUpdateMs = 0
  }
  const addBackendProfile = (key: keyof RendererBackendProfile, start: number) => {
    backendProfile[key] += performance.now() - start
  }
  const addNativeStatsProfile = (stats: NativePresentationStats | null) => {
    if (!stats) return
    backendProfile.nativeReadbackMs += stats.readbackUs / 1000
    backendProfile.nativeCompressMs += stats.compressUs / 1000
    backendProfile.nativeShmPrepareMs += stats.shmPrepareUs / 1000
    backendProfile.nativeWriteMs += stats.writeUs / 1000
    backendProfile.nativeRawBytes += stats.rawBytes
    backendProfile.nativePayloadBytes += stats.payloadBytes
  }
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
  type LinearGradientItem = { x: number; y: number; w: number; h: number; boxW: number; boxH: number; radius: number; from: number; to: number; dirX: number; dirY: number }
  type RadialGradientItem = { x: number; y: number; w: number; h: number; boxW: number; boxH: number; radius: number; from: number; to: number }
  const shapeRects: WgpuCanvasShapeRect[] = []
  const shapeRectCorners: WgpuCanvasShapeRectCorners[] = []
  const linearGradients: LinearGradientItem[] = []
  const radialGradients: RadialGradientItem[] = []
  const shadows: WgpuCanvasShadow[] = []
  const glows: WgpuCanvasGlow[] = []
  const imageGroups = new Map<bigint, ImageGroup>()
  const glyphGroups = new Map<bigint, GlyphGroup>()
  const transformedImageGroups = new Map<bigint, TransformedImageGroup>()
  const transientFullFrameImages: VexartImageHandle[] = []
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
    const vctx = getVexartCtx()
    for (const record of glyphAtlases.values()) {
      vexartRemoveImage(vctx, record.handle)
    }
    glyphAtlases.clear()
    cacheStats.glyphAtlasCount = 0
    cacheStats.glyphAtlasBytes = 0
    for (const record of transformSpriteCache.values()) {
      vexartRemoveImage(vctx, record.handle)
    }
    clearTransformSpriteRecords()
    for (const record of backdropSourceCache.values()) {
      vexartRemoveImage(vctx, record.handle)
    }
    clearBackdropSourceRecords()
    for (const record of backdropSpriteCache.values()) {
      vexartRemoveImage(vctx, record.handle)
    }
    clearBackdropSpriteRecords()
  }

  const pruneBackdropCaches = (activeFrameId: number) => {
    const vctx = getVexartCtx()
    for (const [key, record] of backdropSourceCache) {
      if (record.frameId === activeFrameId) continue
      vexartRemoveImage(vctx, record.handle)
      deleteBackdropSourceRecord(key)
    }
    for (const [key, record] of backdropSpriteCache) {
      if (record.frameId === activeFrameId) continue
      vexartRemoveImage(vctx, record.handle)
      deleteBackdropSpriteRecord(key)
    }
  }

  const destroyTargetRecord = (record: TargetRecord | null) => {
    if (!record) return
    vexartCompositeTargetDestroy(getVexartCtx(), record.handle)
  }

  const getStandaloneTarget = (width: number, height: number) => {
    const vctx = getVexartCtx()
    if (standaloneTarget && standaloneTarget.width === width && standaloneTarget.height === height) {
      logGpuResize(`reuse target width=${width} height=${height}`)
      return standaloneTarget.handle
    }
    if (standaloneTarget) {
      logGpuResize(`destroy target prevWidth=${standaloneTarget.width} prevHeight=${standaloneTarget.height} nextWidth=${width} nextHeight=${height}`)
      vexartCompositeTargetDestroy(vctx, standaloneTarget.handle)
    } else {
      logGpuResize(`create first target width=${width} height=${height}`)
    }
    clearSpriteCaches()
    const handle = vexartCompositeTargetCreate(vctx, width, height)
    if (!handle) return null
    standaloneTarget = { key: "standalone", width, height, handle }
    logGpuResize(`created target width=${width} height=${height}`)
    return handle
  }

  const getFinalFrameTarget = (width: number, height: number) => {
    const vctx = getVexartCtx()
    if (finalFrameTarget && finalFrameTarget.width === width && finalFrameTarget.height === height) {
      return finalFrameTarget.handle
    }
    destroyTargetRecord(finalFrameTarget)
    const handle = vexartCompositeTargetCreate(vctx, width, height)
    if (!handle) return null
    finalFrameTarget = { key: "final-frame", width, height, handle }
    return handle
  }

  const getLayerTarget = (key: string, width: number, height: number) => {
    const vctx = getVexartCtx()
    const existing = layerTargets.get(key)
    if (existing && existing.width === width && existing.height === height) {
      touchMapEntry(layerTargets, key, existing)
      return existing.handle
    }
    if (existing) vexartCompositeTargetDestroy(vctx, existing.handle)
    const handle = vexartCompositeTargetCreate(vctx, width, height)
    if (!handle) return null
    setLayerTargetRecord(key, { key, width, height, handle })
    return handle
  }

  const pruneLayerTargets = () => {
    const vctx = getVexartCtx()
    for (const [key, record] of layerTargets) {
      if (activeLayerKeys.has(key)) continue
      vexartCompositeTargetDestroy(vctx, record.handle)
      deleteLayerTargetRecord(key)
    }
  }

  const trimTransformSpriteCache = () => {
    const vctx = getVexartCtx()
    while (transformSpriteCache.size > MAX_GPU_TRANSFORM_SPRITES) {
      const first = transformSpriteCache.keys().next().value
      if (!first) break
      const record = transformSpriteCache.get(first)
      if (record) vexartRemoveImage(vctx, record.handle)
      deleteTransformSpriteRecord(first)
    }
  }

  gpuRendererBackendStatsProvider = () => cacheStats

  const getImage = (rgba: Uint8Array, width: number, height: number): bigint | null => {
    // Image upload via vexart_paint_upload_image.
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
    const vctx = getVexartCtx()
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
    const handle = vexartUploadImage(vctx, rgba, width, height)
    if (!handle) return null
    const record: GlyphAtlasRecord = {
      handle,
      cellWidth: atlas.cellWidth,
      cellHeight: atlas.cellHeight,
      displayCellWidth: atlas.displayCellWidth,
      displayCellHeight: atlas.displayCellHeight,
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
        if (stale) vexartRemoveImage(vctx, stale.handle)
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
    // Phase 8: TS canvas sprite orchestration is removed. Canvas display-list
    // handles are registered natively; full native command replay belongs to a
    // later rendering slice. Until then, canvas ops that require replay fail
    // loudly instead of reviving a hidden TS-owned sprite cache.
    return null
  }

  const getTransformSprite = (op: Extract<RenderGraphOp, { kind: "effect" }>) => {
    const vctx = getVexartCtx()
    const width = Math.max(1, Math.round(op.command.width))
    const height = Math.max(1, Math.round(op.command.height))
    const key = `${op.kind}:${op.command.type}:${op.command.x}:${op.command.y}:${op.command.width}:${op.command.height}:${op.command.color[0]}:${op.command.color[1]}:${op.command.color[2]}:${op.command.color[3]}:${op.command.cornerRadius}:${op.command.extra1}:${op.command.extra2}:${op.command.text ?? ""}:${width}:${height}:${hashMatrix(op.effect.transform)}:${op.effect.opacity ?? 1}`
    const cached = transformSpriteCache.get(key)
    if (cached && cached.width === width && cached.height === height) {
      touchMapEntry(transformSpriteCache, key, cached)
      return cached.handle
    }
    if (cached) vexartRemoveImage(vctx, cached.handle)
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
    const renderSprite = renderOpToImage as ((op: RenderGraphOp, width: number, height: number, offsetX: number, offsetY: number) => VexartImageHandle | null) | null
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
    const vctx = getVexartCtx()
    const target = vexartCompositeTargetCreate(vctx, width, height)
    if (!target) return null
    try {
      // Render gradient into target via vexart_paint_dispatch (cmd_kinds 12/13)
      if (gradient.type === "linear") {
        const from = opacity < 1 ? applyOpacityToColor(gradient.from, opacity) : gradient.from
        const to = opacity < 1 ? applyOpacityToColor(gradient.to, opacity) : gradient.to
        const instance = packLinearGradientInstance(-1, 1, 2, -2, width, height, 0, from, to,
          Math.cos((gradient.angle * Math.PI) / 180),
          Math.sin((gradient.angle * Math.PI) / 180),
        )
        flushVexartBatchToTarget(vctx, target, 12, instance)
      } else {
        const from = opacity < 1 ? applyOpacityToColor(gradient.from, opacity) : gradient.from
        const to = opacity < 1 ? applyOpacityToColor(gradient.to, opacity) : gradient.to
        const instance = packRadialGradientInstance(-1, 1, 2, -2, width, height, Math.max(width, height) * 0.5, from, to)
        flushVexartBatchToTarget(vctx, target, 13, instance)
      }
      let handle = copyGpuTargetRegionToImage(vctx, target, { x: 0, y: 0, width, height }).handle
      if (cornerRadii) {
        // per-corner mask: mode=1, tl/tr/br/bl
        const rectBuf = new Float32Array(6)
        rectBuf[0] = 0  // uniform radius (unused in per-corner mode)
        rectBuf[1] = cornerRadii.tl
        rectBuf[2] = cornerRadii.tr
        rectBuf[3] = cornerRadii.br
        rectBuf[4] = cornerRadii.bl
        rectBuf[5] = 1  // mode=1 means per-corner
        const masked = vexartCompositeImageMaskRoundedRect(vctx, handle, rectBuf)
        vexartRemoveImage(vctx, handle)
        handle = masked
      }
      return handle
    } finally {
      vexartCompositeTargetDestroy(vctx, target)
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
    targetHandle: VexartTargetHandle,
    readbackMode: "auto" | "none" = "auto",
    readbackRegion?: { x: number; y: number; width: number; height: number } | null,
  ): { ok: boolean; rawLayer: { data: Uint8Array; width: number; height: number; region?: { x: number; y: number; width: number; height: number } } | null } => {
    let first = true
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

    const flushShapeRects = () => {
      if (shapeRects.length === 0) return
      // Dispatch via vexart_paint_dispatch (cmd_kind=1: BridgeShapeRectInstance)
      const instances = new Uint8Array(shapeRects.length * 80)
      for (let i = 0; i < shapeRects.length; i++) {
        const r = shapeRects[i]
        instances.set(packShapeRectInstance(r.x, r.y, r.w, r.h, r.boxW, r.boxH, r.radius, r.fill ?? 0, r.stroke ?? 0, r.strokeWidth), i * 80)
      }
      flushVexartBatch(vctx, 1, instances, targetHandle)
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
      flushVexartBatch(vctx, 2, instances, targetHandle)
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
      flushVexartBatch(vctx, 12, instances, targetHandle)
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
      flushVexartBatch(vctx, 13, instances, targetHandle)
      radialGradients.length = 0
      first = false
      targetMutationVersion += 1
    }
    const flushGlows = () => {
      if (glows.length === 0) return
      // Dispatch via vexart_paint_dispatch (cmd_kind=6: BridgeGlowInstance)
      const instances = new Uint8Array(glows.length * 48)
      for (let i = 0; i < glows.length; i++) {
        const g = glows[i]
        instances.set(packGlowInstance(g.x, g.y, g.w, g.h, g.color, g.intensity ?? 80), i * 48)
      }
      flushVexartBatch(vctx, 6, instances, targetHandle)
      glows.length = 0
      first = false
      targetMutationVersion += 1
    }
    const flushShadows = () => {
      if (shadows.length === 0) return
      // Dispatch via vexart_paint_dispatch (cmd_kind=20: BridgeShadowInstance)
      const instances = new Uint8Array(shadows.length * 80)
      for (let i = 0; i < shadows.length; i++) {
        const s = shadows[i]
        instances.set(packShadowInstance(s.x, s.y, s.w, s.h, s.color, s.radii, s.boxW, s.boxH, s.offsetX, s.offsetY, s.blur), i * 80)
      }
      flushVexartBatch(vctx, 20, instances, targetHandle)
      shadows.length = 0
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
        flushVexartBatch(vctx, 9, instances, targetHandle)
        first = false
        targetMutationVersion += 1
      }
      imageGroups.clear()
    }
    const flushGlyphs = () => {
      if (glyphGroups.size === 0) return
      const { symbols } = openVexartLibrary()
      // Pack all glyph instances as MsdfGlyphInstance (64 bytes each).
      // fontId 0 → rustFontId 1 (Rust atlas registry is 1-15).
      let totalGlyphs = 0
      for (const group of glyphGroups.values()) totalGlyphs += group.instances.length
      if (totalGlyphs === 0) { glyphGroups.clear(); return }

      const STRIDE = 64 // MsdfGlyphInstance: 12 f32 + 4 u32 = 64 bytes
      const buf = new ArrayBuffer(totalGlyphs * STRIDE)
      const view = new DataView(buf)
      let off = 0
      for (const group of glyphGroups.values()) {
        // Determine rustAtlasId from the group. The group key is the image handle
        // from getGlyphAtlas — but we need the Rust atlas_id (1-15).
        // For now, all glyphs use the default font → rustAtlasId = 1.
        const rustAtlasId = 1
        for (const g of group.instances) {
          view.setFloat32(off + 0, g.x, true)    // NDC x
          view.setFloat32(off + 4, g.y, true)    // NDC y
          view.setFloat32(off + 8, g.w, true)    // NDC w
          view.setFloat32(off + 12, g.h, true)   // NDC h
          view.setFloat32(off + 16, g.u, true)   // UV x
          view.setFloat32(off + 20, g.v, true)   // UV y
          view.setFloat32(off + 24, g.uw, true)  // UV w
          view.setFloat32(off + 28, g.vh, true)  // UV h
          view.setFloat32(off + 32, g.r, true)   // color R
          view.setFloat32(off + 36, g.g, true)   // color G
          view.setFloat32(off + 40, g.b, true)   // color B
          view.setFloat32(off + 44, g.a * (g.opacity ?? 1), true) // color A
          view.setUint32(off + 48, rustAtlasId, true) // atlas_id
          view.setUint32(off + 52, 0, true)      // _pad0
          view.setUint32(off + 56, 0, true)      // _pad1
          view.setUint32(off + 60, 0, true)      // _pad2
          off += STRIDE
        }
      }
      const glyphU8 = new Uint8Array(buf)
      const statsU8 = new Uint8Array(32) // FrameStats output (unused for now)
      symbols.vexart_text_dispatch(vctx, targetHandle, ptr(glyphU8), glyphU8.byteLength, ptr(statsU8))
      first = false
      targetMutationVersion += 1
      glyphGroups.clear()
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
        flushVexartBatch(vctx, 10, instances, targetHandle)
        first = false
        targetMutationVersion += 1
      }
      transformedImageGroups.clear()
    }
    const flushAll = () => {
      flushShapeRects()
      flushShapeRectCorners()
      flushLinearGradients()
      flushRadialGradients()
      flushShadows()
      flushGlows()
      flushImages()
      flushGlyphs()
      flushTransformedImages()
    }

    let dirtyBounds: IntBounds | null = null
    let layerOpen = false

    frameGeneration += 1
    pruneBackdropCaches(frameGeneration)

    const markDirty = (left: number, top: number, right: number, bottom: number) => {
      dirtyBounds = unionBounds(dirtyBounds, { left, top, right, bottom })
    }

    const ensureLoadedLayer = () => {
      if (layerOpen) return
      vexartCompositeTargetBeginLayer(vctx, targetHandle, 1, 0x00000000)
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
      const copied = copyGpuTargetRegionToImage(vctx, targetHandle, {
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
      if (!op.backdrop) return null
      const source = getBackdropSource(op, op.backdrop)
      if (!source) return null
      const spriteKey = `${source.key}:${op.effectStateId}:${op.clipStateId}:${op.transformStateId}`
      const cached = backdropSpriteCache.get(spriteKey)
      if (cached && cached.frameId === frameGeneration) {
        return cached
      }
      let handle = vexartCompositeImageFilterBackdrop(vctx, source.handle, op.backdrop.filterParams)
      if (!handle) return null
      if (op.rect.inputs.radius > 0) {
        // uniform radius mask
        const rectBuf = new Float32Array(6)
        rectBuf[0] = op.rect.inputs.radius
        rectBuf[1] = 0; rectBuf[2] = 0; rectBuf[3] = 0; rectBuf[4] = 0
        rectBuf[5] = 0  // mode=0 means uniform
        const masked = vexartCompositeImageMaskRoundedRect(vctx, handle, rectBuf)
        vexartRemoveImage(vctx, handle)
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
      if (cached) vexartRemoveImage(vctx, cached.handle)
      setBackdropSpriteRecord(spriteKey, record)
      return record
    }

    try {
      for (const op of ctx.graph.ops) {
        const clip = clipRect(op.command, ctx)
        if (!clip) continue
        if (op.kind === "rectangle") {
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
              vexartCompositeTargetEndLayer(vctx, targetHandle)
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
              vexartCompositeRenderImageLayer(
                vctx, targetHandle, sprite.handle,
                sprite.bounds.left,
                sprite.bounds.top,
                sprite.bounds.right - sprite.bounds.left,
                sprite.bounds.bottom - sprite.bounds.top,
                1, 0x00000000,
              )
              first = false
              targetMutationVersion += 1
              markDirty(sprite.bounds.left, sprite.bounds.top, sprite.bounds.right, sprite.bounds.bottom)
            }
            effectOp = stripBackdropEffectOp(effectOp)
          }

          if (effectOp.backdrop && cornerRadii) {
            flushAll()
            if (layerOpen) {
              vexartCompositeTargetEndLayer(vctx, targetHandle)
              layerOpen = false
            }
            const sprite = getBackdropSprite(effectOp)
            if (!sprite) return { ok: false, rawLayer: null }
            // per-corner mask
            const maskRectBuf = new Float32Array(6)
            maskRectBuf[0] = 0
            maskRectBuf[1] = cornerRadii.tl
            maskRectBuf[2] = cornerRadii.tr
            maskRectBuf[3] = cornerRadii.br
            maskRectBuf[4] = cornerRadii.bl
            maskRectBuf[5] = 1  // mode=1 per-corner
            const masked = vexartCompositeImageMaskRoundedRect(vctx, sprite.handle, maskRectBuf)
            vexartCompositeRenderImageLayer(
              vctx, targetHandle, masked,
              sprite.bounds.left,
              sprite.bounds.top,
              sprite.bounds.right - sprite.bounds.left,
              sprite.bounds.bottom - sprite.bounds.top,
              first ? 0 : 1, 0x00000000,
            )
            vexartRemoveImage(vctx, masked)
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
            const shadowDefs = Array.isArray(effectOp.effect.shadow) ? effectOp.effect.shadow : [effectOp.effect.shadow]
            const shadowRadii = cornerRadii ?? { tl: radius, tr: radius, br: radius, bl: radius }
            for (const s of shadowDefs) {
              const blur = Math.max(0, s.blur)
              const blurPad = Math.ceil(blur)
              const pad = blurPad * 2
              const left = Math.max(0, clip.left + Math.min(0, s.x) - pad)
              const top = Math.max(0, clip.top + Math.min(0, s.y) - pad)
              const right = Math.min(ctx.target.width, clip.right + Math.max(0, s.x) + pad)
              const bottom = Math.min(ctx.target.height, clip.bottom + Math.max(0, s.y) + pad)
              shadows.push({
                x: (left / ctx.target.width) * 2 - 1,
                y: 1 - (top / ctx.target.height) * 2,
                w: ((right - left) / ctx.target.width) * 2,
                h: -(((bottom - top) / ctx.target.height) * 2),
                color: effectOpacity < 1 ? applyOpacityToColor(s.color, effectOpacity) : s.color,
                radii: shadowRadii,
                boxW,
                boxH,
                offsetX: s.x,
                offsetY: s.y,
                blur,
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
              vexartCompositeRenderImageLayer(
                vctx, targetHandle, handle,
                clip.left,
                clip.top,
                boxW,
                boxH,
                first ? 0 : 1, 0x00000000,
              )
              vexartRemoveImage(vctx, handle)
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
              vexartCompositeRenderImageLayer(
                vctx, targetHandle, handle,
                clip.left,
                clip.top,
                boxW,
                boxH,
                first ? 0 : 1, 0x00000000,
              )
              vexartRemoveImage(vctx, handle)
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
          const imageHandle = op.image.nativeImageHandle && op.image.nativeImageHandle > 0n
            ? op.image.nativeImageHandle
            : getImage(op.image.imageBuffer.data, op.image.imageBuffer.width, op.image.imageBuffer.height)
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
          const useGlyphAtlas = true
          let usedGlyphPath = false
          if (useGlyphAtlas) {
            const layout = layoutText(op.inputs.text, op.inputs.fontId, op.inputs.maxWidth, op.inputs.lineHeight, op.inputs.fontSize)
            const textX = Math.round(op.command.x) - ctx.offsetX
            const textY = Math.round(op.command.y) - ctx.offsetY
            const atlasRecord = getGlyphAtlas(op.inputs.fontId)
            const scale = op.inputs.fontId === 0
              ? builtinFontScale(op.inputs.fontSize)
              : op.inputs.fontSize / getFont(op.inputs.fontId).size
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
                  const advance = (atlasRecord.glyphWidths[glyphIndex] || atlasRecord.displayCellWidth) * scale
                  if (glyph === " ") {
                    cursorX += advance
                    continue
                  }
                  const glyphLeft = Math.round(cursorX)
                  const glyphTop = Math.round(cursorY)
                  // Use display dimensions for quad sizing (original px size)
                  const displayCellWidth = atlasRecord.displayCellWidth * scale
                  const displayCellHeight = atlasRecord.displayCellHeight * scale
                  const glyphRight = glyphLeft + displayCellWidth
                  const glyphBottom = glyphTop + displayCellHeight
                  if (glyphRight > 0 && glyphBottom > 0 && glyphLeft < ctx.target.width && glyphTop < ctx.target.height) {
                    const col = glyphIndex % atlasRecord.columns
                    const row = Math.floor(glyphIndex / atlasRecord.columns)
                    tempGlyphs.push({
                      // Quad position + size: use DISPLAY dimensions (original px)
                      x: (glyphLeft / ctx.target.width) * 2 - 1,
                      y: 1 - (glyphTop / ctx.target.height) * 2,
                      w: (displayCellWidth / ctx.target.width) * 2,
                      h: -((displayCellHeight / ctx.target.height) * 2),
                      // UV coords: use TEXTURE dimensions (supersampled)
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
      if (layerOpen) vexartCompositeTargetEndLayer(vctx, targetHandle)
    }

    if (first) return { ok: true as const, rawLayer: null }
    if (readbackMode === "none") {
      for (const handle of transientFullFrameImages) vexartRemoveImage(vctx, handle)
      return { ok: true as const, rawLayer: null }
    }
    if (readbackRegion && readbackRegion.width > 0 && readbackRegion.height > 0) {
      const readbackStart = performance.now()
      const rgba = vexartCompositeReadbackRegionRgba(vctx, targetHandle, readbackRegion)
      addBackendProfile("readbackMs", readbackStart)
      for (const handle of transientFullFrameImages) vexartRemoveImage(vctx, handle)
      if (!rgba) return { ok: false, rawLayer: null }
      return {
        ok: true as const,
        rawLayer: {
          data: rgba,
          width: readbackRegion.width,
          height: readbackRegion.height,
          region: readbackRegion,
        },
      }
    }
    // Phase 2b: readback from the specific vexart target (not context default).
    const readbackStart = performance.now()
    const rgba = vexartCompositeReadbackRgba(vctx, targetHandle, ctx.targetWidth * ctx.targetHeight * 4)
    addBackendProfile("readbackMs", readbackStart)
    for (const handle of transientFullFrameImages) vexartRemoveImage(vctx, handle)
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

  const renderNativeSceneFrame = (
    ctx: NativeScenePaintContext,
    targetHandle: VexartTargetHandle,
    readbackMode: "auto" | "none" = "auto",
    readbackRegion?: { x: number; y: number; width: number; height: number } | null,
  ): { ok: boolean; rawLayer: { data: Uint8Array; width: number; height: number; region?: { x: number; y: number; width: number; height: number } } | null } => {
    const vctx = getVexartCtx()
    const stats = dispatchNativeScenePaint(
      vctx,
      ctx.scene,
      targetHandle,
      ctx.target.width,
      ctx.target.height,
      ctx.offsetX,
      ctx.offsetY,
      ctx.refs,
    )
    if (!stats) return { ok: false, rawLayer: null }
    if (readbackMode === "none") return { ok: true, rawLayer: null }
    if (readbackRegion && readbackRegion.width > 0 && readbackRegion.height > 0) {
      const readbackStart = performance.now()
      const rgba = vexartCompositeReadbackRegionRgba(vctx, targetHandle, readbackRegion)
      addBackendProfile("readbackMs", readbackStart)
      if (!rgba) return { ok: false, rawLayer: null }
      return {
        ok: true,
        rawLayer: {
          data: rgba,
          width: readbackRegion.width,
          height: readbackRegion.height,
          region: readbackRegion,
        },
      }
    }
    const readbackStart = performance.now()
    const rgba = vexartCompositeReadbackRgba(vctx, targetHandle, ctx.targetWidth * ctx.targetHeight * 4)
    addBackendProfile("readbackMs", readbackStart)
    if (!rgba) return { ok: false, rawLayer: null }
    return {
      ok: true,
      rawLayer: {
        data: rgba,
        width: ctx.targetWidth,
        height: ctx.targetHeight,
      },
    }
  }

  const composeLayersToFrame = (frame: RendererBackendFrameContext, layers: RenderedLayerRecord[]): RendererBackendFrameResult | null => {
    if (layers.length === 0) {
      pruneLayerTargets()
      return { output: "none", strategy: lastStrategy }
    }
    const vctx = getVexartCtx()
    const targetHandle = getFinalFrameTarget(frame.viewportWidth, frame.viewportHeight)
    if (!targetHandle) return null
    const orderedLayers = layers.slice().sort((a, b) => a.z - b.z)
    const compositeStart = performance.now()
    vexartCompositeTargetBeginLayer(vctx, targetHandle, 0, 0x00000000)
    addBackendProfile("compositeMs", compositeStart)
    try {
      for (const layer of orderedLayers) {
        const quad = layer.subtreeTransform ?? {
          p0: { x: layer.x, y: layer.y },
          p1: { x: layer.x + layer.width, y: layer.y },
          p2: { x: layer.x, y: layer.y + layer.height },
          p3: { x: layer.x + layer.width, y: layer.y + layer.height },
        }
        const inst = packImageTransformInstance(
          (quad.p0.x / frame.viewportWidth) * 2 - 1,
          1 - (quad.p0.y / frame.viewportHeight) * 2,
          (quad.p1.x / frame.viewportWidth) * 2 - 1,
          1 - (quad.p1.y / frame.viewportHeight) * 2,
          (quad.p2.x / frame.viewportWidth) * 2 - 1,
          1 - (quad.p2.y / frame.viewportHeight) * 2,
          (quad.p3.x / frame.viewportWidth) * 2 - 1,
          1 - (quad.p3.y / frame.viewportHeight) * 2,
          layer.opacity,
        )
        const uniformStart = performance.now()
        const uniformUpdated = compositeTargetUniformToTarget(vctx, targetHandle, layer.handle, inst)
        addBackendProfile("uniformUpdateMs", uniformStart)
        if (!uniformUpdated) {
          return null
        }
      }
    } finally {
      const compositeEndStart = performance.now()
      vexartCompositeTargetEndLayer(vctx, targetHandle)
      addBackendProfile("compositeMs", compositeEndStart)
    }
    pruneLayerTargets()

    // ── Native final-frame presentation path ──
    // When native presentation is enabled, emit the frame directly from Rust
    // using the active Kitty transport without returning RGBA to JS.
    if (isNativePresentationCapable(frame.transmissionMode)) {
      const statsBuf = allocNativeStatsBuf()
      try {
        const { symbols } = openVexartLibrary()
        ensureNativeKittyTransport(frame.transmissionMode)
        const nativeEmitStart = performance.now()
        const rc = symbols.vexart_kitty_emit_frame_with_stats(
          vctx,
          targetHandle,
          3, // FINAL_FRAME_IMAGE_ID — same as gpu-frame-composer
          ptr(statsBuf),
        ) as number
        addBackendProfile("nativeEmitMs", nativeEmitStart)
        if (rc === 0) {
          const stats = decodeNativePresentationStats(statsBuf)
          addNativeStatsProfile(stats)
          return { output: "native-presented", strategy: lastStrategy, stats }
        }
        // Native emission failed — fall through to TS raw path.
        disableNativePresentation("vexart_kitty_emit_frame_with_stats returned non-zero")
        logNativePresentationFallback("final-frame native emit failed, reverting to explicit readback path")
      } catch (e) {
        disableNativePresentation(`vexart_kitty_emit_frame_with_stats threw: ${e}`)
        logNativePresentationFallback("final-frame native emit threw, reverting to explicit readback path")
      }
    }

    // ── TS fallback: readback RGBA and return raw payload ──
    // Used when native presentation is disabled or unsupported.
    const readbackStart = performance.now()
    const readbackData = vexartCompositeReadbackRgba(vctx, targetHandle, frame.viewportWidth * frame.viewportHeight * 4)
    addBackendProfile("readbackMs", readbackStart)
    if (!readbackData) return null
    return {
      output: "final-frame-raw",
      strategy: lastStrategy,
      finalFrame: {
        data: readbackData,
        width: frame.viewportWidth,
        height: frame.viewportHeight,
      },
    }
  }

  const composeFinalFrame = (frame: RendererBackendFrameContext): RendererBackendFrameResult | null => {
    return composeLayersToFrame(frame, currentFrameLayers)
  }

  const composeRetainedFrame = (frame: RendererBackendFrameContext, layers: RendererBackendRetainedLayer[]): RendererBackendFrameResult | null => {
    const retainedLayers: RenderedLayerRecord[] = []
    for (const layer of layers) {
      const record = layerTargets.get(layer.key)
      if (!record) continue
      retainedLayers.push({
        key: layer.key,
        z: layer.z,
        x: layer.bounds.x,
        y: layer.bounds.y,
        width: layer.bounds.width,
        height: layer.bounds.height,
        handle: record.handle,
        isBackground: layer.isBackground,
        subtreeTransform: layer.subtreeTransform,
        opacity: layer.opacity,
      })
    }
    return composeLayersToFrame(frame, retainedLayers)
  }

  renderOpToImage = (op, width, height, offsetX, offsetY) => {
    const vctx = getVexartCtx()
    const target = vexartCompositeTargetCreate(vctx, width, height)
    if (!target) return null
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
      return copyGpuTargetRegionToImage(vctx, target, { x: 0, y: 0, width, height }).handle
    } finally {
      vexartCompositeTargetDestroy(vctx, target)
    }
  }

  return {
    name: "gpu-render-graph",
    beginFrame(ctx): RendererBackendFramePlan {
      resetBackendProfile()
      currentFrame = ctx
      currentFrameLayers = []
      activeLayerKeys.clear()
      suppressFinalPresentation = false
      if (!gpuAvailable || !ctx.useLayerCompositing) {
        lastStrategy = null
        lastNativeFramePlan = null
        framesSinceStrategyChange = 0
        lastStrategyTelemetry = { preferred: null, chosen: null, estimatedLayeredBytes: 0, estimatedFinalBytes: 0 }
        return { strategy: null }
      }
      const forcedStrategy = getForcedLayerStrategy()
      if (forcedStrategy) {
        framesSinceStrategyChange = lastStrategy === forcedStrategy ? framesSinceStrategyChange + 1 : 0
        lastStrategy = forcedStrategy
        lastNativeFramePlan = null
        lastStrategyTelemetry = {
          preferred: forcedStrategy,
          chosen: forcedStrategy,
          estimatedLayeredBytes: ctx.estimatedLayeredBytes,
          estimatedFinalBytes: ctx.estimatedFinalBytes,
        }
        return { strategy: lastStrategy }
      }
      const previousStrategy = lastStrategy
      lastNativeFramePlan = nativeChooseFrameStrategy({
        dirtyLayerCount: ctx.dirtyLayerCount,
        dirtyPixelArea: ctx.dirtyPixelArea,
        totalPixelArea: ctx.totalPixelArea,
        overlapPixelArea: ctx.overlapPixelArea,
        overlapRatio: ctx.overlapRatio,
        fullRepaint: ctx.fullRepaint,
        hasSubtreeTransforms: ctx.hasSubtreeTransforms,
        hasActiveInteraction: ctx.hasActiveInteraction,
        transmissionMode: ctx.transmissionMode === "shm"
          ? NATIVE_FRAME_TRANSPORT.SHM
          : ctx.transmissionMode === "file"
            ? NATIVE_FRAME_TRANSPORT.FILE
            : NATIVE_FRAME_TRANSPORT.DIRECT,
        lastStrategy: previousStrategy === "skip-present"
          ? NATIVE_FRAME_STRATEGY.SKIP_PRESENT
          : previousStrategy === "layered-region"
            ? NATIVE_FRAME_STRATEGY.LAYERED_REGION
            : previousStrategy === "layered-dirty"
              ? NATIVE_FRAME_STRATEGY.LAYERED_DIRTY
              : previousStrategy === "final-frame"
                ? NATIVE_FRAME_STRATEGY.FINAL_FRAME
                : null,
        framesSinceChange: framesSinceStrategyChange,
        estimatedLayeredBytes: ctx.estimatedLayeredBytes,
        estimatedFinalBytes: ctx.estimatedFinalBytes,
      })
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
      }, lastNativeFramePlan)
      framesSinceStrategyChange = chosen === previousStrategy ? framesSinceStrategyChange + 1 : 0
      lastStrategy = chosen
      lastStrategyTelemetry = {
        preferred: chosen,
        chosen,
        estimatedLayeredBytes: ctx.estimatedLayeredBytes,
        estimatedFinalBytes: ctx.estimatedFinalBytes,
      }
      return { strategy: lastStrategy, nativePlan: lastNativeFramePlan }
    },
    paintNativeScene(ctx: NativeScenePaintContext): NativeScenePaintBackendResult {
      if (!gpuAvailable) return undefined
      const frameCtx = ctx.frame
      const layerCtx = ctx.layer
      const delegatedFrame = !!(currentFrame && frameCtx && currentFrame === frameCtx)
      if (delegatedFrame && frameCtx.useLayerCompositing && layerCtx) {
        const layerTarget = getLayerTarget(layerCtx.key, ctx.target.width, ctx.target.height)
        if (!layerTarget) return undefined
        activeLayerKeys.add(layerCtx.key)
        if (lastStrategy === "skip-present") return { output: "skip-present", strategy: lastStrategy }
        const useNativeLayerPresentation = lastStrategy !== "final-frame"
          && isNativePresentationCapable(frameCtx.transmissionMode)
        const nativeLayer = useNativeLayerPresentation
          ? nativeLayerUpsert(layerCtx.key, {
              target: layerTarget,
              x: layerCtx.bounds.x,
              y: layerCtx.bounds.y,
              width: layerCtx.bounds.width,
              height: layerCtx.bounds.height,
              z: layerCtx.z,
            })
          : null
        const nativeImageId = nativeLayer?.imageId ?? 0
        const readbackMode = lastStrategy === "final-frame" || useNativeLayerPresentation ? "none" : "auto"
        const repaint = layerCtx.repaintRect
        const region = repaint
          ? {
              x: Math.max(0, Math.floor(repaint.x - layerCtx.bounds.x)),
              y: Math.max(0, Math.floor(repaint.y - layerCtx.bounds.y)),
              width: Math.min(ctx.target.width, Math.ceil(repaint.width)),
              height: Math.min(ctx.target.height, Math.ceil(repaint.height)),
            }
          : null
        const shouldReadbackRegion = !useNativeLayerPresentation
          && lastStrategy !== "final-frame"
          && !!region
          && region.width > 0
          && region.height > 0
          && region.width * region.height < ctx.target.width * ctx.target.height
        const result = renderNativeSceneFrame(ctx, layerTarget, readbackMode, shouldReadbackRegion ? region : null)
        if (!result.ok) return undefined
        if (lastStrategy === "final-frame") {
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
            opacity: 1,
          })
          return { output: "skip-present", strategy: lastStrategy }
        }
        if (useNativeLayerPresentation && nativeImageId > 0) {
          const shouldPresentRegion = lastStrategy === "layered-region"
            && !!region
            && region.width > 0
            && region.height > 0
            && region.width * region.height < ctx.target.width * ctx.target.height
          const regionEmitStart = shouldPresentRegion ? performance.now() : 0
          const regionStats = shouldPresentRegion
            ? nativeEmitRegionTarget(layerTarget, nativeImageId, region.x, region.y, region.width, region.height, frameCtx.transmissionMode)
            : null
          if (shouldPresentRegion) addBackendProfile("nativeEmitMs", regionEmitStart)
          if (regionStats !== null) {
            addNativeStatsProfile(regionStats)
            nativeLayerPresentDirty(layerCtx.key)
            return { output: "native-presented", strategy: lastStrategy, stats: regionStats }
          }
          const col = Math.floor(layerCtx.bounds.x / Math.max(1, ctx.cellWidth ?? 1))
          const row = Math.floor(layerCtx.bounds.y / Math.max(1, ctx.cellHeight ?? 1))
          const nativeEmitStart = performance.now()
          const stats = nativeEmitLayerTarget(layerTarget, nativeImageId, col, row, layerCtx.z, frameCtx.transmissionMode)
          addBackendProfile("nativeEmitMs", nativeEmitStart)
          if (stats !== null) {
            addNativeStatsProfile(stats)
            nativeLayerPresentDirty(layerCtx.key)
            return { output: "native-presented", strategy: lastStrategy, stats }
          }
          const readbackStart = performance.now()
          const rgba = vexartCompositeReadbackRgba(getVexartCtx(), layerTarget, ctx.target.width * ctx.target.height * 4)
          addBackendProfile("readbackMs", readbackStart)
          return {
            output: "kitty-payload",
            strategy: lastStrategy,
            kittyPayload: rgba ? { data: rgba, width: ctx.target.width, height: ctx.target.height } : undefined,
          }
        }
        return { output: "kitty-payload", strategy: lastStrategy, kittyPayload: result.rawLayer ?? undefined }
      }

      const standaloneHandle = getStandaloneTarget(ctx.target.width, ctx.target.height)
      if (!standaloneHandle) return undefined
      const result = renderNativeSceneFrame(ctx, standaloneHandle)
      if (!result.ok) return undefined
      return { output: "kitty-payload", strategy: lastStrategy, kittyPayload: result.rawLayer ?? undefined }
    },
    paint(ctx) {
      if (!gpuAvailable) {
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
        if (lastStrategy === "skip-present") {
          return { output: "skip-present", strategy: lastStrategy }
        }
        const useNativeLayerPresentation = lastStrategy !== "final-frame"
          && isNativePresentationCapable(frameCtx.transmissionMode)
        const nativeLayer = useNativeLayerPresentation
          ? nativeLayerUpsert(layerCtx.key, {
              target: layerTarget,
              x: layerCtx.bounds.x,
              y: layerCtx.bounds.y,
              width: layerCtx.bounds.width,
              height: layerCtx.bounds.height,
              z: layerCtx.z,
            })
          : null
        const nativeImageId = nativeLayer?.imageId ?? 0
        const readbackMode = lastStrategy === "final-frame" || useNativeLayerPresentation ? "none" : "auto"
        const repaint = layerCtx.repaintRect
        const region = repaint
          ? {
              x: Math.max(0, Math.floor(repaint.x - layerCtx.bounds.x)),
              y: Math.max(0, Math.floor(repaint.y - layerCtx.bounds.y)),
              width: Math.min(ctx.target.width, Math.ceil(repaint.width)),
              height: Math.min(ctx.target.height, Math.ceil(repaint.height)),
            }
          : null
        const shouldReadbackRegion = !useNativeLayerPresentation
          && lastStrategy !== "final-frame"
          && !!region
          && region.width > 0
          && region.height > 0
          && region.width * region.height < ctx.target.width * ctx.target.height
        const result = renderFrame(ctx, layerTarget, readbackMode, shouldReadbackRegion ? region : null)
        if (!result.ok) {
          suppressFinalPresentation = true
          failGpuOnly(`GPU layer render failed for ${layerCtx.key}`)
        }
        if (lastStrategy === "final-frame") {
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
            opacity: 1,
          })
          return { output: "skip-present", strategy: lastStrategy }
        }
        if (useNativeLayerPresentation && nativeImageId > 0) {
          const shouldPresentRegion = lastStrategy === "layered-region"
            && !!region
            && region.width > 0
            && region.height > 0
            && region.width * region.height < ctx.target.width * ctx.target.height
          const regionEmitStart = shouldPresentRegion ? performance.now() : 0
          const regionStats = shouldPresentRegion
            ? nativeEmitRegionTarget(layerTarget, nativeImageId, region.x, region.y, region.width, region.height, frameCtx.transmissionMode)
            : null
          if (shouldPresentRegion) addBackendProfile("nativeEmitMs", regionEmitStart)
          if (regionStats !== null) {
            addNativeStatsProfile(regionStats)
            nativeLayerPresentDirty(layerCtx.key)
            return { output: "native-presented", strategy: lastStrategy, stats: regionStats }
          }
          const col = Math.floor(layerCtx.bounds.x / Math.max(1, ctx.cellWidth ?? 1))
          const row = Math.floor(layerCtx.bounds.y / Math.max(1, ctx.cellHeight ?? 1))
          const nativeEmitStart = performance.now()
          const stats = nativeEmitLayerTarget(layerTarget, nativeImageId, col, row, layerCtx.z, frameCtx.transmissionMode)
          addBackendProfile("nativeEmitMs", nativeEmitStart)
          if (stats !== null) {
            addNativeStatsProfile(stats)
            nativeLayerPresentDirty(layerCtx.key)
            return { output: "native-presented", strategy: lastStrategy, stats }
          }
          const readbackStart = performance.now()
          const rgba = vexartCompositeReadbackRgba(getVexartCtx(), layerTarget, ctx.target.width * ctx.target.height * 4)
          addBackendProfile("readbackMs", readbackStart)
          return {
            output: "kitty-payload",
            strategy: lastStrategy,
            kittyPayload: rgba ? { data: rgba, width: ctx.target.width, height: ctx.target.height } : undefined,
          }
        }
        // Return kitty payload — paint.ts will route to native or TS path based on nativePresentation flag.
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
      if (!gpuAvailable) return false
      const record = layerTargets.get(ctx.layer.key)
      if (!record) return false
      activeLayerKeys.add(ctx.layer.key)
      nativeLayerReuse(ctx.layer.key)
        if (lastStrategy === "final-frame") {
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
            opacity: 1,
          })
      }
      return true
    },
    compositeRetainedFrame(ctx) {
      resetBackendProfile()
      return composeRetainedFrame(ctx.frame, ctx.layers)
    },
    endFrame(ctx) {
      currentFrame = null
      if (!gpuAvailable || !ctx.useLayerCompositing) return { output: "none", strategy: lastStrategy }
      if (suppressFinalPresentation) {
        pruneLayerTargets()
        return { output: "none", strategy: lastStrategy }
      }
      if (lastStrategy === "skip-present") {
        pruneLayerTargets()
        return { output: "none", strategy: lastStrategy }
      }
      if (lastStrategy !== "final-frame") {
        pruneLayerTargets()
        return { output: "none", strategy: lastStrategy }
      }
      return composeFinalFrame(ctx)
    },
    getLastStrategy() {
      return lastStrategy
    },
    drainProfile() {
      const profile = { ...backendProfile }
      resetBackendProfile()
      return profile
    },
  } as GpuRendererBackend & { paintNativeScene: (ctx: NativeScenePaintContext) => NativeScenePaintBackendResult }
}
