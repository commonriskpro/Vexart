import { describe, expect, it } from "bun:test"
import type {
  GridExpandedAxes,
  GridResolvedLineSet,
  GridSnapshot,
  GridStyle,
  GridTrackState,
  PlacementResult,
} from "./grid-model"
import { createExpandedAxes, createExpandedTracks, createResolvedLineSet, createResolvedLines } from "./grid-model"
import { isGridLayoutError } from "./grid-errors"
import { expandImplicitAxis, expandImplicitLines, expandImplicitTracks, extendImplicitAxisLines, extendImplicitLines } from "./grid-implicit"

function state(size: GridTrackState["min"] = 40): GridTrackState {
  return { min: size, max: size, base: 40, growthLimit: 40, offset: 0 }
}

function snapshot(overrides: Partial<GridStyle> = {}): GridSnapshot {
  const style: GridStyle = {
    columns: [40, 40],
    rows: [30],
    autoColumns: 70,
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
  return { nodeId: 7, revision: 1, style }
}

function axes(columns = 2, rows = 1): GridExpandedAxes {
  return createExpandedAxes(
    createExpandedTracks("columns", Array.from({ length: columns }, () => state(40)), columns),
    createExpandedTracks("rows", Array.from({ length: rows }, () => state(30)), rows),
  )
}

function placement(rowCount: number, columnCount: number, items: PlacementResult["items"] = []): PlacementResult {
  return { rowCount, columnCount, items }
}

function lines(columns = 2, rows = 1): GridResolvedLineSet {
  return createResolvedLineSet(
    createResolvedLines("columns", Array.from({ length: columns + 1 }, (_, index) => index * 40), new Map([["start", [0]]]), columns),
    createResolvedLines("rows", Array.from({ length: rows + 1 }, (_, index) => index * 30), new Map(), rows),
  )
}

describe("implicit grid tracks", () => {
  it("materializes columns and rows requested outside the explicit grid", () => {
    const result = expandImplicitTracks(snapshot(), axes(), placement(3, 4))
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    expect(result.columns.tracks).toHaveLength(4)
    expect(result.rows.tracks).toHaveLength(3)
    expect(result.columns.tracks.slice(2).map((track) => track.min)).toEqual([70, 70])
    expect(result.rows.tracks.slice(1).map((track) => track.min)).toEqual(["auto", "auto"])
    expect(result.columns.explicitCount).toBe(2)
    expect(result.rows.explicitCount).toBe(1)
  })

  it("uses auto for a missing auto-track declaration", () => {
    const input = snapshot({ autoRows: undefined as never })
    const result = expandImplicitAxis(input, "rows", axes().rows, 3)
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.tracks.slice(1).map((track) => track.min)).toEqual(["auto", "auto"])
  })

  it("derives demand from item end coordinates when counts are stale", () => {
    const result = expandImplicitTracks(snapshot(), axes(), placement(1, 1, [{
      nodeId: 20,
      rowStart: 0,
      rowEnd: 2,
      columnStart: 1,
      columnEnd: 3,
    }]))
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.rows.tracks).toHaveLength(2)
    expect(result.columns.tracks).toHaveLength(3)
  })

  it("extends line placeholders without changing existing values or names", () => {
    const input = lines()
    const result = extendImplicitLines(input, axes(4, 3), 7)
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.columns.positions).toEqual([0, 40, 80, 120, 160])
    expect(result.rows.positions).toEqual([0, 30, 60, 90])
    expect(result.columns.names.get("start")).toEqual([0])
    expect(result.columns.names).not.toBe(input.columns.names)
    expect(input.columns.positions).toEqual([0, 40, 80])
  })

  it("returns an atomic track-limit error without truncating either axis", () => {
    const input = axes(2, 1)
    const beforeColumns = input.columns.tracks
    const beforeRows = input.rows.tracks
    const result = expandImplicitTracks(snapshot(), input, placement(1025, 2))
    expect(result).toEqual({ code: "GRID_TRACK_LIMIT", path: "rows", nodeId: 7 })
    expect(input.columns.tracks).toBe(beforeColumns)
    expect(input.rows.tracks).toBe(beforeRows)
    expect(input.columns.tracks).toHaveLength(2)
    expect(input.rows.tracks).toHaveLength(1)
  })

  it("rejects malformed placement extents instead of publishing tracks", () => {
    const result = expandImplicitTracks(snapshot(), axes(), placement(1, 2, [{
      nodeId: 30,
      rowStart: -1,
      rowEnd: 1,
      columnStart: 0,
      columnEnd: 1,
    }]))
    expect(result).toEqual({ code: "GRID_INVALID_PLACEMENT", path: "items[0]", nodeId: 7 })
  })

  it("can extend one resolved axis in isolation", () => {
    const result = extendImplicitAxisLines(lines().columns, 4, 7)
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.positions).toHaveLength(5)
  })
})

// The alias is part of the internal seam and should stay equivalent to the
// named implementation used by staged callers.
expect(expandImplicitLines).toBe(extendImplicitLines)
