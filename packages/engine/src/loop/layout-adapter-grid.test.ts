import { describe, expect, test } from "bun:test"
import { DISPLAY_NONE } from "flexily"
import { CMD } from "../ffi/render-graph"
import { createNode, insertChild, parseSizing, type TGENode, type TGEProps } from "../ffi/node"
import { syncAllLayoutProps } from "../ffi/flex-sync"
import { walkTree, type WalkTreeState } from "./walk-tree"
import { ATTACH_POINT, createVexartLayoutCtx } from "./layout-adapter"
import { hashString, traverseFrame } from "./pipeline-traverse"

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
  const state: WalkTreeState = {
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
  }
  walkTree(root, state)
  layout.calculateRoots(root._flexNode)

  const layoutError = layout.getLastLayoutError()
  if (layoutError) {
    return {
      layout,
      result: { success: false, layerBuckets: [], hasAnyTransforms: false, error: layoutError },
      ops: [],
    }
  }

  state.rectNodes.length = 0
  state.textNodes.length = 0
  state.boxNodes.length = 0
  state.nodeRefById.clear()
  state.rectNodeById.clear()
  state.scrollContainers.length = 0
  state.layerBoundaries.length = 0

  const result = traverseFrame(root, state, width, height)
  return { layout, result, ops: result.layerBuckets.flatMap((b) => b.ops) }
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
    expect(root.layout).toMatchObject({ x: 0, y: 0, width: 300, height: 100 })
    expect(first.layout).toMatchObject({ x: 0, y: 0, width: 100, height: 100 })
    expect(second.layout).toMatchObject({ x: 110, y: 0, width: 190, height: 100 })
    expect(state.ops.filter((op) => op.kind === "rectangle" || op.type === CMD.RECTANGLE).map((op) => op.nodeId)).toEqual([root.id, first.id, second.id])
    expect(state.result.success).toBe(true)
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
    expect(gridChild.layout).toMatchObject({ x: 0, y: 0, width: 100, height: 20 })
    gridState.layout.destroy()

    const flexChild = box({ width: 100, height: 20 })
    const flexRoot = box({ width: 100, height: 20, direction: "row" }, [flexChild])
    const flexState = layoutState(flexRoot, 100, 20)
    expect(flexChild.layout).toMatchObject({ x: 0, y: 0, width: 100, height: 20 })
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

    expect(gridA.layout).toMatchObject({ x: 0, y: 0, width: 100, height: 20 })
    expect(gridB.layout).toMatchObject({ x: 110, y: 0, width: 190, height: 20 })
    expect(flexA.layout).toMatchObject({ x: 0, y: 0, width: 100, height: 20 })
    expect(flexB.layout).toMatchObject({ x: 110, y: 0, width: 190, height: 20 })
    expect(gridA.layout.x).toBe(flexA.layout.x)
    expect(gridB.layout.x).toBe(flexB.layout.x)

    gridState.layout.destroy()
    flexState.layout.destroy()
  })

  test("detects a Grid error via traverseFrame return value and recovers when valid", () => {
    const child = box({
      layout: "grid",
      width: 100,
      height: 20,
      gridTemplateColumns: [{ percent: 101 }],
      gridTemplateRows: [20],
    })
    const root = box({ width: 100, height: 20 }, [child])

    syncTree(root)
    const invalidState = layoutState(root, 100, 20)
    expect(invalidState.result.success).toBe(false)
    invalidState.layout.destroy()

    child.props = { ...child.props, gridTemplateColumns: [100] }
    syncTree(root)
    const validState = layoutState(root, 100, 20)
    expect(validState.result.success).toBe(true)
    expect(root.layout).toMatchObject({ x: 0, y: 0, width: 100, height: 20 })
    expect(child.layout).toMatchObject({ x: 0, y: 0, width: 100, height: 20 })
    validState.layout.destroy()
  })

  test("excludes parent and element floating children from Grid placement", () => {
    const anchor = box({ width: 50, height: 30 })
    anchor.id = hashString("anchor")
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
    expect(state.result.success).toBe(true)
    expect(anchor.layout).toMatchObject({ x: 0, y: 0, width: 50, height: 30 })
    expect(parentFloating.layout).toMatchObject({ x: 201, y: 102, width: 20, height: 10 })
    expect(elementFloating.layout).toMatchObject({ x: 51, y: 32, width: 20, height: 10 })
    state.layout.destroy()
  })
})
