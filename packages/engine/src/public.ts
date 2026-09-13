/**
 * @vexart/engine public API.
 *
 * This module intentionally exposes only user-facing engine contracts. The
 * retained scene tree, reconciler, native bridge, render pipeline, terminal
 * transport, and compiler helpers live in ./internal.ts for workspace use.
 * Keep this list explicit: the package index is the only public entrypoint.
 */

// ── Mount & terminal ─────────────────────────────────────────────────────────

export { MouseButton, RGBA, useTerminalDimensions, decodePasteBytes, mount } from "./mount"
export type { MountOptions, MountHandle } from "./mount"

export { createTerminal } from "./terminal/index"
export type { Terminal, TerminalOptions } from "./terminal/index"
export type { Capabilities } from "./terminal/caps"
export type { TerminalKind } from "./terminal/detect"
export type { ResizeHandler, TerminalSize } from "./terminal/size"

// ── JSX contracts & handles ──────────────────────────────────────────────────

export type {
  CornerRadii,
  FilterConfig,
  GlowConfig,
  GradientConfig,
  InteractionMode,
  InteractiveStyleProps,
  LayoutRect,
  NodeMouseEvent,
  PressEvent,
  ShadowConfig,
  SizingInfo,
  SizingKeyword,
  SizingPercent,
  SizingPx,
  SizingUnit,
  TGEProps,
  TransformConfig,
  ViewportConfig,
} from "./ffi/node"

export type {
  GridAreaPlacement,
  GridAutoFlow,
  GridBreadth,
  GridContentAlignment,
  GridErrorCode,
  GridFitContent,
  GridFr,
  GridItemAlignment,
  GridLineRef,
  GridLayoutError,
  GridMaxBreadth,
  GridMinMax,
  GridPercent,
  GridPlacement,
  GridRepeatCount,
  GridTrack,
  GridTrackSize,
} from "./ffi/grid-types"

export type { NodeHandle } from "./reconciler/handle"

// ── Input & interaction hooks ────────────────────────────────────────────────

export { focusedId, setFocus, clearFocus, pushFocusScope, useFocus } from "./reconciler/focus"
export type { FocusHandle } from "./reconciler/focus"

export { useDrag } from "./reconciler/drag"
export { useHover } from "./reconciler/hover"
export { useInteractionLayer } from "./reconciler/interaction"
export { setPointerCapture, releasePointerCapture, onPostScroll } from "./reconciler/pointer"
export type { DragOptions, DragProps, DragState } from "./reconciler/drag"
export type { HoverOptions, HoverProps, HoverState } from "./reconciler/hover"
export type { InteractionBinding, InteractionLayerState } from "./reconciler/interaction"

export { getSelection, getSelectedText, setSelection, clearSelection, selectionSignal } from "./reconciler/selection"
export type { TextSelection } from "./reconciler/selection"

export { onInput, useKeyboard, useMouse, useInput } from "./loop/input"
export type { KeyboardState, MouseState } from "./loop/input"
export type {
  FocusEvent,
  InputEvent,
  KeyEvent,
  Modifiers,
  MouseAction,
  MouseEvent,
  PasteEvent,
  ResizeEvent,
} from "./input/types"

// ── Data & animation ─────────────────────────────────────────────────────────

export { useQuery, useMutation } from "./reconciler/data"
export type { MutationOptions, MutationResult, QueryOptions, QueryResult } from "./reconciler/data"

export { createTransition, createSpring, easing } from "./loop/animation"
export type {
  AnimationAccessor,
  AnimationSignal,
  EasingFn,
  SpringConfig,
  TransitionConfig,
} from "./loop/animation"

// ── Scrolling ─────────────────────────────────────────────────────────────────

export { createScrollHandle, releaseScrollHandle } from "./loop/scroll"
export type { ScrollHandle } from "./loop/scroll"

// ── Debug controls ──────────────────────────────────────────────────────────

export { debugDumpTree, isDebugEnabled, setDebug, toggleDebug, debugStatsLine } from "./loop/debug"
export { getImageCacheStats } from "./loop/image"

// ── Canvas, fonts & particles ────────────────────────────────────────────────

export { CanvasContext } from "./ffi/canvas"
export type {
  BezierCmd,
  CanvasDrawCommand,
  CircleCmd,
  DrawCmd,
  FillStyle,
  GlowCmd,
  ImageCmd,
  LineCmd,
  LinearGradientCmd,
  NebulaCmd,
  PolygonCmd,
  RadialGradientCmd,
  RectCmd,
  ShapeStyle,
  StarfieldCmd,
  StrokeStyle,
  TextCmd,
  Viewport,
} from "./ffi/canvas"

export {
  clearFontRegistry,
  clearTextCache,
  getFont,
  measureText,
  measureTextWidth,
  registerFont,
  unregisterFont,
} from "./ffi/text-layout"
export type { FontDescriptor, MeasureTextOptions } from "./ffi/text-layout"

export { createParticleSystem } from "./ffi/particles"
export type { ParticleConfig, ParticleSystem } from "./ffi/particles"

// ── Text & syntax ────────────────────────────────────────────────────────────

export { ExtmarkManager } from "./reconciler/extmarks"
export type { CreateExtmarkOptions, Extmark } from "./reconciler/extmarks"

export {
  TreeSitterClient,
  addDefaultParsers,
  getTreeSitterClient,
  KANAGAWA,
  ONE_DARK,
  SyntaxStyle,
  highlightsToTokens,
} from "./reconciler/tree-sitter"
export type {
  FiletypeParserConfig,
  SimpleHighlight,
  SimpleThemeRules,
  StyleDefinition,
  ThemeTokenStyle,
  Token,
} from "./reconciler/tree-sitter"

// ── Plugins ──────────────────────────────────────────────────────────────────

export { createSlot, createSlotRegistry } from "./reconciler/plugins"
export type { SlotComponent, SlotRegistry, TgePlugin, TgePluginApi } from "./reconciler/plugins"

// ── Solid control flow ────────────────────────────────────────────────────────

export { ErrorBoundary, For, Index, Match, Show, Switch } from "solid-js"
export { createComponent, createContext, createEffect, createMemo, useContext } from "solid-js"
