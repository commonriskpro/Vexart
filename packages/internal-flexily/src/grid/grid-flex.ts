/**
 * Resolve flexible (`fr`) Grid tracks after intrinsic/maximize passes.
 *
 * Definite axes use the Grid hypothetical-fr loop: free space is calculated
 * from non-flexible bases and gutters, flexible tracks below their base or
 * above their growth limit are frozen, and the remaining factors are solved
 * again.  Indefinite axes do not invent a viewport-sized budget; they use the
 * corresponding intrinsic contribution (max-content for a max-content axis).
 * This module does not round, align, or write back rectangles.
 */

import type {
  ExpandedTracks,
  GridAvailableSpace,
  GridAxis,
  GridIntrinsicContribution,
  GridLayoutError,
  GridMinMax,
  GridTrackState,
} from "./grid-model"
import { createGridError } from "./grid-errors"

export const GRID_FLEX_TRACK_LIMIT = 1024
export const GRID_FLEX_EPSILON = 1e-6

export type FlexAvailable = GridAvailableSpace | number

export type FlexInput = {
  readonly axis: GridAxis
  readonly available: FlexAvailable
  readonly tracks: ExpandedTracks
  readonly gap?: number
  /** Span contributions used to resolve an indefinite intrinsic axis. */
  readonly contributions?: readonly GridIntrinsicContribution[]
}

export type FlexResult = {
  readonly axis: GridAxis
  readonly tracks: ExpandedTracks
  /** Free space available to flexible tracks before this phase. */
  readonly freeSpace: number | null
  /** Actual free space after all final track bases and gutters. */
  readonly remainingSpace: number | null
  readonly hypotheticalFr: number | null
  readonly consumed: number
  readonly overflow: number
  readonly available: GridAvailableSpace
  readonly factors: ReadonlyMap<number, number>
  readonly frozen: readonly number[]
}

type Result = FlexResult | GridLayoutError
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

function isFr(value: unknown): value is { readonly fr: number } {
  return record(value) && Object.keys(value).length === 1 && finite(value.fr) && value.fr > 0
}

