/**
 * Resolve the space that is available to Grid sizing functions.
 *
 * This seam deliberately keeps the content box separate from its gutters.  A
 * percentage is resolved from the content box; the gap is only deducted when
 * calculating the budget left for tracks.  This distinction is observable
 * for, for example, two 50% columns with a gap: each column is 150px in a
 * 300px content box and the ten pixel gap causes the expected overflow.
 */

import type {
  ExpandedTracks,
  GridAvailableSpace,
  GridAxis,
  GridIntrinsicContribution,
  GridIntrinsicSizes,
  GridLayoutError,
  GridPercent,
  GridTrackState,
} from "./grid-model"
import { createGridError, isGridLayoutError } from "./grid-errors"

export const GRID_AVAILABLE_TRACK_LIMIT = 1024

type Numeric = number | undefined
type SpaceValue = GridAvailableSpace | number | undefined

/** A pair of leading/trailing edges for one axis. */
export type GridAxisEdges =
  | number
  | readonly [number, number]
  | {
      readonly start?: number
      readonly end?: number
      readonly before?: number
      readonly after?: number
      readonly inlineStart?: number
      readonly inlineEnd?: number
      readonly blockStart?: number
      readonly blockEnd?: number
      readonly left?: number
      readonly right?: number
      readonly top?: number
      readonly bottom?: number
    }

/**
 * Inputs accepted by `resolveAvailableSpace`.
 *
 * `container`, `outer`, and `available` are aliases because the sizing seam
 * is used both before and after Flexily has selected a container size.  The
 * index signature is intentional: callers may carry unrelated layout fields
 * in a snapshot without first allocating a translated object.
 */
export type GridAvailableSpaceInput = {
  readonly axis?: GridAxis
  readonly available?: SpaceValue
  readonly container?: SpaceValue
  readonly outer?: SpaceValue
  readonly outerSize?: SpaceValue
  readonly containerSize?: SpaceValue
  readonly availableSize?: SpaceValue
  readonly size?: SpaceValue
  readonly width?: SpaceValue
  readonly height?: SpaceValue
  readonly padding?: GridAxisEdges
  readonly border?: GridAxisEdges
  readonly paddingStart?: Numeric
  readonly paddingEnd?: Numeric
  readonly borderStart?: Numeric
  readonly borderEnd?: Numeric
  readonly paddingInline?: GridAxisEdges
  readonly paddingBlock?: GridAxisEdges
  readonly paddingLeft?: Numeric
  readonly paddingRight?: Numeric
  readonly paddingTop?: Numeric
  readonly paddingBottom?: Numeric
  readonly borderInline?: GridAxisEdges
  readonly borderBlock?: GridAxisEdges
  readonly borderLeft?: Numeric
  readonly borderRight?: Numeric
  readonly borderTop?: Numeric
  readonly borderBottom?: Numeric
  readonly gap?: Numeric
  readonly trackCount?: Numeric
  readonly min?: Numeric
  readonly max?: Numeric
  readonly minSize?: Numeric
  readonly maxSize?: Numeric
  readonly containerMin?: Numeric
  readonly containerMax?: Numeric
  readonly minWidth?: Numeric
  readonly maxWidth?: Numeric
  readonly minHeight?: Numeric
  readonly maxHeight?: Numeric
  readonly minContent?: Numeric
  readonly maxContent?: Numeric
  readonly intrinsic?: Numeric | GridIntrinsicSizes
  readonly contribution?: Numeric | GridIntrinsicSizes
  readonly intrinsicContribution?: Numeric | GridIntrinsicSizes
  readonly [key: string]: unknown
}

