/**
 * Text layout — native Rust font measurement for Vexart.
 *
 * All text measurement uses vexart_font_measure (Rust/ttf-parser) via FFI.
 * This ensures measurement and MSDF rendering use identical font metrics.
 *
 * Word wrapping is implemented in TS with greedy word-wrap using
 * native per-word measurements — same algorithm as Rust's font::layout.
 *
 * Replaces the former Pretext + @napi-rs/canvas (Skia polyfill) path.
 */

import { createLRUCache } from "./lru-cache"
import { msdfMeasureText, isMsdfFontAvailable } from "./msdf-font"

// ── Font registry ──
// Maps fontId → font descriptor string (CSS font shorthand).
// fontId 0 is always the default monospace font.

/** @public */
export type FontDescriptor = {
  family: string
  size: number
  weight?: number
  style?: "normal" | "italic"
}

const fontRegistry = new Map<number, FontDescriptor>()

// Default: SF Pro 14px — Apple's proportional system UI font.
// Clean, modern, designed for UI. Dot-prefixed name required for
// @napi-rs/canvas on macOS to resolve the real system font.
fontRegistry.set(0, { family: ".SF NS", size: 14 })

/** Register a font for use with Vexart text rendering. */
/** @public */
export function registerFont(id: number, desc: FontDescriptor) {
  fontRegistry.set(id, desc)
  clearTextCache()
}

/** Get font descriptor by ID. Falls back to default. */
/** @public */
export function getFont(id: number): FontDescriptor {
  return fontRegistry.get(id) ?? fontRegistry.get(0)!
}

/** Convert FontDescriptor to CSS font shorthand for Pretext/canvas. */
export function fontToCSS(desc: FontDescriptor): string {
  const style = desc.style === "italic" ? "italic " : ""
  const weight = desc.weight ? `${desc.weight} ` : ""
  return `${style}${weight}${desc.size}px ${desc.family}`
}

// ── Measurement cache ──
// Cache prepared text to avoid re-measuring on every frame.
// Key: text + font CSS string. Invalidated when text or font changes.

/** Layout line — compatible with the former Pretext LayoutLine type. */
export type LayoutLine = {
  text: string
  width: number
  start: { segmentIndex: number; graphemeIndex: number }
  end: { segmentIndex: number; graphemeIndex: number }
}

const MAX_CACHE = 501
const MAX_LAYOUT_CACHE = 1000
const layoutCache = createLRUCache<string, { lines: LayoutLine[]; height: number; lineCount: number }>(MAX_LAYOUT_CACHE)

function layoutCacheKey(text: string, fontId: number, fontSize: number, maxWidth: number, lineHeight: number) {
  return `${fontId}\0${fontSize}\0${maxWidth}\0${lineHeight}\0${text}`
}

/** Measure text width for a single line (no wrapping). Uses native Rust FFI. */
export function measureTextWidth(text: string, fontId: number): number {
  const desc = getFont(fontId)
  return measureForLayout(text, fontId, desc.size).width
}

/** Get the height of text within a container width. Uses native Rust FFI. */
export function measureTextHeight(
  text: string,
  fontId: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const result = layoutText(text, fontId, maxWidth, lineHeight)
  return result.height
}

/**
 * Lay out text into lines for rendering.
 * Font 0: word-wrap using atlas metrics (8.65px/char).
 * Other fonts: Pretext layout with canvas measurement.
 */
export function layoutText(
  text: string,
  fontId: number,
  maxWidth: number,
  lineHeight: number,
  fontSize = getFont(fontId).size,
  _options?: unknown,
): { lines: LayoutLine[]; height: number; lineCount: number } {
  const key = layoutCacheKey(text, fontId, fontSize, maxWidth, lineHeight)
  return layoutCache.get(key, () => {
    return layoutWithNativeMeasure(text, fontId, maxWidth, lineHeight, fontSize)
  })
}

