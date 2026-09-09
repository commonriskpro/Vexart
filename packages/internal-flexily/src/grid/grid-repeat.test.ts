import { describe, expect, it } from "bun:test"
import type { GridSnapshot, GridStyle, GridTrack, PlacementResult } from "./grid-model"
import { expandRepeats } from "./grid-repeat"
import { isGridLayoutError } from "./grid-errors"

function snapshot(overrides: Partial<GridStyle> = {}): GridSnapshot {
  const style: GridStyle = {
    columns: [40],
    rows: [30],
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
  return { nodeId: 11, revision: 1, style }
}

function placement(items: PlacementResult["items"] = []): PlacementResult {
  return { items, rowCount: 1, columnCount: 1 }
}

function autoFitBase(count: "auto-fill" | "auto-fit"): GridTrack {
  return { repeat: { count, tracks: [{ minmax: [80, { fr: 1 }] as const }] } }
}

describe("Grid repeat expansion", () => {
  it("expands fixed repeat exactly and keeps source track sizes", () => {
    const result = expandRepeats(snapshot({ columns: [{ repeat: { count: 3, tracks: [40] } }] }), { kind: "definite", px: 145 })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.columns.tracks).toHaveLength(3)
    expect(result.columns.tracks.map((track) => track.min)).toEqual([40, 40, 40])
    expect(result.columns.explicitCount).toBe(3)
    expect(result.collapsedColumns).toEqual([])
  })

  it("expands auto-fill to three tracks for 300px with a 10px gap", () => {
    const result = expandRepeats(snapshot({ columns: [autoFitBase("auto-fill")] }), { kind: "definite", px: 300 })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.columns.tracks).toHaveLength(3)
    expect(result.columns.tracks.map((track) => track.min)).toEqual([
      { minmax: [80, { fr: 1 }] },
      { minmax: [80, { fr: 1 }] },
      { minmax: [80, { fr: 1 }] },
    ])
    expect(result.collapsedColumns).toEqual([])
  })

  it("retains auto-fill tracks and collapses empty auto-fit tracks after placement", () => {
    const items = placement([
      { nodeId: 1, rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 1 },
      { nodeId: 2, rowStart: 0, rowEnd: 1, columnStart: 1, columnEnd: 2 },
    ])
    const fill = expandRepeats(snapshot({ columns: [autoFitBase("auto-fill")] }), 300, items)
    const fit = expandRepeats(snapshot({ columns: [autoFitBase("auto-fit")] }), 300, items)
    expect(isGridLayoutError(fill)).toBe(false)
    expect(isGridLayoutError(fit)).toBe(false)
    if (isGridLayoutError(fill) || isGridLayoutError(fit)) return
    expect(fill.columns.tracks).toHaveLength(3)
    expect(fill.collapsedColumns).toEqual([])
    expect(fit.columns.tracks).toHaveLength(3)
    expect(fit.collapsedColumns).toEqual([2])
    expect(fit.columns.tracks[2]).toMatchObject({ min: 0, max: 0, base: 0, growthLimit: 0 })
  })

  it("does not collapse auto-fit before placement is available", () => {
    const result = expandRepeats(snapshot({ columns: [autoFitBase("auto-fit")] }), 300)
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.columns.tracks).toHaveLength(3)
    expect(result.collapsedColumns).toEqual([])
  })

  it("uses exactly one auto-repeat on an indefinite axis", () => {
    const result = expandRepeats(snapshot({ columns: [autoFitBase("auto-fill")] }), { kind: "indefinite", constraint: "max-content" })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.columns.tracks).toHaveLength(1)
  })

  it("resolves auto-repeat independently for non-square definite axes", () => {
    const result = expandRepeats(
      snapshot({ columns: [autoFitBase("auto-fill")], rows: [autoFitBase("auto-fill")] }),
      {
        columns: { kind: "definite", px: 300 },
        rows: { kind: "definite", px: 120 },
      },
    )
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.columns.tracks).toHaveLength(3)
    expect(result.rows.tracks).toHaveLength(1)
  })

  it("keeps an indefinite axis independent from a definite sibling", () => {
    const result = expandRepeats(
      snapshot({ columns: [autoFitBase("auto-fill")], rows: [autoFitBase("auto-fill")] }),
      {
        columns: { kind: "definite", px: 300 },
        rows: { kind: "indefinite", constraint: "max-content" },
      },
    )
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    expect(result.columns.tracks).toHaveLength(3)
    expect(result.rows.tracks).toHaveLength(1)
  })

  it("accounts for fixed tracks and gutters when choosing auto-repeat count", () => {
    const result = expandRepeats(snapshot({ columns: [100, autoFitBase("auto-fill")] }), 300)
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) return
    // 100 + 2*80 + 2*10 = 280; three repeats would need 370.
    expect(result.columns.tracks).toHaveLength(3)
  })

  it("includes every fixed-track gutter at the auto-repeat boundary", () => {
    const columns: GridTrack[] = [100, 100, autoFitBase("auto-fill")]
    const below = expandRepeats(snapshot({ columns }), 389)
    const at = expandRepeats(snapshot({ columns }), 390)
    expect(isGridLayoutError(below)).toBe(false)
    expect(isGridLayoutError(at)).toBe(false)
    if (isGridLayoutError(below) || isGridLayoutError(at)) return

    // 100 + 100 + N*80 + (2 + N - 1)*10 <= width.  The second repeat fits
    // exactly at 390px, but not one pixel below it.
    expect(below.columns.tracks).toHaveLength(3)
    expect(at.columns.tracks).toHaveLength(4)
  })

  it("rejects zero, nested, multiple, and unsupported auto-repeat bases", () => {
    const cases = [
      snapshot({ columns: [{ repeat: { count: 0, tracks: [40] } }] }),
      snapshot({ columns: [{ repeat: { count: 2, tracks: [{ repeat: { count: 2, tracks: [40] } }] } }] }),
      snapshot({ columns: [autoFitBase("auto-fill"), autoFitBase("auto-fit")] }),
      snapshot({ columns: [{ repeat: { count: "auto-fill", tracks: ["auto"] } }] }),
      snapshot({ columns: [{ repeat: { count: "auto-fill", tracks: [{ minmax: [80, { fr: 2 }] }] } }] }),
    ]
    for (const input of cases) {
      const result = expandRepeats(input, 300)
      expect(isGridLayoutError(result)).toBe(true)
      if (isGridLayoutError(result)) expect(["GRID_INVALID_REPEAT", "GRID_TRACK_LIMIT"]).toContain(result.code)
    }
  })

  it("returns a typed limit error without exposing a partial axis", () => {
    const input = snapshot({ columns: [{ repeat: { count: 1025, tracks: [40] } }] })
    const result = expandRepeats(input, 300)
    expect(result).toEqual({ code: "GRID_TRACK_LIMIT", path: "columns", nodeId: 11 })
    expect(input.style.columns).toHaveLength(1)
  })

  it("returns a limit error instead of producing an unbounded zero-base repeat", () => {
    const input = snapshot({ gap: 0, columns: [autoFitBase("auto-fill")] })
    const result = expandRepeats(input, 1_000_000)
    expect(isGridLayoutError(result)).toBe(true)
    if (isGridLayoutError(result)) expect(result.code).toBe("GRID_TRACK_LIMIT")
  })
})