/** Result of resolving the outer size, content box, and gutter budget. */
export type GridAvailableSpaceResult = {
  readonly axis: GridAxis
  /** Content-box space used by percentage sizing functions. */
  readonly available: GridAvailableSpace
  readonly contentBox: number | null
  /** Content-box space less gutters, floored at zero. */
  readonly trackSpace: number | null
  readonly outerSize: number | null
  readonly origin: number
  readonly paddingStart: number
  readonly paddingEnd: number
  readonly borderStart: number
  readonly borderEnd: number
  readonly padding: number
  readonly border: number
  readonly gap: number
  readonly gutter: number
  readonly overflow: number
  readonly intrinsic: number | null
  readonly minSize: number | null
  readonly maxSize: number | null
}

/** Inputs for resolving percent sizing functions on initialized tracks. */
export type GridPercentageInput = {
  readonly axis?: GridAxis
  readonly tracks: ExpandedTracks
  readonly available: GridAvailableSpace | GridAvailableSpaceResult | number | GridAvailableSpaceInput
  readonly gap?: number
  readonly intrinsic?: number | GridIntrinsicSizes
  readonly contribution?: number | GridIntrinsicSizes
  readonly intrinsicContribution?: number | GridIntrinsicSizes
  readonly intrinsicByTrack?: readonly number[]
  readonly contributions?: readonly GridIntrinsicContribution[]
  readonly nodeId?: number
  readonly [key: string]: unknown
}

/** Result of resolving percentages on an axis without mutating the source. */
export type GridPercentageResult = GridAvailableSpaceResult & {
  readonly tracks: ExpandedTracks
  readonly unresolved: readonly number[]
  readonly changed: boolean
  readonly pass: 1
}

type Pair = { readonly start: number; readonly end: number }
type Constraint = "min-content" | "max-content"

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

function constraintOf(value: GridAvailableSpace): Constraint {
  return value.kind === "indefinite" && value.constraint === "min-content"
    ? "min-content"
    : "max-content"
}

function availableOf(value: unknown, path: string, nodeId: number): GridAvailableSpace | GridLayoutError {
  if (value === undefined) return { kind: "indefinite", constraint: "max-content" }
  if (typeof value === "number") {
    return nonNegative(value)
      ? { kind: "definite", px: value }
      : error("GRID_INVALID_VALUE", path, nodeId)
  }
  if (!record(value)) return error("GRID_INVALID_VALUE", path, nodeId)
  if (value.kind === "definite" && nonNegative(value.px)) return { kind: "definite", px: value.px }
  if (value.kind === "indefinite" && (value.constraint === "min-content" || value.constraint === "max-content")) {
    return { kind: "indefinite", constraint: value.constraint }
  }
  return error("GRID_INVALID_VALUE", path, nodeId)
}

function edgeValue(value: unknown, key: string, path: string, nodeId: number): number | GridLayoutError {
  if (value === undefined) return 0
  return nonNegative(value) ? value : error("GRID_INVALID_VALUE", `${path}.${key}`, nodeId)
}

function edgePair(
  value: unknown,
  axis: GridAxis,
  path: string,
  nodeId: number,
): Pair | GridLayoutError {
  if (value === undefined) return { start: 0, end: 0 }
  if (typeof value === "number") {
    if (!nonNegative(value)) return error("GRID_INVALID_VALUE", path, nodeId)
    return { start: value, end: value }
  }
  if (Array.isArray(value)) {
    if (value.length !== 2) return error("GRID_INVALID_VALUE", path, nodeId)
    const start = edgeValue(value[0], "0", path, nodeId)
    if (isGridLayoutError(start)) return start
    const end = edgeValue(value[1], "1", path, nodeId)
    if (isGridLayoutError(end)) return end
    return { start, end }
  }
  if (!record(value)) return error("GRID_INVALID_VALUE", path, nodeId)

  const startKey = axis === "columns"
    ? ["start", "inlineStart", "left", "before"]
    : ["start", "blockStart", "top", "before"]
  const endKey = axis === "columns"
    ? ["end", "inlineEnd", "right", "after"]
    : ["end", "blockEnd", "bottom", "after"]
  const pick = (keys: readonly string[]): unknown => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) return value[key]
    }
    return undefined
  }
  const start = edgeValue(pick(startKey), "start", path, nodeId)
  if (isGridLayoutError(start)) return start
  const end = edgeValue(pick(endKey), "end", path, nodeId)
  if (isGridLayoutError(end)) return end
  return { start, end }
}

