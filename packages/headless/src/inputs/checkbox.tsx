/**
 * Checkbox — truly headless toggleable checkbox.
 *
 * Handles focus and toggling while leaving visuals to `renderCheckbox`.
 *
 * @public
 */

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

  const context: CheckboxRenderContext = {
    get checked() { return toggle.checked() },
    get focused() { return toggle.focused() },
    get disabled() { return toggle.disabled() },
    toggleProps: toggle.toggleProps,
  }

  // Invoke the render prop once. Its JSX property expressions track the
  // context getters and update the existing visual tree in place; rebuilding
  // this subtree on toggle/focus changes tears down and remounts nodes.
  return props.renderCheckbox(context)
}