function hasFr(value: unknown): boolean {
  return record(value) && Object.prototype.hasOwnProperty.call(value, "fr")
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

function validateSizingValue(value: unknown, path: string, nodeId: number): GridLayoutError | null {
  if (hasFr(value) && !isFr(value)) return error("GRID_INVALID_VALUE", path, nodeId)
  if (!minmax(value)) return null
  const minimum = value.minmax[0]
  const maximum = value.minmax[1]
  const invalidMinimum = validateSizingValue(minimum, `${path}.minmax[0]`, nodeId)
  if (invalidMinimum) return invalidMinimum
  return validateSizingValue(maximum, `${path}.minmax[1]`, nodeId)
}

function validateTrack(track: GridTrackState, path: string, nodeId: number): GridLayoutError | null {
  if (!track || typeof track !== "object") return error("GRID_INVALID_TRACK", path, nodeId)
  if (!nonNegative(track.base) || !nonNegative(track.offset)) return error("GRID_INVALID_TRACK", path, nodeId)
  if (track.growthLimit !== Number.POSITIVE_INFINITY && (!nonNegative(track.growthLimit) || track.growthLimit < track.base)) {
    return error("GRID_INVALID_TRACK", path, nodeId)
  }
  const minimum = validateSizingValue(track.min, `${path}.min`, nodeId)
  if (minimum) return minimum
  return validateSizingValue(track.max, `${path}.max`, nodeId)
}

function factor(value: unknown): number | null {
  if (isFr(value)) return value.fr
  if (minmax(value) && isFr(value.minmax[1])) return value.minmax[1].fr
  return null
}

function flexibleFactors(tracks: readonly GridTrackState[]): Map<number, number> {
  const factors = new Map<number, number>()
  tracks.forEach((track, index) => {
    const value = factor(track.max)
    if (value !== null) factors.set(index, value)
  })
  return factors
}

function frozenAtLimit(track: GridTrackState): boolean {
  return track.growthLimit !== Number.POSITIVE_INFINITY && track.base >= track.growthLimit - GRID_FLEX_EPSILON
}

function initialFrozen(tracks: readonly GridTrackState[]): Set<number> {
  const frozen = new Set<number>()
  tracks.forEach((track, index) => {
    if (frozenAtLimit(track)) frozen.add(index)
  })
  return frozen
}

function gutterTotal(count: number, gap: number): number {
  return Math.max(0, count - 1) * gap
}

function actualSpace(
  tracks: readonly MutableTrack[],
  available: number,
  gap: number,
): { readonly remaining: number; readonly overflow: number } {
  const occupied = tracks.reduce((sum, track) => sum + track.base, 0) + gutterTotal(tracks.length, gap)
  return {
    remaining: Math.max(0, available - occupied) <= GRID_FLEX_EPSILON ? 0 : Math.max(0, available - occupied),
    overflow: Math.max(0, occupied - available) <= GRID_FLEX_EPSILON ? 0 : Math.max(0, occupied - available),
  }
}

/**
 * Free space for the hypothetical-fr calculation excludes the bases of
 * flexible tracks still being solved.  Frozen flexible tracks are included,
 * as are every non-flexible track and all gutters.
 */
function hypotheticalFreeSpace(
  tracks: readonly MutableTrack[],
  factors: ReadonlyMap<number, number>,
  frozen: ReadonlySet<number>,
  available: number,
  gap: number,
): number {
  const occupied = tracks.reduce((sum, track, index) => {
    if (factors.has(index) && !frozen.has(index)) return sum
    return sum + track.base
  }, gutterTotal(tracks.length, gap))
  return Math.max(0, available - occupied)
}

function output(
  axis: GridAxis,
  source: ExpandedTracks,
  tracks: readonly MutableTrack[],
  available: GridAvailableSpace,
  freeSpace: number | null,
  hypotheticalFr: number | null,
  consumed: number,
  remainingSpace: number | null,
  overflow: number,
  factors: ReadonlyMap<number, number>,
  frozen: ReadonlySet<number>,
): FlexResult {
  const finalTracks = tracks.map((track) => Object.freeze({ ...track }))
  return {
    axis,
    tracks: { axis: source.axis, tracks: Object.freeze(finalTracks), explicitCount: source.explicitCount },
    freeSpace,
    remainingSpace,
    hypotheticalFr,
    consumed,
    overflow,
    available,
    factors: new Map(factors),
    frozen: Object.freeze([...frozen].sort((left, right) => left - right)),
  }
}

function validateContributions(
  contributions: readonly GridIntrinsicContribution[],
  axis: GridAxis,
  trackCount: number,
): GridLayoutError | null {
  for (let index = 0; index < contributions.length; index++) {
    const contribution = contributions[index]
    if (!contribution || !Number.isInteger(contribution.nodeId) || contribution.axis !== axis || !Number.isInteger(contribution.start) || !Number.isInteger(contribution.end) || contribution.start < 0 || contribution.end <= contribution.start || contribution.end > trackCount || !nonNegative(contribution.minContent) || !nonNegative(contribution.maxContent) || contribution.minContent > contribution.maxContent || !nonNegative(contribution.minimum) || !nonNegative(contribution.preferred)) {
      return error("GRID_INVALID_PLACEMENT", `contributions[${index}]`, contribution?.nodeId ?? 0)
    }
  }
  return null
}

function maxContentGrowth(
  tracks: MutableTrack[],
  factors: ReadonlyMap<number, number>,
  contributions: readonly GridIntrinsicContribution[],
  constraint: "min-content" | "max-content",
  gap: number,
  frozen: Set<number>,
): void {
  const sorted = contributions
    .map((contribution, index) => ({ contribution, index }))
    .sort((left, right) => (left.contribution.end - left.contribution.start) - (right.contribution.end - right.contribution.start) || left.index - right.index)
  for (const { contribution } of sorted) {
    const start = contribution.start
    const end = contribution.end
    const current = tracks.slice(start, end).reduce((sum, track) => sum + track.base, 0) + gutterTotal(end - start, gap)
    const demand = constraint === "max-content" ? contribution.maxContent : contribution.minContent
    const extra = Math.max(0, demand - current)
    if (extra <= GRID_FLEX_EPSILON) continue
    const eligible = Array.from({ length: end - start }, (_, offset) => start + offset)
      .filter((index) => factors.has(index) && !frozen.has(index))
    let remaining = extra
    while (remaining > GRID_FLEX_EPSILON && eligible.length > 0) {
      const total = eligible.reduce((sum, index) => sum + (factors.get(index) ?? 0), 0)
      if (total <= 0) break
      const next: number[] = []
      let allocated = 0
      for (const index of eligible) {
        const track = tracks[index]
        const desired = remaining * (factors.get(index) ?? 0) / total
        const capacity = track.growthLimit === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Math.max(0, track.growthLimit - track.base)
        const amount = Math.min(desired, capacity)
        if (amount > 0) {
          track.base += amount
          allocated += amount
        }
        if (track.growthLimit !== Number.POSITIVE_INFINITY && track.base >= track.growthLimit - GRID_FLEX_EPSILON) {
          track.base = track.growthLimit
          frozen.add(index)
        } else {
          next.push(index)
        }
      }
      if (allocated <= GRID_FLEX_EPSILON) break
      remaining = Math.max(0, remaining - allocated)
      eligible.splice(0, eligible.length, ...next)
    }
  }
}

/** Resolve flexible tracks without rounding or alignment. */
export function resolveFlex(input: FlexInput): Result {
  const nodeId = 0
  if (!input || (input.axis !== "columns" && input.axis !== "rows") || !input.tracks || input.tracks.axis !== input.axis || !Array.isArray(input.tracks.tracks)) {
    return error("GRID_INVALID_TRACK", "input", nodeId)
  }
  const gap = input.gap ?? 0
  if (!nonNegative(gap)) return error("GRID_INVALID_VALUE", "gap", nodeId)
  if (input.tracks.tracks.length > GRID_FLEX_TRACK_LIMIT || !Number.isInteger(input.tracks.explicitCount) || input.tracks.explicitCount < 0 || input.tracks.explicitCount > GRID_FLEX_TRACK_LIMIT) {
    return error("GRID_TRACK_LIMIT", input.axis, nodeId)
  }
  const space = resolveAvailable(input.available, "available", nodeId)
  if ("code" in space) return space
  const contributions = input.contributions ?? []
  const contributionError = validateContributions(contributions, input.axis, input.tracks.tracks.length)
  if (contributionError) return contributionError

  const tracks: MutableTrack[] = []
  for (let index = 0; index < input.tracks.tracks.length; index++) {
    const source = input.tracks.tracks[index]
    const invalid = validateTrack(source, `${input.axis}[${index}]`, nodeId)
    if (invalid) return invalid
    tracks.push({ ...source })
  }
  const factors = flexibleFactors(tracks)
  const frozen = initialFrozen(tracks)
  const beforeTotal = tracks.reduce((sum, track) => sum + track.base, 0)

  if (space.kind === "indefinite") {
    maxContentGrowth(tracks, factors, contributions, space.constraint, gap, frozen)
    const afterTotal = tracks.reduce((sum, track) => sum + track.base, 0)
    return output(input.axis, input.tracks, tracks, space, null, null, afterTotal - beforeTotal, null, 0, factors, frozen)
  }

  const initialFree = hypotheticalFreeSpace(tracks, factors, frozen, space.px, gap)
  const active = new Set<number>([...factors.keys()].filter((index) => !frozen.has(index)))
  let hypotheticalFr: number | null = active.size > 0 ? 0 : null
  while (active.size > 0) {
    const factorTotal = [...active].reduce((sum, index) => sum + (factors.get(index) ?? 0), 0)
    if (!finite(factorTotal) || factorTotal <= 0) return error("GRID_INVALID_VALUE", "tracks.fr", nodeId)
    const free = hypotheticalFreeSpace(tracks, factors, frozen, space.px, gap)
    hypotheticalFr = free / factorTotal
    const newlyFrozen: number[] = []
    for (const index of active) {
      const track = tracks[index]
      const target = hypotheticalFr * (factors.get(index) ?? 0)
      if (target < track.base - GRID_FLEX_EPSILON) {
        frozen.add(index)
        newlyFrozen.push(index)
        continue
      }
      if (track.growthLimit !== Number.POSITIVE_INFINITY && target > track.growthLimit + GRID_FLEX_EPSILON) {
        track.base = track.growthLimit
        frozen.add(index)
        newlyFrozen.push(index)
      }
    }
    if (newlyFrozen.length === 0) {
      for (const index of active) {
        const track = tracks[index]
        const target = hypotheticalFr * (factors.get(index) ?? 0)
        if (track.growthLimit !== Number.POSITIVE_INFINITY && target >= track.growthLimit - GRID_FLEX_EPSILON) {
          track.base = track.growthLimit
          frozen.add(index)
        } else if (target > track.base) {
          track.base = target
        }
      }
      break
    }
    newlyFrozen.forEach((index) => active.delete(index))
  }

  const actual = actualSpace(tracks, space.px, gap)
  const consumed = tracks.reduce((sum, track, index) => sum + track.base - input.tracks.tracks[index].base, 0)
  return output(input.axis, input.tracks, tracks, space, initialFree, hypotheticalFr, consumed, actual.remaining, actual.overflow, factors, frozen)
}

/** Positional convenience form for the flexible sizing stage. */
export function expandFr(
  axis: GridAxis,
  tracks: ExpandedTracks,
  available: FlexAvailable,
  gap = 0,
  contributions: readonly GridIntrinsicContribution[] = [],
): Result {
  return resolveFlex({ axis, tracks, available, gap, contributions })
}

export const resolveFlexibleTracks = resolveFlex
export const flexTracks = resolveFlex
export const distributeFr = resolveFlex
