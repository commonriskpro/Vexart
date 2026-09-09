/**
 * Resolve Grid item areas and local rectangles.
 *
 * This stage consumes the aligned track geometry.  It deliberately has no
 * Node/writeback or transform knowledge: the result is a list of local
 * `GridResolvedRect` values for the later compositor seam.
 */

import type {
  AxisSizingResult,
  ExpandedTracks,
  GridItemAlignment,
  GridItemStyle,
  GridLayoutError,
  GridResolvedPlacement,
  GridResolvedRect,
} from "./grid-model"
import { createGridError, isGridLayoutError } from "./grid-errors"

export const GRID_ITEM_SIZE_LIMIT = 1024
export const GRID_ITEM_SIZE_EPSILON = 1e-6

export type GridItemDimension =
  | number
  | { readonly percent: number }
  | { readonly fitContent: number | { readonly percent: number } }
  | { readonly value: number; readonly unit: number | string }
  | "auto"
  | "fit"
  | "fit-content"
  | "grow"
  | "min-content"
  | "max-content"

export type GridItemEdge = number | { readonly percent: number } | { readonly value: number; readonly unit: number | string }
export type GridItemEdges =
  | GridItemEdge
  | readonly [GridItemEdge, GridItemEdge, GridItemEdge, GridItemEdge]
  | {
      readonly top?: GridItemEdge
      readonly right?: GridItemEdge
      readonly bottom?: GridItemEdge
      readonly left?: GridItemEdge
      readonly inlineStart?: GridItemEdge
      readonly inlineEnd?: GridItemEdge
      readonly blockStart?: GridItemEdge
      readonly blockEnd?: GridItemEdge
      readonly start?: GridItemEdge
      readonly end?: GridItemEdge
    }

export type GridItemIntrinsic = {
  readonly width?: number
  readonly height?: number
  readonly minWidth?: number
  readonly maxWidth?: number
  readonly minHeight?: number
  readonly maxHeight?: number
  readonly minContentWidth?: number
  readonly maxContentWidth?: number
  readonly minContentHeight?: number
  readonly maxContentHeight?: number
  readonly minContent?: number
  readonly maxContent?: number
  readonly minimum?: number
  readonly preferred?: number
}

/** Item properties used by this internal sizing stage. */
export type GridItemSizeStyle = GridItemStyle & {
  readonly width?: GridItemDimension
  readonly height?: GridItemDimension
  readonly minWidth?: GridItemDimension
  readonly maxWidth?: GridItemDimension
  readonly minHeight?: GridItemDimension
  readonly maxHeight?: GridItemDimension
  readonly margin?: GridItemEdges
  readonly padding?: GridItemEdges
  readonly border?: GridItemEdges
  readonly marginTop?: GridItemEdge
  readonly marginRight?: GridItemEdge
  readonly marginBottom?: GridItemEdge
  readonly marginLeft?: GridItemEdge
  readonly paddingTop?: GridItemEdge
  readonly paddingRight?: GridItemEdge
  readonly paddingBottom?: GridItemEdge
  readonly paddingLeft?: GridItemEdge
  readonly borderTop?: GridItemEdge
  readonly borderRight?: GridItemEdge
  readonly borderBottom?: GridItemEdge
  readonly borderLeft?: GridItemEdge
  readonly [key: string]: unknown
}

export type GridItemSizingEntry = {
  readonly nodeId?: number
  readonly placement?: GridResolvedPlacement
  readonly style?: GridItemSizeStyle
  readonly intrinsic?: GridItemIntrinsic | number
  readonly measure?: GridItemIntrinsic | number
  readonly kind?: "box" | "text" | "img" | "canvas" | string
  readonly [key: string]: unknown
}

