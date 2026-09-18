/**
 * pipeline-traverse.ts — Unified pre-order DFS layout writeback, layer routing, and op emission.
 *
 * Replaces walkTree array population + endLayout + writeLayoutBack + buildRenderGraphFrame
 * in a single high-performance pre-order traversal over the TGENode tree.
 *
 * Architectural guarantees:
 *   - Snapshot-and-restore atomicity on error paths (Layout never half-written).
 *   - Zero placeholder matrices for effects (computed directly before op emission).
 *   - Stacking-sorted child recursion with deferred root/element-attached floats.
 *   - Direct RenderGraphOp emission into active LayerOpBucket.
 *   - Symmetrical lifecycle: clip and layer push/pop strictly balanced.
 */

import {
  type TGENode,
  type TGEProps,
  resolveProps,
  parseColor,
  ensureImageExtra,
  ensureCanvasExtra,
  getGridLayoutError,
} from "../ffi/node"
import {
  CMD,
  type RenderGraphOp,
  type RectangleRenderOp,
  type TextRenderOp,
  type BorderRenderOp,
  type ImageRenderOp,
  type CanvasRenderOp,
  type EffectRenderOp,
  type EffectConfig,
  type ImagePaintConfig,
  type CanvasPaintConfig,
  type BackdropRenderMetadata,
  type BackdropFilterParams,
  type BackdropFilterKind,
  BACKDROP_FILTER_KIND,
  type RenderBounds,
  setRenderOpClipStack,
} from "../ffi/render-graph"
import { type DamageRect, unionRect } from "../ffi/damage"
import {
  type Matrix3,
  fromConfig,
  isIdentity,
  invert,
  multiply,
  translate,
} from "../ffi/matrix"
import {
  CanvasContext,
  serializeCanvasDisplayList,
  hashCanvasDisplayList,
} from "../ffi/canvas"
import { normalizeTextForLayout } from "../ffi/text-layout"
import { type WalkTreeState, collectText } from "./walk-tree"
import {
  type PipelineContext,
  type LayerOpBucket,
  type ClipEntry,
  type ClipBounds,
  createPipelineContext,
  snapshotLayouts,
  restoreLayouts,
  pushClip,
  popClip,
  getCurrentClipBounds,
  pushLayer,
  popLayer,
  emitOp,
} from "./pipeline-types"
import { decodeImageForNode } from "./image"
import {
  hasBackdropEffect,
  isInteractiveNode,
  BACKDROP_FIELDS,
} from "./predicates"
import { AUTO_LAYER_BUDGET, shouldPromoteToLayer } from "./layer-boundary"
import { shouldPromoteInteractionLayer } from "../reconciler/interaction"
import { ATTACH_POINT, ATTACH_TO } from "./layout-adapter"

// ── Traversal Result ────────────────────────────────────────────────────────

export type TraversalResult = {
  success: boolean
  layerBuckets: LayerOpBucket[]
  hasAnyTransforms: boolean
  error?: unknown
}

// ── Module Constants & Singletons ──────────────────────────────────────────

const AUTO_LAYER_MIN_AREA = 64 * 64

const BACKDROP_PARAM_KEYS = [
  "blur", "brightness", "contrast", "saturate",
  "grayscale", "invert", "sepia", "hueRotate",
] as const

const warnedRawTextNodes = new Set<number>()

const effectPool: EffectConfig[] = []
let effectPoolIdx = 0
let autoLayerCount = 0

const transformHashF64 = new Float64Array(9)
const transformHashU8 = new Uint8Array(transformHashF64.buffer)
const effectHashBuf = new ArrayBuffer(512)
const effectHashView = new DataView(effectHashBuf)
const effectHashU8 = new Uint8Array(effectHashBuf)

function claimEffect(): EffectConfig {
  const effect = effectPool[effectPoolIdx] ?? { color: 0 }
  effectPool[effectPoolIdx++] = effect
  effect.renderObjectId = undefined
  effect.color = 0
  effect.shadow = undefined
  effect.glow = undefined
  effect.gradient = undefined
  for (const f of BACKDROP_FIELDS) effect[f] = undefined
  effect.opacity = undefined
  effect.cornerRadii = undefined
  if (effect.transform?.length === 9) {
    effect._transformBuf = effect.transform
  }
  effect.transform = undefined
  effect.transformInverse = undefined
  effect.transformBounds = undefined
  effect.filter = undefined
  effect._node = undefined
  effect._stateHash = undefined
  return effect
}

// ── Hashing & Metadata Utilities ────────────────────────────────────────────

