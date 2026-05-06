/**
 * VoidVirtualList — styled virtualized list using Void design tokens.
 *
 * Provides default themed item rendering. For custom item rendering,
 * use the headless VirtualList directly.
 *
 * @public
 */

import { VirtualList } from "@vexart/headless"
import type { VirtualListItemContext } from "@vexart/headless"
import type { JSX } from "solid-js"
import { radius, space, font } from "../tokens/tokens"
import { themeColors } from "../theme/theme"

/** @public */
export type VoidVirtualListProps<T> = {
  items: T[]
  itemHeight: number
  height: number | string
  width?: number | string
  overscan?: number
  selectedIndex?: number
  onSelect?: (index: number) => void
  keyboard?: boolean
  focusId?: string
  /** Render each item. Receives item, index, and context. */
  renderItem: (item: T, index: number, ctx: VirtualListItemContext) => JSX.Element
}

/** @public */
export function VoidVirtualList<T>(props: VoidVirtualListProps<T>) {
  return (
    <box
      backgroundColor={themeColors.card}
      cornerRadius={radius.md}
      borderColor={themeColors.border}
      borderWidth={1}
    >
      <VirtualList
        items={props.items}
        itemHeight={props.itemHeight}
        height={props.height}
        width={props.width}
        overscan={props.overscan}
        selectedIndex={props.selectedIndex}
        onSelect={props.onSelect}
        keyboard={props.keyboard}
        focusId={props.focusId}
        renderItem={props.renderItem}
      />
    </box>
  )
}
