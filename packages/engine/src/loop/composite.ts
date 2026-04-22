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
import { resetRenderGraphQueues, CMD } from "../ffi/render-graph"
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
import { createScrollHandle, updateScrollContainerGeometry } from "./scroll"

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

/**
 * After layout writeback, apply TS-side scroll offsets to:
 *   1. Render commands (so GPU renderer draws at scrolled positions)
 *   2. Node layout rects (so hit-testing uses scrolled positions)
 *
 * Also updates scroll container geometry (viewport + content extents) in scroll.ts
 * so that clamping works correctly.
 *
 * SCISSOR commands are excluded from offset adjustment — they always reflect
 * the scroll container's viewport bounds (not the scrolled content position).
 */
function applyScrollOffsets(commands: RenderCommand[], s: CompositeFrameState) {
  const layoutMap = s.clay.getLastLayoutMap()

  for (const node of s.boxNodes) {
    if (!node.props.scrollX && !node.props.scrollY) continue

    // Determine stable scroll id (must match what walkTree used)
    const sid = node.props.scrollId ?? `tge-scroll-${node.id}`
    const handle = createScrollHandle(sid)

    // Step 4: Update scroll geometry from layout output.
    // The PositionedCommand gives us content extents via contentW/contentH.
    if (layoutMap) {
      const pos = layoutMap.get(BigInt(node.id))
      if (pos) {
        // Viewport is the node's own layout size; content is the child extent
        const vpW = pos.width
        const vpH = pos.height
        // contentW/contentH from Taffy is the total child extent
        const ctW = pos.contentW > 0 ? pos.contentW : vpW
        const ctH = pos.contentH > 0 ? pos.contentH : vpH
        updateScrollContainerGeometry(sid, vpW, vpH, ctW, ctH)
      }
    }

    const ox = node.props.scrollX ? handle.scrollX : 0
    const oy = node.props.scrollY ? handle.scrollY : 0
    if (ox === 0 && oy === 0) continue

    // Collect all descendant node IDs for command offset (skip nested scroll containers)
    const descendantIds = new Set<number>()
    collectDescendantIds(node, descendantIds)

    // Offset render commands for descendants (not SCISSOR commands — they use viewport coords)
    for (const cmd of commands) {
      if (cmd.type === CMD.SCISSOR_START || cmd.type === CMD.SCISSOR_END) continue
      // Find which node owns this command by matching position against descendants
      // We offset ALL non-scissor commands that belong to scroll descendants.
      // Since we know the set of descendant node IDs, we match via the layoutMap.
      // This is a best-effort O(n) scan — acceptable for scroll containers.
      // NOTE: Commands don't carry nodeId directly, so we offset by position match.
      // We compare the command position against the pre-offset layout positions.
      // The descendant node layouts haven't been scrolled yet (this runs before
      // applyOffsetToDescendants), so cmd.x/y matches their raw layout.x/y.
      if (isCommandForDescendant(cmd, descendantIds, layoutMap)) {
        cmd.x += ox
        cmd.y += oy
      }
    }

    // Offset all descendant node layout rects for hit-testing
    applyOffsetToDescendants(node, ox, oy)
  }
}

/** Collect nodeIds of all descendants, stopping at nested scroll containers. */
function collectDescendantIds(container: TGENode, ids: Set<number>) {
  for (const child of container.children) {
    ids.add(child.id)
    if (!child.props.scrollX && !child.props.scrollY) {
      collectDescendantIds(child, ids)
    }
  }
}

/**
 * Check if a command corresponds to a descendant node.
 * Since commands don't have nodeId attached, we match by layout position.
 */
function isCommandForDescendant(
  cmd: RenderCommand,
  descendantIds: Set<number>,
  layoutMap: Map<bigint, import("../ffi/layout-writeback").PositionedCommand> | null,
): boolean {
  if (!layoutMap) return false
  for (const id of descendantIds) {
    const pos = layoutMap.get(BigInt(id))
    if (!pos) continue
    // Match by exact position (commands use exact layoutMap values before offset)
    if (Math.abs(pos.x - cmd.x) < 0.5 && Math.abs(pos.y - cmd.y) < 0.5 &&
        Math.abs(pos.width - cmd.width) < 0.5 && Math.abs(pos.height - cmd.height) < 0.5) {
      return true
    }
  }
  return false
}

function applyOffsetToDescendants(container: TGENode, ox: number, oy: number) {
  for (const child of container.children) {
    child.layout.x += ox
    child.layout.y += oy
    // Recurse into children that are NOT themselves scroll containers
    // (nested scroll containers will apply their own offset separately)
    if (!child.props.scrollX && !child.props.scrollY) {
      applyOffsetToDescendants(child, ox, oy)
    }
  }
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
  // Route scroll deltas to TS-side scroll state.
  // Find the innermost scroll container whose layout bounds contain the pointer,
  // using previous-frame node layout for hit detection.
  if (sdx !== 0 || sdy !== 0) {
    let scrollTarget: TGENode | null = null
    const px = s.pointer.x
    const py = s.pointer.y
    for (const node of s.boxNodes) {
      if (!node.props.scrollX && !node.props.scrollY) continue
      const l = node.layout
      if (l.width <= 0 || l.height <= 0) continue
      if (px >= l.x && px < l.x + l.width && py >= l.y && py < l.y + l.height) {
        // Pick innermost: replace if this node is a descendant of current target
        if (!scrollTarget) {
          scrollTarget = node
        } else {
          // Check if node is inside scrollTarget
          let p = node.parent
          while (p) {
            if (p === scrollTarget) { scrollTarget = node; break }
            p = p.parent
          }
        }
      }
    }
    if (scrollTarget) {
      const sid = scrollTarget.props.scrollId ?? `tge-scroll-${scrollTarget.id}`
      const handle = createScrollHandle(sid)
      if (scrollTarget.props.scrollY && sdy !== 0) handle.scrollBy(-sdy)
      if (scrollTarget.props.scrollX && sdx !== 0) handle.scrollBy(-sdx)
    }
  }
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
  applyScrollOffsets(commands, s)
  const hadClick = updateInteractiveStates(s)

  // Re-layout on click for instant visual feedback (same frame)
  if (hadClick) {
    resetWalkAccumulators(s)
    s.clay.beginLayout()
    walkTreeOnce(s)
    commands = s.clay.endLayout()
    writeLayoutBack(commands, s)
    applyScrollOffsets(commands, s)
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
