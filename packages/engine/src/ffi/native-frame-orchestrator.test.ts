import { describe, expect, test } from "bun:test"
import {
  buildNativeFrameExecutionStats,
  formatNativeFrameReasonFlags,
  nativeChooseFrameStrategy,
  NATIVE_FRAME_REASON,
  NATIVE_FRAME_STRATEGY,
  NATIVE_FRAME_TRANSPORT,
} from "./native-frame-orchestrator"

describe("nativeChooseFrameStrategy", () => {
  test("chooses skip-present when there is no dirty work", () => {
    const plan = nativeChooseFrameStrategy({
      dirtyLayerCount: 0,
      dirtyPixelArea: 0,
      totalPixelArea: 100,
      overlapPixelArea: 0,
      overlapRatio: 0,
      fullRepaint: false,
      hasSubtreeTransforms: false,
      hasActiveInteraction: false,
      transmissionMode: NATIVE_FRAME_TRANSPORT.SHM,
      lastStrategy: null,
      framesSinceChange: 4,
      estimatedLayeredBytes: 0,
      estimatedFinalBytes: 100,
    })

    expect(plan).toEqual({
      strategy: NATIVE_FRAME_STRATEGY.SKIP_PRESENT,
      reasonFlags: NATIVE_FRAME_REASON.NO_DAMAGE,
    })
  })

  test("chooses layered-region for bounded shm damage", () => {
    const plan = nativeChooseFrameStrategy({
      dirtyLayerCount: 1,
      dirtyPixelArea: 1_000,
      totalPixelArea: 10_000,
      overlapPixelArea: 0,
      overlapRatio: 0,
      fullRepaint: false,
      hasSubtreeTransforms: false,
      hasActiveInteraction: false,
      transmissionMode: NATIVE_FRAME_TRANSPORT.SHM,
      lastStrategy: null,
      framesSinceChange: 4,
      estimatedLayeredBytes: 1_000,
      estimatedFinalBytes: 10_000,
    })

    expect(plan?.strategy).toBe(NATIVE_FRAME_STRATEGY.LAYERED_REGION)
    expect((plan?.reasonFlags ?? 0) & NATIVE_FRAME_REASON.REGION_CANDIDATE).toBe(NATIVE_FRAME_REASON.REGION_CANDIDATE)
  })

  test("formats native frame reason flags", () => {
    expect(formatNativeFrameReasonFlags(NATIVE_FRAME_REASON.REGION_CANDIDATE | NATIVE_FRAME_REASON.BYTES_FAVOR_LAYERED)).toBe("region,bytes")
  })

  test("builds structured native frame execution stats", () => {
    expect(buildNativeFrameExecutionStats({
      strategy: NATIVE_FRAME_STRATEGY.LAYERED_REGION,
      reasonFlags: NATIVE_FRAME_REASON.REGION_CANDIDATE,
      dirtyLayerCount: 2,
      dirtyPixelArea: 120,
      totalPixelArea: 500,
      overlapPixelArea: 10,
      overlapRatio: 0.02,
      fullRepaint: false,
      transmissionMode: "shm",
      estimatedLayeredBytes: 600,
      estimatedFinalBytes: 2000,
      repaintedCount: 1,
      stableReuseCount: 3,
      moveOnlyCount: 0,
      moveFallbackCount: 0,
      resourceBytes: 4096,
      gpuResourceBytes: 2048,
      resourceEntries: 8,
      rendererOutput: "native-presented",
      nativePresentationStats: null,
      ffiCallCount: 6,
      ffiCallsBySymbol: { vexart_frame_choose_strategy: 1 },
    })).toMatchObject({
      strategy: NATIVE_FRAME_STRATEGY.LAYERED_REGION,
      dirtyLayerCount: 2,
      resourceEntries: 8,
      rendererOutput: "native-presented",
    })
  })
})
