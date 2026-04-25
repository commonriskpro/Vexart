import { beforeEach, describe, expect, test } from "bun:test"
import { createNode } from "../ffi/node"
import { createElement, insertNode, setProp } from "./reconciler"
import { dispatchFocusInput, focusedId, getNodeFocusId, resetFocus, setFocusedId } from "./focus"
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
})
