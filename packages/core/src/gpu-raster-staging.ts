/**
 * GPU raster staging helpers for GPU renderer internals.
 */

import {
  beginWgpuCanvasTargetLayer,
  copyWgpuCanvasTargetRegionToImage,
  createWgpuCanvasTarget,
  destroyWgpuCanvasTarget,
  endWgpuCanvasTargetLayer,
  type WgpuCanvasContextHandle,
  type WgpuCanvasImageHandle,
  type WgpuCanvasTargetHandle,
} from "./wgpu-canvas-bridge"

export type GpuRasterImage = {
  handle: WgpuCanvasImageHandle
  width: number
  height: number
}

export type GpuTargetRegion = {
  x: number
  y: number
  width: number
  height: number
}

export function createEmptyGpuImage(
  context: WgpuCanvasContextHandle,
  width: number,
  height: number,
): GpuRasterImage {
  const target = createWgpuCanvasTarget(context, { width, height })
  try {
    beginWgpuCanvasTargetLayer(context, target, 0, 0x00000000)
    endWgpuCanvasTargetLayer(context, target)
    return copyGpuTargetRegionToImage(context, target, { x: 0, y: 0, width, height })
  } finally {
    destroyWgpuCanvasTarget(context, target)
  }
}

export function copyGpuTargetRegionToImage(
  context: WgpuCanvasContextHandle,
  target: WgpuCanvasTargetHandle,
  region: GpuTargetRegion,
): GpuRasterImage {
  const copied = copyWgpuCanvasTargetRegionToImage(context, target, region)
  return {
    handle: copied.handle,
    width: region.width,
    height: region.height,
  }
}
