/**
 * @vexart/engine workspace-internal API.
 *
 * This entrypoint is for Vexart's own packages, compiler, tests, and
 * development tooling. It is intentionally separate from the package's
 * public index; consumers must not depend on these retained-engine details.
 * Keep exports explicit so a new internal symbol is still reviewable.
 */

// ── Retained node tree, FFI, and bridge ──────────────────────────────────────

export {
  INTERACTION_MODE,
  TGE_NODE_KIND,
  acquireFlexNode,
  bumpThemeEpoch,
  clearFlexNodePool,
  createNode,
  createPressEvent,
  ensureCompositorExtra,
  ensureTransformExtra,
  getClassNameResolver,
  getFlexNodePoolSize,
  getGridLayoutError,
  getThemeEpoch,
  insertChild,
  parseAlignX,
  parseAlignY,
  parseColor,
  parseDirection,
  parseSizing,
  releaseFlexNode,
  removeChild,
  resolveProps,
  setClassNameResolver,
  TGENodeImpl,
} from "./ffi/node"
export type {
  ClassNameResolver,
  NodeCanvasExtra,
  NodeCompositorExtra,
  NodeImageExtra,
  NodeTransformExtra,
  TGENode,
  TGENodeKind,
} from "./ffi/node"

export {
  setRendererBackend,
  getRendererBackend,
  getRendererBackendName,
} from "./ffi/renderer-backend"
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
  RendererBackendRetainedLayer,
} from "./ffi/renderer-backend"
export { createGpuRendererBackend, createGpuRendererBackendForTesting, getGpuRendererBackendCacheStats } from "./ffi/gpu-renderer-backend"
export { chooseGpuLayerStrategy } from "./ffi/gpu-layer-strategy"
export type { GpuLayerStrategyInput, GpuLayerStrategyMode } from "./ffi/gpu-layer-strategy"
export type { GpuRendererBackend, GpuRendererBackendCacheStats } from "./ffi/gpu-renderer-backend"

export { BACKDROP_FILTER_KIND, buildRenderOp } from "./ffi/render-graph"
export type {
  RenderCommand,
  ShadowDef,
  EffectConfig,
  ImagePaintConfig,
  CanvasPaintConfig,
  TextMeta,
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
} from "./ffi/render-graph"
export { getRendererResourceStats } from "./ffi/resource-stats"
export type { ResourceStats } from "./ffi/resource-stats"
export {
  identity,
  translate,
  rotate,
  scale,
  scaleXY,
  skew,
  perspective,
  multiply,
  invert,
  transformPoint,
  transformBounds,
  fromConfig,
  isIdentity,
} from "./ffi/matrix"
export type { Matrix3 } from "./ffi/matrix"
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
} from "./ffi/damage"
export type { DamageRect, Rect, Point2D, TransformQuad } from "./ffi/damage"
export { createLayerStore } from "./ffi/layers"
export type { Layer, LayerStore } from "./ffi/layers"
export { msdfFontInit, msdfFontQuery, msdfMeasureText, isMsdfFontAvailable } from "./ffi/msdf-font"
export type { MsdfTextMeasurement } from "./ffi/msdf-font"
export {
  getTextLayoutCacheStats,
  layoutText,
  measureForLayout,
  measureTextConstrained,
  normalizeTextForLayout,
} from "./ffi/text-layout"
export type { LayoutLine, TextLayoutOptions } from "./ffi/text-layout"
export {
  EXPECTED_BRIDGE_VERSION,
  VEXART_SYMBOLS,
  VexartNativeError,
  openVexartLibrary,
  closeVexartLibrary,
} from "./ffi/vexart-bridge"
export { GRAPH_MAGIC, GRAPH_VERSION, vexartGetLastError, vexartVersion, assertBridgeVersion } from "./ffi/vexart-functions"

// ── Reconciler and render loop ───────────────────────────────────────────────

export {
  DIRTY_KIND,
  createDirtyTracker,
  onGlobalDirty,
  markDirty,
  isDirty,
  clearDirty,
} from "./reconciler/dirty"
export type { DirtyKind, DirtyScope, DirtyTracker } from "./reconciler/dirty"
export { markLayerDirtyByKey, markLayerDamageByKey } from "./loop/composite"

