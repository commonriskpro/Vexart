/**
 * composite-retained.ts — Retained compositor path helpers.
 *
 * Extracted from composite.ts to isolate the compositor-only frame logic:
 *   - computeNodeLocalTransform: resolve a node's transform matrix from props
 *   - computeNodeSubtreeTransformQuad: walk parent chain to build a transform quad
 *   - buildRetainedCompositorLayers: build layer descriptors for retained composition
 */

import { resolveProps, type TGENode } from "../ffi/node"
import { fromConfig, isIdentity, multiply, transformPoint, translate } from "../ffi/matrix"
import type { RendererBackendRetainedLayer } from "../ffi/renderer-backend"
import type { TransformQuad } from "../ffi/damage"
import type { Layer } from "../ffi/layers"

// ── Transform helpers ────────────────────────────────────────────────────

export function computeNodeLocalTransform(node: TGENode) {
  const vp = resolveProps(node)
  if (!vp.transform) return null
  const l = node.layout
  const originProp = vp.transformOrigin
  let ox = l.width / 2
  let oy = l.height / 2
  if (originProp === "top-left") { ox = 0; oy = 0 }
  else if (originProp === "top-right") { ox = l.width; oy = 0 }
  else if (originProp === "bottom-left") { ox = 0; oy = l.height }
  else if (originProp === "bottom-right") { ox = l.width; oy = l.height }
  else if (originProp && typeof originProp === "object") { ox = originProp.x * l.width; oy = originProp.y * l.height }
  const matrix = fromConfig(vp.transform, ox, oy)
  return isIdentity(matrix) ? null : matrix
}

export function computeNodeSubtreeTransformQuad(node: TGENode): TransformQuad | null {
  const chain: TGENode[] = []
  let current: TGENode | null = node
  while (current) {
    const matrix = computeNodeLocalTransform(current)
    if (matrix) chain.push(current)
    current = current.parent
  }
  if (chain.length === 0) return null
  chain.reverse()

  const transformAbsolutePoint = (x: number, y: number) => {
    let point = { x, y }
    for (const target of chain) {
      const matrix = computeNodeLocalTransform(target)
      if (!matrix) continue
      const l = target.layout
      const absolute = multiply(multiply(translate(l.x, l.y), matrix), translate(-l.x, -l.y))
      point = transformPoint(absolute, point.x, point.y)
    }
    return point
  }

  const x = node.layout.x
  const y = node.layout.y
  const w = node.layout.width
  const h = node.layout.height
  return {
    p0: transformAbsolutePoint(x, y),
    p1: transformAbsolutePoint(x + w, y),
    p2: transformAbsolutePoint(x, y + h),
    p3: transformAbsolutePoint(x + w, y + h),
  }
}

// ── Retained compositor layer builder ────────────────────────────────────

export function buildRetainedCompositorLayers(
  layerCache: Map<string, Layer>,
  nodeRefById: Map<number, TGENode>,
): RendererBackendRetainedLayer[] {
  const layers: RendererBackendRetainedLayer[] = []
  for (const [key, layer] of layerCache) {
    const bounds = { x: layer.x, y: layer.y, width: layer.width, height: layer.height }
    if (key === "bg") {
      layers.push({ key, z: layer.z, bounds, subtreeTransform: null, isBackground: true, opacity: 1 })
      continue
    }
    if (!key.startsWith("layer:")) continue
    const nodeId = Number(key.slice(6))
    const node = nodeRefById.get(nodeId) ?? null
    const vp = node ? resolveProps(node) : null
    layers.push({
      key,
      z: layer.z,
      bounds,
      subtreeTransform: node ? computeNodeSubtreeTransformQuad(node) : null,
      isBackground: false,
      opacity: typeof vp?.opacity === "number" ? vp.opacity : 1,
    })
  }
  layers.sort((a, b) => a.z - b.z)
  return layers
}
