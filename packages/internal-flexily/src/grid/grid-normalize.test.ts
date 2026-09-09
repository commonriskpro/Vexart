import { describe, expect, it } from "bun:test"
import type { GridStyle, GridTrack } from "./grid-model"
import { createGridError, GRID_ERROR_CODES, isGridLayoutError } from "./grid-errors"
import { getGridNormalizeStats, normalize, resetGridNormalizeStats } from "./grid-normalize"

function style(overrides: Partial<GridStyle> = {}): GridStyle {
  return {
    columns: [80, { minmax: [40, { fr: 1 }] }],
    rows: [{ size: "auto", before: ["row-start"] }, "auto"],
    autoColumns: "auto",
    autoRows: "auto",
    autoFlow: "row",
    areas: [],
    gap: 10,
    justifyContent: "stretch",
    alignContent: "stretch",
    justifyItems: "stretch",
    alignItems: "stretch",
    ...overrides,
  }
}

function errorOf(input: GridStyle): ReturnType<typeof normalize> {
  return normalize(input, 17, 4)
}

describe("Grid runtime normalization", () => {
  it("returns a cloned, deeply frozen snapshot with its revision", () => {
    const sourceColumns = [80, "auto"] as GridTrack[]
    const input = style({ columns: sourceColumns })
    const result = normalize(input, 17, 4)
    if (isGridLayoutError(result)) throw new Error(`unexpected ${result.code}`)

    expect(result.nodeId).toBe(17)
    expect(result.revision).toBe(4)
    expect(result.style).not.toBe(input)
    expect(result.style.columns).not.toBe(input.columns)
    expect(result.style.rows[0]).not.toBe(input.rows[0])
    expect(result.style.columns).toEqual(input.columns)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.style)).toBe(true)
    expect(Object.isFrozen(result.style.columns)).toBe(true)
    expect(Object.isFrozen(result.style.rows[0])).toBe(true)

    sourceColumns[0] = 99
    expect(result.style.columns[0]).toBe(80)
  })

  it("caches the same style identity and revision without reparsing", () => {
    resetGridNormalizeStats()
    const input = style()
    const first = normalize(input, 17, 4)
    const second = normalize(input, 17, 4)
    const changedRevision = normalize(input, 17, 5)
    const stats = getGridNormalizeStats()

    expect(second).toBe(first)
    expect(changedRevision).not.toBe(first)
    expect(stats.normalizeCalls).toBe(3)
    expect(stats.cacheHits).toBe(1)
  })

  it("accepts terminal values and fixed/auto-repeat policy without sizing them", () => {
    const input = style({
      columns: [
        0,
        { percent: 50 },
        "min-content",
        "max-content",
        { fr: 1 },
        { minmax: [20, { fr: 1 }] },
        { fitContent: { percent: 70 } },
        { repeat: { count: 2, tracks: [40, { size: "auto" }] } },
        { repeat: { count: "auto-fit", tracks: [{ minmax: [80, { fr: 1 }] }] } },
      ],
    })
    const result = errorOf(input)
    expect(isGridLayoutError(result)).toBe(false)
    if (!isGridLayoutError(result)) expect(result.style.columns).toHaveLength(9)
  })

  it("keeps area rows rectangular and preserves areas that extend explicit tracks", () => {
    const input = style({
      columns: [100],
      rows: [40],
      areas: [
        ["header", "header", null],
        ["main", "main", "main"],
      ],
    })
    const result = errorOf(input)
    expect(isGridLayoutError(result)).toBe(false)
    if (!isGridLayoutError(result)) {
      expect(result.style.columns).toEqual([100])
      expect(result.style.areas).toEqual(input.areas)
    }
  })

  it("returns deterministic errors for scalar, track, repeat, area, and limit violations", () => {
    const cases: Array<[string, GridStyle, string]> = [
      ["non-finite gap", style({ gap: Number.NaN }), "GRID_INVALID_VALUE"],
      ["negative pixel", style({ columns: [-1] }), "GRID_INVALID_VALUE"],
      ["invalid percent", style({ columns: [{ percent: 101 }] }), "GRID_INVALID_VALUE"],
      ["zero fr", style({ columns: [{ fr: 0 }] }), "GRID_INVALID_VALUE"],
      ["malformed minmax", style({ columns: [{ minmax: [20] as never }] }), "GRID_INVALID_TRACK"],
      ["nested repeat", style({ columns: [{ repeat: { count: 2, tracks: [{ repeat: { count: 2, tracks: [20] } }] } }] }), "GRID_INVALID_REPEAT"],
      ["auto-repeat list", style({ columns: [{ repeat: { count: "auto-fill", tracks: [20, 20] } }] }), "GRID_INVALID_REPEAT"],
      ["auto-repeat size", style({ columns: [{ repeat: { count: "auto-fill", tracks: [{ fr: 1 }] } }] }), "GRID_INVALID_REPEAT"],
      ["repeat overflow", style({ columns: [{ repeat: { count: 1025, tracks: [20] } }] }), "GRID_TRACK_LIMIT"],
      ["explicit track overflow", style({ columns: Array.from({ length: 1025 }, () => 20) }), "GRID_TRACK_LIMIT"],
      ["implicit repeat", style({ autoColumns: { repeat: { count: 2, tracks: [20] } } as never }), "GRID_INVALID_TRACK"],
      ["ragged areas", style({ areas: [["a"], ["a", "a"]] }), "GRID_INVALID_AREA"],
      ["non-rectangular area", style({ areas: [["a", "a"], ["a", null]] }), "GRID_INVALID_AREA"],
      ["area track overflow", style({ areas: [Array.from({ length: 1025 }, () => "a")] }), "GRID_TRACK_LIMIT"],
      ["reserved line name", style({ columns: [{ size: 20, before: ["span"] }] }), "GRID_INVALID_TRACK"],
      ["unknown flow", style({ autoFlow: "diagonal" as never }), "GRID_INVALID_VALUE"],
    ]
    for (const [name, input, code] of cases) {
      const result = errorOf(input)
      expect(result, name).toMatchObject({ code, nodeId: 17 })
      expect(isGridLayoutError(result)).toBe(true)
      if (isGridLayoutError(result)) expect(Number.isFinite(result.nodeId)).toBe(true)
    }
  })

  it("exposes the complete stable error inventory without inventing stage behavior", () => {
    expect(GRID_ERROR_CODES).toHaveLength(10)
    for (const code of GRID_ERROR_CODES) {
      const result = createGridError(code, "gridTemplateColumns[0]", 17)
      expect(Object.isFrozen(result)).toBe(true)
      expect(isGridLayoutError(result)).toBe(true)
    }
  })
})
