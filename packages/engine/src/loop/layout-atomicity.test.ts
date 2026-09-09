import { afterEach, describe, expect, test } from "bun:test"
import { createNode, insertChild, parseSizing, type TGENode, type TGEProps } from "../ffi/node"
import { syncAllLayoutProps } from "../ffi/flex-sync"
import { getRendererBackend, setRendererBackend, type RendererBackend } from "../ffi/renderer-backend"
import { createRenderLoop } from "./loop"
import { createVexartLayoutCtx } from "./layout-adapter"
import { walkTree, type WalkTreeState } from "./walk-tree"
import { markDirty } from "../reconciler/dirty"

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

function walkFrame(root: TGENode, layout: ReturnType<typeof createVexartLayoutCtx>) {
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
  const commands = layout.endLayout(root._flexNode)
  return { commands, map: layout.getLastLayoutMap(), state }
}

function mockTerminal(width: number, height: number) {
  return {
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
    size: { cols: Math.ceil(width / 8), rows: Math.ceil(height / 16), pixelWidth: width, pixelHeight: height, cellWidth: 8, cellHeight: 16 },
    write() {},
    rawWrite() {},
    writeBytes() {},
    beginSync() {},
    endSync() {},
    onResize() { return () => {} },
    onData() { return () => {} },
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle() {},
    writeClipboard() {},
    suspend() {},
    resume() {},
    destroy() {},
  }
}

const loops: Array<ReturnType<typeof createRenderLoop>> = []
const priorBackend = getRendererBackend()

afterEach(() => {
  for (const loop of loops.splice(0)) loop.destroy()
  setRendererBackend(priorBackend)
})

describe("Grid layout pipeline atomicity", () => {
  test("preserves the published map and commands when a nested Grid becomes invalid", () => {
    const child = box({
      layout: "grid",
      width: 100,
      height: 40,
      gridTemplateColumns: [100],
      gridTemplateRows: [40],
    })
    const root = box({ width: 200, height: 80 }, [child])
    syncTree(root)

    const layout = createVexartLayoutCtx()
    layout.init(200, 80)
    const valid = walkFrame(root, layout)
    const previousMap = valid.map
    const previousCommands = valid.commands
    expect(previousMap?.get(child.id)).toMatchObject({ width: 100, height: 40 })
    expect(layout.getLastLayoutError()).toBeNull()

    child.props = { ...child.props, gridTemplateColumns: [{ percent: 101 }] }
    syncTree(root)
    const invalid = walkFrame(root, layout)

    expect(layout.getLastLayoutError()).toMatchObject({
      code: "GRID_INVALID_VALUE",
      path: "columns[0]",
      nodeId: child._flexNode?.getGridNodeId(),
    })
    expect(invalid.map).toBe(previousMap)
    expect(invalid.commands).toBe(previousCommands)
    expect(invalid.map?.get(child.id)).toMatchObject({ width: 100, height: 40 })
    layout.destroy()
  })

  test("does not publish a map or commands for an initial Grid error", () => {
    const root = box({
      layout: "grid",
      width: 100,
      height: 20,
      gridTemplateColumns: [{ percent: 101 }],
      gridTemplateRows: [20],
    })
    syncTree(root)

    const layout = createVexartLayoutCtx()
    layout.init(100, 20)
    const result = walkFrame(root, layout)

    expect(result.commands).toEqual([])
    expect(layout.getLastLayoutMap()).toBeNull()
    expect(layout.getLastLayoutError()).toMatchObject({ code: "GRID_INVALID_VALUE", path: "columns[0]" })
    layout.destroy()
  })

  test("aborts composite before paint for nested and initial Grid errors", () => {
    let paintCalls = 0
    const backend: RendererBackend = {
      name: "grid-atomicity-test",
      paint() {
        paintCalls++
        return { output: "skip-present", strategy: "skip-present" }
      },
    }
    setRendererBackend(backend)

    const term = mockTerminal(200, 80)
    const loop = createRenderLoop(term, { experimental: { forceLayerRepaint: true } })
    loops.push(loop)
    const child = box({
      layout: "grid",
      width: 100,
      height: 40,
      gridTemplateColumns: [100],
      gridTemplateRows: [40],
      backgroundColor: 0x223344ff,
    })
    insertChild(loop.root, child)
    markDirty()
    loop.frame()
    expect(paintCalls).toBeGreaterThan(0)
    const previousRoot = { ...loop.root.layout }
    const previousChild = { ...child.layout }
    const beforeErrorPaints = paintCalls

    child.props = { ...child.props, gridTemplateColumns: [{ percent: 101 }] }
    syncAllLayoutProps(child)
    markDirty()
    loop.frame()
    expect(paintCalls).toBe(beforeErrorPaints)
    expect(loop.root.layout).toEqual(previousRoot)
    expect(child.layout).toEqual(previousChild)

    const initial = createRenderLoop(mockTerminal(100, 20), { experimental: { forceLayerRepaint: true } })
    loops.push(initial)
    const invalid = box({
      layout: "grid",
      width: 100,
      height: 20,
      gridTemplateColumns: [{ percent: 101 }],
      gridTemplateRows: [20],
      backgroundColor: 0x556677ff,
    })
    insertChild(initial.root, invalid)
    markDirty()
    const initialPaints = paintCalls
    initial.frame()
    expect(paintCalls).toBe(initialPaints)
    expect(invalid.layout).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})
