/**
 * Canvas image cache — CPU raster cache for imperative canvas APIs.
 *
 * ## Architecture
 *
 * This module lives in compat-canvas/ by design. It uses CPU rasterization
 * (paintCanvasCommandsToRasterSurface) to produce cached RGBA images for
 * use in static or infrequently-updated canvas draws.
 *
 * It must NOT live in core/ because core/ must remain CPU-paint-free.
 * The canonical GPU renderer (gpu-renderer-backend.ts) does not use this.
 */

import { create } from "@tge/pixel"
import { CanvasContext } from "../../core/src/canvas"
import { paintCanvasCommandsToRasterSurface } from "./canvas-raster-painter"

export type CanvasRasterImage = {
  data: Uint8Array
  width: number
  height: number
}

export type CanvasImageCache = {
  get: (width: number, height: number, key: string, draw: (ctx: CanvasContext) => void) => CanvasRasterImage
  clear: () => void
}

const canvasImageCaches = new Set<Map<string, CanvasRasterImage>>()
const MAX_CANVAS_IMAGE_CACHE_ENTRIES = 64

function touchCanvasCacheEntry(cache: Map<string, CanvasRasterImage>, key: string, value: CanvasRasterImage) {
  cache.delete(key)
  cache.set(key, value)
}

export function createCanvasImageCache(): CanvasImageCache {
  const cache = new Map<string, CanvasRasterImage>()
  canvasImageCaches.add(cache)

  return {
    get(width, height, key, draw) {
      const fullKey = `${key}:${width}x${height}`
      const cached = cache.get(fullKey)
      if (cached) {
        touchCanvasCacheEntry(cache, fullKey, cached)
        return cached
      }

      const buf = create(width, height)
      const ctx = new CanvasContext()
      draw(ctx)
      paintCanvasCommandsToRasterSurface(buf, ctx, width, height)

      const image = { data: buf.data, width: buf.width, height: buf.height }
      if (cache.size >= MAX_CANVAS_IMAGE_CACHE_ENTRIES) {
        const first = cache.keys().next().value
        if (first) cache.delete(first)
      }
      cache.set(fullKey, image)
      return image
    },
    clear() {
      cache.clear()
    },
  }
}

export function getCanvasImageCacheStats() {
  let entryCount = 0
  let bytes = 0
  for (const cache of canvasImageCaches) {
    entryCount += cache.size
    for (const image of cache.values()) bytes += image.data.byteLength
  }
  return {
    cacheCount: canvasImageCaches.size,
    entryCount,
    bytes,
  }
}
