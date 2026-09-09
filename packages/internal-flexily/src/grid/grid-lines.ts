/**
 * Grid line naming and numeric line indexing.
 *
 * Placement consumes zero-based line indices, while the public Grid API uses
 * CSS-style one-based (and negative) references.  This module only resolves
 * the line index; it does not scan an occupancy grid or perform auto-placement.
 */

import type {
  ExpandedTracks,
  GridAxis,
  GridExpandedAxes,
  GridLineRef,
  GridLayoutError,
  GridRepeatCount,
  GridSnapshot,
  GridTrack,
  GridTrackSize,
  GridResolvedLineSet,
  ResolvedLines,
} from "./grid-model"
import { createGridError } from "./grid-errors"
import {
  areaDimensions,
  isGridAreaName,
  resolveAreas,
  type GridAreaMap,
  type GridAreaRect,
} from "./grid-areas"

export const GRID_LINE_LIMIT = 1024

export type LineNameIndex = ReadonlyMap<string, readonly number[]>
export type GridLineSide = "start" | "end"
export type LineResolution = number | GridLayoutError

type NameLists = { readonly before: readonly string[]; readonly after: readonly string[] }
type NamedTrack = {
  readonly size: GridTrackSize
  readonly before?: readonly string[]
  readonly after?: readonly string[]
}
type RepeatTrack = {
  readonly repeat: {
    readonly count: GridRepeatCount
    readonly tracks: readonly GridTrack[]
  }
}

const RESERVED_NAMES = new Set(["auto", "default", "none", "span", "subgrid", "masonry"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)
}

function invalid(path: string, nodeId: number): GridLayoutError {
  return createGridError("GRID_INVALID_PLACEMENT", path, nodeId)
}

function unresolved(path: string, nodeId: number): GridLayoutError {
  return createGridError("GRID_LINE_UNRESOLVED", path, nodeId)
}

function invalidTrack(path: string, nodeId: number): GridLayoutError {
  return createGridError("GRID_INVALID_TRACK", path, nodeId)
}

function addName(index: Map<string, number[]>, name: string, line: number): void {
  const lines = index.get(name)
  if (!lines) {
    index.set(name, [line])
    return
  }
  // A name listed twice on one line is still one named line for occurrence
  // lookup.  Repeated names on different lines remain separate occurrences.
  if (lines[lines.length - 1] !== line) lines.push(line)
}

function namesOf(track: GridTrack): NameLists {
  if (!isNamedTrack(track)) {
    return { before: [], after: [] }
  }
  const before = Array.isArray(track.before) ? track.before : []
  const after = Array.isArray(track.after) ? track.after : []
  return { before, after }
}

function isNamedTrack(track: GridTrack): track is NamedTrack {
  return isRecord(track) && Object.prototype.hasOwnProperty.call(track, "size")
}

function isRepeatTrack(track: GridTrack): track is RepeatTrack {
  if (!isRecord(track) || !Object.prototype.hasOwnProperty.call(track, "repeat")) return false
  const repeat = (track as Record<string, unknown>).repeat
  return isRecord(repeat) && Array.isArray(repeat.tracks)
}

/**
 * Expand the line-name declarations in a track list into one entry per
 * concrete track.  Fixed repeat is expanded exactly; auto-repeat repeats its
 * single declaration to the concrete count supplied by the expanded axis.
 */
function flattenTrackNames(tracks: readonly GridTrack[], trackCount: number): NameLists[] {
  const result: NameLists[] = []

  const append = (track: GridTrack, repeatLimit?: number): void => {
    if (result.length >= trackCount) return
    if (isRepeatTrack(track)) {
      const repeat = track.repeat
      const count = typeof repeat.count === "number" ? repeat.count : repeatLimit ?? trackCount
      const repetitions = Math.max(0, Math.min(count, trackCount - result.length))
      for (let repetition = 0; repetition < repetitions; repetition++) {
        for (const child of repeat.tracks as readonly GridTrack[]) append(child, trackCount - result.length)
      }
      return
    }
    result.push(namesOf(track))
  }

  for (const track of tracks) append(track)
  return result
}

function staticTrackCount(track: GridTrack): number {
  if (!isRepeatTrack(track)) return 1
  const count = typeof track.repeat.count === "number" ? track.repeat.count : 1
  return count * track.repeat.tracks.reduce<number>((total, child) => total + staticTrackCount(child), 0)
}

function declaredTrackCount(tracks: readonly GridTrack[]): number {
  return tracks.reduce<number>((total, track) => {
    if (!isRepeatTrack(track)) return total + 1
    if (typeof track.repeat.count !== "number") return total
    return total + track.repeat.count * track.repeat.tracks.reduce<number>((nested, child) => nested + staticTrackCount(child), 0)
  }, 0)
}

