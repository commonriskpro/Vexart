import { describe, expect, it } from "bun:test"
import type {
  AxisSizingResult,
  ExpandedTracks,
  GridAvailableSpace,
  GridResolvedRect,
  GridResolvedPlacement,
  GridStyle,
  GridTrackSize,
  GridTrackState,
} from "./grid-model"
import { isGridLayoutError } from "./grid-errors"
import { align, alignAxis, alignTracks } from "./grid-alignment"

function state(min: GridTrackSize, max: GridTrackSize = min, base = 0, growthLimit = Number.POSITIVE_INFINITY): GridTrackState {
  return { min, max, base, growthLimit, offset: 0 }
}

function axis(tracks: readonly GridTrackState[], name: "columns" | "rows" = "columns"): ExpandedTracks {
  return { axis: name, tracks, explicitCount: tracks.length }
}

function sizing(tracks: readonly GridTrackState[], name: "columns" | "rows" = "columns"): AxisSizingResult {
  return { axis: name, tracks, lines: [] }
}

function definite(px: number): GridAvailableSpace {
  return { kind: "definite", px }
}

function expectAxis(result: ReturnType<typeof alignTracks>): Exclude<typeof result, { code: string }> {
  expect(isGridLayoutError(result)).toBe(false)
  if (isGridLayoutError(result)) throw new Error(result.code)
  return result
}

const style = (justifyContent: GridStyle["justifyContent"] = "stretch", alignContent: GridStyle["alignContent"] = "stretch"): GridStyle => ({
  columns: [],
  rows: [],
  autoColumns: "auto",
  autoRows: "auto",
  autoFlow: "row",
  areas: [],
  gap: 10,
  justifyContent,
  alignContent,
  justifyItems: "stretch",
  alignItems: "stretch",
})

const placement: GridResolvedPlacement = {
  nodeId: 1,
  rowStart: 0,
  rowEnd: 1,
  columnStart: 0,
  columnEnd: 1,
}

const box: GridResolvedRect = { nodeId: 1, x: 0, y: 0, width: 50, height: 20 }

describe("Grid track alignment", () => {
  it("centers sized tracks without changing their bases", () => {
    const result = expectAxis(alignTracks({
      axis: "columns",
      tracks: axis([state(50, 50, 50), state(50, 50, 50)]),
      available: definite(300),
      gap: 10,
      alignment: "center",
    }))

    expect(result.tracks.map(({ base }) => base)).toEqual([50, 50])
    expect(result.tracks.map(({ offset }) => offset)).toEqual([95, 155])
    expect(result.lines).toEqual([95, 145, 155, 205])
    expect(result.gap).toBe(10)
    expect(result.leading).toBe(95)
  })

  it("uses positional start/end and preserves overflow without negative offsets", () => {
    const start = expectAxis(alignAxis("columns", axis([state(80, 80, 80), state(40, 40, 40)]), 100, 10, "start"))
    const end = expectAxis(alignAxis("columns", axis([state(80, 80, 80), state(40, 40, 40)]), 100, 10, "end"))

    expect(start.lines).toEqual([0, 80, 90, 130])
    expect(end.lines).toEqual([0, 80, 90, 130])
    expect(start.overflow).toBe(30)
    expect(end.overflow).toBe(30)
  })

  it("changes only effective gutters for space-* alignment", () => {
    const source = axis([state(50, 50, 50), state(50, 50, 50)])
    const between = expectAxis(alignTracks({ axis: "columns", tracks: source, available: 300, gap: 10, alignment: "space-between" }))
    const around = expectAxis(alignTracks({ axis: "columns", tracks: source, available: 300, gap: 10, alignment: "space-around" }))
    const evenly = expectAxis(alignTracks({ axis: "columns", tracks: source, available: 300, gap: 10, alignment: "space-evenly" }))

    expect(between.tracks.map(({ base }) => base)).toEqual([50, 50])
    expect(between.lines).toEqual([0, 50, 250, 300])
    expect(between.gap).toBe(200)
    expect(around.gap).toBe(105)
    expect(around.leading).toBe(47.5)
    expect(evenly.gap).toBeCloseTo(73.33333333333333)
    expect(evenly.leading).toBeCloseTo(63.33333333333333)
  })

  it("stretches only auto tracks, respecting a finite cap", () => {
    const result = expectAxis(alignTracks({
      axis: "columns",
      tracks: axis([
        state("auto", "auto", 20),
        state(50, 50, 50),
        state("auto", "auto", 10, 80),
      ]),
      available: 300,
      gap: 10,
      alignment: "stretch",
    }))

    // 210px is free before stretch.  The capped auto track receives 70px and
    // the other auto track receives the rest; the fixed track is untouched.
    expect(result.tracks.map(({ base }) => base)).toEqual([150, 50, 80])
    expect(result.lines).toEqual([0, 150, 160, 210, 220, 300])
    expect(result.gap).toBe(10)
  })

  it("does not invent free space for an indefinite axis", () => {
    const result = expectAxis(alignTracks({
      axis: "rows",
      tracks: axis([state(30, 30, 30), state(40, 40, 40)], "rows"),
      available: { kind: "indefinite", constraint: "max-content" },
      gap: 10,
      alignment: "center",
    }))

    expect(result.freeSpace).toBeNull()
    expect(result.lines).toEqual([0, 30, 40, 80])
    expect(result.tracks.map(({ base }) => base)).toEqual([30, 40])
  })

  it("resolves padding once from the content box", () => {
    const result = expectAxis(alignTracks({
      axis: "columns",
      tracks: axis([state(50, 50, 50), state(50, 50, 50)]),
      available: { available: 340, padding: 20, gap: 10 },
      gap: 10,
      alignment: "center",
    }))

    // Outer 340 - 40px padding = 300px content box.  The lines include the
    // 20px content origin; gap is subtracted only while computing occupancy.
    expect(result.lines).toEqual([115, 165, 175, 225])
  })

  it("aligns both axes and leaves item sizing/writeback for the next stage", () => {
    const result = align({
      rows: sizing([state(20, 20, 20)], "rows"),
      columns: sizing([state(50, 50, 50), state(50, 50, 50)]),
      style: style("center", "end"),
      available: { columns: 300, rows: 100 },
      items: [placement],
      itemSizes: [box],
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    expect(result.columns.lines).toEqual([95, 145, 155, 205])
    expect(result.rows.lines).toEqual([80, 100])
    expect(result.boxes).toEqual([box])
    expect(result.items).toEqual([placement])
  })

  it("reports unsupported baseline and auto margins as typed errors", () => {
    const baseline = align({
      rows: sizing([state(20, 20, 20)], "rows"),
      columns: sizing([state(50, 50, 50)]),
      style: style("baseline" as GridStyle["justifyContent"]),
      available: 100,
      items: [placement],
      itemSizes: [box],
    })
    const margins = align({
      rows: sizing([state(20, 20, 20)], "rows"),
      columns: sizing([state(50, 50, 50)]),
      style: style(),
      available: 100,
      margins: { left: "auto" },
      items: [placement],
      itemSizes: [box],
    })

    expect(baseline).toMatchObject({ code: "GRID_UNSUPPORTED_ALIGNMENT", path: "justifyContent" })
    expect(margins).toMatchObject({ code: "GRID_UNSUPPORTED_ALIGNMENT", path: "margins" })
  })
})
