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
  nativeInteractionFrame,
  nativeReleasePointerCapture,
  nativeSetPointerCapture,
} from "./native-scene-events"
import { disableNativeSceneGraph, enableNativeSceneGraph } from "./native-scene-graph-flags"
import { dispatchNativeInteractionFrame, dispatchNativePressChain, type InteractiveStatesBag } from "../loop/layout"
import { resetFocus } from "../reconciler/focus"
import { getVexartFfiCallCountsBySymbol, resetVexartFfiCallCounts } from "./vexart-bridge"

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

  test("native interaction frame emits hover active mouse and press records", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const parent = createElement("box")
    setProp(parent, "focusable", true)
    const child = createElement("box")
    setProp(child, "onMouseOver", () => {})
    setProp(child, "onMouseMove", () => {})
    setProp(child, "onMouseDown", () => {})
    setProp(child, "onMouseUp", () => {})
    setProp(child, "onPress", () => {})

    insertNode(root, parent)
    insertNode(parent, child)
    nativeSceneSetLayout(parent._nativeId, 0, 0, 100, 100)
    nativeSceneSetLayout(child._nativeId, 10, 10, 20, 20)

    const move = nativeInteractionFrame({ x: 15, y: 15, pointerDown: false, pointerDirty: true, pendingPress: false, pendingRelease: false })
    expect(move.some((record) => record.nodeId === child._nativeId! && record.eventKind === NATIVE_EVENT_KIND.MOUSE_OVER)).toBe(true)
    expect(move.some((record) => record.nodeId === child._nativeId! && record.eventKind === NATIVE_EVENT_KIND.MOUSE_MOVE)).toBe(true)

    const down = nativeInteractionFrame({ x: 15, y: 15, pointerDown: true, pointerDirty: false, pendingPress: true, pendingRelease: false })
    expect(down.some((record) => record.nodeId === child._nativeId! && record.eventKind === NATIVE_EVENT_KIND.MOUSE_DOWN)).toBe(true)

    const up = nativeInteractionFrame({ x: 15, y: 15, pointerDown: false, pointerDirty: false, pendingPress: false, pendingRelease: true })
    expect(up.some((record) => record.nodeId === child._nativeId! && record.eventKind === NATIVE_EVENT_KIND.MOUSE_UP)).toBe(true)
    expect(up.some((record) => record.nodeId === child._nativeId! && record.eventKind === NATIVE_EVENT_KIND.PRESS_CANDIDATE)).toBe(true)
    expect(up.some((record) => record.nodeId === parent._nativeId! && record.eventKind === NATIVE_EVENT_KIND.PRESS_CANDIDATE)).toBe(true)
  })

  test("native interaction frame hit-tests transformed visual bounds", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const node = createElement("box")
    setProp(node, "transform", { translateX: 50 })
    setProp(node, "onMouseOver", () => {})

    insertNode(root, node)
    nativeSceneSetLayout(node._nativeId, 0, 0, 20, 20)

    const original = nativeInteractionFrame({ x: 10, y: 10, pointerDown: false, pointerDirty: true, pendingPress: false, pendingRelease: false })
    expect(original.some((record) => record.nodeId === node._nativeId! && record.eventKind === NATIVE_EVENT_KIND.MOUSE_OVER)).toBe(false)

    const transformed = nativeInteractionFrame({ x: 55, y: 10, pointerDown: false, pointerDirty: true, pendingPress: false, pendingRelease: false })
    expect(transformed.some((record) => record.nodeId === node._nativeId! && record.eventKind === NATIVE_EVENT_KIND.MOUSE_OVER)).toBe(true)
  })

  test("native interaction dispatcher invokes JS mouse and press callbacks", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")
    const calls: string[] = []

    const node = createElement("box")
    setProp(node, "focusable", true)
    setProp(node, "onMouseOver", () => calls.push("over"))
    setProp(node, "onMouseMove", () => calls.push("move"))
    setProp(node, "onMouseDown", () => calls.push("down"))
    setProp(node, "onMouseUp", () => calls.push("up"))
    setProp(node, "onPress", () => calls.push("press"))

    insertNode(root, node)
    nativeSceneSetLayout(node._nativeId, 10, 10, 20, 20)
    const rectNodeById = new Map([[node.id, node]])
    const bag: InteractiveStatesBag = {
      rectNodes: [node],
      rectNodeById,
      pointerX: 15,
      pointerY: 15,
      pointerDown: false,
      pointerDirty: true,
      pendingPress: false,
      pendingRelease: false,
      capturedNodeId: 0,
      pressOriginSet: false,
      prevActiveNode: null,
      cellWidth: 8,
      cellHeight: 16,
      onChanged: () => calls.push("changed"),
      useNativePressDispatch: true,
      useNativeInteractionDispatch: true,
    }

    dispatchNativeInteractionFrame(bag)
    bag.pointerDirty = false
    bag.pointerDown = true
    bag.pendingPress = true
    dispatchNativeInteractionFrame(bag)
    bag.pointerDown = false
    bag.pendingRelease = true
    dispatchNativeInteractionFrame(bag)

    expect(calls).toContain("over")
    expect(calls).toContain("move")
    expect(calls).toContain("down")
    expect(calls).toContain("up")
    expect(calls).toContain("press")
    expect(node._hovered).toBe(true)
    expect(node._active).toBe(false)
  })

  test("native interaction frame uses one batched FFI call", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")
    const node = createElement("box")
    setProp(node, "onMouseMove", () => {})
    insertNode(root, node)
    nativeSceneSetLayout(node._nativeId, 10, 10, 20, 20)

    resetVexartFfiCallCounts()
    const records = nativeInteractionFrame({ x: 15, y: 15, pointerDown: false, pointerDirty: true, pendingPress: false, pendingRelease: false })
    const counts = getVexartFfiCallCountsBySymbol()

    expect(records.length).toBeGreaterThan(0)
    expect(counts.get("vexart_input_interaction_frame")).toBe(1)
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

  test("native hit test honors pointer passthrough without skipping children", () => {
    const root = createNode("root")
    root._nativeId = nativeSceneCreateNode("root")

    const parent = createElement("box")
    setProp(parent, "pointerPassthrough", true)
    const child = createElement("box")

    insertNode(root, parent)
    insertNode(parent, child)
    nativeSceneSetLayout(parent._nativeId, 0, 0, 100, 100)
    nativeSceneSetLayout(child._nativeId, 10, 10, 20, 20)

    expect(nativeSceneHitTest(15, 15)).toBe(child._nativeId!)
    expect(nativeSceneHitTest(90, 90)).toBe(0n)
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
