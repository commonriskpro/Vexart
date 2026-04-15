import type { PixelBuffer } from "@tge/pixel"
import type { RenderCommand } from "./clay"
import type { RenderGraphFrame } from "./render-graph"

export type RendererBackendPaintContext = {
  buffer: PixelBuffer
  commands: RenderCommand[]
  graph: RenderGraphFrame
  offsetX: number
  offsetY: number
}

export type RendererBackend = {
  name: string
  paint: (ctx: RendererBackendPaintContext) => void
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
