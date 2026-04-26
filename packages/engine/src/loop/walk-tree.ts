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
  SIZING,
  DIRECTION,
  ALIGN_X,
  ALIGN_Y,
  type TGENode,
  type SizingInfo,
  parseSizing,
  parseDirection,
  parseAlignX,
  parseAlignY,
  resolveProps,
  ensureImageExtra,
  ensureCanvasExtra,
} from "../ffi/node"
import { measureForLayout } from "../ffi/text-layout"
import { CanvasContext, hashCanvasDisplayList, serializeCanvasDisplayList } from "../ffi/canvas"
import { nativeCanvasDisplayListTouch, nativeCanvasDisplayListUpdate, syncNativeCanvasDisplayListHandle } from "../ffi/native-canvas-display-list"
import { decodeImageForNode } from "./image"
import { ATTACH_TO, ATTACH_POINT, POINTER_CAPTURE, type createVexartLayoutCtx } from "./layout-adapter"
import type { EffectConfig, TextMeta, ImagePaintConfig, CanvasPaintConfig } from "../ffi/render-graph"
import { shouldPromoteInteractionLayer } from "../reconciler/interaction"
import { isDebugEnabled } from "./debug"
import type { LayerBoundary } from "./types"
import { hasBackdropEffect, isInteractiveNode } from "./predicates"

// ── State bag ─────────────────────────────────────────────────────────────

/**
 * Mutable state threaded through walkTree.
 * Coordinator allocates this once per frame and passes it into walkTree.
 */
