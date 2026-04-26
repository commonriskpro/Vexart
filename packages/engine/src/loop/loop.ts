/**
 * loop.ts — Render loop coordinator.
 *
 * Owns scheduling, state, and the public RenderLoop API.
 * Delegates each frame to compositeFrame() in composite.ts.
 *
 * Architecture (per design.md §Coordinator):
 *   scheduleNextFrame → frame() → compositeFrame(state)
 *     → walkTree → layout → assignLayers → paint → composite
 */

// NOTE: All console.log/warn/error calls in production code paths should be
// gated behind env vars (VEXART_DEBUG_*, VEXART_LOG_*). Ungated logging at
// 60fps causes measurable I/O overhead.

import type { Terminal } from "../terminal/index"
import { createLayerComposer } from "../output/layer-composer"
import { type TGENode, createNode, parseSizing } from "../ffi/node"
import { createVexartLayoutCtx } from "./layout-adapter"

const layoutAdapter = createVexartLayoutCtx()
import { DIRTY_KIND, markDirty as globalMarkDirty, isDirty as globalIsDirty, clearDirty as globalClearDirty, dirtyVersion as globalDirtyVersion, onGlobalDirty, type DirtyScope } from "../reconciler/dirty"
import { hasActiveAnimations } from "./animation"
import { appendFileSync } from "node:fs"
import { debugFrameStart, debugRecordFfiCounts } from "./debug"
import { type Layer, createLayerStore } from "../ffi/layers"
import { type DamageRect } from "../ffi/damage"
import { createGpuRendererBackend } from "../ffi/gpu-renderer-backend"
import { createGpuFrameComposer } from "../output/gpu-frame-composer"
import { createRenderGraphQueues, type TextMeta } from "../ffi/render-graph"
import { getRendererBackend, setRendererBackend, type RendererBackend } from "../ffi/renderer-backend"
import {
  boostWindowFor as schedulerBoostWindowFor,
  hasRecentInteraction as schedulerHasRecentInteraction,
  type InteractionKind,
} from "./frame-scheduler"
import { bindLayerDirtyStore, compositeFrame, type CompositeFrameState, type FrameProfile } from "./composite"
import type { LayerBoundary } from "./types"
import { createFrameScheduler } from "../scheduler/index"
import {
  disableNativeLayerRegistry,
  enableNativeLayerRegistry,
  nativeLayerRegistryForcedOffReason,
  isNativeLayerRegistryForcedOff,
} from "../ffi/native-layer-registry-flags"
import { clearNativeLayerRegistryMirror } from "../ffi/native-layer-registry"
import { disableNativePresentation, enableNativePresentation, isNativePresentationEnabled, isNativePresentationForcedOff, nativePresentationForcedOffReason } from "../ffi/native-presentation-flags"
import { getVexartFfiCallCount, getVexartFfiCallCountsBySymbol, resetVexartFfiCallCounts } from "../ffi/vexart-bridge"

const LAYER_LOG_ENABLED = process.env.VEXART_DEBUG_LAYERS === "1"
const LOG = "/tmp/tge-layers.log"
const RENDER_DEBUG_LOG = "/tmp/tge-render-debug.log"
const CADENCE_LOG = "/tmp/tge-cadence.log"
const RESIZE_DEBUG_LOG = "/tmp/tge-resize.log"
const DRAG_REPRO_LOG = "/tmp/tge-drag-repro.log"
const DEBUG_CADENCE = process.env.VEXART_DEBUG_CADENCE === "1"
const DEBUG_RESIZE = process.env.VEXART_DEBUG_RESIZE === "1"
const DEBUG_DRAG_REPRO = process.env.VEXART_DEBUG_DRAG_REPRO === "1"

function log(msg: string) { if (!LAYER_LOG_ENABLED) return; appendFileSync(LOG, msg + "\n") }
function renderDebug(msg: string) { appendFileSync(RENDER_DEBUG_LOG, msg + "\n") }
function cadenceDebug(msg: string) { if (!DEBUG_CADENCE) return; appendFileSync(CADENCE_LOG, msg + "\n") }
function resizeDebug(msg: string) { if (!DEBUG_RESIZE) return; appendFileSync(RESIZE_DEBUG_LOG, `[renderer:loop] ${msg}\n`) }
function dragReproDebug(msg: string) { if (!DEBUG_DRAG_REPRO) return; appendFileSync(DRAG_REPRO_LOG, msg + "\n") }

