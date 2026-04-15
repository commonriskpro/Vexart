import { create, paint } from "@tge/pixel"
import { appendFileSync } from "node:fs"
import { CanvasContext, paintCanvasCommands } from "./canvas"
import { transformBounds, transformPoint } from "./matrix"
import type { EffectRenderOp, ImageRenderOp, RectangleRenderOp, RenderGraphOp, TextRenderOp, BorderRenderOp } from "./render-graph"
import type { RendererBackend, RendererBackendPaintContext } from "./renderer-backend"
import { chooseGpuLayerStrategy, type GpuLayerStrategyMode } from "./gpu-layer-strategy"
import {
  beginWgpuCanvasTargetLayer,
  createWgpuCanvasContext,
  createWgpuCanvasImage,
  createWgpuCanvasTarget,
  destroyWgpuCanvasImage,
  destroyWgpuCanvasTarget,
  endWgpuCanvasTargetLayer,
  probeWgpuCanvasBridge,
  readbackWgpuCanvasTargetRGBA,
  readbackWgpuCanvasTargetRegionRGBA,
  renderWgpuCanvasTargetGlowsLayer,
  renderWgpuCanvasTargetImagesLayer,
  renderWgpuCanvasTargetLinearGradientsLayer,
  renderWgpuCanvasTargetRadialGradientsLayer,
  renderWgpuCanvasTargetRectsLayer,
  renderWgpuCanvasTargetShapeRectsLayer,
  renderWgpuCanvasTargetTransformedImagesLayer,
  type WgpuCanvasContextHandle,
  type WgpuCanvasGlow,
  type WgpuCanvasImageHandle,
  type WgpuCanvasRectFill,
  type WgpuCanvasShapeRect,
  type WgpuCanvasTargetHandle,
} from "./wgpu-canvas-bridge"

export type GpuRendererBackend = RendererBackend & {
  getLastStrategy: () => GpuLayerStrategyMode | null
}

const GPU_RENDERER_DEBUG = process.env.TGE_DEBUG_GPU_RENDERER === "1"
const GPU_RENDERER_DEBUG_LOG = "/tmp/tge-gpu-renderer.log"

function logGpuRenderer(message: string) {
  if (!GPU_RENDERER_DEBUG) return
  appendFileSync(GPU_RENDERER_DEBUG_LOG, message + "\n")
}

type TargetRecord = {
  width: number
  height: number
  handle: WgpuCanvasTargetHandle
}

