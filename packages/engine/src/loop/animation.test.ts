import { afterEach, describe, expect, test } from "bun:test"
import { allDescriptors, deregisterAllDescriptors, markLayerBacked, resetFrameTracking, unmarkLayerBacked } from "../animation/compositor-path"
import { createSpring, createTransition } from "./animation"

function clearCompositorState() {
  resetFrameTracking()
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

    await new Promise<void>((resolve) => setTimeout(resolve, 10))
    expect(allDescriptors().some((descriptor) => descriptor.nodeId === 42)).toBe(false)
  })

  test("createSpring registers compositor descriptor when configured", () => {
    markLayerBacked(99)
    const [, setTarget] = createSpring(0, {
      stiffness: 170,
      damping: 26,
      precision: 0.0001,
      compositor: { nodeId: 99, property: "transform" },
    })

    setTarget(10)
    expect(allDescriptors().some((descriptor) => descriptor.nodeId === 99 && descriptor.property === "transform")).toBe(true)
  })
})
