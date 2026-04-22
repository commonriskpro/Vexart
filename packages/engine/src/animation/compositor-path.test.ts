/**
 * Tests for compositor-path animation descriptor table and fast-path detection.
 * REQ-2B-301 through REQ-2B-305 (Phase 2b Slice 5).
 *
 * Test coverage:
 *   - Descriptor registration with/without layer backing
 *   - Deregistration on completion
 *   - Fast-path detection (Phase 2b: always false, Phase 3 unlocks)
 *   - Fallback on non-compositor property change
 *   - Subtree change triggers fallback
 */

import { describe, test, expect, beforeEach } from "bun:test"
import {
  registerAnimationDescriptor,
  deregisterAnimationDescriptor,
  deregisterAllDescriptors,
  getDescriptor,
  hasCompositorAnimations,
  isCompositorOnlyFrame,
  markLayerBacked,
  unmarkLayerBacked,
  onNodePropertyChanged,
  onSubtreeChanged,
  resetFrameTracking,
  fallbackNodes,
  allDescriptors,
} from "./compositor-path"

// Unique node IDs per test to avoid cross-test state pollution.
let nextId = 1000
function nodeId() { return nextId++ }

beforeEach(() => {
  // Clean up any state left by previous tests
  resetFrameTracking()
  // Deregister all descriptors: iterate known test nodes is fragile,
  // so we clear via the allDescriptors snapshot.
  for (const d of allDescriptors()) {
    deregisterAllDescriptors(d.nodeId)
  }
})

// ── REQ-2B-301: Descriptor registration ────────────────────────────────────

describe("registerAnimationDescriptor", () => {
  test("registers transform descriptor when node has layer backing", () => {
    const id = nodeId()
    markLayerBacked(id)

    const ok = registerAnimationDescriptor({
      nodeId: id,
      property: "transform",
      from: 0,
      to: 100,
      startTime: performance.now(),
      physics: { kind: "spring", stiffness: 170, damping: 26, mass: 1 },
    })

    expect(ok).toBe(true)
    const d = getDescriptor(id, "transform")
    expect(d).toBeDefined()
    expect(d?.property).toBe("transform")
    expect(d?.from).toBe(0)
    expect(d?.to).toBe(100)
    expect(hasCompositorAnimations()).toBe(true)

    // Cleanup
    deregisterAllDescriptors(id)
    unmarkLayerBacked(id)
  })

  test("registers opacity descriptor when node has layer backing", () => {
    const id = nodeId()
    markLayerBacked(id)

    const ok = registerAnimationDescriptor({
      nodeId: id,
      property: "opacity",
      from: 1,
      to: 0,
      startTime: performance.now(),
      physics: { kind: "transition", easing: (t) => t, duration: 300 },
    })

    expect(ok).toBe(true)
    const d = getDescriptor(id, "opacity")
    expect(d?.property).toBe("opacity")

    deregisterAllDescriptors(id)
    unmarkLayerBacked(id)
  })

  test("falls back (returns false) when node has NO layer backing (REQ-2B-304)", () => {
    const id = nodeId()
    // Do NOT call markLayerBacked(id)

    const ok = registerAnimationDescriptor({
      nodeId: id,
      property: "transform",
      from: 0,
      to: 50,
      startTime: performance.now(),
      physics: { kind: "spring", stiffness: 170, damping: 26, mass: 1 },
    })

    expect(ok).toBe(false)
    expect(getDescriptor(id, "transform")).toBeUndefined()
  })
})

// ── REQ-2B-305: Deregistration (animation complete) ────────────────────────

describe("deregisterAnimationDescriptor", () => {
  test("removes descriptor on animation completion", () => {
    const id = nodeId()
    markLayerBacked(id)

    registerAnimationDescriptor({
      nodeId: id,
      property: "opacity",
      from: 0,
      to: 1,
      startTime: performance.now(),
      physics: { kind: "transition", easing: (t) => t, duration: 200 },
    })

    expect(getDescriptor(id, "opacity")).toBeDefined()

    deregisterAnimationDescriptor(id, "opacity")

    expect(getDescriptor(id, "opacity")).toBeUndefined()

    unmarkLayerBacked(id)
  })

  test("deregisterAllDescriptors removes both transform and opacity", () => {
    const id = nodeId()
    markLayerBacked(id)

    registerAnimationDescriptor({
      nodeId: id,
      property: "transform",
      from: 0,
      to: 1,
      startTime: performance.now(),
      physics: { kind: "spring", stiffness: 170, damping: 26, mass: 1 },
    })
    registerAnimationDescriptor({
      nodeId: id,
      property: "opacity",
      from: 1,
      to: 0,
      startTime: performance.now(),
      physics: { kind: "spring", stiffness: 170, damping: 26, mass: 1 },
    })

    deregisterAllDescriptors(id)

    expect(getDescriptor(id, "transform")).toBeUndefined()
    expect(getDescriptor(id, "opacity")).toBeUndefined()

    unmarkLayerBacked(id)
  })
})

// ── REQ-2B-303: Fast-path frame detection ──────────────────────────────────

