/**
 * composite.ts — Frame compositing orchestrator.
 *
 * Extracted from loop.ts as part of Phase 3 Slice 3.1.
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §Output+Coordinator
 *
 * Owns the full per-frame pipeline:
 *   1. Feed pointer/scroll to layoutAdapter (no-op stubs — handled TS-side)
 *   2. walkTree → layoutAdapter → endLayout
 *   3. writeLayoutBack + updateInteractiveStates
 *   4. Re-layout on click (instant visual feedback)
 *   5. findLayerBoundaries + assignLayersSpatial
 *   6. beginSync → paintFrame → endSync + debug stats
 *
 * Exports:
 *   - CompositeFrameState — all dependencies the coordinator injects per frame
 *   - compositeFrame()    — renders one complete frame
 */

import type { Terminal } from "../terminal/index"
import type { RenderCommand } from "../ffi/render-graph"

import type { TGENode } from "../ffi/node"

import { debugFrameStart, debugUpdateStats, isDebugEnabled } from "./debug"
import {
  writeLayoutBack as _writeLayoutBack,
  updateInteractiveStates as _updateInteractiveStates,
  type InteractiveStatesBag,
} from "./layout"
import { setActiveScrollOffsets } from "../reconciler/hit-test"
import {
  assignLayersSpatial as _assignLayersSpatial,
  type AssignLayersState,
} from "./assign-layers"
import type { LayerBoundary, LayerSlot, DirtyTrackingHandle, InteractionLatencyTracking, DebugLogHelpers } from "./types"
import {
  collectText,
  walkTree as _walkTree,
  type WalkTreeState,
} from "./walk-tree"
import {
  paintFrame as _paintFrame,
  type PaintFrameState,
} from "./paint"
import type { createVexartLayoutCtx } from "./layout-adapter"
import { summarizeRendererResourceStats } from "../ffi/resource-stats"
import { hasCompositorAnimations, isCompositorOnlyFrame, resetFrameTracking } from "../animation/compositor-path"
import { unionRect, type DamageRect } from "../ffi/damage"
import type { Layer, LayerStoreHandle } from "../ffi/layers"
import type { RendererBackend } from "../ffi/renderer-backend"


import { DIRTY_KIND } from "../reconciler/dirty"
import { routeScrollDeltas, applyScrollOffsets } from "./composite-scroll"
import { buildRetainedCompositorLayers } from "./composite-retained"

let layerDirtyStore: Map<string, Layer> | null = null

export function bindLayerDirtyStore(store: Map<string, Layer>): void {
  layerDirtyStore = store
}

export function markLayerDirtyByKey(key: string): void {
  const layer = layerDirtyStore?.get(key)
  if (!layer) return
  layer.dirty = true
  if (layer.width > 0 && layer.height > 0) {
    layer.damageRect = { x: layer.x, y: layer.y, width: layer.width, height: layer.height }
  }
}

export function markLayerDamageByKey(key: string, rect: DamageRect): void {
  const layer = layerDirtyStore?.get(key)
  if (!layer) return
  layer.dirty = true
  layer.damageRect = layer.damageRect ? unionRect(layer.damageRect, rect) : rect
}

// ── Types ─────────────────────────────────────────────────────────────────

/** Mutable scalar counters for walk state writeback. */
type WalkCounters = {
  scrollSpeedCap: number
}

/** Per-frame profiling data (only populated when DEBUG_CADENCE=1). */
export type FrameProfile = {
  scheduledIntervalMs: number
  scheduledDelayMs: number
  timerDelayMs: number
  sincePrevFrameMs: number
  scrollMs: number
  walkTreeMs: number
  layoutComputeMs: number
  layoutWritebackMs: number
  interactionMs: number
  relayoutMs: number
  layoutMs: number
  layerAssignMs: number
  prepMs: number
  paintNativeSnapshotMs: number
  paintLayerPrepMs: number
  paintFrameContextMs: number
  paintBackendBeginMs: number
  paintReuseMs: number
  paintRenderGraphMs: number
  paintBackendPaintMs: number
  paintBackendCompositeMs: number
  paintBackendReadbackMs: number
  paintBackendNativeEmitMs: number
  paintBackendNativeReadbackMs: number
  paintBackendNativeCompressMs: number
  paintBackendNativeShmPrepareMs: number
  paintBackendNativeWriteMs: number
  paintBackendNativeRawBytes: number
  paintBackendNativePayloadBytes: number
  paintBackendUniformMs: number
  paintLayerCleanupMs: number
  paintBackendEndMs: number
  paintPresentationMs: number
  paintInteractionStatsMs: number
  paintMs: number
  beginSyncMs: number
  ioMs: number
  endSyncMs: number
  totalMs: number
  commands: number
  repainted: number
  dirtyBefore: number
}

