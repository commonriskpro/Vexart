import { describe, expect, it } from "bun:test"
import type {
  ExpandedTracks,
  GridIntrinsicMeasureFunc,
  GridIntrinsicSizes,
  GridResolvedPlacement,
  GridTrackSize,
  GridTrackState,
  PlacementResult,
} from "./grid-model"
import {
  collectIntrinsicContributions,
  resolveIntrinsic,
} from "./grid-intrinsic"
import { isGridLayoutError } from "./grid-errors"

function track(size: GridTrackSize, max: GridTrackSize = size, base = 0, growthLimit = 0): GridTrackState {
  return { min: size, max, base, growthLimit, offset: 0 }
}

function axis(values: readonly GridTrackState[], name: "columns" | "rows" = "columns"): ExpandedTracks {
  return { axis: name, tracks: values, explicitCount: values.length }
}

function item(nodeId: number, start = 0, end = start + 1, columnStart = 0, columnEnd = columnStart + 1): GridResolvedPlacement {
  return { nodeId, rowStart: start, rowEnd: end, columnStart, columnEnd }
}

function placement(items: readonly GridResolvedPlacement[]): PlacementResult {
  return { items, rowCount: 1, columnCount: 1 }
}

function measured(values: Partial<GridIntrinsicSizes> = {}): GridIntrinsicSizes {
  return { minContent: 40, maxContent: 120, minimum: 32, preferred: 80, ...values }
}

describe("Grid intrinsic span=1 contributions", () => {
  it("measures one-cell items and updates an auto track base and growth limit", () => {
    let calls = 0
    const measure: GridIntrinsicMeasureFunc = (axis, width) => {
      calls++
      expect(axis).toBe("columns")
      expect(width).toBeUndefined()
      return measured()
    }
    const result = collectIntrinsicContributions(
      "columns",
      axis([track("auto")]),
      placement([item(7)]),
      measure,
    )
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(calls).toBe(1)
    expect(result.contributions).toEqual([{
      nodeId: 7,
      axis: "columns",
      start: 0,
      end: 1,
      minContent: 40,
      maxContent: 120,
      minimum: 32,
      preferred: 80,
    }])
    expect(result.tracks.tracks[0]).toMatchObject({ base: 40, growthLimit: 120 })
    expect(result.cacheKeys).toEqual(["7\0columns\0undefined"])
  })

  it("uses minimum contribution as a lower bound without losing min-content", () => {
    const result = resolveIntrinsic({
      axis: "columns",
      tracks: axis([track("min-content")]),
      items: placement([item(8)]),
      measure: () => measured({ minContent: 20, maxContent: 70, minimum: 35 }),
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.tracks.tracks[0]).toMatchObject({ base: 35, growthLimit: 35 })
  })

  it("handles max-content and fit-content limits", () => {
    const result = resolveIntrinsic({
      axis: "columns",
      tracks: axis([track("max-content"), track({ fitContent: 100 })]),
      items: placement([item(9), item(10, 0, 1, 1, 2)]),
      measure: () => measured({ minContent: 60, maxContent: 140, minimum: 50 }),
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.tracks.tracks[0]).toMatchObject({ base: 60, growthLimit: 140 })
    expect(result.tracks.tracks[1]).toMatchObject({ base: 60, growthLimit: 100 })
  })

  it("passes a real resolved column width to row measurement", () => {
    const widths: Array<number | undefined> = []
    const result = resolveIntrinsic({
      axis: "rows",
      tracks: axis([track("auto")], "rows"),
      items: placement([item(11, 0, 1, 0, 2)]),
      measure: (_axis, width) => {
        widths.push(width)
        return measured({ minContent: 12, maxContent: 24, minimum: 12, preferred: 24 })
      },
      options: {
        columnTracks: axis([track(80, 80, 80, 80), track(40, 40, 40, 40)]),
        gap: 10,
      },
    })
    expect(isGridLayoutError(result)).toBe(false)
    expect(widths).toEqual([130])
    if (isGridLayoutError(result)) return
    expect(result.tracks.tracks[0]).toMatchObject({ base: 12, growthLimit: 24 })
  })

  it("skips spanning items and leaves flexible tracks to the fr phase", () => {
    let calls = 0
    const result = resolveIntrinsic({
      axis: "columns",
      tracks: axis([track({ fr: 1 }), track("auto")]),
      items: placement([item(12, 0, 1, 0, 2), item(13, 0, 1, 1, 2)]),
      measure: () => {
        calls++
        return measured()
      },
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(calls).toBe(1)
    expect(result.contributions.map(({ nodeId }) => nodeId)).toEqual([13])
    expect(result.tracks.tracks[0]).toMatchObject({ base: 0, growthLimit: 0 })
    expect(result.tracks.tracks[1]).toMatchObject({ base: 40, growthLimit: 120 })
  })

  it("caches repeated node/axis/width measurements and keeps stable keys", () => {
    let calls = 0
    const measure: GridIntrinsicMeasureFunc = () => {
      calls++
      return measured()
    }
    const result = resolveIntrinsic({
      axis: "columns",
      tracks: axis([track("auto")]),
      items: placement([item(14), item(14)]),
      measure,
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(calls).toBe(1)
    expect(result.cacheKeys).toEqual(["14\0columns\0undefined", "14\0columns\0undefined"])
  })

  it("accepts per-node callback maps", () => {
    const sources = new Map<number, GridIntrinsicMeasureFunc>([
      [15, () => measured({ minContent: 10, maxContent: 20, minimum: 10 })],
    ])
    const result = resolveIntrinsic({
      axis: "columns",
      tracks: axis([track("auto")]),
      items: placement([item(15)]),
      measure: sources,
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.contributions[0]).toMatchObject({ nodeId: 15, minContent: 10, maxContent: 20 })
  })

  it("returns typed errors for missing or malformed measurements", () => {
    const missing = resolveIntrinsic({
      axis: "columns",
      tracks: axis([track("auto")]),
      items: placement([item(16)]),
      measure: new Map(),
    })
    const malformed = resolveIntrinsic({
      axis: "columns",
      tracks: axis([track("auto")]),
      items: placement([item(17)]),
      measure: () => ({ minContent: -1, maxContent: 20, minimum: 0, preferred: 0 } as GridIntrinsicSizes),
    })
    expect(missing).toMatchObject({ code: "GRID_MEASURE_INVALID", path: "items[0]", nodeId: 16 })
    expect(malformed).toMatchObject({ code: "GRID_MEASURE_INVALID", path: "items[0]", nodeId: 17 })
  })
})
