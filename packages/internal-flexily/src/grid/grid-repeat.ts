/**
 * Grid repeat expansion.
 *
 * This stage turns the track declarations in a normalized snapshot into
 * concrete `GridTrackState` entries.  Fixed repeats are copied exactly.  An
 * auto-repeat is limited to one expression per axis and one fixed track (or
 * `minmax(fixed, 1fr)`) and is expanded from the available axis size.  Track
 * sizing is deliberately not performed here; the numeric fields on the state
 * are neutral values consumed by the sizing stages.
 */

import type {
  GridAvailableSpace,
  GridExpandedAxes,
  GridLayoutError,
  GridMinMax,
  GridPercent,
  GridResolvedPlacement,
  GridSnapshot,
  GridTrack,
  GridTrackSize,
  GridTrackState,
  PlacementResult,
  ExpandedTracks,
} from "./grid-model"
import { createGridError, isGridLayoutError } from "./grid-errors"

export const GRID_REPEAT_TRACK_LIMIT = 1024
/** Alias shared with the other Grid stages. */
export const GRID_TRACK_LIMIT = GRID_REPEAT_TRACK_LIMIT

export type GridRepeatResult = GridExpandedAxes & {
  /** Zero-based auto-fit tracks collapsed after placement. */
  readonly collapsedColumns: readonly number[]
  readonly collapsedRows: readonly number[]
}

type RepeatResult = GridRepeatResult | GridLayoutError
type Available = GridAvailableSpace | number | undefined
type AxisAvailable = { readonly columns?: Available; readonly rows?: Available }
type AvailableInput = Available | AxisAvailable
type RepeatMode = "auto-fill" | "auto-fit"
type RepeatDeclaration = {
  readonly count: number | RepeatMode
  readonly tracks: readonly GridTrack[]
}
type NamedTrack = {
  readonly size: GridTrackSize
  readonly before?: readonly string[]
  readonly after?: readonly string[]
}
type TrackState = GridTrackState

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function error(code: GridLayoutError["code"], path: string, nodeId: number): GridLayoutError {
  return createGridError(code, path, nodeId)
}

function idOf(snapshot: GridSnapshot | null | undefined): number {
  return typeof snapshot?.nodeId === "number" ? snapshot.nodeId : 0
}

function asAvailable(value: Available, path: string, nodeId: number): { readonly definite: boolean; readonly px: number } | GridLayoutError {
  if (value === undefined) return { definite: false, px: 0 }
  if (typeof value === "number") {
    if (!isFiniteNumber(value) || value < 0) return error("GRID_INVALID_VALUE", path, nodeId)
    return { definite: true, px: value }
  }
  if (!isRecord(value)) return error("GRID_INVALID_VALUE", path, nodeId)
  if (value.kind === "indefinite") return { definite: false, px: 0 }
  if (value.kind !== "definite" || !isFiniteNumber(value.px) || value.px < 0) return error("GRID_INVALID_VALUE", path, nodeId)
  return { definite: true, px: value.px }
}

function repeatOf(value: unknown): value is { readonly repeat: RepeatDeclaration } {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, "repeat")) return false
  const repeat = value.repeat
  return isRecord(repeat) && Array.isArray(repeat.tracks)
}

function nestedRepeat(value: unknown): boolean {
  return repeatOf(value) || namedOf(value) && repeatOf(value.size)
}

function namedOf(value: unknown): value is NamedTrack {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, "size")
}

function sizeOf(value: GridTrack): GridTrackSize {
  return namedOf(value) ? value.size : value as GridTrackSize
}

function isPercent(value: unknown): value is GridPercent {
  return isRecord(value) && Object.keys(value).length === 1 && isFiniteNumber(value.percent) && value.percent >= 0 && value.percent <= 100
}

function isFrOne(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 1 && isFiniteNumber(value.fr) && value.fr === 1
}

function isMinMax(value: unknown): value is GridMinMax {
  return isRecord(value) && Object.keys(value).length === 1 && Array.isArray(value.minmax) && value.minmax.length === 2
}

