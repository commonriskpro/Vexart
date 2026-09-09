/**
 * Apply the resolved min/max functions of Grid tracks.
 *
 * This is deliberately a sizing seam: it does not distribute free space,
 * resolve `fr`, or align tracks.  It only turns intrinsic and fixed limits
 * into a safe base/growth interval.  A finite percentage limit uses the
 * content-box available space; an indefinite percentage uses the matching
 * intrinsic contribution when one is available.
 */

import type {
  ExpandedTracks,
  GridAvailableSpace,
  GridAxis,
  GridIntrinsicContribution,
  GridIntrinsicSizes,
  GridLayoutError,
  GridMinMax,
  GridTrackSize,
  GridTrackState,
} from "./grid-model"
import { createGridError, isGridLayoutError } from "./grid-errors"

export const GRID_LIMITS_TRACK_LIMIT = 1024

type Available = GridAvailableSpace | number | {
  readonly available: GridAvailableSpace
  readonly contentBox?: number | null
}
type Result = GridLimitsResult | GridLayoutError

export type GridLimitsInput = {
  readonly axis: GridAxis
  readonly tracks: ExpandedTracks
  readonly available: Available
  readonly contributions?: readonly GridIntrinsicContribution[]
  readonly intrinsic?: number | GridIntrinsicSizes
  readonly intrinsicByTrack?: readonly (number | GridIntrinsicSizes | undefined)[]
  readonly gap?: number
  readonly nodeId?: number
  readonly [key: string]: unknown
}

export type GridTrackLimit = {
  readonly min: number
  readonly max: number
  readonly growthLimit: number
}

