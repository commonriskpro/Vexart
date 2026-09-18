import { describe, expect, test } from "bun:test"
import { FLEX_DIRECTION_ROW } from "flexily"
import {
  createNode,
  getGridLayoutError,
  insertChild,
  parseSizing,
  type TGENode,
  type TGEProps,
} from "./node"
import { syncAllLayoutProps, syncLayoutProp } from "./flex-sync"
import { walkTree, type WalkTreeState } from "../loop/walk-tree"
import { createVexartLayoutCtx } from "../loop/layout-adapter"
import { traverseFrame } from "../loop/pipeline-traverse"

type FlexOnlyGridProps = TGEProps & {
  readonly flexBasis?: number
  readonly flexWrap?: "nowrap" | "wrap" | "wrap-reverse"
}

function box(props: FlexOnlyGridProps = {}, children: TGENode[] = []): TGENode {
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

function frame(root: TGENode, layout: ReturnType<typeof createVexartLayoutCtx>, width = 100, height = 20) {
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
  const error = layout.calculateRoots(root._flexNode)

  state.rectNodes.length = 0
  state.textNodes.length = 0
  state.boxNodes.length = 0
  state.nodeRefById.clear()
  state.rectNodeById.clear()
  state.scrollContainers.length = 0
  state.layerBoundaries.length = 0

  if (error) {
    return {
      success: false,
      error,
    }
  }

  const result = traverseFrame(root, state, width, height)
  return { success: result.success, result }
}

function gridRoot(extra: FlexOnlyGridProps = {}): TGENode {
  return box({
    layout: "grid",
    width: 100,
    height: 20,
    gridTemplateColumns: [100],
    gridTemplateRows: [20],
    ...extra,
  })
}

describe("Grid/Flex boundary diagnostics", () => {
  test("publishes an initial Flex-only Grid prop through GridCalculateResult", () => {
    const root = gridRoot({ flexDirection: "row" })
    syncTree(root)
    const layout = createVexartLayoutCtx()
    layout.init(100, 20)

    const result = frame(root, layout)
    const expected = {
      code: "GRID_INVALID_VALUE",
      path: "flexDirection",
      nodeId: root._flexNode!.getGridNodeId(),
    } as const
    expect(result.success).toBe(false)
    expect(getGridLayoutError(root)).toEqual(expected)
    expect(layout.getLastLayoutError()).toEqual(expected)
    layout.destroy()
  })

  test("keeps the previous frame when a Flex-only prop becomes invalid", () => {
    const root = gridRoot()
    syncTree(root)
    const layout = createVexartLayoutCtx()
    layout.init(100, 20)
    const valid = frame(root, layout)
    expect(valid.success).toBe(true)
    expect(root.layout).toMatchObject({ x: 0, y: 0, width: 100, height: 20 })
    expect(layout.getLastLayoutError()).toBeNull()
    const previousRoot = { ...root.layout }

    root.props = { ...root.props, flexWrap: "wrap" } as FlexOnlyGridProps
    syncLayoutProp(root, "flexWrap", "wrap")
    const invalid = frame(root, layout)

    expect(layout.getLastLayoutError()).toEqual({
      code: "GRID_INVALID_VALUE",
      path: "flexWrap",
      nodeId: root._flexNode!.getGridNodeId(),
    })
    expect(invalid.success).toBe(false)
    expect(root.layout).toEqual(previousRoot)

    root.props = { ...root.props, flexWrap: undefined } as FlexOnlyGridProps
    syncLayoutProp(root, "flexWrap", undefined)
    const recovered = frame(root, layout)
    expect(recovered.success).toBe(true)
    expect(layout.getLastLayoutError()).toBeNull()
    layout.destroy()
  })

  test("refreshes the Grid diagnostic when a child alias changes after a valid frame", () => {
    const child = box({ width: 30, height: 7 })
    const root = box({
      layout: "grid",
      width: 100,
      height: 20,
      gridTemplateColumns: [100],
      gridTemplateRows: [20],
    }, [child])
    syncTree(root)
    const layout = createVexartLayoutCtx()
    layout.init(100, 20)
    const valid = frame(root, layout)
    expect(valid.success).toBe(true)
    expect(child.layout).toMatchObject({ width: 30, height: 7 })
    expect(layout.getLastLayoutError()).toBeNull()
    const previousChild = { ...child.layout }

    child.props = { ...child.props, alignY: "center" }
    syncLayoutProp(child, "alignY", "center")
    const invalid = frame(root, layout)

    expect(layout.getLastLayoutError()).toEqual({
      code: "GRID_INVALID_VALUE",
      path: "alignY",
      nodeId: child._flexNode!.getGridNodeId(),
    })
    expect(invalid.success).toBe(false)
    expect(child.layout).toEqual(previousChild)
    layout.destroy()
  })

  test("keeps omitted Grid item sizing stretchable and explicit fit shrink-wrapped", () => {
    const child = box()
    child._flexNode!.setMeasureFunc(() => ({ width: 30, height: 7 }))
    const root = gridRoot()
    insertChild(root, child)
    syncTree(root)
    const layout = createVexartLayoutCtx()
    layout.init(100, 20)

    const first = frame(root, layout)
    expect(first.success).toBe(true)
    expect(layout.getLastLayoutError()).toBeNull()
    expect(child.layout).toMatchObject({ width: 100, height: 20 })

    child.props = { ...child.props, width: "fit", height: "fit" }
    child._widthSizing = parseSizing(child.props.width)
    child._heightSizing = parseSizing(child.props.height)
    syncLayoutProp(child, "width", child.props.width)
    syncLayoutProp(child, "height", child.props.height)
    const second = frame(root, layout)
    expect(second.success).toBe(true)
    expect(layout.getLastLayoutError()).toBeNull()
    expect(child.layout).toMatchObject({ width: 30, height: 7 })
    layout.destroy()
  })

  test("diagnoses Grid-item growth/basis without changing the child's own Flex mode", () => {
    const child = box({ flexGrow: 1, flexShrink: 1, flexBasis: 20, direction: "row" })
    const root = box({
      layout: "grid",
      width: 100,
      height: 20,
      gridTemplateColumns: [100],
      gridTemplateRows: [20],
    }, [child])
    syncTree(root)
    expect(child._flexNode!.getFlexDirection()).toBe(FLEX_DIRECTION_ROW)
    const layout = createVexartLayoutCtx()
    layout.init(100, 20)
    frame(root, layout)

    // flexGrow is the first deterministic item diagnostic; basis/shrink are
    // retained in the bridge diagnostics and do not silently become tracks.
    expect(layout.getLastLayoutError()).toEqual({
      code: "GRID_INVALID_VALUE",
      path: "flexGrow",
      nodeId: child._flexNode!.getGridNodeId(),
    })
    layout.destroy()
  })

  test("does not reject Flex growth when the Grid child is inside a Flex parent", () => {
    const child = box({ layout: "grid", width: 20, height: 20, flexGrow: 1 })
    const root = box({ width: 100, height: 20, direction: "row" }, [child])
    syncTree(root)
    const layout = createVexartLayoutCtx()
    layout.init(100, 20)
    frame(root, layout)
    expect(layout.getLastLayoutError()).toBeNull()
    expect(child._flexNode!.getLayoutMode()).toBe("grid")
    layout.destroy()
  })
})
