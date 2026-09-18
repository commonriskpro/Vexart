import { describe, expect, test } from "bun:test"
import { Node } from "flexily"
import { createNode, createTextNode, insertChild, parseSizing, type TGENode, type TGEProps } from "../ffi/node"
import { CMD, type BorderRenderOp, type RenderGraphOp } from "../ffi/render-graph"
import { syncAllLayoutProps, syncLayoutProp } from "../ffi/flex-sync"
import { ATTACH_POINT, createVexartLayoutCtx } from "./layout-adapter"
import { walkTree, type WalkTreeState } from "./walk-tree"
import { hashString, traverseFrame } from "./pipeline-traverse"

function box(props: TGEProps, children: TGENode[] = []) {
  const node = createNode("box")
  node.props = props
  node._widthSizing = parseSizing(props.width)
  node._heightSizing = parseSizing(props.height)
  for (const child of children) insertChild(node, child)
  return node
}

function syncTree(node: TGENode) {
  syncAllLayoutProps(node)
  node.children.forEach(syncTree)
}

function layoutState(root: TGENode) {
  const layout = createVexartLayoutCtx()
  layout.init(300, 200)
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
  root._flexNode?.calculateLayout(300, 200)

  state.rectNodes.length = 0
  state.textNodes.length = 0
  state.boxNodes.length = 0
  state.nodeRefById.clear()
  state.rectNodeById.clear()
  state.scrollContainers.length = 0
  state.layerBoundaries.length = 0

  const result = traverseFrame(root, state, 300, 200)
  layout.destroy()
  return { result, ops: result.layerBuckets.flatMap((b) => b.ops) }
}

function layoutOps(root: TGENode) {
  return layoutState(root).ops
}

function rectOrder(ops: RenderGraphOp[]) {
  return ops
    .filter((op) => op.kind === "rectangle" || op.type === CMD.RECTANGLE)
    .map((op) => op.nodeId)
}

// Ubuntu CI installs this real font explicitly. fontdb's generic sans-serif
// defaults to Arial on Linux, which is not present on the runner.
const layoutTestFontFamily = process.platform === "linux" ? "DejaVu Sans" : "sans-serif"

