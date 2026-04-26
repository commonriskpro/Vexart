/**
 * Checkbox — truly headless toggleable checkbox.
 *
 * Handles focus and toggling while leaving visuals to `renderCheckbox`.
 *
 * @public
 */

import type { JSX } from "solid-js"
import { createToggle } from "../helpers/create-toggle"

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
  const toggle = createToggle({
    checked: () => props.checked,
    disabled: () => props.disabled ?? false,
    onChange: (checked) => props.onChange?.(checked),
    focusId: props.focusId,
  })

  return (
    <>
      {() => props.renderCheckbox({
        checked: toggle.checked(),
        focused: toggle.focused(),
        disabled: toggle.disabled(),
        toggleProps: toggle.toggleProps,
      })}
    </>
  )
}
