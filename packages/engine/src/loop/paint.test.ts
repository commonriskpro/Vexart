import { describe, expect, test } from "bun:test"
import { createLayerStore, type Layer } from "../ffi/layers"
import { CMD, type RenderCommand } from "../ffi/render-graph"
import { createNode } from "../ffi/node"
import { canUseRegionalRepaint, collectLayerCommands, hasDirtySubtreeTransforms, paintFrame, selectLayerDirtyRect, selectLayerRepaintRect, type PaintFrameState, type PreparedLayerSlot } from "./paint"
import type { LayerPlan } from "./types"

function command(type: number, nodeId: number): RenderCommand {
  return {
    type,
    nodeId,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    color: 0xffffffff,
    cornerRadius: 0,
    extra1: 0,
    extra2: 0,
  }
}

function createPaintFrameState(): PaintFrameState {
  const store = createLayerStore()
  const layerCache = new Map<string, Layer>()
  const root = createNode("root")

  return {
    viewportWidth: 320,
    viewportHeight: 180,
    transmissionMode: "direct" as const,
    useLayerCompositing: true,
    forceLayerRepaint: false,
    expFrameBudgetMs: 0,
    debugCadence: false,
    debugDragRepro: false,
    getOrCreateLayer(key: string, z: number) {
      const existing = layerCache.get(key)
      if (existing) { existing.z = z; return existing }
      const layer = store.createLayer(z)
      layerCache.set(key, layer)
      return layer
    },
    getPreviousLayerRect: store.getPreviousLayerRect,
    updateLayerGeometry: store.updateLayerGeometry,
    markLayerDamaged: store.markLayerDamaged,
    markLayerClean: store.markLayerClean,
    imageIdForLayer: store.imageIdForLayer,
    removeLayer: store.removeLayer,
    layerCount: store.layerCount,
    layerCache,
    activeSlotKeys: new Set<string>(),
    frameDirtyRects: [],
    pendingNodeDamageRects: [],
    nodeRefById: new Map([[root.id, root]]),
    textMetaMap: new Map(),

    backendOverride: undefined,
    lastPresentedInteractionSeq: { value: 0 },
    lastPresentedInteractionLatencyMs: { value: 0 },
    lastPresentedInteractionType: { value: null as string | null },
    log() {},
    renderDebug() {},
    dragReproDebug() {},
  }
}

function layeredWindowPlan(commandCount: number): LayerPlan {
  return {
    bgSlot: { key: "bg", z: -1, cmdIndices: Array.from({ length: commandCount }, (_, index) => index) },
    contentSlots: [],
    slotBoundaryByKey: new Map(),
    boundaries: [],
  }
}

function windowCommands(activeWindowFirst: boolean): RenderCommand[] {
  const desktop = { ...command(CMD.RECTANGLE, 1), x: 0, y: 0, width: 320, height: 180, color: 0x0c0e14ff }
  const leftWindow = { ...command(CMD.RECTANGLE, 2), x: 48, y: 36, width: 150, height: 96, color: 0x284678f5 }
  const rightWindow = { ...command(CMD.RECTANGLE, 3), x: 112, y: 58, width: 150, height: 96, color: 0x784a24f5 }
  const leftTitle = { ...command(CMD.RECTANGLE, 4), x: 48, y: 36, width: 150, height: 22, color: 0x5082dcff }
  const rightTitle = { ...command(CMD.RECTANGLE, 5), x: 112, y: 58, width: 150, height: 22, color: 0xdc9646ff }
  const left = [leftWindow, leftTitle]
  const right = [rightWindow, rightTitle]
  return activeWindowFirst ? [desktop, rightWindow, rightTitle, leftWindow, leftTitle] : [desktop, ...left, ...right]
}

describe("collectLayerCommands", () => {
  test("keeps the full semantic command stream for regional layer repaint", () => {
    const surface = { ...command(CMD.RECTANGLE, 1), x: 0, y: 0, width: 200, height: 160 }
    const titlebar = { ...command(CMD.RECTANGLE, 2), x: 0, y: 0, width: 200, height: 32 }
    const content = { ...command(CMD.TEXT, 3), x: 16, y: 72, width: 80, height: 16 }

    expect(collectLayerCommands([surface, titlebar, content], [0, 1, 2])).toEqual([
      surface,
      titlebar,
      content,
    ])
  })
})

describe("canUseRegionalRepaint", () => {
  test("disables regional repaint for monolithic background layers", () => {
    expect(canUseRegionalRepaint(null, false, true)).toBe(false)
  })
})

describe("selectLayerRepaintRect", () => {
  test("does not forward damage rect to backend when regional repaint is disabled", () => {
    const damage = { x: 10, y: 20, width: 30, height: 40 }

    expect(selectLayerRepaintRect(false, damage)).toBeNull()
  })

  test("forwards clipped damage only when regional repaint is enabled", () => {
    const damage = { x: 10, y: 20, width: 30, height: 40 }

    expect(selectLayerRepaintRect(true, damage)).toBe(damage)
  })
})

