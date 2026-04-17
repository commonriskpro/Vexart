import { appendFileSync } from "node:fs"
import { CanvasContext } from "./canvas"
import { getAtlas } from "./font-atlas"
import { transformBounds, transformPoint } from "./matrix"
import { batchMixedSceneOps, collectSupportedMixedScene } from "./wgpu-mixed-scene"
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
  renderWgpuCanvasTargetBeziersLayer,
  renderWgpuCanvasTargetCirclesLayer,
  renderWgpuCanvasTargetGlowsLayer,
  renderWgpuCanvasTargetImagesLayer,
  renderWgpuCanvasTargetLinearGradientsLayer,
  renderWgpuCanvasTargetPolygonsLayer,
  renderWgpuCanvasTargetRadialGradientsLayer,
  renderWgpuCanvasTargetRectsLayer,
  renderWgpuCanvasTargetShapeRectCornersLayer,
  renderWgpuCanvasTargetShapeRectsLayer,
  renderWgpuCanvasTargetGlyphsLayer,
  renderWgpuCanvasTargetTransformedImagesLayer,
  supportsWgpuCanvasGlyphLayer,
  type WgpuCanvasContextHandle,
  type WgpuCanvasGlyphInstance,
  type WgpuCanvasGlow,
  type WgpuCanvasImageHandle,
  type WgpuCanvasRectFill,
  type WgpuCanvasShapeRectCorners,
  type WgpuCanvasShapeRect,
  type WgpuCanvasTargetHandle,
} from "./wgpu-canvas-bridge"
import {
  copyGpuTargetRegionToImage,
  createEmptyGpuImage,
} from "./gpu-raster-staging"

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
}

