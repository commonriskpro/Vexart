// gpu-renderer-backend.ts — Phase 2b native path
// All GPU target lifecycle, compositing, readback, and backdrop/mask operations
// rewired to vexart_composite_* FFI (Phase 2b Slice 2). wgpu-canvas-bridge deleted.
// Per design §11, §8.2 cmd_kind allocation. Shadow uses dedicated cmd_kind=20.
// Phase 2b Native Presentation: final-frame and layer presentation can route
// through native Rust Kitty output when nativePresentation flag is active.

import type { Terminal } from "../terminal"
import { inTmux, queryTmuxClientState } from "../terminal/tmux"
import { onTerminalTransportLifecycle } from "../terminal/transport-lifecycle"
import { clearImageCache } from "../loop/image"
import {
  type RenderedLayerRecord,
  getUnsupportedGpuOps,
} from "./gpu-helpers"
import type {
  RendererBackend,
  RendererBackendFrameContext,
  RendererBackendFramePlan,
  RendererBackendPaintContext,
  RendererBackendRetainedLayer,
} from "./renderer-backend"
import {
  chooseGpuLayerStrategy,
  nativeChooseFrameStrategy,
  NATIVE_FRAME_STRATEGY,
  NATIVE_FRAME_TRANSPORT,
  type GpuLayerStrategyMode,
  type NativeFramePlan,
} from "./gpu-layer-strategy"
import {
  vexartCompositeReadbackRgba,
} from "./gpu-composite-ops"
import {
  createKittyShmPresentation,
  createTmuxShmPresentation,
  type TmuxShmPresentation,
} from "./tmux-shm-presentation"

import { createGpuContext } from "./gpu-context"
import {
  createGpuTargetManager,
  getGpuRendererBackendCacheStats,
  type GpuRendererBackendCacheStats,
} from "./gpu-target-manager"
import { createGpuTextEncoder } from "./gpu-text-encoder"
import { createGpuOpPacker } from "./gpu-op-packer"
import {
  createGpuLayerCompositor,
  waitForTmuxPresentationForTest,
  getLastNativePresentationStatsForTest,
} from "./gpu-layer-compositor"

export {
  waitForTmuxPresentationForTest,
  getLastNativePresentationStatsForTest,
  getGpuRendererBackendCacheStats,
}

export type {
  GpuRendererBackendCacheStats,
}

/** @public */
export type GpuRendererBackend = RendererBackend & {
  instanceImageHandles: Set<bigint>
  getLastStrategy: () => GpuLayerStrategyMode | null
  /** TEST-ONLY: Read back the active target as RGBA pixels for golden tests. */
  readbackForTest: (width: number, height: number) => Uint8Array | null
}

function getForcedLayerStrategy(): GpuLayerStrategyMode | null {
  const forcedStrategyValue = process.env.VEXART_GPU_FORCE_LAYER_STRATEGY
  if (forcedStrategyValue === "skip-present") return "skip-present"
  if (forcedStrategyValue === "layered-dirty" || forcedStrategyValue === "layered-raw") return "layered-dirty"
  if (forcedStrategyValue === "layered-region") return "layered-region"
  if (forcedStrategyValue === "final-frame" || forcedStrategyValue === "final-frame-raw") return "final-frame"
  return null
}

function failGpuOnly(message: string): never {
  throw new Error(`Vexart GPU-only renderer: ${message}`)
}

/** @public */
export type GpuRendererBackendOptions = {
  /** Skip Kitty/native presentation while retaining the composited GPU target for readback. */
  suppressPresentation?: boolean
  shmPresentation?: TmuxShmPresentation
  shmSize?: () => { cols: number; rows: number }
  placeholderPresentation?: boolean
}

export function createGpuRendererBackend(): GpuRendererBackend {
  return createGpuRendererBackendInternal()
}

/**
 * Internal terminal-bound factory used by the render loop. A terminal's
 * capabilities are captured once, while its mutable size is read through the
 * callback at each emission so resize updates reach the native presenter.
 */
