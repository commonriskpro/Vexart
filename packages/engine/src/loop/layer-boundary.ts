import type { TGENode } from "../ffi/node"

/** Maximum number of auto-promoted layers per frame. */
export const AUTO_LAYER_BUDGET = 8

const VALID_WILL_CHANGE_VALUES = new Set(["transform", "opacity", "filter", "scroll"])

/** Check if a node should be promoted to its own compositing layer. */
export function shouldPromoteToLayer(node: TGENode): boolean {
  if (node.props.layer === true) return true
  const wc = node.props.willChange
  if (wc) {
    const values = Array.isArray(wc) ? wc : [wc]
    if (values.some((value) => VALID_WILL_CHANGE_VALUES.has(value))) return true
  }
  return false
}
