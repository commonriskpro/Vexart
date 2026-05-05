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
  RendererBackendProfile,
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

// NOTE: wgpu-canvas-bridge.ts deleted in Phase 2b Slice 2 (REQ-2B-008).
// Use vexart-bridge / vexart-functions for native GPU operations.

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
// MSDF font system (Phase 2b / DEC-008)
export {
  msdfFontInit,
  msdfFontQuery,
  msdfMeasureText,
  isMsdfFontAvailable,
} from "./msdf-font"
export type { MsdfTextMeasurement } from "./msdf-font"

export { createParticleSystem } from "./particles"
export type { ParticleConfig, ParticleSystem } from "./particles"

export * from "./layers"
// NOTE: deleted experimental GPU modules are no longer exported from the engine.
// NOTE: legacy pixel-buffer, paint-bridge, and layout bridge modules are no longer exported.
export * from "./node"

// ── vexart native bridge ──
export * from "./vexart-bridge"
export * from "./vexart-functions"

// ── Phase 2b: native presentation ──
export {
  isNativePresentationEnabled,
  enableNativePresentation,
  disableNativePresentation,
  getNativePresentationFallbackReason,
  isNativePresentationCapable,
} from "./native-presentation-flags"
export {
  isNativeLayerRegistryEnabled,
  enableNativeLayerRegistry,
  disableNativeLayerRegistry,
  nativeLayerRegistryFallbackReason,
} from "./native-layer-registry-flags"
export {
  decodeNativePresentationStats,
  allocNativeStatsBuf,
  isNativeStatsValid,
  isNativeStatsFallback,
  formatNativeStats,
  NATIVE_STATS_VERSION,
  NATIVE_STATS_MODE,
  NATIVE_STATS_TRANSPORT,
  NATIVE_STATS_FLAG,
  NATIVE_STATS_BYTE_SIZE,
} from "./native-presentation-stats"
export type { NativePresentationStats } from "./native-presentation-stats"
export {
  nativeLayerUpsert,
  nativeLayerPresentDirty,
  nativeLayerReuse,
  nativeLayerRemove,
  clearNativeLayerRegistryMirror,
} from "./native-layer-registry"
export type {
  NativeLayerDescriptor,
  NativeLayerUpsertResult,
} from "./native-layer-registry"
export {
  nativeImageAssetRegister,
  nativeImageAssetTouch,
  nativeImageAssetRelease,
} from "./native-image-assets"
export type { NativeImageAssetInput } from "./native-image-assets"
export {
  nativeCanvasDisplayListUpdate,
  nativeCanvasDisplayListTouch,
  nativeCanvasDisplayListRelease,
} from "./native-canvas-display-list"
export type { NativeCanvasDisplayListInput } from "./native-canvas-display-list"
