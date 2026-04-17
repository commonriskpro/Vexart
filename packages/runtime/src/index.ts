/**
 * UI-runtime boundary.
 *
 * This package now physically owns the runtime modules for input, focus,
 * pointer semantics, render-loop orchestration, debug state, and user-facing
 * runtime hooks.
 */

export type { RenderLoop, RenderLoopOptions } from "./loop"
export { createRenderLoop } from "./loop"

export { beginNodeInteraction, endNodeInteraction, useInteractionLayer } from "./interaction"
export type { InteractionBinding, InteractionLayerState } from "./interaction"

export { useKeyboard, useMouse, useInput, onInput } from "./input"
export type { KeyboardState, MouseState } from "./input"

export { useFocus, setFocus, focusedId, setFocusedId, pushFocusScope } from "./focus"
export type { FocusHandle } from "./focus"

export { setPointerCapture, releasePointerCapture, onPostScroll, markNodeLayerDamaged, requestInteractionFrame } from "./pointer"

export { useDrag } from "./drag"
export type { DragOptions, DragProps, DragState } from "./drag"

export { useHover } from "./hover"
export type { HoverOptions, HoverProps, HoverState } from "./hover"

export type { ScrollHandle } from "./scroll"
export { createScrollHandle, resetScrollHandles } from "./scroll"

export { createRouter, createNavigationStack, useRouter } from "./router"
export type {
  NavigationEntry,
  RouteDefinition,
  RouteProps,
  RouterContextValue,
  ScreenEntry,
  ScreenProps,
  NavigationStackHandle,
} from "./router"

export type { TextSelection } from "./selection"
export { getSelection, getSelectedText, setSelection, clearSelection, selectionSignal } from "./selection"

export {
  toggleDebug,
  setDebug,
  isDebugEnabled,
  debugFrameStart,
  debugUpdateStats,
  debugState,
  debugStatsLine,
  debugDumpTree,
} from "./debug"
export type { DebugStats } from "./debug"

export { markDirty } from "./dirty"
export { markAllDirty } from "../../core/src/layers"

export type { PressEvent, NodeMouseEvent, InteractionMode } from "../../core/src/node"
export type { NodeHandle } from "./handle"
export { createHandle } from "./handle"

export { createTransition, createSpring, easing, hasActiveAnimations } from "./animation"
export type { TransitionConfig, SpringConfig, EasingFn } from "./animation"

export { useQuery, useMutation } from "./data"
export type { QueryResult, QueryOptions, MutationResult, MutationOptions } from "./data"

export { clearImageCache, createScaledImageCache, getImageCacheStats } from "./image"
export type { RawImage, ScaledImageCache } from "./image"

// Extmarks — inline text decorations for textarea/editors
export { ExtmarkManager } from "./extmarks"
export type { Extmark, CreateExtmarkOptions } from "./extmarks"

// Syntax highlighting — tree-sitter based, framework-agnostic
export {
  TreeSitterClient,
  getTreeSitterClient,
  addDefaultParsers,
} from "./tree-sitter"
export {
  SyntaxStyle,
  ONE_DARK,
  KANAGAWA,
} from "./tree-sitter"
export { highlightsToTokens } from "./tree-sitter"
export type {
  Token,
  SimpleHighlight,
  FiletypeParserConfig,
  StyleDefinition,
  ThemeTokenStyle,
} from "./tree-sitter"
