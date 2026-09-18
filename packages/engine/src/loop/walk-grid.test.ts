import { describe, expect, test } from "bun:test"
import { createNode, createTextNode, insertChild, parseSizing, type TGENode, type TGEProps } from "../ffi/node"
import { syncAllLayoutProps } from "../ffi/flex-sync"
import { createVexartLayoutCtx } from "./layout-adapter"
import { walkTree, type WalkTreeState } from "./walk-tree"
import { traverseFrame } from "./pipeline-traverse"

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

function walkFrame(root: TGENode, layout: ReturnType<typeof createVexartLayoutCtx>, width: number, height: number) {
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
  root._flexNode?.calculateLayout(width, height)

  state.rectNodes.length = 0
  state.textNodes.length = 0
  state.boxNodes.length = 0
  state.nodeRefById.clear()
  state.rectNodeById.clear()
  state.scrollContainers.length = 0
  state.layerBoundaries.length = 0

  return traverseFrame(root, state, width, height)
}

describe("walk-tree Grid integration", () => {
  test("walks one real nested Grid/Flex/text tree without rebuilding it", () => {
    const text = createNode("text")
    insertChild(text, createTextNode("Grid text"))
    const innerGrid = box({
      layout: "grid",
      width: 150,
      height: 60,
      gridTemplateColumns: [150],
      gridTemplateRows: [60],
    }, [text])
    const flex = box({ width: 300, height: 100, direction: "row" }, [innerGrid])
    const root = box({
      layout: "grid",
      width: 300,
      height: 100,
      gridTemplateColumns: [300],
      gridTemplateRows: [100],
    }, [flex])
    syncTree(root)

    const rootFlex = root._flexNode!
    let calculates = 0
    const calculate = rootFlex.calculateLayout.bind(rootFlex)
    rootFlex.calculateLayout = (...args) => {
      calculates++
      return calculate(...args)
    }
    const layout = createVexartLayoutCtx()
    layout.init(300, 100)
    const result = walkFrame(root, layout, 300, 100)

    expect(result.success).toBe(true)
    expect(calculates).toBe(1)
    expect(root.layout).toMatchObject({ x: 0, y: 0, width: 300, height: 100 })
    expect(flex.layout).toMatchObject({ x: 0, y: 0, width: 300, height: 100 })
    expect(innerGrid.layout).toMatchObject({ x: 0, y: 0, width: 150, height: 60 })
    expect(text.layout).toMatchObject({ x: 0, y: 0, width: 150 })
    layout.destroy()
  })

  test("does one root calculate per frame and recalculates the same tree after viewport resize", () => {
    const root = box({
      layout: "grid",
      width: "100%",
      height: 40,
      gridTemplateColumns: [{ fr: 1 }],
      gridTemplateRows: [40],
    }, [box({ width: 40, height: 20 })])
    syncTree(root)
    const rootFlex = root._flexNode!
    let calculates = 0
    const calculate = rootFlex.calculateLayout.bind(rootFlex)
    rootFlex.calculateLayout = (...args) => {
      calculates++
      return calculate(...args)
    }
    const layout = createVexartLayoutCtx()
    layout.init(240, 40)
    const first = walkFrame(root, layout, 240, 40)
    expect(first.success).toBe(true)
    expect(calculates).toBe(1)
    expect(root.layout.width).toBe(240)

    calculates = 0
    layout.setDimensions(320, 40)
    const second = walkFrame(root, layout, 320, 40)
    expect(second.success).toBe(true)
    expect(calculates).toBe(1)
    expect(root.layout.width).toBe(320)
    layout.destroy()
  })
})
