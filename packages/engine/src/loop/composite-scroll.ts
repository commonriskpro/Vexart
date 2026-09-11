/**
 * composite-scroll.ts — Scroll routing and offset application.
 *
 * Extracted from composite.ts to isolate scroll-specific logic:
 *   - routeScrollDeltas: routes mouse-wheel scroll to the innermost scroll container
 *   - applyScrollOffsets: adjusts render command positions for scroll state
 */

import type { TGENode } from "../ffi/node"
import { CMD, type RenderCommand } from "../ffi/render-graph"
import { getEffectivePosition } from "../reconciler/hit-test"
import { createScrollHandle, updateScrollContainerGeometry } from "./scroll"

type ScrollFrameState = {
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

// ── Scroll offset application ────────────────────────────────────────────

/**
 * Apply scroll offsets to render commands.
 *
 * After the layout pass, scroll containers need their children's commands
 * shifted by the compounded scroll position. Also computes scroll container geometry
 * so that clamping works correctly.
 *
 * Root SCISSOR commands are unshifted (viewport stays fixed), while nested
 * SCISSOR commands shift with their parent scroll container's compounded offset.
 */
export function applyScrollOffsets(commands: RenderCommand[], s: ScrollFrameState, markDirtyLayer: (key: string) => void) {
  s.scrollOffsets.clear()
  const offsets = s.scrollOffsets
  const localOffsets = new Map<number, { x: number; y: number }>()

  for (const node of s.scrollContainers) {
    const sid = node.props.scrollId ?? `tge-scroll-${node.id}`
    const handle = createScrollHandle(sid)

    // Compute real content extent by walking children
    const vpW = node.layout.width
    const vpH = node.layout.height
    let maxChildBottom = 0
    let maxChildRight = 0
    const visit = (child: TGENode) => {
      const cb = child.layout.y - node.layout.y + child.layout.height
      const cr = child.layout.x - node.layout.x + child.layout.width
      if (cb > maxChildBottom) maxChildBottom = cb
      if (cr > maxChildRight) maxChildRight = cr

      // A nested scroll container owns its descendants' overflow. Count the
      // nested viewport in the parent, but leave its content extent to the
      // nested handle so the parent cannot scroll through the inner content.
      if (child.props.scrollX || child.props.scrollY) return
      for (const descendant of child.children) visit(descendant)
    }
    for (const child of node.children) visit(child)
    const ctW = Math.max(maxChildRight, vpW)
    const ctH = Math.max(maxChildBottom, vpH)
    updateScrollContainerGeometry(sid, vpW, vpH, ctW, ctH)

    const ox = node.props.scrollX ? handle.scrollX : 0
    const oy = node.props.scrollY ? handle.scrollY : 0
    localOffsets.set(node.id, { x: ox, y: oy })
  }

  const getCompoundedOffset = (container: TGENode): { x: number; y: number } => {
    const cached = offsets.get(container.id)
    if (cached) return cached
    const local = localOffsets.get(container.id) ?? { x: 0, y: 0 }
    const parentContainer = getParentScrollContainer(container, s.nodeRefById)
    if (!parentContainer) {
      offsets.set(container.id, local)
      return local
    }
    const parentTotal = getCompoundedOffset(parentContainer)
    const total = { x: parentTotal.x + local.x, y: parentTotal.y + local.y }
    offsets.set(container.id, total)
    return total
  }

  for (const node of s.scrollContainers) {
    const total = getCompoundedOffset(node)
    if (total.x !== 0 || total.y !== 0) {
      markDirtyLayer(node._layerKey ?? "bg")
    }
  }

  if (offsets.size === 0) return
  for (const cmd of commands) {
    if (cmd.type === CMD.SCISSOR_END || cmd.nodeId === undefined) continue
    const node = s.nodeRefById.get(cmd.nodeId)
    if (!node || node._scrollContainerId === 0) continue
    const offset = offsets.get(node._scrollContainerId)
    if (!offset) continue
    cmd.x += offset.x
    cmd.y += offset.y
  }
}
