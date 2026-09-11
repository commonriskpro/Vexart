import { afterEach, describe, expect, test } from "bun:test"
import { registerAnimationDescriptor, markLayerBacked, deregisterAllDescriptors, allDescriptors, resetFrameTracking, unmarkLayerBacked } from "../animation/compositor-path"
import { createLayerStore, type Layer } from "../ffi/layers"
import { createNode, insertChild, parseSizing, type TGENode } from "../ffi/node"
import { syncAllLayoutProps, syncLayoutProp } from "../ffi/flex-sync"
import { createVexartLayoutCtx } from "./layout-adapter"
import {
  bindLayerDirtyStore,
  compositeFrame,
  markLayerDirtyByKey,
  unbindLayerDirtyStore,
  type CompositeFrameState,
} from "./composite"

function cleanupCompositorState() {
  resetFrameTracking()
  for (const descriptor of allDescriptors()) {
    deregisterAllDescriptors(descriptor.nodeId)
    unmarkLayerBacked(descriptor.nodeId)
  }
}

afterEach(() => {
  cleanupCompositorState()
})

describe("compositeFrame compositor fast path", () => {
  test("uses retained compositor composition without painting layers", () => {
    const root = createNode("root")
    const node = createNode("box")
    node.parent = root
    node.props.layer = true
    node.props.opacity = 0.5
    node.props.transform = { rotate: 12 }
    node.layout = { x: 10, y: 20, width: 100, height: 40 }
    root.children.push(node)

    markLayerBacked(node.id)
    registerAnimationDescriptor({
      nodeId: node.id,
      property: "opacity",
      from: 1,
      to: 0.5,
      startTime: performance.now(),
      physics: { kind: "transition", easing: (t) => t, duration: 300 },
    })

    const layerStore = createLayerStore()
    const layer = layerStore.createLayer(1)
    layer.x = 10
    layer.y = 20
    layer.width = 100
    layer.height = 40
    const layerCache = new Map<string, typeof layer>([[`layer:${node.id}`, layer]])

    let composed = 0
    let painted = 0
    let cleared = 0
    const state: CompositeFrameState = {
      root,
      viewportWidth: 200,
      viewportHeight: 120,
      term: {
        kind: "kitty",
        caps: {
          kind: "kitty",
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
          transmissionMode: "direct",
        },
        size: { cols: 25, rows: 10, pixelWidth: 200, pixelHeight: 120, cellWidth: 8, cellHeight: 12 },
        write() {}, rawWrite() {}, writeBytes() {}, beginSync() {}, endSync() {}, onResize() { return () => {} }, onData() { return () => {} },
        bgColor: null, fgColor: null, isDark: true, setTitle() {}, writeClipboard() {}, suspend() {}, resume() {}, destroy() {},
      },
      layoutAdapter: {} as never,
      scroll: { x: 0, y: 0 },
      pointer: { x: 0, y: 0, down: false, dirty: false, pendingPress: false, pendingRelease: false, capturedNodeId: 0, pressOriginSet: false, prevActiveNode: null },
      postScrollCallbacks: [],
      walkCounters: { scrollSpeedCap: 0 },
      rectNodes: [],
      textNodes: [],
      boxNodes: [],
      rectNodeById: new Map(),
      nodeRefById: new Map([[node.id, node]]),
      layerBoundaries: [],
      scrollContainers: [],
      nodeCountValue: { value: 2 },
      layerCache,
      activeSlotKeys: new Set(),
      frameDirtyRects: [],
      pendingNodeDamageRects: [],
      scrollOffsets: new Map(),
      layerStore: {
        getOrCreateLayer: () => layer,
        getPreviousLayerRect: () => null,
        updateLayerGeometry() {},
        markLayerDamaged() {},
        markLayerClean() {},
        imageIdForLayer: () => 1,
        removeLayer() {},
        layerCount: () => layerCache.size,
      },
      dirty: {
        markDirty() {},
        markAllDirty() {},
        clearDirty() { cleared++ },
        dirtyVersion: () => 1,
        dirtyCount: () => 1,
      },

      backendOverride: {
        name: "test-backend",
        paint() {
          painted++
          return { output: "skip-present", strategy: "skip-present" }
        },
        compositeRetainedFrame(ctx) {
          composed++
          expect(ctx.layers).toHaveLength(1)
          expect(ctx.layers[0]?.opacity).toBe(0.5)
          expect(ctx.layers[0]?.subtreeTransform).not.toBeNull()
          return {
            output: "final-frame-raw",
            strategy: "final-frame",
            finalFrame: { data: new Uint8Array(4), width: 1, height: 1 },
          }
        },
      },
      useLayerCompositing: true,
      forceLayerRepaint: false,
      expFrameBudgetMs: 0,
      transmissionMode: "direct",
      debugCadence: false,
      debugDragRepro: false,
      interaction: {
        lastPresentedInteractionSeq: { value: 0 },
        lastPresentedInteractionLatencyMs: { value: 0 },
        lastPresentedInteractionType: { value: null },
      },
      lastFrameTime: { value: Date.now() },
      debug: { log() {}, renderDebug() {}, dragReproDebug() {} },
    }

    compositeFrame(state)

    expect(composed).toBe(1)
    expect(painted).toBe(0)
    expect(cleared).toBe(1)
  })
})

