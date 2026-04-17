import type { JSX } from "solid-js"
import { Button } from "../../components/src/button"
import { Text } from "../../components/src/text"
import { useWindowList, useWindowManagerContext } from "./context"
import { getTaskbarAction, listTaskbarWindows, TASKBAR_ACTION, type TaskbarAction } from "./taskbar-helpers"
import type { WindowBounds, WindowDescriptor } from "./types"

export interface TaskbarItemRenderContext {
  action: TaskbarAction
  active: boolean
  minimized: boolean
  onPress: () => void
}

export interface TaskbarProps {
  bounds?: WindowBounds
  floating?: boolean
  height?: number
  gap?: number
  paddingX?: number
  paddingY?: number
  backgroundColor?: string | number
  borderColor?: string | number
  emptyState?: JSX.Element
  renderItem?: (window: WindowDescriptor, context: TaskbarItemRenderContext) => JSX.Element
}

const DEFAULT_BACKGROUND = 0x0f1116f2
const DEFAULT_BORDER = 0xffffff14
const DEFAULT_ITEM_BG = 0xffffff06
const DEFAULT_ITEM_ACTIVE_BG = 0xffffff10
const DEFAULT_ITEM_BORDER = 0xffffff12
const DEFAULT_ITEM_TEXT = 0xf5f7fbff
const DEFAULT_ITEM_MINIMIZED = 0xa5adbdff

function DefaultTaskbarItem(props: { window: WindowDescriptor; context: TaskbarItemRenderContext }) {
  return (
    <Button
      onPress={props.context.onPress}
      renderButton={(button) => (
        <box
          {...button.buttonProps}
          direction="row"
          alignY="center"
          gap={6}
          paddingX={10}
          paddingY={6}
          backgroundColor={props.context.active ? DEFAULT_ITEM_ACTIVE_BG : DEFAULT_ITEM_BG}
          borderColor={DEFAULT_ITEM_BORDER}
          borderWidth={1}
          cornerRadius={6}
        >
          <Text color={props.context.minimized ? DEFAULT_ITEM_MINIMIZED : DEFAULT_ITEM_TEXT} fontSize={11}>
            {props.window.title}
          </Text>
        </box>
      )}
    />
  )
}

export function Taskbar(props: TaskbarProps) {
  const context = useWindowManagerContext()
  const windows = useWindowList()

  const items = () => listTaskbarWindows(windows())

  function handleWindowPress(window: WindowDescriptor, action: TaskbarAction) {
    if (action === TASKBAR_ACTION.RESTORE) {
      context.restoreWindow(window.id)
      return
    }

    if (action === TASKBAR_ACTION.MINIMIZE) {
      context.minimizeWindow(window.id)
      return
    }

    context.focusWindow(window.id)
  }

  const content = () => (
    <box
      direction="row"
      alignY="center"
      width="grow"
      height={props.height ?? 40}
      gap={props.gap ?? 8}
      paddingX={props.paddingX ?? 10}
      paddingY={props.paddingY ?? 6}
      backgroundColor={props.backgroundColor ?? DEFAULT_BACKGROUND}
      borderColor={props.borderColor ?? DEFAULT_BORDER}
      borderTop={1}
    >
      {items().length === 0 ? props.emptyState : null}
      {items().map((window) => {
        const action = getTaskbarAction(window)
        const itemContext: TaskbarItemRenderContext = {
          action,
          active: window.focused,
          minimized: window.status === "minimized",
          onPress: () => handleWindowPress(window, action),
        }

        return props.renderItem
          ? props.renderItem(window, itemContext)
          : <DefaultTaskbarItem window={window} context={itemContext} />
      })}
    </box>
  )

  if (props.floating && props.bounds) {
    return (
      <box
        layer
        floating="root"
        floatOffset={{ x: props.bounds.x, y: props.bounds.y }}
        width={props.bounds.width}
        height={props.bounds.height}
        zIndex={2000}
      >
        {content()}
      </box>
    )
  }

  return content()
}