/** Create a zero-initialized FrameProfile. Use to avoid 2000-char inline literals. */
export function createFrameProfile(overrides?: Partial<FrameProfile>): FrameProfile {
  return {
    scheduledIntervalMs: 0, scheduledDelayMs: 0, timerDelayMs: 0, sincePrevFrameMs: 0,
    scrollMs: 0, walkTreeMs: 0, layoutComputeMs: 0, layoutWritebackMs: 0,
    interactionMs: 0, relayoutMs: 0, layoutMs: 0, layerAssignMs: 0, prepMs: 0,
    paintNativeSnapshotMs: 0, paintLayerPrepMs: 0, paintFrameContextMs: 0,
    paintBackendBeginMs: 0, paintReuseMs: 0, paintRenderGraphMs: 0,
    paintBackendPaintMs: 0, paintBackendCompositeMs: 0, paintBackendReadbackMs: 0,
    paintBackendNativeEmitMs: 0, paintBackendNativeReadbackMs: 0,
    paintBackendNativeCompressMs: 0, paintBackendNativeShmPrepareMs: 0,
    paintBackendNativeWriteMs: 0, paintBackendNativeRawBytes: 0,
    paintBackendNativePayloadBytes: 0, paintBackendUniformMs: 0,
    paintLayerCleanupMs: 0, paintBackendEndMs: 0, paintPresentationMs: 0,
    paintInteractionStatsMs: 0, paintMs: 0, beginSyncMs: 0, ioMs: 0, endSyncMs: 0,
    totalMs: 0, commands: 0, repainted: 0, dirtyBefore: 0,
    ...overrides,
  }
}

/**
 * All dependencies injected by the coordinator into compositeFrame.
 * The coordinator owns all mutable state; compositeFrame reads and writes
 * back via this bag.
 */
export type CompositeFrameState = {
  // Tree root
  root: TGENode

  // Viewport dimensions (pixels)
  viewportWidth: number
  viewportHeight: number

  // Terminal (for beginSync/endSync, cell size)
  term: Terminal

  // Layout adapter (Flexily-backed)
  layoutAdapter: ReturnType<typeof createVexartLayoutCtx>

  // Accumulated scroll deltas (reset to 0 after consumption)
  scroll: { x: number; y: number }

  // Mutable pointer state
  pointer: {
    x: number
    y: number
    down: boolean
    dirty: boolean
    pendingPress: boolean
    pendingRelease: boolean
    capturedNodeId: number
    pressOriginSet: boolean
    prevActiveNode: TGENode | null
  }

  // Post-scroll hooks (fire after scroll state updates, before walkTree)
  postScrollCallbacks: (() => void)[]

  // Walk counters — read at start, written back at end
  walkCounters: WalkCounters

  // Accumulator arrays — cleared before each walk
  rectNodes: TGENode[]
  textNodes: TGENode[]
  boxNodes: TGENode[]
  rectNodeById: Map<number, TGENode>
  nodeRefById: Map<number, TGENode>
  layerBoundaries: LayerBoundary[]
  scrollContainers: TGENode[]
  nodeCountValue: { value: number }

  // Layer cache + dirty rects
  layerCache: Map<string, Layer>
  activeSlotKeys: Set<string>
  frameDirtyRects: DamageRect[]
  pendingNodeDamageRects: Array<{ nodeId: number; rect: DamageRect }>
  /** HP-6: Scroll offsets per container ID — used for lazy hit-testing. */
  scrollOffsets: Map<number, { x: number; y: number }>

  // Layer store methods (coordinator owns the store)
  layerStore: LayerStoreHandle

  // Dirty tracking
  dirty: DirtyTrackingHandle

  // Renderer backend
  backendOverride?: RendererBackend

  // Frame config flags
  useLayerCompositing: boolean
  forceLayerRepaint: boolean
  expFrameBudgetMs: number
  transmissionMode: "direct" | "file" | "shm"

  // Debug flags
  debugCadence: boolean
  debugDragRepro: boolean

  // Interaction latency tracking (coordinator-owned scalars)
  interaction: InteractionLatencyTracking

  // Frame timing (mutable — updated at start of each frame for dt calculation)
  lastFrameTime: { value: number }

  // Log helpers
  debug: DebugLogHelpers
}