export type GridItemArea = {
  readonly nodeId: number
  readonly rowStart: number
  readonly rowEnd: number
  readonly columnStart: number
  readonly columnEnd: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type GridItemSizeInput = {
  readonly rows: AxisSizingResult | ExpandedTracks
  readonly columns: AxisSizingResult | ExpandedTracks
  readonly items?: readonly (GridItemSizingEntry | GridResolvedPlacement)[]
  readonly placements?: readonly GridResolvedPlacement[]
  readonly itemStyles?: readonly GridItemSizeStyle[] | Readonly<Record<string, GridItemSizeStyle>>
  readonly intrinsicSizes?: readonly (GridItemIntrinsic | number | undefined)[] | Readonly<Record<string, GridItemIntrinsic | number>>
  readonly intrinsics?: readonly (GridItemIntrinsic | number | undefined)[] | Readonly<Record<string, GridItemIntrinsic | number>>
  readonly measurements?: readonly (GridItemIntrinsic | number | undefined)[] | Readonly<Record<string, GridItemIntrinsic | number>>
  readonly intrinsicByNode?: Readonly<Record<string, GridItemIntrinsic | number>>
  readonly gap?: number
  readonly columnGap?: number
  readonly rowGap?: number
  readonly justifyItems?: GridItemAlignment | string
  readonly alignItems?: GridItemAlignment | string
  readonly defaults?: {
    readonly justifySelf?: GridItemAlignment | string
    readonly alignSelf?: GridItemAlignment | string
  }
  readonly style?: {
    readonly justifyItems?: GridItemAlignment | string
    readonly alignItems?: GridItemAlignment | string
  }
  readonly nodeId?: number
  readonly [key: string]: unknown
}

export type GridItemSizeResult = {
  readonly areas: readonly GridItemArea[]
  readonly boxes: readonly GridResolvedRect[]
  /** Alias useful to callers that consume rectangles directly. */
  readonly rects: readonly GridResolvedRect[]
}

export type ItemSizeInput = GridItemSizeInput
export type ItemSizeResult = GridItemSizeResult
export type ItemStyle = GridItemSizeStyle

type Result = GridItemSizeResult | GridLayoutError
type Edges = { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }
type Intrinsic = { readonly min: number; readonly max: number; readonly preferred: number }
type Dimension =
  | { readonly kind: "auto" }
  | { readonly kind: "grow" }
  | { readonly kind: "fit"; readonly cap: number | null; readonly capPercent?: number }
  | { readonly kind: "min-content" }
  | { readonly kind: "max-content" }
  | { readonly kind: "fixed"; readonly px: number }
  | { readonly kind: "percent"; readonly percent: number }
type AxisSource = AxisSizingResult | ExpandedTracks

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
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value)
}

function error(code: GridLayoutError["code"], path: string, nodeId: number): GridLayoutError {
  return createGridError(code, path, nodeId)
}

function exact(value: Record<string, unknown>, key: string): boolean {
  return Object.keys(value).length === 1 && Object.prototype.hasOwnProperty.call(value, key)
}

function percent(value: unknown, path: string, nodeId: number): number | GridLayoutError | null {
  if (!record(value) || !exact(value, "percent")) return null
  return nonNegative(value.percent) && value.percent <= 100
    ? value.percent
    : error("GRID_INVALID_VALUE", path, nodeId)
}

function edge(value: unknown, basis: number, path: string, nodeId: number): number | GridLayoutError {
  if (typeof value === "number") return nonNegative(value) ? value : error("GRID_INVALID_VALUE", path, nodeId)
  if (record(value) && Object.prototype.hasOwnProperty.call(value, "value") && Object.prototype.hasOwnProperty.call(value, "unit")) {
    if (!nonNegative(value.value)) return error("GRID_INVALID_VALUE", path, nodeId)
    if (value.unit === 0 || value.unit === "undefined") return 0
    if (value.unit === 1 || value.unit === "px" || value.unit === "point") return value.value
    if (value.unit === 2 || value.unit === "%" || value.unit === "percent") return finite(basis * value.value / 100) ? basis * value.value / 100 : error("GRID_INVALID_VALUE", path, nodeId)
    return error("GRID_INVALID_VALUE", path, nodeId)
  }
  const percentage = percent(value, path, nodeId)
  if (isGridLayoutError(percentage)) return percentage
  if (percentage !== null) {
    const resolved = basis * percentage / 100
    return finite(resolved) ? resolved : error("GRID_INVALID_VALUE", path, nodeId)
  }
  return error("GRID_INVALID_VALUE", path, nodeId)
}

