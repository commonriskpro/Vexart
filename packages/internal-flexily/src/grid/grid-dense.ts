/**
 * Dense Grid auto-placement.
 *
 * Dense placement repeats the normal row/column search from the beginning of
 * the implicit grid for every unresolved item.  That fills holes left by
 * earlier spans, while the returned list stays in source order.  This module
 * does not implement `order`, masonry, or track sizing.
 */

import type {
  GridAutoFlow,
  GridItemInput,
  GridItemStyle,
  GridLayoutError,
  GridResolvedLineSet,
  GridResolvedPlacement,
  GridSnapshot,
  PlacementResult,
} from "./grid-model"
import { createGridError, isGridLayoutError } from "./grid-errors"
import { place as placeExplicit } from "./grid-placement"

const TRACK_LIMIT = 1024

type FlowAxis = "row" | "column"
type Cell = `${number}:${number}`
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

function flowAxis(value: unknown): { readonly axis: FlowAxis; readonly dense: boolean } | GridLayoutError {
  if (value !== "row" && value !== "column" && value !== "row-dense" && value !== "column-dense") {
    return error("GRID_INVALID_VALUE", "gridAutoFlow", 0)
  }
  return { axis: value.startsWith("row") ? "row" : "column", dense: value.endsWith("-dense") }
}

function definiteRef(value: unknown): boolean {
  if (value === undefined || value === "auto") return false
  return !(isRecord(value) && Object.prototype.hasOwnProperty.call(value, "span"))
}

function explicitAxis(value: unknown): boolean {
  if (!isRecord(value)) return value !== undefined
  return definiteRef(value.start) || definiteRef(value.end)
}

function areaAxisExplicit(style: GridItemStyle, axis: FlowAxis): boolean {
  if (typeof style.area === "string") return true
  if (!style.area || !isRecord(style.area)) return false
  const start = axis === "row" ? style.area.rowStart : style.area.columnStart
  const end = axis === "row" ? style.area.rowEnd : style.area.columnEnd
  return definiteRef(start) || definiteRef(end)
}

function axisExplicit(style: GridItemStyle, axis: FlowAxis): boolean {
  if (style.area !== undefined) return areaAxisExplicit(style, axis)
  return explicitAxis(axis === "row" ? style.row : style.column)
}

