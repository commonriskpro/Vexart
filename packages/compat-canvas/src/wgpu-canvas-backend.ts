/**
 * Compat/lab WGPU painter backend.
 *
 * Implements CanvasPainterBackend for imperative canvas APIs (SceneCanvas, etc.).
 * This is NOT the canonical renderer architecture — it is a compat painter
 * that uses GPU acceleration where possible and falls back to CPU raster.
 *
 * The official GPU renderer path lives in core/src/gpu-renderer-backend.ts
 * and does NOT use this file.
 */

import type { RasterSurface } from "../../core/src/render-surface"
import { appendFileSync } from "node:fs"
import type { CanvasPainterBackend } from "../../core/src/canvas-backend"
import type { CanvasContext } from "../../core/src/canvas"
import { paintCanvasCommandsCPU } from "./canvas-raster-painter"
import { getAtlas } from "../../core/src/font-atlas"
import { getFont } from "../../core/src/text-layout"
import { readbackTargetToSurface } from "../../core/src/gpu-raster-staging"
import { createGpuTextImage } from "./gpu-text-compat"
import {
  createWgpuCanvasImage,
  createWgpuCanvasContext,
  createWgpuCanvasTarget,
  destroyWgpuCanvasImage,
  destroyWgpuCanvasContext,
  destroyWgpuCanvasTarget,
  probeWgpuCanvasBridge,
  renderWgpuCanvasTargetCirclesLayer,
  renderWgpuCanvasTargetBeziersLayer,
  renderWgpuCanvasTargetImage,
  renderWgpuCanvasTargetImagesLayer,
  renderWgpuCanvasTargetGlyphsLayer,
  renderWgpuCanvasTargetGlowsLayer,
  renderWgpuCanvasTargetLinearGradientsLayer,
  renderWgpuCanvasTargetNebulasLayer,
  renderWgpuCanvasTargetPolygonsLayer,
  renderWgpuCanvasTargetRadialGradientsLayer,
  renderWgpuCanvasTargetRects,
  renderWgpuCanvasTargetRectsLayer,
  renderWgpuCanvasTargetShapeRectCornersLayer,
  renderWgpuCanvasTargetShapeRectsLayer,
  renderWgpuCanvasTargetStarfieldsLayer,
  supportsWgpuCanvasGlyphLayer,
  type WgpuCanvasGlyphInstance,
  type WgpuCanvasContextHandle,
  type WgpuCanvasImageHandle,
} from "../../core/src/wgpu-canvas-bridge"
import {
  batchMixedSceneOps,
  collectSupportedMixedScene,
  collectSupportedRects,
  collectSupportedSingleImage,
} from "../../core/src/wgpu-mixed-scene"

type WgpuTargetRecord = {
  width: number
  height: number
  handle: ReturnType<typeof createWgpuCanvasTarget>
}

type WgpuImageRecord = {
  width: number
  height: number
  handle: WgpuCanvasImageHandle
}

type WgpuTextImageRecord = WgpuImageRecord & {
  key: string
}

type WgpuGlyphAtlasRecord = {
  handle: WgpuCanvasImageHandle
  cellWidth: number
  cellHeight: number
  columns: number
  rows: number
  glyphWidths: Float32Array
  indexFor: (cp: number) => number
}

export type WgpuCanvasPainterCacheStats = {
  targetCount: number
  targetBytes: number
  textImageCount: number
  textImageBytes: number
}

const MAX_WGPU_CANVAS_TEXT_IMAGES = 128
const WGPU_BACKEND_PROFILE = process.env.TGE_DEBUG_WGPU_BACKEND === "1"
const WGPU_BACKEND_PROFILE_LOG = "/tmp/tge-wgpu-backend.log"
const WGPU_REGION_READBACK_THRESHOLD = 0.75

let wgpuCanvasPainterStatsProvider: (() => WgpuCanvasPainterCacheStats) | null = null

function logWgpuBackend(msg: string) {
  if (!WGPU_BACKEND_PROFILE) return
  appendFileSync(WGPU_BACKEND_PROFILE_LOG, msg + "\n")
}

