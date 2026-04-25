/**
 * walk-tree.test.ts — Unit tests for viewport culling logic in walk-tree.ts.
 *
 * walkTree() itself cannot be tested without the Clay FFI adapter.
 * This file tests the AABB culling *decision* — the same logic that
 * walk-tree.ts applies inside the walkTree loop to determine whether a
 * node's subtree should be skipped.
 *
 * The culling predicate from walk-tree.ts:
 *   fullyLeft  = l.x + l.width <= 0
 *   fullyRight = l.x >= viewportWidth
 *   fullyAbove = l.y + l.height <= 0
 *   fullyBelow = l.y >= viewportHeight
 *   cull = (fullyLeft || fullyRight || fullyAbove || fullyBelow)
 *         AND l.width > 0 AND l.height > 0   (only laid-out nodes)
 *
 * Also tests: collectText(), WalkTreeState shape, scroll exemption.
 */

import { describe, test, expect } from "bun:test"
import { collectText } from "./walk-tree"
import { createNode, createTextNode } from "../ffi/node"
import type { WalkTreeState } from "./walk-tree"

// ── Inline culling decision (mirrors walk-tree.ts AABB logic exactly) ──

type LayoutRect = { x: number; y: number; width: number; height: number }

function shouldCull(
  layout: LayoutRect,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  const { x, y, width, height } = layout
  if (width <= 0 || height <= 0) return false // not laid out — never cull
  return (
    x + width <= 0 ||          // fully off left
    x >= viewportWidth ||       // fully off right
    y + height <= 0 ||          // fully above
    y >= viewportHeight         // fully below
  )
}

// ── AABB culling decision ─────────────────────────────────────────────────

describe("AABB culling decision", () => {
  const VP_W = 1000
  const VP_H = 800

  test("node fully inside viewport → NOT culled", () => {
    expect(shouldCull({ x: 100, y: 100, width: 200, height: 200 }, VP_W, VP_H)).toBe(false)
  })

  test("node partially overlapping left edge → NOT culled", () => {
    expect(shouldCull({ x: -50, y: 100, width: 100, height: 100 }, VP_W, VP_H)).toBe(false)
  })

  test("node partially overlapping right edge → NOT culled", () => {
    expect(shouldCull({ x: 950, y: 100, width: 100, height: 100 }, VP_W, VP_H)).toBe(false)
  })

  test("node partially overlapping top edge → NOT culled", () => {
    expect(shouldCull({ x: 100, y: -50, width: 100, height: 100 }, VP_W, VP_H)).toBe(false)
  })

  test("node partially overlapping bottom edge → NOT culled", () => {
    expect(shouldCull({ x: 100, y: 750, width: 100, height: 100 }, VP_W, VP_H)).toBe(false)
  })

  test("node fully off left → culled", () => {
    expect(shouldCull({ x: -200, y: 100, width: 100, height: 100 }, VP_W, VP_H)).toBe(true)
  })

  test("node exactly touching left edge (x+width=0) → culled", () => {
    expect(shouldCull({ x: -100, y: 100, width: 100, height: 100 }, VP_W, VP_H)).toBe(true)
  })

  test("node fully off right → culled", () => {
    expect(shouldCull({ x: 1100, y: 100, width: 100, height: 100 }, VP_W, VP_H)).toBe(true)
  })

  test("node exactly at right viewport edge (x=vpW) → culled", () => {
    expect(shouldCull({ x: VP_W, y: 100, width: 100, height: 100 }, VP_W, VP_H)).toBe(true)
  })

  test("node fully above viewport → culled", () => {
    expect(shouldCull({ x: 100, y: -200, width: 100, height: 100 }, VP_W, VP_H)).toBe(true)
  })

  test("node exactly touching top edge (y+height=0) → culled", () => {
    expect(shouldCull({ x: 100, y: -100, width: 100, height: 100 }, VP_W, VP_H)).toBe(true)
  })

  test("node fully below viewport → culled", () => {
    expect(shouldCull({ x: 100, y: 900, width: 100, height: 100 }, VP_W, VP_H)).toBe(true)
  })

  test("node exactly at bottom viewport edge (y=vpH) → culled", () => {
    expect(shouldCull({ x: 100, y: VP_H, width: 100, height: 100 }, VP_W, VP_H)).toBe(true)
  })

  test("node with zero width → NOT culled (not laid out)", () => {
    expect(shouldCull({ x: -100, y: -100, width: 0, height: 100 }, VP_W, VP_H)).toBe(false)
  })

  test("node with zero height → NOT culled (not laid out)", () => {
    expect(shouldCull({ x: -100, y: -100, width: 100, height: 0 }, VP_W, VP_H)).toBe(false)
  })

  test("node at origin with exact viewport size → NOT culled", () => {
    expect(shouldCull({ x: 0, y: 0, width: VP_W, height: VP_H }, VP_W, VP_H)).toBe(false)
  })

  test("culling disabled — node fully off-screen is NOT culled when flag is off", () => {
    // When cullingEnabled=false, shouldCull is never called — this models that scenario
    const cullingEnabled = false
    const layout = { x: -500, y: -500, width: 100, height: 100 }
    const wouldBeCulled = cullingEnabled ? shouldCull(layout, VP_W, VP_H) : false
    expect(wouldBeCulled).toBe(false)
  })
})

