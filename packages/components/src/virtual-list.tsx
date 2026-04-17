/**
 * VirtualList — virtualized list that only renders visible items.
 *
 * Architecture:
 *   - Clay handles ALL scroll (scrollY on container)
 *   - Renders items from index 0 to endIndex (visible + overscan)
 *   - bottomPad fills remaining height so Clay knows total content size
 *   - Clay clips items above the viewport via scissor
 *   - Mouse interaction (hover/click) is handled at the CONTAINER level
 *     using nodeY + scrollOffset to compute which item is under the cursor.
 *     Per-item callbacks don't work because: (1) off-screen items have layout
 *     coords that overlap other screen areas, (2) SolidJS For thunk recreates
 *     nodes each frame, losing interactive state.
 *
 * Usage:
 *   <VirtualList
 *     items={allUsers}
 *     itemHeight={24}
 *     height={400}
 *     overscan={5}
 *     renderItem={(item, index, ctx) => (
 *       <box height={24} padding={4} backgroundColor="#1a1a1a">
 *         <text color="#fff">{item.name}</text>
 *       </box>
 *     )}
 *   />
 */

import { createSignal, For, onCleanup } from "solid-js"
import type { JSX } from "solid-js"
import { useFocus, createScrollHandle, onPostScroll, markDirty, type NodeHandle } from "@tge/renderer-solid"

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
  let containerRef: NodeHandle | undefined

  // Read Clay scroll position reactively
  const scrollPos = () => {
    scrollTick()
    return scrollHandle.scrollTop
  }

  // Render from index 0 up to endIndex.
  const endIndex = () => {
    const raw = Math.floor(scrollPos() / props.itemHeight) + viewportItems()
    return Math.min(props.items.length, raw + overscan())
  }

  const visibleItems = () => props.items.slice(0, endIndex())

  // Bottom spacer
  const bottomPad = () => Math.max(0, totalHeight() - endIndex() * props.itemHeight)

  // Compute item index from absolute mouse Y
  function indexFromAbsY(absY: number): number {
    const containerY = containerRef?.layout.y ?? 0
    const localY = absY - containerY + scrollPos()
    const idx = Math.floor(localY / props.itemHeight)
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
  })
  onCleanup(() => unsubPostScroll())

  return (
    <box
      ref={(h: NodeHandle) => { containerRef = h }}
      height={props.height}
      width={props.width ?? "grow"}
      scrollY
      scrollId={scrollId}
      onMouseMove={(e) => {
        const idx = indexFromAbsY(e.y)
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
