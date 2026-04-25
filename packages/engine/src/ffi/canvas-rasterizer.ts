import { CanvasContext, type DrawCmd } from "./canvas"

type Rgba = {
  r: number
  g: number
  b: number
  a: number
}

type Point = {
  x: number
  y: number
}

type RasterizedCanvas = {
  data: Uint8Array
  width: number
  height: number
  commandCount: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function rgba(color: number, opacity = 1): Rgba {
  return {
    r: (color >>> 24) & 0xff,
    g: (color >>> 16) & 0xff,
    b: (color >>> 8) & 0xff,
    a: clamp(Math.round((color & 0xff) * opacity), 0, 255),
  }
}

function mixColor(from: number, to: number, t: number) {
  const a = rgba(from)
  const b = rgba(to)
  const k = clamp(t, 0, 1)
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
    a: Math.round(a.a + (b.a - a.a) * k),
  }
}

function blend(data: Uint8Array, width: number, height: number, x: number, y: number, color: Rgba) {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || py < 0 || px >= width || py >= height || color.a <= 0) return
  const index = (py * width + px) * 4
  const srcA = color.a / 255
  const dstA = data[index + 3] / 255
  const outA = srcA + dstA * (1 - srcA)
  if (outA <= 0) return
  data[index] = Math.round((color.r * srcA + data[index] * dstA * (1 - srcA)) / outA)
  data[index + 1] = Math.round((color.g * srcA + data[index + 1] * dstA * (1 - srcA)) / outA)
  data[index + 2] = Math.round((color.b * srcA + data[index + 2] * dstA * (1 - srcA)) / outA)
  data[index + 3] = Math.round(outA * 255)
}

function fillRect(data: Uint8Array, width: number, height: number, x: number, y: number, w: number, h: number, color: Rgba, radius = 0) {
  const left = Math.max(0, Math.floor(x))
  const top = Math.max(0, Math.floor(y))
  const right = Math.min(width, Math.ceil(x + w))
  const bottom = Math.min(height, Math.ceil(y + h))
  const r = clamp(radius, 0, Math.min(w, h) / 2)
  for (let py = top; py < bottom; py++) {
    for (let px = left; px < right; px++) {
      if (r > 0) {
        const cx = px < x + r ? x + r : px > x + w - r ? x + w - r : px
        const cy = py < y + r ? y + r : py > y + h - r ? y + h - r : py
        const dx = px - cx
        const dy = py - cy
        if (dx * dx + dy * dy > r * r) continue
      }
      blend(data, width, height, px, py, color)
    }
  }
}

function strokeRect(data: Uint8Array, width: number, height: number, x: number, y: number, w: number, h: number, color: Rgba, strokeWidth: number, radius = 0) {
  const s = Math.max(1, Math.round(strokeWidth))
  fillRect(data, width, height, x, y, w, s, color, radius)
  fillRect(data, width, height, x, y + h - s, w, s, color, radius)
  fillRect(data, width, height, x, y, s, h, color, radius)
  fillRect(data, width, height, x + w - s, y, s, h, color, radius)
}

function drawLine(data: Uint8Array, width: number, height: number, a: Point, b: Point, color: Rgba, lineWidth: number) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  const steps = Math.max(1, Math.ceil(length * 2))
  const radius = Math.max(0.5, lineWidth / 2)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = a.x + dx * t
    const y = a.y + dy * t
    fillRect(data, width, height, x - radius, y - radius, radius * 2, radius * 2, color, radius)
  }
}

function drawBezier(data: Uint8Array, width: number, height: number, start: Point, control: Point, end: Point, color: Rgba, lineWidth: number) {
  let previous = start
  for (let i = 1; i <= 48; i++) {
    const t = i / 48
    const inv = 1 - t
    const point = {
      x: inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
      y: inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y,
    }
    drawLine(data, width, height, previous, point, color, lineWidth)
    previous = point
  }
}

function drawEllipse(data: Uint8Array, width: number, height: number, cx: number, cy: number, rx: number, ry: number, fill: Rgba | null, stroke: Rgba | null, strokeWidth: number) {
  const left = Math.max(0, Math.floor(cx - rx - strokeWidth))
  const top = Math.max(0, Math.floor(cy - ry - strokeWidth))
  const right = Math.min(width, Math.ceil(cx + rx + strokeWidth))
  const bottom = Math.min(height, Math.ceil(cy + ry + strokeWidth))
  const strokeBand = Math.max(0.01, strokeWidth / Math.max(rx, ry))
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const nx = (x + 0.5 - cx) / Math.max(rx, 0.001)
      const ny = (y + 0.5 - cy) / Math.max(ry, 0.001)
      const d = nx * nx + ny * ny
      if (fill && d <= 1) blend(data, width, height, x, y, fill)
      if (stroke && Math.abs(Math.sqrt(d) - 1) <= strokeBand) blend(data, width, height, x, y, stroke)
    }
  }
}

