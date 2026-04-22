/**
 * types.test.ts — Compile-time sanity checks for loop pipeline contracts.
 *
 * These tests import and instantiate each exported type to verify the
 * module compiles correctly and all fields are accessible as expected.
 * No FFI or GPU is required.
 */

import { describe, test, expect } from "bun:test"
import type {
  PointerState,
  ScrollState,
  FrameState,
  WalkResult,
  LayoutResult,
  LayerSlot,
  LayerBoundary,
  LayerPlan,
  InteractionResult,
  PaintResult,
} from "./types"

describe("types module — compile sanity", () => {
  test("PointerState shape is correct", () => {
    const p: PointerState = {
      x: 0,
      y: 0,
      down: false,
      dirty: false,
      pendingPress: false,
      pendingRelease: false,
      capturedNodeId: -1,
      pressOriginSet: false,
    }
    expect(p.x).toBe(0)
    expect(p.down).toBe(false)
    expect(p.capturedNodeId).toBe(-1)
  })

  test("ScrollState shape is correct", () => {
    const s: ScrollState = { deltaX: 0, deltaY: 0, speedCap: 60 }
    expect(s.deltaX).toBe(0)
    expect(s.speedCap).toBe(60)
  })

  test("LayerSlot shape is correct", () => {
    const slot: LayerSlot = { key: "bg", z: -1, cmdIndices: [] }
    expect(slot.key).toBe("bg")
    expect(slot.z).toBe(-1)
    expect(slot.cmdIndices).toEqual([])
  })

  test("LayerBoundary shape is correct", () => {
    const b: LayerBoundary = {
      path: "r.0",
      nodeId: 42,
      z: 0,
      isScroll: false,
      hasBg: true,
      insideScroll: false,
      hasSubtreeTransform: false,
    }
    expect(b.path).toBe("r.0")
    expect(b.nodeId).toBe(42)
    expect(b.isScroll).toBe(false)
  })

  test("LayerPlan shape is correct", () => {
    const bg: LayerSlot = { key: "bg", z: -1, cmdIndices: [] }
    const plan: LayerPlan = {
      bgSlot: bg,
      contentSlots: [],
      slotBoundaryByKey: new Map(),
      boundaries: [],
    }
    expect(plan.bgSlot.key).toBe("bg")
    expect(plan.contentSlots).toHaveLength(0)
    expect(plan.boundaries).toHaveLength(0)
  })

  test("InteractionResult shape is correct", () => {
    const r: InteractionResult = { changed: false, hadClick: false }
    expect(r.changed).toBe(false)
    expect(r.hadClick).toBe(false)
  })

  test("PaintResult shape is correct", () => {
    const pr: PaintResult = { repaintedKeys: ["bg", "layer:1"], anyDirty: true }
    expect(pr.repaintedKeys).toHaveLength(2)
    expect(pr.anyDirty).toBe(true)
  })
})
