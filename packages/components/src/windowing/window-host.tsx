import type { JSX } from "solid-js"
import { useWindowDescriptor } from "./context"
import { WINDOW_STATUS, type WindowDescriptor } from "./types"
import { WindowFrame, type WindowFrameProps } from "./window-frame"

export interface WindowHostProps extends Omit<WindowFrameProps, "windowId"> {
  windowId: string
  renderMinimized?: (window: WindowDescriptor) => JSX.Element
}

export function WindowHost(props: WindowHostProps) {
  const window = useWindowDescriptor(props.windowId)

  return (() => {
    const currentWindow = window()
    if (!currentWindow) return null

    if (currentWindow.status === WINDOW_STATUS.MINIMIZED) {
      if (!props.renderMinimized) return null
      return props.renderMinimized(currentWindow)
    }

    return (
      <WindowFrame
        windowId={props.windowId}
        renderContent={props.renderContent}
        renderHeader={props.renderHeader}
        onDragDebugEvent={props.onDragDebugEvent}
        layer={props.layer}
        draggable={props.draggable}
        resizable={props.resizable}
        dragRegionTopInset={props.dragRegionTopInset}
        dragRegionHeight={props.dragRegionHeight}
        dragRegionLeftInset={props.dragRegionLeftInset}
        dragRegionRightInset={props.dragRegionRightInset}
        borderWidth={props.borderWidth}
        cornerRadius={props.cornerRadius}
        contentPadding={props.contentPadding}
        gap={props.gap}
        activeBackgroundColor={props.activeBackgroundColor}
        inactiveBackgroundColor={props.inactiveBackgroundColor}
        activeBorderColor={props.activeBorderColor}
        inactiveBorderColor={props.inactiveBorderColor}
        activeShadow={props.activeShadow}
        inactiveShadow={props.inactiveShadow}
      >
        {props.children}
      </WindowFrame>
    )
  })()
}
