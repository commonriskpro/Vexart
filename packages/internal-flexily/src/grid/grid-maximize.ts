/**
 * Maximize non-flexible Grid tracks in a definite content box.
 *
 * This stage consumes only the free space left after the current track bases
 * and gutters.  Tracks whose maximum is `fr` are deliberately left alone for
 * the later flexible-track stage; alignment and auto stretching are also
 * outside this seam.  An indefinite axis has no finite free-space budget, so
 * its bases are returned unchanged with the constraint preserved.
 */

import type {
  ExpandedTracks,
  GridAvailableSpace,
  GridAxis,
  GridLayoutError,
  GridMinMax,
  GridTrackState,
} from "./grid-model"
import { createGridError } from "./grid-errors"

export const GRID_MAXIMIZE_TRACK_LIMIT = 1024
export const GRID_MAXIMIZE_EPSILON = 1e-6

export type MaximizeAvailable = GridAvailableSpace | number

export type MaximizeInput = {
  readonly axis: GridAxis
  readonly available: MaximizeAvailable
  readonly tracks: ExpandedTracks
  readonly gap?: number
}

export type MaximizeResult = {
  readonly axis: GridAxis
  readonly tracks: ExpandedTracks
  /** Free space before this stage consumes any eligible track capacity. */
  readonly freeSpace: number | null
  /** Space that remains after maximizing, or null on an indefinite axis. */
  readonly remainingSpace: number | null
  /** Base-size growth consumed by this stage, excluding gutters. */
  readonly consumed: number
  /** Positive overflow when bases plus gutters already exceed a definite box. */
  readonly overflow: number
  readonly available: GridAvailableSpace
  readonly frozen: readonly number[]
}

type Result = MaximizeResult | GridLayoutError
type MutableTrack = GridTrackState & { base: number }
type Space =
  | { readonly kind: "definite"; readonly px: number }
  | { readonly kind: "indefinite"; readonly constraint: "min-content" | "max-content" }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function nonNegative(value: unknown): value is number {
  return finite(value) && value >= 0
}

function isFr(value: unknown): boolean {
  return record(value) && Object.keys(value).length === 1 && finite(value.fr) && value.fr > 0
}

function minmax(value: unknown): value is GridMinMax {
  return record(value) && Object.keys(value).length === 1 && Array.isArray(value.minmax) && value.minmax.length === 2
}

function error(code: GridLayoutError["code"], path: string, nodeId: number): GridLayoutError {
  return createGridError(code, path, nodeId)
}

function resolveAvailable(value: unknown, path: string, nodeId: number): Space | GridLayoutError {
  if (typeof value === "number") {
    return nonNegative(value)
      ? { kind: "definite", px: value }
      : error("GRID_INVALID_VALUE", path, nodeId)
  }
  if (!record(value)) return error("GRID_INVALID_VALUE", path, nodeId)
  if (value.kind === "definite" && nonNegative(value.px)) {
    return { kind: "definite", px: value.px }
  }
  if (value.kind === "indefinite" && (value.constraint === "min-content" || value.constraint === "max-content")) {
    return { kind: "indefinite", constraint: value.constraint }
  }
  return error("GRID_INVALID_VALUE", path, nodeId)
}

function validateTrack(track: GridTrackState, path: string, nodeId: number): GridLayoutError | null {
  if (!track || typeof track !== "object") return error("GRID_INVALID_TRACK", path, nodeId)
  if (!nonNegative(track.base) || !nonNegative(track.offset)) return error("GRID_INVALID_TRACK", path, nodeId)
  if (track.growthLimit !== Number.POSITIVE_INFINITY && (!nonNegative(track.growthLimit) || track.growthLimit < track.base)) {
    return error("GRID_INVALID_TRACK", path, nodeId)
  }
  return null
}

/** True when the maximum sizing function belongs to the later fr phase. */
function hasFlexibleMaximum(value: unknown): boolean {
  if (isFr(value)) return true
  return minmax(value) && isFr(value.minmax[1])
}

/**
 * Maximize every track with remaining capacity except flexible maxima.  A
 * numeric maximum is represented by a finite growthLimit and is therefore
 * consumed up to that limit; fixed tracks naturally have no capacity.
 */
function eligible(track: GridTrackState): boolean {
  return !hasFlexibleMaximum(track.max)
}

