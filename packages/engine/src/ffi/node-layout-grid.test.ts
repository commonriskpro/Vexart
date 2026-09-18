import { describe, expect, test } from "bun:test"
import { createNode, createTextNode, insertChild, parseSizing } from "./node"
import { syncAllLayoutProps } from "./flex-sync"
import { traverseFrame } from "../loop/pipeline-traverse"
import { createVexartLayoutCtx } from "../loop/layout-adapter"
import { walkTree, type WalkTreeState } from "../loop/walk-tree"
import type { TGENode, TGEProps } from "./node"

function box(props: TGEProps, children: TGENode[] = []) {
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

function frame(root: TGENode, width = 200, height = 100) {
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
  const calcResult = root._flexNode?.calculateLayout(width, height)
  const isError = Boolean(calcResult && typeof calcResult === "object" && "error" in calcResult && (calcResult as any).error)

  state.rectNodes.length = 0
  state.textNodes.length = 0
  state.boxNodes.length = 0
  state.nodeRefById.clear()
  state.rectNodeById.clear()
  state.scrollContainers.length = 0
  state.layerBoundaries.length = 0

  if (isError) {
    return {
      layout,
      state,
      result: { success: false, layerBuckets: [], hasAnyTransforms: false, error: (calcResult as any).error },
    }
  }

  const result = traverseFrame(root, state, width, height)
  return { layout, state, result }
}

function rect(node: TGENode) {
  return { x: node.layout.x, y: node.layout.y, width: node.layout.width, height: node.layout.height }
}

describe("Node/layout Grid integration", () => {
  test("writes layout directly to box and text nodes and computes transform", () => {
    const childBox = box({ width: 200, height: 40 })
    const text = createNode("text")
    insertChild(text, createTextNode("grid text"))
    const root = box({
      layout: "grid",
      width: 200,
      height: 100,
      gridTemplateColumns: [200],
      gridTemplateRows: [40, 60],
      backgroundColor: 0x102030ff,
      transform: { translateX: 4 },
    }, [childBox, text])
    syncTree(root)

    const first = frame(root)
    expect(first.result.success).toBe(true)
    expect(rect(root)).toEqual({ x: 0, y: 0, width: 200, height: 100 })
    expect(rect(childBox)).toEqual({ x: 0, y: 0, width: 200, height: 40 })
    expect(rect(text)).toEqual({ x: 200, y: 0, width: 8, height: 40 })
    expect(root._transform).not.toBeNull()

    first.layout.destroy()

    const second = frame(root)
    expect(second.result.success).toBe(true)
    expect(rect(root)).toEqual({ x: 0, y: 0, width: 200, height: 100 })
    expect(rect(childBox)).toEqual({ x: 0, y: 0, width: 200, height: 40 })
    expect(rect(text)).toEqual({ x: 200, y: 0, width: 8, height: 40 })
    expect(root._transform).not.toBeNull()
    second.layout.destroy()
  })

  test("keeps prior geometry, damage, and transforms when Grid calculation is invalid", () => {
    const child = box({ gridColumn: { start: 1, end: 2 }, width: 100, height: 20 })
    const root = box({
      layout: "grid",
      width: 100,
      height: 20,
      gridTemplateColumns: [100],
      gridTemplateRows: [20],
      transform: { translateX: 8 },
    }, [child])
    syncTree(root)

    const valid = frame(root, 100, 20)
    expect(valid.result.success).toBe(true)
    const previousRoot = rect(root)
    const previousChild = rect(child)
    const previousTransform = root._transform
    valid.layout.destroy()

    root.props = { ...root.props, gridTemplateColumns: [{ percent: 101 }] }
    syncAllLayoutProps(root)
    const invalid = frame(root, 100, 20)
    expect(invalid.result.success).toBe(false)

    expect(rect(root)).toEqual(previousRoot)
    expect(rect(child)).toEqual(previousChild)
    expect(root._transform).toBe(previousTransform)
    expect(root._flexNode?.getGridResult()?.error).toMatchObject({
      code: "GRID_INVALID_VALUE",
      path: "columns[0]",
      nodeId: expect.any(Number),
    })
    invalid.layout.destroy()
  })
})
