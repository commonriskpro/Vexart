/**
 * Explicit Grid placement.
 *
 * This stage resolves the item's definite lines and spans.  An axis that is
 * still `auto` receives the smallest provisional cell; G-014 owns replacing
 * that provisional cell with the row/column auto-placement cursor.  No
 * occupancy search, dense packing, or track sizing happens here.
 */

import type {
  GridAreaPlacement,
  GridItemInput,
  GridItemStyle,
  GridLineRef,
  GridLayoutError,
  GridPlacement,
  GridResolvedLineSet,
  GridResolvedPlacement,
  GridSnapshot,
  PlacementResult,
  ResolvedLines,
} from "./grid-model"
import { createGridError, isGridLayoutError } from "./grid-errors"
import { GRID_LINE_LIMIT, resolveLineReference } from "./grid-lines"
import { isGridAreaName } from "./grid-areas"

const MAX_LINE_COUNT = GRID_LINE_LIMIT + 1

type MutableLines = {
  readonly axis: ResolvedLines["axis"]
  count: number
  readonly names: Map<string, number[]>
}

type AxisResult = { readonly start: number; readonly end: number }
type RefPair = { readonly start: GridLineRef | null; readonly end: GridLineRef | null }
type PlacementResultOrError = PlacementResult | GridLayoutError

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)
}

function error(code: GridLayoutError["code"], path: string, nodeId: number): GridLayoutError {
  return createGridError(code, path, nodeId)
}

function lineCount(lines: ResolvedLines): number {
  return lines.positions.length > 0 ? lines.positions.length : Math.max(1, lines.explicitCount + 1)
}

function copyLines(source: ResolvedLines): MutableLines {
  const names = new Map<string, number[]>()
  for (const [name, values] of source.names) names.set(name, [...values].sort((left, right) => left - right))
  return { axis: source.axis, count: lineCount(source), names }
}

function asResolvedLines(lines: MutableLines): ResolvedLines {
  return {
    axis: lines.axis,
    positions: Array.from({ length: lines.count }, (_, index) => index),
    names: lines.names,
    explicitCount: Math.max(0, lines.count - 1),
  }
}

function isSpanRef(value: unknown): value is Extract<GridLineRef, { readonly span: number }> {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, "span")
}

function isNamedRef(value: unknown): value is Extract<GridLineRef, { readonly name: string }> {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, "name") && !Object.prototype.hasOwnProperty.call(value, "span")
}

function refValue(value: unknown, path: string, nodeId: number): GridLineRef | null | GridLayoutError {
  if (value === undefined || value === "auto") return null
  if (typeof value === "number" || isRecord(value)) return value as GridLineRef
  return error("GRID_INVALID_PLACEMENT", path, nodeId)
}

function placementRefs(value: unknown, path: string, nodeId: number): RefPair | GridLayoutError {
  if (value === undefined) return { start: null, end: null }
  if (!isRecord(value)) return error("GRID_INVALID_PLACEMENT", path, nodeId)
  const start = refValue(value.start, `${path}.start`, nodeId)
  if (start && isGridLayoutError(start)) return start
  const end = refValue(value.end, `${path}.end`, nodeId)
  if (end && isGridLayoutError(end)) return end
  return { start, end }
}

function validSpan(ref: Extract<GridLineRef, { readonly span: number }>, path: string, nodeId: number): number | GridLayoutError {
  if (!isInteger(ref.span) || ref.span <= 0 || ref.span > GRID_LINE_LIMIT) return error("GRID_INVALID_PLACEMENT", `${path}.span`, nodeId)
  if (ref.name !== undefined && (typeof ref.name !== "string" || !isGridAreaName(ref.name))) return error("GRID_INVALID_PLACEMENT", `${path}.name`, nodeId)
  return ref.span
}

function addNamedLine(lines: MutableLines, name: string, occurrence: number, path: string, nodeId: number): number | GridLayoutError {
  if (!isInteger(occurrence) || occurrence <= 0) return error("GRID_INVALID_PLACEMENT", `${path}.occurrence`, nodeId)
  const values = lines.names.get(name) ?? []
  while (values.length < occurrence) {
    if (lines.count >= MAX_LINE_COUNT) return error("GRID_TRACK_LIMIT", path, nodeId)
    values.push(lines.count)
    lines.count++
  }
  values.sort((left, right) => left - right)
  lines.names.set(name, values)
  return values[occurrence - 1]
}

