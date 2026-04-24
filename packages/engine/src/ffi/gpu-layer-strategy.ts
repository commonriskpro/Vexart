import { nativeChooseFrameStrategy, NATIVE_FRAME_STRATEGY, NATIVE_FRAME_TRANSPORT, type NativeFramePlan } from "./native-frame-orchestrator"

/** @public */
export type GpuLayerStrategyMode = "skip-present" | "layered-dirty" | "layered-region" | "final-frame"

/** @public */
export type GpuLayerStrategyInput = {
  dirtyLayerCount: number
  dirtyPixelArea: number
  totalPixelArea: number
  overlapPixelArea: number
  overlapRatio: number
  fullRepaint: boolean
  hasSubtreeTransforms: boolean
  hasActiveInteraction: boolean
  transmissionMode: "direct" | "file" | "shm"
  estimatedLayeredBytes: number
  estimatedFinalBytes: number
  lastStrategy: GpuLayerStrategyMode | null
  framesSinceChange: number
}

function chooseGpuLayerStrategyFallback(input: GpuLayerStrategyInput): GpuLayerStrategyMode {
  if (input.hasSubtreeTransforms) return "final-frame"
  if (input.hasActiveInteraction) return "layered-dirty"
  if (input.fullRepaint) return "final-frame"
  if (input.totalPixelArea <= 0) return "skip-present"
  if (input.dirtyLayerCount === 0) return "skip-present"
  const dirtyRatio = input.dirtyPixelArea / input.totalPixelArea
  const outputRatio = input.estimatedFinalBytes > 0 ? input.estimatedLayeredBytes / input.estimatedFinalBytes : 0

  let preferred: GpuLayerStrategyMode = "final-frame"
  if (input.transmissionMode === "shm" && input.dirtyLayerCount <= 2 && dirtyRatio < 0.18 && input.overlapRatio < 0.04) preferred = "layered-region"
  else if (input.transmissionMode === "direct" && outputRatio < 0.45) preferred = "layered-dirty"
  else if (input.dirtyLayerCount <= 1 && dirtyRatio < 0.45 && input.overlapPixelArea <= 0) preferred = "layered-dirty"
  else if (input.dirtyLayerCount <= 2 && dirtyRatio < 0.3 && input.overlapRatio < 0.08) preferred = "layered-dirty"
  else if (dirtyRatio < 0.18 && input.overlapRatio < 0.04) preferred = "layered-dirty"

  if (!input.lastStrategy) return preferred
  if (preferred === input.lastStrategy) return preferred
  if (input.framesSinceChange < 2) {
    if (preferred === "final-frame" && input.fullRepaint) return preferred
    if (preferred === "layered-region" && dirtyRatio < 0.22 && input.overlapRatio < 0.05) return preferred
    if (preferred === "layered-dirty" && outputRatio < 0.42) return preferred
    return input.lastStrategy
  }
  if (preferred === "layered-dirty") {
    if (outputRatio < 0.42) return preferred
    if (dirtyRatio < 0.12 && input.overlapRatio < 0.03) return preferred
    return input.lastStrategy
  }
  if (preferred === "layered-region") {
    if (dirtyRatio < 0.24 && input.overlapRatio < 0.06) return preferred
    return input.lastStrategy
  }
  if (dirtyRatio > 0.42) return preferred
  if (input.overlapRatio > 0.12) return preferred
  if (outputRatio > 0.82) return preferred
  return input.lastStrategy
}

/** @public */
export function chooseGpuLayerStrategy(input: GpuLayerStrategyInput, nativePlanOverride?: NativeFramePlan | null): GpuLayerStrategyMode {
  const nativePlan = nativePlanOverride ?? nativeChooseFrameStrategy({
    dirtyLayerCount: input.dirtyLayerCount,
    dirtyPixelArea: input.dirtyPixelArea,
    totalPixelArea: input.totalPixelArea,
    overlapPixelArea: input.overlapPixelArea,
    overlapRatio: input.overlapRatio,
    fullRepaint: input.fullRepaint,
    hasSubtreeTransforms: input.hasSubtreeTransforms,
    hasActiveInteraction: input.hasActiveInteraction,
    transmissionMode: input.transmissionMode === "shm"
      ? NATIVE_FRAME_TRANSPORT.SHM
      : input.transmissionMode === "file"
        ? NATIVE_FRAME_TRANSPORT.FILE
        : NATIVE_FRAME_TRANSPORT.DIRECT,
    lastStrategy: input.lastStrategy === "final-frame"
      ? NATIVE_FRAME_STRATEGY.FINAL_FRAME
      : input.lastStrategy === "layered-region"
        ? NATIVE_FRAME_STRATEGY.LAYERED_REGION
        : input.lastStrategy === "layered-dirty"
        ? NATIVE_FRAME_STRATEGY.LAYERED_DIRTY
        : input.lastStrategy === "skip-present"
          ? NATIVE_FRAME_STRATEGY.SKIP_PRESENT
        : null,
    framesSinceChange: input.framesSinceChange,
    estimatedLayeredBytes: input.estimatedLayeredBytes,
    estimatedFinalBytes: input.estimatedFinalBytes,
  })
  if (!nativePlan) return chooseGpuLayerStrategyFallback(input)
  if (nativePlan.strategy === NATIVE_FRAME_STRATEGY.SKIP_PRESENT) return "skip-present"
  if (nativePlan.strategy === NATIVE_FRAME_STRATEGY.LAYERED_REGION) return "layered-region"
  if (nativePlan.strategy === NATIVE_FRAME_STRATEGY.FINAL_FRAME) return "final-frame"
  return "layered-dirty"
}
