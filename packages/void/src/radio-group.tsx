/**
 * RadioGroup — styled radio button group using Void design tokens.
 *
 * Built on top of the headless @tge/components RadioGroup.
 * Provides ALL visual rendering via renderOption.
 *
 * Usage:
 *   <VoidRadioGroup
 *     value={plan()}
 *     onChange={setPlan}
 *     options={[
 *       { value: "free", label: "Free" },
 *       { value: "pro", label: "Pro" },
 *     ]}
 *   />
 */

import { RadioGroup } from "@tge/components"
import type { RadioOption, RadioOptionContext } from "@tge/components"
import { radius, space, font, weight } from "./tokens"
import { themeColors } from "./theme"

const INDICATOR_SIZE = 16
const DOT_SIZE = 8

export type VoidRadioGroupProps = {
  value?: string
  onChange?: (value: string) => void
  options: RadioOption[]
  disabled?: boolean
  focusId?: string
  direction?: "column" | "row"
}

export function VoidRadioGroup(props: VoidRadioGroupProps) {
  return (
    <RadioGroup
      value={props.value}
      onChange={props.onChange}
      options={props.options}
      disabled={props.disabled}
      focusId={props.focusId}
      renderOption={(opt: RadioOption, ctx: RadioOptionContext) => (
        <box direction="row" gap={space[2]} alignY="center">
          <box
            width={INDICATOR_SIZE}
            height={INDICATOR_SIZE}
            backgroundColor={themeColors.card}
            cornerRadius={INDICATOR_SIZE / 2}
            borderColor={
              ctx.focused
                ? themeColors.ring
                : ctx.selected
                  ? themeColors.primary
                  : ctx.disabled
                    ? themeColors.muted
                    : themeColors.border
            }
            borderWidth={ctx.focused ? 2 : 1}
            alignX="center"
            alignY="center"
          >
            {ctx.selected ? (
              <box
                width={DOT_SIZE}
                height={DOT_SIZE}
                backgroundColor={ctx.disabled ? themeColors.mutedForeground : themeColors.primary}
                cornerRadius={DOT_SIZE / 2}
              />
            ) : null}
          </box>
          <text
            color={ctx.disabled ? themeColors.mutedForeground : themeColors.foreground}
            fontSize={font.sm}
          >
            {opt.label}
          </text>
        </box>
      )}
      renderGroup={(children) => (
        <box
          direction={props.direction ?? "column"}
          gap={props.direction === "row" ? space[4] : space[2]}
        >
          {children}
        </box>
      )}
    />
  )
}
