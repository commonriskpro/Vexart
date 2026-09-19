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
  ensureCompositorExtra,
  ensureImageExtra,
  ensureCanvasExtra,
  getGridLayoutError,
} from "../ffi/node"
import {
  CMD,
  type RectangleRenderOp,
  type TextRenderOp,
  type BorderRenderOp,
  type ImageRenderOp,
  type CanvasRenderOp,
  type EffectRenderOp,
  type EffectConfig,
  type ImagePaintConfig,
  type CanvasPaintConfig,
} from "../ffi/render-graph"
import {
  hashString,
  getTransformStateId,
  getEffectStateId,
} from "./effect-hash"
export { hashString } from "./effect-hash"
import { type Matrix3 } from "../ffi/matrix"
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
  createPipelineContext,
  snapshotLayouts,
  restoreLayouts,
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
import { ATTACH_POINT } from "./layout-adapter"
import { createScrollHandle } from "./scroll"

import {
  attachClipStackToOp,
  createBackdropMetadata,
  createClipStateId,
  pushScrollClip,
  popScrollClip,
} from "./pipeline-clip"
import {
  applyNodeTransform,
  applyRootTransform,
} from "./pipeline-transform"
import {
  accumulateNodeDamage,
  evaluateAABBCull,
  isolatesSubtree,
  collectAllNodes,
  damageRectForLayoutTransition,
} from "./pipeline-damage"

export { damageRectForLayoutTransition } from "./pipeline-damage"

// ── Traversal Result ────────────────────────────────────────────────────────

export type TraversalResult = {
  success: boolean
  layerBuckets: LayerOpBucket[]
  hasAnyTransforms: boolean
  error?: unknown
}

// ── Module Constants & Singletons ──────────────────────────────────────────

const AUTO_LAYER_MIN_AREA = 64 * 64
const warnedRawTextNodes = new Set<number>()

const effectPool: EffectConfig[] = []
let effectPoolIdx = 0
let autoLayerCount = 0

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

// ── Core Pre-Order DFS Node Visitor ─────────────────────────────────────────

