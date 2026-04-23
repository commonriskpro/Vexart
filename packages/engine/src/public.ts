/**
 * @vexart/engine public API — explicit named exports.
 * Grouped by API-POLICY sections: FFI/Bridge, Reconciler, Loop, Input, Terminal, Output, Mount.
 * NO `export *` — every export is intentional.
 */

// ── FFI / Bridge ──────────────────────────────────────────────────────────────

export { setRendererBackend, getRendererBackend, getRendererBackendName } from "./ffi/renderer-backend"
export type {
  RendererBackend,
  RendererBackendFrameContext,
  RendererBackendLayerContext,
  RendererBackendPaintContext,
  RendererBackendPaintResult,
  RendererBackendFramePlan,
  RendererBackendFrameResult,
  RendererBackendLayerBacking,
} from "./ffi/renderer-backend"

export { createGpuRendererBackend, getGpuRendererBackendCacheStats } from "./ffi/gpu-renderer-backend"
export { createGpuFrameComposer } from "./output/gpu-frame-composer"
export { chooseGpuLayerStrategy } from "./ffi/gpu-layer-strategy"

export {
  BACKDROP_FILTER_KIND,
  createRenderGraphQueues,
  resetRenderGraphQueues,
  cloneRenderGraphQueues,
  buildRenderOp,
  buildRenderGraphFrame,
} from "./ffi/render-graph"
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
} from "./ffi/render-graph"

export { getRendererResourceStats } from "./ffi/resource-stats"

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
export type { DamageRect } from "./ffi/damage"

export { CanvasContext } from "./ffi/canvas"
export type { Viewport, StrokeStyle, FillStyle, ShapeStyle, CanvasDrawCommand } from "./ffi/canvas"

export {
  registerFont,
  getFont,
  clearTextCache,
  getTextLayoutCacheStats,
} from "./ffi/text-layout"
export type { FontDescriptor } from "./ffi/text-layout"
export { getFontAtlasCacheStats } from "./ffi/font-atlas"

export { createParticleSystem } from "./ffi/particles"
export type { ParticleConfig, ParticleSystem } from "./ffi/particles"

export {
  createLayerStore,
} from "./ffi/layers"
export type { Layer, LayerStore } from "./ffi/layers"

export {
  parseLayoutOutput,
  writeLayoutFromPositionedCommands,
  applyCommandLayout,
  POSITIONED_CMD_STRIDE,
} from "./ffi/layout-writeback"
export type { PositionedCommand } from "./ffi/layout-writeback"

export {
  SIZING,
  DIRECTION,
  ALIGN_X,
  ALIGN_Y,
  createNode,
  insertChild,
  removeChild,
  parseColor,
  parseSizing,
  parseDirection,
  parseAlignX,
  parseAlignY,
  createPressEvent,
  resolveProps,
} from "./ffi/node"
export type {
  TGENodeKind,
  InteractionMode,
  PressEvent,
  NodeMouseEvent,
  FilterConfig,
  InteractiveStyleProps,
  TGEProps,
  TGENode,
  LayoutRect,
  SizingInfo,
} from "./ffi/node"

export {
  EXPECTED_BRIDGE_VERSION,
  VexartNativeError,
  openVexartLibrary,
  closeVexartLibrary,
} from "./ffi/vexart-bridge"

export {
  GRAPH_MAGIC,
  GRAPH_VERSION,
  vexartGetLastError,
  vexartVersion,
  assertBridgeVersion,
  writeHeader,
} from "./ffi/vexart-functions"

// ── Reconciler ────────────────────────────────────────────────────────────────

export {
  useQuery,
  useMutation,
} from "./reconciler/data"
export type {
  QueryResult,
  QueryOptions,
  MutationResult,
  MutationOptions,
} from "./reconciler/data"

export {
  createDirtyTracker,
  onGlobalDirty,
  markDirty,
  isDirty,
  clearDirty,
} from "./reconciler/dirty"
export type { DirtyTracker } from "./reconciler/dirty"

export {
  useDrag,
} from "./reconciler/drag"
export type {
  DragOptions,
  DragProps,
  DragState,
} from "./reconciler/drag"

export { ExtmarkManager } from "./reconciler/extmarks"
export type { Extmark, CreateExtmarkOptions } from "./reconciler/extmarks"

export {
  focusedId,
  setFocusedId,
  setFocus,
  pushFocusScope,
  getFocusedEntry,
  useFocus,
  registerNodeFocusable,
  updateNodeFocusEntry,
  unregisterNodeFocusable,
  getNodeFocusId,
  resetFocus,
} from "./reconciler/focus"
export type { FocusEntry, FocusHandle } from "./reconciler/focus"

export { createHandle } from "./reconciler/handle"
export type { NodeHandle } from "./reconciler/handle"

export {
  buildNodeMouseEvent,
  isFullyOutsideScrollViewport,
} from "./reconciler/hit-test"

export { useHover } from "./reconciler/hover"
export type { HoverOptions, HoverProps, HoverState } from "./reconciler/hover"

export {
  beginNodeInteraction,
  endNodeInteraction,
  hasActiveNodeInteraction,
  hasInteractionInSubtree,
  shouldPromoteInteractionLayer,
  shouldFreezeInteractionLayer,
  useInteractionLayer,
} from "./reconciler/interaction"
export type { InteractionLayerState, InteractionBinding } from "./reconciler/interaction"

export {
  createSlotRegistry,
  createSlot,
} from "./reconciler/plugins"
export type {
  SlotComponent,
  TgePluginApi,
  TgePlugin,
  SlotRegistry,
} from "./reconciler/plugins"

