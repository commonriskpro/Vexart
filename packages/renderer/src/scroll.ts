/**
 * Scroll system — programmatic scroll control for ScrollView containers.
 *
 * Provides ScrollHandle with:
 *   - scrollTo(y) / scrollBy(dy) — programmatic scroll control
 *   - scrollY / scrollHeight / viewportHeight — readable scroll state
 *
 * Uses Clay's internal scroll data via FFI:
 *   - Clay_GetScrollContainerData returns scrollPosition pointer (mutable),
 *     viewport dimensions, and content dimensions.
 *   - Clay_SetScrollPosition directly mutates the scroll state.
 *
 * Usage:
 *   let scrollRef: ScrollHandle
 *   <ScrollView ref={(h) => scrollRef = h} scrollY height={300}>
 *     {longContent}
 *   </ScrollView>
 *
 *   scrollRef.scrollTo(0)     // scroll to top
 *   scrollRef.scrollBy(-100)  // scroll up 100px
 *   scrollRef.scrollY          // current scroll offset
 *   scrollRef.scrollHeight     // total content height
 *   scrollRef.viewportHeight   // visible viewport height
 */

import { clay } from "./clay"
import { markDirty } from "./dirty"

export type ScrollHandle = {
  /** Current scroll X offset (usually 0 for vertical-only scroll) */
  readonly scrollX: number
  /** Current scroll Y offset (negative = scrolled down) */
  readonly scrollY: number
  /** Total content width */
  readonly contentWidth: number
  /** Total content height */
  readonly contentHeight: number
  /** Visible viewport width */
  readonly viewportWidth: number
  /** Visible viewport height */
  readonly viewportHeight: number
  /** Alias for scrollY (opentui compat) */
  readonly y: number
  /** Alias for viewportHeight (opentui compat) */
  readonly height: number
  /** Alias for contentHeight (opentui compat) */
  readonly scrollHeight: number
  /** Alias for -scrollY as positive value (opentui compat) */
  readonly scrollTop: number
  /** Scroll to an absolute Y position. Value should be <= 0 (Clay uses negative offsets). */
  scrollTo: (y: number) => void
  /** Scroll by a relative delta. Negative = scroll down, Positive = scroll up. */
  scrollBy: (dy: number) => void
  /** Scroll to make a specific Y position visible. */
  scrollIntoView: (y: number, height: number) => void
  /** The Clay element ID for this scroll container */
  readonly _clayId: string
}

/** Registry of scroll handle IDs. Populated by ScrollView during render. */
const scrollHandles = new Map<string, ScrollHandle>()

/**
 * Create a ScrollHandle bound to a Clay scroll container ID.
 *
 * The handle lazily reads scroll data from Clay on every property access,
 * so it always reflects the current state.
 */
export function createScrollHandle(clayId: string): ScrollHandle {
  const existing = scrollHandles.get(clayId)
  if (existing) return existing

  const handle: ScrollHandle = {
    get scrollX() {
      return clay.getScrollContainerData(clayId).scrollX
    },
    get scrollY() {
      return clay.getScrollContainerData(clayId).scrollY
    },
    get contentWidth() {
      return clay.getScrollContainerData(clayId).contentWidth
    },
    get contentHeight() {
      return clay.getScrollContainerData(clayId).contentHeight
    },
    get viewportWidth() {
      return clay.getScrollContainerData(clayId).viewportWidth
    },
    get viewportHeight() {
      return clay.getScrollContainerData(clayId).viewportHeight
    },
    // opentui-compat aliases
    get y() {
      return clay.getScrollContainerData(clayId).scrollY
    },
    get height() {
      return clay.getScrollContainerData(clayId).viewportHeight
    },
    get scrollHeight() {
      return clay.getScrollContainerData(clayId).contentHeight
    },
    get scrollTop() {
      return -clay.getScrollContainerData(clayId).scrollY
    },

    scrollTo(y: number) {
      // Clay uses negative Y for scrolled-down content
      const data = clay.getScrollContainerData(clayId)
      if (!data.found) return
      // Clamp to valid range: 0 (top) to -(contentHeight - viewportHeight) (bottom)
      const maxScroll = Math.min(0, -(data.contentHeight - data.viewportHeight))
      const clamped = Math.max(maxScroll, Math.min(0, y))
      clay.setScrollPosition(clayId, data.scrollX, clamped)
      markDirty()
    },

    scrollBy(dy: number) {
      const data = clay.getScrollContainerData(clayId)
      if (!data.found) return
      const newY = data.scrollY + dy
      const maxScroll = Math.min(0, -(data.contentHeight - data.viewportHeight))
      const clamped = Math.max(maxScroll, Math.min(0, newY))
      clay.setScrollPosition(clayId, data.scrollX, clamped)
      markDirty()
    },

    scrollIntoView(y: number, height: number) {
      const data = clay.getScrollContainerData(clayId)
      if (!data.found) return
      // y is in content coordinates. scrollY is negative.
      const visibleTop = -data.scrollY
      const visibleBottom = visibleTop + data.viewportHeight
      if (y < visibleTop) {
        // Target is above viewport — scroll up
        handle.scrollTo(-y)
      } else if (y + height > visibleBottom) {
        // Target is below viewport — scroll down
        handle.scrollTo(-(y + height - data.viewportHeight))
      }
      // Already visible — no scroll needed
    },

    get _clayId() { return clayId },
  }

  scrollHandles.set(clayId, handle)
  return handle
}

/** Reset all scroll handles. Called on mount cleanup. */
export function resetScrollHandles() {
  scrollHandles.clear()
}
