/**
 * Vexart text adapter for the internal Grid intrinsic callback.
 *
 * This module is deliberately separate from flex-sync.ts. Existing Flex text
 * measurement remains unchanged; Grid gets an axis-aware callback whose row
 * measurement receives the resolved column inline width.
 */

import { layoutText, measureForLayout, normalizeTextForLayout, type TextLayoutOptions } from "./text-layout"
import type { GridAxis, GridIntrinsicMeasureFunc, GridIntrinsicSizes } from "./grid-types"

export type GridTextIntrinsicOptions = {
  readonly text: string
  readonly fontId?: number
  readonly fontSize?: number
  readonly lineHeight?: number
  readonly fontFamily?: string
  readonly fontWeight?: number
  readonly fontStyle?: string
  readonly whiteSpace?: "normal" | "pre-wrap"
  readonly wordBreak?: "normal" | "keep-all"
}

/**
 * A source for the live text state used by a retained Grid child.
 *
 * The source form is intentional: Solid updates `text` and its font/wrapping
 * props independently of Node materialization. Keeping the source live lets
 * the retained Flexily callback observe those updates without replacing the
 * Flex measure function (and without a width=0 constraint hack).
 */
export type GridTextIntrinsicOptionsSource =
  | GridTextIntrinsicOptions
  | (() => GridTextIntrinsicOptions)

type CacheStats = { hits: number; misses: number }
const callbackStats = new WeakMap<GridIntrinsicMeasureFunc, CacheStats>()

function widthKey(width: number | undefined): string {
  if (width === undefined) return "undefined"
  if (Number.isNaN(width)) return "NaN"
  if (Object.is(width, -0)) return "-0"
  return String(width)
}

function measureWidth(
  value: string,
  fontId: number,
  fontSize: number,
  fontFamily: string | undefined,
  fontWeight: number | undefined,
  fontStyle: string | undefined,
): number {
  return measureForLayout(value, fontId, fontSize, fontFamily, fontWeight, fontStyle).width
}

function maxUnwrappedLineWidth(
  text: string,
  fontId: number,
  fontSize: number,
  fontFamily: string | undefined,
  fontWeight: number | undefined,
  fontStyle: string | undefined,
): number {
  let max = 0
  for (const line of text.split("\n")) {
    max = Math.max(max, measureWidth(line, fontId, fontSize, fontFamily, fontWeight, fontStyle))
  }
  return max
}

function minContentWidth(
  text: string,
  wordBreak: "normal" | "keep-all",
  fontId: number,
  fontSize: number,
  fontFamily: string | undefined,
  fontWeight: number | undefined,
  fontStyle: string | undefined,
): number {
  const tokens = wordBreak === "keep-all"
    ? text.split(/\s+/).filter((token) => token.length > 0)
    : Array.from(text).filter((character) => !/\s/.test(character))
  let max = 0
  for (const token of tokens) {
    max = Math.max(max, measureWidth(token, fontId, fontSize, fontFamily, fontWeight, fontStyle))
  }
  return max
}

function optionsForLayout(options: GridTextIntrinsicOptions): TextLayoutOptions {
  return {
    whiteSpace: options.whiteSpace,
    wordBreak: options.wordBreak,
    fontFamily: options.fontFamily,
    fontWeight: options.fontWeight,
    fontStyle: options.fontStyle,
  }
}

/**
 * Build an axis-aware intrinsic callback backed by the existing native text
 * metrics. Columns report min/max content widths. Rows report the measured
 * height at the supplied column inline width, preserving lineHeight and the
 * existing normal/keep-all wrapping policy.
 */
export function createGridTextIntrinsicMeasure(options: GridTextIntrinsicOptions): GridIntrinsicMeasureFunc {
  const fontId = options.fontId ?? 0
  const fontSize = options.fontSize ?? 14
  const lineHeight = options.lineHeight ?? Math.ceil(fontSize * 1.2)
  const whiteSpace = options.whiteSpace ?? "normal"
  const wordBreak = options.wordBreak ?? "normal"
  const normalized = normalizeTextForLayout(options.text, whiteSpace)
  const maxContent = maxUnwrappedLineWidth(normalized, fontId, fontSize, options.fontFamily, options.fontWeight, options.fontStyle)
  const minContent = minContentWidth(normalized, wordBreak, fontId, fontSize, options.fontFamily, options.fontWeight, options.fontStyle)
  const layoutOptions = optionsForLayout(options)
  const cache = new Map<string, GridIntrinsicSizes>()

  const measure: GridIntrinsicMeasureFunc = (axis: GridAxis, availableInlineWidth: number | undefined) => {
    const key = `${axis}\0${widthKey(availableInlineWidth)}`
    const cached = cache.get(key)
    const stats = callbackStats.get(measure)!
    if (cached) {
      stats.hits++
      return cached
    }
    stats.misses++

    if (axis === "columns") {
      const result = Object.freeze({
        minContent,
        maxContent,
        minimum: minContent,
        preferred: maxContent,
      })
      cache.set(key, result)
      return result
    }

    // This is the existing Flex callback's unconstrained branch, kept here
    // rather than represented as an artificial width=0 constraint.
    let height: number
    if (availableInlineWidth === undefined || availableInlineWidth === Infinity || availableInlineWidth <= 0 || Number.isNaN(availableInlineWidth)) {
      height = measureForLayout(normalized, fontId, fontSize, options.fontFamily, options.fontWeight, options.fontStyle).height
    } else {
      height = layoutText(normalized, fontId, availableInlineWidth, lineHeight, fontSize, layoutOptions).height
    }
    const result = Object.freeze({
      minContent: height,
      maxContent: height,
      minimum: height,
      preferred: height,
    })
    cache.set(key, result)
    return result
  }
  callbackStats.set(measure, { hits: 0, misses: 0 })
  return measure
}

/**
 * Create the retained-node adapter used by Vexart text children in Grid.
 *
 * The callback identity stays stable while the source changes. A new
 * axis/width cache is built when text or text layout options change, so rows
 * are always measured against the current resolved inline width and current
 * wrapping policy.
 */
export function createGridTextIntrinsicAdapter(source: GridTextIntrinsicOptionsSource): GridIntrinsicMeasureFunc {
  const read = typeof source === "function" ? source : () => source
  let signature = ""
  let measure: GridIntrinsicMeasureFunc | null = null

  return (axis, availableInlineWidth) => {
    const options = read()
    const nextSignature = JSON.stringify(options)
    if (!measure || nextSignature !== signature) {
      signature = nextSignature
      measure = createGridTextIntrinsicMeasure(options)
    }
    return measure(axis, availableInlineWidth)
  }
}

/** Alias spelling for callers that use the Flexily seam's full name. */
export const createGridIntrinsicMeasureFunc = createGridTextIntrinsicMeasure

/** Read cache counters for a text callback without exposing its cache. */
export function getGridTextIntrinsicMeasureStats(measure: GridIntrinsicMeasureFunc): { readonly hits: number; readonly misses: number } {
  const value = callbackStats.get(measure) ?? { hits: 0, misses: 0 }
  return Object.freeze({ hits: value.hits, misses: value.misses })
}
