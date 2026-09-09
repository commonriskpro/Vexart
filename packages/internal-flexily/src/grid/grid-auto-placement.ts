/**
 * Grid row/column auto-placement.
 *
 * Explicit lines are resolved by G-013.  This stage only walks unresolved
 * axes in source order, advances a row/column cursor, and grows the implicit
 * axis as needed.  It intentionally does not perform dense backtracking or
 * track sizing; `*-dense` is accepted as a valid flow and behaves as normal
 * flow until G-015 supplies the dense search.
 */

import type {
  GridAutoFlow,
  GridItemInput,
  GridItemStyle,
  GridLineRef,
  GridLayoutError,
  GridResolvedLineSet,
  GridResolvedPlacement,
  GridSnapshot,
  PlacementResult,
} from "./grid-model"
import { createGridError, isGridLayoutError } from "./grid-errors"
import { place as placeExplicit } from "./grid-placement"

const TRACK_LIMIT = 1024

type Axis = "row" | "column"
type Cell = `${number}:${number}`
type Cursor = { row: number; column: number }
type AxisSpan = { readonly span: number; readonly explicit: boolean }
type PlacementInput = GridItemInput & { readonly style: GridItemStyle }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)
}

function error(code: GridLayoutError["code"], path: string, nodeId: number): GridLayoutError {
  return createGridError(code, path, nodeId)
}

function autoFlow(value: unknown): { readonly axis: Axis; readonly dense: boolean } | GridLayoutError {
  if (value !== "row" && value !== "column" && value !== "row-dense" && value !== "column-dense") {
    return error("GRID_INVALID_VALUE", "gridAutoFlow", 0)
  }
  return { axis: value.startsWith("row") ? "row" : "column", dense: value.endsWith("-dense") }
}

function hasExplicitAxis(value: unknown): boolean {
  if (!isRecord(value)) return value !== undefined
  return definiteRef(value.start) || definiteRef(value.end)
}

function definiteRef(value: unknown): boolean {
  if (value === undefined || value === "auto") return false
  return !(isRecord(value) && Object.prototype.hasOwnProperty.call(value, "span"))
}

function areaAxisExplicit(style: GridItemStyle, axis: Axis): boolean {
  if (typeof style.area === "string") return true
  if (!style.area || !isRecord(style.area)) return false
  const start = axis === "row" ? style.area.rowStart : style.area.columnStart
  const end = axis === "row" ? style.area.rowEnd : style.area.columnEnd
  return definiteRef(start) || definiteRef(end)
}

function axisExplicit(style: GridItemStyle, axis: Axis): boolean {
  if (style.area !== undefined) return areaAxisExplicit(style, axis)
  return hasExplicitAxis(axis === "row" ? style.row : style.column)
}

function axisValue(style: GridItemStyle, axis: Axis): unknown {
  if (style.area !== undefined && typeof style.area !== "string" && isRecord(style.area)) {
    return axis === "row"
      ? { start: style.area.rowStart, end: style.area.rowEnd }
      : { start: style.area.columnStart, end: style.area.columnEnd }
  }
  return axis === "row" ? style.row : style.column
}

function spanOf(value: unknown): number | null {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, "span")) return null
  return isInteger(value.span) && value.span > 0 ? value.span : null
}

function desiredSpan(style: GridItemStyle, axis: Axis, fallback: number): number | GridLayoutError {
  const value = axisValue(style, axis)
  if (!isRecord(value)) return fallback
  const start = spanOf(value.start)
  const end = spanOf(value.end)
  if (start !== null && end !== null) return error("GRID_INVALID_PLACEMENT", axis === "row" ? "gridRow" : "gridColumn", 0)
  const span = start ?? end
  if (span === null) return fallback
  if (span > TRACK_LIMIT) return error("GRID_TRACK_LIMIT", axis === "row" ? "gridRow" : "gridColumn", 0)
  return span
}

function key(row: number, column: number): Cell {
  return `${row}:${column}`
}

function occupy(cells: Set<Cell>, placement: GridResolvedPlacement): void {
  for (let row = placement.rowStart; row < placement.rowEnd; row++) {
    for (let column = placement.columnStart; column < placement.columnEnd; column++) cells.add(key(row, column))
  }
}

function free(cells: ReadonlySet<Cell>, row: number, column: number, rowSpan: number, columnSpan: number): boolean {
  for (let y = row; y < row + rowSpan; y++) {
    for (let x = column; x < column + columnSpan; x++) {
      if (cells.has(key(y, x))) return false
    }
  }
  return true
}

function bounded(value: number, path: string, nodeId: number): number | GridLayoutError {
  if (value > TRACK_LIMIT) return error("GRID_TRACK_LIMIT", path, nodeId)
  return value
}

