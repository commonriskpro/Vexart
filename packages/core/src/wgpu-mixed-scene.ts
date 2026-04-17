import { type CanvasContext, type CanvasDrawCommand } from "./canvas"
import { getAtlas } from "./font-atlas"
import { getFont } from "./text-layout"
import type {
  WgpuCanvasBezier,
  WgpuCanvasCircle,
  WgpuCanvasGlow,
  WgpuCanvasLinearGradient,
  WgpuCanvasNebula,
  WgpuCanvasPolygon,
  WgpuCanvasRadialGradient,
  WgpuCanvasRectFill,
  WgpuCanvasShapeRect,
  WgpuCanvasShapeRectCorners,
  WgpuCanvasStarfield,
} from "./wgpu-canvas-bridge"

export type IntBounds = {
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

function measureCanvasText(text: string) {
  const atlas = getAtlas(0, getFont(0))
  let width = 0
  for (const glyph of text) {
    const code = glyph.codePointAt(0)
    if (code === undefined) continue
    const glyphIndex = atlas.indexFor(code)
    if (glyphIndex < 0) return null // glyph outside atlas ranges — unsupported
    width += atlas.glyphWidths[glyphIndex] || atlas.cellWidth
  }
  return {
    width: Math.max(1, Math.round(width)),
    height: atlas.cellHeight,
  }
}

export function collectSupportedRects(ctx: CanvasContext, canvasW: number, canvasH: number) {
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

    rects.push({
      x: (left / canvasW) * 2 - 1,
      y: 1 - (top / canvasH) * 2,
      w: (clippedW / canvasW) * 2,
      h: -(clippedH / canvasH) * 2,
      color: cmd.fill,
    })
  }

  return rects
}

export function collectSupportedSingleImage(ctx: CanvasContext, canvasW: number, canvasH: number) {
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

  return {
    image: cmd,
    instance: {
      x: (x / canvasW) * 2 - 1,
      y: 1 - (y / canvasH) * 2,
      w: (w / canvasW) * 2,
      h: -(h / canvasH) * 2,
      opacity: cmd.opacity,
    },
  }
}

export type MixedGpuCommand =
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

type MixedGpuOpAtom = MixedGpuCommand

export type MixedGpuBatch =
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

