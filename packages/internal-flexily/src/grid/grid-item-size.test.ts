import { describe, expect, it } from "bun:test"
import type { AxisSizingResult, GridResolvedPlacement, GridTrackSize, GridTrackState } from "./grid-model"
import { isGridLayoutError } from "./grid-errors"
import { resolveItemRects, resolveItemSizes, sizeItems } from "./grid-item-size"

function state(size: GridTrackSize, base: number): GridTrackState {
  return { min: size, max: size, base, growthLimit: base, offset: 0 }
}

function sizing(base: readonly number[], axis: "columns" | "rows", explicitLines?: readonly number[]): AxisSizingResult {
  let position = 0
  const tracks = base.map((value) => {
    const track = state(value, value)
    const result = { ...track, offset: position }
    position += value
    return result
  })
  return { axis, tracks, lines: explicitLines ?? tracks.flatMap(({ offset, base: value }) => [offset, offset + value]) }
}

function placement(columnStart = 0, columnEnd = 1, rowStart = 0, rowEnd = 1, nodeId = 1): GridResolvedPlacement {
  return { nodeId, rowStart, rowEnd, columnStart, columnEnd }
}

function expectResult(result: ReturnType<typeof resolveItemSizes>) {
  expect(isGridLayoutError(result)).toBe(false)
  if (isGridLayoutError(result)) throw new Error(result.code)
  return result
}

const axes = {
  columns: sizing([100, 50], "columns"),
  rows: sizing([80, 40], "rows"),
}

describe("Grid item area and local sizing", () => {
  it("forms a spanning area from aligned track edges, including effective gutters", () => {
    const columns = sizing([50, 50], "columns", [0, 50, 60, 110])
    const result = expectResult(resolveItemSizes({
      columns,
      rows: sizing([20], "rows"),
      items: [{ placement: placement(0, 2), style: { width: "grow", height: "grow" } }],
    }))

    expect(result.areas).toEqual([{
      nodeId: 1,
      rowStart: 0,
      rowEnd: 1,
      columnStart: 0,
      columnEnd: 2,
      x: 0,
      y: 0,
      width: 110,
      height: 20,
    }])
    expect(result.boxes).toEqual([{ nodeId: 1, x: 0, y: 0, width: 110, height: 20 }])
  })

  it("resolves px and percent dimensions inside an area", () => {
    const result = expectResult(resolveItemSizes({
      ...axes,
      items: [
        { placement: placement(0, 1, 0, 1, 1), style: { width: 40, height: 20, justifySelf: "start", alignSelf: "start" } },
        { placement: placement(1, 2, 0, 1, 2), style: { width: { percent: 50 }, height: { percent: 50 }, justifySelf: "start", alignSelf: "start" } },
      ],
    }))

    expect(result.boxes).toEqual([
      { nodeId: 1, x: 0, y: 0, width: 40, height: 20 },
      { nodeId: 2, x: 100, y: 0, width: 25, height: 40 },
    ])
  })

  it("resolves fit, grow, and intrinsic auto sizes with min/max caps", () => {
    const result = expectResult(sizeItems({
      columns: sizing([100], "columns"),
      rows: sizing([80], "rows"),
      items: [
        { placement: placement(), intrinsic: { minContentWidth: 20, maxContentWidth: 70, minContentHeight: 10, maxContentHeight: 30 }, style: { width: "fit", height: "fit", justifySelf: "start", alignSelf: "start" } },
        { placement: placement(0, 1, 0, 1, 2), intrinsic: { width: 20, height: 10 }, style: { width: "auto", height: "auto", minWidth: 50, maxWidth: 60, justifySelf: "start", alignSelf: "start" } },
      ],
    }))

    expect(result.boxes).toEqual([
      { nodeId: 1, x: 0, y: 0, width: 70, height: 30 },
      { nodeId: 2, x: 0, y: 0, width: 50, height: 10 },
    ])
  })

  it("uses default stretch while respecting numeric margins, padding, and border", () => {
    const result = expectResult(resolveItemSizes({
      columns: sizing([100], "columns"),
      rows: sizing([80], "rows"),
      items: [{
        placement: placement(),
        style: { margin: 10, padding: 8, border: 2 },
      }],
    }))

    // Stretch fills the margin box's available area. Padding and border are
    // part of that border-box and therefore do not reduce the outer rect.
    expect(result.boxes).toEqual([{ nodeId: 1, x: 10, y: 10, width: 80, height: 60 }])
  })

  it("applies self alignment to an intrinsic item", () => {
    const result = resolveItemRects({
      columns: sizing([100], "columns"),
      rows: sizing([80], "rows"),
      items: [{
        placement: placement(),
        intrinsic: { width: 20, height: 10 },
        style: { width: "auto", height: "auto", justifySelf: "end", alignSelf: "center", margin: { left: 5, right: 5, top: 2, bottom: 2 } },
      }],
    })
    expect(isGridLayoutError(result)).toBe(false)
    if (isGridLayoutError(result)) throw new Error(result.code)

    expect(result).toEqual([{ nodeId: 1, x: 75, y: 35, width: 20, height: 10 }])
  })

  it("accepts box/text/image/canvas entries without introducing renderer behavior", () => {
    const result = expectResult(resolveItemSizes({
      columns: sizing([40, 40, 40, 40], "columns"),
      rows: sizing([20], "rows"),
      items: ["box", "text", "img", "canvas"].map((kind, index) => ({
        kind,
        placement: placement(index, index + 1, 0, 1, index + 1),
        style: { width: 20, height: 10, justifySelf: "center", alignSelf: "center" },
      })),
    }))

    expect(result.boxes.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 10, y: 5, width: 20, height: 10 },
      { x: 50, y: 5, width: 20, height: 10 },
      { x: 90, y: 5, width: 20, height: 10 },
      { x: 130, y: 5, width: 20, height: 10 },
    ])
  })

  it("rejects baseline and auto margins and never publishes negative sizes", () => {
    const baseline = resolveItemSizes({
      columns: sizing([40], "columns"),
      rows: sizing([20], "rows"),
      items: [{ placement: placement(), style: { alignSelf: "baseline" as never } }],
    })
    const margin = resolveItemSizes({
      columns: sizing([40], "columns"),
      rows: sizing([20], "rows"),
      items: [{ placement: placement(), style: { margin: { left: "auto" as never } } }],
    })
    const negative = resolveItemSizes({
      columns: sizing([40], "columns"),
      rows: sizing([20], "rows"),
      items: [{ placement: placement(), style: { width: -1 } }],
    })

    expect(baseline).toMatchObject({ code: "GRID_UNSUPPORTED_ALIGNMENT" })
    expect(margin).toMatchObject({ code: "GRID_UNSUPPORTED_ALIGNMENT" })
    expect(negative).toMatchObject({ code: "GRID_INVALID_VALUE" })
  })
})
