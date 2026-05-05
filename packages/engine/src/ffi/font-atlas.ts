/**
 * Runtime font atlas generator — creates bitmap atlases on demand.
 *
 * This module creates font atlases at runtime using @napi-rs/canvas and uploads
 * them to the native text renderer via FFI.
 *
 * Each font (family + size + weight + style) gets its own atlas.
 * Atlas data is grayscale alpha values for all glyphs in ATLAS_RANGES.
 *
 * ## Glyph ranges covered
 *
 * Range selection principle: cover everything Vexart UI components actually
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

// @napi-rs/canvas is only needed for the legacy bitmap atlas path (VEXART_MSDF=0).
// Lazy-loaded to avoid crashing when the package is not installed (MSDF is the default).
let _createCanvas: typeof import("@napi-rs/canvas").createCanvas | null = null
function createCanvas(w: number, h: number) {
  if (!_createCanvas) {
    try {
      _createCanvas = require("@napi-rs/canvas").createCanvas
    } catch {
      throw new Error("@napi-rs/canvas is required for bitmap font atlas generation (VEXART_MSDF=0 fallback). Install it with: bun add @napi-rs/canvas")
    }
  }
  return _createCanvas!(w, h)
}
import type { FontDescriptor } from "./text-layout"
import { openVexartLibrary } from "./vexart-bridge"

// ── Native text atlas upload ─────────────────────────────────────────────────
// loadFontAtlas() generates runtime bitmap atlas data and uploads it through
// vexart_text_load_atlas() so the native text renderer can measure and dispatch
// glyphs from the active GPU atlas. Per design §11, §5.5, REQ-NB-005.

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
  /** Cell dimensions in the atlas texture (supersampled pixels). */
  cellWidth: number
  cellHeight: number
  /** Display cell dimensions (original size, for quad sizing). */
  displayCellWidth: number
  displayCellHeight: number
  ascender: number
  /** Grayscale alpha, GLYPH_COUNT * cellWidth * cellHeight bytes. */
  data: Uint8Array
  /** Per-glyph advance widths at original size, indexed by glyphIndex. */
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
/** Atlas supersampling factor — render glyphs at 2× size for crisp text on Retina displays. */
const ATLAS_SUPERSAMPLE = 2

