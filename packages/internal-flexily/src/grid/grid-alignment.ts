/**
 * Align sized Grid tracks in their content box.
 *
 * Track sizing has already happened when this stage runs.  In particular,
 * the gap is a fixed gutter while sizing is in progress; the `space-*`
 * values below only change the gutters after the track bases are known.
 * `stretch` is the one exception: it may grow tracks whose maximum sizing
 * function is `auto`, and never changes a fixed or an intrinsic track.
 */

import type {
  AlignedGrid,
  AlignmentInput as ModelAlignmentInput,
  AxisSizingResult,
  ExpandedTracks,
  GridAvailableSpace,
  GridAxis,
  GridContentAlignment,
  GridItemStyle,
  GridLayoutError,
  GridResolvedRect,
  GridResolvedPlacement,
  GridTrackState,
} from "./grid-model"
import type { GridAvailableSpaceInput, GridAvailableSpaceResult } from "./grid-available-space"
import { resolveAvailableSpace } from "./grid-available-space"
import { createGridError, isGridLayoutError } from "./grid-errors"

export const GRID_ALIGNMENT_TRACK_LIMIT = 1024
export const GRID_ALIGNMENT_EPSILON = 1e-6

type Space =
  | { readonly kind: "definite"; readonly px: number; readonly origin: number }
  | { readonly kind: "indefinite"; readonly constraint: "min-content" | "max-content"; readonly origin: number }

/** Values accepted for an axis content box by the internal alignment seam. */
export type AlignmentAvailable =
  | GridAvailableSpace
  | GridAvailableSpaceResult
  | GridAvailableSpaceInput
  | number

/** The model input plus the container accounting carried by the sizing seam. */
export type AlignmentInput = ModelAlignmentInput & {
  /** A number applies to both axes; an object can provide one value per axis. */
  readonly available?: AlignmentAvailable | {
    readonly columns?: AlignmentAvailable
    readonly rows?: AlignmentAvailable
  }
  readonly width?: AlignmentAvailable
  readonly height?: AlignmentAvailable
  readonly contentBox?: number | null
  readonly columnGap?: number
  readonly rowGap?: number
  readonly gap?: number
  readonly itemStyles?: readonly GridItemStyle[]
  readonly nodeId?: number
  readonly [key: string]: unknown
}

/** One-axis input useful to sizing callers that do not yet have both axes. */
export type AxisAlignmentInput = {
  readonly axis: GridAxis
  readonly tracks: AxisSizingResult | ExpandedTracks
  readonly available?: AlignmentAvailable
  readonly contentBox?: number | null
  readonly gap?: number
  readonly alignment?: GridContentAlignment | string
  readonly nodeId?: number
}

/** Aligned track geometry, including the effective gutter accounting. */
export type AxisAlignmentResult = {
  readonly axis: GridAxis
  readonly tracks: readonly GridTrackState[]
  /** Track edges are emitted as start/end pairs, including the gap edges. */
  readonly lines: readonly number[]
  readonly gap: number
  readonly leading: number
  readonly origin: number
  readonly freeSpace: number | null
  readonly overflow: number
  readonly available: GridAvailableSpace | null
}

type Result = AlignedGrid | GridLayoutError
type AxisResult = AxisAlignmentResult | GridLayoutError
type MutableTrack = GridTrackState & { base: number; offset: number }

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

function isAvailableResult(value: unknown): value is GridAvailableSpaceResult {
  return record(value)
    && (value.axis === "columns" || value.axis === "rows")
    && Object.prototype.hasOwnProperty.call(value, "contentBox")
    && Object.prototype.hasOwnProperty.call(value, "available")
}

function spaceValue(value: unknown, path: string, nodeId: number): Space | GridLayoutError {
  if (typeof value === "number") {
    return nonNegative(value)
      ? { kind: "definite", px: value, origin: 0 }
      : error("GRID_INVALID_VALUE", path, nodeId)
  }
  if (!record(value)) return error("GRID_INVALID_VALUE", path, nodeId)
  if (value.kind === "definite" && nonNegative(value.px)) {
    return { kind: "definite", px: value.px, origin: 0 }
  }
  if (value.kind === "indefinite" && (value.constraint === "min-content" || value.constraint === "max-content")) {
    return { kind: "indefinite", constraint: value.constraint, origin: 0 }
  }
  return error("GRID_INVALID_VALUE", path, nodeId)
}

