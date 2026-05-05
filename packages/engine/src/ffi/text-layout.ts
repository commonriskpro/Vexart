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

// Default: sans-serif 14px — resolved by Rust fontdb to the system UI font.
fontRegistry.set(0, { family: "sans-serif", size: 14 })

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

/** A single laid-out line of text with its measured pixel width. */
export type LayoutLine = {
  text: string
  width: number
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

/** Lay out text into lines with greedy word-wrap using native font measurement. */
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

  const measureWord = (w: string) => nativeMeasure(w, fontSize, families, weight, italic).width
  const spaceWidth = measureWord(" ")

  const paragraphs = text.split("\n")
  const lines: LayoutLine[] = []

  for (const para of paragraphs) {
    const words = para.split(" ").filter(w => w.length > 0)
    if (words.length === 0) {
      lines.push({ text: "", width: 0 })
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
          lines.push({ text: current, width: Math.ceil(currentWidth) })
          current = word
          currentWidth = wordWidth
        }
      }
    }
    if (current) {
      lines.push({ text: current, width: Math.ceil(currentWidth) })
    }
  }

  if (lines.length === 0) {
    lines.push({ text: "", width: 0 })
  }

  return { lines, lineCount: lines.length, height: lines.length * lineHeight }
}

// ── Built-in monospace atlas metrics (bitmap fallback path only) ──
// Used by the legacy bitmap glyph renderer (VEXART_MSDF=0).
const BUILTIN_FONT_SIZE = 14

export function builtinFontScale(fontSize: number): number {
  return Math.max(1, fontSize) / BUILTIN_FONT_SIZE
}

// ── Native font measurement (Rust FFI) ──
// Uses vexart_font_measure for accurate proportional metrics.
// Cached to avoid FFI overhead on repeated measurements.
const nativeMeasureCache = createLRUCache<string, { width: number; height: number }>(MAX_CACHE)
let _nativeAvailable: boolean | null = null

function nativeMeasure(text: string, fontSize: number, families: string[] = ["sans-serif"], weight = 400, italic = false): { width: number; height: number } {
  if (_nativeAvailable === null) _nativeAvailable = isMsdfFontAvailable()
  if (!_nativeAvailable) throw new Error("Vexart native font system unavailable — libvexart.dylib not loaded")

  const key = `native\0${fontSize}\0${weight}\0${italic ? 1 : 0}\0${families.join(",")}\0${text}`
  return nativeMeasureCache.get(key, () => {
    const result = msdfMeasureText(text, families, fontSize, weight, italic)
    if (!result) throw new Error(`Vexart font measurement failed for families=[${families}] size=${fontSize}`)
    return { width: Math.ceil(result.width), height: Math.max(Math.ceil(result.height), Math.ceil(fontSize * 1.2)) }
  })
}

/**
 * Measure text width for Flexily layout.
 * This function remains the authoritative TS-side text
 * measurement helper for the decomposed layout shell and offscreen fallbacks.
 *
 * Uses vexart_font_measure (Rust/ttf-parser) via FFI for accurate
 * proportional metrics that match the MSDF rendering pipeline.
 * Falls back to monospace heuristic when native FFI is unavailable.
 */
export function measureForLayout(
  text: string,
  fontId: number,
  fontSize: number,
  overrideFontFamily?: string,
  overrideFontWeight?: number,
  overrideFontStyle?: string,
): { width: number; height: number } {
  const desc = getFont(fontId)
  // fontId 0 renders via MSDF as "sans-serif" — must measure with the same family.
  // Other fontIds use their registered family name.
  // Explicit fontFamily/fontWeight/fontStyle props override the fontId descriptor.
  const families = overrideFontFamily ? [overrideFontFamily] : (fontId === 0 ? ["sans-serif"] : [desc.family])
  const weight = overrideFontWeight ?? desc.weight ?? 400
  const italic = overrideFontStyle === "italic" ? true : (overrideFontStyle !== undefined ? false : desc.style === "italic")
  const effectiveSize = fontSize || desc.size

  return nativeMeasure(text, effectiveSize, families, weight, italic)
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
  overrideFontFamily?: string,
  overrideFontWeight?: number,
  overrideFontStyle?: string,
): { width: number; height: number } {
  if (maxWidth <= 0) return measureForLayout(text, fontId, fontSize, overrideFontFamily, overrideFontWeight, overrideFontStyle)

  const lineHeight = Math.ceil(fontSize * 1.2)

  // Fast path: if natural width fits, no wrapping needed
  const natural = measureForLayout(text, fontId, fontSize, overrideFontFamily, overrideFontWeight, overrideFontStyle)
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