export function visitNode(
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

  node.layout.x = absX
  node.layout.y = absY
  node.layout.width = width
  node.layout.height = height

  accumulateNodeDamage(node, prevLayout, state)

  const dfsIndex = ctx.dfsIndex++
  if (state.nodeCount) state.nodeCount.value++
  node._dfsIndex = dfsIndex
  node._depth = parentDepth
  node._scrollContainerId = parentScrollContainerId
  state.nodeRefById.set(node.id, node)

  const isScroll = !!(props.scrollX || props.scrollY)
  const hasTransformProp = props.transform !== undefined && props.transform !== null

  if (
    evaluateAABBCull(
      node,
      absX,
      absY,
      width,
      height,
      parentScrollContainerId,
      insideTransform,
      hasTransformProp,
      isScroll,
      ctx,
      state,
      viewportW,
      viewportH,
    )
  ) {
    return
  }

  if (node.kind === "text") {
    state.textNodes.push(node)
  } else {
    state.boxNodes.push(node)
    if (isScroll) {
      state.scrollContainers.push(node)
      if (props.scrollSpeed && state.scrollSpeedCap) {
        state.scrollSpeedCap.value = props.scrollSpeed
      }
      const sid = props.scrollId ?? `tge-scroll-${node.id}`
      const handle = createScrollHandle(sid)
      const ox = props.scrollX ? handle.scrollX : 0
      const oy = props.scrollY ? handle.scrollY : 0
      const parentOffset = parentScrollContainerId !== 0 ? ctx.scrollOffsets?.get(parentScrollContainerId) : undefined
      const totalX = (parentOffset?.x ?? 0) + ox
      const totalY = (parentOffset?.y ?? 0) + oy
      ctx.scrollOffsets?.set(node.id, { x: totalX, y: totalY })
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

  const { nodeAbsForward } = applyNodeTransform(
    node,
    props,
    absX,
    absY,
    width,
    height,
    parentAbsForward,
    traversalContext,
    state,
  )

  const hasSubtreeTransform = !!(props.transform && node.children.length > 0)
  const transformedInsideScroll = insideScroll && hasSubtreeTransform
  const insideTransformedScrollSubtree = insideScroll && insideTransform
  const isInteractionLayer = shouldPromoteInteractionLayer(node)
  const hasBackdrop = hasBackdropEffect(props)

  let shouldBoundary = false
  if (transformedInsideScroll || insideTransformedScrollSubtree) {
    if (node._compositor) node._compositor.autoLayer = false
  } else if (!insideIsolation && shouldPromoteToLayer(node)) {
    if (node._compositor) node._compositor.autoLayer = false
    shouldBoundary = true
  } else if (!insideIsolation && !insideScroll && (isInteractionLayer || hasSubtreeTransform)) {
    if (node._compositor) node._compositor.autoLayer = false
    shouldBoundary = true
  } else if (node._compositor?.autoLayer === true && node._compositor.unstableFrames >= 3) {
    node._compositor.autoLayer = false
    node._compositor.stableFrames = 0
    node._compositor.unstableFrames = 0
  } else if (!insideIsolation && !insideScroll && !hasBackdrop && (node._compositor?.stableFrames ?? 0) >= 3 && hasPromotableArea(node) && autoLayerCount < AUTO_LAYER_BUDGET) {
    ensureCompositorExtra(node).autoLayer = true
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
        console.warn('[Vexart] Warning: Raw text string "' + content.slice(0, 30) + '" placed directly inside <box>. Wrap text in <text>...</text> to ensure proper typography and layout.')
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
    const placeholderColor = typeof props.backgroundColor === "number"
      ? (props.backgroundColor >>> 0)
      : (typeof props.backgroundColor === "string" ? (parseColor(props.backgroundColor) >>> 0) : 0x00000001)
    const radius = props.cornerRadius ?? props.borderRadius ?? 0
    const imageConfig: ImagePaintConfig = {
      renderObjectId: node.id,
      color: placeholderColor,
      cornerRadius: radius,
      imageBuffer: imgBuf ?? null,
      nativeImageHandle: extra.nativeHandle,
      objectFit: props.objectFit ?? "contain",
    }

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

      if (node._transforms) {
        effectConfig.transform = node._transforms.local ?? undefined
        effectConfig.transformInverse = node._transforms.localInverse ?? undefined
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
      textureId: extra.nativeHandle ?? 0,
      rect: rectOp,
      image: imageConfig,
      clipBounds: getCurrentClipBounds(ctx),
    }
    attachClipStackToOp(imageOp, ctx)
    emitOp(ctx, imageOp)
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

      if (node._transforms) {
        effectConfig.transform = node._transforms.local ?? undefined
        effectConfig.transformInverse = node._transforms.localInverse ?? undefined
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

  if (isScroll) {
    pushScrollClip(ctx, absX, absY, width, height, node.id)
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
    popScrollClip(ctx)
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
  scrollOffsets?: Map<number, { x: number; y: number }>,
): TraversalResult {
  const allNodes = collectAllNodes(root)
  const snapshot = snapshotLayouts(allNodes)

  effectPoolIdx = 0
  autoLayerCount = 0

  const activeScrollOffsets = scrollOffsets ?? (state as any).scrollOffsets ?? new Map<number, { x: number; y: number }>()
  const ctx = createPipelineContext(activeScrollOffsets)
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
    const rootAbsForward = applyRootTransform(
      root,
      rootProps,
      viewportW,
      viewportH,
      traversalContext,
      state,
    )
    const rootHasTransform = rootAbsForward !== null

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
      const sid = rootProps.scrollId ?? `tge-scroll-${root.id}`
      const handle = createScrollHandle(sid)
      const ox = rootProps.scrollX ? handle.scrollX : 0
      const oy = rootProps.scrollY ? handle.scrollY : 0
      ctx.scrollOffsets?.set(root.id, { x: ox, y: oy })
      pushScrollClip(ctx, 0, 0, viewportW, viewportH, root.id)
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
        rootHasTransform,
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
      popScrollClip(ctx)
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
