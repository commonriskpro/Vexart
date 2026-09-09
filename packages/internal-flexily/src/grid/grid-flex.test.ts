import { describe, expect, it } from "bun:test"
import type {
  ExpandedTracks,
  GridAvailableSpace,
  GridIntrinsicContribution,
  GridTrackSize,
  GridTrackState,
} from "./grid-model"
import { isGridLayoutError } from "./grid-errors"
import {
  expandFr,
  resolveFlex,
} from "./grid-flex"

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

function definite(px: number): GridAvailableSpace {
  return { kind: "definite", px }
}

function contribution(
  nodeId: number,
  start: number,
  end: number,
  minContent: number,
  maxContent: number,
  axis: "columns" | "rows" = "columns",
): GridIntrinsicContribution {
  return { nodeId, axis, start, end, minContent, maxContent, minimum: minContent, preferred: maxContent }
}

describe("Grid flexible track sizing", () => {
  it("resolves 1fr 2fr against definite free space without rounding", () => {
    const result = resolveFlex({
      axis: "columns",
      available: definite(300),
      tracks: axis([track({ fr: 1 }), track({ fr: 2 })]),
      gap: 10,
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    expect(result.freeSpace).toBe(290)
    expect(result.hypotheticalFr).toBe(290 / 3)
    expect(result.tracks.tracks[0]?.base).toBe(290 / 3)
    expect(result.tracks.tracks[1]?.base).toBe(580 / 3)
    expect(result.remainingSpace).toBe(0)
    expect(result.overflow).toBe(0)
    expect(result.tracks.tracks.reduce((sum, value) => sum + value.base, 0) + 10).toBe(300)
  })

  it("keeps minmax base sizes when hypothetical fr is underflowing", () => {
    const result = resolveFlex({
      axis: "columns",
      available: definite(240),
      tracks: axis([
        track({ minmax: [100, { fr: 1 }] }, { minmax: [100, { fr: 1 }] }, 100),
        track({ minmax: [100, { fr: 1 }] }, { minmax: [100, { fr: 1 }] }, 100),
      ]),
      gap: 10,
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    // The 230px hypothetical budget gives 115px per factor, above each 100px min.
    expect(result.hypotheticalFr).toBe(115)
    expect(result.tracks.tracks.map(({ base }) => base)).toEqual([115, 115])
    expect(result.frozen).toEqual([])
    expect(result.tracks.tracks.reduce((sum, value) => sum + value.base, 0) + 10).toBe(240)
  })

  it("freezes a flexible track below its base and recomputes leftover factors", () => {
    const source = axis([
      track({ fr: 1 }, { fr: 1 }, 100),
      track({ fr: 1 }, { fr: 1 }, 0),
    ])
    const result = expandFr("columns", source, 150)
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    // Track 0 stays at its 100px base; the remaining 50px goes to track 1.
    expect(result.hypotheticalFr).toBe(50)
    expect(result.tracks.tracks.map(({ base }) => base)).toEqual([100, 50])
    expect(result.frozen).toEqual([0])
    expect(result.remainingSpace).toBe(0)
  })

  it("freezes finite flexible limits and preserves leftover space", () => {
    const result = resolveFlex({
      axis: "columns",
      available: definite(300),
      tracks: axis([
        track({ fr: 1 }, { fr: 1 }, 0, 80),
        track({ fr: 1 }, { fr: 1 }, 0, 100),
      ]),
      gap: 10,
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    expect(result.tracks.tracks.map(({ base, growthLimit }) => [base, growthLimit])).toEqual([[80, 80], [100, 100]])
    expect(result.frozen).toEqual([0, 1])
    expect(result.freeSpace).toBe(290)
    expect(result.consumed).toBe(180)
    expect(result.remainingSpace).toBe(110)
    expect(result.tracks.tracks.reduce((sum, value) => sum + value.base, 0) + 10).toBe(190)
  })

  it("uses max-content contributions on an indefinite max-content axis", () => {
    const result = resolveFlex({
      axis: "columns",
      available: { kind: "indefinite", constraint: "max-content" },
      tracks: axis([track({ fr: 1 }), track({ minmax: [40, { fr: 2 }] }, { minmax: [40, { fr: 2 }] }, 40)]),
      gap: 10,
      contributions: [
        contribution(10, 0, 1, 20, 120),
        contribution(11, 1, 2, 30, 90),
      ],
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    expect(result.freeSpace).toBeNull()
    expect(result.hypotheticalFr).toBeNull()
    expect(result.tracks.tracks.map(({ base }) => base)).toEqual([120, 90])
    expect(result.consumed).toBe(170)
    expect(result.remainingSpace).toBeNull()
  })

  it("uses min-content for an indefinite min-content axis", () => {
    const result = resolveFlex({
      axis: "rows",
      available: { kind: "indefinite", constraint: "min-content" },
      tracks: axis([track({ fr: 1 })], "rows"),
      contributions: [contribution(12, 0, 1, 35, 100, "rows")],
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.tracks.tracks[0]?.base).toBe(35)
  })

  it("rejects zero/negative factors and malformed input atomically", () => {
    const source = axis([track({ fr: 1 })])
    const invalidFactor = resolveFlex({
      axis: "columns",
      available: definite(100),
      tracks: axis([track({ fr: 0 } as GridTrackSize)]),
    })
    expect(invalidFactor).toMatchObject({ code: "GRID_INVALID_VALUE", path: "columns[0].min" })

    const invalidAvailable = resolveFlex({ axis: "columns", available: -1, tracks: source })
    expect(invalidAvailable).toMatchObject({ code: "GRID_INVALID_VALUE", path: "available" })
    expect(source.tracks[0]?.base).toBe(0)
  })
})
