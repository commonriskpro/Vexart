/**
 * GPU raster staging helpers for GPU renderer internals.
 * Helpers for surface materialization, GPU target management,
 * and raster image staging on the GPU path.
 */

import { type RasterSurface } from "./render-surface"
import {
  beginWgpuCanvasTargetLayer,
  copyWgpuCanvasTargetRegionToImage,
  createWgpuCanvasTarget,
  createWgpuCanvasImage,
  destroyWgpuCanvasImage,
  destroyWgpuCanvasTarget,
  endWgpuCanvasTargetLayer,
  compositeWgpuCanvasTargetImageLayer,
  readbackWgpuCanvasTargetRGBA,
  readbackWgpuCanvasTargetRegionRGBA,
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

export function uploadRasterDataToTarget(
  context: WgpuCanvasContextHandle,
  targetHandle: WgpuCanvasTargetHandle,
  width: number,
  height: number,
  data: Uint8Array,
) {
  const image = createWgpuCanvasImage(context, { width, height }, data)
  beginWgpuCanvasTargetLayer(context, targetHandle, 0, 0x00000000)
  try {
    compositeWgpuCanvasTargetImageLayer(
      context,
      targetHandle,
      image,
      { x: -1, y: 1, w: 2, h: -2, opacity: 1 },
      0,
      0x00000000,
    )
  } finally {
    endWgpuCanvasTargetLayer(context, targetHandle)
    destroyWgpuCanvasImage(context, image)
  }
}

export function readbackTargetToSurface(
  context: WgpuCanvasContextHandle,
  target: WgpuCanvasTargetHandle,
  surface: RasterSurface,
  opts?: { region?: { x: number; y: number; width: number; height: number } | null },
) {
  const region = opts?.region
  if (region && region.width > 0 && region.height > 0) {
    const readback = readbackWgpuCanvasTargetRegionRGBA(context, target, region)
    const rowBytes = region.width * 4
    for (let row = 0; row < region.height; row++) {
      const srcStart = row * rowBytes
      const srcEnd = srcStart + rowBytes
      const dstStart = ((region.y + row) * surface.width + region.x) * 4
      surface.data.set(readback.data.subarray(srcStart, srcEnd), dstStart)
    }
    return { mode: "region" as const, data: readback.data }
  }
  const readback = readbackWgpuCanvasTargetRGBA(context, target, surface.width * surface.height * 4)
  surface.data.set(readback.data)
  return { mode: "full" as const, data: readback.data }
}

function compositeReadback(dst: Uint8Array, src: Uint8Array) {
  for (let i = 0; i < src.length; i += 4) {
    const sa = src[i + 3]
    if (sa === 0) continue
    if (sa === 255) {
      dst[i] = src[i]
      dst[i + 1] = src[i + 1]
      dst[i + 2] = src[i + 2]
      dst[i + 3] = 255
      continue
    }
    const da = dst[i + 3]
    const invSa = 255 - sa
    dst[i] = Math.round((src[i] * sa + dst[i] * invSa) / 255)
    dst[i + 1] = Math.round((src[i + 1] * sa + dst[i + 1] * invSa) / 255)
    dst[i + 2] = Math.round((src[i + 2] * sa + dst[i + 2] * invSa) / 255)
    dst[i + 3] = Math.min(255, sa + Math.round(da * invSa / 255))
  }
}

function compositeRegionReadback(dst: Uint8Array, dstWidth: number, src: Uint8Array, region: { x: number; y: number; width: number; height: number }) {
  const rowBytes = region.width * 4
  for (let row = 0; row < region.height; row++) {
    const srcStart = row * rowBytes
    const dstStart = ((region.y + row) * dstWidth + region.x) * 4
    compositeReadback(dst.subarray(dstStart, dstStart + rowBytes), src.subarray(srcStart, srcStart + rowBytes))
  }
}

export function compositeTargetReadbackToSurface(
  context: WgpuCanvasContextHandle,
  target: WgpuCanvasTargetHandle,
  surface: RasterSurface,
  opts?: { region?: { x: number; y: number; width: number; height: number } | null },
) {
  const region = opts?.region
  if (region && region.width > 0 && region.height > 0) {
    const readback = readbackWgpuCanvasTargetRegionRGBA(context, target, region)
    compositeRegionReadback(surface.data, surface.width, readback.data, region)
    return { mode: "region" as const, data: readback.data }
  }
  const readback = readbackWgpuCanvasTargetRGBA(context, target, surface.width * surface.height * 4)
  compositeReadback(surface.data, readback.data)
  return { mode: "full" as const, data: readback.data }
}
