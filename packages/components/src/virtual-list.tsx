/**
 * VirtualList — virtualized list that only renders visible items.
 *
 * For lists with thousands of items. Only items within the visible
 * viewport + overscan are rendered. Scroll position determines which
 * items to mount.
 *
 * Uses fixed item height for O(1) scroll calculations.
 * The container handles scroll events and translates them to
 * a window of visible indices.
 *
 * ALL visual styling is the consumer's responsibility.
 *
 * Usage:
 *   <VirtualList
 *     items={allUsers}
 *     itemHeight={24}
 *     height={400}
 *     overscan={5}
 *     renderItem={(item, index, ctx) => (
 *       <box height={24} padding={4} backgroundColor={ctx.selected ? "#333" : "transparent"}>
 *         <text color="#fff">{item.name}</text>
 *       </box>
 *     )}
 *   />
 */

import { createSignal, For, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus, onInput } from "@tge/renderer"

// ── Types ──

export type VirtualListItemContext = {
  /** Whether this item is selected (for single-select mode). */
  selected: boolean
  /** Whether this item is highlighted via keyboard. */
  highlighted: boolean
  /** Absolute index in the full list. */
  index: number
}

export type VirtualListProps<T> = {
  /** Full list of items. */
  items: T[]
  /** Fixed height per item in pixels. */
  itemHeight: number
  /** Visible viewport height in pixels. */
  height: number
  /** Width. Default: "grow". */
  width?: number | string
  /** Extra items to render above/below viewport. Default: 3. */
  overscan?: number
  /** Render each visible item. */
  renderItem: (item: T, index: number, ctx: VirtualListItemContext) => JSX.Element
  /** Currently selected index (-1 = none). */
  selectedIndex?: number
  /** Called when selection changes. */
  onSelect?: (index: number) => void
  /** Keyboard navigation. Default: true. */
  keyboard?: boolean
  /** Focus ID override. */
  focusId?: string
}

export function VirtualList<T>(props: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = createSignal(0)
  const [highlightedIndex, setHighlightedIndex] = createSignal(props.selectedIndex ?? -1)

  const overscan = () => props.overscan ?? 3
  const totalHeight = () => props.items.length * props.itemHeight
  const viewportItems = () => Math.ceil(props.height / props.itemHeight)

  // Calculate visible range
  const startIndex = () => {
    const raw = Math.floor(scrollTop() / props.itemHeight)
    return Math.max(0, raw - overscan())
  }
  const endIndex = () => {
    const raw = Math.floor(scrollTop() / props.itemHeight) + viewportItems()
    return Math.min(props.items.length, raw + overscan())
  }

  // Visible items slice
  const visibleItems = () => {
    const start = startIndex()
    const end = endIndex()
    const result: { item: T; index: number }[] = []
    for (let i = start; i < end; i++) {
      result.push({ item: props.items[i], index: i })
    }
    return result
  }

  // Scroll the highlight into view
  const scrollToIndex = (index: number) => {
    const itemTop = index * props.itemHeight
    const itemBottom = itemTop + props.itemHeight
    const viewTop = scrollTop()
    const viewBottom = viewTop + props.height

    if (itemTop < viewTop) {
      setScrollTop(itemTop)
    } else if (itemBottom > viewBottom) {
      setScrollTop(itemBottom - props.height)
    }
  }

  // Keyboard navigation + mouse scroll
  const keyboard = props.keyboard ?? true
  if (keyboard) {
    const { focused } = useFocus({
      id: props.focusId,
      onKeyDown(e) {
        if (e.key === "down" || e.key === "j") {
          const next = Math.min(props.items.length - 1, highlightedIndex() + 1)
          setHighlightedIndex(next)
          scrollToIndex(next)
          return
        }
        if (e.key === "up" || e.key === "k") {
          const prev = Math.max(0, highlightedIndex() - 1)
          setHighlightedIndex(prev)
          scrollToIndex(prev)
          return
        }
        if (e.key === "pagedown") {
          const next = Math.min(props.items.length - 1, highlightedIndex() + viewportItems())
          setHighlightedIndex(next)
          scrollToIndex(next)
          return
        }
        if (e.key === "pageup") {
          const prev = Math.max(0, highlightedIndex() - viewportItems())
          setHighlightedIndex(prev)
          scrollToIndex(prev)
          return
        }
        if (e.key === "home") {
          setHighlightedIndex(0)
          setScrollTop(0)
          return
        }
        if (e.key === "end") {
          const last = props.items.length - 1
          setHighlightedIndex(last)
          scrollToIndex(last)
          return
        }
        if (e.key === "enter" || e.key === " ") {
          const idx = highlightedIndex()
          if (idx >= 0 && idx < props.items.length) {
            props.onSelect?.(idx)
          }
          return
        }
      },
    })

  }

  // Mouse scroll — intercept scroll when hovered.
  // Track hover state with a simple flag updated by onMouseOver/Out on the container.
  let isHovered = false

  const unsubScroll = onInput((event) => {
    if (event.type !== "mouse") return
    if (event.action === "scroll") {
      if (!isHovered) return
      const lineH = props.itemHeight
      const dy = event.button === 64 ? -lineH : lineH
      setScrollTop(s => Math.max(0, Math.min(s + dy, totalHeight() - props.height)))
    }
  })
  onCleanup(() => unsubScroll())

  // Top spacer to offset content for items above viewport
  const topPad = () => startIndex() * props.itemHeight

  return (
    <box
      height={props.height}
      width={props.width ?? "grow"}
      backgroundColor="#00000000"
      onMouseOver={() => { isHovered = true }}
      onMouseOut={() => { isHovered = false }}
    >
      {/* Top spacer — represents items above the viewport */}
      <box height={topPad()} />
      {/* Visible items */}
      <For each={visibleItems()}>
        {({ item, index }) => {
          const ctx: VirtualListItemContext = {
            selected: props.selectedIndex === index,
            highlighted: highlightedIndex() === index,
            index,
          }
          return props.renderItem(item, index, ctx)
        }}
      </For>
      {/* Bottom spacer — represents items below the viewport */}
      <box height={totalHeight() - (endIndex() * props.itemHeight)} />
    </box>
  )
}