function availableSpace(
  value: unknown,
  axis: GridAxis,
  gap: number,
  count: number,
  path: string,
  nodeId: number,
): Space | null | GridLayoutError {
  if (value === undefined) return null
  if (value === null) return error("GRID_INVALID_VALUE", path, nodeId)

  if (isAvailableResult(value)) {
    if (value.axis !== axis) return error("GRID_INVALID_VALUE", path, nodeId)
    if (!nonNegative(value.origin)) return error("GRID_INVALID_VALUE", `${path}.origin`, nodeId)
    // An indefinite result can carry an intrinsic content box.  It remains
    // indefinite for alignment: no viewport-sized free space is invented.
    const available = spaceValue(value.available, `${path}.available`, nodeId)
    if (isGridLayoutError(available)) return available
    if (available.kind === "indefinite") return available
    return value.contentBox === null
      ? error("GRID_INVALID_VALUE", `${path}.contentBox`, nodeId)
      : nonNegative(value.contentBox)
        ? { kind: "definite", px: value.contentBox, origin: nonNegative(value.origin) ? value.origin : 0 }
        : error("GRID_INVALID_VALUE", `${path}.contentBox`, nodeId)
  }

  if (record(value) && Object.prototype.hasOwnProperty.call(value, "contentBox")) {
    const candidate = value.contentBox
    if (candidate === null) return { kind: "indefinite", constraint: "max-content", origin: 0 }
    if (Object.prototype.hasOwnProperty.call(value, "origin") && !nonNegative(value.origin)) {
      return error("GRID_INVALID_VALUE", `${path}.origin`, nodeId)
    }
    return nonNegative(candidate)
      ? { kind: "definite", px: candidate, origin: nonNegative(value.origin) ? value.origin : 0 }
      : error("GRID_INVALID_VALUE", `${path}.contentBox`, nodeId)
  }

  if (record(value) && Object.prototype.hasOwnProperty.call(value, "kind")) {
    return spaceValue(value, path, nodeId)
  }

  // A plain available-space input is resolved once here.  The resolver owns
  // padding/border/min/max accounting, so alignment consumes the content box
  // and never subtracts padding or gutters a second time.
  if (record(value)) {
    const resolved = resolveAvailableSpace(
      { ...value, axis, gap, trackCount: count } as GridAvailableSpaceInput,
      undefined,
      undefined,
      gap,
      nodeId,
    )
    if (isGridLayoutError(resolved)) return resolved
    const available = spaceValue(resolved.available, `${path}.available`, nodeId)
    if (isGridLayoutError(available)) return available
    if (available.kind === "indefinite") return available
    return resolved.contentBox === null
      ? error("GRID_INVALID_VALUE", `${path}.contentBox`, nodeId)
      : { kind: "definite", px: resolved.contentBox, origin: nonNegative(resolved.origin) ? resolved.origin : 0 }
  }

  return spaceValue(value, path, nodeId)
}

function sizingValueIsAuto(value: unknown): boolean {
  if (value === "auto") return true
  if (!record(value) || Object.keys(value).length !== 1) return false
  if (!Array.isArray(value.minmax) || value.minmax.length !== 2) return false
  return value.minmax[1] === "auto"
}

function validTrack(track: GridTrackState, path: string, nodeId: number): GridLayoutError | null {
  if (!track || typeof track !== "object") return error("GRID_INVALID_TRACK", path, nodeId)
  if (!nonNegative(track.base) || !nonNegative(track.offset)) return error("GRID_INVALID_TRACK", path, nodeId)
  if (track.growthLimit !== Number.POSITIVE_INFINITY
    && (!nonNegative(track.growthLimit) || track.growthLimit < track.base)) {
    return error("GRID_INVALID_TRACK", path, nodeId)
  }
  return null
}

function validAxis(
  value: AxisSizingResult | ExpandedTracks,
  axis: GridAxis,
  path: string,
  nodeId: number,
): value is AxisSizingResult | ExpandedTracks {
  if (!value || typeof value !== "object" || value.axis !== axis || !Array.isArray(value.tracks)) return false
  if (value.tracks.length > GRID_ALIGNMENT_TRACK_LIMIT) return false
  if ("explicitCount" in value
    && (!Number.isInteger(value.explicitCount) || value.explicitCount < 0 || value.explicitCount > GRID_ALIGNMENT_TRACK_LIMIT)) {
    return false
  }
  if ("lines" in value && (!Array.isArray(value.lines) || value.lines.some((line) => !finite(line) || line < 0))) return false
  for (let index = 0; index < value.tracks.length; index++) {
    if (validTrack(value.tracks[index], `${path}[${index}]`, nodeId)) return false
  }
  return true
}

