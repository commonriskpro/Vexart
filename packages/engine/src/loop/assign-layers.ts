/**
 * assign-layers.ts — Layer types and helpers.
 *
 * Spatial layer assignment has been replaced by inline layer routing
 * in pipeline-traverse.ts.
 */

import type { TGENode } from "../ffi/node"
export type { LayerBoundary, LayerSlot, LayerPlan } from "./types"

/** Resolve a TGENode by its tree path (e.g. "r.0.1.2"). */
export function resolveNodeByPath(fromRoot: TGENode, path: string): TGENode | null {
  const parts = path.split(".")
  let node = fromRoot
  for (let i = 1; i < parts.length; i++) {
    const idx = parseInt(parts[i])
    if (isNaN(idx) || idx >= node.children.length) return null
    node = node.children[idx]
  }
  return node
}
