/**
 * Resolve the bounded intrinsic dependency between Grid columns and rows.
 *
 * A pass resolves columns first, then measures rows with the resulting inline
 * width.  A changed min-content contribution may request one more complete
 * pass, but the budget is deliberately fixed at two.  The cache key contains
 * the item, axis, and inline restriction, so wrapping and nested layout do
 * not reuse a measurement made for a different width.
 */

import type {
  AxisSizingResult,
  ExpandedTracks,
  GridAvailableSpace,
  GridAxis,
  GridIntrinsicContribution,
  GridIntrinsicMeasureFunc,
  GridIntrinsicSizes,
  GridLayoutError,
  GridResolvedPlacement,
  GridTrackState,
  PlacementResult,
} from "./grid-model"
import type { GridIntrinsicMeasureSource, GridIntrinsicResult } from "./grid-intrinsic"
import { resolveIntrinsic } from "./grid-intrinsic"
import { createGridError, isGridLayoutError } from "./grid-errors"

export const GRID_INTRINSIC_CYCLE_MAX_PASSES = 2
export const GRID_INTRINSIC_CYCLE_TRACK_LIMIT = 1024
export const GRID_INTRINSIC_CYCLE_EPSILON = 1e-6

type AxisSource = AxisSizingResult | ExpandedTracks
type Available = GridAvailableSpace | number | Record<string, unknown> | undefined
type ContributionSet = readonly GridIntrinsicContribution[] | {
  readonly columns?: readonly GridIntrinsicContribution[]
  readonly rows?: readonly GridIntrinsicContribution[]
}

export type GridIntrinsicCycleCache = {
  readonly entries: Map<string, GridIntrinsicSizes>
  readonly hits: number
  readonly misses: number
}

export type GridIntrinsicCycleLog = {
  readonly pass: 1 | 2
  readonly nodeId: number
  readonly axis: GridAxis
  readonly inlineWidth: number | undefined
  readonly restriction: string
  readonly key: string
  readonly cacheHit: boolean
}

export type GridIntrinsicCycleResolver = (
  axis: GridAxis,
  tracks: ExpandedTracks,
  contributions: readonly GridIntrinsicContribution[],
  pass: 1 | 2,
) => AxisSource | GridLayoutError

export type GridIntrinsicCycleInput = {
  readonly columns?: AxisSource
  readonly rows?: AxisSource
  /** Aliases are useful when the preceding stage names its outputs tracks. */
  readonly columnTracks?: AxisSource
  readonly rowTracks?: AxisSource
  readonly items?: PlacementResult | readonly GridResolvedPlacement[]
  readonly placements?: PlacementResult | readonly GridResolvedPlacement[]
  readonly measure?: GridIntrinsicMeasureSource
  readonly intrinsicMeasure?: GridIntrinsicMeasureSource
  readonly columnMeasure?: GridIntrinsicMeasureSource
  readonly rowMeasure?: GridIntrinsicMeasureSource
  readonly available?: Available
  readonly columnAvailable?: Available
  readonly rowAvailable?: Available
  readonly gap?: number
  readonly columnGap?: number
  readonly rowGap?: number
  readonly previousContributions?: ContributionSet
  readonly initialContributions?: ContributionSet
  readonly previous?: ContributionSet
  readonly forceSecondPass?: boolean
  readonly resolveColumns?: GridIntrinsicCycleResolver
  readonly resolveRows?: GridIntrinsicCycleResolver
  readonly cache?: GridIntrinsicCycleCache | Map<string, GridIntrinsicSizes>
  readonly nodeId?: number
  readonly [key: string]: unknown
}

export type GridIntrinsicCycleStats = {
  readonly intrinsicPasses: 1 | 2
  readonly cacheHit: boolean
  readonly cacheHits: number
  readonly cacheMisses: number
  readonly measureCalls: number
}

export type GridIntrinsicCycleResult = {
  readonly columns: AxisSizingResult
  readonly rows: AxisSizingResult
  readonly columnTracks: ExpandedTracks
  readonly rowTracks: ExpandedTracks
  readonly columnContributions: readonly GridIntrinsicContribution[]
  readonly rowContributions: readonly GridIntrinsicContribution[]
  readonly contributions: readonly GridIntrinsicContribution[]
  readonly items: readonly GridResolvedPlacement[]
  readonly intrinsicPasses: 1 | 2
  readonly passes: 1 | 2
  readonly stats: GridIntrinsicCycleStats
  readonly logs: readonly GridIntrinsicCycleLog[]
  readonly cache: GridIntrinsicCycleCache
}

