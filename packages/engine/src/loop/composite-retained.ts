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
import { shouldFreezeInteractionLayer } from "../reconciler/interaction"

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

function isAxisTranslationQuad(node: TGENode, quad: TransformQuad) {
  const epsilon = 1e-6
  return Math.abs(quad.p1.x - quad.p0.x - node.layout.width) < epsilon
    && Math.abs(quad.p1.y - quad.p0.y) < epsilon
    && Math.abs(quad.p2.x - quad.p0.x) < epsilon
    && Math.abs(quad.p2.y - quad.p0.y - node.layout.height) < epsilon
}

function hasCaptureExpansion(node: TGENode, includeTransform = false): boolean {
  const props = resolveProps(node)
  if (props.shadow !== undefined || props.glow !== undefined || props.filter !== undefined) return true
  if (props.backdropBlur !== undefined || props.backdropBrightness !== undefined || props.backdropContrast !== undefined || props.backdropSaturate !== undefined || props.backdropGrayscale !== undefined || props.backdropInvert !== undefined || props.backdropSepia !== undefined || props.backdropHueRotate !== undefined) return true
  if (includeTransform && props.transform !== undefined) return true
  // The boundary transform itself is handled by the axis-translation check;
  // descendants with their own transform require the general capture path.
  return node.children.some((child) => hasCaptureExpansion(child, true))
}

function retainedTransformQuad(node: TGENode, bounds: { x: number; y: number; width: number; height: number }) {
  const quad = computeNodeSubtreeTransformQuad(node)
  if (!quad || !isAxisTranslationQuad(node, quad) || hasCaptureExpansion(node) || shouldFreezeInteractionLayer(node)) return quad

  // paintFrame stores translated layers as viewport-bounded source crops. The
  // retained compositor must map that cropped target to its clipped output
  // rectangle instead of restoring the original wide quad and stretching it.
  return {
    p0: { x: bounds.x, y: bounds.y },
    p1: { x: bounds.x + bounds.width, y: bounds.y },
    p2: { x: bounds.x, y: bounds.y + bounds.height },
    p3: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
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
      subtreeTransform: node ? retainedTransformQuad(node, bounds) : null,
      isBackground: false,
      opacity: typeof vp?.opacity === "number" ? vp.opacity : 1,
    })
  }
  layers.sort((a, b) => a.z - b.z)
  return layers
}
