/**
 * Implicit grid-track expansion.
 *
 * Placement works with zero-based, end-exclusive cell coordinates.  Once the
 * placement stage has found a cell outside the explicit grid, this stage
 * materialises the missing tracks using the corresponding auto-track value.
 * It deliberately does not interpret the track value: repeat expansion and
 * track sizing belong to later stages.
 *
 * All functions build new DTOs.  In particular, a track-limit error is
 * returned before anything supplied by the caller is changed (or truncated).
 */

import type {
  ExpandedTracks,
  GridAxis,
  GridExpandedAxes,
  GridLayoutError,
  GridResolvedLineSet,
  GridResolvedPlacement,
  GridSnapshot,
  GridTrackSize,
  PlacementResult,
  ResolvedLines,
} from "./grid-model"
import { createGridError, isGridLayoutError } from "./grid-errors"

/** Maximum number of concrete tracks on either axis. */
export const GRID_IMPLICIT_TRACK_LIMIT = 1024
/** Shared spelling used by the other Grid stages. */
export const GRID_TRACK_LIMIT = GRID_IMPLICIT_TRACK_LIMIT

type AxisExpansion = ExpandedTracks | GridLayoutError
type AxisLines = ResolvedLines | GridLayoutError

function nodeId(snapshot: GridSnapshot | null | undefined): number {
  return typeof snapshot?.nodeId === "number" ? snapshot.nodeId : 0
}

function error(code: GridLayoutError["code"], path: string, id: number): GridLayoutError {
  return createGridError(code, path, id)
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)
}

function validCount(value: unknown): value is number {
  return isInteger(value) && value >= 0
}

function autoSize(snapshot: GridSnapshot, axis: GridAxis): GridTrackSize {
  // GridStyle normally always has these values after normalization.  Keeping
  // the default here makes the internal stage safe to use with a structural
  // snapshot in isolation and is the Grid default for both axes.
  const value = axis === "columns" ? snapshot.style?.autoColumns : snapshot.style?.autoRows
  return (value ?? "auto") as GridTrackSize
}

function state(size: GridTrackSize): ExpandedTracks["tracks"][number] {
  // `base` and `growthLimit` are intentionally neutral placeholders.  G-018
  // interprets min/max and initializes the sizing state; G-016 must not size
  // tracks or use Infinity as a stand-in for a resolved dimension.
  return Object.freeze({ min: size, max: size, base: 0, growthLimit: 0, offset: 0 })
}

function placementExtent(
  placements: readonly GridResolvedPlacement[],
  axis: GridAxis,
  id: number,
): number | GridLayoutError {
  let extent = 0
  for (let index = 0; index < placements.length; index++) {
    const placement = placements[index]
    if (!placement || typeof placement !== "object") return error("GRID_INVALID_PLACEMENT", `items[${index}]`, id)
    const start = axis === "columns" ? placement.columnStart : placement.rowStart
    const end = axis === "columns" ? placement.columnEnd : placement.rowEnd
    if (!isInteger(start) || !isInteger(end) || start < 0 || end < start) {
      return error("GRID_INVALID_PLACEMENT", `items[${index}]`, id)
    }
    extent = Math.max(extent, end)
    if (extent > GRID_IMPLICIT_TRACK_LIMIT) return error("GRID_TRACK_LIMIT", axis, id)
  }
  return extent
}

function expandAxis(
  snapshot: GridSnapshot,
  axis: GridAxis,
  expanded: ExpandedTracks,
  requestedCount: unknown,
  placements: readonly GridResolvedPlacement[],
): AxisExpansion {
  if (!expanded || expanded.axis !== axis || !Array.isArray(expanded.tracks)) {
    return error("GRID_INVALID_TRACK", axis, nodeId(snapshot))
  }
  if (!validCount(expanded.explicitCount)) return error("GRID_INVALID_TRACK", `${axis}.explicitCount`, nodeId(snapshot))
  if (expanded.tracks.length > GRID_IMPLICIT_TRACK_LIMIT || expanded.explicitCount > GRID_IMPLICIT_TRACK_LIMIT) {
    return error("GRID_TRACK_LIMIT", axis, nodeId(snapshot))
  }
  if (!validCount(requestedCount)) return error("GRID_INVALID_PLACEMENT", axis, nodeId(snapshot))

  const extent = placementExtent(placements, axis, nodeId(snapshot))
  if (isGridLayoutError(extent)) return extent
  const count = Math.max(expanded.tracks.length, expanded.explicitCount, requestedCount, extent)
  if (count > GRID_IMPLICIT_TRACK_LIMIT) return error("GRID_TRACK_LIMIT", axis, nodeId(snapshot))

  const tracks = expanded.tracks.slice()
  const implicit = autoSize(snapshot, axis)
  while (tracks.length < count) tracks.push(state(implicit))

  return {
    axis,
    tracks: Object.freeze(tracks),
    explicitCount: expanded.explicitCount,
  }
}