export type GridLimitsResult = {
  readonly axis: GridAxis
  readonly tracks: ExpandedTracks
  readonly available: GridAvailableSpace
  readonly limits: readonly GridTrackLimit[]
  readonly changed: boolean
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

function error(code: GridLayoutError["code"], path: string, nodeId: number): GridLayoutError {
  return createGridError(code, path, nodeId)
}

function exact(value: Record<string, unknown>, key: string): boolean {
  return Object.keys(value).length === 1 && Object.prototype.hasOwnProperty.call(value, key)
}

function percent(value: unknown): number | null {
  if (!record(value) || !exact(value, "percent") || !nonNegative(value.percent) || value.percent > 100) return null
  return value.percent
}

function fr(value: unknown): number | null {
  if (!record(value) || !exact(value, "fr") || !finite(value.fr) || value.fr <= 0) return null
  return value.fr
}

function minmax(value: unknown): value is GridMinMax {
  return record(value) && exact(value, "minmax") && Array.isArray(value.minmax) && value.minmax.length === 2
}

function fitContent(value: unknown): value is { readonly fitContent: number | { readonly percent: number } } {
  return record(value) && exact(value, "fitContent")
}

function knownString(value: unknown): boolean {
  return value === "auto" || value === "min-content" || value === "max-content"
}

function validSize(value: unknown, path: string, nodeId: number, allowFr: boolean): GridLayoutError | null {
  if (typeof value === "number") return nonNegative(value) ? null : error("GRID_INVALID_VALUE", path, nodeId)
  if (typeof value === "string") return knownString(value) ? null : error("GRID_INVALID_TRACK", path, nodeId)
  if (!record(value)) return error("GRID_INVALID_TRACK", path, nodeId)
  if (Object.prototype.hasOwnProperty.call(value, "percent")) {
    return percent(value) === null ? error("GRID_INVALID_VALUE", path, nodeId) : null
  }
  if (Object.prototype.hasOwnProperty.call(value, "fr")) {
    return allowFr && fr(value) !== null
      ? null
      : error("GRID_INVALID_VALUE", path, nodeId)
  }
  if (Object.prototype.hasOwnProperty.call(value, "minmax")) {
    if (!minmax(value)) return error("GRID_INVALID_TRACK", path, nodeId)
    const minimum = validSize(value.minmax[0], `${path}.minmax[0]`, nodeId, false)
    if (minimum) return minimum
    return validSize(value.minmax[1], `${path}.minmax[1]`, nodeId, true)
  }
  if (Object.prototype.hasOwnProperty.call(value, "fitContent")) {
    if (!fitContent(value)) return error("GRID_INVALID_TRACK", path, nodeId)
    const cap = value.fitContent
    if (nonNegative(cap)) return null
    return percent(cap) === null ? error("GRID_INVALID_VALUE", `${path}.fitContent`, nodeId) : null
  }
  return error("GRID_INVALID_TRACK", path, nodeId)
}

function resolveAvailable(value: unknown, path: string, nodeId: number): GridAvailableSpace | GridLayoutError {
  const candidate = record(value) && Object.prototype.hasOwnProperty.call(value, "available")
    ? value.available
    : value
  if (typeof candidate === "number") {
    return nonNegative(candidate)
      ? { kind: "definite", px: candidate }
      : error("GRID_INVALID_VALUE", path, nodeId)
  }
  if (!record(candidate)) return error("GRID_INVALID_VALUE", path, nodeId)
  if (candidate.kind === "definite" && nonNegative(candidate.px)) return { kind: "definite", px: candidate.px }
  if (candidate.kind === "indefinite" && (candidate.constraint === "min-content" || candidate.constraint === "max-content")) {
    return { kind: "indefinite", constraint: candidate.constraint }
  }
  return error("GRID_INVALID_VALUE", path, nodeId)
}

function intrinsicSizes(value: unknown): GridIntrinsicSizes | null {
  if (nonNegative(value)) return { minContent: value, maxContent: value, minimum: value, preferred: value }
  if (!record(value) || !nonNegative(value.minContent) || !nonNegative(value.maxContent) || value.minContent > value.maxContent) return null
  const minimum = nonNegative(value.minimum) ? value.minimum : value.minContent
  const preferred = nonNegative(value.preferred) ? value.preferred : value.maxContent
  return { minContent: value.minContent, maxContent: value.maxContent, minimum, preferred }
}

function contributionValue(
  index: number,
  space: GridAvailableSpace,
  input: GridLimitsInput,
): GridIntrinsicSizes | null {
  const direct = input.intrinsicByTrack?.[index]
  if (direct !== undefined) {
    return intrinsicSizes(direct)
  }
  const global = intrinsicSizes(input.intrinsic)
  if (global !== null) return global
  if (record(input.available) && Object.prototype.hasOwnProperty.call(input.available, "intrinsic")) {
    const carried = intrinsicSizes((input.available as Record<string, unknown>).intrinsic)
    if (carried !== null) return carried
  }
  const contributions = input.contributions ?? []
  let selected: GridIntrinsicSizes | null = null
  for (const contribution of contributions) {
    if (!contribution || contribution.axis !== input.axis || contribution.start !== index || contribution.end !== index + 1) continue
    const candidate = {
      minContent: contribution.minContent,
      maxContent: contribution.maxContent,
      minimum: contribution.minimum,
      preferred: contribution.preferred,
    }
    if (!selected || candidate.maxContent > selected.maxContent) selected = candidate
  }
  return selected
}

function percentValue(value: unknown, space: GridAvailableSpace, intrinsic: GridIntrinsicSizes | null): number | null {
  const size = percent(value)
  if (size === null) return null
  if (space.kind === "definite") return space.px * size / 100
  return intrinsic === null
    ? null
    : space.constraint === "min-content" ? intrinsic.minContent : intrinsic.maxContent
}

type Resolved = { readonly min: number | null; readonly max: number | null; readonly flexible: boolean }

function resolveValue(
  value: unknown,
  space: GridAvailableSpace,
  intrinsic: GridIntrinsicSizes | null,
  maximum: boolean,
): Resolved {
  if (nonNegative(value)) return { min: value, max: value, flexible: false }
  const percentage = percentValue(value, space, intrinsic)
  if (percentage !== null) return { min: percentage, max: percentage, flexible: false }
  if (fr(value) !== null) return { min: null, max: null, flexible: true }
  if (value === "min-content") {
    const size = intrinsic?.minContent ?? null
    return { min: size, max: maximum ? size : size, flexible: false }
  }
  if (value === "max-content") {
    const minimum = intrinsic === null ? null : Math.max(intrinsic.minContent, intrinsic.minimum)
    const maximumSize = intrinsic?.maxContent ?? null
    return { min: minimum, max: maximumSize, flexible: false }
  }
  if (value === "auto") {
    const minimum = intrinsic === null ? null : Math.max(intrinsic.minContent, intrinsic.minimum)
    const maximumSize = intrinsic?.maxContent ?? null
    return { min: minimum, max: maximumSize, flexible: false }
  }
  if (minmax(value)) {
    const minimum = resolveValue(value.minmax[0], space, intrinsic, false)
    const maximumSize = resolveValue(value.minmax[1], space, intrinsic, true)
    return {
      min: minimum.min,
      max: maximumSize.max,
      flexible: maximumSize.flexible,
    }
  }
  if (fitContent(value)) {
    const minimum = intrinsic === null ? null : Math.max(intrinsic.minContent, intrinsic.minimum)
    const cap = nonNegative(value.fitContent)
      ? value.fitContent
      : percentValue(value.fitContent, space, intrinsic)
    return { min: minimum, max: cap, flexible: false }
  }
  return { min: null, max: null, flexible: false }
}

function validTrack(track: GridTrackState, path: string, nodeId: number): GridLayoutError | null {
  if (!track || typeof track !== "object" || !nonNegative(track.base) || !nonNegative(track.offset)) return error("GRID_INVALID_TRACK", path, nodeId)
  if (track.growthLimit !== Number.POSITIVE_INFINITY && (!nonNegative(track.growthLimit) || track.growthLimit < track.base)) return error("GRID_INVALID_TRACK", path, nodeId)
  const minimum = validSize(track.min, `${path}.min`, nodeId, true)
  if (minimum) return minimum
  return validSize(track.max, `${path}.max`, nodeId, true)
}

function validContributions(
  contributions: readonly GridIntrinsicContribution[],
  axis: GridAxis,
  count: number,
  nodeId: number,
): GridLayoutError | null {
  for (let index = 0; index < contributions.length; index++) {
    const value = contributions[index]
    if (!value || value.axis !== axis || !Number.isInteger(value.nodeId) || !Number.isInteger(value.start) || !Number.isInteger(value.end) || value.start < 0 || value.end <= value.start || value.end > count || !nonNegative(value.minContent) || !nonNegative(value.maxContent) || value.minContent > value.maxContent || !nonNegative(value.minimum) || !nonNegative(value.preferred)) {
      return error("GRID_INVALID_PLACEMENT", `contributions[${index}]`, value?.nodeId ?? nodeId)
    }
  }
  return null
}

/** Apply intrinsic, minmax, and fit-content limits without mutating input. */
export function applyTrackLimits(input: GridLimitsInput): Result {
  const nodeId = input?.nodeId ?? 0
  if (!input || (input.axis !== "columns" && input.axis !== "rows") || !input.tracks || input.tracks.axis !== input.axis || !Array.isArray(input.tracks.tracks)) return error("GRID_INVALID_TRACK", "input", nodeId)
  if (input.tracks.tracks.length > GRID_LIMITS_TRACK_LIMIT || !Number.isInteger(input.tracks.explicitCount) || input.tracks.explicitCount < 0 || input.tracks.explicitCount > GRID_LIMITS_TRACK_LIMIT) return error("GRID_TRACK_LIMIT", input.axis, nodeId)
  const space = resolveAvailable(input.available, "available", nodeId)
  if (isGridLayoutError(space)) return space
  const gap = input.gap ?? 0
  if (!nonNegative(gap)) return error("GRID_INVALID_VALUE", "gap", nodeId)
  const contributions = input.contributions ?? []
  const contributionError = validContributions(contributions, input.axis, input.tracks.tracks.length, nodeId)
  if (contributionError) return contributionError

  const tracks: GridTrackState[] = []
  const limits: GridTrackLimit[] = []
  let changed = false
  for (let index = 0; index < input.tracks.tracks.length; index++) {
    const source = input.tracks.tracks[index]
    const invalid = validTrack(source, `${input.axis}[${index}]`, nodeId)
    if (invalid) return invalid
    const intrinsic = contributionValue(index, space, input)
    const minimum = resolveValue(source.min, space, intrinsic, false)
    const maximum = resolveValue(source.max, space, intrinsic, true)
    let min = minimum.min ?? 0
    let max = maximum.max
    if (!finite(min) || min < 0) return error("GRID_INVALID_VALUE", `${input.axis}[${index}].min`, nodeId)
    if (max !== null && (!finite(max) || max < 0)) return error("GRID_INVALID_VALUE", `${input.axis}[${index}].max`, nodeId)
    // CSS Grid's max<min rule makes the minimum the effective maximum.
    if (max !== null && max < min) max = min
    let base = Math.max(source.base, min)
    let growthLimit = source.growthLimit
    if (max !== null) growthLimit = Math.max(base, max)
    // A flexible maximum remains open for the later fr phase.  An unresolved
    // intrinsic keyword keeps the prior stage's finite limit, if any.
    if (maximum.flexible) growthLimit = source.growthLimit
    if (!finite(base) || base < 0 || (!finite(growthLimit) && growthLimit !== Number.POSITIVE_INFINITY) || (finite(growthLimit) && growthLimit < base)) {
      return error("GRID_INVALID_TRACK", `${input.axis}[${index}]`, nodeId)
    }
    const output = Object.freeze({ ...source, base, growthLimit })
    tracks.push(output)
    limits.push(Object.freeze({ min, max: max ?? Number.POSITIVE_INFINITY, growthLimit }))
    if (base !== source.base || growthLimit !== source.growthLimit) changed = true
  }
  return {
    axis: input.axis,
    tracks: { axis: input.tracks.axis, tracks: Object.freeze(tracks), explicitCount: input.tracks.explicitCount },
    available: space,
    limits: Object.freeze(limits),
    changed,
  }
}

/** Return only the bounded track state for a sizing pipeline. */
export function limitedTracks(input: GridLimitsInput): ExpandedTracks | GridLayoutError {
  const result = applyTrackLimits(input)
  return isGridLayoutError(result) ? result : result.tracks
}

/** Positional convenience form used by sizing callers. */
export function applyLimits(
  axis: GridAxis,
  tracks: ExpandedTracks,
  available: Available,
  contributions: readonly GridIntrinsicContribution[] = [],
  gap = 0,
): Result {
  return applyTrackLimits({ axis, tracks, available, contributions, gap })
}

export const resolveLimits = applyTrackLimits
export const resolveTrackLimits = applyTrackLimits
export const resolveLimitedTracks = limitedTracks
export const limitTracks = applyTrackLimits
export const applyGridLimits = applyTrackLimits
export const resolveGridLimits = applyTrackLimits
