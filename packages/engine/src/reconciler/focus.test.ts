import { beforeEach, describe, expect, test } from "bun:test"
import { createNode } from "../ffi/node"
import { createElement, insertNode, setProp } from "./reconciler"
import { dispatchFocusInput, focusedId, getNodeFocusId, pushFocusScope, resetFocus, setFocusedId, useFocus } from "./focus"
import { createRoot } from "solid-js"
import type { KeyEvent } from "../input/types"

const NO_MODS = { shift: false, alt: false, ctrl: false, meta: false } as const

function tabEvent(shift = false): KeyEvent {
  return { type: "key", key: "tab", char: "\t", mods: { ...NO_MODS, shift } }
}

describe("focus dispatch", () => {
  beforeEach(() => resetFocus())

  test("Tab follows TS focus registry order", () => {
    const root = createNode("root")
    const a = createElement("box")
    const b = createElement("box")
    const c = createElement("box")

    insertNode(root, a)
    insertNode(a, b)
    insertNode(a, c)

    setProp(c, "focusable", true)
    setProp(b, "focusable", true)
    setProp(a, "focusable", true)

    setFocusedId(getNodeFocusId(c) ?? null)
    dispatchFocusInput(tabEvent())

    expect(focusedId()).toBe(getNodeFocusId(b) ?? null)
  })

  test("Shift+Tab follows TS focus registry order in reverse", () => {
    const root = createNode("root")
    const a = createElement("box")
    const b = createElement("box")
    const c = createElement("box")

    insertNode(root, a)
    insertNode(a, b)
    insertNode(a, c)

    setProp(c, "focusable", true)
    setProp(b, "focusable", true)
    setProp(a, "focusable", true)

    setFocusedId(getNodeFocusId(b) ?? null)
    dispatchFocusInput(tabEvent(true))

    expect(focusedId()).toBe(getNodeFocusId(c) ?? null)
  })

  test("pushFocusScope restores previous focus if still in registry", () => {
    createRoot((dispose) => {
      useFocus({ id: "btn-1" })
      useFocus({ id: "btn-2" })
      setFocusedId("btn-2")

      const pop = pushFocusScope()
      expect(focusedId()).toBeNull()

      useFocus({ id: "dialog-btn" })
      expect(focusedId()).toBe("dialog-btn")

      pop()
      expect(focusedId()).toBe("btn-2")
      dispose()
    })
  })

  test("pushFocusScope falls back to first entry if previous focus was removed", () => {
    createRoot((dispose) => {
      let disposeBtn2: () => void = () => {}
      useFocus({ id: "btn-1" })
      createRoot((d) => {
        disposeBtn2 = d
        useFocus({ id: "btn-2" })
      })
      setFocusedId("btn-2")

      const pop = pushFocusScope()
      // btn-2 gets unmounted while scope is active
      disposeBtn2()

      pop()
      expect(focusedId()).toBe("btn-1")
      dispose()
    })
  })

  test("pushFocusScope sets null if active registry has no entries", () => {
    createRoot((dispose) => {
      let disposeBtn: () => void = () => {}
      createRoot((d) => {
        disposeBtn = d
        useFocus({ id: "btn-1" })
      })
      setFocusedId("btn-1")

      const pop = pushFocusScope()
      disposeBtn()

      pop()
      expect(focusedId()).toBeNull()
      dispose()
    })
  })

  test("pushFocusScope out-of-order pop does not alter active scope focus", () => {
    createRoot((dispose) => {
      useFocus({ id: "base-btn" })
      setFocusedId("base-btn")

      const pop1 = pushFocusScope()
      useFocus({ id: "scope1-btn" })
      expect(focusedId()).toBe("scope1-btn")

      const pop2 = pushFocusScope()
      useFocus({ id: "scope2-btn" })
      expect(focusedId()).toBe("scope2-btn")

      // Pop scope1 while scope2 is active (out of order)
      pop1()
      // Active scope should still be scope2 and focusedId should remain scope2-btn
      expect(focusedId()).toBe("scope2-btn")

      pop2()
      expect(focusedId()).toBe("base-btn")
      dispose()
    })
  })
})
