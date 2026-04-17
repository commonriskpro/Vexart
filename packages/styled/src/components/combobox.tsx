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
import { radius, space, font, shadows, glows } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

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
          height={36}
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
                  : ctx.inputValue ? themeColors.foreground
                  : themeColors.mutedForeground
              }
              fontSize={font.sm}
            >
              {ctx.inputValue || ctx.placeholder || "Search…"}
            </text>
          </box>
          <text color={themeColors.mutedForeground} fontSize={font.xs}>
            {ctx.open ? "⌃" : "⌄"}
          </text>
        </box>
      )}
      renderOption={(opt: ComboboxOption, ctx: ComboboxOptionContext) => (
        <box
          direction="row"
          alignY="center"
          gap={space[2]}
          paddingTop={space[1.5]}
          paddingBottom={space[1.5]}
          paddingLeft={space[2]}
          paddingRight={space[2]}
          backgroundColor={
            ctx.highlighted ? themeColors.accent : themeColors.transparent
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
      renderEmpty={() => (
        <box padding={space[2]} paddingX={space[3]}>
          <text color={themeColors.mutedForeground} fontSize={font.sm}>No results</text>
        </box>
      )}
    />
  )
}
