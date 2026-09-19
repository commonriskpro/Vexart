/**
 * gpu-layer-compositor.ts — Layer composition and presentation dispatch.
 * Extracted from gpu-renderer-backend.ts.
 */

import { ptr } from "bun:ffi"
import type { RenderedLayerRecord } from "./gpu-helpers"
import type {
  RendererBackendFrameContext,
  RendererBackendFrameResult,
  RendererBackendProfile,
  RendererBackendRetainedLayer,
} from "./renderer-backend"
import { packImageTransformInstance } from "./gpu-pack"
import {
  getSymbols,
  vexartCompositeTargetBeginLayer,
  vexartCompositeTargetEndLayer,
  compositeTargetUniformToTarget,
} from "./gpu-composite-ops"
import { vexartGetLastError } from "./vexart-functions"
import {
  allocNativeStatsBuf,
  decodeNativePresentationStats,
  type NativePresentationStats,
} from "./native-presentation-stats"
import { ensureNativeKittyTransport } from "./native-presentation-ops"
import { createKittyShmPresentation, type TmuxShmPresentation } from "./tmux-shm-presentation"
import type { GpuLayerStrategyMode } from "./gpu-layer-strategy"
import type { GpuTargetManager } from "./gpu-target-manager"

const PROFILE_ENABLED = process.env.VEXART_PROFILE !== "0"

const tmuxPresentationDrainers = new WeakMap<object, () => Promise<void>>()

/** Internal test hook; production backends intentionally expose no drain API. */
export function waitForTmuxPresentationForTest(backend: object): Promise<void> {
  return tmuxPresentationDrainers.get(backend)?.() ?? Promise.resolve()
}

export function registerTmuxPresentationDrainer(backend: object, drainer: () => Promise<void>) {
  tmuxPresentationDrainers.set(backend, drainer)
}

let lastNativePresentationStats: NativePresentationStats | null = null
export function getLastNativePresentationStatsForTest(): NativePresentationStats | null {
  return lastNativePresentationStats
}

export interface GpuLayerCompositorOptions {
  getVexartCtx: () => bigint
  targetManager: GpuTargetManager
  suppressPresentation?: boolean
  shmPresentation?: TmuxShmPresentation
  shmSize?: () => { cols: number; rows: number }
}

export interface GpuLayerCompositor {
  composeFinalFrame(
    frame: RendererBackendFrameContext,
    layers: RenderedLayerRecord[],
    strategy: GpuLayerStrategyMode | null,
  ): RendererBackendFrameResult | null
  composeRetainedFrame(
    frame: RendererBackendFrameContext,
    layers: RendererBackendRetainedLayer[],
    strategy: GpuLayerStrategyMode | null,
  ): RendererBackendFrameResult | null
  composeLayersToFrame(
    frame: RendererBackendFrameContext,
    layers: RenderedLayerRecord[],
    strategy: GpuLayerStrategyMode | null,
  ): RendererBackendFrameResult | null
  resetProfile(): void
  drainProfile(): RendererBackendProfile
  bindBackend(backend: object): void
  destroy(): void
  readonly presentation: TmuxShmPresentation | null
}