// ── Scroll container exemption ────────────────────────────────────────────

describe("scroll container culling exemption", () => {
  test("scroll container is always exempt from culling", () => {
    // A scroll container that would otherwise be culled must be exempt.
    // In walk-tree.ts: isScrollContainer check gates culling.
    const node = createNode("box")
    node.props.scrollY = true
    node.layout = { x: -500, y: -500, width: 100, height: 100 }

    const isScrollContainer = !!(node.props.scrollX || node.props.scrollY)
    // Even if AABB says cull, scroll containers are exempt
    const culled = isScrollContainer ? false : shouldCull(node.layout, 1000, 800)
    expect(culled).toBe(false)
  })

  test("non-scroll node off-screen is culled when culling enabled", () => {
    const node = createNode("box")
    node.layout = { x: -500, y: 100, width: 100, height: 100 }

    const isScrollContainer = !!(node.props.scrollX || node.props.scrollY)
    const culled = isScrollContainer ? false : shouldCull(node.layout, 1000, 800)
    expect(culled).toBe(true)
  })

  test("node with both scrollX and scrollY is exempt", () => {
    const node = createNode("box")
    node.props.scrollX = true
    node.props.scrollY = true
    node.layout = { x: 2000, y: 2000, width: 100, height: 100 }

    const isScrollContainer = !!(node.props.scrollX || node.props.scrollY)
    const culled = isScrollContainer ? false : shouldCull(node.layout, 1000, 800)
    expect(culled).toBe(false)
  })
})

// ── collectText ───────────────────────────────────────────────────────────

describe("collectText", () => {
  test("returns node.text when set directly", () => {
    const node = createTextNode("hello world")
    expect(collectText(node)).toBe("hello world")
  })

  test("collects text from child text nodes", () => {
    const parent = createNode("box")
    const t1 = createTextNode("foo")
    const t2 = createTextNode("bar")
    parent.children.push(t1, t2)
    expect(collectText(parent)).toBe("foobar")
  })

  test("returns empty string for node with no text and no children", () => {
    const node = createNode("box")
    expect(collectText(node)).toBe("")
  })

  test("collects text recursively from nested children", () => {
    const root = createNode("box")
    const mid = createNode("box")
    const leaf = createTextNode("deep")
    mid.children.push(leaf)
    root.children.push(mid)
    expect(collectText(root)).toBe("deep")
  })
})

// ── WalkTreeState shape ───────────────────────────────────────────────────

describe("WalkTreeState shape", () => {
  test("WalkTreeState fields are accessible with correct types", () => {
    // Construct a minimal WalkTreeState to verify the type compiles correctly.
    // We pass `clay: null as any` since the Clay adapter requires FFI.
    const state: WalkTreeState = {
      scrollIdCounter: { value: 0 },
      textMeasureIndex: { value: 0 },
      scrollSpeedCap: { value: 60 },
      nodeCount: { value: 0 },
      rectNodes: [],
      textNodes: [],
      boxNodes: [],
      textMetas: [],
      layerBoundaries: [],
      scrollContainers: [],
      nodePathById: new Map(),
      nodeRefById: new Map(),
      effectsQueue: new Map(),
      imageQueue: new Map(),
      canvasQueue: new Map(),
      textMetaMap: new Map(),
      rectNodeById: new Map(),
      clay: null as any, // FFI-backed — not tested here
      cullingEnabled: false,
      viewportWidth: 1000,
      viewportHeight: 800,
      culledCount: { value: 0 },
    }

    expect(state.cullingEnabled).toBe(false)
    expect(state.viewportWidth).toBe(1000)
    expect(state.viewportHeight).toBe(800)
    expect(state.culledCount?.value).toBe(0)
    expect(state.rectNodes).toHaveLength(0)
    expect(state.nodePathById.size).toBe(0)
  })
})