function resolveRef(
  lines: MutableLines,
  ref: GridLineRef,
  path: string,
  nodeId: number,
  strictNames = false,
): number | GridLayoutError {
  const resolved = resolveLineReference(asResolvedLines(lines), ref, path, nodeId)
  if (typeof resolved === "number" || strictNames || !isNamedRef(ref)) {
    // Positive numeric lines beyond the explicit grid address implicit lines.
    // Materialise their line slots here; the implicit-track stage will supply
    // the corresponding auto track after all placements are known. Negative
    // lines remain anchored to the explicit grid and therefore stay errors
    // when they are out of range.
    if (typeof ref === "number" && ref > 0 && typeof resolved !== "number") {
      const extension = extendTo(lines, ref, path, nodeId)
      if (extension) return extension
      return ref - 1
    }
    return resolved
  }
  const occurrence = ref.occurrence === undefined ? 1 : ref.occurrence
  if (!isInteger(occurrence) || occurrence <= 0) return error("GRID_INVALID_PLACEMENT", `${path}.occurrence`, nodeId)
  return addNamedLine(lines, ref.name, occurrence, path, nodeId)
}

function namedBefore(
  lines: MutableLines,
  name: string,
  anchor: number,
  occurrence: number,
  path: string,
  nodeId: number,
): number | GridLayoutError {
  const values = lines.names.get(name) ?? []
  let candidates = values.filter((value) => value < anchor).sort((left, right) => right - left)
  let next = 0
  while (candidates.length < occurrence && next < anchor) {
    if (!values.includes(next)) values.push(next)
    candidates = values.filter((value) => value < anchor).sort((left, right) => right - left)
    next++
  }
  lines.names.set(name, values.sort((left, right) => left - right))
  return candidates.length >= occurrence ? candidates[occurrence - 1] : error("GRID_LINE_UNRESOLVED", path, nodeId)
}

function namedAfter(
  lines: MutableLines,
  name: string,
  anchor: number,
  occurrence: number,
  path: string,
  nodeId: number,
): number | GridLayoutError {
  const values = lines.names.get(name) ?? []
  let candidates = values.filter((value) => value > anchor).sort((left, right) => left - right)
  while (candidates.length < occurrence) {
    const appended = addNamedLine(lines, name, values.length + 1, path, nodeId)
    if (typeof appended !== "number") return appended
    candidates = values.filter((value) => value > anchor).sort((left, right) => left - right)
  }
  return candidates[occurrence - 1]
}

function spanName(ref: Extract<GridLineRef, { readonly span: number }>): string | null {
  return ref.name === undefined ? null : ref.name
}

function extendTo(lines: MutableLines, end: number, path: string, nodeId: number): GridLayoutError | null {
  if (end <= lines.count) return null
  if (end > MAX_LINE_COUNT) return error("GRID_TRACK_LIMIT", path, nodeId)
  lines.count = end
  return null
}

