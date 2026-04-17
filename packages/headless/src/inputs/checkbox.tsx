/**
 * Checkbox — truly headless toggleable checkbox.
 *
 * CONTROLLED component — the parent owns the checked state.
 * Focus-aware with Enter/Space toggle.
 *
 * This is a BEHAVIOR-ONLY component. It provides:
 *   - Focus management (useFocus)
 *   - Keyboard toggle (Enter/Space)
 *   - Checked state tracking
 *
 * ALL visual styling is the consumer's responsibility via renderCheckbox.
 * Use @tge/void VoidCheckbox for a styled version.
 *
 * Usage:
 *   <Checkbox
 *     checked={agreed()}
 *     onChange={setAgreed}
 *     renderCheckbox={({ checked, focused, disabled }) => (
 *       <box direction="row" gap={8} alignY="center">
 *         <box width={16} height={16} backgroundColor={checked ? "#22c55e" : "#333"}
 *           cornerRadius={3} borderColor={focused ? "#22c55e" : "#666"} borderWidth={1} />
 *         <text>I agree</text>
 *       </box>
 *     )}
 *   />
 */

import type { JSX } from "solid-js"
import { useFocus } from "@vexart/engine"

// ── Types ──

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