function edges(
  value: unknown,
  basis: number,
  path: string,
  nodeId: number,
  defaults: Partial<Edges> = {},
): Edges | GridLayoutError {
  const fallback = {
    top: defaults.top ?? 0,
    right: defaults.right ?? 0,
    bottom: defaults.bottom ?? 0,
    left: defaults.left ?? 0,
  }
  if (value === undefined) return fallback
  if (Array.isArray(value)) {
    if (value.length !== 4) return error("GRID_INVALID_VALUE", path, nodeId)
    const values = value.map((item, index) => edge(item, basis, `${path}[${index}]`, nodeId))
    if (values.some(isGridLayoutError)) return values.find(isGridLayoutError) as GridLayoutError
    return { top: values[0] as number, right: values[1] as number, bottom: values[2] as number, left: values[3] as number }
  }
  const scalar = edge(value, basis, path, nodeId)
  if (!isGridLayoutError(scalar)) return { top: scalar, right: scalar, bottom: scalar, left: scalar }
  if (!record(value)) return scalar
  const pick = (keys: readonly string[], fallbackValue: number): unknown => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) return value[key]
    }
    return fallbackValue
  }
  const top = edge(pick(["top", "blockStart", "start"], fallback.top), basis, `${path}.top`, nodeId)
  const right = edge(pick(["right", "inlineEnd", "end"], fallback.right), basis, `${path}.right`, nodeId)
  const bottom = edge(pick(["bottom", "blockEnd"], fallback.bottom), basis, `${path}.bottom`, nodeId)
  const left = edge(pick(["left", "inlineStart"], fallback.left), basis, `${path}.left`, nodeId)
  if (isGridLayoutError(top)) return top
  if (isGridLayoutError(right)) return right
  if (isGridLayoutError(bottom)) return bottom
  if (isGridLayoutError(left)) return left
  return { top, right, bottom, left }
}

function axisSource(value: unknown, axis: "columns" | "rows", path: string, nodeId: number): AxisSource | GridLayoutError {
  if (!record(value) || value.axis !== axis || !Array.isArray(value.tracks)) return error("GRID_INVALID_TRACK", path, nodeId)
  if (value.tracks.length > GRID_ITEM_SIZE_LIMIT) return error("GRID_TRACK_LIMIT", axis, nodeId)
  if (Object.prototype.hasOwnProperty.call(value, "explicitCount")
    && (!integer(value.explicitCount) || value.explicitCount < 0 || value.explicitCount > GRID_ITEM_SIZE_LIMIT)) {
    return error("GRID_TRACK_LIMIT", axis, nodeId)
  }
  for (let index = 0; index < value.tracks.length; index++) {
    const track = value.tracks[index]
    if (!record(track) || !nonNegative(track.base) || !nonNegative(track.offset)) return error("GRID_INVALID_TRACK", `${path}[${index}]`, nodeId)
    if (track.growthLimit !== Number.POSITIVE_INFINITY && (!nonNegative(track.growthLimit) || track.growthLimit < track.base)) {
      return error("GRID_INVALID_TRACK", `${path}[${index}]`, nodeId)
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "lines")) {
    if (!Array.isArray(value.lines) || value.lines.some((line) => !nonNegative(line))) return error("GRID_INVALID_TRACK", `${path}.lines`, nodeId)
  }
  return value as AxisSource
}

