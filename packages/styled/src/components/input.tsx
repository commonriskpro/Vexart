/**
 * VoidInput — styled single-line text input using Void design tokens.
 *
 * @public
 */

import { Input } from "@vexart/headless"
import type { InputRenderContext } from "@vexart/headless"
import { radius, space, font, shadows, glows } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export type VoidInputProps = {
  value: string
  onChange?: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  focusId?: string
  width?: number | string
}

/** @public */
export function VoidInput(props: VoidInputProps) {
  return (
    <Input
      value={props.value}
      onChange={props.onChange}
      onSubmit={props.onSubmit}
      placeholder={props.placeholder}
      disabled={props.disabled}
      focusId={props.focusId}
      renderInput={(ctx: InputRenderContext) => (
        <box
          {...ctx.inputProps}
          direction="row"
          alignY="center"
          width={props.width ?? "grow"}
          height={36}
          paddingLeft={space[3]}
          paddingRight={space[3]}
          backgroundColor={themeColors.card}
          cornerRadius={radius.md}
          borderColor={ctx.focused ? themeColors.ring : themeColors.input}
          borderWidth={1}
          shadow={shadows.xs}
          opacity={ctx.disabled ? 0.5 : 1}
          focusStyle={{
            borderColor: themeColors.ring,
            glow: glows.ring,
          }}
        >
          <text
            color={ctx.showPlaceholder ? themeColors.mutedForeground : themeColors.foreground}
            fontSize={font.sm}
          >
            {ctx.displayText}{ctx.focused && ctx.blink ? "│" : ""}
          </text>
        </box>
      )}
    />
  )
}
