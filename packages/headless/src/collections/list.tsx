/**
 * List — truly headless selectable list.
 *
 * CONTROLLED component — parent owns selectedIndex state.
 * Focus-aware with Up/Down arrow navigation.
 *
 * This is a BEHAVIOR-ONLY component. It provides:
 *   - Focus management (useFocus)
 *   - Keyboard navigation (Up/Down/j/k/Enter)
 *   - Selection tracking
 *
 * ALL visual styling is the consumer's responsibility via renderItem.
 * Use @tge/void VoidList for a styled version.
 *
 * Usage:
 *   <List
 *     items={["Alpha", "Beta", "Gamma"]}
 *     selectedIndex={idx()}
 *     onSelectedChange={setIdx}
 *     onSelect={(i) => console.log("picked", items[i])}
 *     renderItem={(item, ctx) => (
 *       <box backgroundColor={ctx.selected ? "#334" : "#111"} padding={4}>
 *         <text color={ctx.selected ? "#fff" : "#aaa"}>{item}</text>
 *       </box>
 *     )}
 *   />
 */

import type { JSX } from "solid-js"
import { useFocus } from "@vexart/engine"

// ── Types ──

export type ListItemContext = {
  selected: boolean
  focused: boolean
  index: number
  /** Spread on the item element for click selection. */
  itemProps: {
    onPress: () => void
  }
}

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