function trackEdges(source: AxisSource, start: number, end: number, path: string, nodeId: number, gap = 0): { start: number; end: number } | GridLayoutError {
  const count = source.tracks.length
  if (!integer(start) || !integer(end) || start < 0 || end <= start || end > count) return error("GRID_INVALID_PLACEMENT", path, nodeId)
  const lines = "lines" in source && Array.isArray(source.lines) ? source.lines : []
  if (lines.length === count * 2) {
    const first = lines[start * 2]
    const last = lines[(end - 1) * 2 + 1]
    if (!finite(first) || !finite(last) || last < first) return error("GRID_INVALID_TRACK", `${path}.lines`, nodeId)
    return { start: first, end: last }
  }
  if (lines.length === count + 1) {
    const first = lines[start]
    const last = lines[end]
    if (!finite(first) || !finite(last) || last < first) return error("GRID_INVALID_TRACK", `${path}.lines`, nodeId)
    return { start: first, end: last }
  }
  const firstTrack = source.tracks[start]
  const lastTrack = source.tracks[end - 1]
  if (!firstTrack || !lastTrack) return error("GRID_INVALID_PLACEMENT", path, nodeId)
  const hasDistinctOffsets = source.tracks.some((track, index) => index > 0 && track.offset !== source.tracks[index - 1]?.offset)
  const first = hasDistinctOffsets
    ? firstTrack.offset
    : source.tracks.slice(0, start).reduce((sum, track) => sum + track.base + gap, 0)
  const last = hasDistinctOffsets
    ? lastTrack.offset + lastTrack.base
    : source.tracks.slice(0, end).reduce((sum, track, index) => sum + track.base + (index + 1 < end ? gap : 0), 0)
  if (!finite(first) || !finite(last) || last < first) return error("GRID_INVALID_TRACK", path, nodeId)
  return { start: first, end: last }
}

function dimension(value: unknown, path: string, nodeId: number): Dimension | GridLayoutError {
  if (value === undefined || value === null) return { kind: "auto" }
  if (typeof value === "number") return nonNegative(value) ? { kind: "fixed", px: value } : error("GRID_INVALID_VALUE", path, nodeId)
  if (typeof value === "string") {
    if (value === "auto") return { kind: "auto" }
    if (value === "grow") return { kind: "grow" }
    if (value === "fit" || value === "fit-content") return { kind: "fit", cap: null }
    if (value === "min-content") return { kind: "min-content" }
    if (value === "max-content") return { kind: "max-content" }
    return error("GRID_INVALID_VALUE", path, nodeId)
  }
  const percentage = percent(value, path, nodeId)
  if (isGridLayoutError(percentage)) return percentage
  if (percentage !== null) return { kind: "percent", percent: percentage }
  if (!record(value)) return error("GRID_INVALID_VALUE", path, nodeId)
  if (Object.prototype.hasOwnProperty.call(value, "value") && Object.prototype.hasOwnProperty.call(value, "unit")) {
    if (!nonNegative(value.value)) return error("GRID_INVALID_VALUE", path, nodeId)
    if (value.unit === 0 || value.unit === 3 || value.unit === "undefined" || value.unit === "auto") return { kind: "auto" }
    if (value.unit === 1 || value.unit === "px" || value.unit === "point") return { kind: "fixed", px: value.value }
    if ((value.unit === 2 || value.unit === "%" || value.unit === "percent") && value.value <= 100) return { kind: "percent", percent: value.value }
    if (value.unit === 4 || value.unit === 5 || value.unit === "fit" || value.unit === "fit-content") return { kind: "fit", cap: null }
    return error("GRID_INVALID_VALUE", path, nodeId)
  }
  if (Object.prototype.hasOwnProperty.call(value, "fitContent")) {
    if (!exact(value, "fitContent")) return error("GRID_INVALID_VALUE", path, nodeId)
    const cap = value.fitContent
    if (nonNegative(cap)) return { kind: "fit", cap }
    const capPercent = percent(cap, `${path}.fitContent`, nodeId)
    if (isGridLayoutError(capPercent)) return capPercent
    if (capPercent !== null) return { kind: "fit", cap: null, capPercent }
    return error("GRID_INVALID_VALUE", `${path}.fitContent`, nodeId)
  }
  if (Object.prototype.hasOwnProperty.call(value, "value")) {
    if (!exact(value, "value") || !nonNegative(value.value)) return error("GRID_INVALID_VALUE", path, nodeId)
    return { kind: "fixed", px: value.value }
  }
  return error("GRID_INVALID_VALUE", path, nodeId)
}

