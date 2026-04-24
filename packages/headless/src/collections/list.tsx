/**
 * List — truly headless selectable list.
 *
 * Handles focus, keyboard navigation, and selection while visuals are supplied by `renderItem`.
 *
 * @public
 */

import type { JSX } from "solid-js"
import { useFocus } from "@vexart/engine"

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

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (disabled()) return
      if (e.key === "down" || e.key === "j") {
        props.onSelectedChange?.(Math.min(props.selectedIndex + 1, count() - 1))
      } else if (e.key === "up" || e.key === "k") {
        props.onSelectedChange?.(Math.max(props.selectedIndex - 1, 0))
      } else if (e.key === "enter") {
        props.onSelect?.(props.selectedIndex)
      }
    },
  })

  const children = () =>
    props.items.map((item, i) => {
      const ctx: ListItemContext = {
        selected: props.selectedIndex === i,
        focused: focused(),
        index: i,
        itemProps: {
          onPress: () => {
            if (disabled()) return
            props.onSelectedChange?.(i)
            props.onSelect?.(i)
          },
        },
      }
      return props.renderItem(item, ctx)
    })

  return props.renderList
    ? <>{props.renderList(<>{children()}</>)}</>
    : <box direction="column">{children()}</box>
}
