/**
 * Temporary bridge package for imperative canvas APIs.
 */

export {
  CanvasContext,
  createCanvasImageCache,
  getCanvasImageCacheStats,
  paintCanvasCommands,
  paintCanvasCommandsCPU,
} from "../../core/src/canvas"

export type { Viewport, StrokeStyle, FillStyle, ShapeStyle } from "../../core/src/canvas"

export {
  setCanvasPainterBackend,
  getCanvasPainterBackend,
  getCanvasPainterBackendName,
} from "../../core/src/canvas-backend"

export type { CanvasPainterBackend } from "../../core/src/canvas-backend"

export {
  tryCreateWgpuCanvasPainterBackend,
  getWgpuCanvasPainterCacheStats,
} from "../../core/src/wgpu-canvas-backend"