function fixedPx(value: unknown, available: number): number | null {
  if (isFiniteNumber(value) && value >= 0) return value
  if (isPercent(value)) return available * value.percent / 100
  return null
}

/** Return the fixed minimum of an auto-repeat base, or null when unsupported. */
function autoBase(value: unknown, available: number): number | null {
  const size = namedOf(value) ? value.size : value
  const fixed = fixedPx(size, available)
  if (fixed !== null) return fixed
  if (!isMinMax(size)) return null
  const min = fixedPx(size.minmax[0], available)
  if (min === null || !isFrOne(size.minmax[1])) return null
  return min
}

function neutral(size: GridTrackSize): TrackState {
  // Sizing stages initialize these values from min/max.  Keeping the repeat
  // stage neutral avoids pretending that expansion has resolved a dimension.
  return Object.freeze({ min: size, max: size, base: 0, growthLimit: 0, offset: 0 })
}

function collapsed(): TrackState {
  return Object.freeze({ min: 0, max: 0, base: 0, growthLimit: 0, offset: 0 })
}

function sizeMinimum(value: GridTrack, available: number): number {
  const size = sizeOf(value)
  const fixed = fixedPx(size, available)
  if (fixed !== null) return fixed
  if (isMinMax(size)) return fixedPx(size.minmax[0], available) ?? 0
  return 0
}

function repeatMinimum(
  tracks: readonly GridTrack[],
  count: number,
  available: number,
): number {
  let total = 0
  for (let repetition = 0; repetition < count; repetition++) {
    for (const track of tracks) total += sizeMinimum(track, available)
  }
  return total
}

function staticMinimum(value: GridTrack, available: number, path: string, nodeId: number): number | GridLayoutError {
  if (!repeatOf(value)) return sizeMinimum(value, available)
  const repeat = value.repeat
  if (!Array.isArray(repeat.tracks) || repeat.tracks.length === 0) return error("GRID_INVALID_REPEAT", path, nodeId)
  if (typeof repeat.count !== "number") return 0
  if (!isInteger(repeat.count) || repeat.count < 1) return error("GRID_INVALID_REPEAT", `${path}.repeat.count`, nodeId)
  return repeatMinimum(repeat.tracks, repeat.count, available)
}

function autoCount(
  base: GridTrack,
  fixedMinimum: number,
  available: { readonly definite: boolean; readonly px: number },
  gap: number,
  path: string,
  nodeId: number,
): number | GridLayoutError {
  const minimum = autoBase(base, available.px)
  if (minimum === null) return error("GRID_INVALID_REPEAT", `${path}.repeat.tracks[0]`, nodeId)
  if (!available.definite) return 1
  const denominator = minimum + gap
  if (denominator === 0) return error("GRID_TRACK_LIMIT", path, nodeId)
  // For N repeated tracks and F existing tracks:
  // Fmin + N*base + (F+N-1)*gap <= available.
  const availableForRepeated = available.px - fixedMinimum + gap
  const count = Math.max(1, Math.floor(availableForRepeated / denominator))
  if (count > GRID_REPEAT_TRACK_LIMIT) return error("GRID_TRACK_LIMIT", path, nodeId)
  return count
}

function occupied(
  placements: readonly GridResolvedPlacement[],
  axis: "columns" | "rows",
  start: number,
  end: number,
): boolean {
  return placements.some((placement) => {
    const from = axis === "columns" ? placement.columnStart : placement.rowStart
    const to = axis === "columns" ? placement.columnEnd : placement.rowEnd
    return to > start && from < end
  })
}

function collapseAutoFit(
  tracks: TrackState[],
  axis: "columns" | "rows",
  start: number,
  count: number,
  placements: readonly GridResolvedPlacement[],
  collapsedIndexes: number[],
): void {
  for (let index = 0; index < count; index++) {
    const track = start + index
    if (occupied(placements, axis, track, track + 1)) continue
    tracks[track] = collapsed()
    collapsedIndexes.push(track)
  }
}

type AxisOutput = { readonly tracks: readonly TrackState[]; readonly explicitCount: number; readonly collapsed: readonly number[] } | GridLayoutError

