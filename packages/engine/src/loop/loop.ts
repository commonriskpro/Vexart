/**
 * Render loop — connects SolidJS tree → Clay layout → Zig paint → output.
 *
 * Browser-style layer compositing with recursive boundary detection:
 *   1. Walk TGENode tree and replay into Clay (immediate mode)
 *   2. Simultaneously build a command→layer assignment map
 *   3. Clay calculates layout → flat array of RenderCommands
 *   4. Group commands by layer using the assignment map
 *   5. Only repaint dirty layers → GPU layer target + raw presentation payload
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

import type { Terminal } from "@vexart/engine"
import { createLayerComposer } from "@vexart/engine"
import { clay, CMD, ATTACH_TO, ATTACH_POINT, POINTER_CAPTURE, SIZING, DIRECTION } from "../ffi/clay"
import type { RenderCommand } from "../ffi/clay"
import {
  type TGENode,
  type SizingInfo,
  type NodeMouseEvent,
  createNode,
  createPressEvent,
  parseSizing,
  parseDirection,
  parseAlignX,
  parseAlignY,
  resolveProps,
} from "../ffi/node"
import { shouldFreezeInteractionLayer, shouldPromoteInteractionLayer } from "../reconciler/interaction"
import { createDirtyTracker } from "../reconciler/dirty"
import { hasActiveAnimations } from "./animation"
import { appendFileSync } from "node:fs"
import { debugFrameStart, debugUpdateStats } from "./debug"
import { fromConfig, identity, invert, multiply, translate, transformBounds, transformPoint, isIdentity } from "../ffi/matrix"
import type { Matrix3 } from "../ffi/matrix"
import { decodeImageForNode } from "./image"
import { focusedId, setFocusedId, getNodeFocusId } from "../reconciler/focus"
import {
  type Layer,
  createLayerStore,
} from "../ffi/layers"
import { measureForClay, layoutText, getFont, fontToCSS } from "../ffi/text-layout"
import {
  intersectRect,
  rectArea as damageRectArea,
  sumOverlapArea as damageSumOverlapArea,
  type DamageRect,
} from "../ffi/damage"
import { createGpuRendererBackend } from "../ffi/gpu-renderer-backend"
import { createGpuFrameComposer } from "../ffi/gpu-frame-composer"
import { summarizeRendererResourceStats } from "../ffi/resource-stats"
import { getLatestInteractionTrace } from "./input"
import {
  buildRenderGraphFrame,
  createRenderGraphQueues,
  resetRenderGraphQueues,
  type EffectConfig,
  type TextMeta,
} from "../ffi/render-graph"
import {
  getRendererBackend,
  setRendererBackend,
  type RendererBackend,
  type RendererBackendFrameContext,
  type RendererBackendLayerContext,
} from "../ffi/renderer-backend"
import {
  boostWindowFor as schedulerBoostWindowFor,
  hasRecentInteraction as schedulerHasRecentInteraction,
  type InteractionKind,
} from "./frame-scheduler"
import {
  buildNodeMouseEvent,
  isFullyOutsideScrollViewport,
} from "../reconciler/hit-test"
import {
  writeSequentialCommandLayout,
  writeLayoutFromElementIds,
} from "../ffi/layout-writeback"
const LOG = "/tmp/tge-layers.log"
const RENDER_DEBUG_LOG = "/tmp/tge-render-debug.log"
const CADENCE_LOG = "/tmp/tge-cadence.log"
const RESIZE_DEBUG_LOG = "/tmp/tge-resize.log"
const DRAG_REPRO_LOG = "/tmp/tge-drag-repro.log"
const DEBUG_CADENCE = process.env.TGE_DEBUG_CADENCE === "1"
const DEBUG_RESIZE = process.env.TGE_DEBUG_RESIZE === "1"
const DEBUG_DRAG_REPRO = process.env.TGE_DEBUG_DRAG_REPRO === "1"
function log(msg: string) {
  appendFileSync(LOG, msg + "\n")
}

function renderDebug(msg: string) {
  appendFileSync(RENDER_DEBUG_LOG, msg + "\n")
}

function cadenceDebug(msg: string) {
  if (!DEBUG_CADENCE) return
  appendFileSync(CADENCE_LOG, msg + "\n")
}

function resizeDebug(msg: string) {
  if (!DEBUG_RESIZE) return
  appendFileSync(RESIZE_DEBUG_LOG, `[renderer:loop] ${msg}\n`)
}

function dragReproDebug(msg: string) {
  if (!DEBUG_DRAG_REPRO) return
  appendFileSync(DRAG_REPRO_LOG, msg + "\n")
}

function findNodeByDebugName(node: TGENode, debugName: string): TGENode | null {
  if (node.kind !== "text" && node.props.debugName === debugName) return node
  for (const child of node.children) {
    if (child.kind === "text") continue
    const found = findNodeByDebugName(child, debugName)
    if (found) return found
  }
  return null
}

type FrameProfile = {
  scheduledIntervalMs: number
  scheduledDelayMs: number
  timerDelayMs: number
  sincePrevFrameMs: number
  layoutMs: number
  prepMs: number
  paintMs: number
  beginSyncMs: number
  ioMs: number
  endSyncMs: number
  totalMs: number
  commands: number
  repainted: number
  dirtyBefore: number
}

function countNodes(node: TGENode): number {
  if (node.kind === "text") return 1
  let total = 1
  for (const child of node.children) total += countNodes(child)
  return total
}

function hasPointerReactiveNodes(node: TGENode): boolean {
  if (node.kind === "text") return false
  const hasMouseCallbacks = !!(node.props.onMouseDown || node.props.onMouseUp || node.props.onMouseMove || node.props.onMouseOver || node.props.onMouseOut)
  const hasHoverState = !!(node.props.hoverStyle || node.props.activeStyle || node.props.onPress)
  if (hasMouseCallbacks || hasHoverState) return true
  return node.children.some((child) => hasPointerReactiveNodes(child))
}

function hasTransformInSubtree(node: TGENode): boolean {
  if (node.kind === "text") return false
  if (node.props.transform) return true
  return node.children.some((child) => hasTransformInSubtree(child))
}

function canUseRegionalRepaint(boundaryNode: TGENode | null, hasScissor: boolean, isBg: boolean): boolean {
  if (hasScissor) return false
  if (isBg) return true
  if (!boundaryNode || boundaryNode.kind === "text") return true
  if (boundaryNode.props.viewportClip === false) return false
  if (hasTransformInSubtree(boundaryNode)) return false
  return true
}

function commandIntersectsRect(cmd: RenderCommand, rect: { x: number; y: number; width: number; height: number }): boolean {
  const left = cmd.x
  const top = cmd.y
  const right = cmd.x + cmd.width
  const bottom = cmd.y + cmd.height
  return left < rect.x + rect.width && right > rect.x && top < rect.y + rect.height && bottom > rect.y
}

// ── Text metadata ──
// During walkTree, we record text props for each <Text> node.
// During paint, we look up the metadata by text content to do multi-line layout.
const textMetaMap = new Map<string, TextMeta>()

// ── Effect metadata ──
// During walkTree, we record shadow/glow configs for nodes with backgroundColor.
// After Clay layout, we match RECT commands to these configs by color+radius
// (emitted in tree-walk order) and apply effects in paintCommand.

/** Effects queue — populated during walkTree, consumed during paintCommand. */
const renderGraphQueues = createRenderGraphQueues()
let effectsQueue = renderGraphQueues.effects

let imageQueue = renderGraphQueues.images
let canvasQueue = renderGraphQueues.canvases
const frameDirtyRects: DamageRect[] = []
const activeSlotKeys = new Set<string>()

