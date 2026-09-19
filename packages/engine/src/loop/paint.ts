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

import type { RenderCommand, RenderGraphFrame } from "../ffi/render-graph"
import type { Layer, LayerStoreHandle } from "../ffi/layers"
import {
  rectArea,
  sumOverlapArea,
  type DamageRect,
} from "../ffi/damage"
import {
  getRendererBackend,
  type RendererBackend,
  type RendererBackendFrameContext,
  type RendererBackendLayerContext,
} from "../ffi/renderer-backend"
import { summarizeRendererResourceStats } from "../ffi/resource-stats"
import { getLatestInteractionTrace } from "./input"
import { debugUpdateStats, isDebugEnabled } from "./debug"
import type { LayerSlot, LayerPlan, PaintResult, InteractionLatencyTracking } from "./types"
import type { TGENode } from "../ffi/node"

import { isNativePresentationCapable } from "../ffi/native-presentation-flags"
import type { NativePresentationStats } from "../ffi/native-presentation-stats"
import type { LayerOpBucket } from "./pipeline-types"

import {
  type PaintProfiler,
  selectLayerRepaintRect,
  selectLayerDirtyRect,
  hasDirtySubtreeTransforms,
  canUseRegionalRepaint,
  applyBackendProfile,
} from "./paint-regional"

import {
  type PreparedLayerSlot,
  EMPTY_COMMANDS,
  collectLayerCommands,
  cleanupOrphanLayers,
  updateLayerStabilityCounters,
  findBucketForSlot,
  prepareLayerSlots,
} from "./paint-layer"