describe("isCompositorOnlyFrame", () => {
  test("returns false (Phase 2b: fast path is infrastructure-only, GPU wiring in Phase 3)", () => {
    // Phase 2b guarantees the descriptor TABLE is built correctly.
    // isCompositorOnlyFrame always returns false until Phase 3 wires
    // vexart_composite_update_uniform. This test documents that contract.
    const id = nodeId()
    markLayerBacked(id)
    registerAnimationDescriptor({
      nodeId: id,
      property: "transform",
      from: 0,
      to: 1,
      startTime: performance.now(),
      physics: { kind: "spring", stiffness: 170, damping: 26, mass: 1 },
    })

    expect(isCompositorOnlyFrame()).toBe(false)

    deregisterAllDescriptors(id)
    unmarkLayerBacked(id)
  })
})

// ── REQ-2B-304: Non-compositor property mutation triggers fallback ───────────

describe("onNodePropertyChanged", () => {
  test("records fallback when non-compositor prop changes on animated node", () => {
    const id = nodeId()
    markLayerBacked(id)
    registerAnimationDescriptor({
      nodeId: id,
      property: "transform",
      from: 0,
      to: 100,
      startTime: performance.now(),
      physics: { kind: "spring", stiffness: 170, damping: 26, mass: 1 },
    })

    resetFrameTracking()
    onNodePropertyChanged(id, "width") // non-compositor property

    expect(fallbackNodes().has(id)).toBe(true)

    deregisterAllDescriptors(id)
    unmarkLayerBacked(id)
  })

  test("does NOT record fallback for non-animated node", () => {
    const id = nodeId()
    // no descriptor registered
    resetFrameTracking()
    onNodePropertyChanged(id, "width")
    expect(fallbackNodes().has(id)).toBe(false)
  })
})

// ── REQ-2B-305: Subtree change during compositor animation ──────────────────

describe("onSubtreeChanged", () => {
  test("deregisters descriptor and records fallback when subtree changes", () => {
    const id = nodeId()
    markLayerBacked(id)
    registerAnimationDescriptor({
      nodeId: id,
      property: "transform",
      from: 0,
      to: 1,
      startTime: performance.now(),
      physics: { kind: "spring", stiffness: 170, damping: 26, mass: 1 },
    })

    resetFrameTracking()
    onSubtreeChanged(id)

    // Descriptor deregistered (REQ-2B-305)
    expect(getDescriptor(id, "transform")).toBeUndefined()
    // Fallback recorded
    expect(fallbackNodes().has(id)).toBe(true)

    unmarkLayerBacked(id)
  })

  test("no-op when node has no compositor descriptor", () => {
    const id = nodeId()
    resetFrameTracking()
    onSubtreeChanged(id)
    expect(fallbackNodes().has(id)).toBe(false)
  })
})

// ── REQ-2B-501/503: willChange and contain props accepted (type-level tests) ──

describe("willChange and contain prop types", () => {
  test("FilterConfig type is accepted with all fields", () => {
    // Type-level test: import FilterConfig and construct a valid value.
    // If this compiles, the type is correct (REQ-2B-401).
    const filter: import("../ffi/node").FilterConfig = {
      blur: 4,
      brightness: 150,
      contrast: 100,
      saturate: 80,
      grayscale: 0,
      invert: 0,
      sepia: 0,
      hueRotate: 90,
    }
    expect(filter.blur).toBe(4)
    expect(filter.brightness).toBe(150)
  })

  test("FilterConfig accepts partial fields (all optional)", () => {
    const filter: import("../ffi/node").FilterConfig = { blur: 2 }
    expect(filter.blur).toBe(2)
    expect(filter.brightness).toBeUndefined()
  })

  test("willChange accepts string values", () => {
    // Verify the prop shape is accepted at runtime (REQ-2B-501).
    const props: import("../ffi/node").TGEProps = {
      willChange: "transform",
    }
    expect(props.willChange).toBe("transform")
  })

  test("willChange accepts string array", () => {
    const props: import("../ffi/node").TGEProps = {
      willChange: ["transform", "opacity"],
    }
    expect(Array.isArray(props.willChange)).toBe(true)
  })

  test("contain accepts all valid values", () => {
    const values: Array<import("../ffi/node").TGEProps["contain"]> = [
      "none", "layout", "paint", "strict",
    ]
    for (const v of values) {
      const props: import("../ffi/node").TGEProps = { contain: v }
      expect(props.contain).toBe(v)
    }
  })

  test("filter prop is accepted in TGEProps", () => {
    const props: import("../ffi/node").TGEProps = {
      filter: { brightness: 120, blur: 2 },
    }
    expect(props.filter?.brightness).toBe(120)
  })

  test("filter prop is accepted in InteractiveStyleProps (hoverStyle)", () => {
    // REQ-2B-405: filter can appear in hoverStyle/activeStyle/focusStyle.
    const props: import("../ffi/node").TGEProps = {
      hoverStyle: { filter: { brightness: 150 } },
      activeStyle: { filter: { grayscale: 100 } },
      focusStyle: { filter: { invert: 50 } },
    }
    expect(props.hoverStyle?.filter?.brightness).toBe(150)
    expect(props.activeStyle?.filter?.grayscale).toBe(100)
    expect(props.focusStyle?.filter?.invert).toBe(50)
  })
})
