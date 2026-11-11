import { afterEach, describe, expect, test } from "bun:test"
import {
  CMD,
  type BorderRenderOp,
  type EffectRenderOp,
  type ImageRenderOp,
  type RectangleRenderOp,
  type TextRenderOp,
} from "../ffi/render-graph"
import { registerAnimationDescriptor, markLayerBacked, deregisterAllDescriptors, allDescriptors, resetFrameTracking, unmarkLayerBacked } from "../animation/compositor-path"
import { createLayerStore, type Layer } from "../ffi/layers"
import { createNode, insertChild, parseSizing, ensureImageExtra, type TGENode } from "../ffi/node"
import { syncAllLayoutProps, syncLayoutProp } from "../ffi/flex-sync"
import { DIRTY_KIND } from "../reconciler/dirty"
import { registerNodeFocusable, resetFocus, setFocus } from "../reconciler/focus"
import { createVexartLayoutCtx } from "./layout-adapter"
import {
  bindLayerDirtyStore,
  compositeFrame,
  markLayerDirtyByKey,
  unbindLayerDirtyStore,
  type CompositeFrameState,
} from "./composite"

function cleanupCompositorState() {
  resetFocus()
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
          mousePixel: false,
          mousePixelOrigin: 1,
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
  let layoutDirty = true
  const dirty = {
    markDirty() { dirtyCount++; dirtyVersion++ },
    markAllDirty() {},
    clearDirty(expectedVersion?: number) {
      if (expectedVersion !== undefined && expectedVersion !== dirtyVersion) return
      dirtyCount = 0
    },
    dirtyVersion: () => dirtyVersion,
    dirtyCount: () => dirtyCount,
    isLayoutDirty: () => layoutDirty,
    markLayoutDirty() { layoutDirty = true },
    clearLayoutDirty() { layoutDirty = false },
  }

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
        mousePixel: false,
        mousePixelOrigin: 1,
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
    dirty,
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
    box.props.hoverStyle = { width: 90 } as any
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

  test("bypasses layout pass when hoverStyle only changes borderWidth", () => {
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
    box.props.hoverStyle = { borderWidth: 4, borderColor: 0xff0000ff }
    box._widthSizing = parseSizing(80)
    box._heightSizing = parseSizing(30)
    syncAllLayoutProps(box)
    insertChild(root, box)

    const state = createTestCompositeState(root, layout)

    // Initial frame
    compositeFrame(state)
    expect(box.layout.width).toBe(80)

    let layoutPasses = 0
    const originalBeginLayout = layout.beginLayout.bind(layout)
    layout.beginLayout = () => {
      layoutPasses++
      return originalBeginLayout()
    }

    // Move pointer over box
    state.pointer.x = 40
    state.pointer.y = 15
    state.pointer.dirty = true

    compositeFrame(state)

    // Bypasses layout pass completely
    expect(layoutPasses).toBe(0)
    expect(box._hovered).toBe(true)

    // Fast-path synced border command exists and is updated
    const borderCmd = state.lastCommands?.find((cmd) => cmd.type === CMD.BORDER && cmd.nodeId === box.id)
    expect(borderCmd).toBeDefined()
    expect(borderCmd?.extra1).toBe(4)
    expect(borderCmd?.color).toBe(0xff0000ff)

    // Move pointer away (unhover)
    state.pointer.x = 150
    state.pointer.y = 100
    state.pointer.dirty = true

    compositeFrame(state)

    // Still bypasses layout pass
    expect(layoutPasses).toBe(0)
    expect(box._hovered).toBe(false)
    expect(borderCmd?.extra1).toBe(0)
    expect(borderCmd?.color).toBe(0)
  })

  test("in-place texture binding updates op.textureId and marks layer dirty when image finishes loading", () => {
    const layout = createVexartLayoutCtx()
    layout.setDimensions(200, 120)

    const root = createNode("root")
    root.props.width = 200
    root.props.height = 120
    root._widthSizing = parseSizing(200)
    root._heightSizing = parseSizing(120)
    syncAllLayoutProps(root)

    const img = createNode("img")
    img.props.width = 100
    img.props.height = 50
    img._widthSizing = parseSizing(100)
    img._heightSizing = parseSizing(50)
    syncAllLayoutProps(img)
    insertChild(root, img)

    const state = createTestCompositeState(root, layout)
    const layer = state.layerCache.get("bg")!
    state.layerCache.set("root", layer)
    bindLayerDirtyStore(state.layerCache)

    // Initial frame while image is not yet loaded
    compositeFrame(state)

    const rootBucket = state.lastLayerBuckets?.[0]
    expect(rootBucket).toBeDefined()
    const imageOp = rootBucket?.ops.find((op) => op.kind === "image") as ImageRenderOp
    expect(imageOp).toBeDefined()
    expect(imageOp.textureId).toBe(0)
    expect(imageOp.image.nativeImageHandle).toBeNull()

    // Reset dirty state on the layer to simulate stable rendered layer
    if (layer) {
      layer.dirty = false
      layer.damageRect = null
    }

    // Simulate async decode completion
    const extra = ensureImageExtra(img)
    extra.nativeHandle = 9999n
    extra.buffer = {
      data: new Uint8Array([255, 0, 0, 255]),
      width: 10,
      height: 10,
    }
    extra.state = "loaded"

    // Next frame without layout dirty
    compositeFrame(state)

    // Image op in lastLayerBuckets updated in-place
    expect(imageOp.textureId).toBe(9999n)
    expect(imageOp.image.nativeImageHandle).toBe(9999n)
    expect(imageOp.image.imageBuffer).toBe(extra.buffer)

    // And the layer was marked dirty
    expect(layer?.dirty).toBe(true)

    unbindLayerDirtyStore(state.layerCache)
  })
})