export function createGpuRendererBackendForTerminal(term: Pick<Terminal, "caps" | "size" | "onData">): GpuRendererBackend {
  if (term.caps.tmux || term.caps.transmissionMode === "shm") {
    const recovery = term.caps.tmux && inTmux()
    const clientState = recovery ? queryTmuxClientState() : null
    if (clientState?.kind === "unknown") {
      throw new Error(`Vexart cannot verify the attached tmux client: ${clientState.reason}`)
    }
    if (clientState?.kind === "zero") {
      throw new Error("Vexart requires one attached tmux client before creating the GPU renderer")
    }
    if (clientState?.kind === "multiple") {
      throw new Error(`Vexart requires one attached tmux client before creating the GPU renderer (found ${clientState.count})`)
    }
    if (clientState && !clientState.client.passthroughAll) {
      throw new Error("Vexart requires tmux allow-passthrough all before creating the GPU renderer")
    }
    if (clientState && !clientState.client.rgb) {
      throw new Error("Vexart requires an RGB-capable tmux client before creating the GPU renderer")
    }
    const presenter = term.caps.tmux ? createTmuxShmPresentation({
      onData: term.onData,
      ...(clientState?.kind === "single" ? {
        expectedClient: clientState.client,
        getClientState: queryTmuxClientState,
      } : {}),
    }) : createKittyShmPresentation({ onData: term.onData })
    let removeLifecycle: (() => void) | null = null
    removeLifecycle = onTerminalTransportLifecycle(term as Terminal, (event) => {
      if (event === "suspend") presenter.suspend()
      else if (event === "resume") presenter.resume()
      else {
        presenter.destroy()
        removeLifecycle?.()
        removeLifecycle = null
      }
    })
    const backend = createGpuRendererBackendInternal({
      shmPresentation: presenter,
      placeholderPresentation: term.caps.tmux,
      shmSize: () => ({ cols: term.size.cols, rows: term.size.rows }),
    })
    const originalDestroy = backend.destroy
    backend.destroy = () => {
      removeLifecycle?.()
      removeLifecycle = null
      presenter.destroy()
      originalDestroy?.()
    }
    return backend
  }
  return createGpuRendererBackendInternal()
}

/**
 * TEST-ONLY: Create a backend with presentation suppressed. Retains the GPU
 * compositor and readback, but must not write Kitty escape sequences to stdout.
 */
export function createGpuRendererBackendForTesting(): GpuRendererBackend {
  return createGpuRendererBackendInternal({ suppressPresentation: true })
}

