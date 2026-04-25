/**
 * Text layout — Pretext integration for TGE.
 *
 * Bridges @chenglou/pretext (text measurement & layout) with TGE's
 * Zig bitmap rendering. Pretext handles word wrap, line breaking,
 * BiDi, CJK — TGE handles pixel painting.
 *
 * Canvas polyfill: Pretext needs a CanvasRenderingContext2D for
 * measureText(). In Bun there's no DOM/OffscreenCanvas, so we
 * polyfill with @napi-rs/canvas before first use.
 */

import { createCanvas, type Canvas as NapiCanvas } from "@napi-rs/canvas"

// ── Canvas polyfill for Pretext ──
// Must be set BEFORE importing Pretext, because it calls
// getMeasureContext() on first prepare().
if (typeof globalThis.OffscreenCanvas === "undefined") {
  // Polyfill OffscreenCanvas for Pretext in Bun (no DOM/Web APIs).
  // The class only needs to implement getContext("2d") — the subset Pretext uses.
  // Cast is required because the Bun type declaration expects the full DOM interface.
  globalThis.OffscreenCanvas = class OffscreenCanvasPolyfill {
    private _canvas: NapiCanvas
    constructor(w: number, h: number) {
      this._canvas = createCanvas(w, h)
    }
    getContext(type: "2d") {
      return this._canvas.getContext(type)
    }
  } as unknown as typeof OffscreenCanvas
}

// Now safe to import Pretext
import {
  prepareWithSegments,
  layoutWithLines,
  layout,
  measureLineStats,
  measureNaturalWidth,
  clearCache,
  type PreparedTextWithSegments,
  type LayoutLine,
  type PrepareOptions,
} from "@chenglou/pretext"

import {
  prepareRichInline,
  walkRichInlineLineRanges,
  materializeRichInlineLineRange,
  type RichInlineItem,
  type RichInlineLine,
} from "@chenglou/pretext/rich-inline"

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