function axisPlacement(
  value: unknown,
  lines: MutableLines,
  path: string,
  nodeId: number,
  strictNames = false,
): AxisResult | GridLayoutError {
  const refs = placementRefs(value, path, nodeId)
  if (isGridLayoutError(refs)) return refs
  const startRef = refs.start
  const endRef = refs.end
  if (!startRef && !endRef) return { start: 0, end: 1 }

  const startSpan = startRef && isSpanRef(startRef) ? startRef : null
  const endSpan = endRef && isSpanRef(endRef) ? endRef : null
  if (startSpan && endSpan) return error("GRID_INVALID_PLACEMENT", path, nodeId)

  const startDirect = startRef && !startSpan ? resolveRef(lines, startRef, `${path}.start`, nodeId, strictNames) : null
  if (startDirect && isGridLayoutError(startDirect)) return startDirect
  const endDirect = endRef && !endSpan ? resolveRef(lines, endRef, `${path}.end`, nodeId, strictNames) : null
  if (endDirect && isGridLayoutError(endDirect)) return endDirect

  if (startSpan) {
    const span = validSpan(startSpan, `${path}.start`, nodeId)
    if (typeof span !== "number") return span
    if (endDirect === null) {
      if (spanName(startSpan)) return error("GRID_INVALID_PLACEMENT", `${path}.start`, nodeId)
      const end = span
      const extension = extendTo(lines, end + 1, path, nodeId)
      if (extension) return extension
      return { start: 0, end }
    }
    const end = endDirect as number
    const name = spanName(startSpan)
    const start = name
      ? namedBefore(lines, name, end, span, `${path}.start`, nodeId)
      : end - span
    if (typeof start !== "number") return start
    if (start < 0 || start >= end) return error("GRID_INVALID_PLACEMENT", path, nodeId)
    return { start, end }
  }

  if (endSpan) {
    const span = validSpan(endSpan, `${path}.end`, nodeId)
    if (typeof span !== "number") return span
    if (startDirect === null) {
      if (spanName(endSpan)) return error("GRID_INVALID_PLACEMENT", `${path}.end`, nodeId)
      const end = span
      const extension = extendTo(lines, end + 1, path, nodeId)
      if (extension) return extension
      return { start: 0, end }
    }
    const start = startDirect as number
    const name = spanName(endSpan)
    const end = name
      ? namedAfter(lines, name, start, span, `${path}.end`, nodeId)
      : start + span
    if (typeof end !== "number") return end
    const extension = extendTo(lines, end + 1, path, nodeId)
    if (extension) return extension
    return { start, end }
  }

  if (startDirect !== null && endDirect !== null) {
    const start = startDirect as number
    const end = endDirect as number
    if (end <= start) return error("GRID_INVALID_PLACEMENT", path, nodeId)
    return { start, end }
  }

  if (startDirect !== null) {
    const start = startDirect as number
    const extension = extendTo(lines, start + 2, path, nodeId)
    if (extension) return extension
    return { start, end: start + 1 }
  }

  const end = endDirect as number
  if (end <= 0) return error("GRID_INVALID_PLACEMENT", path, nodeId)
  return { start: end - 1, end }
}

function hasExplicitPlacement(value: unknown): boolean {
  if (!isRecord(value)) return value !== undefined
  const start = value.start
  const end = value.end
  return start !== undefined && start !== "auto" || end !== undefined && end !== "auto"
}

function areaString(
  name: string,
  rows: MutableLines,
  columns: MutableLines,
  path: string,
  nodeId: number,
): { readonly rows: AxisResult; readonly columns: AxisResult } | GridLayoutError {
  if (!isGridAreaName(name)) return error("GRID_INVALID_PLACEMENT", path, nodeId)
  const rowStart = resolveRef(rows, { name: `${name}-start` }, `${path}.rowStart`, nodeId, true)
  if (typeof rowStart !== "number") return rowStart
  const rowEnd = resolveRef(rows, { name: `${name}-end` }, `${path}.rowEnd`, nodeId, true)
  if (typeof rowEnd !== "number") return rowEnd
  const columnStart = resolveRef(columns, { name: `${name}-start` }, `${path}.columnStart`, nodeId, true)
  if (typeof columnStart !== "number") return columnStart
  const columnEnd = resolveRef(columns, { name: `${name}-end` }, `${path}.columnEnd`, nodeId, true)
  if (typeof columnEnd !== "number") return columnEnd
  if (rowEnd <= rowStart || columnEnd <= columnStart) return error("GRID_INVALID_AREA", path, nodeId)
  return {
    rows: { start: rowStart, end: rowEnd },
    columns: { start: columnStart, end: columnEnd },
  }
}

