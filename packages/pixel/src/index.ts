/**
 * @tge/pixel — Pixel buffer and SDF paint primitives.
 *
 * Paint operations go through the Zig shared library via bun:ffi.
 * Colors are packed as u32 RGBA (0xRRGGBBAA) across the FFI boundary.
 *
 * All FFI calls use ≤8 params (ARM64 ABI safety). Extra spatial params
 * are packed into a single shared ArrayBuffer — zero allocations per call.
 * This is safe because FFI calls are synchronous and single-threaded.
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

// ── Shared packed-params buffer (zero allocations per FFI call) ──
// 64 bytes covers the largest packed layout (bezier: 28 bytes).
// Safe to reuse: all FFI calls are synchronous, Zig reads before we write again.

const _ab = new ArrayBuffer(64)
const _v = new DataView(_ab)
const _p = new Uint8Array(_ab)

// ── Paint primitives (Zig via FFI) ──

/**
 * Pack gradient stops into a buffer for FFI.
 * Each stop: 4 bytes u32 color (big-endian RGBA) + 4 bytes f32 position (little-endian).
 */
function packStops(stops: { color: number; position: number }[]): Uint8Array {
  const buf = new Uint8Array(stops.length * 8)
  const view = new DataView(buf.buffer)
  for (let i = 0; i < stops.length; i++) {
    const off = i * 8
    // Color as big-endian u32 RGBA (matches how Zig reads byte-by-byte)
    view.setUint32(off, stops[i].color, false)
    // Position as little-endian f32 (matches native @bitCast on LE platforms)
    view.setFloat32(off + 4, stops[i].position, true)
  }
  return buf
}

