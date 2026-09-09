import { describe, expect, it } from "bun:test"
import type {
  ExpandedTracks,
  GridAvailableSpace,
  GridTrackSize,
  GridTrackState,
} from "./grid-model"
import { isGridLayoutError } from "./grid-errors"
import {
  GRID_MAXIMIZE_EPSILON,
  maximize,
  maximizeTracks,
} from "./grid-maximize"

function track(
  min: GridTrackSize,
  max: GridTrackSize = min,
  base = 0,
  growthLimit = Number.POSITIVE_INFINITY,
): GridTrackState {
  return { min, max, base, growthLimit, offset: 0 }
}

function axis(tracks: readonly GridTrackState[], name: "columns" | "rows" = "columns", explicitCount = tracks.length): ExpandedTracks {
  return { axis: name, tracks, explicitCount }
}

function definite(px: number): GridAvailableSpace {
  return { kind: "definite", px }
}

function indefinite(constraint: "min-content" | "max-content"): GridAvailableSpace {
  return { kind: "indefinite", constraint }
}

describe("Grid track maximization", () => {
  it("subtracts bases and gutters, then fills a definite box among eligible tracks", () => {
    const result = maximizeTracks({
      axis: "columns",
      available: definite(300),
      tracks: axis([track("auto", "auto", 20), track("auto", "auto", 30)]),
      gap: 10,
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    expect(result.freeSpace).toBe(240)
    expect(result.consumed).toBe(240)
    expect(result.remainingSpace).toBe(0)
    expect(result.overflow).toBe(0)
    expect(result.tracks.tracks.map(({ base }) => base)).toEqual([140, 150])
    expect(result.tracks.tracks.reduce((sum, value) => sum + value.base, 0) + 10).toBe(300)
  })

  it("floors negative free space at zero and preserves overflow", () => {
    const source = axis([track(80, 80, 80), track(40, 40, 40)])
    const result = maximize("columns", source, 100, 10)
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    expect(result.freeSpace).toBe(0)
    expect(result.consumed).toBe(0)
    expect(result.remainingSpace).toBe(0)
    expect(result.overflow).toBe(30)
    expect(result.tracks.tracks.map(({ base }) => base)).toEqual([80, 40])
    expect(source.tracks.map(({ base }) => base)).toEqual([80, 40])
  })

  it("freezes finite limits and redistributes remaining space", () => {
    const result = maximizeTracks({
      axis: "columns",
      available: definite(200),
      tracks: axis([
        track("auto", "auto", 20, 50),
        track("auto", "auto", 10, 40),
      ]),
      gap: 10,
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    expect(result.tracks.tracks.map(({ base, growthLimit }) => [base, growthLimit])).toEqual([[50, 50], [40, 40]])
    expect(result.frozen).toEqual([0, 1])
    expect(result.freeSpace).toBe(160)
    expect(result.consumed).toBe(60)
    expect(result.remainingSpace).toBe(100)
    // The unused 100px is intentionally left for a later alignment phase.
    expect(result.tracks.tracks.reduce((sum, value) => sum + value.base, 0) + 10).toBe(100)
  })

  it("leaves fr maxima for the flexible phase while maximizing intrinsic maxima", () => {
    const result = maximizeTracks({
      axis: "columns",
      available: definite(300),
      tracks: axis([
        track({ minmax: ["auto", { fr: 1 }] }, { minmax: ["auto", { fr: 1 }] }, 20),
        track("auto", "auto", 10),
        track({ minmax: [20, "auto"] }, { minmax: [20, "auto"] }, 10),
      ]),
      gap: 10,
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    // Only the second and third tracks receive the 240px free space.
    expect(result.tracks.tracks.map(({ base }) => base)).toEqual([20, 130, 130])
    expect(result.remainingSpace).toBe(0)
  })

  it("distinguishes min-content and max-content indefinite axes without inventing space", () => {
    for (const constraint of ["min-content", "max-content"] as const) {
      const result = maximizeTracks({
        axis: "rows",
        available: indefinite(constraint),
        tracks: axis([track("auto", "auto", 25), track("auto", "auto", 35)], "rows"),
        gap: 10,
      })
      expect(isGridLayoutError(result)).toBe(false)
      if (isGridLayoutError(result)) continue
      expect(result.available).toEqual({ kind: "indefinite", constraint })
      expect(result.freeSpace).toBeNull()
      expect(result.remainingSpace).toBeNull()
      expect(result.consumed).toBe(0)
      expect(result.tracks.tracks.map(({ base }) => base)).toEqual([25, 35])
    }
  })

  it("treats differences within 1e-6 as exhausted space", () => {
    const result = maximizeTracks({
      axis: "columns",
      available: definite(100 + GRID_MAXIMIZE_EPSILON / 2),
      tracks: axis([track("auto", "auto", 100)]),
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return

    expect(result.freeSpace).toBeCloseTo(GRID_MAXIMIZE_EPSILON / 2)
    expect(result.consumed).toBe(0)
    expect(result.remainingSpace).toBe(0)
    expect(result.tracks.tracks[0]?.base).toBe(100)
  })

  it("returns typed errors before publishing partial state", () => {
    const source = axis([track("auto", "auto", 20)])
    const invalidAvailable = maximizeTracks({
      axis: "columns",
      available: -1,
      tracks: source,
    })
    expect(invalidAvailable).toMatchObject({ code: "GRID_INVALID_VALUE", path: "available" })
    expect(source.tracks[0]?.base).toBe(20)

    const invalidTrack = maximizeTracks({
      axis: "columns",
      available: definite(100),
      tracks: axis([track("auto", "auto", 20, 10)]),
    })
    expect(invalidTrack).toMatchObject({ code: "GRID_INVALID_TRACK", path: "columns[0]" })
  })
})
