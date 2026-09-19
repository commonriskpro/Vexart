/**
 * Shared keyboard navigation hook for collection/list components.
 *
 * Provides standardized arrow/vim key navigation, page navigation,
 * bounds checking, disabled item skipping, and looping.
 *
 * @public
 */

import { createSignal, createComputed, untrack, type Accessor } from "solid-js"
import type { KeyEvent } from "@vexart/engine"

/** @public */
export type ListNavigationOrientation = "vertical" | "horizontal" | "both"

/** @public */
export type ListNavigationOptions = {
  /** Total number of items or reactive accessor returning total items. */
  count: number | (() => number)
  /** Currently selected/highlighted index or accessor. */
  selectedIndex?: number | (() => number)
  /** Called when an item is confirmed/selected (e.g. Enter key). */
  onSelect?: (index: number) => void
  /** Called when selected index changes via navigation or programmatic update. */
  onSelectedChange?: (index: number) => void
  /** Whether navigation wraps around at start/end. Default: false. */
  loop?: boolean
  /** Navigation orientation. Default: "vertical". */
  orientation?: ListNavigationOrientation
  /** Whether vim navigation keys (j/k or h/l) are enabled. Default: true. */
  vim?: boolean
  /** Number of items to jump on PageUp / PageDown. Default: 5. */
  pageSize?: number | (() => number)
  /** Predicate returning whether an item at index is disabled. */
  isItemDisabled?: (index: number) => boolean
}

/** @public */
export type ListNavigationReturn = {
  /** Reactive accessor for currently selected/highlighted index. */
  selectedIndex: Accessor<number>
  /** Programmatically set selected index and trigger onSelectedChange. */
  setSelectedIndex: (index: number) => void
  /** Key event handler. Returns true if the key was handled. */
  onKeyDown: (event: KeyEvent) => boolean
  /** Move to next enabled item. */
  next: () => void
  /** Move to previous enabled item. */
  prev: () => void
  /** Move to first enabled item. */
  first: () => void
  /** Move to last enabled item. */
  last: () => void
  /** Jump forward by pageSize. */
  pageNext: () => void
  /** Jump backward by pageSize. */
  pagePrev: () => void
}