type ImageRecord = {
  handle: WgpuCanvasImageHandle
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

type FallbackSpriteRecord = {
  key: string
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

function compositeReadback(dst: Uint8Array, src: Uint8Array) {
  for (let i = 0; i < src.length; i += 4) {
    const sa = src[i + 3]
    if (sa === 0) continue
    if (sa === 255) {
      dst[i] = src[i]
      dst[i + 1] = src[i + 1]
      dst[i + 2] = src[i + 2]
      dst[i + 3] = 255
      continue
    }
    const da = dst[i + 3]
    const invSa = 255 - sa
    dst[i] = Math.round((src[i] * sa + dst[i] * invSa) / 255)
    dst[i + 1] = Math.round((src[i + 1] * sa + dst[i + 1] * invSa) / 255)
    dst[i + 2] = Math.round((src[i + 2] * sa + dst[i + 2] * invSa) / 255)
    dst[i + 3] = Math.min(255, sa + Math.round(da * invSa / 255))
  }
}

function compositeRegionReadback(dst: Uint8Array, dstWidth: number, src: Uint8Array, region: { x: number; y: number; width: number; height: number }) {
  const rowBytes = region.width * 4
  for (let row = 0; row < region.height; row++) {
    const srcStart = row * rowBytes
    const dstStart = ((region.y + row) * dstWidth + region.x) * 4
    compositeReadback(dst.subarray(dstStart, dstStart + rowBytes), src.subarray(srcStart, srcStart + rowBytes))
  }
}

function isSupportedRectangle(op: RectangleRenderOp) {
  return !op.inputs.image && !op.inputs.canvas && !op.inputs.effect
}

function isSupportedEffect(op: EffectRenderOp) {
  if (op.effect.backdropBlur) return false
  if (op.effect.backdropBrightness !== undefined) return false
  if (op.effect.backdropContrast !== undefined) return false
  if (op.effect.backdropSaturate !== undefined) return false
  if (op.effect.backdropGrayscale !== undefined) return false
  if (op.effect.backdropInvert !== undefined) return false
  if (op.effect.backdropSepia !== undefined) return false
  if (op.effect.backdropHueRotate !== undefined) return false
  if (op.effect.cornerRadii) return false
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

export function createGpuRendererBackend(fallbackPaintOp: (ctx: RendererBackendPaintContext, op: RenderGraphOp) => void): GpuRendererBackend {
  const probe = probeWgpuCanvasBridge()
  const gpuAvailable = probe.available
  const context = gpuAvailable ? createWgpuCanvasContext() : null
  let lastStrategy: GpuLayerStrategyMode | null = null
  let target: TargetRecord | null = null
  const textImages = new Map<string, ImageRecord>()
  const imageCache = new WeakMap<Uint8Array, ImageRecord>()
  const fallbackSpriteCache = new Map<string, FallbackSpriteRecord>()
  const canvasSpriteCache = new Map<string, CanvasSpriteRecord>()
  const transformSpriteCache = new Map<string, TransformSpriteRecord>()
  const canvasFunctionIds = new WeakMap<Function, number>()
  let nextCanvasFunctionId = 1

  const clearFallbackSpriteCache = () => {
    if (!context) return
    for (const record of fallbackSpriteCache.values()) {
      destroyWgpuCanvasImage(context, record.handle)
    }
    fallbackSpriteCache.clear()
    for (const record of canvasSpriteCache.values()) {
      destroyWgpuCanvasImage(context, record.handle)
    }
    canvasSpriteCache.clear()
    for (const record of transformSpriteCache.values()) {
      destroyWgpuCanvasImage(context, record.handle)
    }
    transformSpriteCache.clear()
  }

  const getTarget = (width: number, height: number) => {
    if (!context) return null
    if (target && target.width === width && target.height === height) return target.handle
    if (target) destroyWgpuCanvasTarget(context, target.handle)
    clearFallbackSpriteCache()
    const handle = createWgpuCanvasTarget(context, { width, height })
    target = { width, height, handle }
    return handle
  }

  const getImage = (rgba: Uint8Array, width: number, height: number) => {
    if (!context) return null
    const cached = imageCache.get(rgba)
    if (cached) return cached.handle
    const handle = createWgpuCanvasImage(context, { width, height }, rgba)
    imageCache.set(rgba, { handle })
    return handle
  }

  const getTextImage = (text: string, color: [number, number, number, number]) => {
    if (!context) return null
    const key = `${color.join(",")}:${text}`
    const cached = textImages.get(key)
    if (cached) return cached.handle
    const width = Math.max(1, paint.measureText(text))
    const height = 16
    const buf = create(width, height)
    paint.drawText(buf, 0, 0, text, color[0], color[1], color[2], color[3])
    const handle = createWgpuCanvasImage(context, { width, height }, buf.data)
    textImages.set(key, { handle })
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
    if (cached && cached.width === width && cached.height === height) return cached.handle
    if (cached) destroyWgpuCanvasImage(context, cached.handle)
    const tmp = create(width, height)
    const canvasCtx = new CanvasContext(viewport)
    op.canvas.onDraw(canvasCtx)
    paintCanvasCommands(tmp, canvasCtx, width, height)
    const handle = createWgpuCanvasImage(context, { width, height }, tmp.data)
    canvasSpriteCache.set(key, { key, handle, width, height })
    return handle
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
    if (cached && cached.width === width && cached.height === height) return cached.handle
    if (cached) destroyWgpuCanvasImage(context, cached.handle)
    const tmp = create(width, height)
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
    fallbackPaintOp({
      buffer: tmp,
      commands: [spriteOp.command],
      graph: { ops: [spriteOp] },
      offsetX: Math.round(op.command.x),
      offsetY: Math.round(op.command.y),
    }, spriteOp)
    const handle = createWgpuCanvasImage(context, { width, height }, tmp.data)
    transformSpriteCache.set(key, { key, handle, width, height })
    return handle
  }

  const clipRect = (cmd: { x: number; y: number; width: number; height: number }, ctx: RendererBackendPaintContext) => {
    const x = Math.round(cmd.x) - ctx.offsetX
    const y = Math.round(cmd.y) - ctx.offsetY
    const w = Math.round(cmd.width)
    const h = Math.round(cmd.height)
    const left = Math.max(0, x)
    const top = Math.max(0, y)
    const right = Math.min(ctx.buffer.width, x + w)
    const bottom = Math.min(ctx.buffer.height, y + h)
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

  const renderFrame = (ctx: RendererBackendPaintContext) => {
    if (!context) return false
    const targetHandle = getTarget(ctx.buffer.width, ctx.buffer.height)
    if (!targetHandle) return false
    let first = true
    const rects: WgpuCanvasRectFill[] = []
    const shapeRects: WgpuCanvasShapeRect[] = []
    const linearGradients: Parameters<typeof renderWgpuCanvasTargetLinearGradientsLayer>[2] = []
    const radialGradients: Parameters<typeof renderWgpuCanvasTargetRadialGradientsLayer>[2] = []
    const glows: WgpuCanvasGlow[] = []
    const imageGroups = new Map<bigint, { handle: WgpuCanvasImageHandle; instances: { x: number; y: number; w: number; h: number; opacity: number }[] }>()
    const transformedImageGroups = new Map<bigint, { handle: WgpuCanvasImageHandle; instances: { p0: { x: number; y: number }; p1: { x: number; y: number }; p2: { x: number; y: number }; p3: { x: number; y: number }; opacity: number }[] }>()

    const flushRects = () => {
      if (rects.length === 0) return
      renderWgpuCanvasTargetRectsLayer(context, targetHandle, rects, first ? 0 : 1, 0x00000000)
      rects.length = 0
      first = false
    }
    const flushShapeRects = () => {
      if (shapeRects.length === 0) return
      renderWgpuCanvasTargetShapeRectsLayer(context, targetHandle, shapeRects, first ? 0 : 1, 0x00000000)
      shapeRects.length = 0
      first = false
    }
    const flushLinearGradients = () => {
      if (linearGradients.length === 0) return
      renderWgpuCanvasTargetLinearGradientsLayer(context, targetHandle, linearGradients, first ? 0 : 1, 0x00000000)
      linearGradients.length = 0
      first = false
    }
    const flushRadialGradients = () => {
      if (radialGradients.length === 0) return
      renderWgpuCanvasTargetRadialGradientsLayer(context, targetHandle, radialGradients, first ? 0 : 1, 0x00000000)
      radialGradients.length = 0
      first = false
    }
    const flushGlows = () => {
      if (glows.length === 0) return
      renderWgpuCanvasTargetGlowsLayer(context, targetHandle, glows, first ? 0 : 1, 0x00000000)
      glows.length = 0
      first = false
    }
    const flushImages = () => {
      if (imageGroups.size === 0) return
      for (const group of imageGroups.values()) {
        renderWgpuCanvasTargetImagesLayer(context, targetHandle, group.handle, group.instances, first ? 0 : 1, 0x00000000)
        first = false
      }
      imageGroups.clear()
    }
    const flushTransformedImages = () => {
      if (transformedImageGroups.size === 0) return
      for (const group of transformedImageGroups.values()) {
        renderWgpuCanvasTargetTransformedImagesLayer(context, targetHandle, group.handle, group.instances, first ? 0 : 1, 0x00000000)
        first = false
      }
      transformedImageGroups.clear()
    }
    const flushAll = () => {
      flushRects()
      flushShapeRects()
      flushLinearGradients()
      flushRadialGradients()
      flushGlows()
      flushImages()
      flushTransformedImages()
    }

    let dirtyBounds: IntBounds | null = null
    const transientFullFrameImages: WgpuCanvasImageHandle[] = []
    let layerOpen = true

    const markDirty = (left: number, top: number, right: number, bottom: number) => {
      dirtyBounds = unionBounds(dirtyBounds, { left, top, right, bottom })
    }

    const syncCpuBufferFromTarget = () => {
      const readback = readbackWgpuCanvasTargetRGBA(context, targetHandle, ctx.buffer.width * ctx.buffer.height * 4)
      ctx.buffer.data.set(readback.data)
    }

    const restartLayerFromCpuBuffer = () => {
      const handle = createWgpuCanvasImage(context, { width: ctx.buffer.width, height: ctx.buffer.height }, ctx.buffer.data)
      transientFullFrameImages.push(handle)
      beginWgpuCanvasTargetLayer(context, targetHandle, 0, 0x00000000)
      layerOpen = true
      renderWgpuCanvasTargetImagesLayer(context, targetHandle, handle, [{ x: -1, y: 1, w: 2, h: -2, opacity: 1 }], 0, 0x00000000)
      first = false
    }

    const renderFallbackSprite = (op: RenderGraphOp) => {
      if (!context) return false
      const bounds = opBounds(op, ctx.buffer.width, ctx.buffer.height)
      if (!bounds) return true
      const key = JSON.stringify({
        kind: op.kind,
        command: op.command,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      })
      let handle: WgpuCanvasImageHandle
      const cached = fallbackSpriteCache.get(key)
      if (cached && cached.width === bounds.width && cached.height === bounds.height) {
        handle = cached.handle
      } else {
        if (cached) destroyWgpuCanvasImage(context, cached.handle)
        const tmp = create(bounds.width, bounds.height)
        fallbackPaintOp({
          buffer: tmp,
          commands: [op.command],
          graph: { ops: [op] },
          offsetX: bounds.left,
          offsetY: bounds.top,
        }, op)
        handle = createWgpuCanvasImage(context, { width: bounds.width, height: bounds.height }, tmp.data)
        fallbackSpriteCache.set(key, { key, handle, width: bounds.width, height: bounds.height })
      }
      const group = imageGroups.get(handle) ?? { handle, instances: [] }
      group.instances.push({
        x: (bounds.left / ctx.buffer.width) * 2 - 1,
        y: 1 - (bounds.top / ctx.buffer.height) * 2,
        w: (bounds.width / ctx.buffer.width) * 2,
        h: -((bounds.height / ctx.buffer.height) * 2),
        opacity: 1,
      })
      imageGroups.set(handle, group)
      markDirty(bounds.left, bounds.top, bounds.right, bounds.bottom)
      return true
    }

    beginWgpuCanvasTargetLayer(context, targetHandle, 0x00000000)

    try {
      for (const op of ctx.graph.ops) {
        const clip = clipRect(op.command, ctx)
        if (!clip) continue
        if (op.kind === "rectangle") {
          if (op.inputs.radius > 0) {
            shapeRects.push({
              x: (clip.left / ctx.buffer.width) * 2 - 1,
              y: 1 - (clip.top / ctx.buffer.height) * 2,
              w: ((clip.right - clip.left) / ctx.buffer.width) * 2,
              h: -(((clip.bottom - clip.top) / ctx.buffer.height) * 2),
              boxW: clip.right - clip.left,
              boxH: clip.bottom - clip.top,
              radius: op.inputs.radius,
              strokeWidth: 0,
              fill: op.inputs.color,
            })
          } else {
            rects.push({
              x: (clip.left / ctx.buffer.width) * 2 - 1,
              y: 1 - (clip.top / ctx.buffer.height) * 2,
              w: ((clip.right - clip.left) / ctx.buffer.width) * 2,
              h: -(((clip.bottom - clip.top) / ctx.buffer.height) * 2),
              color: op.inputs.color,
            })
          }
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "effect") {
          if (op.effect.backdropBlur || op.effect.backdropBrightness !== undefined || op.effect.backdropContrast !== undefined || op.effect.backdropSaturate !== undefined || op.effect.backdropGrayscale !== undefined || op.effect.backdropInvert !== undefined || op.effect.backdropSepia !== undefined || op.effect.backdropHueRotate !== undefined) {
            flushAll()
            if (layerOpen) {
              endWgpuCanvasTargetLayer(context, targetHandle)
              layerOpen = false
            }
            syncCpuBufferFromTarget()
            fallbackPaintOp(ctx, op)
            restartLayerFromCpuBuffer()
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
            continue
          }

          if (op.effect.transform) {
            const bounds = opBounds(op, ctx.buffer.width, ctx.buffer.height)
            if (!bounds) continue
            const handle = getTransformSprite(op)
            if (!handle) return false
            const group = transformedImageGroups.get(handle) ?? { handle, instances: [] }
            const matrix = op.effect.transform
            const width = Math.max(1, Math.round(op.command.width))
            const height = Math.max(1, Math.round(op.command.height))
            const baseX = Math.round(op.command.x)
            const baseY = Math.round(op.command.y)
            const p0 = transformPoint(matrix, 0, 0)
            const p1 = transformPoint(matrix, width, 0)
            const p2 = transformPoint(matrix, 0, height)
            const p3 = transformPoint(matrix, width, height)
            group.instances.push({
              p0: { x: ((baseX + p0.x) / ctx.buffer.width) * 2 - 1, y: 1 - ((baseY + p0.y) / ctx.buffer.height) * 2 },
              p1: { x: ((baseX + p1.x) / ctx.buffer.width) * 2 - 1, y: 1 - ((baseY + p1.y) / ctx.buffer.height) * 2 },
              p2: { x: ((baseX + p2.x) / ctx.buffer.width) * 2 - 1, y: 1 - ((baseY + p2.y) / ctx.buffer.height) * 2 },
              p3: { x: ((baseX + p3.x) / ctx.buffer.width) * 2 - 1, y: 1 - ((baseY + p3.y) / ctx.buffer.height) * 2 },
              opacity: op.effect.opacity ?? 1,
            })
            transformedImageGroups.set(handle, group)
            markDirty(bounds.left, bounds.top, bounds.right, bounds.bottom)
            continue
          }

          const baseFill = ((op.command.color[0] << 24) | (op.command.color[1] << 16) | (op.command.color[2] << 8) | op.command.color[3]) >>> 0

          if (!op.effect.gradient && !op.effect.glow && !op.effect.shadow) {
            shapeRects.push({
              x: (clip.left / ctx.buffer.width) * 2 - 1,
              y: 1 - (clip.top / ctx.buffer.height) * 2,
              w: ((clip.right - clip.left) / ctx.buffer.width) * 2,
              h: -(((clip.bottom - clip.top) / ctx.buffer.height) * 2),
              boxW: clip.right - clip.left,
              boxH: clip.bottom - clip.top,
              radius: op.rect.inputs.radius,
              strokeWidth: 0,
              fill: baseFill,
            })
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
            continue
          }

          if (op.effect.gradient) {
            shapeRects.push({
              x: (clip.left / ctx.buffer.width) * 2 - 1,
              y: 1 - (clip.top / ctx.buffer.height) * 2,
              w: ((clip.right - clip.left) / ctx.buffer.width) * 2,
              h: -(((clip.bottom - clip.top) / ctx.buffer.height) * 2),
              boxW: clip.right - clip.left,
              boxH: clip.bottom - clip.top,
              radius: op.rect.inputs.radius,
              strokeWidth: 0,
              fill: baseFill,
            })
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
          }

          if (op.effect.shadow) {
            const shadows = Array.isArray(op.effect.shadow) ? op.effect.shadow : [op.effect.shadow]
            for (const s of shadows) {
              const blur = Math.ceil(s.blur)
              const pad = blur * 2
              const left = Math.max(0, clip.left + Math.min(0, s.x) - pad)
              const top = Math.max(0, clip.top + Math.min(0, s.y) - pad)
              const right = Math.min(ctx.buffer.width, clip.right + Math.max(0, s.x) + pad)
              const bottom = Math.min(ctx.buffer.height, clip.bottom + Math.max(0, s.y) + pad)
              const intensity = Math.min(100, Math.max(1, Math.round(((s.color & 0xff) / 255) * 100)))
              glows.push({
                x: (left / ctx.buffer.width) * 2 - 1,
                y: 1 - (top / ctx.buffer.height) * 2,
                w: ((right - left) / ctx.buffer.width) * 2,
                h: -(((bottom - top) / ctx.buffer.height) * 2),
                color: s.color,
                intensity,
              })
              markDirty(left, top, right, bottom)
            }
          }

          if (op.effect.glow) {
            const margin = op.effect.glow.radius
            const left = Math.max(0, clip.left - margin)
            const top = Math.max(0, clip.top - margin)
            const right = Math.min(ctx.buffer.width, clip.right + margin)
            const bottom = Math.min(ctx.buffer.height, clip.bottom + margin)
            glows.push({
              x: (left / ctx.buffer.width) * 2 - 1,
              y: 1 - (top / ctx.buffer.height) * 2,
              w: ((right - left) / ctx.buffer.width) * 2,
              h: -(((bottom - top) / ctx.buffer.height) * 2),
              color: op.effect.glow.color,
              intensity: op.effect.glow.intensity,
            })
            markDirty(left, top, right, bottom)
          }

          if (op.effect.gradient?.type === "linear") {
            linearGradients.push({
              x: (clip.left / ctx.buffer.width) * 2 - 1,
              y: 1 - (clip.top / ctx.buffer.height) * 2,
              w: ((clip.right - clip.left) / ctx.buffer.width) * 2,
              h: -(((clip.bottom - clip.top) / ctx.buffer.height) * 2),
              from: op.effect.gradient.from,
              to: op.effect.gradient.to,
              dirX: Math.cos((op.effect.gradient.angle * Math.PI) / 180),
              dirY: Math.sin((op.effect.gradient.angle * Math.PI) / 180),
            })
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
            continue
          }

          if (op.effect.gradient?.type === "radial") {
            radialGradients.push({
              x: (clip.left / ctx.buffer.width) * 2 - 1,
              y: 1 - (clip.top / ctx.buffer.height) * 2,
              w: ((clip.right - clip.left) / ctx.buffer.width) * 2,
              h: -(((clip.bottom - clip.top) / ctx.buffer.height) * 2),
              from: op.effect.gradient.from,
              to: op.effect.gradient.to,
            })
            markDirty(clip.left, clip.top, clip.right, clip.bottom)
            continue
          }

          continue
        }
        if (op.kind === "border") {
          shapeRects.push({
            x: (clip.left / ctx.buffer.width) * 2 - 1,
            y: 1 - (clip.top / ctx.buffer.height) * 2,
            w: ((clip.right - clip.left) / ctx.buffer.width) * 2,
            h: -(((clip.bottom - clip.top) / ctx.buffer.height) * 2),
            boxW: clip.right - clip.left,
            boxH: clip.bottom - clip.top,
            radius: op.inputs.radius,
            strokeWidth: op.inputs.width,
            stroke: ((op.command.color[0] << 24) | (op.command.color[1] << 16) | (op.command.color[2] << 8) | op.command.color[3]) >>> 0,
          })
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "image") {
          const imageHandle = getImage(op.image.imageBuffer.data, op.image.imageBuffer.width, op.image.imageBuffer.height)
          if (!imageHandle) return false
          const group = imageGroups.get(imageHandle) ?? { handle: imageHandle, instances: [] }
          group.instances.push({
            x: (clip.x / ctx.buffer.width) * 2 - 1,
            y: 1 - (clip.y / ctx.buffer.height) * 2,
            w: (clip.w / ctx.buffer.width) * 2,
            h: -((clip.h / ctx.buffer.height) * 2),
            opacity: 1,
          })
          imageGroups.set(imageHandle, group)
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "canvas") {
          const imageHandle = getCanvasSprite(op)
          if (!imageHandle) return false
          const group = imageGroups.get(imageHandle) ?? { handle: imageHandle, instances: [] }
          group.instances.push({
            x: (clip.x / ctx.buffer.width) * 2 - 1,
            y: 1 - (clip.y / ctx.buffer.height) * 2,
            w: (clip.w / ctx.buffer.width) * 2,
            h: -((clip.h / ctx.buffer.height) * 2),
            opacity: 1,
          })
          imageGroups.set(imageHandle, group)
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }
        if (op.kind === "text") {
          const imageHandle = getTextImage(op.inputs.text, op.command.color)
          if (!imageHandle) return false
          const group = imageGroups.get(imageHandle) ?? { handle: imageHandle, instances: [] }
          group.instances.push({
            x: (clip.x / ctx.buffer.width) * 2 - 1,
            y: 1 - (clip.y / ctx.buffer.height) * 2,
            w: (clip.w / ctx.buffer.width) * 2,
            h: -((clip.h / ctx.buffer.height) * 2),
            opacity: 1,
          })
          imageGroups.set(imageHandle, group)
          markDirty(clip.left, clip.top, clip.right, clip.bottom)
          continue
        }

        flushAll()
        if (!renderFallbackSprite(op)) return false
      }
      flushAll()
    } finally {
      if (layerOpen) endWgpuCanvasTargetLayer(context, targetHandle)
    }

    if (first) return true
    const boundsRef = dirtyBounds as IntBounds | null
    if (boundsRef) {
      const width = boundsRef.right - boundsRef.left
      const height = boundsRef.bottom - boundsRef.top
      const fullArea = ctx.buffer.width * ctx.buffer.height
      const regionArea = width * height
      if (regionArea > 0 && regionArea < fullArea * 0.8) {
        const readback = readbackWgpuCanvasTargetRegionRGBA(context, targetHandle, { x: boundsRef.left, y: boundsRef.top, width, height })
        compositeRegionReadback(ctx.buffer.data, ctx.buffer.width, readback.data, { x: boundsRef.left, y: boundsRef.top, width, height })
        for (const handle of transientFullFrameImages) destroyWgpuCanvasImage(context, handle)
        return true
      }
    }
    const readback = readbackWgpuCanvasTargetRGBA(context, targetHandle, ctx.buffer.width * ctx.buffer.height * 4)
    compositeReadback(ctx.buffer.data, readback.data)
    for (const handle of transientFullFrameImages) destroyWgpuCanvasImage(context, handle)
    return true
  }

  return {
    name: "gpu-render-graph",
    paint(ctx) {
      const totalPixelArea = ctx.buffer.width * ctx.buffer.height
      lastStrategy = chooseGpuLayerStrategy({ dirtyLayerCount: 1, dirtyPixelArea: totalPixelArea, totalPixelArea, fullRepaint: true })
      if (!gpuAvailable || !context) {
        for (const op of ctx.graph.ops) fallbackPaintOp(ctx, op)
        return
      }

      const fallbackCounts = new Map<string, number>()
      for (const op of ctx.graph.ops) {
        if (!isSupportedOp(op)) {
          fallbackCounts.set(op.kind, (fallbackCounts.get(op.kind) ?? 0) + 1)
        }
      }
      if (fallbackCounts.size > 0) {
        logGpuRenderer(`[frame] fallback=${JSON.stringify(Object.fromEntries(fallbackCounts))} totalOps=${ctx.graph.ops.length}`)
      } else {
        logGpuRenderer(`[frame] fallback={} totalOps=${ctx.graph.ops.length}`)
      }

      const ok = renderFrame(ctx)
      if (!ok) {
        for (const op of ctx.graph.ops) fallbackPaintOp(ctx, op)
      }
    },
    getLastStrategy() {
      return lastStrategy
    },
  }
}