function sourceOf(input: GridAvailableSpaceInput, axis: GridAxis): unknown {
  const keys = axis === "columns"
    ? ["available", "container", "outer", "outerSize", "containerSize", "availableSize", "size", "width"]
    : ["available", "container", "outer", "outerSize", "containerSize", "availableSize", "size", "height"]
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) return input[key]
  }
  return undefined
}

function pickNumber(input: GridAvailableSpaceInput, keys: readonly string[], path: string, nodeId: number): number | null | GridLayoutError {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(input, key) || input[key] === undefined) continue
    if (!nonNegative(input[key])) return error("GRID_INVALID_VALUE", `${path}.${key}`, nodeId)
    return input[key]
  }
  return null
}

function intrinsicValue(
  input: GridAvailableSpaceInput,
  constraint: Constraint,
  path: string,
  nodeId: number,
): number | null | GridLayoutError {
  const candidate = input.intrinsic ?? input.contribution ?? input.intrinsicContribution
  if (candidate !== undefined) {
    if (nonNegative(candidate)) return candidate
    if (record(candidate)) {
      const key = constraint === "min-content" ? "minContent" : "maxContent"
      if (!nonNegative(candidate[key])) return error("GRID_MEASURE_INVALID", `${path}.${key}`, nodeId)
      return candidate[key]
    }
    return error("GRID_MEASURE_INVALID", `${path}.intrinsic`, nodeId)
  }
  const key = constraint === "min-content" ? "minContent" : "maxContent"
  const value = input[key]
  if (value === undefined) return null
  return nonNegative(value) ? value : error("GRID_MEASURE_INVALID", `${path}.${key}`, nodeId)
}

function containerConstraint(
  input: GridAvailableSpaceInput,
  axis: GridAxis,
  which: "min" | "max",
  path: string,
  nodeId: number,
): number | null | GridLayoutError {
  const keys = which === "min"
    ? axis === "columns"
      ? ["min", "minSize", "containerMin", "minWidth"]
      : ["min", "minSize", "containerMin", "minHeight"]
    : axis === "columns"
      ? ["max", "maxSize", "containerMax", "maxWidth"]
      : ["max", "maxSize", "containerMax", "maxHeight"]
  return pickNumber(input, keys, path, nodeId)
}

function axisEdges(
  input: GridAvailableSpaceInput,
  axis: GridAxis,
  kind: "padding" | "border",
  positional: unknown,
  path: string,
  nodeId: number,
): Pair | GridLayoutError {
  const direct = kind === "padding" ? input.padding : input.border
  const axisSpecific = axis === "columns"
    ? kind === "padding" ? input.paddingInline : input.borderInline
    : kind === "padding" ? input.paddingBlock : input.borderBlock
  const value = direct ?? axisSpecific ?? positional
  const parsed = edgePair(value, axis, path, nodeId)
  if (isGridLayoutError(parsed)) return parsed

  const start = axis === "columns"
    ? kind === "padding" ? input.paddingLeft ?? input.paddingStart : input.borderLeft ?? input.borderStart
    : kind === "padding" ? input.paddingTop ?? input.paddingStart : input.borderTop ?? input.borderStart
  const end = axis === "columns"
    ? kind === "padding" ? input.paddingRight ?? input.paddingEnd : input.borderRight ?? input.borderEnd
    : kind === "padding" ? input.paddingBottom ?? input.paddingEnd : input.borderBottom ?? input.borderEnd
  if (start === undefined && end === undefined) return parsed
  const parsedStart = edgeValue(start, "start", path, nodeId)
  if (isGridLayoutError(parsedStart)) return parsedStart
  const parsedEnd = edgeValue(end, "end", path, nodeId)
  if (isGridLayoutError(parsedEnd)) return parsedEnd
  return {
    start: start === undefined ? parsed.start : parsedStart,
    end: end === undefined ? parsed.end : parsedEnd,
  }
}