export function batchMixedSceneOps(ops: MixedGpuOpAtom[]) {
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
      flush(); current = { kind: "bezier", beziers: [op.bezier] }; continue
    }
    if (op.kind === "glow") {
      if (current?.kind === "glow") { current.glows.push(op.glow); continue }
      flush(); current = { kind: "glow", glows: [op.glow] }; continue
    }
    if (op.kind === "circle") {
      if (current?.kind === "circle") { current.circles.push(op.circle); continue }
      flush(); current = { kind: "circle", circles: [op.circle] }; continue
    }
    if (op.kind === "polygon") {
      if (current?.kind === "polygon") { current.polygons.push(op.polygon); continue }
      flush(); current = { kind: "polygon", polygons: [op.polygon] }; continue
    }
    if (op.kind === "shapeRect") {
      if (current?.kind === "shapeRect") { current.rects.push(op.rect); continue }
      flush(); current = { kind: "shapeRect", rects: [op.rect] }; continue
    }
    if (op.kind === "shapeRectCorners") {
      if (current?.kind === "shapeRectCorners") { current.rects.push(op.rect); continue }
      flush(); current = { kind: "shapeRectCorners", rects: [op.rect] }; continue
    }
    if (op.kind === "rect") {
      if (current?.kind === "rect") { current.rects.push(op.rect); continue }
      flush(); current = { kind: "rect", rects: [op.rect] }; continue
    }
    if (op.kind === "linearGradient") {
      if (current?.kind === "linearGradient") { current.gradients.push(op.gradient); continue }
      flush(); current = { kind: "linearGradient", gradients: [op.gradient] }; continue
    }
    if (op.kind === "radialGradient") {
      if (current?.kind === "radialGradient") { current.gradients.push(op.gradient); continue }
      flush(); current = { kind: "radialGradient", gradients: [op.gradient] }; continue
    }
    if (op.kind === "nebula") {
      if (current?.kind === "nebula") { current.nebulas.push(op.nebula); continue }
      flush(); current = { kind: "nebula", nebulas: [op.nebula] }; continue
    }
    if (op.kind === "starfield") {
      if (current?.kind === "starfield") { current.starfields.push(op.starfield); continue }
      flush(); current = { kind: "starfield", starfields: [op.starfield] }; continue
    }
    if (op.kind === "text") {
      if (current?.kind === "text" && current.text === op.text && current.color === op.color) { current.instances.push(op.instance); continue }
      flush(); current = { kind: "text", text: op.text, color: op.color, instances: [op.instance] }; continue
    }
    if (op.kind === "image") {
      if (current?.kind === "image" && current.image === op.image && current.imageW === op.imageW && current.imageH === op.imageH) { current.instances.push(op.instance); continue }
      flush(); current = { kind: "image", image: op.image, imageW: op.imageW, imageH: op.imageH, instances: [op.instance] }; continue
    }
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

  const ops: MixedGpuCommand[] = []
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
      ops.push({ kind: "bezier", bezier: { x: (left / canvasW) * 2 - 1, y: 1 - (top / canvasH) * 2, w: (clippedW / canvasW) * 2, h: -(clippedH / canvasH) * 2, boxW: clippedW, boxH: clippedH, x0: x0 - left, y0: y0 - top, cx: cx - left, cy: cy - top, x1: x1 - left, y1: y1 - top, color: cmd.color, strokeWidth } })
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
      ops.push({ kind: "bezier", bezier: { x: (left / canvasW) * 2 - 1, y: 1 - (top / canvasH) * 2, w: (clippedW / canvasW) * 2, h: -(clippedH / canvasH) * 2, boxW: clippedW, boxH: clippedH, x0: x0 - left, y0: y0 - top, cx: cx - left, cy: cy - top, x1: x1 - left, y1: y1 - top, color: cmd.color, strokeWidth } })
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
        ops.push({ kind: "shapeRect", rect: { x: (left / canvasW) * 2 - 1, y: 1 - (top / canvasH) * 2, w: (clippedW / canvasW) * 2, h: -(clippedH / canvasH) * 2, boxW: clippedW, boxH: clippedH, radius: Math.min(ts(cmd.radius), Math.floor(Math.min(clippedW, clippedH) * 0.5)), strokeWidth: cmd.stroke ? ts(cmd.strokeWidth) : 0, fill: cmd.fill, stroke: cmd.stroke } })
        continue
      }
      ops.push({ kind: "rect", rect: { x: (left / canvasW) * 2 - 1, y: 1 - (top / canvasH) * 2, w: (clippedW / canvasW) * 2, h: -(clippedH / canvasH) * 2, color: cmd.fill! } })
      continue
    }
    if (cmd.kind === "nebula") {
      const x = tx(cmd.x); const y = ty(cmd.y); const w = ts(cmd.w); const h = ts(cmd.h)
      const left = Math.max(0, x); const top = Math.max(0, y); const right = Math.min(canvasW, x + w); const bottom = Math.min(canvasH, y + h)
      const clippedW = right - left; const clippedH = bottom - top
      if (clippedW <= 0 || clippedH <= 0) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      ops.push({ kind: "nebula", nebula: { x: (x / canvasW) * 2 - 1, y: 1 - (y / canvasH) * 2, w: (w / canvasW) * 2, h: -(h / canvasH) * 2, seed: cmd.seed, scale: ts(cmd.scale), octaves: cmd.octaves, gain: cmd.gain, lacunarity: cmd.lacunarity, warp: cmd.warp, detail: cmd.detail, dust: cmd.dust, stops: normalizeNebulaStops(cmd.stops) } })
      continue
    }
    if (cmd.kind === "starfield") {
      const x = tx(cmd.x); const y = ty(cmd.y); const w = ts(cmd.w); const h = ts(cmd.h)
      const left = Math.max(0, x); const top = Math.max(0, y); const right = Math.min(canvasW, x + w); const bottom = Math.min(canvasH, y + h)
      const clippedW = right - left; const clippedH = bottom - top
      if (clippedW <= 0 || clippedH <= 0) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      ops.push({ kind: "starfield", starfield: { x: (x / canvasW) * 2 - 1, y: 1 - (y / canvasH) * 2, w: (w / canvasW) * 2, h: -(h / canvasH) * 2, seed: cmd.seed, count: cmd.count, clusterCount: cmd.clusterCount, clusterStars: cmd.clusterStars, warmColor: cmd.warmColor, neutralColor: cmd.neutralColor, coolColor: cmd.coolColor } })
      continue
    }
    if (cmd.kind === "glow") {
      const x = tx(cmd.cx - cmd.rx); const y = ty(cmd.cy - cmd.ry); const w = ts(cmd.rx * 2); const h = ts(cmd.ry * 2)
      const left = Math.max(0, x); const top = Math.max(0, y); const right = Math.min(canvasW, x + w); const bottom = Math.min(canvasH, y + h)
      const clippedW = right - left; const clippedH = bottom - top
      if (clippedW <= 0 || clippedH <= 0) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      ops.push({ kind: "glow", glow: { x: (left / canvasW) * 2 - 1, y: 1 - (top / canvasH) * 2, w: (clippedW / canvasW) * 2, h: -(clippedH / canvasH) * 2, color: cmd.color, intensity: cmd.intensity } })
      continue
    }
    if (cmd.kind === "text") {
      const metrics = measureCanvasText(cmd.text)
      if (!metrics) return null
      const x = tx(cmd.x); const y = ty(cmd.y); const w = metrics.width; const h = metrics.height
      const left = Math.max(0, x); const top = Math.max(0, y); const right = Math.min(canvasW, x + w); const bottom = Math.min(canvasH, y + h)
      const clippedW = right - left; const clippedH = bottom - top
      if (clippedW <= 0 || clippedH <= 0) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      ops.push({ kind: "text", text: cmd.text, color: cmd.color, instance: { x: (x / canvasW) * 2 - 1, y: 1 - (y / canvasH) * 2, w: (w / canvasW) * 2, h: -(h / canvasH) * 2, opacity: 1 } })
      continue
    }
    if (cmd.kind === "circle") {
      const x = tx(cmd.cx - cmd.rx); const y = ty(cmd.cy - cmd.ry); const w = ts(cmd.rx * 2); const h = ts(cmd.ry * 2)
      const left = Math.max(0, x); const top = Math.max(0, y); const right = Math.min(canvasW, x + w); const bottom = Math.min(canvasH, y + h)
      if (right <= left || bottom <= top) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      const strokeNorm = cmd.stroke ? Math.min(1, (cmd.strokeWidth * z) / Math.max(1, Math.min(w, h) * 0.5)) : 0
      ops.push({ kind: "circle", circle: { x: (x / canvasW) * 2 - 1, y: 1 - (y / canvasH) * 2, w: (w / canvasW) * 2, h: -(h / canvasH) * 2, fill: cmd.fill, stroke: cmd.stroke, strokeNorm } })
      continue
    }
    if (cmd.kind === "polygon") {
      const x = tx(cmd.cx - cmd.radius); const y = ty(cmd.cy - cmd.radius); const size = ts(cmd.radius * 2)
      const left = Math.max(0, x); const top = Math.max(0, y); const right = Math.min(canvasW, x + size); const bottom = Math.min(canvasH, y + size)
      if (right <= left || bottom <= top) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      const strokeNorm = cmd.stroke ? Math.min(1, (cmd.strokeWidth * z) / Math.max(1, size * 0.5)) : 0
      ops.push({ kind: "polygon", polygon: { x: (x / canvasW) * 2 - 1, y: 1 - (y / canvasH) * 2, w: (size / canvasW) * 2, h: -(size / canvasH) * 2, fill: cmd.fill, stroke: cmd.stroke, strokeNorm, sides: cmd.sides, rotationDeg: cmd.rotation } })
      continue
    }
    if (cmd.kind === "image") {
      const x = tx(cmd.x); const y = ty(cmd.y); const w = ts(cmd.w); const h = ts(cmd.h)
      const left = Math.max(0, x); const top = Math.max(0, y); const right = Math.min(canvasW, x + w); const bottom = Math.min(canvasH, y + h)
      const clippedW = right - left; const clippedH = bottom - top
      if (clippedW <= 0 || clippedH <= 0) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      ops.push({ kind: "image", image: cmd.data, imageW: cmd.imgW, imageH: cmd.imgH, instance: { x: (x / canvasW) * 2 - 1, y: 1 - (y / canvasH) * 2, w: (w / canvasW) * 2, h: -(h / canvasH) * 2, opacity: cmd.opacity } })
      continue
    }
    if (cmd.kind === "linearGradient") {
      const x = tx(cmd.x); const y = ty(cmd.y); const w = ts(cmd.w); const h = ts(cmd.h)
      const left = Math.max(0, x); const top = Math.max(0, y); const right = Math.min(canvasW, x + w); const bottom = Math.min(canvasH, y + h)
      const clippedW = right - left; const clippedH = bottom - top
      if (clippedW <= 0 || clippedH <= 0) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      const radians = (cmd.angle * Math.PI) / 180
      ops.push({ kind: "linearGradient", gradient: { x: (x / canvasW) * 2 - 1, y: 1 - (y / canvasH) * 2, w: (w / canvasW) * 2, h: -(h / canvasH) * 2, boxW: w, boxH: h, radius: 0, from: cmd.from, to: cmd.to, dirX: Math.cos(radians), dirY: Math.sin(radians) } })
      continue
    }
    if (cmd.kind === "radialGradient") {
      const r = ts(cmd.radius); const centerX = tx(cmd.cx); const centerY = ty(cmd.cy)
      const left = Math.max(0, centerX - r); const top = Math.max(0, centerY - r); const right = Math.min(canvasW, centerX + r); const bottom = Math.min(canvasH, centerY + r)
      if (right <= left || bottom <= top) continue
      bounds = unionBounds(bounds, boundsFromRect(left, top, right, bottom))
      ops.push({ kind: "radialGradient", gradient: { x: ((centerX - r) / canvasW) * 2 - 1, y: 1 - ((centerY - r) / canvasH) * 2, w: ((r * 2) / canvasW) * 2, h: -(((r * 2) / canvasH) * 2), boxW: r * 2, boxH: r * 2, radius: r, from: cmd.from, to: cmd.to } })
      continue
    }
    return null
  }
  return { ops, bounds }
}