export {
  bindLoop,
  unbindLoop,
  setPointerCapture,
  releasePointerCapture,
  onPostScroll,
  markNodeLayerDamaged,
  requestInteractionFrame,
} from "./reconciler/pointer"

export {
  useRouter,
  createRouter,
  createNavigationStack,
} from "./reconciler/router"
export type {
  NavigationEntry,
  RouteDefinition,
  RouteProps,
  RouterContextValue,
  RouterProps,
  FlatRouteProps,
  ScreenEntry,
  ScreenProps,
  NavigationStackHandle,
} from "./reconciler/router"

export {
  getSelection,
  getSelectedText,
  setSelection,
  clearSelection,
  selectionSignal,
  resetSelection,
} from "./reconciler/selection"
export type { TextSelection } from "./reconciler/selection"

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
  For,
  Show,
  Switch,
  Match,
  Index,
  ErrorBoundary,
} from "./reconciler/reconciler"

export {
  TreeSitterClient,
  getTreeSitterClient,
  addDefaultParsers,
} from "./reconciler/tree-sitter"
export {
  SyntaxStyle,
  ONE_DARK,
  KANAGAWA,
} from "./reconciler/tree-sitter"
export type { StyleDefinition, ThemeTokenStyle, SimpleThemeRules } from "./reconciler/tree-sitter"
export { highlightsToTokens } from "./reconciler/tree-sitter"
export type { Token } from "./reconciler/tree-sitter"
export type { SimpleHighlight, FiletypeParserConfig } from "./reconciler/tree-sitter"

// ── Loop ─────────────────────────────────────────────────────────────────────

export { createRenderLoop } from "./loop/loop"
export type { RenderLoop, RenderLoopOptions } from "./loop/loop"

export {
  onInput,
  dispatchInput,
  getLatestInteractionTrace,
  useKeyboard,
  useMouse,
  useInput,
} from "./loop/input"
export type {
  InteractionTrace,
  KeyboardState,
  MouseState,
} from "./loop/input"

export {
  updateScrollContainerGeometry,
  createScrollHandle,
  resetScrollHandles,
} from "./loop/scroll"
export type { ScrollHandle } from "./loop/scroll"

export {
  createScaledImageCache,
  decodeImageForNode,
  scaleImage,
  clearImageCache,
  getImageCacheStats,
} from "./loop/image"
export type { RawImage, ScaledImageCache } from "./loop/image"

export {
  boostWindowFor,
  hasRecentInteraction,
} from "./loop/frame-scheduler"
export type { InteractionKind, FrameSchedulerBoosts } from "./loop/frame-scheduler"

export {
  hasActiveAnimations,
  easing,
  createTransition,
  createSpring,
} from "./loop/animation"
export type {
  EasingFn,
  TransitionConfig,
  SpringConfig,
} from "./loop/animation"

export {
  toggleDebug,
  setDebug,
  isDebugEnabled,
  debugFrameStart,
  debugUpdateStats,
  debugState,
  debugStatsLine,
  debugDumpTree,
  debugDumpCulledNodes,
} from "./loop/debug"
export type { DebugStats } from "./loop/debug"

// ── Input ─────────────────────────────────────────────────────────────────────

export { createParser } from "./input/parser"
export type { InputHandler, InputParser } from "./input/parser"

export { parseKey } from "./input/keyboard"

export { parseMouse } from "./input/mouse"

export {
  NO_MODS,
  decodeMods,
} from "./input/types"
export type {
  Modifiers,
  KeyEvent,
  MouseAction,
  MouseEvent,
  FocusEvent,
  PasteEvent,
  ResizeEvent,
  InputEvent,
} from "./input/types"

// ── Terminal ──────────────────────────────────────────────────────────────────

export { createTerminal } from "./terminal/index"
export type { Terminal, TerminalOptions } from "./terminal/index"
export type { TerminalKind } from "./terminal/detect"
export type { Capabilities } from "./terminal/caps"
export type { TerminalSize, ResizeHandler } from "./terminal/size"
export { detect } from "./terminal/detect"
export { inferCaps, probeKittyGraphics, queryColors } from "./terminal/caps"
export { getSize, queryPixelSize, onResize } from "./terminal/size"
export { enter, leave, beginSync, endSync } from "./terminal/lifecycle"
export { inTmux, parentTerminal, passthroughSupported, createWriter, wrapPassthrough } from "./terminal/tmux"

// ── Output ────────────────────────────────────────────────────────────────────

export { createLayerComposer } from "./output/layer-composer"
export type { LayerComposer } from "./output/layer-composer"

export {
  probeShm,
  probeFile,
  patchRegion,
  transmitRaw,
  transmitRawAt,
  getKittyTransportStats,
  resetKittyTransportStats,
} from "./output/kitty"
export type { TransmissionMode, CompressMode } from "./output/kitty"

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
export type {
  KittyTransportFailureReason,
  KittyTransportHealth,
  KittyTransportManagerState,
} from "./output/transport-manager"

export {
  getNativeKittyShmHelperVersion,
  prepareNativeKittyShm,
  releaseNativeKittyShm,
} from "./output/kitty-shm-native"
export type { NativeKittyShmHandle } from "./output/kitty-shm-native"

// ── Mount ─────────────────────────────────────────────────────────────────────

export {
  MouseButton,
  RGBA,
  useTerminalDimensions,
  decodePasteBytes,
  mount,
} from "./mount"
export type { MountOptions, MountHandle } from "./mount"
export { createContext, useContext } from "solid-js"