/** Word-wrap using native Rust font measurement for accurate proportional metrics. */
function layoutWithNativeMeasure(
  text: string,
  fontId: number,
  maxWidth: number,
  lineHeight: number,
  fontSize: number,
): { lines: LayoutLine[]; height: number; lineCount: number } {
  const desc = getFont(fontId)
  const families = fontId === 0 ? ["sans-serif"] : [desc.family]
  const weight = desc.weight ?? 400
  const italic = desc.style === "italic"

  // Measure each word with native font metrics for accurate wrapping.
  const measureWord = (w: string) => {
    const m = nativeMeasure(w, fontSize, families, weight, italic)
    return m ? m.width : Math.ceil(w.length * builtinAdvance(fontSize))
  }
  const spaceWidth = measureWord(" ")

  const paragraphs = text.split("\n")
  const lines: LayoutLine[] = []

  for (const para of paragraphs) {
    const words = para.split(" ").filter(w => w.length > 0)
    if (words.length === 0) {
      lines.push({ text: "", width: 0, start: { segmentIndex: 0, graphemeIndex: 0 }, end: { segmentIndex: 0, graphemeIndex: 0 } })
      continue
    }

    let current = ""
    let currentWidth = 0

    for (const word of words) {
      const wordWidth = measureWord(word)
      if (current === "") {
        current = word
        currentWidth = wordWidth
      } else {
        const candidateWidth = currentWidth + spaceWidth + wordWidth
        if (candidateWidth <= maxWidth) {
          current += " " + word
          currentWidth = candidateWidth
        } else {
          lines.push({ text: current, width: Math.ceil(currentWidth), start: { segmentIndex: 0, graphemeIndex: 0 }, end: { segmentIndex: 0, graphemeIndex: 0 } })
          current = word
          currentWidth = wordWidth
        }
      }
    }
    if (current) {
      lines.push({ text: current, width: Math.ceil(currentWidth), start: { segmentIndex: 0, graphemeIndex: 0 }, end: { segmentIndex: 0, graphemeIndex: 0 } })
    }
  }

  if (lines.length === 0) {
    lines.push({ text: "", width: 0, start: { segmentIndex: 0, graphemeIndex: 0 }, end: { segmentIndex: 0, graphemeIndex: 0 } })
  }

  return { lines, lineCount: lines.length, height: lines.length * lineHeight }
}

// ── Layout adapter integration ──
// Native Rust-based text measurement for Flexily layout.

// ── Built-in atlas metrics ──
// Font 0 = .SF NS Mono 14px bitmap atlas.
// Built-in advance: 8.65px per char (865 hundredths fixed-point).
// Cell: 9px wide (glyph bounding box), 17px tall.
// These MUST match the generated native font atlas metrics.
const BUILTIN_ADVANCE = 8.65
const BUILTIN_HEIGHT = 17
const BUILTIN_FONT_SIZE = 14

export function builtinFontScale(fontSize: number): number {
  return Math.max(1, fontSize) / BUILTIN_FONT_SIZE
}

export function builtinAdvance(fontSize: number): number {
  return BUILTIN_ADVANCE * builtinFontScale(fontSize)
}

export function builtinHeight(fontSize: number): number {
  return Math.ceil(BUILTIN_HEIGHT * builtinFontScale(fontSize))
}

/**
 * Measure text for Vexart layout.
 *
 * The walk-tree path uses `measureForLayout()` directly because it
 * pre-computes text box dimensions before emitting layout commands.
 */
export function measureForVexart(
  _text: string,
  _fontId: number,
  _fontSize: number,
): { width: number; height: number } {
  return measureForLayout(_text, _fontId, _fontSize)
}

// ── Native font measurement (Rust FFI) ──
// Uses vexart_font_measure for accurate proportional metrics.
// Cached to avoid FFI overhead on repeated measurements.
const nativeMeasureCache = createLRUCache<string, { width: number; height: number }>(MAX_CACHE)
let _nativeAvailable: boolean | null = null

