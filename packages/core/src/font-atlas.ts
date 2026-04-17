/**
 * Runtime font atlas generator — creates bitmap atlases on demand.
 *
 * Instead of pre-generating Zig source files at build time, this module
 * creates font atlases at runtime using @napi-rs/canvas and uploads
 * them to the Zig paint engine via FFI.
 *
 * Each font (family + size + weight + style) gets its own atlas.
 * Atlas data is grayscale alpha values for all glyphs in ATLAS_RANGES.
 *
 * ## Glyph ranges covered
 *
 * Range selection principle: cover everything TGE UI components actually
 * render — Latin text, punctuation, UI symbols, geometric shapes, arrows,
 * dingbats — without blowing up the GPU texture budget.
 *
 * | Range            | Codepoints      | What it covers                        |
 * |------------------|-----------------|---------------------------------------|
 * | ASCII            | 32–126          | Basic printable ASCII                 |
 * | Latin-1 Supp.    | 160–255         | Accented chars, NO-BREAK SPACE, etc.  |
 * | Latin Extended A | 256–383         | Full Latin Extended A block           |
 * | General Punct.   | 0x2010–0x205E   | ·  —  …  "  "  etc.                  |
 * | Arrows           | 0x2190–0x21FF   | ←→↑↓⇒⟳ etc.                          |
 * | Math Operators   | 0x2200–0x22FF   | ∀∃∈≡≠≤≥∑∏√∞ etc.                     |
 * | Misc Technical   | 0x2300–0x23FF   | ⌃⌘⌥⏎⌫ etc.                           |
 * | Box Drawing      | 0x2500–0x257F   | ─│┌┐└┘├┤┬┴┼ etc.                     |
 * | Block Elements   | 0x2580–0x259F   | ▀▄█▌▐ etc.                            |
 * | Geometric Shapes | 0x25A0–0x25FF   | ◻▤◉◈⬡⬢◆◇○● etc.                     |
 * | Misc Symbols     | 0x2600–0x26FF   | ☰⚡★☆✓✗ etc.                          |
 * | Dingbats         | 0x2700–0x27BF   | ✦✧⟳❯❮ etc.                           |
 *
 * Total: ~1146 glyphs. At 14px, atlas texture is ~448×728px ≈ 1.3MB RGBA.
 */

import { createCanvas } from "@napi-rs/canvas"
import type { FontDescriptor } from "./text-layout"

// ── Glyph range definition ────────────────────────────────────────────────

/** A contiguous range of Unicode codepoints to include in the atlas. */
type GlyphRange = { start: number; end: number }

/**
 * Curated BMP ranges. Order matters — glyphIndex is assigned sequentially
 * across all ranges. Keep sorted by codepoint for debuggability.
 */
export const ATLAS_RANGES: GlyphRange[] = [
  { start: 0x0020, end: 0x007E }, // ASCII printable (32–126)
  { start: 0x00A0, end: 0x017F }, // Latin-1 Supplement + Latin Extended A
  { start: 0x2010, end: 0x205E }, // General Punctuation
  { start: 0x2190, end: 0x21FF }, // Arrows
  { start: 0x2200, end: 0x22FF }, // Mathematical Operators (∀∃∈≡≠≤≥∑∏√∞ etc.)
  { start: 0x2300, end: 0x23FF }, // Miscellaneous Technical (⌃⌘⌥⏎ etc.)
  { start: 0x2500, end: 0x27BF }, // Box Drawing + Block + Geometric + Misc Symbols + Dingbats
]

// Pre-compute flat codepoint list and lookup map at module load time.
// This runs once — cost is negligible (< 1ms for ~630 entries).

const CODEPOINTS: number[] = []
const CODEPOINT_TO_INDEX = new Map<number, number>()

for (const range of ATLAS_RANGES) {
  for (let cp = range.start; cp <= range.end; cp++) {
    CODEPOINT_TO_INDEX.set(cp, CODEPOINTS.length)
    CODEPOINTS.push(cp)
  }
}

export const GLYPH_COUNT = CODEPOINTS.length

// ── Atlas type ────────────────────────────────────────────────────────────