function validPlacementResult(value: PlacementResult | null | undefined): value is PlacementResult {
  return Boolean(value && Array.isArray(value.items) && validCount(value.rowCount) && validCount(value.columnCount))
}

/**
 * Materialise the implicit tracks required by a placement result.
 *
 * `rowCount`/`columnCount` are the placement stage's requested dimensions;
 * item end coordinates are also checked so a malformed/stale count cannot
 * silently drop a placed cell.  Both axes are expanded in local arrays before
 * the result is returned, which makes the operation atomic on errors.
 */
export function expandImplicitTracks(
  snapshot: GridSnapshot,
  axes: GridExpandedAxes,
  placement: PlacementResult,
): GridExpandedAxes | GridLayoutError {
  const id = nodeId(snapshot)
  if (!snapshot || !snapshot.style || !axes || !validPlacementResult(placement)) {
    return error("GRID_INVALID_PLACEMENT", "placement", id)
  }

  const items = placement.items
  const columns = expandAxis(snapshot, "columns", axes.columns, placement.columnCount, items)
  if (isGridLayoutError(columns)) return columns
  const rows = expandAxis(snapshot, "rows", axes.rows, placement.rowCount, items)
  if (isGridLayoutError(rows)) return rows
  return { columns, rows }
}

/** Expand one axis, useful to staged callers that have not built both axes. */
export function expandImplicitAxis(
  snapshot: GridSnapshot,
  axis: GridAxis,
  expanded: ExpandedTracks,
  requestedCount: number,
  placements: readonly GridResolvedPlacement[] = [],
): ExpandedTracks | GridLayoutError {
  if (!snapshot || !snapshot.style || !Array.isArray(placements)) return error("GRID_INVALID_PLACEMENT", "placement", nodeId(snapshot))
  return expandAxis(snapshot, axis, expanded, requestedCount, placements)
}

function copyNames(lines: ReadonlyMap<string, readonly number[]>): ReadonlyMap<string, readonly number[]> {
  const names = new Map<string, readonly number[]>()
  for (const [name, values] of lines) names.set(name, Object.freeze([...values]))
  return names
}

function extendAxisLines(lines: ResolvedLines, trackCount: number, id: number): AxisLines {
  if (!lines || !Array.isArray(lines.positions) || !validCount(trackCount)) {
    return error("GRID_INVALID_TRACK", "lines", id)
  }
  if (lines.positions.length > GRID_IMPLICIT_TRACK_LIMIT + 1 || trackCount > GRID_IMPLICIT_TRACK_LIMIT) {
    return error("GRID_TRACK_LIMIT", "lines", id)
  }
  if (!validCount(lines.explicitCount) || lines.explicitCount > GRID_IMPLICIT_TRACK_LIMIT) {
    return error("GRID_INVALID_TRACK", "lines.explicitCount", id)
  }

  const target = Math.max(trackCount + 1, lines.explicitCount + 1, lines.positions.length)
  if (target > GRID_IMPLICIT_TRACK_LIMIT + 1) return error("GRID_TRACK_LIMIT", "lines", id)
  const positions = lines.positions.length > 0 ? [...lines.positions] : [0]
  const step = positions.length > 1 ? positions[positions.length - 1] - positions[positions.length - 2] : 1
  const increment = Number.isFinite(step) && step > 0 ? step : 1
  while (positions.length < target) positions.push(positions[positions.length - 1] + increment)

  return {
    axis: lines.axis,
    positions: Object.freeze(positions),
    names: copyNames(lines.names),
    explicitCount: lines.explicitCount,
  }
}

/**
 * Extend a resolved axis's line placeholders to match its concrete tracks.
 * Track sizing may later replace the numeric positions; this stage only makes
 * every line index addressable and does not calculate physical coordinates.
 */
export function extendImplicitAxisLines(
  lines: ResolvedLines,
  trackCount: number,
  node = 0,
): ResolvedLines | GridLayoutError {
  return extendAxisLines(lines, trackCount, node)
}

/**
 * Extend both line sets after implicit-track expansion.  Existing names and
 * positions are copied; no name is invented for an implicit track.
 */
export function extendImplicitLines(
  lines: GridResolvedLineSet,
  axes: GridExpandedAxes,
  node = 0,
): GridResolvedLineSet | GridLayoutError {
  if (!lines || !axes) return error("GRID_INVALID_TRACK", "lines", node)
  const columns = extendAxisLines(lines.columns, axes.columns.tracks.length, node)
  if (isGridLayoutError(columns)) return columns
  const rows = extendAxisLines(lines.rows, axes.rows.tracks.length, node)
  if (isGridLayoutError(rows)) return rows
  return { columns, rows }
}

// Keep the stage vocabulary discoverable to callers that use “add” rather
// than “expand”; these are aliases, not alternate implementations.
export const addImplicitTracks = expandImplicitTracks
export const createImplicitTracks = expandImplicitTracks
export const addImplicitAxisTracks = expandImplicitAxis
export const extendLines = extendImplicitLines
export const expandImplicitLines = extendImplicitLines
