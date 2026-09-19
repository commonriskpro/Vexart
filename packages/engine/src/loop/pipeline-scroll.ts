/**
 * pipeline-scroll.ts — Post-order scroll offset application for RenderGraphOps.
 *
 * Phase 3 of the retained layout pipeline (DEC-014).
 * Replaces applyScrollOffsets() from composite-scroll.ts by operating directly on
 * RenderGraphOp[] within LayerOpBucket collections instead of RenderCommand[].
 *
 * Responsibilities:
 *   1. Calculate content extents per scroll container from child node layouts.
 *   2. Update scroll container geometry and clamp scroll positions.
 *   3. Build compounded scroll offset map for nested scroll containers.
 *   4. Translate op coordinates (op.x, op.y, op.rect, op.clipBounds) in-place.
 *   5. Return the compounded scroll offset map for hit-testing integration.
 */

import type { TGENode } from "../ffi/node"
import {
  type RenderGraphOp,
  getRenderOpClipStack,
} from "../ffi/render-graph"
import type { DamageRect } from "../ffi/damage"
import { getEffectivePosition } from "../reconciler/hit-test"
import type { LayerOpBucket } from "./pipeline-types"
import { createScrollHandle, updateScrollContainerGeometry } from "./scroll"

// ── Types ──────────────────────────────────────────────────────────────────

export type ScrollOffsetState = {
  scrollOffsets?: Map<number, { x: number; y: number }>
  markDirtyLayer?: (key: string) => void
  markDamageLayer?: (key: string, rect: DamageRect) => void
  deltaX?: number
  deltaY?: number
  speedCap?: number
}

export type ScrollState =
  | ScrollOffsetState
  | ((key: string) => void)
  | Map<number, { x: number; y: number }>

// ── Hierarchy & Geometry Helpers ───────────────────────────────────────────

/**
 * Find the parent scroll container for a node.
 *
 * First checks `node._scrollContainerId !== 0 ? nodeRefById.get(node._scrollContainerId) ?? null : null`.
 * Fallback: climbs `node.parent` looking for `p.props.scrollX || p.props.scrollY`.
 */
export function getParentScrollContainer(node: TGENode, nodeRefById: Map<number, TGENode>): TGENode | null {
  const fromId = node._scrollContainerId !== 0 ? nodeRefById.get(node._scrollContainerId) ?? null : null
  if (fromId) return fromId
  let parent = node.parent
  while (parent) {
    if (parent.props.scrollX || parent.props.scrollY) return parent
    parent = parent.parent
  }
  return null
}

/**
 * Computes content bounds (width and height) across all non-scroll descendants.
 * Nested scroll containers own their own descendants' overflow, so traversal stops
 * at nested scroll boundaries.
 */
export function computeScrollContentExtents(container: TGENode): { width: number; height: number } {
  const vpW = container.layout.width
  const vpH = container.layout.height
  let maxBottom = 0
  let maxRight = 0

  const visit = (child: TGENode) => {
    const bottom = child.layout.y - container.layout.y + child.layout.height
    const right = child.layout.x - container.layout.x + child.layout.width
    if (bottom > maxBottom) maxBottom = bottom
    if (right > maxRight) maxRight = right

    if (child.props.scrollX || child.props.scrollY) return
    for (const descendant of child.children) {
      visit(descendant)
    }
  }

  for (const child of container.children) {
    visit(child)
  }

  return {
    width: Math.max(maxRight, vpW),
    height: Math.max(maxBottom, vpH),
  }
}

function intersectOrEmptyBounds(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= left || bottom <= top) {
    return {
      x: Math.round(left),
      y: Math.round(top),
      width: 0,
      height: 0,
    }
  }
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(0, Math.round(right - left)),
    height: Math.max(0, Math.round(bottom - top)),
  }
}