describe("unbindLayerDirtyStore identity check", () => {
  afterEach(() => {
    unbindLayerDirtyStore()
  })

  test("unbinds only when store identity matches or store is omitted", () => {
    const storeA = new Map<string, Layer>()
    const storeB = new Map<string, Layer>()
    const layerStore = createLayerStore()

    const layerA = layerStore.createLayer(1)
    layerA.width = 100
    layerA.height = 100
    storeA.set("layer:1", layerA)

    bindLayerDirtyStore(storeA)
    markLayerDirtyByKey("layer:1")
    expect(layerA.dirty).toBe(true)
    layerA.dirty = false

    // Attempt to unbind with non-matching storeB
    unbindLayerDirtyStore(storeB)
    markLayerDirtyByKey("layer:1")
    // Should NOT have unbound storeA
    expect(layerA.dirty).toBe(true)
    layerA.dirty = false

    // Unbind with matching storeA
    unbindLayerDirtyStore(storeA)
    markLayerDirtyByKey("layer:1")
    // Store was unbound, so layerA remains clean
    expect(layerA.dirty).toBe(false)

    // Rebind and unbind without argument
    bindLayerDirtyStore(storeA)
    unbindLayerDirtyStore()
    markLayerDirtyByKey("layer:1")
    expect(layerA.dirty).toBe(false)
  })
})

function createTestCompositeState(root: TGENode, layoutAdapter: ReturnType<typeof createVexartLayoutCtx>): CompositeFrameState {
  const layerStore = createLayerStore()
  const layer = layerStore.createLayer(1)
  layer.x = 0
  layer.y = 0
  layer.width = 200
  layer.height = 120
  const layerCache = new Map<string, typeof layer>([["bg", layer]])

  let dirtyCount = 1
  let dirtyVersion = 1

  return {
    root,
    viewportWidth: 200,
    viewportHeight: 120,
    term: {
      kind: "kitty",
      caps: {
        kind: "kitty",
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
        transmissionMode: "direct",
      },
      size: { cols: 25, rows: 10, pixelWidth: 200, pixelHeight: 120, cellWidth: 8, cellHeight: 12 },
      write() {}, rawWrite() {}, writeBytes() {}, beginSync() {}, endSync() {}, onResize() { return () => {} }, onData() { return () => {} },
      bgColor: null, fgColor: null, isDark: true, setTitle() {}, writeClipboard() {}, suspend() {}, resume() {}, destroy() {},
    },
    layoutAdapter,
    scroll: { x: 0, y: 0 },
    pointer: { x: 0, y: 0, down: false, dirty: false, pendingPress: false, pendingRelease: false, capturedNodeId: 0, pressOriginSet: false, prevActiveNode: null },
    postScrollCallbacks: [],
    walkCounters: { scrollSpeedCap: 0 },
    rectNodes: [],
    textNodes: [],
    boxNodes: [],
    rectNodeById: new Map(),
    nodeRefById: new Map(),
    layerBoundaries: [],
    scrollContainers: [],
    nodeCountValue: { value: 0 },
    layerCache,
    activeSlotKeys: new Set(),
    frameDirtyRects: [],
    pendingNodeDamageRects: [],
    scrollOffsets: new Map(),
    layerStore: {
      getOrCreateLayer: () => layer,
      getPreviousLayerRect: () => null,
      updateLayerGeometry() {},
      markLayerDamaged() {},
      markLayerClean() {},
      imageIdForLayer: () => 1,
      removeLayer() {},
      layerCount: () => layerCache.size,
    },
    dirty: {
      markDirty() { dirtyCount++; dirtyVersion++ },
      markAllDirty() {},
      clearDirty(expectedVersion?: number) {
        if (expectedVersion !== undefined && expectedVersion !== dirtyVersion) return
        dirtyCount = 0
      },
      dirtyVersion: () => dirtyVersion,
      dirtyCount: () => dirtyCount,
    },
    backendOverride: {
      name: "test-backend",
      paint() {
        return { output: "skip-present", strategy: "skip-present" }
      },
    },
    useLayerCompositing: true,
    forceLayerRepaint: false,
    expFrameBudgetMs: 0,
    transmissionMode: "direct",
    debugCadence: false,
    debugDragRepro: false,
    interaction: {
      lastPresentedInteractionSeq: { value: 0 },
      lastPresentedInteractionLatencyMs: { value: 0 },
      lastPresentedInteractionType: { value: null },
    },
    lastFrameTime: { value: Date.now() },
    debug: { log() {}, renderDebug() {}, dragReproDebug() {} },
  }
}

