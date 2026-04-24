/**
 * Imperative drawing API for canvas nodes.
 * Draw commands are buffered during onDraw and consumed by the GPU renderer.
 */

// NOTE: paint-legacy import removed per Slice 9 migration (DEC-004, REQ-NB-002).
// canvas.ts draw commands are now consumed by the gpu-renderer-backend via
// the wgpu-mixed-scene path; the legacy CPU paint path is no longer referenced.

// ── Draw command types ──

/** @public */
export type LineCmd = {
  kind: "line"
  x0: number; y0: number; x1: number; y1: number
  color: number
  width: number
}

/** @public */
export type BezierCmd = {
  kind: "bezier"
  x0: number; y0: number
  cx: number; cy: number
  x1: number; y1: number
  color: number
  width: number
}

/** @public */
export type CircleCmd = {
  kind: "circle"
  cx: number; cy: number
  rx: number; ry: number
  fill?: number
  stroke?: number
  strokeWidth: number
}

/** @public */
export type RectCmd = {
  kind: "rect"
  x: number; y: number
  w: number; h: number
  fill?: number
  stroke?: number
  strokeWidth: number
  radius: number
}

/** @public */
export type PolygonCmd = {
  kind: "polygon"
  cx: number; cy: number
  radius: number
  sides: number
  rotation: number
  fill?: number
  stroke?: number
  strokeWidth: number
}

/** @public */
export type TextCmd = {
  kind: "text"
  x: number; y: number
  text: string
  color: number
}

/** @public */
export type GlowCmd = {
  kind: "glow"
  cx: number; cy: number
  rx: number; ry: number
  color: number
  intensity: number
}

/** @public */
export type ImageCmd = {
  kind: "image"
  x: number; y: number
  w: number; h: number
  data: Uint8Array
  imgW: number; imgH: number
  opacity: number
  opaque?: boolean
}

/** @public */
export type RadialGradientCmd = {
  kind: "radialGradient"
  cx: number; cy: number
  radius: number
  from: number  // center color
  to: number    // edge color
}

/** @public */
export type LinearGradientCmd = {
  kind: "linearGradient"
  x: number; y: number
  w: number; h: number
  from: number; to: number
  angle: number
}

/** @public */
export type NebulaCmd = {
  kind: "nebula"
  x: number; y: number
  w: number; h: number
  stops: { color: number; position: number }[]
  seed: number
  scale: number
  octaves: number
  gain: number
  lacunarity: number
  warp: number
  detail: number
  dust: number
}

/** @public */
export type StarfieldCmd = {
  kind: "starfield"
  x: number; y: number
  w: number; h: number
  seed: number
  count: number
  clusterCount: number
  clusterStars: number
  warmColor: number
  neutralColor: number
  coolColor: number
}

/** @public */
export type DrawCmd = LineCmd | BezierCmd | CircleCmd | RectCmd | PolygonCmd | TextCmd | GlowCmd | ImageCmd | RadialGradientCmd | LinearGradientCmd | NebulaCmd | StarfieldCmd

/** @public */
export type CanvasDrawCommand = DrawCmd

/** @public */
export type CanvasDisplayList = {
  version: 1
  commands: DrawCmd[]
}

// ── Viewport ──

/** @public */
export type Viewport = {
  x: number
  y: number
  zoom: number
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }

// ── Style shorthand ──

/** @public */
export type StrokeStyle = {
  color: number
  width?: number
}

/** @public */
export type FillStyle = {
  color: number
}

/** @public */
export type ShapeStyle = {
  fill?: number
  stroke?: number
  strokeWidth?: number
  glow?: { color: number; radius: number; intensity?: number }
}

// ── CanvasContext ──

/** @public */
export class CanvasContext {
  /** @internal draw command buffer — flushed by paintCanvasCommands */
  _commands: DrawCmd[] = []

  /** Current viewport transform — set by the render loop from props */
  viewport: Viewport

  constructor(viewport?: Viewport) {
    this.viewport = viewport ?? DEFAULT_VIEWPORT
  }

  /** Clear the command buffer (called at start of each frame) */
  _reset(viewport?: Viewport) {
    this._commands.length = 0
    this.viewport = viewport ?? DEFAULT_VIEWPORT
  }

  // ── Drawing primitives ──

  /** Draw an anti-aliased line segment. */
  line(x0: number, y0: number, x1: number, y1: number, style: StrokeStyle) {
    this._commands.push({
      kind: "line",
      x0, y0, x1, y1,
      color: style.color,
      width: style.width ?? 1,
    })
  }

  /** Draw a quadratic bezier curve. */
  bezier(
    x0: number, y0: number,
    cx: number, cy: number,
    x1: number, y1: number,
    style: StrokeStyle,
  ) {
    this._commands.push({
      kind: "bezier",
      x0, y0, cx, cy, x1, y1,
      color: style.color,
      width: style.width ?? 1,
    })
  }

  /** Draw a circle or ellipse. */
  circle(cx: number, cy: number, radius: number, style?: ShapeStyle) {
    const s = style ?? {}
    this._commands.push({
      kind: "circle",
      cx, cy,
      rx: radius, ry: radius,
      fill: s.fill,
      stroke: s.stroke,
      strokeWidth: s.strokeWidth ?? 1,
    })
    if (s.glow) {
      this._commands.push({
        kind: "glow",
        cx, cy,
        rx: radius + s.glow.radius,
        ry: radius + s.glow.radius,
        color: s.glow.color,
        intensity: s.glow.intensity ?? 80,
      })
    }
  }

