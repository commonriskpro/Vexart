import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createNode, removeChild, type PressEvent } from "./node"
import {
  createElement,
  solidCreateTextNode,
  insertNode,
  setProp,
} from "../reconciler/reconciler"
import {
  destroyNativeScene,
  nativeSceneComputeLayout,
  nativeSceneCreateNode,
  nativeSceneDestroyNode,
  nativeSceneHitTest,
  nativeSceneRemove,
  nativeSceneSetCellSize,
  nativeSceneSetLayout,
  nativeSceneSetProp,
  nativeSceneSetText,
  nativeSceneSnapshot,
} from "./native-scene"
import {
  nativePointerEvent,
  NATIVE_EVENT_KIND,
  nativeFocusNext,
  nativeFocusPrev,
  NATIVE_EVENT_FLAG,
  nativePressChain,
  nativeReleasePointerCapture,
  nativeSetPointerCapture,
} from "./native-scene-events"
import { disableNativeSceneGraph, enableNativeSceneGraph } from "./native-scene-graph-flags"
import { dispatchNativePressChain } from "../loop/layout"
import { resetFocus } from "../reconciler/focus"

beforeEach(() => {
  enableNativeSceneGraph()
})

afterEach(() => {
  destroyNativeScene()
  resetFocus()
  disableNativeSceneGraph()
})

