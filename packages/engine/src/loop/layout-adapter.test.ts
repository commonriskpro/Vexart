import { describe, expect, test } from "bun:test"
import { createNode, createTextNode, insertChild, parseSizing, type TGENode, type TGEProps } from "../ffi/node"
import { CMD, type RenderCommand } from "../ffi/render-graph"
import { syncAllLayoutProps, syncLayoutProp } from "../ffi/flex-sync"
import { ATTACH_POINT, createVexartLayoutCtx } from "./layout-adapter"
import { walkTree } from "./walk-tree"

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
    const state = layoutState(root)
    const rowLayout = state.map?.get(row.id)
    const fixedLayout = state.map?.get(fixed.id)
    const growLayout = state.map?.get(grow.id)
    const percentLayout = state.map?.get(percent.id)

    expect(rowLayout).toMatchObject({ width: 300, height: 48 })
    expect(fixedLayout?.width).toBe(64)
    expect(percentLayout?.width).toBe(75)
    expect(growLayout?.width).toBe(145)
  })

  test("does not let width grow consume a column parent's height", () => {
    const scroll = box({ width: "grow", height: 220, scrollY: true }, [
      box({ width: "100%", height: 28 }),
      box({ width: "100%", height: 28 }),
    ])
    const root = box({ width: 420, height: 320, direction: "column" }, [scroll])

    syncTree(root)
    const state = layoutState(root)

    expect(state.map?.get(scroll.id)).toMatchObject({ width: 420, height: 220 })
    expect(state.map?.get(scroll.children[0]!.id)?.width).toBe(420)
  })

  test("stretches height grow across a row without changing its fixed width", () => {
    const column = box({ width: 100, height: "grow", direction: "column" }, [
      box({ width: 100, height: 20 }),
    ])
    const root = box({ width: 300, height: 100, direction: "row" }, [column])

    syncTree(root)
    const state = layoutState(root)

    expect(state.map?.get(column.id)).toMatchObject({ width: 100, height: 100 })
  })

  test("shrink-wraps explicit fit wrappers before cross-axis alignment", () => {
    for (const [alignX, x] of [["center", 110], ["right", 220]] as const) {
      const trigger = box({ width: 80, height: 20 })
      const inner = box({ width: "fit", height: "fit" }, [trigger])
      const wrapper = box({ width: "fit", height: "fit" }, [inner])
      const root = box({ width: 300, height: 100, direction: "column", alignX }, [wrapper])

      syncTree(root)
      const state = layoutState(root)

      expect(state.map?.get(wrapper.id)).toMatchObject({ x, width: 80, height: 20 })
      expect(state.map?.get(inner.id)).toMatchObject({ x, width: 80, height: 20 })
    }
  })

  test("clears stale main-axis grow when a parent direction changes", () => {
    const grow = box({ width: "grow", height: 20 })
    const fixed = box({ width: 50, height: 30 })
    const root = box({ width: 300, height: 100, direction: "row" }, [grow, fixed])

    syncTree(root)
    expect(layoutState(root).map?.get(grow.id)).toMatchObject({ width: 250, height: 20 })

    root.props.direction = "column"
    syncLayoutProp(root, "direction", "column")
    const state = layoutState(root)

    expect(state.map?.get(grow.id)).toMatchObject({ width: 300, height: 20 })
    expect(state.map?.get(fixed.id)).toMatchObject({ x: 0, y: 20, width: 50, height: 30 })
  })

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
    const commands = layoutCommands(root)
    const borderIndex = commands.findIndex((command) => command.type === CMD.BORDER && command.nodeId === root.id)

    expect(borderIndex).toBeGreaterThan(-1)
    expect(commands[borderIndex]).toMatchObject({
      type: CMD.BORDER,
      color: 0xff0000ff,
      cornerRadius: 8,
      extra1: 3,
      nodeId: root.id,
    })
    expect(commands.findIndex((command) => command.type === CMD.RECTANGLE && command.nodeId === child.id)).toBeLessThan(borderIndex)
  })

  test("emits existing per-side widths without collapsing them to the maximum", () => {
    const root = box({
      width: 100,
      height: 60,
      backgroundColor: 0x111111ff,
      borderColor: 0xff0000ff,
      borderLeft: 1,
      borderRight: 3,
      borderTop: 2,
      borderBottom: 4,
    })

    syncTree(root)
    const border = layoutCommands(root).find((command) => command.type === CMD.BORDER && command.nodeId === root.id)

    expect(border).toMatchObject({
      type: CMD.BORDER,
      color: 0xff0000ff,
      extra1: 4,
      borderWidths: { left: 1, right: 3, top: 2, bottom: 4 },
    })
  })

  test("keeps border reservation for adapter-owned fallback nodes", () => {
    const layout = createVexartLayoutCtx()
    layout.init(100, 80)
    layout.beginLayout()
    layout.openElement()
    layout.setCurrentNodeId(1)
    layout.configureBorder(4, 0xff0000ff)
    layout.closeElement()
    layout.endLayout()

    expect(layout.getLastLayoutMap()?.get(1)).toMatchObject({
      contentX: 4,
      contentY: 4,
      contentW: 92,
      contentH: 72,
    })
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

    const state = layoutState(root)
    const overlayLayout = state.map?.get(overlay.id)
    const wrapperLayout = state.map?.get(wrapper.id)
    const contentLayout = state.map?.get(content.id)

    expect(overlayLayout).toMatchObject({ x: 4, y: 6, width: 300, height: 200 })
    expect(wrapperLayout).toMatchObject({ x: 4, y: 6, width: 300, height: 200 })
    expect(contentLayout).toMatchObject({ x: 134, y: 96, width: 40, height: 20 })
  })

  test("applies parent and element attach points with offsets", () => {
    const anchor = box({ width: 50, height: 30, backgroundColor: 0xffffffff })
    const anchorId = createVexartLayoutCtx().hashString("anchor")
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

    const state = layoutState(root)
    const attachedLayout = state.map?.get(attached.id)

    expect(attachedLayout).toMatchObject({ x: 51, y: 27, width: 20, height: 10 })
  })

  test("measures floating fit wrappers from intrinsic children before attaching", () => {
    const text = createTextNode("Tooltip content")
    text.props = { fontSize: 14, fontFamily: layoutTestFontFamily }
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
    const state = layoutState(root)
    const floatingLayout = state.map?.get(floating.id)
    const textLayout = state.map?.get(text.id)

    expect(floatingLayout).toMatchObject({ x: 304, y: 205, height: 33 })
    expect(floatingLayout?.width).toBeGreaterThan(16)
    expect(textLayout).toMatchObject({ x: 312, y: 213, height: 17 })
    expect(textLayout?.width).toBeGreaterThan(0)
    expect(floatingLayout?.width).toBe((textLayout?.width ?? 0) + 16)
  })

  test("wraps text inside a narrow responsive column", () => {
    const text = createTextNode("A long Typography paragraph must wrap inside its responsive card instead of keeping its intrinsic width.")
    text.props = { fontSize: 14, fontFamily: layoutTestFontFamily }
    const content = box({}, [text])
    const card = box({ padding: 8 }, [content])
    const left = box({ width: "grow" }, [card])
    const rightText = createTextNode("Short")
    rightText.props = { fontSize: 14, fontFamily: layoutTestFontFamily }
    const right = box({ width: 100 }, [box({ padding: 8 }, [rightText])])
    const root = box({ width: 300, height: 200, direction: "row", gap: 16 }, [left, right])

    syncAllLayoutProps(root)
    const state = layoutState(root)
    const textLayout = state.map?.get(text.id)
    const textCommand = state.commands.find(command => command.nodeId === text.id && command.type === CMD.TEXT)

    expect(textLayout?.width).toBeLessThan(200)
    expect(textLayout?.height).toBeGreaterThan(Math.ceil(14 * 1.2))
    expect(textCommand?.width).toBe(textLayout?.width)
  })
})
