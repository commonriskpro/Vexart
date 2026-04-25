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
import { resetRenderGraphQueues, CMD } from "../ffi/render-graph"
import type { TextMeta } from "../ffi/render-graph"
import { resolveProps, type TGENode } from "../ffi/node"
import { fromConfig, isIdentity, multiply, transformPoint, translate } from "../ffi/matrix"
import { debugFrameStart, debugUpdateStats, isDebugEnabled } from "./debug"
import {
  writeLayoutBack as _writeLayoutBack,
  updateCommandsToLayoutMap as _updateCommandsToLayoutMap,
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
import { hasCompositorAnimations, isCompositorOnlyFrame, resetFrameTracking } from "../animation/compositor-path"
import type { DamageRect } from "../ffi/damage"
import type { Layer } from "../ffi/layers"
import type { RendererBackend } from "../ffi/renderer-backend"
import type { GpuFrameComposer } from "../output/gpu-frame-composer"
import { createScrollHandle, updateScrollContainerGeometry } from "./scroll"
import { nativeSceneComputeLayout } from "../ffi/native-scene"
import type { PositionedCommand } from "../ffi/layout-writeback"
import { DIRTY_KIND, type DirtyScope } from "../reconciler/dirty"

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

  // Layout adapter (Taffy-backed, drop-in replacement for the legacy Clay object)
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

  // Post-scroll hooks (fire after Clay scroll update, before walkTree)
  postScrollCallbacks: (() => void)[]

  // Walk counters — read at start, written back at end
  walkCounters: WalkCounters

  // Accumulator arrays — cleared before each walk
  rectNodes: TGENode[]
  textNodes: TGENode[]
  boxNodes: TGENode[]
  textMetas: TextMeta[]
  textMetaMap: Map<number, TextMeta>
  rectNodeById: Map<number, TGENode>
  nodePathById: Map<number, string>
  nodeRefById: Map<number, TGENode>

  // Render graph queues
  renderGraphQueues: ReturnType<typeof import("../ffi/render-graph").createRenderGraphQueues>

  // Layer cache + dirty rects
  layerCache: Map<string, Layer>
  activeSlotKeys: Set<string>
  frameDirtyRects: DamageRect[]
  pendingNodeDamageRects: Array<{ nodeId: number; rect: DamageRect }>

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
  markDirty: (scope?: DirtyScope) => void
  markAllDirty: () => void
  clearDirty: (expectedVersion?: number) => void
  dirtyVersion: () => number
  dirtyCount: () => number

  // Layer composer (Kitty output)
  layerComposer: GpuFrameComposer | null

  // Renderer backend
  backendOverride?: RendererBackend

  // Frame config flags
  useLayerCompositing: boolean
  forceLayerRepaint: boolean
  useNativePressDispatch: boolean
  useNativeSceneLayout: boolean
  useNativeRenderGraph: boolean
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
    clay: s.layoutAdapter,
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
  s.rectNodes.length = 0
  s.rectNodeById.clear()
  s.textNodes.length = 0
  s.boxNodes.length = 0
}

function writeLayoutBack(s: CompositeFrameState) {
  const layoutMap = s.useNativeSceneLayout
    ? nativeSceneComputeLayout()
    : s.layoutAdapter.getLastLayoutMap()
  const nodeLayoutMap = s.useNativeSceneLayout
    ? mapNativeLayoutToNodeIds(layoutMap, s)
    : layoutMap
  _writeLayoutBack(nodeLayoutMap, {
    rectNodes: s.rectNodes,
    textNodes: s.textNodes,
    boxNodes: s.boxNodes,
    pendingNodeDamageRects: s.pendingNodeDamageRects,
    syncNativeLayout: !s.useNativeSceneLayout,
  })
  return nodeLayoutMap
}