describe("compositeFrame interaction sequencing (Decision 9 Option A)", () => {
  test("processes clicks before layout pass and reflects state mutations in a single layout pass", () => {
    const layout = createVexartLayoutCtx()
    layout.setDimensions(200, 120)

    const root = createNode("root")
    root.props.width = 200
    root.props.height = 120
    root._widthSizing = parseSizing(200)
    root._heightSizing = parseSizing(120)
    syncAllLayoutProps(root)

    const button = createNode("box")
    button.props.width = 100
    button.props.height = 40
    button.props.focusable = true
    button._widthSizing = parseSizing(100)
    button._heightSizing = parseSizing(40)
    syncAllLayoutProps(button)
    insertChild(root, button)

    const state = createTestCompositeState(root, layout)

    // Initial render to lay out the button and populate state.rectNodes
    compositeFrame(state)
    expect(button.layout.width).toBe(100)
    expect(button.layout.height).toBe(40)
    expect(state.rectNodes.length).toBeGreaterThan(0)

    // Now spy on layout passes and interaction callback
    const events: string[] = []
    let layoutPasses = 0
    const originalBeginLayout = layout.beginLayout.bind(layout)
    layout.beginLayout = () => {
      layoutPasses++
      events.push(`layout-pass-${layoutPasses}`)
      return originalBeginLayout()
    }

    button.props.onPress = () => {
      events.push("click-handler")
      // Mutate state during the click: change width to 180
      button.props.width = 180
      button._widthSizing = parseSizing(180)
      syncLayoutProp(button, "width", 180)
      state.dirty.markDirty()
    }

    // Simulate click at button position (50, 20)
    state.pointer.x = 50
    state.pointer.y = 20
    state.pointer.down = false
    state.pointer.pendingPress = true
    state.pointer.pendingRelease = true
    state.pointer.dirty = true

    // Render frame with interaction
    compositeFrame(state)

    // 1. Verify interaction executed BEFORE layout pass
    expect(events).toEqual(["click-handler", "layout-pass-1"])

    // 2. Verify exactly one layout pass was executed
    expect(layoutPasses).toBe(1)

    // 3. Verify the state mutation from the click immediately reflected in layout
    expect(button.layout.width).toBe(180)
  })

  test("processes hovers before layout pass with a single layout pass", () => {
    const layout = createVexartLayoutCtx()
    layout.setDimensions(200, 120)

    const root = createNode("root")
    root.props.width = 200
    root.props.height = 120
    root._widthSizing = parseSizing(200)
    root._heightSizing = parseSizing(120)
    syncAllLayoutProps(root)

    const box = createNode("box")
    box.props.width = 80
    box.props.height = 30
    box.props.hoverStyle = { borderWidth: 4 }
    box._widthSizing = parseSizing(80)
    box._heightSizing = parseSizing(30)
    syncAllLayoutProps(box)
    insertChild(root, box)

    const state = createTestCompositeState(root, layout)

    // Initial frame
    compositeFrame(state)
    expect(box.layout.width).toBe(80)

    const events: string[] = []
    let layoutPasses = 0
    const originalBeginLayout = layout.beginLayout.bind(layout)
    layout.beginLayout = () => {
      layoutPasses++
      events.push(`layout-pass-${layoutPasses}`)
      return originalBeginLayout()
    }

    box.props.onMouseOver = () => {
      events.push("hover-handler")
    }

    // Move pointer over box
    state.pointer.x = 40
    state.pointer.y = 15
    state.pointer.dirty = true

    compositeFrame(state)

    // 1. Verify hover event fired before layout pass
    expect(events).toEqual(["hover-handler", "layout-pass-1"])

    // 2. Verify single layout pass
    expect(layoutPasses).toBe(1)

    // 3. Verify hover state is active on the node
    expect(box._hovered).toBe(true)
  })
})
