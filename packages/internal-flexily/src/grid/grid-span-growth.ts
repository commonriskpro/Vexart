/**
 * Intrinsic growth for spanning Grid items.
 *
 * Contributions are processed from the narrowest span to the widest span.
 * Each span contributes only the space still missing after the current bases
 * and gutters, and that space is distributed among eligible tracks without
 * exceeding their growth limits.  This stage never resolves the final `fr`
 * fraction or alignment.
 */

import type {
  ExpandedTracks,
  GridAxis,
  GridIntrinsicContribution,
  GridLayoutError,
  GridMinMax,
  GridTrackState,
} from "./grid-model"
import { createGridError } from "./grid-errors"

export const GRID_SPAN_TRACK_LIMIT = 1024

export type SpanGrowthInput = {
  readonly axis: GridAxis
  readonly tracks: ExpandedTracks
  readonly contributions: readonly GridIntrinsicContribution[]
  readonly gap?: number
}

export type SpanGrowthAllocation = {
  readonly nodeId: number
  readonly start: number
  readonly end: number
  readonly requested: number
  readonly allocated: number
  readonly tracks: ReadonlyMap<number, number>
}

export type SpanGrowthResult = {
  readonly axis: GridAxis
  readonly tracks: ExpandedTracks
  readonly frozen: readonly number[]
  readonly allocations: readonly SpanGrowthAllocation[]
}

type Result = SpanGrowthResult | GridLayoutError
type MutableTrack = GridTrackState & { base: number }
type Span = { readonly contribution: GridIntrinsicContribution; readonly index: number }

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

function intrinsic(value: unknown): boolean {
  return value === "auto" || value === "min-content" || value === "max-content"
}

function minmax(value: unknown): value is GridMinMax {
  return record(value) && Object.keys(value).length === 1 && Array.isArray(value.minmax) && value.minmax.length === 2
}

function fitContent(value: unknown): boolean {
  return record(value) && Object.keys(value).length === 1 && Object.prototype.hasOwnProperty.call(value, "fitContent")
}

function error(code: GridLayoutError["code"], path: string, nodeId: number): GridLayoutError {
  return createGridError(code, path, nodeId)
}

function isEligible(track: GridTrackState): boolean {
  const minimum = track.min
  if (intrinsic(minimum) || fitContent(minimum)) return true
  if (!minmax(minimum)) return false
  const min = minimum.minmax[0]
  const max = minimum.minmax[1]
  // A flexible maximum is eligible only when the minimum side is intrinsic;
  // direct fr tracks are left to G-022.
  if (isFr(min)) return false
  return intrinsic(min) || fitContent(min) || (isFr(max) && intrinsic(min))
}

function validateTrack(track: GridTrackState, path: string, nodeId: number): GridLayoutError | null {
  if (!track || typeof track !== "object") return error("GRID_INVALID_TRACK", path, nodeId)
  if (!nonNegative(track.base) || !nonNegative(track.offset)) return error("GRID_INVALID_TRACK", path, nodeId)
  if (track.growthLimit !== Number.POSITIVE_INFINITY && !nonNegative(track.growthLimit)) return error("GRID_INVALID_TRACK", path, nodeId)
  return null
}

function contributionDemand(contribution: GridIntrinsicContribution): number {
  return Math.max(contribution.minContent, contribution.minimum)
}

function sortSpans(contributions: readonly GridIntrinsicContribution[]): Span[] {
  return contributions
    .map((contribution, index) => ({ contribution, index }))
    .filter(({ contribution }) => contribution.end - contribution.start > 1)
    .sort((left, right) => {
      const leftSpan = left.contribution.end - left.contribution.start
      const rightSpan = right.contribution.end - right.contribution.start
      return leftSpan - rightSpan || left.index - right.index
    })
}

function distribute(
  tracks: MutableTrack[],
  candidates: readonly number[],
  extra: number,
  frozen: Set<number>,
): { readonly allocated: number; readonly values: ReadonlyMap<number, number> } {
  let remaining = extra
  const values = new Map<number, number>()
  let active = candidates.filter((index) => !frozen.has(index))
  while (remaining > 1e-9 && active.length > 0) {
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
        values.set(index, (values.get(index) ?? 0) + amount)
        allocated += amount
      }
      if (track.growthLimit === Number.POSITIVE_INFINITY || track.base < track.growthLimit - 1e-9) next.push(index)
      else frozen.add(index)
    }
    if (allocated <= 1e-9) break
    remaining -= allocated
    active = next
  }
  return { allocated: extra - remaining, values }
}

