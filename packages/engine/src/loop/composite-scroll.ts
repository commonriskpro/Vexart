/**
 * composite-scroll.ts — Scroll routing helpers.
 *
 * Offset application is handled by pipeline-scroll.ts.
 */

import type { TGENode } from "../ffi/node"
import { getEffectivePosition } from "../reconciler/hit-test"
import { createScrollHandle } from "./scroll"

export type ScrollFrameState = {
  pointer: { x: number; y: number }
  boxNodes: TGENode[]
  scrollContainers: TGENode[]
  scrollOffsets: Map<number, { x: number; y: number }>
  nodeRefById: Map<number, TGENode>
}

// ── Hierarchy helpers ────────────────────────────────────────────────────

/**
 * Find the parent scroll container for a node.
 *
 * First checks `node._scrollContainerId !== 0 ? nodeRefById.get(node._scrollContainerId) ?? null : null`.
 * Fallback: climbs `node.parent` looking for `p.props.scrollX || p.props.scrollY`.
 */
export function getParentScrollContainer(node: TGENode, nodeRefById: Map<number, TGENode>): TGENode | null {
  const fromId = node._scrollContainerId !== 0 ? nodeRefById.get(node._scrollContainerId) ?? null : null
  if (fromId) return fromId
  let p = node.parent
  while (p) {
    if (p.props.scrollX || p.props.scrollY) return p
    p = p.parent
  }
  return null
}

// ── Scroll routing ───────────────────────────────────────────────────────

/**
 * Route scroll deltas to the innermost scroll container whose layout bounds
 * contain the pointer, using previous-frame node layout for hit detection.
 */
export function routeScrollDeltas(s: ScrollFrameState, sdx: number, sdy: number) {
  if (sdx === 0 && sdy === 0) return

  let scrollTarget: TGENode | null = null
  const px = s.pointer.x
  const py = s.pointer.y
  for (const node of s.boxNodes) {
    if (!node.props.scrollX && !node.props.scrollY) continue
    const l = node.layout
    if (l.width <= 0 || l.height <= 0) continue
    const effective = getEffectivePosition(node, s.scrollOffsets)
    const left = effective.x
    const top = effective.y
    if (px >= left && px < left + l.width && py >= top && py < top + l.height) {
      if (!scrollTarget) {
        scrollTarget = node
      } else {
        let isDescendant = false
        let p = node.parent
        while (p) {
          if (p === scrollTarget) { isDescendant = true; break }
          p = p.parent
        }
        if (isDescendant) {
          scrollTarget = node
        } else {
          const existingArea = scrollTarget.layout.width * scrollTarget.layout.height
          const newArea = l.width * l.height
          if (newArea < existingArea) scrollTarget = node
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
