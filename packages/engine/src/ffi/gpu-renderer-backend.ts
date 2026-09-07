// gpu-renderer-backend.ts — Phase 2b native path
// All GPU target lifecycle, compositing, readback, and backdrop/mask operations
// rewired to vexart_composite_* FFI (Phase 2b Slice 2). wgpu-canvas-bridge deleted.
// Per design §11, §8.2 cmd_kind allocation. Shadow uses dedicated cmd_kind=20.
// Phase 2b Native Presentation: final-frame and layer presentation can route
// through native Rust Kitty output when nativePresentation flag is active.

import { appendFileSync } from "node:fs"
import { ptr } from "bun:ffi"
import { CanvasContext } from "./canvas"
import { rasterizeCanvas, rasterizeCanvasCommands } from "./canvas-rasterizer"

import { transformPoint } from "./matrix"
import { BACKDROP_FIELDS } from "./render-graph"
import type { BackdropRenderMetadata, EffectRenderOp, RenderGraphOp } from "./render-graph"
import {
  type TargetRecord, type RenderedLayerRecord, type ImageRecord,
  type TransformSpriteRecord, type CanvasSpriteRecord,
  type BackdropSourceRecord, type BackdropSpriteRecord,
  type ImageInstance, type TransformedImageInstance,
  type ImageGroup, type TransformedImageGroup,
  type IntBounds,
  unionBounds, boundsKey, clampBackdropBounds,
  clampShapeRadius, applyOpacityToColor, hashMatrix,
  isSupportedOp, getUnsupportedGpuOps, opBounds,
} from "./gpu-helpers"
import type {
  RendererBackend,
  RendererBackendFrameContext,
  RendererBackendFramePlan,
  RendererBackendProfile,
  RendererBackendFrameResult,
  RendererBackendPaintContext,
  RendererBackendRetainedLayer,
} from "./renderer-backend"
import { chooseGpuLayerStrategy, nativeChooseFrameStrategy, NATIVE_FRAME_STRATEGY, NATIVE_FRAME_TRANSPORT, type GpuLayerStrategyMode, type NativeFramePlan } from "./gpu-layer-strategy"
import { openVexartLibrary, openMsdfFontSymbols, VexartNativeError } from "./vexart-bridge"
import { vexartGetLastError } from "./vexart-functions"
import {
  allocNativeStatsBuf,
  decodeNativePresentationStats,
  type NativePresentationStats,
} from "./native-presentation-stats"
import {
  disableNativePresentation,
  logNativePresentationFallback,
} from "./native-presentation-flags"
import {
  clearNativeLayerRegistryMirror,
} from "./native-layer-registry"
import { ensureNativeKittyTransport } from "./native-presentation-ops"
import type { DamageRect } from "./damage"

const PROFILE_ENABLED = process.env.VEXART_PROFILE !== "0"

// Pack functions (gpu-pack.ts) and FFI composite wrappers (gpu-composite-ops.ts)
import {
  vf32, _packU8,
  packShapeRectInstance, packShapeRectCornersInstance, packGlowInstance,
  packShadowInstance, packLinearGradientInstance, packRadialGradientInstance,
  packImageTransformInstance,
  type WgpuCanvasShapeRect, type WgpuCanvasShapeRectCorners,
  type WgpuCanvasCornerRadii, type WgpuCanvasGlow, type WgpuCanvasShadow,
} from "./gpu-pack"
import {
  type VexartTargetHandle, type VexartImageHandle, type GpuRasterImage,
  getSymbols,
  vexartCompositeTargetCreate, vexartCompositeTargetDestroy,
  vexartCompositeTargetBeginLayer, vexartCompositeTargetEndLayer,
  vexartCompositeRenderImageLayer, vexartCompositeRenderImageTransformLayer,
  vexartCompositeCopyRegionToImage,
  vexartCompositeImageFilterBackdrop, vexartCompositeImageMaskRoundedRect,
  vexartCompositeReadbackRgba,
  copyGpuTargetRegionToImage,
  vexartUploadImage, vexartRemoveImage,
  flushVexartBatch, flushVexartBatchToTarget, compositeTargetUniformToTarget,
  _vexartImageHandles, activeImageHandles,
} from "./gpu-composite-ops"








/** @public */
export type GpuRendererBackend = RendererBackend & {
  getLastStrategy: () => GpuLayerStrategyMode | null
  /** TEST-ONLY: Read back the active target as RGBA pixels for golden tests. */
  readbackForTest: (width: number, height: number) => Uint8Array | null
}