function expandAxis(
  snapshot: GridSnapshot,
  axis: "columns" | "rows",
  declarations: readonly GridTrack[],
  available: { readonly definite: boolean; readonly px: number },
  placements: readonly GridResolvedPlacement[],
  collapseFit: boolean,
): AxisOutput {
  const nodeId = idOf(snapshot)
  if (!Array.isArray(declarations)) return error("GRID_INVALID_VALUE", axis, nodeId)
  const gap = snapshot.style.gap
  if (!isFiniteNumber(gap) || gap < 0) return error("GRID_INVALID_VALUE", "gap", nodeId)

  let autoRepeatIndex = -1
  let autoRepeat: RepeatDeclaration | null = null
  let fixedMinimum = 0
  let fixedTrackCount = 0
  for (let index = 0; index < declarations.length; index++) {
    const declaration = declarations[index]
    if (repeatOf(declaration)) {
      const repeat = declaration.repeat
      if (!Array.isArray(repeat.tracks) || repeat.tracks.length === 0) return error("GRID_INVALID_REPEAT", `${axis}[${index}].repeat`, nodeId)
      if (typeof repeat.count === "number") {
        if (!isInteger(repeat.count) || repeat.count < 1) return error("GRID_INVALID_REPEAT", `${axis}[${index}].repeat.count`, nodeId)
        if (repeat.count * repeat.tracks.length > GRID_REPEAT_TRACK_LIMIT) return error("GRID_TRACK_LIMIT", axis, nodeId)
        for (const child of repeat.tracks) {
          if (nestedRepeat(child)) return error("GRID_INVALID_REPEAT", `${axis}[${index}].repeat`, nodeId)
        }
        const minimum = staticMinimum(declaration, available.px, `${axis}[${index}]`, nodeId)
        if (isGridLayoutError(minimum)) return minimum
        fixedMinimum += minimum
        fixedTrackCount += repeat.count * repeat.tracks.length
      } else if (repeat.count === "auto-fill" || repeat.count === "auto-fit") {
        if (autoRepeatIndex >= 0) return error("GRID_INVALID_REPEAT", `${axis}[${index}].repeat`, nodeId)
        if (repeat.tracks.length !== 1 || repeatOf(repeat.tracks[0]) || namedOf(repeat.tracks[0])) {
          return error("GRID_INVALID_REPEAT", `${axis}[${index}].repeat.tracks`, nodeId)
        }
        if (autoBase(repeat.tracks[0], available.px) === null) {
          return error("GRID_INVALID_REPEAT", `${axis}[${index}].repeat.tracks[0]`, nodeId)
        }
        autoRepeatIndex = index
        autoRepeat = repeat
      } else {
        return error("GRID_INVALID_REPEAT", `${axis}[${index}].repeat.count`, nodeId)
      }
    } else {
      if (nestedRepeat(declaration) && namedOf(declaration)) return error("GRID_INVALID_REPEAT", `${axis}[${index}].size`, nodeId)
      const minimum = staticMinimum(declaration, available.px, `${axis}[${index}]`, nodeId)
      if (isGridLayoutError(minimum)) return minimum
      fixedMinimum += minimum
      fixedTrackCount += 1
    }
  }

  let autoRepeatCount = 0
  if (autoRepeat && autoRepeatIndex >= 0) {
    const count = autoCount(
      autoRepeat.tracks[0],
      fixedMinimum,
      available,
      gap,
      `${axis}[${autoRepeatIndex}]`,
      nodeId,
    )
    if (isGridLayoutError(count)) return count
    autoRepeatCount = count
  }

  let total = fixedTrackCount + autoRepeatCount
  if (total > GRID_REPEAT_TRACK_LIMIT) return error("GRID_TRACK_LIMIT", axis, nodeId)
  const tracks: TrackState[] = []
  const collapsedIndexes: number[] = []
  let autoStart = -1
  for (let index = 0; index < declarations.length; index++) {
    const declaration = declarations[index]
    if (!repeatOf(declaration)) {
      tracks.push(neutral(sizeOf(declaration)))
      continue
    }
    const repeat = declaration.repeat
    const count = typeof repeat.count === "number" ? repeat.count : autoRepeatCount
    if (typeof repeat.count !== "number") autoStart = tracks.length
    for (let repetition = 0; repetition < count; repetition++) {
      for (const child of repeat.tracks) tracks.push(neutral(sizeOf(child)))
    }
    if (repeat.count === "auto-fit" && collapseFit) {
      collapseAutoFit(tracks, axis, autoStart, count, placements, collapsedIndexes)
    }
  }

  total = tracks.length
  if (total > GRID_REPEAT_TRACK_LIMIT) return error("GRID_TRACK_LIMIT", axis, nodeId)
  return { tracks: Object.freeze(tracks), explicitCount: total, collapsed: Object.freeze(collapsedIndexes) }
}

