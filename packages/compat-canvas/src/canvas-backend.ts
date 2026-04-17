/**
 * Canvas painter backend slot — compat only.
 *
 * Provides a pluggable backend for imperative canvas APIs (SceneCanvas, etc.)
 * so GPU-accelerated compat painters can register themselves.
 *
 * This module lives in compat-canvas/ by design — core GPU rendering
 * (gpu-renderer-backend.ts) does NOT use painter backends.
 */

import type { RasterSurface } from "../../core/src/render-surface"
import type { CanvasContext } from "../../core/src/canvas"

export type CanvasPainterBackend = {
  name: string
  paint: (surface: RasterSurface, ctx: CanvasContext, canvasW: number, canvasH: number) => void
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