function resolveScrollOptions(state?: ScrollState) {
  if (typeof state === "function") {
    return { markDirtyLayer: state, markDamageLayer: undefined, offsets: new Map<number, { x: number; y: number }>() }
  }
  if (state instanceof Map) {
    state.clear()
    return { markDirtyLayer: undefined, markDamageLayer: undefined, offsets: state }
  }
  if (state && typeof state === "object") {
    const markDirtyLayer = "markDirtyLayer" in state && typeof state.markDirtyLayer === "function"
      ? state.markDirtyLayer
      : undefined
    const markDamageLayer = "markDamageLayer" in state && typeof state.markDamageLayer === "function"
      ? state.markDamageLayer
      : undefined
    const offsets = "scrollOffsets" in state && state.scrollOffsets instanceof Map
      ? (state.scrollOffsets.clear(), state.scrollOffsets)
      : new Map<number, { x: number; y: number }>()
    return { markDirtyLayer, markDamageLayer, offsets }
  }
  return { markDirtyLayer: undefined, markDamageLayer: undefined, offsets: new Map<number, { x: number; y: number }>() }
}

// ── Pass 2: Scroll Offset Application ──────────────────────────────────────

/**
 * Resolves scroll extents, clamps scroll handles, computes compounded offsets,
 * and shifts RenderGraphOps in-place.
 *
 * @param layerBuckets Collection of layer buckets containing emitted RenderGraphOps.
 * @param scrollContainers Retained list of scroll container nodes from traversal.
 * @param nodeRefById Map of node ID to TGENode for hierarchy lookups.
 * @param scrollState Optional scroll state, options object, dirty layer callback, or offset map.
 * @returns Map of container nodeId to compounded { x, y } scroll offsets for hit testing.
 */