export type RenderLoopOptions = {
  /** Experimental optimizations — these may change or be removed. */
  experimental?: {
    /**
     * Frame budget in ms. If a frame exceeds this budget during layer painting,
     * remaining non-background layers are deferred to the next frame.
     * Set to 0 to disable. Default: 0 (disabled)
     */
    frameBudgetMs?: number
    /**
     * Maximum FPS cap. Default: 60.
     * Idle runs at up to 60fps (bounded by this value). During animations: scales up to this value.
     * Set to 30 to force 30fps always (e.g., for SSH).
     */
    maxFps?: number
    /** Idle FPS cap override. Default: min(maxFps, 60). */
    idleMaxFps?: number
    /** Interaction-driven frame cap. Default: min(maxFps, 60). */
    interactionMaxFps?: number
    /** Force layer retransmit even when the pixel buffer is unchanged. Benchmark/debug only. */
    forceLayerRepaint?: boolean
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
  /** Hint that a user interaction just happened and visible latency matters. */
  nudgeInteraction: (kind: "pointer" | "scroll" | "key") => void
  /** Force an immediate frame for latency-sensitive interaction if safe. */
  requestInteractionFrame: (kind: "pointer" | "scroll" | "key") => void
  /** Whether pointer movement can currently affect visible UI state. */
  needsPointerRepaint: () => boolean
  /** Capture pointer — all mouse events go to this node until release.
   *  Like Element.setPointerCapture() in the DOM. Auto-released on button up. */
  setPointerCapture: (nodeId: number) => void
  /** Release pointer capture for the given node. */
  releasePointerCapture: (nodeId: number) => void
  /** Register a callback to run after Clay processes scroll but before walkTree.
   *  Returns unregister function. Used by VirtualList for zero-latency scroll sync. */
  onPostScroll: (cb: () => void) => () => void
  /** Mark the owner layer of a node as dirty, optionally with a global damage rect. */
  markNodeLayerDamaged: (nodeId: number, rect?: DamageRect) => void
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

type PreparedLayerSlot = {
  slot: LayerSlot
  layer: Layer
  debugName: string
  bounds: DamageRect
  dirtyRect: DamageRect | null
  clippedDamage: DamageRect | null
  isBackground: boolean
  subtreeTransform: {
    p0: { x: number; y: number }
    p1: { x: number; y: number }
    p2: { x: number; y: number }
    p3: { x: number; y: number }
  } | null
  allowRegionalRepaint: boolean
  useRegionalRepaint: boolean
  freezeWhileInteracting: boolean
}

function rectArea(rect: DamageRect | null | undefined) {
  return damageRectArea(rect)
}

function sumOverlapArea(rects: DamageRect[]) {
  return damageSumOverlapArea(rects)
}

export function createRenderLoop(term: Terminal, opts?: RenderLoopOptions): RenderLoop {
  const dirtyTracker = createDirtyTracker()
  const markDirty = dirtyTracker.markDirty
  const isDirty = dirtyTracker.isDirty
  const clearDirty = dirtyTracker.clearDirty
  const layerStore = createLayerStore()
  const createLayer = layerStore.createLayer
  const markAllDirty = layerStore.markAllDirty
  const updateLayerGeometry = layerStore.updateLayerGeometry
  const markLayerClean = layerStore.markLayerClean
  const imageIdForLayer = layerStore.imageIdForLayer
  const resetLayers = layerStore.resetLayers
  const dirtyCount = layerStore.dirtyCount
  const layerCount = layerStore.layerCount
  const markLayerDamaged = layerStore.markLayerDamaged
  const getPreviousLayerRect = layerStore.getPreviousLayerRect
  const removeLayer = layerStore.removeLayer
  const expFrameBudgetMs = opts?.experimental?.frameBudgetMs ?? 0
  if (!term.caps.kittyGraphics) {
    throw new Error("TGE GPU-only renderer requires a terminal with Kitty graphics support")
  }
  const root = createNode("root")

  // Initialize Clay with pixel dimensions
  let viewportWidth = term.size.pixelWidth || term.size.cols * (term.size.cellWidth || 8)
  let viewportHeight = term.size.pixelHeight || term.size.rows * (term.size.cellHeight || 16)

  root.props = { width: viewportWidth, height: viewportHeight }
  root._widthSizing = parseSizing(viewportWidth)
  root._heightSizing = parseSizing(viewportHeight)
  clay.init(viewportWidth, viewportHeight)

  // Detect backend: use layer compositor for kitty direct, old compositor for others
  const useLayerCompositing = term.caps.kittyGraphics
  const baseLayerComposer = useLayerCompositing
    ? createLayerComposer(term.write, term.rawWrite, term.caps.transmissionMode, "auto")
    : null
  const layerComposer = baseLayerComposer ? createGpuFrameComposer(baseLayerComposer) : null
  let timer: ReturnType<typeof setTimeout> | null = null
  const maxFps = opts?.experimental?.maxFps ?? 60
  const idleMaxFps = opts?.experimental?.idleMaxFps ?? Math.min(maxFps, 60)
  const interactionMaxFps = opts?.experimental?.interactionMaxFps ?? Math.min(maxFps, 60)
  const forceLayerRepaint = opts?.experimental?.forceLayerRepaint === true
  const idleFps = Math.max(1, Math.min(idleMaxFps, maxFps))
  const interactionFps = Math.max(1, Math.min(interactionMaxFps, maxFps))
  const idleInterval = Math.max(Math.round(1000 / idleFps), 8)
  const activeInterval = Math.max(Math.round(1000 / maxFps), 8) // min 8ms ≈ 120fps cap
  const interactionInterval = Math.max(Math.round(1000 / interactionFps), 8)
  const keyInteractionBoostMs = 220
  const scrollInteractionBoostMs = 320
  const pointerInteractionBoostMs = 520
  const interactionNudgeDelayMs = 4
  let isSuspended = false
  let lastInteractionAt = performance.now()
  let scheduledIntervalMs = 0
  let scheduledDelayMs = 0
  let scheduledAtMs = 0
  let lastFrameStartedAt = 0
  let nextFrameDeadlineMs = 0
  let interactionBoostUntilMs = performance.now()
  let lastInteractionFrameAt = 0
  let lastPresentedInteractionSeq = 0
  let lastPresentedInteractionLatencyMs = 0
  let lastPresentedInteractionType: string | null = null
  let isRenderingFrame = false
  let pendingInteractionFrameKind: InteractionKind | null = null

  function boostWindowFor(kind: InteractionKind) {
    return schedulerBoostWindowFor(kind, {
      key: keyInteractionBoostMs,
      scroll: scrollInteractionBoostMs,
      pointer: pointerInteractionBoostMs,
    })
  }

  function markInteractionActive(kind: InteractionKind = "pointer") {
    const now = performance.now()
    lastInteractionAt = now
    interactionBoostUntilMs = Math.max(interactionBoostUntilMs, now + boostWindowFor(kind))
  }

  function hasRecentInteraction() {
    return schedulerHasRecentInteraction(performance.now(), interactionBoostUntilMs, capturedNodeId, pointerDown)
  }

  function scheduleNextFrame() {
    const interval = (hasActiveAnimations() || hasRecentInteraction()) ? activeInterval : idleInterval
    const now = performance.now()

    if (nextFrameDeadlineMs === 0 || scheduledIntervalMs !== interval) {
      nextFrameDeadlineMs = now + interval
    } else {
      nextFrameDeadlineMs += interval
      if (nextFrameDeadlineMs < now) {
        nextFrameDeadlineMs = now
      }
    }

    scheduledIntervalMs = interval
    scheduledAtMs = now
    const delay = Math.max(0, nextFrameDeadlineMs - now)
    scheduledDelayMs = delay

    timer = setTimeout(() => {
      if (isDirty()) frame()
      scheduleNextFrame()
    }, delay)
  }

  function nudgeInteraction(kind: InteractionKind) {
    markInteractionActive(kind)
    if (isSuspended) return
    if (timer === null) return
    if (!isDirty()) return
    const now = performance.now()
    const wait = Math.max(0, interactionInterval - (now - lastInteractionFrameAt))
    const targetDelay = Math.max(kind === "pointer" ? 0 : kind === "scroll" ? 1 : interactionNudgeDelayMs, wait)
    if (scheduledDelayMs <= targetDelay + 1) return
    clearTimeout(timer)
    timer = null
    scheduledDelayMs = targetDelay
    scheduledAtMs = now
    nextFrameDeadlineMs = now + targetDelay
    timer = setTimeout(() => {
      if (isDirty()) frame()
      scheduleNextFrame()
    }, targetDelay)
  }

  function requestInteractionFrame(kind: InteractionKind) {
    markInteractionActive(kind)
    if (isSuspended) return
    if (!isDirty()) return
    pendingInteractionFrameKind = kind
    if (isRenderingFrame) return
    nudgeInteraction(kind)
  }

  // ── Scroll + pointer state ──
  // Accumulates scroll deltas from input events between frames.
  let scrollDeltaX = 0
  let scrollDeltaY = 0
  let pointerX = viewportWidth / 2  // Default to center so scroll container is "hovered"
  let pointerY = viewportHeight / 2
  let pointerDown = false
  let pointerDirty = true  // Feed at least once — also used to detect pointer movement for onMouseMove
  let capturedNodeId = 0   // Pointer capture: 0 = none, >0 = node.id that captures all mouse events
  const rectNodeById = new Map<number, TGENode>()

  // Post-scroll callbacks — fire AFTER clay.updateScroll() but BEFORE walkTree.
  // Used by VirtualList to read Clay's scroll offset with zero latency.
  const postScrollCallbacks: (() => void)[] = []
  // Edge queues: accumulate press/release transitions between frames.
  // Without queuing, a press+release in the same onData chunk would be invisible
  // to frame-based edge detection (both transitions overwrite pointerDown).
  let pendingPress = false
  let pendingRelease = false
  let scrollSpeedCap = 0  // 0 = no cap (natural), >0 = lines per tick
  let lastFrameTime = Date.now()

  const defaultGpuRendererBackend = createGpuRendererBackend()

  if (!getRendererBackend()) {
    setRendererBackend(defaultGpuRendererBackend)
  }

  const getActiveRendererBackend = (): RendererBackend => getRendererBackend() ?? defaultGpuRendererBackend

  const paintCommandsWithRendererBackend = (
    target: { width: number; height: number },
    commands: RenderCommand[],
    offsetX: number,
    offsetY: number,
    frame: RendererBackendFrameContext | null = null,
    layer: RendererBackendLayerContext | null = null,
    backendOverride?: RendererBackend,
  ) => {
    const backend = backendOverride ?? getActiveRendererBackend()
    const graph = buildRenderGraphFrame(commands, renderGraphQueues, textMetaMap, {
      rectNodeIds: rectNodes.map((node) => node.id),
      textNodeIds: textNodes.map((node) => node.id),
    })
    return backend.paint({
      targetWidth: target.width,
      targetHeight: target.height,
      backing: layer?.backing ?? null,
      target,
      commands,
      graph,
      offsetX,
      offsetY,
      frame,
      layer,
    })
  }

  /** Feed a scroll event from the input system. Called by mount(). */
  function feedScroll(dx: number, dy: number) {
    scrollDeltaX += dx
    scrollDeltaY += dy
    markInteractionActive("scroll")
    markDirty() // scroll changes need a repaint
    nudgeInteraction("scroll")
  }

  /** Feed mouse position from the input system. */
  function feedPointer(x: number, y: number, down: boolean) {
    const moved = x !== pointerX || y !== pointerY
    const changedDown = down !== pointerDown
    pointerX = x
    pointerY = y
    if (moved || changedDown) markInteractionActive("pointer")
    // Queue edge transitions so they survive until next frame
    if (down && !pointerDown) pendingPress = true
    if (!down && pointerDown) pendingRelease = true
    pointerDown = down
    pointerDirty = true
    if (moved || changedDown) nudgeInteraction("pointer")
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
  const nodePathById = new Map<number, string>()
  const nodeRefById = new Map<number, TGENode>()

  function walkTree(node: TGENode, parentDir?: number, insideTransform?: boolean, path = "r") {
    nodePathById.set(node.id, path)
    nodeRefById.set(node.id, node)
    if (node.kind === "text") {
      const content = node.text || collectText(node)
      if (!content) return
      const color = (node.props.color as number) || 0xe0e0e0ff
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

      // Sizing: use pre-parsed if explicit, else image intrinsic size, else fit
      const imgBuf = node._imageBuffer
      const ws = node._widthSizing ?? (imgBuf ? { type: SIZING.FIXED, value: imgBuf.width } : { type: SIZING.FIT, value: 0 })
      const hs = node._heightSizing ?? (imgBuf ? { type: SIZING.FIXED, value: imgBuf.height } : { type: SIZING.FIT, value: 0 })
      clay.configureSizing(ws.type, ws.value, hs.type, hs.value)

      // Use a placeholder RECT so Clay emits a RECTANGLE command for painting
      const placeholderColor = 0x00000001 // near-transparent
      clay.configureRectangle(placeholderColor, node.props.cornerRadius ?? 0)
      registerRectNode(node)

      // Queue image data for paintCommand
      if (imgBuf) {
        imageQueue.push({
          renderObjectId: node.id,
          color: placeholderColor,
          cornerRadius: node.props.cornerRadius ?? 0,
          imageBuffer: imgBuf,
          objectFit: node.props.objectFit ?? "contain",
        })
      }

      clay.closeElement()
      return
    }

    // ── <canvas> intrinsic — imperative drawing surface ──
    if (node.kind === "canvas") {
      boxNodes.push(node)

      const hasMouseProps = node.props.onMouseDown || node.props.onMouseUp || node.props.onMouseMove || node.props.onMouseOver || node.props.onMouseOut
      const isInteractive = node.props.focusable || node.props.hoverStyle || node.props.activeStyle || node.props.focusStyle || node.props.onPress || hasMouseProps
      if (isInteractive) {
        clay.setId(`tge-node-${node.id}`)
      } else {
        clay.openElement()
      }

      // Sizing: use pre-parsed or default to grow
      const ws = node._widthSizing ?? { type: SIZING.GROW, value: 0 }
      const hs = node._heightSizing ?? { type: SIZING.GROW, value: 0 }
      clay.configureSizing(ws.type, ws.value, hs.type, hs.value)

      // Use a UNIQUE placeholder RECT so Clay emits a RECTANGLE command for painting.
      // Important: paintCommand matches canvases by placeholder color. Using the same
      // color for every canvas causes multiple surfaces to cross-wire visually.
      // Pack node.id into RGB, keep alpha near-transparent.
      const placeholderColor = (((node.id & 0x00ffffff) << 8) | 0x02) >>> 0
      clay.configureRectangle(placeholderColor, 0)
      registerRectNode(node)

      // Queue canvas config for paintCommand
      if (node.props.onDraw) {
        canvasQueue.push({
          renderObjectId: node.id,
          color: placeholderColor,
          onDraw: node.props.onDraw,
          viewport: node.props.viewport,
        })
      }

      clay.closeElement()
      return
    }

    boxNodes.push(node)

    // Assign Clay element ID for:
    // 1. Scroll containers — for scroll offset tracking
    // 2. Interactive nodes — for reliable layout readback (hit-testing)
    const hasMouseProps = node.props.onMouseDown || node.props.onMouseUp || node.props.onMouseMove || node.props.onMouseOver || node.props.onMouseOut
    const isInteractive = node.props.focusable || node.props.hoverStyle || node.props.activeStyle || node.props.focusStyle || node.props.onPress || hasMouseProps
    const needsLayoutId = isInteractive || node.props.layer === true
    if (node.props.scrollX || node.props.scrollY) {
      const sid = node.props.scrollId ?? `tge-scroll-${scrollIdCounter++}`
      clay.setId(sid)
      if (node.props.scrollSpeed) {
        scrollSpeedCap = node.props.scrollSpeed
      }
    } else if (needsLayoutId) {
      clay.setId(`tge-node-${node.id}`)
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

    // Sizing — use pre-parsed values, fallback to FIT.
    // CSS align-items:stretch emulation — if parent is column and child has no
    // explicit width, auto-stretch to fill parent width (and vice versa for row).
    // null _widthSizing/_heightSizing = user never set it → candidate for stretch.
    const hasFlexGrowAlias = node.props.flexGrow !== undefined && node.props.width === undefined
    const stretchW = !node._widthSizing && !hasFlexGrowAlias && parentDir === DIRECTION.TOP_TO_BOTTOM
    const stretchH = !node._heightSizing && parentDir === DIRECTION.LEFT_TO_RIGHT
    const FIT_DEFAULT: SizingInfo = { type: SIZING.FIT, value: 0 }
    const GROW_DEFAULT: SizingInfo = { type: SIZING.GROW, value: 0 }
    const ws = hasFlexGrowAlias
      ? GROW_DEFAULT
      : stretchW
        ? GROW_DEFAULT
        : (node._widthSizing ?? FIT_DEFAULT)
    const hs = stretchH
      ? GROW_DEFAULT
      : (node._heightSizing ?? FIT_DEFAULT)
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
    //    This is the equivalent of the web where any element is clickable regardless of background.
    const hasBackdropFilter = vp.backdropBlur !== undefined || vp.backdropBrightness !== undefined ||
      vp.backdropContrast !== undefined || vp.backdropSaturate !== undefined ||
      vp.backdropGrayscale !== undefined || vp.backdropInvert !== undefined ||
      vp.backdropSepia !== undefined || vp.backdropHueRotate !== undefined
    const hasMouseCallbacks = vp.onMouseDown || vp.onMouseUp || vp.onMouseMove || vp.onMouseOver || vp.onMouseOut
    const isInteractiveNode = vp.onPress || vp.focusable || vp.hoverStyle || vp.activeStyle || vp.focusStyle || hasMouseCallbacks
    const hasTransform = vp.transform !== undefined
    const needsRect = vp.backgroundColor !== undefined || vp.gradient !== undefined || hasBackdropFilter || vp.opacity !== undefined || isInteractiveNode || hasTransform
    if (needsRect) {
      const bgColor = vp.backgroundColor !== undefined ? (vp.backgroundColor as number) : 0x00000001 // near-transparent placeholder
      const cr = vp.cornerRadius ?? 0
      clay.configureRectangle(bgColor, cr)
      registerRectNode(node)

      // Record effects for this RECT — matched during paint
      if (vp.shadow || vp.glow || vp.gradient || hasBackdropFilter || vp.cornerRadii || vp.opacity !== undefined || hasTransform) {
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
        if (hasTransform && vp.transform) {
          const usesSubtreeTransformPass = node.children.length > 0
          if (!usesSubtreeTransformPass) {
            // Store the raw config; matrix is computed in paintCommand after we know dimensions.
            effect.transform = new Float64Array(9) // placeholder, computed in paint
            ;(effect as any)._transformConfig = vp.transform
            ;(effect as any)._transformOrigin = vp.transformOrigin
          }
        }
        effectsQueue.push(effect)
      }
    }

    // Borders — per-side or uniform (uses resolved visual props)
    // If focusStyle/hoverStyle/activeStyle define a borderWidth, ALWAYS reserve
    // that space in Clay (with transparent color when inactive). This prevents
    // layout jitter when the interactive style activates — like CSS outline vs border.
    const maxInteractiveBorder = Math.max(
      (node.props.focusStyle as any)?.borderWidth ?? 0,
      (node.props.hoverStyle as any)?.borderWidth ?? 0,
      (node.props.activeStyle as any)?.borderWidth ?? 0,
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
      // Use actual border color when active, transparent when reserving space
      const borderColor = (vp.borderColor !== undefined ? vp.borderColor : 0x00000000) as number
      clay.configureBorder(borderColor, effectiveBorderWidth)
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

    // Propagate transform ancestry to children: if this node has a transform
    // prop OR we're already inside a transform subtree, children inherit it.
    const childInsideXform = insideTransform || hasTransform
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      walkTree(child, dir, childInsideXform, `${path}.${i}`)
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
    nodeId: number
    z: number
    /** True if this node is a scroll container (scrollX/scrollY). */
    isScroll: boolean
    /** True if this node has an explicit backgroundColor. */
    hasBg: boolean
    /** True if the layer is INSIDE a scroll container ancestor. */
    insideScroll: boolean
    /** True if this layer boundary exists to preserve a subtree transform. */
    hasSubtreeTransform: boolean
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
    const isInteractionLayer = shouldPromoteInteractionLayer(node)
    const hasSubtreeTransform = !!(node.props.transform && node.children.length > 0)
    if (node.props.layer === true || isInteractionLayer || hasSubtreeTransform) {
      result.push({
        path,
        nodeId: node.id,
        z: nextZ++,
        isScroll,
        hasBg: node.props.backgroundColor !== undefined,
        insideScroll,
        hasSubtreeTransform,
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
  ): { bgSlot: LayerSlot; contentSlots: LayerSlot[]; slotBoundaryByKey: Map<string, LayerBoundary> } {
    const bgSlot: LayerSlot = { key: "bg", z: -1, cmdIndices: [] }

    if (boundaries.length === 0) {
      for (let i = 0; i < commands.length; i++) {
        bgSlot.cmdIndices.push(i)
      }
      return { bgSlot, contentSlots: [], slotBoundaryByKey: new Map() }
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

      const slot: LayerSlot = { key: `layer:${b.nodeId}`, z: b.z, cmdIndices: [] }
      let scissor: ScissorPair | null = null

      // If this layer is a scroll container, find its SCISSOR pair
      if (b.isScroll) {
        const si = scrollPathToScissor.get(b.path)
        if (si !== undefined && si < scissorPairs.length) {
          scissor = scissorPairs[si]
        }
      }

      const layoutX = Math.round(node.layout.x)
      const layoutY = Math.round(node.layout.y)
      const layoutW = Math.round(node.layout.width)
      const layoutH = Math.round(node.layout.height)
      const hasUsableLayout = layoutW > 0 && layoutH > 0
      const shouldPreferLayoutBounds = !scissor && hasUsableLayout && (node.props.floating || node.props.layer === true || node.props.interactionMode === "drag" || b.hasSubtreeTransform)

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
      } else if (shouldPreferLayoutBounds) {
        // Explicit/floating layers must anchor to their own layout box.
        // Color matching is ambiguous because multiple panels share the same
        // surface tokens, which can bind one panel's commands to another slot.
        layerBounds.push({
          slot,
          x: layoutX,
          y: layoutY,
          right: layoutX + layoutW,
          bottom: layoutY + layoutH,
          scissor: null,
          boundary: b,
        })
      } else if (b.hasBg) {
        // Static layer with bg: find anchor RECT by color match
        const targetColor = (node.props.backgroundColor as number) || 0
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
        // No bg, not scroll — use real Clay layout bounds when available.
        // This is critical for floating/layer containers whose painted subtree
        // lives in children rather than on the layer root itself.
        const lx = Math.round(node.layout.x)
        const ly = Math.round(node.layout.y)
        const lw = Math.round(node.layout.width)
        const lh = Math.round(node.layout.height)
        if (lw > 0 && lh > 0) {
          layerBounds.push({ slot, x: lx, y: ly, right: lx + lw, bottom: ly + lh, scissor: null, boundary: b })
        } else {
          // Fallback for truly layout-less layers: text matching only.
          layerBounds.push({ slot, x: 0, y: 0, right: 0, bottom: 0, scissor: null, boundary: b })
        }
      }
    }

    // ── Phase 3: Assign commands to layers ──
    const contentSlots: LayerSlot[] = layerBounds.map(lb => lb.slot)
    const slotBoundaryByKey = new Map(layerBounds.map((lb) => [lb.slot.key, lb.boundary]))

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
          const targetColor = (node.props.backgroundColor as number) || 0
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

    function overlapArea(
      ax: number,
      ay: number,
      ar: number,
      ab: number,
      bx: number,
      by: number,
      br: number,
      bb: number,
    ) {
      const left = Math.max(ax, bx)
      const top = Math.max(ay, by)
      const right = Math.min(ar, br)
      const bottom = Math.min(ab, bb)
      if (right <= left || bottom <= top) return 0
      return (right - left) * (bottom - top)
    }

    // Assign remaining commands (not claimed by scissor layers)
    // to static layers by strongest spatial overlap, or to bgSlot.
    // Using only cmd.x/cmd.y is too unstable for overlapping floating
    // layers because a large command can have its top-left inside a
    // neighbor even when most of its area belongs to another panel.
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
      const cw = Math.max(1, Math.round(cmd.width))
      const ch = Math.max(1, Math.round(cmd.height))
      const cr = cx + cw
      const cb = cy + ch

      let assigned = false
      let best: LayerBounds | null = null
      let bestArea = 0
      for (const lb of sortedBounds) {
        const area = overlapArea(cx, cy, cr, cb, lb.x, lb.y, lb.right, lb.bottom)
        if (area > bestArea) {
          best = lb
          bestArea = area
          continue
        }
        if (area === bestArea && area > 0 && best && lb.slot.z > best.slot.z) {
          best = lb
        }
      }

      if (best && bestArea > 0) {
        best.slot.cmdIndices.push(i)
        assigned = true
      }

      if (!assigned) {
        for (const lb of sortedBounds) {
          if (cx >= lb.x && cy >= lb.y && cx < lb.right && cy < lb.bottom) {
            lb.slot.cmdIndices.push(i)
            assigned = true
            break
          }
        }
      }

      if (!assigned) {
        bgSlot.cmdIndices.push(i)
      }
    }

    // Handle no-bounds layers: extract TEXT commands from bgSlot by content match
    for (const lb of noBoundsLayers) {
      const boundary = slotBoundaryByKey.get(lb.slot.key)
      if (!boundary) continue
      const node = resolveNodeByPath(root, boundary.path)
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

    return { bgSlot, contentSlots, slotBoundaryByKey }
  }

  /** Resolve a TGENode by its tree path (e.g. "r.0.1.2"). */
  function resolveNodeByPath(fromRoot: TGENode, path: string): TGENode | null {
    const parts = path.split(".")
    let node = fromRoot
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
    const walk = (current: TGENode) => {
      if (current.kind === "text") {
        const text = current.text || collectText(current)
        if (text) result.push(text)
        return
      }
      for (const child of current.children) walk(child)
    }
    walk(node)
    return result
  }

  // ── Layout writeback ──

  function registerRectNode(node: TGENode) {
    rectNodes.push(node)
    rectNodeById.set(node.id, node)
  }

  /**
   * After Clay layout, write computed geometry back to TGENodes.
   *
   * RECT commands map 1:1 with rectNodes (same order as walkTree).
   * TEXT commands map 1:1 with textNodes (same order as walkTree).
   * Box nodes without backgroundColor also get layout from the
   * first command that spatially contains them (approximation).
   */
  function writeLayoutBack(commands: RenderCommand[]) {
    writeSequentialCommandLayout(commands, rectNodes, textNodes)
    writeLayoutFromElementIds(boxNodes)

    // For box nodes that had backgroundColor, layout was already written via RECT.
    // For box nodes WITHOUT backgroundColor, attempt to inherit from their first
    // child's command position. This is an approximation — full accuracy would
    // require Clay to expose per-element layout (which it doesn't via commands).
    // NOTE: This is a best-effort. Nodes with no background and no children
    // will have layout { 0, 0, 0, 0 } until a more precise approach is added.

    // ── Transform hierarchy ──
    // Pass 1: Compute LOCAL transform matrices on rectNodes (nodes with RECT commands).
    // This runs AFTER layout so we know w/h for transformOrigin.
    for (const node of rectNodes) {
      const vp = resolveProps(node)
      if (vp.transform) {
        const l = node.layout
        const originProp = vp.transformOrigin
        let ox = l.width / 2, oy = l.height / 2 // default: center
        if (originProp === "top-left") { ox = 0; oy = 0 }
        else if (originProp === "top-right") { ox = l.width; oy = 0 }
        else if (originProp === "bottom-left") { ox = 0; oy = l.height }
        else if (originProp === "bottom-right") { ox = l.width; oy = l.height }
        else if (originProp && typeof originProp === "object") { ox = originProp.x * l.width; oy = originProp.y * l.height }

        const matrix = fromConfig(vp.transform, ox, oy)
        if (!isIdentity(matrix)) {
          node._transform = matrix
          node._transformInverse = invert(matrix)
        } else {
          node._transform = null
          node._transformInverse = null
        }
      } else {
        node._transform = null
        node._transformInverse = null
      }
    }

    // Pass 2: Propagate transform hierarchy for hit-testing.
    //
    // Rendering uses SUBTREE TEMP BUFFER approach (post-pass in reverse depth
    // order). Hit-testing needs the COMPOSED inverse of ALL transforms in the
    // ancestor chain so that screen-space pointer coords map correctly to a
    // node's local coordinate space.
    //
    // For a node N inside Parent(M2) inside Root(M1), the post-pass applies:
    //   1. M2 centered on Parent (inner)
    //   2. M1 centered on Root (outer)
    //
    // To invert for hit-testing, we compose the FORWARD matrices rebased to
    // N's coord space (outer first), then invert once:
    //   forward = rebase(M1, root→N) × rebase(M2, parent→N) [× rebase(M_own, 0,0)]
    //   hit_inverse = forward^(-1)
    //
    // rebase(M, offset) = T(-offset) × M × T(offset)
    // This shifts M's origin from its own center to N's local space.

    function computeAccTransform(node: TGENode): void {
      // Collect all ancestors with transforms, from outermost to innermost
      const chain: TGENode[] = []
      let pa = node.parent
      while (pa) {
        if (pa._transform) chain.push(pa)
        pa = pa.parent
      }
      // chain is innermost-first; reverse to get outermost-first
      chain.reverse()

      const hasOwnTransform = !!node._transform
      const hasAncestorTransform = chain.length > 0

      if (!hasOwnTransform && !hasAncestorTransform) {
        node._accTransform = null
        node._accTransformInverse = null
        return
      }

      // For nodes with ONLY their own transform (no ancestors), keep the
      // simple path: accumulated = local. This preserves the original
      // behavior that's proven to work for leaf transforms.
      if (hasOwnTransform && !hasAncestorTransform) {
        node._accTransform = node._transform
        node._accTransformInverse = node._transformInverse
        return
      }

      const nl = node.layout

      // Compose forward matrix in ABSOLUTE coordinates.
      // Each _transform operates in its own local space (origin baked in via
      // fromConfig). Lift each to absolute: T(anc) × M × T(-anc).
      let absForward = identity()
      for (const anc of chain) {
        const al = anc.layout
        absForward = multiply(absForward, multiply(multiply(translate(al.x, al.y), anc._transform!), translate(-al.x, -al.y)))
      }
      if (hasOwnTransform) {
        absForward = multiply(absForward, multiply(multiply(translate(nl.x, nl.y), node._transform!), translate(-nl.x, -nl.y)))
      }

      // Rebase to node-local for the hit-test code which passes (pointer - layout):
      //   forwardLocal = T(-nl) × absForward × T(nl)
      // maps node-local → (screen - layout), so inv maps (pointer - layout) → node-local.
      const forwardLocal = multiply(multiply(translate(-nl.x, -nl.y), absForward), translate(nl.x, nl.y))
      node._accTransform = forwardLocal
      node._accTransformInverse = invert(forwardLocal)
    }

    for (const node of boxNodes) computeAccTransform(node)
    for (const node of textNodes) computeAccTransform(node)
  }

  // ── Interactive state (hover/active/focus) ──

  /** Track previous active state for onPress detection (mouseup over element). */
  let prevActiveNode: TGENode | null = null
  /** True between press and release — survives node recycling. */
  let pressOriginSet = false

  /** Build a NodeMouseEvent for the given node using current pointer state. */
  function makeMouseEvent(node: TGENode): NodeMouseEvent {
    return buildNodeMouseEvent(node, pointerX, pointerY)
  }

  /** Track nodes with interactive styles for hit-testing + focus bridging.
   *  Also dispatches per-node mouse callbacks (onMouseDown/Up/Move/Over/Out). */
  /** Returns true if a click was dispatched (focus/onPress fired). */
  function updateInteractiveStates(): boolean {
    let changed = false
    const currentFocusId = focusedId()

    // Edge detection for button press/release — consume queued edges.
    // These are accumulated between frames by feedPointer() so that
    // press+release in the same onData chunk doesn't get lost.
    const justPressed = pendingPress
    const justReleased = pendingRelease
    pendingPress = false
    pendingRelease = false

    // Check if a node has pointer capture — if so, it receives all events
    const captureNode = capturedNodeId !== 0 ? (rectNodeById.get(capturedNodeId) ?? null) : null

    // Walk all rect nodes (they have layout) and check hover/active/focus
    let newActiveNode: TGENode | null = null
    let pressedThisFrame: TGENode | null = null  // Node hit during justPressed (for fast-click detection)
    let hoveredPressTarget: TGENode | null = null
    for (const node of rectNodes) {
      const hasInteractiveStyle = node.props.hoverStyle || node.props.activeStyle || node.props.focusStyle
      const isFocusable = node.props.focusable
      const hasOnPress = node.props.onPress
      const hasMouseCb = node.props.onMouseDown || node.props.onMouseUp || node.props.onMouseMove || node.props.onMouseOver || node.props.onMouseOut

      // Skip nodes that have no interactive behavior at all
      if (!hasInteractiveStyle && !isFocusable && !hasOnPress && !hasMouseCb) continue

      const l = node.layout

      // Skip nodes that are COMPLETELY outside their scroll container viewport.
      // Without this, off-screen items (clipped by scissor) have layout coords
      // that overlap other screen areas, causing false hover/click detection.
      // Only applies to children of scroll containers, NOT the scroll container itself.
      if (!(node.props.scrollX || node.props.scrollY)) {
        const fullyOutsideViewport = isFullyOutsideScrollViewport(node)
        let scrollParent = node.parent
        while (scrollParent) {
          if (scrollParent.props.scrollX || scrollParent.props.scrollY) {
            if (fullyOutsideViewport) {
              if (node._hovered) { node._hovered = false; changed = true }
              if (node._active) { node._active = false; changed = true }
            }
            break
          }
          scrollParent = scrollParent.parent
        }
        // If fully outside, skip hit-testing for this node
        if (scrollParent && fullyOutsideViewport) continue
      }

      // If this node has pointer capture, it's "hovered" regardless of position.
      // Expand hit-area to at least one cell in each dimension — terminal mouse
      // resolution is per-cell, so elements smaller than a cell are hard to click.
      // This is like mobile "minimum touch target" (44px) but for terminal cells.
      const cw = term.size.cellWidth || 8
      const ch = term.size.cellHeight || 16
      const isCaptured = captureNode === node

      // Hit-test: if the node has a transform (own or inherited from parent),
      // use the ACCUMULATED inverse matrix to map pointer coords into the
      // node's local coordinate space. This handles the full transform hierarchy.
      const hitInverse = node._accTransformInverse ?? node._transformInverse
      let isOver = false
      if (isCaptured) {
        isOver = true
      } else if (hitInverse) {
        // Transform pointer from screen space to node-local space
        const inv = hitInverse
        // Pointer relative to node's layout origin
        const relX = pointerX - l.x
        const relY = pointerY - l.y
        // Apply inverse matrix
        const w = inv[6] * relX + inv[7] * relY + inv[8]
        if (Math.abs(w) > 1e-12) {
          const localX = (inv[0] * relX + inv[1] * relY + inv[2]) / w
          const localY = (inv[3] * relX + inv[4] * relY + inv[5]) / w
          // Hit-test against local bounding box with min cell-size expansion
          const hitW = Math.max(l.width, cw)
          const hitH = Math.max(l.height, ch)
          const hitX = -(hitW - l.width) / 2
          const hitY = -(hitH - l.height) / 2
          isOver = localX >= hitX && localX < hitX + hitW &&
                   localY >= hitY && localY < hitY + hitH
        }
      } else {
        // Standard axis-aligned hit-test (no transform)
        const hitW = Math.max(l.width, cw)
        const hitH = Math.max(l.height, ch)
        const hitX = l.x - (hitW - l.width) / 2
        const hitY = l.y - (hitH - l.height) / 2
        isOver = pointerX >= hitX && pointerX < hitX + hitW &&
                 pointerY >= hitY && pointerY < hitY + hitH
      }
      const isDown = isOver && pointerDown
      if (!hoveredPressTarget && isOver && (node.props.onPress || node.props.focusable)) {
        hoveredPressTarget = node
      }

      // Dispatch mouse enter/leave
      if (node._hovered !== isOver) {
        if (isOver && node.props.onMouseOver) node.props.onMouseOver(makeMouseEvent(node))
        if (!isOver && node.props.onMouseOut) node.props.onMouseOut(makeMouseEvent(node))
        node._hovered = isOver
        changed = true
      }

      // Dispatch mousedown/mouseup on edges
      if (isOver && justPressed) {
        pressedThisFrame = node
        pressOriginSet = true
        if (node.props.onMouseDown) node.props.onMouseDown(makeMouseEvent(node))
      }
      if (isOver && justReleased && node.props.onMouseUp) node.props.onMouseUp(makeMouseEvent(node))

      // Dispatch mousemove while hovered (only if pointer actually moved)
      if (isOver && pointerDirty && node.props.onMouseMove) node.props.onMouseMove(makeMouseEvent(node))

      if (node._active !== isDown) {
        node._active = isDown
        changed = true
      }
      if (isDown) newActiveNode = node

      // Bridge focus system → node._focused
      if (isFocusable) {
        const nodeFocusId = getNodeFocusId(node)
        const isFocused = nodeFocusId !== undefined && nodeFocusId === currentFocusId
        if (node._focused !== isFocused) {
          node._focused = isFocused
          changed = true
        }
      }
    }

    // onPress dispatch: detect click.
    // Scenarios:
    //   A) Normal: was active (prevActiveNode._active was true), now released while still hovered
    //   B) Fast click: press+release in same chunk — justPressed AND justReleased both true
    //   C) Node recycled: SolidJS recreated nodes between press/release frames.
    //      The pressed node is gone. Use pressOrigin position to find the currently
    //      hovered node at release time.
    let clickTarget: TGENode | null = null
    if (prevActiveNode && !prevActiveNode._active && prevActiveNode._hovered) {
      clickTarget = prevActiveNode // Scenario A: classic release
    } else if (justPressed && justReleased) {
      clickTarget = pressedThisFrame // Scenario B: fast click
    } else if (justReleased && pressOriginSet) {
      // Scenario C: find hovered node at release position
      const hovered = hoveredPressTarget
      if (hovered) clickTarget = hovered
    }
    if (justReleased) pressOriginSet = false

    if (clickTarget) {
      // Bubbles up the tree like DOM events. Each node with onPress/focusable
      // gets a chance to handle the event. Call event.stopPropagation() in an
      // onPress handler to prevent further bubbling.
      changed = true // Focus/press change — needs repaint
      const event = createPressEvent()
      let target: TGENode | null = clickTarget

      while (target && !event.propagationStopped) {
        // Focus: first focusable ancestor wins (like browser)
        if (target.props.focusable && !event.propagationStopped) {
          const fid = getNodeFocusId(target)
          if (fid) setFocusedId(fid)
        }
        // Dispatch onPress if present
        if (target.props.onPress) {
          target.props.onPress(event)
        }
        target = target.parent
      }
    }
    // After click dispatch, focus may have changed — update _focused on all
    // focusable nodes so the re-layout in the same frame sees the correct state.
    if (clickTarget) {
      const newFocusId = focusedId()
      if (newFocusId !== currentFocusId) {
        for (const node of rectNodes) {
          if (!node.props.focusable) continue
          const nodeFocusId = getNodeFocusId(node)
          const isFocused = nodeFocusId !== undefined && nodeFocusId === newFocusId
          if (node._focused !== isFocused) {
            node._focused = isFocused
          }
        }
      }
    }

    prevActiveNode = newActiveNode

    // Auto-release pointer capture on button release
    if (justReleased && capturedNodeId !== 0) {
      capturedNodeId = 0
    }

    pointerDirty = false

    // If any state changed, mark dirty to trigger repaint next frame
    if (changed) {
      markDirty()
      markAllDirty()
    }
    return !!clickTarget
  }

  // ── Frame rendering ──

  function getLayerKeyForNode(node: TGENode) {
    let target: TGENode | null = node
    while (target) {
      if (target.props.layer === true) {
        return `layer:${target.id}`
      }
      target = target.parent
    }
    return "bg"
  }

  function computeSubtreeTransformQuad(node: TGENode) {
    if (!node._transform) return null
    const layout = node.layout
    const chain: TGENode[] = []
    let current: TGENode | null = node
    while (current) {
      if (current._transform) chain.push(current)
      current = current.parent
    }
    chain.reverse()

    const transformAbsolutePoint = (x: number, y: number) => {
      let point = { x, y }
      for (const target of chain) {
        const l = target.layout
        const absolute = multiply(multiply(translate(l.x, l.y), target._transform!), translate(-l.x, -l.y))
        point = transformPoint(absolute, point.x, point.y)
      }
      return point
    }

    const x = layout.x
    const y = layout.y
    const w = layout.width
    const h = layout.height
    return {
      p0: transformAbsolutePoint(x, y),
      p1: transformAbsolutePoint(x + w, y),
      p2: transformAbsolutePoint(x, y + h),
      p3: transformAbsolutePoint(x + w, y + h),
    }
  }

  /** Paint a single frame with layer compositing. */
  function frameLayered(profile?: FrameProfile) {
    const dirtyBeforeFrame = dirtyCount()
    let repaintedThisFrame = 0
    const layoutStart = DEBUG_CADENCE ? performance.now() : 0
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

    // Fire post-scroll hooks — components read Clay's updated scroll position here.
    // This runs AFTER Clay processes scroll but BEFORE walkTree evaluates JSX.
    if (postScrollCallbacks.length > 0) {
      for (const cb of postScrollCallbacks) cb()
    }

    // 1. Walk tree into Clay (first pass — feeds Clay, no counting)
    scrollSpeedCap = 0 // reset — will be set by walkTree if any node has scrollSpeed
    resetRenderGraphQueues(renderGraphQueues)
    textMeasureIndex = 0 // reset text measure counter
    textMetas.length = 0 // clear text metadata
      textMetaMap.clear()
      clay.resetTextMeasures() // reset C-side counter
      rectNodes.length = 0
      rectNodeById.clear()
      textNodes.length = 0
      boxNodes.length = 0
    clay.beginLayout()
    walkTree(root)
     let commands = clay.endLayout()

    // Write layout geometry back to TGENodes for ref access
    writeLayoutBack(commands)
    // Update hover/active states based on pointer position
    const hadClick = updateInteractiveStates()

    // If a click was dispatched (focus change or onPress callback), re-layout
    // so we paint the NEW state in the same frame. Without this, the visual
    // update would be delayed until the next frame tick (~33ms).
    // Only re-layout on clicks, NOT on hover changes (which happen every frame).
    if (hadClick) {
      scrollSpeedCap = 0
      resetRenderGraphQueues(renderGraphQueues)
      textMeasureIndex = 0
      textMetas.length = 0
      textMetaMap.clear()
      clay.resetTextMeasures()
      rectNodes.length = 0
      rectNodeById.clear()
      textNodes.length = 0
      boxNodes.length = 0
      clay.beginLayout()
      walkTree(root)
      commands = clay.endLayout()
      writeLayoutBack(commands)
    }

    if (profile) {
      profile.layoutMs = performance.now() - layoutStart
    }

    if (commands.length === 0) {
      clearDirty()
      return
    }

    const prepStart = DEBUG_CADENCE ? performance.now() : 0

    // 2. Find layer boundaries and assign commands
    nextZ = 0
    const boundaries: LayerBoundary[] = []
    findLayerBoundaries(root, "r", boundaries)
    const { bgSlot, contentSlots, slotBoundaryByKey } = assignLayersSpatial(commands, boundaries)

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
    renderDebug(`[frame:start] cmds=${commands.length} layers=${allSlots.length}`)

    if (profile) {
      profile.prepMs = performance.now() - prepStart
      profile.commands = commands.length
      profile.dirtyBefore = dirtyBeforeFrame
    }

    const beginSyncStart = DEBUG_CADENCE ? performance.now() : 0
    term.beginSync()
    if (profile) {
      profile.beginSyncMs = performance.now() - beginSyncStart
    }

    // 3. Prepare frame/layer metadata once, then paint using the selected backend strategy.
    const frameStart = expFrameBudgetMs > 0 ? performance.now() : 0
    let frameBudgetExceeded = false
    const layerOrder: Layer[] = []
    const preparedSlots: PreparedLayerSlot[] = []
    const paintStart = DEBUG_CADENCE ? performance.now() : 0
    let ioMs = 0

    for (const slot of allSlots) {
      if (slot.cmdIndices.length === 0) continue

      if (expFrameBudgetMs > 0 && !frameBudgetExceeded && slot.z >= 0) {
        const elapsed = performance.now() - frameStart
        if (elapsed > expFrameBudgetMs) {
          log(`  [FRAME BUDGET] ${elapsed.toFixed(1)}ms > ${expFrameBudgetMs}ms — deferring remaining layers`)
          frameBudgetExceeded = true
        }
      }
      if (frameBudgetExceeded && slot.z >= 0) {
        const deferLayer = layerCache.get(slot.key)
        if (deferLayer) deferLayer.dirty = true
        continue
      }

      const layer = getOrCreateLayer(slot.key, slot.z)
      const previousRect = getPreviousLayerRect(layer)
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      let hasScissor = false
      let scissorX = 0
      let scissorY = 0
      let scissorR = 0
      let scissorB = 0

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
        for (const idx of slot.cmdIndices) {
          const cmd = commands[idx]
          if (!cmd) continue
          if (cmd.type !== CMD.RECTANGLE && cmd.type !== CMD.BORDER) continue
          const cx = Math.round(cmd.x)
          const cy = Math.round(cmd.y)
          const cr = Math.round(cmd.x + cmd.width)
          const cb = Math.round(cmd.y + cmd.height)
          const overlapX = Math.abs(cx - scissorX) < 4 || Math.abs(cr - scissorR) < 4
          const overlapY = Math.abs(cy - scissorY) < 4 || Math.abs(cb - scissorB) < 4
          if (!overlapX || !overlapY) continue
          minX = Math.min(minX, cx)
          minY = Math.min(minY, cy)
          maxX = Math.max(maxX, cr)
          maxY = Math.max(maxY, cb)
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

      const isBg = slot.z < 0
      let lx = isBg ? 0 : Math.floor(minX)
      let ly = isBg ? 0 : Math.floor(minY)
      let lw = isBg ? (Math.round(commands[0].width) || viewportWidth) : (Math.ceil(maxX) - lx)
      let lh = isBg ? (Math.round(commands[0].height) || viewportHeight) : (Math.ceil(maxY) - ly)

      const boundary = slotBoundaryByKey.get(slot.key)
      const boundaryNode = boundary ? resolveNodeByPath(root, boundary.path) : null
      const freezeWhileInteracting = useLayerCompositing && shouldFreezeInteractionLayer(boundaryNode)
      const debugName = boundaryNode?.props.debugName ?? slot.key
      const shouldViewportClip = freezeWhileInteracting ? false : (boundaryNode?.props.viewportClip ?? true)
      const allowRegionalRepaint = canUseRegionalRepaint(boundaryNode, hasScissor, isBg)

      if (freezeWhileInteracting && boundaryNode && boundaryNode.kind !== "text" && boundaryNode.props.floating) {
        const layoutX = Math.round(boundaryNode.layout.x)
        const layoutY = Math.round(boundaryNode.layout.y)
        const layoutW = Math.round(boundaryNode.layout.width)
        const layoutH = Math.round(boundaryNode.layout.height)
        if (layoutW > 0 && layoutH > 0) {
          lx = layoutX
          ly = layoutY
          lw = layoutW
          lh = layoutH
        }
      }

      if (shouldViewportClip) {
        renderDebug(`[clip:before] slot=${slot.key} z=${slot.z} x=${lx} y=${ly} w=${lw} h=${lh} pw=${viewportWidth} ph=${viewportHeight}`)
        const clipLeft = Math.max(0, lx)
        const clipTop = Math.max(0, ly)
        const clipRight = Math.min(viewportWidth, lx + lw)
        const clipBottom = Math.min(viewportHeight, ly + lh)

        if (clipLeft >= clipRight || clipTop >= clipBottom) {
          renderDebug(`[clip:skip] slot=${slot.key} z=${slot.z} x=${lx} y=${ly} w=${lw} h=${lh}`)
          if (slot.z >= 0) layerComposer!.removeLayer(imageIdForLayer(layer))
          layer.dirty = false
          continue
        }

        lx = clipLeft
        ly = clipTop
        lw = clipRight - clipLeft
        lh = clipBottom - clipTop
        renderDebug(`[clip:after] slot=${slot.key} z=${slot.z} x=${lx} y=${ly} w=${lw} h=${lh}`)
      }

      updateLayerGeometry(layer, lx, ly, lw, lh, { moveOnly: false })
      if (DEBUG_DRAG_REPRO && boundaryNode?.props.debugName === "drag-target") {
        const prev = previousRect
          ? `prev=(${previousRect.x},${previousRect.y},${previousRect.width}x${previousRect.height})`
          : "prev=none"
        const damage = layer.damageRect
          ? `damage=(${layer.damageRect.x},${layer.damageRect.y},${layer.damageRect.width}x${layer.damageRect.height})`
          : "damage=none"
        dragReproDebug(`[prepare] slot=${slot.key} bounds=(${lx},${ly},${lw}x${lh}) layer=(${layer.x},${layer.y},${layer.width}x${layer.height}) ${prev} dirty=${layer.dirty ? 1 : 0} ${damage} freeze=${freezeWhileInteracting ? 1 : 0}`)
      }
      if (previousRect && layer.damageRect) {
        for (const lower of layerOrder) {
          markLayerDamaged(lower, layer.damageRect)
        }
      }
      layerOrder.push(layer)

      const bounds = { x: lx, y: ly, width: lw, height: lh }
      const clippedDamage = layer.damageRect ? intersectRect(layer.damageRect, bounds) : null
      const layerArea = lw * lh
      const damageArea = rectArea(clippedDamage)
      const useRegionalRepaint = !!(
        allowRegionalRepaint
        && clippedDamage
        && damageArea > 0
        && damageArea < layerArea * 0.4
      )
      if (layer.damageRect) {
        const damageMsg = clippedDamage
          ? `damage=${clippedDamage.width}x${clippedDamage.height}@(${clippedDamage.x},${clippedDamage.y}) area=${damageArea}/${layerArea}`
          : `damage=none area=0/${layerArea}`
        log(`  [${slot.key}|${debugName}] DAMAGE allow=${allowRegionalRepaint} ${damageMsg}`)
      }
      preparedSlots.push({
        slot,
        layer,
        debugName,
        bounds,
        dirtyRect: layer.damageRect,
        clippedDamage,
        isBackground: isBg,
        subtreeTransform: boundary?.hasSubtreeTransform && boundaryNode ? computeSubtreeTransformQuad(boundaryNode) : null,
        allowRegionalRepaint,
        useRegionalRepaint,
        freezeWhileInteracting,
      })
    }

    frameDirtyRects.length = 0
    let dirtyLayerCountForFrame = 0
    let dirtyPixelArea = 0
    for (const prepared of preparedSlots) {
      const dirtyRect = forceLayerRepaint
        ? prepared.bounds
        : (prepared.useRegionalRepaint && prepared.clippedDamage ? prepared.clippedDamage : prepared.layer.damageRect)
      const area = rectArea(dirtyRect)
      if (area <= 0 || !dirtyRect) continue
      frameDirtyRects.push(dirtyRect)
      dirtyLayerCountForFrame += 1
      dirtyPixelArea += area
    }
    const totalPixelArea = Math.max(1, viewportWidth * viewportHeight)
    const overlapPixelArea = sumOverlapArea(frameDirtyRects)
    const fullRepaint = forceLayerRepaint || dirtyPixelArea >= totalPixelArea * 0.85 || dirtyLayerCountForFrame >= preparedSlots.length
    const estimatedLayeredBytes = dirtyPixelArea * 4
      + dirtyLayerCountForFrame * (term.caps.transmissionMode === "direct" ? 2048 : 512)
    const estimatedFinalBytes = viewportWidth * viewportHeight * 4
    const backend = getActiveRendererBackend()
    const frameCtx: RendererBackendFrameContext = {
      viewportWidth,
      viewportHeight,
      dirtyLayerCount: dirtyLayerCountForFrame,
      layerCount: preparedSlots.length,
      dirtyPixelArea,
      totalPixelArea,
      overlapPixelArea,
      overlapRatio: totalPixelArea > 0 ? overlapPixelArea / totalPixelArea : 0,
      fullRepaint,
      useLayerCompositing,
      hasSubtreeTransforms: preparedSlots.some((prepared) => !!prepared.subtreeTransform),
      hasActiveInteraction: preparedSlots.some((prepared) => prepared.freezeWhileInteracting),
      transmissionMode: term.caps.transmissionMode,
      estimatedLayeredBytes,
      estimatedFinalBytes,
    }
    const framePlan = backend.beginFrame?.(frameCtx)
    let rendererOutput: string | null = useLayerCompositing ? "buffer" : "buffer"
    let moveOnlyCount = 0
    let moveFallbackCount = 0
    let stableReuseCount = 0

    for (const prepared of preparedSlots) {
      const slot = prepared.slot
      const layer = prepared.layer
      const lx = prepared.bounds.x
      const ly = prepared.bounds.y
      const lw = prepared.bounds.width
      const lh = prepared.bounds.height
      const clippedDamage = prepared.clippedDamage
      const useRegionalRepaint = prepared.useRegionalRepaint
      const freezeWhileInteracting = prepared.freezeWhileInteracting

      if (lw > 0 && lh > 0) {
        const layerCtx: RendererBackendLayerContext = {
          key: slot.key,
          z: layer.z,
          backing: layer.backing,
          subtreeTransform: prepared.subtreeTransform,
          isBackground: prepared.isBackground,
          bounds: prepared.bounds,
          dirtyRect: prepared.layer.damageRect,
          repaintRect: useRegionalRepaint ? clippedDamage : prepared.layer.damageRect,
          allowRegionalRepaint: prepared.allowRegionalRepaint,
          retainedDuringInteraction: freezeWhileInteracting,
        }

        const canReuseStableLayer = !freezeWhileInteracting && !forceLayerRepaint && !useRegionalRepaint && !layer.dirty && !prepared.layer.damageRect
        if (freezeWhileInteracting && !canReuseStableLayer) {
          const damage = prepared.layer.damageRect
            ? `${prepared.layer.damageRect.width}x${prepared.layer.damageRect.height}@(${prepared.layer.damageRect.x},${prepared.layer.damageRect.y})`
            : "none"
          log(`  [${slot.key}|${prepared.debugName}] DRAG-BLOCK reuse=${canReuseStableLayer ? 1 : 0} strategy=${framePlan?.strategy ?? "none"} force=${forceLayerRepaint ? 1 : 0} regional=${useRegionalRepaint ? 1 : 0} dirty=${layer.dirty ? 1 : 0} damage=${damage} prev=(${layer.prevX},${layer.prevY},${layer.prevW}x${layer.prevH}) next=(${layer.x},${layer.y},${layer.width}x${layer.height}) z=${layer.prevZ}->${layer.z}`)
        }
        if (canReuseStableLayer) {
          const geometryChanged = layer.x !== layer.prevX || layer.y !== layer.prevY || layer.z !== layer.prevZ
          const renderZ = layer.z
          const needsPlacementRefresh = false
          if (freezeWhileInteracting) {
            log(`  [${slot.key}|${prepared.debugName}] DRAG-CHECK geometry=${geometryChanged ? 1 : 0} strategy=${framePlan?.strategy ?? "none"} placement=${needsPlacementRefresh ? 1 : 0} prev=(${layer.prevX},${layer.prevY}) next=(${layer.x},${layer.y}) z=${layer.prevZ}->${layer.z}`)
          }
          if (needsPlacementRefresh) {
            const moved = layerComposer?.placeLayer(imageIdForLayer(layer), lx, ly, renderZ, cellW, cellH) === true
            if (moved) {
              rendererOutput = "layered-raw"
              moveOnlyCount++
              log(`  [${slot.key}|${prepared.debugName}] MOVE-ONLY ${lw}x${lh} at (${lx},${ly}) z=${renderZ} interaction=drag`)
              markLayerClean(layer)
              continue
            }
          }
          if (needsPlacementRefresh) {
            moveFallbackCount++
            log(`  [${slot.key}|${prepared.debugName}] MOVE-FALLBACK repaint establish layered placement`)
          } else {
            const reused = backend.reuseLayer?.({
              frame: frameCtx,
              layer: layerCtx,
            }) === true
            if (reused) {
              stableReuseCount++
              if (framePlan?.strategy === "final-frame-raw") rendererOutput = "final-frame-raw"
              else if (framePlan?.strategy === "layered-raw") rendererOutput = "layered-raw"
              log(`  [${slot.key}|${prepared.debugName}] REUSE (stable layer)`)
              markLayerClean(layer)
              continue
            }
          }
        }

        const layerCommands: RenderCommand[] = []
        for (const idx of slot.cmdIndices) {
          const cmd = commands[idx]
          if (!cmd) continue
          if (useRegionalRepaint && clippedDamage && !commandIntersectsRect(cmd, clippedDamage)) continue
          layerCommands.push(cmd)
        }

        const paintResult = paintCommandsWithRendererBackend({ width: lw, height: lh }, layerCommands, lx, ly, frameCtx, layerCtx, backend)
        const backendSkipPresent = paintResult?.output === "skip-present"
        const backendKittyPayload = paintResult?.output === "kitty-payload"
        if (backendSkipPresent) rendererOutput = paintResult?.strategy ?? framePlan?.strategy ?? "skip-present"
        if (backendKittyPayload) rendererOutput = "layered-raw"

        if (backendSkipPresent) {
          repaintedThisFrame++
          markLayerClean(layer)
          continue
        }

        if (backendKittyPayload && paintResult?.kittyPayload) {
          repaintedThisFrame++
          const renderZ = layer.z
          const imageId = imageIdForLayer(layer)
          if (DEBUG_DRAG_REPRO && prepared.debugName === "drag-target") {
            dragReproDebug(`[present] slot=${slot.key} changed=1 z=${renderZ} pos=(${lx},${ly}) size=${lw}x${lh} raw=1`)
          }
          if (useRegionalRepaint && clippedDamage) {
            log(`  [${slot.key}] REPAINT-REGION ${clippedDamage.width}x${clippedDamage.height} at (${clippedDamage.x},${clippedDamage.y}) within ${lw}x${lh} z=${renderZ}`)
          } else {
            log(`  [${slot.key}] REPAINT ${lw}x${lh} at (${lx},${ly}) z=${renderZ} (${(lw * lh * 4 / 1024).toFixed(0)}KB) cmds=${slot.cmdIndices.length}`)
          }
          const ioStart = DEBUG_CADENCE ? performance.now() : 0
          layerComposer!.renderLayerRaw(paintResult.kittyPayload.data, paintResult.kittyPayload.width, paintResult.kittyPayload.height, imageId, lx, ly, renderZ, cellW, cellH)
          if (DEBUG_CADENCE) ioMs += performance.now() - ioStart
          markLayerClean(layer)
          continue
        }

        throw new Error(`GPU-only renderer backend did not return a layer payload for ${slot.key}`)
      }
    }

    // 4. Clean up orphan layers (layers from previous frame that no longer exist)
    activeSlotKeys.clear()
    for (const prepared of preparedSlots) activeSlotKeys.add(prepared.slot.key)
    for (const [key, layer] of layerCache) {
      if (!activeSlotKeys.has(key)) {
        const ioStart = DEBUG_CADENCE ? performance.now() : 0
        layerComposer!.removeLayer(imageIdForLayer(layer))
        if (DEBUG_CADENCE) ioMs += performance.now() - ioStart
        removeLayer(layer)
        layerCache.delete(key)
      }
    }

    const frameResult = backend.endFrame?.(frameCtx)
    if (frameResult?.output === "final-frame-raw" && frameResult.finalFrame) {
      rendererOutput = "final-frame-raw"
      const ioStart = DEBUG_CADENCE ? performance.now() : 0
      layerComposer!.renderFinalFrameRaw(
        frameResult.finalFrame.data,
        frameResult.finalFrame.width,
        frameResult.finalFrame.height,
        0,
        cellW,
        cellH,
      )
      if (DEBUG_CADENCE) ioMs += performance.now() - ioStart
    }

    if (profile) {
      const totalPaintMs = performance.now() - paintStart
      profile.ioMs = ioMs
      profile.paintMs = Math.max(0, totalPaintMs - ioMs)
    }

    const endSyncStart = DEBUG_CADENCE ? performance.now() : 0
    term.endSync()
    if (profile) {
      profile.endSyncMs = performance.now() - endSyncStart
      profile.repainted = repaintedThisFrame
    }
    const interaction = getLatestInteractionTrace()
    if (interaction.seq > lastPresentedInteractionSeq && repaintedThisFrame > 0) {
      lastPresentedInteractionSeq = interaction.seq
      lastPresentedInteractionLatencyMs = Math.max(0, performance.now() - interaction.at)
      lastPresentedInteractionType = interaction.kind
    }
    const resourceSummary = summarizeRendererResourceStats()
    debugUpdateStats({
      commandCount: commands.length,
      dirtyBeforeCount: dirtyBeforeFrame,
      layerCount: layerCount(),
      moveOnlyCount,
      moveFallbackCount,
      stableReuseCount,
      nodeCount: countNodes(root),
      repaintedCount: repaintedThisFrame,
      rendererStrategy: frameResult?.strategy ?? framePlan?.strategy ?? null,
      rendererOutput,
      transmissionMode: frameCtx.transmissionMode,
      estimatedLayeredBytes: frameCtx.estimatedLayeredBytes,
      estimatedFinalBytes: frameCtx.estimatedFinalBytes,
      interactionLatencyMs: lastPresentedInteractionLatencyMs,
      interactionType: lastPresentedInteractionType,
      presentedInteractionSeq: lastPresentedInteractionSeq,
      resourceBytes: resourceSummary.totalBytes,
      gpuResourceBytes: resourceSummary.gpuBytes,
      resourceEntries: resourceSummary.cacheEntries,
    })
    clearDirty()
  }

  /** Paint a frame — dispatches to layered or fallback based on backend. */
  function frame() {
    if (isRenderingFrame) return
    isRenderingFrame = true
    const frameStartedAt = performance.now()
    if (hasRecentInteraction()) lastInteractionFrameAt = frameStartedAt
    try {
      const profile: FrameProfile | undefined = DEBUG_CADENCE
        ? {
            scheduledIntervalMs,
            scheduledDelayMs,
            timerDelayMs: scheduledAtMs > 0 ? frameStartedAt - scheduledAtMs - scheduledDelayMs : 0,
            sincePrevFrameMs: lastFrameStartedAt > 0 ? frameStartedAt - lastFrameStartedAt : 0,
            layoutMs: 0,
            prepMs: 0,
            paintMs: 0,
            beginSyncMs: 0,
            ioMs: 0,
            endSyncMs: 0,
            totalMs: 0,
            commands: 0,
            repainted: 0,
            dirtyBefore: 0,
          }
        : undefined
      lastFrameStartedAt = frameStartedAt
      const finishDebugFrame = debugFrameStart()
      frameLayered(profile)
      finishDebugFrame()
      if (profile) {
        profile.totalMs = performance.now() - frameStartedAt
        cadenceDebug(
          `[frame] dt=${profile.sincePrevFrameMs.toFixed(2)}ms interval=${profile.scheduledIntervalMs.toFixed(2)}ms delay=${profile.scheduledDelayMs.toFixed(2)}ms timerDelay=${profile.timerDelayMs.toFixed(2)}ms total=${profile.totalMs.toFixed(2)}ms layout=${profile.layoutMs.toFixed(2)}ms prep=${profile.prepMs.toFixed(2)}ms paint=${profile.paintMs.toFixed(2)}ms io=${profile.ioMs.toFixed(2)}ms beginSync=${profile.beginSyncMs.toFixed(2)}ms endSync=${profile.endSyncMs.toFixed(2)}ms dirty=${profile.dirtyBefore} repainted=${profile.repainted} cmds=${profile.commands}`,
        )
      }
    } finally {
      isRenderingFrame = false
      if (pendingInteractionFrameKind && !isSuspended && isDirty()) {
        const kind = pendingInteractionFrameKind
        pendingInteractionFrameKind = null
        nudgeInteraction(kind)
      } else {
        pendingInteractionFrameKind = null
      }
    }
  }

  /** Resize handler */
  const unsubResize = term.onResize((size) => {
    const newW = size.pixelWidth || size.cols * (size.cellWidth || 8)
    const newH = size.pixelHeight || size.rows * (size.cellHeight || 16)
    resizeDebug(`handler cols=${size.cols} rows=${size.rows} pw=${size.pixelWidth} ph=${size.pixelHeight} cw=${size.cellWidth} ch=${size.cellHeight} newW=${newW} newH=${newH} timer=${timer ? 1 : 0} suspended=${isSuspended ? 1 : 0}`)
    viewportWidth = newW
    viewportHeight = newH
    clay.setDimensions(newW, newH)
    root.props.width = newW
    root.props.height = newH
    root._widthSizing = parseSizing(newW)
    root._heightSizing = parseSizing(newH)

    layerComposer!.clear()
    resetLayers()
    layerCache.clear()
    markDirty()
    markAllDirty()
    markInteractionActive()
    resizeDebug(`dirty marked newW=${newW} newH=${newH}`)

    if (isSuspended || timer === null) {
      resizeDebug(`skip immediate frame suspended=${isSuspended ? 1 : 0} timer=${timer ? 1 : 0}`)
      return
    }
    clearTimeout(timer)
    timer = null
    scheduledDelayMs = 0
    nextFrameDeadlineMs = 0
    resizeDebug(`forcing immediate frame newW=${newW} newH=${newH}`)
    frame()
    scheduleNextFrame()
    resizeDebug(`rescheduled after resize interval=${scheduledIntervalMs} delay=${scheduledDelayMs}`)
  })

  return {
    root,
      feedScroll,
      feedPointer,
      nudgeInteraction,
      requestInteractionFrame,

    needsPointerRepaint() {
      if (capturedNodeId !== 0) return true
      return hasPointerReactiveNodes(root)
    },

    setPointerCapture(nodeId: number) {
      capturedNodeId = nodeId
    },

    releasePointerCapture(nodeId: number) {
      if (capturedNodeId === nodeId) capturedNodeId = 0
    },

    onPostScroll(cb: () => void) {
      postScrollCallbacks.push(cb)
      return () => {
        const idx = postScrollCallbacks.indexOf(cb)
        if (idx >= 0) postScrollCallbacks.splice(idx, 1)
      }
    },

    start() {
      frame() // initial render
      nextFrameDeadlineMs = 0
      scheduleNextFrame()
    },

    stop() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      scheduledDelayMs = 0
      nextFrameDeadlineMs = 0
    },

    frame,

    markNodeLayerDamaged(nodeId: number, rect?: DamageRect) {
      const node = nodeRefById.get(nodeId)
      if (!node) return
      const key = getLayerKeyForNode(node)
      const layer = layerCache.get(key)
      if (!layer) return
      if (rect) markLayerDamaged(layer, rect)
      else layer.dirty = true
      markDirty()
    },

    suspend() {
      if (isSuspended) return
      isSuspended = true
      // Stop the render loop first
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      scheduledDelayMs = 0
      nextFrameDeadlineMs = 0
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
      nextFrameDeadlineMs = 0
      scheduleNextFrame()
    },

    suspended() {
      return isSuspended
    },

    destroy() {
      if (timer) clearTimeout(timer)
      scheduledDelayMs = 0
      nextFrameDeadlineMs = 0
      unsubResize()
      if (layerComposer) layerComposer.destroy()
      resetLayers()
      layerCache.clear()
      clay.destroy()
    },
  }
}
