/**
 * composite.ts — Frame compositing orchestrator.
 *
 * Extracted from loop.ts as part of Phase 3 Slice 3.1.
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §Output+Coordinator
 *
 * Owns the full per-frame pipeline:
 *   1. Feed pointer/scroll to Clay
 *   2. walkTree → Clay → endLayout
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
import { resetRenderGraphQueues } from "../ffi/render-graph"
import type { TextMeta } from "../ffi/render-graph"
import type { TGENode } from "../ffi/node"
import { debugFrameStart, debugUpdateStats } from "./debug"
import {
  writeLayoutBack as _writeLayoutBack,
  updateInteractiveStates as _updateInteractiveStates,
  type InteractiveStatesBag,
} from "./layout"
import {
  findLayerBoundaries as _findLayerBoundaries,
  assignLayersSpatial as _assignLayersSpatial,
  type AssignLayersState,
} from "./assign-layers"
import type { LayerBoundary, LayerSlot } from "./types"
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
import type { DamageRect } from "../ffi/damage"
import type { Layer } from "../ffi/layers"
import type { RendererBackend } from "../ffi/renderer-backend"
import type { GpuFrameComposer } from "../output/gpu-frame-composer"

// ── Types ─────────────────────────────────────────────────────────────────

/** Mutable scalar counters for walk state writeback. */
type WalkCounters = {
  scrollIdCounter: number
  textMeasureIndex: number
  scrollSpeedCap: number
}

