import { getFontAtlasCacheStats } from "./font-atlas"
import { getGpuRendererBackendCacheStats } from "./gpu-renderer-backend"
import { getImageCacheStats } from "../loop/image"
import { getTextLayoutCacheStats } from "./text-layout"

export function getRendererResourceStats() {
  return {
    image: getImageCacheStats(),
    textLayout: getTextLayoutCacheStats(),
    fontAtlas: getFontAtlasCacheStats(),
    gpuRenderer: getGpuRendererBackendCacheStats(),
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
