/**
 * Initial Grid track sizing state.
 *
 * This stage only translates a track's sizing functions into the initial
 * `GridTrackState`.  It does not measure content, distribute free space, or
 * resolve flexible fractions.  Percentages on an indefinite axis stay
 * represented by their sizing function and receive an unresolved intrinsic
 * base; a later available-space stage resolves them.
 */

import type {
  ExpandedTracks,
  GridAvailableSpace,
  GridExpandedAxes,
  GridLayoutError,
  GridMinMax,
  GridPercent,
  GridTrackSize,
  GridTrackState,
} from "./grid-model"
import { createGridError, isGridLayoutError } from "./grid-errors"

export const GRID_TRACK_INIT_LIMIT = 1024
export const GRID_TRACK_LIMIT = GRID_TRACK_INIT_LIMIT

type Available = GridAvailableSpace | number | undefined
type Space = { readonly definite: boolean; readonly px: number }
type TrackResult = GridTrackState | GridLayoutError

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function nonNegative(value: unknown): value is number {
  return finite(value) && value >= 0
}

function validPercent(value: unknown): value is GridPercent {
  return record(value) && Object.keys(value).length === 1 && nonNegative(value.percent) && value.percent <= 100
}

function validFr(value: unknown): value is { readonly fr: number } {
  return record(value) && Object.keys(value).length === 1 && finite(value.fr) && value.fr > 0
}

function error(code: GridLayoutError["code"], path: string, nodeId: number): GridLayoutError {
  return createGridError(code, path, nodeId)
}

function available(value: Available, path: string, nodeId: number): Space | GridLayoutError {
  if (value === undefined) return { definite: false, px: 0 }
  if (typeof value === "number") {
    if (!nonNegative(value)) return error("GRID_INVALID_VALUE", path, nodeId)
    return { definite: true, px: value }
  }
  if (!record(value)) return error("GRID_INVALID_VALUE", path, nodeId)
  if (value.kind === "indefinite") return { definite: false, px: 0 }
  if (value.kind !== "definite" || !nonNegative(value.px)) return error("GRID_INVALID_VALUE", path, nodeId)
  return { definite: true, px: value.px }
}

function resolvedPercent(value: GridPercent, space: Space, path: string, nodeId: number): number | GridLayoutError | null {
  if (!space.definite) return null
  const result = space.px * value.percent / 100
  return finite(result) ? result : error("GRID_INVALID_VALUE", path, nodeId)
}

function resolvedFixed(value: unknown, space: Space, path: string, nodeId: number): number | GridLayoutError | null {
  if (typeof value === "number") return nonNegative(value) ? value : error("GRID_INVALID_VALUE", path, nodeId)
  if (validPercent(value)) return resolvedPercent(value, space, path, nodeId)
  if (record(value) && Object.prototype.hasOwnProperty.call(value, "percent")) return error("GRID_INVALID_VALUE", path, nodeId)
  return null
}

function minmax(value: unknown): value is GridMinMax {
  return record(value) && Object.keys(value).length === 1 && Array.isArray(value.minmax) && value.minmax.length === 2
}

function fitContent(value: unknown): value is { readonly fitContent: number | GridPercent } {
  return record(value) && Object.keys(value).length === 1 && Object.prototype.hasOwnProperty.call(value, "fitContent")
}

function fixedBreadth(
  value: unknown,
  space: Space,
  path: string,
  nodeId: number,
): number | GridLayoutError | null {
  return resolvedFixed(value, space, path, nodeId)
}

function intrinsicBase(value: unknown, space: Space, path: string, nodeId: number): number | GridLayoutError {
  const fixed = fixedBreadth(value, space, path, nodeId)
  if (typeof fixed === "number") return fixed
  if (isGridLayoutError(fixed)) return fixed
  if (value === "auto" || value === "min-content" || value === "max-content" || validPercent(value)) return 0
  if (validFr(value)) return error("GRID_INVALID_VALUE", path, nodeId)
  return error("GRID_INVALID_TRACK", path, nodeId)
}

