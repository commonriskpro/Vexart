import { describe, expect, test } from "bun:test"
import { createNode, createTextNode, insertChild, parseSizing, type TGENode, type TGEProps } from "../ffi/node"
import { syncAllLayoutProps } from "../ffi/flex-sync"
import { createVexartLayoutCtx } from "./layout-adapter"
import { walkTree } from "./walk-tree"

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

function walkFrame(root: TGENode, layout: ReturnType<typeof createVexartLayoutCtx>): void {
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
  layout.endLayout(root._flexNode)
}

describe("walk-tree Grid integration", () => {
  test("walks one real nested Grid/Flex/text tree without rebuilding it", () => {
    const text = createTextNode("Grid text")
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
    walkFrame(root, layout)

    const map = layout.getLastLayoutMap()!
    expect(calculates).toBe(1)
    expect(map.get(root.id)).toMatchObject({ x: 0, y: 0, width: 300, height: 100 })
    expect(map.get(flex.id)).toMatchObject({ x: 0, y: 0, width: 300, height: 100 })
    expect(map.get(innerGrid.id)).toMatchObject({ x: 0, y: 0, width: 150, height: 60 })
    expect(map.get(text.id)).toMatchObject({ x: 0, y: 0, width: 150 })
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
    walkFrame(root, layout)
    expect(calculates).toBe(1)
    expect(layout.getLastLayoutMap()!.get(root.id)?.width).toBe(240)

    calculates = 0
    layout.setDimensions(320, 40)
    walkFrame(root, layout)
    expect(calculates).toBe(1)
    expect(layout.getLastLayoutMap()!.get(root.id)?.width).toBe(320)
    layout.destroy()
  })
})
