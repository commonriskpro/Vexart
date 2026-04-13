/**
 * VirtualList — virtualized list that only renders visible items.
 *
 * Architecture: Clay handles all scroll. We render a fixed-height spacer
 * for the full content, then only mount items near the viewport.
 *
 * The key insight: topPad must EXACTLY equal startIndex * itemHeight so
 * that Clay's scroll position and our item positioning agree perfectly.
 * Items are rendered at their true content position within the scroll
 * container — Clay's scroll clipping does the rest.
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
import { useFocus, createScrollHandle, onPostScroll } from "@tge/renderer"

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
  /** Extra items to render above/below viewport. Default: 8. */
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
  const [scrollTick, setScrollTick] = createSignal(0)
  const [highlightedIndex, setHighlightedIndex] = createSignal(props.selectedIndex ?? -1)

  const overscan = () => props.overscan ?? 8
  const totalHeight = () => props.items.length * props.itemHeight
  const viewportItems = () => Math.ceil(props.height / props.itemHeight)

  const scrollId = `vlist-${Math.random().toString(36).slice(2, 8)}`
  const scrollHandle = createScrollHandle(scrollId)

  // Read Clay scroll reactively (scrollTick drives re-evaluation)
  const scrollPos = () => {
    scrollTick()
    return scrollHandle.scrollTop
  }

  // First visible item index (no overscan)
  const rawStartIndex = () => Math.floor(scrollPos() / props.itemHeight)

  // Render range with overscan
  const startIndex = () => Math.max(0, rawStartIndex() - overscan())
  const endIndex = () => Math.min(props.items.length, rawStartIndex() + viewportItems() + overscan())

  const visibleItems = () => {
    const start = startIndex()
    const end = endIndex()
    const result: { item: T; index: number }[] = []
    for (let i = start; i < end; i++) {
      result.push({ item: props.items[i], index: i })
    }
    return result
  }

  function scrollToIndex(index: number) {
    const itemTop = index * props.itemHeight
    const itemBottom = itemTop + props.itemHeight
    const viewTop = scrollPos()
    const viewBottom = viewTop + props.height
    if (itemTop < viewTop) scrollHandle.scrollTo(-itemTop)
    else if (itemBottom > viewBottom) scrollHandle.scrollTo(-(itemBottom - props.height))
    setScrollTick(t => t + 1)
  }

  // Keyboard
  const keyboard = props.keyboard ?? true
  if (keyboard) {
    useFocus({
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
          scrollHandle.scrollTo(0)
          setScrollTick(t => t + 1)
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

  // Post-scroll sync
  const unsubPostScroll = onPostScroll(() => {
    setScrollTick(t => t + 1)
  })
  onCleanup(() => unsubPostScroll())

  return (
    <box
      height={props.height}
      width={props.width ?? "grow"}
      scrollY
      scrollId={scrollId}
    >
      {() => {
        const items = visibleItems()
        const start = startIndex()
        const end = endIndex()
        const topH = start * props.itemHeight
        const bottomH = totalHeight() - end * props.itemHeight

        return (
          <>
            {topH > 0 ? <box height={topH} /> : null}
            <For each={items}>
              {({ item, index }) => {
                const ctx: VirtualListItemContext = {
                  selected: props.selectedIndex === index,
                  highlighted: highlightedIndex() === index,
                  index,
                }
                return props.renderItem(item, index, ctx)
              }}
            </For>
            {bottomH > 0 ? <box height={bottomH} /> : null}
          </>
        )
      }}
    </box>
  )
}
