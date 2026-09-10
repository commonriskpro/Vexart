import { afterEach, describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { allDescriptors, deregisterAllDescriptors, markLayerBacked, resetFrameTracking, unmarkLayerBacked } from "../animation/compositor-path"
import { createSpring, createTransition, hasActiveAnimations, resetActiveAnimations } from "./animation"

function clearCompositorState() {
  resetFrameTracking()
  resetActiveAnimations()
  for (const descriptor of allDescriptors()) {
    deregisterAllDescriptors(descriptor.nodeId)
    unmarkLayerBacked(descriptor.nodeId)
  }
}

afterEach(() => {
  clearCompositorState()
})

describe("animation compositor integration", () => {
  test("createTransition registers and deregisters compositor descriptor when configured", async () => {
    markLayerBacked(42)
    const [, setTarget] = createTransition(0, {
      duration: 1,
      compositor: { nodeId: 42, property: "opacity" },
    })

    setTarget(1)
    expect(allDescriptors().some((descriptor) => descriptor.nodeId === 42 && descriptor.property === "opacity")).toBe(true)

    // Animation ticks use setTimeout(16) for frame-aligned timing,
    // so wait enough for the 1ms duration transition to complete.
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
    expect(allDescriptors().some((descriptor) => descriptor.nodeId === 42)).toBe(false)
  })

  test("createSpring registers compositor descriptor when configured", () => {
    createRoot((dispose) => {
      markLayerBacked(99)
      const [, setTarget] = createSpring(0, {
        stiffness: 170,
        damping: 26,
        precision: 0.0001,
        compositor: { nodeId: 99, property: "transform" },
      })

      setTarget(10)
      expect(allDescriptors().some((descriptor) => descriptor.nodeId === 99 && descriptor.property === "transform")).toBe(true)
      dispose()
    })
  })

  test("disposing reactive root cancels active transition timer and compositor descriptors", async () => {
    markLayerBacked(101)
    let setTargetFn!: (v: number) => void
    let disposeRoot!: () => void

    createRoot((dispose) => {
      disposeRoot = dispose
      const [, setTarget] = createTransition(0, {
        duration: 300,
        compositor: { nodeId: 101, property: "opacity" },
      })
      setTargetFn = setTarget
    })

    setTargetFn(1)
    expect(hasActiveAnimations()).toBe(true)
    expect(allDescriptors().some((d) => d.nodeId === 101 && d.property === "opacity")).toBe(true)

    disposeRoot()

    expect(hasActiveAnimations()).toBe(false)
    expect(allDescriptors().some((d) => d.nodeId === 101)).toBe(false)

    // Wait 50ms to ensure no orphaned timers tick or re-register animations
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
    expect(hasActiveAnimations()).toBe(false)
    expect(allDescriptors().some((d) => d.nodeId === 101)).toBe(false)
  })

  test("disposing reactive root cancels active spring timer and compositor descriptors", async () => {
    markLayerBacked(102)
    let setTargetFn!: (v: number) => void
    let disposeRoot!: () => void

    createRoot((dispose) => {
      disposeRoot = dispose
      const [, setTarget] = createSpring(0, {
        stiffness: 100,
        damping: 10,
        compositor: { nodeId: 102, property: "transform" },
      })
      setTargetFn = setTarget
    })

    setTargetFn(10)
    expect(hasActiveAnimations()).toBe(true)
    expect(allDescriptors().some((d) => d.nodeId === 102 && d.property === "transform")).toBe(true)

    disposeRoot()

    expect(hasActiveAnimations()).toBe(false)
    expect(allDescriptors().some((d) => d.nodeId === 102)).toBe(false)

    // Wait 50ms to ensure no orphaned timers tick or re-register animations
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
    expect(hasActiveAnimations()).toBe(false)
    expect(allDescriptors().some((d) => d.nodeId === 102)).toBe(false)
  })
})
