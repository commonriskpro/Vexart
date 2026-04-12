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

import { Select } from "@tge/components"
import type { SelectOption, SelectTriggerContext, SelectOptionContext } from "@tge/components"
import { radius, space, font, weight, shadows } from "./tokens"
import { themeColors } from "./theme"

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
            padding={space[1]}
            paddingX={space[2]}
            backgroundColor={ctx.disabled ? themeColors.muted : themeColors.card}
            cornerRadius={radius.md}
            borderColor={ctx.focused ? themeColors.ring : ctx.disabled ? themeColors.muted : themeColors.input}
            borderWidth={ctx.focused ? 2 : 1}
            gap={space[1]}
          >
            <box width="grow">
              <text
                color={ctx.disabled ? themeColors.mutedForeground : themeColors.foreground}
                fontSize={font.sm}
              >
                {ctx.selectedLabel || ctx.placeholder}
              </text>
            </box>
            <text color={themeColors.mutedForeground} fontSize={font.xs}>
              {ctx.open ? "▲" : "▼"}
            </text>
          </box>
        )}
        renderOption={(opt: SelectOption, ctx: SelectOptionContext) => (
          <box
            backgroundColor={
              ctx.highlighted ? themeColors.accent : ctx.selected ? themeColors.secondary : themeColors.card
            }
            padding={space[1]}
            paddingX={space[2]}
          >
            <text
              color={ctx.disabled ? themeColors.mutedForeground : ctx.selected ? themeColors.primary : themeColors.foreground}
              fontSize={font.sm}
            >
              {opt.label}
            </text>
          </box>
        )}
        renderContent={(children) => (
          <box
            direction="column"
            backgroundColor={themeColors.popover}
            cornerRadius={radius.md}
            borderColor={themeColors.border}
            borderWidth={1}
            paddingTop={space[0.5]}
            paddingBottom={space[0.5]}
            shadow={shadows.md}
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
