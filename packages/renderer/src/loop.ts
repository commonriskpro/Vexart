/**
 * Render loop — connects SolidJS tree → Clay layout → Zig paint → output.
 *
 * Browser-style layer compositing with recursive boundary detection:
 *   1. Walk TGENode tree and replay into Clay (immediate mode)
 *   2. Simultaneously build a command→layer assignment map
 *   3. Clay calculates layout → flat array of RenderCommands
 *   4. Group commands by layer using the assignment map
 *   5. Only repaint dirty layers → per-layer pixel buffer
 *   6. Only retransmit dirty layers → per-layer Kitty image with z-index
 *   7. Clean layers: zero I/O (terminal keeps the old image in GPU VRAM)
 *
 * Layer boundary rules (evaluated recursively):
 *   - `layer` prop: explicit opt-in, any Box becomes its own layer
 *   - Background layer: everything above the first layer boundary
 *
 * This replaces the old "each layoutRoot child = one layer" approach
 * with recursive layer detection at ANY depth in the tree.
 */

import type { Terminal } from "@tge/terminal"
import type { PixelBuffer } from "@tge/pixel"
import { create, clear, paint, over, sub } from "@tge/pixel"
import { createComposer, createLayerComposer } from "@tge/output"
import { clay, CMD, ATTACH_TO, ATTACH_POINT, POINTER_CAPTURE } from "./clay"
import type { RenderCommand } from "./clay"
import {
  type TGENode,
  createNode,
  parseColor,
  parseSizing,
  parseDirection,
  parseAlignX,
  parseAlignY,
  resolveProps,
} from "./node"
import { isDirty, clearDirty, markDirty } from "./dirty"
import { hasActiveAnimations } from "./animation"
import { decodeImageForNode, scaleImage } from "./image"
import {
  type Layer,
  createLayer,
  markAllDirty,
  updateLayerGeometry,
  clearLayer,
  markLayerClean,
  imageIdForLayer,
  resetLayers,
  dirtyCount,
} from "./layers"
import { measureForClay, layoutText, getFont, fontToCSS } from "./text-layout"
import { appendFileSync } from "fs"

const LOG = "/tmp/tge-layers.log"
function log(msg: string) {
  appendFileSync(LOG, msg + "\n")
}

// ── Text metadata ──
// During walkTree, we record text props for each <Text> node.
// During paint, we look up the metadata by text content to do multi-line layout.
type TextMeta = { content: string; fontId: number; fontSize: number; lineHeight: number }
const textMetaMap = new Map<string, TextMeta>()

// ── Selectable text collection ──
// In selectableText mode, CMD.TEXT is skipped during pixel paint.
// Instead, text commands are collected here and emitted as ANSI after rendering.
type AnsiTextCommand = {
  text: string
  x: number          // pixel x
  y: number          // pixel y
  r: number; g: number; b: number; a: number  // color components
  lineHeight: number
  maxWidth: number
  fontId: number
}
let pendingAnsiTexts: AnsiTextCommand[] = []
/** Module-level flag set by createRenderLoop when selectableText is active. */
let selectableTextMode = false

// ── Effect metadata ──
// During walkTree, we record shadow/glow configs for nodes with backgroundColor.
// After Clay layout, we match RECT commands to these configs by color+radius
// (emitted in tree-walk order) and apply effects in paintCommand.

type ShadowDef = { x: number; y: number; blur: number; color: number }

type EffectConfig = {
  color: number        // packed bgColor to match against RECT command
  cornerRadius: number // to disambiguate rects with same color
  shadow?: ShadowDef | ShadowDef[]
  glow?: { radius: number; color: number; intensity: number }
  gradient?: { type: "linear"; from: number; to: number; angle: number }
           | { type: "radial"; from: number; to: number }
  backdropBlur?: number
  cornerRadii?: { tl: number; tr: number; br: number; bl: number }
}

/** Effects queue — populated during walkTree, consumed during paintCommand. */
let effectsQueue: EffectConfig[] = []

/** Image queue — populated during walkTree for <img> nodes, consumed during paintCommand. */
type ImagePaintConfig = {
  color: number        // placeholder color to match against RECT command
  cornerRadius: number
  imageBuffer: { data: Uint8Array; width: number; height: number }
  objectFit: "contain" | "cover" | "fill" | "none"
}
let imageQueue: ImagePaintConfig[] = []

export type RenderLoopOptions = {
  /** When true, text is rendered as ANSI escape codes (selectable/copiable)
   *  instead of bitmap pixels. Backgrounds render as images at z=-1. */
  selectableText?: boolean
  /** Experimental optimizations — these may change or be removed. */
  experimental?: {
    /**
     * Partial updates: when a layer changes, find the bounding box of dirty
     * pixels and transmit only that region (via Kitty animation frame a=f).
     * Falls back to full retransmit if >50% of pixels changed.
     * Default: false
     */
    partialUpdates?: boolean
    /**
     * Frame budget in ms. If a frame exceeds this budget during layer painting,
     * remaining non-background layers are deferred to the next frame.
     * Set to 0 to disable. Default: 0 (disabled)
     */
    frameBudgetMs?: number
    /**
     * Maximum FPS cap. Default: 60.
     * Idle: always 30fps. During animations: scales up to this value.
     * Set to 30 to force 30fps always (e.g., for SSH).
     */
    maxFps?: number
  }
}

export type RenderLoop = {
  /** The root TGENode — SolidJS mounts here */
  root: TGENode
  /** Start the render loop */
  start: () => void
  /** Stop the render loop */
  stop: () => void
  /** Force a single frame render */
  frame: () => void
  /** Feed scroll delta from input events */
  feedScroll: (dx: number, dy: number) => void
  /** Feed mouse pointer position */
  feedPointer: (x: number, y: number, down: boolean) => void
  /** Suspend rendering — stop loop, restore terminal for external process ($EDITOR) */
  suspend: () => void
  /** Resume rendering — re-enter TGE mode, force full repaint */
  resume: () => void
  /** Whether the loop is currently suspended */
  suspended: () => boolean
  /** Destroy everything */
  destroy: () => void
}

// ── Layer assignment map ──

/**
 * A "layer slot" discovered during tree walking.
 * Each slot corresponds to a node with `layer` prop or the background.
 */
type LayerSlot = {
  /** Stable key — stringified tree path so we can reuse Layer objects across frames. */
  key: string
  /** z-order: -1 for background, 0+ for content layers in tree order. */
  z: number
  /** Command indices assigned to this slot. */
  cmdIndices: number[]
}

