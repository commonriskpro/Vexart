/**
 * VirtualList — virtualized list that only renders visible items.
 *
 * Handles viewport slicing, scrolling, hover, and keyboard navigation.
 *
 * @public
 */

import { createSignal, For, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus, type SizingUnit } from "@vexart/engine"
import { onPostScroll } from "@vexart/engine"
import { useScrollHandle } from "../helpers/use-scroll"
import { useListNavigation } from "./list-navigation"

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
  /**
   * Visible viewport height.
   * - `number` — fixed pixel height.
   * - `"grow"` / `"100%"` / other string — fills available space.
   *   The actual pixel height is read from the scroll handle's
   *   viewportHeight after the first layout pass.
   */
  height: SizingUnit
  /** Width. Default: "grow". */
  width?: SizingUnit
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

  const scrollId = `vlist-${Math.random().toString(36).slice(2, 8)}`
  const scrollHandle = useScrollHandle(scrollId)

  /**
   * Resolved viewport height in pixels.
   * When props.height is a number, uses it directly.
   * When props.height is a string ("grow", "100%", etc.), reads the
   * actual rendered viewport height from the scroll handle — updated
   * every frame via onPostScroll/scrollTick.
   */
  const viewportPx = (): number => {
    scrollTick()
    if (typeof props.height === "number") return props.height
    return scrollHandle.viewportHeight || 0
  }

  const viewportItems = () => {
    const vh = viewportPx()
    if (vh <= 0 || props.itemHeight <= 0) return 0
    return Math.ceil(vh / props.itemHeight)
  }

  // Read scroll position reactively
  const scrollPos = () => {
    scrollTick()
    return scrollHandle.scrollTop
  }

  const startIndex = () => Math.max(0, Math.floor(scrollPos() / props.itemHeight) - overscan())

  const endIndex = () => {
    const raw = Math.floor(scrollPos() / props.itemHeight) + viewportItems()
    return Math.min(props.items.length, raw + overscan())
  }

  const visibleItems = () => props.items.slice(startIndex(), endIndex())

  const topPad = () => startIndex() * props.itemHeight

  // Bottom spacer
  const bottomPad = () => Math.max(0, totalHeight() - endIndex() * props.itemHeight)

  function indexFromLocalY(localY: number, height: number): number {
    if (localY < 0 || localY >= height) return -1
    const idx = Math.floor((localY + scrollPos()) / props.itemHeight)
    return idx >= 0 && idx < props.items.length ? idx : -1
  }

  function scrollToIndex(index: number) {
    const vh = viewportPx()
    if (vh <= 0) return
    const itemTop = index * props.itemHeight
    const itemBottom = itemTop + props.itemHeight
    const viewTop = scrollPos()
    const viewBottom = viewTop + vh
    if (itemTop < viewTop) scrollHandle.scrollTo(-itemTop)
    else if (itemBottom > viewBottom) scrollHandle.scrollTo(-(itemBottom - vh))
    setScrollTick(t => t + 1)
  }

  const nav = useListNavigation({
    count: () => props.items.length,
    selectedIndex: () => (props.selectedIndex !== undefined ? props.selectedIndex : highlightedIndex()),
    onSelectedChange: (index) => {
      setHighlightedIndex(index)
      scrollToIndex(index)
    },
    onSelect: (index) => {
      props.onSelect?.(index)
    },
    pageSize: () => viewportItems() || 5,
    orientation: "vertical",
    vim: true,
  })

  const keyboard = props.keyboard ?? true
  if (keyboard) {
    useFocus({
      id: props.focusId,
      onKeyDown(e) {
        if (e.key === " ") {
          const idx = highlightedIndex()
          if (idx >= 0 && idx < props.items.length) {
            props.onSelect?.(idx)
          }
          return
        }
        nav.onKeyDown(e)
      },
    })
  }

  let lastTop = -1
  let lastVh = -1
  const unsubPostScroll = onPostScroll(() => {
    const top = scrollHandle.scrollTop
    const vh = scrollHandle.viewportHeight
    if (top !== lastTop || vh !== lastVh) {
      lastTop = top
      lastVh = vh
      setScrollTick(t => t + 1)
    }
  })
  onCleanup(() => {
    unsubPostScroll()
  })

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
        }
      }}
      onMouseOut={() => {
        if (hoveredIndex() !== -1) {
          setHoveredIndex(-1)
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
      <box height={topPad()} />
      <For each={visibleItems()}>
        {(item, idx) => {
          const absIndex = () => startIndex() + idx()
          const ctx: VirtualListItemContext = {
            get selected() { return props.selectedIndex === absIndex() },
            get highlighted() { return highlightedIndex() === absIndex() },
            get hovered() { return hoveredIndex() === absIndex() },
            get index() { return absIndex() },
          }
          return (
            <box height={props.itemHeight} width="100%">
              {props.renderItem(item, absIndex(), ctx)}
            </box>
          )
        }}
      </For>
      <box height={bottomPad()} />
    </box>
  )
}