function intrinsic(value: unknown, axis: "width" | "height", path: string, nodeId: number): Intrinsic | GridLayoutError {
  if (nonNegative(value)) return { min: value, max: value, preferred: value }
  if (!record(value)) return { min: 0, max: 0, preferred: 0 }
  const width = axis === "width"
  const minValue = width
    ? value.minWidth ?? value.minContentWidth ?? value.minContent
    : value.minHeight ?? value.minContentHeight ?? value.minContent
  const maxValue = width
    ? value.maxWidth ?? value.maxContentWidth ?? value.maxContent
    : value.maxHeight ?? value.maxContentHeight ?? value.maxContent
  const preferredValue = value.preferred ?? (width ? value.width : value.height) ?? maxValue
  const min = minValue === undefined ? 0 : minValue
  const max = maxValue === undefined ? preferredValue ?? min : maxValue
  const preferred = preferredValue === undefined ? max : preferredValue
  if (!nonNegative(min) || !nonNegative(max) || !nonNegative(preferred) || min > max) return error("GRID_MEASURE_INVALID", path, nodeId)
  return { min, max, preferred: Math.max(min, Math.min(max, preferred)) }
}

function alignment(value: unknown, fallback: string, path: string, nodeId: number): "start" | "end" | "center" | "stretch" | GridLayoutError {
  const selected = value === undefined || value === "auto" || value === "normal" ? fallback : value
  if (selected === "start" || selected === "flex-start" || selected === "left") return "start"
  if (selected === "end" || selected === "flex-end" || selected === "right") return "end"
  if (selected === "center") return "center"
  if (selected === "stretch") return "stretch"
  if (typeof selected === "string" && selected.includes("baseline")) return error("GRID_UNSUPPORTED_ALIGNMENT", path, nodeId)
  if (selected === "space-between" || selected === "space-around" || selected === "space-evenly") return error("GRID_UNSUPPORTED_ALIGNMENT", path, nodeId)
  return error("GRID_INVALID_VALUE", path, nodeId)
}

function entryStyle(entry: GridItemSizingEntry | GridResolvedPlacement, index: number, input: GridItemSizeInput): GridItemSizeStyle {
  const entryRecord = entry as unknown as Record<string, unknown>
  if (record(entryRecord) && record(entryRecord.style)) return entryRecord.style as GridItemSizeStyle
  const dimensions = ["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight", "margin", "padding", "border"]
  if (dimensions.some((key) => Object.prototype.hasOwnProperty.call(entryRecord, key))) return entryRecord as GridItemSizeStyle
  const styles = input.itemStyles
  if (Array.isArray(styles)) return (styles[index] ?? {}) as GridItemSizeStyle
  if (record(styles)) {
    const nodeId = record(entryRecord) && typeof entryRecord.nodeId === "number" ? entryRecord.nodeId : undefined
    return (styles[String(nodeId)] ?? {}) as GridItemSizeStyle
  }
  return {}
}

function entryIntrinsic(entry: GridItemSizingEntry | GridResolvedPlacement, index: number, input: GridItemSizeInput): unknown {
  const entryRecord = entry as unknown as Record<string, unknown>
  if (entryRecord.intrinsic !== undefined) return entryRecord.intrinsic
  if (entryRecord.measure !== undefined) return entryRecord.measure
  const values = input.intrinsicSizes ?? input.intrinsics ?? input.measurements
  if (Array.isArray(values)) return values[index]
  if (record(input.intrinsicByNode) && typeof entryRecord.nodeId === "number") return input.intrinsicByNode[String(entryRecord.nodeId)]
  if (record(values) && typeof entryRecord.nodeId === "number") return values[String(entryRecord.nodeId)]
  return undefined
}