export function applyScrollOffsetsToOps(
  layerBuckets: LayerOpBucket[],
  scrollContainers: TGENode[],
  nodeRefById: Map<number, TGENode>,
  scrollState?: ScrollState,
): Map<number, { x: number; y: number }> {
  const { markDirtyLayer, markDamageLayer, offsets } = resolveScrollOptions(scrollState)
  const localOffsets = new Map<number, { x: number; y: number }>()

  // 1. Measure content extents and update scroll geometry for each container
  for (const container of scrollContainers) {
    const sid = container.props.scrollId ?? `tge-scroll-${container.id}`
    const handle = createScrollHandle(sid)
    const extents = computeScrollContentExtents(container)
    const vpW = container.layout.width
    const vpH = container.layout.height

    updateScrollContainerGeometry(sid, vpW, vpH, extents.width, extents.height)

    const maxScrollX = Math.min(0, -(extents.width - vpW))
    const clampedX = Math.max(maxScrollX, Math.min(0, handle.scrollX))
    const maxScrollY = Math.min(0, -(extents.height - vpH))
    const clampedY = Math.max(maxScrollY, Math.min(0, handle.scrollY))

    const ox = container.props.scrollX ? clampedX : 0
    const oy = container.props.scrollY ? clampedY : 0
    localOffsets.set(container.id, { x: ox, y: oy })
  }

  // 2. Build compounded scroll offset map (Decision 8 Option C)
  const getCompoundedOffset = (container: TGENode): { x: number; y: number } => {
    const cached = offsets.get(container.id)
    if (cached) return cached
    const local = localOffsets.get(container.id) ?? { x: 0, y: 0 }
    const parentContainer = getParentScrollContainer(container, nodeRefById)
    if (!parentContainer) {
      offsets.set(container.id, local)
      return local
    }
    const parentTotal = getCompoundedOffset(parentContainer)
    const total = { x: parentTotal.x + local.x, y: parentTotal.y + local.y }
    offsets.set(container.id, total)
    return total
  }

  for (const container of scrollContainers) {
    const total = getCompoundedOffset(container)
    if (total.x !== 0 || total.y !== 0) {
      const layerKey = container._layerKey ?? "bg"
      if (markDamageLayer) {
        const pos = getEffectivePosition(container, offsets)
        const containerRect: DamageRect = {
          x: Math.round(pos.x),
          y: Math.round(pos.y),
          width: Math.round(container.layout.width),
          height: Math.round(container.layout.height),
        }
        markDamageLayer(layerKey, containerRect)
      } else if (markDirtyLayer) {
        markDirtyLayer(layerKey)
      }
    }
  }

  if (offsets.size === 0) return offsets

  // 3. Apply compounded offsets to ops in all layer buckets
  for (const bucket of layerBuckets) {
    for (const op of bucket.ops) {
      if (op.nodeId === undefined) continue
      const node = nodeRefById.get(op.nodeId)
      if (!node || node._scrollContainerId === 0) continue

      const offset = offsets.get(node._scrollContainerId)
      if (!offset) continue

      if (offset.x !== 0 || offset.y !== 0) {
        op.x += offset.x
        op.y += offset.y

        if ("rect" in op && op.rect) {
          op.rect.x += offset.x
          op.rect.y += offset.y
        }
      }

      // Update op.clipBounds if present
      const stack = getRenderOpClipStack(op)
      if (stack.length > 0) {
        let bounds: { x: number; y: number; width: number; height: number } | null = null
        for (const entry of stack) {
          const clipNode = entry.nodeId !== undefined ? nodeRefById.get(entry.nodeId) : null
          const parentId = clipNode ? clipNode._scrollContainerId : 0
          const parentOffset = parentId !== 0 ? offsets.get(parentId) : undefined
          const shiftX = parentOffset ? parentOffset.x : 0
          const shiftY = parentOffset ? parentOffset.y : 0
          const shiftedBounds = {
            x: entry.bounds.x + shiftX,
            y: entry.bounds.y + shiftY,
            width: entry.bounds.width,
            height: entry.bounds.height,
          }
          entry.bounds = shiftedBounds
          bounds = bounds ? intersectOrEmptyBounds(bounds, shiftedBounds) : shiftedBounds
        }
        if (bounds) {
          op.clipBounds = bounds
          if ("rect" in op && op.rect) {
            op.rect.clipBounds = bounds
          }
        }
      } else if (op.clipBounds) {
        const containerNode = nodeRefById.get(node._scrollContainerId)
        const parentContainer = containerNode ? getParentScrollContainer(containerNode, nodeRefById) : null
        const parentOffset = parentContainer ? offsets.get(parentContainer.id) : undefined
        if (parentOffset && (parentOffset.x !== 0 || parentOffset.y !== 0)) {
          op.clipBounds = {
            x: op.clipBounds.x + parentOffset.x,
            y: op.clipBounds.y + parentOffset.y,
            width: op.clipBounds.width,
            height: op.clipBounds.height,
          }
          if ("rect" in op && op.rect) {
            op.rect.clipBounds = op.clipBounds
          }
        }
      }

      // Keep backdrop effect metadata aligned with shifted op coordinates
      if (op.kind === "effect" && op.backdrop) {
        if (offset.x !== 0 || offset.y !== 0) {
          op.backdrop.inputBounds = {
            x: op.backdrop.inputBounds.x + offset.x,
            y: op.backdrop.inputBounds.y + offset.y,
            width: op.backdrop.inputBounds.width,
            height: op.backdrop.inputBounds.height,
          }
        }
        if (op.clipBounds) {
          op.backdrop.clipBounds = { ...op.clipBounds }
          op.backdrop.outputBounds = intersectOrEmptyBounds(op.backdrop.inputBounds, op.clipBounds)
        } else {
          op.backdrop.outputBounds = { ...op.backdrop.inputBounds }
        }
        const pad = op.effect.backdropBlur ? Math.ceil(op.effect.backdropBlur) : 0
        op.backdrop.sampleBounds = {
          x: op.backdrop.outputBounds.x - pad,
          y: op.backdrop.outputBounds.y - pad,
          width: op.backdrop.outputBounds.width + pad * 2,
          height: op.backdrop.outputBounds.height + pad * 2,
        }
      }
    }
  }

  return offsets
}