export function createRenderLoop(term: Terminal, opts?: RenderLoopOptions): RenderLoop {
  const selectableText = opts?.selectableText ?? false
  const expPartialUpdates = opts?.experimental?.partialUpdates ?? false
  const expFrameBudgetMs = opts?.experimental?.frameBudgetMs ?? 0
  selectableTextMode = selectableText
  const root = createNode("root")

  // Initialize Clay with pixel dimensions
  const pw = term.size.pixelWidth || term.size.cols * (term.size.cellWidth || 8)
  const ph = term.size.pixelHeight || term.size.rows * (term.size.cellHeight || 16)

  root.props = { width: pw, height: ph }
  clay.init(pw, ph)

  // Detect backend: use layer compositor for kitty direct, old compositor for others
  const useLayerCompositing = term.caps.kittyGraphics
  const layerComposer = useLayerCompositing
    ? createLayerComposer(term.write, term.rawWrite, term.caps.transmissionMode, true)
    : null
  const fallbackComposer = !useLayerCompositing
    ? createComposer(term.write, term.rawWrite, term.caps)
    : null

  // Fallback single-buffer for non-kitty backends
  let fallbackBuf = !useLayerCompositing ? create(pw, ph) : null

  let timer: ReturnType<typeof setTimeout> | null = null
  const maxFps = opts?.experimental?.maxFps ?? 60
  const idleInterval = 33  // ~30fps
  const activeInterval = Math.max(Math.round(1000 / maxFps), 8) // min 8ms ≈ 120fps cap
  let isSuspended = false

  // ── Scroll + pointer state ──
  // Accumulates scroll deltas from input events between frames.
  let scrollDeltaX = 0
  let scrollDeltaY = 0
  let pointerX = pw / 2  // Default to center so scroll container is "hovered"
  let pointerY = ph / 2
  let pointerDown = false
  let pointerDirty = true  // Feed at least once
  let scrollSpeedCap = 0  // 0 = no cap (natural), >0 = lines per tick
  let lastFrameTime = Date.now()

  /** Feed a scroll event from the input system. Called by mount(). */
  function feedScroll(dx: number, dy: number) {
    scrollDeltaX += dx
    scrollDeltaY += dy
    markDirty() // scroll changes need a repaint
  }

  /** Feed mouse position from the input system. */
  function feedPointer(x: number, y: number, down: boolean) {
    pointerX = x
    pointerY = y
    pointerDown = down
    pointerDirty = true
  }

  // ── Layer cache ──
  // Maps slot key → Layer object. Layers persist across frames.
  const layerCache = new Map<string, Layer>()
  let nextZ = 0

  /** Get or create a Layer for a given slot key and z-order. */
  function getOrCreateLayer(key: string, z: number): Layer {
    const existing = layerCache.get(key)
    if (existing) {
      existing.z = z
      return existing
    }
    const layer = createLayer(z)
    layerCache.set(key, layer)
    return layer
  }

  // ── Tree walking with layer assignment ──

  /** Collect all text content from a node's children recursively. */
  function collectText(node: TGENode): string {
    if (node.text) return node.text
    let result = ""
    for (const child of node.children) {
      result += collectText(child)
    }
    return result
  }

  /**
   * Walk TGENode tree and replay into Clay (immediate mode).
   * This is the FIRST pass — it only feeds Clay, no layer assignment.
   *
   * Text measurement: Before calling clay.text(), we pre-measure
   * the text with Pretext and register the measurement so Clay's
   * callback can read accurate width/height.
   */
  let scrollIdCounter = 0
  let textMeasureIndex = 0

  const textMetas: TextMeta[] = []

  /** Nodes that emit a RECT command, in walkTree order. Used to write layout back. */
  const rectNodes: TGENode[] = []
  /** Nodes that emit a TEXT command, in walkTree order. */
  const textNodes: TGENode[] = []
  /** ALL box nodes in walkTree order (open/close pairs = Clay element order). */
  const boxNodes: TGENode[] = []

  function walkTree(node: TGENode) {
    if (node.kind === "text") {
      const content = node.text || collectText(node)
      if (!content) return
      const color = parseColor(node.props.color) || 0xe0e0e0ff
      const fontSize = node.props.fontSize ?? 14
      const fontId = node.props.fontId ?? 0
      const lineHeight = node.props.lineHeight ?? Math.ceil(fontSize * 1.2)

      // Pre-measure with Pretext for Clay
      const measurement = measureForClay(content, fontId, fontSize)
      clay.setTextMeasure(textMeasureIndex, measurement.width, measurement.height)
      textMeasureIndex++

      // Track metadata for multi-line paint
      const meta: TextMeta = { content, fontId, fontSize, lineHeight }
      textMetas.push(meta)
      textMetaMap.set(content, meta)

      clay.text(content, color, fontId, fontSize)
      textNodes.push(node)
      return
    }

    // ── <img> intrinsic — leaf node that paints decoded image pixels ──
    if (node.kind === "img") {
      // Trigger async decode if not started
      if (node._imageState === "idle" && node.props.src) {
        decodeImageForNode(node)
      }

      // Emit a Clay element for layout (sized to image or explicit size)
      boxNodes.push(node)
      clay.openElement()

      // Sizing: use explicit width/height, or image intrinsic size, or fit
      const imgBuf = node._imageBuffer
      const explicitW = node.props.width
      const explicitH = node.props.height
      const ws = parseSizing(explicitW ?? (imgBuf ? imgBuf.width : "fit"))
      const hs = parseSizing(explicitH ?? (imgBuf ? imgBuf.height : "fit"))
      clay.configureSizing(ws.type, ws.value, hs.type, hs.value)

      // Use a placeholder RECT so Clay emits a RECTANGLE command for painting
      const placeholderColor = 0x00000001 // near-transparent
      clay.configureRectangle(placeholderColor, node.props.cornerRadius ?? 0)
      rectNodes.push(node)

      // Queue image data for paintCommand
      if (imgBuf) {
        imageQueue.push({
          color: placeholderColor,
          cornerRadius: node.props.cornerRadius ?? 0,
          imageBuffer: imgBuf,
          objectFit: node.props.objectFit ?? "contain",
        })
      }

      clay.closeElement()
      return
    }

    boxNodes.push(node)

    // Scroll containers need a stable Clay ID for scroll offset tracking
    if (node.props.scrollX || node.props.scrollY) {
      const sid = node.props.scrollId ?? `tge-scroll-${scrollIdCounter++}`
      clay.setId(sid)
      if (node.props.scrollSpeed) {
        scrollSpeedCap = node.props.scrollSpeed
      }
    } else {
      clay.openElement()
    }

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

    // Sizing — resolve flexGrow alias, then use min/max if set
    const effectiveWidth = node.props.flexGrow !== undefined && node.props.width === undefined ? "grow" : node.props.width
    const ws = parseSizing(effectiveWidth)
    const hs = parseSizing(node.props.height)
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

    // Gradient/backdropBlur need a RECT command from Clay even without explicit backgroundColor.
    // We inject a transparent placeholder so Clay emits the RECT for effect matching.
    const needsRect = vp.backgroundColor !== undefined || vp.gradient !== undefined || vp.backdropBlur !== undefined
    if (needsRect) {
      const bgColor = vp.backgroundColor !== undefined ? parseColor(vp.backgroundColor) : 0x00000001 // near-transparent placeholder
      const cr = vp.cornerRadius ?? 0
      clay.configureRectangle(bgColor, cr)
      rectNodes.push(node)

      // Record effects for this RECT — matched during paint
      if (vp.shadow || vp.glow || vp.gradient || vp.backdropBlur || vp.cornerRadii) {
        const effect: EffectConfig = { color: bgColor, cornerRadius: cr }
        if (vp.shadow) {
          effect.shadow = vp.shadow
        }
        if (vp.glow) {
          effect.glow = {
            radius: vp.glow.radius,
            color: parseColor(vp.glow.color),
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
        if (vp.backdropBlur) {
          effect.backdropBlur = vp.backdropBlur
        }
        if (vp.cornerRadii) {
          effect.cornerRadii = vp.cornerRadii
        }
        effectsQueue.push(effect)
      }
    }

    // Borders — per-side or uniform (uses resolved visual props)
    const hasPerSideBorder = vp.borderLeft !== undefined || vp.borderRight !== undefined ||
                             vp.borderTop !== undefined || vp.borderBottom !== undefined ||
                             vp.borderBetweenChildren !== undefined
    if (hasPerSideBorder && vp.borderColor !== undefined) {
      const borderColor = parseColor(vp.borderColor)
      clay.configureBorderSides(borderColor,
        vp.borderLeft ?? 0,
        vp.borderRight ?? 0,
        vp.borderTop ?? 0,
        vp.borderBottom ?? 0,
        vp.borderBetweenChildren ?? 0)
    } else if (vp.borderColor !== undefined && vp.borderWidth) {
      const borderColor = parseColor(vp.borderColor)
      clay.configureBorder(borderColor, vp.borderWidth)
    }

    // Scroll / clip container
    if (node.props.scrollX || node.props.scrollY) {
      const offset = clay.getScrollOffset()
      clay.configureClip(
        node.props.scrollX ?? false,
        node.props.scrollY ?? false,
        offset.x,
        offset.y,
      )
    }

    for (const child of node.children) {
      walkTree(child)
    }

    clay.closeElement()
  }

  // ── Layer assignment (spatial matching) ──

  /**
   * A layer boundary discovered during tree walking.
   * Records the node's path, z-order, and whether it's a scroll container.
   */
  type LayerBoundary = {
    path: string
    z: number
    /** True if this node is a scroll container (scrollX/scrollY). */
    isScroll: boolean
    /** True if this node has an explicit backgroundColor. */
    hasBg: boolean
    /** True if the layer is INSIDE a scroll container ancestor. */
    insideScroll: boolean
  }

  /**
   * Find layer boundaries in the TGENode tree and record their paths.
   * Also tracks whether each boundary is a scroll container, which is
   * critical for correct layer→command assignment when layers and scroll
   * containers interact.
   */
  function findLayerBoundaries(
    node: TGENode,
    path: string,
    result: LayerBoundary[],
    insideScroll = false,
  ) {
    if (node.kind === "text") return

    const isScroll = !!(node.props.scrollX || node.props.scrollY)

    if (node.props.layer === true) {
      result.push({
        path,
        z: nextZ++,
        isScroll,
        hasBg: node.props.backgroundColor !== undefined,
        insideScroll,
      })
    }

    const childInsideScroll = insideScroll || isScroll
    for (let i = 0; i < node.children.length; i++) {
      findLayerBoundaries(node.children[i], `${path}.${i}`, result, childInsideScroll)
    }
  }

  /**
   * Assign commands to layers.
   *
   * Uses a HYBRID strategy:
   *   1. Scroll-container layers → matched by SCISSOR commands (order-based)
   *   2. Static layers with bg → matched by RECT color (existing approach)
   *   3. Static layers without bg → matched by child TEXT content
   *
   * For scroll-container layers, the SCISSOR_START/END pair defines both
   * the layer's bounding box AND its command membership. All commands
   * between SCISSOR_START and SCISSOR_END belong to that layer.
   *
   * The layer node's own RECT (if it has bg) is also claimed — it comes
   * BEFORE the SCISSOR_START in Clay's command stream.
   */
  function assignLayersSpatial(
    commands: RenderCommand[],
    boundaries: LayerBoundary[],
  ): { bgSlot: LayerSlot; contentSlots: LayerSlot[] } {
    const bgSlot: LayerSlot = { key: "bg", z: -1, cmdIndices: [] }

    if (boundaries.length === 0) {
      for (let i = 0; i < commands.length; i++) {
        bgSlot.cmdIndices.push(i)
      }
      return { bgSlot, contentSlots: [] }
    }

    // ── Phase 1: Collect SCISSOR commands ──
    // Each scroll container emits one SCISSOR_START + SCISSOR_END pair.
    // Collected in SCISSOR_START order (which matches walkTree depth-first
    // order) so we can map them to scroll container nodes by index.
    type ScissorPair = {
      startIdx: number
      endIdx: number
      x: number
      y: number
      w: number
      h: number
    }

    // First, find all SCISSOR_START indices in order
    const scissorStarts: number[] = []
    for (let i = 0; i < commands.length; i++) {
      if (commands[i].type === CMD.SCISSOR_START) {
        scissorStarts.push(i)
      }
    }

    // For each SCISSOR_START, find its matching SCISSOR_END.
    // Handles nesting: count START/END depth to find the correct pair.
    const scissorPairs: ScissorPair[] = []
    for (const startIdx of scissorStarts) {
      let depth = 0
      let endIdx = -1
      for (let i = startIdx; i < commands.length; i++) {
        if (commands[i].type === CMD.SCISSOR_START) depth++
        else if (commands[i].type === CMD.SCISSOR_END) {
          depth--
          if (depth === 0) { endIdx = i; break }
        }
      }
      if (endIdx >= 0) {
        const startCmd = commands[startIdx]
        scissorPairs.push({
          startIdx,
          endIdx,
          x: Math.round(startCmd.x),
          y: Math.round(startCmd.y),
          w: Math.round(startCmd.width),
          h: Math.round(startCmd.height),
        })
      }
    }

    // ── Phase 2: Build layer slots with bounds ──
    type LayerBounds = {
      slot: LayerSlot
      x: number
      y: number
      right: number
      bottom: number
      /** If this layer is a scroll container, its SCISSOR pair. */
      scissor: ScissorPair | null
      boundary: LayerBoundary
    }

    const layerBounds: LayerBounds[] = []

    // Collect ALL scroll container nodes in walkTree order (to map scissors to layers)
    const scrollNodes: { path: string; isLayer: boolean }[] = []
    function findScrollNodes(node: TGENode, path: string) {
      if (node.kind === "text") return
      if (node.props.scrollX || node.props.scrollY) {
        scrollNodes.push({ path, isLayer: node.props.layer === true })
      }
      for (let i = 0; i < node.children.length; i++) {
        findScrollNodes(node.children[i], `${path}.${i}`)
      }
    }
    findScrollNodes(root, "r")

    // Map: scroll node path → scissor pair index
    const scrollPathToScissor = new Map<string, number>()
    for (let si = 0; si < scrollNodes.length && si < scissorPairs.length; si++) {
      scrollPathToScissor.set(scrollNodes[si].path, si)
    }

    for (const b of boundaries) {
      const node = resolveNodeByPath(root, b.path)
      if (!node) continue

      const slot: LayerSlot = { key: `layer:${b.path}`, z: b.z, cmdIndices: [] }
      let scissor: ScissorPair | null = null

      // If this layer is a scroll container, find its SCISSOR pair
      if (b.isScroll) {
        const si = scrollPathToScissor.get(b.path)
        if (si !== undefined && si < scissorPairs.length) {
          scissor = scissorPairs[si]
        }
      }

      if (scissor) {
        // Scroll-container layer: use SCISSOR rect as bounds
        layerBounds.push({
          slot,
          x: scissor.x,
          y: scissor.y,
          right: scissor.x + scissor.w,
          bottom: scissor.y + scissor.h,
          scissor,
          boundary: b,
        })
      } else if (b.hasBg) {
        // Static layer with bg: find anchor RECT by color match
        const targetColor = parseColor(node.props.backgroundColor)
        const [tr, tg, tb, ta] = [(targetColor >>> 24) & 0xff, (targetColor >>> 16) & 0xff, (targetColor >>> 8) & 0xff, targetColor & 0xff]

        let found = false
        for (let i = 0; i < commands.length; i++) {
          const cmd = commands[i]
          if (cmd.type !== CMD.RECTANGLE) continue
          if (cmd.color[0] === tr && cmd.color[1] === tg && cmd.color[2] === tb && cmd.color[3] === ta) {
            const alreadyClaimed = layerBounds.some(lb =>
              lb.x === Math.round(cmd.x) && lb.y === Math.round(cmd.y) &&
              lb.right === Math.round(cmd.x + cmd.width) && lb.bottom === Math.round(cmd.y + cmd.height)
            )
            if (!alreadyClaimed) {
              layerBounds.push({
                slot,
                x: Math.round(cmd.x),
                y: Math.round(cmd.y),
                right: Math.round(cmd.x + cmd.width),
                bottom: Math.round(cmd.y + cmd.height),
                scissor: null,
                boundary: b,
              })
              found = true
              break
            }
          }
        }
        if (!found) {
          // Fallback: no matching RECT found, zero bounds
          layerBounds.push({ slot, x: 0, y: 0, right: 0, bottom: 0, scissor: null, boundary: b })
        }
      } else {
        // No bg, not scroll — zero bounds, will be handled by text matching
        layerBounds.push({ slot, x: 0, y: 0, right: 0, bottom: 0, scissor: null, boundary: b })
      }
    }

    // ── Phase 3: Assign commands to layers ──
    const contentSlots: LayerSlot[] = layerBounds.map(lb => lb.slot)

    // Build a set of command indices claimed by scroll-container layers
    // (SCISSOR_START → SCISSOR_END inclusive, plus the preceding RECT if any)
    //
    // Process layers from INNERMOST (highest z) to OUTERMOST (lowest z)
    // so nested layers don't get their commands stolen by the parent.
    const claimedByScissor = new Set<number>()
    const scissorLayers = layerBounds.filter(lb => lb.scissor).sort((a, b) => b.slot.z - a.slot.z)
    for (const lb of scissorLayers) {
      if (!lb.scissor) continue
      // Claim ALL commands between SCISSOR_START and SCISSOR_END (inclusive)
      // that aren't already claimed by an inner (higher-z) layer
      for (let i = lb.scissor.startIdx; i <= lb.scissor.endIdx; i++) {
        if (claimedByScissor.has(i)) continue // already claimed by inner layer
        claimedByScissor.add(i)
        lb.slot.cmdIndices.push(i)
      }
      // Also claim the layer's own background RECT if it has one.
      // It comes BEFORE the SCISSOR_START — find RECT just before startIdx
      // with matching color.
      if (lb.boundary.hasBg) {
        const node = resolveNodeByPath(root, lb.boundary.path)
        if (node) {
          const targetColor = parseColor(node.props.backgroundColor)
          const [tr, tg, tb, ta] = [(targetColor >>> 24) & 0xff, (targetColor >>> 16) & 0xff, (targetColor >>> 8) & 0xff, targetColor & 0xff]
          // Scan backwards from SCISSOR_START to find the RECT
          for (let i = lb.scissor.startIdx - 1; i >= 0; i--) {
            const cmd = commands[i]
            if (cmd.type === CMD.RECTANGLE &&
                cmd.color[0] === tr && cmd.color[1] === tg && cmd.color[2] === tb && cmd.color[3] === ta) {
              if (!claimedByScissor.has(i)) {
                claimedByScissor.add(i)
                lb.slot.cmdIndices.push(i)
              }
              break
            }
            // Don't look past another SCISSOR_END (that would be a different container)
            if (cmd.type === CMD.SCISSOR_END) break
          }
          // Also claim the BORDER command if present — it comes AFTER SCISSOR_END
          for (let i = lb.scissor.endIdx + 1; i < commands.length; i++) {
            const cmd = commands[i]
            if (cmd.type === CMD.BORDER) {
              // Verify it's at the same position as the layer
              const bx = Math.round(cmd.x)
              const by = Math.round(cmd.y)
              if (bx >= lb.x && by >= lb.y && bx + Math.round(cmd.width) <= lb.right + 1 && by + Math.round(cmd.height) <= lb.bottom + 1) {
                if (!claimedByScissor.has(i)) {
                  claimedByScissor.add(i)
                  lb.slot.cmdIndices.push(i)
                }
              }
              break
            }
            // Stop if we hit another element's commands
            if (cmd.type === CMD.RECTANGLE || cmd.type === CMD.SCISSOR_START) break
          }
        }
      }
    }

    // Sort layerBounds by z descending for spatial assignment of remaining commands
    const sortedBounds = [...layerBounds]
      .filter(lb => lb.right > lb.x && !lb.scissor) // only non-scissor layers with bounds
      .sort((a, b) => b.slot.z - a.slot.z)

    const noBoundsLayers = layerBounds.filter(lb => lb.right <= lb.x && !lb.scissor)

    // Assign remaining commands (not claimed by scissor layers)
    // to static layers by spatial containment, or to bgSlot
    for (let i = 0; i < commands.length; i++) {
      if (claimedByScissor.has(i)) continue

      const cmd = commands[i]

      // SCISSOR commands not claimed by any layer go to bg
      if (cmd.type === CMD.SCISSOR_START || cmd.type === CMD.SCISSOR_END) {
        bgSlot.cmdIndices.push(i)
        continue
      }

      // Spatial assignment for remaining commands
      const cx = Math.round(cmd.x)
      const cy = Math.round(cmd.y)

      let assigned = false
      for (const lb of sortedBounds) {
        if (cx >= lb.x && cy >= lb.y && cx < lb.right && cy < lb.bottom) {
          lb.slot.cmdIndices.push(i)
          assigned = true
          break
        }
      }

      if (!assigned) {
        bgSlot.cmdIndices.push(i)
      }
    }

    // Handle no-bounds layers: extract TEXT commands from bgSlot by content match
    for (const lb of noBoundsLayers) {
      const node = resolveNodeByPath(root, lb.slot.key.replace("layer:", ""))
      if (!node) continue

      const texts = collectAllTexts(node)
      if (texts.length === 0) continue

      const toMove: number[] = []
      for (const cmdIdx of bgSlot.cmdIndices) {
        const cmd = commands[cmdIdx]
        if (cmd.type === CMD.TEXT && cmd.text && texts.includes(cmd.text)) {
          toMove.push(cmdIdx)
        }
      }

      for (const idx of toMove) {
        const pos = bgSlot.cmdIndices.indexOf(idx)
        if (pos >= 0) bgSlot.cmdIndices.splice(pos, 1)
        lb.slot.cmdIndices.push(idx)
      }
    }

    return { bgSlot, contentSlots }
  }

  /** Resolve a TGENode by its tree path (e.g. "r.0.1.2"). */
  function resolveNodeByPath(fromRoot: TGENode, path: string): TGENode | null {
    const parts = path.split(".")
    let node = fromRoot
    // Skip "r" (root prefix)
    for (let i = 1; i < parts.length; i++) {
      const idx = parseInt(parts[i])
      if (isNaN(idx) || idx >= node.children.length) return null
      node = node.children[idx]
    }
    return node
  }

  /** Collect all text strings from a node's subtree. */
  function collectAllTexts(node: TGENode): string[] {
    const result: string[] = []
    function walk(n: TGENode) {
      if (n.kind === "text") {
        const t = n.text || collectText(n)
        if (t) result.push(t)
        return
      }
      for (const child of n.children) walk(child)
    }
    walk(node)
    return result
  }

  // ── Layout writeback ──

  /**
   * After Clay layout, write computed geometry back to TGENodes.
   *
   * RECT commands map 1:1 with rectNodes (same order as walkTree).
   * TEXT commands map 1:1 with textNodes (same order as walkTree).
   * Box nodes without backgroundColor also get layout from the
   * first command that spatially contains them (approximation).
   */
  function writeLayoutBack(commands: RenderCommand[]) {
    let rectIdx = 0
    let textIdx = 0

    for (const cmd of commands) {
      if (cmd.type === CMD.RECTANGLE && rectIdx < rectNodes.length) {
        const node = rectNodes[rectIdx]
        node.layout.x = cmd.x
        node.layout.y = cmd.y
        node.layout.width = cmd.width
        node.layout.height = cmd.height
        rectIdx++
      } else if (cmd.type === CMD.TEXT && textIdx < textNodes.length) {
        const node = textNodes[textIdx]
        node.layout.x = cmd.x
        node.layout.y = cmd.y
        node.layout.width = cmd.width
        node.layout.height = cmd.height
        textIdx++
      }
    }

    // For box nodes that had backgroundColor, layout was already written via RECT.
    // For box nodes WITHOUT backgroundColor, attempt to inherit from their first
    // child's command position. This is an approximation — full accuracy would
    // require Clay to expose per-element layout (which it doesn't via commands).
    // NOTE: This is a best-effort. Nodes with no background and no children
    // will have layout { 0, 0, 0, 0 } until a more precise approach is added.
  }

  // ── Interactive state (hover/active) ──

  /** Track nodes with hoverStyle/activeStyle for hit-testing */
  function updateInteractiveStates() {
    let changed = false
    // Walk all rect nodes (they have layout) and check hover/active
    for (const node of rectNodes) {
      if (!node.props.hoverStyle && !node.props.activeStyle) continue

      const l = node.layout
      const isOver = pointerX >= l.x && pointerX < l.x + l.width &&
                     pointerY >= l.y && pointerY < l.y + l.height
      const isDown = isOver && pointerDown

      if (node._hovered !== isOver) {
        node._hovered = isOver
        changed = true
      }
      if (node._active !== isDown) {
        node._active = isDown
        changed = true
      }
    }
    // If any state changed, mark dirty to trigger repaint next frame
    if (changed) {
      markDirty()
      markAllDirty()
    }
  }

  // ── Frame rendering ──

  /** Paint a single frame with layer compositing. */
  function frameLayered() {
    // 0. Feed pointer + scroll to Clay before layout.
    // Clay_UpdateScrollContainers MUST be called every frame — it maintains
    // internal scroll state including momentum/deceleration.
    const now = Date.now()
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1) // cap at 100ms
    lastFrameTime = now
    clay.setPointer(pointerX, pointerY, pointerDown)

    // Cap scroll delta if any scroll container has scrollSpeed set
    let sdx = scrollDeltaX
    let sdy = scrollDeltaY
    if (scrollSpeedCap > 0 && (sdx !== 0 || sdy !== 0)) {
      const cellH = term.size.cellHeight || 16
      const maxDelta = scrollSpeedCap * cellH
      sdx = Math.max(-maxDelta, Math.min(maxDelta, sdx))
      sdy = Math.max(-maxDelta, Math.min(maxDelta, sdy))
    }
    clay.updateScroll(sdx, sdy, dt)
    scrollDeltaX = 0
    scrollDeltaY = 0
    scrollIdCounter = 0

    // 1. Walk tree into Clay (first pass — feeds Clay, no counting)
    scrollSpeedCap = 0 // reset — will be set by walkTree if any node has scrollSpeed
    effectsQueue = [] // reset effects for this frame
    imageQueue = [] // reset image paint queue for this frame
    pendingAnsiTexts = [] // reset ANSI text collection
    textMeasureIndex = 0 // reset text measure counter
    textMetas.length = 0 // clear text metadata
    textMetaMap.clear()
    clay.resetTextMeasures() // reset C-side counter
    rectNodes.length = 0
    textNodes.length = 0
    boxNodes.length = 0
    clay.beginLayout()
    walkTree(root)
    const commands = clay.endLayout()

    // Write layout geometry back to TGENodes for ref access
    writeLayoutBack(commands)
    // Update hover/active states based on pointer position
    updateInteractiveStates()

    if (commands.length === 0) {
      clearDirty()
      return
    }

    // 2. Find layer boundaries and assign commands
    nextZ = 0
    const boundaries: LayerBoundary[] = []
    findLayerBoundaries(root, "r", boundaries)
    const { bgSlot, contentSlots } = assignLayersSpatial(commands, boundaries)

    // If no explicit layers found, everything non-bg becomes one content layer
    if (contentSlots.length === 0 && commands.length > bgSlot.cmdIndices.length) {
      const fallbackSlot: LayerSlot = { key: "layer:fallback", z: 0, cmdIndices: [] }
      for (let i = 0; i < commands.length; i++) {
        if (!bgSlot.cmdIndices.includes(i)) {
          fallbackSlot.cmdIndices.push(i)
        }
      }
      if (fallbackSlot.cmdIndices.length > 0) {
        contentSlots.push(fallbackSlot)
      }
    }

    const allSlots = [bgSlot, ...contentSlots]
    const cellW = term.size.cellWidth || 8
    const cellH = term.size.cellHeight || 16

    log(`[frame] cmds=${commands.length} layers=${allSlots.length} slots=[${allSlots.map(s => `${s.key}(${s.cmdIndices.length})`).join(',')}]`)

    term.beginSync()

    // 3. Render each layer slot
    const frameStart = expFrameBudgetMs > 0 ? performance.now() : 0
    let frameBudgetExceeded = false

    for (const slot of allSlots) {
      if (slot.cmdIndices.length === 0) continue

      // [Experimental] Frame budget — defer non-background layers if over budget
      if (expFrameBudgetMs > 0 && !frameBudgetExceeded && slot.z >= 0) {
        const elapsed = performance.now() - frameStart
        if (elapsed > expFrameBudgetMs) {
          log(`  [FRAME BUDGET] ${elapsed.toFixed(1)}ms > ${expFrameBudgetMs}ms — deferring remaining layers`)
          frameBudgetExceeded = true
        }
      }
      if (frameBudgetExceeded && slot.z >= 0) {
        // Mark layer dirty so it gets picked up next frame
        const deferLayer = layerCache.get(slot.key)
        if (deferLayer) deferLayer.dirty = true
        continue
      }

      const layer = getOrCreateLayer(slot.key, slot.z)

      // Compute bounding box from commands.
      // For scroll-container layers: use the SCISSOR rect as the PRIMARY
      //   bounds, expanded by the layer's own RECT/BORDER (which may be
      //   slightly larger due to border width). Child commands inside the
      //   scissor are NOT included in bounds — they're clipped by the scissor
      //   and may scroll far outside the viewport.
      // For static layers: union of all command bounding boxes.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      let hasScissor = false
      let scissorX = 0, scissorY = 0, scissorR = 0, scissorB = 0

      for (const idx of slot.cmdIndices) {
        const cmd = commands[idx]
        if (!cmd) continue
        if (cmd.type === CMD.SCISSOR_START) {
          scissorX = cmd.x
          scissorY = cmd.y
          scissorR = cmd.x + cmd.width
          scissorB = cmd.y + cmd.height
          minX = scissorX
          minY = scissorY
          maxX = scissorR
          maxY = scissorB
          hasScissor = true
          break
        }
      }

      if (hasScissor) {
        // Expand bounds to include the layer's OWN bg RECT and BORDER,
        // which are OUTSIDE the scissor scope (before SCISSOR_START or
        // after SCISSOR_END). These overlap with the scissor rect position.
        for (const idx of slot.cmdIndices) {
          const cmd = commands[idx]
          if (!cmd) continue
          if (cmd.type !== CMD.RECTANGLE && cmd.type !== CMD.BORDER) continue
          // Only include commands at approximately the same position as the
          // scissor (the container's own rect/border), not child rects
          const cx = Math.round(cmd.x)
          const cy = Math.round(cmd.y)
          const cr = Math.round(cmd.x + cmd.width)
          const cb = Math.round(cmd.y + cmd.height)
          const overlapX = Math.abs(cx - scissorX) < 4 || Math.abs(cr - scissorR) < 4
          const overlapY = Math.abs(cy - scissorY) < 4 || Math.abs(cb - scissorB) < 4
          if (overlapX && overlapY) {
            minX = Math.min(minX, cx)
            minY = Math.min(minY, cy)
            maxX = Math.max(maxX, cr)
            maxY = Math.max(maxY, cb)
          }
        }
      } else {
        for (const idx of slot.cmdIndices) {
          const cmd = commands[idx]
          if (!cmd) continue
          minX = Math.min(minX, cmd.x)
          minY = Math.min(minY, cmd.y)
          maxX = Math.max(maxX, cmd.x + cmd.width)
          maxY = Math.max(maxY, cmd.y + cmd.height)
        }
      }

      // Background layer at (0,0) fullscreen
      const isBg = slot.z < 0
      const lx = isBg ? 0 : Math.floor(minX)
      const ly = isBg ? 0 : Math.floor(minY)
      const lw = isBg ? (Math.round(commands[0].width) || pw) : (Math.ceil(maxX) - lx)
      const lh = isBg ? (Math.round(commands[0].height) || ph) : (Math.ceil(maxY) - ly)

      updateLayerGeometry(layer, lx, ly, lw, lh)

      if (layer.buf) {
        // Paint into buffer and compare against previous frame
        const prev = layer.buf.data.slice()
        clearLayer(layer, 0x00000000)

        // Reset scissor stack before painting each layer to prevent leaks
        scissorStack.length = 0

        // Sort command indices to preserve SCISSOR ordering
        const sortedIndices = slot.cmdIndices.slice().sort((a, b) => a - b)
        for (const idx of sortedIndices) {
          const cmd = commands[idx]
          if (!cmd) continue
          paintCommand(layer.buf, cmd, lx, ly)
        }

        const changed = layer.dirty || !buffersEqual(prev, layer.buf.data)
        if (changed) {
          const renderZ = selectableText ? -1 : layer.z
          const imageId = imageIdForLayer(layer)

          // [Experimental] Partial updates — try to patch only the dirty region
          let usedPatch = false
          if (expPartialUpdates && !layer.dirty && layer.buf) {
            const region = findDirtyRegion(prev, layer.buf.data, layer.buf.width, layer.buf.height)
            if (region) {
              const totalPixels = layer.buf.width * layer.buf.height
              const regionPixels = region.w * region.h
              // Only use partial update if the dirty region is <50% of the layer
              if (regionPixels < totalPixels * 0.5) {
                const regionData = extractRegion(layer.buf.data, layer.buf.width, region.x, region.y, region.w, region.h)
                usedPatch = layerComposer!.patchLayer(regionData, imageId, region.x, region.y, region.w, region.h)
                if (usedPatch) {
                  log(`  [${slot.key}] PATCH ${region.w}x${region.h} at (${region.x},${region.y}) (${(regionPixels * 4 / 1024).toFixed(0)}KB of ${(totalPixels * 4 / 1024).toFixed(0)}KB, ${region.dirtyPixels} dirty px)`)
                }
              }
            }
          }

          if (!usedPatch) {
            log(`  [${slot.key}] REPAINT ${lw}x${lh} at (${lx},${ly}) z=${renderZ} (${(lw * lh * 4 / 1024).toFixed(0)}KB) cmds=${slot.cmdIndices.length}`)
            layerComposer!.renderLayer(layer.buf, imageId, lx, ly, renderZ, cellW, cellH)
          }
          markLayerClean(layer)
        } else {
          log(`  [${slot.key}] SKIP (unchanged)`)
          markLayerClean(layer)
        }
      }
    }

    // 4. Clean up orphan layers (layers from previous frame that no longer exist)
    const activeKeys = new Set(allSlots.map(s => s.key))
    for (const [key, layer] of layerCache) {
      if (!activeKeys.has(key)) {
        layerComposer!.removeLayer(imageIdForLayer(layer))
        layerCache.delete(key)
      }
    }

    // 5. Emit ANSI text in selectableText mode
    if (selectableText && pendingAnsiTexts.length > 0) {
      emitAnsiText(term, pendingAnsiTexts, cellW, cellH)
    }

    term.endSync()
    clearDirty()
  }

  /** Paint a single frame with the old single-buffer approach (fallback). */
  function frameFallback() {
    log(`[frame] FALLBACK single-buffer`)
    if (!fallbackBuf) return
    clear(fallbackBuf, 0x04040aff)

    // Feed pointer + scroll — must call every frame
    const now = Date.now()
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1)
    lastFrameTime = now
    clay.setPointer(pointerX, pointerY, pointerDown)
    clay.updateScroll(scrollDeltaX, scrollDeltaY, dt)
    scrollDeltaX = 0
    scrollDeltaY = 0
    scrollIdCounter = 0

    effectsQueue = [] // reset effects for this frame
    imageQueue = [] // reset image paint queue for this frame
    textMeasureIndex = 0
    textMetas.length = 0
    textMetaMap.clear()
    rectNodes.length = 0
    textNodes.length = 0
    boxNodes.length = 0
    clay.resetTextMeasures()
    clay.beginLayout()
    walkTree(root)
    const commands = clay.endLayout()

    writeLayoutBack(commands)
    updateInteractiveStates()

    for (const cmd of commands) {
      paintCommand(fallbackBuf, cmd, 0, 0)
    }

    const cols = term.size.cols
    const rows = term.size.rows
    const cellW = term.size.cellWidth || 8
    const cellH = term.size.cellHeight || 16

    term.beginSync()
    fallbackComposer!.render(fallbackBuf, 0, 0, cols, rows, cellW, cellH)
    term.endSync()
    clearDirty()
  }

  /** Paint a frame — dispatches to layered or fallback based on backend. */
  function frame() {
    if (useLayerCompositing) {
      frameLayered()
    } else {
      frameFallback()
    }
  }

  /** Resize handler */
  const unsubResize = term.onResize(() => {
    const newW = term.size.pixelWidth || term.size.cols * (term.size.cellWidth || 8)
    const newH = term.size.pixelHeight || term.size.rows * (term.size.cellHeight || 16)
    clay.setDimensions(newW, newH)
    root.props.width = newW
    root.props.height = newH

    if (useLayerCompositing) {
      layerComposer!.clear()
      resetLayers()
      layerCache.clear()
    } else {
      fallbackBuf = create(newW, newH)
    }
    markDirty()
    markAllDirty()
  })

  return {
    root,
    feedScroll,
    feedPointer,

    start() {
      frame() // initial render
      const scheduleNext = () => {
        const interval = hasActiveAnimations() ? activeInterval : idleInterval
        timer = setTimeout(() => {
          if (isDirty()) frame()
          scheduleNext()
        }, interval)
      }
      scheduleNext()
    },

    stop() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },

    frame,

    suspend() {
      if (isSuspended) return
      isSuspended = true
      // Stop the render loop first
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      // Restore terminal (alt screen, cursor, mouse, etc.)
      term.suspend()
    },

    resume() {
      if (!isSuspended) return
      isSuspended = false
      // Re-enter TGE mode
      term.resume()
      // Force full repaint — all layers dirty, all buffers stale
      markDirty()
      markAllDirty()
      // Restart the render loop with adaptive FPS
      frame()
      const scheduleNext = () => {
        const interval = hasActiveAnimations() ? activeInterval : idleInterval
        timer = setTimeout(() => {
          if (isDirty()) frame()
          scheduleNext()
        }, interval)
      }
      scheduleNext()
    },

    suspended() {
      return isSuspended
    },

    destroy() {
      if (timer) clearTimeout(timer)
      unsubResize()
      if (layerComposer) layerComposer.destroy()
      if (fallbackComposer) fallbackComposer.destroy()
      resetLayers()
      layerCache.clear()
      clay.destroy()
    },
  }
}

