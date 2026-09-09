/**
 * Intrinsic contributions for non-spanning Grid items.
 *
 * G-019 is intentionally the span=1 pass only.  It asks the per-node
 * intrinsic callback for min-content, max-content, minimum, and preferred
 * values, records those values with the item's placement, and updates the
 * initial base/growth state for intrinsic tracks.  Span growth, flexible
 * tracks, and final sizing belong to later stages.
 */

import type {
  ExpandedTracks,
  GridAvailableSpace,
  GridAxis,
  GridIntrinsicContribution,
  GridIntrinsicMeasureFunc,
  GridIntrinsicSizes,
  GridLayoutError,
  GridResolvedPlacement,
  GridTrackSize,
  GridTrackState,
  PlacementResult,
} from "./grid-model"
import { createGridError, isGridLayoutError } from "./grid-errors"

export const GRID_INTRINSIC_TRACK_LIMIT = 1024

export type GridIntrinsicMeasureSource = GridIntrinsicMeasureFunc | ReadonlyMap<number, GridIntrinsicMeasureFunc>

export type GridIntrinsicOptions = {
  /** Inline width used by the callback.  Undefined keeps the axis indefinite. */
  readonly inlineWidth?: number
  /** Optional callback for deriving row inline width from a resolved area. */
  readonly inlineWidthFor?: (placement: GridResolvedPlacement) => number | undefined
  /** Resolved columns used to derive a row item's inline width. */
  readonly columnTracks?: ExpandedTracks
  readonly gap?: number
}

export type GridIntrinsicInput = {
  readonly axis: GridAxis
  readonly tracks: ExpandedTracks
  readonly items: PlacementResult
  readonly measure: GridIntrinsicMeasureSource
  readonly options?: GridIntrinsicOptions
  /** Optional fields mirror AxisSizingInput for staged callers. */
  readonly available?: GridAvailableSpace
  readonly inlineWidth?: number
  readonly columnTracks?: ExpandedTracks
  readonly gap?: number
}

export type GridIntrinsicResult = {
  readonly axis: GridAxis
  readonly tracks: ExpandedTracks
  readonly contributions: readonly GridIntrinsicContribution[]
  /** Stable per-measure keys, useful for cache diagnostics. */
  readonly cacheKeys: readonly string[]
}

type Result = GridIntrinsicResult | GridLayoutError
type MeasureValue = GridIntrinsicSizes
type Kind = { readonly minIntrinsic: boolean; readonly maxIntrinsic: boolean; readonly cap: number | null }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function nonNegative(value: unknown): value is number {
  return finite(value) && value >= 0
}

function error(code: GridLayoutError["code"], path: string, nodeId: number): GridLayoutError {
  return createGridError(code, path, nodeId)
}

function isPercent(value: unknown): boolean {
  return record(value) && Object.keys(value).length === 1 && nonNegative(value.percent) && value.percent <= 100
}

function isFr(value: unknown): boolean {
  return record(value) && Object.keys(value).length === 1 && finite(value.fr) && value.fr > 0
}

function isMinMax(value: unknown): value is { readonly minmax: readonly [GridTrackSize, GridTrackSize] } {
  return record(value) && Object.keys(value).length === 1 && Array.isArray(value.minmax) && value.minmax.length === 2
}

function isFitContent(value: unknown): value is { readonly fitContent: number | { readonly percent: number } } {
  return record(value) && Object.keys(value).length === 1 && Object.prototype.hasOwnProperty.call(value, "fitContent")
}

function intrinsic(value: unknown): boolean {
  return value === "auto" || value === "min-content" || value === "max-content"
}

function maxContribution(value: unknown, measurement: MeasureValue): number {
  return value === "min-content" ? measurement.minContent : measurement.maxContent
}

function maxContributionFor(value: unknown, measurement: MeasureValue): number {
  if (isMinMax(value)) return maxContribution(value.minmax[1], measurement)
  if (isFitContent(value)) return measurement.maxContent
  return maxContribution(value, measurement)
}