function polygonPoints(cx: number, cy: number, radius: number, sides: number, rotation: number) {
  const count = Math.max(3, Math.floor(sides))
  const points: Point[] = []
  const base = (rotation * Math.PI) / 180
  for (let i = 0; i < count; i++) {
    const angle = base + (i / count) * Math.PI * 2
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius })
  }
  return points
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]
    const pj = polygon[j]
    if (!pi || !pj) continue
    const intersects = pi.y > point.y !== pj.y > point.y && point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y || 1) + pi.x
    if (intersects) inside = !inside
  }
  return inside
}

function drawPolygon(data: Uint8Array, width: number, height: number, points: Point[], fill: Rgba | null, stroke: Rgba | null, strokeWidth: number) {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const left = Math.max(0, Math.floor(Math.min(...xs) - strokeWidth))
  const top = Math.max(0, Math.floor(Math.min(...ys) - strokeWidth))
  const right = Math.min(width, Math.ceil(Math.max(...xs) + strokeWidth))
  const bottom = Math.min(height, Math.ceil(Math.max(...ys) + strokeWidth))
  if (fill) {
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        if (pointInPolygon({ x: x + 0.5, y: y + 0.5 }, points)) blend(data, width, height, x, y, fill)
      }
    }
  }
  if (!stroke) return
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a && b) drawLine(data, width, height, a, b, stroke, strokeWidth)
  }
}

function drawGlow(data: Uint8Array, width: number, height: number, cx: number, cy: number, rx: number, ry: number, color: number, intensity: number) {
  const base = rgba(color, clamp(intensity / 100, 0, 1))
  const left = Math.max(0, Math.floor(cx - rx))
  const top = Math.max(0, Math.floor(cy - ry))
  const right = Math.min(width, Math.ceil(cx + rx))
  const bottom = Math.min(height, Math.ceil(cy + ry))
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const dx = (x + 0.5 - cx) / Math.max(rx, 0.001)
      const dy = (y + 0.5 - cy) / Math.max(ry, 0.001)
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance > 1) continue
      blend(data, width, height, x, y, { ...base, a: Math.round(base.a * (1 - distance) * (1 - distance)) })
    }
  }
}

function drawText(data: Uint8Array, width: number, height: number, x: number, y: number, text: string, color: Rgba) {
  const charW = 6
  const charH = 9
  for (let i = 0; i < text.length; i++) {
    if (text[i] === " ") continue
    const px = x + i * charW
    fillRect(data, width, height, px, y, 4, charH, { ...color, a: Math.round(color.a * 0.82) }, 1)
    fillRect(data, width, height, px + 1, y + 1, 2, charH - 2, color, 1)
  }
}

function drawImage(data: Uint8Array, width: number, height: number, x: number, y: number, w: number, h: number, src: Uint8Array, imgW: number, imgH: number, opacity: number) {
  const left = Math.max(0, Math.floor(x))
  const top = Math.max(0, Math.floor(y))
  const right = Math.min(width, Math.ceil(x + w))
  const bottom = Math.min(height, Math.ceil(y + h))
  for (let py = top; py < bottom; py++) {
    for (let px = left; px < right; px++) {
      const sx = clamp(Math.floor(((px - x) / Math.max(w, 1)) * imgW), 0, imgW - 1)
      const sy = clamp(Math.floor(((py - y) / Math.max(h, 1)) * imgH), 0, imgH - 1)
      const index = (sy * imgW + sx) * 4
      blend(data, width, height, px, py, { r: src[index] ?? 0, g: src[index + 1] ?? 0, b: src[index + 2] ?? 0, a: Math.round((src[index + 3] ?? 0) * opacity) })
    }
  }
}

function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state)
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state)
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296
  }
}

