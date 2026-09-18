/**
 * pipeline-types.ts — Retained layout pipeline types and utilities.
 *
 * Scaffolding for the 2-pass retained layout and paint pipeline (DEC-014).
 * Provides frame snapshotting for atomicity, clip stack intersection,
 * layer routing contexts, and unified pipeline traversal state.
 */

import type { TGENode } from "../ffi/node-types"
import type { RenderGraphOp } from "../ffi/render-graph"

export type { TGENode } from "../ffi/node-types"
export type { RenderGraphOp } from "../ffi/render-graph"

// ── 1. Frame Snapshot (Atomicity) ──────────────────────────────────────────

/**
 * Retained layout rect snapshot across all tree nodes.
 * Used on error paths to rollback node.layout mutations atomically.
 */
export type FrameSnapshot = {
  nodes: TGENode[]
  data: Float64Array
}

/**
 * Captures the current computed layout rects for all nodes into a flat Float64Array.
 * Stride is 4 floats per node: [x, y, width, height].
 */
export function snapshotLayouts(nodes: TGENode[]): FrameSnapshot {
  const count = nodes.length
  const data = new Float64Array(count * 4)
  for (let i = 0; i < count; i++) {
    const layout = nodes[i].layout
    const offset = i * 4
    data[offset] = layout.x
    data[offset + 1] = layout.y
    data[offset + 2] = layout.width
    data[offset + 3] = layout.height
  }
  return { nodes: nodes.slice(), data }
}

/**
 * Restores node.layout coordinates from a previous snapshot.
 */
export function restoreLayouts(snapshot: FrameSnapshot): void
export function restoreLayouts(nodes: TGENode[], snapshot: FrameSnapshot): void
export function restoreLayouts(first: FrameSnapshot | TGENode[], second?: FrameSnapshot): void {
  const snapshot = second ?? (first as FrameSnapshot)
  const { nodes, data } = snapshot
  const count = nodes.length
  for (let i = 0; i < count; i++) {
    const node = nodes[i]
    const offset = i * 4
    if (node.layout) {
      node.layout.x = data[offset]
      node.layout.y = data[offset + 1]
      node.layout.width = data[offset + 2]
      node.layout.height = data[offset + 3]
    } else {
      node.layout = {
        x: data[offset],
        y: data[offset + 1],
        width: data[offset + 2],
        height: data[offset + 3],
      }
    }
  }
}

// ── 2. Clip Context & Bounds ────────────────────────────────────────────────

export type ClipEntry = {
  x: number
  y: number
  width: number
  height: number
  nodeId: number
}

export type ClipBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type ClipContext = {
  stack: ClipEntry[]
}

export function createClipContext(): ClipContext {
  return { stack: [] }
}

function createClipBounds(x: number, y: number, width: number, height: number): ClipBounds {
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(0, Math.round(width)),
    height: Math.max(0, Math.round(height)),
  }
}

function intersectClipBounds(a: ClipBounds, b: { x: number; y: number; width: number; height: number }): ClipBounds | null {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= left || bottom <= top) return null
  return createClipBounds(left, top, right - left, bottom - top)
}

export function pushClip(ctx: ClipContext | PipelineContext, entry: ClipEntry): void {
  const target = "clip" in ctx ? ctx.clip : ctx
  target.stack.push(entry)
}

export function popClip(ctx: ClipContext | PipelineContext): void {
  const target = "clip" in ctx ? ctx.clip : ctx
  target.stack.pop()
}

/**
 * Computes the effective intersection bounds of all active clips in the stack.
 * Returns null when no clips are active (unrestricted).
 * Returns zero-area bounds when active clips do not overlap.
 */
export function getCurrentClipBounds(ctx: ClipContext | PipelineContext): ClipBounds | null {
  const target = "clip" in ctx ? ctx.clip : ctx
  const stack = target.stack
  if (stack.length === 0) return null

  let bounds: ClipBounds | null = null
  for (let index = 0; index < stack.length; index++) {
    const entry = stack[index]
    bounds = bounds ? intersectClipBounds(bounds, entry) : createClipBounds(entry.x, entry.y, entry.width, entry.height)
    if (!bounds) {
      const last = stack[index - 1] ?? entry
      return createClipBounds(
        Math.max(last.x, entry.x),
        Math.max(last.y, entry.y),
        0,
        0,
      )
    }
  }
  return bounds
}

// ── 3. Layer Op Bucket & Layer Context ──────────────────────────────────────

export type LayerOpBucket = {
  key: string
  ops: RenderGraphOp[]
  nodeId: number
}

export type LayerContext = {
  stack: LayerOpBucket[]
  allBuckets: LayerOpBucket[]
}

export function createLayerContext(): LayerContext {
  const rootBucket: LayerOpBucket = {
    key: "root",
    ops: [],
    nodeId: 0,
  }
  return {
    stack: [rootBucket],
    allBuckets: [rootBucket],
  }
}

export function pushLayer(ctx: LayerContext | PipelineContext, key: string, nodeId: number): void {
  const target = "layer" in ctx ? ctx.layer : ctx
  const bucket: LayerOpBucket = {
    key,
    ops: [],
    nodeId,
  }
  target.stack.push(bucket)
  target.allBuckets.push(bucket)
}

export function popLayer(ctx: LayerContext | PipelineContext): void {
  const target = "layer" in ctx ? ctx.layer : ctx
  if (target.stack.length > 1) {
    target.stack.pop()
  }
}

export function emitOp(ctx: LayerContext | PipelineContext, op: RenderGraphOp): void {
  const target = "layer" in ctx ? ctx.layer : ctx
  const current = target.stack[target.stack.length - 1]
  if (current) {
    current.ops.push(op)
  }
}

// ── 4. Unified Pipeline Context ─────────────────────────────────────────────

export type PipelineContext = {
  clip: ClipContext
  layer: LayerContext
  absX: number
  absY: number
  scrollContainerId: number
  insideTransform: boolean
  dfsIndex: number
}

export function createPipelineContext(): PipelineContext {
  return {
    clip: createClipContext(),
    layer: createLayerContext(),
    absX: 0,
    absY: 0,
    scrollContainerId: 0,
    insideTransform: false,
    dfsIndex: 0,
  }
}
