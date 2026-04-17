/**
 * compat-canvas — CPU raster painters and imperative canvas APIs.
 *
 * This package is the compat boundary. Core GPU rendering does NOT import from here.
 * If you are writing GPU renderer code, use core/src/gpu-renderer-backend.ts directly.
 */

// ── CanvasContext (imperative draw API) ──
export { CanvasContext } from "../../core/src/canvas"
export type { Viewport, StrokeStyle, FillStyle, ShapeStyle, CanvasDrawCommand } from "../../core/src/canvas"

// ── CPU raster painters (compat only — do NOT use from GPU renderer) ──
export { paintCanvasCommands, paintCanvasCommandsCPU, paintCanvasCommandsToRasterSurface } from "./canvas-raster-painter"

// ── Canvas image cache (CPU raster, compat path) ──
export { createCanvasImageCache, getCanvasImageCacheStats } from "./canvas-image-cache"
export type { CanvasImageCache, CanvasRasterImage } from "./canvas-image-cache"

// ── Compat painter backend slot (GPU-accelerated compat painter) ──
export {
  setCanvasPainterBackend,
  getCanvasPainterBackend,
  getCanvasPainterBackendName,
} from "./canvas-backend"
export type { CanvasPainterBackend } from "./canvas-backend"

// ── WGPU compat painter (GPU target → CPU surface readback, compat only) ──
export {
  tryCreateWgpuCanvasPainterBackend,
  getWgpuCanvasPainterCacheStats,
} from "./wgpu-canvas-backend"

// ── GPU text upload helper (CPU raster → GPU image, compat only) ──
export { createGpuTextImage } from "./gpu-text-compat"
export type { GpuRasterImage } from "./gpu-text-compat"
