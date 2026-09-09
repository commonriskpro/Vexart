import { describe, expect, it } from "bun:test"
import type {
  ExpandedTracks,
  GridIntrinsicContribution,
  GridTrackSize,
  GridTrackState,
} from "./grid-model"
import { isGridLayoutError } from "./grid-errors"
import {
  distributeSpanGrowth,
  growSpans,
} from "./grid-span-growth"

function track(
  min: GridTrackSize,
  max: GridTrackSize = min,
  base = 0,
  growthLimit = Number.POSITIVE_INFINITY,
): GridTrackState {
  return { min, max, base, growthLimit, offset: 0 }
}

function axis(tracks: readonly GridTrackState[], name: "columns" | "rows" = "columns"): ExpandedTracks {
  return { axis: name, tracks, explicitCount: tracks.length }
}

function contribution(
  nodeId: number,
  start: number,
  end: number,
  minContent: number,
  minimum = 0,
): GridIntrinsicContribution {
  return {
    nodeId,
    axis: "columns",
    start,
    end,
    minContent,
    maxContent: Math.max(minContent, minimum),
    minimum,
    preferred: Math.max(minContent, minimum),
  }
}

describe("Grid spanning intrinsic growth", () => {
  it("processes spans in increasing order and accumulates each track once", () => {
    const result = distributeSpanGrowth({
      axis: "columns",
      tracks: axis([track("auto", "auto", 10), track("auto", "auto", 20), track("auto", "auto", 30)]),
      gap: 10,
      contributions: [
        contribution(30, 0, 3, 200),
        contribution(20, 1, 3, 100),
      ],
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    // The two-cell span is handled first: 20+30+10 gap => 40 extra.
    expect(result.allocations.map(({ nodeId }) => nodeId)).toEqual([20, 30])
    expect(result.allocations[0]).toMatchObject({ requested: 40, allocated: 40 })
    expect(result.allocations[0]?.tracks).toEqual(new Map([[1, 20], [2, 20]]))
    // The wider span sees the already-grown bases and only allocates its remainder.
    expect(result.allocations[1]).toMatchObject({ requested: 80, allocated: 80 })
    expect(result.tracks.tracks.map(({ base }) => base)).toEqual([10 + 80 / 3, 20 + 20 + 80 / 3, 30 + 20 + 80 / 3])
    expect(result.tracks.tracks.reduce((sum, value) => sum + value.base, 0) + 20).toBeCloseTo(200)
  })

  it("freezes tracks at their growth limits and redistributes the remainder", () => {
    const source = axis([
      track("auto", "auto", 20, 50),
      track("auto", "auto", 20, Number.POSITIVE_INFINITY),
      track("auto", "auto", 20, 40),
    ])
    const result = distributeSpanGrowth({
      axis: "columns",
      tracks: source,
      gap: 5,
      contributions: [contribution(40, 0, 3, 180)],
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    expect(result.tracks.tracks.map(({ base, growthLimit }) => [base, growthLimit])).toEqual([
      [50, 50],
      [80, Number.POSITIVE_INFINITY],
      [40, 40],
    ])
    expect(result.frozen).toEqual([0, 2])
    expect(result.allocations[0]?.tracks.get(0)).toBeCloseTo(30)
    expect(result.allocations[0]?.tracks.get(1)).toBeCloseTo(60)
    expect(result.allocations[0]?.tracks.get(2)).toBeCloseTo(20)
    // Growth is transactional: the input remains unchanged.
    expect(source.tracks.map(({ base }) => base)).toEqual([20, 20, 20])
  })

  it("lets an intrinsic minimum on a flexible track absorb span growth, not final fr sizing", () => {
    const result = growSpans(
      "columns",
      axis([
        track({ minmax: ["auto", { fr: 1 }] }, { minmax: ["auto", { fr: 1 }] }, 10),
        track({ fr: 1 }, { fr: 1 }, 25),
      ]),
      [contribution(50, 0, 2, 100)],
    )
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    expect(result.tracks.tracks.map(({ base }) => base)).toEqual([75, 25])
    expect(result.allocations[0]?.tracks).toEqual(new Map([[0, 65]]))
  })

  it("uses the minimum contribution and skips span=1 items", () => {
    const result = distributeSpanGrowth({
      axis: "columns",
      tracks: axis([track("auto", "auto", 20), track("auto", "auto", 20)]),
      contributions: [
        contribution(60, 0, 1, 100),
        contribution(61, 0, 2, 10, 100),
      ],
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.allocations).toHaveLength(1)
    expect(result.allocations[0]).toMatchObject({ nodeId: 61, requested: 60, allocated: 60 })
    expect(result.tracks.tracks.map(({ base }) => base)).toEqual([50, 50])
  })

  it("does not grow a span with no eligible tracks", () => {
    const result = distributeSpanGrowth({
      axis: "rows",
      tracks: {
        axis: "rows",
        explicitCount: 2,
        tracks: [track(40, 40, 40, 40), track({ fr: 1 }, { fr: 1 }, 20)],
      },
      contributions: [{ ...contribution(70, 0, 2, 200), axis: "rows" }],
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.tracks.tracks.map(({ base }) => base)).toEqual([40, 20])
    expect(result.allocations[0]).toMatchObject({ requested: 140, allocated: 0 })
  })

  it("returns typed errors atomically for malformed spans and the track limit", () => {
    const source = axis([track("auto", "auto", 20)])
    const malformed = distributeSpanGrowth({
      axis: "columns",
      tracks: source,
      contributions: [contribution(80, 0, 2, 40)],
    })
    expect(malformed).toMatchObject({ code: "GRID_INVALID_PLACEMENT", path: "contributions[0]", nodeId: 80 })
    expect(source.tracks[0]?.base).toBe(20)

    const tooMany = axis(Array.from({ length: 1025 }, () => track("auto")))
    const limited = distributeSpanGrowth({ axis: "columns", tracks: tooMany, contributions: [] })
    expect(limited).toMatchObject({ code: "GRID_TRACK_LIMIT", path: "columns" })
  })
})
