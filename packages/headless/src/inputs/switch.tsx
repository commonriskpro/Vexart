/**
 * Switch — truly headless toggle switch.
 *
 * Handles focus and toggling while leaving visuals to `renderSwitch`.
 *
 * @public
 */

import { createMemo } from "solid-js"
import type { JSX } from "solid-js"
import { createToggle, type ToggleRenderContext } from "../helpers/create-toggle"

// ── Types ──

/** @public */
export type SwitchRenderContext = ToggleRenderContext

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

  const rendered = createMemo(() => props.renderSwitch({
    checked: toggle.checked(),
    focused: toggle.focused(),
    disabled: toggle.disabled(),
    toggleProps: toggle.toggleProps,
  }))

  return <box width="fit" height="fit">{rendered}</box>
}
