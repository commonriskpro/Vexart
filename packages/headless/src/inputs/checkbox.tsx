/**
 * Checkbox — truly headless toggleable checkbox.
 *
 * Handles focus and toggling while leaving visuals to `renderCheckbox`.
 *
 * @public
 */

import { createMemo } from "solid-js"
import type { JSX } from "solid-js"
import { createToggle, type ToggleRenderContext } from "../helpers/create-toggle"

// ── Types ──

/** @public */
export type CheckboxRenderContext = ToggleRenderContext

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

  const rendered = createMemo(() => props.renderCheckbox({
    checked: toggle.checked(),
    focused: toggle.focused(),
    disabled: toggle.disabled(),
    toggleProps: toggle.toggleProps,
  }))

  return <box width="fit" height="fit">{rendered}</box>
}
