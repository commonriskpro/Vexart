import type { TGENode, NodeMouseEvent } from "../ffi/node"

// Hit-testing helpers for interaction, transform fallback, and focused unit tests.

// HP-6: Scroll offsets are stored lazily instead of mutating node.layout.
// This reference is set by composite.ts before hit-testing runs each frame.
let _activeScrollOffsets: Map<number, { x: number; y: number }> | null = null

/** @public Set the scroll offsets map for the current frame's hit-testing. */
export function setActiveScrollOffsets(offsets: Map<number, { x: number; y: number }>) {
  _activeScrollOffsets = offsets
}

/** Get effective screen position accounting for scroll offset. */
function effectivePosition(node: TGENode): { x: number; y: number } {
  if (node._scrollContainerId === 0 || !_activeScrollOffsets) return { x: node.layout.x, y: node.layout.y }
  const offset = _activeScrollOffsets.get(node._scrollContainerId)
  if (!offset) return { x: node.layout.x, y: node.layout.y }
  return { x: node.layout.x + offset.x, y: node.layout.y + offset.y }
}

/** @public */
export function buildNodeMouseEvent(node: TGENode, pointerX: number, pointerY: number): NodeMouseEvent {
  const l = node.layout
  const pos = effectivePosition(node)
  return { x: pointerX, y: pointerY, nodeX: pointerX - pos.x, nodeY: pointerY - pos.y, width: l.width, height: l.height }
}

/** @public */
export function isFullyOutsideScrollViewport(node: TGENode) {
  if (node.props.scrollX || node.props.scrollY) return false
  const pos = effectivePosition(node)
  let scrollParent = node.parent
  while (scrollParent) {
    if (scrollParent.props.scrollX || scrollParent.props.scrollY) {
      const sl = scrollParent.layout
      if (sl.width <= 0 || sl.height <= 0) return true
      return pos.y + node.layout.height <= sl.y || pos.y >= sl.y + sl.height || pos.x + node.layout.width <= sl.x || pos.x >= sl.x + sl.width
    }
    scrollParent = scrollParent.parent
  }
  return false
}