/** @public */
export type GpuRendererBackendCacheStats = {
  layerTargetCount: number
  layerTargetBytes: number
  textImageCount: number
  textImageBytes: number
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

const MAX_GPU_CANVAS_SPRITES = 64
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

const GPU_RENDERER_DEBUG = process.env.VEXART_DEBUG_GPU_RENDERER === "1"
const GPU_RENDERER_DEBUG_LOG = "/tmp/tge-gpu-renderer.log"
const RESIZE_DEBUG = process.env.VEXART_DEBUG_RESIZE === "1"
function getForcedLayerStrategy(): GpuLayerStrategyMode | null {
  const forcedStrategyValue = process.env.VEXART_GPU_FORCE_LAYER_STRATEGY
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
  throw new Error(`Vexart GPU-only renderer: ${message}`)
}



/** @public */
type GpuRendererBackendOptions = {
  /** Skip Kitty/native presentation while retaining the composited GPU target for readback. */
  suppressPresentation?: boolean
}

export function createGpuRendererBackend(): GpuRendererBackend {
  return createGpuRendererBackendInternal()
}

/**
 * Internal offscreen factory used by render-to-buffer. It is intentionally not
 * re-exported from the package public surface: visual tests need the native
 * compositor and readback, but must not write Kitty escape sequences to stdout.
 */
export function createGpuRendererBackendForTesting(): GpuRendererBackend {
  return createGpuRendererBackendInternal({ suppressPresentation: true })
}

function createGpuRendererBackendInternal(options: GpuRendererBackendOptions = {}): GpuRendererBackend {
  // vexart context handle — allocated on first use.
  // Phase 2b: used for all vexart_paint_dispatch + vexart_composite_* calls.
  let _vexartCtx: bigint | null = null
  function getVexartCtx(): bigint {
    if (_vexartCtx !== null) return _vexartCtx
    const { symbols } = openVexartLibrary()
    const ctxBuf = new BigUint64Array(1)
    // Bun FFI rejects zero-length ArrayBufferView for ptr(); use 1-byte dummy.
    const optsPtr = ptr(new Uint8Array(1))
    const result = symbols.vexart_context_create(optsPtr, 0, ptr(ctxBuf)) as number
    if (result !== 0) {
      const err = vexartGetLastError()
      throw new VexartNativeError(result, `GPU context creation failed: ${err}`)
    }
    _vexartCtx = ctxBuf[0]
    return _vexartCtx
  }
  // ── MSDF text rendering ────────────────────────────────────────────────
  let _msdfSymbols: ReturnType<typeof openMsdfFontSymbols> | null = null
  let _msdfInitDone = false
  const _msdfEncoder = new TextEncoder()
  const _msdfStatsBuf = new Uint8Array(32)
  // HP-4: Pre-allocated buffers for tryMsdfText — avoids per-call allocations.
  const _msdfFamilyCache = new Map<string, Uint8Array>()
  let _msdfTextBuf = new Uint8Array(4096)
  let _msdfParamsBuf = new Uint8Array(4096)
  const _msdfParamsView = new DataView(_msdfParamsBuf.buffer)

  function getMsdfSymbols() {
    if (_msdfSymbols !== null) return _msdfSymbols
    _msdfSymbols = openMsdfFontSymbols()
    if (_msdfSymbols && !_msdfInitDone) {
      _msdfInitDone = true
      _msdfSymbols.vexart_font_init()
    }
    return _msdfSymbols
  }

  /** Try to render a text op via the MSDF pipeline. Returns true on success. */
  function tryMsdfText(
    vctx: bigint,
    targetHandle: bigint,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    lineHeight: number,
    maxWidth: number,
    colorRgba: number,
    targetWidth: number,
    targetHeight: number,
    fontFamily?: string,
    fontWeight?: number,
    fontStyle?: string,
  ): boolean {
    const sym = getMsdfSymbols()
    if (!sym) return false
    if (text.length === 0) return true

    // Encode text into reusable buffer (HP-4: avoid per-call Uint8Array alloc)
    const maxBytes = text.length * 3 // UTF-8 worst case
    if (maxBytes > _msdfTextBuf.byteLength) {
      _msdfTextBuf = new Uint8Array(Math.max(maxBytes, _msdfTextBuf.byteLength * 2))
    }
    const { written: textLen } = _msdfEncoder.encodeInto(text, _msdfTextBuf)
    if (textLen === 0) return true

    // Cache family JSON encoding (HP-4: 99% of calls use same family)
    const family = fontFamily || "sans-serif"
    let familiesEncoded = _msdfFamilyCache.get(family)
    if (!familiesEncoded) {
      familiesEncoded = _msdfEncoder.encode(JSON.stringify([family]))
      _msdfFamilyCache.set(family, familiesEncoded)
    }

    // Pack params into reusable buffer (HP-4: no per-call allocation)
    const headerSize = 28
    const totalParamsSize = headerSize + familiesEncoded.byteLength
    if (totalParamsSize > _msdfParamsBuf.byteLength) {
      _msdfParamsBuf = new Uint8Array(Math.max(totalParamsSize, _msdfParamsBuf.byteLength * 2))
      // Note: DataView must be recreated when buffer changes
    }
    const pView = new DataView(_msdfParamsBuf.buffer)
    const weight = fontWeight ?? 400
    const flags = fontStyle === "italic" ? 1 : 0
    pView.setFloat32(0, x, true)
    pView.setFloat32(4, y, true)
    pView.setFloat32(8, fontSize, true)
    pView.setFloat32(12, lineHeight, true)
    pView.setFloat32(16, maxWidth, true)
    pView.setUint32(20, colorRgba >>> 0, true)
    pView.setUint16(24, weight, true)
    pView.setUint16(26, flags, true)
    _msdfParamsBuf.set(familiesEncoded, headerSize)

    const rc = sym.vexart_font_render_text(
      vctx, targetHandle,
      ptr(_msdfTextBuf), textLen,
      ptr(_msdfParamsBuf), totalParamsSize,
      ptr(_msdfStatsBuf),
    ) as number

    return rc === 0
  }

  let lastStrategy: GpuLayerStrategyMode | null = null
  let lastNativeFramePlan: NativeFramePlan | null = null
  // Kitty image IDs outlive the process that emitted them. Seed one stable
  // final-frame image per process so Kitty can coalesce unchanged frames and
  // update changed content through its animation protocol without replacing
  // the visible root image on every render tick.
  const finalFrameImageId = 0x40000000 + ((process.pid ?? 0) % 0x0fffffff)
  let standaloneTarget: TargetRecord | null = null
  let finalFrameTarget: TargetRecord | null = null
  const layerTargets = new Map<string, TargetRecord>()
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
  // Backdrop pre-composite: layers rendered so far, composited into the
  // backdrop layer's target before it reads "content behind".
  const _renderedLayerStack: RenderedLayerRecord[] = []
  let renderOpToImage: ((op: RenderGraphOp, width: number, height: number, offsetX: number, offsetY: number, ops?: RenderGraphOp[]) => VexartImageHandle | null) | null = null
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
    if (!PROFILE_ENABLED) return
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
  const transformedImageGroups = new Map<bigint, TransformedImageGroup>()
  const transientFullFrameImages: VexartImageHandle[] = []
  const deferredMsdfOps: { text: string; x: number; y: number; fontSize: number; lineHeight: number; maxWidth: number; colorRgba: number; fontFamily?: string; fontWeight?: number; fontStyle?: string }[] = []
  const cacheStats: GpuRendererBackendCacheStats = {
    layerTargetCount: 0,
    layerTargetBytes: 0,
    textImageCount: 0,
    textImageBytes: 0,
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

  // ── Stats-tracked cache factory ──
  // Replaces 15 wrapper functions (set/delete/clear × 5 caches) with a single
  // generic factory. Each slot tracks count + bytes in cacheStats automatically.
  function createCacheSlot<K, R>(
    cache: Map<K, R>,
    countKey: keyof GpuRendererBackendCacheStats,
    bytesKey: keyof GpuRendererBackendCacheStats,
    bytesOf: (record: R) => number,
  ) {
    return {
      set(key: K, record: R) {
        const existing = cache.get(key)
        if (existing) { cacheStats[countKey] -= 1; cacheStats[bytesKey] -= bytesOf(existing) }
        cache.set(key, record)
        cacheStats[countKey] += 1; cacheStats[bytesKey] += bytesOf(record)
      },
      delete(key: K) {
        const existing = cache.get(key)
        if (!existing) return null
        cache.delete(key)
        cacheStats[countKey] -= 1; cacheStats[bytesKey] -= bytesOf(existing)
        return existing
      },
      clear() { cache.clear(); cacheStats[countKey] = 0; cacheStats[bytesKey] = 0 },
    }
  }

  const wh4 = (r: { width: number; height: number }) => r.width * r.height * 4
  const layerTargetSlot = createCacheSlot(layerTargets, "layerTargetCount", "layerTargetBytes", wh4)
  const canvasSpriteSlot = createCacheSlot(canvasSpriteCache, "canvasSpriteCount", "canvasSpriteBytes", wh4)
  const transformSpriteSlot = createCacheSlot(transformSpriteCache, "transformSpriteCount", "transformSpriteBytes", wh4)
  const backdropSourceSlot = createCacheSlot(backdropSourceCache, "backdropSourceCount", "backdropSourceBytes",
    (r: BackdropSourceRecord) => (r.bounds.right - r.bounds.left) * (r.bounds.bottom - r.bounds.top) * 4)
  const backdropSpriteSlot = createCacheSlot(backdropSpriteCache, "backdropSpriteCount", "backdropSpriteBytes", wh4)

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
    for (const record of transformSpriteCache.values()) {
      vexartRemoveImage(vctx, record.handle)
    }
    for (const record of canvasSpriteCache.values()) {
      vexartRemoveImage(vctx, record.handle)
    }
    canvasSpriteSlot.clear()
    transformSpriteSlot.clear()
    for (const record of backdropSourceCache.values()) {
      vexartRemoveImage(vctx, record.handle)
    }
    backdropSourceSlot.clear()
    for (const record of backdropSpriteCache.values()) {
      vexartRemoveImage(vctx, record.handle)
    }
    backdropSpriteSlot.clear()
  }

  const pruneBackdropCaches = (activeFrameId: number) => {
    const vctx = getVexartCtx()
    for (const [key, record] of backdropSourceCache) {
      if (record.frameId === activeFrameId) continue
      vexartRemoveImage(vctx, record.handle)
      backdropSourceSlot.delete(key)
    }
    for (const [key, record] of backdropSpriteCache) {
      if (record.frameId === activeFrameId) continue
      vexartRemoveImage(vctx, record.handle)
      backdropSpriteSlot.delete(key)
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
    layerTargetSlot.set(key, { key, width, height, handle })
    return handle
  }

  const pruneLayerTargets = () => {
    const vctx = getVexartCtx()
    for (const [key, record] of layerTargets) {
      if (activeLayerKeys.has(key)) continue
      vexartCompositeTargetDestroy(vctx, record.handle)
      layerTargetSlot.delete(key)
    }
  }

  const trimTransformSpriteCache = () => {
    const vctx = getVexartCtx()
    while (transformSpriteCache.size > MAX_GPU_TRANSFORM_SPRITES) {
      const first = transformSpriteCache.keys().next().value
      if (!first) break
      const record = transformSpriteCache.get(first)
      if (record) vexartRemoveImage(vctx, record.handle)
      transformSpriteSlot.delete(first)
    }
  }

  const trimCanvasSpriteCache = () => {
    const vctx = getVexartCtx()
    while (canvasSpriteCache.size > MAX_GPU_CANVAS_SPRITES) {
      const first = canvasSpriteCache.keys().next().value
      if (!first) break
      const record = canvasSpriteCache.get(first)
      if (record) vexartRemoveImage(vctx, record.handle)
      canvasSpriteSlot.delete(first)
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

  const getCanvasFunctionId = (fn: Function) => {
    const existing = canvasFunctionIds.get(fn)
    if (existing) return existing
    const id = nextCanvasFunctionId++
    canvasFunctionIds.set(fn, id)
    return id
  }

  const getCanvasSprite = (op: Extract<RenderGraphOp, { kind: "canvas" }>) => {
    const width = Math.max(1, Math.round(op.width))
    const height = Math.max(1, Math.round(op.height))
    const functionId = getCanvasFunctionId(op.canvas.onDraw)
    const viewportKey = op.canvas.viewport ? `${op.canvas.viewport.x},${op.canvas.viewport.y},${op.canvas.viewport.zoom}` : "default"
    const key = `${op.canvas.displayListHash ?? `fn:${functionId}`}:${width}:${height}:${viewportKey}`
    const cached = canvasSpriteCache.get(key)
    if (cached) {
      touchMapEntry(canvasSpriteCache, key, cached)
      return cached.handle
    }
    const raster = op.canvas.displayListCommands
      ? rasterizeCanvasCommands(op.canvas.displayListCommands, width, height)
      : rasterizeCanvas(op.canvas.onDraw, width, height, op.canvas.viewport)
    if (!raster) return null
    const handle = getImage(raster.data, raster.width, raster.height)
    if (!handle) return null
    canvasSpriteSlot.set(key, { key, handle, width: raster.width, height: raster.height, data: raster.data })
    trimCanvasSpriteCache()
    return handle
  }

  const getTransformSprite = (op: Extract<RenderGraphOp, { kind: "effect" }>) => {
    const vctx = getVexartCtx()
    const width = Math.max(1, Math.round(op.width))
    const height = Math.max(1, Math.round(op.height))
    const key = `${op.kind}:${op.type}:${op.x}:${op.y}:${op.width}:${op.height}:${op.color}:${op.cornerRadius}:${op.extra1}:${op.extra2}:${op.text ?? ""}:${width}:${height}:${hashMatrix(op.effect.transform)}:effect${op.effectStateId}`
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
    const renderSprite = renderOpToImage as ((op: RenderGraphOp, width: number, height: number, offsetX: number, offsetY: number, ops?: RenderGraphOp[]) => VexartImageHandle | null) | null
    const handle = renderSprite
      ? renderSprite(spriteOp, width, height, Math.round(op.x), Math.round(op.y))
      : null
    if (!handle) return null
    transformSpriteSlot.set(key, { key, handle, width, height })
    trimTransformSpriteCache()
    return handle
  }

  const hasSelfFilter = (filter: NonNullable<EffectRenderOp["effect"]["filter"]>) => (
    (filter.blur ?? 0) > 0
    || (filter.brightness !== undefined && filter.brightness !== 100)
    || (filter.contrast !== undefined && filter.contrast !== 100)
    || (filter.saturate !== undefined && filter.saturate !== 100)
    || (filter.grayscale ?? 0) !== 0
    || (filter.invert ?? 0) !== 0
    || (filter.sepia ?? 0) !== 0
    || (filter.hueRotate ?? 0) !== 0
  )

  const getSubtreeCaptureBounds = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    subtreeOps: RenderGraphOp[],
    includeRootTransform = false,
  ) => {
    let left = Math.round(op.x)
    let top = Math.round(op.y)
    let right = left + Math.max(1, Math.round(op.width))
    let bottom = top + Math.max(1, Math.round(op.height))
    const include = (entry: RenderGraphOp, isRoot = false) => {
      const x = Math.round(entry.x)
      const y = Math.round(entry.y)
      const width = Math.max(1, Math.round(entry.width))
      const height = Math.max(1, Math.round(entry.height))
      let entryLeft = x
      let entryTop = y
      let entryRight = x + width
      let entryBottom = y + height
      if (entry.kind === "effect") {
        if (entry.effect.transform && (!isRoot || includeRootTransform)) {
          const points = [
            transformPoint(entry.effect.transform, 0, 0),
            transformPoint(entry.effect.transform, width, 0),
            transformPoint(entry.effect.transform, 0, height),
            transformPoint(entry.effect.transform, width, height),
          ]
          entryLeft = Math.min(entryLeft, ...points.map((point) => x + point.x))
          entryTop = Math.min(entryTop, ...points.map((point) => y + point.y))
          entryRight = Math.max(entryRight, ...points.map((point) => x + point.x))
          entryBottom = Math.max(entryBottom, ...points.map((point) => y + point.y))
        }
        if (entry.effect.glow) {
          const pad = entry.effect.glow.radius * 2
          entryLeft -= pad
          entryTop -= pad
          entryRight += pad
          entryBottom += pad
        }
        if (entry.effect.shadow) {
          const shadows = Array.isArray(entry.effect.shadow) ? entry.effect.shadow : [entry.effect.shadow]
          for (const shadow of shadows) {
            const pad = Math.ceil(Math.max(0, shadow.blur)) * 2
            entryLeft = Math.min(entryLeft, x + Math.min(0, shadow.x) - pad)
            entryTop = Math.min(entryTop, y + Math.min(0, shadow.y) - pad)
            entryRight = Math.max(entryRight, x + width + Math.max(0, shadow.x) + pad)
            entryBottom = Math.max(entryBottom, y + height + Math.max(0, shadow.y) + pad)
          }
        }
        if (entry.effect.filter?.blur) {
          const pad = entry.effect.filter.blur * 2
          entryLeft -= pad
          entryTop -= pad
          entryRight += pad
          entryBottom += pad
        }
      }
      left = Math.min(left, entryLeft)
      top = Math.min(top, entryTop)
      right = Math.max(right, entryRight)
      bottom = Math.max(bottom, entryBottom)
    }
    // Include the root's paint expansion (shadow, glow, and filter blur) but
    // keep its transform out of the source capture. The root transform is
    // applied when the isolated image is composited below.
    include(op, true)
    for (const entry of subtreeOps) include(entry)
    return {
      left: Math.floor(left),
      top: Math.floor(top),
      right: Math.ceil(right),
      bottom: Math.ceil(bottom),
    }
  }

  const getIsolatedSource = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    subtreeOps: RenderGraphOp[],
  ) => {
    const capture = getSubtreeCaptureBounds(op, subtreeOps)
    const width = Math.max(1, capture.right - capture.left)
    const height = Math.max(1, capture.bottom - capture.top)
    const sourceOp: Extract<RenderGraphOp, { kind: "effect" }> = {
      ...op,
      clipBounds: undefined,
      effect: {
        ...op.effect,
        filter: undefined,
        opacity: undefined,
        // The isolated image is composited with the original transform below.
        // Rendering the source untransformed also preserves the source UVs.
        transform: undefined,
        transformInverse: undefined,
        transformBounds: undefined,
      },
    }
    const renderSprite = renderOpToImage
    if (!renderSprite) return null
    const source = renderSprite(sourceOp, width, height, capture.left, capture.top, [sourceOp, ...subtreeOps])
    if (!source) return null
    return { handle: source, width, height, left: capture.left, top: capture.top }
  }

  /**
   * Render an effect's complete subtree into an isolated image and apply its
   * self-filter to that image. The existing composite filter entry point is
   * source-bound (unlike paint cmd_kind=19, which currently uses the fallback
   * texture), so this keeps the TS/native boundary correct without changing
   * the native ABI.
   */
  const getSelfFilterSprite = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    subtreeOps: RenderGraphOp[],
  ) => {
    const vctx = getVexartCtx()
    const filter = op.effect.filter
    if (!filter || !hasSelfFilter(filter)) return null
    const source = getIsolatedSource(op, subtreeOps)
    if (!source) return null
    const filtered = vexartCompositeImageFilterBackdrop(vctx, source.handle, {
      blur: filter.blur ?? null,
      brightness: filter.brightness ?? null,
      contrast: filter.contrast ?? null,
      saturate: filter.saturate ?? null,
      grayscale: filter.grayscale ?? null,
      invert: filter.invert ?? null,
      sepia: filter.sepia ?? null,
      hueRotate: filter.hueRotate ?? null,
    })
    vexartRemoveImage(vctx, source.handle)
    if (!filtered) return null
    transientFullFrameImages.push(filtered)
    return { ...source, handle: filtered }
  }

  /** Render a non-filtered effect subtree for group opacity composition. */
  const getGroupOpacitySprite = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    subtreeOps: RenderGraphOp[],
  ) => {
    const source = getIsolatedSource(op, subtreeOps)
    if (!source) return null
    transientFullFrameImages.push(source.handle)
    return source
  }

  const getTransformedSubtreeSprite = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    subtreeOps: RenderGraphOp[],
  ) => {
    const source = getIsolatedSource(op, subtreeOps)
    if (!source) return null
    transientFullFrameImages.push(source.handle)
    return source
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

  const clipRect = (cmd: { x: number; y: number; width: number; height: number; clipBounds?: { x: number; y: number; width: number; height: number } | null }, ctx: RendererBackendPaintContext) => {
    const x = Math.round(cmd.x) - ctx.offsetX
    const y = Math.round(cmd.y) - ctx.offsetY
    const w = Math.round(cmd.width)
    const h = Math.round(cmd.height)
    const scissorLeft = cmd.clipBounds ? Math.round(cmd.clipBounds.x) - ctx.offsetX : 0
    const scissorTop = cmd.clipBounds ? Math.round(cmd.clipBounds.y) - ctx.offsetY : 0
    const scissorRight = cmd.clipBounds ? scissorLeft + Math.round(cmd.clipBounds.width) : ctx.target.width
    const scissorBottom = cmd.clipBounds ? scissorTop + Math.round(cmd.clipBounds.height) : ctx.target.height
    const left = Math.max(0, x, scissorLeft)
    const top = Math.max(0, y, scissorTop)
    const right = Math.min(ctx.target.width, x + w, scissorRight)
    const bottom = Math.min(ctx.target.height, y + h, scissorBottom)
    if (right <= left || bottom <= top) return null
    return { x, y, w, h, left, top, right, bottom }
  }

  const batchBounds = (ctx: RendererBackendPaintContext, ops: RenderGraphOp[]) => {
    let bounds: IntBounds | null = null
    for (const op of ops) {
      const clip = clipRect(op, ctx)
      if (!clip) continue
      bounds = unionBounds(bounds, { left: clip.left, top: clip.top, right: clip.right, bottom: clip.bottom })
    }
    return bounds
  }

  const renderFrame = (
    ctx: RendererBackendPaintContext,
    targetHandle: VexartTargetHandle,
  ): { ok: boolean; rawLayer: { data: Uint8Array; width: number; height: number; region?: { x: number; y: number; width: number; height: number } } | null } => {
    let first = true
    shapeRects.length = 0
    shapeRectCorners.length = 0
    linearGradients.length = 0
    radialGradients.length = 0
    glows.length = 0
    imageGroups.clear()
    transformedImageGroups.clear()
    transientFullFrameImages.length = 0
    let targetMutationVersion = 0

    // ── vexart_paint_dispatch flush helpers ───────────────────────────────
    // Per design §11 / §8.2: each flush accumulates instances, packs into
    // a graph buffer per cmd_kind, then calls vexart_paint_dispatch once.
    const vctx = getVexartCtx()

    const flushInstances = <T>(
      items: T[],
      cmdKind: number,
      stride: number,
      pack: (item: T) => void,
    ) => {
      if (items.length === 0) return false
      const instances = new Uint8Array(items.length * stride)
      for (let i = 0; i < items.length; i++) {
        pack(items[i])
        // HP-3: Copy directly from shared _packU8 buffer — no .slice() allocation.
        // pack() already wrote stride bytes into _packView[0..stride].
        for (let b = 0; b < stride; b++) instances[i * stride + b] = _packU8[b]
      }
      _dispatchCount++
      _dispatchKinds.push(`k${cmdKind}:${items.length}`)
      flushVexartBatch(vctx, cmdKind, instances, targetHandle)
      items.length = 0
      first = false
      targetMutationVersion += 1
      return true
    }

    const flushShapeRects = () => {
      // Dispatch via vexart_paint_dispatch (cmd_kind=1: BridgeShapeRectInstance)
      flushInstances(shapeRects, 1, 80, (r) => { packShapeRectInstance(r.x, r.y, r.w, r.h, r.boxW, r.boxH, r.radius, r.fill ?? 0, r.stroke ?? 0, r.strokeWidth) })
    }
    const flushShapeRectCorners = () => {
      // Dispatch via vexart_paint_dispatch (cmd_kind=2: BridgeShapeRectCornersInstance)
      flushInstances(shapeRectCorners, 2, 96, (r) => { packShapeRectCornersInstance(r.x, r.y, r.w, r.h, r.boxW, r.boxH, r.radii, r.fill ?? 0, r.stroke ?? 0, r.strokeWidth) })
    }
    const flushLinearGradients = () => {
      // Dispatch via vexart_paint_dispatch (cmd_kind=12: BridgeLinearGradientInstance)
      flushInstances(linearGradients, 12, 80, (r) => { packLinearGradientInstance(r.x, r.y, r.w, r.h, r.boxW, r.boxH, r.radius, r.from, r.to, r.dirX, r.dirY) })
    }
    const flushRadialGradients = () => {
      // Dispatch via vexart_paint_dispatch (cmd_kind=13: BridgeRadialGradientInstance)
      flushInstances(radialGradients, 13, 80, (r) => { packRadialGradientInstance(r.x, r.y, r.w, r.h, r.boxW, r.boxH, r.radius, r.from, r.to) })
    }
    const flushGlows = () => {
      // Dispatch via vexart_paint_dispatch (cmd_kind=6: BridgeGlowInstance)
      flushInstances(glows, 6, 48, (g) => { packGlowInstance(g.x, g.y, g.w, g.h, g.color, g.intensity ?? 80) })
    }
    const flushShadows = () => {
      // Dispatch via vexart_paint_dispatch (cmd_kind=20: BridgeShadowInstance)
      flushInstances(shadows, 20, 80, (s) => { packShadowInstance(s.x, s.y, s.w, s.h, s.color, s.radii, s.boxW, s.boxH, s.offsetX, s.offsetY, s.blur) })
    }
    const flushImages = () => {
      if (imageGroups.size === 0) return
      // cmd_kind=9 has no image-handle field, so paint_dispatch binds the
      // transparent fallback texture. Composite each uploaded image directly
      // through the source-bound image FFI instead.
      for (const group of imageGroups.values()) {
        for (const instance of group.instances) {
          const x = ((instance.x + 1) * 0.5) * ctx.target.width
          const y = ((1 - instance.y) * 0.5) * ctx.target.height
          const w = Math.abs(instance.w) * 0.5 * ctx.target.width
          const h = Math.abs(instance.h) * 0.5 * ctx.target.height
          vexartCompositeRenderImageLayer(
            vctx, targetHandle, group.handle,
            x, y, w, h,
            0, 0x00000000,
          )
          first = false
          targetMutationVersion += 1
        }
      }
      imageGroups.clear()
    }
    const flushTransformedImages = () => {
      if (transformedImageGroups.size === 0) return
      // Transformed images must use the composite entry point so the native
      // layer binds the actual source image. Paint dispatch cmd_kind=10 has no
      // image handle in its packed ABI and therefore uses only the fallback
      // texture bind group.
      for (const group of transformedImageGroups.values()) {
        for (let i = 0; i < group.instances.length; i++) {
          const inst = group.instances[i]
          const instance = packImageTransformInstance(
            inst.p0.x, inst.p0.y,
            inst.p1.x, inst.p1.y,
            inst.p2.x, inst.p2.y,
            inst.p3.x, inst.p3.y,
            inst.opacity,
          )
          vexartCompositeRenderImageTransformLayer(vctx, targetHandle, group.handle, instance)
          first = false
          targetMutationVersion += 1
        }
      }
      transformedImageGroups.clear()
    }
    const flushRasterImages = () => {
      flushImages()
      flushTransformedImages()
    }
    const flushAll = () => {
      flushShapeRects()
      flushShapeRectCorners()
      flushLinearGradients()
      flushRadialGradients()
      flushShadows()
      flushGlows()
      flushImages()
      flushTransformedImages()
    }

    let dirtyBounds: IntBounds | null = null
    let layerOpen = false
    let _dispatchCount = 0
    let _dispatchKinds: string[] = []

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

    // Always open a layer with clear-to-transparent so that ALL dispatches
    // within this renderFrame share the same GPU encoder. Without this,
    // each flushVexartBatch creates a standalone encoder that clears the
    // target on its first render pass — erasing content from prior dispatches.
    vexartCompositeTargetBeginLayer(vctx, targetHandle, 0, 0x00000000)
    layerOpen = true

    const stripBackdropEffectOp = (op: EffectRenderOp): EffectRenderOp => {
      const stripped = { ...op.effect }
      for (const f of BACKDROP_FIELDS) stripped[f] = undefined
      return { ...op, backdrop: null, effect: stripped }
    }

    const getBackdropWorkBounds = (op: EffectRenderOp, metadata: BackdropRenderMetadata) => {
      // Convert absolute screen-space bounds to layer-local coordinates
      // (same transform that clipRect applies to all other ops)
      const localBounds = {
        x: metadata.outputBounds.x - ctx.offsetX,
        y: metadata.outputBounds.y - ctx.offsetY,
        width: metadata.outputBounds.width,
        height: metadata.outputBounds.height,
      }
      return clampBackdropBounds(localBounds, ctx.target.width, ctx.target.height)
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
      // handle may be 0n if copy failed — downstream getBackdropSprite will handle null
      const record: BackdropSourceRecord = {
        key: sourceKey,
        frameId: frameGeneration,
        bounds: workBounds,
        handle: copied.handle,
      }
      backdropSourceSlot.set(sourceKey, record)
      return record
    }

    const getBackdropSprite = (op: EffectRenderOp) => {
      if (!op.backdrop) return null
      const source = getBackdropSource(op, op.backdrop)
      if (!source) return null
      if (!source.handle || source.handle === 0n) return null
      const spriteKey = `${source.key}:${op.effectStateId}:${op.clipStateId}:${op.transformStateId}`
      const cached = backdropSpriteCache.get(spriteKey)
      if (cached && cached.frameId === frameGeneration) {
        return cached
      }
      let handle = vexartCompositeImageFilterBackdrop(vctx, source.handle, op.backdrop.filterParams)
      if (!handle) return null
      if (op.rect.radius > 0) {
        // uniform radius mask
        const rectBuf = new Float32Array(6)
        rectBuf[0] = op.rect.radius
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
      backdropSpriteSlot.set(spriteKey, record)
      return record
    }

    try {
      const skippedSubtreeOps = new Set<number>()
      for (let opIndex = 0; opIndex < ctx.graph.ops.length; opIndex++) {
        if (skippedSubtreeOps.has(opIndex)) continue
        const op = ctx.graph.ops[opIndex]
        const haloCapture = op.kind === "effect" && (op.effect.shadow !== undefined || op.effect.glow !== undefined)
          ? getSubtreeCaptureBounds(op, [])
          : null
        const clip = clipRect(op, ctx)
        const haloClip = haloCapture && op.kind === "effect" && op.clipBounds
          ? {
              left: Math.max(0, Math.round(op.clipBounds.x) - ctx.offsetX, haloCapture.left - ctx.offsetX),
              top: Math.max(0, Math.round(op.clipBounds.y) - ctx.offsetY, haloCapture.top - ctx.offsetY),
              right: Math.min(ctx.target.width, Math.round(op.clipBounds.x) - ctx.offsetX + Math.round(op.clipBounds.width), haloCapture.right - ctx.offsetX),
              bottom: Math.min(ctx.target.height, Math.round(op.clipBounds.y) - ctx.offsetY + Math.round(op.clipBounds.height), haloCapture.bottom - ctx.offsetY),
            }
          : null
        const haloNeedsCrop = !!(haloCapture && op.kind === "effect" && op.clipBounds && (
          haloCapture.left < Math.round(op.clipBounds.x)
          || haloCapture.top < Math.round(op.clipBounds.y)
          || haloCapture.right > Math.round(op.clipBounds.x) + Math.round(op.clipBounds.width)
          || haloCapture.bottom > Math.round(op.clipBounds.y) + Math.round(op.clipBounds.height)
        ))
        if (haloNeedsCrop && haloClip && op.kind === "effect" && (op.effect._node?.children.length ?? 0) === 0 && !op.backdrop) {
          flushAll()
          const clipped = renderClippedEffectOp(op, haloClip, ctx)
          if (!clipped) return { ok: false, rawLayer: null }
          ensureLoadedLayer()
          const clippedInstance = packImageTransformInstance(
            (haloClip.left / ctx.target.width) * 2 - 1,
            1 - (haloClip.top / ctx.target.height) * 2,
            (haloClip.right / ctx.target.width) * 2 - 1,
            1 - (haloClip.top / ctx.target.height) * 2,
            (haloClip.left / ctx.target.width) * 2 - 1,
            1 - (haloClip.bottom / ctx.target.height) * 2,
            (haloClip.right / ctx.target.width) * 2 - 1,
            1 - (haloClip.bottom / ctx.target.height) * 2,
            1,
          )
          vexartCompositeRenderImageTransformLayer(vctx, targetHandle, clipped.handle, clippedInstance)
          vexartRemoveImage(vctx, clipped.handle)
          first = false
          targetMutationVersion += 1
          markDirty(haloClip.left, haloClip.top, haloClip.right, haloClip.bottom)
          continue
        }
        if (!clip) continue
        const ownLeft = Math.round(op.x) - ctx.offsetX
        const ownTop = Math.round(op.y) - ctx.offsetY
        const ownRight = ownLeft + Math.max(1, Math.round(op.width))
        const ownBottom = ownTop + Math.max(1, Math.round(op.height))
        const needsCrop = clip.left !== ownLeft || clip.top !== ownTop || clip.right !== ownRight || clip.bottom !== ownBottom
        const canCropAsSingleOp = op.kind !== "effect"
          || (op.effect._node?.children.length ?? 0) === 0
          && !op.backdrop
        if (needsCrop && canCropAsSingleOp) {
          flushAll()
          const clipped = renderClippedOp(op, clip, ctx)
          if (!clipped) return { ok: false, rawLayer: null }
          ensureLoadedLayer()
          const clippedInstance = packImageTransformInstance(
            (clip.left / ctx.target.width) * 2 - 1,
            1 - (clip.top / ctx.target.height) * 2,
            (clip.right / ctx.target.width) * 2 - 1,
            1 - (clip.top / ctx.target.height) * 2,
            (clip.left / ctx.target.width) * 2 - 1,
            1 - (clip.bottom / ctx.target.height) * 2,
            (clip.right / ctx.target.width) * 2 - 1,
            1 - (clip.bottom / ctx.target.height) * 2,
            1,
          )
          vexartCompositeRenderImageTransformLayer(vctx, targetHandle, clipped.handle, clippedInstance)
          vexartRemoveImage(vctx, clipped.handle)
          first = false
          targetMutationVersion += 1
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "rectangle") {
          // Images are composited directly from their source handles. Flush
          // them before queuing a later shape so deferred image batches cannot
          // paint over subsequent siblings.
          flushRasterImages()
          const boxW = clip.right - clip.left
          const boxH = clip.bottom - clip.top
          shapeRects.push({
            x: (clip.left / ctx.target.width) * 2 - 1,
            y: 1 - (clip.top / ctx.target.height) * 2,
            w: (boxW / ctx.target.width) * 2,
            h: -((boxH / ctx.target.height) * 2),
            boxW,
            boxH,
            radius: clampShapeRadius(op.radius, boxW, boxH),
            strokeWidth: 0,
            fill: op.color,
          })
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "effect") {
          // Keep source-bound images in graph order relative to effect fills
          // and backdrop snapshots (flushAll batches by command kind).
          flushRasterImages()
          let effectOp = op
          const effectOpacity = effectOp.effect.opacity ?? 1
          const cornerRadii = effectOp.effect.cornerRadii
          const haloShapeRectStart = shapeRects.length
          const haloShapeCornerStart = shapeRectCorners.length

          const hasFilteredOutput = !!(effectOp.effect.filter && hasSelfFilter(effectOp.effect.filter))
          const hasGroupOpacity = effectOpacity < 1 && effectOp.effect._node !== undefined && effectOp.effect._node.children.length > 0
          const hasTransformedSubtree = !!(effectOp.effect.transform && effectOp.effect._node !== undefined && effectOp.effect._node.children.length > 0)
          if (hasFilteredOutput || hasGroupOpacity || hasTransformedSubtree) {
            // A filter on a container applies to its complete paint output,
            // not just the container's placeholder rect. Collect descendant
            // commands into the isolated source target and skip them in the
            // parent pass so they are not painted a second time.
            const subtreeNodeIds = new Set<number>()
            const collectNodeIds = (node: import("./node").TGENode | undefined) => {
              if (!node || subtreeNodeIds.has(node.id)) return
              subtreeNodeIds.add(node.id)
              for (const child of node.children) collectNodeIds(child)
            }
            collectNodeIds(effectOp.effect._node)
            const subtreeOps: RenderGraphOp[] = []
            for (let descendantIndex = opIndex + 1; descendantIndex < ctx.graph.ops.length; descendantIndex++) {
              const descendant = ctx.graph.ops[descendantIndex]
              if (descendant.nodeId === undefined || !subtreeNodeIds.has(descendant.nodeId)) continue
              subtreeOps.push(descendant)
              skippedSubtreeOps.add(descendantIndex)
            }

            flushAll()
            const sprite = hasFilteredOutput
              ? getSelfFilterSprite(effectOp, subtreeOps)
              : hasGroupOpacity
                ? getGroupOpacitySprite(effectOp, subtreeOps)
                : getTransformedSubtreeSprite(effectOp, subtreeOps)
            if (!sprite) return { ok: false, rawLayer: null }
            const bounds = opBounds(effectOp, ctx.target.width, ctx.target.height)
            if (!bounds) continue
            if (effectOp.effect.transform) {
              const transformedSprite = {
                handle: sprite.handle,
                width: sprite.width,
                height: sprite.height,
                left: sprite.left,
                top: sprite.top,
              }
              const clippedTransformed = renderTransformedSpriteClip(effectOp, transformedSprite, ctx, effectOpacity)
              if (clippedTransformed) {
                if (clippedTransformed.handle) {
                  ensureLoadedLayer()
                  const output = clippedTransformed.clip
                  const imageInstance = packImageTransformInstance(
                    (output.left / ctx.target.width) * 2 - 1,
                    1 - (output.top / ctx.target.height) * 2,
                    (output.right / ctx.target.width) * 2 - 1,
                    1 - (output.top / ctx.target.height) * 2,
                    (output.left / ctx.target.width) * 2 - 1,
                    1 - (output.bottom / ctx.target.height) * 2,
                    (output.right / ctx.target.width) * 2 - 1,
                    1 - (output.bottom / ctx.target.height) * 2,
                    1,
                  )
                  vexartCompositeRenderImageTransformLayer(vctx, targetHandle, clippedTransformed.handle, imageInstance)
                  vexartRemoveImage(vctx, clippedTransformed.handle)
                  first = false
                  targetMutationVersion += 1
                }
                markDirty(clippedTransformed.clip.left, clippedTransformed.clip.top, clippedTransformed.clip.right, clippedTransformed.clip.bottom)
                continue
              }
              const geometry = getTransformedImageGeometry(effectOp, transformedSprite, ctx, effectOpacity)
              if (!geometry) continue
              ensureLoadedLayer()
              const group = transformedImageGroups.get(sprite.handle) ?? { handle: sprite.handle, instances: [] as TransformedImageInstance[] }
              group.instances.push({
                ...geometry.quad,
                opacity: effectOpacity,
              })
              transformedImageGroups.set(sprite.handle, group)
              markDirty(geometry.bounds.left, geometry.bounds.top, geometry.bounds.right, geometry.bounds.bottom)
              flushAll()
            } else {
              ensureLoadedLayer()
              let imageHandle = sprite.handle
              let imageWidth = sprite.width
              let imageHeight = sprite.height
              let imageLeft = sprite.left - ctx.offsetX
              let imageTop = sprite.top - ctx.offsetY
              const spriteLeft = sprite.left - ctx.offsetX
              const spriteTop = sprite.top - ctx.offsetY
              const spriteRight = spriteLeft + sprite.width
              const spriteBottom = spriteTop + sprite.height
              const spriteNeedsCrop = !!(effectOp.clipBounds && (
                spriteLeft < Math.round(effectOp.clipBounds.x) - ctx.offsetX
                || spriteTop < Math.round(effectOp.clipBounds.y) - ctx.offsetY
                || spriteRight > Math.round(effectOp.clipBounds.x) - ctx.offsetX + Math.round(effectOp.clipBounds.width)
                || spriteBottom > Math.round(effectOp.clipBounds.y) - ctx.offsetY + Math.round(effectOp.clipBounds.height)
              ))
              const outputClip = spriteNeedsCrop && effectOp.clipBounds
                ? {
                    left: Math.max(0, Math.round(effectOp.clipBounds.x) - ctx.offsetX),
                    top: Math.max(0, Math.round(effectOp.clipBounds.y) - ctx.offsetY),
                    right: Math.min(ctx.target.width, Math.round(effectOp.clipBounds.x) - ctx.offsetX + Math.round(effectOp.clipBounds.width)),
                    bottom: Math.min(ctx.target.height, Math.round(effectOp.clipBounds.y) - ctx.offsetY + Math.round(effectOp.clipBounds.height)),
                  }
                : clip
              if (needsCrop || spriteNeedsCrop) {
                const sourceLeft = sprite.left - ctx.offsetX
                const sourceTop = sprite.top - ctx.offsetY
                const cropX = outputClip.left - sourceLeft
                const cropY = outputClip.top - sourceTop
                const cropWidth = outputClip.right - outputClip.left
                const cropHeight = outputClip.bottom - outputClip.top
                const cropped = cropImage(sprite.handle, imageWidth, imageHeight, cropX, cropY, cropWidth, cropHeight)
                if (!cropped) return { ok: false, rawLayer: null }
                transientFullFrameImages.push(cropped)
                imageHandle = cropped
                imageWidth = cropWidth
                imageHeight = cropHeight
                imageLeft = outputClip.left
                imageTop = outputClip.top
              }
              const imageInstance = packImageTransformInstance(
                (imageLeft / ctx.target.width) * 2 - 1,
                1 - (imageTop / ctx.target.height) * 2,
                ((imageLeft + imageWidth) / ctx.target.width) * 2 - 1,
                1 - (imageTop / ctx.target.height) * 2,
                (imageLeft / ctx.target.width) * 2 - 1,
                1 - ((imageTop + imageHeight) / ctx.target.height) * 2,
                ((imageLeft + imageWidth) / ctx.target.width) * 2 - 1,
                1 - ((imageTop + imageHeight) / ctx.target.height) * 2,
                effectOpacity,
              )
              vexartCompositeRenderImageTransformLayer(vctx, targetHandle, imageHandle, imageInstance)
              first = false
              targetMutationVersion += 1
              markDirty(bounds.left, bounds.top, bounds.right, bounds.bottom)
            }
            continue
          }

           if (effectOp.backdrop && !cornerRadii) {
            // Force a clear render pass before backdrop reads from the target.
            if (first) {
              shapeRects.push({ x: 0, y: 0, w: 0, h: 0, boxW: 0, boxH: 0, radius: 0, strokeWidth: 0, fill: 0 })
            }
            // Flush every pending kind before copying the backdrop source.
            // In particular, image/canvas ops are source-bound composites
            // and must be visible before the backdrop snapshot is captured.
            flushAll()
            if (layerOpen) {
              vexartCompositeTargetEndLayer(vctx, targetHandle)
              layerOpen = false
            }
            // ── Backdrop pre-composite: blit lower-z layers into this target ──
            // When this element is on its own layer (auto-promoted), the target
            // is empty. Compose previously-rendered layers so getBackdropSource
            // reads actual "content behind" instead of transparent pixels.
            if (_renderedLayerStack.length > 0 && currentFrame) {
              const vw = currentFrame.viewportWidth
              const vh = currentFrame.viewportHeight
              vexartCompositeTargetBeginLayer(vctx, targetHandle, 1, 0x00000000)
              for (const layer of _renderedLayerStack) {
                const quad = layer.subtreeTransform ?? {
                  p0: { x: layer.x, y: layer.y },
                  p1: { x: layer.x + layer.width, y: layer.y },
                  p2: { x: layer.x, y: layer.y + layer.height },
                  p3: { x: layer.x + layer.width, y: layer.y + layer.height },
                }
                // Map absolute viewport coords to the layer's local target coords
                const ox = ctx.offsetX
                const oy = ctx.offsetY
                const tw = ctx.target.width
                const th = ctx.target.height
                const inst = packImageTransformInstance(
                  ((quad.p0.x - ox) / tw) * 2 - 1, 1 - ((quad.p0.y - oy) / th) * 2,
                  ((quad.p1.x - ox) / tw) * 2 - 1, 1 - ((quad.p1.y - oy) / th) * 2,
                  ((quad.p2.x - ox) / tw) * 2 - 1, 1 - ((quad.p2.y - oy) / th) * 2,
                  ((quad.p3.x - ox) / tw) * 2 - 1, 1 - ((quad.p3.y - oy) / th) * 2,
                  layer.opacity,
                )
                compositeTargetUniformToTarget(vctx, targetHandle, layer.handle, inst)
              }
              vexartCompositeTargetEndLayer(vctx, targetHandle)
            }
            const sprite = getBackdropSprite(effectOp)
            if (!sprite) return { ok: false, rawLayer: null }
            if (effectOp.effect.transform) {
              ensureLoadedLayer()
              const bounds = opBounds(effectOp, ctx.target.width, ctx.target.height)
              if (bounds) {
                const group = transformedImageGroups.get(sprite.handle) ?? { handle: sprite.handle, instances: [] as TransformedImageInstance[] }
                const matrix = effectOp.effect.transform
                const width = Math.max(1, Math.round(effectOp.width))
                const height = Math.max(1, Math.round(effectOp.height))
                const baseX = Math.round(effectOp.x) - ctx.offsetX
                const baseY = Math.round(effectOp.y) - ctx.offsetY
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
            if (first) {
              shapeRects.push({ x: 0, y: 0, w: 0, h: 0, boxW: 0, boxH: 0, radius: 0, strokeWidth: 0, fill: 0 })
            }
            flushAll()
            if (layerOpen) {
              vexartCompositeTargetEndLayer(vctx, targetHandle)
              layerOpen = false
            }
            // Pre-composite lower layers (same as !cornerRadii path above)
            if (_renderedLayerStack.length > 0 && currentFrame) {
              const vw = currentFrame.viewportWidth
              const vh = currentFrame.viewportHeight
              vexartCompositeTargetBeginLayer(vctx, targetHandle, 1, 0x00000000)
              for (const layer of _renderedLayerStack) {
                const quad = layer.subtreeTransform ?? {
                  p0: { x: layer.x, y: layer.y },
                  p1: { x: layer.x + layer.width, y: layer.y },
                  p2: { x: layer.x, y: layer.y + layer.height },
                  p3: { x: layer.x + layer.width, y: layer.y + layer.height },
                }
                const ox = ctx.offsetX
                const oy = ctx.offsetY
                const tw = ctx.target.width
                const th = ctx.target.height
                const inst = packImageTransformInstance(
                  ((quad.p0.x - ox) / tw) * 2 - 1, 1 - ((quad.p0.y - oy) / th) * 2,
                  ((quad.p1.x - ox) / tw) * 2 - 1, 1 - ((quad.p1.y - oy) / th) * 2,
                  ((quad.p2.x - ox) / tw) * 2 - 1, 1 - ((quad.p2.y - oy) / th) * 2,
                  ((quad.p3.x - ox) / tw) * 2 - 1, 1 - ((quad.p3.y - oy) / th) * 2,
                  layer.opacity,
                )
                compositeTargetUniformToTarget(vctx, targetHandle, layer.handle, inst)
              }
              vexartCompositeTargetEndLayer(vctx, targetHandle)
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
            const width = Math.max(1, Math.round(effectOp.width))
            const height = Math.max(1, Math.round(effectOp.height))
            const baseX = Math.round(effectOp.x) - ctx.offsetX
            const baseY = Math.round(effectOp.y) - ctx.offsetY
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

          const baseFillRaw = effectOp.color >>> 0
          const baseFill = effectOpacity < 1 ? applyOpacityToColor(baseFillRaw, effectOpacity) : baseFillRaw
          const boxW = clip.right - clip.left
          const boxH = clip.bottom - clip.top
          const radius = clampShapeRadius(effectOp.rect.radius, boxW, boxH)

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

          if (!effectOp.effect.gradient && (effectOp.color & 0xff) > 1) {
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
            } else if ((effectOp.color & 0xff) > 1) {
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

          if (effectOp.effect.shadow || effectOp.effect.glow) {
            // Paint halos after the ancestor batches but before this node's
            // own fill. Dispatching a halo after the fill can otherwise
            // darken the source interior instead of remaining behind it.
            const ownRects = shapeRects.splice(haloShapeRectStart)
            const ownCorners = shapeRectCorners.splice(haloShapeCornerStart)
            flushAll()
            for (const rect of ownRects) shapeRects.push(rect)
            for (const rect of ownCorners) shapeRectCorners.push(rect)
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
            flushShadows()
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
            flushGlows()
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
          flushRasterImages()
          if (op.borderWidths) {
            // Flexily exposes per-side widths, while the native shape stroke
            // accepts one uniform width. Paint the four sides as filled strips
            // so existing borderLeft/Right/Top/Bottom props keep their exact
            // widths without changing the native ABI.
            const sides = op.borderWidths
            const ownLeft = Math.round(op.x) - ctx.offsetX
            const ownTop = Math.round(op.y) - ctx.offsetY
            const ownWidth = Math.max(1, Math.round(op.width))
            const ownHeight = Math.max(1, Math.round(op.height))
            const pushStrip = (x: number, y: number, width: number, height: number) => {
              const left = Math.max(clip.left, x)
              const top = Math.max(clip.top, y)
              const right = Math.min(clip.right, x + width)
              const bottom = Math.min(clip.bottom, y + height)
              if (right <= left || bottom <= top) return
              const stripW = right - left
              const stripH = bottom - top
              shapeRects.push({
                x: (left / ctx.target.width) * 2 - 1,
                y: 1 - (top / ctx.target.height) * 2,
                w: (stripW / ctx.target.width) * 2,
                h: -((stripH / ctx.target.height) * 2),
                boxW: stripW,
                boxH: stripH,
                radius: 0,
                strokeWidth: 0,
                fill: op.color >>> 0,
              })
            }
            const top = Math.max(0, Math.round(sides.top))
            const bottom = Math.max(0, Math.round(sides.bottom))
            const left = Math.max(0, Math.round(sides.left))
            const right = Math.max(0, Math.round(sides.right))
            pushStrip(ownLeft, ownTop, ownWidth, top)
            pushStrip(ownLeft, ownTop + ownHeight - bottom, ownWidth, bottom)
            pushStrip(ownLeft, ownTop + top, left, ownHeight - top - bottom)
            pushStrip(ownLeft + ownWidth - right, ownTop + top, right, ownHeight - top - bottom)
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
            continue
          }
          const boxW = clip.right - clip.left
          const boxH = clip.bottom - clip.top
          if (op.cornerRadii) {
            shapeRectCorners.push({
              x: (clip.left / ctx.target.width) * 2 - 1,
              y: 1 - (clip.top / ctx.target.height) * 2,
              w: (boxW / ctx.target.width) * 2,
              h: -((boxH / ctx.target.height) * 2),
              boxW,
              boxH,
              radii: op.cornerRadii,
              strokeWidth: op.borderWidth,
              stroke: op.color >>> 0,
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
            radius: clampShapeRadius(op.radius, boxW, boxH),
            strokeWidth: op.borderWidth,
            stroke: op.color >>> 0,
          })
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "image") {
          // Finish earlier shapes before queuing this image. The image FFI
          // path is source-bound and cannot share cmd_kind=9's batch ABI.
          flushAll()
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
          flushAll()
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
          const sym = getMsdfSymbols()
          if (!sym) continue
          const textX = Math.round(op.x) - ctx.offsetX
          const textY = Math.round(op.y) - ctx.offsetY
          const colorRgba = op.color >>> 0
          deferredMsdfOps.push({
            text: op.text,
            x: textX,
            y: textY,
            fontSize: op.fontSize,
            lineHeight: op.lineHeight,
            maxWidth: op.maxWidth > 0 ? op.maxWidth : 999999,
            colorRgba,
            fontFamily: op.fontFamily,
            fontWeight: op.fontWeight,
            fontStyle: op.fontStyle,
          })
          const bounds = opBounds(op, ctx.target.width, ctx.target.height)
          if (bounds) markDirty(bounds.left, bounds.top, bounds.right, bounds.bottom)
          continue
        }
        failGpuOnly(`unsupported render op kind=${op.kind}`)
      }
      flushAll()
      // ── Deferred MSDF text: render AFTER all rects/shapes/images so text appears on top ──
      for (const msdfOp of deferredMsdfOps) {
        tryMsdfText(
          vctx, targetHandle,
          msdfOp.text, msdfOp.x, msdfOp.y,
          msdfOp.fontSize, msdfOp.lineHeight, msdfOp.maxWidth,
          msdfOp.colorRgba,
          ctx.target.width, ctx.target.height,
          msdfOp.fontFamily, msdfOp.fontWeight, msdfOp.fontStyle,
        )
      }
      deferredMsdfOps.length = 0
    } finally {
      if (layerOpen) vexartCompositeTargetEndLayer(vctx, targetHandle)
    }

    // DEBUG: Log dispatch count per renderFrame
    if (_dispatchCount > 0) {
      appendFileSync("/tmp/tge-layers.log", `[renderFrame] dispatches=${_dispatchCount} layerOpen=${layerOpen} ops=${ctx.graph.ops.length} kinds=[${_dispatchKinds.join(",")}]\n`)
    }

    if (first) return { ok: true as const, rawLayer: null }
    // Native presentation handles all readback in Rust — no TS readback path.
    for (const handle of transientFullFrameImages) vexartRemoveImage(vctx, handle)
    return { ok: true as const, rawLayer: null }
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
    const compositeStart = PROFILE_ENABLED ? performance.now() : 0
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
        const uniformStart = PROFILE_ENABLED ? performance.now() : 0
        const uniformUpdated = compositeTargetUniformToTarget(vctx, targetHandle, layer.handle, inst)
        addBackendProfile("uniformUpdateMs", uniformStart)
        if (!uniformUpdated) {
          return null
        }
      }
    } finally {
      const compositeEndStart = PROFILE_ENABLED ? performance.now() : 0
      vexartCompositeTargetEndLayer(vctx, targetHandle)
      addBackendProfile("compositeMs", compositeEndStart)
    }
    pruneLayerTargets()

    // ── Native final-frame presentation ──
    // All transport modes (direct/file/shm) are handled by Rust natively.
    // Rust does GPU readback + compress + Kitty emit internally.
    // No RGBA bytes are returned to JS — zero TS readback.
    if (options.suppressPresentation) {
      return { output: "none", strategy: lastStrategy }
    }

    const statsBuf = allocNativeStatsBuf()
    ensureNativeKittyTransport(frame.transmissionMode)
    const nativeEmitStart = PROFILE_ENABLED ? performance.now() : 0
    const rc = getSymbols().vexart_kitty_emit_frame_with_stats(
      vctx,
      targetHandle,
      finalFrameImageId,
      ptr(statsBuf),
    ) as number
    addBackendProfile("nativeEmitMs", nativeEmitStart)
    if (rc !== 0) {
      const err = vexartGetLastError()
      throw new Error(`[vexart] native frame presentation failed (${rc}): ${err}`)
    }
    const stats = decodeNativePresentationStats(statsBuf)
    addNativeStatsProfile(stats)
    return { output: "native-presented", strategy: lastStrategy, stats }
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

  renderOpToImage = (op, width, height, offsetX, offsetY, ops) => {
    const vctx = getVexartCtx()
    const target = vexartCompositeTargetCreate(vctx, width, height)
    if (!target) return null
    // A transformed effect is rasterized by recursively rendering a tiny
    // sprite. Keep the parent frame's deferred text queue out of that nested
    // target; otherwise text that was queued before the effect (for example
    // the app header) is painted into the sprite and becomes a visible
    // artifact after the transform.
    const deferredText = deferredMsdfOps.splice(0)
    try {
      const spriteCtx: RendererBackendPaintContext = {
        targetWidth: width,
        targetHeight: height,
        backing: null,
        target: { width, height },
        commands: [],
        graph: { ops: ops ?? [op] },
        offsetX,
        offsetY,
        frame: null,
        layer: null,
      }
      const result = renderFrame(spriteCtx, target)
      if (!result.ok) return null
      return copyGpuTargetRegionToImage(vctx, target, { x: 0, y: 0, width, height }).handle
    } finally {
      deferredMsdfOps.push(...deferredText)
      vexartCompositeTargetDestroy(vctx, target)
    }
  }

  /** Crop an isolated operation without changing its source geometry. */
  const cropImage = (
    source: VexartImageHandle,
    sourceWidth: number,
    sourceHeight: number,
    cropX: number,
    cropY: number,
    cropWidth: number,
    cropHeight: number,
  ) => {
    const vctx = getVexartCtx()
    const target = vexartCompositeTargetCreate(vctx, cropWidth, cropHeight)
    if (!target) return null
    try {
      vexartCompositeTargetBeginLayer(vctx, target, 0, 0x00000000)
      vexartCompositeRenderImageLayer(
        vctx, target, source,
        -cropX, -cropY, sourceWidth, sourceHeight,
        0, 0x00000000,
      )
      vexartCompositeTargetEndLayer(vctx, target)
      const copied = copyGpuTargetRegionToImage(vctx, target, {
        x: 0,
        y: 0,
        width: cropWidth,
        height: cropHeight,
      })
      return copied.handle || null
    } finally {
      vexartCompositeTargetDestroy(vctx, target)
    }
  }

  const renderClippedOp = (
    op: RenderGraphOp,
    clip: { left: number; top: number; right: number; bottom: number },
    ctx: RendererBackendPaintContext,
  ) => {
    const ownLeft = Math.round(op.x) - ctx.offsetX
    const ownTop = Math.round(op.y) - ctx.offsetY
    const bounds = {
      left: ownLeft,
      top: ownTop,
      right: ownLeft + Math.max(1, Math.round(op.width)),
      bottom: ownTop + Math.max(1, Math.round(op.height)),
    }
    const width = Math.max(1, bounds.right - bounds.left)
    const height = Math.max(1, bounds.bottom - bounds.top)
    const sourceLeft = bounds.left
    const sourceTop = bounds.top
    const cropX = clip.left - sourceLeft
    const cropY = clip.top - sourceTop
    const cropWidth = clip.right - clip.left
    const cropHeight = clip.bottom - clip.top
    if (cropX < 0 || cropY < 0 || cropX + cropWidth > width || cropY + cropHeight > height) return null
    const sourceOp = { ...op, clipBounds: undefined }
    const source = renderOpToImage?.(
      sourceOp,
      width,
      height,
      bounds.left + ctx.offsetX,
      bounds.top + ctx.offsetY,
      [sourceOp],
    )
    if (!source) return null
    const cropped = cropImage(source, width, height, cropX, cropY, cropWidth, cropHeight)
    vexartRemoveImage(getVexartCtx(), source)
    return cropped ? { handle: cropped, width: cropWidth, height: cropHeight } : null
  }

  /** Capture a leaf effect's full paint expansion, then crop only its output.
   * This keeps shadow/glow geometry and blur radii in source coordinates while
   * enforcing the scroll scissor at the final composite boundary.
   */
  const renderClippedEffectOp = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    clip: { left: number; top: number; right: number; bottom: number },
    ctx: RendererBackendPaintContext,
  ) => {
    const capture = getSubtreeCaptureBounds(op, [])
    const captureLeft = capture.left - ctx.offsetX
    const captureTop = capture.top - ctx.offsetY
    const width = Math.max(1, capture.right - capture.left)
    const height = Math.max(1, capture.bottom - capture.top)
    const cropX = clip.left - captureLeft
    const cropY = clip.top - captureTop
    const cropWidth = clip.right - clip.left
    const cropHeight = clip.bottom - clip.top
    if (cropX < 0 || cropY < 0 || cropX + cropWidth > width || cropY + cropHeight > height) return null
    const source = renderOpToImage?.(
      { ...op, clipBounds: undefined },
      width,
      height,
      capture.left,
      capture.top,
      [{ ...op, clipBounds: undefined }],
    )
    if (!source) return null
    const cropped = cropImage(source, width, height, cropX, cropY, cropWidth, cropHeight)
    vexartRemoveImage(getVexartCtx(), source)
    return cropped ? { handle: cropped, width: cropWidth, height: cropHeight } : null
  }

  const getTransformedImageGeometry = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    sprite: { width: number; height: number; left: number; top: number },
    ctx: RendererBackendPaintContext,
    opacity: number,
  ) => {
    const matrix = op.effect.transform
    if (!matrix) return null
    const width = sprite.width
    const height = sprite.height
    const sourceX = sprite.left - Math.round(op.x)
    const sourceY = sprite.top - Math.round(op.y)
    const baseX = Math.round(op.x) - ctx.offsetX
    const baseY = Math.round(op.y) - ctx.offsetY
    const points = [
      transformPoint(matrix, sourceX, sourceY),
      transformPoint(matrix, sourceX + width, sourceY),
      transformPoint(matrix, sourceX, sourceY + height),
      transformPoint(matrix, sourceX + width, sourceY + height),
    ].map((point) => ({ x: baseX + point.x, y: baseY + point.y }))
    const quad = {
      p0: { x: (points[0].x / ctx.target.width) * 2 - 1, y: 1 - (points[0].y / ctx.target.height) * 2 },
      p1: { x: (points[1].x / ctx.target.width) * 2 - 1, y: 1 - (points[1].y / ctx.target.height) * 2 },
      p2: { x: (points[2].x / ctx.target.width) * 2 - 1, y: 1 - (points[2].y / ctx.target.height) * 2 },
      p3: { x: (points[3].x / ctx.target.width) * 2 - 1, y: 1 - (points[3].y / ctx.target.height) * 2 },
    }
    return {
      instance: packImageTransformInstance(
        quad.p0.x, quad.p0.y,
        quad.p1.x, quad.p1.y,
        quad.p2.x, quad.p2.y,
        quad.p3.x, quad.p3.y,
        opacity,
      ),
      quad,
      bounds: {
        left: Math.floor(Math.min(...points.map((point) => point.x))),
        top: Math.floor(Math.min(...points.map((point) => point.y))),
        right: Math.ceil(Math.max(...points.map((point) => point.x))),
        bottom: Math.ceil(Math.max(...points.map((point) => point.y))),
      },
    }
  }

  const renderTransformedSpriteClip = (
    op: Extract<RenderGraphOp, { kind: "effect" }>,
    sprite: { handle: VexartImageHandle; width: number; height: number; left: number; top: number },
    ctx: RendererBackendPaintContext,
    opacity: number,
  ) => {
    if (!op.clipBounds) return null
    const geometry = getTransformedImageGeometry(op, sprite, ctx, opacity)
    if (!geometry) return null
    const clip = {
      left: Math.max(0, Math.round(op.clipBounds.x) - ctx.offsetX, geometry.bounds.left),
      top: Math.max(0, Math.round(op.clipBounds.y) - ctx.offsetY, geometry.bounds.top),
      right: Math.min(ctx.target.width, Math.round(op.clipBounds.x) - ctx.offsetX + Math.round(op.clipBounds.width), geometry.bounds.right),
      bottom: Math.min(ctx.target.height, Math.round(op.clipBounds.y) - ctx.offsetY + Math.round(op.clipBounds.height), geometry.bounds.bottom),
    }
    const outside = geometry.bounds.left < Math.round(op.clipBounds.x) - ctx.offsetX
      || geometry.bounds.top < Math.round(op.clipBounds.y) - ctx.offsetY
      || geometry.bounds.right > Math.round(op.clipBounds.x) - ctx.offsetX + Math.round(op.clipBounds.width)
      || geometry.bounds.bottom > Math.round(op.clipBounds.y) - ctx.offsetY + Math.round(op.clipBounds.height)
    if (!outside) return null
    if (clip.right <= clip.left || clip.bottom <= clip.top) return { handle: null, clip, geometry }
    const vctx = getVexartCtx()
    const temp = vexartCompositeTargetCreate(vctx, ctx.target.width, ctx.target.height)
    if (!temp) return { handle: null, clip, geometry }
    try {
      vexartCompositeTargetBeginLayer(vctx, temp, 0, 0x00000000)
      vexartCompositeRenderImageTransformLayer(vctx, temp, sprite.handle, geometry.instance)
      vexartCompositeTargetEndLayer(vctx, temp)
      const copied = copyGpuTargetRegionToImage(vctx, temp, {
        x: clip.left,
        y: clip.top,
        width: clip.right - clip.left,
        height: clip.bottom - clip.top,
      })
      return { handle: copied.handle || null, clip, geometry }
    } finally {
      vexartCompositeTargetDestroy(vctx, temp)
    }
  }

  return {
    name: "gpu-render-graph",
    beginFrame(ctx): RendererBackendFramePlan {
      resetBackendProfile()
      currentFrame = ctx
      currentFrameLayers = []
      _renderedLayerStack.length = 0
      activeLayerKeys.clear()
      suppressFinalPresentation = false
      if (!ctx.useLayerCompositing) {
        lastStrategy = null
        lastNativeFramePlan = null
        framesSinceStrategyChange = 0
        lastStrategyTelemetry = { preferred: null, chosen: null, estimatedLayeredBytes: 0, estimatedFinalBytes: 0 }
        return { strategy: null }
      }
      const forcedStrategy = getForcedLayerStrategy()
      if (forcedStrategy) {
        if (forcedStrategy === "final-frame" && lastStrategy !== "final-frame") {
          clearNativeLayerRegistryMirror()
        }
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
      if (chosen === "final-frame" && previousStrategy !== "final-frame") {
        clearNativeLayerRegistryMirror()
      }
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
    paint(ctx) {
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
        const result = renderFrame(ctx, layerTarget)

        if (!result.ok) {
          suppressFinalPresentation = true
          failGpuOnly(`GPU layer render failed for ${layerCtx.key}`)
        }

        // Track rendered layer for backdrop pre-composite of subsequent layers
        _renderedLayerStack.push({
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
        // Layer targets are retained for GPU compositing, but the frame
        // presenter is the single visible output authority. Emitting a layer
        // here and then composing the same layer again in endFrame() creates
        // two Kitty placements; fractional pixel positions make the duplicate
        // visible as a ghost. Keep the painted target and let endFrame emit
        // the exact-pixel complete frame once.
        return { output: "skip-present", strategy: lastStrategy }
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
      const record = layerTargets.get(ctx.layer.key)
      if (!record) return false
      activeLayerKeys.add(ctx.layer.key)
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
      return true
    },
    compositeRetainedFrame(ctx) {
      resetBackendProfile()
      return composeRetainedFrame(ctx.frame, ctx.layers)
    },
    endFrame(ctx) {
      currentFrame = null
      if (!ctx.useLayerCompositing) return { output: "none", strategy: lastStrategy }
      if (suppressFinalPresentation) {
        pruneLayerTargets()
        return { output: "none", strategy: lastStrategy }
      }
      if (ctx.dirtyLayerCount === 0 || ctx.dirtyPixelArea === 0) {
        pruneLayerTargets()
        return { output: "none", strategy: lastStrategy }
      }
      if (lastStrategy === "skip-present") {
        pruneLayerTargets()
        return { output: "none", strategy: lastStrategy }
      }
      // Layer targets remain retained for the next frame, but presentation is
      // intentionally single-authority: emit one complete frame after all
      // layer targets have been painted. Mixing visible layer placements with
      // this frame would duplicate fractional-position content in Kitty.
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
    destroy() {
      if (_vexartCtx !== null) {
        for (const handle of activeImageHandles) {
          vexartRemoveImage(_vexartCtx, handle)
        }
        activeImageHandles.clear()
        destroyTargetRecord(standaloneTarget)
        standaloneTarget = null
        destroyTargetRecord(finalFrameTarget)
        finalFrameTarget = null
        for (const record of layerTargets.values()) {
          vexartCompositeTargetDestroy(_vexartCtx, record.handle)
        }
        layerTargets.clear()
        cacheStats.layerTargetCount = 0
        cacheStats.layerTargetBytes = 0
        const { symbols } = openVexartLibrary()
        symbols.vexart_context_destroy(_vexartCtx)
        _vexartCtx = null
      }
    },
    /**
     * TEST-ONLY: Read back the final frame target as RGBA pixels.
     * This is NOT part of the production render path — used exclusively by
     * render-to-buffer.ts for visual golden tests.
     */
    readbackForTest(width: number, height: number): Uint8Array | null {
      if (!_vexartCtx) return null
      const target = finalFrameTarget?.handle ?? standaloneTarget?.handle
      if (!target) return null
      return vexartCompositeReadbackRgba(_vexartCtx, target, width * height * 4)
    },
  } as GpuRendererBackend
}