function fnv1a(data: ArrayLike<number>): number {
  let h = 0x811c9dc5
  for (let i = 0; i < data.length; i++) {
    h ^= data[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function hashU32Scratch(a: number, b: number, c: number, d: number, e: number): number {
  let h = 0x811c9dc5
  const mix = (input: number) => {
    let value = input >>> 0
    for (let i = 0; i < 4; i++) {
      h ^= value & 0xff
      h = Math.imul(h, 0x01000193)
      value >>>= 8
    }
  }
  mix(a); mix(b); mix(c); mix(d); mix(e)
  return h >>> 0
}

function createClipStateId(stack: ClipEntry[]): number {
  if (stack.length === 0) return 0
  let h = 0x811c9dc5
  for (let i = 0; i < stack.length; i++) {
    const entry = stack[i]
    let value = hashU32Scratch(i, entry.x, entry.y, entry.width, entry.height)
    for (let b = 0; b < 4; b++) {
      h ^= value & 0xff
      h = Math.imul(h, 0x01000193)
      value >>>= 8
    }
  }
  return h >>> 0
}

function getTransformMatrix(effect: EffectConfig): Matrix3 | Float64Array | null {
  const node = effect._node
  if (node?._accTransform) return node._accTransform
  if (node?._transform) return node._transform
  if (effect.transform) return effect.transform
  return null
}

function getTransformStateId(effect: EffectConfig): number {
  const matrix = getTransformMatrix(effect)
  if (!matrix) return 0
  for (let i = 0; i < 9; i++) {
    transformHashF64[i] = Number.isFinite(matrix[i]) ? matrix[i] : 0
  }
  return fnv1a(transformHashU8)
}

function getBackdropFilterParams(effect: EffectConfig): BackdropFilterParams {
  const params = {} as BackdropFilterParams
  for (let i = 0; i < BACKDROP_FIELDS.length; i++) {
    params[BACKDROP_PARAM_KEYS[i]] = effect[BACKDROP_FIELDS[i]] ?? null
  }
  return params
}

function getBackdropFilterKind(params: BackdropFilterParams): BackdropFilterKind {
  const hasBlur = params.blur !== null && params.blur > 0
  const hasColor =
    params.brightness !== null ||
    params.contrast !== null ||
    params.saturate !== null ||
    params.grayscale !== null ||
    params.invert !== null ||
    params.sepia !== null ||
    params.hueRotate !== null
  if (hasBlur && hasColor) return BACKDROP_FILTER_KIND.BLUR_COLOR
  if (hasBlur) return BACKDROP_FILTER_KIND.BLUR
  return BACKDROP_FILTER_KIND.COLOR
}

function getEffectStateId(effect: EffectConfig, radius = 0): number {
  if (effect._stateHash !== undefined && effect._node?._vpDirty === false) return effect._stateHash
  let offset = 0
  const writeU32 = (value: number) => { effectHashView.setUint32(offset, value >>> 0, true); offset += 4 }
  const writeF64 = (value: number) => { effectHashView.setFloat64(offset, Number.isFinite(value) ? value : 0, true); offset += 8 }
  writeU32(effect.color)
  writeF64(radius)
  if (Array.isArray(effect.shadow)) {
    for (let i = 0; i < effect.shadow.length; i++) {
      const entry = effect.shadow[i]
      writeF64(entry.x)
      writeF64(entry.y)
      writeF64(entry.blur)
      writeU32(entry.color)
    }
  } else if (effect.shadow) {
    writeF64(effect.shadow.x)
    writeF64(effect.shadow.y)
    writeF64(effect.shadow.blur)
    writeU32(effect.shadow.color)
  }
  if (effect.glow) {
    writeF64(effect.glow.radius)
    writeU32(effect.glow.color)
    writeF64(effect.glow.intensity)
  }
  if (effect.gradient) {
    writeU32(effect.gradient.type === "linear" ? 1 : 2)
    writeU32(effect.gradient.from)
    writeU32(effect.gradient.to)
    writeF64(effect.gradient.type === "linear" ? effect.gradient.angle : 0)
  }
  const params = getBackdropFilterParams(effect)
  writeF64(params.blur ?? -1)
  writeF64(params.brightness ?? -1)
  writeF64(params.contrast ?? -1)
  writeF64(params.saturate ?? -1)
  writeF64(params.grayscale ?? -1)
  writeF64(params.invert ?? -1)
  writeF64(params.sepia ?? -1)
  writeF64(params.hueRotate ?? -1)
  const selfFilter = effect.filter
  writeF64(selfFilter?.blur ?? -1)
  writeF64(selfFilter?.brightness ?? -1)
  writeF64(selfFilter?.contrast ?? -1)
  writeF64(selfFilter?.saturate ?? -1)
  writeF64(selfFilter?.grayscale ?? -1)
  writeF64(selfFilter?.invert ?? -1)
  writeF64(selfFilter?.sepia ?? -1)
  writeF64(selfFilter?.hueRotate ?? -1)
  writeF64(effect.opacity ?? -1)
  if (effect.cornerRadii) {
    writeF64(effect.cornerRadii.tl)
    writeF64(effect.cornerRadii.tr)
    writeF64(effect.cornerRadii.br)
    writeF64(effect.cornerRadii.bl)
  }
  const hash = fnv1a(effectHashU8.subarray(0, offset))
  effect._stateHash = hash
  return hash
}

function createBackdropSourceKey(effect: EffectConfig, clipStateId: number, transformStateId: number): string {
  const node = effect._node
  const parentId = node?.parent?.id ?? 0
  const layerId = node?.props.layer ? node.id : parentId
  return "backdrop-source:layer:" + layerId + ":parent:" + parentId + ":" + clipStateId + ":" + transformStateId
}

function intersectBounds(a: RenderBounds, b: { x: number; y: number; width: number; height: number }): RenderBounds | null {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= left || bottom <= top) return null
  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(0, Math.round(right - left)),
    height: Math.max(0, Math.round(bottom - top)),
  }
}

function createBackdropMetadata(
  effect: EffectConfig,
  absX: number,
  absY: number,
  width: number,
  height: number,
  cornerRadius: number,
  clipBounds: ClipBounds | null,
  clipStack: ClipEntry[],
): BackdropRenderMetadata | null {
  if (!hasBackdropEffect(effect)) return null
  const inputBounds: RenderBounds = {
    x: Math.round(absX),
    y: Math.round(absY),
    width: Math.max(0, Math.round(width)),
    height: Math.max(0, Math.round(height)),
  }
  const stackClipBounds = clipBounds
  const bounds = stackClipBounds
    ? intersectBounds(inputBounds, stackClipBounds) ?? {
        x: Math.max(stackClipBounds.x, inputBounds.x),
        y: Math.max(stackClipBounds.y, inputBounds.y),
        width: 0,
        height: 0,
      }
    : inputBounds
  const outputBounds = bounds
  const blurPad = effect.backdropBlur ? Math.ceil(effect.backdropBlur) : 0
  const sampleBounds: RenderBounds = {
    x: Math.round(outputBounds.x - blurPad),
    y: Math.round(outputBounds.y - blurPad),
    width: Math.max(0, Math.round(outputBounds.width + blurPad * 2)),
    height: Math.max(0, Math.round(outputBounds.height + blurPad * 2)),
  }
  const filterParams = getBackdropFilterParams(effect)
  const transformStateId = getTransformStateId(effect)
  const clipStateId = createClipStateId(clipStack)
  const effectStateId = getEffectStateId(effect, Math.round(cornerRadius))
  return {
    backdropSourceKey: createBackdropSourceKey(effect, clipStateId, transformStateId),
    filterKind: getBackdropFilterKind(filterParams),
    filterParams,
    inputBounds,
    sampleBounds,
    outputBounds,
    clipBounds: bounds,
    transformStateId,
    clipStateId,
    effectStateId,
  }
}

function attachClipStackToOp(op: RenderGraphOp, ctx: PipelineContext): void {
  const stack = ctx.clip.stack
  if (stack.length === 0) return
  const clipEntries = stack.map((entry, depth) => ({
    bounds: { x: entry.x, y: entry.y, width: entry.width, height: entry.height },
    id: hashU32Scratch(depth, entry.x, entry.y, entry.width, entry.height),
    nodeId: entry.nodeId,
  }))
  setRenderOpClipStack(op, clipEntries)
}

// ── Geometric & Traversal Helpers ───────────────────────────────────────────

export const pointOnRect = (point: number, w: number, h: number): { x: number; y: number } => {
  const col = Math.max(0, Math.min(2, Math.floor(point / 3)))
  const row = Math.max(0, Math.min(2, point % 3))
  return { x: w * (col / 2), y: h * (row / 2) }
}

function findElementTarget(targetKey: string, state: WalkTreeState): TGENode | undefined {
  const targetId = hashString(targetKey)
  const byId = state.nodeRefById.get(targetId)
  if (byId) return byId
  for (const node of state.nodeRefById.values()) {
    if ((node.props as Record<string, unknown>).id === targetKey) return node
  }
  return undefined
}

function hasPromotableArea(node: TGENode): boolean {
  return node.layout.width * node.layout.height >= AUTO_LAYER_MIN_AREA
}

function maxInteractiveBorder(props: TGEProps): number {
  return Math.max(
    props.focusStyle?.borderWidth ?? 0,
    props.hoverStyle?.borderWidth ?? 0,
    props.activeStyle?.borderWidth ?? 0,
  )
}

function isNonEmptyLayoutRect(rect: { width: number; height: number }): boolean {
  return rect.width > 0 && rect.height > 0
}

export function damageRectForLayoutTransition(
  prev: { x: number; y: number; width: number; height: number },
  next: { x: number; y: number; width: number; height: number },
): DamageRect | null {
  if (prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height) return null
  const prevRect = isNonEmptyLayoutRect(prev)
    ? { x: prev.x, y: prev.y, width: prev.width, height: prev.height }
    : null
  const nextRect = isNonEmptyLayoutRect(next)
    ? { x: next.x, y: next.y, width: next.width, height: next.height }
    : null
  if (!prevRect && !nextRect) return null
  if (!prevRect) return nextRect
  if (!nextRect) return prevRect
  return unionRect(prevRect, nextRect)
}

export function sortChildrenByStackingOrder(children: TGENode[]): TGENode[] {
  let hasFloating = false
  for (let i = 0; i < children.length; i++) {
    if (children[i].props.floating) {
      hasFloating = true
      break
    }
  }
  if (!hasFloating) return children
  return [...children].sort((a, b) => {
    const za = a.props.floating ? (a.props.zIndex ?? 0) : 0
    const zb = b.props.floating ? (b.props.zIndex ?? 0) : 0
    const z = za - zb
    if (z !== 0) return z
    return (a._siblingIndex ?? 0) - (b._siblingIndex ?? 0)
  })
}

function collectAllNodes(node: TGENode, out: TGENode[] = []): TGENode[] {
  out.push(node)
  for (let i = 0; i < node.children.length; i++) {
    collectAllNodes(node.children[i], out)
  }
  return out
}

function registerCulledSubtree(node: TGENode, state: WalkTreeState): void {
  state.nodeRefById.set(node.id, node)
  for (let i = 0; i < node.children.length; i++) {
    registerCulledSubtree(node.children[i], state)
  }
}

function isolatesSubtree(node: TGENode, props: TGEProps): boolean {
  return node.kind !== "text" && node.children.length > 0 && (
    props.filter !== undefined ||
    (typeof props.opacity === "number" && props.opacity < 1)
  )
}

// ── Core Pre-Order DFS Node Visitor ─────────────────────────────────────────

function visitNode(
  node: TGENode,
  parentAbsX: number,
  parentAbsY: number,
  parentAbsForward: Matrix3 | null,
  parentDepth: number,
  parentScrollContainerId: number,
  insideScroll: boolean,
  insideTransform: boolean,
  insideIsolation: boolean,
  currentLayerKey: string,
  ctx: PipelineContext,
  state: WalkTreeState,
  viewportW: number,
  viewportH: number,
  deferredRootFloats: TGENode[],
  deferredElementFloats: TGENode[],
  traversalContext: { hasAnyTransforms: boolean },
): void {
  if (typeof node._flexNode?.isGridMode === "function" && getGridLayoutError(node)) {
    throw new Error("Grid layout error on node " + node.id)
  }

  const flexNode = node._flexNode
  const compLeft = flexNode ? flexNode.getComputedLeft() : 0
  const compTop = flexNode ? flexNode.getComputedTop() : 0
  const compWidth = flexNode ? flexNode.getComputedWidth() : 0
  const compHeight = flexNode ? flexNode.getComputedHeight() : 0

  if (!Number.isFinite(compLeft) || !Number.isFinite(compTop) || !Number.isFinite(compWidth) || !Number.isFinite(compHeight)) {
    throw new Error("Non-finite layout coordinates for node " + node.id)
  }

  const props = resolveProps(node)
  let absX = parentAbsX + compLeft
  let absY = parentAbsY + compTop
  const width = compWidth
  const height = compHeight

  if (props.floating) {
    const f = props.floating
    let anchorX = parentAbsX
    let anchorY = parentAbsY
    let anchorWidth = node.parent ? node.parent.layout.width : viewportW
    let anchorHeight = node.parent ? node.parent.layout.height : viewportH

    if (f === "root") {
      anchorX = 0
      anchorY = 0
      anchorWidth = viewportW
      anchorHeight = viewportH
    } else if (typeof f === "object" && f.attachTo) {
      const targetNode = findElementTarget(f.attachTo, state)
      if (targetNode && targetNode !== node) {
        anchorX = targetNode.layout.x
        anchorY = targetNode.layout.y
        anchorWidth = targetNode.layout.width
        anchorHeight = targetNode.layout.height
      }
    }

    const ape = props.floatAttach?.element ?? ATTACH_POINT.LEFT_TOP
    const app = props.floatAttach?.parent ?? ATTACH_POINT.LEFT_TOP
    const ox = props.floatOffset?.x ?? 0
    const oy = props.floatOffset?.y ?? 0

    const parentPoint = pointOnRect(app, anchorWidth, anchorHeight)
    const elementPoint = pointOnRect(ape, width, height)
    absX = anchorX + parentPoint.x - elementPoint.x + ox
    absY = anchorY + parentPoint.y - elementPoint.y + oy
  }

  const prevLayout = {
    x: node.layout.x,
    y: node.layout.y,
    width: node.layout.width,
    height: node.layout.height,
  }

  const isScroll = !!(props.scrollX || props.scrollY)
  const hasTransformProp = props.transform !== undefined && props.transform !== null

  let isCulled = false
  if (
    state.cullingEnabled &&
    !insideTransform &&
    !hasTransformProp &&
    !isScroll &&
    node.children.length > 0 &&
    state.viewportWidth !== undefined &&
    state.viewportHeight !== undefined
  ) {
    if (prevLayout.width > 0 && prevLayout.height > 0) {
      const fullyLeft = prevLayout.x + prevLayout.width <= 0
      const fullyRight = prevLayout.x >= state.viewportWidth
      const fullyAbove = prevLayout.y + prevLayout.height <= 0
      const fullyBelow = prevLayout.y >= state.viewportHeight
      if (fullyLeft || fullyRight || fullyAbove || fullyBelow) {
        isCulled = true
        if (state.culledCount) state.culledCount.value++
        registerCulledSubtree(node, state)
      }
    }
  }

  node.layout.x = absX
  node.layout.y = absY
  node.layout.width = width
  node.layout.height = height

  const damage = damageRectForLayoutTransition(prevLayout, node.layout)
  if (damage && (state as any).pendingNodeDamageRects) {
    (state as any).pendingNodeDamageRects.push({ nodeId: node.id, rect: damage })
  }

  const dfsIndex = ctx.dfsIndex++
  if (state.nodeCount) state.nodeCount.value++
  node._dfsIndex = dfsIndex
  node._depth = parentDepth
  node._scrollContainerId = parentScrollContainerId
  state.nodeRefById.set(node.id, node)

  if (node.kind === "text") {
    state.textNodes.push(node)
  } else {
    state.boxNodes.push(node)
    if (isScroll) {
      state.scrollContainers.push(node)
      if (props.scrollSpeed && state.scrollSpeedCap) {
        state.scrollSpeedCap.value = props.scrollSpeed
      }
    }
  }

  if (node.kind === "img") {
    const extra = ensureImageExtra(node)
    if (extra.state === "idle" && props.src) {
      decodeImageForNode(node)
    }
    const imgBuf = extra.buffer
    const isGridItem = node.parent?.props.layout === "grid"
    if (imgBuf && !node._widthSizing && !isGridItem && node._flexNode) {
      node._flexNode.setWidth(imgBuf.width)
    }
    if (imgBuf && !node._heightSizing && !isGridItem && node._flexNode) {
      node._flexNode.setHeight(imgBuf.height)
    }
  }

  if (node.kind === "canvas" && props.onDraw) {
    const extra = ensureCanvasExtra(node)
    const viewportKey = props.viewport ? (props.viewport.x + "," + props.viewport.y + "," + props.viewport.zoom) : "default"
    const drawCacheKey = props.drawCacheKey === undefined ? null : (props.drawCacheKey + ":" + viewportKey)
    const canReuseCommands =
      drawCacheKey !== null &&
      extra.drawCacheKey === drawCacheKey &&
      extra.displayListCommands !== null &&
      extra.displayListHash !== null

    let commands = extra.displayListCommands
    if (!canReuseCommands) {
      const canvasCtx = new CanvasContext(props.viewport)
      props.onDraw(canvasCtx)
      commands = canvasCtx._commands
      const serializedBytes = serializeCanvasDisplayList(commands)
      extra.drawCacheKey = drawCacheKey
      extra.displayListCommands = commands
      extra.displayListHash = hashCanvasDisplayList(serializedBytes)
    }
  }

  let nodeAbsForward = parentAbsForward
  let nodeLocalTransform: Matrix3 | null = null
  let nodeLocalInverse: Matrix3 | null = null

  if (hasTransformProp && props.transform && node.kind !== "text") {
    traversalContext.hasAnyTransforms = true
    state.hasAnyTransforms = true
    if (state.layout) (state.layout as any).hasAnyTransforms = true

    const originProp = props.transformOrigin
    let ox = width / 2
    let oy = height / 2
    if (originProp === "top-left") { ox = 0; oy = 0 }
    else if (originProp === "top-right") { ox = width; oy = 0 }
    else if (originProp === "bottom-left") { ox = 0; oy = height }
    else if (originProp === "bottom-right") { ox = width; oy = height }
    else if (originProp && typeof originProp === "object") {
      ox = originProp.x * width
      oy = originProp.y * height
    }

    const matrix = fromConfig(props.transform, ox, oy)
    if (!isIdentity(matrix)) {
      nodeLocalTransform = matrix
      nodeLocalInverse = invert(matrix)
    }
  }

  node._transform = nodeLocalTransform
  node._transformInverse = nodeLocalInverse

  if (nodeLocalTransform) {
    const mNodeAbs = multiply(multiply(translate(absX, absY), nodeLocalTransform), translate(-absX, -absY))
    if (parentAbsForward) {
      nodeAbsForward = multiply(parentAbsForward, mNodeAbs)
      const forwardLocal = multiply(multiply(translate(-absX, -absY), nodeAbsForward), translate(absX, absY))
      node._accTransform = forwardLocal
      node._accTransformInverse = invert(forwardLocal)
    } else {
      nodeAbsForward = mNodeAbs
      node._accTransform = nodeLocalTransform
      node._accTransformInverse = nodeLocalInverse
    }
  } else if (parentAbsForward) {
    nodeAbsForward = parentAbsForward
    const forwardLocal = multiply(multiply(translate(-absX, -absY), nodeAbsForward), translate(absX, absY))
    node._accTransform = forwardLocal
    node._accTransformInverse = invert(forwardLocal)
  } else {
    nodeAbsForward = null
    node._accTransform = null
    node._accTransformInverse = null
  }

  const hasSubtreeTransform = !!(props.transform && node.children.length > 0)
  const transformedInsideScroll = insideScroll && hasSubtreeTransform
  const insideTransformedScrollSubtree = insideScroll && insideTransform
  const isInteractionLayer = shouldPromoteInteractionLayer(node)
  const hasBackdrop = hasBackdropEffect(props)

  let shouldBoundary = false
  if (transformedInsideScroll || insideTransformedScrollSubtree) {
    node._autoLayer = false
  } else if (!insideIsolation && shouldPromoteToLayer(node)) {
    node._autoLayer = false
    shouldBoundary = true
  } else if (!insideIsolation && !insideScroll && (isInteractionLayer || hasSubtreeTransform)) {
    node._autoLayer = false
    shouldBoundary = true
  } else if (node._autoLayer === true && node._unstableFrameCount >= 3) {
    node._autoLayer = false
    node._stableFrameCount = 0
    node._unstableFrameCount = 0
  } else if (!insideIsolation && !hasBackdrop && node._stableFrameCount >= 3 && hasPromotableArea(node) && autoLayerCount < AUTO_LAYER_BUDGET) {
    node._autoLayer = true
    autoLayerCount++
    shouldBoundary = true
  }

  const shouldPushLayer = shouldBoundary || (isScroll && !insideIsolation)

  let activeLayerKey = currentLayerKey
  if (shouldPushLayer) {
    activeLayerKey = "layer:" + node.id
    pushLayer(ctx, activeLayerKey, node.id)
    state.layerBoundaries.push({
      path: "",
      nodeId: node.id,
      z: state.layerBoundaries.length,
      isScroll,
      hasBg: props.backgroundColor !== undefined,
      insideScroll,
      hasSubtreeTransform,
    })
  }
  node._layerKey = activeLayerKey

  if (node.kind === "text") {
    const content = node.text || collectText(node)
    if (!content) {
      if (shouldPushLayer) popLayer(ctx)
      return
    }

    if (node.parent && node.parent.kind === "box" && node.text.length > 0 && process.env.NODE_ENV !== "production") {
      if (!warnedRawTextNodes.has(node.id)) {
        warnedRawTextNodes.add(node.id)
        console.warn("[Vexart] Warning: Raw text string \"" + content.slice(0, 30) + "\" placed directly inside <box>. Wrap text in <text>...</text> to ensure proper typography and layout.")
      }
    }

    const renderContent = normalizeTextForLayout(content, props.whiteSpace)
    const color = (props.color !== undefined ? parseColor(props.color) : 0xe0e0e0ff) >>> 0
    const fontSize = props.fontSize ?? 14
    const fontId = props.fontId ?? 0
    const lineHeight = props.lineHeight ?? Math.ceil(fontSize * 1.2)
    const maxWidth = Math.max(Math.round(width), 1)
    const textHeight = Math.round(height) > 0 ? Math.round(height) : lineHeight

    const textOp: TextRenderOp = {
      kind: "text",
      renderObjectId: null,
      type: CMD.TEXT,
      x: absX,
      y: absY,
      width,
      height,
      color,
      cornerRadius: 0,
      extra1: fontSize,
      extra2: fontId,
      text: renderContent,
      fontId,
      fontSize,
      lineHeight,
      maxWidth,
      textHeight,
      nodeId: node.id,
      fontFamily: props.fontFamily as string | undefined,
      fontWeight: props.fontWeight as number | undefined,
      fontStyle: props.fontStyle as string | undefined,
      whiteSpace: props.whiteSpace,
      wordBreak: props.wordBreak,
      clipBounds: getCurrentClipBounds(ctx),
    }
    attachClipStackToOp(textOp, ctx)
    emitOp(ctx, textOp)
    if (shouldPushLayer) popLayer(ctx)
    return
  }

  if (node.kind === "img") {
    state.rectNodes.push(node)
    state.rectNodeById.set(node.id, node)
    const extra = ensureImageExtra(node)
    const imgBuf = extra.buffer
    const placeholderColor = 0x00000001
    const radius = props.cornerRadius ?? props.borderRadius ?? 0
    const imageConfig: ImagePaintConfig | null = imgBuf
      ? {
          renderObjectId: node.id,
          color: placeholderColor,
          cornerRadius: radius,
          imageBuffer: imgBuf,
          nativeImageHandle: extra.nativeHandle,
          objectFit: props.objectFit ?? "contain",
        }
      : null

    let effectConfig: EffectConfig | null = null
    const hasBackdrop = hasBackdropEffect(props)
    const hasTransform = props.transform !== undefined && props.transform !== null
    if (props.shadow || props.glow || props.gradient || hasBackdrop || props.cornerRadii || props.opacity !== undefined || hasTransform || props.filter) {
      effectConfig = claimEffect()
      effectConfig.renderObjectId = node.id
      effectConfig.color = placeholderColor
      effectConfig._node = node

      if (props.shadow) {
        effectConfig.shadow = props.shadow as typeof effectConfig.shadow
      }
      if (props.glow) {
        effectConfig.glow = {
          radius: props.glow.radius,
          color: typeof props.glow.color === "number" ? props.glow.color : parseColor(props.glow.color),
          intensity: props.glow.intensity ?? 80,
        }
      }
      if (props.gradient) {
        const g = props.gradient
        if (g.type === "linear") {
          effectConfig.gradient = {
            type: "linear",
            from: typeof g.from === "number" ? g.from : parseColor(g.from),
            to: typeof g.to === "number" ? g.to : parseColor(g.to),
            angle: g.angle ?? 90,
          }
        } else {
          effectConfig.gradient = {
            type: "radial",
            from: typeof g.from === "number" ? g.from : parseColor(g.from),
            to: typeof g.to === "number" ? g.to : parseColor(g.to),
          }
        }
      }
      for (const f of BACKDROP_FIELDS) {
        if (props[f] !== undefined) effectConfig[f] = props[f]
      }
      if (props.opacity !== undefined) effectConfig.opacity = props.opacity
      if (props.cornerRadii) effectConfig.cornerRadii = props.cornerRadii
      if (props.filter) effectConfig.filter = props.filter

      effectConfig.transform = node._transform ?? undefined
      effectConfig.transformInverse = node._transformInverse ?? undefined
    }

    const rectOp: RectangleRenderOp = {
      kind: "rectangle",
      renderObjectId: node.id,
      type: CMD.RECTANGLE,
      x: absX,
      y: absY,
      width,
      height,
      color: placeholderColor,
      cornerRadius: radius,
      radius,
      extra1: 0,
      extra2: 0,
      nodeId: node.id,
      image: imageConfig,
      canvas: null,
      effect: effectConfig,
      clipBounds: getCurrentClipBounds(ctx),
    }

    if (imageConfig) {
      const imageOp: ImageRenderOp = {
        kind: "image",
        renderObjectId: node.id,
        type: CMD.RECTANGLE,
        x: absX,
        y: absY,
        width,
        height,
        color: placeholderColor,
        cornerRadius: radius,
        extra1: 0,
        extra2: 0,
        nodeId: node.id,
        rect: rectOp,
        image: imageConfig,
        clipBounds: getCurrentClipBounds(ctx),
      }
      attachClipStackToOp(imageOp, ctx)
      emitOp(ctx, imageOp)
    } else if (effectConfig) {
      const backdrop = createBackdropMetadata(effectConfig, absX, absY, width, height, radius, getCurrentClipBounds(ctx), ctx.clip.stack)
      const transformStateId = backdrop?.transformStateId ?? getTransformStateId(effectConfig)
      const clipStateId = backdrop?.clipStateId ?? createClipStateId(ctx.clip.stack)
      const effectStateId = backdrop?.effectStateId ?? getEffectStateId(effectConfig, radius)

      const effectOp: EffectRenderOp = {
        kind: "effect",
        renderObjectId: node.id,
        type: CMD.RECTANGLE,
        x: absX,
        y: absY,
        width,
        height,
        color: placeholderColor,
        cornerRadius: radius,
        extra1: 0,
        extra2: 0,
        nodeId: node.id,
        rect: rectOp,
        effect: effectConfig,
        backdrop,
        transformStateId,
        clipStateId,
        effectStateId,
        clipBounds: getCurrentClipBounds(ctx),
      }
      attachClipStackToOp(effectOp, ctx)
      emitOp(ctx, effectOp)
    } else {
      attachClipStackToOp(rectOp, ctx)
      emitOp(ctx, rectOp)
    }
    if (shouldPushLayer) popLayer(ctx)
    return
  }

  if (node.kind === "canvas") {
    state.rectNodes.push(node)
    state.rectNodeById.set(node.id, node)
    const extra = ensureCanvasExtra(node)
    const placeholderColor = (((node.id & 0x00ffffff) << 8) | 0x02) >>> 0
    let canvasConfig: CanvasPaintConfig | null = null
    if (props.onDraw) {
      canvasConfig = {
        renderObjectId: node.id,
        color: placeholderColor,
        onDraw: props.onDraw,
        displayListCommands: extra.displayListCommands ?? undefined,
        viewport: props.viewport,
        displayListHash: extra.displayListHash,
      }
    }

    const rectOp: RectangleRenderOp = {
      kind: "rectangle",
      renderObjectId: node.id,
      type: CMD.RECTANGLE,
      x: absX,
      y: absY,
      width,
      height,
      color: placeholderColor,
      cornerRadius: 0,
      radius: 0,
      extra1: 0,
      extra2: 0,
      nodeId: node.id,
      image: null,
      canvas: canvasConfig,
      effect: null,
      clipBounds: getCurrentClipBounds(ctx),
    }

    if (canvasConfig) {
      const canvasOp: CanvasRenderOp = {
        kind: "canvas",
        renderObjectId: node.id,
        type: CMD.RECTANGLE,
        x: absX,
        y: absY,
        width,
        height,
        color: placeholderColor,
        cornerRadius: 0,
        extra1: 0,
        extra2: 0,
        nodeId: node.id,
        rect: rectOp,
        canvas: canvasConfig,
        clipBounds: getCurrentClipBounds(ctx),
      }
      attachClipStackToOp(canvasOp, ctx)
      emitOp(ctx, canvasOp)
    } else {
      attachClipStackToOp(rectOp, ctx)
      emitOp(ctx, rectOp)
    }
    if (shouldPushLayer) popLayer(ctx)
    return
  }

  const hasBackdropFilter = hasBackdropEffect(props)
  const hasTransform = props.transform !== undefined && props.transform !== null
  const hasSelfFilter = props.filter !== undefined
  const hasVisualBorderWidth = Math.max(
    props.borderWidth ?? 0,
    props.borderLeft ?? 0,
    props.borderRight ?? 0,
    props.borderTop ?? 0,
    props.borderBottom ?? 0,
  ) > 0
  const needsBorderGeometry = hasVisualBorderWidth && (props.cornerRadius !== undefined || props.cornerRadii !== undefined)
  const needsRect = props.backgroundColor !== undefined || props.gradient !== undefined || hasBackdropFilter || props.opacity !== undefined || isInteractiveNode(props) || hasTransform || hasSelfFilter || needsBorderGeometry || isScroll

  let effectConfig: EffectConfig | null = null

  if (needsRect) {
    state.rectNodes.push(node)
    state.rectNodeById.set(node.id, node)

    const bgColor = props.backgroundColor !== undefined ? (parseColor(props.backgroundColor) >>> 0) : (isScroll ? 0 : 0x00000001)
    const radius = props.cornerRadius ?? props.borderRadius ?? 0

    if (props.shadow || props.glow || props.gradient || hasBackdropFilter || props.cornerRadii || props.opacity !== undefined || hasTransform || props.filter) {
      effectConfig = claimEffect()
      effectConfig.renderObjectId = node.id
      effectConfig.color = bgColor
      effectConfig._node = node

      if (props.shadow) {
        effectConfig.shadow = props.shadow as typeof effectConfig.shadow
      }
      if (props.glow) {
        effectConfig.glow = {
          radius: props.glow.radius,
          color: typeof props.glow.color === "number" ? props.glow.color : parseColor(props.glow.color),
          intensity: props.glow.intensity ?? 80,
        }
      }
      if (props.gradient) {
        const g = props.gradient
        if (g.type === "linear") {
          effectConfig.gradient = {
            type: "linear",
            from: typeof g.from === "number" ? g.from : parseColor(g.from),
            to: typeof g.to === "number" ? g.to : parseColor(g.to),
            angle: g.angle ?? 90,
          }
        } else {
          effectConfig.gradient = {
            type: "radial",
            from: typeof g.from === "number" ? g.from : parseColor(g.from),
            to: typeof g.to === "number" ? g.to : parseColor(g.to),
          }
        }
      }
      for (const f of BACKDROP_FIELDS) {
        if (props[f] !== undefined) effectConfig[f] = props[f]
      }
      if (props.opacity !== undefined) effectConfig.opacity = props.opacity
      if (props.cornerRadii) effectConfig.cornerRadii = props.cornerRadii
      if (props.filter) effectConfig.filter = props.filter

      effectConfig.transform = node._transform ?? undefined
      effectConfig.transformInverse = node._transformInverse ?? undefined
    }

    const rectOp: RectangleRenderOp = {
      kind: "rectangle",
      renderObjectId: node.id,
      type: CMD.RECTANGLE,
      x: absX,
      y: absY,
      width,
      height,
      color: bgColor,
      cornerRadius: radius,
      radius,
      extra1: 0,
      extra2: 0,
      nodeId: node.id,
      image: null,
      canvas: null,
      effect: effectConfig,
      clipBounds: getCurrentClipBounds(ctx),
    }

    if (effectConfig) {
      const backdrop = createBackdropMetadata(effectConfig, absX, absY, width, height, radius, getCurrentClipBounds(ctx), ctx.clip.stack)
      const transformStateId = backdrop?.transformStateId ?? getTransformStateId(effectConfig)
      const clipStateId = backdrop?.clipStateId ?? createClipStateId(ctx.clip.stack)
      const effectStateId = backdrop?.effectStateId ?? getEffectStateId(effectConfig, radius)

      const effectOp: EffectRenderOp = {
        kind: "effect",
        renderObjectId: node.id,
        type: CMD.RECTANGLE,
        x: absX,
        y: absY,
        width,
        height,
        color: bgColor,
        cornerRadius: radius,
        extra1: 0,
        extra2: 0,
        nodeId: node.id,
        rect: rectOp,
        effect: effectConfig,
        backdrop,
        transformStateId,
        clipStateId,
        effectStateId,
        clipBounds: getCurrentClipBounds(ctx),
      }
      attachClipStackToOp(effectOp, ctx)
      emitOp(ctx, effectOp)
    } else if (bgColor !== 0 || radius !== 0 || isScroll) {
      attachClipStackToOp(rectOp, ctx)
      emitOp(ctx, rectOp)
    }
  }

  if (!isCulled) {
    if (isScroll) {
      pushClip(ctx, { x: absX, y: absY, width, height, nodeId: node.id })
    }

    const childScrollContainerId = isScroll ? node.id : parentScrollContainerId
    const childInsideScroll = insideScroll || isScroll
    const childInsideTransform = insideTransform || hasTransformProp
    const childInsideIsolation = insideIsolation || isolatesSubtree(node, props)

    const sortedChildren = sortChildrenByStackingOrder(node.children)
    for (let i = 0; i < sortedChildren.length; i++) {
      const child = sortedChildren[i]
      if (child.props.floating === "root") {
        deferredRootFloats.push(child)
        continue
      }
      if (typeof child.props.floating === "object" && child.props.floating.attachTo) {
        const target = findElementTarget(child.props.floating.attachTo, state)
        if (!target) {
          deferredElementFloats.push(child)
          continue
        }
      }
      visitNode(
        child,
        absX,
        absY,
        nodeAbsForward,
        parentDepth + 1,
        childScrollContainerId,
        childInsideScroll,
        childInsideTransform,
        childInsideIsolation,
        activeLayerKey,
        ctx,
        state,
        viewportW,
        viewportH,
        deferredRootFloats,
        deferredElementFloats,
        traversalContext,
      )
    }

    if (isScroll) {
      popClip(ctx)
    }
  }

  const paintBorderWidth = props.borderWidth ?? 0
  const left = props.borderLeft ?? paintBorderWidth
  const right = props.borderRight ?? paintBorderWidth
  const top = props.borderTop ?? paintBorderWidth
  const bottom = props.borderBottom ?? paintBorderWidth
  const borderColor = props.borderColor !== undefined ? (parseColor(props.borderColor) >>> 0) : 0
  const hasVisualBorder = (borderColor & 0xff) > 0 && Math.max(left, right, top, bottom) > 0
  const interactiveBorder = maxInteractiveBorder(node.props)
  const hasBorder = hasVisualBorder || interactiveBorder > 0

  if (hasBorder) {
    const maxBorderWidth = Math.max(left, right, top, bottom, interactiveBorder)
    const uniform = left === right && right === top && top === bottom
    const radius = props.cornerRadius ?? props.borderRadius ?? 0
    const borderOp: BorderRenderOp = {
      kind: "border",
      renderObjectId: null,
      type: CMD.BORDER,
      x: absX,
      y: absY,
      width,
      height,
      color: hasVisualBorder ? borderColor : 0,
      cornerRadius: radius,
      radius,
      extra1: maxBorderWidth,
      extra2: 0,
      nodeId: node.id,
      borderWidth: maxBorderWidth,
      cornerRadii: effectConfig?.cornerRadii ?? null,
      borderWidths: (!uniform && hasVisualBorder) ? { left, right, top, bottom } : null,
      clipBounds: getCurrentClipBounds(ctx),
    }
    attachClipStackToOp(borderOp, ctx)
    emitOp(ctx, borderOp)
  }

  if (shouldPushLayer) {
    popLayer(ctx)
  }
}

// ── Main Traversal Entry Point ──────────────────────────────────────────────

/**
 * Traverse TGENode tree after Flexily layout solution.
 *
 * Performs pre-order DFS to write back geometry, compute transforms,
 * route layers, and emit RenderGraphOps directly.
 *
 * Atomicity: On any layout calculation or traversal failure, node.layout
 * is rolled back to the pre-traversal snapshot atomically.
 */
export function traverseFrame(
  root: TGENode,
  state: WalkTreeState,
  viewportW: number,
  viewportH: number,
): TraversalResult {
  const allNodes = collectAllNodes(root)
  const snapshot = snapshotLayouts(allNodes)

  effectPoolIdx = 0
  autoLayerCount = 0

  const ctx = createPipelineContext()
  const traversalContext = { hasAnyTransforms: false }
  const deferredRootFloats: TGENode[] = []
  const deferredElementFloats: TGENode[] = []

  try {
    root.layout.x = 0
    root.layout.y = 0
    root.layout.width = viewportW
    root.layout.height = viewportH
    root._dfsIndex = ctx.dfsIndex++
    if (state.nodeCount) state.nodeCount.value++
    root._depth = 0
    root._scrollContainerId = 0
    root._layerKey = "root"
    state.nodeRefById.set(root.id, root)
    state.boxNodes.push(root)

    const rootProps = resolveProps(root)
    let rootAbsForward: Matrix3 | null = null
    let rootLocalTransform: Matrix3 | null = null
    let rootLocalInverse: Matrix3 | null = null

    if (rootProps.transform && root.kind !== "text") {
      traversalContext.hasAnyTransforms = true
      state.hasAnyTransforms = true
      if (state.layout) (state.layout as any).hasAnyTransforms = true

      const originProp = rootProps.transformOrigin
      let ox = viewportW / 2
      let oy = viewportH / 2
      if (originProp === "top-left") { ox = 0; oy = 0 }
      else if (originProp === "top-right") { ox = viewportW; oy = 0 }
      else if (originProp === "bottom-left") { ox = 0; oy = viewportH }
      else if (originProp === "bottom-right") { ox = viewportW; oy = viewportH }
      else if (originProp && typeof originProp === "object") {
        ox = originProp.x * viewportW
        oy = originProp.y * viewportH
      }

      const matrix = fromConfig(rootProps.transform, ox, oy)
      if (!isIdentity(matrix)) {
        rootLocalTransform = matrix
        rootLocalInverse = invert(matrix)
      }
    }

    root._transform = rootLocalTransform
    root._transformInverse = rootLocalInverse

    if (rootLocalTransform) {
      rootAbsForward = rootLocalTransform
      root._accTransform = rootLocalTransform
      root._accTransformInverse = rootLocalInverse
    } else {
      root._accTransform = null
      root._accTransformInverse = null
    }

    const rootBg = rootProps.backgroundColor !== undefined ? (parseColor(rootProps.backgroundColor) >>> 0) : 0
    const rootRadius = rootProps.cornerRadius ?? rootProps.borderRadius ?? 0

    if (rootBg !== 0 || rootRadius !== 0) {
      const rootRectOp: RectangleRenderOp = {
        kind: "rectangle",
        renderObjectId: root.id,
        type: CMD.RECTANGLE,
        x: 0,
        y: 0,
        width: viewportW,
        height: viewportH,
        color: rootBg,
        cornerRadius: rootRadius,
        radius: rootRadius,
        extra1: 0,
        extra2: 0,
        nodeId: root.id,
        image: null,
        canvas: null,
        effect: null,
        clipBounds: null,
      }
      emitOp(ctx, rootRectOp)
      state.rectNodes.push(root)
      state.rectNodeById.set(root.id, root)
    }

    const rootIsScroll = !!(rootProps.scrollX || rootProps.scrollY)
    if (rootIsScroll) {
      state.scrollContainers.push(root)
      if (rootProps.scrollSpeed && state.scrollSpeedCap) {
        state.scrollSpeedCap.value = rootProps.scrollSpeed
      }
      pushClip(ctx, { x: 0, y: 0, width: viewportW, height: viewportH, nodeId: root.id })
    }

    const sortedChildren = sortChildrenByStackingOrder(root.children)
    for (let i = 0; i < sortedChildren.length; i++) {
      const child = sortedChildren[i]
      if (child.props.floating === "root") {
        deferredRootFloats.push(child)
        continue
      }
      if (typeof child.props.floating === "object" && child.props.floating.attachTo) {
        const target = findElementTarget(child.props.floating.attachTo, state)
        if (!target) {
          deferredElementFloats.push(child)
          continue
        }
      }
      visitNode(
        child,
        0,
        0,
        rootAbsForward,
        1,
        rootIsScroll ? root.id : 0,
        rootIsScroll,
        rootLocalTransform !== null,
        false,
        "root",
        ctx,
        state,
        viewportW,
        viewportH,
        deferredRootFloats,
        deferredElementFloats,
        traversalContext,
      )
    }

    if (rootIsScroll) {
      popClip(ctx)
    }

    let elemIdx = 0
    while (elemIdx < deferredElementFloats.length) {
      const elemFloat = deferredElementFloats[elemIdx++]
      const pAbsX = elemFloat.parent ? elemFloat.parent.layout.x : 0
      const pAbsY = elemFloat.parent ? elemFloat.parent.layout.y : 0
      visitNode(
        elemFloat,
        pAbsX,
        pAbsY,
        null,
        elemFloat.parent ? elemFloat.parent._depth + 1 : 1,
        elemFloat.parent ? elemFloat.parent._scrollContainerId : 0,
        false,
        false,
        false,
        "root",
        ctx,
        state,
        viewportW,
        viewportH,
        deferredRootFloats,
        deferredElementFloats,
        traversalContext,
      )
    }

    deferredRootFloats.sort((a, b) => {
      const za = a.props.zIndex ?? 0
      const zb = b.props.zIndex ?? 0
      const z = za - zb
      if (z !== 0) return z
      return (a._siblingIndex ?? 0) - (b._siblingIndex ?? 0)
    })

    let rootIdx = 0
    while (rootIdx < deferredRootFloats.length) {
      const rootFloat = deferredRootFloats[rootIdx++]
      rootFloat._flexNode?.calculateLayout(viewportW, viewportH)
      visitNode(
        rootFloat,
        0,
        0,
        null,
        1,
        0,
        false,
        false,
        false,
        "root",
        ctx,
        state,
        viewportW,
        viewportH,
        deferredRootFloats,
        deferredElementFloats,
        traversalContext,
      )
    }

    const rootBorderColor = rootProps.borderColor !== undefined ? (parseColor(rootProps.borderColor) >>> 0) : 0
    const rootBorderWidth = rootProps.borderWidth ?? 0
    if (rootBorderWidth > 0 && (rootBorderColor & 0xff) > 0) {
      const rootBorderOp: BorderRenderOp = {
        kind: "border",
        renderObjectId: null,
        type: CMD.BORDER,
        x: 0,
        y: 0,
        width: viewportW,
        height: viewportH,
        color: rootBorderColor,
        cornerRadius: rootRadius,
        radius: rootRadius,
        extra1: rootBorderWidth,
        extra2: 0,
        nodeId: root.id,
        borderWidth: rootBorderWidth,
        cornerRadii: null,
        borderWidths: null,
        clipBounds: null,
      }
      emitOp(ctx, rootBorderOp)
    }

    state.hasAnyTransforms = traversalContext.hasAnyTransforms
    if (state.layout) (state.layout as any).hasAnyTransforms = traversalContext.hasAnyTransforms

    return {
      success: true,
      layerBuckets: ctx.layer.allBuckets,
      hasAnyTransforms: traversalContext.hasAnyTransforms,
    }
  } catch (error) {
    restoreLayouts(snapshot)
    return {
      success: false,
      layerBuckets: [],
      hasAnyTransforms: false,
      error,
    }
  }
}
