import { describe, expect, it } from "bun:test"
import type {
  ExpandedTracks,
  GridAvailableSpace,
  GridTrackSize,
  GridTrackState,
} from "./grid-model"
import {
  createGutterTrack,
  initializeAxisTracks,
  initializeGridTracks,
  initializeTrack,
} from "./grid-track-init"
import { isGridLayoutError } from "./grid-errors"

function state(size: GridTrackSize, max: GridTrackSize = size): GridTrackState {
  return { min: size, max, base: 0, growthLimit: 0, offset: 0 }
}

function axis(values: readonly GridTrackState[], explicitCount = values.length): ExpandedTracks {
  return { axis: "columns", tracks: values, explicitCount }
}

function definite(px: number): GridAvailableSpace {
  return { kind: "definite", px }
}

function indefinite(constraint: "min-content" | "max-content" = "max-content"): GridAvailableSpace {
  return { kind: "indefinite", constraint }
}

describe("Grid track initialization", () => {
  it("initializes fixed px tracks with fixed base and growth limit", () => {
    const result = initializeTrack(80, definite(300))
    expect(result).toEqual({ min: 80, max: 80, base: 80, growthLimit: 80, offset: 0 })
  })

  it("resolves percentages only on a definite axis", () => {
    const fixed = initializeTrack({ percent: 50 }, definite(300))
    const open = initializeTrack({ percent: 50 }, indefinite())
    expect(fixed).toEqual({ min: { percent: 50 }, max: { percent: 50 }, base: 150, growthLimit: 150, offset: 0 })
    expect(open).toEqual({ min: { percent: 50 }, max: { percent: 50 }, base: 0, growthLimit: Infinity, offset: 0 })
  })

  it("initializes intrinsic and flexible functions without sizing them", () => {
    for (const size of ["auto", "min-content", "max-content", { fr: 1 }] as const) {
      const result = initializeTrack(size, definite(300))
      expect(result).toMatchObject({ min: size, max: size, base: 0, growthLimit: Infinity, offset: 0 })
    }
  })

  it("separates minmax minimum and maximum functions and clamps max below min", () => {
    const flexible = initializeTrack({ minmax: [100, { fr: 1 }] }, definite(240))
    const clamped = initializeTrack({ minmax: [100, 80] }, definite(240))
    expect(flexible).toEqual({ min: { minmax: [100, { fr: 1 }] }, max: { minmax: [100, { fr: 1 }] }, base: 100, growthLimit: Infinity, offset: 0 })
    expect(clamped).toEqual({ min: { minmax: [100, 80] }, max: { minmax: [100, 80] }, base: 100, growthLimit: 100, offset: 0 })
  })

  it("initializes fit-content caps and defers an indefinite percentage cap", () => {
    const fixed = initializeTrack({ fitContent: 100 }, definite(300))
    const percent = initializeTrack({ fitContent: { percent: 50 } }, indefinite())
    expect(fixed).toEqual({ min: { fitContent: 100 }, max: { fitContent: 100 }, base: 0, growthLimit: 100, offset: 0 })
    expect(percent).toEqual({ min: { fitContent: { percent: 50 } }, max: { fitContent: { percent: 50 } }, base: 0, growthLimit: Infinity, offset: 0 })
  })

  it("treats gutters as fixed tracks", () => {
    expect(createGutterTrack(10)).toEqual({ min: 10, max: 10, base: 10, growthLimit: 10, offset: 0 })
  })

  it("initializes an expanded axis, preserving explicit count and collapsed zero tracks", () => {
    const result = initializeAxisTracks(axis([state(80), state(0)]), definite(300))
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.explicitCount).toBe(2)
    expect(result.tracks[0]).toMatchObject({ base: 80, growthLimit: 80 })
    expect(result.tracks[1]).toMatchObject({ min: 0, max: 0, base: 0, growthLimit: 0 })
  })

  it("initializes both axes atomically", () => {
    const input = {
      columns: axis([state(80)]),
      rows: { axis: "rows" as const, tracks: [state({ fr: 1 })], explicitCount: 1 },
    }
    const result = initializeGridTracks(input, definite(300), 9)
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.columns.tracks[0]).toMatchObject({ base: 80, growthLimit: 80 })
    expect(result.rows.tracks[0]).toMatchObject({ base: 0, growthLimit: Infinity })
  })

  it("rejects invalid values instead of emitting negative state", () => {
    const cases: GridTrackSize[] = [-1, { percent: 101 }, { fr: 0 }, { minmax: [100, -2] as const }, { fitContent: -1 }]
    for (const size of cases) {
      const result = initializeTrack(size, definite(300))
      expect(isGridLayoutError(result)).toBe(true)
      if (isGridLayoutError(result)) expect(["GRID_INVALID_VALUE", "GRID_INVALID_TRACK"]).toContain(result.code)
    }
  })
})
