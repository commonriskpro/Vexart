import { describe, expect, test } from "bun:test"
import { DISPLAY_NONE } from "flexily"
import { CMD } from "../ffi/render-graph"
import { createNode, insertChild, parseSizing, type TGENode, type TGEProps } from "../ffi/node"
import { syncAllLayoutProps } from "../ffi/flex-sync"
import { walkTree } from "./walk-tree"
import { ATTACH_POINT, createVexartLayoutCtx, type PositionedCommand } from "./layout-adapter"

function box(props: TGEProps, children: TGENode[] = []): TGENode {
  const node = createNode("box")
  node.props = props
  node._widthSizing = parseSizing(props.width)
  node._heightSizing = parseSizing(props.height)
  for (const child of children) insertChild(node, child)
  return node
}

function syncTree(node: TGENode): void {
  syncAllLayoutProps(node)
  for (const child of node.children) syncTree(child)
}

function layoutState(root: TGENode, width: number, height: number) {
  syncTree(root)
  const layout = createVexartLayoutCtx()
  layout.init(width, height)
  layout.beginLayout()
  walkTree(root, {
    scrollSpeedCap: { value: 0 },
    nodeCount: { value: 0 },
    rectNodes: [],
    textNodes: [],
    boxNodes: [],
    layerBoundaries: [],
    scrollContainers: [],
    nodeRefById: new Map(),
    rectNodeById: new Map(),
    layout,
  })
  const commands = layout.endLayout(root._flexNode)
  const map = layout.getLastLayoutMap()!
  return { layout, commands, map }
}

function rect(map: Map<number, PositionedCommand>, node: TGENode) {
  const value = map.get(node.id)
  if (!value) throw new Error(`missing layout for node ${node.id}`)
  return value
}

