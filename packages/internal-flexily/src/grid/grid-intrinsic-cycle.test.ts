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
  createIntrinsicCycleCache,
  resolveIntrinsicCycle,
} from "./grid-intrinsic-cycle"
import { isGridLayoutError } from "./grid-errors"

function track(size: GridTrackSize, base = 0, growthLimit = 0): GridTrackState {
  return { min: size, max: size, base, growthLimit, offset: 0 }
}

function axis(values: readonly GridTrackState[], name: "columns" | "rows"): ExpandedTracks {
  return { axis: name, tracks: values, explicitCount: values.length }
}

function item(nodeId: number, rowStart = 0, columnStart = 0): GridResolvedPlacement {
  return { nodeId, rowStart, rowEnd: rowStart + 1, columnStart, columnEnd: columnStart + 1 }
}

function placement(items: readonly GridResolvedPlacement[]): PlacementResult {
  return { items, rowCount: 1, columnCount: 1 }
}

function measured(values: Partial<GridIntrinsicSizes> = {}): GridIntrinsicSizes {
  return { minContent: 0, maxContent: 0, minimum: 0, preferred: 0, ...values }
}

describe("Grid intrinsic dependency cycle", () => {
  it("passes a definite column restriction to column measurements", () => {
    const widths: Array<number | undefined> = []
    const result = resolveIntrinsicCycle({
      columns: axis([track("auto")], "columns"),
      rows: axis([track("auto")], "rows"),
      items: placement([item(0)]),
      columnAvailable: 200,
      measure: (axisName, width) => {
        widths.push(width)
        return axisName === "columns"
          ? measured({ minContent: 80, maxContent: 80, minimum: 20, preferred: 80 })
          : measured({ minContent: 10, maxContent: 10, minimum: 10, preferred: 10 })
      },
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(widths).toEqual([200, 80])
    expect(result.logs.find((entry) => entry.axis === "columns")?.restriction).toBe("definite:200")
  })

  it("measures wrapped text rows using the resolved column width and publishes pass two atomically", () => {
    const widths: Array<number | undefined> = []
    const measure: GridIntrinsicMeasureFunc = (axisName, width) => {
      if (axisName === "columns") return measured({ minContent: 80, maxContent: 120, minimum: 20, preferred: 80 })
      widths.push(width)
      return measured({ minContent: width === 80 ? 40 : 20, maxContent: 60, minimum: 20, preferred: 40 })
    }
    const result = resolveIntrinsicCycle({
      columns: axis([track("auto")], "columns"),
      rows: axis([track("auto")], "rows"),
      items: placement([item(1), item(2)]),
      measure,
      previousContributions: {
        rows: [{ nodeId: 2, axis: "rows", start: 0, end: 1, minContent: 20, maxContent: 60, minimum: 20, preferred: 40 }],
      },
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.intrinsicPasses).toBe(2)
    expect(result.intrinsicPasses).toBeLessThanOrEqual(2)
    expect(result.rows.tracks[0]?.base).toBe(40)
    expect(widths).toEqual([80, 80])
    expect(result.logs.filter((entry) => entry.axis === "rows").map((entry) => entry.inlineWidth)).toEqual([80, 80, 80, 80])
    expect(result.logs.filter((entry) => entry.pass === 2).every((entry) => entry.cacheHit)).toBe(true)
    expect(result.columns.tracks[0]?.offset).toBe(0)
    expect(result.rows.tracks[0]?.offset).toBe(0)
  })

  it("restarts the second pass from initialized tracks instead of retaining stale auto bases", () => {
    const widths: Array<number | undefined> = []
    const result = resolveIntrinsicCycle({
      columns: axis([track("auto")], "columns"),
      rows: axis([track("auto")], "rows"),
      items: placement([item(10)]),
      measure: (axisName, width) => {
        if (axisName === "columns") return measured({ minContent: 80, maxContent: 80, minimum: 20, preferred: 80 })
        widths.push(width)
        return measured({ minContent: width === 80 ? 40 : 20, maxContent: 40, minimum: 0, preferred: 20 })
      },
      resolveColumns: (_axis, tracks, _contributions, passNumber) => passNumber === 2
        ? { ...tracks, tracks: tracks.tracks.map((entry) => ({ ...entry, base: 100, growthLimit: 100 })) }
        : tracks,
      forceSecondPass: true,
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(widths).toEqual([80, 100])
    expect(result.rows.tracks[0]?.base).toBe(20)
  })

  it("keeps wrapping measurements separate for each resolved restriction", () => {
    const cache = createIntrinsicCycleCache()
    let calls = 0
    const measure: GridIntrinsicMeasureFunc = (axisName, width) => {
      calls++
      return axisName === "columns"
        ? measured({ minContent: 60, maxContent: 60, minimum: 20, preferred: 60 })
        : measured({ minContent: width ?? 0, maxContent: width ?? 0, minimum: 0, preferred: width ?? 0 })
    }
    const base = {
      columns: axis([track("auto")], "columns"),
      rows: axis([track("auto")], "rows"),
      items: placement([item(3)]),
      measure,
      rowAvailable: { kind: "indefinite", constraint: "min-content" } as const,
    }
    const first = resolveIntrinsicCycle({ ...base, cache })
    const second = resolveIntrinsicCycle({ ...base, rowAvailable: { kind: "indefinite", constraint: "max-content" } as const, cache })
    expect(isGridLayoutError(first)).toBe(false)
    expect(isGridLayoutError(second)).toBe(false)
    if (isGridLayoutError(first) || isGridLayoutError(second)) return
    expect(first.intrinsicPasses).toBe(1)
    expect(second.intrinsicPasses).toBe(1)
    expect(calls).toBe(3)
    expect(first.cache.misses).toBe(2)
    expect(second.cache.misses).toBe(3)
    expect(second.logs.some((entry) => entry.axis === "rows" && entry.restriction === "indefinite:max-content" && !entry.cacheHit)).toBe(true)
  })

  it("allows a column-wrap Flex child to derive its height from the cell width", () => {
    const result = resolveIntrinsicCycle({
      columns: axis([track("auto")], "columns"),
      rows: axis([track("auto")], "rows"),
      items: placement([item(5), item(6)]),
      measure: (axisName, width) => axisName === "columns"
        ? measured({ minContent: 40, maxContent: 40, minimum: 40, preferred: 40 })
        : measured({ minContent: width !== undefined && width < 50 ? 60 : 20, maxContent: 80, minimum: 20, preferred: 40 }),
      previousContributions: {
        rows: [{ nodeId: 6, axis: "rows", start: 0, end: 1, minContent: 10, maxContent: 80, minimum: 10, preferred: 40 }],
      },
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.intrinsicPasses).toBe(2)
    expect(result.rows.tracks[0]?.base).toBe(60)
    expect(result.rows.tracks[0]?.base).toBeGreaterThanOrEqual(0)
  })

  it("supports a nested Grid measurement without exposing a partial outer result", () => {
    let nestedCalls = 0
    const result = resolveIntrinsicCycle({
      columns: axis([track("auto")], "columns"),
      rows: axis([track("auto")], "rows"),
      items: placement([item(7), item(8)]),
      measure: (axisName, width) => {
        if (axisName === "columns") return measured({ minContent: 90, maxContent: 90, minimum: 90, preferred: 90 })
        const nested = resolveIntrinsicCycle({
          columns: axis([track(40, 40, 40)], "columns"),
          rows: axis([track("auto")], "rows"),
          items: placement([item(100)]),
          measure: (nestedAxis, nestedWidth) => {
            nestedCalls++
            return nestedAxis === "columns"
              ? measured({ minContent: 40, maxContent: 40, minimum: 40, preferred: 40 })
              : measured({ minContent: nestedWidth === 40 ? 30 : 0, maxContent: 30, minimum: 0, preferred: 30 })
          },
        })
        if (isGridLayoutError(nested)) return measured()
        return measured({ minContent: nested.rows.tracks[0]?.base ?? width ?? 0, maxContent: 30, minimum: 0, preferred: 30 })
      },
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(nestedCalls).toBeGreaterThan(0)
    expect(result.rows.tracks[0]?.base).toBe(30)
    expect(result.items).toHaveLength(2)
  })

  it("rejects malformed input before publishing either pass", () => {
    const result = resolveIntrinsicCycle({
      columns: axis([track("auto")], "columns"),
      rows: axis([track("auto")], "rows"),
      items: placement([item(9)]),
      measure: () => ({ minContent: -1, maxContent: 0, minimum: 0, preferred: 0 }),
      forceSecondPass: true,
    })
    expect(result).toMatchObject({ code: "GRID_MEASURE_INVALID", nodeId: 9 })
    expect(isGridLayoutError(result)).toBe(true)
  })
})