function normalizedAlignment(value: unknown, path: string, nodeId: number): GridContentAlignment | GridLayoutError {
  if (value === undefined || value === "normal") return "stretch"
  if (value === "left" || value === "flex-start") return "start"
  if (value === "right" || value === "flex-end") return "end"
  if (value === "baseline" || value === "first baseline" || value === "last baseline") {
    return error("GRID_UNSUPPORTED_ALIGNMENT", path, nodeId)
  }
  if (value === "start" || value === "end" || value === "center"
    || value === "space-between" || value === "space-around"
    || value === "space-evenly" || value === "stretch") return value
  return error("GRID_INVALID_VALUE", path, nodeId)
}

function distributeStretch(tracks: MutableTrack[], free: number): number {
  const eligible = tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => sizingValueIsAuto(track.max))
  if (eligible.length === 0 || free <= GRID_ALIGNMENT_EPSILON) return 0

  let remaining = free
  let active = eligible
  while (remaining > GRID_ALIGNMENT_EPSILON && active.length > 0) {
    const share = remaining / active.length
    const next: typeof active = []
    let consumed = 0
    for (const entry of active) {
      const limit = entry.track.growthLimit === Number.POSITIVE_INFINITY
        ? Number.POSITIVE_INFINITY
        : Math.max(0, entry.track.growthLimit - entry.track.base)
      const amount = Math.min(share, limit)
      if (amount > 0) {
        entry.track.base += amount
        consumed += amount
      }
      if (entry.track.growthLimit === Number.POSITIVE_INFINITY
        || entry.track.base < entry.track.growthLimit - GRID_ALIGNMENT_EPSILON) {
        next.push(entry)
      } else if (entry.track.growthLimit !== Number.POSITIVE_INFINITY) {
        entry.track.base = entry.track.growthLimit
      }
    }
    if (consumed <= GRID_ALIGNMENT_EPSILON) break
    remaining = Math.max(0, remaining - consumed)
    active = next
  }
  return free - remaining
}

function axisAlignment(
  input: AxisAlignmentInput,
  path?: string,
): AxisResult {
  const nodeId = (input as AxisAlignmentInput | null | undefined)?.nodeId ?? 0
  if (!input || (input.axis !== "columns" && input.axis !== "rows")) {
    return error("GRID_INVALID_TRACK", "input", nodeId)
  }
  const axisPath = path ?? input.axis
  if (!validAxis(input.tracks, input.axis, axisPath, nodeId)) {
    return error("GRID_INVALID_TRACK", axisPath, nodeId)
  }
  const sourceTracks = input.tracks.tracks
  const gap = input.gap ?? 0
  if (!nonNegative(gap)) return error("GRID_INVALID_VALUE", `${axisPath}.gap`, nodeId)
  const alignmentPath = axisPath === "justifyContent" || axisPath === "alignContent"
    ? axisPath
    : `${axisPath}.alignment`
  const alignment = normalizedAlignment(input.alignment, alignmentPath, nodeId)
  if (isGridLayoutError(alignment)) return alignment
  const available = input.contentBox === undefined
    ? availableSpace(input.available, input.axis, gap, sourceTracks.length, `${axisPath}.available`, nodeId)
    : availableSpace(input.contentBox, input.axis, gap, sourceTracks.length, `${axisPath}.contentBox`, nodeId)
  if (isGridLayoutError(available)) return available

  const tracks: MutableTrack[] = sourceTracks.map((track) => ({ ...track }))
  const baseTotal = tracks.reduce((sum, track) => sum + track.base, 0)
  const gutterTotal = Math.max(0, tracks.length - 1) * gap
  if (!finite(baseTotal) || !finite(gutterTotal)) return error("GRID_INVALID_VALUE", axisPath, nodeId)
  const occupied = baseTotal + gutterTotal
  const definite = available?.kind === "definite" ? available.px : null
  const freeBeforeStretch = definite === null ? null : Math.max(0, definite - occupied)
  if (alignment === "stretch" && freeBeforeStretch !== null) {
    distributeStretch(tracks, freeBeforeStretch)
  }
  const finalTotal = tracks.reduce((sum, track) => sum + track.base, 0)
  if (!finite(finalTotal)) return error("GRID_INVALID_VALUE", axisPath, nodeId)
  const finalOccupied = finalTotal + gutterTotal
  if (!finite(finalOccupied)) return error("GRID_INVALID_VALUE", axisPath, nodeId)
  const free = definite === null ? null : Math.max(0, definite - finalOccupied)
  const finalOverflow = definite === null ? 0 : Math.max(0, finalOccupied - definite)
  const count = tracks.length
  const origin = available?.origin ?? 0

  let leading = 0
  let effectiveGap = gap
  if (free !== null && free > GRID_ALIGNMENT_EPSILON) {
    if (alignment === "end") leading = free
    if (alignment === "center") leading = free / 2
    if (alignment === "space-between" && count > 1) effectiveGap = gap + free / (count - 1)
    if (alignment === "space-around" && count > 0) {
      effectiveGap = gap + free / count
      leading = free / (2 * count)
    }
    if (alignment === "space-evenly" && count > 0) {
      effectiveGap = gap + free / (count + 1)
      leading = free / (count + 1)
    }
  }

  const lines: number[] = []
  let position = origin + leading
  if (!finite(position) || !finite(effectiveGap)) return error("GRID_INVALID_VALUE", axisPath, nodeId)
  for (let index = 0; index < tracks.length; index++) {
    tracks[index].offset = position
    lines.push(position)
    position += tracks[index].base
    if (!finite(position)) return error("GRID_INVALID_VALUE", axisPath, nodeId)
    lines.push(position)
    if (index + 1 < tracks.length) position += effectiveGap
    if (!finite(position)) return error("GRID_INVALID_VALUE", axisPath, nodeId)
  }

  const outputTracks = Object.freeze(tracks.map((track) => Object.freeze({ ...track })))
  const publicAvailable: GridAvailableSpace | null = available === null
    ? null
    : available.kind === "definite"
      ? { kind: "definite", px: available.px }
      : { kind: "indefinite", constraint: available.constraint }
  return {
    axis: input.axis,
    tracks: outputTracks,
    lines: Object.freeze(lines),
    gap: effectiveGap,
    leading,
    origin,
    freeSpace: free,
    overflow: finalOverflow,
    available: publicAvailable,
  }
}

