import { beforeEach, describe, expect, test } from "bun:test"
import { createEffect, createRoot } from "solid-js"
import { createNode, insertChild, removeChild } from "../ffi/node"
import { createHandle, getHandleNode } from "./handle"
import { createElement, setProp } from "./reconciler"
import { focusedId, getNodeFocusId, resetFocus, setFocusedId } from "./focus"

describe("createHandle", () => {
  beforeEach(() => resetFocus())

  test("wraps a node with correct id and kind", () => {
    const node = createNode("box")
    const handle = createHandle(node)
    expect(handle.id).toBe(node.id)
    expect(handle.kind).toBe("box")
  })

  test("returns same handle for same node (cached)", () => {
    const node = createNode("box")
    const h1 = createHandle(node)
    const h2 = createHandle(node)
    expect(h1).toBe(h2)
  })

  test("exposes layout rect from node", () => {
    const node = createNode("box")
    node.layout.x = 10
    node.layout.y = 20
    node.layout.width = 300
    node.layout.height = 200
    const handle = createHandle(node)
    expect(handle.layout).toEqual({ x: 10, y: 20, width: 300, height: 200 })
  })

  test("layout is live — reflects changes to node", () => {
    const node = createNode("box")
    const handle = createHandle(node)
    expect(handle.layout.width).toBe(0)
    node.layout.width = 500
    expect(handle.layout.width).toBe(500)
  })

  test("isDestroyed reflects node.destroyed", () => {
    const parent = createNode("box")
    const child = createNode("box")
    insertChild(parent, child)
    const handle = createHandle(child)
    expect(handle.isDestroyed).toBe(false)
    removeChild(parent, child)
    expect(handle.isDestroyed).toBe(true)
  })

  test("children returns handles for child nodes", () => {
    const parent = createNode("box")
    const a = createNode("box")
    const b = createNode("text")
    insertChild(parent, a)
    insertChild(parent, b)
    const handle = createHandle(parent)
    const children = handle.children
    expect(children).toHaveLength(2)
    expect(children[0].id).toBe(a.id)
    expect(children[1].id).toBe(b.id)
  })

  test("parent returns handle for parent node", () => {
    const parent = createNode("box")
    const child = createNode("box")
    insertChild(parent, child)
    const childHandle = createHandle(child)
    expect(childHandle.parent).not.toBeNull()
    expect(childHandle.parent!.id).toBe(parent.id)
  })

  test("parent is null for root node", () => {
    const root = createNode("root")
    const handle = createHandle(root)
    expect(handle.parent).toBeNull()
  })

  test("keeps the engine node private while retaining an internal unwrap", () => {
    const node = createNode("box")
    const handle = createHandle(node)
    expect("_node" in handle).toBe(false)
    expect(getHandleNode(handle)).toBe(node)
  })

  test("rejects handles not created by the engine", () => {
    expect(() => getHandleNode({} as ReturnType<typeof createHandle>)).toThrow(TypeError)
  })

  test("focuses and reports focus using the registered fallback ID", () => {
    const node = createElement("box")
    setProp(node, "focusable", true)
    const handle = createHandle(node)
    const id = `node-focus-${node.id}`

    expect(getNodeFocusId(node)).toBe(id)
    handle.focus()
    expect(focusedId()).toBe(id)
    expect(handle.isFocused).toBe(true)
    handle.blur()
    expect(focusedId()).toBeNull()
    expect(handle.isFocused).toBe(false)
    handle.focus()
    expect(focusedId()).toBe(id)
    expect(handle.isFocused).toBe(true)
  })

  test("uses an explicit focus ID and follows focus ID changes", () => {
    const node = createElement("box")
    setProp(node, "focusId", "initial-focus")
    setProp(node, "focusable", true)
    const handle = createHandle(node)

    handle.focus()
    expect(focusedId()).toBe("initial-focus")
    expect(handle.isFocused).toBe(true)

    setProp(node, "focusId", "renamed-focus")
    expect(getNodeFocusId(node)).toBe("renamed-focus")
    expect(handle.isFocused).toBe(true)
    handle.blur()
    expect(focusedId()).toBeNull()
    handle.focus()
    expect(focusedId()).toBe("renamed-focus")
  })

  test("uses the node id prop when no focus ID is provided", () => {
    const node = createElement("box")
    setProp(node, "id", "semantic-id")
    setProp(node, "focusable", true)
    const handle = createHandle(node)

    expect(getNodeFocusId(node)).toBe("semantic-id")
    handle.focus()
    expect(focusedId()).toBe("semantic-id")
    expect(handle.isFocused).toBe(true)
  })

  test("does not steal focus from another node when unregistered", () => {
    const focused = createElement("box")
    const unregistered = createElement("box")
    setProp(focused, "focusable", true)
    const focusedHandle = createHandle(focused)
    const unregisteredHandle = createHandle(unregistered)
    const focusedNodeId = getNodeFocusId(focused)!
    setFocusedId(focusedNodeId)

    unregisteredHandle.focus()
    expect(focusedId()).toBe(focusedNodeId)
    expect(unregisteredHandle.isFocused).toBe(false)
    unregisteredHandle.blur()
    expect(focusedId()).toBe(focusedNodeId)
    expect(focusedHandle.isFocused).toBe(true)
  })

  test("does not focus or blur a destroyed node", () => {
    const parent = createNode("box")
    const node = createElement("box")
    insertChild(parent, node)
    setProp(node, "focusable", true)
    const handle = createHandle(node)
    const id = getNodeFocusId(node)!
    setFocusedId(id)

    removeChild(parent, node)
    expect(handle.isDestroyed).toBe(true)
    expect(handle.isFocused).toBe(false)
    handle.focus()
    expect(focusedId()).toBe(id)
    handle.blur()
    expect(focusedId()).toBe(id)
  })

  test("isFocused remains reactive for an unregistered node", async () => {
    const node = createElement("box")
    const handle = createHandle(node)
    let runs = 0
    let value = true
    let dispose: () => void = () => {}
    createRoot((cleanup) => {
      dispose = cleanup
      createEffect(() => {
        runs++
        value = handle.isFocused
      })
    })

    await Promise.resolve()
    expect(runs).toBe(1)
    expect(value).toBe(false)

    setFocusedId("unregistered-focus")
    await Promise.resolve()
    expect(runs).toBe(2)
    expect(value).toBe(false)
    dispose()
  })
})
