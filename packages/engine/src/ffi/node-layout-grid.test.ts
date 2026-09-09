import { describe, expect, test } from "bun:test"
import { createNode, createTextNode, insertChild, parseSizing } from "./node"
import { syncAllLayoutProps } from "./flex-sync"
import { writeLayoutBack } from "../loop/layout"
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
  layout.endLayout(root._flexNode)
  return { layout, map: layout.getLastLayoutMap()!, state }
}

function rect(node: TGENode) {
  return { x: node.layout.x, y: node.layout.y, width: node.layout.width, height: node.layout.height }
}

describe("Node/layout Grid integration", () => {
  test("writes the single layout map to box and text nodes and damages only transitions", () => {
    const childBox = box({ width: 200, height: 40 })
    const text = createTextNode("grid text")
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
    const pending: Array<{ nodeId: number; rect: { x: number; y: number; width: number; height: number } }> = []
    expect(writeLayoutBack(first.map, {
      rectNodes: first.state.rectNodes,
      textNodes: first.state.textNodes,
      boxNodes: first.state.boxNodes,
      pendingNodeDamageRects: pending,
    })).toBe(true)
    expect(rect(root)).toEqual({ x: first.map.get(root.id)!.x, y: first.map.get(root.id)!.y, width: first.map.get(root.id)!.width, height: first.map.get(root.id)!.height })
    expect(rect(childBox)).toEqual({ x: first.map.get(childBox.id)!.x, y: first.map.get(childBox.id)!.y, width: first.map.get(childBox.id)!.width, height: first.map.get(childBox.id)!.height })
    expect(rect(text)).toEqual({ x: first.map.get(text.id)!.x, y: first.map.get(text.id)!.y, width: first.map.get(text.id)!.width, height: first.map.get(text.id)!.height })
    expect(pending.map((entry) => entry.nodeId)).toEqual([root.id, childBox.id, text.id])
    expect(root._transform).not.toBeNull()

    first.layout.destroy()

    const second = frame(root)
    const noChange: Array<{ nodeId: number; rect: { x: number; y: number; width: number; height: number } }> = []
    expect(writeLayoutBack(second.map, {
      rectNodes: second.state.rectNodes,
      textNodes: second.state.textNodes,
      boxNodes: second.state.boxNodes,
      pendingNodeDamageRects: noChange,
    })).toBe(true)
    expect(noChange).toEqual([])
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
    const initialPending: Array<{ nodeId: number; rect: { x: number; y: number; width: number; height: number } }> = []
    expect(writeLayoutBack(valid.map, {
      rectNodes: valid.state.rectNodes,
      textNodes: valid.state.textNodes,
      boxNodes: valid.state.boxNodes,
      pendingNodeDamageRects: initialPending,
    })).toBe(true)
    const previousRoot = rect(root)
    const previousChild = rect(child)
    const previousTransform = root._transform
    valid.layout.destroy()

    root.props = { ...root.props, gridTemplateColumns: [{ percent: 101 }] }
    syncAllLayoutProps(root)
    const invalid = frame(root, 100, 20)
    const pending: Array<{ nodeId: number; rect: { x: number; y: number; width: number; height: number } }> = []
    expect(writeLayoutBack(invalid.map, {
      rectNodes: invalid.state.rectNodes,
      textNodes: invalid.state.textNodes,
      boxNodes: invalid.state.boxNodes,
      pendingNodeDamageRects: pending,
    })).toBe(false)

    expect(rect(root)).toEqual(previousRoot)
    expect(rect(child)).toEqual(previousChild)
    expect(root._transform).toBe(previousTransform)
    expect(pending).toEqual([])
    expect(root._flexNode?.getGridResult()?.error).toMatchObject({
      code: "GRID_INVALID_VALUE",
      path: "columns[0]",
      nodeId: expect.any(Number),
    })
    invalid.layout.destroy()
  })
})