type CanvasSpriteRecord = {
  key: string
  handle: WgpuCanvasImageHandle
  width: number
  height: number
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

  const recordCurrentFrameLayer = (layer: RenderedLayerRecord) => {
    const existingIndex = currentFrameLayers.findIndex((entry) => entry.key === layer.key)
    if (existingIndex >= 0) {
      currentFrameLayers[existingIndex] = layer
      return
    }
    currentFrameLayers.push(layer)
  }

  const applyStrategyHysteresis = (preferred: GpuLayerStrategyMode, frame: RendererBackendFrameContext): GpuLayerStrategyMode => {
    if (!lastStrategy) return preferred
    if (preferred === lastStrategy) return preferred
    const dirtyRatio = frame.totalPixelArea > 0 ? frame.dirtyPixelArea / frame.totalPixelArea : 0
    const outputRatio = frame.estimatedFinalBytes > 0 ? frame.estimatedLayeredBytes / frame.estimatedFinalBytes : 0
    if (preferred === "layered-raw") {
      if (frame.dirtyLayerCount === 0) return preferred
      if (outputRatio < 0.42) return preferred
      if (dirtyRatio < 0.12 && frame.overlapRatio < 0.03) return preferred
      return lastStrategy
    }
    if (frame.fullRepaint) return preferred
    if (dirtyRatio > 0.42) return preferred
    if (frame.overlapRatio > 0.12) return preferred
    if (outputRatio > 0.82) return preferred
    return lastStrategy
  }

  const clearSpriteCaches = () => {
    if (!context) return
    for (const record of glyphAtlases.values()) {
      destroyWgpuCanvasImage(context, record.handle)
    }
    glyphAtlases.clear()
    for (const record of canvasSpriteCache.values()) {
      destroyWgpuCanvasImage(context, record.handle)
    }
    canvasSpriteCache.clear()
    for (const record of transformSpriteCache.values()) {
      destroyWgpuCanvasImage(context, record.handle)
    }
    transformSpriteCache.clear()
    for (const record of backdropSourceCache.values()) {
      destroyWgpuCanvasImage(context, record.handle)
    }
    backdropSourceCache.clear()
    for (const record of backdropSpriteCache.values()) {
      destroyWgpuCanvasImage(context, record.handle)
    }
    backdropSpriteCache.clear()
  }

  const pruneBackdropCaches = (activeFrameId: number) => {
    if (!context) return
    for (const [key, record] of backdropSourceCache) {
      if (record.frameId === activeFrameId) continue
      destroyWgpuCanvasImage(context, record.handle)
      backdropSourceCache.delete(key)
    }
    for (const [key, record] of backdropSpriteCache) {
      if (record.frameId === activeFrameId) continue
      destroyWgpuCanvasImage(context, record.handle)
      backdropSpriteCache.delete(key)
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
    layerTargets.set(key, { key, width, height, handle })
    return handle
  }

  const pruneLayerTargets = () => {
    if (!context) return
    for (const [key, record] of layerTargets) {
      if (activeLayerKeys.has(key)) continue
      destroyWgpuCanvasTarget(context, record.handle)
      layerTargets.delete(key)
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
      canvasSpriteCache.delete(first)
    }
  }

  const trimTransformSpriteCache = () => {
    if (!context) return
    while (transformSpriteCache.size > MAX_GPU_TRANSFORM_SPRITES) {
      const first = transformSpriteCache.keys().next().value
      if (!first) break
      const record = transformSpriteCache.get(first)
      if (record) destroyWgpuCanvasImage(context, record.handle)
      transformSpriteCache.delete(first)
    }
  }

  gpuRendererBackendStatsProvider = () => ({
    layerTargetCount: layerTargets.size,
    layerTargetBytes: Array.from(layerTargets.values()).reduce((sum, record) => sum + record.width * record.height * 4, 0),
    textImageCount: 0,
    textImageBytes: 0,
    glyphAtlasCount: glyphAtlases.size,
    glyphAtlasBytes: Array.from(glyphAtlases.values()).reduce((sum, record) => sum + record.cellWidth * record.columns * record.cellHeight * record.rows * 4, 0),
    canvasSpriteCount: canvasSpriteCache.size,
    canvasSpriteBytes: Array.from(canvasSpriteCache.values()).reduce((sum, record) => sum + record.width * record.height * 4, 0),
    transformSpriteCount: transformSpriteCache.size,
    transformSpriteBytes: Array.from(transformSpriteCache.values()).reduce((sum, record) => sum + record.width * record.height * 4, 0),
    fallbackSpriteCount: 0,
    fallbackSpriteBytes: 0,
    backdropSourceCount: backdropSourceCache.size,
    backdropSourceBytes: Array.from(backdropSourceCache.values()).reduce((sum, record) => sum + (record.bounds.right - record.bounds.left) * (record.bounds.bottom - record.bounds.top) * 4, 0),
    backdropSpriteCount: backdropSpriteCache.size,
    backdropSpriteBytes: Array.from(backdropSpriteCache.values()).reduce((sum, record) => sum + record.width * record.height * 4, 0),
  })

  const getImage = (rgba: Uint8Array, width: number, height: number) => {
    if (!context) return null
    const cached = imageCache.get(rgba)
    if (cached) return cached.handle
    const handle = createWgpuCanvasImage(context, { width, height }, rgba)
    imageCache.set(rgba, { handle, width, height })
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
    const columns = 16
    const rows = Math.ceil(95 / columns)
    const width = atlas.cellWidth * columns
    const height = atlas.cellHeight * rows
    const rgba = new Uint8Array(width * height * 4)
    for (let glyphIndex = 0; glyphIndex < 95; glyphIndex++) {
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
    }
    if (glyphAtlases.size >= MAX_GPU_GLYPH_ATLASES) {
      const first = glyphAtlases.keys().next().value
      if (first) {
        const stale = glyphAtlases.get(first)
        if (stale) destroyWgpuCanvasImage(context, stale.handle)
        glyphAtlases.delete(first)
      }
    }
    glyphAtlases.set(key, record)
    return record
  }

  const getCanvasFunctionId = (fn: Function) => {
    const existing = canvasFunctionIds.get(fn)
    if (existing) return existing
    const id = nextCanvasFunctionId++
    canvasFunctionIds.set(fn, id)
    return id
  }

  const clearCanvasSpriteCache = () => {
    if (!context) return
    for (const record of canvasSpriteCache.values()) {
      destroyWgpuCanvasImage(context, record.handle)
    }
    canvasSpriteCache.clear()
  }

  const getCanvasSprite = (op: Extract<RenderGraphOp, { kind: "canvas" }>) => {
    if (!context) return null
    const viewport = op.canvas.viewport
    const fnId = getCanvasFunctionId(op.canvas.onDraw)
    const width = Math.max(1, Math.round(op.command.width))
    const height = Math.max(1, Math.round(op.command.height))
    const key = JSON.stringify({
      fnId,
      width,
      height,
      viewportX: viewport?.x ?? 0,
      viewportY: viewport?.y ?? 0,
      viewportZoom: viewport?.zoom ?? 1,
    })
    const cached = canvasSpriteCache.get(key)
    if (cached && cached.width === width && cached.height === height) {
      touchMapEntry(canvasSpriteCache, key, cached)
      return cached.handle
    }
    if (cached) {
      destroyWgpuCanvasImage(context, cached.handle)
    }
    const canvasCtx = new CanvasContext(viewport)
    op.canvas.onDraw(canvasCtx)
    if (canvasCtx._commands.length === 0) {
      const empty = createEmptyGpuImage(context, width, height)
      const handle = empty.handle
      canvasSpriteCache.set(key, { key, handle, width, height })
      trimCanvasSpriteCache()
      return handle
    }
    const mixedInfo = collectSupportedMixedScene(canvasCtx, width, height)
    if (mixedInfo && mixedInfo.ops.length > 0) {
      const target = createWgpuCanvasTarget(context, { width, height })
      const batches = batchMixedSceneOps(mixedInfo.ops)
      let first = true
      for (const batch of batches as any[]) {
        if (batch.kind === "rect") {
          renderWgpuCanvasTargetRectsLayer(context, target, batch.rects, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "bezier") {
          renderWgpuCanvasTargetBeziersLayer(context, target, batch.beziers, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "shapeRect") {
          renderWgpuCanvasTargetShapeRectsLayer(context, target, batch.rects, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "glow") {
          renderWgpuCanvasTargetGlowsLayer(context, target, batch.glows, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "circle") {
          renderWgpuCanvasTargetCirclesLayer(context, target, batch.circles, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "polygon") {
          renderWgpuCanvasTargetPolygonsLayer(context, target, batch.polygons, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "linearGradient") {
          renderWgpuCanvasTargetLinearGradientsLayer(context, target, batch.gradients, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "radialGradient") {
          renderWgpuCanvasTargetRadialGradientsLayer(context, target, batch.gradients, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "text") {
          const atlas = getGlyphAtlas(0)
          if (!atlas) {
            destroyWgpuCanvasTarget(context, target)
            failGpuOnly("canvas text requires GPU glyph atlas support")
          }
          const glyphs: WgpuCanvasGlyphInstance[] = []
          let canUseGlyphs = true
          for (const instance of batch.instances) {
            let cursorX = instance.x
            for (const glyph of batch.text) {
              const code = glyph.codePointAt(0)
              if (code === undefined || code < 32 || code > 126) {
                canUseGlyphs = false
                break
              }
              const glyphIndex = code - 32
              const advancePx = atlas.glyphWidths[glyphIndex] || atlas.cellWidth
              if (glyph !== " ") {
                const col = glyphIndex % atlas.columns
                const row = Math.floor(glyphIndex / atlas.columns)
                glyphs.push({
                  x: cursorX,
                  y: instance.y,
                  w: (atlas.cellWidth / width) * 2,
                  h: -((atlas.cellHeight / height) * 2),
                  u: (col * atlas.cellWidth) / (atlas.cellWidth * atlas.columns),
                  v: (row * atlas.cellHeight) / (atlas.cellHeight * atlas.rows),
                  uw: atlas.cellWidth / (atlas.cellWidth * atlas.columns),
                  vh: atlas.cellHeight / (atlas.cellHeight * atlas.rows),
                  r: ((batch.color >>> 24) & 0xff) / 255,
                  g: ((batch.color >>> 16) & 0xff) / 255,
                  b: ((batch.color >>> 8) & 0xff) / 255,
                  a: (batch.color & 0xff) / 255,
                  opacity: instance.opacity,
                })
              }
              cursorX += (advancePx / width) * 2
            }
            if (!canUseGlyphs) break
          }
          if (!canUseGlyphs) {
            destroyWgpuCanvasTarget(context, target)
            failGpuOnly("canvas text requires unsupported glyphs outside the GPU atlas path")
          }
          if (glyphs.length > 0) renderWgpuCanvasTargetGlyphsLayer(context, target, atlas.handle, glyphs, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "image") {
          const imageHandle = getImage(batch.image, batch.imageW, batch.imageH)
          if (!imageHandle) {
            destroyWgpuCanvasTarget(context, target)
            return null
          }
          renderWgpuCanvasTargetImagesLayer(context, target, imageHandle, batch.instances, first ? 0 : 1, 0x00000000)
        }
        first = false
      }
      try {
        const copied = copyGpuTargetRegionToImage(context, target, { x: 0, y: 0, width, height })
        const handle = copied.handle
        canvasSpriteCache.set(key, { key, handle, width, height })
        trimCanvasSpriteCache()
        return handle
      } finally {
        destroyWgpuCanvasTarget(context, target)
      }
    }
    failGpuOnly("canvas sprite requires unsupported commands outside the GPU mixed-scene path")
  }

  const getTransformSprite = (op: Extract<RenderGraphOp, { kind: "effect" }>) => {
    if (!context) return null
    const width = Math.max(1, Math.round(op.command.width))
    const height = Math.max(1, Math.round(op.command.height))
    const key = JSON.stringify({
      kind: op.kind,
      command: op.command,
      width,
      height,
      transform: Array.from(op.effect.transform ?? []),
      opacity: op.effect.opacity ?? 1,
    })
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
    transformSpriteCache.set(key, { key, handle, width, height })
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
    const rects: WgpuCanvasRectFill[] = []
    const shapeRects: WgpuCanvasShapeRect[] = []
    const shapeRectCorners: WgpuCanvasShapeRectCorners[] = []
    const linearGradients: Parameters<typeof renderWgpuCanvasTargetLinearGradientsLayer>[2] = []
    const radialGradients: Parameters<typeof renderWgpuCanvasTargetRadialGradientsLayer>[2] = []
    const glows: WgpuCanvasGlow[] = []
    const imageGroups = new Map<bigint, { handle: WgpuCanvasImageHandle; instances: { x: number; y: number; w: number; h: number; opacity: number }[] }>()
    const glyphGroups = new Map<bigint, { handle: WgpuCanvasImageHandle; instances: WgpuCanvasGlyphInstance[] }>()
    const transformedImageGroups = new Map<bigint, { handle: WgpuCanvasImageHandle; instances: { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; opacity: number }[] }>()
    let targetMutationVersion = 0

    const flushRects = () => {
      if (rects.length === 0) return
      renderWgpuCanvasTargetRectsLayer(context, targetHandle, rects, first ? 0 : 1, 0x00000000)
      rects.length = 0
      first = false
      targetMutationVersion += 1
    }
    const flushShapeRects = () => {
      if (shapeRects.length === 0) return
      renderWgpuCanvasTargetShapeRectsLayer(context, targetHandle, shapeRects, first ? 0 : 1, 0x00000000)
      shapeRects.length = 0
      first = false
      targetMutationVersion += 1
    }
    const flushShapeRectCorners = () => {
      if (shapeRectCorners.length === 0) return
      renderWgpuCanvasTargetShapeRectCornersLayer(context, targetHandle, shapeRectCorners, first ? 0 : 1, 0x00000000)
      shapeRectCorners.length = 0
      first = false
      targetMutationVersion += 1
    }
    const flushLinearGradients = () => {
      if (linearGradients.length === 0) return
      renderWgpuCanvasTargetLinearGradientsLayer(context, targetHandle, linearGradients, first ? 0 : 1, 0x00000000)
      linearGradients.length = 0
      first = false
      targetMutationVersion += 1
    }
    const flushRadialGradients = () => {
      if (radialGradients.length === 0) return
      renderWgpuCanvasTargetRadialGradientsLayer(context, targetHandle, radialGradients, first ? 0 : 1, 0x00000000)
      radialGradients.length = 0
      first = false
      targetMutationVersion += 1
    }
    const flushGlows = () => {
      if (glows.length === 0) return
      renderWgpuCanvasTargetGlowsLayer(context, targetHandle, glows, first ? 0 : 1, 0x00000000)
      glows.length = 0
      first = false
      targetMutationVersion += 1
    }
    const flushImages = () => {
      if (imageGroups.size === 0) return
      for (const group of imageGroups.values()) {
        renderWgpuCanvasTargetImagesLayer(context, targetHandle, group.handle, group.instances, first ? 0 : 1, 0x00000000)
        first = false
        targetMutationVersion += 1
      }
      imageGroups.clear()
    }
    const flushGlyphs = () => {
      if (glyphGroups.size === 0) return
      for (const group of glyphGroups.values()) {
        renderWgpuCanvasTargetGlyphsLayer(context, targetHandle, group.handle, group.instances, first ? 0 : 1, 0x00000000)
        first = false
        targetMutationVersion += 1
      }
      glyphGroups.clear()
    }
    const flushTransformedImages = () => {
      if (transformedImageGroups.size === 0) return
      for (const group of transformedImageGroups.values()) {
        renderWgpuCanvasTargetTransformedImagesLayer(context, targetHandle, group.handle, group.instances, first ? 0 : 1, 0x00000000)
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
    const transientFullFrameImages: WgpuCanvasImageHandle[] = []
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
      backdropSourceCache.set(sourceKey, record)
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
      backdropSpriteCache.set(spriteKey, record)
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
        const group = (transformedImageGroups.get(sprite.handle) ?? { handle: sprite.handle, instances: [] as { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; opacity: number }[] })
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
            const group = (transformedImageGroups.get(handle) ?? { handle, instances: [] as { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; opacity: number }[] })
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
              const tempGlyphs: WgpuCanvasGlyphInstance[] = []
              const dirtyRects: { left: number; top: number; right: number; bottom: number }[] = []
              for (let li = 0; li < layout.lines.length; li++) {
                const line = layout.lines[li]
                let cursorX = textX
                const cursorY = textY + li * op.inputs.lineHeight
                for (const glyph of line.text) {
                  const code = glyph.codePointAt(0)
                  if (code === undefined) continue
                  if (code < 32 || code > 126) {
                    usedGlyphPath = false
                    break
                  }
                  const glyphIndex = code - 32
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
    const readback = readbackWgpuCanvasTargetRGBA(context, targetHandle, ctx.targetWidth * ctx.targetHeight * 4)
    for (const handle of transientFullFrameImages) destroyWgpuCanvasImage(context, handle)
    return {
      ok: true as const,
      rawLayer: {
        data: readback.data,
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
      clearCanvasSpriteCache()
      if (!gpuAvailable || !context || !ctx.useLayerCompositing) {
        lastStrategy = null
        lastStrategyTelemetry = { preferred: null, chosen: null, estimatedLayeredBytes: 0, estimatedFinalBytes: 0 }
        return { strategy: null }
      }
      if (FORCED_LAYER_STRATEGY) {
        lastStrategy = FORCED_LAYER_STRATEGY
        lastStrategyTelemetry = {
          preferred: FORCED_LAYER_STRATEGY,
          chosen: FORCED_LAYER_STRATEGY,
          estimatedLayeredBytes: ctx.estimatedLayeredBytes,
          estimatedFinalBytes: ctx.estimatedFinalBytes,
        }
        return { strategy: lastStrategy }
      }
      if (ctx.hasSubtreeTransforms) {
        lastStrategy = "final-frame-raw"
        lastStrategyTelemetry = {
          preferred: "final-frame-raw",
          chosen: "final-frame-raw",
          estimatedLayeredBytes: ctx.estimatedLayeredBytes,
          estimatedFinalBytes: ctx.estimatedFinalBytes,
        }
        return { strategy: lastStrategy }
      }
      if (ctx.hasActiveInteraction) {
        lastStrategy = "layered-raw"
        lastStrategyTelemetry = {
          preferred: "layered-raw",
          chosen: "layered-raw",
          estimatedLayeredBytes: ctx.estimatedLayeredBytes,
          estimatedFinalBytes: ctx.estimatedFinalBytes,
        }
        return { strategy: lastStrategy }
      }
      const preferred = chooseGpuLayerStrategy({
        dirtyLayerCount: ctx.dirtyLayerCount,
        dirtyPixelArea: ctx.dirtyPixelArea,
        totalPixelArea: ctx.totalPixelArea,
        overlapPixelArea: ctx.overlapPixelArea,
        overlapRatio: ctx.overlapRatio,
        fullRepaint: ctx.fullRepaint,
        transmissionMode: ctx.transmissionMode,
        estimatedLayeredBytes: ctx.estimatedLayeredBytes,
        estimatedFinalBytes: ctx.estimatedFinalBytes,
      })
      lastStrategy = applyStrategyHysteresis(preferred, ctx)
      lastStrategyTelemetry = {
        preferred,
        chosen: lastStrategy,
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