export type IntrinsicCycleInput = GridIntrinsicCycleInput
export type IntrinsicCycleResult = GridIntrinsicCycleResult

type Result = GridIntrinsicCycleResult | GridLayoutError
type MutableCache = { entries: Map<string, GridIntrinsicSizes>; hits: number; misses: number }
type PassResult = {
  readonly columns: ExpandedTracks
  readonly rows: ExpandedTracks
  readonly columnContributions: readonly GridIntrinsicContribution[]
  readonly rowContributions: readonly GridIntrinsicContribution[]
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function nonNegative(value: unknown): value is number {
  return finite(value) && value >= 0
}

function integer(value: unknown): value is number {
  return finite(value) && Number.isInteger(value)
}

function error(code: GridLayoutError["code"], path: string, nodeId: number): GridLayoutError {
  return createGridError(code, path, nodeId)
}

function widthKey(width: number | undefined): string {
  if (width === undefined) return "undefined"
  if (Object.is(width, -0)) return "-0"
  return String(width)
}

function source(value: unknown, axis: GridAxis, path: string, nodeId: number): ExpandedTracks | GridLayoutError {
  if (!record(value) || value.axis !== axis || !Array.isArray(value.tracks)) return error("GRID_INVALID_TRACK", path, nodeId)
  if (value.tracks.length > GRID_INTRINSIC_CYCLE_TRACK_LIMIT) return error("GRID_TRACK_LIMIT", axis, nodeId)
  const explicitCount = "explicitCount" in value ? value.explicitCount : value.tracks.length
  if (!integer(explicitCount) || explicitCount < 0 || explicitCount > GRID_INTRINSIC_CYCLE_TRACK_LIMIT) return error("GRID_TRACK_LIMIT", axis, nodeId)
  for (let index = 0; index < value.tracks.length; index++) {
    const track = value.tracks[index]
    if (!record(track) || !nonNegative(track.base) || !nonNegative(track.offset)) return error("GRID_INVALID_TRACK", `${path}[${index}]`, nodeId)
    if (track.growthLimit !== Number.POSITIVE_INFINITY && (!nonNegative(track.growthLimit) || track.growthLimit < track.base)) return error("GRID_INVALID_TRACK", `${path}[${index}]`, nodeId)
  }
  return { axis, tracks: Object.freeze(value.tracks.slice() as GridTrackState[]), explicitCount }
}

function placements(value: PlacementResult | readonly GridResolvedPlacement[], nodeId: number): PlacementResult | GridLayoutError {
  if (Array.isArray(value)) {
    let rows = 0
    let columns = 0
    for (let index = 0; index < value.length; index++) {
      const item = value[index]
      if (!item || !integer(item.nodeId) || !integer(item.rowStart) || !integer(item.rowEnd) || !integer(item.columnStart) || !integer(item.columnEnd)
        || item.rowStart < 0 || item.rowEnd <= item.rowStart || item.columnStart < 0 || item.columnEnd <= item.columnStart) {
        return error("GRID_INVALID_PLACEMENT", `items[${index}]`, item?.nodeId ?? nodeId)
      }
      rows = Math.max(rows, item.rowEnd)
      columns = Math.max(columns, item.columnEnd)
    }
    return { items: value, rowCount: rows, columnCount: columns }
  }
  if (!record(value) || !Array.isArray(value.items) || !integer(value.rowCount) || !integer(value.columnCount) || value.rowCount < 0 || value.columnCount < 0) return error("GRID_INVALID_PLACEMENT", "items", nodeId)
  const nested = placements(value.items, nodeId)
  if (isGridLayoutError(nested)) return nested
  if (nested.rowCount > value.rowCount || nested.columnCount > value.columnCount) return error("GRID_INVALID_PLACEMENT", "items", nodeId)
  return { items: value.items, rowCount: value.rowCount, columnCount: value.columnCount }
}

function sourceMeasure(sourceValue: GridIntrinsicMeasureSource | undefined, nodeId: number, axis: GridAxis, width: number | undefined): unknown {
  if (typeof sourceValue === "function") return sourceValue(axis, width)
  if (record(sourceValue) && typeof sourceValue.get === "function") return sourceValue.get(nodeId)?.(axis, width) ?? null
  return null
}

function validMeasurement(value: unknown): value is GridIntrinsicSizes {
  return record(value)
    && nonNegative(value.minContent)
    && nonNegative(value.maxContent)
    && nonNegative(value.minimum)
    && nonNegative(value.preferred)
    && value.minContent <= value.maxContent
}

function cacheView(input: GridIntrinsicCycleInput["cache"]): MutableCache {
  if (input instanceof Map) return { entries: input, hits: 0, misses: 0 }
  if (input && input.entries instanceof Map) return input as MutableCache
  return { entries: new Map(), hits: 0, misses: 0 }
}

function cachedMeasure(
  sourceValue: GridIntrinsicMeasureSource | undefined,
  cache: MutableCache,
  logs: GridIntrinsicCycleLog[],
  pass: 1 | 2,
  restriction: string,
  nodeId: number,
  axis: GridAxis,
  width: number | undefined,
): GridIntrinsicSizes {
  const key = `${nodeId}\0${axis}\0${widthKey(width)}\0${restriction}`
  const cached = cache.entries.get(key)
  if (cached) {
    cache.hits++
    logs.push(Object.freeze({ pass, nodeId, axis, inlineWidth: width, restriction, key, cacheHit: true }))
    return cached
  }
  if (!sourceValue) return { minContent: -1, maxContent: -1, minimum: -1, preferred: -1 }
  const measured = sourceMeasure(sourceValue, nodeId, axis, width)
  if (!validMeasurement(measured)) return { minContent: -1, maxContent: -1, minimum: -1, preferred: -1 }
  const frozen = Object.freeze({ ...measured })
  cache.entries.set(key, frozen)
  cache.misses++
  logs.push(Object.freeze({ pass, nodeId, axis, inlineWidth: width, restriction, key, cacheHit: false }))
  return frozen
}

function availableSpace(value: Available, path: string, nodeId: number): GridAvailableSpace | undefined | GridLayoutError {
  if (value === undefined) return undefined
  if (typeof value === "number") return nonNegative(value)
    ? { kind: "definite", px: value }
    : error("GRID_INVALID_VALUE", path, nodeId)
  if (!record(value)) return error("GRID_INVALID_VALUE", path, nodeId)
  const descriptor = value as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(descriptor, "available")) return availableSpace(descriptor.available as Available, `${path}.available`, nodeId)
  if (descriptor.kind === "definite" && nonNegative(descriptor.px)) return { kind: "definite", px: descriptor.px }
  if (descriptor.kind === "indefinite" && (descriptor.constraint === "min-content" || descriptor.constraint === "max-content")) return { kind: "indefinite", constraint: descriptor.constraint }
  return error("GRID_INVALID_VALUE", path, nodeId)
}