type FrameProfileSink = (profile: FrameProfile) => void

let frameProfileSink: FrameProfileSink | null = null

export function setFrameProfileSink(sink: FrameProfileSink | null) {
  frameProfileSink = sink
}

function hasPointerReactiveNodes(node: TGENode): boolean {
  if (node.kind === "text") return false
  if (node.props.onMouseDown || node.props.onMouseUp || node.props.onMouseMove || node.props.onMouseOver || node.props.onMouseOut) return true
  if (node.props.hoverStyle || node.props.activeStyle || node.props.onPress) return true
  return node.children.some((child) => hasPointerReactiveNodes(child))
}

// ── Module-level shared state ──
const textMetaMap = new Map<number, TextMeta>()
  const renderGraphQueues = createRenderGraphQueues()
  const frameDirtyRects: DamageRect[] = []
  const pendingNodeDamageRects: Array<{ nodeId: number; rect: DamageRect }> = []
  const activeSlotKeys = new Set<string>()

/** @public */
export type RenderLoopOptions = {
  experimental?: {
    frameBudgetMs?: number
    maxFps?: number
    idleMaxFps?: number
    interactionMaxFps?: number
    forceLayerRepaint?: boolean
    nativePresentation?: boolean
    nativeLayerRegistry?: boolean
  }
}

/** @public */
export type RenderLoop = {
  root: TGENode
  start: () => void
  stop: () => void
  frame: () => void
  feedScroll: (dx: number, dy: number) => void
  feedPointer: (x: number, y: number, down: boolean) => void
  nudgeInteraction: (kind: "pointer" | "scroll" | "key") => void
  requestInteractionFrame: (kind: "pointer" | "scroll" | "key") => void
  needsPointerRepaint: () => boolean
  setPointerCapture: (nodeId: number) => void
  releasePointerCapture: (nodeId: number) => void
  onPostScroll: (cb: () => void) => () => void
  markNodeLayerDamaged: (nodeId: number, rect?: DamageRect) => void
  suspend: () => void
  resume: () => void
  suspended: () => boolean
  /** Schedule a task to run during frame budget drain. Returns cancel function. */
  scheduleTask: (priority: "user-blocking" | "user-visible" | "background", fn: () => void) => () => void
  destroy: () => void
}