export type { PreparedLayerSlot }
export type { PaintProfiler }
export {
  collectLayerCommands,
  selectLayerRepaintRect,
  selectLayerDirtyRect,
  hasDirtySubtreeTransforms,
  canUseRegionalRepaint,
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
  transmissionMode: "direct" | "shm"

  // Frame compositing flags
  useLayerCompositing: boolean
  forceLayerRepaint: boolean
  expFrameBudgetMs: number

  // Debug flags
  debugCadence: boolean
  debugDragRepro: boolean
  profile?: PaintProfiler

  // Layer store — injected handle (coordinator owns the store)
  layerStore: LayerStoreHandle

  // Layer cache — coordinator-owned map
  layerCache: Map<string, Layer>
  activeSlotKeys: Set<string>

  // Placeholder presentation owns one complete terminal image. Keep native
  // registry metadata cleanup, but do not emit obsolete per-layer deletes.
  suppressNativeLayerDeletes?: boolean

  // Frame dirty rects accumulator (cleared and rebuilt each frame)
  frameDirtyRects: DamageRect[]
  pendingNodeDamageRects: Array<{ nodeId: number; rect: DamageRect }>

  nodeRefById: Map<number, TGENode>

  // Renderer backend (injected override or global)
  backendOverride?: RendererBackend

  // Layer buckets from pipeline-traverse (Pass 1)
  layerBuckets?: LayerOpBucket[]

  // Interaction latency tracking
  interaction: InteractionLatencyTracking

  debug?: unknown
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
  layerBuckets?: LayerOpBucket[],
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
    layerStore: {
      getOrCreateLayer,
      getPreviousLayerRect,
      updateLayerGeometry,
      markLayerDamaged,
      markLayerClean,
      imageIdForLayer,
      removeLayer,
      layerCount,
    },
    layerCache,
    activeSlotKeys,
    frameDirtyRects,
    pendingNodeDamageRects,
    interaction: {
      lastPresentedInteractionSeq,
      lastPresentedInteractionLatencyMs,
      lastPresentedInteractionType,
    },
  } = state
  const profile = state.profile
  const buckets = layerBuckets ?? state.layerBuckets
  const bucketByKey = buckets ? new Map<string, LayerOpBucket>() : null
  if (buckets && bucketByKey) {
    for (const b of buckets) {
      bucketByKey.set(b.key, b)
    }
  }
  const totalCommandCount = buckets
    ? buckets.reduce((sum, b) => sum + b.ops.length, 0)
    : commands.length

  const allSlots: LayerSlot[] = [plan.bgSlot, ...plan.contentSlots]
  const slotBoundaryByKey = plan.slotBoundaryByKey

  const frameStart = expFrameBudgetMs > 0 ? performance.now() : 0
  let ioMs = 0

  // ── Step 1: Layer prep ──
  const layerPrepStart = profile ? performance.now() : 0
  const { preparedSlots, frameBudgetExceeded } = prepareLayerSlots({
    allSlots,
    bucketByKey,
    slotBoundaryByKey,
    commands,
    state,
    frameStart,
  })
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
    ioMs += cleanupOrphanLayers(preparedSlots, layerCache, activeSlotKeys, state.transmissionMode, imageIdForLayer, removeLayer, debugCadence, !!state.suppressNativeLayerDeletes)
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
      commandCount: totalCommandCount,
      frameCtx,
      framePlan,
      frameResult,
    }
  }

  // ── Step 2.5: Clean up orphan layers and invalidate absorbing slots ──
  const cleanupStart = profile ? performance.now() : 0
  ioMs += cleanupOrphanLayers(preparedSlots, layerCache, activeSlotKeys, state.transmissionMode, imageIdForLayer, removeLayer, debugCadence, !!state.suppressNativeLayerDeletes)
  if (profile) profile.paintLayerCleanupMs += performance.now() - cleanupStart

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
    const canPatchRegionalLayer = nativePresentationCapable
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
      const bucket = findBucketForSlot(bucketByKey, slot.key)
      const layerCommands = bucket ? EMPTY_COMMANDS : collectLayerCommands(commands, slot.cmdIndices)

      const basePaintCtx = {
        targetWidth: lw,
        targetHeight: lh,
        backing: layerCtx.backing ?? null,
        target: { width: lw, height: lh },
        commands: layerCommands,
        offsetX: prepared.paintOffsetX ?? lx,
        offsetY: prepared.paintOffsetY ?? ly,
        cellWidth: cellW,
        cellHeight: cellH,
        frame: frameCtx,
        layer: layerCtx,
      }
      const renderGraphStart = profile ? performance.now() : 0
      const graph: RenderGraphFrame = bucket ? { ops: bucket.ops } : { ops: [] }
      if (profile) profile.paintRenderGraphMs += performance.now() - renderGraphStart
      const backendPaintStart = profile ? performance.now() : 0
      const paintResult = backend.paint({
        ...basePaintCtx,
        graph,
      }) ?? undefined
      if (profile) profile.paintBackendPaintMs += performance.now() - backendPaintStart

      if (!paintResult) throw new Error(`GPU-only renderer backend did not return a layer payload for ${slot.key}`)
      if (paintResult.output === "skip-present") rendererOutput = paintResult.strategy ?? framePlan?.strategy ?? "skip-present"
      if (paintResult.output === "native-presented") rendererOutput = "native-presented"

      if (paintResult.output === "skip-present") {
        repaintedThisFrame++
        markLayerClean(layer)
        continue
      }

      if (paintResult.output === "native-presented") {
        nativePresentationStats = paintResult.stats ?? nativePresentationStats
        repaintedThisFrame++
        markLayerClean(layer)
        continue
      }

      throw new Error(`GPU-only renderer backend did not return a layer payload for ${slot.key}`)
    }
  }

  // ── Step 4: Layer stability counters ──
  updateLayerStabilityCounters(preparedSlots, slotBoundaryByKey, state.nodeRefById)

  // ── Step 5: Final-frame strategy ──
  // When all dirty layers were already emitted per-layer via native presentation
  // (layered-dirty / layered-region strategy), skip the final-frame compose+readback.
  // The terminal retains previously emitted clean layer images — no need to recompose.
  // Keep a complete final-frame present after native layer updates. Kitty
  // animation frames arrive asynchronously; skipping this compose can expose
  // a transient empty canvas while a layer replacement is in flight.
  const skipFinalCompose = false
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
    commandCount: totalCommandCount,
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
    commandCount: totalCommandCount,
    frameCtx,
    framePlan,
    frameResult,
  }
}