function restriction(value: GridAvailableSpace | undefined): string {
  if (!value) return "indefinite:max-content"
  return value.kind === "definite" ? `definite:${widthKey(value.px)}` : `indefinite:${value.constraint}`
}

function wrappedMeasure(
  sourceValue: GridIntrinsicMeasureSource | undefined,
  items: PlacementResult,
  axis: GridAxis,
  available: GridAvailableSpace | undefined,
  cache: MutableCache,
  logs: GridIntrinsicCycleLog[],
  passNumber: 1 | 2,
): GridIntrinsicMeasureSource {
  const map = new Map<number, GridIntrinsicMeasureFunc>()
  const restrictionKey = restriction(available)
  for (const item of items.items) {
    if (map.has(item.nodeId)) continue
    map.set(item.nodeId, (_axis, width) => cachedMeasure(sourceValue, cache, logs, passNumber, restrictionKey, item.nodeId, axis, width))
  }
  return map
}

function resolveSource(
  axis: GridAxis,
  input: ExpandedTracks,
  available: Available,
  items: PlacementResult,
  measure: GridIntrinsicMeasureSource | undefined,
  columnTracks: ExpandedTracks | undefined,
  gap: number,
  cache: MutableCache,
  logs: GridIntrinsicCycleLog[],
  pass: 1 | 2,
  resolver: GridIntrinsicCycleResolver | undefined,
  nodeId: number,
): { readonly tracks: ExpandedTracks; readonly contributions: readonly GridIntrinsicContribution[] } | GridLayoutError {
  const parsedAvailable = availableSpace(available, `${axis}.available`, nodeId)
  if (isGridLayoutError(parsedAvailable)) return parsedAvailable
  const resolvedAvailable: GridAvailableSpace | undefined = parsedAvailable
  const wrapped = wrappedMeasure(measure, items, axis, resolvedAvailable, cache, logs, pass)
  const inline = axis === "columns" && resolvedAvailable?.kind === "definite" ? resolvedAvailable.px : undefined
  const result: GridIntrinsicResult | GridLayoutError = resolveIntrinsic({
    axis,
    tracks: input,
    items,
    measure: wrapped,
    available: resolvedAvailable,
    options: axis === "rows" ? { columnTracks, gap } : { inlineWidth: inline, gap },
  })
  if (isGridLayoutError(result)) return result
  const resolved = resolver ? resolver(axis, result.tracks, result.contributions, pass) : result.tracks
  if (isGridLayoutError(resolved)) return resolved
  const next = source(resolved, axis, axis, nodeId)
  if (isGridLayoutError(next)) return next
  return { tracks: next, contributions: result.contributions }
}