function tracksCount(input: GridAvailableSpaceInput, path: string, nodeId: number): number | GridLayoutError {
  if (input.trackCount !== undefined) {
    if (!Number.isInteger(input.trackCount) || !nonNegative(input.trackCount) || input.trackCount > GRID_AVAILABLE_TRACK_LIMIT) {
      return error("GRID_INVALID_VALUE", `${path}.trackCount`, nodeId)
    }
    return input.trackCount
  }
  if (Array.isArray(input.tracks)) return input.tracks.length
  return 0
}

/**
 * Resolve a container's content-box space.  The function is pure, so a new
 * viewport/container size naturally produces a new result (and never a stale
 * percentage from a previous calculation).
 */
export function resolveAvailableSpace(
  input: GridAvailableSpaceInput | GridAvailableSpace | number = {},
  padding?: GridAxisEdges,
  border?: GridAxisEdges,
  gap = 0,
  nodeId = 0,
): GridAvailableSpaceResult | GridLayoutError {
  const objectInput: GridAvailableSpaceInput = record(input) && !Object.prototype.hasOwnProperty.call(input, "kind")
    ? input as GridAvailableSpaceInput
    : { available: input as SpaceValue }
  const axis = objectInput.axis === undefined ? "columns" : objectInput.axis
  if (axis !== "columns" && axis !== "rows") return error("GRID_INVALID_VALUE", "axis", nodeId)
  const source = sourceOf(objectInput, axis)
  const outer = availableOf(source, "available", nodeId)
  if (isGridLayoutError(outer)) return outer
  const constraint = constraintOf(outer)
  const intrinsic = intrinsicValue(objectInput, constraint, "intrinsic", nodeId)
  if (isGridLayoutError(intrinsic)) return intrinsic

  const minSize = containerConstraint(objectInput, axis, "min", "container", nodeId)
  if (isGridLayoutError(minSize)) return minSize
  const maxSize = containerConstraint(objectInput, axis, "max", "container", nodeId)
  if (isGridLayoutError(maxSize)) return maxSize
  // A contradictory pair is normalized to the minimum, never to Infinity.
  const effectiveMax = minSize !== null && maxSize !== null && maxSize < minSize ? minSize : maxSize

  const paddingEdges = axisEdges(objectInput, axis, "padding", padding, "padding", nodeId)
  if (isGridLayoutError(paddingEdges)) return paddingEdges
  const borderEdges = axisEdges(objectInput, axis, "border", border, "border", nodeId)
  if (isGridLayoutError(borderEdges)) return borderEdges
  const resolvedGap = objectInput.gap === undefined ? gap : objectInput.gap
  if (!nonNegative(resolvedGap)) return error("GRID_INVALID_VALUE", "gap", nodeId)

  const paddingTotal = paddingEdges.start + paddingEdges.end
  const borderTotal = borderEdges.start + borderEdges.end
  const origin = paddingEdges.start + borderEdges.start
  const count = tracksCount(objectInput, "available", nodeId)
  if (isGridLayoutError(count)) return count
  const gutter = Math.max(0, count - 1) * resolvedGap
  if (!finite(gutter)) return error("GRID_INVALID_VALUE", "gap", nodeId)

  let outerSize: number | null = null
  let contentBox: number | null = null
  if (outer.kind === "definite") {
    let size = outer.px
    if (minSize !== null) size = Math.max(size, minSize)
    if (effectiveMax !== null) size = Math.min(size, effectiveMax)
    outerSize = size
    contentBox = Math.max(0, size - paddingTotal - borderTotal)
  } else if (intrinsic !== null) {
    // Keep the axis semantically indefinite.  The intrinsic value is retained
    // for percentage fallback rather than being invented as a viewport size.
    let size = intrinsic + paddingTotal + borderTotal
    if (minSize !== null) size = Math.max(size, minSize)
    if (effectiveMax !== null) size = Math.min(size, effectiveMax)
    outerSize = size
    contentBox = Math.max(0, size - paddingTotal - borderTotal)
  }

  const trackSpace = contentBox === null ? null : Math.max(0, contentBox - gutter)
  const overflow = contentBox === null ? 0 : Math.max(0, gutter - contentBox)
  return Object.freeze({
    axis,
    available: outer.kind === "definite"
      ? { kind: "definite", px: contentBox ?? 0 } as GridAvailableSpace
      : outer,
    contentBox,
    trackSpace,
    outerSize,
    origin,
    paddingStart: paddingEdges.start,
    paddingEnd: paddingEdges.end,
    borderStart: borderEdges.start,
    borderEnd: borderEdges.end,
    padding: paddingTotal,
    border: borderTotal,
    gap: resolvedGap,
    gutter,
    overflow,
    intrinsic,
    minSize,
    maxSize: effectiveMax,
  })
}

