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
import { colors, radius, space, font, weight, shadows } from "./tokens"

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
            backgroundColor={ctx.disabled ? colors.muted : colors.card}
            cornerRadius={radius.md}
            borderColor={ctx.focused ? colors.ring : ctx.disabled ? colors.muted : colors.input}
            borderWidth={ctx.focused ? 2 : 1}
            gap={space[1]}
          >
            <box width="grow">
              <text
                color={ctx.disabled ? colors.mutedForeground : colors.foreground}
                fontSize={font.sm}
              >
                {ctx.selectedLabel || ctx.placeholder}
              </text>
            </box>
            <text color={colors.mutedForeground} fontSize={font.xs}>
              {ctx.open ? "▲" : "▼"}
            </text>
          </box>
        )}
        renderOption={(opt: SelectOption, ctx: SelectOptionContext) => (
          <box
            backgroundColor={
              ctx.highlighted ? colors.accent : ctx.selected ? colors.secondary : colors.card
            }
            padding={space[1]}
            paddingX={space[2]}
          >
            <text
              color={ctx.disabled ? colors.mutedForeground : ctx.selected ? colors.primary : colors.foreground}
              fontSize={font.sm}
            >
              {opt.label}
            </text>
          </box>
        )}
        renderContent={(children) => (
          <box
            direction="column"
            backgroundColor={colors.popover}
            cornerRadius={radius.md}
            borderColor={colors.border}
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
