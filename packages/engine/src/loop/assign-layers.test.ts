/**
 * assign-layers.test.ts — Unit tests for layer boundary + spatial assignment.
 *
 * Tests pure tree-traversal and spatial logic only.
 * No FFI, no GPU, no layout adapter calls required.
 */

import { describe, test, expect } from "bun:test"
import { resolveNodeByPath } from "./assign-layers"
import { createNode } from "../ffi/node"
import type { WalkTreeState } from "./walk-tree"
import { traverseFrame } from "./pipeline-traverse"
import type { TGENode } from "../ffi/node"

function traverseTree(root: TGENode, width = 300, height = 200) {
  const state: WalkTreeState = {
    scrollSpeedCap: { value: 0 },
    nodeCount: { value: 0 },
    rectNodes: [],
    textNodes: [],
    boxNodes: [],
    layerBoundaries: [],
    scrollContainers: [],
    nodeRefById: new Map(),
    rectNodeById: new Map(),
    layout: null as any,
  }
  const result = traverseFrame(root, state, width, height)
  return { result, state }
}

// ── resolveNodeByPath ────────────────────────────────────────────────────

describe("resolveNodeByPath", () => {
  test("path 'r' resolves to root", () => {
    const root = createNode("root")
    const result = resolveNodeByPath(root, "r")
    expect(result).toBe(root)
  })

  test("path 'r.0' resolves first child", () => {
    const root = createNode("root")
    const child = createNode("box")
    root.children.push(child)
    expect(resolveNodeByPath(root, "r.0")).toBe(child)
  })

  test("path 'r.0.1' resolves nested second child", () => {
    const root = createNode("root")
    const a = createNode("box")
    const b = createNode("box")
    const c = createNode("box")
    a.children.push(b, c)
    root.children.push(a)
    expect(resolveNodeByPath(root, "r.0.1")).toBe(c)
  })

  test("out-of-bounds index returns null", () => {
    const root = createNode("root")
    const child = createNode("box")
    root.children.push(child)
    expect(resolveNodeByPath(root, "r.5")).toBeNull()
  })

  test("empty path segment returns null", () => {
    const root = createNode("root")
    expect(resolveNodeByPath(root, "r.abc")).toBeNull()
  })
})

// ── Layer routing through traverseFrame ──────────────────────────────────

describe("Layer routing through traverseFrame", () => {
  test("no layer props -> all ops in root layer bucket", () => {
    const root = createNode("root")
    root.props = { backgroundColor: 0x111111ff }
    const child1 = createNode("box")
    child1.props = { backgroundColor: 0x222222ff, width: 100, height: 100 }
    const child2 = createNode("box")
    child2.props = { backgroundColor: 0x333333ff, width: 50, height: 50 }
    root.children.push(child1, child2)
    child1.parent = root
    child2.parent = root

    const { result } = traverseTree(root)
    expect(result.success).toBe(true)
    expect(result.layerBuckets).toHaveLength(1)
    expect(result.layerBuckets[0].key).toBe("root")
    expect(result.layerBuckets[0].ops.length).toBeGreaterThanOrEqual(3)
  })

  test("node with layer=true -> routes ops into child layer bucket", () => {
    const root = createNode("root")
    root.props = { backgroundColor: 0x111111ff }
    const child = createNode("box")
    child.props = { layer: true, backgroundColor: 0xff0000ff, width: 100, height: 100 }
    root.children.push(child)
    child.parent = root

    const { result } = traverseTree(root)
    expect(result.success).toBe(true)
    expect(result.layerBuckets).toHaveLength(2)
    expect(result.layerBuckets[0].key).toBe("root")
    expect(result.layerBuckets[1].key).toBe(`layer:${child.id}`)
    expect(result.layerBuckets[1].nodeId).toBe(child.id)
    expect(result.layerBuckets[1].ops.some((op) => op.nodeId === child.id)).toBe(true)
  })

  test("multiple layer nodes -> create distinct layer buckets in order", () => {
    const root = createNode("root")
    const a = createNode("box")
    a.props = { layer: true, backgroundColor: 0x336699ff, width: 100, height: 50 }
    const b = createNode("box")
    b.props = { layer: true, backgroundColor: 0x336699ff, width: 80, height: 40 }
    root.children.push(a, b)
    a.parent = root
    b.parent = root

    const { result } = traverseTree(root)
    expect(result.success).toBe(true)
    expect(result.layerBuckets).toHaveLength(3)
    expect(result.layerBuckets.map((b) => b.key)).toEqual(["root", `layer:${a.id}`, `layer:${b.id}`])
  })

  test("scroll container node -> routes to layer bucket and pushes scissor clip", () => {
    const root = createNode("root")
    const scroller = createNode("box")
    scroller.props = { scrollY: true, width: 120, height: 100 }
    const inner = createNode("box")
    inner.props = { backgroundColor: 0x00ff00ff, width: 100, height: 200 }
    scroller.children.push(inner)
    inner.parent = scroller
    root.children.push(scroller)
    scroller.parent = root

    const { result } = traverseTree(root)
    expect(result.success).toBe(true)
    const scrollerBucket = result.layerBuckets.find((b) => b.key === `layer:${scroller.id}`)
    expect(scrollerBucket).toBeDefined()
    const innerOp = scrollerBucket?.ops.find((op) => op.nodeId === inner.id)
    expect(innerOp).toBeDefined()
    expect(innerOp?.clipBounds).toBeDefined()
  })

  test("nested layer node inside scroll container preserves scissor clip", () => {
    const root = createNode("root")
    const scroller = createNode("box")
    scroller.props = { scrollY: true, width: 150, height: 100 }
    const innerLayer = createNode("box")
    innerLayer.props = { layer: true, backgroundColor: 0x0000ffff, width: 100, height: 80 }
    scroller.children.push(innerLayer)
    innerLayer.parent = scroller
    root.children.push(scroller)
    scroller.parent = root

    const { result } = traverseTree(root)
    expect(result.success).toBe(true)
    const innerBucket = result.layerBuckets.find((b) => b.key === `layer:${innerLayer.id}`)
    expect(innerBucket).toBeDefined()
    const innerOp = innerBucket?.ops.find((op) => op.nodeId === innerLayer.id)
    expect(innerOp?.clipBounds).toBeDefined()
  })
})