describe("layout adapter Grid profile", () => {
  test("uses the existing begin/end pipeline and one local PositionedCommand map", () => {
    const first = box({ width: 100, height: 100, backgroundColor: 0xff0000ff })
    const second = box({ width: 190, height: 100, backgroundColor: 0x00ff00ff })
    const root = box({
      layout: "grid",
      width: 300,
      height: 100,
      gridTemplateColumns: [100, 190],
      gridTemplateRows: [100],
      gridColumn: undefined,
      gap: 10,
      backgroundColor: 0xffffffff,
    }, [first, second])
    first.props = { ...first.props, gridColumn: { start: 1, end: 2 } }
    second.props = { ...second.props, gridColumn: { start: 2, end: 3 } }

    const state = layoutState(root, 300, 100)
    expect(rect(state.map, root)).toMatchObject({ x: 0, y: 0, width: 300, height: 100, contentW: 300, contentH: 100 })
    expect(rect(state.map, first)).toMatchObject({ x: 0, y: 0, width: 100, height: 100 })
    expect(rect(state.map, second)).toMatchObject({ x: 110, y: 0, width: 190, height: 100 })
    expect(state.commands.filter((command) => command.type === CMD.RECTANGLE).map((command) => command.nodeId)).toEqual([root.id, first.id, second.id])
    expect(state.layout.getLastLayoutMap()).toBe(state.map)
    state.layout.destroy()
  })

  test("calculates a Grid root exactly once and keeps Flex roots on the same path", () => {
    const gridChild = box({ width: 100, height: 20 })
    const gridRoot = box({ layout: "grid", width: 100, height: 20, gridTemplateColumns: [100], gridTemplateRows: [20] }, [gridChild])
    const gridFlex = gridRoot._flexNode!
    let gridCalls = 0
    const calculateGrid = gridFlex.calculateLayout.bind(gridFlex)
    gridFlex.calculateLayout = (...args) => {
      gridCalls++
      return calculateGrid(...args)
    }
    const gridState = layoutState(gridRoot, 100, 20)
    expect(gridCalls).toBe(1)
    expect(rect(gridState.map, gridChild)).toMatchObject({ x: 0, y: 0, width: 100, height: 20 })
    gridState.layout.destroy()

    const flexChild = box({ width: 100, height: 20 })
    const flexRoot = box({ width: 100, height: 20, direction: "row" }, [flexChild])
    const flexState = layoutState(flexRoot, 100, 20)
    expect(rect(flexState.map, flexChild)).toMatchObject({ x: 0, y: 0, width: 100, height: 20 })
    flexState.layout.destroy()
  })

  test("Grid and equivalent Flex row produce the same local geometry without rounding in the adapter", () => {
    const gridA = box({ width: 100, height: 20 })
    const gridB = box({ width: 190, height: 20 })
    const grid = box({ layout: "grid", width: 300, height: 20, gridTemplateColumns: [100, 190], gridTemplateRows: [20], gap: 10 }, [gridA, gridB])
    gridA.props = { ...gridA.props, gridColumn: { start: 1, end: 2 } }
    gridB.props = { ...gridB.props, gridColumn: { start: 2, end: 3 } }
    const gridState = layoutState(grid, 300, 20)

    const flexA = box({ width: 100, height: 20 })
    const flexB = box({ width: 190, height: 20 })
    const flex = box({ width: 300, height: 20, direction: "row", gap: 10 }, [flexA, flexB])
    const flexState = layoutState(flex, 300, 20)

    expect(rect(gridState.map, gridA)).toMatchObject({ x: 0, y: 0, width: 100, height: 20 })
    expect(rect(gridState.map, gridB)).toMatchObject({ x: 110, y: 0, width: 190, height: 20 })
    expect(rect(flexState.map, flexA)).toMatchObject({ x: 0, y: 0, width: 100, height: 20 })
    expect(rect(flexState.map, flexB)).toMatchObject({ x: 110, y: 0, width: 190, height: 20 })
    expect(rect(gridState.map, gridA).x).toBe(rect(flexState.map, flexA).x)
    expect(rect(gridState.map, gridB).x).toBe(rect(flexState.map, flexB).x)

    gridState.layout.destroy()
    flexState.layout.destroy()
  })

  test("ignores a stale error from a hidden Grid subtree", () => {
    const child = box({
      layout: "grid",
      width: 100,
      height: 20,
      gridTemplateColumns: [{ percent: 101 }],
      gridTemplateRows: [20],
    })
    const root = box({ width: 100, height: 20 }, [child])

    syncTree(root)
    const childFlex = child._flexNode!
    expect(childFlex.calculateLayout(100, 20)).toMatchObject({ error: { code: "GRID_INVALID_VALUE" } })
    childFlex.setDisplay(DISPLAY_NONE)

    const state = layoutState(root, 100, 20)
    expect(state.layout.getLastLayoutError()).toBeNull()
    expect(rect(state.map, root)).toMatchObject({ x: 0, y: 0, width: 100, height: 20 })
    state.layout.destroy()
  })

  test("excludes parent and element floating children from Grid placement", () => {
    const anchor = box({ width: 50, height: 30 })
    anchor.id = createVexartLayoutCtx().hashString("anchor")
    anchor.props = {
      ...anchor.props,
      gridColumn: { start: 1, end: 2 },
      gridRow: { start: 1, end: 2 },
    }
    const parentFloating = box({
      width: 20,
      height: 10,
      floating: "parent",
      floatAttach: { element: ATTACH_POINT.LEFT_TOP, parent: ATTACH_POINT.RIGHT_BOTTOM },
      floatOffset: { x: 1, y: 2 },
    })
    const elementFloating = box({
      width: 20,
      height: 10,
      floating: { attachTo: "anchor" },
      floatAttach: { element: ATTACH_POINT.LEFT_TOP, parent: ATTACH_POINT.RIGHT_BOTTOM },
      floatOffset: { x: 1, y: 2 },
    })
    const root = box({
      layout: "grid",
      width: 200,
      height: 100,
      gridTemplateColumns: [200],
      gridTemplateRows: [100],
      justifyItems: "start",
      alignItems: "start",
    }, [anchor, parentFloating, elementFloating])

    const state = layoutState(root, 200, 100)
    expect(state.layout.getLastLayoutError()).toBeNull()
    expect(rect(state.map, anchor)).toMatchObject({ x: 0, y: 0, width: 50, height: 30 })
    expect(rect(state.map, parentFloating)).toMatchObject({ x: 201, y: 102, width: 20, height: 10 })
    expect(rect(state.map, elementFloating)).toMatchObject({ x: 51, y: 32, width: 20, height: 10 })
    state.layout.destroy()
  })
})
