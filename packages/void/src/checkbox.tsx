/**
 * VoidCheckbox — shadcn-compatible checkbox using Void design tokens.
 *
 * Built on top of the headless @tge/components Checkbox.
 * 16×16px box, border-input, checked bg primary, check mark, focus glow.
 *
 * Usage:
 *   <VoidCheckbox checked={agreed()} onChange={setAgreed} label="I agree" />
 */

import { Checkbox } from "@tge/components"
import type { CheckboxRenderContext } from "@tge/components"
import { radius, space, font, glows } from "./tokens"
import { themeColors } from "./theme"

export type VoidCheckboxProps = {
  checked: boolean
  onChange?: (checked: boolean) => void
  label?: string
  disabled?: boolean
  focusId?: string
}

const BOX_SIZE = 16

export function VoidCheckbox(props: VoidCheckboxProps) {
  return (
    <Checkbox
      checked={props.checked}
      onChange={props.onChange}
      disabled={props.disabled}
      focusId={props.focusId}
      renderCheckbox={(ctx: CheckboxRenderContext) => (
        <box
          {...ctx.toggleProps}
          direction="row"
          alignY="center"
          gap={space[2]}
          opacity={ctx.disabled ? 0.5 : 1}
        >
          {/* Checkbox indicator */}
          <box
            width={BOX_SIZE}
            height={BOX_SIZE}
            cornerRadius={radius.sm}
            backgroundColor={ctx.checked ? themeColors.primary : themeColors.transparent}
            borderColor={
              ctx.focused ? themeColors.ring
                : ctx.checked ? themeColors.primary
                : themeColors.input
            }
            borderWidth={1}
            alignX="center"
            alignY="center"
            focusStyle={{
              borderColor: themeColors.ring,
              glow: glows.ring,
            }}
          >
            {ctx.checked ? (
              <text
                color={themeColors.primaryForeground}
                fontSize={font.xs}
              >
                ✓
              </text>
            ) : null}
          </box>
          {/* Label */}
          {props.label ? (
            <text
              color={ctx.disabled ? themeColors.mutedForeground : themeColors.foreground}
              fontSize={font.sm}
            >
              {props.label}
            </text>
          ) : null}
        </box>
      )}
    />
  )
}
