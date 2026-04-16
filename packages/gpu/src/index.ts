/**
 * Temporary bridge package for GPU backends and WGPU helpers.
 */

export {
  createGpuRendererBackend,
  getGpuRendererBackendCacheStats,
} from "../../renderer/src/gpu-renderer-backend"

export {
  probeWgpuCanvasBridge,
  loadWgpuCanvasBridge,
  copyWgpuCanvasTargetRegionToImage,
  filterWgpuCanvasImageBackdrop,
  maskWgpuCanvasImageRoundedRect,
  maskWgpuCanvasImageRoundedRectCorners,
  compositeWgpuCanvasTargetImageLayer,
  createWgpuCanvasContext,
  destroyWgpuCanvasContext,
  createWgpuCanvasTarget,
  destroyWgpuCanvasTarget,
  createWgpuCanvasImage,
  destroyWgpuCanvasImage,
  renderWgpuCanvasTargetClear,
  beginWgpuCanvasTargetLayer,
  endWgpuCanvasTargetLayer,
  readbackWgpuCanvasTargetRGBA,
  readbackWgpuCanvasTargetRegionRGBA,
  renderWgpuCanvasTargetRects,
  renderWgpuCanvasTargetRectsLayer,
  renderWgpuCanvasTargetImage,
  renderWgpuCanvasTargetImageLayer,
  renderWgpuCanvasTargetImagesLayer,
  renderWgpuCanvasTargetTransformedImagesLayer,
  renderWgpuCanvasTargetGlyphsLayer,
  renderWgpuCanvasTargetLinearGradientsLayer,
  renderWgpuCanvasTargetRadialGradientsLayer,
  renderWgpuCanvasTargetCirclesLayer,
  renderWgpuCanvasTargetPolygonsLayer,
  renderWgpuCanvasTargetBeziersLayer,
  renderWgpuCanvasTargetShapeRectsLayer,
  renderWgpuCanvasTargetShapeRectCornersLayer,
  renderWgpuCanvasTargetGlowsLayer,
  renderWgpuCanvasTargetNebulasLayer,
  renderWgpuCanvasTargetStarfieldsLayer,
  getWgpuCanvasBridgeInfo,
  supportsWgpuCanvasGlyphLayer,
} from "../../renderer/src/wgpu-canvas-bridge"

export type {
  WgpuCanvasBridgeProbe,
  WgpuCanvasBridgeInfo,
  WgpuBackdropFilterParams,
  WgpuCanvasContextHandle,
  WgpuCanvasTargetHandle,
  WgpuCanvasImageHandle,
  WgpuCanvasInitOptions,
  WgpuCanvasTargetDescriptor,
  WgpuCanvasImageDescriptor,
  WgpuCanvasRectFill,
  WgpuCanvasLinearGradient,
  WgpuCanvasRadialGradient,
  WgpuCanvasCircle,
  WgpuCanvasPolygon,
  WgpuCanvasBezier,
  WgpuCanvasShapeRect,
  WgpuCanvasShapeRectCorners,
  WgpuCanvasCornerRadii,
  WgpuCanvasGlow,
  WgpuCanvasNebula,
  WgpuCanvasNebulaStop,
  WgpuCanvasStarfield,
  WgpuCanvasGlyphInstance,
} from "../../renderer/src/wgpu-canvas-bridge"

export {
  tryCreateWgpuCanvasPainterBackend,
  getWgpuCanvasPainterCacheStats,
} from "../../renderer/src/wgpu-canvas-backend"

export { setRendererBackend, getRendererBackend, getRendererBackendName } from "../../renderer/src/renderer-backend"
export type {
  RendererBackend,
  RendererBackendFrameContext,
  RendererBackendFramePlan,
  RendererBackendFrameResult,
  RendererBackendLayerContext,
  RendererBackendPaintContext,
  RendererBackendPaintResult,
  RendererBackendSyncLayerContext,
} from "../../renderer/src/renderer-backend"
