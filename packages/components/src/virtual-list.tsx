/**
 * VirtualList — virtualized list that only renders visible items.
 *
 * Architecture:
 *   - Clay handles ALL scroll (scrollY on container)
 *   - Renders items from index 0 to endIndex (visible + overscan)
 *   - bottomPad fills remaining height so Clay knows total content size
 *   - Clay clips items above the viewport via scissor — off-screen items
 *     exist in layout but are not painted (O(visible) paint cost)
 *   - postScroll hook syncs our signal with Clay's scroll position
 *
 * Why render from 0 instead of windowing with topPad?
 *   The topPad approach (startIndex * itemHeight spacer) causes hit-testing
 *   desync — mouse clicks select wrong items because Clay's bounding boxes
 *   for recycled For nodes don't match their visual position. Rendering
 *   from 0 means each item always occupies its true layout position.
 *   Clay layout of N fixed-height boxes is microseconds. Paint is O(visible)
 *   because the scissor clips off-screen rects and texts.
 *
 * Usage:
 *   <VirtualList
 *     items={allUsers}
 *     itemHeight={24}
 *     height={400}
 *     overscan={5}
 *     renderItem={(item, index, ctx) => (
 *       <box {...ctx.itemProps} height={24} padding={4} backgroundColor="#1a1a1a">
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
  /** Whether the mouse is hovering this item. */
  hovered: boolean
  /** Absolute index in the full list. */
  index: number
  /** Spread on the item element for click + hover interaction. */
  itemProps: {
    onPress: () => void
    onMouseOver: () => void
    onMouseOut: () => void
  }
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
  const [hoveredIndex, setHoveredIndex] = createSignal(-1)

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

  // Render from index 0 up to endIndex.
  // Items above viewport are clipped by Clay's scissor — they exist in
  // layout but are never painted. This keeps hit-testing correct because
  // each item always occupies its true layout position.
  const endIndex = () => {
    const raw = Math.floor(scrollPos() / props.itemHeight) + viewportItems()
    return Math.min(props.items.length, raw + overscan())
  }

  // Slice of props.items from 0 to endIndex. We return the ORIGINAL item
  // references (not wrapper objects) so SolidJS For can track identity
  // across frames. Creating new wrapper objects would cause For to destroy
  // and recreate nodes every frame, breaking click hit-testing.
  const visibleItems = () => props.items.slice(0, endIndex())

  // Bottom spacer — gives Clay the total content height for scroll range
  const bottomPad = () => Math.max(0, totalHeight() - endIndex() * props.itemHeight)

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

  return (
    <box
      height={props.height}
      width={props.width ?? "grow"}
      scrollY
      scrollId={scrollId}
    >
      <For each={visibleItems()}>
        {(item, idx) => {
          const index = idx()
          // Return a thunk so SolidJS re-evaluates it when reactive
          // dependencies (selectedIndex, highlightedIndex) change.
          // Without this, ctx is created once and never updated.
          const render = () => {
            const ctx: VirtualListItemContext = {
              selected: props.selectedIndex === index,
              highlighted: highlightedIndex() === index,
              hovered: hoveredIndex() === index,
              index,
              itemProps: {
                onPress: () => {
                  setHighlightedIndex(index)
                  props.onSelect?.(index)
                },
                onMouseOver: () => setHoveredIndex(index),
                onMouseOut: () => { if (hoveredIndex() === index) setHoveredIndex(-1) },
              },
            }
            return props.renderItem(item, index, ctx)
          }
          return render as unknown as JSX.Element
        }}
      </For>
      {() => {
        const bp = bottomPad()
        return bp > 0 ? <box height={bp} /> : null
      }}
    </box>
  )
}
