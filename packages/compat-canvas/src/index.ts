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
} from "./wgpu-canvas-backend"

export { createGpuTextImage } from "./gpu-text-compat"
export type { GpuRasterImage } from "./gpu-text-compat"
