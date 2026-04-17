import type { JSX } from "solid-js"
import type { ShadowConfig } from "../../components/src/box"
import { useWindowManagerContext, useWindowDescriptor } from "./context"
import { WINDOW_STATUS, type WindowDescriptor } from "./types"
import { useWindowDrag, type WindowDragHandleProps } from "./use-window-drag"
import { useWindowResize } from "./use-window-resize"
import { WindowResizeHandles } from "./window-resize-handles"
import { WindowHeader } from "./window-header"

type WindowFrameShadow = ShadowConfig | ShadowConfig[]

export interface WindowFrameHeaderRenderContext {
  dragging: boolean
  dragHandleProps?: WindowDragHandleProps
}

export interface WindowFrameProps {
  windowId: string
  children?: JSX.Element
  renderContent?: (window: WindowDescriptor) => JSX.Element
  renderHeader?: (window: WindowDescriptor, context: WindowFrameHeaderRenderContext) => JSX.Element
  onDragDebugEvent?: (message: string) => void
  layer?: boolean
  draggable?: boolean
  resizable?: boolean
  dragRegionTopInset?: number
  dragRegionHeight?: number
  dragRegionLeftInset?: number
  dragRegionRightInset?: number
  borderWidth?: number
  cornerRadius?: number
  contentPadding?: number
  gap?: number
  activeBackgroundColor?: string | number
  inactiveBackgroundColor?: string | number
  activeBorderColor?: string | number
  inactiveBorderColor?: string | number
  activeShadow?: WindowFrameShadow
  inactiveShadow?: WindowFrameShadow
}

const DEFAULT_ACTIVE_BACKGROUND = 0x181a20ff
const DEFAULT_INACTIVE_BACKGROUND = 0x111318f4
const DEFAULT_ACTIVE_BORDER = 0xffffff2a
const DEFAULT_INACTIVE_BORDER = 0xffffff14
const DEFAULT_ACTIVE_SHADOW: WindowFrameShadow = { x: 0, y: 14, blur: 28, color: 0x00000034 }
const DEFAULT_INACTIVE_SHADOW: WindowFrameShadow = { x: 0, y: 10, blur: 22, color: 0x00000024 }

export function WindowFrame(props: WindowFrameProps) {
  const context = useWindowManagerContext()
  const window = useWindowDescriptor(props.windowId)
  const drag = useWindowDrag(props.windowId, {
    disabled: () => props.draggable === false,
    onDebugEvent: props.onDragDebugEvent,
  })
  const resize = useWindowResize(props.windowId, {
    disabled: () => props.resizable === false,
  })

  const backgroundColor = () => window()?.focused
    ? (props.activeBackgroundColor ?? DEFAULT_ACTIVE_BACKGROUND)
    : (props.inactiveBackgroundColor ?? DEFAULT_INACTIVE_BACKGROUND)

  const borderColor = () => window()?.focused
    ? (props.activeBorderColor ?? DEFAULT_ACTIVE_BORDER)
    : (props.inactiveBorderColor ?? DEFAULT_INACTIVE_BORDER)

  const shadow = () => window()?.focused
    ? (props.activeShadow ?? DEFAULT_ACTIVE_SHADOW)
    : (props.inactiveShadow ?? DEFAULT_INACTIVE_SHADOW)

  const content = () => {
    const currentWindow = window()
    if (!currentWindow) return props.children
    if (props.renderContent) return props.renderContent(currentWindow)
    return props.children
  }

  return (() => {
    const currentWindow = window()
    if (!currentWindow) return null
    if (currentWindow.status === WINDOW_STATUS.MINIMIZED) return null
    const headerContext: WindowFrameHeaderRenderContext = {
      dragging: drag.dragging(),
      dragHandleProps: props.draggable === false
        ? undefined
        : {
            onMouseDown: drag.dragHandleProps.onMouseDown,
          },
    }

    return (
      <box
        ref={(handle) => {
          drag.frameProps.ref(handle)
          resize.frameProps.ref(handle)
        }}
        onMouseMove={drag.dragHandleProps.onMouseMove}
        onMouseUp={drag.dragHandleProps.onMouseUp}
        layer={props.layer ?? true}
        floating="root"
        focusable
        direction="column"
        floatOffset={{ x: currentWindow.bounds.x, y: currentWindow.bounds.y }}
        zIndex={currentWindow.zIndex}
        width={currentWindow.bounds.width}
        height={currentWindow.bounds.height}
        backgroundColor={backgroundColor()}
        borderColor={borderColor()}
        borderWidth={props.borderWidth ?? 1}
        cornerRadius={props.cornerRadius ?? 10}
        shadow={shadow()}
        onPress={() => context.focusWindow(currentWindow.id)}
      >
        {props.renderHeader
          ? props.renderHeader(currentWindow, headerContext)
          : <WindowHeader windowId={currentWindow.id} dragHandleProps={headerContext.dragHandleProps} />}
        <box width="grow" height="grow" direction="column" gap={props.gap ?? 0} padding={props.contentPadding ?? 10}>
          {content()}
        </box>
        {props.resizable === false ? null : <WindowResizeHandles bounds={currentWindow.bounds} getHandleProps={resize.getHandleProps} />}
      </box>
    )
  })()
}