function styleEdgeValue(style: GridItemSizeStyle, name: "margin" | "padding" | "border"): unknown {
  const direct = style[name]
  const values = name === "margin"
    ? [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft]
    : name === "padding"
      ? [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
      : [style.borderTop, style.borderRight, style.borderBottom, style.borderLeft]
  if (direct !== undefined) return direct
  return values.some((value) => value !== undefined) ? values : undefined
}

function hasAutoMargin(value: unknown): boolean {
  if (value === "auto") return true
  if (Array.isArray(value)) return value.some(hasAutoMargin)
  if (!record(value)) return false
  if (value.unit === 3 || value.unit === "auto") return true
  return Object.values(value).some(hasAutoMargin)
}

function placementOf(entry: GridItemSizingEntry | GridResolvedPlacement, index: number, input: GridItemSizeInput): GridResolvedPlacement | null {
  const entryRecord = entry as unknown as Record<string, unknown>
  if (record(entryRecord.placement)) return entryRecord.placement as GridResolvedPlacement
  if (record(entry) && "rowStart" in entry && "columnStart" in entry) return entry as GridResolvedPlacement
  return input.placements?.[index] ?? null
}

function itemNodeId(entry: GridItemSizingEntry | GridResolvedPlacement, placement: GridResolvedPlacement): number {
  return record(entry) && integer(entry.nodeId) ? entry.nodeId : placement.nodeId
}

function itemSize(
  value: unknown,
  available: number,
  intrinsicValue: Intrinsic,
  spacing: number,
  alignSelf: "start" | "end" | "center" | "stretch",
  path: string,
  nodeId: number,
): number | GridLayoutError {
  const parsed = dimension(value, path, nodeId)
  if (isGridLayoutError(parsed)) return parsed
  const contentMax = intrinsicValue.max
  const contentMin = intrinsicValue.min
  const contentPreferred = intrinsicValue.preferred
  const intrinsicOuter = contentPreferred + spacing
  let result: number
  if ((parsed.kind === "auto" || parsed.kind === "grow") && alignSelf === "stretch") result = available
  else if (parsed.kind === "grow" || parsed.kind === "auto") result = intrinsicOuter
  else if (parsed.kind === "fit") {
    const cap = parsed.capPercent === undefined
      ? parsed.cap
      : available * parsed.capPercent / 100
    result = Math.min(cap === null ? contentMax + spacing : cap, contentMax + spacing)
  }
  else if (parsed.kind === "min-content") result = contentMin + spacing
  else if (parsed.kind === "max-content") result = contentMax + spacing
  else if (parsed.kind === "percent") result = available * parsed.percent / 100
  else result = parsed.px
  if (!finite(result) || result < 0) return error("GRID_INVALID_VALUE", path, nodeId)
  return result
}

function constrained(
  value: number,
  minValue: unknown,
  maxValue: unknown,
  available: number,
  spacing: number,
  path: string,
  nodeId: number,
): number | GridLayoutError {
  const minimum = dimension(minValue, `${path}.min`, nodeId)
  if (isGridLayoutError(minimum)) return minimum
  const maximum = dimension(maxValue, `${path}.max`, nodeId)
  if (isGridLayoutError(maximum)) return maximum
  const resolve = (dimensionValue: Dimension, defaultValue: number): number => {
    if (dimensionValue.kind === "fixed") return dimensionValue.px
    if (dimensionValue.kind === "percent") return available * dimensionValue.percent / 100
    return defaultValue
  }
  let min = resolve(minimum, 0)
  let max = resolve(maximum, Number.POSITIVE_INFINITY)
  if (!finite(min) || min < 0 || (max !== Number.POSITIVE_INFINITY && (!finite(max) || max < 0))) {
    return error("GRID_INVALID_VALUE", path, nodeId)
  }
  min = Math.max(min, spacing)
  if (max !== Number.POSITIVE_INFINITY) max = Math.max(max, spacing)
  if (max < min) max = min
  const result = Math.max(min, Math.min(max, value))
  return finite(result) ? result : error("GRID_INVALID_VALUE", path, nodeId)
}

function validateItems(input: GridItemSizeInput, entries: readonly (GridItemSizingEntry | GridResolvedPlacement)[], nodeId: number): GridLayoutError | null {
  const style = input.style as Record<string, unknown> | undefined
  const parentJustify = input.justifyItems ?? style?.justifyItems ?? "stretch"
  const parentAlign = input.alignItems ?? style?.alignItems ?? "stretch"
  const justify = alignment(parentJustify, "stretch", "justifyItems", nodeId)
  if (isGridLayoutError(justify)) return justify
  const align = alignment(parentAlign, "stretch", "alignItems", nodeId)
  if (isGridLayoutError(align)) return align
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    const placement = placementOf(entry, index, input)
    const itemId = placement?.nodeId ?? nodeId
    if (!placement || !integer(placement.nodeId) || !integer(placement.rowStart) || !integer(placement.rowEnd) || !integer(placement.columnStart) || !integer(placement.columnEnd)) {
      return error("GRID_INVALID_PLACEMENT", `items[${index}]`, itemId)
    }
    const itemStyle = entryStyle(entry, index, input) as Record<string, unknown>
    if (hasAutoMargin(styleEdgeValue(itemStyle as GridItemSizeStyle, "margin"))) return error("GRID_UNSUPPORTED_ALIGNMENT", `items[${index}].style.margin`, itemId)
    const itemJustify = alignment(itemStyle.justifySelf, typeof justify === "string" ? justify : "stretch", `items[${index}].style.justifySelf`, itemId)
    if (isGridLayoutError(itemJustify)) return itemJustify
    const itemAlign = alignment(itemStyle.alignSelf, typeof align === "string" ? align : "stretch", `items[${index}].style.alignSelf`, itemId)
    if (isGridLayoutError(itemAlign)) return itemAlign
  }
  return null
}

