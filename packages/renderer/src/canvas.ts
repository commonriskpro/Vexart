/**
 * CanvasContext — imperative 2D drawing API for <canvas> nodes.
 *
 * Unlike <box>/<text>, <canvas> bypasses Clay for its INTERNAL content.
 * Clay only knows the canvas's outer bounding box. All drawing inside
 * is done directly via Zig FFI paint primitives.
 *
 * Draw commands are buffered during onDraw() and flushed in paintCommand().
 * A viewport transform (translate + scale) is applied to all coordinates
 * before painting — enabling pan/zoom with zero overhead.
 *
 * Architecture:
 *   JSX <canvas onDraw={ctx => ...}> → walkTree emits Clay RECT
 *     → paintCommand detects canvas node → creates CanvasContext
 *       → executes onDraw callback → flushes draw commands to pixel buffer
 */

import type { PixelBuffer } from "@tge/pixel"
import { paint } from "@tge/pixel"
import { create, over } from "@tge/pixel"

// ── Draw command types ──

type LineCmd = {
  kind: "line"
  x0: number; y0: number; x1: number; y1: number
  color: number
  width: number
}

type BezierCmd = {
  kind: "bezier"
  x0: number; y0: number
  cx: number; cy: number
  x1: number; y1: number
  color: number
  width: number
}

type CircleCmd = {
  kind: "circle"
  cx: number; cy: number
  rx: number; ry: number
  fill?: number
  stroke?: number
  strokeWidth: number
}

type RectCmd = {
  kind: "rect"
  x: number; y: number
  w: number; h: number
  fill?: number
  stroke?: number
  strokeWidth: number
  radius: number
}

type PolygonCmd = {
  kind: "polygon"
  cx: number; cy: number
  radius: number
  sides: number
  rotation: number
  fill?: number
  stroke?: number
  strokeWidth: number
}

type ArcCmd = {
  kind: "arc"
  cx: number; cy: number
  rx: number; ry: number
  color: number
  strokeWidth: number
}

type TextCmd = {
  kind: "text"
  x: number; y: number
  text: string
  color: number
}

type GlowCmd = {
  kind: "glow"
  cx: number; cy: number
  rx: number; ry: number
  color: number
  intensity: number
}

type ImageCmd = {
  kind: "image"
  x: number; y: number
  w: number; h: number
  data: Uint8Array
  imgW: number; imgH: number
  opacity: number
}

type RadialGradientCmd = {
  kind: "radialGradient"
  cx: number; cy: number
  radius: number
  from: number  // center color
  to: number    // edge color
}

type LinearGradientCmd = {
  kind: "linearGradient"
  x: number; y: number
  w: number; h: number
  from: number; to: number
  angle: number
}

type DrawCmd = LineCmd | BezierCmd | CircleCmd | RectCmd | PolygonCmd | ArcCmd | TextCmd | GlowCmd | ImageCmd | RadialGradientCmd | LinearGradientCmd

// ── Viewport ──

export type Viewport = {
  x: number
  y: number
  zoom: number
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }

// ── Style shorthand ──

export type StrokeStyle = {
  color: number
  width?: number
}

export type FillStyle = {
  color: number
}

export type ShapeStyle = {
  fill?: number
  stroke?: number
  strokeWidth?: number
  glow?: { color: number; radius: number; intensity?: number }
}

// ── CanvasContext ──

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
  drawImage(x: number, y: number, w: number, h: number, data: Uint8Array, imgW: number, imgH: number, opacity = 1) {
    this._commands.push({ kind: "image", x, y, w, h, data, imgW, imgH, opacity })
  }

  /** Fill a radial gradient (circle fade from center color to edge color). */
  radialGradient(cx: number, cy: number, radius: number, from: number, to: number) {
    this._commands.push({ kind: "radialGradient", cx, cy, radius, from, to })
  }

  /** Fill a linear gradient in a rectangular area. angle in degrees (0=left→right, 90=top→bottom). */
  linearGradient(x: number, y: number, w: number, h: number, from: number, to: number, angle = 0) {
    this._commands.push({ kind: "linearGradient", x, y, w, h, from, to, angle })
  }
}

// ── Color unpacking ──

function unpack(c: number): [number, number, number, number] {
  return [(c >>> 24) & 0xff, (c >>> 16) & 0xff, (c >>> 8) & 0xff, c & 0xff]
}

// ── Flush commands to pixel buffer ──

/**
 * Paint all buffered canvas commands into a pixel buffer.
 * Applies viewport transform: world coords → screen coords.
 *
 * @param buf - Target pixel buffer (already positioned at canvas layout origin)
 * @param ctx - CanvasContext with buffered commands
 * @param canvasW - Canvas width in pixels
 * @param canvasH - Canvas height in pixels
 */
