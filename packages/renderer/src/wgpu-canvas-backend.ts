import type { RasterSurface } from "./render-surface"
import { appendFileSync } from "node:fs"
import type { CanvasPainterBackend } from "./canvas-backend"
import { type CanvasContext, type CanvasDrawCommand } from "./canvas"
import { paintCanvasCommandsCPU } from "./canvas-raster-painter"
import { getAtlas } from "./font-atlas"
import { getFont } from "./text-layout"
import { createGpuTextImage, measureRasterTextWidth, readbackTargetToSurface } from "./gpu-raster-staging"
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
  renderWgpuCanvasTargetImageLayer,
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
  type WgpuCanvasCircle,
  type WgpuCanvasBezier,
  type WgpuCanvasGlyphInstance,
  type WgpuCanvasContextHandle,
  type WgpuCanvasGlow,
  type WgpuCanvasImageHandle,
  type WgpuCanvasNebula,
  type WgpuCanvasPolygon,
  type WgpuCanvasShapeRectCorners,
  type WgpuCanvasShapeRect,
  type WgpuCanvasStarfield,
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

type WgpuGlyphAtlasRecord = {
  handle: WgpuCanvasImageHandle
  cellWidth: number
  cellHeight: number
  columns: number
  rows: number
  glyphWidths: Float32Array
}

export type WgpuCanvasPainterCacheStats = {
  targetCount: number
  targetBytes: number
  textImageCount: number
  textImageBytes: number
}

const MAX_WGPU_CANVAS_TEXT_IMAGES = 128

let wgpuCanvasPainterStatsProvider: (() => WgpuCanvasPainterCacheStats) | null = null

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
  | { kind: "shapeRectCorners"; rect: WgpuCanvasShapeRectCorners }
  | { kind: "text"; text: string; color: number; instance: { x: number; y: number; w: number; h: number; opacity: number } }
  | { kind: "rect"; rect: WgpuCanvasRectFill }
  | { kind: "linearGradient"; gradient: WgpuCanvasLinearGradient }
  | { kind: "radialGradient"; gradient: WgpuCanvasRadialGradient }
  | { kind: "nebula"; nebula: WgpuCanvasNebula }
  | { kind: "starfield"; starfield: WgpuCanvasStarfield }
  | { kind: "image"; image: Uint8Array; imageW: number; imageH: number; instance: { x: number; y: number; w: number; h: number; opacity: number } }

type MixedGpuBatch =
  | { kind: "bezier"; beziers: WgpuCanvasBezier[] }
  | { kind: "glow"; glows: WgpuCanvasGlow[] }
  | { kind: "circle"; circles: WgpuCanvasCircle[] }
  | { kind: "polygon"; polygons: WgpuCanvasPolygon[] }
  | { kind: "shapeRect"; rects: WgpuCanvasShapeRect[] }
  | { kind: "shapeRectCorners"; rects: WgpuCanvasShapeRectCorners[] }
  | { kind: "text"; text: string; color: number; instances: { x: number; y: number; w: number; h: number; opacity: number }[] }
  | { kind: "rect"; rects: WgpuCanvasRectFill[] }
  | { kind: "linearGradient"; gradients: WgpuCanvasLinearGradient[] }
  | { kind: "radialGradient"; gradients: WgpuCanvasRadialGradient[] }
  | { kind: "nebula"; nebulas: WgpuCanvasNebula[] }
  | { kind: "starfield"; starfields: WgpuCanvasStarfield[] }
  | { kind: "image"; image: Uint8Array; imageW: number; imageH: number; instances: { x: number; y: number; w: number; h: number; opacity: number }[] }

function sampleStops(stops: { color: number; position: number }[], position: number) {
  if (stops.length === 0) return 0x00000000
  const sorted = stops.slice().sort((a, b) => a.position - b.position)
  if (position <= sorted[0].position) return sorted[0].color
  if (position >= sorted[sorted.length - 1].position) return sorted[sorted.length - 1].color
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i]
    const to = sorted[i + 1]
    if (position < from.position || position > to.position) continue
    const span = Math.max(0.0001, to.position - from.position)
    const t = (position - from.position) / span
    const mix = (a: number, b: number) => Math.round(a + (b - a) * t)
    return (
      (mix((from.color >>> 24) & 0xff, (to.color >>> 24) & 0xff) << 24) |
      (mix((from.color >>> 16) & 0xff, (to.color >>> 16) & 0xff) << 16) |
      (mix((from.color >>> 8) & 0xff, (to.color >>> 8) & 0xff) << 8) |
      mix(from.color & 0xff, to.color & 0xff)
    ) >>> 0
  }
  return sorted[sorted.length - 1].color
}

function normalizeNebulaStops(stops: { color: number; position: number }[]) {
  return [0, 1 / 3, 2 / 3, 1].map((position) => ({ color: sampleStops(stops, position), position })) as WgpuCanvasNebula["stops"]
}

