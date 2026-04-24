/**
 * Checkbox — truly headless toggleable checkbox.
 *
 * Handles focus and toggling while leaving visuals to `renderCheckbox`.
 *
 * @public
 */

import type { JSX } from "solid-js"
import { useFocus } from "@vexart/engine"

// ── Types ──

/** @public */
export type CheckboxRenderContext = {
  checked: boolean
  focused: boolean
  disabled: boolean
  /** Spread on the root element for click toggle + keyboard + focus. */
  toggleProps: {
    focusable: true
    onPress: () => void
  }
}

/** @public */
export type CheckboxProps = {
  /** Whether the checkbox is checked. */
  checked: boolean
  /** Called with the new value when toggled. */
  onChange?: (checked: boolean) => void
  /** Disabled state. */
  disabled?: boolean
  /** Focus ID override. */
  focusId?: string
  /** Render function — receives state, returns visual. */
  renderCheckbox: (ctx: CheckboxRenderContext) => JSX.Element
}

/** @public */
export function Checkbox(props: CheckboxProps) {
  const disabled = () => props.disabled ?? false

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      if (e.key === "enter" || e.key === " ") {
        props.onChange?.(!props.checked)
      }
    },
  })

  function handleToggle() {
    if (disabled()) return
    props.onChange?.(!props.checked)
  }

  return (
    <>
      {() => props.renderCheckbox({
        checked: props.checked,
        focused: focused(),
        disabled: disabled(),
        toggleProps: {
          focusable: true,
          onPress: handleToggle,
        },
      })}
    </>
  )
}
