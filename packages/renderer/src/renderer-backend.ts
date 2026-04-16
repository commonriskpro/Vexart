import type { PixelBuffer } from "@tge/pixel"
import type { RenderCommand } from "./clay"
import type { DamageRect } from "./damage"
import type { GpuLayerStrategyMode } from "./gpu-layer-strategy"
import type { RenderGraphFrame } from "./render-graph"

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
  selectableText: boolean
  hasActiveInteraction: boolean
  requiresLayerReadback: boolean
  transmissionMode: "direct" | "file" | "shm"
  estimatedLayeredBytes: number
  estimatedFinalBytes: number
}

export type RendererBackendLayerContext = {
  key: string
  z: number
  isBackground: boolean
  bounds: DamageRect
  dirtyRect: DamageRect | null
  repaintRect: DamageRect | null
  allowPartialUpdates: boolean
  allowRegionalRepaint: boolean
  retainedDuringInteraction: boolean
  requiresReadback: boolean
}

export type RendererBackendSyncLayerContext = {
  buffer: PixelBuffer
  frame: RendererBackendFrameContext
  layer: RendererBackendLayerContext
}

export type RendererBackendPaintResult = {
  output: "buffer" | "raw-layer" | "skip-present"
  strategy?: GpuLayerStrategyMode | null
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
  buffer: PixelBuffer
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
  reuseLayer?: (ctx: RendererBackendSyncLayerContext) => boolean | void
  syncLayerBuffer?: (ctx: RendererBackendSyncLayerContext) => void
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
