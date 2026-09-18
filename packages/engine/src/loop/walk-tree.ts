/**
 * walk-tree.ts — TGENode tree walking + Flexily layout feeding.
 *
 * Extracted from loop.ts as part of Phase 3 Slice 2.2.
 * AABB viewport culling added in Phase 3 Slice 3.3.
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §walk-tree
 *
 * Exports:
 *   - WalkTreeState — mutable state bag threaded through walkTree
 *   - collectText() — recursive text collector helper
 *   - walkTree() — main tree walk function
 */

import {
  type TGENode,
  resolveProps,
  ensureImageExtra,
  ensureCanvasExtra,
} from "../ffi/node"
import { createTextFlexNode } from "../ffi/flex-sync"
import { CanvasContext, hashCanvasDisplayList, serializeCanvasDisplayList } from "../ffi/canvas"
import { decodeImageForNode } from "./image"
import type { createVexartLayoutCtx } from "./layout-adapter"
import { shouldPromoteInteractionLayer } from "../reconciler/interaction"
import type { LayerBoundary } from "./types"
import { hasBackdropEffect, isInteractiveNode } from "./predicates"
import { AUTO_LAYER_BUDGET, shouldPromoteToLayer } from "./layer-boundary"

// ── State bag ─────────────────────────────────────────────────────────────

/**
 * Mutable state threaded through walkTree.
 * Coordinator allocates this once per frame and passes it into walkTree.
 */
export type WalkTreeState = {
  // Counters (mutable scalars — wrap in object so they can be passed by ref)
  scrollSpeedCap: { value: number }
  nodeCount: { value: number }

  // Accumulator arrays — cleared before each walk, populated during walk
  rectNodes: TGENode[]
  textNodes: TGENode[]
  boxNodes: TGENode[]
  layerBoundaries: LayerBoundary[]
  scrollContainers: TGENode[]

  // Lookup maps populated during walk
  nodeRefById: Map<number, TGENode>

  // Rect node lookup (by id) — used by interaction state
  rectNodeById: Map<number, TGENode>

  // Layout adapter — the layout engine interface
  layout: ReturnType<typeof createVexartLayoutCtx>
  /** Whether ANY node in the tree has a transform property set. */
  hasAnyTransforms?: boolean

  // ── Viewport culling (Slice 3.3) ──

  /**
   * When true, nodes fully outside the viewport are culled before recursing
   * into their children. Uses previous-frame layout for the AABB check.
   * Default: false (off). Scroll containers are always exempted.
   */
  cullingEnabled?: boolean

  /** Viewport width in pixels — used for AABB culling bounds. */
  viewportWidth?: number

  /** Viewport height in pixels — used for AABB culling bounds. */
  viewportHeight?: number

  /**
   * Running count of subtrees pruned by viewport culling this frame.
   * Wrapped as { value } so callers can read the final count after walkTree.
   */
  culledCount?: { value: number }
}

const AUTO_LAYER_MIN_AREA = 64 * 64

const warnedRawTextNodes = new Set<number>()

let autoLayerCount = 0

function hasPromotableArea(node: TGENode) {
  return node.layout.width * node.layout.height >= AUTO_LAYER_MIN_AREA
}

function registerCulledSubtree(node: TGENode, state: WalkTreeState) {
  state.nodeRefById.set(node.id, node)
  for (const child of node.children) {
    registerCulledSubtree(child, state)
  }
}

// ── collectText ───────────────────────────────────────────────────────────

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

// ── registerRectNode ──────────────────────────────────────────────────────

/**
 * Register a node as a RECT-emitting node.
 * Called whenever the layout adapter is configured to emit a RECTANGLE command for a node.
 */
export function registerRectNode(node: TGENode, state: WalkTreeState) {
  state.rectNodes.push(node)
  state.rectNodeById.set(node.id, node)
}

// ── walkTree ──────────────────────────────────────────────────────────────

/**
 * Walk TGENode tree and replay into the Flexily layout adapter.
 * This is the FIRST pass — it only feeds layout, no layer assignment.
 *
 * Text measurement: Before calling layout.text(), we pre-measure
 * the text with Pretext and register the measurement so the layout adapter's
 * callback can read accurate width/height.
 *
 * @param node            - Current node to process
 * @param state           - Mutable walk state bag
 * @param parentDir       - Parent flex direction (for stretch emulation)
 * @param insideTransform - Whether an ancestor has a transform prop
 * @param path            - Dot-separated tree path for this node
 */
