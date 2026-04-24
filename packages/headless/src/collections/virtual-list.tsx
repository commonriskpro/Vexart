/**
 * VirtualList — virtualized list that only renders visible items.
 *
 * Handles viewport slicing, scrolling, hover, and keyboard navigation.
 *
 * @public
 */

import { createSignal, For, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus, createScrollHandle, onPostScroll, markDirty } from "@vexart/engine"

// ── Types ──

/** @public */
export type VirtualListItemContext = {
  /** Whether this item is selected (for single-select mode). */
  selected: boolean
  /** Whether this item is highlighted via keyboard. */
  highlighted: boolean
  /** Whether the mouse is hovering this item. */
  hovered: boolean
  /** Absolute index in the full list. */
  index: number
}

/** @public */
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

/** @public */
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

  const endIndex = () => {
    const raw = Math.floor(scrollPos() / props.itemHeight) + viewportItems()
    return Math.min(props.items.length, raw + overscan())
  }

  const visibleItems = () => props.items.slice(0, endIndex())

  // Bottom spacer
  const bottomPad = () => Math.max(0, totalHeight() - endIndex() * props.itemHeight)

  function indexFromLocalY(localY: number, height: number): number {
    if (localY < 0 || localY >= height) return -1
    const idx = Math.floor((localY + scrollPos()) / props.itemHeight)
    return idx >= 0 && idx < props.items.length ? idx : -1
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
    markDirty()
  })
  onCleanup(() => unsubPostScroll())

  return (
    <box
      layer
      height={props.height}
      width={props.width ?? "grow"}
      backgroundColor={0x00000001}
      scrollY
      scrollId={scrollId}
      onMouseMove={(e) => {
        const idx = indexFromLocalY(e.nodeY, e.height)
        if (idx !== hoveredIndex()) {
          setHoveredIndex(idx)
          markDirty()
        }
      }}
      onMouseOut={() => {
        if (hoveredIndex() !== -1) {
          setHoveredIndex(-1)
          markDirty()
        }
      }}
      onPress={() => {
        const idx = hoveredIndex()
        if (idx >= 0) {
          setHighlightedIndex(idx)
          props.onSelect?.(idx)
        }
      }}
    >
      <For each={visibleItems()}>
        {(item, idx) => {
          const index = idx()
          const render = () => {
            const ctx: VirtualListItemContext = {
              selected: props.selectedIndex === index,
              highlighted: highlightedIndex() === index,
              hovered: hoveredIndex() === index,
              index,
            }
            return (
              <box height={props.itemHeight} width="100%">
                {props.renderItem(item, index, ctx)}
              </box>
            )
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