function validTrackName(name: unknown): name is string {
  return isGridAreaName(name) && !RESERVED_NAMES.has(name.toLowerCase())
}

/**
 * Index names declared before/after concrete tracks.  The returned arrays are
 * copies, so later placement cannot mutate this line index accidentally.
 */
export function indexLineNames(tracks: readonly GridTrack[], trackCount?: number): LineNameIndex | GridLayoutError {
  if (!Array.isArray(tracks)) return invalidTrack("tracks", 0)
  const concreteCount = trackCount === undefined ? tracks.reduce<number>((total, track) => total + staticTrackCount(track), 0) : trackCount
  if (!isFiniteInteger(concreteCount) || concreteCount < 0 || concreteCount > GRID_LINE_LIMIT) {
    return invalidTrack("tracks", 0)
  }

  const index = new Map<string, number[]>()
  const flattened = flattenTrackNames(tracks, concreteCount)
  for (let track = 0; track < flattened.length; track++) {
    const names = flattened[track]
    for (const name of names.before) {
      if (!validTrackName(name)) return invalidTrack(`tracks[${track}].before`, 0)
      addName(index, name, track)
    }
    for (const name of names.after) {
      if (!validTrackName(name)) return invalidTrack(`tracks[${track}].after`, 0)
      addName(index, name, track + 1)
    }
  }

  return copyNameIndex(index)
}

function copyNameIndex(index: Map<string, number[]>): LineNameIndex {
  const copy = new Map<string, readonly number[]>()
  for (const [name, lines] of index) copy.set(name, Object.freeze([...lines].sort((left, right) => left - right)))
  return copy
}

function addAreaNames(index: Map<string, number[]>, areas: GridAreaMap): void {
  for (const [name, rect] of areas) {
    addName(index, `${name}-start`, rect.columnStart)
    addName(index, `${name}-end`, rect.columnEnd)
  }
}

function addRowAreaNames(index: Map<string, number[]>, areas: GridAreaMap): void {
  for (const [name, rect] of areas) {
    addName(index, `${name}-start`, rect.rowStart)
    addName(index, `${name}-end`, rect.rowEnd)
  }
}

function concreteTrackCount(expanded: ExpandedTracks, styleTracks: readonly GridTrack[], areaCount: number): number {
  // Usually G-017 has already expanded repeat and implicit tracks.  The style
  // count fallback keeps this stage useful in isolation in tests and makes a
  // template area able to extend an otherwise empty explicit axis.
  const flattened = declaredTrackCount(styleTracks)
  const declared = flattened === 0 && styleTracks.length > 0 ? 1 : flattened
  return Math.max(expanded.tracks.length, expanded.explicitCount, declared, areaCount)
}

function initialPositions(count: number): readonly number[] {
  return Object.freeze(Array.from({ length: count + 1 }, (_, line) => line))
}

function makeAxisLines(
  snapshot: GridSnapshot,
  axis: GridAxis,
  expanded: ExpandedTracks,
  areas: GridAreaMap,
  areaCount: number,
): ResolvedLines | GridLayoutError {
  if (expanded.axis !== axis || !Array.isArray(expanded.tracks)) return invalidTrack(axis, snapshot.nodeId)
  if (!isFiniteInteger(expanded.explicitCount) || expanded.explicitCount < 0) return invalidTrack(`${axis}.explicitCount`, snapshot.nodeId)
  if (expanded.tracks.length > GRID_LINE_LIMIT || expanded.explicitCount > GRID_LINE_LIMIT) return createGridError("GRID_TRACK_LIMIT", axis, snapshot.nodeId)

  const styleTracks = axis === "columns" ? snapshot.style.columns : snapshot.style.rows
  if (!Array.isArray(styleTracks)) return invalidTrack(axis, snapshot.nodeId)
  const count = concreteTrackCount(expanded, styleTracks, areaCount)
  if (!isFiniteInteger(count) || count < 0) return invalidTrack(axis, snapshot.nodeId)
  if (count > GRID_LINE_LIMIT) return createGridError("GRID_TRACK_LIMIT", axis, snapshot.nodeId)

  const indexed = indexLineNames(styleTracks, count)
  if ("code" in indexed) return { ...indexed, nodeId: snapshot.nodeId }
  const names = new Map<string, number[]>()
  for (const [name, lines] of indexed) names.set(name, [...lines])
  if (axis === "columns") addAreaNames(names, areas)
  else addRowAreaNames(names, areas)

  return {
    axis,
    positions: initialPositions(count),
    names: copyNameIndex(names),
    explicitCount: Math.max(expanded.explicitCount, areaCount, styleTracks.length),
  }
}