function growthLimit(
  value: unknown,
  space: Space,
  path: string,
  nodeId: number,
): number | GridLayoutError {
  const fixed = fixedBreadth(value, space, path, nodeId)
  if (typeof fixed === "number") return fixed
  if (isGridLayoutError(fixed)) return fixed
  if (value === "auto" || value === "min-content" || value === "max-content" || validFr(value) || validPercent(value)) return Number.POSITIVE_INFINITY
  return error("GRID_INVALID_TRACK", path, nodeId)
}

function initializeMinMax(
  value: GridMinMax,
  space: Space,
  path: string,
  nodeId: number,
): TrackResult {
  const minimum = intrinsicBase(value.minmax[0], space, `${path}.minmax[0]`, nodeId)
  if (isGridLayoutError(minimum)) return minimum
  // A flex minimum is not in GridBreadth.  The guard here keeps malformed
  // runtime values from becoming a silently zero-sized track.
  if (validFr(value.minmax[0])) return error("GRID_INVALID_TRACK", `${path}.minmax[0]`, nodeId)
  const maximum = growthLimit(value.minmax[1], space, `${path}.minmax[1]`, nodeId)
  if (isGridLayoutError(maximum)) return maximum
  if (maximum !== Number.POSITIVE_INFINITY && maximum < minimum) {
    return Object.freeze({ min: value, max: value, base: minimum, growthLimit: minimum, offset: 0 })
  }
  return Object.freeze({ min: value, max: value, base: minimum, growthLimit: Math.max(minimum, maximum), offset: 0 })
}

function initializeFitContent(
  value: { readonly fitContent: number | GridPercent },
  space: Space,
  path: string,
  nodeId: number,
): TrackResult {
  const cap = fixedBreadth(value.fitContent, space, `${path}.fitContent`, nodeId)
  if (isGridLayoutError(cap)) return cap
  if (cap === null && !(validPercent(value.fitContent) && !space.definite)) return error("GRID_INVALID_VALUE", `${path}.fitContent`, nodeId)
  // fit-content has an intrinsic minimum and a finite cap when available;
  // an unresolved percentage cap remains open until available space exists.
  const unresolved = validPercent(value.fitContent) && !space.definite
  const limit = unresolved ? Number.POSITIVE_INFINITY : cap ?? 0
  return Object.freeze({ min: value, max: value, base: 0, growthLimit: limit, offset: 0 })
}

/** Initialize one GridTrackSize without performing later sizing phases. */
export function initializeTrack(
  value: GridTrackSize,
  space: Available = undefined,
  path = "track",
  nodeId = 0,
): TrackResult {
  const availableSpace = available(space, "available", nodeId)
  if (isGridLayoutError(availableSpace)) return availableSpace

  if (typeof value === "number") {
    if (!nonNegative(value)) return error("GRID_INVALID_VALUE", path, nodeId)
    return Object.freeze({ min: value, max: value, base: value, growthLimit: value, offset: 0 })
  }
  if (typeof value === "string") {
    if (value !== "auto" && value !== "min-content" && value !== "max-content") return error("GRID_INVALID_TRACK", path, nodeId)
    return Object.freeze({ min: value, max: value, base: 0, growthLimit: Number.POSITIVE_INFINITY, offset: 0 })
  }
  if (validPercent(value)) {
    const resolved = resolvedPercent(value, availableSpace, path, nodeId)
    if (isGridLayoutError(resolved)) return resolved
    return Object.freeze({ min: value, max: value, base: resolved ?? 0, growthLimit: availableSpace.definite ? resolved ?? 0 : Number.POSITIVE_INFINITY, offset: 0 })
  }
  if (record(value) && Object.prototype.hasOwnProperty.call(value, "percent")) return error("GRID_INVALID_VALUE", path, nodeId)
  if (validFr(value)) return Object.freeze({ min: value, max: value, base: 0, growthLimit: Number.POSITIVE_INFINITY, offset: 0 })
  if (record(value) && Object.prototype.hasOwnProperty.call(value, "fr")) return error("GRID_INVALID_VALUE", path, nodeId)
  if (minmax(value)) return initializeMinMax(value, availableSpace, path, nodeId)
  if (fitContent(value)) return initializeFitContent(value, availableSpace, path, nodeId)
  return error("GRID_INVALID_TRACK", path, nodeId)
}

