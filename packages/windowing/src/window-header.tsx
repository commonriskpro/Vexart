import type { JSX } from "solid-js"
import type { NodeMouseEvent } from "@tge/renderer-solid"
import { Text } from "../../components/src/text"
import { useWindowManagerContext, useWindowDescriptor } from "./context"
import type { WindowDragHandleProps } from "./use-window-drag"
import { WindowControls } from "./window-controls"

export interface WindowHeaderProps {
  windowId: string
  title?: string
  subtitle?: string
  leading?: JSX.Element
  trailing?: JSX.Element
  showControls?: boolean
  controls?: JSX.Element
  titleColor?: string | number
  subtitleColor?: string | number
  activeBackgroundColor?: string | number
  inactiveBackgroundColor?: string | number
  borderColor?: string | number
  paddingX?: number
  paddingY?: number
  dragHandleProps?: WindowDragHandleProps
  onMouseDown?: (event: NodeMouseEvent) => void
  onMouseMove?: (event: NodeMouseEvent) => void
  onMouseUp?: (event: NodeMouseEvent) => void
}

const DEFAULT_ACTIVE_BACKGROUND = 0xffffff08
const DEFAULT_INACTIVE_BACKGROUND = 0xffffff04
const DEFAULT_BORDER = 0xffffff10
const DEFAULT_TITLE = 0xf5f7fbff
const DEFAULT_SUBTITLE = 0x9ea6b5ff

export function WindowHeader(props: WindowHeaderProps) {
  const context = useWindowManagerContext()
  const window = useWindowDescriptor(props.windowId)

  return (() => {
    const currentWindow = window()
    if (!currentWindow) return null

    const title = props.title ?? currentWindow.title
    const showControls = props.showControls ?? true
    const backgroundColor = currentWindow.focused
      ? (props.activeBackgroundColor ?? DEFAULT_ACTIVE_BACKGROUND)
      : (props.inactiveBackgroundColor ?? DEFAULT_INACTIVE_BACKGROUND)

    const handleMouseDown = (event: NodeMouseEvent) => {
      props.dragHandleProps?.onMouseDown?.(event)
      props.onMouseDown?.(event)
    }

    const handleMouseMove = (event: NodeMouseEvent) => {
      props.dragHandleProps?.onMouseMove?.(event)
      props.onMouseMove?.(event)
    }

    const handleMouseUp = (event: NodeMouseEvent) => {
      props.dragHandleProps?.onMouseUp?.(event)
      props.onMouseUp?.(event)
    }

    return (
      <box
        ref={props.dragHandleProps?.ref}
        direction="row"
        alignY="center"
        width="grow"
        paddingX={props.paddingX ?? 10}
        paddingY={props.paddingY ?? 8}
        backgroundColor={backgroundColor}
        borderBottom={1}
        borderColor={props.borderColor ?? DEFAULT_BORDER}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onPress={() => context.focusWindow(currentWindow.id)}
      >
        {props.leading}
        <box width="grow" direction="column" gap={props.subtitle ? 2 : 0}>
          <Text color={props.titleColor ?? DEFAULT_TITLE} fontSize={12}>{title}</Text>
          {props.subtitle ? <Text color={props.subtitleColor ?? DEFAULT_SUBTITLE} fontSize={10}>{props.subtitle}</Text> : null}
        </box>
        {props.trailing}
        {showControls ? (props.controls ?? <WindowControls windowId={currentWindow.id} />) : null}
      </box>
    )
  })()
}
