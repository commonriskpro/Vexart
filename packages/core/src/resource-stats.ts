import { getCanvasImageCacheStats } from "./canvas"
import { getFontAtlasCacheStats } from "./font-atlas"
import { getGpuRendererBackendCacheStats } from "./gpu-renderer-backend"
import { getImageCacheStats } from "../../runtime/src/image"
import { getTextLayoutCacheStats } from "./text-layout"
import { getWgpuCanvasPainterCacheStats } from "../../compat-canvas/src/wgpu-canvas-backend"

export function getRendererResourceStats() {
  return {
    image: getImageCacheStats(),
    canvasImage: getCanvasImageCacheStats(),
    textLayout: getTextLayoutCacheStats(),
    fontAtlas: getFontAtlasCacheStats(),
    gpuRenderer: getGpuRendererBackendCacheStats(),
    wgpuCanvasPainter: getWgpuCanvasPainterCacheStats(),
  }
}

export function summarizeRendererResourceStats() {
  const stats = getRendererResourceStats()
  const totalBytes =
    stats.image.decodedBytes +
    stats.image.scaledBytes +
    stats.canvasImage.bytes +
    stats.fontAtlas.bytes +
    stats.gpuRenderer.layerTargetBytes +
    stats.gpuRenderer.textImageBytes +
    stats.gpuRenderer.glyphAtlasBytes +
    stats.gpuRenderer.canvasSpriteBytes +
    stats.gpuRenderer.transformSpriteBytes +
    stats.gpuRenderer.fallbackSpriteBytes +
    stats.gpuRenderer.backdropSourceBytes +
    stats.gpuRenderer.backdropSpriteBytes +
    stats.wgpuCanvasPainter.targetBytes +
    stats.wgpuCanvasPainter.textImageBytes
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
      stats.gpuRenderer.backdropSpriteBytes +
      stats.wgpuCanvasPainter.targetBytes +
      stats.wgpuCanvasPainter.textImageBytes,
    cacheEntries:
      stats.image.decodedCount +
      stats.image.scaledEntries +
      stats.canvasImage.entryCount +
      stats.textLayout.preparedCount +
      stats.textLayout.layoutCount +
      stats.fontAtlas.atlasCount +
      stats.gpuRenderer.textImageCount +
      stats.gpuRenderer.glyphAtlasCount +
      stats.gpuRenderer.canvasSpriteCount +
      stats.gpuRenderer.transformSpriteCount +
      stats.gpuRenderer.fallbackSpriteCount +
      stats.gpuRenderer.backdropSourceCount +
      stats.gpuRenderer.backdropSpriteCount +
      stats.wgpuCanvasPainter.textImageCount,
    stats,
  }
}
