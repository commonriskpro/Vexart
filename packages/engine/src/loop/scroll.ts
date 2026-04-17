import { clay } from "../ffi/clay"
import { markDirty } from "../reconciler/dirty"

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

const scrollHandles = new Map<string, ScrollHandle>()

export function createScrollHandle(clayId: string): ScrollHandle {
  const existing = scrollHandles.get(clayId)
  if (existing) return existing

  const handle: ScrollHandle = {
    get scrollX() { return clay.getScrollContainerData(clayId).scrollX },
    get scrollY() { return clay.getScrollContainerData(clayId).scrollY },
    get contentWidth() { return clay.getScrollContainerData(clayId).contentWidth },
    get contentHeight() { return clay.getScrollContainerData(clayId).contentHeight },
    get viewportWidth() { return clay.getScrollContainerData(clayId).viewportWidth },
    get viewportHeight() { return clay.getScrollContainerData(clayId).viewportHeight },
    get y() { return clay.getScrollContainerData(clayId).scrollY },
    get height() { return clay.getScrollContainerData(clayId).viewportHeight },
    get scrollHeight() { return clay.getScrollContainerData(clayId).contentHeight },
    get scrollTop() { return -clay.getScrollContainerData(clayId).scrollY },
    scrollTo(y: number) {
      const data = clay.getScrollContainerData(clayId)
      if (!data.found) return
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
      const visibleTop = -data.scrollY
      const visibleBottom = visibleTop + data.viewportHeight
      if (y < visibleTop) handle.scrollTo(-y)
      else if (y + height > visibleBottom) handle.scrollTo(-(y + height - data.viewportHeight))
    },
    get _clayId() { return clayId },
  }

  scrollHandles.set(clayId, handle)
  return handle
}

export function resetScrollHandles() {
  scrollHandles.clear()
}
