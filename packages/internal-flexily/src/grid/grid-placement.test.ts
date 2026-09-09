import { describe, expect, it } from "bun:test"
import type {
  GridItemInput,
  GridSnapshot,
  GridStyle,
  GridTrackState,
} from "./grid-model"
import { createExpandedAxes, createExpandedTracks } from "./grid-model"
import { isGridLayoutError } from "./grid-errors"
import { place, occupancy } from "./grid-placement"
import { resolveLines } from "./grid-lines"

function state(): GridTrackState {
  return { min: 50, max: 50, base: 50, growthLimit: 50, offset: 0 }
}

function snapshot(overrides: Partial<GridStyle> = {}): GridSnapshot {
  const style: GridStyle = {
    columns: [50, 50, 50],
    rows: [50, 50, 50],
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
  return { nodeId: 1, revision: 1, style }
}

function lineSet(input: GridSnapshot) {
  const expanded = createExpandedAxes(
    createExpandedTracks("columns", [state(), state(), state()], 3),
    createExpandedTracks("rows", [state(), state(), state()], 3),
  )
  const result = resolveLines(input, expanded)
  if (isGridLayoutError(result)) throw new Error(`${result.code}: ${result.path}`)
  return result
}

function placed(input: GridSnapshot, items: readonly GridItemInput[]) {
  const result = place(input, lineSet(input), items)
  if (isGridLayoutError(result)) throw new Error(`${result.code}: ${result.path}`)
  return result
}

describe("Grid explicit placement", () => {
  it("resolves both axes with one-based and negative line references", () => {
    const result = placed(snapshot(), [{
      nodeId: 10,
      style: {
        row: { start: 1, end: 3 },
        column: { start: -2, end: -1 },
      },
    }])
    expect(result.items).toEqual([{ nodeId: 10, rowStart: 0, rowEnd: 2, columnStart: 2, columnEnd: 3 }])
  })

  it("resolves spans and named span occurrences", () => {
    const input = snapshot({ columns: [
      { size: 50, before: ["main"] },
      { size: 50, before: ["main"] },
      { size: 50, after: ["main"] },
    ] })
    const result = placed(input, [
      { nodeId: 11, style: { column: { start: 1, end: { span: 2 } } } },
      { nodeId: 12, style: { column: { start: { name: "main" }, end: { span: 2, name: "main" } } } },
    ])
    expect(result.items[0]).toMatchObject({ columnStart: 0, columnEnd: 2 })
    expect(result.items[1]).toMatchObject({ columnStart: 0, columnEnd: 3 })
  })

  it("supports partial placement without running an auto-placement cursor", () => {
    const result = placed(snapshot(), [{ nodeId: 13, style: { column: { start: 2, end: 3 } } }])
    expect(result.items[0]).toEqual({ nodeId: 13, rowStart: 0, rowEnd: 1, columnStart: 1, columnEnd: 2 })
  })

  it("uses named grid areas and four-line area objects", () => {
    const input = snapshot({ areas: [
      ["header", "header", "header"],
      ["nav", null, "content"],
      ["nav", null, "content"],
    ] })
    const result = placed(input, [
      { nodeId: 14, style: { area: "header" } },
      { nodeId: 15, style: { area: { rowStart: 2, rowEnd: 4, columnStart: 1, columnEnd: 2 } } },
    ])
    expect(result.items[0]).toMatchObject({ rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 3 })
    expect(result.items[1]).toMatchObject({ rowStart: 1, rowEnd: 3, columnStart: 0, columnEnd: 1 })
  })

  it("rejects explicit lines combined with an area", () => {
    const input = snapshot({ areas: [["header"]], columns: [50], rows: [50] })
    const result = place(input, lineSet(input), [{
      nodeId: 16,
      style: { area: "header", row: { start: 1, end: 2 } },
    }])
    expect(result).toMatchObject({ code: "GRID_CONFLICTING_PLACEMENT", nodeId: 16 })
  })

  it("allows explicit overlap while exposing de-duplicated occupancy", () => {
    const result = placed(snapshot(), [
      { nodeId: 17, style: { row: { start: 1, end: 2 }, column: { start: 1, end: 3 } } },
      { nodeId: 18, style: { row: { start: 1, end: 2 }, column: { start: 2, end: 3 } } },
    ])
    expect(result.items).toHaveLength(2)
    expect(occupancy(result.items)).toEqual(new Set(["0:0", "0:1"]))
  })

  it("creates bounded implicit lines for unknown named line references", () => {
    const result = placed(snapshot(), [{ nodeId: 19, style: { column: { start: { name: "implicit" }, end: { span: 1 } } } }])
    expect(result.items[0].columnStart).toBe(4)
    expect(result.items[0].columnEnd).toBe(5)
    expect(result.columnCount).toBe(5)
  })

  it("returns deterministic errors for invalid spans, occurrence zero, and unknown areas", () => {
    const input = snapshot({ areas: [["header"]], columns: [50], rows: [50] })
    expect(place(input, lineSet(input), [{ nodeId: 20, style: { column: { start: { span: 0 }, end: 2 } } }])).toMatchObject({ code: "GRID_INVALID_PLACEMENT", nodeId: 20 })
    expect(place(input, lineSet(input), [{ nodeId: 21, style: { column: { start: { name: "main", occurrence: 0 } } } }])).toMatchObject({ code: "GRID_INVALID_PLACEMENT", nodeId: 21 })
    expect(place(input, lineSet(input), [{ nodeId: 22, style: { area: "missing" } }])).toMatchObject({ code: "GRID_LINE_UNRESOLVED", nodeId: 22 })
  })
})
