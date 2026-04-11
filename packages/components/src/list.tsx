/**
 * List — selectable list for TGE.
 *
 * Focus-aware with Up/Down arrow navigation.
 * Selected item is highlighted. Enter triggers onSelect.
 *
 * CONTROLLED component — parent owns selectedIndex state.
 *
 * For long lists, wrap in a ScrollView:
 *   <ScrollView height={200} scrollY>
 *     <List items={items} selectedIndex={idx()} ... />
 *   </ScrollView>
 *
 * Usage:
 *   const [idx, setIdx] = createSignal(0)
 *   <List
 *     items={["Alpha", "Beta", "Gamma"]}
 *     selectedIndex={idx()}
 *     onSelectedChange={setIdx}
 *     onSelect={(i) => console.log("picked", items[i])}
 *   />
 */

import type { JSX } from "solid-js"
import { useFocus } from "@tge/renderer"
import {
  surface,
  accent,
  text as textTokens,
  border,
  radius,
  spacing,
  alpha,
} from "@tge/tokens"

export type ListProps = {
  /** Items to display. Each item is a string label. */
  items: string[]

  /** Currently selected index. */
  selectedIndex: number

  /** Called when arrow keys change the selection. */
  onSelectedChange?: (index: number) => void

  /** Called when Enter is pressed on the selected item. */
  onSelect?: (index: number) => void

  /** Accent color for the selected item. Default: accent.thread. */
  color?: number

  /** Focus ID override. */
  focusId?: string
}

export function List(props: ListProps) {
  const color = () => props.color ?? accent.thread
  const count = () => props.items.length

  const { focused } = useFocus({
    id: props.focusId,
    onKeyDown(e) {
      if (e.key === "down" || e.key === "j") {
        const next = Math.min(props.selectedIndex + 1, count() - 1)
        props.onSelectedChange?.(next)
      } else if (e.key === "up" || e.key === "k") {
        const prev = Math.max(props.selectedIndex - 1, 0)
        props.onSelectedChange?.(prev)
      } else if (e.key === "enter") {
        props.onSelect?.(props.selectedIndex)
      }
    },
  })

  return (
    <box
      direction="column"
      gap={0}
      borderColor={focused() ? color() : border.subtle}
      borderWidth={focused() ? 2 : 1}
      cornerRadius={radius.md}
    >
      {props.items.map((item, i) => (
        <box
          backgroundColor={
            props.selectedIndex === i ? alpha(color(), 0x44) : surface.card
          }
          padding={spacing.sm}
          paddingX={spacing.md}
        >
          <text
            color={
              props.selectedIndex === i ? color() : textTokens.secondary
            }
            fontSize={14}
          >
            {props.selectedIndex === i ? `> ${item}` : `  ${item}`}
          </text>
        </box>
      ))}
    </box>
  )
}