/**
 * Resolve both axes' line names after track expansion.  Area start/end names
 * are generated as part of the explicit grid (`header-start`, `header-end`).
 */
export function resolveLines(snapshot: GridSnapshot, expanded: GridExpandedAxes): GridResolvedLineSet | GridLayoutError {
  if (!snapshot || !snapshot.style || !expanded || !expanded.columns || !expanded.rows) return invalidTrack("snapshot", snapshot?.nodeId ?? 0)
  const areaResult = resolveAreas(snapshot.style.areas, snapshot.nodeId, "areas")
  if ("code" in areaResult) return areaResult
  const dimensions = areaDimensions(snapshot.style.areas, snapshot.nodeId, "areas")
  if ("code" in dimensions) return dimensions

  const columns = makeAxisLines(snapshot, "columns", expanded.columns, areaResult, dimensions.columns)
  if ("code" in columns) return columns
  const rows = makeAxisLines(snapshot, "rows", expanded.rows, areaResult, dimensions.rows)
  if ("code" in rows) return rows
  return { columns, rows }
}

/** Alias for callers that resolve one axis in a staged pipeline. */
export function resolveAxisLines(
  snapshot: GridSnapshot,
  axis: GridAxis,
  expanded: ExpandedTracks,
): ResolvedLines | GridLayoutError {
  const areaResult = resolveAreas(snapshot.style.areas, snapshot.nodeId, "areas")
  if ("code" in areaResult) return areaResult
  const dimensions = areaDimensions(snapshot.style.areas, snapshot.nodeId, "areas")
  if ("code" in dimensions) return dimensions
  return makeAxisLines(snapshot, axis, expanded, areaResult, axis === "columns" ? dimensions.columns : dimensions.rows)
}

function lineCount(lines: ResolvedLines): number {
  return lines.positions.length > 0 ? lines.positions.length : lines.explicitCount + 1
}

/** Resolve a public numeric or named line reference to a zero-based index. */
export function resolveLineReference(
  lines: ResolvedLines,
  ref: GridLineRef,
  path = "line",
  nodeId = 0,
  _side: GridLineSide = "start",
): LineResolution {
  const count = lineCount(lines)
  if (!isRecord(ref)) {
    if (!isFiniteInteger(ref) || ref === 0) return invalid(path, nodeId)
    const resolved = ref > 0 ? ref - 1 : count + ref
    return resolved >= 0 && resolved < count ? resolved : unresolved(path, nodeId)
  }

  if (Object.prototype.hasOwnProperty.call(ref, "span")) return invalid(path, nodeId)
  const named = ref as { readonly name?: unknown; readonly occurrence?: unknown }
  if (typeof named.name !== "string" || !validTrackName(named.name)) return invalid(path, nodeId)
  const occurrence = named.occurrence === undefined ? 1 : named.occurrence
  if (!isFiniteInteger(occurrence) || occurrence <= 0) return invalid(`${path}.occurrence`, nodeId)
  const occurrences = lines.names.get(named.name)
  if (!occurrences || occurrence > occurrences.length) return unresolved(path, nodeId)
  return occurrences[occurrence - 1]
}

export function resolveNamedLine(
  lines: ResolvedLines,
  name: string,
  occurrence = 1,
  path = "line",
  nodeId = 0,
): LineResolution {
  return resolveLineReference(lines, { name, occurrence }, path, nodeId)
}

/** Short alias used by placement implementations. */
export const resolveLine = resolveLineReference

/** Look up area-generated names without exposing mutable index arrays. */
export function areaLineNames(
  areas: GridAreaMap,
  axis: GridAxis,
): LineNameIndex {
  const names = new Map<string, number[]>()
  if (axis === "columns") addAreaNames(names, areas)
  else addRowAreaNames(names, areas)
  return copyNameIndex(names)
}

/** Retrieve a named area's four line indices from an indexed line set. */
export function areaLines(
  lines: ResolvedLines,
  name: string,
  nodeId = 0,
): { readonly start: number; readonly end: number } | GridLayoutError {
  const start = resolveNamedLine(lines, `${name}-start`, 1, `areas.${name}.start`, nodeId)
  if (typeof start !== "number") return start
  const end = resolveNamedLine(lines, `${name}-end`, 1, `areas.${name}.end`, nodeId)
  if (typeof end !== "number") return end
  return { start, end }
}

// Keep these types visible to consumers that only import this stage.
export type { GridAreaMap, GridAreaRect }