function replay(command: DrawCmd, data: Uint8Array, width: number, height: number) {
  if (command.kind === "rect") {
    if (command.fill !== undefined) fillRect(data, width, height, command.x, command.y, command.w, command.h, rgba(command.fill), command.radius)
    if (command.stroke !== undefined) strokeRect(data, width, height, command.x, command.y, command.w, command.h, rgba(command.stroke), command.strokeWidth, command.radius)
    return
  }
  if (command.kind === "line") {
    drawLine(data, width, height, { x: command.x0, y: command.y0 }, { x: command.x1, y: command.y1 }, rgba(command.color), command.width)
    return
  }
  if (command.kind === "bezier") {
    drawBezier(data, width, height, { x: command.x0, y: command.y0 }, { x: command.cx, y: command.cy }, { x: command.x1, y: command.y1 }, rgba(command.color), command.width)
    return
  }
  if (command.kind === "circle") {
    drawEllipse(data, width, height, command.cx, command.cy, command.rx, command.ry, command.fill === undefined ? null : rgba(command.fill), command.stroke === undefined ? null : rgba(command.stroke), command.strokeWidth)
    return
  }
  if (command.kind === "polygon") {
    drawPolygon(data, width, height, polygonPoints(command.cx, command.cy, command.radius, command.sides, command.rotation), command.fill === undefined ? null : rgba(command.fill), command.stroke === undefined ? null : rgba(command.stroke), command.strokeWidth)
    return
  }
  if (command.kind === "text") {
    drawText(data, width, height, command.x, command.y, command.text, rgba(command.color))
    return
  }
  if (command.kind === "glow") {
    drawGlow(data, width, height, command.cx, command.cy, command.rx, command.ry, command.color, command.intensity)
    return
  }
  if (command.kind === "image") {
    drawImage(data, width, height, command.x, command.y, command.w, command.h, command.data, command.imgW, command.imgH, command.opacity)
    return
  }
  if (command.kind === "radialGradient") {
    const left = Math.max(0, Math.floor(command.cx - command.radius))
    const top = Math.max(0, Math.floor(command.cy - command.radius))
    const right = Math.min(width, Math.ceil(command.cx + command.radius))
    const bottom = Math.min(height, Math.ceil(command.cy + command.radius))
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const distance = Math.hypot(x + 0.5 - command.cx, y + 0.5 - command.cy) / Math.max(command.radius, 1)
        if (distance <= 1) blend(data, width, height, x, y, mixColor(command.from, command.to, distance))
      }
    }
    return
  }
  if (command.kind === "linearGradient") {
    const angle = (command.angle * Math.PI) / 180
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    const left = Math.max(0, Math.floor(command.x))
    const top = Math.max(0, Math.floor(command.y))
    const right = Math.min(width, Math.ceil(command.x + command.w))
    const bottom = Math.min(height, Math.ceil(command.y + command.h))
    const length = Math.abs(command.w * dx) + Math.abs(command.h * dy) || 1
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const t = (((x - command.x) * dx + (y - command.y) * dy) / length) + 0.5
        blend(data, width, height, x, y, mixColor(command.from, command.to, t))
      }
    }
    return
  }
  if (command.kind === "starfield") {
    const rand = random(command.seed)
    for (let i = 0; i < command.count; i++) {
      const x = command.x + rand() * command.w
      const y = command.y + rand() * command.h
      const pick = rand()
      const color = pick < 0.33 ? command.warmColor : pick < 0.66 ? command.neutralColor : command.coolColor
      drawGlow(data, width, height, x, y, 2 + rand() * 3, 2 + rand() * 3, color, 55 + rand() * 30)
    }
    return
  }
  if (command.kind === "nebula") {
    const rand = random(command.seed)
    for (const stop of command.stops) {
      const cx = command.x + rand() * command.w
      const cy = command.y + rand() * command.h
      const radius = Math.max(command.w, command.h) * clamp(stop.position, 0.05, 1)
      drawGlow(data, width, height, cx, cy, radius, radius * (0.55 + rand() * 0.5), stop.color, command.dust)
    }
  }
}

/** @public */
export function rasterizeCanvasCommands(commands: DrawCmd[], width: number, height: number): RasterizedCanvas | null {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  if (w > 4096 || h > 4096) return null
  const data = new Uint8Array(w * h * 4)
  for (const command of commands) replay(command, data, w, h)
  return { data, width: w, height: h, commandCount: commands.length }
}

/** @public */
export function rasterizeCanvas(onDraw: (ctx: CanvasContext) => void, width: number, height: number, viewport?: { x: number; y: number; zoom: number }): RasterizedCanvas | null {
  const ctx = new CanvasContext(viewport)
  onDraw(ctx)
  return rasterizeCanvasCommands(ctx._commands, width, height)
}
