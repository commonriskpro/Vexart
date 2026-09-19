import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import type { KeyEvent } from "@vexart/engine"
import { useListNavigation, createListNavigation } from "./list-navigation"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")

function makeKey(key: string, mods?: { ctrl?: boolean; alt?: boolean; meta?: boolean }): KeyEvent {
  return {
    type: "key",
    key,
    char: key.length === 1 ? key : "",
    mods: {
      ctrl: mods?.ctrl ?? false,
      alt: mods?.alt ?? false,
      shift: false,
      meta: mods?.meta ?? false,
    },
  }
}

describe("useListNavigation", () => {
  test("basic next and prev without loop stops at bounds", () => {
    createRoot((dispose) => {
      let changedTo = -1
      const nav = useListNavigation({
        count: 3,
        selectedIndex: 0,
        onSelectedChange: (i) => {
          changedTo = i
        },
      })

      expect(nav.selectedIndex()).toBe(0)

      // Next to 1
      nav.next()
      expect(nav.selectedIndex()).toBe(1)
      expect(changedTo).toBe(1)

      // Next to 2
      nav.next()
      expect(nav.selectedIndex()).toBe(2)
      expect(changedTo).toBe(2)

      // Next beyond bound stays at 2
      nav.next()
      expect(nav.selectedIndex()).toBe(2)
      expect(changedTo).toBe(2)

      // Prev to 1
      nav.prev()
      expect(nav.selectedIndex()).toBe(1)
      expect(changedTo).toBe(1)

      // Prev to 0
      nav.prev()
      expect(nav.selectedIndex()).toBe(0)
      expect(changedTo).toBe(0)

      // Prev beyond bound stays at 0
      nav.prev()
      expect(nav.selectedIndex()).toBe(0)
      expect(changedTo).toBe(0)

      dispose()
    })
  })

  test("loop: true wraps around next and prev", () => {
    createRoot((dispose) => {
      const nav = useListNavigation({
        count: 3,
        selectedIndex: 0,
        loop: true,
      })

      expect(nav.selectedIndex()).toBe(0)

      // Prev from 0 wraps to 2
      nav.prev()
      expect(nav.selectedIndex()).toBe(2)

      // Next from 2 wraps to 0
      nav.next()
      expect(nav.selectedIndex()).toBe(0)

      dispose()
    })
  })

  test("home and end jump to first and last items", () => {
    createRoot((dispose) => {
      const nav = useListNavigation({
        count: 10,
        selectedIndex: 5,
      })

      nav.first()
      expect(nav.selectedIndex()).toBe(0)

      nav.last()
      expect(nav.selectedIndex()).toBe(9)

      // Keyboard home and end
      const handledHome = nav.onKeyDown(makeKey("home"))
      expect(handledHome).toBe(true)
      expect(nav.selectedIndex()).toBe(0)

      const handledEnd = nav.onKeyDown(makeKey("end"))
      expect(handledEnd).toBe(true)
      expect(nav.selectedIndex()).toBe(9)

      dispose()
    })
  })

  test("pageNext and pagePrev jump by pageSize", () => {
    createRoot((dispose) => {
      const nav = useListNavigation({
        count: 20,
        selectedIndex: 2,
        pageSize: 5,
      })

      nav.pageNext()
      expect(nav.selectedIndex()).toBe(7)

      nav.pageNext()
      expect(nav.selectedIndex()).toBe(12)

      nav.pagePrev()
      expect(nav.selectedIndex()).toBe(7)

      // Keyboard pageup and pagedown
      const handledDown = nav.onKeyDown(makeKey("pagedown"))
      expect(handledDown).toBe(true)
      expect(nav.selectedIndex()).toBe(12)

      const handledUp = nav.onKeyDown(makeKey("pageup"))
      expect(handledUp).toBe(true)
      expect(nav.selectedIndex()).toBe(7)

      dispose()
    })
  })

  test("skips disabled items on next, prev, first, last, and page navigation", () => {
    createRoot((dispose) => {
      // Items: 0 (enabled), 1 (disabled), 2 (disabled), 3 (enabled), 4 (disabled)
      const disabled = (i: number) => i === 1 || i === 2 || i === 4
      const nav = useListNavigation({
        count: 5,
        selectedIndex: 0,
        isItemDisabled: disabled,
      })

      // Next should skip 1 and 2, landing on 3
      nav.next()
      expect(nav.selectedIndex()).toBe(3)

      // Next again cannot land on 4 (disabled), so stays on 3
      nav.next()
      expect(nav.selectedIndex()).toBe(3)

      // Prev should skip 2 and 1, landing on 0
      nav.prev()
      expect(nav.selectedIndex()).toBe(0)

      // Last should land on 3 because 4 is disabled
      nav.last()
      expect(nav.selectedIndex()).toBe(3)

      // First should land on 0
      nav.first()
      expect(nav.selectedIndex()).toBe(0)

      dispose()
    })
  })

  test("skips disabled items when looping", () => {
    createRoot((dispose) => {
      // Items: 0 (enabled), 1 (disabled), 2 (enabled)
      const disabled = (i: number) => i === 1
      const nav = useListNavigation({
        count: 3,
        selectedIndex: 2,
        loop: true,
        isItemDisabled: disabled,
      })

      // Next from 2 wraps to 0 (skipping 1)
      nav.next()
      expect(nav.selectedIndex()).toBe(0)

      // Next from 0 skips 1 and lands on 2
      nav.next()
      expect(nav.selectedIndex()).toBe(2)

      // Prev from 2 skips 1 and wraps to 0
      nav.prev()
      expect(nav.selectedIndex()).toBe(0)

      // Prev from 0 wraps to 2
      nav.prev()
      expect(nav.selectedIndex()).toBe(2)

      dispose()
    })
  })

  test("vim keys enabled by default and disabled when vim: false", () => {
    createRoot((dispose) => {
      const navDefault = useListNavigation({ count: 5, selectedIndex: 0 })

      expect(navDefault.onKeyDown(makeKey("j"))).toBe(true)
      expect(navDefault.selectedIndex()).toBe(1)

      expect(navDefault.onKeyDown(makeKey("k"))).toBe(true)
      expect(navDefault.selectedIndex()).toBe(0)

      const navNoVim = useListNavigation({ count: 5, selectedIndex: 0, vim: false })

      expect(navNoVim.onKeyDown(makeKey("j"))).toBe(false)
      expect(navNoVim.selectedIndex()).toBe(0)

      expect(navNoVim.onKeyDown(makeKey("k"))).toBe(false)
      expect(navNoVim.selectedIndex()).toBe(0)

      // Arrow keys still work
      expect(navNoVim.onKeyDown(makeKey("down"))).toBe(true)
      expect(navNoVim.selectedIndex()).toBe(1)

      dispose()
    })
  })

  test("orientation controls which keys are handled", () => {
    createRoot((dispose) => {
      // Vertical
      const navVert = useListNavigation({ count: 5, selectedIndex: 0, orientation: "vertical" })
      expect(navVert.onKeyDown(makeKey("down"))).toBe(true)
      expect(navVert.onKeyDown(makeKey("right"))).toBe(false)
      expect(navVert.onKeyDown(makeKey("left"))).toBe(false)
      expect(navVert.selectedIndex()).toBe(1)

      // Horizontal
      const navHoriz = useListNavigation({ count: 5, selectedIndex: 0, orientation: "horizontal" })
      expect(navHoriz.onKeyDown(makeKey("down"))).toBe(false)
      expect(navHoriz.onKeyDown(makeKey("up"))).toBe(false)
      expect(navHoriz.onKeyDown(makeKey("right"))).toBe(true)
      expect(navHoriz.onKeyDown(makeKey("l"))).toBe(true)
      expect(navHoriz.selectedIndex()).toBe(2)
      expect(navHoriz.onKeyDown(makeKey("left"))).toBe(true)
      expect(navHoriz.onKeyDown(makeKey("h"))).toBe(true)
      expect(navHoriz.selectedIndex()).toBe(0)

      // Both
      const navBoth = useListNavigation({ count: 5, selectedIndex: 0, orientation: "both" })
      expect(navBoth.onKeyDown(makeKey("down"))).toBe(true)
      expect(navBoth.selectedIndex()).toBe(1)
      expect(navBoth.onKeyDown(makeKey("right"))).toBe(true)
      expect(navBoth.selectedIndex()).toBe(2)
      expect(navBoth.onKeyDown(makeKey("up"))).toBe(true)
      expect(navBoth.selectedIndex()).toBe(1)
      expect(navBoth.onKeyDown(makeKey("left"))).toBe(true)
      expect(navBoth.selectedIndex()).toBe(0)

      dispose()
    })
  })

  test("onSelect triggered on Enter key and ignored if disabled", () => {
    createRoot((dispose) => {
      let selectedIndex = -1
      const nav = useListNavigation({
        count: 5,
        selectedIndex: 1,
        onSelect: (i) => {
          selectedIndex = i
        },
        isItemDisabled: (i) => i === 2,
      })

      // Enter at index 1 triggers onSelect
      expect(nav.onKeyDown(makeKey("enter"))).toBe(true)
      expect(selectedIndex).toBe(1)

      // Move to 3 (since 2 is disabled)
      nav.next()
      expect(nav.selectedIndex()).toBe(3)
      expect(nav.onKeyDown(makeKey("enter"))).toBe(true)
      expect(selectedIndex).toBe(3)

      // Manually set to disabled index 2: Enter returns false and does not trigger onSelect
      nav.setSelectedIndex(2)
      selectedIndex = -1
      expect(nav.onKeyDown(makeKey("enter"))).toBe(false)
      expect(selectedIndex).toBe(-1)

      dispose()
    })
  })

  test("ignores modified keystrokes (Ctrl/Alt/Meta)", () => {
    createRoot((dispose) => {
      const nav = useListNavigation({ count: 5, selectedIndex: 0 })

      expect(nav.onKeyDown(makeKey("down", { ctrl: true }))).toBe(false)
      expect(nav.onKeyDown(makeKey("j", { alt: true }))).toBe(false)
      expect(nav.onKeyDown(makeKey("down", { meta: true }))).toBe(false)
      expect(nav.selectedIndex()).toBe(0)

      dispose()
    })
  })

  test.skipIf(!browserRuntime)("reactive count accessor and bounds clamping", () => {
    createRoot((dispose) => {
      const [count, setCount] = createSignal(5)
      const nav = useListNavigation({
        count,
        selectedIndex: 4,
      })

      expect(nav.selectedIndex()).toBe(4)

      // Shrink count to 3
      setCount(3)
      // Clamp effect should adjust index to 2
      expect(nav.selectedIndex()).toBe(2)

      dispose()
    })
  })

  test("createListNavigation alias behaves identically", () => {
    createRoot((dispose) => {
      const nav = createListNavigation({
        count: 3,
        selectedIndex: 0,
      })
      expect(nav.selectedIndex()).toBe(0)
      nav.next()
      expect(nav.selectedIndex()).toBe(1)
      dispose()
    })
  })
})
