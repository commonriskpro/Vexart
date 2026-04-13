/**
 * VirtualList — virtualized list that only renders visible items.
 *
 * Architecture:
 *   - Clay handles ALL scroll (scrollY on container)
 *   - topPad = scrollPos (pixel-perfect match with Clay's scroll offset)
 *   - Items render from startIndex to endIndex (viewport + overscan)
 *   - bottomPad fills remaining height so Clay knows total content size
 *   - postScroll hook syncs our signal with Clay's scroll position
 *
 * Key insight: topPad must match Clay's scrollTop EXACTLY (not discretized
 * to item boundaries) so there's zero gap between the scroll position and
 * the first rendered item.
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
  /** Extra items to render above/below viewport. Default: 5. */
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

  const overscan = () => props.overscan ?? 5
  const totalHeight = () => props.items.length * props.itemHeight
  const viewportItems = () => Math.ceil(props.height / props.itemHeight)

  const scrollId = `vlist-${Math.random().toString(36).slice(2, 8)}`
  const scrollHandle = createScrollHandle(scrollId)

  // Read Clay scroll position reactively
  const scrollPos = () => {
    scrollTick()
    return scrollHandle.scrollTop
  }

  // The first item that could be partially visible
  const firstVisibleItem = () => Math.floor(scrollPos() / props.itemHeight)

  // Render range (with overscan)
  const startIndex = () => Math.max(0, firstVisibleItem() - overscan())
  const endIndex = () => Math.min(props.items.length, firstVisibleItem() + viewportItems() + overscan())

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

  const unsubPostScroll = onPostScroll(() => {
    setScrollTick(t => t + 1)
  })
  onCleanup(() => unsubPostScroll())

  // topPad: the EXACT scroll position in pixels. This matches Clay's
  // scroll offset perfectly — no discrete jumps, no gap.
  // The items start right after topPad, so Clay's viewport window
  // (which starts at scrollPos) shows items starting from startIndex.
  //
  // topPad = startIndex * itemHeight (not scrollPos!) because:
  //   - Clay scrolled to scrollPos
  //   - Our content starts at topPad = startIndex * itemHeight
  //   - Clay's viewport starts at scrollPos
  //   - The difference (scrollPos - topPad) = sub-item offset, handled by Clay
  //   - With overscan, startIndex is BEFORE the viewport → those items are clipped

  return (
    <box
      height={props.height}
      width={props.width ?? "grow"}
      scrollY
      scrollId={scrollId}
    >
      {() => {
        // Evaluate everything from the same scrollTick atomically
        const sp = scrollPos()
        const start = startIndex()
        const end = endIndex()
        const items = visibleItems()
        const topH = start * props.itemHeight
        const bottomH = Math.max(0, totalHeight() - end * props.itemHeight)

        return (
          <>
            <box height={topH} />
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
            <box height={bottomH} />
          </>
        )
      }}
    </box>
  )
}
