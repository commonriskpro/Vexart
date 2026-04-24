/**
 * walk-tree.ts — TGENode tree walking + Clay layout feeding.
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
} from "../ffi/node"
import { measureForClay } from "../ffi/text-layout"
import { CanvasContext, hashCanvasDisplayList, serializeCanvasDisplayList } from "../ffi/canvas"
import { nativeCanvasDisplayListTouch, nativeCanvasDisplayListUpdate, syncNativeCanvasDisplayListHandle } from "../ffi/native-canvas-display-list"
import { decodeImageForNode } from "./image"
import { ATTACH_TO, ATTACH_POINT, POINTER_CAPTURE, type createVexartLayoutCtx } from "./layout-adapter"
import type { EffectConfig, TextMeta, ImagePaintConfig, CanvasPaintConfig } from "../ffi/render-graph"

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

  // Accumulator arrays — cleared before each walk, populated during walk
  rectNodes: TGENode[]
  textNodes: TGENode[]
  boxNodes: TGENode[]
  textMetas: TextMeta[]

  // Lookup maps populated during walk
  nodePathById: Map<number, string>
  nodeRefById: Map<number, TGENode>

  // Effect / image / canvas queues
  effectsQueue: EffectConfig[]
  imageQueue: ImagePaintConfig[]
  canvasQueue: CanvasPaintConfig[]

  // Text metadata map (keyed by content) — used during paint for multi-line layout
  textMetaMap: Map<string, TextMeta>

  // Rect node lookup (by id) — used by interaction state
  rectNodeById: Map<number, TGENode>

  // Clay adapter — the layout engine interface
  clay: ReturnType<typeof createVexartLayoutCtx>

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
 * Called whenever Clay is configured to emit a RECTANGLE command for a node.
 */
export function registerRectNode(node: TGENode, state: WalkTreeState) {
  state.rectNodes.push(node)
  state.rectNodeById.set(node.id, node)
}

// ── walkTree ──────────────────────────────────────────────────────────────