function nativeMeasure(text: string, fontSize: number, families: string[] = ["sans-serif"], weight = 400, italic = false): { width: number; height: number } | null {
  if (_nativeAvailable === null) _nativeAvailable = isMsdfFontAvailable()
  if (!_nativeAvailable) return null

  const key = `native\0${fontSize}\0${weight}\0${italic ? 1 : 0}\0${families.join(",")}\0${text}`
  return nativeMeasureCache.get(key, () => {
    const result = msdfMeasureText(text, families, fontSize, weight, italic)
    if (!result) return { width: Math.ceil(text.length * builtinAdvance(fontSize)), height: builtinHeight(fontSize) }
    return { width: Math.ceil(result.width), height: Math.max(Math.ceil(result.height), Math.ceil(fontSize * 1.2)) }
  })
}

/**
 * Measure text width for Flexily layout.
 * This function remains the authoritative TS-side text
 * measurement helper for the decomposed layout shell and offscreen fallbacks.
 *
 * Font 0 + MSDF available: uses vexart_font_measure (Rust/ttf-parser) for
 * accurate proportional metrics that match the MSDF rendering pipeline.
 * Font 0 fallback: monospace 8.65px/char heuristic.
 * Other fonts: uses Pretext/canvas for accurate measurement.
 */
export function measureForLayout(
  text: string,
  fontId: number,
  fontSize: number,
): { width: number; height: number } {
  const desc = getFont(fontId)
  // fontId 0 renders via MSDF as "sans-serif" — must measure with the same family.
  // Other fontIds use their registered family name.
  const families = fontId === 0 ? ["sans-serif"] : [desc.family]
  const weight = desc.weight ?? 400
  const italic = desc.style === "italic"
  const effectiveSize = fontSize || desc.size

  // Try Rust native measurement (same metrics as MSDF rendering pipeline)
  const native = nativeMeasure(text, effectiveSize, families, weight, italic)
  if (native && native.width > 0) return native

  // Fallback: monospace heuristic (only when native FFI unavailable)
  return {
    width: Math.ceil(text.length * builtinAdvance(effectiveSize)),
    height: builtinHeight(effectiveSize),
  }
}

/**
 * Measure text with a width constraint — computes word-wrapped height.
 * Used by Flexily's setMeasureFunc to get correct multi-line text dimensions.
 *
 * @param text - The text content
 * @param fontId - Font ID (0 = builtin monospace)
 * @param fontSize - Font size in px
 * @param maxWidth - Available width for word wrapping
 * @returns { width, height } — natural width (capped at maxWidth) and wrapped height
 */
export function measureTextConstrained(
  text: string,
  fontId: number,
  fontSize: number,
  maxWidth: number,
): { width: number; height: number } {
  if (maxWidth <= 0) return measureForLayout(text, fontId, fontSize)

  const lineHeight = Math.ceil(fontSize * 1.2)

  // Fast path: if natural width fits, no wrapping needed
  const natural = measureForLayout(text, fontId, fontSize)
  if (natural.width <= maxWidth) return natural

  // Multi-line: compute wrapped layout (cached by layoutText LRU)
  const result = layoutText(text, fontId, maxWidth, lineHeight, fontSize)
  // Width: widest line (capped at maxWidth)
  let widest = 0
  for (const line of result.lines) {
    if (line.width > widest) widest = line.width
  }
  return {
    width: Math.min(Math.ceil(widest), Math.ceil(maxWidth)),
    height: result.height,
  }
}

/** Clear all text measurement and layout caches. */
/** @public */
export function clearTextCache() {
  layoutCache.clear()
  nativeMeasureCache.clear()
}

/** @public */
export function getTextLayoutCacheStats() {
  return {
    preparedCount: nativeMeasureCache.size,
    layoutCount: layoutCache.size,
  }
}

// Re-export types (LayoutLine is defined above; Pretext types removed)
// PreparedTextWithSegments, PrepareOptions, RichInlineItem, RichInlineLine
// were Pretext types — no longer available after native measurement migration.