function initializeState(
  track: GridTrackState,
  space: Available,
  path: string,
  nodeId: number,
): TrackResult {
  if (!track || typeof track !== "object") return error("GRID_INVALID_TRACK", path, nodeId)
  const minimum = initializeTrack(track.min, space, `${path}.min`, nodeId)
  if (isGridLayoutError(minimum)) return minimum
  const maximum = initializeTrack(track.max, space, `${path}.max`, nodeId)
  if (isGridLayoutError(maximum)) return maximum
  const base = minimum.base
  const growthLimit = Math.max(base, maximum.growthLimit)
  return Object.freeze({ min: track.min, max: track.max, base, growthLimit, offset: 0 })
}

/** Initialize all states in one expanded axis, preserving its explicit count. */
export function initializeAxisTracks(
  expanded: ExpandedTracks,
  space: Available = undefined,
  nodeId = 0,
): ExpandedTracks | GridLayoutError {
  if (!expanded || (expanded.axis !== "columns" && expanded.axis !== "rows") || !Array.isArray(expanded.tracks)) {
    return error("GRID_INVALID_TRACK", "tracks", nodeId)
  }
  if (!Number.isInteger(expanded.explicitCount) || expanded.explicitCount < 0 || expanded.explicitCount > GRID_TRACK_INIT_LIMIT || expanded.tracks.length > GRID_TRACK_INIT_LIMIT) {
    return error("GRID_TRACK_LIMIT", expanded.axis, nodeId)
  }
  const availableSpace = available(space, "available", nodeId)
  if (isGridLayoutError(availableSpace)) return availableSpace
  const tracks: GridTrackState[] = []
  for (let index = 0; index < expanded.tracks.length; index++) {
    const initialized = initializeState(expanded.tracks[index], space, `${expanded.axis}[${index}]`, nodeId)
    if (isGridLayoutError(initialized)) return initialized
    tracks.push(initialized)
  }
  return { axis: expanded.axis, tracks: Object.freeze(tracks), explicitCount: expanded.explicitCount }
}

/** Initialize both axes atomically. */
export function initializeGridTracks(
  axes: GridExpandedAxes,
  space: Available = undefined,
  nodeId = 0,
): GridExpandedAxes | GridLayoutError {
  if (!axes || !axes.columns || !axes.rows) return error("GRID_INVALID_TRACK", "tracks", nodeId)
  const columns = initializeAxisTracks(axes.columns, space, nodeId)
  if (isGridLayoutError(columns)) return columns
  const rows = initializeAxisTracks(axes.rows, space, nodeId)
  if (isGridLayoutError(rows)) return rows
  return { columns, rows }
}

/** A gap is a fixed-size gutter; it does not participate in fr distribution. */
export function initializeGutter(
  gap: number,
  nodeId = 0,
): GridTrackState | GridLayoutError {
  if (!nonNegative(gap)) return error("GRID_INVALID_VALUE", "gap", nodeId)
  return Object.freeze({ min: gap, max: gap, base: gap, growthLimit: gap, offset: 0 })
}

/** Convenience helper for callers carrying an axis and its gap together. */
export function initializeAxisWithGutter(
  expanded: ExpandedTracks,
  space: Available = undefined,
  gap = 0,
  nodeId = 0,
): { readonly tracks: ExpandedTracks; readonly gutter: GridTrackState } | GridLayoutError {
  const tracks = initializeAxisTracks(expanded, space, nodeId)
  if (isGridLayoutError(tracks)) return tracks
  const gutter = initializeGutter(gap, nodeId)
  if (isGridLayoutError(gutter)) return gutter
  return { tracks, gutter }
}

// Stage vocabulary aliases used by the subsequent sizing modules.
export const initializeTrackSize = initializeTrack
export const initTrack = initializeTrack
export const initializeTracks = initializeGridTracks
export const initializeAxis = initializeAxisTracks
export const createGutterTrack = initializeGutter
