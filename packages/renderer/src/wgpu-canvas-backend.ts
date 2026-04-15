import { create, paint, type PixelBuffer } from "@tge/pixel"
import { appendFileSync } from "node:fs"
import type { CanvasPainterBackend } from "./canvas-backend"
import { type CanvasContext, type CanvasDrawCommand, paintCanvasCommandsCPU } from "./canvas"
import {
  createWgpuCanvasImage,
  createWgpuCanvasContext,
  createWgpuCanvasTarget,
  destroyWgpuCanvasImage,
  destroyWgpuCanvasContext,
  destroyWgpuCanvasTarget,
  probeWgpuCanvasBridge,
  readbackWgpuCanvasTargetRGBA,
  readbackWgpuCanvasTargetRegionRGBA,
  renderWgpuCanvasTargetCirclesLayer,
  renderWgpuCanvasTargetBeziersLayer,
  renderWgpuCanvasTargetImage,
  renderWgpuCanvasTargetImageLayer,
  renderWgpuCanvasTargetImagesLayer,
  renderWgpuCanvasTargetGlowsLayer,
  renderWgpuCanvasTargetLinearGradientsLayer,
  renderWgpuCanvasTargetPolygonsLayer,
  renderWgpuCanvasTargetRadialGradientsLayer,
  renderWgpuCanvasTargetRects,
  renderWgpuCanvasTargetRectsLayer,
  renderWgpuCanvasTargetShapeRectsLayer,
  type WgpuCanvasCircle,
  type WgpuCanvasBezier,
  type WgpuCanvasContextHandle,
  type WgpuCanvasGlow,
  type WgpuCanvasImageHandle,
  type WgpuCanvasPolygon,
  type WgpuCanvasShapeRect,
  type WgpuCanvasTargetHandle,
  type WgpuCanvasRectFill,
  type WgpuCanvasLinearGradient,
  type WgpuCanvasRadialGradient,
} from "./wgpu-canvas-bridge"

type WgpuTargetRecord = {
  width: number
  height: number
  handle: WgpuCanvasTargetHandle
}

const WGPU_BACKEND_PROFILE = process.env.TGE_DEBUG_WGPU_BACKEND === "1"
const WGPU_BACKEND_PROFILE_LOG = "/tmp/tge-wgpu-backend.log"
const WGPU_REGION_READBACK_THRESHOLD = 0.75

function logWgpuBackend(msg: string) {
  if (!WGPU_BACKEND_PROFILE) return
  appendFileSync(WGPU_BACKEND_PROFILE_LOG, msg + "\n")
}

type WgpuImageRecord = {
  width: number
  height: number
  handle: WgpuCanvasImageHandle
}