/** Align one axis after sizing, preserving the source track bases. */
export function alignTracks(input: AxisAlignmentInput): AxisResult {
  return axisAlignment(input)
}

/** Positional convenience form for one-axis alignment. */
export function alignAxis(
  axis: GridAxis,
  tracks: AxisSizingResult | ExpandedTracks,
  available?: AlignmentAvailable,
  gap = 0,
  alignment: GridContentAlignment | string = "stretch",
  nodeId = 0,
): AxisResult {
  return axisAlignment({ axis, tracks, available, gap, alignment, nodeId })
}

function valueForAxis(
  input: AlignmentInput,
  axis: GridAxis,
): unknown {
  const carried = input.available
  if (record(carried) && !Object.prototype.hasOwnProperty.call(carried, "kind")
    && !Object.prototype.hasOwnProperty.call(carried, "contentBox")
    && (Object.prototype.hasOwnProperty.call(carried, axis))) {
    return (carried as Record<string, unknown>)[axis]
  }
  const explicit = axis === "columns" ? input.width : input.height
  if (explicit !== undefined) return explicit
  if (carried !== undefined) return carried
  if (input.contentBox !== undefined) return input.contentBox
  const sizing = axis === "columns" ? input.columns : input.rows
  const sizingRecord = sizing as unknown as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(sizingRecord, "contentBox")) return sizingRecord.contentBox
  if (Object.prototype.hasOwnProperty.call(sizingRecord, "available")) return sizingRecord.available
  return undefined
}

function containsAuto(value: unknown): boolean {
  if (value === "auto") return true
  if (Array.isArray(value)) return value.some(containsAuto)
  if (!record(value)) return false
  return Object.values(value).some(containsAuto)
}

function hasAutoMargins(value: unknown): boolean {
  if (!record(value)) return value === "auto"
  return Object.entries(value).some(([key, child]) => {
    if (key.toLowerCase().includes("margin") || key === "autoMargins") {
      return containsAuto(child) || (key === "autoMargins" && child !== false && child !== null && child !== undefined)
    }
    return key === "style" && hasAutoMargins(child)
  })
}