describe("layout adapter stacking contexts", () => {
  test("resolves grow on the requested axis and stretches cross-axis children", () => {
    const fixed = box({ width: 64, height: 48 })
    const grow = box({ width: "grow", height: 48 })
    const percent = box({ width: "25%", height: 48 })
    const row = box({ width: "grow", height: "fit", direction: "row", gap: 8 }, [fixed, grow, percent])
    const root = box({ width: 300, height: 200, direction: "column" }, [row])

    syncTree(root)
    layoutState(root)

    expect(row.layout).toMatchObject({ width: 300, height: 48 })
    expect(fixed.layout.width).toBe(64)
    expect(percent.layout.width).toBe(75)
    expect(grow.layout.width).toBe(145)
  })

  test("does not let width grow consume a column parent's height", () => {
    const scroll = box({ width: "grow", height: 220, scrollY: true }, [
      box({ width: "100%", height: 28 }),
      box({ width: "100%", height: 28 }),
    ])
    const root = box({ width: 420, height: 320, direction: "column" }, [scroll])

    syncTree(root)
    layoutState(root)

    expect(scroll.layout).toMatchObject({ width: 420, height: 220 })
    expect(scroll.children[0]!.layout.width).toBe(420)
  })

  test("stretches height grow across a row without changing its fixed width", () => {
    const column = box({ width: 100, height: "grow", direction: "column" }, [
      box({ width: 100, height: 20 }),
    ])
    const root = box({ width: 300, height: 100, direction: "row" }, [column])

    syncTree(root)
    layoutState(root)

    expect(column.layout).toMatchObject({ width: 100, height: 100 })
  })

  test("shrink-wraps explicit fit wrappers before cross-axis alignment", () => {
    for (const [alignX, x] of [["center", 110], ["right", 220]] as const) {
      const trigger = box({ width: 80, height: 20 })
      const inner = box({ width: "fit", height: "fit" }, [trigger])
      const wrapper = box({ width: "fit", height: "fit" }, [inner])
      const root = box({ width: 300, height: 100, direction: "column", alignX }, [wrapper])

      syncTree(root)
      layoutState(root)

      expect(wrapper.layout).toMatchObject({ x, width: 80, height: 20 })
      expect(inner.layout).toMatchObject({ x, width: 80, height: 20 })
    }
  })

  test("clears stale main-axis grow when a parent direction changes", () => {
    const grow = box({ width: "grow", height: 20 })
    const fixed = box({ width: 50, height: 30 })
    const root = box({ width: 300, height: 100, direction: "row" }, [grow, fixed])

    syncTree(root)
    layoutState(root)
    expect(grow.layout).toMatchObject({ width: 250, height: 20 })

    root.props.direction = "column"
    syncLayoutProp(root, "direction", "column")
    layoutState(root)

    expect(grow.layout).toMatchObject({ width: 300, height: 20 })
    expect(fixed.layout).toMatchObject({ x: 0, y: 20, width: 50, height: 30 })
  })

  test("walkTree applies margin props", () => {
    const first = box({ width: 100, height: 50 })
    const second = box({ width: 100, height: 50, marginTop: 20 })
    const root = box({ width: 300, height: 200, direction: "column" }, [first, second])

    layoutState(root)

    expect(first.layout.y).toBe(0)
    expect(second.layout.y).toBe(70)
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

    const order = rectOrder(layoutOps(root))

    expect(order.indexOf(lowerWindow.id)).toBeLessThan(order.indexOf(escapingChild.id))
    expect(order.indexOf(escapingChild.id)).toBeLessThan(order.indexOf(upperWindow.id))
    expect(order.indexOf(upperWindow.id)).toBeLessThan(order.indexOf(upperChild.id))
  })

  test("uses DOM order when sibling z-index values match", () => {
    const first = box({ width: 40, height: 40, backgroundColor: 0xff0000ff, floating: "parent" })
    const second = box({ width: 40, height: 40, backgroundColor: 0x00ff00ff, floating: "parent" })
    const root = box({ width: 300, height: 200, backgroundColor: 0x111111ff }, [first, second])

    const order = rectOrder(layoutOps(root))

    expect(order.indexOf(first.id)).toBeLessThan(order.indexOf(second.id))
  })

  test("emits a uniform border after descendants with its resolved color", () => {
    const child = box({ width: 40, height: 20, backgroundColor: 0x00ff00ff })
    const root = box({
      width: 100,
      height: 60,
      backgroundColor: 0x111111ff,
      borderColor: 0xff0000ff,
      borderWidth: 3,
      cornerRadius: 8,
    }, [child])

    syncTree(root)
    const ops = layoutOps(root)
    const borderIndex = ops.findIndex((op) => (op.kind === "border" || op.type === CMD.BORDER) && op.nodeId === root.id)

    expect(borderIndex).toBeGreaterThan(-1)
    expect(ops[borderIndex]).toMatchObject({
      color: 0xff0000ff,
      cornerRadius: 8,
      extra1: 3,
      nodeId: root.id,
    })
    expect(ops.findIndex((op) => (op.kind === "rectangle" || op.type === CMD.RECTANGLE) && op.nodeId === child.id)).toBeLessThan(borderIndex)
  })

  test("emits existing per-side widths without collapsing them to the maximum", () => {
    const target = box({
      width: 100,
      height: 60,
      backgroundColor: 0x111111ff,
      borderColor: 0xff0000ff,
      borderLeft: 1,
      borderRight: 3,
      borderTop: 2,
      borderBottom: 4,
    })
    const root = box({ width: 300, height: 200 }, [target])

    syncTree(root)
    const border = layoutOps(root).find((op) => (op.kind === "border" || op.type === CMD.BORDER) && op.nodeId === target.id) as BorderRenderOp

    expect(border).toMatchObject({
      color: 0xff0000ff,
      extra1: 4,
      borderWidths: { left: 1, right: 3, top: 2, bottom: 4 },
    })
  })

  test("emits a transparent border command when maxInteractiveBorder > 0 and paintBorderWidth is 0", () => {
    const target = box({
      width: 100,
      height: 60,
      backgroundColor: 0x111111ff,
      hoverStyle: { borderWidth: 4 },
    })
    const root = box({ width: 300, height: 200 }, [target])

    syncTree(root)
    const border = layoutOps(root).find((op) => (op.kind === "border" || op.type === CMD.BORDER) && op.nodeId === target.id) as BorderRenderOp

    expect(border).toMatchObject({
      color: 0x00000000,
      extra1: 4,
      nodeId: target.id,
    })
  })

  test("cleans orphaned node slots from the previous layout pass on beginLayout", () => {
    const layout = createVexartLayoutCtx()
    layout.init(100, 80)

    let orphanedNodeRef: WeakRef<Node> | undefined

    ;(() => {
      const rootNode = Node.create()
      const childNode = Node.create()

      orphanedNodeRef = new WeakRef(rootNode)

      layout.beginLayout()
      layout.setCurrentFlexNode(rootNode)
      layout.openElement()

      layout.setCurrentFlexNode(childNode)
      layout.openElement()
      layout.closeElement()

      layout.closeElement()
    })()

    Bun.gc(true)
    expect(orphanedNodeRef!.deref()).toBeDefined()

    layout.beginLayout()
    Bun.gc(true)

    expect(orphanedNodeRef!.deref()).toBeUndefined()

    layout.destroy()
  })

  test("anchors root floating subtrees to the viewport, not their logical parent", () => {
    const content = box({ width: 40, height: 20, backgroundColor: 0xffffffff })
    const wrapper = box({
      width: "100%",
      height: "100%",
      alignX: "center",
      alignY: "center",
    }, [content])
    const overlay = box({
      width: "100%",
      height: "100%",
      floating: "root",
      floatOffset: { x: 4, y: 6 },
      backgroundColor: 0x00000080,
    }, [wrapper])
    const logicalParent = box({ width: 120, height: 80 }, [overlay])
    const root = box({ width: 300, height: 200 }, [logicalParent])

    layoutState(root)

    expect(overlay.layout).toMatchObject({ x: 4, y: 6, width: 300, height: 200 })
    expect(wrapper.layout).toMatchObject({ x: 4, y: 6, width: 300, height: 200 })
    expect(content.layout).toMatchObject({ x: 134, y: 96, width: 40, height: 20 })
  })

  test("applies parent and element attach points with offsets", () => {
    const anchor = box({ width: 50, height: 30, backgroundColor: 0xffffffff })
    const anchorId = hashString("anchor")
    anchor.id = anchorId
    const attached = box({
      width: 20,
      height: 10,
      floating: { attachTo: "anchor" },
      floatAttach: {
        element: ATTACH_POINT.LEFT_CENTER,
        parent: ATTACH_POINT.RIGHT_BOTTOM,
      },
      floatOffset: { x: 1, y: 2 },
      backgroundColor: 0xffffffff,
    })
    const root = box({ width: 300, height: 200 }, [anchor, attached])

    layoutState(root)

    expect(attached.layout).toMatchObject({ x: 51, y: 27, width: 20, height: 10 })
  })

  test("measures floating fit wrappers from intrinsic children before attaching", () => {
    const text = createNode("text")
    text.props = { fontSize: 14, fontFamily: layoutTestFontFamily }
    insertChild(text, createTextNode("Tooltip content"))
    const floating = box({
      width: "fit",
      height: "fit",
      padding: 8,
      floating: "parent",
      floatAttach: {
        element: ATTACH_POINT.LEFT_TOP,
        parent: ATTACH_POINT.RIGHT_BOTTOM,
      },
      floatOffset: { x: 4, y: 5 },
    }, [text])
    const root = box({ width: 300, height: 200 }, [box({ width: 100, height: 30 }), floating])

    syncTree(root)
    layoutState(root)

    expect(floating.layout).toMatchObject({ x: 304, y: 205, height: 33 })
    expect(floating.layout.width).toBeGreaterThan(16)
    expect(text.layout).toMatchObject({ x: 312, y: 213, height: 17 })
    expect(text.layout.width).toBeGreaterThan(0)
    expect(floating.layout.width).toBe(text.layout.width + 16)
  })

  test("wraps text inside a narrow responsive column", () => {
    const text = createNode("text")
    text.props = { fontSize: 14, fontFamily: layoutTestFontFamily }
    insertChild(text, createTextNode("A long Typography paragraph must wrap inside its responsive card instead of keeping its intrinsic width."))
    const content = box({}, [text])
    const card = box({ padding: 8 }, [content])
    const left = box({ width: "grow" }, [card])
    const rightText = createNode("text")
    rightText.props = { fontSize: 14, fontFamily: layoutTestFontFamily }
    insertChild(rightText, createTextNode("Short"))
    const right = box({ width: 100 }, [box({ padding: 8 }, [rightText])])
    const root = box({ width: 300, height: 200, direction: "row", gap: 16 }, [left, right])

    syncAllLayoutProps(root)
    const state = layoutState(root)
    const textOp = state.ops.find(op => op.nodeId === text.id && (op.kind === "text" || op.type === CMD.TEXT))

    expect(text.layout.width).toBeLessThan(200)
    expect(text.layout.height).toBeGreaterThan(Math.ceil(14 * 1.2))
    expect(textOp?.width).toBe(text.layout.width)
  })
})
