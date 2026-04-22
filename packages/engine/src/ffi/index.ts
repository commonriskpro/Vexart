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
export { createGpuFrameComposer } from "../output/gpu-frame-composer"
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

// NOTE: wgpu-canvas-bridge.ts exists for target lifecycle during Phase 2 transition.
// Not part of public surface. Use vexart-bridge / vexart-functions for new code.

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
  rectArea as damageRectArea,
  sumOverlapArea as damageSumOverlapArea,
  rectRight,
  rectBottom,
  isEmptyRect,
} from "./damage"
export type { DamageRect } from "./damage"

export { CanvasContext } from "./canvas"
export type { Viewport, StrokeStyle, FillStyle, ShapeStyle, CanvasDrawCommand } from "./canvas"

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
// NOTE: wgpu-mixed-scene and gpu-raster-staging deleted in Phase 2 Slice 11.
export * from "./layout-writeback"
// NOTE: pixel-buffer, paint-bridge, clay.ts deleted in Phase 2 Slice 11.
export * from "./node"

// ── vexart native bridge (Phase 2) ──
export * from "./vexart-bridge"
export * from "./vexart-functions"
