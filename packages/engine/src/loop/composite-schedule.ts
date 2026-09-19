/**
 * composite-schedule.ts — Frame profiling, walk accumulator management, visual prop synchronization, and compositor fast path.
 *
 * Extracted from composite.ts as part of loop decomposition.
 * Handles:
 *   - Frame profile instantiation and scalar walk counters
 *   - WalkTreeState construction and accumulator resets
 *   - Synchronizing visual properties to commands and ops
 *   - Compositor-only retained frame fast path execution
 *   - Layer slot assignment from traversal buckets
 *   - Frame debug statistics reporting
 */

import { CMD, type RenderCommand, type ImageRenderOp } from "../ffi/render-graph"
import { resolveProps, type TGENode } from "../ffi/node"
import { debugUpdateStats, isDebugEnabled } from "./debug"
import type { FrameProfile, LayerBoundary, LayerSlot } from "./types"
import type { WalkTreeState } from "./walk-tree"
import { summarizeRendererResourceStats } from "../ffi/resource-stats"
import { hasCompositorAnimations, isCompositorOnlyFrame, resetFrameTracking } from "../animation/compositor-path"
import type { LayerOpBucket } from "./pipeline-types"
import { buildRetainedCompositorLayers } from "./composite-retained"
import { markLayerDirtyByKey } from "./composite-damage"
import type { PaintResult } from "./types"
import type { RendererBackendFrameContext } from "../ffi/renderer-backend"
import type { CompositeFrameState } from "./composite"

/** Mutable scalar counters for walk state writeback. */
export type WalkCounters = {
  scrollSpeedCap: number
}

/** Create a zero-initialized FrameProfile. Use to avoid 2000-char inline literals. */
export function createFrameProfile(overrides?: Partial<FrameProfile>): FrameProfile {
  return {
    scheduledIntervalMs: 0, scheduledDelayMs: 0, timerDelayMs: 0, sincePrevFrameMs: 0,
    scrollMs: 0, walkTreeMs: 0, layoutComputeMs: 0, layoutWritebackMs: 0,
    interactionMs: 0, relayoutMs: 0, layoutMs: 0, layerAssignMs: 0, prepMs: 0,
    paintNativeSnapshotMs: 0, paintLayerPrepMs: 0, paintFrameContextMs: 0,
    paintBackendBeginMs: 0, paintReuseMs: 0, paintRenderGraphMs: 0,
    paintBackendPaintMs: 0, paintBackendCompositeMs: 0, paintBackendReadbackMs: 0,
    paintBackendNativeEmitMs: 0, paintBackendNativeReadbackMs: 0,
    paintBackendNativeCompressMs: 0, paintBackendNativeShmPrepareMs: 0,
    paintBackendNativeWriteMs: 0, paintBackendNativeRawBytes: 0,
    paintBackendNativePayloadBytes: 0, paintBackendUniformMs: 0,
    paintLayerCleanupMs: 0, paintBackendEndMs: 0, paintPresentationMs: 0,
    paintInteractionStatsMs: 0, paintMs: 0, beginSyncMs: 0, ioMs: 0, endSyncMs: 0,
    totalMs: 0, commands: 0, repainted: 0, dirtyBefore: 0,
    ...overrides,
  }
}

export function syncVisualPropsToCommands(commands: RenderCommand[], nodeRefById: Map<number, TGENode>): void {
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    if (cmd.nodeId === undefined) continue
    const node = nodeRefById.get(cmd.nodeId)
    if (!node) continue
    const resolved = resolveProps(node)
    if (cmd.type === CMD.RECTANGLE) {
      if (typeof resolved.backgroundColor === "number") cmd.color = resolved.backgroundColor >>> 0
      if (typeof resolved.cornerRadius === "number") cmd.cornerRadius = resolved.cornerRadius
    } else if (cmd.type === CMD.BORDER) {
      if (typeof resolved.borderColor === "number") cmd.color = resolved.borderColor >>> 0
      if (typeof resolved.cornerRadius === "number") cmd.cornerRadius = resolved.cornerRadius
      if (typeof resolved.borderWidth === "number") {
        const bw = resolved.borderWidth
        cmd.extra1 = bw
        cmd.borderWidths = {
          left: resolved.borderLeft ?? bw,
          right: resolved.borderRight ?? bw,
          top: resolved.borderTop ?? bw,
          bottom: resolved.borderBottom ?? bw,
        }
      } else if (cmd.extra1 > 0 && (node.props.hoverStyle?.borderWidth !== undefined || node.props.activeStyle?.borderWidth !== undefined || node.props.focusStyle?.borderWidth !== undefined)) {
        cmd.extra1 = 0
        if (typeof node.props.borderColor !== "number") cmd.color = 0
      }
    } else if (cmd.type === CMD.TEXT) {
      if (typeof resolved.color === "number") cmd.color = resolved.color >>> 0
    }
  }
}

