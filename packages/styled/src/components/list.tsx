/**
 * VoidList — styled selectable list using Void design tokens.
 *
 * Provides a default themed item renderer. For custom rendering,
 * use the headless List directly.
 *
 * @public
 */

import { List } from "@vexart/headless"
import type { ListItemContext } from "@vexart/headless"
import { radius, space, font, glows } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export type VoidListProps = {
  items: string[]
  selectedIndex: number
  onSelectedChange?: (index: number) => void
  onSelect?: (index: number) => void
  disabled?: boolean
  focusId?: string
  width?: number | string
  height?: number | string
}

/** @public */
export function VoidList(props: VoidListProps) {
  return (
    <box
      width={props.width}
      height={props.height}
      backgroundColor={themeColors.card}
      cornerRadius={radius.md}
      borderColor={themeColors.border}
      borderWidth={1}
      direction="column"
      scrollY
    >
      <List
        items={props.items}
        selectedIndex={props.selectedIndex}
        onSelectedChange={props.onSelectedChange}
        onSelect={props.onSelect}
        disabled={props.disabled}
        focusId={props.focusId}
        renderItem={(item: string, ctx: ListItemContext) => (
          <box
            {...ctx.itemProps}
            paddingX={space[3]}
            paddingY={space[2]}
            backgroundColor={
              ctx.selected ? themeColors.accent
                : undefined
            }
            hoverStyle={{ backgroundColor: themeColors.accent }}
            focusStyle={{ glow: glows.ring }}
          >
            <text
              color={ctx.selected ? themeColors.foreground : themeColors.foreground}
              fontSize={font.sm}
            >
              {item}
            </text>
          </box>
        )}
      />
    </box>
  )
}
