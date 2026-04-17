/**
 * Select — styled dropdown using Void design tokens.
 *
 * Built on top of the headless @tge/components Select.
 * Provides ALL visual rendering via render props.
 *
 * Usage:
 *   <VoidSelect
 *     value={value()}
 *     onChange={setValue}
 *     options={[
 *       { value: "dark", label: "Dark" },
 *       { value: "light", label: "Light" },
 *     ]}
 *     placeholder="Choose theme…"
 *   />
 */

import { Select } from "@vexart/headless"
import type { SelectOption, SelectTriggerContext, SelectOptionContext } from "@vexart/headless"
import { radius, space, font, shadows, glows } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

export type VoidSelectProps = {
  value?: string
  onChange?: (value: string) => void
  options?: SelectOption[]
  placeholder?: string
  disabled?: boolean
  focusId?: string
  width?: number | string
  children?: any
}

export function VoidSelect(props: VoidSelectProps) {
  if (props.options) {
    return (
      <Select
        value={props.value}
        onChange={props.onChange}
        options={props.options}
        placeholder={props.placeholder}
        disabled={props.disabled}
        focusId={props.focusId}
        renderTrigger={(ctx: SelectTriggerContext) => (
          <box
            direction="row"
            alignY="center"
            height={36}
            width={props.width}
            paddingLeft={space[3]}
            paddingRight={space[2]}
            backgroundColor={ctx.disabled ? themeColors.muted : themeColors.transparent}
            cornerRadius={radius.md}
            borderColor={ctx.focused ? themeColors.ring : themeColors.input}
            borderWidth={1}
            gap={space[2]}
            shadow={shadows.xs}
            focusStyle={{
              borderColor: themeColors.ring,
              borderWidth: 1,
              glow: glows.ring,
            }}
          >
            <box width="grow">
              <text
                color={
                  ctx.disabled ? themeColors.mutedForeground
                    : ctx.selectedLabel ? themeColors.foreground
                    : themeColors.mutedForeground
                }
                fontSize={font.sm}
              >
                {ctx.selectedLabel || ctx.placeholder || "Select…"}
              </text>
            </box>
            {/* Chevron */}
            <text color={themeColors.mutedForeground} fontSize={font.xs}>
              {ctx.open ? "⌃" : "⌄"}
            </text>
          </box>
        )}
        renderOption={(opt: SelectOption, ctx: SelectOptionContext) => (
          <box
            direction="row"
            alignY="center"
            gap={space[2]}
            paddingTop={space[1.5]}
            paddingBottom={space[1.5]}
            paddingLeft={space[2]}
            paddingRight={space[2]}
            backgroundColor={
              ctx.highlighted ? themeColors.accent
                : themeColors.transparent
            }
            cornerRadius={radius.sm}
            hoverStyle={{ backgroundColor: themeColors.accent }}
          >
            <box width="grow">
              <text
                color={ctx.disabled ? themeColors.mutedForeground : themeColors.foreground}
                fontSize={font.sm}
              >
                {opt.label}
              </text>
            </box>
            {/* Check indicator */}
            {ctx.selected ? (
              <text color={themeColors.foreground} fontSize={font.xs}>✓</text>
            ) : null}
          </box>
        )}
        renderContent={(children) => (
          <box
            direction="column"
            backgroundColor={themeColors.popover}
            cornerRadius={radius.md}
            borderColor={themeColors.border}
            borderWidth={1}
            padding={space[0.5]}
            shadow={shadows.md}
            maxHeight={240}
            scrollY
          >
            {children}
          </box>
        )}
      />
    )
  }

  // Compound mode passthrough
  return (
    <Select
      value={props.value}
      onChange={props.onChange}
      disabled={props.disabled}
      focusId={props.focusId}
    >
      {props.children}
    </Select>
  )
}
