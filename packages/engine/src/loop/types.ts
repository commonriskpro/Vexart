/**
 * types.ts — Shared pipeline contracts for the loop decomposition.
 *
 * Each type is the output of one pipeline stage, consumed by the next.
 * The coordinator (loop.ts) owns all state and threads slices through.
 *
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §Interfaces
 */

import type { TGENode } from "../ffi/node"
import type { RenderCommand } from "../ffi/render-graph"
import type { EffectConfig, TextMeta, ImagePaintConfig, CanvasPaintConfig } from "../ffi/render-graph"
import type { PositionedCommand } from "./layout-adapter"
import type { DamageRect } from "../ffi/damage"
import type { Layer } from "../ffi/layers"
import type { Terminal } from "../terminal/index"

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

// ── Module outputs ──

/**
 * walk-tree → layout-adapter
 *
 * Produced during walkTree: all nodes sorted by type, queued effects,
 * image/canvas data, node lookup maps, and text metadata.
 */
export type WalkResult = {
  rectNodes: TGENode[]
  textNodes: TGENode[]
  boxNodes: TGENode[]
  effectsQueue: Map<number, EffectConfig>
  imageQueue: Map<number, ImagePaintConfig>
  canvasQueue: Map<number, CanvasPaintConfig>
  nodePathById: Map<number, string>
  nodeRefById: Map<number, TGENode>
  /** Tier 2: count of nodes skipped by AABB viewport cull (Phase 3.3). */
  culledCount: number
}

/**
 * layout-adapter → layout map
 *
 * Produced after layout-adapter: flat RenderCommand array and
 * per-node positioned layout keyed by numeric node id.
 */
export type LayoutResult = {
  commands: RenderCommand[]
  layoutMap: Map<number, PositionedCommand>
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