/** Register a font for use with TGE text rendering. */
/** @public */
export function registerFont(id: number, desc: FontDescriptor) {
  fontRegistry.set(id, desc)
  clearCache()
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

const preparedCache = new Map<string, PreparedTextWithSegments>()
const MAX_CACHE = 500
const layoutCache = new Map<string, { lines: LayoutLine[]; height: number; lineCount: number }>()
const MAX_LAYOUT_CACHE = 1000

function touchTextCacheEntry<K, V>(cache: Map<K, V>, key: K, value: V) {
  cache.delete(key)
  cache.set(key, value)
}

function cacheKey(text: string, font: string): string {
  return `${font}\0${text}`
}

function layoutCacheKey(text: string, fontId: number, fontSize: number, maxWidth: number, lineHeight: number) {
  return `${fontId}\0${fontSize}\0${maxWidth}\0${lineHeight}\0${text}`
}

function getCachedLayout(text: string, fontId: number, fontSize: number, maxWidth: number, lineHeight: number) {
  const key = layoutCacheKey(text, fontId, fontSize, maxWidth, lineHeight)
  const cached = layoutCache.get(key)
  if (cached) touchTextCacheEntry(layoutCache, key, cached)
  return cached
}

function setCachedLayout(text: string, fontId: number, fontSize: number, maxWidth: number, lineHeight: number, value: { lines: LayoutLine[]; height: number; lineCount: number }) {
  if (layoutCache.size >= MAX_LAYOUT_CACHE) {
    const first = layoutCache.keys().next().value
    if (first) layoutCache.delete(first)
  }
  layoutCache.set(layoutCacheKey(text, fontId, fontSize, maxWidth, lineHeight), value)
  return value
}

/** Prepare text for layout (cached). */
export function prepareText(
  text: string,
  fontId: number,
  options?: PrepareOptions,
): PreparedTextWithSegments {
  const desc = getFont(fontId)
  const css = fontToCSS(desc)
  const key = cacheKey(text, css)
  let prepared = preparedCache.get(key)
  if (!prepared) {
    if (preparedCache.size > MAX_CACHE) {
      // Evict oldest entries (simple FIFO)
      const first = preparedCache.keys().next().value!
      preparedCache.delete(first)
    }
    prepared = prepareWithSegments(text, css, options)
    preparedCache.set(key, prepared)
  } else {
    touchTextCacheEntry(preparedCache, key, prepared)
  }
  return prepared
}

/** Measure text width for a single line (no wrapping). */
export function measureTextWidth(text: string, fontId: number): number {
  const prepared = prepareText(text, fontId)
  return measureNaturalWidth(prepared)
}

/** Get the height of text within a container width. */
export function measureTextHeight(
  text: string,
  fontId: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const prepared = prepareText(text, fontId)
  const result = layout(prepared, maxWidth, lineHeight)
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
  options?: PrepareOptions,
): { lines: LayoutLine[]; height: number; lineCount: number } {
  const cached = getCachedLayout(text, fontId, fontSize, maxWidth, lineHeight)
  if (cached) return cached

  if (fontId === 0) {
    return setCachedLayout(text, fontId, fontSize, maxWidth, lineHeight, layoutBuiltinFont(text, maxWidth, lineHeight, fontSize))
  }
  const desc = getFont(fontId)
  const effectiveDesc = desc.size === fontSize ? desc : { ...desc, size: fontSize }
  const prepared = prepareWithSegments(text, fontToCSS(effectiveDesc), options)
  return setCachedLayout(text, fontId, fontSize, maxWidth, lineHeight, layoutWithLines(prepared, maxWidth, lineHeight))
}

/** Word-wrap for built-in bitmap font using exact atlas advance width. */
function layoutBuiltinFont(
  text: string,
  maxWidth: number,
  lineHeight: number,
  fontSize: number,
): { lines: LayoutLine[]; height: number; lineCount: number } {
  const advance = builtinAdvance(fontSize)
  const charsPerLine = Math.max(1, Math.floor(maxWidth / advance))
  const words = text.split(" ")
  const lines: LayoutLine[] = []
  let current = ""

  for (const word of words) {
    const candidate = current ? current + " " + word : word
    if (candidate.length > charsPerLine && current) {
      lines.push({
        text: current,
        width: Math.ceil(current.length * advance),
        start: { segmentIndex: 0, graphemeIndex: 0 },
        end: { segmentIndex: 0, graphemeIndex: 0 },
      })
      current = word
    } else {
      current = candidate
    }
  }
  if (current) {
    lines.push({
      text: current,
      width: Math.ceil(current.length * advance),
      start: { segmentIndex: 0, graphemeIndex: 0 },
      end: { segmentIndex: 0, graphemeIndex: 0 },
    })
  }
  if (lines.length === 0) {
    lines.push({
      text: "",
      width: 0,
      start: { segmentIndex: 0, graphemeIndex: 0 },
      end: { segmentIndex: 0, graphemeIndex: 0 },
    })
  }

  return { lines, lineCount: lines.length, height: lines.length * lineHeight }
}

/**
 * Lay out rich inline text (mixed fonts/styles) into lines.
 * Each item can have a different font.
 */
export function layoutRichText(
  items: RichInlineItem[],
  maxWidth: number,
  lineHeight: number,
): RichInlineLine[] {
  const prepared = prepareRichInline(items)
  const lines: RichInlineLine[] = []
  walkRichInlineLineRanges(prepared, maxWidth, (range) => {
    lines.push(materializeRichInlineLineRange(prepared, range))
  })
  return lines
}

// ── Clay integration ──
// Pretext-based text measurement for Clay's callback.

// ── Built-in atlas metrics ──
// Font 0 = .SF NS Mono 14px bitmap atlas.
// Zig advance: 8.65px per char (865 hundredths fixed-point).
// Cell: 9px wide (glyph bounding box), 17px tall.
// These MUST match zig/src/text.zig advance_hundredths and font_atlas.zig.
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
 * Measure text for Taffy/vexart layout.
 *
 * Retained/native layout now performs real text measurement on the Rust side.
 * The compat walk-tree path still uses `measureForClay()` directly because it
 * pre-computes text box dimensions before emitting layout commands.
 */
export function measureForVexart(
  _text: string,
  _fontId: number,
  _fontSize: number,
): { width: number; height: number } {
  return measureForClay(_text, _fontId, _fontSize)
}

/**
 * Measure text width for Clay layout.
 * Phase 2+ compat path: this function remains the authoritative TS-side text
 * measurement helper for the decomposed layout shell and offscreen fallbacks.
 * Font 0: uses exact atlas metrics (8.65px/char) to match Zig renderer.
 * Other fonts: uses Pretext/canvas for accurate measurement.
 */
export function measureForClay(
  text: string,
  fontId: number,
  fontSize: number,
): { width: number; height: number } {
  // Built-in atlas: use known metrics (JS string length = char count)
  if (fontId === 0) {
    return {
      width: Math.ceil(text.length * builtinAdvance(fontSize)),
      height: builtinHeight(fontSize),
    }
  }

  // Runtime fonts: measure with Pretext/canvas
  const desc = getFont(fontId)
  const effectiveDesc = desc.size === fontSize ? desc : { ...desc, size: fontSize }
  const css = fontToCSS(effectiveDesc)
  const key = cacheKey(text, css)

  let prepared = preparedCache.get(key)
  if (!prepared) {
    if (preparedCache.size > MAX_CACHE) {
      const first = preparedCache.keys().next().value!
      preparedCache.delete(first)
    }
    prepared = prepareWithSegments(text, css)
    preparedCache.set(key, prepared)
  } else {
    touchTextCacheEntry(preparedCache, key, prepared)
  }

  const width = measureNaturalWidth(prepared)
  const height = Math.ceil(fontSize * 1.2)
  return { width, height }
}

/** Clear all prepared text caches. */
/** @public */
export function clearTextCache() {
  preparedCache.clear()
  layoutCache.clear()
  clearCache()
}

/** @public */
export function getTextLayoutCacheStats() {
  return {
    preparedCount: preparedCache.size,
    layoutCount: layoutCache.size,
  }
}

// Re-export types
export type { LayoutLine, PreparedTextWithSegments, PrepareOptions, RichInlineItem, RichInlineLine }