function mapNativeLayoutToNodeIds(layoutMap: Map<bigint, PositionedCommand> | null, s: CompositeFrameState) {
  if (!layoutMap || layoutMap.size === 0) return layoutMap
  const mapped = new Map<bigint, PositionedCommand>()
  const nodes = [...s.boxNodes, ...s.textNodes]
  for (const node of nodes) {
    const pos = (node._nativeId ? layoutMap.get(node._nativeId) : undefined)
      ?? layoutMap.get(BigInt(node.id))
    if (!pos) continue
    mapped.set(BigInt(node.id), { ...pos, nodeId: BigInt(node.id) })
  }
  return mapped
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
  for (const node of s.boxNodes) {
    if (!node.props.scrollX && !node.props.scrollY) continue

    // Determine stable scroll id (must match what walkTree used)
    const sid = node.props.scrollId ?? `tge-scroll-${node.id}`
    const handle = createScrollHandle(sid)

    // Step 4: Update scroll geometry from layout output.
    // Viewport = the scroll container's own layout size.
    // Content = the total extent of all children (computed from their layouts).
    // The PositionedCommand's contentW/contentH is the container's content-box
    // (size minus padding), NOT the total child extent. We compute the real
    // content extent by walking children and finding the maximum bottom/right edge.
    const vpW = node.layout.width
    const vpH = node.layout.height
    let maxChildBottom = 0
    let maxChildRight = 0
    for (const child of node.children) {
      if (child.kind === "text") continue
      const cb = child.layout.y - node.layout.y + child.layout.height
      const cr = child.layout.x - node.layout.x + child.layout.width
      if (cb > maxChildBottom) maxChildBottom = cb
      if (cr > maxChildRight) maxChildRight = cr
    }
    const ctW = Math.max(maxChildRight, vpW)
    const ctH = Math.max(maxChildBottom, vpH)
    updateScrollContainerGeometry(sid, vpW, vpH, ctW, ctH)

    const ox = node.props.scrollX ? handle.scrollX : 0
    const oy = node.props.scrollY ? handle.scrollY : 0
    if (ox === 0 && oy === 0) continue

    // Collect all descendant node IDs for command offset (skip nested scroll containers)
    const descendantIds = new Set<number>()
    collectDescendantIds(node, descendantIds)

    // Offset render commands for descendants (not SCISSOR commands — they use viewport coords)
    for (const cmd of commands) {
      if (cmd.type === CMD.SCISSOR_START || cmd.type === CMD.SCISSOR_END) continue
      // Match by nodeId ancestry: check if the command belongs to a descendant node.
      // cmd.nodeId is set by layout-adapter.endLayout() for every RECT and TEXT command.
      // This is reliable — it doesn't depend on positional overlap heuristics.
      if (cmd.nodeId !== undefined && descendantIds.has(cmd.nodeId)) {
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

function resolveNodeById(root: TGENode, id: number): TGENode | null {
  if (root.id === id) return root
  if (root.kind === "text") return null
  for (const child of root.children) {
    const resolved = resolveNodeById(child, id)
    if (resolved) return resolved
  }
  return null
}

function computeNodeLocalTransform(node: TGENode) {
  const vp = resolveProps(node)
  if (!vp.transform) return null
  const l = node.layout
  const originProp = vp.transformOrigin
  let ox = l.width / 2
  let oy = l.height / 2
  if (originProp === "top-left") { ox = 0; oy = 0 }
  else if (originProp === "top-right") { ox = l.width; oy = 0 }
  else if (originProp === "bottom-left") { ox = 0; oy = l.height }
  else if (originProp === "bottom-right") { ox = l.width; oy = l.height }
  else if (originProp && typeof originProp === "object") { ox = originProp.x * l.width; oy = originProp.y * l.height }
  const matrix = fromConfig(vp.transform, ox, oy)
  return isIdentity(matrix) ? null : matrix
}

function computeNodeSubtreeTransformQuad(node: TGENode) {
  const chain: TGENode[] = []
  let current: TGENode | null = node
  while (current) {
    const matrix = computeNodeLocalTransform(current)
    if (matrix) chain.push(current)
    current = current.parent
  }
  if (chain.length === 0) return null
  chain.reverse()

  const transformAbsolutePoint = (x: number, y: number) => {
    let point = { x, y }
    for (const target of chain) {
      const matrix = computeNodeLocalTransform(target)
      if (!matrix) continue
      const l = target.layout
      const absolute = multiply(multiply(translate(l.x, l.y), matrix), translate(-l.x, -l.y))
      point = transformPoint(absolute, point.x, point.y)
    }
    return point
  }

  const x = node.layout.x
  const y = node.layout.y
  const w = node.layout.width
  const h = node.layout.height
  return {
    p0: transformAbsolutePoint(x, y),
    p1: transformAbsolutePoint(x + w, y),
    p2: transformAbsolutePoint(x, y + h),
    p3: transformAbsolutePoint(x + w, y + h),
  }
}

function buildRetainedCompositorLayers(s: CompositeFrameState) {
  const layers: import("../ffi/renderer-backend").RendererBackendRetainedLayer[] = []
  for (const [key, layer] of s.layerCache) {
    const bounds = { x: layer.x, y: layer.y, width: layer.width, height: layer.height }
    if (key === "bg") {
      layers.push({ key, z: layer.z, bounds, subtreeTransform: null, isBackground: true, opacity: 1 })
      continue
    }
    if (!key.startsWith("layer:")) continue
    const nodeId = Number(key.slice(6))
    const node = s.nodeRefById.get(nodeId) ?? resolveNodeById(s.root, nodeId)
    const vp = node ? resolveProps(node) : null
    layers.push({
      key,
      z: layer.z,
      bounds,
      subtreeTransform: node ? computeNodeSubtreeTransformQuad(node) : null,
      isBackground: false,
      opacity: typeof vp?.opacity === "number" ? vp.opacity : 1,
    })
  }
  layers.sort((a, b) => a.z - b.z)
  return layers
}

function updateInteractiveStates(s: CompositeFrameState): { hadClick: boolean; changed: boolean } {
  let changed = false
  const visualNodeIds = new Set<number>()
  const queueNodeVisualDamage = (node: TGENode) => {
    visualNodeIds.add(node.id)
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
    onChanged: () => {
      changed = true
      if (visualNodeIds.size === 0) {
        s.markDirty()
        s.markAllDirty()
        return
      }
      for (const nodeId of visualNodeIds) s.markDirty({ kind: DIRTY_KIND.NODE_VISUAL, nodeId })
    },
    onNodeVisualChanged: queueNodeVisualDamage,
    useNativePressDispatch: s.useNativePressDispatch,
    useNativeInteractionDispatch: s.useNativePressDispatch,
  }
  const hadClick = _updateInteractiveStates(bag)
  // Write back mutable fields
  s.pointer.pendingPress = bag.pendingPress
  s.pointer.pendingRelease = bag.pendingRelease
  s.pointer.pressOriginSet = bag.pressOriginSet
  s.pointer.prevActiveNode = bag.prevActiveNode
  s.pointer.capturedNodeId = bag.capturedNodeId
  s.pointer.dirty = bag.pointerDirty
  return { hadClick, changed }
}

// ── compositeFrame ────────────────────────────────────────────────────────

/**
 * Render one complete frame through the full pipeline.
 *
 * Called by the coordinator's frame() each tick.
 * Returns early (without clearing dirty) if Clay emits no commands.
 */
export function compositeFrame(s: CompositeFrameState, profile?: FrameProfile) {
  const dirtyVersionAtFrameStart = s.dirtyVersion()
  const dirtyBeforeFrame = s.dirtyCount()
  const layoutStart = s.debugCadence ? performance.now() : 0
  const scrollStart = profile ? performance.now() : 0

  // ── Step 1: Feed scroll + pointer to Clay ──
  const now = Date.now()
  const dt = Math.min((now - s.lastFrameTime.value) / 1000, 0.1)
  s.lastFrameTime.value = now

  // Note: pointer handling is done TS-side in updateInteractiveStates.
  // setPointer()/updateScroll() were Clay-era no-ops and have been removed.

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
        if (!scrollTarget) {
          scrollTarget = node
        } else {
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
      if (scrollTarget.props.scrollY && sdy !== 0) handle.scrollBy(sdy)
      if (scrollTarget.props.scrollX && sdx !== 0) handle.scrollBy(-sdx)
    }
  }
  s.scroll.x = 0
  s.scroll.y = 0
  s.walkCounters.scrollIdCounter = 0

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
    const retainedLayers = buildRetainedCompositorLayers(s)
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
      layerCount: s.layerCount(),
      moveOnlyCount: 0,
      moveFallbackCount: 0,
      stableReuseCount: retainedLayers.length,
      nodeCount: s.nodeCount(),
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
      interactionLatencyMs: s.lastPresentedInteractionLatencyMs.value,
      interactionType: s.lastPresentedInteractionType.value,
      presentedInteractionSeq: s.lastPresentedInteractionSeq.value,
      resourceBytes: resourceSummary.totalBytes,
      gpuResourceBytes: resourceSummary.gpuBytes,
      resourceEntries: resourceSummary.cacheEntries,
      nativeStats: frameResult?.output === "native-presented" ? (frameResult.stats ?? null) : null,
      nativeFrameReasonFlags: null,
    })
    resetFrameTracking()
    s.clearDirty(dirtyVersionAtFrameStart)
    return
  }

  // ── Step 2: Walk tree → Clay layout ──
  resetWalkAccumulators(s)
  s.pendingNodeDamageRects.length = 0
  s.layoutAdapter.beginLayout()
  const walkStart = profile ? performance.now() : 0
  walkTreeOnce(s)
  if (profile) profile.walkTreeMs = performance.now() - walkStart
  const layoutComputeStart = profile ? performance.now() : 0
  let commands = s.layoutAdapter.endLayout()
  if (profile) profile.layoutComputeMs = performance.now() - layoutComputeStart
  const layoutWritebackStart = profile ? performance.now() : 0
  let layoutMap = writeLayoutBack(s)
  if (s.useNativeSceneLayout) _updateCommandsToLayoutMap(commands, layoutMap)

  // ── Step 3: Write layout back + interaction states ──
  applyScrollOffsets(commands, s)
  if (profile) profile.layoutWritebackMs = performance.now() - layoutWritebackStart
  const interactionStart = profile ? performance.now() : 0
  const interaction = updateInteractiveStates(s)
  if (profile) profile.interactionMs = performance.now() - interactionStart

  // Re-layout on any interactive state change for instant visual feedback (same frame).
  // Hover/active/focus styles mutate node state after the first layout pass; if we only
  // relayout on click, that dirty mark gets cleared at frame end and visual state only
  // appears on an unrelated repaint (for example terminal resize).
  if (interaction.changed || interaction.hadClick) {
    const relayoutStart = profile ? performance.now() : 0
    resetWalkAccumulators(s)
    s.layoutAdapter.beginLayout()
    walkTreeOnce(s)
    commands = s.layoutAdapter.endLayout()
    layoutMap = writeLayoutBack(s)
    if (s.useNativeSceneLayout) _updateCommandsToLayoutMap(commands, layoutMap)
    applyScrollOffsets(commands, s)
    if (profile) profile.relayoutMs = performance.now() - relayoutStart
  }

  if (profile) profile.layoutMs = performance.now() - layoutStart

  if (commands.length === 0) {
    s.clearDirty(dirtyVersionAtFrameStart)
    return
  }

  const prepStart = s.debugCadence ? performance.now() : 0
  const layerAssignStart = profile ? performance.now() : 0

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
    useNativeRenderGraph: s.useNativeRenderGraph,
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
    pendingNodeDamageRects: s.pendingNodeDamageRects,
    root: s.root,
    renderGraphQueues: s.renderGraphQueues,
    textMetaMap: s.textMetaMap,
    layerComposer: s.layerComposer,
    backendOverride: s.backendOverride,
    lastPresentedInteractionSeq: s.lastPresentedInteractionSeq,
    lastPresentedInteractionLatencyMs: s.lastPresentedInteractionLatencyMs,
    lastPresentedInteractionType: s.lastPresentedInteractionType,
    log: s.log,
    renderDebug: s.renderDebug,
    dragReproDebug: s.dragReproDebug,
    profile,
  }
  const layerPlan = { bgSlot, contentSlots, slotBoundaryByKey, boundaries }
  const paintResult = _paintFrame(layerPlan, commands, cellW, cellH, paintState)

  // Write back interaction latency from paint state bag
  s.lastPresentedInteractionSeq.value = paintState.lastPresentedInteractionSeq.value
  s.lastPresentedInteractionLatencyMs.value = paintState.lastPresentedInteractionLatencyMs.value
  s.lastPresentedInteractionType.value = paintState.lastPresentedInteractionType.value

  // Override debug stats with coordinator-owned values (nodeCount, dirtyBefore)
  const resourceSummary = isDebugEnabled()
    ? summarizeRendererResourceStats()
    : { totalBytes: 0, gpuBytes: 0, cacheEntries: 0 }
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
    dirtyPixelArea: paintResult.frameCtx.dirtyPixelArea,
    totalPixelArea: paintResult.frameCtx.totalPixelArea,
    overlapPixelArea: paintResult.frameCtx.overlapPixelArea,
    overlapRatio: paintResult.frameCtx.overlapRatio,
    fullRepaint: paintResult.frameCtx.fullRepaint,
    transmissionMode: paintResult.frameCtx.transmissionMode,
    estimatedLayeredBytes: paintResult.frameCtx.estimatedLayeredBytes,
    estimatedFinalBytes: paintResult.frameCtx.estimatedFinalBytes,
    interactionLatencyMs: s.lastPresentedInteractionLatencyMs.value,
    interactionType: s.lastPresentedInteractionType.value,
    presentedInteractionSeq: s.lastPresentedInteractionSeq.value,
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

  s.clearDirty(dirtyVersionAtFrameStart)
  resetFrameTracking()
}
