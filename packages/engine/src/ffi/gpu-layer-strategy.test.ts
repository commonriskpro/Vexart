import { describe, expect, test } from "bun:test"
import { chooseGpuLayerStrategy } from "./gpu-layer-strategy"

describe("chooseGpuLayerStrategy", () => {
  test("returns final-frame when native planner prefers full-frame composition", () => {
    expect(chooseGpuLayerStrategy({
      dirtyLayerCount: 3,
      dirtyPixelArea: 9_000,
      totalPixelArea: 10_000,
      overlapPixelArea: 4_000,
      overlapRatio: 0.4,
      fullRepaint: true,
      hasSubtreeTransforms: false,
      hasActiveInteraction: false,
      transmissionMode: "shm",
      estimatedLayeredBytes: 20_000,
      estimatedFinalBytes: 10_000,
      lastStrategy: null,
      framesSinceChange: 4,
    })).toBe("final-frame")
  })

  test("returns layered-region when native planner prefers bounded shm patching", () => {
    expect(chooseGpuLayerStrategy({
      dirtyLayerCount: 1,
      dirtyPixelArea: 1_000,
      totalPixelArea: 10_000,
      overlapPixelArea: 0,
      overlapRatio: 0,
      fullRepaint: false,
      hasSubtreeTransforms: false,
      hasActiveInteraction: false,
      transmissionMode: "shm",
      estimatedLayeredBytes: 1_000,
      estimatedFinalBytes: 10_000,
      lastStrategy: null,
      framesSinceChange: 4,
    })).toBe("layered-region")
  })

  test("returns skip-present for empty frames", () => {
    expect(chooseGpuLayerStrategy({
      dirtyLayerCount: 0,
      dirtyPixelArea: 0,
      totalPixelArea: 10_000,
      overlapPixelArea: 0,
      overlapRatio: 0,
      fullRepaint: false,
      hasSubtreeTransforms: false,
      hasActiveInteraction: false,
      transmissionMode: "shm",
      estimatedLayeredBytes: 0,
      estimatedFinalBytes: 10_000,
      lastStrategy: null,
      framesSinceChange: 4,
    })).toBe("skip-present")
  })
})
