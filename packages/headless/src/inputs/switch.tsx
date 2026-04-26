/**
 * Switch — truly headless toggle switch.
 *
 * Handles focus and toggling while leaving visuals to `renderSwitch`.
 *
 * @public
 */

import type { JSX } from "solid-js"
import { createToggle } from "../helpers/create-toggle"

// ── Types ──

/** @public */
export type SwitchRenderContext = {
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
export type SwitchProps = {
  /** Whether the switch is on. */
  checked: boolean
  /** Called with the new value when toggled. */
  onChange?: (checked: boolean) => void
  /** Disabled state. */
  disabled?: boolean
  /** Focus ID override. */
  focusId?: string
  /** Render function — receives state, returns visual. */
  renderSwitch: (ctx: SwitchRenderContext) => JSX.Element
}

/** @public */
export function Switch(props: SwitchProps) {
  const toggle = createToggle({
    checked: () => props.checked,
    disabled: () => props.disabled ?? false,
    onChange: (checked) => props.onChange?.(checked),
    focusId: props.focusId,
  })

  return (
    <>
      {() => props.renderSwitch({
        checked: toggle.checked(),
        focused: toggle.focused(),
        disabled: toggle.disabled(),
        toggleProps: toggle.toggleProps,
      })}
    </>
  )
}