/** Fast byte-level comparison of two buffers. */
function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
      return false
    }
  }
  return true
}

/**
 * [Experimental] Find the bounding box of dirty pixels between two buffers.
 * Returns null if buffers are identical, or {x, y, w, h, dirtyPixels} with the
 * minimal axis-aligned bounding box containing all changed pixels.
 */
function findDirtyRegion(
  prev: Uint8Array,
  curr: Uint8Array,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number; dirtyPixels: number } | null {
  let minX = width, minY = height, maxX = -1, maxY = -1
  let dirtyPixels = 0
  const stride = width * 4

  for (let y = 0; y < height; y++) {
    const rowOff = y * stride
    for (let x = 0; x < width; x++) {
      const off = rowOff + x * 4
      if (prev[off] !== curr[off] || prev[off + 1] !== curr[off + 1] ||
          prev[off + 2] !== curr[off + 2] || prev[off + 3] !== curr[off + 3]) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
        dirtyPixels++
      }
    }
  }

  if (maxX < 0) return null // identical
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, dirtyPixels }
}

/**
 * [Experimental] Extract a sub-region from a pixel buffer as a flat RGBA array.
 * Used to prepare data for patchRegion().
 */
function extractRegion(
  data: Uint8Array,
  bufWidth: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): Uint8Array {
  const out = new Uint8Array(rw * rh * 4)
  const srcStride = bufWidth * 4
  const dstStride = rw * 4
  for (let y = 0; y < rh; y++) {
    const srcOff = (ry + y) * srcStride + rx * 4
    const dstOff = y * dstStride
    out.set(data.subarray(srcOff, srcOff + dstStride), dstOff)
  }
  return out
}