function intrinsicFromValue(value: unknown, constraint: Constraint): number | null {
  if (value === undefined) return null
  if (nonNegative(value)) return value
  if (!record(value)) return null
  const key = constraint === "min-content" ? "minContent" : "maxContent"
  return nonNegative(value[key]) ? value[key] : null
}

function percentOf(value: unknown): number | null {
  if (!record(value) || Object.keys(value).length !== 1 || !nonNegative(value.percent) || value.percent > 100) return null
  return value.percent
}

/**
 * Resolve one percentage.  On an indefinite axis the whole intrinsic
 * contribution is used, as prescribed by the Grid intrinsic fallback; the
 * percentage is not multiplied by an invented viewport or replaced by zero.
 */
export function resolvePercentage(
  value: GridPercent | number,
  available: GridAvailableSpace | GridAvailableSpaceResult | number,
  intrinsic?: number | GridIntrinsicSizes,
): number | null | GridLayoutError {
  const percent = typeof value === "number" ? value : percentOf(value)
  if (percent === null || percent === undefined || !nonNegative(percent) || percent > 100) return error("GRID_INVALID_VALUE", "percent", 0)
  const hasResult = record(available)
    && Object.prototype.hasOwnProperty.call(available, "contentBox")
    && Object.prototype.hasOwnProperty.call(available, "available")
  const result = hasResult ? available as GridAvailableSpaceResult : null
  const space = result?.available ?? availableOf(available, "available", 0)
  if (isGridLayoutError(space)) return space
  if (space.kind === "definite") {
    const resolved = space.px * percent / 100
    return finite(resolved) ? resolved : error("GRID_INVALID_VALUE", "percent", 0)
  }
  return intrinsicFromValue(intrinsic ?? result?.intrinsic, space.constraint)
}

function hasPercent(value: unknown): boolean {
  if (percentOf(value) !== null) return true
  if (!record(value)) return false
  if (Array.isArray(value.minmax)) return hasPercent(value.minmax[0]) || hasPercent(value.minmax[1])
  if (Object.prototype.hasOwnProperty.call(value, "fitContent")) return hasPercent(value.fitContent)
  return false
}

function resolveSizing(
  value: unknown,
  space: GridAvailableSpace,
  fallback: number | null,
): number | null {
  if (nonNegative(value)) return value
  const percent = percentOf(value)
  if (percent !== null) {
    if (space.kind === "definite") return space.px * percent / 100
    return fallback
  }
  if (!record(value)) return null
  if (Array.isArray(value.minmax)) return resolveSizing(value.minmax[0], space, fallback)
  if (Object.prototype.hasOwnProperty.call(value, "fitContent")) {
    return resolveSizing(value.fitContent, space, fallback)
  }
  return null
}