type WgpuTextImageRecord = WgpuImageRecord & {
  key: string
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

function boundsFromRect(left: number, top: number, right: number, bottom: number): IntBounds | null {
  if (right <= left || bottom <= top) return null
  return { left, top, right, bottom }
}

function collectSupportedRects(ctx: CanvasContext, canvasW: number, canvasH: number) {
  const commands = ctx._commands as CanvasDrawCommand[]
  const vp = ctx.viewport
  const z = vp.zoom
  const ox = vp.x
  const oy = vp.y
  const tx = (wx: number) => Math.round((wx - ox) * z)
  const ty = (wy: number) => Math.round((wy - oy) * z)
  const ts = (ws: number) => Math.max(1, Math.round(ws * z))

  const rects: WgpuCanvasRectFill[] = []
  for (const cmd of commands) {
    if (cmd.kind !== "rect") return null
    if (cmd.stroke !== undefined) return null
    if (cmd.radius !== 0) return null
    if (cmd.fill === undefined) continue

    const x = tx(cmd.x)
    const y = ty(cmd.y)
    const w = ts(cmd.w)
    const h = ts(cmd.h)
    const left = Math.max(0, x)
    const top = Math.max(0, y)
    const right = Math.min(canvasW, x + w)
    const bottom = Math.min(canvasH, y + h)
    const clippedW = right - left
    const clippedH = bottom - top
    if (clippedW <= 0 || clippedH <= 0) continue

    const clipX = (left / canvasW) * 2 - 1
    const clipY = 1 - (top / canvasH) * 2
    const clipW = (clippedW / canvasW) * 2
    const clipH = -(clippedH / canvasH) * 2
    rects.push({ x: clipX, y: clipY, w: clipW, h: clipH, color: cmd.fill })
  }

  return rects
}

function collectSupportedSingleImage(ctx: CanvasContext, canvasW: number, canvasH: number) {
  const commands = ctx._commands as CanvasDrawCommand[]
  if (commands.length !== 1) return null
  const cmd = commands[0]
  if (cmd.kind !== "image") return null

  const vp = ctx.viewport
  const z = vp.zoom
  const ox = vp.x
  const oy = vp.y
  const tx = (wx: number) => Math.round((wx - ox) * z)
  const ty = (wy: number) => Math.round((wy - oy) * z)
  const ts = (ws: number) => Math.max(1, Math.round(ws * z))

  const x = tx(cmd.x)
  const y = ty(cmd.y)
  const w = ts(cmd.w)
  const h = ts(cmd.h)
  const clipX = (x / canvasW) * 2 - 1
  const clipY = 1 - (y / canvasH) * 2
  const clipW = (w / canvasW) * 2
  const clipH = -(h / canvasH) * 2

  return {
    image: cmd,
    instance: {
      x: clipX,
      y: clipY,
      w: clipW,
      h: clipH,
      opacity: cmd.opacity,
    },
  }
}

type MixedGpuOp =
  | { kind: "bezier"; bezier: WgpuCanvasBezier }
  | { kind: "glow"; glow: WgpuCanvasGlow }
  | { kind: "circle"; circle: WgpuCanvasCircle }
  | { kind: "polygon"; polygon: WgpuCanvasPolygon }
  | { kind: "shapeRect"; rect: WgpuCanvasShapeRect }
  | { kind: "text"; text: string; color: number; instance: { x: number; y: number; w: number; h: number; opacity: number } }
  | { kind: "rect"; rect: WgpuCanvasRectFill }
  | { kind: "linearGradient"; gradient: WgpuCanvasLinearGradient }
  | { kind: "radialGradient"; gradient: WgpuCanvasRadialGradient }
  | { kind: "image"; image: Uint8Array; imageW: number; imageH: number; instance: { x: number; y: number; w: number; h: number; opacity: number } }

type MixedGpuBatch =
  | { kind: "bezier"; beziers: WgpuCanvasBezier[] }
  | { kind: "glow"; glows: WgpuCanvasGlow[] }
  | { kind: "circle"; circles: WgpuCanvasCircle[] }
  | { kind: "polygon"; polygons: WgpuCanvasPolygon[] }
  | { kind: "shapeRect"; rects: WgpuCanvasShapeRect[] }
  | { kind: "text"; text: string; color: number; instances: { x: number; y: number; w: number; h: number; opacity: number }[] }
  | { kind: "rect"; rects: WgpuCanvasRectFill[] }
  | { kind: "linearGradient"; gradients: WgpuCanvasLinearGradient[] }
  | { kind: "radialGradient"; gradients: WgpuCanvasRadialGradient[] }
  | { kind: "image"; image: Uint8Array; imageW: number; imageH: number; instances: { x: number; y: number; w: number; h: number; opacity: number }[] }

function batchMixedSceneOps(ops: MixedGpuOp[]) {
  const batches: MixedGpuBatch[] = []
  let current: MixedGpuBatch | null = null

  const flush = () => {
    if (!current) return
    batches.push(current)
    current = null
  }

  for (const op of ops) {
    if (op.kind === "bezier") {
      if (current?.kind === "bezier") {
        current.beziers.push(op.bezier)
        continue
      }
      flush()
      current = { kind: "bezier", beziers: [op.bezier] }
      continue
    }

    if (op.kind === "glow") {
      if (current?.kind === "glow") {
        current.glows.push(op.glow)
        continue
      }
      flush()
      current = { kind: "glow", glows: [op.glow] }
      continue
    }

    if (op.kind === "circle") {
      if (current?.kind === "circle") {
        current.circles.push(op.circle)
        continue
      }
      flush()
      current = { kind: "circle", circles: [op.circle] }
      continue
    }

    if (op.kind === "polygon") {
      if (current?.kind === "polygon") {
        current.polygons.push(op.polygon)
        continue
      }
      flush()
      current = { kind: "polygon", polygons: [op.polygon] }
      continue
    }

    if (op.kind === "shapeRect") {
      if (current?.kind === "shapeRect") {
        current.rects.push(op.rect)
        continue
      }
      flush()
      current = { kind: "shapeRect", rects: [op.rect] }
      continue
    }

    if (op.kind === "rect") {
      if (current?.kind === "rect") {
        current.rects.push(op.rect)
        continue
      }
      flush()
      current = { kind: "rect", rects: [op.rect] }
      continue
    }

    if (op.kind === "linearGradient") {
      if (current?.kind === "linearGradient") {
        current.gradients.push(op.gradient)
        continue
      }
      flush()
      current = { kind: "linearGradient", gradients: [op.gradient] }
      continue
    }

    if (op.kind === "radialGradient") {
      if (current?.kind === "radialGradient") {
        current.gradients.push(op.gradient)
        continue
      }
      flush()
      current = { kind: "radialGradient", gradients: [op.gradient] }
      continue
    }

    if (op.kind === "text") {
      if (current?.kind === "text" && current.text === op.text && current.color === op.color) {
        current.instances.push(op.instance)
        continue
      }
      flush()
      current = { kind: "text", text: op.text, color: op.color, instances: [op.instance] }
      continue
    }

    if (op.kind === "image") {
      if (current?.kind === "image" && current.image === op.image && current.imageW === op.imageW && current.imageH === op.imageH) {
        current.instances.push(op.instance)
        continue
      }
      flush()
      current = { kind: "image", image: op.image, imageW: op.imageW, imageH: op.imageH, instances: [op.instance] }
      continue
    }

    flush()
    batches.push(op)
  }

  flush()
  return batches
}

function collectSupportedMixedScene(ctx: CanvasContext, canvasW: number, canvasH: number) {
  const commands = ctx._commands as CanvasDrawCommand[]
  const vp = ctx.viewport
  const z = vp.zoom
  const ox = vp.x
  const oy = vp.y
  const tx = (wx: number) => Math.round((wx - ox) * z)
  const ty = (wy: number) => Math.round((wy - oy) * z)
  const ts = (ws: number) => Math.max(1, Math.round(ws * z))

  const ops: MixedGpuOp[] = []
  let bounds: IntBounds | null = null
  for (const cmd of commands) {
    if (cmd.kind === "bezier") {
      const x0 = tx(cmd.x0)
      const y0 = ty(cmd.y0)
      const cx = tx(cmd.cx)
      const cy = ty(cmd.cy)
      const x1 = tx(cmd.x1)
      const y1 = ty(cmd.y1)
      const strokeWidth = ts(cmd.width)
      const pad = Math.max(2, Math.ceil(strokeWidth * 0.5) + 2)
      const left = Math.max(0, Math.min(x0, cx, x1) - pad)
      const top = Math.max(0, Math.min(y0, cy, y1) - pad)
      const right = Math.min(canvasW, Math.max(x0, cx, x1) + pad)
      const bottom = Math.min(canvasH, Math.max(y0, cy, y1) + pad)
      const clippedW = right - left
      const clippedH = bottom - top
      if (clippedW <= 0 || clippedH <= 0) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      ops.push({
        kind: "bezier",
        bezier: {
          x: (left / canvasW) * 2 - 1,
          y: 1 - (top / canvasH) * 2,
          w: (clippedW / canvasW) * 2,
          h: -(clippedH / canvasH) * 2,
          boxW: clippedW,
          boxH: clippedH,
          x0: x0 - left,
          y0: y0 - top,
          cx: cx - left,
          cy: cy - top,
          x1: x1 - left,
          y1: y1 - top,
          color: cmd.color,
          strokeWidth,
        },
      })
      continue
    }

    if (cmd.kind === "rect") {
      if (cmd.fill === undefined && cmd.stroke === undefined) continue
      const x = tx(cmd.x)
      const y = ty(cmd.y)
      const w = ts(cmd.w)
      const h = ts(cmd.h)
      const left = Math.max(0, x)
      const top = Math.max(0, y)
      const right = Math.min(canvasW, x + w)
      const bottom = Math.min(canvasH, y + h)
      const clippedW = right - left
      const clippedH = bottom - top
      if (clippedW <= 0 || clippedH <= 0) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      if (cmd.stroke !== undefined || cmd.radius !== 0) {
        ops.push({
          kind: "shapeRect",
          rect: {
            x: (left / canvasW) * 2 - 1,
            y: 1 - (top / canvasH) * 2,
            w: (clippedW / canvasW) * 2,
            h: -(clippedH / canvasH) * 2,
            boxW: clippedW,
            boxH: clippedH,
            radius: Math.min(ts(cmd.radius), Math.floor(Math.min(clippedW, clippedH) * 0.5)),
            strokeWidth: cmd.stroke ? ts(cmd.strokeWidth) : 0,
            fill: cmd.fill,
            stroke: cmd.stroke,
          },
        })
        continue
      }
      ops.push({
        kind: "rect",
        rect: {
          x: (left / canvasW) * 2 - 1,
          y: 1 - (top / canvasH) * 2,
          w: (clippedW / canvasW) * 2,
          h: -(clippedH / canvasH) * 2,
          color: cmd.fill,
        },
      })
      continue
    }

    if (cmd.kind === "glow") {
      const x = tx(cmd.cx - cmd.rx)
      const y = ty(cmd.cy - cmd.ry)
      const w = ts(cmd.rx * 2)
      const h = ts(cmd.ry * 2)
      const left = Math.max(0, x)
      const top = Math.max(0, y)
      const right = Math.min(canvasW, x + w)
      const bottom = Math.min(canvasH, y + h)
      const clippedW = right - left
      const clippedH = bottom - top
      if (clippedW <= 0 || clippedH <= 0) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      ops.push({
        kind: "glow",
        glow: {
          x: (left / canvasW) * 2 - 1,
          y: 1 - (top / canvasH) * 2,
          w: (clippedW / canvasW) * 2,
          h: -(clippedH / canvasH) * 2,
          color: cmd.color,
          intensity: cmd.intensity,
        },
      })
      continue
    }

    if (cmd.kind === "text") {
      const x = tx(cmd.x)
      const y = ty(cmd.y)
      const w = Math.max(1, paint.measureText(cmd.text))
      const h = 16
      const left = Math.max(0, x)
      const top = Math.max(0, y)
      const right = Math.min(canvasW, x + w)
      const bottom = Math.min(canvasH, y + h)
      const clippedW = right - left
      const clippedH = bottom - top
      if (clippedW <= 0 || clippedH <= 0) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      ops.push({
        kind: "text",
        text: cmd.text,
        color: cmd.color,
        instance: {
          x: (x / canvasW) * 2 - 1,
          y: 1 - (y / canvasH) * 2,
          w: (w / canvasW) * 2,
          h: -(h / canvasH) * 2,
          opacity: 1,
        },
      })
      continue
    }

    if (cmd.kind === "circle") {
      const x = tx(cmd.cx - cmd.rx)
      const y = ty(cmd.cy - cmd.ry)
      const w = ts(cmd.rx * 2)
      const h = ts(cmd.ry * 2)
      const left = Math.max(0, x)
      const top = Math.max(0, y)
      const right = Math.min(canvasW, x + w)
      const bottom = Math.min(canvasH, y + h)
      if (right <= left || bottom <= top) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      const strokeNorm = cmd.stroke ? Math.min(1, (cmd.strokeWidth * z) / Math.max(1, Math.min(w, h) * 0.5)) : 0
      ops.push({
        kind: "circle",
        circle: {
          x: (x / canvasW) * 2 - 1,
          y: 1 - (y / canvasH) * 2,
          w: (w / canvasW) * 2,
          h: -(h / canvasH) * 2,
          fill: cmd.fill,
          stroke: cmd.stroke,
          strokeNorm,
        },
      })
      continue
    }

    if (cmd.kind === "polygon") {
      const x = tx(cmd.cx - cmd.radius)
      const y = ty(cmd.cy - cmd.radius)
      const size = ts(cmd.radius * 2)
      const left = Math.max(0, x)
      const top = Math.max(0, y)
      const right = Math.min(canvasW, x + size)
      const bottom = Math.min(canvasH, y + size)
      if (right <= left || bottom <= top) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      const strokeNorm = cmd.stroke ? Math.min(1, (cmd.strokeWidth * z) / Math.max(1, size * 0.5)) : 0
      ops.push({
        kind: "polygon",
        polygon: {
          x: (x / canvasW) * 2 - 1,
          y: 1 - (y / canvasH) * 2,
          w: (size / canvasW) * 2,
          h: -(size / canvasH) * 2,
          fill: cmd.fill,
          stroke: cmd.stroke,
          strokeNorm,
          sides: cmd.sides,
          rotationDeg: cmd.rotation,
        },
      })
      continue
    }

    if (cmd.kind === "image") {
      const x = tx(cmd.x)
      const y = ty(cmd.y)
      const w = ts(cmd.w)
      const h = ts(cmd.h)
      const left = Math.max(0, x)
      const top = Math.max(0, y)
      const right = Math.min(canvasW, x + w)
      const bottom = Math.min(canvasH, y + h)
      const clippedW = right - left
      const clippedH = bottom - top
      if (clippedW <= 0 || clippedH <= 0) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      ops.push({
        kind: "image",
        image: cmd.data,
        imageW: cmd.imgW,
        imageH: cmd.imgH,
        instance: {
          x: (x / canvasW) * 2 - 1,
          y: 1 - (y / canvasH) * 2,
          w: (w / canvasW) * 2,
          h: -(h / canvasH) * 2,
          opacity: cmd.opacity,
        },
      })
      continue
    }

    if (cmd.kind === "linearGradient") {
      const x = tx(cmd.x)
      const y = ty(cmd.y)
      const w = ts(cmd.w)
      const h = ts(cmd.h)
      const left = Math.max(0, x)
      const top = Math.max(0, y)
      const right = Math.min(canvasW, x + w)
      const bottom = Math.min(canvasH, y + h)
      const clippedW = right - left
      const clippedH = bottom - top
      if (clippedW <= 0 || clippedH <= 0) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      const radians = (cmd.angle * Math.PI) / 180
      ops.push({
        kind: "linearGradient",
        gradient: {
          x: (x / canvasW) * 2 - 1,
          y: 1 - (y / canvasH) * 2,
          w: (w / canvasW) * 2,
          h: -(h / canvasH) * 2,
          from: cmd.from,
          to: cmd.to,
          dirX: Math.cos(radians),
          dirY: Math.sin(radians),
        },
      })
      continue
    }

    if (cmd.kind === "radialGradient") {
      const r = ts(cmd.radius)
      const centerX = tx(cmd.cx)
      const centerY = ty(cmd.cy)
      const left = Math.max(0, centerX - r)
      const top = Math.max(0, centerY - r)
      const right = Math.min(canvasW, centerX + r)
      const bottom = Math.min(canvasH, centerY + r)
      if (right <= left || bottom <= top) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      ops.push({
        kind: "radialGradient",
        gradient: {
          x: ((centerX - r) / canvasW) * 2 - 1,
          y: 1 - ((centerY - r) / canvasH) * 2,
          w: ((r * 2) / canvasW) * 2,
          h: -(((r * 2) / canvasH) * 2),
          from: cmd.from,
          to: cmd.to,
        },
      })
      continue
    }

    return null
  }

  return { ops, bounds }
}

class WgpuCanvasPainterBackend implements CanvasPainterBackend {
  name = "wgpu"
  #context: WgpuCanvasContextHandle
  #target: WgpuTargetRecord | null = null
  #images = new WeakMap<Uint8Array, WgpuImageRecord>()
  #textImages = new Map<string, WgpuTextImageRecord>()
  #frame = 0

  constructor() {
    this.#context = createWgpuCanvasContext()
  }

  #getTarget(width: number, height: number) {
    if (this.#target && this.#target.width === width && this.#target.height === height) {
      return this.#target.handle
    }
    if (this.#target) destroyWgpuCanvasTarget(this.#context, this.#target.handle)
    const handle = createWgpuCanvasTarget(this.#context, { width, height })
    this.#target = { width, height, handle }
    return handle
  }

  dispose() {
    if (this.#target) destroyWgpuCanvasTarget(this.#context, this.#target.handle)
    for (const image of this.#textImages.values()) destroyWgpuCanvasImage(this.#context, image.handle)
    this.#textImages.clear()
    // WeakMap is not iterable; image handles intentionally live for backend lifetime.
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
    if (cached) return cached.handle
    const width = Math.max(1, paint.measureText(text))
    const height = 16
    const buf = create(width, height)
    const r = (color >>> 24) & 0xff
    const g = (color >>> 16) & 0xff
    const b = (color >>> 8) & 0xff
    const a = color & 0xff
    paint.drawText(buf, 0, 0, text, r, g, b, a)
    const handle = createWgpuCanvasImage(this.#context, { width, height }, buf.data)
    this.#textImages.set(key, { key, width, height, handle })
    return handle
  }

  paint(buf: PixelBuffer, ctx: CanvasContext, canvasW: number, canvasH: number) {
    this.#frame += 1
    const mixedInfo = collectSupportedMixedScene(ctx, canvasW, canvasH)
    if (mixedInfo && mixedInfo.ops.length > 0) {
      const renderStart = performance.now()
      const target = this.#getTarget(canvasW, canvasH)
      const batches = batchMixedSceneOps(mixedInfo.ops)
      let first = true
      for (const batch of batches) {
        if (batch.kind === "rect") {
          renderWgpuCanvasTargetRectsLayer(this.#context, target, batch.rects, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "bezier") {
          renderWgpuCanvasTargetBeziersLayer(this.#context, target, batch.beziers, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "shapeRect") {
          renderWgpuCanvasTargetShapeRectsLayer(this.#context, target, batch.rects, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "glow") {
          renderWgpuCanvasTargetGlowsLayer(this.#context, target, batch.glows, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "circle") {
          renderWgpuCanvasTargetCirclesLayer(this.#context, target, batch.circles, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "polygon") {
          renderWgpuCanvasTargetPolygonsLayer(this.#context, target, batch.polygons, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "linearGradient") {
          renderWgpuCanvasTargetLinearGradientsLayer(this.#context, target, batch.gradients, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "radialGradient") {
          renderWgpuCanvasTargetRadialGradientsLayer(this.#context, target, batch.gradients, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "text") {
          const imageHandle = this.#getTextImage(batch.text, batch.color)
          renderWgpuCanvasTargetImagesLayer(this.#context, target, imageHandle, batch.instances, first ? 0 : 1, 0x00000000)
        } else {
          const imageHandle = this.#getImage(batch.image, batch.imageW, batch.imageH)
          renderWgpuCanvasTargetImagesLayer(this.#context, target, imageHandle, batch.instances, first ? 0 : 1, 0x00000000)
        }
        first = false
      }
      const renderMs = performance.now() - renderStart
      const fullArea = canvasW * canvasH
      const region = mixedInfo.bounds
        ? {
            x: mixedInfo.bounds.left,
            y: mixedInfo.bounds.top,
            width: mixedInfo.bounds.right - mixedInfo.bounds.left,
            height: mixedInfo.bounds.bottom - mixedInfo.bounds.top,
          }
        : null
      const regionArea = region ? region.width * region.height : fullArea
      const useRegionReadback = !!(region && region.width > 0 && region.height > 0 && regionArea < fullArea * WGPU_REGION_READBACK_THRESHOLD)
      const readbackStart = performance.now()
      const readback = useRegionReadback
        ? readbackWgpuCanvasTargetRegionRGBA(this.#context, target, region)
        : readbackWgpuCanvasTargetRGBA(this.#context, target, canvasW * canvasH * 4)
      const readbackMs = performance.now() - readbackStart
      const copyStart = performance.now()
      if (useRegionReadback && region) {
        const rowBytes = region.width * 4
        for (let row = 0; row < region.height; row++) {
          const srcStart = row * rowBytes
          const srcEnd = srcStart + rowBytes
          const dstStart = ((region.y + row) * canvasW + region.x) * 4
          buf.data.set(readback.data.subarray(srcStart, srcEnd), dstStart)
        }
      } else {
        buf.data.set(readback.data)
      }
      const copyMs = performance.now() - copyStart
      const compositeMs = 0
      const readbackMode = useRegionReadback && region ? `region ${region.width}x${region.height}@(${region.x},${region.y})` : "full"
      logWgpuBackend(`[frame ${this.#frame}] mode=mixed cmds=${mixedInfo.ops.length} batches=${batches.length} readbackMode=${readbackMode} render=${renderMs.toFixed(2)}ms readback=${readbackMs.toFixed(2)}ms copy=${copyMs.toFixed(2)}ms composite=${compositeMs.toFixed(2)}ms total=${(renderMs + readbackMs + copyMs + compositeMs).toFixed(2)}ms size=${canvasW}x${canvasH}`)
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
      const { data } = readbackWgpuCanvasTargetRGBA(this.#context, target, canvasW * canvasH * 4)
      const readbackMs = performance.now() - readbackStart
      const copyStart = performance.now()
      buf.data.set(data)
      const copyMs = performance.now() - copyStart
      const compositeMs = 0
      logWgpuBackend(`[frame ${this.#frame}] mode=image cmds=1 render=${renderMs.toFixed(2)}ms readback=${readbackMs.toFixed(2)}ms copy=${copyMs.toFixed(2)}ms composite=${compositeMs.toFixed(2)}ms total=${(renderMs + readbackMs + copyMs + compositeMs).toFixed(2)}ms size=${canvasW}x${canvasH}`)
      return
    }

    const rects = collectSupportedRects(ctx, canvasW, canvasH)
    if (!rects) {
      paintCanvasCommandsCPU(buf, ctx, canvasW, canvasH)
      return
    }
    if (rects.length === 0) return

    const renderStart = performance.now()
    const target = this.#getTarget(canvasW, canvasH)
    renderWgpuCanvasTargetRects(this.#context, target, rects, 0x00000000)
    const renderMs = performance.now() - renderStart
    const readbackStart = performance.now()
    const { data } = readbackWgpuCanvasTargetRGBA(this.#context, target, canvasW * canvasH * 4)
    const readbackMs = performance.now() - readbackStart
    const copyStart = performance.now()
    buf.data.set(data)
    const copyMs = performance.now() - copyStart
    const compositeMs = 0
    logWgpuBackend(`[frame ${this.#frame}] mode=rects cmds=${rects.length} render=${renderMs.toFixed(2)}ms readback=${readbackMs.toFixed(2)}ms copy=${copyMs.toFixed(2)}ms composite=${compositeMs.toFixed(2)}ms total=${(renderMs + readbackMs + copyMs + compositeMs).toFixed(2)}ms size=${canvasW}x${canvasH}`)
  }
}

let sharedBackend: WgpuCanvasPainterBackend | null = null

export function tryCreateWgpuCanvasPainterBackend(): CanvasPainterBackend | null {
  const probe = probeWgpuCanvasBridge()
  if (!probe.available) return null
  if (!sharedBackend) sharedBackend = new WgpuCanvasPainterBackend()
  return sharedBackend
}