// ── Scissor clipping ──

type ScissorRect = { x: number; y: number; w: number; h: number }

/** Active scissor stack (screen coordinates). */
const scissorStack: ScissorRect[] = []

/** Push a scissor rect (from SCISSOR_START command). */
function pushScissor(cmd: RenderCommand) {
  scissorStack.push({
    x: Math.round(cmd.x),
    y: Math.round(cmd.y),
    w: Math.round(cmd.width),
    h: Math.round(cmd.height),
  })
}

/** Pop the scissor stack (on SCISSOR_END). */
function popScissor() {
  scissorStack.pop()
}

/** Get the current active scissor rect, or null if none. */
function activeScissor(): ScissorRect | null {
  return scissorStack.length > 0 ? scissorStack[scissorStack.length - 1] : null
}

/**
 * Check if a command is fully outside the active scissor rect.
 * Returns true if the command should be skipped (fully clipped).
 */
function isClipped(cmd: RenderCommand): boolean {
  const s = activeScissor()
  if (!s) return false
  const cx = Math.round(cmd.x)
  const cy = Math.round(cmd.y)
  const cw = Math.round(cmd.width)
  const ch = Math.round(cmd.height)
  // Fully outside?
  return cx + cw <= s.x || cy + ch <= s.y || cx >= s.x + s.w || cy >= s.y + s.h
}

