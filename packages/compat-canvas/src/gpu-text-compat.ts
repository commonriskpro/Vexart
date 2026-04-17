/**
 * GPU text compat helper — CPU raster text → GPU image upload.
 *
 * This is NOT the official GPU text path (which uses the glyph atlas).
 * It exists only for compat painter backends that still need to upload
 * rasterized text as a GPU image (e.g. wgpu-canvas-backend.ts).
 *
 * Do NOT import this from gpu-renderer-backend or any official core path.
 */

import { paint } from "../../core/src/pixel-buffer"
import { createRasterSurface } from "../../core/src/render-surface"
import { createWgpuCanvasImage, type WgpuCanvasContextHandle } from "../../core/src/wgpu-canvas-bridge"
import type { GpuRasterImage } from "../../core/src/gpu-raster-staging"

export type { GpuRasterImage }

function unpackColor(color: number): [number, number, number, number] {
  return [(color >>> 24) & 0xff, (color >>> 16) & 0xff, (color >>> 8) & 0xff, color & 0xff]
}

function createTextRasterSurface(text: string, color: number | [number, number, number, number]) {
  const width = Math.max(1, paint.measureText(text))
  const height = 16
  const surface = createRasterSurface(width, height)
  const rgba = Array.isArray(color) ? color : unpackColor(color)
  paint.drawText(surface, 0, 0, text, rgba[0], rgba[1], rgba[2], rgba[3])
  return surface
}

export function createGpuTextImage(
  context: WgpuCanvasContextHandle,
  text: string,
  color: number | [number, number, number, number],
): GpuRasterImage {
  const surface = createTextRasterSurface(text, color)
  return {
    handle: createWgpuCanvasImage(context, { width: surface.width, height: surface.height }, surface.data),
    width: surface.width,
    height: surface.height,
  }
}
