export { createWindowManager } from "./manager"
export { createWindowManagerBindings, WindowManagerProvider, useWindowDescriptor, useWindowList, useWindowManagerContext } from "./context"
export { Desktop } from "./desktop"
export { resolveDesktopBounds, resolveDesktopWorkspace, resolveTaskbarBounds } from "./desktop-layout"
export { Taskbar } from "./taskbar"
export { getTaskbarAction, listTaskbarWindows, TASKBAR_ACTION } from "./taskbar-helpers"
export { useWindowDrag, clampWindowPosition, resolveWindowDragPosition, isPointInWindowDragRegion } from "./use-window-drag"
export { useWindowResize, WINDOW_RESIZE_EDGE, createWindowResizeHandleLayouts, resolveWindowResizeBounds } from "./use-window-resize"
export { WindowHost } from "./window-host"
export { WindowFrame } from "./window-frame"
export { WindowHeader } from "./window-header"
export { WindowControls } from "./window-controls"
export { WindowResizeHandles } from "./window-resize-handles"
export {
  WINDOW_PLACEMENT,
  WINDOW_STATUS,
} from "./types"
export type {
  WindowManagerBindings,
  WindowManagerContextValue,
  WindowManagerProviderProps,
  WindowWorkspaceInput,
} from "./context"
export type { DesktopProps, DesktopTaskbarRenderContext } from "./desktop"
export type { TaskbarItemRenderContext, TaskbarProps } from "./taskbar"
export type { TaskbarAction } from "./taskbar-helpers"
export type { UseWindowDragOptions, UseWindowDragResult, WindowDragAnchor, WindowDragHandleProps, WindowDragRegion, WindowFrameRefProps } from "./use-window-drag"
export type { UseWindowResizeOptions, UseWindowResizeResult, WindowResizeAnchor, WindowResizeEdge, WindowResizeFrameProps, WindowResizeHandleLayout, WindowResizeHandleProps } from "./use-window-resize"
export type { WindowHostProps } from "./window-host"
export type { WindowFrameHeaderRenderContext, WindowFrameProps } from "./window-frame"
export type { WindowHeaderProps } from "./window-header"
export type { WindowControlsProps } from "./window-controls"
export type { WindowResizeHandlesProps } from "./window-resize-handles"
export type {
  WindowBounds,
  WindowCapabilities,
  WindowConstraints,
  WindowDescriptor,
  WindowManager,
  WindowManagerListener,
  WindowManagerOptions,
  WindowManagerState,
  WindowOpenInput,
  WindowPlacement,
  WindowPosition,
  WindowPositionPatch,
  WindowSize,
  WindowSizePatch,
  WindowStatus,
} from "./types"
