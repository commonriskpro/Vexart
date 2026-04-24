import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createNode } from "../ffi/node"
import { createElement, insertNode, setProp } from "./reconciler"
import { disableNativeEventDispatch, enableNativeEventDispatch } from "../ffi/native-event-dispatch-flags"
import { destroyNativeScene, nativeSceneCreateNode } from "../ffi/native-scene"
import { disableNativeSceneGraph, enableNativeSceneGraph } from "../ffi/native-scene-graph-flags"
import { dispatchFocusInput, getNodeFocusId, focusedId, resetFocus, setFocusedId } from "./focus"
import type { KeyEvent } from "../input/types"

const NO_MODS = { shift: false, alt: false, ctrl: false, meta: false } as const

function tabEvent(shift = false): KeyEvent {
  return { type: "key", key: "tab", char: "\t", mods: { ...NO_MODS, shift } }
}

describe("focus native dispatch", () => {
  beforeEach(() => {
    resetFocus()
    enableNativeSceneGraph()
    enableNativeEventDispatch()
  })

  afterEach(() => {
    resetFocus()
    destroyNativeScene()
    disableNativeEventDispatch()
    disableNativeSceneGraph()
  })

  test("Tab follows native preorder instead of registry insertion order", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const a = createElement("box")
    const b = createElement("box")
    const c = createElement("box")

    insertNode(root, a)
    insertNode(a, b)
    insertNode(a, c)

    setProp(c, "focusable", true)
    setProp(b, "focusable", true)
    setProp(a, "focusable", true)

    setFocusedId(getNodeFocusId(a) ?? null)
    dispatchFocusInput(tabEvent())

    expect(focusedId()).toBe(getNodeFocusId(b) ?? null)
  })

  test("Shift+Tab follows native reverse preorder", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const a = createElement("box")
    const b = createElement("box")
    const c = createElement("box")

    insertNode(root, a)
    insertNode(a, b)
    insertNode(a, c)

    setProp(c, "focusable", true)
    setProp(b, "focusable", true)
    setProp(a, "focusable", true)

    setFocusedId(getNodeFocusId(a) ?? null)
    dispatchFocusInput(tabEvent(true))

    expect(focusedId()).toBe(getNodeFocusId(c) ?? null)
  })
})