function validPlacements(value: PlacementResult | undefined, nodeId: number): PlacementResult | GridLayoutError {
  if (value === undefined) return { items: [], rowCount: 0, columnCount: 0 }
  if (!value || !Array.isArray(value.items) || !isInteger(value.rowCount) || value.rowCount < 0 || !isInteger(value.columnCount) || value.columnCount < 0) {
    return error("GRID_INVALID_PLACEMENT", "placement", nodeId)
  }
  for (let index = 0; index < value.items.length; index++) {
    const item = value.items[index]
    if (!item || !isInteger(item.rowStart) || !isInteger(item.rowEnd) || !isInteger(item.columnStart) || !isInteger(item.columnEnd) || item.rowStart < 0 || item.columnStart < 0 || item.rowEnd < item.rowStart || item.columnEnd < item.columnStart) {
      return error("GRID_INVALID_PLACEMENT", `placement.items[${index}]`, nodeId)
    }
  }
  return value
}

/**
 * Expand fixed and supported auto-repeat declarations for both axes.
 *
 * A scalar `available` is applied to both axes for compatibility. Callers
 * with independent content-box constraints should pass `{ columns, rows }`;
 * an omitted or indefinite axis keeps exactly one auto-repeat track.
 */
export function expandRepeats(
  snapshot: GridSnapshot,
  available: AvailableInput = undefined,
  placement?: PlacementResult,
): RepeatResult {
  const nodeId = idOf(snapshot)
  if (!snapshot || !snapshot.style || !Array.isArray(snapshot.style.columns) || !Array.isArray(snapshot.style.rows)) {
    return error("GRID_INVALID_TRACK", "snapshot", nodeId)
  }
  const perAxis = isRecord(available) && (Object.prototype.hasOwnProperty.call(available, "columns") || Object.prototype.hasOwnProperty.call(available, "rows"))
  const columnInput = (perAxis ? (available as AxisAvailable).columns : available) as Available
  const rowInput = (perAxis ? (available as AxisAvailable).rows : available) as Available
  const columnSpace = asAvailable(columnInput, "available.columns", nodeId)
  if (isGridLayoutError(columnSpace)) return columnSpace
  const rowSpace = asAvailable(rowInput, "available.rows", nodeId)
  if (isGridLayoutError(rowSpace)) return rowSpace
  const placed = validPlacements(placement, nodeId)
  if (isGridLayoutError(placed)) return placed

  // Both axes are constructed in locals so a failure in rows never exposes a
  // partially expanded columns result.
  const columns = expandAxis(snapshot, "columns", snapshot.style.columns, columnSpace, placed.items, placement !== undefined)
  if (isGridLayoutError(columns)) return columns
  const rows = expandAxis(snapshot, "rows", snapshot.style.rows, rowSpace, placed.items, placement !== undefined)
  if (isGridLayoutError(rows)) return rows
  return {
    columns: { axis: "columns", tracks: columns.tracks, explicitCount: columns.explicitCount },
    rows: { axis: "rows", tracks: rows.tracks, explicitCount: rows.explicitCount },
    collapsedColumns: columns.collapsed,
    collapsedRows: rows.collapsed,
  }
}

/** Alias matching the terminology used by the Grid pipeline. */
export const expandGridRepeats = expandRepeats
export const expandRepeat = expandRepeats
export const resolveRepeats = expandRepeats
export const repeatTracks = expandRepeats
