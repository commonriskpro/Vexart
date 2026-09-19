/**
 * List — truly headless selectable list.
 *
 * Handles focus, keyboard navigation, and selection while visuals are supplied by `renderItem`.
 *
 * @public
 */

import { For } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus } from "@vexart/engine"
import { useListNavigation } from "./list-navigation"

// ── Types ──

/** @public */
export type ListItemContext = {
  selected: boolean
  focused: boolean
  index: number
  /** Spread on the item element for click selection. */
  itemProps: {
    onPress: () => void
  }
}

/** @public */
export type ListProps = {
  items: string[]
  selectedIndex: number
  onSelectedChange?: (index: number) => void
  onSelect?: (index: number) => void
  disabled?: boolean
  focusId?: string
  /** Render each item. REQUIRED — no default visual. */
  renderItem: (item: string, ctx: ListItemContext) => JSX.Element
  /** Render the list container. Default: vertical box. */
  renderList?: (children: JSX.Element) => JSX.Element
}

/** @public */
export function List(props: ListProps) {
  const count = () => props.items.length
  const disabled = () => props.disabled ?? false

  const nav = useListNavigation({
    count,
    selectedIndex: () => props.selectedIndex,
    onSelectedChange: props.onSelectedChange,
    onSelect: props.onSelect,
    orientation: "vertical",
    vim: true,
  })

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      nav.onKeyDown(e)
    },
  })

  const children = () => (
    <For each={props.items}>
      {(item, index) => {
        const ctx: ListItemContext = {
          get selected() { return props.selectedIndex === index() },
          get focused() { return focused() },
          get index() { return index() },
          itemProps: {
            onPress: () => {
              if (disabled()) return
              props.onSelectedChange?.(index())
              props.onSelect?.(index())
            },
          },
        }
        return props.renderItem(item, ctx)
      }}
    </For>
  )

  return props.renderList
    ? <>{props.renderList(<>{children()}</>)}</>
    : <box direction="column">{children()}</box>
}