export function generateAtlas(fontId: number, desc: FontDescriptor): AtlasInfo {
  const cached = atlasCache.get(fontId)
  if (cached) {
    touchAtlasCacheEntry(fontId, cached)
    return cached
  }

  const family = resolveFontFamily(desc.family)
  const size = desc.size
  const hiresSize = size * ATLAS_SUPERSAMPLE
  const weight = desc.weight ?? 400
  const style = desc.style ?? "normal"
  // Measure at original size (for layout advance widths)
  const fontCSS = `${style === "italic" ? "italic " : ""}${weight} ${size}px "${family}"`
  // Render at supersampled size (for atlas texture quality)
  const hiresFontCSS = `${style === "italic" ? "italic " : ""}${weight} ${hiresSize}px "${family}"`

  // ── Measure pass at ORIGINAL size (layout advance widths must match) ──

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

  // Cell dimensions at supersampled size (for the atlas texture)
  const cellWidth = Math.max(maxWidth * ATLAS_SUPERSAMPLE, 1)
  const cellHeight = Math.max((maxAscent + maxDescent + 1) * ATLAS_SUPERSAMPLE, 1)
  const ascender = maxAscent

  // ── Render pass: draw each glyph into its cell ──

  const totalBytes = GLYPH_COUNT * cellWidth * cellHeight
  const data = new Uint8Array(totalBytes)

  for (let i = 0; i < GLYPH_COUNT; i++) {
    const cp = CODEPOINTS[i]
    const canvas = createCanvas(cellWidth, cellHeight)
    const ctx = canvas.getContext("2d")
    ctx.clearRect(0, 0, cellWidth, cellHeight)
    ctx.font = hiresFontCSS
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

  const displayCellWidth = Math.max(maxWidth, 1)
  const displayCellHeight = Math.max(maxAscent + maxDescent + 1, 1)

  const info: AtlasInfo = {
    fontId,
    cellWidth,
    cellHeight,
    displayCellWidth,
    displayCellHeight,
    ascender,
    data,
    glyphWidths,
    glyphCount: GLYPH_COUNT,
    indexFor: (cp: number) => CODEPOINT_TO_INDEX.get(cp) ?? -1,
  }

  if (atlasCache.size >= MAX_FONT_ATLAS_CACHE) {
    const first = atlasCache.keys().next().value
    if (first !== undefined) {
      // TODO: Add vexart_text_unload_atlas to the native API so JS LRU eviction
      // can release the matching Rust/WGPU atlas. For now this is JS-side only.
      atlasCache.delete(first)
    }
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

/**
 * Load a font atlas into the Rust GPU text pipeline via vexart_text_load_atlas.
 *
 * Generates a bitmap atlas as a PNG (via @napi-rs/canvas) and a metrics JSON
 * matching the format expected by native/libvexart/src/text/glyph_info.rs.
 * The Rust side decodes the PNG, uploads as GPU texture, and creates the atlas
 * bind group for the MSDF glyph pipeline (cmd_kind=18).
 *
 * @param ctx     vexart context handle (u64 as bigint) — unused by Rust (global paint ctx)
 * @param fontId  Font ID (1-15 for Rust atlas registry; 0 maps to 1 for the default font)
 * @param desc    Font descriptor
 * @returns true on success
 */
export function loadFontAtlas(ctx: bigint, fontId: number, desc: FontDescriptor): boolean {
  const atlas = generateAtlas(fontId, desc)
  const { symbols } = openVexartLibrary()
  const { ptr } = require("bun:ffi") as typeof import("bun:ffi")

  // Rust atlas registry requires fontId 1-15. Map fontId 0 → 1 for the default font.
  const rustFontId = fontId === 0 ? 1 : fontId

  // ── Build RGBA atlas texture as PNG ──
  const columns = 32
  const rows = Math.ceil(atlas.glyphCount / columns)
  const texW = atlas.cellWidth * columns
  const texH = atlas.cellHeight * rows
  const canvas = createCanvas(texW, texH)
  const canvasCtx = canvas.getContext("2d")
  const imgData = canvasCtx.createImageData(texW, texH)
  const pixels = imgData.data

  for (let gi = 0; gi < atlas.glyphCount; gi++) {
    const col = gi % columns
    const row = Math.floor(gi / columns)
    const srcOff = gi * atlas.cellWidth * atlas.cellHeight
    for (let py = 0; py < atlas.cellHeight; py++) {
      for (let px = 0; px < atlas.cellWidth; px++) {
        const alpha = atlas.data[srcOff + py * atlas.cellWidth + px]
        const dx = col * atlas.cellWidth + px
        const dy = row * atlas.cellHeight + py
        const di = (dy * texW + dx) * 4
        pixels[di] = 255     // R
        pixels[di + 1] = 255 // G
        pixels[di + 2] = 255 // B
        pixels[di + 3] = alpha
      }
    }
  }
  canvasCtx.putImageData(imgData, 0, 0)
  const pngBuffer = canvas.toBuffer("image/png")

  // ── Build metrics JSON ──
  const glyphs: any[] = []
  for (let gi = 0; gi < atlas.glyphCount; gi++) {
    const cp = CODEPOINTS[gi]
    const col = gi % columns
    const row = Math.floor(gi / columns)
    glyphs.push({
      codepoint: cp,
      char: String.fromCodePoint(cp),
      atlasX: col * atlas.cellWidth,
      atlasY: row * atlas.cellHeight,
      atlasW: atlas.cellWidth,
      atlasH: atlas.cellHeight,
      xOffset: 0,
      yOffset: 0,
      xAdvance: Math.round(atlas.glyphWidths[gi]),
    })
  }
  const metricsJson = JSON.stringify({
    fontName: desc.family,
    atlasWidth: texW,
    atlasHeight: texH,
    refSize: desc.size,
    cellWidth: atlas.cellWidth,
    cellHeight: atlas.cellHeight,
    glyphs,
  })

  const pngU8 = new Uint8Array(pngBuffer)
  const metricsU8 = new TextEncoder().encode(metricsJson)

  const result = symbols.vexart_text_load_atlas(
    ctx,
    rustFontId,
    ptr(pngU8), pngU8.byteLength,
    ptr(metricsU8), metricsU8.byteLength,
  ) as number

  return result === 0
}

/** @public */
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