describe("native scene graph", () => {
  test("snapshot mirrors create/insert/prop/text operations", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const box = createElement("box")
    setProp(box, "width", 120)
    setProp(box, "height", 60)
    setProp(box, "focusable", true)

    const text = solidCreateTextNode("hello")

    insertNode(root, box)
    insertNode(box, text)

    let snapshot = JSON.parse(nativeSceneSnapshot() ?? "{}")
    expect(snapshot.roots).toHaveLength(1)
    expect(snapshot.roots[0].children).toHaveLength(1)
    expect(snapshot.roots[0].children[0].kind).toBe(1)
    expect(snapshot.roots[0].children[0].children[0].text).toBe("hello")

    text.text = "world"
    nativeSceneSetText(text._nativeId, "world")
    snapshot = JSON.parse(nativeSceneSnapshot() ?? "{}")
    expect(snapshot.roots[0].children[0].children[0].text).toBe("world")

    removeChild(box, text)
    nativeSceneRemove(box._nativeId, text._nativeId)
    nativeSceneDestroyNode(text._nativeId)
    snapshot = JSON.parse(nativeSceneSnapshot() ?? "{}")
    expect(snapshot.roots[0].children[0].children).toHaveLength(0)
  })

  test("native hit test uses synced layout rectangles", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const parent = createElement("box")
    const child = createElement("box")

    insertNode(root, parent)
    insertNode(parent, child)

    nativeSceneSetLayout(parent._nativeId, 0, 0, 100, 100)
    nativeSceneSetLayout(child._nativeId, 10, 10, 20, 20)

    expect(nativeSceneHitTest(15, 15)).toBe(child._nativeId!)
    expect(nativeSceneHitTest(90, 90)).toBe(parent._nativeId!)
  })

  test("native pointer event record returns node geometry", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const node = createElement("box")
    insertNode(root, node)
    nativeSceneSetLayout(node._nativeId, 10, 20, 30, 40)

    const event = nativePointerEvent(15, 25, NATIVE_EVENT_KIND.POINTER_DOWN)
    expect(event).not.toBeNull()
    expect(event?.nodeId).toBe(node._nativeId!)
    expect(event?.nodeX).toBe(5)
    expect(event?.nodeY).toBe(5)
    expect(event?.width).toBe(30)
    expect(event?.height).toBe(40)
  })

  test("native press chain bubbles from target to relevant ancestors", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const parent = createElement("box")
    setProp(parent, "focusable", true)
    const child = createElement("box")
    setProp(child, "onPress", () => {})

    insertNode(root, parent)
    insertNode(parent, child)
    nativeSceneSetLayout(parent._nativeId, 0, 0, 100, 100)
    nativeSceneSetLayout(child._nativeId, 10, 10, 20, 20)

    const chain = nativePressChain(15, 15)
    expect(chain).toHaveLength(2)
    expect(chain[0]?.nodeId).toBe(child._nativeId!)
    expect(chain[0]?.flags & NATIVE_EVENT_FLAG.ON_PRESS).toBe(NATIVE_EVENT_FLAG.ON_PRESS)
    expect(chain[1]?.nodeId).toBe(parent._nativeId!)
    expect(chain[1]?.flags & NATIVE_EVENT_FLAG.FOCUSABLE).toBe(NATIVE_EVENT_FLAG.FOCUSABLE)
  })

  test("native pointer capture overrides hit-test target", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const a = createElement("box")
    const b = createElement("box")
    insertNode(root, a)
    insertNode(root, b)
    nativeSceneSetLayout(a._nativeId, 0, 0, 20, 20)
    nativeSceneSetLayout(b._nativeId, 100, 100, 20, 20)

    expect(nativeSetPointerCapture(a._nativeId!)).toBe(true)
    expect(nativeSceneHitTest(110, 110)).toBe(a._nativeId!)
    expect(nativeReleasePointerCapture(a._nativeId!)).toBe(true)
    expect(nativeSceneHitTest(110, 110)).toBe(b._nativeId!)
  })

  test("native focus order follows preorder focusable nodes", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const a = createElement("box")
    const b = createElement("box")
    const c = createElement("box")
    setProp(a, "focusable", true)
    setProp(b, "focusable", true)
    setProp(c, "focusable", true)

    insertNode(root, a)
    insertNode(a, b)
    insertNode(a, c)

    expect(nativeFocusNext()).toBe(a._nativeId!)
    expect(nativeFocusNext(a._nativeId)).toBe(b._nativeId!)
    expect(nativeFocusNext(c._nativeId)).toBe(a._nativeId!)
    expect(nativeFocusPrev(a._nativeId)).toBe(c._nativeId!)
  })

  test("native hit test skips offscreen child inside scroll container", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const scroll = createElement("box")
    setProp(scroll, "scrollY", true)
    const child = createElement("box")

    insertNode(root, scroll)
    insertNode(scroll, child)

    nativeSceneSetLayout(scroll._nativeId, 0, 0, 40, 40)
    nativeSceneSetLayout(child._nativeId, 60, 60, 20, 20)

    expect(nativeSceneHitTest(65, 65)).toBe(0n)
  })

  test("native press dispatch calls JS handlers in chain order", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")
    const calls: string[] = []

    const parent = createElement("box")
    setProp(parent, "onPress", () => calls.push("parent"))
    const child = createElement("box")
    setProp(child, "onPress", () => calls.push("child"))

    insertNode(root, parent)
    insertNode(parent, child)
    nativeSceneSetLayout(parent._nativeId, 0, 0, 100, 100)
    nativeSceneSetLayout(child._nativeId, 10, 10, 20, 20)

    expect(dispatchNativePressChain([parent, child], 15, 15)).toBe(true)
    expect(calls).toEqual(["child", "parent"])
  })

  test("native press dispatch respects stopPropagation", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")
    const calls: string[] = []

    const parent = createElement("box")
    setProp(parent, "onPress", () => calls.push("parent"))
    const child = createElement("box")
    setProp(child, "onPress", (event?: PressEvent) => {
      calls.push("child")
      event?.stopPropagation()
    })

    insertNode(root, parent)
    insertNode(parent, child)
    nativeSceneSetLayout(parent._nativeId, 0, 0, 100, 100)
    nativeSceneSetLayout(child._nativeId, 10, 10, 20, 20)

    expect(dispatchNativePressChain([parent, child], 15, 15)).toBe(true)
    expect(calls).toEqual(["child"])
  })

  test("native hit test expands tiny nodes to current cell size", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const tiny = createElement("box")
    insertNode(root, tiny)

    nativeSceneSetCellSize(8, 12)
    nativeSceneSetLayout(tiny._nativeId, 10, 10, 2, 2)

    expect(nativeSceneHitTest(7.5, 6)).toBe(tiny._nativeId!)
    expect(nativeSceneHitTest(15.1, 17.1)).toBe(0n)
  })

  test("native scene can compute retained layout from mirrored props", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const a = createElement("box")
    const b = createElement("box")

    insertNode(root, a)
    insertNode(root, b)

    nativeSceneSetProp(root._nativeId, "width", 100)
    nativeSceneSetProp(root._nativeId, "height", 20)
    nativeSceneSetProp(root._nativeId, "direction", "row")
    nativeSceneSetProp(root._nativeId, "gap", 10)
    nativeSceneSetProp(a._nativeId, "width", 20)
    nativeSceneSetProp(a._nativeId, "height", 10)
    nativeSceneSetProp(b._nativeId, "width", 30)
    nativeSceneSetProp(b._nativeId, "height", 10)

    const layout = nativeSceneComputeLayout()

    expect(layout.get(root._nativeId!)?.width).toBe(100)
    expect(layout.get(a._nativeId!)?.x).toBe(0)
    expect(layout.get(b._nativeId!)?.x).toBe(30)
  })
})
