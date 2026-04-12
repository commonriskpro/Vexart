/**
 * Switch — truly headless toggle switch.
 *
 * CONTROLLED component — parent owns the checked state.
 * Focus-aware with Enter/Space toggle.
 *
 * This is a BEHAVIOR-ONLY component. It provides:
 *   - Focus management (useFocus)
 *   - Keyboard toggle (Enter/Space)
 *   - Checked state tracking
 *
 * ALL visual styling is the consumer's responsibility via renderSwitch.
 * Use @tge/void VoidSwitch for a styled version.
 *
 * Usage:
 *   <Switch
 *     checked={enabled()}
 *     onChange={setEnabled}
 *     renderSwitch={({ checked, focused, disabled }) => (
 *       <box direction="row" gap={8} alignY="center">
 *         <box width={36} height={20} backgroundColor={checked ? "#22c55e" : "#333"} cornerRadius={10}>
 *           <box width={14} height={14} backgroundColor="#fff" cornerRadius={7} />
 *         </box>
 *         <text>Dark mode</text>
 *       </box>
 *     )}
 *   />
 */

import type { JSX } from "solid-js"
import { useFocus } from "@tge/renderer"

// ── Types ──

export type SwitchRenderContext = {
  checked: boolean
  focused: boolean
  disabled: boolean
}

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

  return (
    <>
      {props.renderSwitch({
        checked: props.checked,
        focused: focused(),
        disabled: disabled(),
      })}
    </>
  )
}
