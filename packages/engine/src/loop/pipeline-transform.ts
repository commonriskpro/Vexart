/**
 * pipeline-transform.ts — Transform matrix composition, hierarchy resolution, Quad projection, and matrix accumulation.
 */

import {
  type TGENode,
  type TGEProps,
  ensureTransformExtra,
} from "../ffi/node"
import {
  type Matrix3,
  fromConfig,
  isIdentity,
  invert,
  multiply,
  translate,
  transformPoint,
} from "../ffi/matrix"
import type { TransformQuad, Point2D } from "../ffi/damage"
import type { WalkTreeState } from "./walk-tree"

/**
 * Resolves transform origin coordinates based on origin prop and box dimensions.
 */
export function resolveTransformOrigin(
  originProp: unknown,
  width: number,
  height: number,
): { ox: number; oy: number } {
  let ox = width / 2
  let oy = height / 2
  if (originProp === "top-left") { ox = 0; oy = 0 }
  else if (originProp === "top-right") { ox = width; oy = 0 }
  else if (originProp === "bottom-left") { ox = 0; oy = height }
  else if (originProp === "bottom-right") { ox = width; oy = height }
  else if (originProp && typeof originProp === "object") {
    const obj = originProp as { x?: number; y?: number }
    if (typeof obj.x === "number") ox = obj.x * width
    if (typeof obj.y === "number") oy = obj.y * height
  }
  return { ox, oy }
}

/**
 * Composes local transform and inverse matrices from transform prop configuration.
 * Returns null if the resulting matrix is identity.
 */
export function composeLocalTransform(
  transformProp: unknown,
  originProp: unknown,
  width: number,
  height: number,
): { local: Matrix3; localInverse: Matrix3 } | null {
  if (!transformProp) return null
  const { ox, oy } = resolveTransformOrigin(originProp, width, height)
  const matrix = fromConfig(transformProp as any, ox, oy)
  if (isIdentity(matrix)) return null
  const inv = invert(matrix)
  if (!inv) return null
  return { local: matrix, localInverse: inv }
}

/**
 * Accumulates local transform with parent absolute forward matrix.
 */
export function accumulateHierarchyTransform(
  absX: number,
  absY: number,
  nodeLocalTransform: Matrix3 | null,
  nodeLocalInverse: Matrix3 | null,
  parentAbsForward: Matrix3 | null,
): { nodeAbsForward: Matrix3 | null; acc: Matrix3 | null; accInverse: Matrix3 | null } {
  if (!nodeLocalTransform && !parentAbsForward) {
    return { nodeAbsForward: null, acc: null, accInverse: null }
  }

  if (nodeLocalTransform) {
    const mNodeAbs = multiply(multiply(translate(absX, absY), nodeLocalTransform), translate(-absX, -absY))
    if (parentAbsForward) {
      const nodeAbsForward = multiply(parentAbsForward, mNodeAbs)
      const forwardLocal = multiply(multiply(translate(-absX, -absY), nodeAbsForward), translate(absX, absY))
      return {
        nodeAbsForward,
        acc: forwardLocal,
        accInverse: invert(forwardLocal),
      }
    }
    return {
      nodeAbsForward: mNodeAbs,
      acc: nodeLocalTransform,
      accInverse: nodeLocalInverse,
    }
  }

  const nodeAbsForward = parentAbsForward
  const forwardLocal = multiply(multiply(translate(-absX, -absY), nodeAbsForward!), translate(absX, absY))
  return {
    nodeAbsForward,
    acc: forwardLocal,
    accInverse: invert(forwardLocal),
  }
}

/**
 * Applies local transform and matrix accumulation to a TGENode.
 */
