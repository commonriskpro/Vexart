/**
 * Temporary bridge package for imperative canvas APIs.
 */

export {
  CanvasContext,
  createCanvasImageCache,
  getCanvasImageCacheStats,
  paintCanvasCommands,
  paintCanvasCommandsCPU,
} from "../../renderer/src/canvas"

export type { Viewport, StrokeStyle, FillStyle, ShapeStyle } from "../../renderer/src/canvas"

export {
  setCanvasPainterBackend,
  getCanvasPainterBackend,
  getCanvasPainterBackendName,
} from "../../renderer/src/canvas-backend"

export type { CanvasPainterBackend } from "../../renderer/src/canvas-backend"