function unsupportedItems(input: AlignmentInput, nodeId: number): GridLayoutError | null {
  const styles = input.itemStyles ?? []
  for (let index = 0; index < styles.length; index++) {
    const style = styles[index]
    if (!style || typeof style !== "object") return error("GRID_INVALID_PLACEMENT", `itemStyles[${index}]`, nodeId)
    const itemStyle = style as unknown as Record<string, unknown>
    const justifySelf = itemStyle.justifySelf
    const alignSelf = itemStyle.alignSelf
    if (typeof justifySelf === "string" && justifySelf.includes("baseline")) return error("GRID_UNSUPPORTED_ALIGNMENT", `itemStyles[${index}].justifySelf`, nodeId)
    if (typeof alignSelf === "string" && alignSelf.includes("baseline")) return error("GRID_UNSUPPORTED_ALIGNMENT", `itemStyles[${index}].alignSelf`, nodeId)
    if (hasAutoMargins(style)) return error("GRID_UNSUPPORTED_ALIGNMENT", `itemStyles[${index}]`, nodeId)
  }
  const margins = (input as Record<string, unknown>).margins
  const autoMargins = (input as Record<string, unknown>).autoMargins
  if (containsAuto(margins)
    || containsAuto(autoMargins)
    || (autoMargins !== undefined && autoMargins !== false && autoMargins !== null)) {
    return error("GRID_UNSUPPORTED_ALIGNMENT", "margins", nodeId)
  }
  for (let index = 0; index < input.items.length; index++) {
    const item = input.items[index] as GridResolvedPlacement & Record<string, unknown>
    if (item && typeof item === "object") {
      const style = item.style as Record<string, unknown> | undefined
      const justifySelf = style?.justifySelf
      const alignSelf = style?.alignSelf
      if (typeof justifySelf === "string" && justifySelf.includes("baseline")) return error("GRID_UNSUPPORTED_ALIGNMENT", `items[${index}].style.justifySelf`, nodeId)
      if (typeof alignSelf === "string" && alignSelf.includes("baseline")) return error("GRID_UNSUPPORTED_ALIGNMENT", `items[${index}].style.alignSelf`, nodeId)
      if (hasAutoMargins(item)) return error("GRID_UNSUPPORTED_ALIGNMENT", `items[${index}]`, nodeId)
    }
  }
  return null
}

function validateMainInput(input: AlignmentInput): GridLayoutError | null {
  const nodeId = input?.nodeId ?? 0
  if (!input || !input.rows || !input.columns || !record(input.style)) return error("GRID_INVALID_TRACK", "input", nodeId)
  if (!validAxis(input.columns, "columns", "columns", nodeId)) return error("GRID_INVALID_TRACK", "columns", nodeId)
  if (!validAxis(input.rows, "rows", "rows", nodeId)) return error("GRID_INVALID_TRACK", "rows", nodeId)
  if (!Array.isArray(input.items) || !Array.isArray(input.itemSizes)) return error("GRID_INVALID_PLACEMENT", "items", nodeId)
  if (input.style.gap !== undefined && !nonNegative(input.style.gap)) return error("GRID_INVALID_VALUE", "gap", nodeId)
  if (input.gap !== undefined && !nonNegative(input.gap)) return error("GRID_INVALID_VALUE", "gap", nodeId)
  const style = input.style as Record<string, unknown>
  if (style.justifyItems === "baseline") return error("GRID_UNSUPPORTED_ALIGNMENT", "justifyItems", nodeId)
  if (style.alignItems === "baseline") return error("GRID_UNSUPPORTED_ALIGNMENT", "alignItems", nodeId)
  return unsupportedItems(input, nodeId)
}

/** Align both axes, atomically returning the pre-sized item boxes unchanged. */
export function align(input: AlignmentInput): Result {
  const invalid = validateMainInput(input)
  if (invalid) return invalid
  const nodeId = input.nodeId ?? 0
  const gap = input.gap ?? input.style.gap ?? 0
  const columnGap = input.columnGap ?? gap
  const rowGap = input.rowGap ?? gap
  if (!nonNegative(columnGap)) return error("GRID_INVALID_VALUE", "columnGap", nodeId)
  if (!nonNegative(rowGap)) return error("GRID_INVALID_VALUE", "rowGap", nodeId)

  const columns = axisAlignment({
    axis: "columns",
    tracks: input.columns,
    available: valueForAxis(input, "columns") as AlignmentAvailable | undefined,
    gap: columnGap,
    alignment: input.style.justifyContent,
    nodeId,
  }, "justifyContent")
  if (isGridLayoutError(columns)) return columns
  const rows = axisAlignment({
    axis: "rows",
    tracks: input.rows,
    available: valueForAxis(input, "rows") as AlignmentAvailable | undefined,
    gap: rowGap,
    alignment: input.style.alignContent,
    nodeId,
  }, "alignContent")
  if (isGridLayoutError(rows)) return rows

  const boxes: GridResolvedRect[] = input.itemSizes.map((box) => Object.freeze({ ...box }))
  return {
    columns: { axis: "columns", tracks: columns.tracks, lines: columns.lines },
    rows: { axis: "rows", tracks: rows.tracks, lines: rows.lines },
    items: Object.freeze(input.items.slice()),
    boxes: Object.freeze(boxes),
  }
}

export const resolveAlignment = align
export const alignGrid = align
export const alignGridTracks = alignTracks
export const resolveTrackAlignment = alignTracks