export { createHandle, getHandleNode } from "./reconciler/handle"
export {
  setFocusedId,
  dispatchFocusInput,
  getFocusedEntry,
  registerNodeFocusable,
  updateNodeFocusEntry,
  updateNodeFocusId,
  unregisterNodeFocusable,
  getNodeFocusId,
  resetFocus,
} from "./reconciler/focus"
export type { FocusEntry } from "./reconciler/focus"
export { buildNodeMouseEvent, isFullyOutsideScrollViewport } from "./reconciler/hit-test"
export {
  beginNodeInteraction,
  endNodeInteraction,
  hasActiveNodeInteraction,
  hasInteractionInSubtree,
  shouldPromoteInteractionLayer,
  shouldFreezeInteractionLayer,
} from "./reconciler/interaction"
export { bindLoop, unbindLoop, getCapturedNodeId, onPostScroll, markNodeLayerDamaged, requestInteractionFrame } from "./reconciler/pointer"

export {
  render as solidRender,
  effect,
  memo,
  createComponent,
  createElement,
  solidCreateTextNode as createTextNode,
  insertNode,
  insert,
  spread,
  setProp,
  mergeProps,
  use,
} from "./reconciler/reconciler"

export { createRenderLoop, setFrameProfileSink } from "./loop/loop"
export type { FrameProfile } from "./loop/types"
export type { RenderLoop, RenderLoopOptions } from "./loop/loop"
export { resetCompositorPathState } from "./animation/compositor-path"
export type { CompositorProperty } from "./animation/compositor-path"
export { resetActiveAnimations, hasActiveAnimations } from "./loop/animation"
export { debugFrameStart, debugUpdateStats, debugState, debugDumpCulledNodes, setDebug, isDebugEnabled } from "./loop/debug"
export type { DebugStats } from "./loop/debug"

// ── Internal input, scroll, image, scheduler, terminal, and output ──────────

export { dispatchInput, getLatestInteractionTrace } from "./loop/input"
export type { InteractionTrace, InputSubscriber } from "./loop/input"
export { createParser } from "./input/parser"
export type { InputHandler, InputParser } from "./input/parser"
export { parseKey } from "./input/keyboard"
export { parseMouse } from "./input/mouse"
export { NO_MODS, decodeMods } from "./input/types"
export { MOUSE_ACTION } from "./input/types"

export { updateScrollContainerGeometry, releaseScrollHandle, resetScrollHandles } from "./loop/scroll"
export { createScaledImageCache, decodeImageForNode, clearImageCache, getImageCacheStats } from "./loop/image"
export type { RawImage, ScaledImageCache, DecodedImage } from "./loop/image"
export { boostWindowFor, hasRecentInteraction } from "./loop/frame-scheduler"
export type { InteractionKind, FrameSchedulerBoosts } from "./loop/frame-scheduler"

export { detect } from "./terminal/detect"
export { inferCaps, probeKittyGraphics, queryColors } from "./terminal/caps"
export { getSize, queryPixelSize, onResize } from "./terminal/size"
export { enter, leave, beginSync, endSync, installExitHandlers, setupExitHandlers, ProcessSignalHub } from "./terminal/lifecycle"
export { inTmux, parentTerminal, passthroughSupported, createWriter, wrapPassthrough } from "./terminal/tmux"

export { probeShm, getKittyTransportStats, resetKittyTransportStats, COMPRESS_MODE } from "./output/kitty"
export type { KittyTransportStats, RawImageData, CompressMode } from "./output/kitty"
export type { TransmissionMode } from "./output/transport-manager"
export {
  configureKittyTransportManager,
  getKittyTransportManagerState,
  reportKittyTransportFailure,
  reportKittyTransportSuccess,
  resetKittyTransportManager,
  resolveKittyTransportMode,
  TRANSPORT_FAILURE_REASON,
  TRANSPORT_HEALTH,
} from "./output/transport-manager"
export type { ConfigureKittyTransportManagerOptions, KittyTransportFailureReason, KittyTransportHealth, KittyTransportTelemetryBucket, KittyTransportManagerState } from "./output/transport-manager"
export { getNativeKittyShmHelperVersion, prepareNativeKittyShm, releaseNativeKittyShm } from "./output/kitty-shm-native"
export type { NativeKittyShmHandle } from "./output/kitty-shm-native"
