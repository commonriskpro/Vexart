import { describe, expect, it } from "bun:test"
import type {
  ExpandedTracks,
  GridAvailableSpace,
  GridIntrinsicContribution,
  GridTrackSize,
  GridTrackState,
} from "./grid-model"
import { isGridLayoutError } from "./grid-errors"
import { applyLimits, applyTrackLimits, resolveLimits } from "./grid-limits"

function axis(tracks: readonly GridTrackState[]): ExpandedTracks {
  return { axis: "columns", tracks, explicitCount: tracks.length }
}

function state(min: GridTrackSize, max: GridTrackSize = min, base = 0, growthLimit = Number.POSITIVE_INFINITY): GridTrackState {
  return { min, max, base, growthLimit, offset: 0 }
}

function measured(index: number, minContent: number, maxContent: number): GridIntrinsicContribution {
  return {
    nodeId: index + 1,
    axis: "columns",
    start: index,
    end: index + 1,
    minContent,
    maxContent,
    minimum: minContent,
    preferred: maxContent,
  }
}

function definite(px: number): GridAvailableSpace {
  return { kind: "definite", px }
}

function indefinite(constraint: "min-content" | "max-content" = "max-content"): GridAvailableSpace {
  return { kind: "indefinite", constraint }
}

describe("Grid min/max and fit-content limits", () => {
  it("normalizes numeric max below min to the minimum", () => {
    const result = applyTrackLimits({
      axis: "columns",
      tracks: axis([state({ minmax: [100, 80] })]),
      available: definite(240),
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.tracks.tracks[0]).toMatchObject({ base: 100, growthLimit: 100 })
    expect(result.limits[0]).toEqual({ min: 100, max: 100, growthLimit: 100 })
  })

  it("uses intrinsic minimums and preserves a flexible maximum for fr sizing", () => {
    const result = applyTrackLimits({
      axis: "columns",
      tracks: axis([state({ minmax: ["auto", { fr: 1 }] })]),
      available: indefinite(),
      contributions: [measured(0, 60, 120)],
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.tracks.tracks[0]).toMatchObject({ base: 60, growthLimit: Infinity })
    expect(result.limits[0]).toMatchObject({ min: 60, max: Infinity })
  })

  it("applies fit-content intrinsic minimum and finite pixel cap", () => {
    const result = applyTrackLimits({
      axis: "columns",
      tracks: axis([state({ fitContent: 100 })]),
      available: definite(300),
      contributions: [measured(0, 60, 120)],
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.tracks.tracks[0]).toMatchObject({ base: 60, growthLimit: 100 })
    expect(result.limits[0]).toEqual({ min: 60, max: 100, growthLimit: 100 })
  })

  it("resolves fit-content percent caps against the content box and handles under/over limits", () => {
    const tracks = axis([state({ fitContent: { percent: 50 } })])
    const under = applyLimits("columns", tracks, definite(120), [measured(0, 40, 100)])
    const over = applyLimits("columns", tracks, definite(300), [measured(0, 40, 100)])
    expect(isGridLayoutError(under)).toBe(false)
    expect(isGridLayoutError(over)).toBe(false)
    if (isGridLayoutError(under) || isGridLayoutError(over)) return
    expect(under.tracks.tracks[0]).toMatchObject({ base: 40, growthLimit: 60 })
    expect(over.tracks.tracks[0]).toMatchObject({ base: 40, growthLimit: 150 })
    expect(tracks.tracks[0]?.base).toBe(0)
  })

  it("uses intrinsic content as the cap for fit-content percent on an indefinite axis", () => {
    const result = resolveLimits({
      axis: "columns",
      tracks: axis([state({ fitContent: { percent: 50 } })]),
      available: indefinite("max-content"),
      contributions: [measured(0, 60, 120)],
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.tracks.tracks[0]).toMatchObject({ base: 60, growthLimit: 120 })
  })

  it("applies intrinsic keyword limits and never emits negative sizes", () => {
    const result = applyTrackLimits({
      axis: "columns",
      tracks: axis([
        state("min-content"),
        state("max-content"),
        state("auto"),
        state({ minmax: [{ percent: 50 }, { percent: 20 }] }),
      ]),
      available: definite(300),
      contributions: [measured(0, 40, 40), measured(1, 60, 120), measured(2, 30, 90), measured(3, 10, 80)],
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.tracks.tracks.map(({ base, growthLimit }) => [base, growthLimit])).toEqual([
      [40, 40],
      [60, 120],
      [30, 90],
      [150, 150],
    ])
    for (const track of result.tracks.tracks) {
      expect(track.base).toBeGreaterThanOrEqual(0)
      expect(track.growthLimit === Infinity || track.growthLimit >= track.base).toBe(true)
    }
  })

  it("keeps min-content and max-content distinct when a full intrinsic DTO is supplied", () => {
    const result = applyTrackLimits({
      axis: "columns",
      tracks: axis([state("auto"), state("max-content")]),
      available: definite(300),
      intrinsicByTrack: [
        { minContent: 40, maxContent: 120, minimum: 30, preferred: 100 },
        { minContent: 60, maxContent: 140, minimum: 50, preferred: 120 },
      ],
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.tracks.tracks.map(({ base, growthLimit }) => [base, growthLimit])).toEqual([[40, 120], [60, 140]])
  })

  it("rejects malformed extra tokens and malformed intrinsic contributions atomically", () => {
    const source = axis([state({ fitContent: 100 })])
    const extra = applyTrackLimits({
      axis: "columns",
      tracks: axis([state({ fitContent: 100, extra: 1 } as unknown as GridTrackSize)]),
      available: definite(300),
    })
    expect(extra).toMatchObject({ code: "GRID_INVALID_TRACK", path: "columns[0].min" })
    const malformed = applyTrackLimits({
      axis: "columns",
      tracks: source,
      available: definite(300),
      contributions: [{ ...measured(0, 40, 20), minContent: 40 }],
    })
    expect(malformed).toMatchObject({ code: "GRID_INVALID_PLACEMENT", path: "contributions[0]" })
    expect(source.tracks[0]?.base).toBe(0)
  })
})