function distribute(
  tracks: MutableTrack[],
  candidates: readonly number[],
  free: number,
  frozen: Set<number>,
): number {
  let remaining = free
  let active = candidates.filter((index) => !frozen.has(index))
  while (remaining > GRID_MAXIMIZE_EPSILON && active.length > 0) {
    const share = remaining / active.length
    const next: number[] = []
    let allocated = 0
    for (const index of active) {
      const track = tracks[index]
      const capacity = track.growthLimit === Number.POSITIVE_INFINITY
        ? Number.POSITIVE_INFINITY
        : Math.max(0, track.growthLimit - track.base)
      const amount = Math.min(share, capacity)
      if (amount > 0) {
        track.base += amount
        allocated += amount
      }
      if (track.growthLimit === Number.POSITIVE_INFINITY || track.base < track.growthLimit - GRID_MAXIMIZE_EPSILON) {
        next.push(index)
      } else {
        // Keep the limit exact once it was reached within solver tolerance.
        if (track.growthLimit !== Number.POSITIVE_INFINITY) track.base = track.growthLimit
        frozen.add(index)
      }
    }
    if (allocated <= GRID_MAXIMIZE_EPSILON) break
    remaining = Math.max(0, remaining - allocated)
    active = next
  }
  return Math.min(free, Math.max(0, free - remaining))
}

/** Maximize eligible tracks in a definite box; preserve indefinite axes. */
export function maximizeTracks(input: MaximizeInput): Result {
  const nodeId = 0
  if (!input || (input.axis !== "columns" && input.axis !== "rows") || !input.tracks || input.tracks.axis !== input.axis || !Array.isArray(input.tracks.tracks)) {
    return error("GRID_INVALID_TRACK", "input", nodeId)
  }
  const gap = input.gap ?? 0
  if (!nonNegative(gap)) return error("GRID_INVALID_VALUE", "gap", nodeId)
  if (input.tracks.tracks.length > GRID_MAXIMIZE_TRACK_LIMIT || !Number.isInteger(input.tracks.explicitCount) || input.tracks.explicitCount < 0 || input.tracks.explicitCount > GRID_MAXIMIZE_TRACK_LIMIT) {
    return error("GRID_TRACK_LIMIT", input.axis, nodeId)
  }
  const space = resolveAvailable(input.available, "available", nodeId)
  if ("code" in space) return space

  const tracks: MutableTrack[] = []
  for (let index = 0; index < input.tracks.tracks.length; index++) {
    const track = input.tracks.tracks[index]
    const invalid = validateTrack(track, `${input.axis}[${index}]`, nodeId)
    if (invalid) return invalid
    tracks.push({ ...track })
  }

  const frozen = new Set<number>()
  for (let index = 0; index < tracks.length; index++) {
    const track = tracks[index]
    if (track.growthLimit !== Number.POSITIVE_INFINITY && track.base >= track.growthLimit - GRID_MAXIMIZE_EPSILON) frozen.add(index)
  }

  const baseTotal = tracks.reduce((sum, track) => sum + track.base, 0)
  const gutterTotal = Math.max(0, tracks.length - 1) * gap
  if (space.kind === "indefinite") {
    const outputTracks = tracks.map((track) => Object.freeze({ ...track }))
    return {
      axis: input.axis,
      tracks: { axis: input.tracks.axis, tracks: Object.freeze(outputTracks), explicitCount: input.tracks.explicitCount },
      freeSpace: null,
      remainingSpace: null,
      consumed: 0,
      overflow: 0,
      available: space,
      frozen: Object.freeze([...frozen].sort((left, right) => left - right)),
    }
  }

  const occupied = baseTotal + gutterTotal
  const freeSpace = Math.max(0, space.px - occupied)
  const overflow = Math.max(0, occupied - space.px)
  const candidates = tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track, index }) => eligible(track) && !frozen.has(index))
    .map(({ index }) => index)
  const consumed = distribute(tracks, candidates, freeSpace, frozen)
  const remainingSpace = freeSpace - consumed <= GRID_MAXIMIZE_EPSILON ? 0 : freeSpace - consumed
  const outputTracks = tracks.map((track) => Object.freeze({ ...track }))
  return {
    axis: input.axis,
    tracks: { axis: input.tracks.axis, tracks: Object.freeze(outputTracks), explicitCount: input.tracks.explicitCount },
    freeSpace,
    remainingSpace,
    consumed,
    overflow,
    available: space,
    frozen: Object.freeze([...frozen].sort((left, right) => left - right)),
  }
}

/** Positional convenience form for sizing callers. */
export function maximize(
  axis: GridAxis,
  tracks: ExpandedTracks,
  available: MaximizeAvailable,
  gap = 0,
): Result {
  return maximizeTracks({ axis, tracks, available, gap })
}

export const resolveMaximize = maximizeTracks
export const maximizeAxis = maximizeTracks
export const maximizeGridTracks = maximizeTracks
export const resolveTrackMaximize = maximizeTracks