function axisValue(style: GridItemStyle, axis: FlowAxis): unknown {
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

function desiredSpan(style: GridItemStyle, axis: FlowAxis, fallback: number, nodeId: number): number | GridLayoutError {
  const value = axisValue(style, axis)
  if (!isRecord(value)) return fallback
  const start = spanOf(value.start)
  const end = spanOf(value.end)
  if (start !== null && end !== null) return error("GRID_INVALID_PLACEMENT", axis === "row" ? "gridRow" : "gridColumn", nodeId)
  const span = start ?? end
  if (span === null) return fallback
  if (span > TRACK_LIMIT) return error("GRID_TRACK_LIMIT", axis === "row" ? "gridRow" : "gridColumn", nodeId)
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

function bounds(placement: GridResolvedPlacement, axis: FlowAxis): { readonly start: number; readonly end: number } {
  return axis === "row"
    ? { start: placement.rowStart, end: placement.rowEnd }
    : { start: placement.columnStart, end: placement.columnEnd }
}

function orderFor(items: readonly PlacementInput[], flow: FlowAxis): number[] {
  const definite: number[] = []
  const main: number[] = []
  const rest: number[] = []
  for (let index = 0; index < items.length; index++) {
    const row = axisExplicit(items[index].style, "row")
    const column = axisExplicit(items[index].style, "column")
    if (row && column) definite.push(index)
    else if (flow === "row" && column || flow === "column" && row) main.push(index)
    else rest.push(index)
  }
  return [...definite, ...main, ...rest]
}

function placeAt(
  placements: GridResolvedPlacement[],
  index: number,
  row: number,
  column: number,
  rowSpan: number,
  columnSpan: number,
): void {
  placements[index] = Object.freeze({
    ...placements[index],
    rowStart: row,
    rowEnd: row + rowSpan,
    columnStart: column,
    columnEnd: column + columnSpan,
  })
}

function scanDense(
  flow: FlowAxis,
  cells: ReadonlySet<Cell>,
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
  let row = fixedRow ?? 0
  let column = fixedColumn ?? 0
  if (row < 0 || column < 0) return error("GRID_INVALID_PLACEMENT", path, nodeId)

  while (true) {
    if (row + rowSpan > rows) rows = row + rowSpan
    if (column + columnSpan > columns) columns = column + columnSpan
    if (free(cells, row, column, rowSpan, columnSpan)) {
      if (rows > TRACK_LIMIT || columns > TRACK_LIMIT) return error("GRID_TRACK_LIMIT", path, nodeId)
      return { row, column, rowCount: rows, columnCount: columns }
    }

    if (flow === "row") {
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
    } else {
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
}

function autoPlaceOne(
  flow: FlowAxis,
  item: PlacementInput,
  placement: GridResolvedPlacement,
  index: number,
  placements: GridResolvedPlacement[],
  cells: Set<Cell>,
  rowCount: number,
  columnCount: number,
): { readonly rowCount: number; readonly columnCount: number } | GridLayoutError {
  const rowExplicit = axisExplicit(item.style, "row")
  const columnExplicit = axisExplicit(item.style, "column")
  const row = bounds(placement, "row")
  const column = bounds(placement, "column")
  const rowSpanResult = desiredSpan(item.style, "row", Math.max(1, row.end - row.start), item.nodeId)
  if (isGridLayoutError(rowSpanResult)) return rowSpanResult
  const columnSpanResult = desiredSpan(item.style, "column", Math.max(1, column.end - column.start), item.nodeId)
  if (isGridLayoutError(columnSpanResult)) return columnSpanResult
  const rowSpan = rowExplicit ? Math.max(1, row.end - row.start) : rowSpanResult
  const columnSpan = columnExplicit ? Math.max(1, column.end - column.start) : columnSpanResult
  const fixedRow = rowExplicit ? row.start : null
  const fixedColumn = columnExplicit ? column.start : null
  const found = scanDense(flow, cells, rowCount, columnCount, rowSpan, columnSpan, fixedRow, fixedColumn, `items[${index}]`, item.nodeId)
  if (isGridLayoutError(found)) return found
  placeAt(placements, index, found.row, found.column, rowSpan, columnSpan)
  occupy(cells, placements[index])
  return { rowCount: found.rowCount, columnCount: found.columnCount }
}

/** Place `row-dense`/`column-dense` items by searching from the first cell. */
export function densePlace(
  snapshot: GridSnapshot,
  lines: GridResolvedLineSet,
  items: readonly GridItemInput[],
): PlacementResult | GridLayoutError {
  const flow = flowAxis(snapshot?.style?.autoFlow)
  if (isGridLayoutError(flow)) return { ...flow, nodeId: snapshot?.nodeId ?? 0 }
  if (!flow.dense) return error("GRID_INVALID_VALUE", "gridAutoFlow", snapshot?.nodeId ?? 0)
  if (!snapshot || !lines || !Array.isArray(items)) return error("GRID_INVALID_PLACEMENT", "items", snapshot?.nodeId ?? 0)

  const explicit = placeExplicit(snapshot, lines, items)
  if (isGridLayoutError(explicit)) return explicit
  const sourceItems = items as readonly PlacementInput[]
  const placements = explicit.items.map((placement) => ({ ...placement }))
  const cells = new Set<Cell>()
  const order = orderFor(sourceItems, flow.axis)
  for (const index of order) {
    if (axisExplicit(sourceItems[index].style, "row") && axisExplicit(sourceItems[index].style, "column")) occupy(cells, placements[index])
  }

  let rowCount = Math.max(1, explicit.rowCount)
  let columnCount = Math.max(1, explicit.columnCount)
  for (const index of order) {
    const rowExplicit = axisExplicit(sourceItems[index].style, "row")
    const columnExplicit = axisExplicit(sourceItems[index].style, "column")
    if (rowExplicit && columnExplicit) continue
    const result = autoPlaceOne(flow.axis, sourceItems[index], placements[index], index, placements, cells, rowCount, columnCount)
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

export const placeDense = densePlace
export const resolveDensePlacement = densePlace
export const dense = densePlace
export type { GridAutoFlow }