/**
 * Clip a paint rect to the active scissor. Returns the clipped rect
 * in LOCAL buffer coordinates (offset subtracted).
 * Returns null if fully clipped.
 */
function clipToScissor(
  x: number, y: number, w: number, h: number,
  offsetX: number, offsetY: number,
): { x: number; y: number; w: number; h: number } | null {
  const s = activeScissor()
  if (!s) return { x: x - offsetX, y: y - offsetY, w, h }

  // Clamp to scissor bounds (screen coords)
  const left = Math.max(x, s.x)
  const top = Math.max(y, s.y)
  const right = Math.min(x + w, s.x + s.w)
  const bottom = Math.min(y + h, s.y + s.h)

  if (left >= right || top >= bottom) return null

  return {
    x: left - offsetX,
    y: top - offsetY,
    w: right - left,
    h: bottom - top,
  }
}

/**
 * Emit collected text commands as ANSI escape codes.
 * Converts pixel coordinates to terminal cell positions and writes
 * colored text at those positions. Called in selectableText mode
 * after all pixel layers have been rendered.
 */
function emitAnsiText(
  term: Terminal,
  texts: AnsiTextCommand[],
  cellW: number,
  cellH: number,
) {
  for (const t of texts) {
    // Convert pixel coords to cell (1-indexed for ANSI)
    const col = Math.floor(t.x / cellW) + 1
    const row = Math.floor(t.y / cellH) + 1

    // Word wrap using atlas metrics
    const result = layoutText(t.text, t.fontId, t.maxWidth, t.lineHeight)

    for (let li = 0; li < result.lines.length; li++) {
      const line = result.lines[li]
      const lineRow = row + li
      // Move cursor to position
      term.write(`\x1b[${lineRow};${col}H`)
      // Set foreground color (24-bit true color)
      term.write(`\x1b[38;2;${t.r};${t.g};${t.b}m`)
      // Write the text
      term.write(line.text)
    }
  }
  // Reset color
  term.write("\x1b[39m")
}

