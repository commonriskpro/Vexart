/**
 * gpu-target-manager.ts — Target allocation, pooling, and sprite LRU caching.
 * Extracted from gpu-renderer-backend.ts.
 */

import { rasterizeCanvas, rasterizeCanvasCommands } from "./canvas-rasterizer"
import {
  type TargetRecord,
  type CanvasSpriteRecord,
  type TransformSpriteRecord,
  type BackdropSourceRecord,
  type BackdropSpriteRecord,
  type IntBounds,
  boundsKey,
  clampBackdropBounds,
  hashMatrix,
} from "./gpu-helpers"
import {
  type VexartTargetHandle,
  type VexartImageHandle,
  vexartCompositeTargetCreate,
  vexartCompositeTargetDestroy,
  vexartCompositeTargetBeginLayer,
  vexartCompositeTargetEndLayer,
  vexartCompositeRenderImageLayer,
  copyGpuTargetRegionToImage,
  vexartCompositeImageFilterBackdrop,
  vexartCompositeImageMaskRoundedRect,
  vexartUploadImage,
  vexartRemoveImage,
} from "./gpu-composite-ops"
import type { EffectRenderOp, BackdropRenderMetadata, RenderGraphOp } from "./render-graph"
import type { RendererBackendPaintContext } from "./renderer-backend"

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

let globalStatsProvider: (() => GpuRendererBackendCacheStats) | null = null

