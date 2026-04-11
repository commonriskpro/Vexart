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

import { createCanvas } from "@napi-rs/canvas"

// ── Canvas polyfill for Pretext ──
// Must be set BEFORE importing Pretext, because it calls
// getMeasureContext() on first prepare().
if (typeof globalThis.OffscreenCanvas === "undefined") {
  ;(globalThis as any).OffscreenCanvas = class OffscreenCanvas {
    private _canvas: any
    constructor(w: number, h: number) {
      this._canvas = createCanvas(w, h)
    }
    getContext(type: string) {
      return this._canvas.getContext(type)
    }
  }
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

export type FontDescriptor = {
  family: string
  size: number
  weight?: number
  style?: "normal" | "italic"
}

const fontRegistry = new Map<number, FontDescriptor>()

// Default: SF Mono 14px (matches our bitmap atlas)
fontRegistry.set(0, { family: "SF Mono", size: 14 })

/** Register a font for use with TGE text rendering. */
export function registerFont(id: number, desc: FontDescriptor) {
  fontRegistry.set(id, desc)
  clearCache()
}

/** Get font descriptor by ID. Falls back to default. */
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

function cacheKey(text: string, font: string): string {
  return `${font}\0${text}`
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
  const result = layout(prepared as any, maxWidth, lineHeight)
  return result.height
}

/**
 * Lay out text into lines for rendering.
 * Returns individual lines with their text content and width.
 */
export function layoutText(
  text: string,
  fontId: number,
  maxWidth: number,
  lineHeight: number,
  options?: PrepareOptions,
): { lines: LayoutLine[]; height: number; lineCount: number } {
  const prepared = prepareText(text, fontId, options)
  return layoutWithLines(prepared, maxWidth, lineHeight)
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

/**
 * Measure text width for Clay layout.
 * Called from Clay's tge_measure_text_callback via the registered
 * measure function pointer.
 */
export function measureForClay(
  text: string,
  fontId: number,
  fontSize: number,
): { width: number; height: number } {
  // Look up font, override size if Clay passes a different one
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
  }

  const width = measureNaturalWidth(prepared)
  // Height = line height based on font size (approximate: fontSize * 1.2)
  const height = Math.ceil(fontSize * 1.2)
  return { width, height }
}

/** Clear all prepared text caches. */
export function clearTextCache() {
  preparedCache.clear()
  clearCache()
}

// Re-export types
export type { LayoutLine, PreparedTextWithSegments, PrepareOptions, RichInlineItem, RichInlineLine }