export type AtlasInfo = {
  fontId: number
  cellWidth: number
  cellHeight: number
  ascender: number
  /** Grayscale alpha, GLYPH_COUNT * cellWidth * cellHeight bytes. */
  data: Uint8Array
  /** Per-glyph advance widths, indexed by glyphIndex. */
  glyphWidths: Float32Array
  /** Total number of glyphs in this atlas. */
  glyphCount: number
  /**
   * Returns the glyphIndex for a codepoint, or -1 if not in atlas.
   * Inline for hot-path performance.
   */
  indexFor: (cp: number) => number
}

// ── Cache ─────────────────────────────────────────────────────────────────

const atlasCache = new Map<number, AtlasInfo>()
const MAX_FONT_ATLAS_CACHE = 16

function touchAtlasCacheEntry(fontId: number, atlas: AtlasInfo) {
  atlasCache.delete(fontId)
  atlasCache.set(fontId, atlas)
}

/** Map common generic font names to platform-specific fonts. */
function resolveFontFamily(family: string): string {
  const fallbacks: Record<string, string> = {
    "monospace": "SF Mono",
    "sans-serif": "SF Pro",
    "serif": "Georgia",
    "system-ui": "SF Pro",
  }
  return fallbacks[family.toLowerCase()] ?? family
}

// ── Generator ─────────────────────────────────────────────────────────────

/**
 * Generate a font atlas covering ATLAS_RANGES for the given font descriptor.
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
  const fontCSS = `${style === "italic" ? "italic " : ""}${weight} ${size}px "${family}"`

  // ── Measure pass: find max cell dimensions across all glyphs ──

  const measureCanvas = createCanvas(200, 200)
  const measureCtx = measureCanvas.getContext("2d")
  measureCtx.font = fontCSS

  let maxWidth = 0
  let maxAscent = 0
  let maxDescent = 0
  const glyphWidths = new Float32Array(GLYPH_COUNT)

  for (let i = 0; i < GLYPH_COUNT; i++) {
    const cp = CODEPOINTS[i]
    const ch = String.fromCodePoint(cp)
    const metrics = measureCtx.measureText(ch)
    const w = Math.ceil(metrics.width)
    const asc = Math.ceil((metrics.actualBoundingBoxAscent as number | undefined) ?? size * 0.8)
    const desc2 = Math.ceil((metrics.actualBoundingBoxDescent as number | undefined) ?? size * 0.2)

    glyphWidths[i] = metrics.width
    if (w > maxWidth) maxWidth = w
    if (asc > maxAscent) maxAscent = asc
    if (desc2 > maxDescent) maxDescent = desc2
  }

  const cellWidth = Math.max(maxWidth, 1)
  const cellHeight = Math.max(maxAscent + maxDescent + 1, 1)
  const ascender = maxAscent

  // ── Render pass: draw each glyph into its cell ──

  const totalBytes = GLYPH_COUNT * cellWidth * cellHeight
  const data = new Uint8Array(totalBytes)

  for (let i = 0; i < GLYPH_COUNT; i++) {
    const cp = CODEPOINTS[i]
    const canvas = createCanvas(cellWidth, cellHeight)
    const ctx = canvas.getContext("2d")
    ctx.clearRect(0, 0, cellWidth, cellHeight)
    ctx.font = fontCSS
    ctx.fillStyle = "#ffffff"
    ctx.textBaseline = "top"
    ctx.fillText(String.fromCodePoint(cp), 0, 0)

    const imageData = ctx.getImageData(0, 0, cellWidth, cellHeight)
    const pixels = imageData.data
    const offset = i * cellWidth * cellHeight
    for (let p = 0; p < cellWidth * cellHeight; p++) {
      data[offset + p] = pixels[p * 4 + 3]
    }
  }

  const info: AtlasInfo = {
    fontId,
    cellWidth,
    cellHeight,
    ascender,
    data,
    glyphWidths,
    glyphCount: GLYPH_COUNT,
    indexFor: (cp: number) => CODEPOINT_TO_INDEX.get(cp) ?? -1,
  }

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