function resolveMaximum(
  value: unknown,
  space: GridAvailableSpace,
  fallback: number | null,
): number | null {
  if (nonNegative(value)) return value
  const percent = percentOf(value)
  if (percent !== null) {
    if (space.kind === "definite") return space.px * percent / 100
    return fallback
  }
  if (!record(value)) return null
  if (Array.isArray(value.minmax)) return resolveMaximum(value.minmax[1], space, fallback)
  if (Object.prototype.hasOwnProperty.call(value, "fitContent")) return resolveMaximum(value.fitContent, space, fallback)
  return null
}

function contributionFor(
  index: number,
  axis: GridAxis,
  constraint: Constraint,
  input: GridPercentageInput,
  result: GridAvailableSpaceResult,
): number | null {
  const direct = input.intrinsicByTrack?.[index]
  if (nonNegative(direct)) return direct
  const global = intrinsicFromValue(input.intrinsic ?? input.contribution ?? input.intrinsicContribution, constraint)
  if (global !== null) return global
  const entries = input.contributions ?? []
  let value: number | null = null
  for (const contribution of entries) {
    if (!contribution || contribution.axis !== axis || contribution.start !== index || contribution.end !== index + 1) continue
    const candidate = constraint === "min-content" ? contribution.minContent : contribution.maxContent
    if (nonNegative(candidate)) value = value === null ? candidate : Math.max(value, candidate)
  }
  if (value !== null) return value
  return result.intrinsic
}

function availableResult(
  value: GridAvailableSpace | GridAvailableSpaceResult | number | GridAvailableSpaceInput,
  axis: GridAxis,
  gap: number | undefined,
  nodeId: number,
): GridAvailableSpaceResult | GridLayoutError {
  if (record(value) && Object.prototype.hasOwnProperty.call(value, "contentBox") && Object.prototype.hasOwnProperty.call(value, "available")) {
    const result = value as GridAvailableSpaceResult
    if (result.axis !== axis || !finite(result.gutter) || !nonNegative(result.gutter)) return error("GRID_INVALID_VALUE", "available", nodeId)
    return result
  }
  if (record(value) && !Object.prototype.hasOwnProperty.call(value, "kind")) {
    const input = value as GridAvailableSpaceInput
    return resolveAvailableSpace({ ...input, axis, gap: gap ?? input.gap }, undefined, undefined, gap ?? input.gap ?? 0, nodeId)
  }
  return resolveAvailableSpace({ axis, available: value as SpaceValue, gap }, undefined, undefined, gap ?? 0, nodeId)
}

/** Resolve all percentage sizing functions on one initialized axis. */
export function resolvePercentageTracks(input: GridPercentageInput): ExpandedTracks | GridLayoutError {
  const result = resolvePercentages(input)
  if (isGridLayoutError(result)) return result
  return result.tracks
}

/**
 * Resolve percentages and publish the available-space accounting used by the
 * following sizing stages.  Source track state and contributions are never
 * mutated, which also makes viewport resize recalculation deterministic.
 */
