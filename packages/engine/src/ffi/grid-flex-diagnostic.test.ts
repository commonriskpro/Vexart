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
import { walkTree } from "../loop/walk-tree"
import { createVexartLayoutCtx } from "../loop/layout-adapter"

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

function frame(root: TGENode, layout: ReturnType<typeof createVexartLayoutCtx>) {
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
  return { commands, map: layout.getLastLayoutMap() }
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
    expect(result.commands).toEqual([])
    expect(layout.getLastLayoutMap()).toBeNull()
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
    const previousMap = valid.map
    expect(previousMap?.get(root.id)).toMatchObject({ x: 0, y: 0, width: 100, height: 20 })
    expect(layout.getLastLayoutError()).toBeNull()

    root.props = { ...root.props, flexWrap: "wrap" } as FlexOnlyGridProps
    syncLayoutProp(root, "flexWrap", "wrap")
    const invalid = frame(root, layout)

    expect(layout.getLastLayoutError()).toEqual({
      code: "GRID_INVALID_VALUE",
      path: "flexWrap",
      nodeId: root._flexNode!.getGridNodeId(),
    })
    expect(invalid.map).toBe(previousMap)
    expect(invalid.map?.get(root.id)).toMatchObject({ x: 0, y: 0, width: 100, height: 20 })

    root.props = { ...root.props, flexWrap: undefined } as FlexOnlyGridProps
    syncLayoutProp(root, "flexWrap", undefined)
    frame(root, layout)
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
    const previousMap = valid.map
    expect(layout.getLastLayoutError()).toBeNull()

    child.props = { ...child.props, alignY: "center" }
    syncLayoutProp(child, "alignY", "center")
    const invalid = frame(root, layout)

    expect(layout.getLastLayoutError()).toEqual({
      code: "GRID_INVALID_VALUE",
      path: "alignY",
      nodeId: child._flexNode!.getGridNodeId(),
    })
    expect(invalid.map).toBe(previousMap)
    expect(invalid.map?.get(child.id)).toMatchObject({ width: 30, height: 7 })
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

    frame(root, layout)
    expect(layout.getLastLayoutError()).toBeNull()
    expect(layout.getLastLayoutMap()?.get(child.id)).toMatchObject({ width: 100, height: 20 })

    child.props = { ...child.props, width: "fit", height: "fit" }
    child._widthSizing = parseSizing(child.props.width)
    child._heightSizing = parseSizing(child.props.height)
    syncLayoutProp(child, "width", child.props.width)
    syncLayoutProp(child, "height", child.props.height)
    frame(root, layout)
    expect(layout.getLastLayoutError()).toBeNull()
    expect(layout.getLastLayoutMap()?.get(child.id)).toMatchObject({ width: 30, height: 7 })
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
