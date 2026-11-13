import { afterEach, describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import {
  allDescriptors,
  deregisterAllDescriptors,
  hasCompositorAnimations,
  markLayerBacked,
  resetCompositorPathState,
  resetFrameTracking,
  unmarkLayerBacked,
} from "../animation/compositor-path"
import {
  createSpring,
  createTransition,
  hasActiveAnimations,
  resetActiveAnimations,
  setLoopAnimationDriver,
  stepActiveAnimations,
} from "./animation"
import { createRenderLoop } from "./loop"

function clearCompositorState() {
  resetFrameTracking()
  resetCompositorPathState()
  resetActiveAnimations()
}

afterEach(() => {
  clearCompositorState()
})

function mockTerminal(width = 200, height = 100) {
  return {
    kind: "kitty" as const,
    caps: {
      kind: "kitty" as const,
      kittyGraphics: true,
      kittyPlaceholder: false,
      kittyKeyboard: false,
      sixel: false,
      truecolor: true,
      mouse: false,
      mousePixel: false,
      mousePixelOrigin: 1 as const,
      focus: false,
      bracketedPaste: false,
      syncOutput: false,
      tmux: false,
      parentKind: null,
      transmissionMode: "direct" as const,
    },
    size: { cols: Math.ceil(width / 8), rows: Math.ceil(height / 16), pixelWidth: width, pixelHeight: height, cellWidth: 8, cellHeight: 16 },
    write() {},
    rawWrite() {},
    writeBytes() {},
    beginSync() {},
    endSync() {},
    onResize() { return () => {} },
    onData() { return () => {} },
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle() {},
    writeClipboard() {},
    suspend() {},
    resume() {},
    destroy() {},
  }
}

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

describe("reactive lifecycle & timer symmetry", () => {
  test("createTransition cleans up timer and active animation count on owner disposal", () => {
    markLayerBacked(101)
    let disposeFn!: () => void

    createRoot((dispose) => {
      disposeFn = dispose
      const [, setTarget] = createTransition(0, {
        duration: 500,
        compositor: { nodeId: 101, property: "opacity" },
      })
      setTarget(1)
    })

    expect(hasActiveAnimations()).toBe(true)
    expect(allDescriptors().some((d) => d.nodeId === 101)).toBe(true)

    disposeFn()

    expect(hasActiveAnimations()).toBe(false)
    expect(allDescriptors().some((d) => d.nodeId === 101)).toBe(false)
  })

  test("createSpring cleans up timer and active animation count on owner disposal", () => {
    markLayerBacked(102)
    let disposeFn!: () => void

    createRoot((dispose) => {
      disposeFn = dispose
      const [, setTarget] = createSpring(0, {
        stiffness: 170,
        damping: 26,
        compositor: { nodeId: 102, property: "transform" },
      })
      setTarget(100)
    })

    expect(hasActiveAnimations()).toBe(true)
    expect(allDescriptors().some((d) => d.nodeId === 102)).toBe(true)

    disposeFn()

    expect(hasActiveAnimations()).toBe(false)
    expect(allDescriptors().some((d) => d.nodeId === 102)).toBe(false)
  })

  test("explicit cancel handles stop transition and spring animations", () => {
    markLayerBacked(201)
    markLayerBacked(202)

    const [transVal, setTrans, cancelTrans] = createTransition(0, {
      duration: 500,
      compositor: { nodeId: 201, property: "opacity" },
    })
    const [springVal, setSpring, cancelSpring] = createSpring(0, {
      stiffness: 170,
      damping: 26,
      compositor: { nodeId: 202, property: "transform" },
    })

    setTrans(1)
    setSpring(100)
    expect(hasActiveAnimations()).toBe(true)

    cancelTrans()
    expect(allDescriptors().some((d) => d.nodeId === 201)).toBe(false)

    // Method on value accessor also works and is idempotent
    springVal.cancel()
    expect(allDescriptors().some((d) => d.nodeId === 202)).toBe(false)
    expect(hasActiveAnimations()).toBe(false)

    // Idempotent cancel calls
    cancelTrans()
    springVal.stop()
    expect(hasActiveAnimations()).toBe(false)
  })

  test("tuple stop method and accessor stop method both stop animation", () => {
    const anim = createTransition(0, { duration: 500 })
    const [, setTarget] = anim

    setTarget(10)
    expect(hasActiveAnimations()).toBe(true)

    anim.stop()
    expect(hasActiveAnimations()).toBe(false)

    // Re-trigger and stop via accessor
    setTarget(20)
    expect(hasActiveAnimations()).toBe(true)
    anim[0].stop()
    expect(hasActiveAnimations()).toBe(false)
  })

  test("resetActiveAnimations symmetrically resets active count to 0", () => {
    const [, setTarget] = createTransition(0, { duration: 1000 })
    setTarget(10)
    expect(hasActiveAnimations()).toBe(true)

    resetActiveAnimations()
    expect(hasActiveAnimations()).toBe(false)
  })

  test("loop.destroy resets active animations and compositor path state", () => {
    markLayerBacked(301)
    const loop = createRenderLoop(mockTerminal())

    const [, setTarget] = createTransition(0, {
      duration: 1000,
      compositor: { nodeId: 301, property: "opacity" },
    })
    setTarget(1)

    expect(hasActiveAnimations()).toBe(true)
    expect(hasCompositorAnimations()).toBe(true)

    loop.destroy()

    expect(hasActiveAnimations()).toBe(false)
    expect(hasCompositorAnimations()).toBe(false)
  })

  test("stepActiveAnimations evaluates multiple active animations in an atomic batch", () => {
    const [valA, setTargetA] = createTransition(0, { duration: 300, easing: (t) => t })
    const [valB, setTargetB] = createTransition(0, { duration: 300, easing: (t) => t })

    const t0 = performance.now()
    setTargetA(100)
    setTargetB(200)

    expect(hasActiveAnimations()).toBe(true)

    // Midpoint evaluation
    const hasMoreMid = stepActiveAnimations(t0 + 150)
    expect(hasMoreMid).toBe(true)
    expect(valA()).toBeCloseTo(50, 1)
    expect(valB()).toBeCloseTo(100, 1)

    // Completion evaluation
    const hasMoreEnd = stepActiveAnimations(t0 + 350)
    expect(hasMoreEnd).toBe(false)
    expect(valA()).toBe(100)
    expect(valB()).toBe(200)
    expect(hasActiveAnimations()).toBe(false)
  })

  test("setLoopAnimationDriver disarms fallbackTimer when loop takes ownership", () => {
    setLoopAnimationDriver(false)
    const [, setTarget] = createTransition(0, { duration: 500 })
    setTarget(100)
    expect(hasActiveAnimations()).toBe(true)

    // Transfer ownership to RenderLoop
    setLoopAnimationDriver(true)

    resetActiveAnimations()
    setLoopAnimationDriver(false)
    expect(hasActiveAnimations()).toBe(false)
  })

  test("createSpring evaluates physics across discrete stepActiveAnimations calls", () => {
    const [springVal, setTarget] = createSpring(0, { stiffness: 200, damping: 20 })
    const t0 = performance.now()
    setTarget(100)
    expect(hasActiveAnimations()).toBe(true)

    // Step 50ms
    stepActiveAnimations(t0 + 50)
    expect(springVal()).toBeGreaterThan(0)
    expect(springVal()).toBeLessThan(100)

    // Run multiple iterations to simulate frame ticks until settled
    let t = t0 + 50
    for (let i = 0; i < 60; i++) {
      t += 16
      if (!stepActiveAnimations(t)) break
    }

    expect(springVal()).toBeCloseTo(100, 1)
    expect(hasActiveAnimations()).toBe(false)
  })
})
