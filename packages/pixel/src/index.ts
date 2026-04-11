/**
 * @tge/pixel — Pixel buffer and SDF paint primitives.
 *
 * Paint operations go through the Zig shared library via bun:ffi.
 * Colors are packed as u32 RGBA (0xRRGGBBAA) across the FFI boundary.
 */

import type { PixelBuffer } from "./buffer"
import { loadLib, bufPtr, packColor } from "./ffi"

// ── Buffer management (TypeScript) ──

export { create, resize, clear, clearRect, get, set, sub, rgba, pack, alpha } from "./buffer"
export type { PixelBuffer } from "./buffer"

// ── Compositing (TypeScript) ──

export { over, withOpacity } from "./composite"

// ── Dirty tracking (TypeScript) ──

export { createTracker } from "./dirty"
export type { DirtyRect, DirtyTracker } from "./dirty"

// ── Paint primitives (Zig via FFI) ──

export const paint = {
  /** Fill a solid rectangle (no radius). */
  fillRect(buf: PixelBuffer, x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number) {
    loadLib().symbols.tge_fill_rect(bufPtr(buf.data), buf.width, buf.height, x, y, w, h, packColor(r, g, b, a))
  },

  /** Fill a rounded rectangle with SDF anti-aliased corners. */
  roundedRect(buf: PixelBuffer, x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number, radius: number) {
    loadLib().symbols.tge_rounded_rect(bufPtr(buf.data), buf.width, buf.height, x, y, w, h, packColor(r, g, b, a), radius)
  },

  /** Stroke (outline) a rounded rectangle. */
  strokeRect(buf: PixelBuffer, x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number, radius: number, strokeWidth: number) {
    loadLib().symbols.tge_stroke_rect(bufPtr(buf.data), buf.width, buf.height, x, y, w, h, packColor(r, g, b, a), radius, strokeWidth)
  },

  /** Fill an ellipse (circle when rx === ry). */
  filledCircle(buf: PixelBuffer, cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a: number) {
    loadLib().symbols.tge_filled_circle(bufPtr(buf.data), buf.width, buf.height, cx, cy, rx, ry, packColor(r, g, b, a))
  },

  /** Stroke an ellipse (ring). */
  strokedCircle(buf: PixelBuffer, cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a: number, strokeWidth: number) {
    loadLib().symbols.tge_stroked_circle(bufPtr(buf.data), buf.width, buf.height, cx, cy, rx, ry, packColor(r, g, b, a), strokeWidth)
  },

  /** Draw an anti-aliased line segment. */
  line(buf: PixelBuffer, x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a: number, width: number) {
    loadLib().symbols.tge_line(bufPtr(buf.data), buf.width, buf.height, x0, y0, x1, y1, packColor(r, g, b, a), width)
  },

  /** Draw a quadratic Bezier curve. */
  bezier(buf: PixelBuffer, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, r: number, g: number, b: number, a: number, width: number) {
    loadLib().symbols.tge_bezier(bufPtr(buf.data), buf.width, buf.height, x0, y0, cx, cy, x1, y1, packColor(r, g, b, a), width)
  },

  /** Box blur a region (3 passes ≈ Gaussian). */
  blur(buf: PixelBuffer, x: number, y: number, w: number, h: number, radius: number, passes = 3) {
    loadLib().symbols.tge_blur(bufPtr(buf.data), buf.width, buf.height, x, y, w, h, radius, passes)
  },

  /** Radial halo/glow effect. intensity is 0-100. */
  halo(buf: PixelBuffer, cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a: number, intensity: number) {
    loadLib().symbols.tge_halo(bufPtr(buf.data), buf.width, buf.height, cx, cy, rx, ry, packColor(r, g, b, a), intensity)
  },

  /** Linear gradient fill. angle in degrees: 0=left→right, 90=top→bottom. */
  linearGradient(buf: PixelBuffer, x: number, y: number, w: number, h: number, r0: number, g0: number, b0: number, a0: number, r1: number, g1: number, b1: number, a1: number, angle: number) {
    loadLib().symbols.tge_linear_gradient(bufPtr(buf.data), buf.width, buf.height, x, y, w, h, packColor(r0, g0, b0, a0), packColor(r1, g1, b1, a1), angle)
  },

  /** Radial gradient fill from center outward. */
  radialGradient(buf: PixelBuffer, cx: number, cy: number, radius: number, r0: number, g0: number, b0: number, a0: number, r1: number, g1: number, b1: number, a1: number) {
    loadLib().symbols.tge_radial_gradient(bufPtr(buf.data), buf.width, buf.height, cx, cy, radius, packColor(r0, g0, b0, a0), packColor(r1, g1, b1, a1))
  },

  /** Draw text at pixel coordinates using the embedded bitmap font. */
  drawText(buf: PixelBuffer, x: number, y: number, text: string, r: number, g: number, b: number, a: number) {
    const encoded = new TextEncoder().encode(text)
    loadLib().symbols.tge_draw_text(bufPtr(buf.data), buf.width, buf.height, x, y, encoded, encoded.length, packColor(r, g, b, a))
  },

  /** Measure text width in pixels (without rendering). */
  measureText(text: string): number {
    return loadLib().symbols.tge_measure_text(text.length) as number
  },
}