export function getGpuRendererBackendCacheStats(): GpuRendererBackendCacheStats {
  return globalStatsProvider?.() ?? {
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

function touchMapEntry<K, V>(cache: Map<K, V>, key: K, value: V) {
  cache.delete(key)
  cache.set(key, value)
}

export type RenderOpToImageFn = (
  op: RenderGraphOp,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  ops?: RenderGraphOp[],
) => VexartImageHandle | null

export interface GpuTargetManagerOptions {
  getVexartCtx: () => bigint
  getRawVexartCtx: () => bigint | null
  onTargetDestroyed?: (handle: bigint) => void
}

export interface GpuTargetManager {
  readonly instanceImageHandles: Set<bigint>
  readonly standaloneTarget: TargetRecord | null
  readonly finalFrameTarget: TargetRecord | null
  readonly layerTargets: Map<string, TargetRecord>
  readonly activeLayerKeys: Set<string>
  getStandaloneTarget(width: number, height: number): bigint | null
  getFinalFrameTarget(width: number, height: number): bigint | null
  getLayerTarget(key: string, width: number, height: number): bigint | null
  pruneLayerTargets(): void
  destroyTargetRecord(record: TargetRecord | null): void
  getImage(rgba: Uint8Array, width: number, height: number): bigint | null
  getCanvasSprite(op: Extract<RenderGraphOp, { kind: "canvas" }>): bigint | null
  getTransformSprite(op: Extract<RenderGraphOp, { kind: "effect" }>): bigint | null
  getBackdropSource(
    op: EffectRenderOp,
    metadata: BackdropRenderMetadata,
    ctx: RendererBackendPaintContext,
    targetHandle: bigint,
    frameGeneration: number,
    targetMutationVersion: number,
  ): BackdropSourceRecord | null
  getBackdropSprite(
    op: EffectRenderOp,
    ctx: RendererBackendPaintContext,
    targetHandle: bigint,
    frameGeneration: number,
    targetMutationVersion: number,
  ): BackdropSpriteRecord | null
  cropImage(
    source: VexartImageHandle,
    sourceWidth: number,
    sourceHeight: number,
    cropX: number,
    cropY: number,
    cropWidth: number,
    cropHeight: number,
  ): bigint | null
  trimTransformSpriteCache(): void
  trimCanvasSpriteCache(): void
  clearSpriteCaches(): void
  pruneBackdropCaches(activeFrameId: number): void
  getCacheStats(): GpuRendererBackendCacheStats
  setRenderOpToImage(fn: RenderOpToImageFn): void
  destroy(): void
}

export function createGpuTargetManager(options: GpuTargetManagerOptions): GpuTargetManager {
  const { getVexartCtx, getRawVexartCtx, onTargetDestroyed } = options

  const instanceImageHandles = new Set<bigint>()
  let standaloneTarget: TargetRecord | null = null
  let finalFrameTarget: TargetRecord | null = null
  const layerTargets = new Map<string, TargetRecord>()
  const activeLayerKeys = new Set<string>()

  const canvasSpriteCache = new Map<string, CanvasSpriteRecord>()
  const transformSpriteCache = new Map<string, TransformSpriteRecord>()
  const backdropSourceCache = new Map<string, BackdropSourceRecord>()
  const backdropSpriteCache = new Map<string, BackdropSpriteRecord>()
  const canvasFunctionIds = new WeakMap<Function, number>()
  let nextCanvasFunctionId = 1
  let renderOpToImage: RenderOpToImageFn | null = null

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

  globalStatsProvider = () => cacheStats

  const clearSpriteCaches = () => {
    const vctx = getRawVexartCtx()
    if (vctx === null) return
    for (const record of transformSpriteCache.values()) {
      instanceImageHandles.delete(record.handle)
      vexartRemoveImage(vctx, record.handle)
    }
    for (const record of canvasSpriteCache.values()) {
      instanceImageHandles.delete(record.handle)
      vexartRemoveImage(vctx, record.handle)
    }
    canvasSpriteSlot.clear()
    transformSpriteSlot.clear()
    for (const record of backdropSourceCache.values()) {
      instanceImageHandles.delete(record.handle)
      vexartRemoveImage(vctx, record.handle)
    }
    backdropSourceSlot.clear()
    for (const record of backdropSpriteCache.values()) {
      instanceImageHandles.delete(record.handle)
      vexartRemoveImage(vctx, record.handle)
    }
    backdropSpriteSlot.clear()
  }

  const pruneBackdropCaches = (activeFrameId: number) => {
    const vctx = getRawVexartCtx()
    if (vctx === null) return
    for (const [key, record] of backdropSourceCache) {
      if (record.frameId === activeFrameId) continue
      instanceImageHandles.delete(record.handle)
      vexartRemoveImage(vctx, record.handle)
      backdropSourceSlot.delete(key)
    }
    for (const [key, record] of backdropSpriteCache) {
      if (record.frameId === activeFrameId) continue
      instanceImageHandles.delete(record.handle)
      vexartRemoveImage(vctx, record.handle)
      backdropSpriteSlot.delete(key)
    }
  }

  const destroyTargetRecord = (record: TargetRecord | null) => {
    if (!record) return
    onTargetDestroyed?.(record.handle)
    vexartCompositeTargetDestroy(getVexartCtx(), record.handle)
  }

  const getStandaloneTarget = (width: number, height: number) => {
    const vctx = getVexartCtx()
    if (standaloneTarget && standaloneTarget.width === width && standaloneTarget.height === height) {
      return standaloneTarget.handle
    }
    const handle = vexartCompositeTargetCreate(vctx, width, height)
    if (!handle) return null
    destroyTargetRecord(standaloneTarget)
    clearSpriteCaches()
    standaloneTarget = { key: "standalone", width, height, handle }
    return handle
  }

  const getFinalFrameTarget = (width: number, height: number) => {
    const vctx = getVexartCtx()
    if (finalFrameTarget && finalFrameTarget.width === width && finalFrameTarget.height === height) {
      return finalFrameTarget.handle
    }
    const handle = vexartCompositeTargetCreate(vctx, width, height)
    if (!handle) return null
    destroyTargetRecord(finalFrameTarget)
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
    const handle = vexartCompositeTargetCreate(vctx, width, height)
    if (!handle) return null
    if (existing) vexartCompositeTargetDestroy(vctx, existing.handle)
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
      if (record) {
        instanceImageHandles.delete(record.handle)
        vexartRemoveImage(vctx, record.handle)
      }
      transformSpriteSlot.delete(first)
    }
  }

  const trimCanvasSpriteCache = () => {
    const vctx = getVexartCtx()
    while (canvasSpriteCache.size > MAX_GPU_CANVAS_SPRITES) {
      const first = canvasSpriteCache.keys().next().value
      if (!first) break
      const record = canvasSpriteCache.get(first)
      if (record) {
        instanceImageHandles.delete(record.handle)
        vexartRemoveImage(vctx, record.handle)
      }
      canvasSpriteSlot.delete(first)
    }
  }

  const getImage = (rgba: Uint8Array, width: number, height: number): bigint | null => {
    const vctxForImage = getVexartCtx()
    const handle = vexartUploadImage(vctxForImage, rgba, width, height)
    if (handle === 0n) return null
    instanceImageHandles.add(handle)
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
    if (cached) {
      instanceImageHandles.delete(cached.handle)
      vexartRemoveImage(vctx, cached.handle)
    }
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
    const handle = renderOpToImage
      ? renderOpToImage(spriteOp, width, height, Math.round(op.x), Math.round(op.y))
      : null
    if (!handle) return null
    transformSpriteSlot.set(key, { key, handle, width, height })
    trimTransformSpriteCache()
    return handle
  }

  const getBackdropSource = (
    op: EffectRenderOp,
    metadata: BackdropRenderMetadata,
    ctx: RendererBackendPaintContext,
    targetHandle: bigint,
    frameGeneration: number,
    targetMutationVersion: number,
  ) => {
    const localBounds = {
      x: metadata.outputBounds.x - ctx.offsetX,
      y: metadata.outputBounds.y - ctx.offsetY,
      width: metadata.outputBounds.width,
      height: metadata.outputBounds.height,
    }
    const workBounds = clampBackdropBounds(localBounds, ctx.target.width, ctx.target.height)
    if (!workBounds) return null
    const sourceKey = `${metadata.backdropSourceKey}:${boundsKey(workBounds)}:v${targetMutationVersion}`
    const cached = backdropSourceCache.get(sourceKey)
    if (cached && cached.frameId === frameGeneration) {
      return cached
    }
    const width = workBounds.right - workBounds.left
    const height = workBounds.bottom - workBounds.top
    if (width <= 0 || height <= 0) return null
    const copied = copyGpuTargetRegionToImage(getVexartCtx(), targetHandle, {
      x: workBounds.left,
      y: workBounds.top,
      width,
      height,
    })
    if (copied.handle) instanceImageHandles.add(copied.handle)
    const record: BackdropSourceRecord = {
      key: sourceKey,
      frameId: frameGeneration,
      bounds: workBounds,
      handle: copied.handle,
    }
    backdropSourceSlot.set(sourceKey, record)
    return record
  }

  const getBackdropSprite = (
    op: EffectRenderOp,
    ctx: RendererBackendPaintContext,
    targetHandle: bigint,
    frameGeneration: number,
    targetMutationVersion: number,
  ) => {
    if (!op.backdrop) return null
    const source = getBackdropSource(op, op.backdrop, ctx, targetHandle, frameGeneration, targetMutationVersion)
    if (!source) return null
    if (!source.handle || source.handle === 0n) return null
    const spriteKey = `${source.key}:${op.effectStateId}:${op.clipStateId}:${op.transformStateId}`
    const cached = backdropSpriteCache.get(spriteKey)
    if (cached && cached.frameId === frameGeneration) {
      return cached
    }
    const vctx = getVexartCtx()
    let handle = vexartCompositeImageFilterBackdrop(vctx, source.handle, op.backdrop.filterParams)
    if (!handle) return null
    instanceImageHandles.add(handle)
    if (op.rect.radius > 0) {
      const rectBuf = new Float32Array(6)
      rectBuf[0] = op.rect.radius
      rectBuf[1] = 0; rectBuf[2] = 0; rectBuf[3] = 0; rectBuf[4] = 0
      rectBuf[5] = 0
      const masked = vexartCompositeImageMaskRoundedRect(vctx, handle, rectBuf)
      instanceImageHandles.delete(handle)
      vexartRemoveImage(vctx, handle)
      handle = masked
      if (handle) instanceImageHandles.add(handle)
    }
    const record: BackdropSpriteRecord = {
      key: spriteKey,
      frameId: frameGeneration,
      bounds: source.bounds,
      handle,
      width: source.bounds.right - source.bounds.left,
      height: source.bounds.bottom - source.bounds.top,
    }
    if (cached) {
      instanceImageHandles.delete(cached.handle)
      vexartRemoveImage(vctx, cached.handle)
    }
    backdropSpriteSlot.set(spriteKey, record)
    return record
  }

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
      if (copied.handle) instanceImageHandles.add(copied.handle)
      return copied.handle || null
    } finally {
      vexartCompositeTargetDestroy(vctx, target)
    }
  }

  return {
    get instanceImageHandles() { return instanceImageHandles },
    get standaloneTarget() { return standaloneTarget },
    get finalFrameTarget() { return finalFrameTarget },
    get layerTargets() { return layerTargets },
    get activeLayerKeys() { return activeLayerKeys },
    getStandaloneTarget,
    getFinalFrameTarget,
    getLayerTarget,
    pruneLayerTargets,
    destroyTargetRecord,
    getImage,
    getCanvasSprite,
    getTransformSprite,
    getBackdropSource,
    getBackdropSprite,
    cropImage,
    trimTransformSpriteCache,
    trimCanvasSpriteCache,
    clearSpriteCaches,
    pruneBackdropCaches,
    getCacheStats() { return cacheStats },
    setRenderOpToImage(fn: RenderOpToImageFn) {
      renderOpToImage = fn
    },
    destroy() {
      const vctx = getRawVexartCtx()
      if (vctx !== null) {
        clearSpriteCaches()
        for (const handle of instanceImageHandles) {
          vexartRemoveImage(vctx, handle)
        }
        instanceImageHandles.clear()
        destroyTargetRecord(standaloneTarget)
        standaloneTarget = null
        destroyTargetRecord(finalFrameTarget)
        finalFrameTarget = null
        for (const record of layerTargets.values()) {
          vexartCompositeTargetDestroy(vctx, record.handle)
        }
        layerTargets.clear()
        cacheStats.layerTargetCount = 0
        cacheStats.layerTargetBytes = 0
      }
    },
  }
}
