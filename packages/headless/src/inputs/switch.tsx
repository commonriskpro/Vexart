/**
 * Switch — truly headless toggle switch.
 *
 * Handles focus and toggling while leaving visuals to `renderSwitch`.
 *
 * @public
 */

import type { JSX } from "solid-js"
import { useFocus } from "@vexart/engine"

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
      {() => props.renderSwitch({
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
