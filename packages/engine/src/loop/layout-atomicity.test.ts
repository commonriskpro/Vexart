import { afterEach, describe, expect, test } from "bun:test"
import { createNode, insertChild, parseSizing, type TGENode, type TGEProps } from "../ffi/node"
import { syncAllLayoutProps } from "../ffi/flex-sync"
import { getRendererBackend, setRendererBackend, type RendererBackend } from "../ffi/renderer-backend"
import { createRenderLoop } from "./loop"
import { createVexartLayoutCtx } from "./layout-adapter"
import { walkTree, type WalkTreeState } from "./walk-tree"
import { traverseFrame } from "./pipeline-traverse"
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

function walkFrame(root: TGENode, layout: ReturnType<typeof createVexartLayoutCtx>, width = 200, height = 80) {
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
  const calcError = layout.calculateRoots(root._flexNode)
  if (calcError) {
    return {
      state,
      result: { success: false, layerBuckets: [], hasAnyTransforms: false, error: calcError },
    }
  }

  state.rectNodes.length = 0
  state.textNodes.length = 0
  state.boxNodes.length = 0
  state.nodeRefById.clear()
  state.rectNodeById.clear()
  state.scrollContainers.length = 0
  state.layerBoundaries.length = 0

  const result = traverseFrame(root, state, width, height)
  return { state, result }
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
      mousePixel: false,
      mousePixelOrigin: 1 as const,
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
  test("preserves node.layout when a nested Grid becomes invalid", () => {
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
    const valid = walkFrame(root, layout, 200, 80)
    expect(valid.result.success).toBe(true)
    expect(child.layout).toMatchObject({ width: 100, height: 40 })
    expect(layout.getLastLayoutError()).toBeNull()

    const previousRootLayout = { ...root.layout }
    const previousChildLayout = { ...child.layout }

    child.props = { ...child.props, gridTemplateColumns: [{ percent: 101 }] }
    syncTree(root)
    const invalid = walkFrame(root, layout, 200, 80)

    expect(layout.getLastLayoutError()).toMatchObject({
      code: "GRID_INVALID_VALUE",
      path: "columns[0]",
      nodeId: child._flexNode?.getGridNodeId(),
    })
    expect(invalid.result.success).toBe(false)
    expect(root.layout).toEqual(previousRootLayout)
    expect(child.layout).toEqual(previousChildLayout)
    layout.destroy()
  })

  test("does not update node.layout for an initial Grid error", () => {
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
    const result = walkFrame(root, layout, 100, 20)

    expect(result.result.success).toBe(false)
    expect(root.layout).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(layout.getLastLayoutError()).toMatchObject({ code: "GRID_INVALID_VALUE", path: "columns[0]" })
    layout.destroy()
  })

  test("atomically restores node.layout when calculation or traversal throws", () => {
    const child = box({ width: 60, height: 30 })
    const root = box({ width: 200, height: 80 }, [child])
    syncTree(root)

    const layout = createVexartLayoutCtx()
    layout.init(200, 80)
    const valid = walkFrame(root, layout, 200, 80)
    expect(valid.result.success).toBe(true)
    expect(child.layout).toMatchObject({ width: 60, height: 30 })
    const previousRoot = { ...root.layout }
    const previousChild = { ...child.layout }

    const flex = child._flexNode!
    const originalLeft = flex.getComputedLeft.bind(flex)
    flex.getComputedLeft = () => {
      throw new Error("Injected layout solver failure")
    }

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
    const result = traverseFrame(root, state, 200, 80)
    expect(result.success).toBe(false)
    expect(root.layout).toEqual(previousRoot)
    expect(child.layout).toEqual(previousChild)

    flex.getComputedLeft = originalLeft
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
