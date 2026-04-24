import type { TGENode, NodeMouseEvent } from "../ffi/node"

// COMPAT-FALLBACK / TEST-PATH: retained native interaction frames compute
// hit-testing in Rust. These helpers remain for native-disabled fallback,
// transform fallback, and focused unit tests.

/** @public */
export function buildNodeMouseEvent(node: TGENode, pointerX: number, pointerY: number): NodeMouseEvent {
  const l = node.layout
  return { x: pointerX, y: pointerY, nodeX: pointerX - l.x, nodeY: pointerY - l.y, width: l.width, height: l.height }
}

/** @public */
export function isFullyOutsideScrollViewport(node: TGENode) {
  if (node.props.scrollX || node.props.scrollY) return false
  const l = node.layout
  let scrollParent = node.parent
  while (scrollParent) {
    if (scrollParent.props.scrollX || scrollParent.props.scrollY) {
      const sl = scrollParent.layout
      if (sl.width <= 0 || sl.height <= 0) return false
      return l.y + l.height <= sl.y || l.y >= sl.y + sl.height || l.x + l.width <= sl.x || l.x >= sl.x + sl.width
    }
    scrollParent = scrollParent.parent
  }
  return false
}
