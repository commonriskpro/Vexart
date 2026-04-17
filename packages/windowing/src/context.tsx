import { createContext, createSignal, onCleanup, useContext, type Accessor, type JSX } from "solid-js"
import type { WindowBounds, WindowDescriptor, WindowManager, WindowManagerState, WindowOpenInput, WindowPositionPatch, WindowSizePatch } from "./types"

export type WindowWorkspaceInput = Accessor<WindowBounds | undefined> | WindowBounds | undefined

export interface WindowManagerBindings {
  manager: WindowManager
  state: Accessor<WindowManagerState>
  windows: Accessor<WindowDescriptor[]>
  focusedWindowId: Accessor<string | null>
  workspace: Accessor<WindowBounds | undefined>
  getWindow: (id: string) => WindowDescriptor | undefined
  openWindow: (input: WindowOpenInput) => void
  closeWindow: (id: string) => void
  focusWindow: (id: string) => void
  bringToFront: (id: string) => void
  moveWindow: (id: string, next: WindowPositionPatch) => void
  resizeWindow: (id: string, next: WindowSizePatch) => void
  minimizeWindow: (id: string) => void
  maximizeWindow: (id: string) => void
  restoreWindow: (id: string) => void
  toggleMinimize: (id: string) => void
  toggleMaximize: (id: string) => void
  dispose: () => void
}

export interface WindowManagerProviderProps {
  manager: WindowManager
  workspace?: WindowWorkspaceInput
  children?: JSX.Element
}

export interface WindowManagerContextValue extends WindowManagerBindings {}

function cloneBounds(bounds: WindowBounds): WindowBounds {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }
}

function resolveWorkspace(workspace?: WindowWorkspaceInput): WindowBounds | undefined {
  if (!workspace) return undefined
  if (typeof workspace === "function") {
    const current = workspace()
    if (!current) return undefined
    return cloneBounds(current)
  }
  return cloneBounds(workspace)
}

function listWindows(state: WindowManagerState): WindowDescriptor[] {
  return state.order
    .map((id) => state.windowsById[id])
    .filter((window): window is WindowDescriptor => window !== undefined)
}

export function createWindowManagerBindings(manager: WindowManager, workspace?: WindowWorkspaceInput): WindowManagerBindings {
  const [state, setState] = createSignal(manager.getState())
  const unsubscribe = manager.subscribe((next) => {
    setState(() => next)
  })

  const workspaceAccessor = () => resolveWorkspace(workspace)

  return {
    manager,
    state,
    windows: () => listWindows(state()),
    focusedWindowId: () => state().focusedWindowId,
    workspace: workspaceAccessor,
    getWindow: (id: string) => state().windowsById[id],
    openWindow: (input: WindowOpenInput) => manager.openWindow(input),
    closeWindow: (id: string) => manager.closeWindow(id),
    focusWindow: (id: string) => manager.focusWindow(id),
    bringToFront: (id: string) => manager.bringToFront(id),
    moveWindow: (id: string, next: WindowPositionPatch) => manager.moveWindow(id, next),
    resizeWindow: (id: string, next: WindowSizePatch) => manager.resizeWindow(id, next),
    minimizeWindow: (id: string) => manager.minimizeWindow(id),
    maximizeWindow: (id: string) => {
      const currentWorkspace = workspaceAccessor()
      if (!currentWorkspace) return
      manager.maximizeWindow(id, currentWorkspace)
    },
    restoreWindow: (id: string) => manager.restoreWindow(id),
    toggleMinimize: (id: string) => manager.toggleMinimize(id),
    toggleMaximize: (id: string) => {
      const currentWorkspace = workspaceAccessor()
      if (!currentWorkspace) return
      manager.toggleMaximize(id, currentWorkspace)
    },
    dispose: unsubscribe,
  }
}

const WindowManagerContext = createContext<WindowManagerContextValue>()

export function WindowManagerProvider(props: WindowManagerProviderProps) {
  const bindings = createWindowManagerBindings(props.manager, props.workspace)
  onCleanup(bindings.dispose)

  return (
    <WindowManagerContext.Provider value={bindings}>
      {props.children}
    </WindowManagerContext.Provider>
  )
}

export function useWindowManagerContext(): WindowManagerContextValue {
  const context = useContext(WindowManagerContext)
  if (!context) {
    throw new Error("Windowing components must be used inside <WindowManagerProvider>")
  }
  return context
}

export function useWindowDescriptor(windowId: string): Accessor<WindowDescriptor | undefined> {
  const context = useWindowManagerContext()
  return () => context.getWindow(windowId)
}

export function useWindowList(): Accessor<WindowDescriptor[]> {
  const context = useWindowManagerContext()
  return () => context.windows()
}
