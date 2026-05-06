import { describe, expect, test } from "bun:test"
import { createNode, insertChild, parseSizing, type TGENode, type TGEProps } from "../ffi/node"
import { CMD, type RenderCommand } from "../ffi/render-graph"
import { createVexartLayoutCtx } from "./layout-adapter"
import { walkTree } from "./walk-tree"

function box(props: TGEProps, children: TGENode[] = []) {
  const node = createNode("box")
  node.props = props
  node._widthSizing = parseSizing(props.width)
  node._heightSizing = parseSizing(props.height)
  for (const child of children) insertChild(node, child)
  return node
}

function layoutState(root: TGENode) {
  const layout = createVexartLayoutCtx()
  layout.init(300, 200)
  layout.beginLayout()

  walkTree(root, {
    scrollIdCounter: { value: 0 },
    textMeasureIndex: { value: 0 },
    scrollSpeedCap: { value: 0 },
    nodeCount: { value: 0 },
    rectNodes: [],
    textNodes: [],
    boxNodes: [],
    layerBoundaries: [],
    scrollContainers: [],
    nodePathById: new Map(),
    nodeRefById: new Map(),
    textMetaMap: new Map(),
    rectNodeById: new Map(),
    layout,
  })

  const commands = layout.endLayout()
  const map = layout.getLastLayoutMap()
  layout.destroy()
  return { commands, map }
}

function layoutCommands(root: TGENode) {
  return layoutState(root).commands
}

function rectOrder(commands: RenderCommand[]) {
  return commands
    .filter((command) => command.type === CMD.RECTANGLE)
    .map((command) => command.nodeId)
}

describe("layout adapter stacking contexts", () => {
  test("walkTree applies margin props", () => {
    const first = box({ width: 100, height: 50 })
    const second = box({ width: 100, height: 50, marginTop: 20 })
    const root = box({ width: 300, height: 200 }, [first, second])

    const state = layoutState(root)

    expect(state.map?.get(first.id)?.y).toBe(0)
    expect(state.map?.get(second.id)?.y).toBe(70)
  })

  test("keeps high-z descendants inside their parent context", () => {
    const escapingChild = box({
      width: 40,
      height: 40,
      backgroundColor: 0x00ff00ff,
      floating: "parent",
      floatOffset: { x: 0, y: 0 },
      zIndex: 999,
    })
    const lowerWindow = box({
      width: 100,
      height: 100,
      backgroundColor: 0xff0000ff,
      floating: "parent",
      floatOffset: { x: 0, y: 0 },
      zIndex: 10,
    }, [escapingChild])
    const upperChild = box({ width: 40, height: 40, backgroundColor: 0xffff00ff })
    const upperWindow = box({
      width: 100,
      height: 100,
      backgroundColor: 0x0000ffff,
      floating: "parent",
      floatOffset: { x: 10, y: 10 },
      zIndex: 20,
    }, [upperChild])
    const root = box({ width: 300, height: 200, backgroundColor: 0x111111ff }, [upperWindow, lowerWindow])

    const order = rectOrder(layoutCommands(root))

    expect(order.indexOf(lowerWindow.id)).toBeLessThan(order.indexOf(escapingChild.id))
    expect(order.indexOf(escapingChild.id)).toBeLessThan(order.indexOf(upperWindow.id))
    expect(order.indexOf(upperWindow.id)).toBeLessThan(order.indexOf(upperChild.id))
  })

  test("uses DOM order when sibling z-index values match", () => {
    const first = box({ width: 40, height: 40, backgroundColor: 0xff0000ff, floating: "parent" })
    const second = box({ width: 40, height: 40, backgroundColor: 0x00ff00ff, floating: "parent" })
    const root = box({ width: 300, height: 200, backgroundColor: 0x111111ff }, [first, second])

    const order = rectOrder(layoutCommands(root))

    expect(order.indexOf(first.id)).toBeLessThan(order.indexOf(second.id))
  })
})
