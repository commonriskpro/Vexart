import { describe, expect, it } from "bun:test"
import {
  DIRECTION_LTR,
  EDGE_ALL,
  FLEX_DIRECTION_ROW,
  Node,
  getGridLayoutStats,
  resetGridLayoutStats,
  resolveGridLayout,
} from "../index.js"
import type { GridTrack } from "./grid-model.js"

const style = (columns: readonly GridTrack[], rows: readonly GridTrack[], gap = 0) => ({
  columns,
  rows,
  autoColumns: "auto" as const,
  autoRows: "auto" as const,
  autoFlow: "row" as const,
  areas: [] as readonly (readonly (string | null)[])[],
  gap,
  justifyContent: "start" as const,
  alignContent: "start" as const,
  justifyItems: "stretch" as const,
  alignItems: "stretch" as const,
})

describe("Grid Node composition", () => {
  it("lays out a real Node and publishes local child rectangles", () => {
    resetGridLayoutStats()
    const root = Node.create()
    root.setLayoutMode("grid")
    root.setGridStyle(style([{ fr: 1 }, { fr: 1 }], [40], 10))
    const first = Node.create()
    const second = Node.create()
    root.insertChild(first, 0)
    root.insertChild(second, 1)

    const result = root.calculateLayout(210, 40, DIRECTION_LTR)
    expect(result).toMatchObject({ error: null, stats: { noOp: false } })
    expect(root.getComputedWidth()).toBe(210)
    expect(first.getComputedWidth()).toBe(100)
    expect(second.getComputedLeft()).toBe(110)
    expect(second.getComputedWidth()).toBe(100)
    expect(getGridLayoutStats().layoutCalls).toBe(1)
  })

  it("keeps Grid and Flex nesting on the same Node tree", () => {
    const outer = Node.create()
    outer.setLayoutMode("grid")
    outer.setGridStyle(style([100, 100], [50], 10))
    const flex = Node.create()
    flex.setFlexDirection(FLEX_DIRECTION_ROW)
    const flexChild = Node.create()
    flexChild.setFlexGrow(1)
    flex.insertChild(flexChild, 0)
    outer.insertChild(Node.create(), 0)
    outer.insertChild(flex, 1)

    const result = outer.calculateLayout(210, 50)
    expect(result).toMatchObject({ error: null })
    expect(flex.getComputedLeft()).toBe(110)
    expect(flex.getComputedWidth()).toBe(100)
    expect(flexChild.getComputedWidth()).toBe(100)
  })

  it("dispatches nested modes through the stable flag and updates on mode changes", () => {
    const outer = Node.create()
    outer.setWidth(210)
    outer.setHeight(50)
    outer.setFlexDirection(FLEX_DIRECTION_ROW)
    const inner = Node.create()
    inner.setWidth(100)
    inner.setHeight(50)
    inner.setLayoutMode("grid")
    inner.setGridStyle(style([100], [50]))
    const leaf = Node.create()
    leaf.setWidth(80)
    leaf.setHeight(20)
    leaf.setGridItem({ column: { start: 1, end: 2 }, row: { start: 1, end: 2 } })
    inner.insertChild(leaf, 0)
    outer.insertChild(inner, 0)

    outer.calculateLayout(210, 50)
    expect(inner.getComputedWidth()).toBe(100)
    expect(leaf.getComputedWidth()).toBe(80)

    inner.setLayoutMode("flex")
    inner.setFlexDirection(FLEX_DIRECTION_ROW)
    outer.calculateLayout(210, 50)
    expect(inner.getComputedWidth()).toBe(100)
    expect(leaf.getComputedWidth()).toBe(80)

    inner.setLayoutMode("grid")
    outer.calculateLayout(210, 50)
    expect(inner.getComputedWidth()).toBe(100)
    expect(leaf.getComputedWidth()).toBe(80)
  })

  it("uses the Node measure callback, resizes, and reports no-op", () => {
    const widths: number[] = []
    const root = Node.create()
    root.setLayoutMode("grid")
    root.setGridStyle(style(["auto"], ["auto"]))
    const child = Node.create()
    child.setMeasureFunc((width, widthMode) => {
      widths.push(width)
      return { width: widthMode === 0 ? 60 : Math.min(60, width), height: 20 }
    })
    root.insertChild(child, 0)

    const first = root.calculateLayout(100, 40)
    const second = root.calculateLayout(100, 40)
    root.calculateLayout(140, 40)
    expect(first).toMatchObject({ error: null, stats: { intrinsicPasses: expect.any(Number) } })
    expect(second).toMatchObject({ error: null, stats: { noOp: true } })
    expect(widths.length).toBeGreaterThan(0)
    expect(child.getComputedWidth()).toBeGreaterThanOrEqual(0)
  })

  it("preserves Node px, percent, fit-content, and flex-grow sizing in Grid items", () => {
    const root = Node.create()
    root.setLayoutMode("grid")
    root.setWidth(400)
    root.setHeight(60)
    root.setGridStyle({ ...style([100, 100, 100, 100], [60]), justifyItems: "start", alignItems: "start" })

    const px = Node.create()
    px.setWidth(40)
    px.setHeight(20)
    px.setGridItem({ column: { start: 1, end: 2 }, row: { start: 1, end: 2 } })

    const percent = Node.create()
    percent.setWidthPercent(50)
    percent.setHeightPercent(50)
    percent.setGridItem({ column: { start: 2, end: 3 }, row: { start: 1, end: 2 } })

    const fit = Node.create()
    fit.setWidthFitContent()
    fit.setMeasureFunc(() => ({ width: 35, height: 12 }))
    fit.setGridItem({ column: { start: 3, end: 4 }, row: { start: 1, end: 2 } })

    const grow = Node.create()
    grow.setFlexGrow(1)
    grow.setMeasureFunc(() => ({ width: 20, height: 10 }))
    grow.setGridItem({ column: { start: 4, end: 5 }, row: { start: 1, end: 2 } })

    root.insertChild(px, 0)
    root.insertChild(percent, 1)
    root.insertChild(fit, 2)
    root.insertChild(grow, 3)
    expect(root.calculateLayout(400, 60)).toMatchObject({ error: null })
    expect([px.getComputedWidth(), px.getComputedHeight()]).toEqual([40, 20])
    expect([percent.getComputedWidth(), percent.getComputedHeight()]).toEqual([50, 30])
    expect([fit.getComputedWidth(), fit.getComputedHeight()]).toEqual([35, 12])
    expect([grow.getComputedWidth(), grow.getComputedHeight()]).toEqual([20, 10])
  })

  it("leaves the published layout untouched when a Grid snapshot is invalid", () => {
    const root = Node.create()
    root.setLayoutMode("grid")
    root.setGridStyle(style([100], [20]))
    const child = Node.create()
    root.insertChild(child, 0)
    root.calculateLayout(100, 20)
    const before = [child.getComputedLeft(), child.getComputedTop(), child.getComputedWidth(), child.getComputedHeight()]
    root.setGridStyle(style([{ percent: 101 }], [20]))

    const result = root.calculateLayout(100, 20)
    expect(result).toMatchObject({ error: { code: "GRID_INVALID_VALUE" } })
    expect([child.getComputedLeft(), child.getComputedTop(), child.getComputedWidth(), child.getComputedHeight()]).toEqual(before)
  })

  it("propagates a Flex-to-Grid error without publishing partial rectangles", () => {
    const root = Node.create()
    root.setWidth(220)
    root.setHeight(40)
    root.setFlexDirection(FLEX_DIRECTION_ROW)
    const grid = Node.create()
    grid.setWidth(100)
    grid.setHeight(20)
    grid.setLayoutMode("grid")
    grid.setGridStyle(style([100], [20]))
    const gridLeaf = Node.create()
    gridLeaf.setWidth(40)
    gridLeaf.setHeight(10)
    gridLeaf.setGridItem({ column: { start: 1, end: 2 }, row: { start: 1, end: 2 } })
    grid.insertChild(gridLeaf, 0)
    const sibling = Node.create()
    sibling.setWidth(80)
    sibling.setHeight(20)
    root.insertChild(grid, 0)
    root.insertChild(sibling, 1)
    root.calculateLayout(220, 40)
    const before = [
      root.getComputedLeft(), root.getComputedTop(), root.getComputedWidth(), root.getComputedHeight(),
      grid.getComputedLeft(), grid.getComputedTop(), grid.getComputedWidth(), grid.getComputedHeight(),
      gridLeaf.getComputedLeft(), gridLeaf.getComputedTop(), gridLeaf.getComputedWidth(), gridLeaf.getComputedHeight(),
      sibling.getComputedLeft(), sibling.getComputedTop(), sibling.getComputedWidth(), sibling.getComputedHeight(),
    ]

    grid.setGridStyle(style([{ percent: 101 }], [20]))
    const result = root.calculateLayout(220, 40)
    expect(result).toMatchObject({ error: { code: "GRID_INVALID_VALUE" } })
    expect([
      root.getComputedLeft(), root.getComputedTop(), root.getComputedWidth(), root.getComputedHeight(),
      grid.getComputedLeft(), grid.getComputedTop(), grid.getComputedWidth(), grid.getComputedHeight(),
      gridLeaf.getComputedLeft(), gridLeaf.getComputedTop(), gridLeaf.getComputedWidth(), gridLeaf.getComputedHeight(),
      sibling.getComputedLeft(), sibling.getComputedTop(), sibling.getComputedWidth(), sibling.getComputedHeight(),
    ]).toEqual(before)
  })

  it("propagates a nested Grid-to-Grid error transactionally", () => {
    const outer = Node.create()
    outer.setLayoutMode("grid")
    outer.setGridStyle(style([200], [40]))
    const inner = Node.create()
    inner.setLayoutMode("grid")
    inner.setGridStyle(style([200], [40]))
    const leaf = Node.create()
    leaf.setWidth(50)
    leaf.setHeight(10)
    leaf.setGridItem({ column: { start: 1, end: 2 }, row: { start: 1, end: 2 } })
    inner.insertChild(leaf, 0)
    outer.insertChild(inner, 0)
    outer.calculateLayout(200, 40)
    const before = [
      outer.getComputedLeft(), outer.getComputedTop(), outer.getComputedWidth(), outer.getComputedHeight(),
      inner.getComputedLeft(), inner.getComputedTop(), inner.getComputedWidth(), inner.getComputedHeight(),
      leaf.getComputedLeft(), leaf.getComputedTop(), leaf.getComputedWidth(), leaf.getComputedHeight(),
    ]

    inner.setGridStyle(style([{ percent: 101 }], [40]))
    const result = outer.calculateLayout(200, 40)
    expect(result).toMatchObject({ error: { code: "GRID_INVALID_VALUE" } })
    expect([
      outer.getComputedLeft(), outer.getComputedTop(), outer.getComputedWidth(), outer.getComputedHeight(),
      inner.getComputedLeft(), inner.getComputedTop(), inner.getComputedWidth(), inner.getComputedHeight(),
      leaf.getComputedLeft(), leaf.getComputedTop(), leaf.getComputedWidth(), leaf.getComputedHeight(),
    ]).toEqual(before)
  })

  it("keeps the fixed-leaf dirty fast path equivalent to a fresh full plan", () => {
    const root = Node.create()
    root.setLayoutMode("grid")
    root.setWidth(210)
    root.setHeight(40)
    root.setPadding(EDGE_ALL, 8)
    root.setBorder(EDGE_ALL, 2)
    root.setGridStyle(style([100, 100], [40], 10))
    const first = Node.create()
    const second = Node.create()
    first.setWidth(80)
    first.setHeight(20)
    second.setWidth(60)
    second.setHeight(20)
    first.setGridItem({ column: { start: 1, end: 2 }, row: { start: 1, end: 2 } })
    second.setGridItem({ column: { start: 2, end: 3 }, row: { start: 1, end: 2 } })
    root.insertChild(first, 0)
    root.insertChild(second, 1)
    root.calculateLayout(210, 40)

    second.setWidth(90)
    const freshRoot = Node.create()
    freshRoot.setLayoutMode("grid")
    freshRoot.setWidth(210)
    freshRoot.setHeight(40)
    freshRoot.setPadding(EDGE_ALL, 8)
    freshRoot.setBorder(EDGE_ALL, 2)
    freshRoot.setGridStyle(style([100, 100], [40], 10))
    const freshFirst = Node.create()
    const freshSecond = Node.create()
    freshFirst.setWidth(80)
    freshFirst.setHeight(20)
    freshSecond.setWidth(90)
    freshSecond.setHeight(20)
    freshFirst.setGridItem({ column: { start: 1, end: 2 }, row: { start: 1, end: 2 } })
    freshSecond.setGridItem({ column: { start: 2, end: 3 }, row: { start: 1, end: 2 } })
    freshRoot.insertChild(freshFirst, 0)
    freshRoot.insertChild(freshSecond, 1)
    const fresh = resolveGridLayout(freshRoot, 210, 40)
    if (!("boxes" in fresh)) throw new Error(`unexpected fresh-plan error: ${fresh.code}`)
    resetGridLayoutStats()
    root.calculateLayout(210, 40)
    expect(second.getComputedLeft()).toBe(Math.round(fresh.originX + fresh.boxes[1]!.x))
    expect(second.getComputedTop()).toBe(Math.round(fresh.originY + fresh.boxes[1]!.y))
    expect(second.getComputedWidth()).toBe(Math.round(fresh.boxes[1]!.width))
    expect(second.getComputedHeight()).toBe(Math.round(fresh.boxes[1]!.height))
    expect(getGridLayoutStats().layoutCalls).toBe(1)
    expect(root.calculateLayout(210, 40)).toMatchObject({ error: null, stats: { noOp: true } })
  })
})