function createGpuRendererBackendInternal(options: GpuRendererBackendOptions = {}): GpuRendererBackend {
  const gpuContext = createGpuContext()
  let compositor: ReturnType<typeof createGpuLayerCompositor>

  const targetManager = createGpuTargetManager({
    getVexartCtx: () => gpuContext.getHandle(),
    getRawVexartCtx: () => gpuContext.rawHandle,
    onTargetDestroyed: (handle) => {
      compositor?.presentation?.forgetTarget(handle)
    },
  })

  const textEncoder = createGpuTextEncoder()

  const opPacker = createGpuOpPacker({
    getVexartCtx: () => gpuContext.getHandle(),
    targetManager,
    textEncoder,
  })
  targetManager.setRenderOpToImage(opPacker.renderOpToImage)

  compositor = createGpuLayerCompositor({
    getVexartCtx: () => gpuContext.getHandle(),
    targetManager,
    suppressPresentation: options.suppressPresentation,
    shmPresentation: options.shmPresentation,
    shmSize: options.shmSize,
  })

  let lastStrategy: GpuLayerStrategyMode | null = null
  let lastNativeFramePlan: NativeFramePlan | null = null
  let framesSinceStrategyChange = 0
  let currentFrame: RendererBackendFrameContext | null = null
  let currentFrameLayers: RenderedLayerRecord[] = []
  let suppressFinalPresentation = false

  const recordCurrentFrameLayer = (layer: RenderedLayerRecord) => {
    const existingIndex = currentFrameLayers.findIndex((entry) => entry.key === layer.key)
    if (existingIndex >= 0) {
      currentFrameLayers[existingIndex] = layer
      return
    }
    currentFrameLayers.push(layer)
  }

  const backend: GpuRendererBackend = {
    name: "gpu-render-graph",
    beginFrame(ctx): RendererBackendFramePlan {
      compositor.resetProfile()
      currentFrame = ctx
      currentFrameLayers = []
      targetManager.activeLayerKeys.clear()
      suppressFinalPresentation = false
      if (!ctx.useLayerCompositing) {
        lastStrategy = null
        lastNativeFramePlan = null
        framesSinceStrategyChange = 0
        return { strategy: null }
      }
      const forcedStrategy = getForcedLayerStrategy()
      if (forcedStrategy) {
        framesSinceStrategyChange = lastStrategy === forcedStrategy ? framesSinceStrategyChange + 1 : 0
        lastStrategy = forcedStrategy
        lastNativeFramePlan = null
        return { strategy: lastStrategy }
      }
      const previousStrategy = lastStrategy
      lastNativeFramePlan = nativeChooseFrameStrategy({
        dirtyLayerCount: ctx.dirtyLayerCount,
        dirtyPixelArea: ctx.dirtyPixelArea,
        totalPixelArea: ctx.totalPixelArea,
        overlapPixelArea: ctx.overlapPixelArea,
        overlapRatio: ctx.overlapRatio,
        fullRepaint: ctx.fullRepaint,
        hasSubtreeTransforms: ctx.hasSubtreeTransforms,
        hasActiveInteraction: ctx.hasActiveInteraction,
        transmissionMode: ctx.transmissionMode === "shm"
          ? NATIVE_FRAME_TRANSPORT.SHM
          : NATIVE_FRAME_TRANSPORT.DIRECT,
        lastStrategy: previousStrategy === "skip-present"
          ? NATIVE_FRAME_STRATEGY.SKIP_PRESENT
          : previousStrategy === "layered-region"
            ? NATIVE_FRAME_STRATEGY.LAYERED_REGION
            : previousStrategy === "layered-dirty"
              ? NATIVE_FRAME_STRATEGY.LAYERED_DIRTY
              : previousStrategy === "final-frame"
                ? NATIVE_FRAME_STRATEGY.FINAL_FRAME
                : null,
        framesSinceChange: framesSinceStrategyChange,
        estimatedLayeredBytes: ctx.estimatedLayeredBytes,
        estimatedFinalBytes: ctx.estimatedFinalBytes,
      })
      const chosen = chooseGpuLayerStrategy({
        dirtyLayerCount: ctx.dirtyLayerCount,
        dirtyPixelArea: ctx.dirtyPixelArea,
        totalPixelArea: ctx.totalPixelArea,
        overlapPixelArea: ctx.overlapPixelArea,
        overlapRatio: ctx.overlapRatio,
        fullRepaint: ctx.fullRepaint,
        hasSubtreeTransforms: ctx.hasSubtreeTransforms,
        hasActiveInteraction: ctx.hasActiveInteraction,
        transmissionMode: ctx.transmissionMode,
        estimatedLayeredBytes: ctx.estimatedLayeredBytes,
        estimatedFinalBytes: ctx.estimatedFinalBytes,
        lastStrategy: previousStrategy,
        framesSinceChange: framesSinceStrategyChange,
      }, lastNativeFramePlan)
      framesSinceStrategyChange = chosen === previousStrategy ? framesSinceStrategyChange + 1 : 0
      lastStrategy = chosen
      return { strategy: lastStrategy, nativePlan: lastNativeFramePlan }
    },
    paint(ctx) {
      const unsupported = getUnsupportedGpuOps(ctx.graph.ops)
      if (unsupported.length > 0) {
        const counts = new Map<string, number>()
        for (const op of unsupported) counts.set(op.kind, (counts.get(op.kind) ?? 0) + 1)
        failGpuOnly(`unsupported render ops encountered: ${Array.from(counts.entries()).map(([kind, count]) => `${kind}=${count}`).join(", ")}`)
      }

      const frameCtx = ctx.frame
      const layerCtx = ctx.layer
      const delegatedFrame = !!(currentFrame && frameCtx && currentFrame === frameCtx)

      if (delegatedFrame && frameCtx.useLayerCompositing && layerCtx) {
        const layerTarget = targetManager.getLayerTarget(layerCtx.key, ctx.target.width, ctx.target.height)
        if (!layerTarget) {
          suppressFinalPresentation = true
          failGpuOnly(`could not allocate GPU layer target for ${layerCtx.key}`)
        }
        targetManager.activeLayerKeys.add(layerCtx.key)
        if (lastStrategy === "skip-present") {
          return { output: "skip-present", strategy: lastStrategy }
        }
        const result = opPacker.renderFrame(ctx, layerTarget)

        if (!result.ok) {
          suppressFinalPresentation = true
          failGpuOnly(`GPU layer render failed for ${layerCtx.key}`)
        }

        recordCurrentFrameLayer({
          key: layerCtx.key,
          z: layerCtx.z,
          x: layerCtx.bounds.x,
          y: layerCtx.bounds.y,
          width: layerCtx.bounds.width,
          height: layerCtx.bounds.height,
          handle: layerTarget,
          isBackground: layerCtx.isBackground,
          subtreeTransform: layerCtx.subtreeTransform,
          opacity: 1,
        })
        return { output: "skip-present", strategy: lastStrategy }
      }

      const standaloneHandle = targetManager.getStandaloneTarget(ctx.target.width, ctx.target.height)
      if (!standaloneHandle) {
        suppressFinalPresentation = true
        failGpuOnly("could not allocate standalone GPU target")
      }
      const result = opPacker.renderFrame(ctx, standaloneHandle)
      if (!result.ok) {
        suppressFinalPresentation = true
        failGpuOnly("standalone GPU render failed")
      }
      return { output: "skip-present", strategy: lastStrategy }
    },
    reuseLayer(ctx) {
      const record = targetManager.layerTargets.get(ctx.layer.key)
      if (!record) return false
      targetManager.activeLayerKeys.add(ctx.layer.key)
      recordCurrentFrameLayer({
        key: ctx.layer.key,
        z: ctx.layer.z,
        x: ctx.layer.bounds.x,
        y: ctx.layer.bounds.y,
        width: ctx.layer.bounds.width,
        height: ctx.layer.bounds.height,
        handle: record.handle,
        isBackground: ctx.layer.isBackground,
        subtreeTransform: ctx.layer.subtreeTransform,
        opacity: 1,
      })
      return true
    },
    compositeRetainedFrame(ctx) {
      compositor.resetProfile()
      return compositor.composeRetainedFrame(ctx.frame, ctx.layers, lastStrategy)
    },
    endFrame(ctx) {
      currentFrame = null
      if (!ctx.useLayerCompositing) return { output: "none", strategy: lastStrategy }
      if (suppressFinalPresentation) {
        targetManager.pruneLayerTargets()
        return { output: "none", strategy: lastStrategy }
      }
      if (ctx.dirtyLayerCount === 0 || ctx.dirtyPixelArea === 0) {
        targetManager.pruneLayerTargets()
        return { output: "none", strategy: lastStrategy }
      }
      if (lastStrategy === "skip-present") {
        targetManager.pruneLayerTargets()
        return { output: "none", strategy: lastStrategy }
      }
      return compositor.composeFinalFrame(ctx, currentFrameLayers, lastStrategy)
    },
    getLastStrategy() {
      return lastStrategy
    },
    drainProfile() {
      return compositor.drainProfile()
    },
    instanceImageHandles: targetManager.instanceImageHandles,
    destroy() {
      compositor.destroy()
      if (gpuContext.rawHandle !== null) {
        clearImageCache()
        targetManager.destroy()
        gpuContext.destroy()
      }
    },
    readbackForTest(width: number, height: number): Uint8Array | null {
      const vctx = gpuContext.rawHandle
      if (!vctx) return null
      const target = targetManager.finalFrameTarget?.handle ?? targetManager.standaloneTarget?.handle
      if (!target) return null
      return vexartCompositeReadbackRgba(vctx, target, width * height * 4)
    },
  }

  compositor.bindBackend(backend)
  return backend
}
