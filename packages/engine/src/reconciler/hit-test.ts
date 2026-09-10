import type { TGENode, NodeMouseEvent } from "../ffi/node"
import { transformBounds } from "../ffi/matrix"

// Hit-testing helpers for interaction, transform fallback, and focused unit tests.

// HP-6: Scroll offsets are stored lazily instead of mutating node.layout.
// This reference is set by composite.ts before hit-testing runs each frame.
let _activeScrollOffsets: Map<number, { x: number; y: number }> | null = null

/** @public Set the scroll offsets map for the current frame's hit-testing. */
export function setActiveScrollOffsets(offsets: Map<number, { x: number; y: number }>) {
  _activeScrollOffsets = offsets
}

/**
 * Get effective screen position accounting for the current scroll container.
 *
 * Scroll command application currently uses the same nearest-container
 * ownership model. Keep hit-testing aligned with that renderer contract until
 * nested scroll offsets are composed in the paint path too.
 */
export function getEffectivePosition(
  node: TGENode,
  offsets: Map<number, { x: number; y: number }> | null | undefined = _activeScrollOffsets,
): { x: number; y: number } {
  if (node._scrollContainerId === 0 || !offsets) return { x: node.layout.x, y: node.layout.y }
  const offset = offsets.get(node._scrollContainerId)
  if (!offset) return { x: node.layout.x, y: node.layout.y }
  return { x: node.layout.x + offset.x, y: node.layout.y + offset.y }
}

/**
 * Return the node's screen-space AABB after its accumulated transform.
 *
 * Scroll culling must use the visual bounds, not the layout rect. A card can
 * have a layout position outside a viewport and still be visible after a
 * translate/rotate/scale (the same distinction used by hit-testing below).
 */
function effectiveVisualBounds(
  node: TGENode,
  offsets: Map<number, { x: number; y: number }> | null | undefined = _activeScrollOffsets,
) {
  const pos = getEffectivePosition(node, offsets)
  const transform = node._accTransform ?? node._transform
  if (!transform) {
    return {
      x: pos.x,
      y: pos.y,
      width: node.layout.width,
      height: node.layout.height,
    }
  }
  const bounds = transformBounds(transform, node.layout.width, node.layout.height)
  return {
    x: pos.x + bounds.x,
    y: pos.y + bounds.y,
    width: bounds.width,
    height: bounds.height,
  }
}

/** @public */
export function buildNodeMouseEvent(node: TGENode, pointerX: number, pointerY: number): NodeMouseEvent {
  const l = node.layout
  const pos = getEffectivePosition(node)
  const relX = pointerX - pos.x
  const relY = pointerY - pos.y
  const inverse = node._accTransformInverse ?? node._transformInverse
  if (inverse) {
    const w = inverse[6] * relX + inverse[7] * relY + inverse[8]
    if (Math.abs(w) > 1e-12) {
      return {
        x: pointerX,
        y: pointerY,
        nodeX: (inverse[0] * relX + inverse[1] * relY + inverse[2]) / w,
        nodeY: (inverse[3] * relX + inverse[4] * relY + inverse[5]) / w,
        width: l.width,
        height: l.height,
      }
    }
  }
  return { x: pointerX, y: pointerY, nodeX: relX, nodeY: relY, width: l.width, height: l.height }
}

/** @public */
export function isFullyOutsideScrollViewport(node: TGENode) {
  if (node.props.scrollX || node.props.scrollY) return false
  const bounds = effectiveVisualBounds(node)
  let scrollParent = node.parent
  while (scrollParent) {
    if (scrollParent.props.scrollX || scrollParent.props.scrollY) {
      const sl = scrollParent.layout
      if (sl.width <= 0 || sl.height <= 0) return true
      const viewport = effectiveVisualBounds(scrollParent)
      if (viewport.width <= 0 || viewport.height <= 0) return true
      if (bounds.y + bounds.height <= viewport.y || bounds.y >= viewport.y + viewport.height || bounds.x + bounds.width <= viewport.x || bounds.x >= viewport.x + viewport.width) return true
    }
    scrollParent = scrollParent.parent
  }
  return false
}

/** Return whether a pointer is inside every transformed scroll viewport. */
export function isPointInsideScrollViewports(
  node: TGENode,
  pointerX: number,
  pointerY: number,
  offsets: Map<number, { x: number; y: number }> | null | undefined = _activeScrollOffsets,
) {
  let scrollParent = node.parent
  while (scrollParent) {
    if (scrollParent.props.scrollX || scrollParent.props.scrollY) {
      const pos = getEffectivePosition(scrollParent, offsets)
      const inverse = scrollParent._accTransformInverse ?? scrollParent._transformInverse
      const relX = pointerX - pos.x
      const relY = pointerY - pos.y
      let localX = relX
      let localY = relY
      if (inverse) {
        const w = inverse[6] * relX + inverse[7] * relY + inverse[8]
        if (Math.abs(w) <= 1e-12) return false
        localX = (inverse[0] * relX + inverse[1] * relY + inverse[2]) / w
        localY = (inverse[3] * relX + inverse[4] * relY + inverse[5]) / w
      }
      const l = scrollParent.layout
      if (localX < 0 || localY < 0 || localX >= l.width || localY >= l.height) return false
    }
    scrollParent = scrollParent.parent
  }
  return true
}
