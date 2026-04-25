/**
 * scroll.ts — Phase 2 native path
 *
 * Provides scroll handles for programmatic scroll control.
 * Per design §11, §10: Taffy layout output drives scroll geometry;
 * scroll state is managed TS-side (no Clay dependency).
 *
 * The ScrollHandle API is preserved for API continuity. Scroll positions
 * are tracked in this module; the vexart composite layer handles the
 * scissor clipping during paint (paint-side, unchanged).
 *
 * Grep gate: rg "import.*clay" packages/engine/src/loop/scroll.ts → 0 hits
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
  readonly _clayId: string
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

function getState(clayId: string): ScrollState {
  let state = scrollStates.get(clayId)
  if (!state) {
    state = { scrollX: 0, scrollY: 0, contentWidth: 0, contentHeight: 0, viewportWidth: 0, viewportHeight: 0 }
    scrollStates.set(clayId, state)
  }
  return state
}

/** @public Update scroll container geometry from layout output. */
export function updateScrollContainerGeometry(
  clayId: string,
  viewportWidth: number,
  viewportHeight: number,
  contentWidth: number,
  contentHeight: number,
) {
  const state = getState(clayId)
  state.viewportWidth = viewportWidth
  state.viewportHeight = viewportHeight
  state.contentWidth = contentWidth
  state.contentHeight = contentHeight
}

/** @public */
export function createScrollHandle(clayId: string): ScrollHandle {
  const existing = scrollHandles.get(clayId)
  if (existing) return existing

  const handle: ScrollHandle = {
    get scrollX() { return getState(clayId).scrollX },
    get scrollY() { return getState(clayId).scrollY },
    get contentWidth() { return getState(clayId).contentWidth },
    get contentHeight() { return getState(clayId).contentHeight },
    get viewportWidth() { return getState(clayId).viewportWidth },
    get viewportHeight() { return getState(clayId).viewportHeight },
    get y() { return getState(clayId).scrollY },
    get height() { return getState(clayId).viewportHeight },
    get scrollHeight() { return getState(clayId).contentHeight },
    get scrollTop() { return -getState(clayId).scrollY },
    scrollTo(y: number) {
      const state = getState(clayId)
      const maxScroll = Math.min(0, -(state.contentHeight - state.viewportHeight))
      const clamped = Math.max(maxScroll, Math.min(0, y))
      state.scrollY = clamped
      markDirty()
    },
    scrollBy(dy: number) {
      const state = getState(clayId)
      const newY = state.scrollY + dy
      const maxScroll = Math.min(0, -(state.contentHeight - state.viewportHeight))
      const clamped = Math.max(maxScroll, Math.min(0, newY))
      state.scrollY = clamped
      markDirty()
    },
    scrollIntoView(y: number, height: number) {
      const state = getState(clayId)
      const visibleTop = -state.scrollY
      const visibleBottom = visibleTop + state.viewportHeight
      if (y < visibleTop) handle.scrollTo(-y)
      else if (y + height > visibleBottom) handle.scrollTo(-(y + height - state.viewportHeight))
    },
    get _clayId() { return clayId },
  }

  scrollHandles.set(clayId, handle)
  return handle
}

/** @public Release scroll state for an unmounted scroll container. */
export function releaseScrollHandle(clayId: string) {
  scrollHandles.delete(clayId)
  scrollStates.delete(clayId)
}

/** @public */
export function resetScrollHandles() {
  scrollHandles.clear()
  scrollStates.clear()
}