function kind(track: GridTrackState, path: string, nodeId: number): Kind | GridLayoutError {
  const minimum = track.min
  const maximum = track.max
  if (typeof minimum === "number" || isPercent(minimum)) {
    if (typeof maximum === "number" || isPercent(maximum)) return { minIntrinsic: false, maxIntrinsic: false, cap: null }
    if (isFr(maximum)) return { minIntrinsic: false, maxIntrinsic: false, cap: null }
    if (intrinsic(maximum)) return { minIntrinsic: false, maxIntrinsic: true, cap: null }
    return error("GRID_INVALID_TRACK", `${path}.max`, nodeId)
  }
  if (intrinsic(minimum)) {
    if (typeof maximum === "number" || isPercent(maximum)) return { minIntrinsic: true, maxIntrinsic: false, cap: null }
    if (isFr(maximum)) return { minIntrinsic: true, maxIntrinsic: false, cap: null }
    if (intrinsic(maximum)) return { minIntrinsic: true, maxIntrinsic: true, cap: null }
    return error("GRID_INVALID_TRACK", `${path}.max`, nodeId)
  }
  if (isFr(minimum)) return { minIntrinsic: false, maxIntrinsic: false, cap: null }
  if (isMinMax(minimum)) {
    const min = minimum.minmax[0]
    const max = minimum.minmax[1]
    const minIntrinsic = intrinsic(min)
    if (isFr(min)) return error("GRID_INVALID_TRACK", `${path}.min.minmax[0]`, nodeId)
    if (typeof max === "number" || isPercent(max)) return { minIntrinsic, maxIntrinsic: false, cap: null }
    if (isFr(max)) return { minIntrinsic, maxIntrinsic: false, cap: null }
    if (intrinsic(max)) return { minIntrinsic, maxIntrinsic: true, cap: null }
    return error("GRID_INVALID_TRACK", `${path}.min.max`, nodeId)
  }
  if (isFitContent(minimum)) {
    const cap = minimum.fitContent
    if (typeof cap === "number") {
      if (!nonNegative(cap)) return error("GRID_INVALID_VALUE", `${path}.min.fitContent`, nodeId)
      return { minIntrinsic: true, maxIntrinsic: true, cap }
    }
    if (isPercent(cap)) return { minIntrinsic: true, maxIntrinsic: true, cap: null }
    return error("GRID_INVALID_VALUE", `${path}.min.fitContent`, nodeId)
  }
  return error("GRID_INVALID_TRACK", `${path}.min`, nodeId)
}

function widthKey(width: number | undefined): string {
  if (width === undefined) return "undefined"
  if (Object.is(width, -0)) return "-0"
  return String(width)
}

function inlineWidth(
  axis: GridAxis,
  placement: GridResolvedPlacement,
  options: GridIntrinsicOptions | undefined,
  nodeId: number,
): number | undefined | GridLayoutError {
  if (options?.inlineWidthFor) {
    const width = options.inlineWidthFor(placement)
    if (width !== undefined && !nonNegative(width)) return error("GRID_MEASURE_INVALID", "inlineWidth", nodeId)
    return width
  }
  if (options?.inlineWidth !== undefined) {
    return nonNegative(options.inlineWidth)
      ? options.inlineWidth
      : error("GRID_MEASURE_INVALID", "inlineWidth", nodeId)
  }
  if (axis !== "rows" || !options?.columnTracks) return undefined
  const columns = options.columnTracks
  const start = placement.columnStart
  const end = placement.columnEnd
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) return error("GRID_INVALID_PLACEMENT", "placement", nodeId)
  if (end > columns.tracks.length) return undefined
  const gap = options.gap ?? 0
  if (!nonNegative(gap)) return error("GRID_INVALID_VALUE", "gap", nodeId)
  let width = 0
  for (let index = start; index < end; index++) {
    const base = columns.tracks[index].base
    if (!finite(base) || base < 0) return undefined
    width += base
  }
  width += Math.max(0, end - start - 1) * gap
  return finite(width) ? width : undefined
}

function measurement(
  source: GridIntrinsicMeasureSource,
  nodeId: number,
  axis: GridAxis,
  width: number | undefined,
): GridIntrinsicSizes | null {
  if (typeof source === "function") return source(axis, width)
  return source.get(nodeId)?.(axis, width) ?? null
}

function validMeasurement(value: unknown): value is GridIntrinsicSizes {
  if (!record(value)) return false
  return nonNegative(value.minContent) && nonNegative(value.maxContent) && nonNegative(value.minimum) && nonNegative(value.preferred) && value.minContent <= value.maxContent
}

function placementAxis(
  placement: GridResolvedPlacement,
  axis: GridAxis,
): { readonly start: number; readonly end: number } {
  return axis === "columns"
    ? { start: placement.columnStart, end: placement.columnEnd }
    : { start: placement.rowStart, end: placement.rowEnd }
}

function update(
  track: GridTrackState,
  contribution: GridIntrinsicContribution,
  measurementValue: GridIntrinsicSizes,
  path: string,
  nodeId: number,
): GridTrackState | GridLayoutError {
  if (!finite(track.base) || track.base < 0 || !finite(track.offset) || track.offset < 0 || (track.growthLimit !== Number.POSITIVE_INFINITY && (!finite(track.growthLimit) || track.growthLimit < 0))) {
    return error("GRID_INVALID_TRACK", path, nodeId)
  }
  const description = kind(track, path, nodeId)
  if (isGridLayoutError(description)) return description
  // G-019 does not implement the flexible-track phase.  Contributions for
  // direct `fr` and minmax(..., fr) are still returned, but state is unchanged.
  if (!description.minIntrinsic && !description.maxIntrinsic) return Object.freeze({ ...track })

  let base = track.base
  let growth = track.growthLimit
  if (description.minIntrinsic) base = Math.max(base, contribution.minimum, contribution.minContent)
  if (description.maxIntrinsic) {
    const candidate = Math.max(base, Math.min(maxContributionFor(track.max, measurementValue), description.cap ?? Number.POSITIVE_INFINITY))
    // Intrinsic growth starts unbounded in G-018.  The first contribution
    // establishes its finite max-content limit; subsequent items accumulate
    // the largest contribution.
    growth = growth === Number.POSITIVE_INFINITY ? candidate : Math.max(growth, candidate)
  }
  growth = Math.max(base, growth)
  return Object.freeze({ min: track.min, max: track.max, base, growthLimit: growth, offset: track.offset })
}

