/**
 * pipeline-damage.ts — Damage rect accumulation, scroll-aware AABB culling, and subtree evaluation.
 */

import { type TGENode, type TGEProps } from "../ffi/node"
import { type DamageRect, unionRect } from "../ffi/damage"
import { type WalkTreeState } from "./walk-tree"
import { type PipelineContext, getCurrentClipBounds } from "./pipeline-types"

/**
 * Checks whether a layout rect has non-zero positive dimensions.
 */
export function isNonEmptyLayoutRect(rect: { width: number; height: number }): boolean {
  return rect.width > 0 && rect.height > 0
}

/**
 * Computes bounding damage rect transitioning from previous to next layout rect.
 */
export function damageRectForLayoutTransition(
  prev: { x: number; y: number; width: number; height: number },
  next: { x: number; y: number; width: number; height: number },
): DamageRect | null {
  if (prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height) return null
  const prevRect = isNonEmptyLayoutRect(prev)
    ? { x: prev.x, y: prev.y, width: prev.width, height: prev.height }
    : null
  const nextRect = isNonEmptyLayoutRect(next)
    ? { x: next.x, y: next.y, width: next.width, height: next.height }
    : null
  if (!prevRect && !nextRect) return null
  if (!prevRect) return nextRect
  if (!nextRect) return prevRect
  return unionRect(prevRect, nextRect)
}

/**
 * Evaluates and records layout transition damage for a node using scalar layout coordinates.
 * Avoids any object allocations when geometry has not changed.
 */
export function accumulateNodeDamageScalars(
  node: TGENode,
  prevX: number,
  prevY: number,
  prevW: number,
  prevH: number,
  state: WalkTreeState,
): DamageRect | null {
  if (prevX === node.layout.x && prevY === node.layout.y && prevW === node.layout.width && prevH === node.layout.height) {
    return null
  }
  const prevEmpty = prevW <= 0 || prevH <= 0
  const nextEmpty = node.layout.width <= 0 || node.layout.height <= 0
  if (prevEmpty && nextEmpty) return null
  const prevRect = prevEmpty ? null : { x: prevX, y: prevY, width: prevW, height: prevH }
  const nextRect = nextEmpty ? null : { x: node.layout.x, y: node.layout.y, width: node.layout.width, height: node.layout.height }
  const damage = !prevRect ? nextRect : (!nextRect ? prevRect : unionRect(prevRect, nextRect))
  if (damage && (state as any).pendingNodeDamageRects) {
    (state as any).pendingNodeDamageRects.push({ nodeId: node.id, rect: damage })
  }
  return damage
}

/**
 * Evaluates and records layout transition damage for a node.
 */
export function accumulateNodeDamage(
  node: TGENode,
  prevLayout: { x: number; y: number; width: number; height: number },
  state: WalkTreeState,
): DamageRect | null {
  const damage = damageRectForLayoutTransition(prevLayout, node.layout)
  if (damage && (state as any).pendingNodeDamageRects) {
    (state as any).pendingNodeDamageRects.push({ nodeId: node.id, rect: damage })
  }
  return damage
}

/**
 * Collects all nodes in a subtree recursively.
 */
export function collectAllNodes(node: TGENode, out: TGENode[] = []): TGENode[] {
  out.push(node)
  for (let i = 0; i < node.children.length; i++) {
    collectAllNodes(node.children[i], out)
  }
  return out
}

/**
 * Registers a culled subtree into WalkTreeState so node refs and scroll container IDs remain consistent.
 */
export function registerCulledSubtree(node: TGENode, state: WalkTreeState): void {
  state.nodeRefById.set(node.id, node)
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    child._scrollContainerId = node._scrollContainerId
    child._layerKey = node._layerKey
    registerCulledSubtree(child, state)
  }
}

/**
 * Checks whether a node isolates its subtree (via opacity or CSS filter).
 */
export function isolatesSubtree(node: TGENode, props: TGEProps): boolean {
  return (
    node.kind !== "text" &&
    node.children.length > 0 &&
    (props.filter !== undefined ||
      (typeof props.opacity === "number" && props.opacity < 1))
  )
}

/**
 * Evaluates scroll-aware AABB culling against viewport and scissor clip.
 * Returns true if the node is completely culled from the current view.
 */
export function evaluateAABBCull(
  node: TGENode,
  absX: number,
  absY: number,
  width: number,
  height: number,
  parentScrollContainerId: number,
  insideTransform: boolean,
  hasTransformProp: boolean,
  isScroll: boolean,
  ctx: PipelineContext,
  state: WalkTreeState,
  viewportW: number,
  viewportH: number,
): boolean {
  if (
    !state.cullingEnabled ||
    insideTransform ||
    hasTransformProp ||
    isScroll ||
    width <= 0 ||
    height <= 0
  ) {
    return false
  }

  const scrollOffset =
    parentScrollContainerId !== 0
      ? ctx.scrollOffsets?.get(parentScrollContainerId)
      : undefined
  const visualX = absX + (scrollOffset ? scrollOffset.x : 0)
  const visualY = absY + (scrollOffset ? scrollOffset.y : 0)

  const clipBounds = getCurrentClipBounds(ctx)
  const vpW = state.viewportWidth ?? viewportW
  const vpH = state.viewportHeight ?? viewportH
  const clipLeft = clipBounds ? Math.max(0, clipBounds.x) : 0
  const clipTop = clipBounds ? Math.max(0, clipBounds.y) : 0
  const clipRight = clipBounds ? Math.min(vpW, clipBounds.x + clipBounds.width) : vpW
  const clipBottom = clipBounds ? Math.min(vpH, clipBounds.y + clipBounds.height) : vpH

  const fullyLeft = visualX + width <= clipLeft
  const fullyRight = visualX >= clipRight
  const fullyAbove = visualY + height <= clipTop
  const fullyBelow = visualY >= clipBottom

  if (
    clipRight <= clipLeft ||
    clipBottom <= clipTop ||
    fullyLeft ||
    fullyRight ||
    fullyAbove ||
    fullyBelow
  ) {
    if (state.culledCount) state.culledCount.value++
    registerCulledSubtree(node, state)
    return true
  }

  return false
}
