import type { RenderCommand } from "./render-graph"
import type { DamageRect } from "./damage"
import type { GpuLayerStrategyMode } from "./gpu-layer-strategy"
import type { RenderGraphFrame } from "./render-graph"
import type { NativePresentationStats } from "./native-presentation-stats"
import type { NativeFramePlan } from "./native-frame-orchestrator"

/** @public */
export type RendererBackendLayerBacking = {
  kind: "gpu" | "raw"
  imageId: number
  targetKey: string
  width: number
  height: number
}

/** @public */
export type RendererBackendFrameContext = {
  viewportWidth: number
  viewportHeight: number
  dirtyLayerCount: number
  layerCount: number
  dirtyPixelArea: number
  totalPixelArea: number
  overlapPixelArea: number
  overlapRatio: number
  fullRepaint: boolean
  useLayerCompositing: boolean
  hasSubtreeTransforms: boolean
  hasActiveInteraction: boolean
  transmissionMode: "direct" | "file" | "shm"
  estimatedLayeredBytes: number
  estimatedFinalBytes: number
}

/** @public */
export type RendererBackendLayerContext = {
  key: string
  z: number
  backing: RendererBackendLayerBacking | null
  subtreeTransform:
    | {
        p0: { x: number; y: number }
        p1: { x: number; y: number }
        p2: { x: number; y: number }
        p3: { x: number; y: number }
      }
    | null
  isBackground: boolean
  bounds: DamageRect
  dirtyRect: DamageRect | null
  repaintRect: DamageRect | null
  allowRegionalRepaint: boolean
  retainedDuringInteraction: boolean
}

/** @public */
export type RendererBackendRetainedLayer = {
  key: string
  z: number
  bounds: DamageRect
  subtreeTransform:
    | {
        p0: { x: number; y: number }
        p1: { x: number; y: number }
        p2: { x: number; y: number }
        p3: { x: number; y: number }
      }
    | null
  isBackground: boolean
  opacity: number
}

/** @public */
export type RendererBackendPaintResult =
  | {
      output: "kitty-payload"
      strategy?: GpuLayerStrategyMode | null
      kittyPayload?: {
        data: Uint8Array
        width: number
        height: number
      }
    }
  | {
      output: "skip-present"
      strategy?: GpuLayerStrategyMode | null
    }
  | {
      /** Native Kitty output was emitted directly from Rust — no RGBA payload in JS. */
      output: "native-presented"
      strategy?: GpuLayerStrategyMode | null
      stats?: NativePresentationStats | null
    }

/** @public */
export type RendererBackendFramePlan = {
  strategy: GpuLayerStrategyMode | null
  nativePlan?: NativeFramePlan | null
}

/** @public */
export type RendererBackendFrameResult =
  | {
      output: "none"
      strategy: GpuLayerStrategyMode | null
    }
  | {
      output: "final-frame-raw"
      strategy: GpuLayerStrategyMode | null
      finalFrame?: {
        data: Uint8Array
        width: number
        height: number
      }
    }
  | {
      /** Native Kitty output was emitted for the full frame — no RGBA payload in JS. */
      output: "native-presented"
      strategy: GpuLayerStrategyMode | null
      stats?: NativePresentationStats | null
    }

/** @public */
export type RendererBackendPaintContext = {
  targetWidth: number
  targetHeight: number
  backing: RendererBackendLayerBacking | null
  /** GPU target descriptor for the current paint. Width/height only — no raw bytes. */
  target: {
    width: number
    height: number
  }
  commands: RenderCommand[]
  graph: RenderGraphFrame
  offsetX: number
  offsetY: number
  cellWidth?: number
  cellHeight?: number
  frame: RendererBackendFrameContext | null
  layer: RendererBackendLayerContext | null
}

/**
 * Renderer backend extension point.
 *
 * The runtime currently ships with a GPU render-graph backend, but the loop
 * talks to it through this interface so alternative backends can plug into the
 * same frame lifecycle in the future (for example WebGL, Vulkan, remote, or
 * test/instrumentation backends).
 *
 * Hooks are intentionally split by phase:
 * - beginFrame: inspect frame-wide heuristics and choose a strategy
 * - paint: render one layer or standalone target
 * - reuseLayer: opt into retained-layer reuse without repainting
 * - endFrame: finalize frame-wide presentation work
 */
/** @public */
export type RendererBackend = {
  name: string
  beginFrame?: (ctx: RendererBackendFrameContext) => RendererBackendFramePlan | void
  paint: (ctx: RendererBackendPaintContext) => RendererBackendPaintResult | void
  reuseLayer?: (ctx: { frame: RendererBackendFrameContext; layer: RendererBackendLayerContext }) => boolean | void
  compositeRetainedFrame?: (ctx: { frame: RendererBackendFrameContext; layers: RendererBackendRetainedLayer[] }) => RendererBackendFrameResult | null | void
  endFrame?: (ctx: RendererBackendFrameContext) => RendererBackendFrameResult | null | void
}

let activeRendererBackend: RendererBackend | null = null

/** @public */
export function setRendererBackend(backend: RendererBackend | null) {
  activeRendererBackend = backend
}

/** @public */
export function getRendererBackend() {
  return activeRendererBackend
}

/** @public */
export function getRendererBackendName() {
  return activeRendererBackend?.name ?? "none"
}