function pass(
  columns: ExpandedTracks,
  rows: ExpandedTracks,
  input: GridIntrinsicCycleInput,
  items: PlacementResult,
  cache: MutableCache,
  logs: GridIntrinsicCycleLog[],
  number: 1 | 2,
  gaps: { readonly columns: number; readonly rows: number },
  nodeId: number,
): PassResult | GridLayoutError {
  const column = resolveSource("columns", columns, input.columnAvailable, items, input.columnMeasure ?? input.measure, undefined, gaps.columns, cache, logs, number, input.resolveColumns, nodeId)
  if (isGridLayoutError(column)) return column
  const row = resolveSource("rows", rows, input.rowAvailable, items, input.rowMeasure ?? input.measure, column.tracks, gaps.rows, cache, logs, number, input.resolveRows, nodeId)
  if (isGridLayoutError(row)) return row
  return {
    columns: column.tracks,
    rows: row.tracks,
    columnContributions: column.contributions,
    rowContributions: row.contributions,
  }
}

function axisSizing(sourceValue: ExpandedTracks, gap: number): AxisSizingResult {
  const tracks: GridTrackState[] = []
  const lines: number[] = []
  let offset = 0
  for (let index = 0; index < sourceValue.tracks.length; index++) {
    const track = { ...sourceValue.tracks[index], offset }
    tracks.push(Object.freeze(track))
    lines.push(offset, offset + track.base)
    offset += track.base
    if (index + 1 < sourceValue.tracks.length) offset += gap
  }
  return { axis: sourceValue.axis, tracks: Object.freeze(tracks), lines: Object.freeze(lines) }
}

function setOf(value: ContributionSet | undefined, axis: GridAxis): readonly GridIntrinsicContribution[] | undefined {
  if (!value) return undefined
  if (Array.isArray(value)) return value.filter((contribution) => record(contribution) && contribution.axis === axis) as GridIntrinsicContribution[]
  return axis === "columns"
    ? (value as { readonly columns?: readonly GridIntrinsicContribution[] }).columns
    : (value as { readonly rows?: readonly GridIntrinsicContribution[] }).rows
}

function changed(previous: readonly GridIntrinsicContribution[] | undefined, current: readonly GridIntrinsicContribution[]): boolean {
  if (!previous) return false
  if (previous.length !== current.length) return true
  const byKey = new Map<string, GridIntrinsicContribution>()
  for (const contribution of previous) {
    if (!record(contribution) || !integer(contribution.nodeId) || (contribution.axis !== "columns" && contribution.axis !== "rows") || !integer(contribution.start) || !integer(contribution.end) || !nonNegative(contribution.minContent) || !nonNegative(contribution.maxContent)) return true
    byKey.set(`${contribution.nodeId}\0${contribution.axis}\0${contribution.start}\0${contribution.end}`, contribution)
  }
  for (const contribution of current) {
    if (!record(contribution)) return true
    const prior = byKey.get(`${contribution.nodeId}\0${contribution.axis}\0${contribution.start}\0${contribution.end}`)
    if (!prior
      || Math.abs(prior.minContent - contribution.minContent) > GRID_INTRINSIC_CYCLE_EPSILON
      || Math.abs(prior.maxContent - contribution.maxContent) > GRID_INTRINSIC_CYCLE_EPSILON) return true
  }
  return byKey.size !== current.length
}

function cacheResult(cache: MutableCache): GridIntrinsicCycleCache {
  return {
    entries: cache.entries,
    hits: cache.hits,
    misses: cache.misses,
  }
}

function inputSource(value: unknown, axis: GridAxis, path: string, nodeId: number): ExpandedTracks | GridLayoutError {
  return source(value, axis, path, nodeId)
}