/** Per-frame profiling data (only populated when DEBUG_CADENCE=1). */
export type FrameProfile = {
  scheduledIntervalMs: number
  scheduledDelayMs: number
  timerDelayMs: number
  sincePrevFrameMs: number
  layoutMs: number
  prepMs: number
  paintMs: number
  beginSyncMs: number
  ioMs: number
  endSyncMs: number
  totalMs: number
  commands: number
  repainted: number
  dirtyBefore: number
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

  // Clay layout adapter
  clay: ReturnType<typeof createVexartLayoutCtx>

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

  // Post-scroll hooks (fire after Clay scroll update, before walkTree)
  postScrollCallbacks: (() => void)[]

  // Walk counters — read at start, written back at end
  walkCounters: WalkCounters

  // Accumulator arrays — cleared before each walk
  rectNodes: TGENode[]
  textNodes: TGENode[]
  boxNodes: TGENode[]
  textMetas: TextMeta[]
  textMetaMap: Map<string, TextMeta>
  rectNodeById: Map<number, TGENode>
  nodePathById: Map<number, string>
  nodeRefById: Map<number, TGENode>

  // Render graph queues
  renderGraphQueues: ReturnType<typeof import("../ffi/render-graph").createRenderGraphQueues>

  // Layer cache + dirty rects
  layerCache: Map<string, Layer>
  activeSlotKeys: Set<string>
  frameDirtyRects: DamageRect[]

  // Layer store methods (coordinator owns the store)
  getOrCreateLayer: (key: string, z: number) => Layer
  getPreviousLayerRect: (layer: Layer) => DamageRect | null
  updateLayerGeometry: (layer: Layer, x: number, y: number, w: number, h: number, opts: { moveOnly: boolean }) => void
  markLayerDamaged: (layer: Layer, rect: DamageRect) => void
  markLayerClean: (layer: Layer) => void
  imageIdForLayer: (layer: Layer) => number
  removeLayer: (layer: Layer) => void
  layerCount: () => number

  // Dirty tracking
  markDirty: () => void
  markAllDirty: () => void
  clearDirty: () => void
  dirtyCount: () => number

  // Layer composer (Kitty output)
  layerComposer: GpuFrameComposer | null

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
  lastPresentedInteractionSeq: { value: number }
  lastPresentedInteractionLatencyMs: { value: number }
  lastPresentedInteractionType: { value: string | null }

  // Node count (for debug stats)
  nodeCount: () => number

  // Frame timing (mutable — updated at start of each frame for dt calculation)
  lastFrameTime: { value: number }

  // Log helpers
  log: (msg: string) => void
  renderDebug: (msg: string) => void
  dragReproDebug: (msg: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────

function buildWalkState(s: CompositeFrameState): WalkTreeState {
  return {
    scrollIdCounter: { value: s.walkCounters.scrollIdCounter },
    textMeasureIndex: { value: s.walkCounters.textMeasureIndex },
    scrollSpeedCap: { value: s.walkCounters.scrollSpeedCap },
    rectNodes: s.rectNodes,
    textNodes: s.textNodes,
    boxNodes: s.boxNodes,
    textMetas: s.textMetas,
    nodePathById: s.nodePathById,
    nodeRefById: s.nodeRefById,
    effectsQueue: s.renderGraphQueues.effects,
    imageQueue: s.renderGraphQueues.images,
    canvasQueue: s.renderGraphQueues.canvases,
    textMetaMap: s.textMetaMap,
    rectNodeById: s.rectNodeById,
    clay: s.clay,
  }
}

function walkTreeOnce(s: CompositeFrameState) {
  const state = buildWalkState(s)
  _walkTree(s.root, state)
  s.walkCounters.scrollIdCounter = state.scrollIdCounter.value
  s.walkCounters.textMeasureIndex = state.textMeasureIndex.value
  s.walkCounters.scrollSpeedCap = state.scrollSpeedCap.value
}

function resetWalkAccumulators(s: CompositeFrameState) {
  s.walkCounters.scrollSpeedCap = 0
  resetRenderGraphQueues(s.renderGraphQueues)
  s.walkCounters.textMeasureIndex = 0
  s.textMetas.length = 0
  s.textMetaMap.clear()
  s.clay.resetTextMeasures()
  s.rectNodes.length = 0
  s.rectNodeById.clear()
  s.textNodes.length = 0
  s.boxNodes.length = 0
}

function writeLayoutBack(commands: RenderCommand[], s: CompositeFrameState) {
  _writeLayoutBack(commands, s.clay.getLastLayoutMap(), {
    rectNodes: s.rectNodes,
    textNodes: s.textNodes,
    boxNodes: s.boxNodes,
  })
}

function updateInteractiveStates(s: CompositeFrameState): boolean {
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
    onChanged: () => { s.markDirty(); s.markAllDirty() },
  }
  const hadClick = _updateInteractiveStates(bag)
  // Write back mutable fields
  s.pointer.pendingPress = bag.pendingPress
  s.pointer.pendingRelease = bag.pendingRelease
  s.pointer.pressOriginSet = bag.pressOriginSet
  s.pointer.prevActiveNode = bag.prevActiveNode
  s.pointer.capturedNodeId = bag.capturedNodeId
  s.pointer.dirty = bag.pointerDirty
  return hadClick
}

// ── compositeFrame ────────────────────────────────────────────────────────

/**
 * Render one complete frame through the full pipeline.
 *
 * Called by the coordinator's frame() each tick.
 * Returns early (without clearing dirty) if Clay emits no commands.
 */
export function compositeFrame(s: CompositeFrameState, profile?: FrameProfile) {
  const dirtyBeforeFrame = s.dirtyCount()
  const layoutStart = s.debugCadence ? performance.now() : 0

  // ── Step 1: Feed scroll + pointer to Clay ──
  const now = Date.now()
  const dt = Math.min((now - s.lastFrameTime.value) / 1000, 0.1)
  s.lastFrameTime.value = now

  s.clay.setPointer(s.pointer.x, s.pointer.y, s.pointer.down)

  let sdx = s.scroll.x
  let sdy = s.scroll.y
  if (s.walkCounters.scrollSpeedCap > 0 && (sdx !== 0 || sdy !== 0)) {
    const cellH = s.term.size.cellHeight || 16
    const maxDelta = s.walkCounters.scrollSpeedCap * cellH
    sdx = Math.max(-maxDelta, Math.min(maxDelta, sdx))
    sdy = Math.max(-maxDelta, Math.min(maxDelta, sdy))
  }
  s.clay.updateScroll(sdx, sdy, dt)
  s.scroll.x = 0
  s.scroll.y = 0
  s.walkCounters.scrollIdCounter = 0

  // Post-scroll hooks
  for (const cb of s.postScrollCallbacks) cb()

  // ── Step 2: Walk tree → Clay layout ──
  resetWalkAccumulators(s)
  s.clay.beginLayout()
  walkTreeOnce(s)
  let commands = s.clay.endLayout()

  // ── Step 3: Write layout back + interaction states ──
  writeLayoutBack(commands, s)
  const hadClick = updateInteractiveStates(s)

  // Re-layout on click for instant visual feedback (same frame)
  if (hadClick) {
    resetWalkAccumulators(s)
    s.clay.beginLayout()
    walkTreeOnce(s)
    commands = s.clay.endLayout()
    writeLayoutBack(commands, s)
  }

  if (profile) profile.layoutMs = performance.now() - layoutStart

  if (commands.length === 0) {
    s.clearDirty()
    return
  }

  const prepStart = s.debugCadence ? performance.now() : 0

  // ── Step 4: Layer boundary + slot assignment ──
  const nextZCounter = { value: 0 }
  const boundaries: LayerBoundary[] = []
  _findLayerBoundaries(s.root, "r", boundaries, nextZCounter)
  const assignState: AssignLayersState = { root: s.root, collectText }
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

  s.log(`[frame] cmds=${commands.length} layers=${1 + contentSlots.length} slots=[${[bgSlot, ...contentSlots].map(sl => `${sl.key}(${sl.cmdIndices.length})`).join(',')}]`)
  s.renderDebug(`[frame:start] cmds=${commands.length} layers=${1 + contentSlots.length}`)

  if (profile) {
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
    getOrCreateLayer: s.getOrCreateLayer,
    getPreviousLayerRect: s.getPreviousLayerRect,
    updateLayerGeometry: s.updateLayerGeometry,
    markLayerDamaged: s.markLayerDamaged,
    markLayerClean: s.markLayerClean,
    imageIdForLayer: s.imageIdForLayer,
    removeLayer: s.removeLayer,
    layerCount: s.layerCount,
    layerCache: s.layerCache,
    activeSlotKeys: s.activeSlotKeys,
    frameDirtyRects: s.frameDirtyRects,
    root: s.root,
    renderGraphQueues: s.renderGraphQueues,
    textMetaMap: s.textMetaMap,
    rectNodes: s.rectNodes,
    textNodes: s.textNodes,
    layerComposer: s.layerComposer,
    backendOverride: s.backendOverride,
    lastPresentedInteractionSeq: s.lastPresentedInteractionSeq,
    lastPresentedInteractionLatencyMs: s.lastPresentedInteractionLatencyMs,
    lastPresentedInteractionType: s.lastPresentedInteractionType,
    log: s.log,
    renderDebug: s.renderDebug,
    dragReproDebug: s.dragReproDebug,
  }
  const layerPlan = { bgSlot, contentSlots, slotBoundaryByKey, boundaries }
  const paintResult = _paintFrame(layerPlan, commands, cellW, cellH, paintState)

  // Write back interaction latency from paint state bag
  s.lastPresentedInteractionSeq.value = paintState.lastPresentedInteractionSeq.value
  s.lastPresentedInteractionLatencyMs.value = paintState.lastPresentedInteractionLatencyMs.value
  s.lastPresentedInteractionType.value = paintState.lastPresentedInteractionType.value

  // Override debug stats with coordinator-owned values (nodeCount, dirtyBefore)
  const resourceSummary = summarizeRendererResourceStats()
  debugUpdateStats({
    commandCount: paintResult.commandCount,
    dirtyBeforeCount: dirtyBeforeFrame,
    layerCount: s.layerCount(),
    moveOnlyCount: paintResult.moveOnlyCount,
    moveFallbackCount: paintResult.moveFallbackCount,
    stableReuseCount: paintResult.stableReuseCount,
    nodeCount: s.nodeCount(),
    repaintedCount: paintResult.repaintedThisFrame,
    rendererStrategy: paintResult.frameResult?.strategy ?? null,
    rendererOutput: paintResult.rendererOutput,
    transmissionMode: paintResult.frameCtx.transmissionMode,
    estimatedLayeredBytes: paintResult.frameCtx.estimatedLayeredBytes,
    estimatedFinalBytes: paintResult.frameCtx.estimatedFinalBytes,
    interactionLatencyMs: s.lastPresentedInteractionLatencyMs.value,
    interactionType: s.lastPresentedInteractionType.value,
    presentedInteractionSeq: s.lastPresentedInteractionSeq.value,
    resourceBytes: resourceSummary.totalBytes,
    gpuResourceBytes: resourceSummary.gpuBytes,
    resourceEntries: resourceSummary.cacheEntries,
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

  s.clearDirty()
}