export function createGpuLayerCompositor(options: GpuLayerCompositorOptions): GpuLayerCompositor {
  const { getVexartCtx, targetManager } = options
  let boundBackend: object | null = null

  const finalFrameImageId = 0x40000000 + ((process.pid ?? 0) % 0x0fffffff)

  const backendProfile: RendererBackendProfile = {
    compositeMs: 0,
    readbackMs: 0,
    nativeEmitMs: 0,
    nativeReadbackMs: 0,
    nativeCompressMs: 0,
    nativeShmPrepareMs: 0,
    nativeWriteMs: 0,
    nativeRawBytes: 0,
    nativePayloadBytes: 0,
    uniformUpdateMs: 0,
  }

  const resetBackendProfile = () => {
    backendProfile.compositeMs = 0
    backendProfile.readbackMs = 0
    backendProfile.nativeEmitMs = 0
    backendProfile.nativeReadbackMs = 0
    backendProfile.nativeCompressMs = 0
    backendProfile.nativeShmPrepareMs = 0
    backendProfile.nativeWriteMs = 0
    backendProfile.nativeRawBytes = 0
    backendProfile.nativePayloadBytes = 0
    backendProfile.uniformUpdateMs = 0
  }

  const addBackendProfile = (key: keyof RendererBackendProfile, start: number) => {
    if (!PROFILE_ENABLED) return
    backendProfile[key] += performance.now() - start
  }

  const addNativeStatsProfile = (stats: NativePresentationStats | null) => {
    if (!stats) return
    backendProfile.nativeReadbackMs += stats.readbackUs / 1000
    backendProfile.nativeCompressMs += stats.compressUs / 1000
    backendProfile.nativeShmPrepareMs += stats.shmPrepareUs / 1000
    backendProfile.nativeWriteMs += stats.writeUs / 1000
    backendProfile.nativeRawBytes += stats.rawBytes
    backendProfile.nativePayloadBytes += stats.payloadBytes
  }

  let presentation = options.shmPresentation ?? null
  const recordPresentation = (stats: NativePresentationStats | null) => {
    if (!stats) return
    lastNativePresentationStats = stats
    addNativeStatsProfile(stats)
  }
  presentation?.setOnPresented(recordPresentation)

  const emitNativeFinalFrame = (
    vctx: bigint,
    targetHandle: bigint,
    frame: RendererBackendFrameContext,
  ): NativePresentationStats | null => {
    const statsBuf = allocNativeStatsBuf()
    if (!presentation && frame.transmissionMode === "shm") {
      presentation = createKittyShmPresentation()
      presentation.setOnPresented(recordPresentation)
      if (boundBackend) {
        registerTmuxPresentationDrainer(boundBackend, presentation.waitForDrain)
      }
    }
    const presenter = presentation
    if (presenter) {
      if (frame.transmissionMode !== "shm") {
        throw new Error(
          `[vexart] SHM presentation requires transmissionMode="shm" (received "${frame.transmissionMode}"); ` +
          "refusing to fall back to direct/file transport",
        )
      }
      const size = (options.shmSize ?? (() => ({ cols: 0, rows: 0 })))()
      const nativeEmitStart = PROFILE_ENABLED ? performance.now() : 0
      const stats = presenter.present({
        context: vctx,
        target: targetHandle,
        width: frame.viewportWidth,
        height: frame.viewportHeight,
        cols: size.cols,
        rows: size.rows,
        transmissionMode: frame.transmissionMode,
      })
      addBackendProfile("nativeEmitMs", nativeEmitStart)
      return stats
    }
    ensureNativeKittyTransport(frame.transmissionMode)
    const nativeEmitStart = PROFILE_ENABLED ? performance.now() : 0
    const rc = getSymbols().vexart_kitty_emit_frame_with_stats(
      vctx,
      targetHandle,
      finalFrameImageId,
      ptr(statsBuf),
    ) as number
    addBackendProfile("nativeEmitMs", nativeEmitStart)
    if (rc !== 0) {
      const err = vexartGetLastError()
      throw new Error(`[vexart] native frame presentation failed (${rc}): ${err}`)
    }
    const stats = decodeNativePresentationStats(statsBuf)
    lastNativePresentationStats = stats
    addNativeStatsProfile(stats)
    return stats
  }

  const composeLayersToFrame = (
    frame: RendererBackendFrameContext,
    layers: RenderedLayerRecord[],
    strategy: GpuLayerStrategyMode | null,
  ): RendererBackendFrameResult | null => {
    if (layers.length === 0 || frame.dirtyLayerCount === 0) {
      targetManager.pruneLayerTargets()
      return { output: "none", strategy }
    }
    const vctx = getVexartCtx()
    const targetHandle = targetManager.getFinalFrameTarget(frame.viewportWidth, frame.viewportHeight)
    if (!targetHandle) return null
    const orderedLayers = layers.slice().sort((a, b) => a.z - b.z)
    const compositeStart = PROFILE_ENABLED ? performance.now() : 0
    vexartCompositeTargetBeginLayer(vctx, targetHandle, 0, 0x00000000)
    addBackendProfile("compositeMs", compositeStart)
    try {
      for (const layer of orderedLayers) {
        const quad = layer.subtreeTransform ?? {
          p0: { x: layer.x, y: layer.y },
          p1: { x: layer.x + layer.width, y: layer.y },
          p2: { x: layer.x, y: layer.y + layer.height },
          p3: { x: layer.x + layer.width, y: layer.y + layer.height },
        }
        const inst = packImageTransformInstance(
          (quad.p0.x / frame.viewportWidth) * 2 - 1,
          1 - (quad.p0.y / frame.viewportHeight) * 2,
          (quad.p1.x / frame.viewportWidth) * 2 - 1,
          1 - (quad.p1.y / frame.viewportHeight) * 2,
          (quad.p2.x / frame.viewportWidth) * 2 - 1,
          1 - (quad.p2.y / frame.viewportHeight) * 2,
          (quad.p3.x / frame.viewportWidth) * 2 - 1,
          1 - (quad.p3.y / frame.viewportHeight) * 2,
          layer.opacity,
        )
        const uniformStart = PROFILE_ENABLED ? performance.now() : 0
        const uniformUpdated = compositeTargetUniformToTarget(vctx, targetHandle, layer.handle, inst)
        addBackendProfile("uniformUpdateMs", uniformStart)
        if (!uniformUpdated) {
          return null
        }
      }
    } finally {
      const compositeEndStart = PROFILE_ENABLED ? performance.now() : 0
      vexartCompositeTargetEndLayer(vctx, targetHandle)
      addBackendProfile("compositeMs", compositeEndStart)
    }
    targetManager.pruneLayerTargets()

    if (options.suppressPresentation) {
      return { output: "none", strategy }
    }

    const stats = emitNativeFinalFrame(vctx, targetHandle, frame)
    return { output: stats ? "native-presented" : "none", strategy, stats }
  }

  const composeFinalFrame = (
    frame: RendererBackendFrameContext,
    layers: RenderedLayerRecord[],
    strategy: GpuLayerStrategyMode | null,
  ): RendererBackendFrameResult | null => {
    return composeLayersToFrame(frame, layers, strategy)
  }

  const composeRetainedFrame = (
    frame: RendererBackendFrameContext,
    layers: RendererBackendRetainedLayer[],
    strategy: GpuLayerStrategyMode | null,
  ): RendererBackendFrameResult | null => {
    if (frame.dirtyLayerCount === 0) {
      targetManager.pruneLayerTargets()
      return { output: "none", strategy }
    }
    const retainedLayers: RenderedLayerRecord[] = []
    for (const layer of layers) {
      const record = targetManager.layerTargets.get(layer.key)
      if (!record) continue
      retainedLayers.push({
        key: layer.key,
        z: layer.z,
        x: layer.bounds.x,
        y: layer.bounds.y,
        width: layer.bounds.width,
        height: layer.bounds.height,
        handle: record.handle,
        isBackground: layer.isBackground,
        subtreeTransform: layer.subtreeTransform,
        opacity: layer.opacity,
      })
    }
    return composeLayersToFrame(frame, retainedLayers, strategy)
  }

  return {
    composeFinalFrame,
    composeRetainedFrame,
    composeLayersToFrame,
    resetProfile: resetBackendProfile,
    drainProfile() {
      const profile = { ...backendProfile }
      resetBackendProfile()
      return profile
    },
    bindBackend(backend: object) {
      boundBackend = backend
      if (presentation) {
        registerTmuxPresentationDrainer(backend, presentation.waitForDrain)
      }
    },
    destroy() {
      presentation?.destroy()
    },
    get presentation() {
      return presentation
    },
  }
}