export function syncVisualPropsToOps(buckets: LayerOpBucket[], nodeRefById: Map<number, TGENode>): void {
  for (const bucket of buckets) {
    for (const op of bucket.ops) {
      if (op.nodeId === undefined) continue
      const node = nodeRefById.get(op.nodeId)
      if (!node) continue
      const resolved = resolveProps(node)
      if (op.kind === "rectangle") {
        if (typeof resolved.backgroundColor === "number") op.color = resolved.backgroundColor >>> 0
        if (typeof resolved.cornerRadius === "number") {
          op.cornerRadius = resolved.cornerRadius
          op.radius = resolved.cornerRadius
        }
      } else if (op.kind === "border") {
        if (typeof resolved.borderColor === "number") op.color = resolved.borderColor >>> 0
        if (typeof resolved.cornerRadius === "number") {
          op.cornerRadius = resolved.cornerRadius
          op.radius = resolved.cornerRadius
        }
        if (typeof resolved.borderWidth === "number") {
          const bw = resolved.borderWidth
          op.extra1 = bw
          op.borderWidth = bw
          op.borderWidths = {
            left: resolved.borderLeft ?? bw,
            right: resolved.borderRight ?? bw,
            top: resolved.borderTop ?? bw,
            bottom: resolved.borderBottom ?? bw,
          }
        } else if (op.extra1 > 0 && (node.props.hoverStyle?.borderWidth !== undefined || node.props.activeStyle?.borderWidth !== undefined || node.props.focusStyle?.borderWidth !== undefined)) {
          op.extra1 = 0
          op.borderWidth = 0
          if (typeof node.props.borderColor !== "number") op.color = 0
        }
      } else if (op.kind === "text") {
        if (typeof resolved.color === "number") op.color = resolved.color >>> 0
      } else if (op.kind === "image" || (op as any).type === "image") {
        const imageOp = op as ImageRenderOp
        const extra = node._imageExtra
        let textureChanged = false
        if (extra) {
          const newHandle = extra.nativeHandle ?? 0
          if (imageOp.textureId !== newHandle) {
            imageOp.textureId = newHandle
            textureChanged = true
          }
          if (imageOp.image) {
            if (imageOp.image.nativeImageHandle !== extra.nativeHandle) {
              imageOp.image.nativeImageHandle = extra.nativeHandle
              textureChanged = true
            }
            if (extra.buffer && imageOp.image.imageBuffer !== extra.buffer) {
              imageOp.image.imageBuffer = extra.buffer
              textureChanged = true
            }
          }
        }
        if (textureChanged) {
          markLayerDirtyByKey(bucket.key)
        }
        if (typeof resolved.backgroundColor === "number") imageOp.color = resolved.backgroundColor >>> 0
        if (typeof resolved.cornerRadius === "number") {
          imageOp.cornerRadius = resolved.cornerRadius
          if (imageOp.image) imageOp.image.cornerRadius = resolved.cornerRadius
          if (imageOp.rect) {
            imageOp.rect.cornerRadius = resolved.cornerRadius
            imageOp.rect.radius = resolved.cornerRadius
          }
        }
      }
    }
  }
}

export function buildWalkState(s: CompositeFrameState): WalkTreeState {
  return {
    scrollSpeedCap: { value: s.walkCounters.scrollSpeedCap },
    nodeCount: s.nodeCountValue,
    rectNodes: s.rectNodes,
    textNodes: s.textNodes,
    boxNodes: s.boxNodes,
    layerBoundaries: s.layerBoundaries,
    scrollContainers: s.scrollContainers,
    nodeRefById: s.nodeRefById,
    rectNodeById: s.rectNodeById,
    layout: s.layoutAdapter,
    cullingEnabled: true,
    viewportWidth: (s as any).width ?? s.viewportWidth,
    viewportHeight: (s as any).height ?? s.viewportHeight,
    ...((s.scrollOffsets ? { scrollOffsets: s.scrollOffsets } : {}) as any),
  }
}