// ── Helpers ───────────────────────────────────────────────────────────────

function buildWalkState(s: CompositeFrameState): WalkTreeState {
  return {
    scrollSpeedCap: { value: s.walkCounters.scrollSpeedCap },
    nodeCount: s.nodeCountValue,
    rectNodes: s.rectNodes,
    textNodes: s.textNodes,
    boxNodes: s.boxNodes,
    layerBoundaries: s.layerBoundaries,
    scrollContainers: s.scrollContainers,
    nodeRefById: s.nodeRefById,
    rectNodeById: s.rectNodeById,
    layout: s.layoutAdapter,
  }
}

function walkTreeOnce(s: CompositeFrameState) {
  const state = buildWalkState(s)
  _walkTree(s.root, state)
  s.walkCounters.scrollSpeedCap = state.scrollSpeedCap.value
}

function resetWalkAccumulators(s: CompositeFrameState) {
  s.walkCounters.scrollSpeedCap = 0
  s.rectNodes.length = 0
  s.rectNodeById.clear()
  s.textNodes.length = 0
  s.boxNodes.length = 0
  s.layerBoundaries.length = 0
  s.scrollContainers.length = 0
  s.nodeCountValue.value = 0
  s.nodeRefById.clear()
}

function writeLayoutBack(s: CompositeFrameState) {
  const layoutMap = s.layoutAdapter.getLastLayoutMap()
  _writeLayoutBack(layoutMap, {
    rectNodes: s.rectNodes,
    textNodes: s.textNodes,
    boxNodes: s.boxNodes,
    pendingNodeDamageRects: s.pendingNodeDamageRects,
  })
}

function runLayoutPass(s: CompositeFrameState, profile?: FrameProfile) {
  resetWalkAccumulators(s)
  s.layoutAdapter.beginLayout()
  const walkStart = profile ? performance.now() : 0
  walkTreeOnce(s)
  if (profile) profile.walkTreeMs = performance.now() - walkStart
  const layoutComputeStart = profile ? performance.now() : 0
  const commands = s.layoutAdapter.endLayout(s.root._flexNode)
  if (profile) profile.layoutComputeMs = performance.now() - layoutComputeStart
  const layoutWritebackStart = profile ? performance.now() : 0
  writeLayoutBack(s)
  applyScrollOffsets(commands, s)
  if (profile) profile.layoutWritebackMs = performance.now() - layoutWritebackStart
  return commands
}

// HP-6: Scroll offsets applied lazily via composite-scroll.ts



/**
 * Check whether an interactive style contains any layout-affecting props.
 * Only `borderWidth` affects layout among InteractiveStyleProps — all others
 * (backgroundColor, shadow, glow, gradient, opacity, etc.) are visual-only.
 */
function interactiveStyleAffectsLayout(style: import("../ffi/node").InteractiveStyleProps | undefined): boolean {
  if (!style) return false
  return style.borderWidth !== undefined
}

