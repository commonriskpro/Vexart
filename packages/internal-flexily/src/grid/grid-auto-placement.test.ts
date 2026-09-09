import { describe, expect, it } from "bun:test"
import type { GridItemInput, GridSnapshot, GridStyle, GridTrackState } from "./grid-model"
import { createExpandedAxes, createExpandedTracks } from "./grid-model"
import { isGridLayoutError } from "./grid-errors"
import { resolveLines } from "./grid-lines"
import { autoPlace } from "./grid-auto-placement"

function state(): GridTrackState {
  return { min: 40, max: 40, base: 40, growthLimit: 40, offset: 0 }
}

function snapshot(overrides: Partial<GridStyle> = {}): GridSnapshot {
  const style: GridStyle = {
    columns: [40, 40, 40],
    rows: [40, 40],
    autoColumns: "auto",
    autoRows: "auto",
    autoFlow: "row",
    areas: [],
    gap: 0,
    justifyContent: "start",
    alignContent: "start",
    justifyItems: "stretch",
    alignItems: "stretch",
    ...overrides,
  }
  return { nodeId: 1, revision: 1, style }
}

function lines(input: GridSnapshot, columns = 3, rows = 2) {
  const expanded = createExpandedAxes(
    createExpandedTracks("columns", Array.from({ length: columns }, state), columns),
    createExpandedTracks("rows", Array.from({ length: rows }, state), rows),
  )
  const result = resolveLines(input, expanded)
  if (isGridLayoutError(result)) throw new Error(`${result.code}: ${result.path}`)
  return result
}

function place(input: GridSnapshot, items: readonly GridItemInput[], columns = 3, rows = 2) {
  const result = autoPlace(input, lines(input, columns, rows), items)
  if (isGridLayoutError(result)) throw new Error(`${result.code}: ${result.path}`)
  return result
}

describe("Grid row/column auto-placement", () => {
  it("uses a row cursor, preserves source order, and skips occupied cells", () => {
    const result = place(snapshot(), [
      { nodeId: 10, style: { row: { start: 1, end: 2 }, column: { start: 1, end: { span: 2 } } } },
      { nodeId: 11, style: { row: { start: "auto", end: { span: 1 } }, column: { start: "auto", end: { span: 2 } } } },
      { nodeId: 12, style: {} },
    ])

    expect(result.items.map(({ nodeId, rowStart, rowEnd, columnStart, columnEnd }) => ({ nodeId, rowStart, rowEnd, columnStart, columnEnd }))).toEqual([
      { nodeId: 10, rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 2 },
      { nodeId: 11, rowStart: 1, rowEnd: 2, columnStart: 0, columnEnd: 2 },
      { nodeId: 12, rowStart: 1, rowEnd: 2, columnStart: 2, columnEnd: 3 },
    ])
    expect(result.rowCount).toBe(2)
    expect(result.columnCount).toBe(3)
  })

  it("mirrors the cursor down rows for column auto-flow", () => {
    const result = place(snapshot({ autoFlow: "column" }), [
      { nodeId: 20, style: { row: { start: 1, end: 3 }, column: { start: 1, end: 2 } } },
      { nodeId: 21, style: { row: { start: "auto", end: { span: 1 } }, column: { start: "auto", end: { span: 1 } } } },
      { nodeId: 22, style: {} },
    ])

    expect(result.items[0]).toMatchObject({ rowStart: 0, rowEnd: 2, columnStart: 0, columnEnd: 1 })
    expect(result.items[1]).toMatchObject({ rowStart: 0, rowEnd: 1, columnStart: 1, columnEnd: 2 })
    expect(result.items[2]).toMatchObject({ rowStart: 1, rowEnd: 2, columnStart: 1, columnEnd: 2 })
  })

  it("places an item with one definite axis while expanding the other axis", () => {
    const result = place(snapshot({ columns: [40], rows: [40] }), [
      { nodeId: 30, style: { column: { start: 1, end: 2 }, row: {} } },
      { nodeId: 31, style: { column: { start: 1, end: 2 }, row: {} } },
    ], 1, 1)

    expect(result.items[0]).toMatchObject({ rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 1 })
    expect(result.items[1]).toMatchObject({ rowStart: 1, rowEnd: 2, columnStart: 0, columnEnd: 1 })
    expect(result.rowCount).toBe(2)
  })

  it("expands implicit columns for an auto span wider than the explicit grid", () => {
    const result = place(snapshot({ columns: [40], rows: [40] }), [
      { nodeId: 40, style: { column: { end: { span: 3 } }, row: {} } },
    ], 1, 1)
    expect(result.items[0]).toMatchObject({ rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 3 })
    expect(result.columnCount).toBe(3)
  })

  it("fails invalid auto-flow before invoking placement or publishing items", () => {
    const input = snapshot({ autoFlow: "diagonal" as never })
    const result = autoPlace(input, lines(snapshot()), [{ nodeId: 50, style: {} }])
    expect(result).toEqual({ code: "GRID_INVALID_VALUE", path: "gridAutoFlow", nodeId: 1 })
  })

  it("accepts dense as a valid flow but leaves dense backtracking to G-015", () => {
    const result = place(snapshot({ autoFlow: "row-dense" }), [{ nodeId: 60, style: {} }])
    expect(result.items[0]).toMatchObject({ rowStart: 0, columnStart: 0 })
  })
})