  /** Draw an ellipse. */
  ellipse(cx: number, cy: number, rx: number, ry: number, style?: ShapeStyle) {
    const s = style ?? {}
    this._commands.push({
      kind: "circle",
      cx, cy, rx, ry,
      fill: s.fill,
      stroke: s.stroke,
      strokeWidth: s.strokeWidth ?? 1,
    })
  }

  /** Draw a regular polygon (3=triangle, 4=square, 5=pentagon, 6=hexagon, etc). */
  polygon(cx: number, cy: number, radius: number, sides: number, style?: ShapeStyle & { rotation?: number }) {
    const s = style ?? {}
    this._commands.push({
      kind: "polygon",
      cx, cy, radius, sides,
      rotation: s.rotation ?? 0,
      fill: s.fill,
      stroke: s.stroke,
      strokeWidth: s.strokeWidth ?? 1,
    })
    if (s.glow) {
      this._commands.push({
        kind: "glow",
        cx, cy,
        rx: radius + s.glow.radius,
        ry: radius + s.glow.radius,
        color: s.glow.color,
        intensity: s.glow.intensity ?? 80,
      })
    }
  }

  /** Draw a rectangle (optionally rounded). */
  rect(x: number, y: number, w: number, h: number, style?: ShapeStyle & { radius?: number }) {
    const s = style ?? {}
    this._commands.push({
      kind: "rect",
      x, y, w, h,
      fill: s.fill,
      stroke: s.stroke,
      strokeWidth: s.strokeWidth ?? 1,
      radius: s.radius ?? 0,
    })
    if (s.glow) {
      // Approximate rect glow as an ellipse glow around center
      this._commands.push({
        kind: "glow",
        cx: x + w / 2, cy: y + h / 2,
        rx: w / 2 + s.glow.radius,
        ry: h / 2 + s.glow.radius,
        color: s.glow.color,
        intensity: s.glow.intensity ?? 80,
      })
    }
  }

  /** Draw text at a position. */
  text(x: number, y: number, text: string, color: number) {
    this._commands.push({ kind: "text", x, y, text, color })
  }

  /** Draw a glow/halo effect (useful for node highlights). */
  glow(cx: number, cy: number, rx: number, ry: number, color: number, intensity = 80) {
    this._commands.push({ kind: "glow", cx, cy, rx, ry, color, intensity })
  }

  /** Draw a pre-decoded RGBA image buffer, scaled to fit (x,y,w,h). */
  drawImage(x: number, y: number, w: number, h: number, data: Uint8Array, imgW: number, imgH: number, opacity = 1, opaque = false) {
    this._commands.push({ kind: "image", x, y, w, h, data, imgW, imgH, opacity, opaque })
  }

  /** Fill a radial gradient (circle fade from center color to edge color). */
  radialGradient(cx: number, cy: number, radius: number, from: number, to: number) {
    this._commands.push({ kind: "radialGradient", cx, cy, radius, from, to })
  }

  /** Fill a linear gradient in a rectangular area. angle in degrees (0=left→right, 90=top→bottom). */
  linearGradient(x: number, y: number, w: number, h: number, from: number, to: number, angle = 0) {
    this._commands.push({ kind: "linearGradient", x, y, w, h, from, to, angle })
  }

  /** Paint a procedural nebula field. Prefer baking once into an offscreen buffer for performance-sensitive scenes. */
  nebula(
    x: number,
    y: number,
    w: number,
    h: number,
    stops: { color: number; position: number }[],
    options?: { seed?: number; scale?: number; octaves?: number; gain?: number; lacunarity?: number; warp?: number; detail?: number; dust?: number },
  ) {
    this._commands.push({
      kind: "nebula",
      x, y, w, h, stops,
      seed: options?.seed ?? 1,
      scale: options?.scale ?? 160,
      octaves: options?.octaves ?? 5,
      gain: options?.gain ?? 55,
      lacunarity: options?.lacunarity ?? 210,
      warp: options?.warp ?? 52,
      detail: options?.detail ?? 72,
      dust: options?.dust ?? 46,
    })
  }

  /** Paint a procedural starfield. Prefer baking once into an offscreen buffer for static scenes. */
  starfield(
    x: number,
    y: number,
    w: number,
    h: number,
    options?: { seed?: number; count?: number; clusterCount?: number; clusterStars?: number; warmColor?: number; neutralColor?: number; coolColor?: number },
  ) {
    this._commands.push({
      kind: "starfield",
      x, y, w, h,
      seed: options?.seed ?? 1,
      count: options?.count ?? 240,
      clusterCount: options?.clusterCount ?? 5,
      clusterStars: options?.clusterStars ?? 45,
      warmColor: options?.warmColor ?? 0xf3d7a1d0,
      neutralColor: options?.neutralColor ?? 0xffffffd0,
      coolColor: options?.coolColor ?? 0xbfd8ffe0,
    })
  }
}

function normalizeCanvasCommand(command: DrawCmd): unknown {
  if (command.kind === "image") {
    return {
      ...command,
      data: Array.from(command.data),
    }
  }
  if (command.kind === "nebula") {
    return {
      ...command,
      stops: command.stops.map((stop) => ({ color: stop.color, position: stop.position })),
    }
  }
  return command
}

/** @public */
export function serializeCanvasDisplayList(commands: DrawCmd[]): Uint8Array {
  const list: CanvasDisplayList = {
    version: 1,
    commands: commands.map((command) => normalizeCanvasCommand(command)) as DrawCmd[],
  }
  return new TextEncoder().encode(JSON.stringify(list))
}

/** @public */
export function hashCanvasDisplayList(bytes: Uint8Array): string {
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}