export function walkTree(
  node: TGENode,
  state: WalkTreeState,
  parentDir?: number,
  insideTransform?: boolean,
  scrollContainerId = 0,
  insideScroll = false,
  depth = 0,
  insideIsolation = false,
) {
  const { layout } = state
  const dfsIndex = state.nodeCount.value++
  if (dfsIndex === 0) {
    autoLayerCount = 0
    state.hasAnyTransforms = false
    if (layout) (layout as any).hasAnyTransforms = false
  }
  node._dfsIndex = dfsIndex
  node._depth = depth
  node._scrollContainerId = scrollContainerId
  state.nodeRefById.set(node.id, node)

  // Resolve props once per node — used by all code paths below
  const props = resolveProps(node)
  const isolatesSubtree = node.kind !== "text" && node.children.length > 0 && (
    props.filter !== undefined
    || (typeof props.opacity === "number" && props.opacity < 1)
  )

  if (node.kind !== "text") {
    const isScroll = !!(props.scrollX || props.scrollY)
    if (isScroll) state.scrollContainers.push(node)
    const hasSubtreeTransform = !!(props.transform && node.children.length > 0)
    if (props.transform) {
      state.hasAnyTransforms = true
      if (layout) (layout as any).hasAnyTransforms = true
    }
    const transformedInsideScroll = insideScroll && hasSubtreeTransform
    // A transformed subtree that lives inside a scroll container must stay in
    // that container's paint stream as one unit.  This applies to descendants
    // as well as to the transformed node itself: promoting a descendant (for
    // example an explicitly layered card) would detach it from the ancestor
    // scissor and apply the ancestor transform only to the remaining stream.
    const insideTransformedScrollSubtree = insideScroll && insideTransform
    const isInteractionLayer = shouldPromoteInteractionLayer(node)
    const hasBackdrop = hasBackdropEffect(props)
    let shouldBoundary = false
    if (transformedInsideScroll || insideTransformedScrollSubtree) node._autoLayer = false
    if (!insideIsolation && !transformedInsideScroll && !insideTransformedScrollSubtree && shouldPromoteToLayer(node)) {
      node._autoLayer = false
      shouldBoundary = true
    } else if (!insideIsolation && !transformedInsideScroll && !insideTransformedScrollSubtree && !insideScroll && (isInteractionLayer || hasSubtreeTransform)) {
      // A transformed child of a scroll container must remain in the
      // container's paint stream. Promoting it to a separate layer would
      // detach it from the ancestor scissor; the layer compositor has no
      // public clip contract with which to carry that scissor across the
      // transformed quad. The transform is still rendered by the parent
      // stream exactly once, after which the existing render-graph clip is
      // applied at the transformed output boundary.
      node._autoLayer = false
      shouldBoundary = true
    } else if (!insideIsolation && !transformedInsideScroll && !insideTransformedScrollSubtree && node._autoLayer === true && node._unstableFrameCount >= 3) {
      node._autoLayer = false
      node._stableFrameCount = 0
      node._unstableFrameCount = 0
    } else if (!insideIsolation && !transformedInsideScroll && !insideTransformedScrollSubtree && !hasBackdrop && node._stableFrameCount >= 3 && hasPromotableArea(node) && autoLayerCount < AUTO_LAYER_BUDGET) {
      node._autoLayer = true
      autoLayerCount++
      shouldBoundary = true
    }
    if (shouldBoundary) {
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
  }

  if (node.kind === "text") {
    const content = node.text || collectText(node)
    if (!content) return

    if (node.parent && node.parent.kind === "box" && node.text.length > 0 && process.env.NODE_ENV !== "production") {
      if (!warnedRawTextNodes.has(node.id)) {
        warnedRawTextNodes.add(node.id)
        console.warn(`[Vexart] Warning: Raw text string "${content.slice(0, 30)}" placed directly inside <box>. Wrap text in <text>...</text> to ensure proper typography and layout.`)
      }
    }

    createTextFlexNode(node)
    layout.setCurrentFlexNode(node._flexNode)
    layout.openElement()
    layout.closeElement()
    state.textNodes.push(node)
    return
  }

  // ── <img> intrinsic — leaf node that paints decoded image pixels ──
  if (node.kind === "img") {
    const extra = ensureImageExtra(node)
    // Trigger async decode if not started
    if (extra.state === "idle" && props.src) {
      decodeImageForNode(node)
    }

    // Emit a layout element for this image node
    state.boxNodes.push(node)
    layout.setCurrentFlexNode(node._flexNode)
    layout.openElement()
    layout.setCurrentNodeId(node.id)

    const imgBuf = extra.buffer
    const isGridItem = node.parent?.props.layout === "grid"
    if (imgBuf && !node._widthSizing && !isGridItem) node._flexNode?.setWidth(imgBuf.width)
    if (imgBuf && !node._heightSizing && !isGridItem) node._flexNode?.setHeight(imgBuf.height)
    registerRectNode(node, state)

    layout.closeElement()
    return
  }

  // ── <canvas> intrinsic — imperative drawing surface ──
  if (node.kind === "canvas") {
    const extra = ensureCanvasExtra(node)
    state.boxNodes.push(node)

    layout.setCurrentFlexNode(node._flexNode)
    layout.openElement()
    layout.setCurrentNodeId(node.id)
    if (!node._widthSizing && !node._heightSizing) node._flexNode?.setFlexGrow(1)
    registerRectNode(node, state)

    // Queue canvas config for paintCommand
    if (props.onDraw) {
      const viewportKey = props.viewport ? `${props.viewport.x},${props.viewport.y},${props.viewport.zoom}` : "default"
      const drawCacheKey = props.drawCacheKey === undefined ? null : `${props.drawCacheKey}:${viewportKey}`
      const canReuseCommands = drawCacheKey !== null && extra.drawCacheKey === drawCacheKey && extra.displayListCommands !== null && extra.displayListHash !== null
      let commands = extra.displayListCommands

      if (!canReuseCommands) {
        const ctx = new CanvasContext(props.viewport)
        props.onDraw(ctx)
        commands = ctx._commands
        const serializedBytes = serializeCanvasDisplayList(commands)
        extra.drawCacheKey = drawCacheKey
        extra.displayListCommands = commands
        extra.displayListHash = hashCanvasDisplayList(serializedBytes)
      }
    }

    layout.closeElement()
    return
  }

  state.boxNodes.push(node)

  const isScrollContainer = !!(props.scrollX || props.scrollY)
  layout.setCurrentFlexNode(node._flexNode)
  layout.openElement()
  layout.setCurrentNodeId(node.id)

  if (isScrollContainer && props.scrollSpeed) {
    state.scrollSpeedCap.value = props.scrollSpeed
  }

  // Resolve visual props — merges hoverStyle/activeStyle when the node is hovered/active
  const vp = props

  const hasBackdropFilter = hasBackdropEffect(vp)
  const hasTransform = vp.transform !== undefined
  if (hasTransform && vp.transform) {
    state.hasAnyTransforms = true
    if (layout) (layout as any).hasAnyTransforms = true
  }
  const hasSelfFilter = vp.filter !== undefined
  const hasVisualBorderWidth = Math.max(
    vp.borderWidth ?? 0,
    vp.borderLeft ?? 0,
    vp.borderRight ?? 0,
    vp.borderTop ?? 0,
    vp.borderBottom ?? 0,
  ) > 0
  const needsBorderGeometry = hasVisualBorderWidth && (vp.cornerRadius !== undefined || vp.cornerRadii !== undefined)
  const needsRect = vp.backgroundColor !== undefined || vp.gradient !== undefined || hasBackdropFilter || vp.opacity !== undefined || isInteractiveNode(vp) || hasTransform || hasSelfFilter || needsBorderGeometry
  if (needsRect) {
    registerRectNode(node, state)
  }

  // ── AABB viewport culling (Slice 3.3) ──
  // Use previous-frame layout to decide whether to descend into children.
  // Scroll containers are exempt — their children may scroll into view.
  // We still open/close the element for the current node (Flexily needs balance),
  // but we skip all children — reducing layout commands and paint work.
  if (
    state.cullingEnabled
    && !insideTransform
    && !hasTransform
    && !isScrollContainer
    && node.children.length > 0
    && state.viewportWidth !== undefined
    && state.viewportHeight !== undefined
  ) {
    const l = node.layout
    // Only cull if node has been laid out at least once (non-zero dimensions)
    if (l.width > 0 && l.height > 0) {
      const fullyLeft = l.x + l.width <= 0
      const fullyRight = l.x >= state.viewportWidth
      const fullyAbove = l.y + l.height <= 0
      const fullyBelow = l.y >= state.viewportHeight
      if (fullyLeft || fullyRight || fullyAbove || fullyBelow) {
        if (state.culledCount) state.culledCount.value++
        registerCulledSubtree(node, state)
        layout.closeElement()
        return
      }
    }
  }

  // Propagate transform ancestry to children
  const childInsideXform = insideTransform || hasTransform
  const childScrollContainerId = isScrollContainer ? node.id : scrollContainerId
  const childInsideScroll = insideScroll || isScrollContainer
  const childInsideIsolation = insideIsolation || isolatesSubtree
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    walkTree(child, state, 0, childInsideXform, childScrollContainerId, childInsideScroll, depth + 1, childInsideIsolation)
  }

  layout.closeElement()

}
