/**
 * scroll.ts — programmatic scroll state
 *
 * Provides scroll handles for programmatic scroll control.
 * Flexily layout output drives scroll geometry;
 * scroll state is managed TS-side.
 *
 * The ScrollHandle API is preserved for API continuity. Scroll positions
 * are tracked in this module; the vexart composite layer handles the
 * scissor clipping during paint (paint-side, unchanged).
 *
 * Scroll IDs are stable strings shared by scroll containers and handles.
 */

import { markDirty } from "../reconciler/dirty"

/** @public */
export type ScrollHandle = {
  readonly scrollX: number
  readonly scrollY: number
  readonly contentWidth: number
  readonly contentHeight: number
  readonly viewportWidth: number
  readonly viewportHeight: number
  readonly y: number
  readonly height: number
  readonly scrollHeight: number
  readonly scrollTop: number
  scrollTo: (y: number) => void
  scrollBy: (dy: number) => void
  scrollIntoView: (y: number, height: number) => void
  readonly _scrollId: string
}

/** Internal scroll state per scroll container. */
type ScrollState = {
  scrollX: number
  scrollY: number
  contentWidth: number
  contentHeight: number
  viewportWidth: number
  viewportHeight: number
}

const scrollHandles = new Map<string, ScrollHandle>()
const scrollStates = new Map<string, ScrollState>()

function getState(scrollId: string): ScrollState {
  let state = scrollStates.get(scrollId)
  if (!state) {
    state = { scrollX: 0, scrollY: 0, contentWidth: 0, contentHeight: 0, viewportWidth: 0, viewportHeight: 0 }
    scrollStates.set(scrollId, state)
  }
  return state
}

/** @public Update scroll container geometry from layout output. */
export function updateScrollContainerGeometry(
  scrollId: string,
  viewportWidth: number,
  viewportHeight: number,
  contentWidth: number,
  contentHeight: number,
) {
  const state = getState(scrollId)
  state.viewportWidth = viewportWidth
  state.viewportHeight = viewportHeight
  state.contentWidth = contentWidth
  state.contentHeight = contentHeight
}

/** @public */
export function createScrollHandle(scrollId: string): ScrollHandle {
  const existing = scrollHandles.get(scrollId)
  if (existing) return existing

  const handle: ScrollHandle = {
    get scrollX() { return getState(scrollId).scrollX },
    get scrollY() { return getState(scrollId).scrollY },
    get contentWidth() { return getState(scrollId).contentWidth },
    get contentHeight() { return getState(scrollId).contentHeight },
    get viewportWidth() { return getState(scrollId).viewportWidth },
    get viewportHeight() { return getState(scrollId).viewportHeight },
    get y() { return getState(scrollId).scrollY },
    get height() { return getState(scrollId).viewportHeight },
    get scrollHeight() { return getState(scrollId).contentHeight },
    get scrollTop() { return -getState(scrollId).scrollY },
    scrollTo(y: number) {
      const state = getState(scrollId)
      const maxScroll = Math.min(0, -(state.contentHeight - state.viewportHeight))
      const clamped = Math.max(maxScroll, Math.min(0, y))
      state.scrollY = clamped
      markDirty()
    },
    scrollBy(dy: number) {
      const state = getState(scrollId)
      const newY = state.scrollY + dy
      const maxScroll = Math.min(0, -(state.contentHeight - state.viewportHeight))
      const clamped = Math.max(maxScroll, Math.min(0, newY))
      state.scrollY = clamped
      markDirty()
    },
    scrollIntoView(y: number, height: number) {
      const state = getState(scrollId)
      const visibleTop = -state.scrollY
      const visibleBottom = visibleTop + state.viewportHeight
      if (y < visibleTop) handle.scrollTo(-y)
      else if (y + height > visibleBottom) handle.scrollTo(-(y + height - state.viewportHeight))
    },
    get _scrollId() { return scrollId },
  }

  scrollHandles.set(scrollId, handle)
  return handle
}

/** @public Release scroll state for an unmounted scroll container. */
export function releaseScrollHandle(scrollId: string) {
  scrollHandles.delete(scrollId)
  scrollStates.delete(scrollId)
}

/** @public */
export function resetScrollHandles() {
  scrollHandles.clear()
  scrollStates.clear()
}