export const paint = {
  /** Fill a solid rectangle (no radius). 8 params — no packing needed. */
  fillRect(buf: PixelBuffer, x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number) {
    loadLib().symbols.tge_fill_rect(bufPtr(buf.data), buf.width, buf.height, x, y, w, h, packColor(r, g, b, a))
  },

  /** Fill a rounded rectangle with SDF anti-aliased corners. */
  // packed: [x:i32][y:i32][w:u32][h:u32][radius:u32] = 20 bytes
  roundedRect(buf: PixelBuffer, x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number, radius: number) {
    _v.setInt32(0, x, true)
    _v.setInt32(4, y, true)
    _v.setUint32(8, w, true)
    _v.setUint32(12, h, true)
    _v.setUint32(16, radius, true)
    loadLib().symbols.tge_rounded_rect(bufPtr(buf.data), buf.width, buf.height, packColor(r, g, b, a), _p)
  },

  /** Stroke (outline) a rounded rectangle. */
  // packed: [x:i32][y:i32][w:u32][h:u32][radius:u32][strokeWidth:u32] = 24 bytes
  strokeRect(buf: PixelBuffer, x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number, radius: number, strokeWidth: number) {
    _v.setInt32(0, x, true)
    _v.setInt32(4, y, true)
    _v.setUint32(8, w, true)
    _v.setUint32(12, h, true)
    _v.setUint32(16, radius, true)
    _v.setUint32(20, strokeWidth, true)
    loadLib().symbols.tge_stroke_rect(bufPtr(buf.data), buf.width, buf.height, packColor(r, g, b, a), _p)
  },

  /** Fill a rounded rect with per-corner radii. radii: { tl, tr, br, bl } in px (0-255 each). */
  // packed: [x:i32][y:i32][w:u32][h:u32][radii:u32] = 20 bytes
  roundedRectCorners(buf: PixelBuffer, x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number, tl: number, tr: number, br: number, bl: number) {
    const packed = ((tl & 0xff) << 24 | (tr & 0xff) << 16 | (br & 0xff) << 8 | (bl & 0xff)) >>> 0
    _v.setInt32(0, x, true)
    _v.setInt32(4, y, true)
    _v.setUint32(8, w, true)
    _v.setUint32(12, h, true)
    _v.setUint32(16, packed, true)
    loadLib().symbols.tge_rounded_rect_corners(bufPtr(buf.data), buf.width, buf.height, packColor(r, g, b, a), _p)
  },

  /** Stroke a rounded rect with per-corner radii. */
  // packed: [x:i32][y:i32][w:u32][h:u32][radii:u32][strokeWidth:u32] = 24 bytes
  strokeRectCorners(buf: PixelBuffer, x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number, tl: number, tr: number, br: number, bl: number, strokeWidth: number) {
    const packed = ((tl & 0xff) << 24 | (tr & 0xff) << 16 | (br & 0xff) << 8 | (bl & 0xff)) >>> 0
    _v.setInt32(0, x, true)
    _v.setInt32(4, y, true)
    _v.setUint32(8, w, true)
    _v.setUint32(12, h, true)
    _v.setUint32(16, packed, true)
    _v.setUint32(20, strokeWidth, true)
    loadLib().symbols.tge_stroke_rect_corners(bufPtr(buf.data), buf.width, buf.height, packColor(r, g, b, a), _p)
  },

  /** Fill a regular polygon (3=triangle, 6=hexagon, etc). */
  // packed: [cx:i32][cy:i32][radius:u32][sides_rotation:u32] = 16 bytes
  // sides_rotation packs: (sides & 0xff) | ((rotation_deg & 0xffffff) << 8)
  filledPolygon(buf: PixelBuffer, cx: number, cy: number, radius: number, sides: number, rotationDeg: number, r: number, g: number, b: number, a: number) {
    _v.setInt32(0, cx, true)
    _v.setInt32(4, cy, true)
    _v.setUint32(8, radius, true)
    _v.setUint32(12, ((sides & 0xff) | ((rotationDeg & 0xffffff) << 8)) >>> 0, true)
    loadLib().symbols.tge_filled_polygon(bufPtr(buf.data), buf.width, buf.height, packColor(r, g, b, a), _p)
  },

  /** Stroke a regular polygon. */
  // packed: [cx:i32][cy:i32][radius:u32][sides_rotation:u32][strokeWidth:u32] = 20 bytes
  strokedPolygon(buf: PixelBuffer, cx: number, cy: number, radius: number, sides: number, rotationDeg: number, r: number, g: number, b: number, a: number, strokeWidth: number) {
    _v.setInt32(0, cx, true)
    _v.setInt32(4, cy, true)
    _v.setUint32(8, radius, true)
    _v.setUint32(12, ((sides & 0xff) | ((rotationDeg & 0xffffff) << 8)) >>> 0, true)
    _v.setUint32(16, strokeWidth, true)
    loadLib().symbols.tge_stroked_polygon(bufPtr(buf.data), buf.width, buf.height, packColor(r, g, b, a), _p)
  },

  /** Fill an ellipse (circle when rx === ry). 8 params — no packing needed. */
  filledCircle(buf: PixelBuffer, cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a: number) {
    loadLib().symbols.tge_filled_circle(bufPtr(buf.data), buf.width, buf.height, cx, cy, rx, ry, packColor(r, g, b, a))
  },

  /** Stroke an ellipse (ring). */
  // packed: [cx:i32][cy:i32][rx:u32][ry:u32][strokeWidth:u32] = 20 bytes
  strokedCircle(buf: PixelBuffer, cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a: number, strokeWidth: number) {
    _v.setInt32(0, cx, true)
    _v.setInt32(4, cy, true)
    _v.setUint32(8, rx, true)
    _v.setUint32(12, ry, true)
    _v.setUint32(16, strokeWidth, true)
    loadLib().symbols.tge_stroked_circle(bufPtr(buf.data), buf.width, buf.height, packColor(r, g, b, a), _p)
  },

  /** Draw an anti-aliased line segment. */
  // packed: [x0:i32][y0:i32][x1:i32][y1:i32][lineWidth:u32] = 20 bytes
  line(buf: PixelBuffer, x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a: number, width: number) {
    _v.setInt32(0, x0, true)
    _v.setInt32(4, y0, true)
    _v.setInt32(8, x1, true)
    _v.setInt32(12, y1, true)
    _v.setUint32(16, width, true)
    loadLib().symbols.tge_line(bufPtr(buf.data), buf.width, buf.height, packColor(r, g, b, a), _p)
  },

  /** Draw a quadratic Bezier curve. */
  // packed: [x0:i32][y0:i32][cx:i32][cy:i32][x1:i32][y1:i32][lineWidth:u32] = 28 bytes
  bezier(buf: PixelBuffer, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, r: number, g: number, b: number, a: number, width: number) {
    _v.setInt32(0, x0, true)
    _v.setInt32(4, y0, true)
    _v.setInt32(8, cx, true)
    _v.setInt32(12, cy, true)
    _v.setInt32(16, x1, true)
    _v.setInt32(20, y1, true)
    _v.setUint32(24, width, true)
    loadLib().symbols.tge_bezier(bufPtr(buf.data), buf.width, buf.height, packColor(r, g, b, a), _p)
  },

  /** Box blur a region (3 passes ≈ Gaussian). */
  // packed: [x:u32][y:u32][w:u32][h:u32][radius:u32][passes:u32] = 24 bytes
  blur(buf: PixelBuffer, x: number, y: number, w: number, h: number, radius: number, passes = 3) {
    _v.setUint32(0, x, true)
    _v.setUint32(4, y, true)
    _v.setUint32(8, w, true)
    _v.setUint32(12, h, true)
    _v.setUint32(16, radius, true)
    _v.setUint32(20, passes, true)
    loadLib().symbols.tge_blur(bufPtr(buf.data), buf.width, buf.height, _p)
  },

  /**
   * Inset shadow inside a rounded rect. SDF-based, no blur pass needed.
   * ox, oy: offset (simulates light direction). spread: how far the shadow extends inward.
   */
  // packed: [x:i32][y:i32][w:u32][h:u32][radius:u32][ox:i32][oy:i32][spread:u32] = 32 bytes
  insetShadow(buf: PixelBuffer, x: number, y: number, w: number, h: number, radius: number, ox: number, oy: number, spread: number, r: number, g: number, b: number, a: number) {
    _v.setInt32(0, x, true)
    _v.setInt32(4, y, true)
    _v.setUint32(8, w, true)
    _v.setUint32(12, h, true)
    _v.setUint32(16, radius, true)
    _v.setInt32(20, ox, true)
    _v.setInt32(24, oy, true)
    _v.setUint32(28, spread, true)
    loadLib().symbols.tge_inset_shadow(bufPtr(buf.data), buf.width, buf.height, packColor(r, g, b, a), _p)
  },

  /** Radial halo/glow effect. intensity is 0-100. */
  // packed: [cx:i32][cy:i32][rx:u32][ry:u32][intensity:u32] = 20 bytes
  halo(buf: PixelBuffer, cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a: number, intensity: number) {
    _v.setInt32(0, cx, true)
    _v.setInt32(4, cy, true)
    _v.setUint32(8, rx, true)
    _v.setUint32(12, ry, true)
    _v.setUint32(16, intensity, true)
    loadLib().symbols.tge_halo(bufPtr(buf.data), buf.width, buf.height, packColor(r, g, b, a), _p)
  },

  /** Linear gradient fill. angle in degrees: 0=left→right, 90=top→bottom. */
  // packed: [x:u32][y:u32][w:u32][h:u32][color1:u32][angle:u32] = 24 bytes
  linearGradient(buf: PixelBuffer, x: number, y: number, w: number, h: number, r0: number, g0: number, b0: number, a0: number, r1: number, g1: number, b1: number, a1: number, angle: number) {
    _v.setUint32(0, x, true)
    _v.setUint32(4, y, true)
    _v.setUint32(8, w, true)
    _v.setUint32(12, h, true)
    _v.setUint32(16, packColor(r1, g1, b1, a1), true)
    _v.setUint32(20, angle, true)
    loadLib().symbols.tge_linear_gradient(bufPtr(buf.data), buf.width, buf.height, packColor(r0, g0, b0, a0), _p)
  },

  /** Radial gradient fill from center outward. 8 params — no packing needed. */
  radialGradient(buf: PixelBuffer, cx: number, cy: number, radius: number, r0: number, g0: number, b0: number, a0: number, r1: number, g1: number, b1: number, a1: number) {
    loadLib().symbols.tge_radial_gradient(bufPtr(buf.data), buf.width, buf.height, cx, cy, radius, packColor(r0, g0, b0, a0), packColor(r1, g1, b1, a1))
  },

  // ── Backdrop Filters (in-place region operations, all ≤8 params) ──

  /** Adjust brightness. factor: 0=black, 100=unchanged, 200=2x bright. */
  filterBrightness(buf: PixelBuffer, x: number, y: number, w: number, h: number, factor: number) {
    loadLib().symbols.tge_filter_brightness(bufPtr(buf.data), buf.width, buf.height, x, y, w, h, factor)
  },
  /** Adjust contrast. factor: 0=grey, 100=unchanged, 200=high contrast. */
  filterContrast(buf: PixelBuffer, x: number, y: number, w: number, h: number, factor: number) {
    loadLib().symbols.tge_filter_contrast(bufPtr(buf.data), buf.width, buf.height, x, y, w, h, factor)
  },
  /** Adjust saturation. factor: 0=grayscale, 100=unchanged, 200=hyper-saturated. */
  filterSaturate(buf: PixelBuffer, x: number, y: number, w: number, h: number, factor: number) {
    loadLib().symbols.tge_filter_saturate(bufPtr(buf.data), buf.width, buf.height, x, y, w, h, factor)
  },
  /** Convert to grayscale. amount: 0=unchanged, 100=full grayscale. */
  filterGrayscale(buf: PixelBuffer, x: number, y: number, w: number, h: number, amount: number) {
    loadLib().symbols.tge_filter_grayscale(bufPtr(buf.data), buf.width, buf.height, x, y, w, h, amount)
  },
  /** Invert colors. amount: 0=unchanged, 100=fully inverted. */
  filterInvert(buf: PixelBuffer, x: number, y: number, w: number, h: number, amount: number) {
    loadLib().symbols.tge_filter_invert(bufPtr(buf.data), buf.width, buf.height, x, y, w, h, amount)
  },
  /** Apply sepia tone. amount: 0=unchanged, 100=full sepia. */
  filterSepia(buf: PixelBuffer, x: number, y: number, w: number, h: number, amount: number) {
    loadLib().symbols.tge_filter_sepia(bufPtr(buf.data), buf.width, buf.height, x, y, w, h, amount)
  },
  /** Rotate hue. angle: 0-360 degrees, 0/360=unchanged, 180=complement. */
  filterHueRotate(buf: PixelBuffer, x: number, y: number, w: number, h: number, angle: number) {
    loadLib().symbols.tge_filter_hue_rotate(bufPtr(buf.data), buf.width, buf.height, x, y, w, h, angle)
  },

  // ── Blend Modes ──

  /**
   * Blend a solid color onto a region using a CSS blend mode.
   * mode: 0=normal, 1=multiply, 2=screen, 3=overlay, 4=darken, 5=lighten,
   *       6=color-dodge, 7=color-burn, 8=hard-light, 9=soft-light,
   *       10=difference, 11=exclusion, 12=hue, 13=saturation, 14=color, 15=luminosity
   */
  blendMode(buf: PixelBuffer, x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number, mode: number) {
    _v.setUint32(0, x, true)
    _v.setUint32(4, y, true)
    _v.setUint32(8, w, true)
    _v.setUint32(12, h, true)
    loadLib().symbols.tge_blend_mode(bufPtr(buf.data), buf.width, buf.height, packColor(r, g, b, a), mode, _p)
  },

  // ── Text Shadow (TS-level composite) ──

  /**
   * Draw text with a drop shadow. Draws shadow first (offset + optional blur), then text on top.
   * If blur > 0, the shadow region is box-blurred.
   */
  textShadow(buf: PixelBuffer, x: number, y: number, text: string, r: number, g: number, b: number, a: number, shadow: { x: number; y: number; blur?: number; color: number }) {
    const sc = [(shadow.color >> 24) & 0xff, (shadow.color >> 16) & 0xff, (shadow.color >> 8) & 0xff, shadow.color & 0xff]
    // Draw shadow text at offset
    const sx = x + shadow.x
    const sy = y + shadow.y
    const encoded = new TextEncoder().encode(text)
    loadLib().symbols.tge_draw_text(bufPtr(buf.data), buf.width, buf.height, sx, sy, encoded, encoded.length, packColor(sc[0], sc[1], sc[2], sc[3]))
    // Blur the shadow region if requested
    if (shadow.blur && shadow.blur > 0) {
      const tw = text.length * 9 // approximate text width
      const th = 17 // approximate line height
      const margin = shadow.blur * 2
      const bx = Math.max(0, sx - margin)
      const by = Math.max(0, sy - margin)
      const bw = Math.min(buf.width - bx, tw + margin * 2)
      const bh = Math.min(buf.height - by, th + margin * 2)
      paint.blur(buf, bx, by, bw, bh, shadow.blur, 2)
    }
    // Draw actual text on top
    loadLib().symbols.tge_draw_text(bufPtr(buf.data), buf.width, buf.height, x, y, encoded, encoded.length, packColor(r, g, b, a))
  },

  // ── Gradient Border ──

  /**
   * Stroke a rounded rectangle with a multi-stop gradient border.
   * Combines SDF stroke mask with gradient color sampling.
   */
  gradientStroke(buf: PixelBuffer, x: number, y: number, w: number, h: number, radius: number, strokeWidth: number, stops: { color: number; position: number }[], angle: number) {
    const packed = packStops(stops)
    _v.setInt32(0, x, true)
    _v.setInt32(4, y, true)
    _v.setUint32(8, w, true)
    _v.setUint32(12, h, true)
    _v.setUint32(16, radius, true)
    _v.setUint32(20, strokeWidth, true)
    _v.setUint32(24, angle, true)
    loadLib().symbols.tge_gradient_stroke(bufPtr(buf.data), buf.width, buf.height, packed, stops.length, _p)
  },

  // ── Multi-stop Gradients ──

  /**
   * Multi-stop linear gradient fill.
   * stops: array of { color: u32 RGBA, position: 0.0–1.0 }, sorted by position.
   */
  // packed: [x:u32][y:u32][w:u32][h:u32][angle:u32] = 20 bytes
  linearGradientMulti(buf: PixelBuffer, x: number, y: number, w: number, h: number, stops: { color: number; position: number }[], angle: number) {
    const packed = packStops(stops)
    _v.setUint32(0, x, true)
    _v.setUint32(4, y, true)
    _v.setUint32(8, w, true)
    _v.setUint32(12, h, true)
    _v.setUint32(16, angle, true)
    loadLib().symbols.tge_linear_gradient_multi(bufPtr(buf.data), buf.width, buf.height, packed, stops.length, _p)
  },

  /**
   * Multi-stop radial gradient fill from center outward.
   * stops: array of { color: u32 RGBA, position: 0.0–1.0 }, sorted by position.
   */
  radialGradientMulti(buf: PixelBuffer, cx: number, cy: number, radius: number, stops: { color: number; position: number }[]) {
    const packed = packStops(stops)
    loadLib().symbols.tge_radial_gradient_multi(bufPtr(buf.data), buf.width, buf.height, cx, cy, radius, packed, stops.length)
  },

  /**
   * Conic (angular/sweep) gradient fill.
   * stops: array of { color: u32 RGBA, position: 0.0–1.0 }, sorted by position.
   * startAngle: degrees, 0 = right (3 o'clock).
   */
  // packed: [cx:u32][cy:u32][w:u32][h:u32][startAngle:u32] = 20 bytes
  conicGradient(buf: PixelBuffer, cx: number, cy: number, w: number, h: number, stops: { color: number; position: number }[], startAngle: number) {
    const packed = packStops(stops)
    _v.setUint32(0, cx, true)
    _v.setUint32(4, cy, true)
    _v.setUint32(8, w, true)
    _v.setUint32(12, h, true)
    _v.setUint32(16, startAngle, true)
    loadLib().symbols.tge_conic_gradient(bufPtr(buf.data), buf.width, buf.height, packed, stops.length, _p)
  },

  /** Draw text at pixel coordinates using the embedded bitmap font. 8 params — no packing. */
  drawText(buf: PixelBuffer, x: number, y: number, text: string, r: number, g: number, b: number, a: number) {
    const encoded = new TextEncoder().encode(text)
    loadLib().symbols.tge_draw_text(bufPtr(buf.data), buf.width, buf.height, x, y, encoded, encoded.length, packColor(r, g, b, a))
  },

  /** Draw text with a specific font atlas (fontId 0 = built-in, 1+ = runtime). */
  // packed: [x:i32][y:i32][font_id:u32] = 12 bytes
  drawTextFont(buf: PixelBuffer, x: number, y: number, text: string, r: number, g: number, b: number, a: number, fontId: number) {
    const encoded = new TextEncoder().encode(text)
    if (fontId === 0) {
      loadLib().symbols.tge_draw_text(bufPtr(buf.data), buf.width, buf.height, x, y, encoded, encoded.length, packColor(r, g, b, a))
    } else {
      _v.setInt32(0, x, true)
      _v.setInt32(4, y, true)
      _v.setUint32(8, fontId, true)
      loadLib().symbols.tge_draw_text_font(bufPtr(buf.data), buf.width, buf.height, encoded, encoded.length, packColor(r, g, b, a), _p)
    }
  },

  /** Load a runtime font atlas into Zig. */
  loadFontAtlas(fontId: number, atlasData: Uint8Array, cellWidth: number, cellHeight: number, glyphWidths?: Float32Array) {
    loadLib().symbols.tge_load_font_atlas(fontId, atlasData, atlasData.length, cellWidth, cellHeight, glyphWidths ?? null)
  },

  /** Measure text width in pixels (without rendering). */
  measureText(text: string): number {
    return loadLib().symbols.tge_measure_text(text.length) as number
  },

  /**
   * Text decoration — underline or strikethrough.
   * Uses fill_rect at the appropriate y-offset relative to text position.
   * style: "underline" | "strikethrough" | "overline"
   */
  textDecoration(buf: PixelBuffer, x: number, y: number, width: number, fontSize: number, r: number, g: number, b: number, a: number, style: "underline" | "strikethrough" | "overline", thickness?: number) {
    const t = thickness ?? Math.max(1, Math.round(fontSize / 14))
    let dy: number
    switch (style) {
      case "underline":
        // Position at ~90% of font size (below baseline)
        dy = Math.round(fontSize * 0.9)
        break
      case "strikethrough":
        // Position at ~50% of font size (middle)
        dy = Math.round(fontSize * 0.5)
        break
      case "overline":
        // Position at top of text
        dy = 0
        break
    }
    loadLib().symbols.tge_fill_rect(bufPtr(buf.data), buf.width, buf.height, x, y + dy, width, t, packColor(r, g, b, a))
  },

  /**
   * Affine blit — composite src buffer onto dst with a 3×3 projective transform.
   * The matrix should be the INVERSE transform (dst→src mapping).
   * Uses bilinear interpolation for anti-aliased rotation/scale.
   *
   * @param dst       Destination pixel buffer
   * @param src       Source pixel buffer (the element to transform)
   * @param matrix    9 floats: inverse 3×3 matrix (row-major)
   * @param dstX      Where to start writing in dst (X offset)
   * @param dstY      Where to start writing in dst (Y offset)
   * @param blitW     Output region width
   * @param blitH     Output region height
   */
  affineBlit(
    dst: PixelBuffer,
    src: PixelBuffer,
    matrix: Float64Array,
    dstX: number,
    dstY: number,
    blitW: number,
    blitH: number,
  ) {
    // Pack params: 9×f32 matrix + i32 dstX + i32 dstY + u32 blitW + u32 blitH + u32 srcH = 56 bytes
    const ab = new ArrayBuffer(56)
    const v = new DataView(ab)
    // Matrix as f32 (Zig reads f32, not f64)
    for (let i = 0; i < 9; i++) v.setFloat32(i * 4, matrix[i], true)
    // Region
    v.setInt32(36, dstX, true)
    v.setInt32(40, dstY, true)
    v.setUint32(44, blitW, true)
    v.setUint32(48, blitH, true)
    v.setUint32(52, src.height, true) // src_h packed here
    const p = new Uint8Array(ab)

    loadLib().symbols.tge_affine_blit(
      bufPtr(dst.data), dst.width, dst.height,
      bufPtr(src.data), src.width,
      p
    )
  },
}