/** Resolve all placed items to local rectangles without mutating any input. */
export function resolveItemSizes(input: GridItemSizeInput): Result {
  const nodeId = input?.nodeId ?? 0
  if (!input || !input.rows || !input.columns) return error("GRID_INVALID_TRACK", "input", nodeId)
  const columns = axisSource(input.columns, "columns", "columns", nodeId)
  if (isGridLayoutError(columns)) return columns
  const rows = axisSource(input.rows, "rows", "rows", nodeId)
  if (isGridLayoutError(rows)) return rows
  const columnGap = input.columnGap ?? input.gap ?? 0
  const rowGap = input.rowGap ?? input.gap ?? 0
  if (!nonNegative(columnGap)) return error("GRID_INVALID_VALUE", "columnGap", nodeId)
  if (!nonNegative(rowGap)) return error("GRID_INVALID_VALUE", "rowGap", nodeId)
  const entries = input.items ?? input.placements ?? []
  if (!Array.isArray(entries)) return error("GRID_INVALID_PLACEMENT", "items", nodeId)
  const invalid = validateItems(input, entries, nodeId)
  if (invalid) return invalid

  const areas: GridItemArea[] = []
  const boxes: GridResolvedRect[] = []
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    const placement = placementOf(entry, index, input) as GridResolvedPlacement
    const id = itemNodeId(entry, placement)
    const column = trackEdges(columns, placement.columnStart, placement.columnEnd, `items[${index}].placement.columns`, id, columnGap)
    if (isGridLayoutError(column)) return column
    const row = trackEdges(rows, placement.rowStart, placement.rowEnd, `items[${index}].placement.rows`, id, rowGap)
    if (isGridLayoutError(row)) return row
    const areaWidth = column.end - column.start
    const areaHeight = row.end - row.start
    if (!finite(areaWidth) || !finite(areaHeight) || areaWidth < 0 || areaHeight < 0) return error("GRID_INVALID_VALUE", `items[${index}].area`, id)
    const itemStyle = entryStyle(entry, index, input)
    const margin = edges(styleEdgeValue(itemStyle, "margin"), areaWidth, `items[${index}].style.margin`, id)
    if (isGridLayoutError(margin)) return margin
    const padding = edges(styleEdgeValue(itemStyle, "padding"), areaWidth, `items[${index}].style.padding`, id)
    if (isGridLayoutError(padding)) return padding
    const border = edges(styleEdgeValue(itemStyle, "border"), areaWidth, `items[${index}].style.border`, id)
    if (isGridLayoutError(border)) return border
    const spacingX = padding.left + padding.right + border.left + border.right
    const spacingY = padding.top + padding.bottom + border.top + border.bottom
    const availableWidth = Math.max(0, areaWidth - margin.left - margin.right)
    const availableHeight = Math.max(0, areaHeight - margin.top - margin.bottom)
    const parentStyle = input.style as Record<string, unknown> | undefined
    const parentJustify = input.justifyItems ?? input.defaults?.justifySelf ?? parentStyle?.justifyItems ?? "stretch"
    const parentAlign = input.alignItems ?? input.defaults?.alignSelf ?? parentStyle?.alignItems ?? "stretch"
    const justify = alignment(itemStyle.justifySelf, typeof parentJustify === "string" ? parentJustify : "stretch", `items[${index}].style.justifySelf`, id)
    if (isGridLayoutError(justify)) return justify
    const align = alignment(itemStyle.alignSelf, typeof parentAlign === "string" ? parentAlign : "stretch", `items[${index}].style.alignSelf`, id)
    if (isGridLayoutError(align)) return align
    const itemIntrinsic = intrinsic(entryIntrinsic(entry, index, input), "width", `items[${index}].intrinsic`, id)
    if (isGridLayoutError(itemIntrinsic)) return itemIntrinsic
    const itemIntrinsicHeight = intrinsic(entryIntrinsic(entry, index, input), "height", `items[${index}].intrinsic`, id)
    if (isGridLayoutError(itemIntrinsicHeight)) return itemIntrinsicHeight
    const width = itemSize(itemStyle.width, availableWidth, itemIntrinsic, spacingX, justify, `items[${index}].style.width`, id)
    if (isGridLayoutError(width)) return width
    const height = itemSize(itemStyle.height, availableHeight, itemIntrinsicHeight, spacingY, align, `items[${index}].style.height`, id)
    if (isGridLayoutError(height)) return height
    const constrainedWidth = constrained(width, itemStyle.minWidth, itemStyle.maxWidth, availableWidth, spacingX, `items[${index}].style.width`, id)
    if (isGridLayoutError(constrainedWidth)) return constrainedWidth
    const constrainedHeight = constrained(height, itemStyle.minHeight, itemStyle.maxHeight, availableHeight, spacingY, `items[${index}].style.height`, id)
    if (isGridLayoutError(constrainedHeight)) return constrainedHeight

    const extraWidth = Math.max(0, availableWidth - constrainedWidth)
    const extraHeight = Math.max(0, availableHeight - constrainedHeight)
    const x = justify === "end"
      ? column.end - margin.right - constrainedWidth
      : justify === "center"
        ? column.start + margin.left + extraWidth / 2
        : column.start + margin.left
    const y = align === "end"
      ? row.end - margin.bottom - constrainedHeight
      : align === "center"
        ? row.start + margin.top + extraHeight / 2
        : row.start + margin.top
    if (!finite(x) || !finite(y) || !finite(constrainedWidth) || !finite(constrainedHeight) || constrainedWidth < 0 || constrainedHeight < 0) {
      return error("GRID_INVALID_VALUE", `items[${index}]`, id)
    }
    const area = Object.freeze({
      nodeId: id,
      rowStart: placement.rowStart,
      rowEnd: placement.rowEnd,
      columnStart: placement.columnStart,
      columnEnd: placement.columnEnd,
      x: column.start,
      y: row.start,
      width: areaWidth,
      height: areaHeight,
    })
    const box = Object.freeze({ nodeId: id, x, y, width: constrainedWidth, height: constrainedHeight })
    areas.push(area)
    boxes.push(box)
  }
  const frozenBoxes = Object.freeze(boxes)
  return { areas: Object.freeze(areas), boxes: frozenBoxes, rects: frozenBoxes }
}

/** Alias using the shorter stage name used by the layout pipeline. */
export const sizeItems = resolveItemSizes
export const resolveGridItemSizes = resolveItemSizes
export const layoutItems = resolveItemSizes
export const resolveItemSize = resolveItemSizes
export const calculateItemSizes = resolveItemSizes
export const sizeItem = resolveItemSizes

/** Return only the local item rectangles. */
export function resolveItemRects(input: GridItemSizeInput): readonly GridResolvedRect[] | GridLayoutError {
  const result = resolveItemSizes(input)
  return isGridLayoutError(result) ? result : result.boxes
}

export const itemRects = resolveItemRects
export const resolveItemRect = resolveItemRects