describe("compositeFrame layout-clean visual sync & declarative transitions", () => {
  test("syncs EffectRenderOp fields and inherited TextRenderOp color in-place with layoutPasses === 0", () => {
    const layout = createVexartLayoutCtx()
    layout.setDimensions(200, 120)

    const root = createNode("root")
    root.props.width = 200
    root.props.height = 120
    root._widthSizing = parseSizing(200)
    root._heightSizing = parseSizing(120)
    syncAllLayoutProps(root)

    const box = createNode("box")
    box.props.width = 120
    box.props.height = 40
    box.props.backgroundColor = "#112233ff"
    box.props.color = "#eeeeeeff"
    box.props.cornerRadius = 6
    box.props.opacity = 0.8
    box.props.backdropBlur = 8
    box.props.shadow = { x: 0, y: 2, blur: 4, color: "#00000080" }
    box.props.glow = { radius: 4, color: "#ff0000ff", intensity: 50 }
    box.props.gradient = { type: "linear", from: "#111111ff", to: "#333333ff", angle: 90 }
    box._widthSizing = parseSizing(120)
    box._heightSizing = parseSizing(40)
    syncAllLayoutProps(box)
    insertChild(root, box)

    const label = createNode("text")
    label.text = "Hello"
    label._widthSizing = parseSizing(80)
    label._heightSizing = parseSizing(20)
    syncAllLayoutProps(label)
    insertChild(box, label)

    const state = createTestCompositeState(root, layout)
    const layer = state.layerCache.get("bg")!
    state.layerCache.set("root", layer)
    bindLayerDirtyStore(state.layerCache)

    try {
      compositeFrame(state)

      const rootBucket = state.lastLayerBuckets?.[0]
      const effectOp = rootBucket?.ops.find((op) => op.kind === "effect" && op.nodeId === box.id) as EffectRenderOp
      const textOp = rootBucket?.ops.find((op) => op.kind === "text" && op.nodeId === label.id) as TextRenderOp
      expect(effectOp).toBeDefined()
      expect(textOp).toBeDefined()
      expect(textOp.color).toBe(0xeeeeeeff)

      const initialEffectStateId = effectOp.effectStateId
      let layoutPasses = 0
      const originalBeginLayout = layout.beginLayout.bind(layout)
      layout.beginLayout = () => {
        layoutPasses++
        return originalBeginLayout()
      }

      layer.dirty = false
      layer.damageRect = null

      box.props.backgroundColor = "#445566ff"
      box.props.color = "#ffaa00ff"
      box.props.cornerRadius = 12
      box.props.opacity = 0.5
      box.props.backdropBlur = 16
      box.props.shadow = { x: 2, y: 4, blur: 8, color: "#110022aa" }
      box.props.glow = { radius: 10, color: "#00ff00ff", intensity: 90 }
      box.props.gradient = undefined
      box._vpDirty = true
      label._vpDirty = true
      state.dirty.markDirty({ kind: DIRTY_KIND.NODE_VISUAL, nodeId: box.id })

      compositeFrame(state)

      expect(layoutPasses).toBe(0)
      expect(state.lastLayerBuckets?.[0]?.ops.find((op) => op.kind === "effect" && op.nodeId === box.id)).toBe(effectOp)
      expect(effectOp.color).toBe(0x445566ff)
      expect(effectOp.cornerRadius).toBe(12)
      expect(effectOp.effect.gradient).toBeUndefined()
      expect(effectOp.effect.shadow).toEqual({ x: 2, y: 4, blur: 8, color: 0x110022aa })
      expect(effectOp.effect.glow).toEqual({ radius: 10, color: 0x00ff00ff, intensity: 90 })
      expect(effectOp.effect.opacity).toBe(0.5)
      expect(effectOp.effect.backdropBlur).toBe(16)
      expect(effectOp.backdrop?.filterParams.blur).toBe(16)
      expect(effectOp.effectStateId).not.toBe(initialEffectStateId)
      expect(textOp.color).toBe(0xffaa00ff)
      expect(layer.dirty).toBe(true)
    } finally {
      unbindLayerDirtyStore(state.layerCache)
    }
  })

  test("rebuilds render graph without running layout when focusStyle adds/removes glow or borderColor is added", () => {
    const layout = createVexartLayoutCtx()
    layout.setDimensions(200, 120)

    const root = createNode("root")
    root.props.width = 200
    root.props.height = 120
    root._widthSizing = parseSizing(200)
    root._heightSizing = parseSizing(120)
    syncAllLayoutProps(root)

    const focusBox = createNode("box")
    focusBox.props.width = 100
    focusBox.props.height = 40
    focusBox.props.focusable = true
    focusBox.props.focusId = "focus-card"
    focusBox.props.backgroundColor = "#222222ff"
    focusBox.props.focusStyle = { glow: { radius: 8, color: "#33aaffff" } }
    focusBox._widthSizing = parseSizing(100)
    focusBox._heightSizing = parseSizing(40)
    syncAllLayoutProps(focusBox)
    insertChild(root, focusBox)
    const unregisterFocus = registerNodeFocusable(focusBox)
    setFocus(null)

    const borderBox = createNode("box")
    borderBox.props.width = 80
    borderBox.props.height = 30
    borderBox.props.backgroundColor = "#333333ff"
    borderBox._widthSizing = parseSizing(80)
    borderBox._heightSizing = parseSizing(30)
    syncAllLayoutProps(borderBox)
    insertChild(root, borderBox)

    const state = createTestCompositeState(root, layout)

    try {
      compositeFrame(state)

      let ops = state.lastLayerBuckets?.[0]?.ops ?? []
      expect(ops.find((op) => op.kind === "rectangle" && op.nodeId === focusBox.id)).toBeDefined()
      expect(ops.find((op) => op.kind === "effect" && op.nodeId === focusBox.id)).toBeUndefined()
      expect(ops.find((op) => op.kind === "border" && op.nodeId === borderBox.id)).toBeUndefined()

      let layoutPasses = 0
      const originalBeginLayout = layout.beginLayout.bind(layout)
      layout.beginLayout = () => {
        layoutPasses++
        return originalBeginLayout()
      }

      // 1. Focus adds glow -> topology rebuilds rectangle -> effect with layoutPasses === 0
      setFocus("focus-card")
      state.dirty.markDirty({ kind: DIRTY_KIND.NODE_VISUAL, nodeId: focusBox.id })
      compositeFrame(state)

      expect(layoutPasses).toBe(0)
      ops = state.lastLayerBuckets?.[0]?.ops ?? []
      const focusedEffect = ops.find((op) => op.kind === "effect" && op.nodeId === focusBox.id) as EffectRenderOp
      expect(focusedEffect).toBeDefined()
      expect(focusedEffect.effect.glow).toEqual({ radius: 8, color: 0x33aaffff, intensity: 80 })

      // 2. Blur removes glow -> topology rebuilds effect -> rectangle with layoutPasses === 0
      setFocus(null)
      state.dirty.markDirty({ kind: DIRTY_KIND.NODE_VISUAL, nodeId: focusBox.id })
      compositeFrame(state)

      expect(layoutPasses).toBe(0)
      ops = state.lastLayerBuckets?.[0]?.ops ?? []
      expect(ops.find((op) => op.kind === "effect" && op.nodeId === focusBox.id)).toBeUndefined()
      expect(ops.find((op) => op.kind === "rectangle" && op.nodeId === focusBox.id)).toBeDefined()

      // 3. Adding borderWidth + borderColor via NODE_VISUAL rebuilds graph to emit BorderRenderOp with layoutPasses === 0
      borderBox.props.borderWidth = 2
      borderBox.props.borderColor = "#ff0000ff"
      borderBox._vpDirty = true
      state.dirty.markDirty({ kind: DIRTY_KIND.NODE_VISUAL, nodeId: borderBox.id })
      compositeFrame(state)

      expect(layoutPasses).toBe(0)
      ops = state.lastLayerBuckets?.[0]?.ops ?? []
      const borderOp = ops.find((op) => op.kind === "border" && op.nodeId === borderBox.id) as BorderRenderOp
      expect(borderOp).toBeDefined()
      expect(borderOp.borderWidth).toBe(2)
      expect(borderOp.color).toBe(0xff0000ff)
    } finally {
      unregisterFocus()
    }
  })

  test("declarative transition snaps at 0/undefined, preserves RGB across alpha, retargets mid-flight, and clears dirtyCount on completion", async () => {
    const layout = createVexartLayoutCtx()
    layout.setDimensions(200, 120)

    const root = createNode("root")
    root.props.width = 200
    root.props.height = 120
    root._widthSizing = parseSizing(200)
    root._heightSizing = parseSizing(120)
    syncAllLayoutProps(root)

    const box = createNode("box")
    box.props.width = 100
    box.props.height = 40
    box.props.backgroundColor = "#112233ff"
    box._widthSizing = parseSizing(100)
    box._heightSizing = parseSizing(40)
    syncAllLayoutProps(box)
    insertChild(root, box)

    const state = createTestCompositeState(root, layout)
    compositeFrame(state)

    // 1. Immediate snap when transition is undefined or 0
    box.props.backgroundColor = "#445566ff"
    box._vpDirty = true
    state.dirty.markDirty()
    compositeFrame(state)
    let rectOp = state.lastLayerBuckets?.[0]?.ops.find((op) => op.kind === "rectangle" && op.nodeId === box.id) as RectangleRenderOp
    expect(rectOp.color).toBe(0x445566ff)
    expect(state.dirty.dirtyCount()).toBe(0)

    box.props.transition = 0
    box.props.backgroundColor = "#00000000"
    box._vpDirty = true
    state.dirty.markDirty()
    compositeFrame(state)
    expect(rectOp.color).toBe(0)
    expect(state.dirty.dirtyCount()).toBe(0)

    // 2. Transparent -> opaque preserves target RGB (no dark fringe) & animates progressively
    box.props.transition = 120
    box.props.backgroundColor = "#00000000"
    box._vpDirty = true
    state.dirty.markDirty()
    compositeFrame(state)

    box.props.backgroundColor = "#ff0000ff"
    box._vpDirty = true
    state.dirty.markDirty()
    compositeFrame(state)
    expect(state.dirty.dirtyCount()).toBeGreaterThan(0)

    await new Promise((resolve) => setTimeout(resolve, 25))
    compositeFrame(state)
    rectOp = state.lastLayerBuckets?.[0]?.ops.find((op) => op.kind === "rectangle" && op.nodeId === box.id) as RectangleRenderOp
    const midColor = rectOp.color >>> 0
    const midR = (midColor >>> 24) & 0xff
    const midG = (midColor >>> 16) & 0xff
    const midB = (midColor >>> 8) & 0xff
    const midA = midColor & 0xff
    expect(midR).toBe(255)
    expect(midG).toBe(0)
    expect(midB).toBe(0)
    expect(midA).toBeGreaterThan(0)
    expect(midA).toBeLessThan(255)
    expect(state.dirty.dirtyCount()).toBeGreaterThan(0)

    // 3. Mid-flight retargeting interpolates from current mid-flight red -> green
    box.props.backgroundColor = "#00ff00ff"
    box._vpDirty = true
    state.dirty.markDirty()
    compositeFrame(state)
    await new Promise((resolve) => setTimeout(resolve, 25))
    compositeFrame(state)
    const retargetColor = rectOp.color >>> 0
    expect((retargetColor >>> 24) & 0xff).toBeLessThan(255)
    expect((retargetColor >>> 16) & 0xff).toBeGreaterThan(0)

    // Wait for completion -> snaps to final green and clears dirtyCount to 0
    await new Promise((resolve) => setTimeout(resolve, 150))
    compositeFrame(state)
    expect(rectOp.color).toBe(0x00ff00ff)
    expect(state.dirty.dirtyCount()).toBe(0)
  })

  test("opacity fade-out to undefined keeps EffectRenderOp during transition then downgrades to rectangle with layoutPasses === 0", async () => {
    const layout = createVexartLayoutCtx()
    layout.setDimensions(200, 120)

    const root = createNode("root")
    root.props.width = 200
    root.props.height = 120
    root._widthSizing = parseSizing(200)
    root._heightSizing = parseSizing(120)
    syncAllLayoutProps(root)

    const box = createNode("box")
    box.props.width = 100
    box.props.height = 40
    box.props.backgroundColor = "#224466ff"
    box.props.opacity = 0.2
    box.props.transition = 80
    box._widthSizing = parseSizing(100)
    box._heightSizing = parseSizing(40)
    syncAllLayoutProps(box)
    insertChild(root, box)

    const state = createTestCompositeState(root, layout)
    compositeFrame(state)

    let ops = state.lastLayerBuckets?.[0]?.ops ?? []
    const initialEffect = ops.find((op) => op.kind === "effect" && op.nodeId === box.id) as EffectRenderOp
    expect(initialEffect).toBeDefined()
    expect(initialEffect.effect.opacity).toBe(0.2)

    let layoutPasses = 0
    const originalBeginLayout = layout.beginLayout.bind(layout)
    layout.beginLayout = () => {
      layoutPasses++
      return originalBeginLayout()
    }

    delete box.props.opacity
    box._vpDirty = true
    state.dirty.markDirty({ kind: DIRTY_KIND.NODE_VISUAL, nodeId: box.id })
    compositeFrame(state)

    await new Promise((resolve) => setTimeout(resolve, 25))
    compositeFrame(state)
    ops = state.lastLayerBuckets?.[0]?.ops ?? []
    const midEffect = ops.find((op) => op.kind === "effect" && op.nodeId === box.id) as EffectRenderOp
    expect(midEffect).toBeDefined()
    expect(midEffect.effect.opacity).toBeGreaterThan(0.2)
    expect(midEffect.effect.opacity).toBeLessThan(1)
    expect(layoutPasses).toBe(0)
    expect(state.dirty.dirtyCount()).toBeGreaterThan(0)

    await new Promise((resolve) => setTimeout(resolve, 100))
    compositeFrame(state)
    ops = state.lastLayerBuckets?.[0]?.ops ?? []
    expect(ops.find((op) => op.kind === "effect" && op.nodeId === box.id)).toBeUndefined()
    const downgradedRect = ops.find((op) => op.kind === "rectangle" && op.nodeId === box.id) as RectangleRenderOp
    expect(downgradedRect).toBeDefined()
    expect(downgradedRect.color).toBe(0x224466ff)
    expect(layoutPasses).toBe(0)
    expect(state.dirty.dirtyCount()).toBe(0)
  })
})
