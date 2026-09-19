/**
 * composite.ts — Frame compositing orchestrator.
 *
 * Extracted from loop.ts as part of Phase 3 Slice 3.1.
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §Output+Coordinator
 *
 * Owns the full per-frame pipeline:
 *   1. Feed scroll + pointer state & check compositor-only fast path
 *   2. updateInteractiveStates
 *   3. calculateRoots → traverseFrame (single unified DFS layout & render pass)
 *   4. findLayerBoundaries + assignLayersSpatial
 *   5. beginSync → paintFrame → endSync + debug stats
 *
 * Exports:
 *   - CompositeFrameState — all dependencies the coordinator injects per frame
 *   - compositeFrame()    — renders one complete frame
 */

import type { Terminal } from "../terminal/index"
import type { RenderCommand } from "../ffi/render-graph"
import type { TGENode } from "../ffi/node"
import type { FrameProfile, LayerBoundary, LayerSlot, DirtyTrackingHandle, InteractionLatencyTracking } from "./types"
export type { FrameProfile } from "./types"
import {
  paintFrame as _paintFrame,
  type PaintFrameState,
} from "./paint"
import type { createVexartLayoutCtx } from "./layout-adapter"
import { resetFrameTracking } from "../animation/compositor-path"
import type { DamageRect } from "../ffi/damage"
import type { Layer, LayerStoreHandle } from "../ffi/layers"
import type { RendererBackend } from "../ffi/renderer-backend"
import { traverseFrame } from "./pipeline-traverse"
import type { LayerOpBucket } from "./pipeline-types"
import { isLayoutDirty, clearLayoutDirty } from "../reconciler/dirty"
import { routeScrollDeltas } from "./composite-scroll"
import { getEffectivePosition } from "../reconciler/hit-test"
import { createScrollHandle } from "./scroll"
import {
  bindLayerDirtyStore,
  unbindLayerDirtyStore,
  markLayerDirtyByKey,
  markLayerDamageByKey,
  updateInteractiveStates,
} from "./composite-damage"
import {
  type WalkCounters,
  createFrameProfile,
  buildWalkState,
  resetWalkAccumulators,
  syncVisualPropsToOps,
  tryCompositorOnlyFrame,
  assignSlotsFromBuckets,
  reportCompositeDebugStats,
} from "./composite-schedule"

export {
  bindLayerDirtyStore,
  unbindLayerDirtyStore,
  markLayerDirtyByKey,
  markLayerDamageByKey,
  createFrameProfile,
}

