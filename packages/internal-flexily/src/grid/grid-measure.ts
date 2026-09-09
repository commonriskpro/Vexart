/**
 * Grid intrinsic-measure callback seam.
 *
 * Flexily owns the callback shape, while an adapter owns the text/font
 * measurement implementation. The callback always receives the Grid axis and
 * the available inline width in px (or `undefined` for an indefinite inline
 * constraint). No engine import is allowed here.
 */

import type { GridAxis, GridIntrinsicMeasureFunc, GridIntrinsicSizes } from "./grid-model"

export type GridAxisIntrinsicMeasure = (availableInlineWidth: number | undefined) => GridIntrinsicSizes

export type GridIntrinsicMeasureSources = {
  readonly columns: GridAxisIntrinsicMeasure
  readonly rows: GridAxisIntrinsicMeasure
}

type MeasureStats = { hits: number; misses: number }
const stats = new WeakMap<GridIntrinsicMeasureFunc, MeasureStats>()

function widthKey(width: number | undefined): string {
  if (width === undefined) return "undefined"
  if (Number.isNaN(width)) return "NaN"
  if (Object.is(width, -0)) return "-0"
  return String(width)
}

/**
 * Compose per-axis intrinsic measures into the single callback used by Grid.
 * Results are cached by axis and inline constraint; changing the inline width
 * therefore creates a fresh row measurement instead of reusing stale height.
 */
export function createGridIntrinsicMeasureFunc(sources: GridIntrinsicMeasureSources): GridIntrinsicMeasureFunc {
  const cache = new Map<string, GridIntrinsicSizes>()
  const measure: GridIntrinsicMeasureFunc = (axis: GridAxis, availableInlineWidth: number | undefined) => {
    const key = `${axis}\0${widthKey(availableInlineWidth)}`
    const cached = cache.get(key)
    const measureStats = stats.get(measure)!
    if (cached) {
      measureStats.hits++
      return cached
    }
    measureStats.misses++
    const result = (axis === "columns" ? sources.columns : sources.rows)(availableInlineWidth)
    cache.set(key, result)
    return result
  }
  stats.set(measure, { hits: 0, misses: 0 })
  return measure
}

/** Read callback cache counters without exposing the cache itself. */
export function getGridIntrinsicMeasureStats(measure: GridIntrinsicMeasureFunc): { readonly hits: number; readonly misses: number } {
  const value = stats.get(measure) ?? { hits: 0, misses: 0 }
  return Object.freeze({ hits: value.hits, misses: value.misses })
}