/** Resolve columns, measure rows with their real inline widths, and allow one recalc. */
export function resolveIntrinsicCycle(input: GridIntrinsicCycleInput): Result {
  const nodeId = input?.nodeId ?? 0
  if (!input) return error("GRID_MEASURE_INVALID", "input", nodeId)
  const columns = inputSource(input.columns ?? input.columnTracks, "columns", "columns", nodeId)
  if (isGridLayoutError(columns)) return columns
  const rows = inputSource(input.rows ?? input.rowTracks, "rows", "rows", nodeId)
  if (isGridLayoutError(rows)) return rows
  const rawItems = input.items ?? input.placements
  if (!rawItems) return error("GRID_INVALID_PLACEMENT", "items", nodeId)
  const itemResult = placements(rawItems, nodeId)
  if (isGridLayoutError(itemResult)) return itemResult
  const columnAvailable = availableSpace(input.columnAvailable ?? input.available, "columnAvailable", nodeId)
  if (isGridLayoutError(columnAvailable)) return columnAvailable
  const rowAvailable = availableSpace(input.rowAvailable ?? input.available, "rowAvailable", nodeId)
  if (isGridLayoutError(rowAvailable)) return rowAvailable
  const columnGap = input.columnGap ?? input.gap ?? 0
  const rowGap = input.rowGap ?? input.gap ?? 0
  if (!nonNegative(columnGap)) return error("GRID_INVALID_VALUE", "columnGap", nodeId)
  if (!nonNegative(rowGap)) return error("GRID_INVALID_VALUE", "rowGap", nodeId)
  const measure = input.measure ?? input.intrinsicMeasure
  if (!measure && !input.columnMeasure && !input.rowMeasure) return error("GRID_MEASURE_INVALID", "measure", nodeId)
  const cache = cacheView(input.cache)
  const initialHits = cache.hits
  const initialMisses = cache.misses
  const logs: GridIntrinsicCycleLog[] = []
  const firstInput = {
    ...input,
    measure,
    columnAvailable,
    rowAvailable,
  }
  const first = pass(columns, rows, firstInput, itemResult, cache, logs, 1, { columns: columnGap, rows: rowGap }, nodeId)
  if (isGridLayoutError(first)) return first
  const previous = input.previousContributions ?? input.initialContributions ?? input.previous
  const previousColumns = setOf(previous, "columns")
  const previousRows = setOf(previous, "rows")
  const needsSecond = input.forceSecondPass === true
    || changed(previousColumns, first.columnContributions)
    || changed(previousRows, first.rowContributions)
  let final = first
  let intrinsicPasses: 1 | 2 = 1
  if (needsSecond) {
    intrinsicPasses = 2
    // Each pass starts from the initialized tracks.  Feeding first-pass bases
    // back into intrinsic sizing would make a second, narrower measurement
    // unable to shrink an auto track and would publish stale geometry.
    const second = pass(columns, rows, firstInput, itemResult, cache, logs, 2, { columns: columnGap, rows: rowGap }, nodeId)
    if (isGridLayoutError(second)) return second
    final = second
  }
  const columnSizing = axisSizing(final.columns, columnGap)
  const rowSizing = axisSizing(final.rows, rowGap)
  const allContributions = Object.freeze([...final.columnContributions, ...final.rowContributions])
  const stats: GridIntrinsicCycleStats = Object.freeze({
    intrinsicPasses,
    cacheHit: cache.hits > initialHits,
    cacheHits: cache.hits - initialHits,
    cacheMisses: cache.misses - initialMisses,
    measureCalls: cache.misses - initialMisses,
  })
  return {
    columns: columnSizing,
    rows: rowSizing,
    columnTracks: final.columns,
    rowTracks: final.rows,
    columnContributions: Object.freeze([...final.columnContributions]),
    rowContributions: Object.freeze([...final.rowContributions]),
    contributions: allContributions,
    items: Object.freeze(itemResult.items.slice()),
    intrinsicPasses,
    passes: intrinsicPasses,
    stats,
    logs: Object.freeze(logs),
    cache: cacheResult(cache),
  }
}

export function createIntrinsicCycleCache(): GridIntrinsicCycleCache {
  return { entries: new Map(), hits: 0, misses: 0 }
}

export const runIntrinsicCycle = resolveIntrinsicCycle
export const recalculateIntrinsic = resolveIntrinsicCycle
export const intrinsicRecalc = resolveIntrinsicCycle
export const resolveGridIntrinsicCycle = resolveIntrinsicCycle
export const resolveIntrinsicDependency = resolveIntrinsicCycle
export const recalculateIntrinsicCycle = resolveIntrinsicCycle
export const resolveGridIntrinsicDependency = resolveIntrinsicCycle
export const calculateIntrinsicCycle = resolveIntrinsicCycle
export const createGridIntrinsicCycleCache = createIntrinsicCycleCache
