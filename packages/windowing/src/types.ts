export const WINDOW_STATUS = {
  NORMAL: "normal",
  MINIMIZED: "minimized",
  MAXIMIZED: "maximized",
} as const

export type WindowStatus = (typeof WINDOW_STATUS)[keyof typeof WINDOW_STATUS]

export const WINDOW_PLACEMENT = {
  NORMAL: WINDOW_STATUS.NORMAL,
  MAXIMIZED: WINDOW_STATUS.MAXIMIZED,
} as const

export type WindowPlacement = (typeof WINDOW_PLACEMENT)[keyof typeof WINDOW_PLACEMENT]

export interface WindowPosition {
  x: number
  y: number
}

export interface WindowSize {
  width: number
  height: number
}

export interface WindowBounds extends WindowPosition, WindowSize {}

export interface WindowPositionPatch {
  x?: number
  y?: number
}

export interface WindowSizePatch {
  x?: number
  y?: number
  width?: number
  height?: number
}

export interface WindowConstraints {
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

export interface WindowCapabilities {
  movable: boolean
  resizable: boolean
  minimizable: boolean
  maximizable: boolean
  closable: boolean
}

export interface WindowDescriptor {
  id: string
  kind: string
  title: string
  status: WindowStatus
  bounds: WindowBounds
  restoreBounds?: WindowBounds
  restorePlacement?: WindowPlacement
  zIndex: number
  focused: boolean
  modal: boolean
  keepAlive: boolean
  capabilities: WindowCapabilities
  constraints: WindowConstraints
}

export interface WindowOpenInput {
  id: string
  kind: string
  title: string
  bounds: WindowBounds
  status?: WindowStatus
  restoreBounds?: WindowBounds
  restorePlacement?: WindowPlacement
  modal?: boolean
  keepAlive?: boolean
  capabilities?: Partial<WindowCapabilities>
  constraints?: WindowConstraints
}

export interface WindowManagerState {
  windowsById: Record<string, WindowDescriptor>
  order: string[]
  focusedWindowId: string | null
  activeModalId: string | null
}

export interface WindowManagerOptions {
  initialWindows?: WindowOpenInput[]
}

export type WindowManagerListener = (state: WindowManagerState) => void

export interface WindowManager {
  getState: () => WindowManagerState
  subscribe: (listener: WindowManagerListener) => () => void
  openWindow: (input: WindowOpenInput) => void
  closeWindow: (id: string) => void
  focusWindow: (id: string) => void
  bringToFront: (id: string) => void
  moveWindow: (id: string, next: WindowPositionPatch) => void
  resizeWindow: (id: string, next: WindowSizePatch) => void
  minimizeWindow: (id: string) => void
  maximizeWindow: (id: string, workspace: WindowBounds) => void
  restoreWindow: (id: string) => void
  toggleMinimize: (id: string) => void
  toggleMaximize: (id: string, workspace: WindowBounds) => void
  listWindows: () => WindowDescriptor[]
  getWindow: (id: string) => WindowDescriptor | undefined
}
