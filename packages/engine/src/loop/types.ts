/**
 * types.ts — Shared pipeline contracts for the loop decomposition.
 *
 * Each type is the output of one pipeline stage, consumed by the next.
 * The coordinator (loop.ts) owns all state and threads slices through.
 *
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §Interfaces
 */

import type { TGENode } from "../ffi/node"
import type { EffectConfig, ImagePaintConfig, CanvasPaintConfig, RenderCommand } from "../ffi/render-graph"
import type { PositionedCommand, createVexartLayoutCtx } from "./layout-adapter"
import type { DamageRect } from "../ffi/damage"
import type { Layer, LayerStoreHandle } from "../ffi/layers"
import type { Terminal } from "../terminal/index"
import type { RendererBackend } from "../ffi/renderer-backend"
import type { LayerOpBucket } from "./pipeline-types"

// ── Pointer + scroll state ──

/** Mutable pointer state — coordinator owns, modules read/write via reference. */
export type PointerState = {
  x: number
  y: number
  down: boolean
  dirty: boolean
  pendingPress: boolean
  pendingRelease: boolean
  capturedNodeId: number
  pressOriginSet: boolean
}

/** Accumulated scroll state — reset after each frame. */
export type ScrollState = {
  deltaX: number
  deltaY: number
  speedCap: number
}

/** Mutable scalar counters for walk state writeback. */
export type WalkCounters = {
  scrollSpeedCap: number
}

/**
 * Mutable state threaded through layout traversal.
 * Coordinator allocates this once per frame and passes it into traverseFrame.
 */
export type WalkTreeState = {
  scrollSpeedCap: { value: number }
  nodeCount: { value: number }
  rectNodes: TGENode[]
  textNodes: TGENode[]
  boxNodes: TGENode[]
  layerBoundaries: LayerBoundary[]
  scrollContainers: TGENode[]
  nodeRefById: Map<number, TGENode>
  rectNodeById: Map<number, TGENode>
  layout: ReturnType<typeof createVexartLayoutCtx>
  hasAnyTransforms?: boolean
  cullingEnabled?: boolean
  viewportWidth?: number
  viewportHeight?: number
  culledCount?: { value: number }
}

// ── Shared sub-interfaces (used by CompositeFrameState and PaintFrameState) ──

/** Dirty tracking methods — coordinator owns the tracker, modules call through. */
export type DirtyTrackingHandle = {
  markDirty: (scope?: import("../reconciler/dirty").DirtyScope) => void
  markAllDirty: () => void
  clearDirty: (expectedVersion?: number) => void
  dirtyVersion: () => number
  dirtyCount: () => number
}

/** Interaction latency tracking — coordinator-owned mutable scalars. */
export type InteractionLatencyTracking = {
  lastPresentedInteractionSeq: { value: number }
  lastPresentedInteractionLatencyMs: { value: number }
  lastPresentedInteractionType: { value: string | null }
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

// ── Per-frame immutable coordinator context ──

/** Per-frame context built by the coordinator and threaded through the pipeline. */
export type FrameState = {
  root: TGENode
  viewportWidth: number
  viewportHeight: number
  cellWidth: number
  cellHeight: number
  pointer: PointerState
  scroll: ScrollState
  term: Terminal
  forceLayerRepaint: boolean
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

// ── Module outputs ──

/**
 * walk-tree → layout-adapter
 *
 * Produced during walkTree: all nodes sorted by type, queued effects,
 * image/canvas data, and node lookup maps.
 */
export type WalkResult = {
  rectNodes: TGENode[]
  textNodes: TGENode[]
  boxNodes: TGENode[]
  effectsQueue: Map<number, EffectConfig>
  imageQueue: Map<number, ImagePaintConfig>
  canvasQueue: Map<number, CanvasPaintConfig>
  nodeRefById: Map<number, TGENode>
  /** Tier 2: count of nodes skipped by AABB viewport cull (Phase 3.3). */
  culledCount: number
}

/**
 * A layer slot — maps a stable key to its command indices.
 * Used by assign-layers and frame-pipeline.
 */
export type LayerSlot = {
  /** Stable key for layer identity across frames (e.g. "bg", "layer:<id>"). */
  key: string
  /** z-order: -1 for background, 0+ for content layers in tree order. */
  z: number
  /** Indices into the commands array assigned to this slot. */
  cmdIndices: number[]
}

/**
 * A layer boundary discovered during tree walking.
 * Records the node's path, z-order, and scroll/transform metadata.
 */
export type LayerBoundary = {
  path?: string
  nodeId: number
  z: number
  /** True if this node is a scroll container. */
  isScroll: boolean
  /** True if this node has an explicit backgroundColor. */
  hasBg: boolean
  /** True if this layer boundary is inside a scroll container ancestor. */
  insideScroll: boolean
  /** True if this layer boundary exists to preserve a subtree transform. */
  hasSubtreeTransform: boolean
}

/**
 * assign-layers → frame-pipeline
 *
 * All layer slot assignments plus boundary metadata for paint + composite.
 */
export type LayerPlan = {
  bgSlot: LayerSlot
  contentSlots: LayerSlot[]
  slotBoundaryByKey: Map<string, LayerBoundary>
  boundaries: LayerBoundary[]
}

/**
 * interaction-state → coordinator
 *
 * Result of one updateInteractiveStates() call.
 * `hadClick` triggers an in-frame re-layout pass.
 */
export type InteractionResult = {
  /** Any hover/active/focus flag changed — needs repaint. */
  changed: boolean
  /** onPress was dispatched — triggers re-layout in the same frame. */
  hadClick: boolean
}

/**
 * paint phase output (future use by frame-pipeline / composite).
 *
 * Tracks per-layer dirty state so the compositor can skip clean layers.
 */
export type PaintResult = {
  /** Keys of layers that were repainted this frame. */
  repaintedKeys: string[]
  /** Whether any layer was dirty (triggers terminal I/O). */
  anyDirty: boolean
}

/** @public */
export type RenderLoop = {
  root: TGENode
  backend: RendererBackend
  start: () => void
  stop: () => void
  frame: () => void
  feedScroll: (dx: number, dy: number) => void
  feedPointer: (x: number, y: number, down: boolean) => void
  nudgeInteraction: (kind: "pointer" | "scroll" | "key") => void
  requestInteractionFrame: (kind: "pointer" | "scroll" | "key") => void
  needsPointerRepaint: () => boolean
  setPointerCapture: (nodeId: number) => void
  releasePointerCapture: (nodeId: number) => void
  getCapturedNodeId?: () => number
  onPostScroll: (cb: () => void) => () => void
  markNodeLayerDamaged: (nodeId: number, rect?: DamageRect) => void
  suspend: () => void
  resume: () => void
  suspended: () => boolean
  /** Schedule a task to run during frame budget drain. Returns cancel function. */
  scheduleTask: (priority: "user-blocking" | "user-visible" | "background", fn: () => void) => () => void
  destroy: () => void
}
