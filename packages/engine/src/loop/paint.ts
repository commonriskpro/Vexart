/**
 * paint.ts — Layer paint orchestration (layer prep + paint dispatch + cleanup).
 *
 * Extracted from loop.ts as part of Phase 3 Slice 2.3.
 * Design ref: openspec/changes/phase-3-loop-decomposition/design.md §paint
 *
 * Exports:
 *   - PreparedLayerSlot — per-slot metadata built during layer prep
 *   - PaintFrameState   — state bag threaded into paintFrame
 *   - paintFrame()      — orchestrates layer prep, paint dispatch, and cleanup
 */

import { CMD } from "../ffi/render-graph"
import type { RenderCommand } from "../ffi/render-graph"
import type { Layer } from "../ffi/layers"
import {
  intersectRect,
  rectArea,
  sumOverlapArea,
  type DamageRect,
} from "../ffi/damage"
import {
  getRendererBackend,
  type RendererBackend,
  type RendererBackendFrameContext,
  type RendererBackendLayerContext,
  type RendererBackendPaintResult,
} from "../ffi/renderer-backend"
import { buildRenderGraphFrame } from "../ffi/render-graph"
import { summarizeRendererResourceStats } from "../ffi/resource-stats"
import { getLatestInteractionTrace } from "./input"
import { shouldFreezeInteractionLayer } from "../reconciler/interaction"
import { multiply, translate, transformPoint } from "../ffi/matrix"
import { debugUpdateStats, isDebugEnabled } from "./debug"
import type { LayerBoundary, LayerSlot, LayerPlan, PaintResult } from "./types"
import type { TGENode } from "../ffi/node"
import type { GpuFrameComposer } from "../output/gpu-frame-composer"
import { isNativePresentationCapable } from "../ffi/native-presentation-flags"
import { nativeLayerRemove } from "../ffi/native-layer-registry"
import { nativeDeleteLayer, nativeEmitLayer } from "../ffi/native-presentation-ops"
import type { NativePresentationStats } from "../ffi/native-presentation-stats"

let lastNativeRenderGraphLayerCount = 0
let lastNativeRenderGraphOpCount = 0
let lastNativeRenderGraphFullyCoveredLayerCount = 0
let lastNativeRenderGraphFallbackOpCount = 0

export function getLastNativeRenderGraphUsage() {
  return {
    layerCount: lastNativeRenderGraphLayerCount,
    opCount: lastNativeRenderGraphOpCount,
    fullyCoveredLayerCount: lastNativeRenderGraphFullyCoveredLayerCount,
    fallbackOpCount: lastNativeRenderGraphFallbackOpCount,
  }
}

// ── PreparedLayerSlot ─────────────────────────────────────────────────────