function placeAt(
  placements: GridResolvedPlacement[],
  index: number,
  row: number,
  column: number,
  rowSpan: number,
  columnSpan: number,
): void {
  const current = placements[index]
  placements[index] = Object.freeze({
    ...current,
    rowStart: row,
    rowEnd: row + rowSpan,
    columnStart: column,
    columnEnd: column + columnSpan,
  })
}

function scanRow(
  cells: ReadonlySet<Cell>,
  cursor: Cursor,
  rowCount: number,
  columnCount: number,
  rowSpan: number,
  columnSpan: number,
  fixedRow: number | null,
  fixedColumn: number | null,
  path: string,
  nodeId: number,
): { readonly row: number; readonly column: number; readonly rowCount: number; readonly columnCount: number } | GridLayoutError {
  let rows = Math.max(1, rowCount)
  let columns = Math.max(1, columnCount)
  let row = fixedRow ?? cursor.row
  let column = fixedColumn ?? cursor.column
  if (row < 0 || column < 0) return error("GRID_INVALID_PLACEMENT", path, nodeId)

  while (true) {
    if (fixedRow === null && row + rowSpan > rows) rows = row + rowSpan
    if (fixedColumn === null && column + columnSpan > columns) columns = column + columnSpan
    if (fixedColumn !== null && column + columnSpan > columns) {
      columns = column + columnSpan
    }
    if (fixedRow !== null && row + rowSpan > rows) rows = row + rowSpan
    const fits = free(cells, row, column, rowSpan, columnSpan)
    if (fits) {
      const validRows = bounded(rows, path, nodeId)
      if (isGridLayoutError(validRows)) return validRows
      const validColumns = bounded(columns, path, nodeId)
      if (isGridLayoutError(validColumns)) return validColumns
      return { row, column, rowCount: validRows, columnCount: validColumns }
    }

    if (fixedColumn !== null) {
      row++
      continue
    }
    if (fixedRow !== null) {
      column++
      continue
    }
    if (column + columnSpan >= columns) {
      row++
      column = 0
    } else column++
  }
}

function scanColumn(
  cells: ReadonlySet<Cell>,
  cursor: Cursor,
  rowCount: number,
  columnCount: number,
  rowSpan: number,
  columnSpan: number,
  fixedRow: number | null,
  fixedColumn: number | null,
  path: string,
  nodeId: number,
): { readonly row: number; readonly column: number; readonly rowCount: number; readonly columnCount: number } | GridLayoutError {
  let rows = Math.max(1, rowCount)
  let columns = Math.max(1, columnCount)
  let row = fixedRow ?? cursor.row
  let column = fixedColumn ?? cursor.column
  if (row < 0 || column < 0) return error("GRID_INVALID_PLACEMENT", path, nodeId)

  while (true) {
    if (fixedRow === null && row + rowSpan > rows) rows = row + rowSpan
    if (fixedColumn === null && column + columnSpan > columns) columns = column + columnSpan
    if (fixedRow !== null && row + rowSpan > rows) rows = row + rowSpan
    if (fixedColumn !== null && column + columnSpan > columns) columns = column + columnSpan
    if (free(cells, row, column, rowSpan, columnSpan)) {
      const validRows = bounded(rows, path, nodeId)
      if (isGridLayoutError(validRows)) return validRows
      const validColumns = bounded(columns, path, nodeId)
      if (isGridLayoutError(validColumns)) return validColumns
      return { row, column, rowCount: validRows, columnCount: validColumns }
    }

    if (fixedRow !== null) {
      column++
      continue
    }
    if (fixedColumn !== null) {
      row++
      continue
    }
    if (row + rowSpan >= rows) {
      column++
      row = 0
    } else row++
  }
}

function axisBounds(placement: GridResolvedPlacement, axis: Axis): { readonly start: number; readonly end: number } {
  return axis === "row"
    ? { start: placement.rowStart, end: placement.rowEnd }
    : { start: placement.columnStart, end: placement.columnEnd }
}

function fixedAxis(placement: GridResolvedPlacement, axis: Axis, explicit: boolean): number | null {
  if (!explicit) return null
  const bounds = axisBounds(placement, axis)
  return bounds.start
}

function orderFor(items: readonly PlacementInput[], placements: readonly GridResolvedPlacement[], flow: Axis): number[] {
  const fullyExplicit: number[] = []
  const mainExplicit: number[] = []
  const remaining: number[] = []
  for (let index = 0; index < items.length; index++) {
    const rowExplicit = axisExplicit(items[index].style, "row")
    const columnExplicit = axisExplicit(items[index].style, "column")
    if (rowExplicit && columnExplicit) fullyExplicit.push(index)
    else if (flow === "row" && columnExplicit || flow === "column" && rowExplicit) mainExplicit.push(index)
    else remaining.push(index)
  }
  // Keep source order inside each CSS placement phase.  The placement result
  // itself remains in source order regardless of this search order.
  return [...fullyExplicit, ...mainExplicit, ...remaining]
}

