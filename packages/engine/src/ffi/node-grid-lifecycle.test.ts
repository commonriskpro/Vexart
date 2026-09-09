import { afterEach, describe, expect, test } from "bun:test"
import { createNode, createTextNode, insertChild, parseSizing, removeChild } from "./node"
import { createTextFlexNode, syncAllLayoutProps } from "./flex-sync"
import { createRenderLoop } from "../loop/loop"
import { markDirty } from "../reconciler/dirty"
import type { TGEProps } from "./node"
import type { Terminal } from "../terminal/index"
import type { TerminalSize } from "../terminal/size"

function box(props: TGEProps = {}) {
  const node = createNode("box")
  node.props = props
  node._widthSizing = parseSizing(node.props.width)
  node._heightSizing = parseSizing(node.props.height)
  syncAllLayoutProps(node)
  return node
}

function size(width: number, height: number): TerminalSize {
  return {
    cols: Math.ceil(width / 8),
    rows: Math.ceil(height / 16),
    pixelWidth: width,
    pixelHeight: height,
    cellWidth: 8,
    cellHeight: 16,
  }
}

function terminal(width: number, height: number) {
  const handlers: Array<(next: TerminalSize) => void> = []
  const term = {
    kind: "kitty" as const,
    caps: {
      kind: "kitty" as const,
      kittyGraphics: true,
      kittyPlaceholder: false,
      kittyKeyboard: false,
      sixel: false,
      truecolor: true,
      mouse: false,
      focus: false,
      bracketedPaste: false,
      syncOutput: false,
      tmux: false,
      parentKind: null,
      transmissionMode: "direct" as const,
    },
    size: size(width, height),
    write() {},
    rawWrite() {},
    writeBytes() {},
    beginSync() {},
    endSync() {},
    onResize(cb: (next: TerminalSize) => void) {
      handlers.push(cb)
      return () => {
        const index = handlers.indexOf(cb)
        if (index >= 0) handlers.splice(index, 1)
      }
    },
    onData() { return () => {} },
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle() {},
    writeClipboard() {},
    suspend() {},
    resume() {},
    destroy() {},
  } satisfies Terminal
  return {
    term,
    resize(nextWidth: number, nextHeight: number) {
      const next = size(nextWidth, nextHeight)
      for (const handler of handlers) handler(next)
    },
  }
}

const loops: Array<ReturnType<typeof createRenderLoop>> = []
afterEach(() => {
  for (const loop of loops.splice(0)) loop.destroy()
})

describe("Grid node lifecycle", () => {
  test("keeps sibling indices stable and rejects cycles before mutating either tree", () => {
    const parent = box()
    const first = box()
    const second = box()
    const third = box()
    insertChild(parent, first)
    insertChild(parent, second)
    insertChild(parent, third)

    insertChild(parent, third, first)
    expect(parent.children).toEqual([third, first, second])
    expect(parent.children.map((child) => child._siblingIndex)).toEqual([0, 1, 2])

    expect(() => insertChild(first, parent)).toThrow("cycle")
    expect(parent.parent).toBeNull()
    expect(first.children).toEqual([])
    expect(parent.children).toEqual([third, first, second])
  })

  test("reparents Grid under Flex and Flex under Grid without stale native parents", () => {
    const flex = box({ layout: "flex", width: 240, height: 120 })
    const grid = box({
      layout: "grid",
      width: 200,
      height: 100,
      gridTemplateColumns: [100, 100],
      gridTemplateRows: [100],
    })
    const item = box({
      width: 50,
      height: 20,
      gridColumn: { start: 2, end: 3 },
      gridRow: { start: 1, end: 2 },
    })

    insertChild(flex, item)
    insertChild(flex, grid)
    expect(grid.parent).toBe(flex)
    expect(grid._flexNode?.getParent()).toBe(flex._flexNode)

    insertChild(grid, item)
    expect(flex.children).toEqual([grid])
    expect(item.parent).toBe(grid)
    expect(item._flexNode?.getParent()).toBe(grid._flexNode)
    expect(item._flexNode?.getGridItemStyle()).toEqual({
      column: { start: 2, end: 3 },
      row: { start: 1, end: 2 },
    })
  })

  test("removes and recreates a retained Grid subtree without orphaned nodes", () => {
    const parent = box({
      layout: "grid",
      width: 200,
      height: 100,
      gridTemplateColumns: [200],
      gridTemplateRows: [100],
    })
    const grid = box({
      layout: "grid",
      width: 200,
      height: 100,
      gridTemplateColumns: [200],
      gridTemplateRows: [100],
      gridColumn: { start: 1, end: 2 },
    })
    const text = createTextNode("retained")
    insertChild(grid, text)
    createTextFlexNode(text)
    insertChild(parent, grid)
    const gridFlex = grid._flexNode!
    const textFlex = text._flexNode!

    removeChild(parent, grid)
    expect(parent._flexNode?.getChildCount()).toBe(0)
    expect(grid.parent).toBeNull()
    expect(grid.destroyed).toBe(true)
    expect(text.parent).toBe(grid)
    expect(text.destroyed).toBe(true)
    expect(grid._flexNode).toBeNull()
    expect(text._flexNode).toBeNull()
    expect(gridFlex.getParent()).toBeNull()
    expect(textFlex.getParent()).toBeNull()

    insertChild(parent, grid)
    expect(grid.destroyed).toBe(false)
    expect(text.destroyed).toBe(false)
    expect(grid._flexNode).not.toBe(gridFlex)
    expect(text._flexNode).not.toBe(textFlex)
    expect(grid._flexNode?.getParent()).toBe(parent._flexNode)
    expect(text._flexNode?.getParent()).toBe(grid._flexNode)
    expect(grid._flexNode?.getGridItemStyle()).toEqual({ column: { start: 1, end: 2 } })

    const wrongParent = box()
    removeChild(wrongParent, grid)
    expect(grid.parent).toBe(parent)
    expect(grid.destroyed).toBe(false)
    expect(grid._flexNode).not.toBeNull()
  })

  test("resizes a nested Grid with one complete root calculate and local child rects", () => {
    const fixture = terminal(240, 120)
    const loop = createRenderLoop(fixture.term, { experimental: { forceLayerRepaint: true } })
    loops.push(loop)
    const grid = box({
      layout: "grid",
      width: "100%",
      height: "100%",
      gridTemplateColumns: [{ fr: 1 }, { fr: 1 }],
      gridTemplateRows: [60, 60],
    })
    const item = box({
      gridColumn: { start: 2, end: 3 },
      gridRow: { start: 2, end: 3 },
    })
    insertChild(grid, item)
    insertChild(loop.root, grid)

    const rootFlex = loop.root._flexNode!
    const originalCalculate = rootFlex.calculateLayout
    let calculates = 0
    rootFlex.calculateLayout = (...args: Parameters<typeof rootFlex.calculateLayout>) => {
      calculates++
      return originalCalculate.apply(rootFlex, args)
    }

    markDirty()
    loop.frame()
    expect(calculates).toBe(1)
    expect(item._flexNode?.getComputedLeft()).toBeGreaterThan(0)
    expect(item._flexNode?.getComputedTop()).toBeGreaterThan(0)

    calculates = 0
    fixture.resize(320, 160)
    expect(calculates).toBe(1)
    expect(loop.root.props.width).toBe(320)
    expect(loop.root.props.height).toBe(160)
    expect(item._flexNode?.getComputedLeft()).toBeGreaterThan(0)
    expect(item._flexNode?.getComputedTop()).toBeGreaterThan(0)
  })
})