function sourceValid(source: unknown): source is GridIntrinsicMeasureSource {
  return typeof source === "function" || Boolean(source && typeof (source as { readonly get?: unknown }).get === "function")
}

/** Resolve span=1 intrinsic contributions and update the track states. */
export function resolveIntrinsic(input: GridIntrinsicInput): Result {
  const nodeId = input?.tracks?.axis === "columns" || input?.tracks?.axis === "rows" ? 0 : 0
  if (!input || (input.axis !== "columns" && input.axis !== "rows") || !input.tracks || input.tracks.axis !== input.axis || !Array.isArray(input.tracks.tracks) || !input.items || !Array.isArray(input.items.items) || !sourceValid(input.measure)) {
    return error("GRID_MEASURE_INVALID", "input", nodeId)
  }
  if (!Number.isInteger(input.tracks.explicitCount) || input.tracks.explicitCount < 0 || input.tracks.tracks.length > GRID_INTRINSIC_TRACK_LIMIT) {
    return error("GRID_TRACK_LIMIT", input.axis, nodeId)
  }

  const tracks = input.tracks.tracks.slice()
  const contributions: GridIntrinsicContribution[] = []
  const cacheKeys: string[] = []
  const cache = new Map<string, GridIntrinsicSizes>()
  for (let index = 0; index < input.items.items.length; index++) {
    const item = input.items.items[index]
    if (!item || !Number.isInteger(item.nodeId)) return error("GRID_INVALID_PLACEMENT", `items[${index}]`, nodeId)
    const bounds = placementAxis(item, input.axis)
    if (!Number.isInteger(bounds.start) || !Number.isInteger(bounds.end) || bounds.start < 0 || bounds.end < bounds.start) {
      return error("GRID_INVALID_PLACEMENT", `items[${index}]`, item.nodeId)
    }
    // Span growth is explicitly owned by G-020.  A spanning item does not
    // participate in this pass and does not invoke an intrinsic callback.
    if (bounds.end - bounds.start !== 1) continue
    if (bounds.start >= tracks.length) continue
    const options = input.options ?? {
      inlineWidth: input.inlineWidth,
      columnTracks: input.columnTracks,
      gap: input.gap,
    }
    const width = inlineWidth(input.axis, item, options, item.nodeId)
    if (isGridLayoutError(width)) return width
    const key = `${item.nodeId}\0${input.axis}\0${widthKey(width)}`
    let measured: GridIntrinsicSizes | null | undefined = cache.get(key)
    if (!measured) {
      measured = measurement(input.measure, item.nodeId, input.axis, width)
      if (!measured || !validMeasurement(measured)) return error("GRID_MEASURE_INVALID", `items[${index}]`, item.nodeId)
      measured = Object.freeze({ ...measured })
      cache.set(key, measured)
    }
    cacheKeys.push(key)
    const contribution: GridIntrinsicContribution = Object.freeze({
      nodeId: item.nodeId,
      axis: input.axis,
      start: bounds.start,
      end: bounds.end,
      minContent: measured.minContent,
      maxContent: measured.maxContent,
      minimum: measured.minimum,
      preferred: measured.preferred,
    })
    contributions.push(contribution)
    const next = update(tracks[bounds.start], contribution, measured, `${input.axis}[${bounds.start}]`, item.nodeId)
    if (isGridLayoutError(next)) return next
    tracks[bounds.start] = next
  }

  return {
    axis: input.axis,
    tracks: { axis: input.tracks.axis, tracks: Object.freeze(tracks), explicitCount: input.tracks.explicitCount },
    contributions: Object.freeze(contributions),
    cacheKeys: Object.freeze(cacheKeys),
  }
}

/** Positional convenience form used by the sizing pipeline. */
export function collectIntrinsicContributions(
  axis: GridAxis,
  tracks: ExpandedTracks,
  items: PlacementResult,
  measure: GridIntrinsicMeasureSource,
  options?: GridIntrinsicOptions,
): Result {
  return resolveIntrinsic({ axis, tracks, items, measure, options })
}

/** Return only the updated axis state while retaining a concise stage seam. */
export function updateIntrinsicTracks(input: GridIntrinsicInput): ExpandedTracks | GridLayoutError {
  const result = resolveIntrinsic(input)
  return isGridLayoutError(result) ? result : result.tracks
}

export const measureIntrinsic = resolveIntrinsic
export const intrinsicContributions = collectIntrinsicContributions
export const resolveIntrinsicContributions = collectIntrinsicContributions