/** @public */
export function createRenderLoop(term: Terminal, opts?: RenderLoopOptions): RenderLoop {
  // Use the global dirty tracker shared with reconciler + mount.
  // The reconciler calls markDirty() on every DOM change; mount calls it on input.
  // Using a separate tracker would make the loop blind to those events.
  const isDirty = globalIsDirty
  const clearDirty = globalClearDirty
  const layerStore = createLayerStore()
  const { createLayer, updateLayerGeometry, markLayerClean, imageIdForLayer, resetLayers, dirtyCount, layerCount, markLayerDamaged, getPreviousLayerRect, removeLayer } = layerStore
  const markAllDirty = layerStore.markAllDirty

  const markDirty = globalMarkDirty
  const expFrameBudgetMs = opts?.experimental?.frameBudgetMs ?? 0

  if (!term.caps.kittyGraphics) throw new Error("Vexart GPU-only renderer requires a terminal with Kitty graphics support")
  const nativePresentationRequested = opts?.experimental?.nativePresentation !== false
  if (!nativePresentationRequested) {
    disableNativePresentation("nativePresentation disabled by render loop option")
  } else if (isNativePresentationForcedOff()) {
    disableNativePresentation(nativePresentationForcedOffReason() ?? "native presentation forced off")
  } else if (term.caps.transmissionMode === "shm") {
    enableNativePresentation("terminal probe selected SHM transport")
  } else {
    disableNativePresentation(`native presentation requires SHM transport, got ${term.caps.transmissionMode}`)
  }

  const nativeLayerRegistryRequested = opts?.experimental?.nativeLayerRegistry !== false
  if (!nativeLayerRegistryRequested) {
    disableNativeLayerRegistry("nativeLayerRegistry disabled by render loop option")
  } else if (isNativeLayerRegistryForcedOff()) {
    disableNativeLayerRegistry(nativeLayerRegistryForcedOffReason() ?? "nativeLayerRegistry forced off")
  } else if (nativePresentationRequested && term.caps.transmissionMode === "shm") {
    enableNativeLayerRegistry()
  } else {
    disableNativeLayerRegistry("nativeLayerRegistry requires native presentation with SHM transport")
  }

  const root = createNode("root")
  let viewportWidth = term.size.pixelWidth || term.size.cols * (term.size.cellWidth || 8)
  let viewportHeight = term.size.pixelHeight || term.size.rows * (term.size.cellHeight || 16)
  root.props = { width: viewportWidth, height: viewportHeight }
  root._widthSizing = parseSizing(viewportWidth)
  root._heightSizing = parseSizing(viewportHeight)
  layoutAdapter.init(viewportWidth, viewportHeight)

  const layerComposer = isNativePresentationEnabled()
    ? null
    : createGpuFrameComposer(createLayerComposer(term.write, term.rawWrite, term.caps.transmissionMode, "auto"))
  let timer: ReturnType<typeof setTimeout> | null = null
  const maxFps = opts?.experimental?.maxFps ?? 60
  const idleMaxFps = opts?.experimental?.idleMaxFps ?? Math.min(maxFps, 60)
  const interactionMaxFps = opts?.experimental?.interactionMaxFps ?? Math.min(maxFps, 60)
  const forceLayerRepaint = opts?.experimental?.forceLayerRepaint === true
  const idleFps = Math.max(1, Math.min(idleMaxFps, maxFps))
  const interactionFps = Math.max(1, Math.min(interactionMaxFps, maxFps))
  const idleInterval = Math.max(Math.round(1000 / idleFps), 8)
  const activeInterval = Math.max(Math.round(1000 / maxFps), 8)
  const interactionInterval = Math.max(Math.round(1000 / interactionFps), 8)
  const keyInteractionBoostMs = 220
  const scrollInteractionBoostMs = 320
  const pointerInteractionBoostMs = 520
  const interactionNudgeDelayMs = 4
  let isSuspended = false
  let scheduledIntervalMs = 0
  let scheduledDelayMs = 0
  let scheduledAtMs = 0
  let lastFrameStartedAt = 0
  let nextFrameDeadlineMs = 0
  let interactionBoostUntilMs = performance.now()
  let lastInteractionFrameAt = 0
  let loopStarted = false
  let isRenderingFrame = false
  let pendingInteractionFrameKind: InteractionKind | null = null

  // ── Stable state objects passed by reference into compositeFrame ──
  const scroll = { x: 0, y: 0 }
  const pointer = { x: viewportWidth / 2, y: viewportHeight / 2, down: false, dirty: true, pendingPress: false, pendingRelease: false, capturedNodeId: 0, pressOriginSet: false, prevActiveNode: null as TGENode | null }
  const walkCounters = { scrollIdCounter: 0, textMeasureIndex: 0, scrollSpeedCap: 0 }
  const rectNodes: TGENode[] = []
  const textNodes: TGENode[] = []
  const boxNodes: TGENode[] = []
  const textMetas: TextMeta[] = []
  const nodePathById = new Map<number, string>()
  const nodeRefById = new Map<number, TGENode>()
  const rectNodeById = new Map<number, TGENode>()
  const layerBoundaries: LayerBoundary[] = []
  const scrollContainers: TGENode[] = []
  const nodeCountValue = { value: 0 }
  const layerCache = new Map<string, Layer>()
  bindLayerDirtyStore(layerCache)
  const postScrollCallbacks: (() => void)[] = []
  const lastPresentedInteractionSeq = { value: 0 }
  const lastPresentedInteractionLatencyMs = { value: 0 }
  const lastPresentedInteractionType = { value: null as string | null }
  const lastFrameTime = { value: Date.now() }

  // ── Frame budget scheduler (Slice 3.4) ──
  const scheduler = createFrameScheduler()

  const defaultGpuRendererBackend = createGpuRendererBackend()
  if (!getRendererBackend()) setRendererBackend(defaultGpuRendererBackend)
  const getActiveBackend = (): RendererBackend => getRendererBackend() ?? defaultGpuRendererBackend

  function getOrCreateLayer(key: string, z: number): Layer {
    const existing = layerCache.get(key)
    if (existing) { existing.z = z; return existing }
    const layer = createLayer(z)
    layerCache.set(key, layer)
    return layer
  }

  function boostFor(kind: InteractionKind) {
    return schedulerBoostWindowFor(kind, { key: keyInteractionBoostMs, scroll: scrollInteractionBoostMs, pointer: pointerInteractionBoostMs })
  }

  function markInteractionActive(kind: InteractionKind = "pointer") {
    interactionBoostUntilMs = Math.max(interactionBoostUntilMs, performance.now() + boostFor(kind))
  }

  function hasRecentInteraction() {
    return schedulerHasRecentInteraction(performance.now(), interactionBoostUntilMs, pointer.capturedNodeId, pointer.down)
  }

  function scheduleNextFrame() {
    if (isSuspended || !loopStarted) return
    if (timer !== null) { clearTimeout(timer); timer = null }
    if (!isDirty() && !hasActiveAnimations()) return
    const interval = (hasActiveAnimations() || hasRecentInteraction()) ? activeInterval : idleInterval
    const now = performance.now()
    if (nextFrameDeadlineMs === 0 || scheduledIntervalMs !== interval) {
      nextFrameDeadlineMs = now + interval
    } else {
      nextFrameDeadlineMs += interval
      if (nextFrameDeadlineMs < now) nextFrameDeadlineMs = now
    }
    scheduledIntervalMs = interval
    scheduledAtMs = now
    scheduledDelayMs = Math.max(0, nextFrameDeadlineMs - now)
    timer = setTimeout(() => { timer = null; try { if (isDirty() || hasActiveAnimations()) frame() } catch (e) { console.error("[vexart] frame error:", e) } scheduleNextFrame() }, scheduledDelayMs)
  }

  function nudgeInteraction(kind: InteractionKind) {
    markInteractionActive(kind)
    if (isSuspended || timer === null || !isDirty()) return
    const now = performance.now()
    const wait = Math.max(0, interactionInterval - (now - lastInteractionFrameAt))
    const targetDelay = Math.max(kind === "pointer" ? 0 : kind === "scroll" ? 1 : interactionNudgeDelayMs, wait)
    if (scheduledDelayMs <= targetDelay + 1) return
    clearTimeout(timer)
    timer = null
    scheduledDelayMs = targetDelay
    scheduledAtMs = now
    nextFrameDeadlineMs = now + targetDelay
    timer = setTimeout(() => { try { if (isDirty()) frame() } catch (e) { console.error("[vexart] frame error:", e) } scheduleNextFrame() }, targetDelay)
  }

  function requestInteractionFrame(kind: InteractionKind) {
    markInteractionActive(kind)
    if (isSuspended || !isDirty()) return
    pendingInteractionFrameKind = kind
    if (!isRenderingFrame) nudgeInteraction(kind)
  }

  function wakeForDirty(kind: InteractionKind = "pointer") {
    if (!loopStarted || isSuspended || !isDirty()) return
    markInteractionActive(kind)
    if (isRenderingFrame) {
      pendingInteractionFrameKind = pendingInteractionFrameKind ?? kind
      return
    }
    if (timer === null) {
      scheduledDelayMs = 0
      scheduledAtMs = performance.now()
      nextFrameDeadlineMs = scheduledAtMs
      timer = setTimeout(() => { try { if (isDirty()) frame() } catch (e) { console.error("[vexart] frame error:", e) } scheduleNextFrame() }, 0)
      return
    }
    nudgeInteraction(kind)
  }

  // When any caller (reconciler, mount, focus system) marks dirty via the
  // global tracker, also mark all GPU layers dirty so the paint phase does
  // not reuse stale cached layers, then wake the loop. This is essential for
  // Solid updates caused by event handlers running during a frame: the state
  // mutation may happen after the input nudge, so dirty itself must schedule
  // the follow-up repaint.
  const queueScopedNodeDamage = (scope: DirtyScope) => {
    if (scope.kind !== DIRTY_KIND.NODE_VISUAL || scope.nodeId === undefined) return false
    const node = nodeRefById.get(scope.nodeId)
    if (!node) return false
    const rect = scope.rect ?? (node.layout.width > 0 && node.layout.height > 0
      ? { x: node.layout.x - 32, y: node.layout.y - 32, width: node.layout.width + 64, height: node.layout.height + 64 }
      : null)
    if (!rect) return false
    pendingNodeDamageRects.push({ nodeId: scope.nodeId, rect })
    return true
  }

  const unsubGlobalDirty = onGlobalDirty((scope) => {
    if (scope.kind === DIRTY_KIND.FULL) {
      markAllDirty()
      log(`[DIRTY:FULL]`)
    } else if (scope.kind === DIRTY_KIND.NODE_VISUAL) {
      // Try scoped layer damage via the walk-tree node ref. If the node isn't
      // in nodeRefById (new node from reconciliation, or text child that walkTree
      // doesn't track individually), skip the markAllDirty fallback — the global
      // dirty flag is already set by the caller, so the frame loop will run
      // walkTree which discovers the new node and paints its layer.
      // markAllDirty for unresolved NODE_VISUAL was defeating layer caching
      // because every reactive update that inserts/removes nodes triggered it.
      queueScopedNodeDamage(scope)
      const node = scope.nodeId !== undefined ? nodeRefById.get(scope.nodeId) : undefined
      log(`[DIRTY:NODE_VISUAL] id=${scope.nodeId} key=${node?._layerKey ?? "null"} queued=${!!node}`)
    } else {
      log(`[DIRTY:${scope.kind}]`)
    }
    wakeForDirty("pointer")
  })

  function feedScroll(dx: number, dy: number) {
    scroll.x += dx; scroll.y += dy
    markInteractionActive("scroll")
    markDirty()
    nudgeInteraction("scroll")
  }

  function feedPointer(x: number, y: number, down: boolean) {
    const moved = x !== pointer.x || y !== pointer.y
    const changedDown = down !== pointer.down
    pointer.x = x; pointer.y = y
    if (moved || changedDown) markInteractionActive("pointer")
    if (down && !pointer.down) pointer.pendingPress = true
    if (!down && pointer.down) pointer.pendingRelease = true
    pointer.down = down
    pointer.dirty = true
    if (moved || changedDown) {
      markDirty({ kind: DIRTY_KIND.INTERACTION })
      nudgeInteraction("pointer")
    }
  }

  // ── Stable CompositeFrameState (built once, mutated each frame) ──
  const cs: CompositeFrameState = {
    root,
    viewportWidth,
    viewportHeight,
    term,
    layoutAdapter,
    scroll,
    pointer,
    postScrollCallbacks,
    walkCounters,
    rectNodes, textNodes, boxNodes, textMetas,
    textMetaMap, rectNodeById, nodePathById, nodeRefById,
    layerBoundaries, scrollContainers, nodeCountValue,
    renderGraphQueues,
    layerCache, activeSlotKeys, frameDirtyRects, pendingNodeDamageRects,
    getOrCreateLayer,
    getPreviousLayerRect, updateLayerGeometry, markLayerDamaged, markLayerClean, imageIdForLayer, removeLayer, layerCount,
    markDirty, markAllDirty, clearDirty, dirtyVersion: globalDirtyVersion, dirtyCount,
    layerComposer,
    backendOverride: getActiveBackend(),
    useLayerCompositing: true,
    forceLayerRepaint,
    expFrameBudgetMs,
    transmissionMode: term.caps.transmissionMode,
    debugCadence: DEBUG_CADENCE || !!frameProfileSink,
    debugDragRepro: DEBUG_DRAG_REPRO,
    lastPresentedInteractionSeq,
    lastPresentedInteractionLatencyMs,
    lastPresentedInteractionType,
    lastFrameTime,
    log,
    renderDebug,
    dragReproDebug,
  }

  function frame() {
    if (isRenderingFrame) return
    if (!isDirty() && !hasActiveAnimations() && !hasRecentInteraction() && pendingInteractionFrameKind === null) return
    isRenderingFrame = true
    const frameStartedAt = performance.now()
    if (hasRecentInteraction()) lastInteractionFrameAt = frameStartedAt
    try {
      const profile: FrameProfile | undefined = DEBUG_CADENCE || frameProfileSink
        ? { scheduledIntervalMs, scheduledDelayMs, timerDelayMs: scheduledAtMs > 0 ? frameStartedAt - scheduledAtMs - scheduledDelayMs : 0, sincePrevFrameMs: lastFrameStartedAt > 0 ? frameStartedAt - lastFrameStartedAt : 0, scrollMs: 0, walkTreeMs: 0, layoutComputeMs: 0, layoutWritebackMs: 0, interactionMs: 0, relayoutMs: 0, layoutMs: 0, layerAssignMs: 0, prepMs: 0, paintNativeSnapshotMs: 0, paintLayerPrepMs: 0, paintFrameContextMs: 0, paintBackendBeginMs: 0, paintReuseMs: 0, paintRenderGraphMs: 0, paintBackendPaintMs: 0, paintBackendCompositeMs: 0, paintBackendReadbackMs: 0, paintBackendNativeEmitMs: 0, paintBackendNativeReadbackMs: 0, paintBackendNativeCompressMs: 0, paintBackendNativeShmPrepareMs: 0, paintBackendNativeWriteMs: 0, paintBackendNativeRawBytes: 0, paintBackendNativePayloadBytes: 0, paintBackendUniformMs: 0, paintLayerCleanupMs: 0, paintBackendEndMs: 0, paintPresentationMs: 0, paintInteractionStatsMs: 0, paintMs: 0, beginSyncMs: 0, ioMs: 0, endSyncMs: 0, totalMs: 0, commands: 0, repainted: 0, dirtyBefore: 0 }
        : undefined
      lastFrameStartedAt = frameStartedAt
      // Update mutable viewport fields in cs (may change on resize)
      cs.viewportWidth = viewportWidth
      cs.viewportHeight = viewportHeight
      cs.backendOverride = getActiveBackend()
      cs.debugCadence = DEBUG_CADENCE || !!frameProfileSink
      resetVexartFfiCallCounts()
      const finishDebugFrame = debugFrameStart()
      compositeFrame(cs, profile)
      // Drain scheduler lanes in priority order after the main frame
      scheduler.drainFrame(expFrameBudgetMs > 0 ? expFrameBudgetMs : 12, () => !hasRecentInteraction() && !isDirty())
      debugRecordFfiCounts(getVexartFfiCallCount(), Object.fromEntries(getVexartFfiCallCountsBySymbol()))
      finishDebugFrame()
      if (profile) {
        profile.totalMs = performance.now() - frameStartedAt
        cadenceDebug(`[frame] dt=${profile.sincePrevFrameMs.toFixed(2)}ms interval=${profile.scheduledIntervalMs.toFixed(2)}ms delay=${profile.scheduledDelayMs.toFixed(2)}ms timerDelay=${profile.timerDelayMs.toFixed(2)}ms total=${profile.totalMs.toFixed(2)}ms scroll=${profile.scrollMs.toFixed(2)}ms walk=${profile.walkTreeMs.toFixed(2)}ms layoutCompute=${profile.layoutComputeMs.toFixed(2)}ms layoutWriteback=${profile.layoutWritebackMs.toFixed(2)}ms interaction=${profile.interactionMs.toFixed(2)}ms relayout=${profile.relayoutMs.toFixed(2)}ms layout=${profile.layoutMs.toFixed(2)}ms layerAssign=${profile.layerAssignMs.toFixed(2)}ms prep=${profile.prepMs.toFixed(2)}ms nativeSnapshot=${profile.paintNativeSnapshotMs.toFixed(2)}ms layerPrep=${profile.paintLayerPrepMs.toFixed(2)}ms frameCtx=${profile.paintFrameContextMs.toFixed(2)}ms backendBegin=${profile.paintBackendBeginMs.toFixed(2)}ms reuse=${profile.paintReuseMs.toFixed(2)}ms renderGraph=${profile.paintRenderGraphMs.toFixed(2)}ms backendPaint=${profile.paintBackendPaintMs.toFixed(2)}ms backendComposite=${profile.paintBackendCompositeMs.toFixed(2)}ms backendReadback=${profile.paintBackendReadbackMs.toFixed(2)}ms backendNativeEmit=${profile.paintBackendNativeEmitMs.toFixed(2)}ms backendNativeReadback=${profile.paintBackendNativeReadbackMs.toFixed(2)}ms backendNativeCompress=${profile.paintBackendNativeCompressMs.toFixed(2)}ms backendNativeShmPrepare=${profile.paintBackendNativeShmPrepareMs.toFixed(2)}ms backendNativeWrite=${profile.paintBackendNativeWriteMs.toFixed(2)}ms backendNativeRawBytes=${profile.paintBackendNativeRawBytes.toFixed(0)} backendNativePayloadBytes=${profile.paintBackendNativePayloadBytes.toFixed(0)} backendUniform=${profile.paintBackendUniformMs.toFixed(2)}ms layerCleanup=${profile.paintLayerCleanupMs.toFixed(2)}ms backendEnd=${profile.paintBackendEndMs.toFixed(2)}ms presentation=${profile.paintPresentationMs.toFixed(2)}ms interactionStats=${profile.paintInteractionStatsMs.toFixed(2)}ms paint=${profile.paintMs.toFixed(2)}ms io=${profile.ioMs.toFixed(2)}ms beginSync=${profile.beginSyncMs.toFixed(2)}ms endSync=${profile.endSyncMs.toFixed(2)}ms dirty=${profile.dirtyBefore} repainted=${profile.repainted} cmds=${profile.commands}`)
        frameProfileSink?.({ ...profile })
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

  const unsubResize = term.onResize((size) => {
    const newW = size.pixelWidth || size.cols * (size.cellWidth || 8)
    const newH = size.pixelHeight || size.rows * (size.cellHeight || 16)
    resizeDebug(`handler cols=${size.cols} rows=${size.rows} pw=${size.pixelWidth} ph=${size.pixelHeight} cw=${size.cellWidth} ch=${size.cellHeight} newW=${newW} newH=${newH} timer=${timer ? 1 : 0} suspended=${isSuspended ? 1 : 0}`)
    viewportWidth = newW; viewportHeight = newH
    layoutAdapter.setDimensions(newW, newH)
    root.props.width = newW; root.props.height = newH
    root._widthSizing = parseSizing(newW); root._heightSizing = parseSizing(newH)
    clearNativeLayerRegistryMirror()
    layerComposer?.clear(); resetLayers(); layerCache.clear()
    markDirty(); markAllDirty(); markInteractionActive()
    resizeDebug(`dirty marked newW=${newW} newH=${newH}`)
    if (isSuspended) { resizeDebug(`skip immediate frame suspended=${isSuspended ? 1 : 0} timer=${timer ? 1 : 0}`); return }
    if (timer !== null) { clearTimeout(timer); timer = null }
    scheduledDelayMs = 0; nextFrameDeadlineMs = 0
    resizeDebug(`forcing immediate frame newW=${newW} newH=${newH}`)
    if (!isRenderingFrame) {
      frame()
    }
    if (timer === null) scheduleNextFrame()
    resizeDebug(`rescheduled after resize interval=${scheduledIntervalMs} delay=${scheduledDelayMs}`)
  })

  return {
    root,
    feedScroll,
    feedPointer,
    nudgeInteraction,
    requestInteractionFrame,
    needsPointerRepaint() {
      if (pointer.capturedNodeId !== 0) return true
      return hasPointerReactiveNodes(root)
    },
    setPointerCapture(nodeId: number) {
      pointer.capturedNodeId = nodeId
    },
    releasePointerCapture(nodeId: number) {
      if (pointer.capturedNodeId === nodeId) pointer.capturedNodeId = 0
    },
    onPostScroll(cb: () => void) {
      postScrollCallbacks.push(cb)
      return () => { const idx = postScrollCallbacks.indexOf(cb); if (idx >= 0) postScrollCallbacks.splice(idx, 1) }
    },
    start() { loopStarted = true; frame(); nextFrameDeadlineMs = 0; scheduleNextFrame() },
    stop() { loopStarted = false; if (timer) { clearTimeout(timer); timer = null }; scheduledDelayMs = 0; nextFrameDeadlineMs = 0 },
    frame,
    markNodeLayerDamaged(nodeId: number, rect?: DamageRect) {
      const node = nodeRefById.get(nodeId)
      if (!node) return
      const layer = layerCache.get(node._layerKey ?? "bg")
      if (!layer) return
      if (rect) markLayerDamaged(layer, rect); else layer.dirty = true
      markDirty({ kind: DIRTY_KIND.NODE_VISUAL, nodeId, rect })
    },
    suspend() {
      if (isSuspended) return
      isSuspended = true
      if (timer) { clearTimeout(timer); timer = null }
      scheduledDelayMs = 0; nextFrameDeadlineMs = 0
      term.suspend()
    },
    resume() {
      if (!isSuspended) return
      isSuspended = false
      term.resume()
      clearNativeLayerRegistryMirror()
      markDirty(); markAllDirty()
      loopStarted = true
      frame(); nextFrameDeadlineMs = 0; scheduleNextFrame()
    },
    suspended() { return isSuspended },
    scheduleTask: scheduler.scheduleTask,
    destroy() {
      if (timer) clearTimeout(timer)
      scheduledDelayMs = 0; nextFrameDeadlineMs = 0
      unsubGlobalDirty()
      unsubResize()
      clearNativeLayerRegistryMirror()
      layerComposer?.destroy()
      getActiveBackend().destroy?.()
      resetLayers(); layerCache.clear()
      layoutAdapter.destroy()
    },
  }
}
