/**
 * Combobox — styled autocomplete dropdown using Void design tokens.
 *
 * Built on top of the headless @tge/components Combobox.
 * Provides input, dropdown, option, and empty state visuals.
 *
 * Usage:
 *   <VoidCombobox
 *     value={fruit()}
 *     onChange={setFruit}
 *     options={[
 *       { value: "apple", label: "Apple" },
 *       { value: "banana", label: "Banana" },
 *     ]}
 *     placeholder="Search fruit..."
 *   />
 */

import { Combobox } from "@tge/components"
import type { ComboboxOption, ComboboxInputContext, ComboboxOptionContext } from "@tge/components"
import { radius, space, font, weight, shadows } from "./tokens"
import { themeColors } from "./theme"

export type VoidComboboxProps = {
  value?: string
  onChange?: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  disabled?: boolean
  focusId?: string
  width?: number | string
  filter?: (option: ComboboxOption, query: string) => boolean
}

export function VoidCombobox(props: VoidComboboxProps) {
  return (
    <Combobox
      value={props.value}
      onChange={props.onChange}
      options={props.options}
      placeholder={props.placeholder}
      disabled={props.disabled}
      focusId={props.focusId}
      filter={props.filter}
      renderInput={(ctx: ComboboxInputContext) => (
        <box
          direction="row"
          alignY="center"
          width={props.width}
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
              color={
                ctx.disabled ? themeColors.mutedForeground
                  : (ctx.inputValue && ctx.inputValue !== ctx.selectedLabel) ? themeColors.foreground
                  : ctx.selectedLabel ? themeColors.foreground
                  : themeColors.mutedForeground
              }
              fontSize={font.sm}
            >
              {ctx.inputValue || ctx.placeholder}
            </text>
          </box>
          <text color={themeColors.mutedForeground} fontSize={font.xs}>
            {ctx.open ? "▲" : "▼"}
          </text>
        </box>
      )}
      renderOption={(opt: ComboboxOption, ctx: ComboboxOptionContext) => (
        <box
          backgroundColor={
            ctx.highlighted ? themeColors.accent
              : ctx.selected ? themeColors.secondary
              : themeColors.popover
          }
          padding={space[1]}
          paddingX={space[2]}
        >
          <text
            color={
              ctx.disabled ? themeColors.mutedForeground
                : ctx.selected ? themeColors.primary
                : themeColors.foreground
            }
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
          maxHeight={200}
          scrollY
        >
          {children}
        </box>
      )}
      renderEmpty={() => (
        <box padding={space[2]} paddingX={space[3]}>
          <text color={themeColors.mutedForeground} fontSize={font.sm}>No results</text>
        </box>
      )}
    />
  )
}