/** Per-slot metadata computed during the layer prep pass. */
export type PreparedLayerSlot = {
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

export type PaintProfiler = {
  paintNativeSnapshotMs: number
  paintLayerPrepMs: number
  paintFrameContextMs: number
  paintBackendBeginMs: number
  paintReuseMs: number
  paintRenderGraphMs: number
  paintBackendPaintMs: number
  paintBackendCompositeMs: number
  paintBackendReadbackMs: number
  paintBackendNativeEmitMs: number
  paintBackendNativeReadbackMs: number
  paintBackendNativeCompressMs: number
  paintBackendNativeShmPrepareMs: number
  paintBackendNativeWriteMs: number
  paintBackendNativeRawBytes: number
  paintBackendNativePayloadBytes: number
  paintBackendUniformMs: number
  paintLayerCleanupMs: number
  paintBackendEndMs: number
  paintPresentationMs: number
  paintInteractionStatsMs: number
}

// ── PaintFrameState ───────────────────────────────────────────────────────

/**
 * Dependencies injected into paintFrame.
 * All mutable state lives in the coordinator (loop.ts); paintFrame reads and
 * writes through this bag but does not own any persistent state.
 */
export type PaintFrameState = {
  // Viewport
  viewportWidth: number
  viewportHeight: number

  // Terminal capabilities
  transmissionMode: "direct" | "file" | "shm"

  // Frame compositing flags
  useLayerCompositing: boolean
  forceLayerRepaint: boolean
  expFrameBudgetMs: number

  // Debug flags
  debugCadence: boolean
  debugDragRepro: boolean
  profile?: PaintProfiler

  // Layer store — injected methods (coordinator owns the store)
  getOrCreateLayer: (key: string, z: number) => Layer
  getPreviousLayerRect: (layer: Layer) => DamageRect | null
  updateLayerGeometry: (layer: Layer, x: number, y: number, w: number, h: number, opts: { moveOnly: boolean }) => void
  markLayerDamaged: (layer: Layer, rect: DamageRect) => void
  markLayerClean: (layer: Layer) => void
  imageIdForLayer: (layer: Layer) => number
  removeLayer: (layer: Layer) => void
  layerCount: () => number

  // Layer cache — coordinator-owned map
  layerCache: Map<string, Layer>
  activeSlotKeys: Set<string>

  // Frame dirty rects accumulator (cleared and rebuilt each frame)
  frameDirtyRects: DamageRect[]
  pendingNodeDamageRects: Array<{ nodeId: number; rect: DamageRect }>

  nodeRefById: Map<number, TGENode>

  // Render graph queues — for buildRenderGraphFrame
  renderGraphQueues: ReturnType<typeof import("../ffi/render-graph").createRenderGraphQueues>
  textMetaMap: Map<number, import("../ffi/render-graph").TextMeta>

  // GPU layer composer (Kitty output)
  layerComposer: GpuFrameComposer | null

  // Renderer backend (injected override or global)
  backendOverride?: RendererBackend

  // Interaction latency tracking (coordinator-owned scalars)
  lastPresentedInteractionSeq: { value: number }
  lastPresentedInteractionLatencyMs: { value: number }
  lastPresentedInteractionType: { value: string | null }

  // Debug log helpers
  log: (msg: string) => void
  renderDebug: (msg: string) => void
  dragReproDebug: (msg: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function collectLayerCommands(commands: RenderCommand[], cmdIndices: number[]) {
  const layerCommands: RenderCommand[] = []
  for (const idx of cmdIndices) {
    const cmd = commands[idx]
    if (!cmd) continue
    layerCommands.push(cmd)
  }
  return layerCommands
}

export function selectLayerRepaintRect(
  effectiveUseRegionalRepaint: boolean,
  clippedDamage: { x: number; y: number; width: number; height: number } | null,
) {
  return effectiveUseRegionalRepaint ? clippedDamage : null
}

export function selectLayerDirtyRect(
  layerDirty: boolean,
  damageRect: DamageRect | null,
  bounds: DamageRect,
) {
  if (damageRect) return damageRect
  return layerDirty ? bounds : null
}

export function hasDirtySubtreeTransforms(preparedSlots: PreparedLayerSlot[], forceLayerRepaint: boolean) {
  return preparedSlots.some((prepared) => {
    if (!prepared.subtreeTransform) return false
    if (forceLayerRepaint) return true
    return !!prepared.dirtyRect
  })
}

export function canUseRegionalRepaint(boundaryNode: TGENode | null, hasScissor: boolean, isBg: boolean): boolean {
  if (hasScissor) return false
  // The background slot is a monolithic layer containing all non-layered UI.
  // Regional repaint is unsafe here because a small dirty rect (for example a
  // focused titlebar) can still require re-presenting other overlapping window
  // content after z-order/focus changes. Until background commands are clipped
  // to the repaint rect or app windows become separate layer boundaries, repaint
  // and present the full bg layer for correctness.
  if (isBg) return false
  if (!boundaryNode || boundaryNode.kind === "text") return true
  if (boundaryNode.props.viewportClip === false) return false
  if (hasTransformInSubtree(boundaryNode)) return false
  return true
}

function hasTransformInSubtree(node: TGENode): boolean {
  if (node.kind === "text") return false
  if (node.props.transform) return true
  return node.children.some((child) => hasTransformInSubtree(child))
}

function applyBackendProfile(profile: PaintProfiler | undefined, backend: RendererBackend) {
  if (!profile) return
  const backendProfile = backend.drainProfile?.()
  if (!backendProfile) return
  profile.paintBackendCompositeMs += backendProfile.compositeMs
  profile.paintBackendReadbackMs += backendProfile.readbackMs
  profile.paintBackendNativeEmitMs += backendProfile.nativeEmitMs
  profile.paintBackendNativeReadbackMs += backendProfile.nativeReadbackMs
  profile.paintBackendNativeCompressMs += backendProfile.nativeCompressMs
  profile.paintBackendNativeShmPrepareMs += backendProfile.nativeShmPrepareMs
  profile.paintBackendNativeWriteMs += backendProfile.nativeWriteMs
  profile.paintBackendNativeRawBytes += backendProfile.nativeRawBytes
  profile.paintBackendNativePayloadBytes += backendProfile.nativePayloadBytes
  profile.paintBackendUniformMs += backendProfile.uniformUpdateMs
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

function applyPendingNodeDamage(
  layer: Layer,
  slot: LayerSlot,
  commands: RenderCommand[],
  pendingNodeDamageRects: Array<{ nodeId: number; rect: DamageRect }>,
  markLayerDamaged: (layer: Layer, rect: DamageRect) => void,
) {
  if (pendingNodeDamageRects.length === 0) return
  const nodeIds = new Set<number>()
  for (const idx of slot.cmdIndices) {
    const nodeId = commands[idx]?.nodeId
    if (nodeId !== undefined) nodeIds.add(nodeId)
  }
  if (nodeIds.size === 0) return
  for (const pending of pendingNodeDamageRects) {
    if (nodeIds.has(pending.nodeId)) markLayerDamaged(layer, pending.rect)
  }
}

function updateLayerStabilityCounters(
  preparedSlots: PreparedLayerSlot[],
  slotBoundaryByKey: Map<string, LayerBoundary>,
  nodeRefById: Map<number, TGENode>,
) {
  for (const prepared of preparedSlots) {
    if (prepared.isBackground) continue
    const boundary = slotBoundaryByKey.get(prepared.slot.key)
    if (!boundary) continue
    const node = nodeRefById.get(boundary.nodeId)
    if (!node) continue
    if (prepared.dirtyRect) {
      node._unstableFrameCount++
      node._stableFrameCount = 0
    } else {
      node._stableFrameCount++
      node._unstableFrameCount = 0
    }
  }
}

// ── paintFrame ────────────────────────────────────────────────────────────

/**
 * Paint a full frame through the layer compositing pipeline.
 *
 * Steps:
 *   1. Layer prep — for each slot: compute bounds, damage, freeze/clip decisions
 *   2. Aggregate frame dirty rects and build RendererBackendFrameContext
 *   3. Per-slot: reuse stable layers or repaint + composite via Kitty
 *   4. Clean up orphan layers from previous frame
 *   5. Handle final-frame-raw backend strategy (full composite)
 *
 * @param plan     - LayerPlan from assignLayersSpatial
 * @param commands - Flat RenderCommand[] from Flexily layout
 * @param cellW    - Cell width in pixels (from terminal)
 * @param cellH    - Cell height in pixels (from terminal)
 * @param state    - All coordinator-owned dependencies
 * @returns PaintResult with repainted keys and dirty flag
 */
export function paintFrame(
  plan: LayerPlan,
  commands: RenderCommand[],
  cellW: number,
  cellH: number,
  state: PaintFrameState,
): PaintResult & {
  repaintedThisFrame: number
  ioMs: number
  rendererOutput: string | null
  moveOnlyCount: number
  moveFallbackCount: number
  stableReuseCount: number
  commandCount: number
  frameCtx: RendererBackendFrameContext
  framePlan: ReturnType<NonNullable<RendererBackend["beginFrame"]>> | undefined
  frameResult: ReturnType<NonNullable<RendererBackend["endFrame"]>> | undefined
} {
  const {
    viewportWidth,
    viewportHeight,
    useLayerCompositing,
    forceLayerRepaint,
    expFrameBudgetMs,
    debugCadence,
    debugDragRepro,
    getOrCreateLayer,
    getPreviousLayerRect,
    updateLayerGeometry,
    markLayerDamaged,
    markLayerClean,
    imageIdForLayer,
    removeLayer,
    layerCount,
    layerCache,
    activeSlotKeys,
    frameDirtyRects,
    pendingNodeDamageRects,
    renderGraphQueues,
    textMetaMap,
    layerComposer,
    lastPresentedInteractionSeq,
    lastPresentedInteractionLatencyMs,
    lastPresentedInteractionType,
    log,
    renderDebug,
    dragReproDebug,
  } = state
  const profile = state.profile

  const allSlots: LayerSlot[] = [plan.bgSlot, ...plan.contentSlots]
  const slotBoundaryByKey = plan.slotBoundaryByKey
  lastNativeRenderGraphLayerCount = 0
  lastNativeRenderGraphOpCount = 0
  lastNativeRenderGraphFullyCoveredLayerCount = 0
  lastNativeRenderGraphFallbackOpCount = 0

  const frameStart = expFrameBudgetMs > 0 ? performance.now() : 0
  let frameBudgetExceeded = false
  const layerOrder: Layer[] = []
  const preparedSlots: PreparedLayerSlot[] = []
  let ioMs = 0

  // ── Step 1: Layer prep ──
  const layerPrepStart = profile ? performance.now() : 0
  for (const slot of allSlots) {
    if (slot.cmdIndices.length === 0) continue

    if (expFrameBudgetMs > 0 && !frameBudgetExceeded && slot.z >= 0) {
      const elapsed = performance.now() - frameStart
      if (elapsed > expFrameBudgetMs) {
        if (debugCadence) log(`  [FRAME BUDGET] ${elapsed.toFixed(1)}ms > ${expFrameBudgetMs}ms — deferring remaining layers`)
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

    const pendingBounds: RenderCommand[] = []
    for (const idx of slot.cmdIndices) {
      const cmd = commands[idx]
      if (!cmd) continue
      if (cmd.type === CMD.SCISSOR_START && !hasScissor) {
        scissorX = cmd.x
        scissorY = cmd.y
        scissorR = cmd.x + cmd.width
        scissorB = cmd.y + cmd.height
        minX = scissorX
        minY = scissorY
        maxX = scissorR
        maxY = scissorB
        hasScissor = true
        for (const pending of pendingBounds) {
          const cx = Math.round(pending.x)
          const cy = Math.round(pending.y)
          const cr = Math.round(pending.x + pending.width)
          const cb = Math.round(pending.y + pending.height)
          const overlapX = Math.abs(cx - scissorX) < 4 || Math.abs(cr - scissorR) < 4
          const overlapY = Math.abs(cy - scissorY) < 4 || Math.abs(cb - scissorB) < 4
          if (!overlapX || !overlapY) continue
          minX = Math.min(minX, cx)
          minY = Math.min(minY, cy)
          maxX = Math.max(maxX, cr)
          maxY = Math.max(maxY, cb)
        }
        continue
      }
      if (hasScissor) {
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
      } else {
        minX = Math.min(minX, cmd.x)
        minY = Math.min(minY, cmd.y)
        maxX = Math.max(maxX, cmd.x + cmd.width)
        maxY = Math.max(maxY, cmd.y + cmd.height)
        if (cmd.type === CMD.RECTANGLE || cmd.type === CMD.BORDER) pendingBounds.push(cmd)
      }
    }

    const isBg = slot.z < 0
    let lx = isBg ? 0 : Math.floor(minX)
    let ly = isBg ? 0 : Math.floor(minY)
    let lw = isBg ? viewportWidth : (Math.ceil(maxX) - lx)
    let lh = isBg ? viewportHeight : (Math.ceil(maxY) - ly)

    const boundary = slotBoundaryByKey.get(slot.key)
    const boundaryNode = boundary ? state.nodeRefById.get(boundary.nodeId) ?? null : null
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
        if (slot.z >= 0) {
          const imageId = imageIdForLayer(layer)
          if (isNativePresentationCapable(state.transmissionMode)) {
            const nativeImageId = nativeLayerRemove(slot.key)
            nativeDeleteLayer(nativeImageId ?? imageId)
          } else {
            layerComposer!.removeLayer(imageId)
          }
        }
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
    applyPendingNodeDamage(layer, slot, commands, pendingNodeDamageRects, markLayerDamaged)
    if (debugDragRepro && boundaryNode?.props.debugName === "drag-target") {
      const prev = previousRect
        ? `prev=(${previousRect.x},${previousRect.y},${previousRect.width}x${previousRect.height})`
        : "prev=none"
      const damage = layer.damageRect
        ? `damage=(${layer.damageRect.x},${layer.damageRect.y},${layer.damageRect.width}x${layer.damageRect.height})`
        : "damage=none"
      dragReproDebug(`[prepare] slot=${slot.key} bounds=(${lx},${ly},${lw}x${lh}) layer=(${layer.x},${layer.y},${layer.width}x${layer.height}) ${prev} dirty=${layer.dirty ? 1 : 0} ${damage} freeze=${freezeWhileInteracting ? 1 : 0}`)
    }
    const geometryChanged = !!previousRect && (
      previousRect.x !== layer.x
      || previousRect.y !== layer.y
      || previousRect.width !== layer.width
      || previousRect.height !== layer.height
    )
    if (geometryChanged && layer.damageRect) {
      for (const lower of layerOrder) {
        markLayerDamaged(lower, layer.damageRect)
      }
    }
    layerOrder.push(layer)

    const bounds = { x: lx, y: ly, width: lw, height: lh }
    const dirtyRect = selectLayerDirtyRect(layer.dirty, layer.damageRect, bounds)
    const clippedDamage = dirtyRect ? intersectRect(dirtyRect, bounds) : null
    const layerArea = lw * lh
    const damageArea = rectArea(clippedDamage)
    const useRegionalRepaint = !!(
      !forceLayerRepaint
      && allowRegionalRepaint
      && layer.damageRect
      && clippedDamage
      && damageArea > 0
      && damageArea < layerArea * 0.5
    )
    if (dirtyRect) {
      const damageMsg = clippedDamage
        ? `damage=${clippedDamage.width}x${clippedDamage.height}@(${clippedDamage.x},${clippedDamage.y}) area=${damageArea}/${layerArea}`
        : `damage=none area=0/${layerArea}`
      if (debugCadence) log(`  [${slot.key}|${debugName}] DAMAGE allow=${allowRegionalRepaint} ${damageMsg}`)
    }
    preparedSlots.push({
      slot,
      layer,
      debugName,
      bounds,
      dirtyRect,
      clippedDamage,
      isBackground: isBg,
      subtreeTransform: boundary?.hasSubtreeTransform && boundaryNode ? computeSubtreeTransformQuad(boundaryNode) : null,
      allowRegionalRepaint,
      useRegionalRepaint,
      freezeWhileInteracting,
    })
  }
  if (profile) profile.paintLayerPrepMs += performance.now() - layerPrepStart

  // ── Step 2: Aggregate dirty rects + build frame context ──
  const frameContextStart = profile ? performance.now() : 0
  frameDirtyRects.length = 0
  let dirtyLayerCountForFrame = 0
  let dirtyPixelArea = 0
  for (const prepared of preparedSlots) {
    const dirtyRect = forceLayerRepaint
      ? prepared.bounds
      : (prepared.useRegionalRepaint && prepared.clippedDamage ? prepared.clippedDamage : prepared.dirtyRect)
    const area = rectArea(dirtyRect)

    if (area <= 0 || !dirtyRect) continue
    frameDirtyRects.push(dirtyRect)
    dirtyLayerCountForFrame += 1
    dirtyPixelArea += area
  }
  const totalPixelArea = Math.max(1, viewportWidth * viewportHeight)
  const overlapPixelArea = sumOverlapArea(frameDirtyRects)
  const fullRepaint = forceLayerRepaint || dirtyPixelArea >= totalPixelArea * 0.85
  const estimatedLayeredBytes = dirtyPixelArea * 4
    + dirtyLayerCountForFrame * (state.transmissionMode === "direct" ? 2048 : 512)
  const estimatedFinalBytes = viewportWidth * viewportHeight * 4

  const backend = state.backendOverride ?? (getRendererBackend() ?? (() => { throw new Error("no backend") })())
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
    hasSubtreeTransforms: hasDirtySubtreeTransforms(preparedSlots, forceLayerRepaint),
    hasActiveInteraction: preparedSlots.some((prepared) => prepared.freezeWhileInteracting),
    transmissionMode: state.transmissionMode,
    estimatedLayeredBytes,
    estimatedFinalBytes,
  }
  if (profile) profile.paintFrameContextMs += performance.now() - frameContextStart
  const backendBeginStart = profile ? performance.now() : 0
  const framePlan = backend.beginFrame?.(frameCtx)
  if (profile) profile.paintBackendBeginMs += performance.now() - backendBeginStart
  let rendererOutput: string | null = "buffer"
  let moveOnlyCount = 0
  let moveFallbackCount = 0
  let stableReuseCount = 0
  let repaintedThisFrame = 0
  let nativePresentationStats: NativePresentationStats | null = null

  if (framePlan?.strategy === "skip-present") {
    const cleanupStart = profile ? performance.now() : 0
    activeSlotKeys.clear()
    for (const prepared of preparedSlots) activeSlotKeys.add(prepared.slot.key)
    for (const [key, layer] of layerCache) {
      if (activeSlotKeys.has(key)) continue
      const ioStart = debugCadence ? performance.now() : 0
      const imageId = imageIdForLayer(layer)
      if (isNativePresentationCapable(state.transmissionMode)) {
        const nativeImageId = nativeLayerRemove(key)
        nativeDeleteLayer(nativeImageId ?? imageId)
      } else {
        layerComposer!.removeLayer(imageId)
      }
      if (debugCadence) ioMs += performance.now() - ioStart
      removeLayer(layer)
      layerCache.delete(key)
    }
    if (profile) profile.paintLayerCleanupMs += performance.now() - cleanupStart
    updateLayerStabilityCounters(preparedSlots, slotBoundaryByKey, state.nodeRefById)
    const backendEndStart = profile ? performance.now() : 0
    const frameResult = backend.endFrame?.(frameCtx)
    if (profile) profile.paintBackendEndMs += performance.now() - backendEndStart
    applyBackendProfile(profile, backend)
    return {
      repaintedKeys: [],
      anyDirty: false,
      repaintedThisFrame: 0,
      ioMs,
      rendererOutput: "skip-present",
      moveOnlyCount,
      moveFallbackCount,
      stableReuseCount,
      commandCount: commands.length,
      frameCtx,
      framePlan,
      frameResult,
    }
  }

  // ── Step 3: Per-slot paint ──
  for (const prepared of preparedSlots) {
    const slot = prepared.slot
    const layer = prepared.layer
    const lx = prepared.bounds.x
    const ly = prepared.bounds.y
    const lw = prepared.bounds.width
    const lh = prepared.bounds.height
    const clippedDamage = prepared.clippedDamage
    const useRegionalRepaint = prepared.useRegionalRepaint
    const imageId = imageIdForLayer(layer)
    const nativePresentationCapable = isNativePresentationCapable(state.transmissionMode)
    const canPatchRegionalLayer = nativePresentationCapable || layerComposer?.hasLayer(imageId) === true
    const effectiveUseRegionalRepaint = useRegionalRepaint && canPatchRegionalLayer
    const freezeWhileInteracting = prepared.freezeWhileInteracting

    if (lw > 0 && lh > 0) {
      const layerCtx: RendererBackendLayerContext = {
        key: slot.key,
        z: layer.z,
        backing: null,
        subtreeTransform: prepared.subtreeTransform,
        isBackground: prepared.isBackground,
        bounds: prepared.bounds,
        dirtyRect: prepared.dirtyRect,
        repaintRect: selectLayerRepaintRect(effectiveUseRegionalRepaint, clippedDamage),
        allowRegionalRepaint: prepared.allowRegionalRepaint,
        retainedDuringInteraction: freezeWhileInteracting,
      }

      const canReuseStableLayer = !freezeWhileInteracting && !forceLayerRepaint && !useRegionalRepaint && !layer.dirty && !prepared.layer.damageRect
      if (freezeWhileInteracting && !canReuseStableLayer) {
        const damage = prepared.layer.damageRect
          ? `${prepared.layer.damageRect.width}x${prepared.layer.damageRect.height}@(${prepared.layer.damageRect.x},${prepared.layer.damageRect.y})`
          : "none"
        if (debugCadence) log(`  [${slot.key}|${prepared.debugName}] DRAG-BLOCK reuse=${canReuseStableLayer ? 1 : 0} strategy=${framePlan?.strategy ?? "none"} force=${forceLayerRepaint ? 1 : 0} regional=${useRegionalRepaint ? 1 : 0} dirty=${layer.dirty ? 1 : 0} damage=${damage} prev=(${layer.prevX},${layer.prevY},${layer.prevW}x${layer.prevH}) next=(${layer.x},${layer.y},${layer.width}x${layer.height}) z=${layer.prevZ}->${layer.z}`)
      }

      if (canReuseStableLayer) {
        const reuseStart = profile ? performance.now() : 0
        const reused = backend.reuseLayer?.({
          frame: frameCtx,
          layer: layerCtx,
        }) === true
        if (profile) profile.paintReuseMs += performance.now() - reuseStart
        if (reused) {
          stableReuseCount++
          if (framePlan?.strategy === "final-frame") rendererOutput = "final-frame-raw"
          else if (framePlan?.strategy === "layered-dirty" || framePlan?.strategy === "layered-region") rendererOutput = "layered-raw"
          if (debugCadence) log(`  [${slot.key}|${prepared.debugName}] REUSE (stable layer)`)
          markLayerClean(layer)
          continue
        }
      }

      // IMPORTANT: Regional presentation may transmit only `clippedDamage`, but
      // the retained GPU layer target must still be repainted with the FULL
      // layer command stream. Filtering commands by damage rect is incorrect
      // unless every backend paint op is clipped to that rect. Otherwise a
      // large background/surface command that intersects a small titlebar damage
      // can repaint over previously retained child content without repainting
      // that child content — exactly the Lightcode "window content disappears"
      // failure mode. Keep regional optimization at the readback/emit boundary,
      // not at semantic command selection.
      const layerCommands = collectLayerCommands(commands, slot.cmdIndices)

      const basePaintCtx = {
        targetWidth: lw,
        targetHeight: lh,
        backing: layerCtx.backing ?? null,
        target: { width: lw, height: lh },
        commands: layerCommands,
        offsetX: lx,
        offsetY: ly,
        cellWidth: cellW,
        cellHeight: cellH,
        frame: frameCtx,
        layer: layerCtx,
      }
      const renderGraphStart = profile ? performance.now() : 0
      const graph = buildRenderGraphFrame(layerCommands, renderGraphQueues, textMetaMap)
      if (profile) profile.paintRenderGraphMs += performance.now() - renderGraphStart
      const backendPaintStart = profile ? performance.now() : 0
      const paintResult = backend.paint({
        ...basePaintCtx,
        graph,
      }) ?? undefined
      if (profile) profile.paintBackendPaintMs += performance.now() - backendPaintStart

      if (!paintResult) throw new Error(`GPU-only renderer backend did not return a layer payload for ${slot.key}`)
      if (paintResult.output === "skip-present") rendererOutput = paintResult.strategy ?? framePlan?.strategy ?? "skip-present"
      if (paintResult.output === "kitty-payload") rendererOutput = "layered-raw"
      if (paintResult.output === "native-presented") rendererOutput = "native-presented"

      if (paintResult.output === "skip-present") {
        repaintedThisFrame++
        markLayerClean(layer)
        continue
      }

      if (paintResult.output === "native-presented") {
        nativePresentationStats = paintResult.stats ?? nativePresentationStats
        repaintedThisFrame++
        const renderZ = layer.z
        if (effectiveUseRegionalRepaint && clippedDamage) {
          if (debugCadence) log(`  [${slot.key}] NATIVE-REGION ${clippedDamage.width}x${clippedDamage.height} at (${clippedDamage.x},${clippedDamage.y}) within ${lw}x${lh} z=${renderZ}`)
        } else {
          if (debugCadence) log(`  [${slot.key}] NATIVE-REPAINT ${lw}x${lh} at (${lx},${ly}) z=${renderZ} cmds=${slot.cmdIndices.length}`)
        }
        markLayerClean(layer)
        continue
      }

      if (paintResult.output === "kitty-payload" && paintResult.kittyPayload) {
        repaintedThisFrame++
        const renderZ = layer.z
        const imageId = imageIdForLayer(layer)
        if (debugDragRepro && prepared.debugName === "drag-target") {
          dragReproDebug(`[present] slot=${slot.key} changed=1 z=${renderZ} pos=(${lx},${ly}) size=${lw}x${lh} raw=1`)
        }

        // Fallback-only bridge path for non-default backends that still return raw RGBA while native mode is active.
        if (nativePresentationCapable) {
          const { data, width: pw, height: ph } = paintResult.kittyPayload
          const col = Math.floor(lx / cellW)
          const row = Math.floor(ly / cellH)
          const presentationStart = profile ? performance.now() : 0
          const nativeStats = nativeEmitLayer(imageId, data, pw, ph, col, row, renderZ, state.transmissionMode)
          if (profile) profile.paintPresentationMs += performance.now() - presentationStart
          if (nativeStats !== null) {
            nativePresentationStats = nativeStats
            if (effectiveUseRegionalRepaint && clippedDamage) {
              if (debugCadence) log(`  [${slot.key}] NATIVE-LAYER-REGION ${clippedDamage.width}x${clippedDamage.height} at (${clippedDamage.x},${clippedDamage.y}) within ${pw}x${ph} z=${renderZ}`)
            } else {
              if (debugCadence) log(`  [${slot.key}] NATIVE-LAYER ${pw}x${ph} at (${lx},${ly}) z=${renderZ} cmds=${slot.cmdIndices.length}`)
            }
            markLayerClean(layer)
            continue
          }
        }

        if (effectiveUseRegionalRepaint && clippedDamage) {
          if (debugCadence) log(`  [${slot.key}] REPAINT-REGION ${clippedDamage.width}x${clippedDamage.height} at (${clippedDamage.x},${clippedDamage.y}) within ${lw}x${lh} z=${renderZ}`)
        } else {
          if (debugCadence) log(`  [${slot.key}] REPAINT ${lw}x${lh} at (${lx},${ly}) z=${renderZ} (${(lw * lh * 4 / 1024).toFixed(0)}KB) cmds=${slot.cmdIndices.length}`)
        }
        const ioStart = debugCadence ? performance.now() : 0
        const presentationStart = profile ? performance.now() : 0
        const region = paintResult.kittyPayload.region
        if (region) {
          layerComposer!.patchLayer(paintResult.kittyPayload.data, imageId, region.x, region.y, region.width, region.height)
        } else {
          layerComposer!.renderLayerRaw(paintResult.kittyPayload.data, paintResult.kittyPayload.width, paintResult.kittyPayload.height, imageId, lx, ly, renderZ, cellW, cellH)
        }
        if (profile) profile.paintPresentationMs += performance.now() - presentationStart
        if (debugCadence) ioMs += performance.now() - ioStart
        markLayerClean(layer)
        continue
      }

      throw new Error(`GPU-only renderer backend did not return a layer payload for ${slot.key}`)
    }
  }

  // ── Step 4: Clean up orphan layers ──
  const cleanupStart = profile ? performance.now() : 0
  activeSlotKeys.clear()
  for (const prepared of preparedSlots) activeSlotKeys.add(prepared.slot.key)
  for (const [key, layer] of layerCache) {
    if (!activeSlotKeys.has(key)) {
      const ioStart = debugCadence ? performance.now() : 0
      const imageId = imageIdForLayer(layer)
      // Route layer deletion through native path when native presentation is active.
      // This avoids JS-side Kitty delete escape generation.
      if (isNativePresentationCapable(state.transmissionMode)) {
        const nativeImageId = nativeLayerRemove(key)
        nativeDeleteLayer(nativeImageId ?? imageId)
      } else {
        layerComposer!.removeLayer(imageId)
      }
      if (debugCadence) ioMs += performance.now() - ioStart
      removeLayer(layer)
      layerCache.delete(key)
    }
  }
  if (profile) profile.paintLayerCleanupMs += performance.now() - cleanupStart
  updateLayerStabilityCounters(preparedSlots, slotBoundaryByKey, state.nodeRefById)

  // ── Step 5: Final-frame strategy ──
  // When all dirty layers were already emitted per-layer via native presentation
  // (layered-dirty / layered-region strategy), skip the final-frame compose+readback.
  // The terminal retains previously emitted clean layer images — no need to recompose.
  const allLayersNativePresented = rendererOutput === "native-presented" && repaintedThisFrame > 0
  const skipFinalCompose = allLayersNativePresented && framePlan?.strategy !== "final-frame"
  const backendEndStart = profile ? performance.now() : 0
  const frameResult = skipFinalCompose ? null : backend.endFrame?.(frameCtx)
  if (profile) profile.paintBackendEndMs += performance.now() - backendEndStart
  applyBackendProfile(profile, backend)
  if (skipFinalCompose) {
    // Per-layer native presentation already completed — no final-frame needed.
    rendererOutput = "native-presented"
  } else if (frameResult?.output === "native-presented") {
    // Native path: Rust already emitted the full frame — nothing to do in JS.
    rendererOutput = "native-presented"
  } else if (frameResult?.output === "final-frame-raw" && frameResult.finalFrame) {
    rendererOutput = "final-frame-raw"
    const ioStart = debugCadence ? performance.now() : 0
    const presentationStart = profile ? performance.now() : 0
    layerComposer!.renderFinalFrameRaw(
      frameResult.finalFrame.data,
      frameResult.finalFrame.width,
      frameResult.finalFrame.height,
      0,
      cellW,
      cellH,
    )
    if (profile) profile.paintPresentationMs += performance.now() - presentationStart
    if (debugCadence) ioMs += performance.now() - ioStart
  }

  // ── Step 6: Interaction latency tracking + debug stats ──
  const interactionStatsStart = profile ? performance.now() : 0
  const interaction = getLatestInteractionTrace()
  if (interaction.seq > lastPresentedInteractionSeq.value && repaintedThisFrame > 0) {
    lastPresentedInteractionSeq.value = interaction.seq
    lastPresentedInteractionLatencyMs.value = Math.max(0, performance.now() - interaction.at)
    lastPresentedInteractionType.value = interaction.kind
  }

  const resourceSummary = isDebugEnabled()
    ? summarizeRendererResourceStats()
    : { totalBytes: 0, gpuBytes: 0, cacheEntries: 0 }
  const nativeFrameStats = frameResult?.output === "native-presented" ? (frameResult.stats ?? null) : nativePresentationStats
  debugUpdateStats({
    commandCount: commands.length,
    dirtyBeforeCount: 0, // coordinator passes this separately
    layerCount: layerCount(),
    moveOnlyCount,
    moveFallbackCount,
    stableReuseCount,
    nodeCount: 0, // coordinator passes this separately
    repaintedCount: repaintedThisFrame,
    rendererStrategy: frameResult?.strategy ?? framePlan?.strategy ?? null,
    rendererOutput,
    dirtyPixelArea: frameCtx.dirtyPixelArea,
    totalPixelArea: frameCtx.totalPixelArea,
    overlapPixelArea: frameCtx.overlapPixelArea,
    overlapRatio: frameCtx.overlapRatio,
    fullRepaint: frameCtx.fullRepaint,
    transmissionMode: frameCtx.transmissionMode,
    estimatedLayeredBytes: frameCtx.estimatedLayeredBytes,
    estimatedFinalBytes: frameCtx.estimatedFinalBytes,
    interactionLatencyMs: lastPresentedInteractionLatencyMs.value,
    interactionType: lastPresentedInteractionType.value,
    presentedInteractionSeq: lastPresentedInteractionSeq.value,
    resourceBytes: resourceSummary.totalBytes,
    gpuResourceBytes: resourceSummary.gpuBytes,
    resourceEntries: resourceSummary.cacheEntries,
    nativeStats: nativeFrameStats,
    nativeFrameReasonFlags: framePlan?.nativePlan?.reasonFlags ?? null,
  })
  if (profile) profile.paintInteractionStatsMs += performance.now() - interactionStatsStart

  return {
    repaintedKeys: preparedSlots.filter(p => p.layer.dirty === false && activeSlotKeys.has(p.slot.key)).map(p => p.slot.key),
    anyDirty: repaintedThisFrame > 0,
    repaintedThisFrame,
    ioMs,
    rendererOutput,
    moveOnlyCount,
    moveFallbackCount,
    stableReuseCount,
    commandCount: commands.length,
    frameCtx,
    framePlan,
    frameResult,
  }
}