export function resetWalkAccumulators(s: CompositeFrameState): void {
  s.walkCounters.scrollSpeedCap = 0
  s.rectNodes.length = 0
  s.rectNodeById.clear()
  s.textNodes.length = 0
  s.boxNodes.length = 0
  s.layerBoundaries.length = 0
  s.scrollContainers.length = 0
  s.nodeCountValue.value = 0
  s.nodeRefById.clear()
}

export function tryCompositorOnlyFrame(
  s: CompositeFrameState,
  profile: FrameProfile | undefined,
  dirtyVersionAtFrameStart: number,
  dirtyBeforeFrame: number,
): boolean {
  const backend = s.backendOverride!
  const compositorOnlyFrame = hasCompositorAnimations()
    && isCompositorOnlyFrame()
    && s.scroll.x === 0
    && s.scroll.y === 0
    && !s.pointer.pendingPress
    && !s.pointer.pendingRelease
    && !s.pointer.down
    && !s.pointer.dirty
    && !!backend.compositeRetainedFrame
    && s.layerCache.size > 0

  if (!compositorOnlyFrame) return false

  const retainedPrepStart = profile ? performance.now() : 0
  const retainedLayers = buildRetainedCompositorLayers(s.layerCache, s.nodeRefById)
  if (profile) profile.paintLayerPrepMs = performance.now() - retainedPrepStart
  const dirtyLayerCount = retainedLayers.filter((layer) => layer.opacity < 0.999 || !!layer.subtreeTransform).length
  const dirtyPixelArea = retainedLayers.reduce((sum, layer) => sum + layer.bounds.width * layer.bounds.height, 0)
  const totalPixelArea = Math.max(1, s.viewportWidth * s.viewportHeight)
  const frameCtx = {
    viewportWidth: s.viewportWidth,
    viewportHeight: s.viewportHeight,
    dirtyLayerCount,
    layerCount: retainedLayers.length,
    dirtyPixelArea,
    totalPixelArea,
    overlapPixelArea: 0,
    overlapRatio: 0,
    fullRepaint: false,
    useLayerCompositing: s.useLayerCompositing,
    hasSubtreeTransforms: retainedLayers.some((layer) => !!layer.subtreeTransform),
    hasActiveInteraction: false,
    transmissionMode: s.transmissionMode,
    estimatedLayeredBytes: dirtyPixelArea * 4,
    estimatedFinalBytes: totalPixelArea * 4,
  } satisfies RendererBackendFrameContext
  const beginSyncStart = profile ? performance.now() : 0
  s.term.beginSync()
  if (profile) profile.beginSyncMs = performance.now() - beginSyncStart
  const retainedPaintStart = profile ? performance.now() : 0
  const frameResult = backend.compositeRetainedFrame?.({ frame: frameCtx, layers: retainedLayers }) ?? null
  if (profile) {
    profile.paintBackendPaintMs = performance.now() - retainedPaintStart
    const backendProfile = backend.drainProfile?.()
    if (backendProfile) {
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
    profile.paintMs = profile.paintBackendPaintMs
    profile.commands = 0
    profile.dirtyBefore = dirtyBeforeFrame
    profile.repainted = 0
  }
  const endSyncStart = profile ? performance.now() : 0
  s.term.endSync()
  if (profile) profile.endSyncMs = performance.now() - endSyncStart
  if (isDebugEnabled()) {
    const resourceSummary = summarizeRendererResourceStats()
    debugUpdateStats({
      commandCount: 0,
      dirtyBeforeCount: dirtyBeforeFrame,
      layerCount: s.layerStore.layerCount(),
      moveOnlyCount: 0,
      moveFallbackCount: 0,
      stableReuseCount: retainedLayers.length,
      nodeCount: s.nodeCountValue.value,
      repaintedCount: 0,
      rendererStrategy: frameResult?.strategy ?? "final-frame",
      rendererOutput: frameResult?.output ?? "none",
      dirtyPixelArea: frameCtx.dirtyPixelArea,
      totalPixelArea: frameCtx.totalPixelArea,
      overlapPixelArea: frameCtx.overlapPixelArea,
      overlapRatio: frameCtx.overlapRatio,
      fullRepaint: frameCtx.fullRepaint,
      transmissionMode: frameCtx.transmissionMode,
      estimatedLayeredBytes: frameCtx.estimatedLayeredBytes,
      estimatedFinalBytes: frameCtx.estimatedFinalBytes,
      interactionLatencyMs: s.interaction.lastPresentedInteractionLatencyMs.value,
      interactionType: s.interaction.lastPresentedInteractionType.value,
      presentedInteractionSeq: s.interaction.lastPresentedInteractionSeq.value,
      resourceBytes: resourceSummary.totalBytes,
      gpuResourceBytes: resourceSummary.gpuBytes,
      resourceEntries: resourceSummary.cacheEntries,
      nativeStats: frameResult?.output === "native-presented" ? (frameResult.stats ?? null) : null,
      nativeFrameReasonFlags: null,
    })
  }
  resetFrameTracking()
  s.dirty.clearDirty(dirtyVersionAtFrameStart)
  return true
}

export function assignSlotsFromBuckets(
  layerBuckets: LayerOpBucket[],
  layerBoundaries: LayerBoundary[],
  nodeRefById: Map<number, TGENode>,
  forceLayerRepaint: boolean,
): {
  boundaries: LayerBoundary[]
  bgSlot: LayerSlot
  contentSlots: LayerSlot[]
  slotBoundaryByKey: Map<string, LayerBoundary>
  flatCommands: RenderCommand[]
} {
  const boundaries = forceLayerRepaint
    ? layerBoundaries.filter((boundary) => nodeRefById.get(boundary.nodeId)?._autoLayer !== true)
    : layerBoundaries

  const bgBucket = layerBuckets[0]
  const bgSlot: LayerSlot = { key: bgBucket?.key ?? "root", z: -1, cmdIndices: [] }
  const contentSlots: LayerSlot[] = []
  const slotBoundaryByKey = new Map<string, LayerBoundary>()

  for (let i = 1; i < layerBuckets.length; i++) {
    const bucket = layerBuckets[i]
    const boundary = boundaries.find((b) => b.nodeId === bucket.nodeId)
    if (boundary) {
      slotBoundaryByKey.set(bucket.key, boundary)
    }
    contentSlots.push({
      key: bucket.key,
      z: boundary ? boundary.z : i,
      cmdIndices: [],
    })
  }

  const flatCommands: RenderCommand[] = []
  for (const b of layerBuckets) {
    for (const op of b.ops) {
      flatCommands.push(op as unknown as RenderCommand)
    }
  }

  return {
    boundaries,
    bgSlot,
    contentSlots,
    slotBoundaryByKey,
    flatCommands,
  }
}

export function reportCompositeDebugStats(
  s: CompositeFrameState,
  paintResult: PaintResult & {
    repaintedThisFrame: number
    ioMs: number
    rendererOutput: string | null
    moveOnlyCount: number
    moveFallbackCount: number
    stableReuseCount: number
    commandCount: number
    frameCtx: RendererBackendFrameContext
    framePlan: any
    frameResult: any
  },
  dirtyBeforeFrame: number,
): void {
  if (!isDebugEnabled()) return
  const resourceSummary = summarizeRendererResourceStats()
  debugUpdateStats({
    commandCount: paintResult.commandCount,
    dirtyBeforeCount: dirtyBeforeFrame,
    layerCount: s.layerStore.layerCount(),
    moveOnlyCount: paintResult.moveOnlyCount,
    moveFallbackCount: paintResult.moveFallbackCount,
    stableReuseCount: paintResult.stableReuseCount,
    nodeCount: s.nodeCountValue.value,
    repaintedCount: paintResult.repaintedThisFrame,
    rendererStrategy: paintResult.frameResult?.strategy ?? null,
    rendererOutput: paintResult.rendererOutput,
    dirtyPixelArea: paintResult.frameCtx.dirtyPixelArea,
    totalPixelArea: paintResult.frameCtx.totalPixelArea,
    overlapPixelArea: paintResult.frameCtx.overlapPixelArea,
    overlapRatio: paintResult.frameCtx.overlapRatio,
    fullRepaint: paintResult.frameCtx.fullRepaint,
    transmissionMode: paintResult.frameCtx.transmissionMode,
    estimatedLayeredBytes: paintResult.frameCtx.estimatedLayeredBytes,
    estimatedFinalBytes: paintResult.frameCtx.estimatedFinalBytes,
    interactionLatencyMs: s.interaction.lastPresentedInteractionLatencyMs.value,
    interactionType: s.interaction.lastPresentedInteractionType.value,
    presentedInteractionSeq: s.interaction.lastPresentedInteractionSeq.value,
    resourceBytes: resourceSummary.totalBytes,
    gpuResourceBytes: resourceSummary.gpuBytes,
    resourceEntries: resourceSummary.cacheEntries,
    nativeFrameReasonFlags: paintResult.framePlan?.nativePlan?.reasonFlags ?? null,
  })
}
