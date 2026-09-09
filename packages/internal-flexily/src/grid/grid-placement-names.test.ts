import { describe, expect, it } from "bun:test"
import type { GridSnapshot, GridStyle, GridTrackState } from "./grid-model"
import { createExpandedAxes, createExpandedTracks } from "./grid-model"
import { isGridLayoutError } from "./grid-errors"
import { areaDimensions, resolveAreas } from "./grid-areas"
import { resolveLineReference, resolveLines } from "./grid-lines"

function state(base = 50): GridTrackState {
  return { min: base, max: base, base, growthLimit: base, offset: 0 }
}

function snapshot(overrides: Partial<GridStyle> = {}): GridSnapshot {
  const style: GridStyle = {
    columns: [50, 50, 50],
    rows: [50, 50],
    autoColumns: "auto",
    autoRows: "auto",
    autoFlow: "row",
    areas: [],
    gap: 10,
    justifyContent: "start",
    alignContent: "start",
    justifyItems: "stretch",
    alignItems: "stretch",
    ...overrides,
  }
  return { nodeId: 9, revision: 1, style }
}

function linesFor(input: GridSnapshot, columnCount = 3, rowCount = 2) {
  const expanded = createExpandedAxes(
    createExpandedTracks("columns", Array.from({ length: columnCount }, () => state()), columnCount),
    createExpandedTracks("rows", Array.from({ length: rowCount }, () => state()), rowCount),
  )
  const result = resolveLines(input, expanded)
  if (isGridLayoutError(result)) throw new Error(`${result.code}: ${result.path}`)
  return result
}

describe("Grid named lines and template areas", () => {
  it("indexes before/after names and repeated occurrences in source order", () => {
    const result = linesFor(snapshot({
      columns: [
        { size: 50, before: ["outer"], after: ["inner"] },
        { size: 50, before: ["inner"], after: ["outer"] },
        { size: 50, before: ["outer"], after: ["inner"] },
      ],
    }))

    expect(result.columns.names.get("outer")).toEqual([0, 2])
    expect(result.columns.names.get("inner")).toEqual([1, 3])
    expect(result.columns.positions).toEqual([0, 1, 2, 3])
  })

  it("resolves one-based and negative numeric lines plus named occurrences", () => {
    const result = linesFor(snapshot({ columns: [{ size: 50, before: ["main"] }, 50, { size: 50, after: ["main"] }] }))
    const columns = result.columns

    expect(resolveLineReference(columns, 1)).toBe(0)
    expect(resolveLineReference(columns, 3)).toBe(2)
    expect(resolveLineReference(columns, -1)).toBe(3)
    expect(resolveLineReference(columns, -2)).toBe(2)
    expect(resolveLineReference(columns, { name: "main" })).toBe(0)
    expect(resolveLineReference(columns, { name: "main", occurrence: 2 })).toBe(3)
    expect(resolveLineReference(columns, 0)).toMatchObject({ code: "GRID_INVALID_PLACEMENT" })
    expect(resolveLineReference(columns, { name: "missing" })).toMatchObject({ code: "GRID_LINE_UNRESOLVED" })
    expect(resolveLineReference(columns, { name: "main", occurrence: 0 })).toMatchObject({ code: "GRID_INVALID_PLACEMENT" })
  })

  it("turns a rectangular template into area rectangles and generated line names", () => {
    const areas = [
      ["header", "header", "header"],
      ["nav", null, "content"],
    ] as const
    const indexed = resolveAreas(areas, 9)
    if (isGridLayoutError(indexed)) throw new Error(`${indexed.code}: ${indexed.path}`)

    expect(indexed.get("header")).toEqual({ rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 3 })
    expect(indexed.get("nav")).toEqual({ rowStart: 1, rowEnd: 2, columnStart: 0, columnEnd: 1 })
    expect(indexed.get("content")).toEqual({ rowStart: 1, rowEnd: 2, columnStart: 2, columnEnd: 3 })
    expect(areaDimensions(indexed)).toEqual({ rows: 2, columns: 3 })

    const result = linesFor(snapshot({ areas }), 3, 2)
    expect(result.rows.names.get("header-start")).toEqual([0])
    expect(result.rows.names.get("header-end")).toEqual([1])
    expect(result.columns.names.get("header-start")).toEqual([0])
    expect(result.columns.names.get("header-end")).toEqual([3])
    expect(result.columns.names.get("content-start")).toEqual([2])
    expect(result.columns.names.get("content-end")).toEqual([3])
  })

  it("allows areas to extend a shorter explicit track list", () => {
    const result = linesFor(snapshot({
      columns: [50],
      rows: [50],
      areas: [["a", "a", "a"], ["b", null, "c"]],
    }), 1, 1)

    expect(result.columns.explicitCount).toBe(3)
    expect(result.rows.explicitCount).toBe(2)
    expect(result.columns.positions).toHaveLength(4)
    expect(result.rows.positions).toHaveLength(3)
    expect(result.columns.names.get("c-end")).toEqual([3])
  })

  it("keeps explicit dimensions even when template cells are null", () => {
    const result = linesFor(snapshot({ columns: [50], rows: [50], areas: [[null, null], [null, null]] }), 1, 1)
    expect(result.columns.positions).toHaveLength(3)
    expect(result.rows.positions).toHaveLength(3)
  })

  it("rejects ragged and disconnected area names with structured errors", () => {
    expect(resolveAreas([["a"], ["a", "a"]], 3)).toMatchObject({ code: "GRID_INVALID_AREA", nodeId: 3 })
    expect(resolveAreas([["a", null], [null, "a"]], 3)).toMatchObject({ code: "GRID_INVALID_AREA", nodeId: 3 })
    expect(resolveAreas([["a", "a"], ["a", "a"]], 3)).not.toMatchObject({ code: "GRID_INVALID_AREA" })
  })
})