/**
 * Paint a Clay RenderCommand into a pixel buffer.
 * offsetX/offsetY translate from absolute screen coords to local buffer coords.
 * Respects active scissor rect for clipping.
 */
function paintCommand(buf: PixelBuffer, cmd: RenderCommand, offsetX: number, offsetY: number) {
  // Handle scissor commands
  if (cmd.type === CMD.SCISSOR_START) {
    pushScissor(cmd)
    return
  }
  if (cmd.type === CMD.SCISSOR_END) {
    popScissor()
    return
  }

  // Skip fully clipped commands
  if (isClipped(cmd)) return

  const x = Math.round(cmd.x) - offsetX
  const y = Math.round(cmd.y) - offsetY
  const w = Math.round(cmd.width)
  const h = Math.round(cmd.height)
  const [r, g, b, a] = cmd.color

  switch (cmd.type) {
    case CMD.RECTANGLE: {
      const radius = Math.round(cmd.cornerRadius)
      const cmdColor = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0

      // ── Check for <img> image data matching this RECT ──
      const imgIdx = imageQueue.findIndex(
        (im) => im.color === cmdColor && im.cornerRadius === radius
      )
      if (imgIdx >= 0) {
        const imgConfig = imageQueue[imgIdx]
        imageQueue.splice(imgIdx, 1) // consume

        // Scale image to fit layout box
        const scaled = scaleImage(imgConfig.imageBuffer, w, h, imgConfig.objectFit)

        // Copy pixels: src-over composite the image onto the buffer
        const sd = scaled.data
        const sw = scaled.width
        const sh = scaled.height
        const bd = buf.data
        const ox = x + scaled.offsetX
        const oy = y + scaled.offsetY

        for (let iy = 0; iy < sh; iy++) {
          const by = oy + iy
          if (by < 0 || by >= buf.height) continue
          const bufRow = by * buf.stride
          const srcRow = iy * sw * 4
          for (let ix = 0; ix < sw; ix++) {
            const bx = ox + ix
            if (bx < 0 || bx >= buf.width) continue
            const si = srcRow + ix * 4
            const sa = sd[si + 3]
            if (sa === 0) continue
            const di = bufRow + bx * 4
            if (sa === 255) {
              // Fully opaque — direct copy
              bd[di] = sd[si]
              bd[di + 1] = sd[si + 1]
              bd[di + 2] = sd[si + 2]
              bd[di + 3] = 255
            } else {
              // Alpha blend (src-over)
              const da = bd[di + 3]
              const invSa = 255 - sa
              bd[di]     = Math.round((sd[si]     * sa + bd[di]     * invSa) / 255)
              bd[di + 1] = Math.round((sd[si + 1] * sa + bd[di + 1] * invSa) / 255)
              bd[di + 2] = Math.round((sd[si + 2] * sa + bd[di + 2] * invSa) / 255)
              bd[di + 3] = Math.min(255, sa + Math.round(da * invSa / 255))
            }
          }
        }

        // Apply cornerRadius mask if needed
        if (radius > 0) {
          const mask = create(w, h)
          paint.roundedRect(mask, 0, 0, w, h, 255, 255, 255, 255, radius)
          const md = mask.data
          // Restore pixels outside the rounded rect
          for (let my = 0; my < h; my++) {
            const by = y + my
            if (by < 0 || by >= buf.height) continue
            const bufRow = by * buf.stride
            const mRow = my * mask.stride
            for (let mx = 0; mx < w; mx++) {
              const bx = x + mx
              if (bx < 0 || bx >= buf.width) continue
              const mi = mRow + mx * 4 + 3  // mask alpha
              if (mi < md.length && md[mi] === 0) {
                // Outside rounded rect — clear to transparent
                const di = bufRow + bx * 4
                bd[di] = 0; bd[di + 1] = 0; bd[di + 2] = 0; bd[di + 3] = 0
              }
            }
          }
        }
        break
      }

      // Check for shadow/glow/gradient effects matching this RECT
      const effectIdx = effectsQueue.findIndex(
        (e) => e.color === cmdColor && e.cornerRadius === radius
      )
      let matchedEffect: EffectConfig | null = null
      if (effectIdx >= 0) {
        matchedEffect = effectsQueue[effectIdx]
        effectsQueue.splice(effectIdx, 1) // consume — one match per node

        // Effects use TEMPORARY BUFFERS to avoid destructive in-place blur.
        // Without this, blur() would corrupt neighboring pixels (other cards,
        // text, background). The temp buffer isolates the effect, then we
        // composite it onto the main buffer with src-over alpha blending.

        // Glow: rounded rect in glow color → blur → composite
        if (matchedEffect.glow) {
          const gl = matchedEffect.glow
          const gr = (gl.color >>> 24) & 0xff
          const gg = (gl.color >>> 16) & 0xff
          const gb = (gl.color >>> 8) & 0xff
          const ga = Math.round(((gl.color & 0xff) * gl.intensity) / 100)
          const spread = gl.radius
          const blurR = Math.ceil(spread * 0.6)
          const margin = spread + blurR
          // Temp buffer sized to contain the glow + blur margin
          const tw = w + margin * 2
          const th = h + margin * 2
          if (tw > 0 && th > 0) {
            const tmp = create(tw, th)
            // Paint shape centered in temp buffer
            const lx = margin
            const ly = margin
            if (radius > 0) {
              paint.roundedRect(tmp, lx, ly, w, h, gr, gg, gb, ga, radius)
            } else {
              paint.fillRect(tmp, lx, ly, w, h, gr, gg, gb, ga)
            }
            // Blur the entire temp buffer — safe, no neighbors to corrupt
            paint.blur(tmp, 0, 0, tw, th, blurR, 3)
            // Composite onto main buffer
            over(buf, tmp, x - margin, y - margin)
          }
        }

        // Shadow: rounded rect at offset → blur → composite (supports array)
        if (matchedEffect.shadow) {
          const shadows = Array.isArray(matchedEffect.shadow) ? matchedEffect.shadow : [matchedEffect.shadow]
          for (const s of shadows) {
            const sr = (s.color >>> 24) & 0xff
            const sg = (s.color >>> 16) & 0xff
            const sb = (s.color >>> 8) & 0xff
            const sa = s.color & 0xff
            const blurR = Math.ceil(s.blur)
            const margin = blurR * 2
            const tw = w + margin * 2 + Math.abs(s.x)
            const th = h + margin * 2 + Math.abs(s.y)
            if (tw > 0 && th > 0) {
              const tmp = create(tw, th)
              const lx = margin + Math.max(0, s.x)
              const ly = margin + Math.max(0, s.y)
              if (radius > 0) {
                paint.roundedRect(tmp, lx, ly, w, h, sr, sg, sb, sa, radius)
              } else {
                paint.fillRect(tmp, lx, ly, w, h, sr, sg, sb, sa)
              }
              paint.blur(tmp, 0, 0, tw, th, blurR, 3)
              const dx = x - margin + Math.min(0, s.x)
              const dy = y - margin + Math.min(0, s.y)
              over(buf, tmp, dx, dy)
            }
          }
        }
      }

      // Backdrop blur — blur the content behind this element in-place
      if (matchedEffect?.backdropBlur && matchedEffect.backdropBlur > 0) {
        const blurR = Math.ceil(matchedEffect.backdropBlur)
        const effRadius = matchedEffect.cornerRadius

        // Save corner pixels BEFORE blur so we can restore them after.
        // The blur operates on a rectangle but the element may be rounded —
        // pixels outside the rounded rect must remain untouched.
        let saved: Uint8Array | null = null
        if (effRadius > 0) {
          saved = sub(buf, x, y, w, h).data
        }

        // Blur directly in the main buffer at the element's region.
        paint.blur(buf, x, y, w, h, blurR, 3)

        // Restore pixels outside the rounded rect (corners)
        if (effRadius > 0 && saved) {
          const mask = create(w, h)
          paint.roundedRect(mask, 0, 0, w, h, 255, 255, 255, 255, effRadius)
          const md = mask.data
          const d = buf.data
          for (let ly = 0; ly < h; ly++) {
            const bufRow = (y + ly) * buf.stride
            const savRow = ly * w * 4
            const mRow = ly * mask.stride
            for (let lx = 0; lx < w; lx++) {
              const mi = mRow + lx * 4 + 3
              if (md[mi] === 0) {
                // Outside rounded rect — restore original pixel
                const bo = bufRow + (x + lx) * 4
                const si = savRow + lx * 4
                d[bo] = saved[si]; d[bo+1] = saved[si+1]; d[bo+2] = saved[si+2]; d[bo+3] = saved[si+3]
              } else if (md[mi] < 255) {
                // Anti-aliased edge — blend between original and blurred
                const bo = bufRow + (x + lx) * 4
                const si = savRow + lx * 4
                const ma = md[mi] / 255
                const ia = 1 - ma
                d[bo]   = Math.round(d[bo]   * ma + saved[si]   * ia)
                d[bo+1] = Math.round(d[bo+1] * ma + saved[si+1] * ia)
                d[bo+2] = Math.round(d[bo+2] * ma + saved[si+2] * ia)
                d[bo+3] = Math.round(d[bo+3] * ma + saved[si+3] * ia)
              }
            }
          }
        }

        // Now paint backgroundColor / gradient on top of the blurred region
        if (matchedEffect.gradient) {
          const grad = matchedEffect.gradient
          const tmp = create(w, h)
          if (grad.type === "linear") {
            paint.linearGradient(tmp, 0, 0, w, h,
              (grad.from >>> 24) & 0xff, (grad.from >>> 16) & 0xff, (grad.from >>> 8) & 0xff, grad.from & 0xff,
              (grad.to >>> 24) & 0xff, (grad.to >>> 16) & 0xff, (grad.to >>> 8) & 0xff, grad.to & 0xff,
              grad.angle)
          } else {
            const cx = Math.round(w / 2)
            const cy = Math.round(h / 2)
            const gradRadius = Math.round(Math.max(w, h) / 2)
            paint.radialGradient(tmp, cx, cy, gradRadius,
              (grad.from >>> 24) & 0xff, (grad.from >>> 16) & 0xff, (grad.from >>> 8) & 0xff, grad.from & 0xff,
              (grad.to >>> 24) & 0xff, (grad.to >>> 16) & 0xff, (grad.to >>> 8) & 0xff, grad.to & 0xff)
          }
          if (effRadius > 0) {
            // Mask gradient to rounded rect
            const mask = create(w, h)
            paint.roundedRect(mask, 0, 0, w, h, 255, 255, 255, 255, effRadius)
            const gd = tmp.data
            const md = mask.data
            for (let i = 3; i < w * h * 4; i += 4) {
              if (md[i] === 0) { gd[i-3] = 0; gd[i-2] = 0; gd[i-1] = 0; gd[i] = 0 }
              else if (md[i] < 255) { gd[i] = Math.round((gd[i] * md[i]) / 255) }
            }
          }
          over(buf, tmp, x, y)
        } else if (a > 1) {
          // Paint solid backgroundColor on top of blur (skip if just placeholder)
          if (effRadius > 0) {
            paint.roundedRect(buf, x, y, w, h, r, g, b, a, effRadius)
          } else {
            paint.fillRect(buf, x, y, w, h, r, g, b, a)
          }
        }
        // Skip the separate fill below — already handled
        break
      }

      // Paint the actual rect ON TOP of shadow/glow (no backdrop blur path)
      if (matchedEffect?.gradient) {
        // Gradient fill: paint gradient, then mask to rounded rect shape
        const grad = matchedEffect.gradient
        if (radius > 0) {
          // For rounded rects: paint gradient into temp buffer, then mask with SDF
          const tmp = create(w, h)
          if (grad.type === "linear") {
            paint.linearGradient(tmp, 0, 0, w, h,
              (grad.from >>> 24) & 0xff, (grad.from >>> 16) & 0xff, (grad.from >>> 8) & 0xff, grad.from & 0xff,
              (grad.to >>> 24) & 0xff, (grad.to >>> 16) & 0xff, (grad.to >>> 8) & 0xff, grad.to & 0xff,
              grad.angle)
          } else {
            const cx = Math.round(w / 2)
            const cy = Math.round(h / 2)
            const gradRadius = Math.round(Math.max(w, h) / 2)
            paint.radialGradient(tmp, cx, cy, gradRadius,
              (grad.from >>> 24) & 0xff, (grad.from >>> 16) & 0xff, (grad.from >>> 8) & 0xff, grad.from & 0xff,
              (grad.to >>> 24) & 0xff, (grad.to >>> 16) & 0xff, (grad.to >>> 8) & 0xff, grad.to & 0xff)
          }
          // Mask: create a rounded rect alpha mask and multiply
          const mask = create(w, h)
          paint.roundedRect(mask, 0, 0, w, h, 255, 255, 255, 255, radius)
          // Apply mask: zero out gradient pixels where mask alpha is 0
          const gd = tmp.data
          const md = mask.data
          for (let i = 3; i < w * h * 4; i += 4) {
            if (md[i] === 0) { gd[i - 3] = 0; gd[i - 2] = 0; gd[i - 1] = 0; gd[i] = 0 }
            else if (md[i] < 255) {
              // Anti-aliased edge — scale alpha
              gd[i] = Math.round((gd[i] * md[i]) / 255)
            }
          }
          over(buf, tmp, x, y)
        } else {
          // No radius: paint gradient directly
          if (grad.type === "linear") {
            paint.linearGradient(buf, x, y, w, h,
              (grad.from >>> 24) & 0xff, (grad.from >>> 16) & 0xff, (grad.from >>> 8) & 0xff, grad.from & 0xff,
              (grad.to >>> 24) & 0xff, (grad.to >>> 16) & 0xff, (grad.to >>> 8) & 0xff, grad.to & 0xff,
              grad.angle)
          } else {
            const cx = x + Math.round(w / 2)
            const cy = y + Math.round(h / 2)
            const gradRadius = Math.round(Math.max(w, h) / 2)
            paint.radialGradient(buf, cx, cy, gradRadius,
              (grad.from >>> 24) & 0xff, (grad.from >>> 16) & 0xff, (grad.from >>> 8) & 0xff, grad.from & 0xff,
              (grad.to >>> 24) & 0xff, (grad.to >>> 16) & 0xff, (grad.to >>> 8) & 0xff, grad.to & 0xff)
          }
        }
      } else if (matchedEffect?.cornerRadii) {
        const cr = matchedEffect.cornerRadii
        paint.roundedRectCorners(buf, x, y, w, h, r, g, b, a, cr.tl, cr.tr, cr.br, cr.bl)
      } else if (radius > 0) {
        paint.roundedRect(buf, x, y, w, h, r, g, b, a, radius)
      } else {
        paint.fillRect(buf, x, y, w, h, r, g, b, a)
      }
      break
    }

    case CMD.BORDER: {
      const radius = Math.round(cmd.cornerRadius)
      const bw = Math.round(cmd.extra1) || 1
      // Check if this border matches a per-corner radius effect
      const cmdBorderColor = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
      const borderEffectIdx = effectsQueue.findIndex(
        (e) => e.cornerRadii && e.color !== undefined
      )
      if (borderEffectIdx >= 0 && effectsQueue[borderEffectIdx].cornerRadii) {
        const cr = effectsQueue[borderEffectIdx].cornerRadii!
        paint.strokeRectCorners(buf, x, y, w, h, r, g, b, a, cr.tl, cr.tr, cr.br, cr.bl, bw)
      } else {
        paint.strokeRect(buf, x, y, w, h, r, g, b, a, radius, bw)
      }
      break
    }

    case CMD.TEXT: {
      if (!cmd.text) break
      const meta = textMetaMap.get(cmd.text)
      const fontId = meta?.fontId ?? 0
      const lineHeight = meta?.lineHeight ?? 17

      if (selectableTextMode) {
        // Collect for ANSI rendering — use ABSOLUTE coordinates (add offset back)
        pendingAnsiTexts.push({
          text: cmd.text,
          x: x + offsetX,
          y: y + offsetY,
          r, g, b, a,
          lineHeight,
          maxWidth: Math.max(w, 1),
          fontId,
        })
        break
      }

      // Pixel paint mode — render bitmap text
      const maxTextWidth = Math.max(w, 1)
      const result = layoutText(cmd.text, fontId, maxTextWidth, lineHeight)
      if (result.lines.length <= 1) {
        paint.drawText(buf, x, y, cmd.text, r, g, b, a)
      } else {
        for (let li = 0; li < result.lines.length; li++) {
          const line = result.lines[li]
          const lineY = y + li * lineHeight
          paint.drawText(buf, x, lineY, line.text, r, g, b, a)
        }
      }
      break
    }
  }
}
