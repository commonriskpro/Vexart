import { Button } from "../../components/src/button"
import { Text } from "../../components/src/text"
import { useWindowManagerContext, useWindowDescriptor } from "./context"
import { WINDOW_STATUS } from "./types"

export interface WindowControlsProps {
  windowId: string
  showMinimize?: boolean
  showMaximize?: boolean
  showClose?: boolean
  gap?: number
  buttonSize?: number
}

const CONTROL_BG = 0xffffff08
const CONTROL_BORDER = 0xffffff14
const CONTROL_TEXT = 0xe7ebf3ff
const CONTROL_DISABLED_BG = 0xffffff04
const CONTROL_DISABLED_TEXT = 0x7f8796ff

interface ControlButtonProps {
  label: string
  disabled: boolean
  onPress: () => void
  size: number
}

function ControlButton(props: ControlButtonProps) {
  return (
    <Button
      disabled={props.disabled}
      onPress={props.onPress}
      renderButton={(button) => (
        <box
          {...button.buttonProps}
          width={props.size}
          height={props.size}
          alignX="center"
          alignY="center"
          backgroundColor={button.disabled ? CONTROL_DISABLED_BG : CONTROL_BG}
          borderColor={CONTROL_BORDER}
          borderWidth={1}
          cornerRadius={4}
        >
          <Text color={button.disabled ? CONTROL_DISABLED_TEXT : CONTROL_TEXT} fontSize={10}>{props.label}</Text>
        </box>
      )}
    />
  )
}

export function WindowControls(props: WindowControlsProps) {
  const context = useWindowManagerContext()
  const window = useWindowDescriptor(props.windowId)

  return (() => {
    const currentWindow = window()
    if (!currentWindow) return null

    const canMaximize = currentWindow.capabilities.maximizable && context.workspace() !== undefined
    const maximizeLabel = currentWindow.status === WINDOW_STATUS.MAXIMIZED ? "▣" : "□"

    return (
      <box direction="row" gap={props.gap ?? 6}>
        {props.showMinimize === false ? null : (
          <ControlButton
            label="—"
            disabled={!currentWindow.capabilities.minimizable}
            onPress={() => context.toggleMinimize(currentWindow.id)}
            size={props.buttonSize ?? 18}
          />
        )}
        {props.showMaximize === false ? null : (
          <ControlButton
            label={maximizeLabel}
            disabled={!canMaximize}
            onPress={() => context.toggleMaximize(currentWindow.id)}
            size={props.buttonSize ?? 18}
          />
        )}
        {props.showClose === false ? null : (
          <ControlButton
            label="×"
            disabled={!currentWindow.capabilities.closable}
            onPress={() => context.closeWindow(currentWindow.id)}
            size={props.buttonSize ?? 18}
          />
        )}
      </box>
    )
  })()
}
