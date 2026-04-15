import type { PixelBuffer } from "@tge/pixel"
import type { CanvasContext } from "./canvas"

export type CanvasPainterBackend = {
  name: string
  paint: (buf: PixelBuffer, ctx: CanvasContext, canvasW: number, canvasH: number) => void
}

let activeCanvasPainterBackend: CanvasPainterBackend | null = null

export function setCanvasPainterBackend(backend: CanvasPainterBackend | null) {
  activeCanvasPainterBackend = backend
}

export function getCanvasPainterBackend() {
  return activeCanvasPainterBackend
}

export function getCanvasPainterBackendName() {
  return activeCanvasPainterBackend?.name ?? "cpu"
}
