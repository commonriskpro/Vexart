/**
 * Checkbox — toggleable checkbox for TGE.
 *
 * Focus-aware with Enter/Space toggle. Uses pixel-rendered
 * indicator (filled square when checked, empty when not).
 *
 * This is a CONTROLLED component — the parent owns the checked state.
 * The checkbox calls onChange when toggled, but doesn't flip itself.
 *
 * Usage:
 *   const [agreed, setAgreed] = createSignal(false)
 *   <Checkbox
 *     checked={agreed()}
 *     onChange={setAgreed}
 *     label="I agree to the terms"
 *   />
 */

import type { JSX } from "solid-js"
import { useFocus } from "@tge/renderer"
import {
  surface,
  accent,
  text as textTokens,
  border,
  radius,
  spacing,
} from "@tge/tokens"

export type CheckboxProps = {
  /** Whether the checkbox is checked. */
  checked: boolean

  /** Called with the new value when toggled. */
  onChange?: (checked: boolean) => void

  /** Label text displayed next to the checkbox. */
  label?: string

  /** Accent color for the checked indicator. Default: accent.thread. */
  color?: number

  /** Disabled state. */
  disabled?: boolean

  /** Focus ID override. */
  focusId?: string
}

export function Checkbox(props: CheckboxProps) {
  const color = () => props.color ?? accent.thread
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

  const boxBorderColor = () => {
    if (disabled()) return border.subtle
    if (focused()) return color()
    return border.normal
  }

  return (
    <box direction="row" gap={spacing.md} alignY="center">
      {/* Checkbox indicator */}
      <box
        width={16}
        height={16}
        backgroundColor={props.checked ? color() : surface.card}
        cornerRadius={radius.sm}
        borderColor={boxBorderColor()}
        borderWidth={focused() ? 2 : 1}
      />
      {/* Label */}
      {props.label ? (
        <text
          color={disabled() ? textTokens.muted : textTokens.secondary}
          fontSize={14}
        >
          {props.label}
        </text>
      ) : null}
    </box>
  )
}