export function paintCanvasCommands(
  buf: PixelBuffer,
  ctx: CanvasContext,
  canvasW: number,
  canvasH: number,
) {
  const vp = ctx.viewport
  const z = vp.zoom
  const ox = vp.x
  const oy = vp.y

  // Transform world → screen coordinates
  const tx = (wx: number) => Math.round((wx - ox) * z)
  const ty = (wy: number) => Math.round((wy - oy) * z)
  const ts = (ws: number) => Math.max(1, Math.round(ws * z))

  for (const cmd of ctx._commands) {
    switch (cmd.kind) {
      case "line": {
        const [r, g, b, a] = unpack(cmd.color)
        paint.line(buf, tx(cmd.x0), ty(cmd.y0), tx(cmd.x1), ty(cmd.y1), r, g, b, a, ts(cmd.width))
        break
      }

      case "bezier": {
        const [r, g, b, a] = unpack(cmd.color)
        paint.bezier(buf,
          tx(cmd.x0), ty(cmd.y0),
          tx(cmd.cx), ty(cmd.cy),
          tx(cmd.x1), ty(cmd.y1),
          r, g, b, a, ts(cmd.width))
        break
      }

      case "circle": {
        const sx = tx(cmd.cx)
        const sy = ty(cmd.cy)
        const srx = ts(cmd.rx)
        const sry = ts(cmd.ry)

        if (cmd.fill !== undefined) {
          const [r, g, b, a] = unpack(cmd.fill)
          paint.filledCircle(buf, sx, sy, srx, sry, r, g, b, a)
        }
        if (cmd.stroke !== undefined) {
          const [r, g, b, a] = unpack(cmd.stroke)
          paint.strokedCircle(buf, sx, sy, srx, sry, r, g, b, a, ts(cmd.strokeWidth))
        }
        break
      }

      case "rect": {
        const sx = tx(cmd.x)
        const sy = ty(cmd.y)
        const sw = ts(cmd.w)
        const sh = ts(cmd.h)
        const sr = ts(cmd.radius)

        if (cmd.fill !== undefined) {
          const [r, g, b, a] = unpack(cmd.fill)
          if (sr > 0) {
            paint.roundedRect(buf, sx, sy, sw, sh, r, g, b, a, sr)
          } else {
            paint.fillRect(buf, sx, sy, sw, sh, r, g, b, a)
          }
        }
        if (cmd.stroke !== undefined) {
          const [r, g, b, a] = unpack(cmd.stroke)
          paint.strokeRect(buf, sx, sy, sw, sh, r, g, b, a, sr, ts(cmd.strokeWidth))
        }
        break
      }

      case "polygon": {
        const sx = tx(cmd.cx)
        const sy = ty(cmd.cy)
        const sr = ts(cmd.radius)
        const rot = Math.round(cmd.rotation)

        if (cmd.fill !== undefined) {
          const [r, g, b, a] = unpack(cmd.fill)
          paint.filledPolygon(buf, sx, sy, sr, cmd.sides, rot, r, g, b, a)
        }
        if (cmd.stroke !== undefined) {
          const [r, g, b, a] = unpack(cmd.stroke)
          paint.strokedPolygon(buf, sx, sy, sr, cmd.sides, rot, r, g, b, a, ts(cmd.strokeWidth))
        }
        break
      }

      case "text": {
        const [r, g, b, a] = unpack(cmd.color)
        paint.drawText(buf, tx(cmd.x), ty(cmd.y), cmd.text, r, g, b, a)
        break
      }

      case "glow": {
        const [r, g, b, a] = unpack(cmd.color)
        paint.halo(buf, tx(cmd.cx), ty(cmd.cy), ts(cmd.rx), ts(cmd.ry), r, g, b, a, cmd.intensity)
        break
      }

      case "image": {
        // Scale + blit image into canvas buffer with nearest-neighbor sampling
        const dx = tx(cmd.x)
        const dy = ty(cmd.y)
        const dw = ts(cmd.w)
        const dh = ts(cmd.h)
        const src = cmd.data
        const sw = cmd.imgW
        const sh = cmd.imgH
        const oa = Math.round(cmd.opacity * 255)

        for (let py = 0; py < dh; py++) {
          const destY = dy + py
          if (destY < 0 || destY >= buf.height) continue
          const srcY = Math.min(Math.floor(py * sh / dh), sh - 1)
          for (let px = 0; px < dw; px++) {
            const destX = dx + px
            if (destX < 0 || destX >= buf.width) continue
            const srcX = Math.min(Math.floor(px * sw / dw), sw - 1)
            const si = (srcY * sw + srcX) * 4
            const di = (destY * buf.width + destX) * 4
            const sa = Math.round((src[si + 3] * oa) / 255)
            if (sa === 0) continue
            if (sa === 255) {
              buf.data[di] = src[si]
              buf.data[di + 1] = src[si + 1]
              buf.data[di + 2] = src[si + 2]
              buf.data[di + 3] = 255
            } else {
              // Alpha blend
              const inv = 255 - sa
              const da = buf.data[di + 3]
              const outA = sa + Math.round(da * inv / 255)
              if (outA === 0) continue
              buf.data[di] = Math.round((src[si] * sa + buf.data[di] * da * inv / 255) / outA)
              buf.data[di + 1] = Math.round((src[si + 1] * sa + buf.data[di + 1] * da * inv / 255) / outA)
              buf.data[di + 2] = Math.round((src[si + 2] * sa + buf.data[di + 2] * da * inv / 255) / outA)
              buf.data[di + 3] = Math.min(255, outA)
            }
          }
        }
        break
      }

      case "radialGradient": {
        const [r0, g0, b0, a0] = unpack(cmd.from)
        const [r1, g1, b1, a1] = unpack(cmd.to)
        paint.radialGradient(buf, tx(cmd.cx), ty(cmd.cy), ts(cmd.radius), r0, g0, b0, a0, r1, g1, b1, a1)
        break
      }

      case "linearGradient": {
        const [r0, g0, b0, a0] = unpack(cmd.from)
        const [r1, g1, b1, a1] = unpack(cmd.to)
        paint.linearGradient(buf, tx(cmd.x), ty(cmd.y), ts(cmd.w), ts(cmd.h), r0, g0, b0, a0, r1, g1, b1, a1, Math.round(cmd.angle))
        break
      }
    }
  }
}
