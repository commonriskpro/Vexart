/**
 * Text utility helpers for tree traversal and rendering.
 */

import type { TGENode } from "../ffi/node-types"

/**
 * Collect all text content from a node's children recursively.
 * Used to resolve text content for text nodes that have children
 * instead of a direct `text` property (rich-text pattern).
 */
export function collectText(node: TGENode): string {
  if (node.text) return node.text
  let result = ""
  for (const child of node.children) {
    result += collectText(child)
  }
  return result
}