export function batchMixedSceneOps(ops: MixedGpuOp[]) {
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

    if (op.kind === "shapeRectCorners") {
      if (current?.kind === "shapeRectCorners") {
        current.rects.push(op.rect)
        continue
      }
      flush()
      current = { kind: "shapeRectCorners", rects: [op.rect] }
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

    if (op.kind === "nebula") {
      if (current?.kind === "nebula") {
        current.nebulas.push(op.nebula)
        continue
      }
      flush()
      current = { kind: "nebula", nebulas: [op.nebula] }
      continue
    }

    if (op.kind === "starfield") {
      if (current?.kind === "starfield") {
        current.starfields.push(op.starfield)
        continue
      }
      flush()
      current = { kind: "starfield", starfields: [op.starfield] }
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

export function collectSupportedMixedScene(ctx: CanvasContext, canvasW: number, canvasH: number) {
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
    if (cmd.kind === "line") {
      const mx = (cmd.x0 + cmd.x1) * 0.5
      const my = (cmd.y0 + cmd.y1) * 0.5
      const x0 = tx(cmd.x0)
      const y0 = ty(cmd.y0)
      const cx = tx(mx)
      const cy = ty(my)
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
          color: cmd.fill!,
        },
      })
      continue
    }

    if (cmd.kind === "nebula") {
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
        kind: "nebula",
        nebula: {
          x: (x / canvasW) * 2 - 1,
          y: 1 - (y / canvasH) * 2,
          w: (w / canvasW) * 2,
          h: -(h / canvasH) * 2,
          seed: cmd.seed,
          scale: ts(cmd.scale),
          octaves: cmd.octaves,
          gain: cmd.gain,
          lacunarity: cmd.lacunarity,
          warp: cmd.warp,
          detail: cmd.detail,
          dust: cmd.dust,
          stops: normalizeNebulaStops(cmd.stops),
        },
      })
      continue
    }

    if (cmd.kind === "starfield") {
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
        kind: "starfield",
        starfield: {
          x: (x / canvasW) * 2 - 1,
          y: 1 - (y / canvasH) * 2,
          w: (w / canvasW) * 2,
          h: -(h / canvasH) * 2,
          seed: cmd.seed,
          count: cmd.count,
          clusterCount: cmd.clusterCount,
          clusterStars: cmd.clusterStars,
          warmColor: cmd.warmColor,
          neutralColor: cmd.neutralColor,
          coolColor: cmd.coolColor,
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
      const w = measureRasterTextWidth(cmd.text)
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
          boxW: w,
          boxH: h,
          radius: 0,
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
          boxW: r * 2,
          boxH: r * 2,
          radius: r,
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
    for (const atlas of this.#glyphAtlases.values()) destroyWgpuCanvasImage(this.#context, atlas.handle)
    this.#glyphAtlases.clear()
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
    const handle = createWgpuCanvasImage(this.#context, { width, height }, rgba)
    const record = {
      handle,
      cellWidth: atlas.cellWidth,
      cellHeight: atlas.cellHeight,
      columns,
      rows,
      glyphWidths: atlas.glyphWidths,
    }
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
        if (batch.kind === "rect") {
          renderWgpuCanvasTargetRectsLayer(this.#context, target, batch.rects, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "bezier") {
          renderWgpuCanvasTargetBeziersLayer(this.#context, target, batch.beziers, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "shapeRect") {
          renderWgpuCanvasTargetShapeRectsLayer(this.#context, target, batch.rects, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "shapeRectCorners") {
          renderWgpuCanvasTargetShapeRectCornersLayer(this.#context, target, batch.rects, first ? 0 : 1, 0x00000000)
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
        } else if (batch.kind === "nebula") {
          renderWgpuCanvasTargetNebulasLayer(this.#context, target, batch.nebulas, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "starfield") {
          renderWgpuCanvasTargetStarfieldsLayer(this.#context, target, batch.starfields, first ? 0 : 1, 0x00000000)
        } else if (batch.kind === "text") {
          if (supportsWgpuCanvasGlyphLayer()) {
            const atlas = this.#getGlyphAtlas(0)
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
                const advance = (advancePx / canvasW) * 2
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
                cursorX += advance
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
      const readback = readbackTargetToSurface(this.#context, target, surface, { region: useRegionReadback ? region : null })
      const readbackMs = performance.now() - readbackStart
      const copyStart = performance.now()
      const copyMs = performance.now() - copyStart
      const compositeMs = 0
      const readbackMode = readback.mode === "region" && region ? `region ${region.width}x${region.height}@(${region.x},${region.y})` : "full"
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
      readbackTargetToSurface(this.#context, target, surface)
      const readbackMs = performance.now() - readbackStart
      const copyStart = performance.now()
      const copyMs = performance.now() - copyStart
      const compositeMs = 0
      logWgpuBackend(`[frame ${this.#frame}] mode=image cmds=1 render=${renderMs.toFixed(2)}ms readback=${readbackMs.toFixed(2)}ms copy=${copyMs.toFixed(2)}ms composite=${compositeMs.toFixed(2)}ms total=${(renderMs + readbackMs + copyMs + compositeMs).toFixed(2)}ms size=${canvasW}x${canvasH}`)
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
    const copyStart = performance.now()
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
