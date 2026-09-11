/**
 * assign-layers.test.ts — Unit tests for layer boundary + spatial assignment.
 *
 * Tests pure tree-traversal and spatial logic only.
 * No FFI, no GPU, no layout adapter calls required.
 */

import { describe, test, expect } from "bun:test"
import { findLayerBoundaries, resolveNodeByPath, assignLayersSpatial } from "./assign-layers"
import { createNode } from "../ffi/node"
import { CMD } from "../ffi/render-graph"
import type { RenderCommand } from "../ffi/render-graph"
import type { LayerBoundary } from "./types"

// ── helpers ──────────────────────────────────────────────────────────────

function makeRect(x: number, y: number, w: number, h: number): RenderCommand {
  return {
    type: CMD.RECTANGLE,
    x, y, width: w, height: h,
    color: 0x000000ff,
    cornerRadius: 0,
    extra1: 0,
    extra2: 0,
  }
}

// ── findLayerBoundaries ──────────────────────────────────────────────────

describe("findLayerBoundaries", () => {
  test("empty tree (single box, no layer prop) → no boundaries", () => {
    const root = createNode("root")
    const boundaries: LayerBoundary[] = []
    const nextZ = { value: 0 }
    findLayerBoundaries(root, "r", boundaries, nextZ)
    expect(boundaries).toHaveLength(0)
  })

  test("node with layer=true → one boundary", () => {
    const root = createNode("root")
    const child = createNode("box")
    child.props.layer = true
    root.children.push(child)
    child.parent = root

    const boundaries: LayerBoundary[] = []
    const nextZ = { value: 0 }
    findLayerBoundaries(root, "r", boundaries, nextZ)
    expect(boundaries).toHaveLength(1)
    expect(boundaries[0].path).toBe("r.0")
    expect(boundaries[0].nodeId).toBe(child.id)
    expect(boundaries[0].z).toBe(0)
  })

  test("multiple layer nodes → ascending z values", () => {
    const root = createNode("root")
    const a = createNode("box")
    const b = createNode("box")
    a.props.layer = true
    b.props.layer = true
    root.children.push(a, b)

    const boundaries: LayerBoundary[] = []
    const nextZ = { value: 0 }
    findLayerBoundaries(root, "r", boundaries, nextZ)
    expect(boundaries).toHaveLength(2)
    expect(boundaries[0].z).toBe(0)
    expect(boundaries[1].z).toBe(1)
  })

  test("scroll container node → isScroll=true on boundary", () => {
    const root = createNode("root")
    const scroller = createNode("box")
    scroller.props.layer = true
    scroller.props.scrollY = true
    root.children.push(scroller)

    const boundaries: LayerBoundary[] = []
    const nextZ = { value: 0 }
    findLayerBoundaries(root, "r", boundaries, nextZ)
    expect(boundaries).toHaveLength(1)
    expect(boundaries[0].isScroll).toBe(true)
  })

  test("nested layer node inside scroll → insideScroll=true", () => {
    const root = createNode("root")
    const scroller = createNode("box")
    scroller.props.scrollY = true
    const inner = createNode("box")
    inner.props.layer = true
    scroller.children.push(inner)
    root.children.push(scroller)

    const boundaries: LayerBoundary[] = []
    const nextZ = { value: 0 }
    findLayerBoundaries(root, "r", boundaries, nextZ)
    expect(boundaries).toHaveLength(1)
    expect(boundaries[0].insideScroll).toBe(true)
  })

  test("text node children are skipped (no boundaries emitted)", () => {
    const root = createNode("root")
    const text = createNode("text")
    text.props.layer = true as any // text nodes return early regardless
    root.children.push(text)

    const boundaries: LayerBoundary[] = []
    const nextZ = { value: 0 }
    findLayerBoundaries(root, "r", boundaries, nextZ)
    expect(boundaries).toHaveLength(0)
  })

  test("hasBg is true when node has backgroundColor", () => {
    const root = createNode("root")
    const child = createNode("box")
    child.props.layer = true
    child.props.backgroundColor = 0xff0000ff
    root.children.push(child)

    const boundaries: LayerBoundary[] = []
    findLayerBoundaries(root, "r", boundaries, { value: 0 })
    expect(boundaries[0].hasBg).toBe(true)
  })

  test("hasBg is false when node has no backgroundColor", () => {
    const root = createNode("root")
    const child = createNode("box")
    child.props.layer = true
    root.children.push(child)

    const boundaries: LayerBoundary[] = []
    findLayerBoundaries(root, "r", boundaries, { value: 0 })
    expect(boundaries[0].hasBg).toBe(false)
  })
})

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

// ── assignLayersSpatial ──────────────────────────────────────────────────

