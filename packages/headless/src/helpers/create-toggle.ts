import { useFocus } from "@vexart/engine"

/** Shared render context for toggle-based components (Checkbox, Switch). @public */
export type ToggleRenderContext = {
  checked: boolean
  focused: boolean
  disabled: boolean
  /** Spread on the root element for click toggle + keyboard + focus. */
  toggleProps: {
    focusable: true
    onPress: () => void
  }
}

export type ToggleOptions = {
  checked: () => boolean
  disabled?: () => boolean
  onChange?: (checked: boolean) => void
  focusId?: string
}

export function createToggle(options: ToggleOptions) {
  const disabled = options.disabled ?? (() => false)

  const { focused } = useFocus({
    id: options.focusId,
    onKeyDown(e) {
      if (e.key === "enter" || e.key === " ") {
        toggle()
      }
    },
  })

  function toggle() {
    if (disabled()) return
    options.onChange?.(!options.checked())
  }

  const toggleProps = {
    focusable: true as const,
    onPress: toggle,
  }

  return { checked: options.checked, disabled, focused, toggle, toggleProps }
}