/** Distribute min-content growth from wider spans in increasing span order. */
export function distributeSpanGrowth(input: SpanGrowthInput): Result {
  const nodeId = 0
  if (!input || (input.axis !== "columns" && input.axis !== "rows") || !input.tracks || input.tracks.axis !== input.axis || !Array.isArray(input.tracks.tracks) || !Array.isArray(input.contributions)) {
    return error("GRID_INVALID_TRACK", "input", nodeId)
  }
  const gap = input.gap ?? 0
  if (!nonNegative(gap)) return error("GRID_INVALID_VALUE", "gap", nodeId)
  if (input.tracks.tracks.length > GRID_SPAN_TRACK_LIMIT || !Number.isInteger(input.tracks.explicitCount) || input.tracks.explicitCount < 0 || input.tracks.explicitCount > GRID_SPAN_TRACK_LIMIT) {
    return error("GRID_TRACK_LIMIT", input.axis, nodeId)
  }

  const tracks: MutableTrack[] = []
  for (let index = 0; index < input.tracks.tracks.length; index++) {
    const track = input.tracks.tracks[index]
    const invalid = validateTrack(track, `${input.axis}[${index}]`, nodeId)
    if (invalid) return invalid
    tracks.push({ ...track })
  }

  for (let index = 0; index < input.contributions.length; index++) {
    const contribution = input.contributions[index]
    if (!contribution || !Number.isInteger(contribution.nodeId) || contribution.axis !== input.axis || !Number.isInteger(contribution.start) || !Number.isInteger(contribution.end) || contribution.start < 0 || contribution.end <= contribution.start || contribution.end > tracks.length || !nonNegative(contribution.minContent) || !nonNegative(contribution.maxContent) || contribution.minContent > contribution.maxContent || !nonNegative(contribution.minimum) || !nonNegative(contribution.preferred)) {
      return error("GRID_INVALID_PLACEMENT", `contributions[${index}]`, contribution?.nodeId ?? nodeId)
    }
  }

  const frozen = new Set<number>()
  for (let index = 0; index < tracks.length; index++) {
    const track = tracks[index]
    if (track.growthLimit !== Number.POSITIVE_INFINITY && track.base >= track.growthLimit - 1e-9) frozen.add(index)
  }
  const allocations: SpanGrowthAllocation[] = []
  for (const { contribution } of sortSpans(input.contributions)) {
    const start = contribution.start
    const end = contribution.end
    const span = tracks.slice(start, end)
    const current = span.reduce((sum, track) => sum + track.base, 0) + Math.max(0, span.length - 1) * gap
    const demand = contributionDemand(contribution)
    const extra = Math.max(0, demand - current)
    const candidates = Array.from({ length: span.length }, (_, offset) => start + offset)
      .filter((index) => isEligible(tracks[index]) && !frozen.has(index))
    const allocation = distribute(tracks, candidates, extra, frozen)
    allocations.push(Object.freeze({
      nodeId: contribution.nodeId,
      start,
      end,
      requested: extra,
      allocated: allocation.allocated,
      tracks: new Map(allocation.values),
    }))
  }

  const outputTracks = tracks.map((track) => Object.freeze({ ...track }))
  return {
    axis: input.axis,
    tracks: { axis: input.tracks.axis, tracks: Object.freeze(outputTracks), explicitCount: input.tracks.explicitCount },
    frozen: Object.freeze([...frozen].sort((left, right) => left - right)),
    allocations: Object.freeze(allocations),
  }
}

/** Positional convenience form for callers with separate stage values. */
export function growSpans(
  axis: GridAxis,
  tracks: ExpandedTracks,
  contributions: readonly GridIntrinsicContribution[],
  gap = 0,
): Result {
  return distributeSpanGrowth({ axis, tracks, contributions, gap })
}

export const resolveSpanGrowth = distributeSpanGrowth
export const distributeSpans = distributeSpanGrowth
export const spanGrowth = distributeSpanGrowth
