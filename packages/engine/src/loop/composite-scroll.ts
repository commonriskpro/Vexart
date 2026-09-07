/**
 * composite-scroll.ts — Scroll routing and offset application.
 *
 * Extracted from composite.ts to isolate scroll-specific logic:
 *   - routeScrollDeltas: routes mouse-wheel scroll to the innermost scroll container
 *   - applyScrollOffsets: adjusts render command positions for scroll state
 */

import type { TGENode } from "../ffi/node"
import { CMD, type RenderCommand } from "../ffi/render-graph"
import { createScrollHandle, updateScrollContainerGeometry } from "./scroll"
import { markLayerDirtyByKey } from "./composite"
import type { CompositeFrameState } from "./composite"

// ── Scroll routing ───────────────────────────────────────────────────────

/**
 * Route scroll deltas to the innermost scroll container whose layout bounds
 * contain the pointer, using previous-frame node layout for hit detection.
 */
export function routeScrollDeltas(s: CompositeFrameState, sdx: number, sdy: number) {
  if (sdx === 0 && sdy === 0) return

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
 * shifted by the scroll position. Also computes scroll container geometry
 * so that clamping works correctly.
 *
 * SCISSOR commands are excluded — they always reflect the scroll container's
 * viewport bounds (not the scrolled content position).
 */
export function applyScrollOffsets(commands: RenderCommand[], s: CompositeFrameState) {
  s.scrollOffsets.clear()
  const offsets = s.scrollOffsets
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
    if (ox !== 0 || oy !== 0) {
      offsets.set(node.id, { x: ox, y: oy })
      const layerKey = node._layerKey ?? "bg"
      markLayerDirtyByKey(layerKey)
    }
  }

  if (offsets.size === 0) return
  for (const cmd of commands) {
    if (cmd.type === CMD.SCISSOR_START || cmd.type === CMD.SCISSOR_END || cmd.nodeId === undefined) continue
    const node = s.nodeRefById.get(cmd.nodeId)
    if (!node || node._scrollContainerId === 0) continue
    const offset = offsets.get(node._scrollContainerId)
    if (!offset) continue
    cmd.x += offset.x
    cmd.y += offset.y
  }
}