describe("selectLayerDirtyRect", () => {
  test("treats dirty layer without scoped damage as full layer repaint", () => {
    const bounds = { x: 0, y: 0, width: 320, height: 180 }

    expect(selectLayerDirtyRect(true, null, bounds)).toBe(bounds)
  })

  test("preserves scoped damage when available", () => {
    const bounds = { x: 0, y: 0, width: 320, height: 180 }
    const damage = { x: 16, y: 24, width: 80, height: 32 }

    expect(selectLayerDirtyRect(true, damage, bounds)).toBe(damage)
    expect(selectLayerDirtyRect(false, damage, bounds)).toBe(damage)
  })

  test("returns null for clean layers without damage", () => {
    const bounds = { x: 0, y: 0, width: 320, height: 180 }

    expect(selectLayerDirtyRect(false, null, bounds)).toBeNull()
  })
})

describe("hasDirtySubtreeTransforms", () => {
  function prepared(dirtyRect: PreparedLayerSlot["dirtyRect"], transformed: boolean): PreparedLayerSlot {
    return {
      slot: { key: "layer", z: 0, cmdIndices: [] },
      layer: createLayerStore().createLayer(0),
      debugName: "layer",
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      dirtyRect,
      clippedDamage: dirtyRect,
      isBackground: false,
      subtreeTransform: transformed
        ? {
            p0: { x: 0, y: 0 },
            p1: { x: 100, y: 0 },
            p2: { x: 100, y: 100 },
            p3: { x: 0, y: 100 },
          }
        : null,
      allowRegionalRepaint: false,
      useRegionalRepaint: false,
      freezeWhileInteracting: false,
    }
  }

  test("ignores clean retained transform layers for frame strategy selection", () => {
    expect(hasDirtySubtreeTransforms([prepared(null, true)], false)).toBe(false)
  })

  test("keeps dirty transform layers on the conservative final-frame path", () => {
    expect(hasDirtySubtreeTransforms([prepared({ x: 0, y: 0, width: 10, height: 10 }, true)], false)).toBe(true)
  })
})

describe("markAllDirty preserves full damage after node-scoped damage", () => {
  test("full damageRect survives applyPendingNodeDamage union", () => {
    // Simulates focus change between two sibling buttons:
    // 1. markAllDirty() sets layer.dirty=true + damageRect=full bounds
    // 2. applyPendingNodeDamage adds small per-node rects
    // The layer's damageRect must remain the full bounds (not shrink to the
    // union of the two small rects), so selectLayerDirtyRect returns the
    // full layer area — preventing siblings from disappearing.
    const store = createLayerStore()
    const layer = store.createLayer(-1)
    store.updateLayerGeometry(layer, 0, 0, 320, 180, { moveOnly: false })
    store.markLayerClean(layer)

    // Step 1: markAllDirty — should set full damageRect
    store.markAllDirty()
    expect(layer.dirty).toBe(true)
    expect(layer.damageRect).toEqual({ x: 0, y: 0, width: 320, height: 180 })

    // Step 2: applyPendingNodeDamage would call markLayerDamaged with small rects
    store.markLayerDamaged(layer, { x: 10, y: 20, width: 40, height: 30 })
    store.markLayerDamaged(layer, { x: 10, y: 80, width: 40, height: 30 })

    // The damageRect must still cover the full layer, not just the small rects
    expect(layer.damageRect).toEqual({ x: 0, y: 0, width: 320, height: 180 })

    // selectLayerDirtyRect should return the full bounds
    const bounds = { x: 0, y: 0, width: 320, height: 180 }
    const dirtyRect = selectLayerDirtyRect(layer.dirty, layer.damageRect, bounds)
    expect(dirtyRect).toEqual(bounds)
  })
})

describe("paintFrame monolithic overlapping windows", () => {
  test("repaints a dirty bg layer without scoped damage instead of skipping presentation", () => {
    const state = createPaintFrameState()
    const observed = {
      dirtyLayerCount: 0,
      dirtyPixelArea: 0,
      paintCalls: 0,
      repaintRect: undefined as unknown,
      commandCounts: [] as number[],
    }
    state.backendOverride = {
      name: "paint-frame-test",
      beginFrame(ctx) {
        observed.dirtyLayerCount = ctx.dirtyLayerCount
        observed.dirtyPixelArea = ctx.dirtyPixelArea
        return { strategy: ctx.dirtyLayerCount === 0 ? "skip-present" : "layered-dirty" }
      },
      paint(ctx) {
        observed.paintCalls += 1
        observed.repaintRect = ctx.layer?.repaintRect
        observed.commandCounts.push(ctx.commands.length)
        return { output: "native-presented", strategy: "layered-dirty" }
      },
      endFrame() {
        return { output: "none", strategy: "layered-dirty" }
      },
    }

    const initial = windowCommands(false)
    paintFrame(layeredWindowPlan(initial.length), initial, 8, 16, state)

    const bg = state.layerCache.get("bg")!
    bg.dirty = true
    bg.damageRect = null

    const reordered = windowCommands(true)
    paintFrame(layeredWindowPlan(reordered.length), reordered, 8, 16, state)

    expect(observed.dirtyLayerCount).toBe(1)
    expect(observed.dirtyPixelArea).toBe(320 * 180)
    expect(observed.paintCalls).toBe(2)
    expect(observed.repaintRect).toBeNull()
    expect(observed.commandCounts.at(-1)).toBe(reordered.length)
  })
})
