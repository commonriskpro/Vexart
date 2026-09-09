import { describe, expect, it } from "bun:test"
import type { GridItemInput, GridSnapshot, GridStyle, GridTrackState } from "./grid-model"
import { createExpandedAxes, createExpandedTracks } from "./grid-model"
import { isGridLayoutError } from "./grid-errors"
import { resolveLines } from "./grid-lines"
import { autoPlace } from "./grid-auto-placement"
import { densePlace } from "./grid-dense"

function state(): GridTrackState {
  return { min: 40, max: 40, base: 40, growthLimit: 40, offset: 0 }
}

function snapshot(overrides: Partial<GridStyle> = {}): GridSnapshot {
  const style: GridStyle = {
    columns: [40, 40, 40],
    rows: [40, 40],
    autoColumns: "auto",
    autoRows: "auto",
    autoFlow: "row",
    areas: [],
    gap: 0,
    justifyContent: "start",
    alignContent: "start",
    justifyItems: "stretch",
    alignItems: "stretch",
    ...overrides,
  }
  return { nodeId: 1, revision: 1, style }
}

function lines(input: GridSnapshot, columns = 3, rows = 2) {
  const expanded = createExpandedAxes(
    createExpandedTracks("columns", Array.from({ length: columns }, state), columns),
    createExpandedTracks("rows", Array.from({ length: rows }, state), rows),
  )
  const result = resolveLines(input, expanded)
  if (isGridLayoutError(result)) throw new Error(`${result.code}: ${result.path}`)
  return result
}

function coordinates(result: { readonly items: readonly { readonly nodeId: number; readonly rowStart: number; readonly rowEnd: number; readonly columnStart: number; readonly columnEnd: number }[] }) {
  return result.items.map(({ nodeId, rowStart, rowEnd, columnStart, columnEnd }) => ({ nodeId, rowStart, rowEnd, columnStart, columnEnd }))
}

describe("Grid dense auto-placement", () => {
  const items: readonly GridItemInput[] = [
    { nodeId: 10, style: { row: { start: 1, end: 2 }, column: { start: 1, end: { span: 2 } } } },
    { nodeId: 11, style: { row: {}, column: { end: { span: 2 } } } },
    { nodeId: 12, style: {} },
  ]

  it("fills a previous row hole without changing source-order output", () => {
    const normalInput = snapshot()
    const denseInput = snapshot({ autoFlow: "row-dense" })
    const normal = autoPlace(normalInput, lines(normalInput), items)
    const dense = densePlace(denseInput, lines(denseInput), items)
    if (isGridLayoutError(normal) || isGridLayoutError(dense)) throw new Error("unexpected placement error")

    expect(coordinates(normal)).toEqual([
      { nodeId: 10, rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 2 },
      { nodeId: 11, rowStart: 1, rowEnd: 2, columnStart: 0, columnEnd: 2 },
      { nodeId: 12, rowStart: 1, rowEnd: 2, columnStart: 2, columnEnd: 3 },
    ])
    expect(coordinates(dense)).toEqual([
      { nodeId: 10, rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 2 },
      { nodeId: 11, rowStart: 1, rowEnd: 2, columnStart: 0, columnEnd: 2 },
      { nodeId: 12, rowStart: 0, rowEnd: 1, columnStart: 2, columnEnd: 3 },
    ])
    expect(dense.items.map(({ nodeId }) => nodeId)).toEqual([10, 11, 12])
  })

  it("fills previous column holes for column-dense flow", () => {
    const input = snapshot({ autoFlow: "column-dense", rows: [40, 40, 40] })
    const expanded = createExpandedAxes(
      createExpandedTracks("columns", [state(), state()], 2),
      createExpandedTracks("rows", [state(), state(), state()], 3),
    )
    const lineSet = resolveLines(input, expanded)
    if (isGridLayoutError(lineSet)) throw new Error("unexpected lines error")
    const result = densePlace(input, lineSet, [
      { nodeId: 20, style: { row: { start: 1, end: { span: 2 } }, column: { start: 1, end: 2 } } },
      { nodeId: 21, style: { row: { end: { span: 2 } }, column: {} } },
      { nodeId: 22, style: {} },
    ])
    if (isGridLayoutError(result)) throw new Error(`${result.code}: ${result.path}`)
    expect(coordinates(result)).toEqual([
      { nodeId: 20, rowStart: 0, rowEnd: 2, columnStart: 0, columnEnd: 1 },
      { nodeId: 21, rowStart: 0, rowEnd: 2, columnStart: 1, columnEnd: 2 },
      { nodeId: 22, rowStart: 2, rowEnd: 3, columnStart: 0, columnEnd: 1 },
    ])
  })

  it("uses the earliest free slot for one-axis definite items", () => {
    const input = snapshot({ autoFlow: "row-dense", columns: [40], rows: [40] })
    const result = densePlace(input, lines(input, 1, 1), [
      { nodeId: 30, style: { column: { start: 1, end: 2 }, row: {} } },
      { nodeId: 31, style: { column: { start: 1, end: 2 }, row: {} } },
    ])
    if (isGridLayoutError(result)) throw new Error(`${result.code}: ${result.path}`)
    expect(coordinates(result)).toEqual([
      { nodeId: 30, rowStart: 0, rowEnd: 1, columnStart: 0, columnEnd: 1 },
      { nodeId: 31, rowStart: 1, rowEnd: 2, columnStart: 0, columnEnd: 1 },
    ])
  })

  it("rejects invalid flow and non-dense invocation before publishing geometry", () => {
    const invalidInput = snapshot({ autoFlow: "diagonal" as never })
    const invalid = densePlace(invalidInput, lines(snapshot()), [{ nodeId: 40, style: {} }])
    expect(invalid).toEqual({ code: "GRID_INVALID_VALUE", path: "gridAutoFlow", nodeId: 1 })

    const normalInput = snapshot()
    const normal = densePlace(normalInput, lines(normalInput), [{ nodeId: 41, style: {} }])
    expect(normal).toEqual({ code: "GRID_INVALID_VALUE", path: "gridAutoFlow", nodeId: 1 })
  })
})
