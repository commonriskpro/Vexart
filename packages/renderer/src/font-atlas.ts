/**
 * Runtime font atlas generator — creates bitmap atlases on demand.
 *
 * Instead of pre-generating Zig source files at build time, this module
 * creates font atlases at runtime using @napi-rs/canvas and uploads
 * them to the Zig paint engine via FFI.
 *
 * Each font (family + size + weight + style) gets its own atlas.
 * Atlas data is grayscale alpha values for ASCII 32-126 (95 glyphs).
 */

import { createCanvas } from "@napi-rs/canvas"
import type { FontDescriptor } from "./text-layout"

const FIRST_CP = 32
const LAST_CP = 126
const GLYPH_COUNT = LAST_CP - FIRST_CP + 1

export type AtlasInfo = {
  fontId: number
  cellWidth: number
  cellHeight: number
  ascender: number
  data: Uint8Array     // grayscale alpha, GLYPH_COUNT * cellWidth * cellHeight bytes
  glyphWidths: Float32Array  // per-glyph advance widths (for proportional fonts)
}

const atlasCache = new Map<number, AtlasInfo>()
const MAX_FONT_ATLAS_CACHE = 16

function touchAtlasCacheEntry(fontId: number, atlas: AtlasInfo) {
  atlasCache.delete(fontId)
  atlasCache.set(fontId, atlas)
}

/** Check if we have a system font available (approximate). */
function resolveFontFamily(family: string): string {
  // Map common generic names to platform-specific fonts
  const fallbacks: Record<string, string> = {
    "monospace": "SF Mono",
    "sans-serif": "SF Pro",
    "serif": "Georgia",
    "system-ui": "SF Pro",
  }
  return fallbacks[family.toLowerCase()] ?? family
}

/**
 * Generate a font atlas for the given font descriptor.
 * Returns cell dimensions and grayscale alpha data.
 */
export function generateAtlas(fontId: number, desc: FontDescriptor): AtlasInfo {
  const cached = atlasCache.get(fontId)
  if (cached) {
    touchAtlasCacheEntry(fontId, cached)
    return cached
  }

  const family = resolveFontFamily(desc.family)
  const size = desc.size
  const weight = desc.weight ?? 400
  const style = desc.style ?? "normal"

  // Build CSS font string for canvas
  const fontCSS = `${style === "italic" ? "italic " : ""}${weight} ${size}px "${family}"`

  // Measure cell dimensions using a reference glyph
  const measureCanvas = createCanvas(200, 200)
  const measureCtx = measureCanvas.getContext("2d")
  measureCtx.font = fontCSS

  // Measure each glyph to find max cell dimensions
  let maxWidth = 0
  let maxAscent = 0
  let maxDescent = 0
  const glyphWidths = new Float32Array(GLYPH_COUNT)

  for (let cp = FIRST_CP; cp <= LAST_CP; cp++) {
    const ch = String.fromCharCode(cp)
    const metrics = measureCtx.measureText(ch)
    const w = Math.ceil(metrics.width)
    const asc = Math.ceil(metrics.actualBoundingBoxAscent ?? size * 0.8)
    const desc2 = Math.ceil(metrics.actualBoundingBoxDescent ?? size * 0.2)

    glyphWidths[cp - FIRST_CP] = metrics.width
    if (w > maxWidth) maxWidth = w
    if (asc > maxAscent) maxAscent = asc
    if (desc2 > maxDescent) maxDescent = desc2
  }

  const cellWidth = Math.max(maxWidth, 1)
  const cellHeight = Math.max(maxAscent + maxDescent + 1, 1)
  const ascender = maxAscent

  // Render each glyph
  const totalBytes = GLYPH_COUNT * cellWidth * cellHeight
  const data = new Uint8Array(totalBytes)

  for (let cp = FIRST_CP; cp <= LAST_CP; cp++) {
    const canvas = createCanvas(cellWidth, cellHeight)
    const ctx = canvas.getContext("2d")
    ctx.clearRect(0, 0, cellWidth, cellHeight)
    ctx.font = fontCSS
    ctx.fillStyle = "#ffffff"
    ctx.textBaseline = "top"

    const ch = String.fromCharCode(cp)
    ctx.fillText(ch, 0, 0)

    // Extract alpha channel
    const imageData = ctx.getImageData(0, 0, cellWidth, cellHeight)
    const pixels = imageData.data
    const offset = (cp - FIRST_CP) * cellWidth * cellHeight

    for (let i = 0; i < cellWidth * cellHeight; i++) {
      data[offset + i] = pixels[i * 4 + 3] // alpha channel
    }
  }

  const info: AtlasInfo = { fontId, cellWidth, cellHeight, ascender, data, glyphWidths }
  if (atlasCache.size >= MAX_FONT_ATLAS_CACHE) {
    const first = atlasCache.keys().next().value
    if (first !== undefined) atlasCache.delete(first)
  }
  atlasCache.set(fontId, info)
  return info
}

/** Get a cached atlas or generate one. */
export function getAtlas(fontId: number, desc: FontDescriptor): AtlasInfo {
  const cached = atlasCache.get(fontId)
  if (cached) {
    touchAtlasCacheEntry(fontId, cached)
    return cached
  }
  return generateAtlas(fontId, desc)
}

/** Clear all cached atlases. */
export function clearAtlasCache() {
  atlasCache.clear()
}

export function getFontAtlasCacheStats() {
  let bytes = 0
  for (const atlas of atlasCache.values()) {
    bytes += atlas.data.byteLength
    bytes += atlas.glyphWidths.byteLength
  }
  return {
    atlasCount: atlasCache.size,
    bytes,
  }
}