export function applyNodeTransform(
  node: TGENode,
  props: TGEProps,
  absX: number,
  absY: number,
  width: number,
  height: number,
  parentAbsForward: Matrix3 | null,
  traversalContext: { hasAnyTransforms: boolean },
  state: WalkTreeState,
): {
  nodeAbsForward: Matrix3 | null
  nodeLocalTransform: Matrix3 | null
  nodeLocalInverse: Matrix3 | null
} {
  const hasTransformProp = props.transform !== undefined && props.transform !== null
  let nodeLocalTransform: Matrix3 | null = null
  let nodeLocalInverse: Matrix3 | null = null

  if (hasTransformProp && props.transform && node.kind !== "text") {
    traversalContext.hasAnyTransforms = true
    state.hasAnyTransforms = true
    if (state.layout) (state.layout as any).hasAnyTransforms = true

    const composed = composeLocalTransform(props.transform, props.transformOrigin, width, height)
    if (composed) {
      nodeLocalTransform = composed.local
      nodeLocalInverse = composed.localInverse
    }
  }

  if (nodeLocalTransform || parentAbsForward) {
    const t = ensureTransformExtra(node)
    t.local = nodeLocalTransform
    t.localInverse = nodeLocalInverse

    const accumulated = accumulateHierarchyTransform(
      absX,
      absY,
      nodeLocalTransform,
      nodeLocalInverse,
      parentAbsForward,
    )
    t.acc = accumulated.acc
    t.accInverse = accumulated.accInverse
    return {
      nodeAbsForward: accumulated.nodeAbsForward,
      nodeLocalTransform,
      nodeLocalInverse,
    }
  }

  if (node._transforms) {
    node._transforms = null
  }
  return {
    nodeAbsForward: null,
    nodeLocalTransform: null,
    nodeLocalInverse: null,
  }
}

/**
 * Applies transform setup to the root node of the frame.
 */
export function applyRootTransform(
  root: TGENode,
  rootProps: TGEProps,
  viewportW: number,
  viewportH: number,
  traversalContext: { hasAnyTransforms: boolean },
  state: WalkTreeState,
): Matrix3 | null {
  let rootAbsForward: Matrix3 | null = null
  let rootLocalTransform: Matrix3 | null = null
  let rootLocalInverse: Matrix3 | null = null

  if (rootProps.transform && root.kind !== "text") {
    traversalContext.hasAnyTransforms = true
    state.hasAnyTransforms = true
    if (state.layout) (state.layout as any).hasAnyTransforms = true

    const composed = composeLocalTransform(rootProps.transform, rootProps.transformOrigin, viewportW, viewportH)
    if (composed) {
      rootLocalTransform = composed.local
      rootLocalInverse = composed.localInverse
    }
  }

  if (rootLocalTransform) {
    const t = ensureTransformExtra(root)
    t.local = rootLocalTransform
    t.localInverse = rootLocalInverse
    rootAbsForward = rootLocalTransform
    t.acc = rootLocalTransform
    t.accInverse = rootLocalInverse
  } else {
    if (root._transforms) {
      root._transforms = null
    }
  }

  return rootAbsForward
}

/**
 * Projects a 2D point through a 3x3 transformation matrix.
 */
export function projectPointThroughMatrix(m: Matrix3, x: number, y: number): Point2D {
  return transformPoint(m, x, y)
}

/**
 * Projects a bounding rectangle through a 3x3 transformation matrix into a 4-point Quad.
 */
export function projectRectToQuad(
  m: Matrix3,
  x: number,
  y: number,
  width: number,
  height: number,
): TransformQuad {
  return {
    p0: transformPoint(m, x, y),
    p1: transformPoint(m, x + width, y),
    p2: transformPoint(m, x, y + height),
    p3: transformPoint(m, x + width, y + height),
  }
}

/**
 * Computes axis-aligned bounding box (AABB) enclosing a projected Quad.
 */
export function quadToAABB(quad: TransformQuad): { x: number; y: number; width: number; height: number } {
  const minX = Math.min(quad.p0.x, quad.p1.x, quad.p2.x, quad.p3.x)
  const minY = Math.min(quad.p0.y, quad.p1.y, quad.p2.y, quad.p3.y)
  const maxX = Math.max(quad.p0.x, quad.p1.x, quad.p2.x, quad.p3.x)
  const maxY = Math.max(quad.p0.y, quad.p1.y, quad.p2.y, quad.p3.y)
  return {
    x: Math.floor(minX),
    y: Math.floor(minY),
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
  }
}

/**
 * Checks whether a projected quad is an axis-aligned translation with expected dimensions.
 */
export function isAxisAlignedQuad(quad: TransformQuad, expectedW: number, expectedH: number, epsilon = 1e-6): boolean {
  return (
    Math.abs(quad.p1.x - quad.p0.x - expectedW) < epsilon &&
    Math.abs(quad.p1.y - quad.p0.y) < epsilon &&
    Math.abs(quad.p2.x - quad.p0.x) < epsilon &&
    Math.abs(quad.p2.y - quad.p0.y - expectedH) < epsilon
  )
}