function syncEagerScrollOffsets(s: CompositeFrameState): void {
  if (s.scrollContainers.length === 0) return

  const localOffsets = new Map<number, { x: number; y: number }>()
  for (const container of s.scrollContainers) {
    const sid = container.props.scrollId ?? `tge-scroll-${container.id}`
    const handle = createScrollHandle(sid)
    const ox = container.props.scrollX ? handle.scrollX : 0
    const oy = container.props.scrollY ? handle.scrollY : 0
    localOffsets.set(container.id, { x: ox, y: oy })
  }

  const getCompounded = (container: TGENode): { x: number; y: number } => {
    const cached = s.scrollOffsets.get(container.id)
    if (cached) return cached
    const local = localOffsets.get(container.id) ?? { x: 0, y: 0 }
    let parent = container.parent
    let parentContainer: TGENode | null = null
    while (parent) {
      if (parent.props.scrollX || parent.props.scrollY) {
        parentContainer = parent
        break
      }
      parent = parent.parent
    }
    if (!parentContainer) {
      s.scrollOffsets.set(container.id, local)
      return local
    }
    const parentTotal = getCompounded(parentContainer)
    const total = { x: parentTotal.x + local.x, y: parentTotal.y + local.y }
    s.scrollOffsets.set(container.id, total)
    return total
  }

  s.scrollOffsets.clear()
  for (const container of s.scrollContainers) {
    getCompounded(container)
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
  transmissionMode: "direct" | "shm"

  // Debug flags
  debugCadence: boolean
  debugDragRepro: boolean

  // Interaction latency tracking (coordinator-owned scalars)
  interaction: InteractionLatencyTracking

  // Frame timing (mutable — updated at start of each frame for dt calculation)
  lastFrameTime: { value: number }

  debug?: unknown

  // Transform flag from pipeline-traverse
  hasAnyTransforms?: boolean

  // Cached layout/layer artifacts for layout-clean frame reuse
  lastLayerBuckets?: LayerOpBucket[]
  lastCommands?: RenderCommand[]
  lastBoundaries?: LayerBoundary[]
  lastBgSlot?: LayerSlot
  lastContentSlots?: LayerSlot[]
  lastSlotBoundaryByKey?: Map<string, LayerBoundary>
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
  syncEagerScrollOffsets(s)
  if (profile) profile.scrollMs = performance.now() - scrollStart

  // Compositor fast path
  if (tryCompositorOnlyFrame(s, profile, dirtyVersionAtFrameStart, dirtyBeforeFrame)) {
    return
  }

  // ── Step 2: Update interactive states ──
  const interactionStart = profile ? performance.now() : 0
  const { hadClick, changed, layoutChanged } = updateInteractiveStates(s)
  if (profile) profile.interactionMs = performance.now() - interactionStart
  const dirtyVersionForFrame = s.dirty.dirtyVersion()

  // ── Step 3: Walk tree & Flexily layout pass ──
  const layoutStart = profile || s.debugCadence ? performance.now() : 0
  const isStateLayoutDirty = typeof (s.dirty as any).isLayoutDirty === "function"
    ? (s.dirty as any).isLayoutDirty()
    : isLayoutDirty()
  const layoutDirty = (s.lastLayerBuckets === undefined)
    || (s.root._flexNode?.isDirty?.() ?? false)
    || isStateLayoutDirty
    || layoutChanged
    || s.forceLayerRepaint

  let layerBuckets: LayerOpBucket[] | null = null
  let boundaries: LayerBoundary[] = []
  let bgSlot: LayerSlot
  let contentSlots: LayerSlot[]
  let slotBoundaryByKey: Map<string, LayerBoundary>

  if (!layoutDirty && s.lastLayerBuckets) {
    layerBuckets = s.lastLayerBuckets
    syncVisualPropsToOps(layerBuckets, s.nodeRefById)
    boundaries = s.lastBoundaries ?? []
    bgSlot = s.lastBgSlot!
    contentSlots = s.lastContentSlots ?? []
    slotBoundaryByKey = s.lastSlotBoundaryByKey ?? new Map()
    if (profile) {
      profile.walkTreeMs = 0
      profile.layoutComputeMs = 0
      profile.layoutWritebackMs = 0
      profile.layoutMs = performance.now() - layoutStart
      profile.layerAssignMs = 0
      profile.commands = layerBuckets.reduce((sum, b) => sum + b.ops.length, 0)
      profile.dirtyBefore = dirtyBeforeFrame
    }
  } else {
    resetWalkAccumulators(s)
    s.layoutAdapter.beginLayout()
    if (profile) profile.walkTreeMs = 0
    const layoutComputeStart = profile ? performance.now() : 0
    s.layoutAdapter.calculateRoots(s.root._flexNode)
    if (profile) profile.layoutComputeMs = performance.now() - layoutComputeStart
    const layoutError = s.layoutAdapter.getLastLayoutError()
    if (layoutError) {
      if (profile) profile.layoutMs = performance.now() - layoutStart
      return
    }

    // Single unified DFS traversal pass
    const layoutWritebackStart = profile ? performance.now() : 0
    const walkState = buildWalkState(s)
    const traversalResult = traverseFrame(s.root, walkState, s.viewportWidth, s.viewportHeight, s.scrollOffsets)
    if (!traversalResult.success) {
      if (profile) profile.layoutMs = performance.now() - layoutStart
      return
    }
    s.walkCounters.scrollSpeedCap = walkState.scrollSpeedCap.value
    s.hasAnyTransforms = traversalResult.hasAnyTransforms

    // Mark damage on layers for any scrolled containers
    for (let i = 0; i < s.scrollContainers.length; i++) {
      const container = s.scrollContainers[i]
      const total = s.scrollOffsets.get(container.id)
      if (total && (total.x !== 0 || total.y !== 0)) {
        const layerKey = container._layerKey ?? "bg"
        const pos = getEffectivePosition(container, s.scrollOffsets)
        const containerRect: DamageRect = {
          x: Math.round(pos.x),
          y: Math.round(pos.y),
          width: Math.round(container.layout.width),
          height: Math.round(container.layout.height),
        }
        markLayerDamageByKey(layerKey, containerRect)
      }
    }

    if (profile) profile.layoutWritebackMs = performance.now() - layoutWritebackStart
    if (profile) profile.layoutMs = performance.now() - layoutStart

    // Step 4: Clear layout dirty flags
    clearLayoutDirty()
    if (typeof (s.dirty as any).clearLayoutDirty === "function") {
      (s.dirty as any).clearLayoutDirty()
    }

    layerBuckets = traversalResult.layerBuckets
    s.lastLayerBuckets = layerBuckets

    const totalOps = layerBuckets.reduce((sum, b) => sum + b.ops.length, 0)
    if (totalOps === 0) {
      s.dirty.clearDirty(dirtyVersionForFrame)
      return
    }

    const prepStart = s.debugCadence ? performance.now() : 0
    const layerAssignStart = profile ? performance.now() : 0

    // ── Step 4: Layer boundary + slot assignment ──
    const assigned = assignSlotsFromBuckets(
      layerBuckets,
      s.layerBoundaries,
      s.nodeRefById,
      s.forceLayerRepaint,
    )
    boundaries = assigned.boundaries
    bgSlot = assigned.bgSlot
    contentSlots = assigned.contentSlots
    slotBoundaryByKey = assigned.slotBoundaryByKey

    const flatCommands = assigned.flatCommands
    s.lastCommands = flatCommands
    s.lastBoundaries = boundaries
    s.lastBgSlot = bgSlot
    s.lastContentSlots = contentSlots
    s.lastSlotBoundaryByKey = slotBoundaryByKey

    if (profile) {
      profile.layerAssignMs = performance.now() - layerAssignStart
      profile.prepMs = performance.now() - prepStart
      profile.commands = totalOps
      profile.dirtyBefore = dirtyBeforeFrame
    }
  }

  const cellW = s.term.size.cellWidth || 8
  const cellH = s.term.size.cellHeight || 16

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
    suppressNativeLayerDeletes: s.term.caps.tmux && s.term.caps.kittyPlaceholder,
    frameDirtyRects: s.frameDirtyRects,
    pendingNodeDamageRects: s.pendingNodeDamageRects,
    nodeRefById: s.nodeRefById,

    backendOverride: s.backendOverride,
    interaction: s.interaction,
    profile,
    layerBuckets: layerBuckets ?? undefined,
  }
  const layerPlan = { bgSlot, contentSlots, slotBoundaryByKey, boundaries }
  const paintResult = _paintFrame(layerPlan, s.lastCommands ?? [], cellW, cellH, paintState, layerBuckets ?? undefined)
  s.pendingNodeDamageRects.length = 0

  // Write back interaction latency from paint state bag
  s.interaction.lastPresentedInteractionSeq.value = paintState.interaction.lastPresentedInteractionSeq.value
  s.interaction.lastPresentedInteractionLatencyMs.value = paintState.interaction.lastPresentedInteractionLatencyMs.value
  s.interaction.lastPresentedInteractionType.value = paintState.interaction.lastPresentedInteractionType.value

  // Override debug stats with coordinator-owned values (nodeCount, dirtyBefore)
  reportCompositeDebugStats(s, paintResult, dirtyBeforeFrame)

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

  s.dirty.clearDirty(dirtyVersionForFrame)
  resetFrameTracking()
}
