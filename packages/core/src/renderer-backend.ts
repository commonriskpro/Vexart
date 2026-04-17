import type { RenderCommand } from "./clay"
import type { DamageRect } from "./damage"
import type { GpuLayerStrategyMode } from "./gpu-layer-strategy"
import type { RenderGraphFrame } from "./render-graph"

export type RendererBackendLayerBacking = {
  kind: "gpu" | "raw"
  imageId: number
  targetKey: string
  width: number
  height: number
}

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

export type RendererBackendPaintResult = {
  output: "kitty-payload" | "skip-present"
  strategy?: GpuLayerStrategyMode | null
  kittyPayload?: {
    data: Uint8Array
    width: number
    height: number
  }
}

export type RendererBackendFramePlan = {
  strategy: GpuLayerStrategyMode | null
}

export type RendererBackendFrameResult = {
  output: "none" | "final-frame-raw"
  strategy: GpuLayerStrategyMode | null
  finalFrame?: {
    data: Uint8Array
    width: number
    height: number
  }
}

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
  frame: RendererBackendFrameContext | null
  layer: RendererBackendLayerContext | null
}

export type RendererBackend = {
  name: string
  beginFrame?: (ctx: RendererBackendFrameContext) => RendererBackendFramePlan | void
  paint: (ctx: RendererBackendPaintContext) => RendererBackendPaintResult | void
  reuseLayer?: (ctx: { frame: RendererBackendFrameContext; layer: RendererBackendLayerContext }) => boolean | void
  endFrame?: (ctx: RendererBackendFrameContext) => RendererBackendFrameResult | null | void
}

let activeRendererBackend: RendererBackend | null = null

export function setRendererBackend(backend: RendererBackend | null) {
  activeRendererBackend = backend
}

export function getRendererBackend() {
  return activeRendererBackend
}

export function getRendererBackendName() {
  return activeRendererBackend?.name ?? "cpu-legacy"
}
