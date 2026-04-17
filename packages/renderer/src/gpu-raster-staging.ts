/**
 * Transition-only raster staging helpers for GPU renderer internals.
 * These helpers exist to quarantine temporary surface materialization while
 * the official path moves toward direct GPU targets/layers/images.
 */

import { CanvasContext } from "./canvas"
import { paintCanvasCommandsToRasterSurface } from "./canvas-raster-painter"
import { paint } from "./pixel-buffer"
import { createRasterSurface, type RasterSurface } from "./render-surface"
import {
  beginWgpuCanvasTargetLayer,
  createWgpuCanvasImage,
  destroyWgpuCanvasImage,
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

function unpackColor(color: number): [number, number, number, number] {
  return [(color >>> 24) & 0xff, (color >>> 16) & 0xff, (color >>> 8) & 0xff, color & 0xff]
}

export function measureRasterTextWidth(text: string) {
  return Math.max(1, paint.measureText(text))
}

function createTextRasterSurface(text: string, color: number | [number, number, number, number]) {
  const width = Math.max(1, paint.measureText(text))
  const height = 16
  const surface = createRasterSurface(width, height)
  const rgba = Array.isArray(color) ? color : unpackColor(color)
  paint.drawText(surface, 0, 0, text, rgba[0], rgba[1], rgba[2], rgba[3])
  return surface
}

function createCanvasRasterSurface(
  width: number,
  height: number,
  ctx: CanvasContext,
) {
  const surface = createRasterSurface(width, height)
  paintCanvasCommandsToRasterSurface(surface, ctx, width, height)
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

export function createGpuCanvasImage(
  context: WgpuCanvasContextHandle,
  width: number,
  height: number,
  ctx: CanvasContext,
): GpuRasterImage {
  const surface = createCanvasRasterSurface(width, height, ctx)
  return {
    handle: createWgpuCanvasImage(context, { width: surface.width, height: surface.height }, surface.data),
    width: surface.width,
    height: surface.height,
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