function updateInteractiveStates(s: CompositeFrameState): { hadClick: boolean; changed: boolean; needsRelayout: boolean } {
  let changed = false
  let needsRelayout = false
  const visualNodeIds = new Set<number>()
  const queueNodeVisualDamage = (node: TGENode) => {
    visualNodeIds.add(node.id)
    // HP-5: Track if any changed node has layout-affecting interactive styles
    if (!needsRelayout) {
      const props = node.props
      if (
        interactiveStyleAffectsLayout(props.hoverStyle) ||
        interactiveStyleAffectsLayout(props.activeStyle) ||
        interactiveStyleAffectsLayout(props.focusStyle)
      ) {
        needsRelayout = true
      }
    }
    if (node.layout.width <= 0 || node.layout.height <= 0) return
    const padding = 32
    s.pendingNodeDamageRects.push({
      nodeId: node.id,
      rect: {
        x: node.layout.x - padding,
        y: node.layout.y - padding,
        width: node.layout.width + padding * 2,
        height: node.layout.height + padding * 2,
      },
    })
  }
  // HP-6: Set active scroll offsets for hit-testing helpers (buildNodeMouseEvent, isFullyOutsideScrollViewport)
  setActiveScrollOffsets(s.scrollOffsets)
  const bag: InteractiveStatesBag = {
    rectNodes: s.rectNodes,
    rectNodeById: s.rectNodeById,
    pointerX: s.pointer.x,
    pointerY: s.pointer.y,
    pointerDown: s.pointer.down,
    pointerDirty: s.pointer.dirty,
    pendingPress: s.pointer.pendingPress,
    pendingRelease: s.pointer.pendingRelease,
    capturedNodeId: s.pointer.capturedNodeId,
    pressOriginSet: s.pointer.pressOriginSet,
    prevActiveNode: s.pointer.prevActiveNode,
    cellWidth: s.term.size.cellWidth || 8,
    cellHeight: s.term.size.cellHeight || 16,
    scrollOffsets: s.scrollOffsets,
    onChanged: () => {
      changed = true
      if (visualNodeIds.size === 0) {
        // No visual nodes tracked but something changed (e.g. mouseDown dispatch)
        // — defensively mark all layers dirty.
        s.dirty.markDirty()
        s.dirty.markAllDirty()
        return
      }
      // Mark only the layers that CONTAIN the changed nodes dirty (with
      // full-bounds damage to avoid the "disappearing siblings" bug within
      // each layer). Layers without changed nodes stay clean and are reused.
      const markedKeys = new Set<string>()
      for (const nodeId of visualNodeIds) {
        const node = s.nodeRefById.get(nodeId)
        const key = node?._layerKey ?? "bg"
        if (!markedKeys.has(key)) {
          markedKeys.add(key)
          markLayerDirtyByKey(key)
        }
        s.dirty.markDirty({ kind: DIRTY_KIND.NODE_VISUAL, nodeId })
      }
    },
    onNodeVisualChanged: queueNodeVisualDamage,
  }
  const captureBefore = s.pointer.capturedNodeId
  const hadClick = _updateInteractiveStates(bag)
  // Write back mutable fields
  s.pointer.pendingPress = bag.pendingPress
  s.pointer.pendingRelease = bag.pendingRelease
  s.pointer.pressOriginSet = bag.pressOriginSet
  s.pointer.prevActiveNode = bag.prevActiveNode
  // Pointer callbacks may call setPointerCapture()/releasePointerCapture(),
  // which mutate s.pointer directly through the active loop boundary. Do not
  // overwrite that external mutation with the stale bag value captured before
  // callbacks ran.
  if (s.pointer.capturedNodeId === captureBefore) s.pointer.capturedNodeId = bag.capturedNodeId
  s.pointer.dirty = bag.pointerDirty
  return { hadClick, changed, needsRelayout }
}

// ── compositeFrame ────────────────────────────────────────────────────────

/**
 * Render one complete frame through the full pipeline.
 *
 * Called by the coordinator's frame() each tick.
  * Returns early (without clearing dirty) if the layout adapter emits no commands.
 */