/**
 * Walk TGENode tree and replay into Clay (immediate mode).
 * This is the FIRST pass — it only feeds Clay, no layer assignment.
 *
 * Text measurement: Before calling clay.text(), we pre-measure
 * the text with Pretext and register the measurement so Clay's
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
  path = "r",
) {
  const { clay } = state
  state.nodePathById.set(node.id, path)
  state.nodeRefById.set(node.id, node)

  if (node.kind === "text") {
    const content = node.text || collectText(node)
    if (!content) return
    const color = (node.props.color as number) || 0xe0e0e0ff
    const fontSize = node.props.fontSize ?? 14
    const fontId = node.props.fontId ?? 0
    const lineHeight = node.props.lineHeight ?? Math.ceil(fontSize * 1.2)

    // Pre-measure text dimensions for layout (passed directly to clay.text)
    const measurement = measureForClay(content, fontId, fontSize)
    state.textMeasureIndex.value++

    // Track metadata for multi-line paint
    const meta: TextMeta = { content, fontId, fontSize, lineHeight }
    state.textMetas.push(meta)
    state.textMetaMap.set(content, meta)

    clay.text(content, color, fontId, fontSize, node.id, measurement.width, measurement.height)
    state.textNodes.push(node)
    return
  }

  // ── <img> intrinsic — leaf node that paints decoded image pixels ──
  if (node.kind === "img") {
    // Trigger async decode if not started
    if (node._imageState === "idle" && node.props.src) {
      decodeImageForNode(node)
    }

    // Emit a layout element for this image node
    state.boxNodes.push(node)
    clay.openElement()
    clay.setCurrentNodeId(node.id)

    // Sizing: use pre-parsed if explicit, else image intrinsic size, else fit
    const imgBuf = node._imageBuffer
    const ws = node._widthSizing ?? (imgBuf ? { type: SIZING.FIXED, value: imgBuf.width } : { type: SIZING.FIT, value: 0 })
    const hs = node._heightSizing ?? (imgBuf ? { type: SIZING.FIXED, value: imgBuf.height } : { type: SIZING.FIT, value: 0 })
    clay.configureSizing(ws.type, ws.value, hs.type, hs.value)

    // Use a placeholder RECT so Clay emits a RECTANGLE command for painting
    const placeholderColor = 0x00000001 // near-transparent
    clay.configureRectangle(placeholderColor, node.props.cornerRadius ?? 0)
    registerRectNode(node, state)

    // Queue image data for paintCommand
    if (imgBuf) {
      state.imageQueue.push({
        renderObjectId: node.id,
        color: placeholderColor,
        cornerRadius: node.props.cornerRadius ?? 0,
        imageBuffer: imgBuf,
        nativeImageHandle: node._nativeImageHandle,
        objectFit: node.props.objectFit ?? "contain",
      })
    }

    clay.closeElement()
    return
  }

  // ── <canvas> intrinsic — imperative drawing surface ──
  if (node.kind === "canvas") {
    state.boxNodes.push(node)

    const hasMouseProps = node.props.onMouseDown || node.props.onMouseUp || node.props.onMouseMove || node.props.onMouseOver || node.props.onMouseOut
    const isInteractive = node.props.focusable || node.props.hoverStyle || node.props.activeStyle || node.props.focusStyle || node.props.onPress || hasMouseProps
    if (isInteractive) {
      clay.setId(`tge-node-${node.id}`)
    } else {
      clay.openElement()
    }
    clay.setCurrentNodeId(node.id)

    // Sizing: use pre-parsed or default to grow
    const ws = node._widthSizing ?? { type: SIZING.GROW, value: 0 }
    const hs = node._heightSizing ?? { type: SIZING.GROW, value: 0 }
    clay.configureSizing(ws.type, ws.value, hs.type, hs.value)

    // Use a UNIQUE placeholder RECT so Canvas emits a RECTANGLE command for painting.
    // Pack node.id into RGB, keep alpha near-transparent.
    const placeholderColor = (((node.id & 0x00ffffff) << 8) | 0x02) >>> 0
    clay.configureRectangle(placeholderColor, 0)
    registerRectNode(node, state)

    // Queue canvas config for paintCommand
    if (node.props.onDraw) {
      const ctx = new CanvasContext(node.props.viewport)
      node.props.onDraw(ctx)
      const bytes = serializeCanvasDisplayList(ctx._commands)
      const hash = hashCanvasDisplayList(bytes)
      if (node._nativeCanvasDisplayListHandle && node._canvasDisplayListHash === hash) {
        nativeCanvasDisplayListTouch(node._nativeCanvasDisplayListHandle)
      } else {
        const handle = nativeCanvasDisplayListUpdate({ key: `canvas:${node.id}`, bytes })
        if (handle) syncNativeCanvasDisplayListHandle(node, handle, hash)
      }
      state.canvasQueue.push({
        renderObjectId: node.id,
        color: placeholderColor,
        onDraw: node.props.onDraw,
        viewport: node.props.viewport,
        nativeDisplayListHandle: node._nativeCanvasDisplayListHandle,
        displayListHash: node._canvasDisplayListHash,
      })
    }

    clay.closeElement()
    return
  }

  state.boxNodes.push(node)

  // Assign Clay element ID for:
  // 1. Scroll containers — for scroll offset tracking
  // 2. Interactive nodes — for reliable layout readback (hit-testing)
  const hasMouseProps = node.props.onMouseDown || node.props.onMouseUp || node.props.onMouseMove || node.props.onMouseOver || node.props.onMouseOut
  const isInteractive = node.props.focusable || node.props.hoverStyle || node.props.activeStyle || node.props.focusStyle || node.props.onPress || hasMouseProps
  // willChange pre-promotes to own layer — needs a stable layout ID for layer key (REQ-2B-501)
  const hasWillChange = node.props.willChange !== undefined
  const needsLayoutId = isInteractive || node.props.layer === true || hasWillChange
  if (node.props.scrollX || node.props.scrollY) {
    // Use node.id for a stable scroll ID that survives frame resets.
    // Fallback to user-provided scrollId for programmatic scroll handles.
    const sid = node.props.scrollId ?? `tge-scroll-${node.id}`
    clay.setId(sid)
    // Track counter for legacy compat (still incremented but not used for ID)
    state.scrollIdCounter.value++
    if (node.props.scrollSpeed) {
      state.scrollSpeedCap.value = node.props.scrollSpeed
    }
  } else if (needsLayoutId) {
    clay.setId(`tge-node-${node.id}`)
  } else {
    clay.openElement()
  }
  clay.setCurrentNodeId(node.id)

  // Layout — resolve aliases, then use per-side padding if set
  const dir = parseDirection(node.props.direction ?? node.props.flexDirection)
  const gap = node.props.gap ?? 0
  const ax = parseAlignX(node.props.alignX ?? node.props.justifyContent)
  const ay = parseAlignY(node.props.alignY ?? node.props.alignItems)

  const hasPerSidePadding = node.props.paddingLeft !== undefined || node.props.paddingRight !== undefined ||
                            node.props.paddingTop !== undefined || node.props.paddingBottom !== undefined
  if (hasPerSidePadding) {
    const basePx = node.props.paddingX ?? node.props.padding ?? 0
    const basePy = node.props.paddingY ?? node.props.padding ?? 0
    clay.configureLayoutFull(dir,
      node.props.paddingLeft ?? basePx,
      node.props.paddingRight ?? basePx,
      node.props.paddingTop ?? basePy,
      node.props.paddingBottom ?? basePy,
      gap, ax, ay)
  } else {
    const px = node.props.paddingX ?? node.props.padding ?? 0
    const py = node.props.paddingY ?? node.props.padding ?? 0
    clay.configureLayout(dir, px, py, gap, ax, ay)
  }

  // Sizing — use pre-parsed values, fallback to FIT (Auto in Taffy).
  // Cross-axis stretching is handled by Taffy's default align_items: Stretch
  // (activated via alignItems=255/None in _defaultOpen). No manual stretch
  // emulation needed — removed the stretchW/stretchH hack that incorrectly
  // used flexGrow (main-axis only) for cross-axis stretching.
  const hasFlexGrowAlias = node.props.flexGrow !== undefined && node.props.width === undefined
  const FIT_DEFAULT: SizingInfo = { type: SIZING.FIT, value: 0 }
  const GROW_DEFAULT: SizingInfo = { type: SIZING.GROW, value: 0 }
  const ws = hasFlexGrowAlias
    ? GROW_DEFAULT
    : (node._widthSizing ?? FIT_DEFAULT)
  const hs = node._heightSizing ?? FIT_DEFAULT
  const hasMinMax = node.props.minWidth !== undefined || node.props.maxWidth !== undefined ||
                    node.props.minHeight !== undefined || node.props.maxHeight !== undefined
  if (hasMinMax) {
    clay.configureSizingMinMax(
      ws.type, ws.value, node.props.minWidth ?? 0, node.props.maxWidth ?? 100000,
      hs.type, hs.value, node.props.minHeight ?? 0, node.props.maxHeight ?? 100000,
    )
  } else {
    clay.configureSizing(ws.type, ws.value, hs.type, hs.value)
  }

  // Floating / absolute positioning
  if (node.props.floating) {
    const f = node.props.floating
    const ox = node.props.floatOffset?.x ?? 0
    const oy = node.props.floatOffset?.y ?? 0
    const z = node.props.zIndex ?? 0
    const ape = node.props.floatAttach?.element ?? ATTACH_POINT.LEFT_TOP
    const app = node.props.floatAttach?.parent ?? ATTACH_POINT.LEFT_TOP
    const pc = node.props.pointerPassthrough ? POINTER_CAPTURE.PASSTHROUGH : POINTER_CAPTURE.CAPTURE

    if (f === "parent") {
      clay.configureFloating(ATTACH_TO.PARENT, ox, oy, z, ape, app, pc, 0)
    } else if (f === "root") {
      clay.configureFloating(ATTACH_TO.ROOT, ox, oy, z, ape, app, pc, 0)
    } else if (typeof f === "object" && f.attachTo) {
      const pid = clay.hashString(f.attachTo)
      clay.configureFloating(ATTACH_TO.ELEMENT, ox, oy, z, ape, app, pc, pid)
    }
  }

  // Resolve visual props — merges hoverStyle/activeStyle when the node is hovered/active
  const vp = resolveProps(node)

  // Inject a RECT command from Clay when needed for:
  // 1. Visual effects (gradient, backdrop filter, opacity)
  // 2. Interactive nodes (onPress, focusable, hoverStyle, mouse callbacks)
  //    Without a RECT, the node doesn't enter rectNodes → no hit-testing → mouse events never fire.
  const hasBackdropFilter = vp.backdropBlur !== undefined || vp.backdropBrightness !== undefined ||
    vp.backdropContrast !== undefined || vp.backdropSaturate !== undefined ||
    vp.backdropGrayscale !== undefined || vp.backdropInvert !== undefined ||
    vp.backdropSepia !== undefined || vp.backdropHueRotate !== undefined
  const hasMouseCallbacks = vp.onMouseDown || vp.onMouseUp || vp.onMouseMove || vp.onMouseOver || vp.onMouseOut
  const isInteractiveNode = vp.onPress || vp.focusable || vp.hoverStyle || vp.activeStyle || vp.focusStyle || hasMouseCallbacks
  const hasTransform = vp.transform !== undefined
  const hasSelfFilter = vp.filter !== undefined
  const needsRect = vp.backgroundColor !== undefined || vp.gradient !== undefined || hasBackdropFilter || vp.opacity !== undefined || isInteractiveNode || hasTransform || hasSelfFilter
  if (needsRect) {
    const bgColor = vp.backgroundColor !== undefined ? (vp.backgroundColor as number) : 0x00000001
    const cr = vp.cornerRadius ?? 0
    clay.configureRectangle(bgColor, cr)
    registerRectNode(node, state)

    // Record effects for this RECT — matched during paint
    if (vp.shadow || vp.glow || vp.gradient || hasBackdropFilter || vp.cornerRadii || vp.opacity !== undefined || hasTransform || vp.filter) {
      const effect: EffectConfig = { renderObjectId: node.id, color: bgColor, cornerRadius: cr, _node: node }
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
      state.effectsQueue.push(effect)
    }
  }

  // Borders — per-side or uniform (uses resolved visual props)
  const maxInteractiveBorder = Math.max(
    node.props.focusStyle?.borderWidth ?? 0,
    node.props.hoverStyle?.borderWidth ?? 0,
    node.props.activeStyle?.borderWidth ?? 0,
  )
  const effectiveBorderWidth = Math.max(vp.borderWidth ?? 0, maxInteractiveBorder)

  const hasPerSideBorder = vp.borderLeft !== undefined || vp.borderRight !== undefined ||
                           vp.borderTop !== undefined || vp.borderBottom !== undefined ||
                           vp.borderBetweenChildren !== undefined
  if (hasPerSideBorder && vp.borderColor !== undefined) {
    const borderColor = vp.borderColor as number
    clay.configureBorderSides(borderColor,
      vp.borderLeft ?? 0,
      vp.borderRight ?? 0,
      vp.borderTop ?? 0,
      vp.borderBottom ?? 0,
      vp.borderBetweenChildren ?? 0)
  } else if (effectiveBorderWidth > 0) {
    const borderColor = (vp.borderColor !== undefined ? vp.borderColor : 0x00000000) as number
    clay.configureBorder(borderColor, effectiveBorderWidth)
  }

  // Scroll / clip container.
  // Scroll offsets are applied TS-side in applyScrollOffsets() after layout —
  // the offset params here were Clay-era no-ops and have been removed.
  if (node.props.scrollX || node.props.scrollY) {
    clay.configureClip(
      node.props.scrollX ?? false,
      node.props.scrollY ?? false,
      0,
      0,
    )
  }

  // ── AABB viewport culling (Slice 3.3) ──
  // Use previous-frame layout to decide whether to descend into children.
  // Scroll containers are exempt — their children may scroll into view.
  // We still open/close the element for the current node (Clay needs balance),
  // but we skip all children — reducing Clay commands and paint work.
  const isScrollContainer = !!(node.props.scrollX || node.props.scrollY)
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
        clay.closeElement()
        return
      }
    }
  }

  // Propagate transform ancestry to children
  const childInsideXform = insideTransform || hasTransform
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    walkTree(child, state, dir, childInsideXform, `${path}.${i}`)
  }

  clay.closeElement()
}
