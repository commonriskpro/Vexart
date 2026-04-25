import { describe, expect, test } from "bun:test"
import { chooseGpuLayerStrategy } from "./gpu-layer-strategy"
import { targetLocalRepaintRegion } from "./gpu-renderer-backend"

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

describe("targetLocalRepaintRegion", () => {
  test("converts absolute repaint rects into target-local regions", () => {
    expect(targetLocalRepaintRegion(
      { x: 120, y: 72, width: 40, height: 30 },
      { x: 100, y: 64, width: 200, height: 120 },
      { width: 200, height: 120 },
    )).toEqual({ x: 20, y: 8, width: 40, height: 30 })
  })

  test("clips regions against the retained target bounds", () => {
    expect(targetLocalRepaintRegion(
      { x: 250, y: 170, width: 80, height: 40 },
      { x: 100, y: 64, width: 200, height: 120 },
      { width: 200, height: 120 },
    )).toEqual({ x: 150, y: 106, width: 50, height: 14 })
  })

  test("returns null when repaint is outside the target", () => {
    expect(targetLocalRepaintRegion(
      { x: 20, y: 20, width: 40, height: 40 },
      { x: 100, y: 64, width: 200, height: 120 },
      { width: 200, height: 120 },
    )).toBeNull()
  })
})
