/**
 * VirtualList — virtualized list that only renders visible items.
 *
 * Architecture inspired by TanStack Virtual:
 *   1. Outer container: fixed height, Clay scroll clipping (scrollY)
 *   2. Inner structure: topPad spacer + visible items + bottomPad spacer
 *      (total = items.length * itemHeight — Clay sees the full height)
 *   3. Clay handles ALL scroll natively (mouse wheel, touch)
 *   4. We READ Clay's scroll offset to calculate which items to render
 *   5. A reactive tick signal forces SolidJS to re-evaluate on scroll
 *
 * Uses fixed item height for O(1) scroll calculations.
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
import { useFocus, onInput, createScrollHandle } from "@tge/renderer"

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
  // Scroll tick — bumped on every scroll event to force SolidJS to
  // re-evaluate derived getters that read scrollHandle.scrollTop.
  // Clay owns the scroll position; we just read it.
  const [scrollTick, setScrollTick] = createSignal(0)
  const [highlightedIndex, setHighlightedIndex] = createSignal(props.selectedIndex ?? -1)

  const overscan = () => props.overscan ?? 3
  const totalHeight = () => props.items.length * props.itemHeight
  const viewportItems = () => Math.ceil(props.height / props.itemHeight)

  // Stable scroll container ID for Clay
  const scrollId = `vlist-${Math.random().toString(36).slice(2, 8)}`
  const scrollHandle = createScrollHandle(scrollId)

  // Read Clay's scroll offset reactively. The scrollTick dependency
  // forces re-evaluation when scroll events occur.
  const scrollPos = () => {
    scrollTick() // subscribe — re-evaluates when tick bumps
    return scrollHandle.scrollTop
  }

  // Calculate visible range from scroll position
  const startIndex = () => {
    const raw = Math.floor(scrollPos() / props.itemHeight)
    return Math.max(0, raw - overscan())
  }
  const endIndex = () => {
    const raw = Math.floor(scrollPos() / props.itemHeight) + viewportItems()
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

  // Scroll the highlight into view (programmatic — keyboard nav)
  function scrollToIndex(index: number) {
    const itemTop = index * props.itemHeight
    const itemBottom = itemTop + props.itemHeight
    const viewTop = scrollPos()
    const viewBottom = viewTop + props.height

    if (itemTop < viewTop) {
      scrollHandle.scrollTo(-itemTop)
    } else if (itemBottom > viewBottom) {
      scrollHandle.scrollTo(-(itemBottom - props.height))
    }
    setScrollTick(t => t + 1)
  }

  // Keyboard navigation
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

  // Listen for scroll events. Bump the tick so SolidJS re-evaluates
  // scrollPos() → startIndex/endIndex → visibleItems on the next frame.
  // Clay processes scroll in the render loop BEFORE walkTree, so by the
  // time SolidJS evaluates our getters, scrollHandle.scrollTop is current.
  const unsubScroll = onInput((event) => {
    if (event.type === "mouse" && event.action === "scroll") {
      setScrollTick(t => t + 1)
    }
  })
  onCleanup(() => unsubScroll())

  // Top spacer to offset content for items above viewport
  const topPad = () => startIndex() * props.itemHeight

  return (
    <box
      height={props.height}
      width={props.width ?? "grow"}
      scrollY
      scrollId={scrollId}
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