export function compositeFrame(s: CompositeFrameState, profile?: FrameProfile) {
  const dirtyVersionAtFrameStart = s.dirty.dirtyVersion()
  const dirtyBeforeFrame = s.dirty.dirtyCount()
  const layoutStart = s.debugCadence ? performance.now() : 0
  const scrollStart = profile ? performance.now() : 0

  // ── Step 1: Feed scroll + pointer state ──
  const now = Date.now()
  const dt = Math.min((now - s.lastFrameTime.value) / 1000, 0.1)
  s.lastFrameTime.value = now

  // Route scroll deltas to the innermost scroll container at pointer position
  let sdx = s.scroll.x
  let sdy = s.scroll.y
  if (s.walkCounters.scrollSpeedCap > 0 && (sdx !== 0 || sdy !== 0)) {
    const cellH = s.term.size.cellHeight || 16
    const maxDelta = s.walkCounters.scrollSpeedCap * cellH
    sdx = Math.max(-maxDelta, Math.min(maxDelta, sdx))
    sdy = Math.max(-maxDelta, Math.min(maxDelta, sdy))
  }
  routeScrollDeltas(s, sdx, sdy)
  s.scroll.x = 0
  s.scroll.y = 0

  // Post-scroll hooks
  for (const cb of s.postScrollCallbacks) cb()
  if (profile) profile.scrollMs = performance.now() - scrollStart

  const backend = s.backendOverride!
  const compositorOnlyFrame = hasCompositorAnimations()
    && isCompositorOnlyFrame()
    && s.scroll.x === 0
    && s.scroll.y === 0
    && !s.pointer.pendingPress
    && !s.pointer.pendingRelease
    && !s.pointer.down
    && !s.pointer.dirty
    && !!backend.compositeRetainedFrame
    && s.layerCache.size > 0

  if (compositorOnlyFrame) {
    const retainedPrepStart = profile ? performance.now() : 0
    const retainedLayers = buildRetainedCompositorLayers(s.layerCache, s.nodeRefById)
    if (profile) profile.paintLayerPrepMs = performance.now() - retainedPrepStart
    const dirtyLayerCount = retainedLayers.filter((layer) => layer.opacity < 0.999 || !!layer.subtreeTransform).length
    const dirtyPixelArea = retainedLayers.reduce((sum, layer) => sum + layer.bounds.width * layer.bounds.height, 0)
    const totalPixelArea = Math.max(1, s.viewportWidth * s.viewportHeight)
    const frameCtx = {
      viewportWidth: s.viewportWidth,
      viewportHeight: s.viewportHeight,
      dirtyLayerCount,
      layerCount: retainedLayers.length,
      dirtyPixelArea,
      totalPixelArea,
      overlapPixelArea: 0,
      overlapRatio: 0,
      fullRepaint: false,
      useLayerCompositing: s.useLayerCompositing,
      hasSubtreeTransforms: retainedLayers.some((layer) => !!layer.subtreeTransform),
      hasActiveInteraction: false,
      transmissionMode: s.transmissionMode,
      estimatedLayeredBytes: dirtyPixelArea * 4,
      estimatedFinalBytes: totalPixelArea * 4,
    } satisfies import("../ffi/renderer-backend").RendererBackendFrameContext
    const beginSyncStart = profile ? performance.now() : 0
    s.term.beginSync()
    if (profile) profile.beginSyncMs = performance.now() - beginSyncStart
    const retainedPaintStart = profile ? performance.now() : 0
    const frameResult = backend.compositeRetainedFrame?.({ frame: frameCtx, layers: retainedLayers }) ?? null
    if (profile) {
      profile.paintBackendPaintMs = performance.now() - retainedPaintStart
      const backendProfile = backend.drainProfile?.()
      if (backendProfile) {
        profile.paintBackendCompositeMs += backendProfile.compositeMs
        profile.paintBackendReadbackMs += backendProfile.readbackMs
        profile.paintBackendNativeEmitMs += backendProfile.nativeEmitMs
        profile.paintBackendNativeReadbackMs += backendProfile.nativeReadbackMs
        profile.paintBackendNativeCompressMs += backendProfile.nativeCompressMs
        profile.paintBackendNativeShmPrepareMs += backendProfile.nativeShmPrepareMs
        profile.paintBackendNativeWriteMs += backendProfile.nativeWriteMs
        profile.paintBackendNativeRawBytes += backendProfile.nativeRawBytes
        profile.paintBackendNativePayloadBytes += backendProfile.nativePayloadBytes
        profile.paintBackendUniformMs += backendProfile.uniformUpdateMs
      }
      profile.paintMs = profile.paintBackendPaintMs
      profile.commands = 0
      profile.dirtyBefore = dirtyBeforeFrame
      profile.repainted = 0
    }
    const endSyncStart = profile ? performance.now() : 0
    s.term.endSync()
    if (profile) profile.endSyncMs = performance.now() - endSyncStart
    const resourceSummary = isDebugEnabled()
      ? summarizeRendererResourceStats()
      : { totalBytes: 0, gpuBytes: 0, cacheEntries: 0 }
    debugUpdateStats({
      commandCount: 0,
      dirtyBeforeCount: dirtyBeforeFrame,
      layerCount: s.layerStore.layerCount(),
      moveOnlyCount: 0,
      moveFallbackCount: 0,
      stableReuseCount: retainedLayers.length,
      nodeCount: s.nodeCountValue.value,
      repaintedCount: 0,
      rendererStrategy: frameResult?.strategy ?? "final-frame",
      rendererOutput: frameResult?.output ?? "none",
      dirtyPixelArea: frameCtx.dirtyPixelArea,
      totalPixelArea: frameCtx.totalPixelArea,
      overlapPixelArea: frameCtx.overlapPixelArea,
      overlapRatio: frameCtx.overlapRatio,
      fullRepaint: frameCtx.fullRepaint,
      transmissionMode: frameCtx.transmissionMode,
      estimatedLayeredBytes: frameCtx.estimatedLayeredBytes,
      estimatedFinalBytes: frameCtx.estimatedFinalBytes,
      interactionLatencyMs: s.interaction.lastPresentedInteractionLatencyMs.value,
      interactionType: s.interaction.lastPresentedInteractionType.value,
      presentedInteractionSeq: s.interaction.lastPresentedInteractionSeq.value,
      resourceBytes: resourceSummary.totalBytes,
      gpuResourceBytes: resourceSummary.gpuBytes,
      resourceEntries: resourceSummary.cacheEntries,
      nativeStats: frameResult?.output === "native-presented" ? (frameResult.stats ?? null) : null,
      nativeFrameReasonFlags: null,
    })
    resetFrameTracking()
    s.dirty.clearDirty(dirtyVersionAtFrameStart)
    return
  }

  // ── Step 2: Walk tree → Flexily layout ──
  let commands = runLayoutPass(s, profile)

  // ── Step 3: Interaction states ──
  const interactionStart = profile ? performance.now() : 0
  const interaction = updateInteractiveStates(s)
  if (profile) profile.interactionMs = performance.now() - interactionStart

  // Re-layout on interactive state changes that affect layout (HP-5 optimization).
  // Only borderWidth among InteractiveStyleProps affects layout — all others
  // (backgroundColor, shadow, opacity, etc.) are visual-only and only need repaint.
  // Clicks always trigger re-layout because onPress handlers may mutate state.
  if (interaction.hadClick || interaction.needsRelayout) {
    const relayoutStart = profile ? performance.now() : 0
    commands = runLayoutPass(s)
    if (profile) profile.relayoutMs = performance.now() - relayoutStart
  }

  if (profile) profile.layoutMs = performance.now() - layoutStart

  if (commands.length === 0) {
    s.dirty.clearDirty(dirtyVersionAtFrameStart)
    return
  }

  const prepStart = s.debugCadence ? performance.now() : 0
  const layerAssignStart = profile ? performance.now() : 0

  // ── Step 4: Layer boundary + slot assignment ──
  const boundaries = s.forceLayerRepaint
    ? s.layerBoundaries.filter((boundary) => s.nodeRefById.get(boundary.nodeId)?._autoLayer !== true)
    : s.layerBoundaries
  const assignState: AssignLayersState = { root: s.root, collectText, nodeRefById: s.nodeRefById, scrollContainers: s.scrollContainers }
  const { bgSlot, contentSlots, slotBoundaryByKey } = _assignLayersSpatial(commands, boundaries, assignState)

  if (contentSlots.length === 0 && commands.length > bgSlot.cmdIndices.length) {
    const fallbackSlot: LayerSlot = { key: "layer:fallback", z: 0, cmdIndices: [] }
    for (let i = 0; i < commands.length; i++) {
      if (!bgSlot.cmdIndices.includes(i)) fallbackSlot.cmdIndices.push(i)
    }
    if (fallbackSlot.cmdIndices.length > 0) contentSlots.push(fallbackSlot)
  }

  const cellW = s.term.size.cellWidth || 8
  const cellH = s.term.size.cellHeight || 16

  s.debug.log(`[frame] cmds=${commands.length} layers=${1 + contentSlots.length} slots=[${[bgSlot, ...contentSlots].map(sl => `${sl.key}(${sl.cmdIndices.length})`).join(',')}]`)
  s.debug.renderDebug(`[frame:start] cmds=${commands.length} layers=${1 + contentSlots.length}`)

  if (profile) {
    profile.layerAssignMs = performance.now() - layerAssignStart
    profile.prepMs = performance.now() - prepStart
    profile.commands = commands.length
    profile.dirtyBefore = dirtyBeforeFrame
  }

  // ── Step 5: beginSync → paint → endSync ──
  const beginSyncStart = s.debugCadence ? performance.now() : 0
  s.term.beginSync()
  if (profile) profile.beginSyncMs = performance.now() - beginSyncStart

  const paintStart = s.debugCadence ? performance.now() : 0
  const paintState: PaintFrameState = {
    viewportWidth: s.viewportWidth,
    viewportHeight: s.viewportHeight,
    transmissionMode: s.transmissionMode,
    useLayerCompositing: s.useLayerCompositing,
    forceLayerRepaint: s.forceLayerRepaint,
    expFrameBudgetMs: s.expFrameBudgetMs,
    debugCadence: s.debugCadence,
    debugDragRepro: s.debugDragRepro,
    layerStore: s.layerStore,
    layerCache: s.layerCache,
    activeSlotKeys: s.activeSlotKeys,
    frameDirtyRects: s.frameDirtyRects,
    pendingNodeDamageRects: s.pendingNodeDamageRects,
    nodeRefById: s.nodeRefById,

    backendOverride: s.backendOverride,
    interaction: s.interaction,
    debug: s.debug,
    profile,
  }
  const layerPlan = { bgSlot, contentSlots, slotBoundaryByKey, boundaries }
  const paintResult = _paintFrame(layerPlan, commands, cellW, cellH, paintState)
  s.pendingNodeDamageRects.length = 0

  // Write back interaction latency from paint state bag
  s.interaction.lastPresentedInteractionSeq.value = paintState.interaction.lastPresentedInteractionSeq.value
  s.interaction.lastPresentedInteractionLatencyMs.value = paintState.interaction.lastPresentedInteractionLatencyMs.value
  s.interaction.lastPresentedInteractionType.value = paintState.interaction.lastPresentedInteractionType.value

  // Override debug stats with coordinator-owned values (nodeCount, dirtyBefore)
  const resourceSummary = isDebugEnabled()
    ? summarizeRendererResourceStats()
    : { totalBytes: 0, gpuBytes: 0, cacheEntries: 0 }
  debugUpdateStats({
    commandCount: paintResult.commandCount,
    dirtyBeforeCount: dirtyBeforeFrame,
    layerCount: s.layerStore.layerCount(),
    moveOnlyCount: paintResult.moveOnlyCount,
    moveFallbackCount: paintResult.moveFallbackCount,
    stableReuseCount: paintResult.stableReuseCount,
    nodeCount: s.nodeCountValue.value,
    repaintedCount: paintResult.repaintedThisFrame,
    rendererStrategy: paintResult.frameResult?.strategy ?? null,
    rendererOutput: paintResult.rendererOutput,
    dirtyPixelArea: paintResult.frameCtx.dirtyPixelArea,
    totalPixelArea: paintResult.frameCtx.totalPixelArea,
    overlapPixelArea: paintResult.frameCtx.overlapPixelArea,
    overlapRatio: paintResult.frameCtx.overlapRatio,
    fullRepaint: paintResult.frameCtx.fullRepaint,
    transmissionMode: paintResult.frameCtx.transmissionMode,
    estimatedLayeredBytes: paintResult.frameCtx.estimatedLayeredBytes,
    estimatedFinalBytes: paintResult.frameCtx.estimatedFinalBytes,
    interactionLatencyMs: s.interaction.lastPresentedInteractionLatencyMs.value,
    interactionType: s.interaction.lastPresentedInteractionType.value,
    presentedInteractionSeq: s.interaction.lastPresentedInteractionSeq.value,
    resourceBytes: resourceSummary.totalBytes,
    gpuResourceBytes: resourceSummary.gpuBytes,
    resourceEntries: resourceSummary.cacheEntries,
    nativeFrameReasonFlags: paintResult.framePlan?.nativePlan?.reasonFlags ?? null,
  })

  if (profile) {
    const totalPaintMs = performance.now() - paintStart
    profile.ioMs = paintResult.ioMs
    profile.paintMs = Math.max(0, totalPaintMs - paintResult.ioMs)
  }

  const endSyncStart = s.debugCadence ? performance.now() : 0
  s.term.endSync()
  if (profile) {
    profile.endSyncMs = performance.now() - endSyncStart
    profile.repainted = paintResult.repaintedThisFrame
  }

  s.dirty.clearDirty(dirtyVersionAtFrameStart)
  resetFrameTracking()
}