function autoPlaceOne(
  flow: Axis,
  dense: boolean,
  item: PlacementInput,
  placement: GridResolvedPlacement,
  index: number,
  placements: GridResolvedPlacement[],
  cells: Set<Cell>,
  cursor: Cursor,
  rowCount: number,
  columnCount: number,
  nodeId: number,
): { readonly rowCount: number; readonly columnCount: number } | GridLayoutError {
  const rowExplicit = axisExplicit(item.style, "row")
  const columnExplicit = axisExplicit(item.style, "column")
  const rowBounds = axisBounds(placement, "row")
  const columnBounds = axisBounds(placement, "column")
  const rowSpanValue = desiredSpan(item.style, "row", Math.max(1, rowBounds.end - rowBounds.start))
  if (isGridLayoutError(rowSpanValue)) return { ...rowSpanValue, nodeId: item.nodeId }
  const columnSpanValue = desiredSpan(item.style, "column", Math.max(1, columnBounds.end - columnBounds.start))
  if (isGridLayoutError(columnSpanValue)) return { ...columnSpanValue, nodeId: item.nodeId }
  const rowSpan = rowExplicit ? Math.max(1, rowBounds.end - rowBounds.start) : rowSpanValue
  const columnSpan = columnExplicit ? Math.max(1, columnBounds.end - columnBounds.start) : columnSpanValue
  const fixedRow = fixedAxis(placement, "row", rowExplicit)
  const fixedColumn = fixedAxis(placement, "column", columnExplicit)
  // A definite position on the non-flow axis starts its search at the first
  // explicit line.  Otherwise a preceding item fixed on the flow axis can
  // leave the cursor past the explicit grid and spuriously grow an implicit
  // track before this item is placed. Dense placement has its own search
  // implementation and keeps the legacy autoPlace compatibility behavior.
  if (!dense && flow === "row" && fixedRow !== null) cursor.column = 0
  if (!dense && flow === "column" && fixedColumn !== null) cursor.row = 0
  const path = `items[${index}]`
  const found = flow === "row"
    ? scanRow(cells, cursor, rowCount, columnCount, rowSpan, columnSpan, fixedRow, fixedColumn, path, nodeId)
    : scanColumn(cells, cursor, rowCount, columnCount, rowSpan, columnSpan, fixedRow, fixedColumn, path, nodeId)
  if (isGridLayoutError(found)) return found
  placeAt(placements, index, found.row, found.column, rowSpan, columnSpan)
  occupy(cells, placements[index])
  if (flow === "row") {
    cursor.row = found.row
    cursor.column = found.column + columnSpan
  } else {
    cursor.column = found.column
    cursor.row = found.row + rowSpan
  }
  return { rowCount: found.rowCount, columnCount: found.columnCount }
}

/** Resolve auto-placement in source order without dense backtracking. */
export function autoPlace(
  snapshot: GridSnapshot,
  lines: GridResolvedLineSet,
  items: readonly GridItemInput[],
): PlacementResult | GridLayoutError {
  const flow = autoFlow(snapshot?.style?.autoFlow)
  if (isGridLayoutError(flow)) return { ...flow, nodeId: snapshot?.nodeId ?? 0 }
  if (!snapshot || !lines || !Array.isArray(items)) return error("GRID_INVALID_PLACEMENT", "items", snapshot?.nodeId ?? 0)

  const explicit = placeExplicit(snapshot, lines, items)
  if (isGridLayoutError(explicit)) return explicit
  const sourceItems = items as readonly PlacementInput[]
  const placements = explicit.items.map((placement) => ({ ...placement }))
  const cells = new Set<Cell>()
  const order = orderFor(sourceItems, placements, flow.axis)
  for (const index of order) {
    const rowExplicit = axisExplicit(sourceItems[index].style, "row")
    const columnExplicit = axisExplicit(sourceItems[index].style, "column")
    if (rowExplicit && columnExplicit) occupy(cells, placements[index])
  }

  const cursor: Cursor = { row: 0, column: 0 }
  let rowCount = Math.max(1, explicit.rowCount)
  let columnCount = Math.max(1, explicit.columnCount)
  for (const index of order) {
    const rowExplicit = axisExplicit(sourceItems[index].style, "row")
    const columnExplicit = axisExplicit(sourceItems[index].style, "column")
    if (rowExplicit && columnExplicit) continue
    const result = autoPlaceOne(
      flow.axis,
      flow.dense,
      sourceItems[index],
      placements[index],
      index,
      placements,
      cells,
      cursor,
      rowCount,
      columnCount,
      snapshot.nodeId,
    )
    if (isGridLayoutError(result)) return result
    rowCount = result.rowCount
    columnCount = result.columnCount
  }

  return {
    items: Object.freeze(placements.map((placement) => Object.freeze(placement))),
    rowCount,
    columnCount,
  }
}

export const placeAuto = autoPlace
export const resolveAutoPlacement = autoPlace
export const place = autoPlace
export type { GridAutoFlow }
