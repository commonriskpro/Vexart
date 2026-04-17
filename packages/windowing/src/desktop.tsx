import { createMemo, For, type JSX } from "solid-js"
import { WINDOW_STATUS, type WindowBounds, type WindowDescriptor, type WindowManager } from "./types"
import { WindowManagerProvider, type WindowWorkspaceInput, useWindowManagerContext } from "./context"
import { resolveDesktopBounds, resolveDesktopWorkspace, resolveTaskbarBounds } from "./desktop-layout"
import { WindowHost } from "./window-host"

export interface DesktopTaskbarRenderContext {
  bounds?: WindowBounds
  workspace?: WindowBounds
}

export interface DesktopProps {
  manager: WindowManager
  workspace?: WindowWorkspaceInput
  width?: number | string
  height?: number | string
  taskbarHeight?: number
  backgroundColor?: string | number
  children?: JSX.Element
  emptyState?: JSX.Element
  renderTaskbar?: (context: DesktopTaskbarRenderContext) => JSX.Element
  renderWindow?: (window: WindowDescriptor) => JSX.Element
}

interface DesktopSurfaceProps {
  width?: number | string
  height?: number | string
  backgroundColor?: string | number
  children?: JSX.Element
  emptyState?: JSX.Element
  desktopBounds?: WindowBounds
  taskbarBounds?: WindowBounds
  workspaceBounds?: WindowBounds
  renderTaskbar?: (context: DesktopTaskbarRenderContext) => JSX.Element
  renderWindow?: (window: WindowDescriptor) => JSX.Element
}

function DesktopSurface(props: DesktopSurfaceProps) {
  const context = useWindowManagerContext()

  const width = () => props.width ?? props.desktopBounds?.width ?? "100%"
  const height = () => props.height ?? props.desktopBounds?.height ?? "100%"
  const visibleWindowCount = () => context.windows().filter((window) => window.status !== WINDOW_STATUS.MINIMIZED).length

  return (
      <box width={width()} height={height()} backgroundColor={props.backgroundColor}>
        {visibleWindowCount() === 0 ? props.emptyState : null}
        <For each={context.state().order}>{(windowId) => {
          const window = () => context.getWindow(windowId)
          return props.renderWindow
            ? (() => {
                const currentWindow = window()
                if (!currentWindow) return null
                return props.renderWindow(currentWindow)
              })()
            : <WindowHost windowId={windowId} />
        }}</For>
        {props.children}
        {props.renderTaskbar ? props.renderTaskbar({ bounds: props.taskbarBounds, workspace: props.workspaceBounds }) : null}
      </box>
  )
}

export function Desktop(props: DesktopProps) {
  const resolvedInputWorkspace = createMemo(() => typeof props.workspace === "function" ? props.workspace() : props.workspace)
  const bounds = createMemo(() => resolveDesktopBounds(resolvedInputWorkspace(), props.width, props.height))
  const workspaceBounds = createMemo(() => resolveDesktopWorkspace(bounds(), props.taskbarHeight))
  const taskbarBounds = createMemo(() => resolveTaskbarBounds(bounds(), props.taskbarHeight))

  return (
    <WindowManagerProvider manager={props.manager} workspace={workspaceBounds() ?? props.workspace}>
      <DesktopSurface
        width={props.width}
        height={props.height}
        backgroundColor={props.backgroundColor}
        emptyState={props.emptyState}
        desktopBounds={bounds()}
        taskbarBounds={taskbarBounds()}
        workspaceBounds={workspaceBounds() ?? bounds()}
        renderTaskbar={props.renderTaskbar}
        renderWindow={props.renderWindow}
      >
        {props.children}
      </DesktopSurface>
    </WindowManagerProvider>
  )
}