export function resolvePercentages(input: GridPercentageInput): GridPercentageResult | GridLayoutError
export function resolvePercentages(
  axis: GridAxis,
  tracks: ExpandedTracks,
  available: GridAvailableSpace | GridAvailableSpaceResult | number | GridAvailableSpaceInput,
  intrinsic?: number | GridIntrinsicSizes,
  gap?: number,
): GridPercentageResult | GridLayoutError
export function resolvePercentages(
  inputOrAxis: GridPercentageInput | GridAxis,
  sourceTracks?: ExpandedTracks,
  sourceAvailable?: GridAvailableSpace | GridAvailableSpaceResult | number | GridAvailableSpaceInput,
  sourceIntrinsic?: number | GridIntrinsicSizes,
  sourceGap = 0,
): GridPercentageResult | GridLayoutError {
  const input: GridPercentageInput = typeof inputOrAxis === "string"
    ? { axis: inputOrAxis, tracks: sourceTracks as ExpandedTracks, available: sourceAvailable as GridAvailableSpace, intrinsic: sourceIntrinsic, gap: sourceGap }
    : inputOrAxis
  const nodeId = input.nodeId ?? 0
  const axis = input.axis ?? input.tracks?.axis
  if (axis !== "columns" && axis !== "rows") return error("GRID_INVALID_TRACK", "axis", nodeId)
  if (!input.tracks || input.tracks.axis !== axis || !Array.isArray(input.tracks.tracks)) return error("GRID_INVALID_TRACK", "tracks", nodeId)
  if (input.tracks.tracks.length > GRID_AVAILABLE_TRACK_LIMIT || !Number.isInteger(input.tracks.explicitCount) || input.tracks.explicitCount < 0 || input.tracks.explicitCount > GRID_AVAILABLE_TRACK_LIMIT) {
    return error("GRID_TRACK_LIMIT", axis, nodeId)
  }
  const available = availableResult(input.available, axis, input.gap, nodeId)
  if (isGridLayoutError(available)) return available
  const space = available.available
  const constraint = constraintOf(space)
  const tracks: GridTrackState[] = []
  const unresolved: number[] = []
  let changed = false
  for (let index = 0; index < input.tracks.tracks.length; index++) {
    const source = input.tracks.tracks[index]
    if (!source || typeof source !== "object" || !nonNegative(source.base) || !nonNegative(source.offset) || source.growthLimit < 0 || (!finite(source.growthLimit) && source.growthLimit !== Number.POSITIVE_INFINITY)) {
      return error("GRID_INVALID_TRACK", `${axis}[${index}]`, nodeId)
    }
    const percent = hasPercent(source.min) || hasPercent(source.max)
    if (!percent) {
      tracks.push(Object.freeze({ ...source }))
      continue
    }
    const intrinsic = contributionFor(index, axis, constraint, input, available)
    const minimum = resolveSizing(source.min, space, intrinsic)
    const maximum = resolveMaximum(source.max, space, intrinsic)
    let base = source.base
    if (minimum !== null) base = Math.max(base, minimum)
    let growthLimit = maximum ?? source.growthLimit
    if (maximum !== null) growthLimit = Math.max(base, maximum)
    if (space.kind === "indefinite" && minimum === null && maximum === null) unresolved.push(index)
    if (space.kind === "indefinite" && intrinsic !== null && maximum === null && growthLimit === Number.POSITIVE_INFINITY) growthLimit = base
    if (!finite(base) || !nonNegative(base) || (!finite(growthLimit) && growthLimit !== Number.POSITIVE_INFINITY)) {
      return error("GRID_INVALID_VALUE", `${axis}[${index}]`, nodeId)
    }
    if (base !== source.base || growthLimit !== source.growthLimit) changed = true
    tracks.push(Object.freeze({ ...source, base, growthLimit }))
  }
  const outputTracks: ExpandedTracks = {
    axis,
    tracks: Object.freeze(tracks),
    explicitCount: input.tracks.explicitCount,
  }
  return Object.freeze({ ...available, tracks: outputTracks, unresolved: Object.freeze(unresolved), changed, pass: 1 as const })
}

export const resolveGridAvailableSpace = resolveAvailableSpace
export const calculateAvailableSpace = resolveAvailableSpace
export const availableSpace = resolveAvailableSpace
export const resolveAvailable = resolveAvailableSpace
export const resolvePercent = resolvePercentage
export const resolvePercentValue = resolvePercentage
export const resolvePercentTrack = resolvePercentageTracks
export const resolveTrackPercentages = resolvePercentageTracks
export const resolveGridPercentages = resolvePercentages
export const resolvePercentageSizes = resolvePercentages