function areaObject(
  value: GridAreaPlacement,
  rows: MutableLines,
  columns: MutableLines,
  path: string,
  nodeId: number,
): { readonly rows: AxisResult; readonly columns: AxisResult } | GridLayoutError {
  if (!isRecord(value)) return error("GRID_INVALID_PLACEMENT", path, nodeId)
  const keys = ["rowStart", "columnStart", "rowEnd", "columnEnd"] as const
  if (
    keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) ||
    Object.keys(value).some((key) => !keys.includes(key as (typeof keys)[number]))
  ) return error("GRID_INVALID_PLACEMENT", path, nodeId)
  const rowsValue = axisPlacement({ start: value.rowStart, end: value.rowEnd }, rows, `${path}.row`, nodeId)
  if (isGridLayoutError(rowsValue)) return rowsValue
  const columnsValue = axisPlacement({ start: value.columnStart, end: value.columnEnd }, columns, `${path}.column`, nodeId)
  if (isGridLayoutError(columnsValue)) return columnsValue
  return { rows: rowsValue, columns: columnsValue }
}

function resolveItem(
  snapshot: GridSnapshot,
  item: GridItemInput,
  rows: MutableLines,
  columns: MutableLines,
  index: number,
): GridResolvedPlacement | GridLayoutError {
  if (!item || !isRecord(item.style)) return error("GRID_INVALID_PLACEMENT", `items[${index}]`, item?.nodeId ?? snapshot.nodeId)
  const style = item.style as GridItemStyle
  const area = style.area
  const conflicting = area !== undefined && (hasExplicitPlacement(style.row) || hasExplicitPlacement(style.column))
  if (conflicting) return error("GRID_CONFLICTING_PLACEMENT", `items[${index}].gridArea`, item.nodeId)

  let row: AxisResult | GridLayoutError
  let column: AxisResult | GridLayoutError
  if (typeof area === "string") {
    const resolved = areaString(area, rows, columns, `items[${index}].gridArea`, item.nodeId)
    if (isGridLayoutError(resolved)) return resolved
    row = resolved.rows
    column = resolved.columns
  } else if (area !== undefined) {
    const resolved = areaObject(area, rows, columns, `items[${index}].gridArea`, item.nodeId)
    if (isGridLayoutError(resolved)) return resolved
    row = resolved.rows
    column = resolved.columns
  } else {
    row = axisPlacement(style.row, rows, `items[${index}].gridRow`, item.nodeId)
    if (isGridLayoutError(row)) return row
    column = axisPlacement(style.column, columns, `items[${index}].gridColumn`, item.nodeId)
    if (isGridLayoutError(column)) return column
  }

  return Object.freeze({
    nodeId: item.nodeId,
    rowStart: row.start,
    rowEnd: row.end,
    columnStart: column.start,
    columnEnd: column.end,
  })
}

/** Return all occupied cells without treating overlaps as an error. */
export function occupancy(placements: readonly GridResolvedPlacement[]): ReadonlySet<string> {
  const cells = new Set<string>()
  for (const placement of placements) {
    for (let row = placement.rowStart; row < placement.rowEnd; row++) {
      for (let column = placement.columnStart; column < placement.columnEnd; column++) cells.add(`${row}:${column}`)
    }
  }
  return cells
}

export const getOccupiedCells = occupancy

/**
 * Resolve explicit item lines, spans, and named areas.  Explicit overlap is
 * valid; the returned occupancy helper is intentionally separate so G-014 can
 * use it while implementing auto-placement.
 */
export function place(
  snapshot: GridSnapshot,
  lines: GridResolvedLineSet,
  items: readonly GridItemInput[],
): PlacementResultOrError {
  if (!snapshot || !lines || !Array.isArray(items)) return error("GRID_INVALID_PLACEMENT", "items", snapshot?.nodeId ?? 0)
  const rows = copyLines(lines.rows)
  const columns = copyLines(lines.columns)
  const resolved: GridResolvedPlacement[] = []
  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    const placement = resolveItem(snapshot, item, rows, columns, index)
    if (isGridLayoutError(placement)) return placement
    resolved.push(placement)
  }
  return {
    items: Object.freeze(resolved),
    rowCount: rows.count - 1,
    columnCount: columns.count - 1,
  }
}

export const resolvePlacement = place

// The aliases below keep the line-reference type available to staged callers
// without adding another public package boundary.
export type { GridLineRef, GridPlacement, GridAreaPlacement }