export type WalkTreeState = {
  // Counters (mutable scalars — wrap in object so they can be passed by ref)
  scrollIdCounter: { value: number }
  textMeasureIndex: { value: number }
  scrollSpeedCap: { value: number }
  nodeCount: { value: number }

  // Accumulator arrays — cleared before each walk, populated during walk
  rectNodes: TGENode[]
  textNodes: TGENode[]
  boxNodes: TGENode[]
  textMetas: TextMeta[]
  layerBoundaries: LayerBoundary[]
  scrollContainers: TGENode[]

  // Lookup maps populated during walk
  nodePathById: Map<number, string>
  nodeRefById: Map<number, TGENode>

  // Effect / image / canvas queues
  effectsQueue: Map<number, EffectConfig>
  imageQueue: Map<number, ImagePaintConfig>
  canvasQueue: Map<number, CanvasPaintConfig>

  // Text metadata map (keyed by content) — used during paint for multi-line layout
  textMetaMap: Map<number, TextMeta>

  // Rect node lookup (by id) — used by interaction state
  rectNodeById: Map<number, TGENode>

  // Layout adapter — the layout engine interface
  layout: ReturnType<typeof createVexartLayoutCtx>

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

const VALID_WILL_CHANGE_VALUES = new Set(["transform", "opacity", "filter", "scroll"])
const AUTO_LAYER_BUDGET = 8
const AUTO_LAYER_MIN_AREA = 64 * 64

const effectPool: EffectConfig[] = []
let effectPoolIdx = 0
let autoLayerCount = 0

function hasPromotableArea(node: TGENode) {
  return node.layout.width * node.layout.height >= AUTO_LAYER_MIN_AREA
}

function claimEffect(): EffectConfig {
  const effect = effectPool[effectPoolIdx] ?? { color: 0, cornerRadius: 0 }
  effectPool[effectPoolIdx++] = effect
  effect.renderObjectId = undefined
  effect.color = 0
  effect.cornerRadius = 0
  effect.shadow = undefined
  effect.glow = undefined
  effect.gradient = undefined
  effect.backdropBlur = undefined
  effect.backdropBrightness = undefined
  effect.backdropContrast = undefined
  effect.backdropSaturate = undefined
  effect.backdropGrayscale = undefined
  effect.backdropInvert = undefined
  effect.backdropSepia = undefined
  effect.backdropHueRotate = undefined
  effect.opacity = undefined
  effect.cornerRadii = undefined
  effect.transform = undefined
  effect.transformInverse = undefined
  effect.transformBounds = undefined
  effect.filter = undefined
  effect._node = undefined
  effect._stateHash = undefined
  return effect
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
) {
  const { layout } = state
  const dfsIndex = state.nodeCount.value++
  if (dfsIndex === 0) {
    effectPoolIdx = 0
    autoLayerCount = 0
  }
  node._dfsIndex = dfsIndex
  node._scrollContainerId = scrollContainerId
  if (isDebugEnabled()) state.nodePathById.set(node.id, String(dfsIndex))
  state.nodeRefById.set(node.id, node)

  if (node.kind !== "text") {
    const props = resolveProps(node)
    const isScroll = !!(props.scrollX || props.scrollY)
    if (isScroll) state.scrollContainers.push(node)
    const willChange = props.willChange
    const willChangeValues = willChange ? (Array.isArray(willChange) ? willChange : [willChange]) : []
    const hasValidWillChange = willChangeValues.some(v => VALID_WILL_CHANGE_VALUES.has(v))
    const hasSubtreeTransform = !!(props.transform && node.children.length > 0)
    const isInteractionLayer = shouldPromoteInteractionLayer(node)
    const hasBackdrop = hasBackdropEffect(props)
    let shouldBoundary = false
    if (props.layer === true) {
      node._autoLayer = false
      shouldBoundary = true
    } else if (isInteractionLayer || hasSubtreeTransform || hasValidWillChange) {
      node._autoLayer = false
      shouldBoundary = true
    } else if (hasBackdrop && autoLayerCount < AUTO_LAYER_BUDGET) {
      node._autoLayer = true
      autoLayerCount++
      shouldBoundary = true
    } else if (node._autoLayer === true && node._unstableFrameCount >= 3) {
      node._autoLayer = false
      node._stableFrameCount = 0
      node._unstableFrameCount = 0
    } else if (node._stableFrameCount >= 3 && hasPromotableArea(node) && autoLayerCount < AUTO_LAYER_BUDGET) {
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
    const props = resolveProps(node)
    const content = node.text || collectText(node)
    if (!content) return
    const color = (props.color as number) || 0xe0e0e0ff
    const fontSize = props.fontSize ?? 14
    const fontId = props.fontId ?? 0
    const lineHeight = props.lineHeight ?? Math.ceil(fontSize * 1.2)

    // Pre-measure text dimensions for layout (passed directly to layout.text)
    const measurement = node._lastMeasuredText === content && node._lastMeasuredFontId === fontId && node._lastMeasuredFontSize === fontSize && node._lastMeasurement
      ? node._lastMeasurement
      : measureForLayout(content, fontId, fontSize)
    node._lastMeasuredText = content
    node._lastMeasuredFontId = fontId
    node._lastMeasuredFontSize = fontSize
    node._lastMeasurement = measurement
    state.textMeasureIndex.value++

    // Track metadata for multi-line paint
    const meta: TextMeta = { nodeId: node.id, content, fontId, fontSize, lineHeight }
    state.textMetas.push(meta)
    state.textMetaMap.set(node.id, meta)

    layout.text(content, color, fontId, fontSize, node.id, measurement.width, measurement.height)
    state.textNodes.push(node)
    return
  }

  // ── <img> intrinsic — leaf node that paints decoded image pixels ──
  if (node.kind === "img") {
    const props = resolveProps(node)
    const extra = ensureImageExtra(node)
    // Trigger async decode if not started
    if (extra.state === "idle" && props.src) {
      decodeImageForNode(node)
    }

    // Emit a layout element for this image node
    state.boxNodes.push(node)
    layout.openElement()
    layout.setCurrentNodeId(node.id)

    // Sizing: use pre-parsed if explicit, else image intrinsic size, else fit
    const imgBuf = extra.buffer
    const ws = node._widthSizing ?? (imgBuf ? { type: SIZING.FIXED, value: imgBuf.width } : { type: SIZING.FIT, value: 0 })
    const hs = node._heightSizing ?? (imgBuf ? { type: SIZING.FIXED, value: imgBuf.height } : { type: SIZING.FIT, value: 0 })
    layout.configureSizing(ws.type, ws.value, hs.type, hs.value)

    // Use a placeholder RECT so the layout adapter emits a RECTANGLE command for painting
    const placeholderColor = 0x00000001 // near-transparent
    layout.configureRectangle(placeholderColor, props.cornerRadius ?? 0)
    registerRectNode(node, state)

    // Queue image data for paintCommand
    if (imgBuf) {
      state.imageQueue.set(node.id, {
        renderObjectId: node.id,
        color: placeholderColor,
        cornerRadius: props.cornerRadius ?? 0,
        imageBuffer: imgBuf,
        nativeImageHandle: extra.nativeHandle,
        objectFit: props.objectFit ?? "contain",
      })
    }

    layout.closeElement()
    return
  }

  // ── <canvas> intrinsic — imperative drawing surface ──
  if (node.kind === "canvas") {
    const props = resolveProps(node)
    const extra = ensureCanvasExtra(node)
    state.boxNodes.push(node)

    if (isInteractiveNode(props)) {
      layout.setId(`tge-node-${node.id}`)
    } else {
      layout.openElement()
    }
    layout.setCurrentNodeId(node.id)

    // Sizing: use pre-parsed or default to grow
    const ws = node._widthSizing ?? { type: SIZING.GROW, value: 0 }
    const hs = node._heightSizing ?? { type: SIZING.GROW, value: 0 }
    layout.configureSizing(ws.type, ws.value, hs.type, hs.value)

    // Use a UNIQUE placeholder RECT so Canvas emits a RECTANGLE command for painting.
    // Pack node.id into RGB, keep alpha near-transparent.
    const placeholderColor = (((node.id & 0x00ffffff) << 8) | 0x02) >>> 0
    layout.configureRectangle(placeholderColor, 0)
    registerRectNode(node, state)

    // Queue canvas config for paintCommand
    if (props.onDraw) {
      const viewportKey = props.viewport ? `${props.viewport.x},${props.viewport.y},${props.viewport.zoom}` : "default"
      const drawCacheKey = props.drawCacheKey === undefined ? null : `${props.drawCacheKey}:${viewportKey}`
      const canReuseCommands = drawCacheKey !== null && extra.drawCacheKey === drawCacheKey && extra.displayListCommands !== null && extra.displayListHash !== null
      let commands = extra.displayListCommands
      let hash = extra.displayListHash

      if (!canReuseCommands) {
        const ctx = new CanvasContext(props.viewport)
        props.onDraw(ctx)
        commands = ctx._commands
        const bytes = serializeCanvasDisplayList(commands)
        hash = hashCanvasDisplayList(bytes)
        extra.drawCacheKey = drawCacheKey
        extra.displayListCommands = commands
      }

      if (extra.nativeHandle && extra.displayListHash === hash) {
        nativeCanvasDisplayListTouch(extra.nativeHandle)
      } else {
        const bytes = serializeCanvasDisplayList(commands ?? [])
        const handle = nativeCanvasDisplayListUpdate({ key: `canvas:${node.id}`, bytes })
        if (handle) syncNativeCanvasDisplayListHandle(node, handle, hash)
      }
      state.canvasQueue.set(node.id, {
        renderObjectId: node.id,
        color: placeholderColor,
        onDraw: props.onDraw,
        displayListCommands: commands ?? undefined,
        viewport: props.viewport,
        nativeDisplayListHandle: extra.nativeHandle,
        displayListHash: extra.displayListHash,
      })
    }

    layout.closeElement()
    return
  }

  state.boxNodes.push(node)
  const props = resolveProps(node)

  // Assign layout element ID for:
  // 1. Scroll containers — for scroll offset tracking
  // 2. Interactive nodes — for reliable layout readback (hit-testing)
  // willChange pre-promotes to own layer — needs a stable layout ID for layer key (REQ-2B-501)
  const hasWillChange = props.willChange !== undefined
  const isScrollContainer = !!(props.scrollX || props.scrollY)
  const needsLayoutId = isInteractiveNode(props) || props.layer === true || hasWillChange
  if (isScrollContainer) {
    // Use node.id for a stable scroll ID that survives frame resets.
    // Fallback to user-provided scrollId for programmatic scroll handles.
    const sid = props.scrollId ?? `tge-scroll-${node.id}`
    layout.setId(sid)
    // Track counter for legacy compat (still incremented but not used for ID)
    state.scrollIdCounter.value++
    if (props.scrollSpeed) {
      state.scrollSpeedCap.value = props.scrollSpeed
    }
  } else if (needsLayoutId) {
    layout.setId(`tge-node-${node.id}`)
  } else {
    layout.openElement()
  }
  layout.setCurrentNodeId(node.id)

  // Layout — resolve aliases, then use per-side padding if set
  const dir = parseDirection(props.direction ?? props.flexDirection)
  const gap = props.gap ?? 0
  const ax = parseAlignX(props.alignX ?? props.justifyContent)
  const ay = parseAlignY(props.alignY ?? props.alignItems)

  const hasPerSidePadding = props.paddingLeft !== undefined || props.paddingRight !== undefined ||
                            props.paddingTop !== undefined || props.paddingBottom !== undefined
  if (hasPerSidePadding) {
    const basePx = props.paddingX ?? props.padding ?? 0
    const basePy = props.paddingY ?? props.padding ?? 0
    layout.configureLayoutFull(dir,
      props.paddingLeft ?? basePx,
      props.paddingRight ?? basePx,
      props.paddingTop ?? basePy,
      props.paddingBottom ?? basePy,
      gap, ax, ay)
  } else {
    const px = props.paddingX ?? props.padding ?? 0
    const py = props.paddingY ?? props.padding ?? 0
    layout.configureLayout(dir, px, py, gap, ax, ay)
  }

  // Margin — resolve axis aliases first, then per-side overrides.
  // Flexily's computed left/top already include margin, so layout map collection
  // can keep using getComputedLeft()/getComputedTop() directly.
  const hasPerSideMargin = props.marginLeft !== undefined || props.marginRight !== undefined ||
                            props.marginTop !== undefined || props.marginBottom !== undefined
  const hasAnyMargin = hasPerSideMargin || props.margin !== undefined ||
                        props.marginX !== undefined || props.marginY !== undefined
  if (hasAnyMargin) {
    const baseMx = props.marginX ?? props.margin ?? 0
    const baseMy = props.marginY ?? props.margin ?? 0
    layout.configureMargin(
      props.marginLeft ?? baseMx,
      props.marginRight ?? baseMx,
      props.marginTop ?? baseMy,
      props.marginBottom ?? baseMy,
    )
  }

  // Sizing — use pre-parsed values, fallback to FIT (Auto in Flexily).
  // Cross-axis stretching is handled by Flexily's default align_items: Stretch
  // (activated via alignItems=255/None in _defaultOpen). No manual stretch
  // emulation needed — removed the stretchW/stretchH hack that incorrectly
  // used flexGrow (main-axis only) for cross-axis stretching.
  const hasFlexGrowAlias = props.flexGrow !== undefined && props.width === undefined
  const FIT_DEFAULT: SizingInfo = { type: SIZING.FIT, value: 0 }
  const GROW_DEFAULT: SizingInfo = { type: SIZING.GROW, value: 0 }
  const ws = hasFlexGrowAlias
    ? GROW_DEFAULT
    : (node._widthSizing ?? FIT_DEFAULT)
  const hs = node._heightSizing ?? FIT_DEFAULT
  const hasMinMax = props.minWidth !== undefined || props.maxWidth !== undefined ||
                    props.minHeight !== undefined || props.maxHeight !== undefined
  if (hasMinMax) {
    layout.configureSizingMinMax(
      ws.type, ws.value, props.minWidth ?? 0, props.maxWidth ?? 100000,
      hs.type, hs.value, props.minHeight ?? 0, props.maxHeight ?? 100000,
    )
  } else {
    layout.configureSizing(ws.type, ws.value, hs.type, hs.value)
  }

  // Floating / absolute positioning
  if (props.floating) {
    const f = props.floating
    const ox = props.floatOffset?.x ?? 0
    const oy = props.floatOffset?.y ?? 0
    const z = props.zIndex ?? 0
    const ape = props.floatAttach?.element ?? ATTACH_POINT.LEFT_TOP
    const app = props.floatAttach?.parent ?? ATTACH_POINT.LEFT_TOP
    const pc = props.pointerPassthrough ? POINTER_CAPTURE.PASSTHROUGH : POINTER_CAPTURE.CAPTURE

    if (f === "parent") {
      layout.configureFloating(ATTACH_TO.PARENT, ox, oy, z, ape, app, pc, 0)
    } else if (f === "root") {
      layout.configureFloating(ATTACH_TO.ROOT, ox, oy, z, ape, app, pc, 0)
    } else if (typeof f === "object" && f.attachTo) {
      const pid = layout.hashString(f.attachTo)
      layout.configureFloating(ATTACH_TO.ELEMENT, ox, oy, z, ape, app, pc, pid)
    }
  }

  // Resolve visual props — merges hoverStyle/activeStyle when the node is hovered/active
  const vp = props

  // Inject a RECT command from the layout adapter when needed for:
  // 1. Visual effects (gradient, backdrop filter, opacity)
  // 2. Interactive nodes (onPress, focusable, hoverStyle, mouse callbacks)
  //    Without a RECT, the node doesn't enter rectNodes → no hit-testing → mouse events never fire.
  const hasBackdropFilter = hasBackdropEffect(vp)
  const hasTransform = vp.transform !== undefined
  const hasSelfFilter = vp.filter !== undefined
  const needsRect = vp.backgroundColor !== undefined || vp.gradient !== undefined || hasBackdropFilter || vp.opacity !== undefined || isInteractiveNode(vp) || hasTransform || hasSelfFilter
  if (needsRect) {
    const bgColor = vp.backgroundColor !== undefined ? (vp.backgroundColor as number) : 0x00000001
    const cr = vp.cornerRadius ?? 0
    layout.configureRectangle(bgColor, cr)
    registerRectNode(node, state)

    // Record effects for this RECT — matched during paint
    if (vp.shadow || vp.glow || vp.gradient || hasBackdropFilter || vp.cornerRadii || vp.opacity !== undefined || hasTransform || vp.filter) {
      const effect = claimEffect()
      effect.renderObjectId = node.id
      effect.color = bgColor
      effect.cornerRadius = cr
      effect._node = node
      if (vp.shadow) {
        effect.shadow = vp.shadow
      }
      if (vp.glow) {
        effect.glow = {
          radius: vp.glow.radius,
          color: vp.glow.color as number,
          intensity: vp.glow.intensity ?? 80,
        }
      }
      if (vp.gradient) {
        const g = vp.gradient
        if (g.type === "linear") {
          effect.gradient = { type: "linear", from: g.from, to: g.to, angle: g.angle ?? 90 }
        } else {
          effect.gradient = { type: "radial", from: g.from, to: g.to }
        }
      }
      if (vp.backdropBlur) effect.backdropBlur = vp.backdropBlur
      if (vp.backdropBrightness !== undefined) effect.backdropBrightness = vp.backdropBrightness
      if (vp.backdropContrast !== undefined) effect.backdropContrast = vp.backdropContrast
      if (vp.backdropSaturate !== undefined) effect.backdropSaturate = vp.backdropSaturate
      if (vp.backdropGrayscale !== undefined) effect.backdropGrayscale = vp.backdropGrayscale
      if (vp.backdropInvert !== undefined) effect.backdropInvert = vp.backdropInvert
      if (vp.backdropSepia !== undefined) effect.backdropSepia = vp.backdropSepia
      if (vp.backdropHueRotate !== undefined) effect.backdropHueRotate = vp.backdropHueRotate
      if (vp.opacity !== undefined) effect.opacity = vp.opacity
      if (vp.cornerRadii) effect.cornerRadii = vp.cornerRadii
      if (vp.filter) effect.filter = vp.filter
      if (hasTransform && vp.transform) {
        const usesSubtreeTransformPass = node.children.length > 0
        if (!usesSubtreeTransformPass) {
          effect.transform = new Float64Array(9)
        }
      }
      state.effectsQueue.set(node.id, effect)
    }
  }

  // Borders — per-side or uniform (uses resolved visual props)
  const maxInteractiveBorder = Math.max(
    props.focusStyle?.borderWidth ?? 0,
    props.hoverStyle?.borderWidth ?? 0,
    props.activeStyle?.borderWidth ?? 0,
  )
  const effectiveBorderWidth = Math.max(vp.borderWidth ?? 0, maxInteractiveBorder)

  const hasPerSideBorder = vp.borderLeft !== undefined || vp.borderRight !== undefined ||
                           vp.borderTop !== undefined || vp.borderBottom !== undefined ||
                           vp.borderBetweenChildren !== undefined
  if (hasPerSideBorder && vp.borderColor !== undefined) {
    const borderColor = vp.borderColor as number
    layout.configureBorderSides(borderColor,
      vp.borderLeft ?? 0,
      vp.borderRight ?? 0,
      vp.borderTop ?? 0,
      vp.borderBottom ?? 0,
      vp.borderBetweenChildren ?? 0)
  } else if (effectiveBorderWidth > 0) {
    const borderColor = (vp.borderColor !== undefined ? vp.borderColor : 0x00000000) as number
    layout.configureBorder(borderColor, effectiveBorderWidth)
  }

  // Scroll / clip container.
  // Scroll offsets are applied TS-side in applyScrollOffsets() after layout —
  // the offset params here were layout-adapter no-ops and have been removed.
  if (props.scrollX || props.scrollY) {
    layout.configureClip(
      props.scrollX ?? false,
      props.scrollY ?? false,
      0,
      0,
    )
  }

  // ── AABB viewport culling (Slice 3.3) ──
  // Use previous-frame layout to decide whether to descend into children.
  // Scroll containers are exempt — their children may scroll into view.
  // We still open/close the element for the current node (Flexily needs balance),
  // but we skip all children — reducing layout commands and paint work.
  if (
    state.cullingEnabled
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
        layout.closeElement()
        return
      }
    }
  }

  // Propagate transform ancestry to children
  const childInsideXform = insideTransform || hasTransform
  const childScrollContainerId = isScrollContainer ? node.id : scrollContainerId
  const childInsideScroll = insideScroll || isScrollContainer
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    walkTree(child, state, dir, childInsideXform, childScrollContainerId, childInsideScroll)
  }

  layout.closeElement()
}
