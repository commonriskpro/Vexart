import { getFontAtlasCacheStats } from "./font-atlas"
import { getGpuRendererBackendCacheStats } from "./gpu-renderer-backend"
import { getImageCacheStats } from "../loop/image"
import { getTextLayoutCacheStats } from "./text-layout"
import { openVexartLibrary } from "./vexart-bridge"

/** @public */
export type ResourceStats = {
  budgetBytes: number
  currentUsage: number
  highWaterMark: number
  resourcesByKind: Record<string, { count: number; bytes: number }>
  evictionsLastFrame: number
  evictionsTotal: number
}

/**
 * Fetch ResourceManager stats from the native library via FFI.
 *
 * Returns `null` if the library is unavailable or the call fails.
 * (REQ-2B-704)
 */
/** @public */
export function getNativeResourceStats(): ResourceStats | null {
  try {
    const { symbols } = openVexartLibrary()
    const buf = new Uint8Array(4096)
    const usedBuf = new Uint32Array(1)
    const code = symbols.vexart_resource_get_stats(
      1, // ctx handle (Phase 2b: single context)
      buf,
      buf.byteLength,
      usedBuf,
    ) as number
    if (code !== 0) return null
    const json = new TextDecoder().decode(buf.subarray(0, usedBuf[0]))
    return JSON.parse(json) as ResourceStats
  } catch {
    return null
  }
}

/**
 * Set the ResourceManager memory budget via FFI.
 *
 * `budgetMb`: budget in megabytes (min 32MB enforced by native layer).
 * Returns true on success, false if the library is unavailable.
 * (REQ-2B-703)
 */
/** @public */
export function setNativeResourceBudget(budgetMb: number): boolean {
  try {
    const { symbols } = openVexartLibrary()
    const code = symbols.vexart_resource_set_budget(1, budgetMb) as number
    return code === 0
  } catch {
    return false
  }
}

/** @public */
export function getRendererResourceStats() {
  return {
    image: getImageCacheStats(),
    textLayout: getTextLayoutCacheStats(),
    fontAtlas: getFontAtlasCacheStats(),
    gpuRenderer: getGpuRendererBackendCacheStats(),
    // Native resource manager stats (Phase 2b Slice 6 — REQ-2B-704).
    // Returns null if native library is not yet loaded; TS callers check for null.
    native: getNativeResourceStats(),
  }
}

export function summarizeRendererResourceStats() {
  const stats = getRendererResourceStats()
  const totalBytes =
    stats.image.decodedBytes +
    stats.image.scaledBytes +
    stats.fontAtlas.bytes +
    stats.gpuRenderer.layerTargetBytes +
    stats.gpuRenderer.textImageBytes +
    stats.gpuRenderer.glyphAtlasBytes +
    stats.gpuRenderer.canvasSpriteBytes +
    stats.gpuRenderer.transformSpriteBytes +
    stats.gpuRenderer.fallbackSpriteBytes +
    stats.gpuRenderer.backdropSourceBytes +
    stats.gpuRenderer.backdropSpriteBytes
  return {
    totalBytes,
    gpuBytes:
      stats.gpuRenderer.layerTargetBytes +
      stats.gpuRenderer.textImageBytes +
      stats.gpuRenderer.glyphAtlasBytes +
      stats.gpuRenderer.canvasSpriteBytes +
      stats.gpuRenderer.transformSpriteBytes +
      stats.gpuRenderer.fallbackSpriteBytes +
      stats.gpuRenderer.backdropSourceBytes +
      stats.gpuRenderer.backdropSpriteBytes,
    cacheEntries:
      stats.image.decodedCount +
      stats.image.scaledEntries +
      stats.textLayout.preparedCount +
      stats.textLayout.layoutCount +
      stats.fontAtlas.atlasCount +
      stats.gpuRenderer.textImageCount +
      stats.gpuRenderer.glyphAtlasCount +
      stats.gpuRenderer.canvasSpriteCount +
      stats.gpuRenderer.transformSpriteCount +
      stats.gpuRenderer.fallbackSpriteCount +
      stats.gpuRenderer.backdropSourceCount +
      stats.gpuRenderer.backdropSpriteCount,
    stats,
  }
}
