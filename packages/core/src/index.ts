/**
 * Engine-core boundary.
 *
 * This package now physically owns the renderer engine modules: GPU renderer,
 * render graph, frame composition, geometry, layout, text, and output-facing
 * engine APIs.
 */

export { setRendererBackend, getRendererBackend, getRendererBackendName } from "./renderer-backend"
export type {
  RendererBackend,
  RendererBackendFrameContext,
  RendererBackendLayerContext,
  RendererBackendPaintContext,
  RendererBackendPaintResult,
  RendererBackendFramePlan,
  RendererBackendFrameResult,
  RendererBackendLayerBacking,
} from "./renderer-backend"

export { createGpuRendererBackend, getGpuRendererBackendCacheStats } from "./gpu-renderer-backend"
export { createGpuFrameComposer } from "./gpu-frame-composer"
export { chooseGpuLayerStrategy } from "./gpu-layer-strategy"

export {
  BACKDROP_FILTER_KIND,
  createRenderGraphQueues,
  resetRenderGraphQueues,
  cloneRenderGraphQueues,
  buildRenderOp,
  buildRenderGraphFrame,
} from "./render-graph"
export type {
  RenderBounds,
  BackdropFilterKind,
  BackdropFilterParams,
  BackdropRenderMetadata,
  RenderGraphOp,
  RenderGraphFrame,
  RectangleRenderOp,
  BorderRenderOp,
  TextRenderOp,
  ImageRenderOp,
  CanvasRenderOp,
  EffectRenderOp,
  RawCommandRenderOp,
} from "./render-graph"

export {
  probeWgpuCanvasBridge,
  loadWgpuCanvasBridge,
  copyWgpuCanvasTargetRegionToImage,
  filterWgpuCanvasImageBackdrop,
  maskWgpuCanvasImageRoundedRect,
  compositeWgpuCanvasTargetImageLayer,
} from "./wgpu-canvas-bridge"
export type { WgpuCanvasBridgeProbe, WgpuBackdropFilterParams } from "./wgpu-canvas-bridge"

export { getRendererResourceStats } from "./resource-stats"

export {
  identity, translate, rotate, scale, scaleXY, skew, perspective,
  multiply, invert, transformPoint, transformBounds, fromConfig, isIdentity,
} from "./matrix"
export type { Matrix3 } from "./matrix"

export {
  intersectRect,
  unionRect,
  expandRect,
  translateRect,
  rectRight,
  rectBottom,
  isEmptyRect,
} from "./damage"
export type { DamageRect } from "./damage"

export {
  rectArea as damageRectArea,
  sumOverlapArea as damageSumOverlapArea,
  buffersEqual as damageBuffersEqual,
  findDirtyRegion as damageFindDirtyRegion,
  extractRegion as damageExtractRegion,
} from "./damage-tracker"

export {
  resolveNodeByPath,
  collectAllTexts,
  findLayerBoundaries,
  claimScissorCommands,
} from "./layer-planner"
export type { LayerSlot, LayerBoundary } from "./layer-planner"

export { CanvasContext } from "./canvas"
export type { Viewport, StrokeStyle, FillStyle, ShapeStyle } from "./canvas"

export {
  registerFont,
  getFont,
  clearTextCache,
  getTextLayoutCacheStats,
} from "./text-layout"
export type { FontDescriptor } from "./text-layout"
export { getFontAtlasCacheStats } from "./font-atlas"

export { createParticleSystem } from "./particles"
export type { ParticleConfig, ParticleSystem } from "./particles"

export * from "./layers"
export * from "./wgpu-mixed-scene"
export * from "./render-surface"
export * from "./gpu-raster-staging"
export * from "./layout-writeback"
export * from "./frame-presenter"
export * from "./canvas-backend"
export * from "./pixel-buffer"
export * from "./paint-bridge"
export * from "./node"

export {
  ATTACH_TO,
  ATTACH_POINT,
  POINTER_CAPTURE,
  SIZING,
  DIRECTION,
  ALIGN_X,
  ALIGN_Y,
} from "./clay"
