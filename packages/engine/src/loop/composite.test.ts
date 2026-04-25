import { afterEach, describe, expect, test } from "bun:test"
import { registerAnimationDescriptor, markLayerBacked, deregisterAllDescriptors, allDescriptors, resetFrameTracking, unmarkLayerBacked } from "../animation/compositor-path"
import { createLayerStore } from "../ffi/layers"
import { createNode } from "../ffi/node"
import { createRenderGraphQueues } from "../ffi/render-graph"
import { compositeFrame, type CompositeFrameState } from "./composite"

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
      walkCounters: { scrollIdCounter: 0, textMeasureIndex: 0, scrollSpeedCap: 0 },
      rectNodes: [],
      textNodes: [],
      boxNodes: [],
      textMetas: [],
      textMetaMap: new Map(),
      rectNodeById: new Map(),
      nodePathById: new Map(),
      nodeRefById: new Map([[node.id, node]]),
      layerBoundaries: [],
      scrollContainers: [],
      nodeCountValue: { value: 2 },
      renderGraphQueues: createRenderGraphQueues(),
      layerCache,
      activeSlotKeys: new Set(),
      frameDirtyRects: [],
      pendingNodeDamageRects: [],
      getOrCreateLayer: () => layer,
      getPreviousLayerRect: () => null,
      updateLayerGeometry() {},
      markLayerDamaged() {},
      markLayerClean() {},
      imageIdForLayer: () => 1,
      removeLayer() {},
      layerCount: () => layerCache.size,
      markDirty() {},
      markAllDirty() {},
      clearDirty() { cleared++ },
      dirtyVersion: () => 1,
      dirtyCount: () => 1,
      layerComposer: null,
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
      lastPresentedInteractionSeq: { value: 0 },
      lastPresentedInteractionLatencyMs: { value: 0 },
      lastPresentedInteractionType: { value: null },
      lastFrameTime: { value: Date.now() },
      log() {},
      renderDebug() {},
      dragReproDebug() {},
    }

    compositeFrame(state)

    expect(composed).toBe(1)
    expect(painted).toBe(0)
    expect(cleared).toBe(1)
  })
})