function touchCanvasPainterTextEntry(cache: Map<string, WgpuTextImageRecord>, key: string, value: WgpuTextImageRecord) {
  cache.delete(key)
  cache.set(key, value)
}

export function getWgpuCanvasPainterCacheStats(): WgpuCanvasPainterCacheStats {
  return wgpuCanvasPainterStatsProvider?.() ?? {
    targetCount: 0,
    targetBytes: 0,
    textImageCount: 0,
    textImageBytes: 0,
  }
}

class WgpuCanvasPainterBackend implements CanvasPainterBackend {
  name = "wgpu"
  #context: WgpuCanvasContextHandle
  #target: WgpuTargetRecord | null = null
  #images = new WeakMap<Uint8Array, WgpuImageRecord>()
  #textImages = new Map<string, WgpuTextImageRecord>()
  #glyphAtlases = new Map<string, WgpuGlyphAtlasRecord>()
  #frame = 0

  constructor() {
    this.#context = createWgpuCanvasContext()
    wgpuCanvasPainterStatsProvider = () => ({
      targetCount: this.#target ? 1 : 0,
      targetBytes: this.#target ? this.#target.width * this.#target.height * 4 : 0,
      textImageCount: this.#textImages.size,
      textImageBytes: Array.from(this.#textImages.values()).reduce((sum, image) => sum + image.width * image.height * 4, 0),
    })
  }

  #getTarget(width: number, height: number) {
    if (this.#target && this.#target.width === width && this.#target.height === height) return this.#target.handle
    if (this.#target) destroyWgpuCanvasTarget(this.#context, this.#target.handle)
    const handle = createWgpuCanvasTarget(this.#context, { width, height })
    this.#target = { width, height, handle }
    return handle
  }

  dispose() {
    if (this.#target) destroyWgpuCanvasTarget(this.#context, this.#target.handle)
    for (const image of this.#textImages.values()) destroyWgpuCanvasImage(this.#context, image.handle)
    this.#textImages.clear()
    for (const atlas of this.#glyphAtlases.values()) destroyWgpuCanvasImage(this.#context, atlas.handle)
    this.#glyphAtlases.clear()
    destroyWgpuCanvasContext(this.#context)
  }

  #getImage(data: Uint8Array, width: number, height: number) {
    const cached = this.#images.get(data)
    if (cached && cached.width === width && cached.height === height) return cached.handle
    if (cached) destroyWgpuCanvasImage(this.#context, cached.handle)
    const handle = createWgpuCanvasImage(this.#context, { width, height }, data)
    this.#images.set(data, { width, height, handle })
    return handle
  }

  #getTextImage(text: string, color: number) {
    const key = `${color}:${text}`
    const cached = this.#textImages.get(key)
    if (cached) {
      touchCanvasPainterTextEntry(this.#textImages, key, cached)
      return cached.handle
    }
    const image = createGpuTextImage(this.#context, text, color)
    const handle = image.handle
    if (this.#textImages.size >= MAX_WGPU_CANVAS_TEXT_IMAGES) {
      const first = this.#textImages.keys().next().value
      if (first) {
        const stale = this.#textImages.get(first)
        if (stale) destroyWgpuCanvasImage(this.#context, stale.handle)
        this.#textImages.delete(first)
      }
    }
    this.#textImages.set(key, { key, width: image.width, height: image.height, handle })
    return handle
  }

  #getGlyphAtlas(fontId: number) {
    const key = `${fontId}`
    const cached = this.#glyphAtlases.get(key)
    if (cached) return cached
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
    const handle = createWgpuCanvasImage(this.#context, { width, height }, rgba)
    const record = { handle, cellWidth: atlas.cellWidth, cellHeight: atlas.cellHeight, columns, rows, glyphWidths: atlas.glyphWidths, indexFor: atlas.indexFor }
    this.#glyphAtlases.set(key, record)
    return record
  }

  paint(surface: RasterSurface, ctx: CanvasContext, canvasW: number, canvasH: number) {
    this.#frame += 1
    const mixedInfo = collectSupportedMixedScene(ctx, canvasW, canvasH)
    if (mixedInfo && mixedInfo.ops.length > 0) {
      const renderStart = performance.now()
      const target = this.#getTarget(canvasW, canvasH)
      const batches = batchMixedSceneOps(mixedInfo.ops)
      let first = true
      for (const batch of batches) {
        if (batch.kind === "rect") renderWgpuCanvasTargetRectsLayer(this.#context, target, batch.rects, first ? 0 : 1, 0x00000000)
        else if (batch.kind === "bezier") renderWgpuCanvasTargetBeziersLayer(this.#context, target, batch.beziers, first ? 0 : 1, 0x00000000)
        else if (batch.kind === "shapeRect") renderWgpuCanvasTargetShapeRectsLayer(this.#context, target, batch.rects, first ? 0 : 1, 0x00000000)
        else if (batch.kind === "shapeRectCorners") renderWgpuCanvasTargetShapeRectCornersLayer(this.#context, target, batch.rects, first ? 0 : 1, 0x00000000)
        else if (batch.kind === "glow") renderWgpuCanvasTargetGlowsLayer(this.#context, target, batch.glows, first ? 0 : 1, 0x00000000)
        else if (batch.kind === "circle") renderWgpuCanvasTargetCirclesLayer(this.#context, target, batch.circles, first ? 0 : 1, 0x00000000)
        else if (batch.kind === "polygon") renderWgpuCanvasTargetPolygonsLayer(this.#context, target, batch.polygons, first ? 0 : 1, 0x00000000)
        else if (batch.kind === "linearGradient") renderWgpuCanvasTargetLinearGradientsLayer(this.#context, target, batch.gradients, first ? 0 : 1, 0x00000000)
        else if (batch.kind === "radialGradient") renderWgpuCanvasTargetRadialGradientsLayer(this.#context, target, batch.gradients, first ? 0 : 1, 0x00000000)
        else if (batch.kind === "nebula") renderWgpuCanvasTargetNebulasLayer(this.#context, target, batch.nebulas, first ? 0 : 1, 0x00000000)
        else if (batch.kind === "starfield") renderWgpuCanvasTargetStarfieldsLayer(this.#context, target, batch.starfields, first ? 0 : 1, 0x00000000)
        else if (batch.kind === "text") {
          if (supportsWgpuCanvasGlyphLayer()) {
            const atlas = this.#getGlyphAtlas(0)
            const glyphs: WgpuCanvasGlyphInstance[] = []
            let canUseGlyphs = true
            for (const instance of batch.instances) {
              let cursorX = instance.x
              for (const glyph of batch.text) {
                const code = glyph.codePointAt(0)
                if (code === undefined) { canUseGlyphs = false; break }
                const glyphIndex = atlas.indexFor(code)
                if (glyphIndex < 0) { canUseGlyphs = false; break }
                const advancePx = atlas.glyphWidths[glyphIndex] || atlas.cellWidth
                if (glyph !== " ") {
                  const col = glyphIndex % atlas.columns
                  const row = Math.floor(glyphIndex / atlas.columns)
                  glyphs.push({
                    x: cursorX,
                    y: instance.y,
                    w: (atlas.cellWidth / canvasW) * 2,
                    h: -((atlas.cellHeight / canvasH) * 2),
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
                cursorX += (advancePx / canvasW) * 2
              }
              if (!canUseGlyphs) break
            }
            if (canUseGlyphs && glyphs.length > 0) renderWgpuCanvasTargetGlyphsLayer(this.#context, target, atlas.handle, glyphs, first ? 0 : 1, 0x00000000)
            else {
              const imageHandle = this.#getTextImage(batch.text, batch.color)
              renderWgpuCanvasTargetImagesLayer(this.#context, target, imageHandle, batch.instances, first ? 0 : 1, 0x00000000)
            }
          } else {
            const imageHandle = this.#getTextImage(batch.text, batch.color)
            renderWgpuCanvasTargetImagesLayer(this.#context, target, imageHandle, batch.instances, first ? 0 : 1, 0x00000000)
          }
        } else {
          const imageHandle = this.#getImage(batch.image, batch.imageW, batch.imageH)
          renderWgpuCanvasTargetImagesLayer(this.#context, target, imageHandle, batch.instances, first ? 0 : 1, 0x00000000)
        }
        first = false
      }
      const renderMs = performance.now() - renderStart
      const fullArea = canvasW * canvasH
      const region = mixedInfo.bounds ? { x: mixedInfo.bounds.left, y: mixedInfo.bounds.top, width: mixedInfo.bounds.right - mixedInfo.bounds.left, height: mixedInfo.bounds.bottom - mixedInfo.bounds.top } : null
      const regionArea = region ? region.width * region.height : fullArea
      const useRegionReadback = !!(region && region.width > 0 && region.height > 0 && regionArea < fullArea * WGPU_REGION_READBACK_THRESHOLD)
      const readbackStart = performance.now()
      const readback = readbackTargetToSurface(this.#context, target, surface, { region: useRegionReadback ? region : null })
      const readbackMs = performance.now() - readbackStart
      const readbackMode = readback.mode === "region" && region ? `region ${region.width}x${region.height}@(${region.x},${region.y})` : "full"
      logWgpuBackend(`[frame ${this.#frame}] mode=mixed cmds=${mixedInfo.ops.length} batches=${batches.length} readbackMode=${readbackMode} render=${renderMs.toFixed(2)}ms readback=${readbackMs.toFixed(2)}ms total=${(renderMs + readbackMs).toFixed(2)}ms size=${canvasW}x${canvasH}`)
      return
    }

    const singleImage = collectSupportedSingleImage(ctx, canvasW, canvasH)
    if (singleImage) {
      const renderStart = performance.now()
      const target = this.#getTarget(canvasW, canvasH)
      const imageHandle = this.#getImage(singleImage.image.data, singleImage.image.imgW, singleImage.image.imgH)
      renderWgpuCanvasTargetImage(this.#context, target, imageHandle, singleImage.instance, 0x00000000)
      const renderMs = performance.now() - renderStart
      const readbackStart = performance.now()
      readbackTargetToSurface(this.#context, target, surface)
      const readbackMs = performance.now() - readbackStart
      logWgpuBackend(`[frame ${this.#frame}] mode=image cmds=1 render=${renderMs.toFixed(2)}ms readback=${readbackMs.toFixed(2)}ms total=${(renderMs + readbackMs).toFixed(2)}ms size=${canvasW}x${canvasH}`)
      return
    }

    const rects = collectSupportedRects(ctx, canvasW, canvasH)
    if (!rects) {
      paintCanvasCommandsCPU(surface, ctx, canvasW, canvasH)
      return
    }
    if (rects.length === 0) return

    const renderStart = performance.now()
    const target = this.#getTarget(canvasW, canvasH)
    renderWgpuCanvasTargetRects(this.#context, target, rects, 0x00000000)
    const renderMs = performance.now() - renderStart
    const readbackStart = performance.now()
    readbackTargetToSurface(this.#context, target, surface)
    const readbackMs = performance.now() - readbackStart
    logWgpuBackend(`[frame ${this.#frame}] mode=rects cmds=${rects.length} render=${renderMs.toFixed(2)}ms readback=${readbackMs.toFixed(2)}ms total=${(renderMs + readbackMs).toFixed(2)}ms size=${canvasW}x${canvasH}`)
  }
}

let sharedBackend: WgpuCanvasPainterBackend | null = null

export function tryCreateWgpuCanvasPainterBackend(): CanvasPainterBackend | null {
  const probe = probeWgpuCanvasBridge()
  if (!probe.available) return null
  if (!sharedBackend) sharedBackend = new WgpuCanvasPainterBackend()
  return sharedBackend
}