describe("assignLayersSpatial", () => {
  test("no boundaries → all commands go to bgSlot", () => {
    const root = createNode("root")
    const commands = [makeRect(0, 0, 100, 100), makeRect(10, 10, 50, 50)]
    const plan = assignLayersSpatial(commands, [], { root, collectText: () => "" })
    expect(plan.bgSlot.cmdIndices).toHaveLength(2)
    expect(plan.contentSlots).toHaveLength(0)
  })

  test("no boundaries, no commands → empty bgSlot", () => {
    const root = createNode("root")
    const plan = assignLayersSpatial([], [], { root, collectText: () => "" })
    expect(plan.bgSlot.cmdIndices).toHaveLength(0)
    expect(plan.contentSlots).toHaveLength(0)
    expect(plan.boundaries).toHaveLength(0)
  })

  test("single layer boundary with bg → one content slot created", () => {
    const root = createNode("root")
    const child = createNode("box")
    child.props.layer = true
    child.props.backgroundColor = 0xff0000ff
    child.layout = { x: 0, y: 0, width: 100, height: 100 }
    root.children.push(child)

    const boundaries: LayerBoundary[] = [
      {
        path: "r.0",
        nodeId: child.id,
        z: 0,
        isScroll: false,
        hasBg: true,
        insideScroll: false,
        hasSubtreeTransform: false,
      },
    ]

    const rect = makeRect(0, 0, 100, 100)
    rect.color = 0xff0000ff // matches bg color

    const plan = assignLayersSpatial([rect], boundaries, { root, collectText: () => "" })
    expect(plan.contentSlots).toHaveLength(1)
    expect(plan.contentSlots[0].key).toBe(`layer:${child.id}`)
    expect(plan.slotBoundaryByKey.has(`layer:${child.id}`)).toBe(true)
  })

  test("bgSlot key is always 'bg' with z=-1", () => {
    const root = createNode("root")
    const plan = assignLayersSpatial([], [], { root, collectText: () => "" })
    expect(plan.bgSlot.key).toBe("bg")
    expect(plan.bgSlot.z).toBe(-1)
  })

  test("boundaries array is passed through to plan.boundaries", () => {
    const root = createNode("root")
    const boundaries: LayerBoundary[] = [
      { path: "r", nodeId: 1, z: 0, isScroll: false, hasBg: false, insideScroll: false, hasSubtreeTransform: false },
    ]
    const plan = assignLayersSpatial([], boundaries, { root, collectText: () => "" })
    expect(plan.boundaries).toBe(boundaries)
  })

  test("multiple layer boundaries with same bg color map to exact cmd.nodeId", () => {
    const root = createNode("root")
    const child1 = createNode("box")
    const child2 = createNode("box")

    const sharedBg = 0x336699ff
    child1.props.backgroundColor = sharedBg
    child2.props.backgroundColor = sharedBg

    // Without usable layout so shouldPreferLayoutBounds is false and hasBg is evaluated
    child1.layout = { x: 0, y: 0, width: 0, height: 0 }
    child2.layout = { x: 0, y: 0, width: 0, height: 0 }

    root.children.push(child1, child2)

    const boundaries: LayerBoundary[] = [
      {
        path: "r.0",
        nodeId: child1.id,
        z: 0,
        isScroll: false,
        hasBg: true,
        insideScroll: false,
        hasSubtreeTransform: false,
      },
      {
        path: "r.1",
        nodeId: child2.id,
        z: 1,
        isScroll: false,
        hasBg: true,
        insideScroll: false,
        hasSubtreeTransform: false,
      },
    ]

    // Commands array has child2's rectangle FIRST (index 0), child1's rectangle SECOND (index 1).
    // Under color-only matching, child1 (processed first) would greedily claim index 0 (child2's bounds).
    // With direct cmd.nodeId mapping, each boundary maps to its own matching cmd.nodeId.
    const rectForChild2: RenderCommand = {
      ...makeRect(200, 100, 80, 40),
      color: sharedBg,
      nodeId: child2.id,
    }
    const rectForChild1: RenderCommand = {
      ...makeRect(10, 20, 100, 50),
      color: sharedBg,
      nodeId: child1.id,
    }

    const commands = [rectForChild2, rectForChild1]
    const plan = assignLayersSpatial(commands, boundaries, { root, collectText: () => "" })

    expect(plan.contentSlots).toHaveLength(2)

    const slot1 = plan.contentSlots.find((s) => s.key === `layer:${child1.id}`)
    const slot2 = plan.contentSlots.find((s) => s.key === `layer:${child2.id}`)

    expect(slot1).toBeDefined()
    expect(slot2).toBeDefined()

    // child1 should map to index 1 (rectForChild1), child2 should map to index 0 (rectForChild2)
    expect(slot1!.cmdIndices).toEqual([1])
    expect(slot2!.cmdIndices).toEqual([0])

    expect(commands[slot1!.cmdIndices[0]].nodeId).toBe(child1.id)
    expect(commands[slot2!.cmdIndices[0]].nodeId).toBe(child2.id)
  })
})