/** @public */
export function useListNavigation(options: ListNavigationOptions): ListNavigationReturn {
  const getCount = () =>
    typeof options.count === "function" ? options.count() : options.count

  const getSelectedIndex = () =>
    typeof options.selectedIndex === "function"
      ? options.selectedIndex()
      : options.selectedIndex

  const initial = getSelectedIndex() ?? 0
  const [internalIndex, setInternalIndex] = createSignal(initial)

  if (typeof options.selectedIndex === "function") {
    createComputed(() => {
      const s = (options.selectedIndex as () => number)()
      if (s !== undefined) {
        setInternalIndex(s)
      }
    })
  }

  const isDisabled = (index: number): boolean => {
    if (index < 0 || index >= getCount()) return true
    return options.isItemDisabled ? options.isItemDisabled(index) : false
  }

  function setSelectedIndex(index: number) {
    setInternalIndex(index)
    options.onSelectedChange?.(index)
  }

  // Clamp index if count shrinks
  createComputed(() => {
    const total = getCount()
    const current = untrack(internalIndex)
    if (total > 0 && current >= total) {
      let target = total - 1
      while (target >= 0 && isDisabled(target)) {
        target--
      }
      setSelectedIndex(target >= 0 ? target : Math.max(0, total - 1))
    }
  })

  function first() {
    const total = getCount()
    if (total <= 0) return
    for (let i = 0; i < total; i++) {
      if (!isDisabled(i)) {
        setSelectedIndex(i)
        return
      }
    }
  }

  function last() {
    const total = getCount()
    if (total <= 0) return
    for (let i = total - 1; i >= 0; i--) {
      if (!isDisabled(i)) {
        setSelectedIndex(i)
        return
      }
    }
  }

  function next() {
    const total = getCount()
    if (total <= 0) return
    const current = internalIndex()
    const loop = options.loop ?? false

    if (loop) {
      let candidate = current < 0 ? 0 : (current + 1) % total
      let attempts = 0
      while (isDisabled(candidate) && attempts < total) {
        candidate = (candidate + 1) % total
        attempts++
      }
      if (!isDisabled(candidate)) {
        setSelectedIndex(candidate)
      }
    } else {
      let candidate = current < 0 ? 0 : current + 1
      while (candidate < total && isDisabled(candidate)) {
        candidate++
      }
      if (candidate < total && !isDisabled(candidate)) {
        setSelectedIndex(candidate)
      }
    }
  }

  function prev() {
    const total = getCount()
    if (total <= 0) return
    const current = internalIndex()
    const loop = options.loop ?? false

    if (loop) {
      let candidate = current <= 0 ? total - 1 : current - 1
      let attempts = 0
      while (isDisabled(candidate) && attempts < total) {
        candidate = candidate <= 0 ? total - 1 : candidate - 1
        attempts++
      }
      if (!isDisabled(candidate)) {
        setSelectedIndex(candidate)
      }
    } else {
      let candidate = current < 0 ? 0 : current - 1
      while (candidate >= 0 && isDisabled(candidate)) {
        candidate--
      }
      if (candidate >= 0 && !isDisabled(candidate)) {
        setSelectedIndex(candidate)
      }
    }
  }

  const getPageSize = () => {
    const size = typeof options.pageSize === "function" ? options.pageSize() : options.pageSize
    return size && size > 0 ? size : 5
  }

  function pageNext() {
    const total = getCount()
    if (total <= 0) return
    const pageSize = getPageSize()
    const current = internalIndex()
    const base = current < 0 ? 0 : current
    const target = Math.min(total - 1, base + pageSize)

    if (!isDisabled(target)) {
      setSelectedIndex(target)
      return
    }
    for (let i = target + 1; i < total; i++) {
      if (!isDisabled(i)) {
        setSelectedIndex(i)
        return
      }
    }
    for (let i = target - 1; i > base; i--) {
      if (!isDisabled(i)) {
        setSelectedIndex(i)
        return
      }
    }
  }

  function pagePrev() {
    const total = getCount()
    if (total <= 0) return
    const pageSize = getPageSize()
    const current = internalIndex()
    const base = current < 0 ? 0 : current
    const target = Math.max(0, base - pageSize)

    if (!isDisabled(target)) {
      setSelectedIndex(target)
      return
    }
    for (let i = target - 1; i >= 0; i--) {
      if (!isDisabled(i)) {
        setSelectedIndex(i)
        return
      }
    }
    for (let i = target + 1; i < base; i++) {
      if (!isDisabled(i)) {
        setSelectedIndex(i)
        return
      }
    }
  }

  function onKeyDown(e: KeyEvent): boolean {
    if (getCount() <= 0) return false
    const hasModifier = Boolean(e.mods && (e.mods.ctrl || e.mods.alt || e.mods.meta))
    if (hasModifier) return false

    const orientation = options.orientation ?? "vertical"
    const vim = options.vim ?? true
    const key = (e.key ?? "").toLowerCase()

    const isVerticalNext = key === "down" || (vim && key === "j")
    const isVerticalPrev = key === "up" || (vim && key === "k")
    const isHorizontalNext = key === "right" || (vim && key === "l")
    const isHorizontalPrev = key === "left" || (vim && key === "h")

    if (orientation === "vertical" || orientation === "both") {
      if (isVerticalNext) {
        next()
        return true
      }
      if (isVerticalPrev) {
        prev()
        return true
      }
    }

    if (orientation === "horizontal" || orientation === "both") {
      if (isHorizontalNext) {
        next()
        return true
      }
      if (isHorizontalPrev) {
        prev()
        return true
      }
    }

    if (key === "home") {
      first()
      return true
    }
    if (key === "end") {
      last()
      return true
    }
    if (key === "pagedown") {
      pageNext()
      return true
    }
    if (key === "pageup") {
      pagePrev()
      return true
    }

    if (key === "enter" && options.onSelect) {
      const current = internalIndex()
      if (current >= 0 && current < getCount() && !isDisabled(current)) {
        options.onSelect(current)
        return true
      }
    }

    return false
  }

  return {
    selectedIndex: internalIndex,
    setSelectedIndex,
    onKeyDown,
    next,
    prev,
    first,
    last,
    pageNext,
    pagePrev,
  }
}

/** @public */
export const createListNavigation = useListNavigation
