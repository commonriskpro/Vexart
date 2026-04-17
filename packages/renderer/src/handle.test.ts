import { describe, expect, test } from "bun:test"
import { createNode, insertChild, removeChild } from "../../engine/src/ffi/node"
import { createHandle } from "../../runtime/src/handle"

describe("createHandle", () => {
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

  test("_node gives access to underlying node", () => {
    const node = createNode("box")
    const handle = createHandle(node)
    expect(handle._node).toBe(node)
  })
})
