/** @internal */
export const NATIVE_FRAME_STRATEGY = {
  SKIP_PRESENT: 0,
  LAYERED_DIRTY: 1,
  LAYERED_REGION: 2,
  FINAL_FRAME: 3,
} as const

/** @internal */
export const NATIVE_FRAME_TRANSPORT = {
  DIRECT: 0,
  FILE: 1,
  SHM: 2,
} as const

/** @internal */
export const NATIVE_FRAME_REASON = {
  NO_DAMAGE: 1 << 0,
  TRANSFORMS: 1 << 1,
  FULL_REPAINT: 1 << 2,
  ACTIVE_INTERACTION: 1 << 3,
  REGION_CANDIDATE: 1 << 4,
  LAYERED_CANDIDATE: 1 << 5,
  BYTES_FAVOR_LAYERED: 1 << 6,
  HYSTERESIS_HELD: 1 << 7,
} as const

export type NativeFrameStrategy = (typeof NATIVE_FRAME_STRATEGY)[keyof typeof NATIVE_FRAME_STRATEGY]

export type NativeFramePlanInput = {
  dirtyLayerCount: number
  dirtyPixelArea: number
  totalPixelArea: number
  overlapPixelArea: number
  overlapRatio: number
  fullRepaint: boolean
  hasSubtreeTransforms: boolean
  hasActiveInteraction: boolean
  transmissionMode: number
  lastStrategy: NativeFrameStrategy | null
  framesSinceChange: number
  estimatedLayeredBytes: number
  estimatedFinalBytes: number
}

export type NativeFramePlan = {
  strategy: NativeFrameStrategy
  reasonFlags: number
}

export type NativeFrameExecutionStatsInput = {
  strategy: NativeFrameStrategy | GpuLayerStrategyMode | null
  reasonFlags: number | null
  dirtyLayerCount: number
  dirtyPixelArea: number
  totalPixelArea: number
  overlapPixelArea: number
  overlapRatio: number
  fullRepaint: boolean
  transmissionMode: "direct" | "file" | "shm" | null
  estimatedLayeredBytes: number
  estimatedFinalBytes: number
  repaintedCount: number
  stableReuseCount: number
  moveOnlyCount: number
  moveFallbackCount: number
  resourceBytes: number
  gpuResourceBytes: number
  resourceEntries: number
  rendererOutput: string | null
  nativePresentationStats: unknown
  ffiCallCount: number
  ffiCallsBySymbol: Record<string, number>
}

export type NativeFrameExecutionStats = NativeFrameExecutionStatsInput

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

  // Skip hysteresis when only 1 layer is dirty — clearly a partial update, no ambiguity
  if (input.dirtyLayerCount <= 1 && preferred === "layered-dirty") return preferred

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

export function nativeChooseFrameStrategy(input: NativeFramePlanInput): NativeFramePlan | null {
  if (input.dirtyLayerCount === 0 || input.dirtyPixelArea === 0 || input.totalPixelArea === 0) {
    return { strategy: NATIVE_FRAME_STRATEGY.SKIP_PRESENT, reasonFlags: NATIVE_FRAME_REASON.NO_DAMAGE }
  }
  if (input.hasSubtreeTransforms) return { strategy: NATIVE_FRAME_STRATEGY.FINAL_FRAME, reasonFlags: NATIVE_FRAME_REASON.TRANSFORMS }
  if (input.fullRepaint) return { strategy: NATIVE_FRAME_STRATEGY.FINAL_FRAME, reasonFlags: NATIVE_FRAME_REASON.FULL_REPAINT }
  if (input.hasActiveInteraction) return { strategy: NATIVE_FRAME_STRATEGY.LAYERED_DIRTY, reasonFlags: NATIVE_FRAME_REASON.ACTIVE_INTERACTION }

  const mode = chooseGpuLayerStrategyFallback({
    dirtyLayerCount: input.dirtyLayerCount,
    dirtyPixelArea: input.dirtyPixelArea,
    totalPixelArea: input.totalPixelArea,
    overlapPixelArea: input.overlapPixelArea,
    overlapRatio: input.overlapRatio,
    fullRepaint: input.fullRepaint,
    hasSubtreeTransforms: input.hasSubtreeTransforms,
    hasActiveInteraction: input.hasActiveInteraction,
    transmissionMode: input.transmissionMode === NATIVE_FRAME_TRANSPORT.SHM ? "shm" : input.transmissionMode === NATIVE_FRAME_TRANSPORT.FILE ? "file" : "direct",
    estimatedLayeredBytes: input.estimatedLayeredBytes,
    estimatedFinalBytes: input.estimatedFinalBytes,
    lastStrategy: input.lastStrategy === NATIVE_FRAME_STRATEGY.SKIP_PRESENT ? "skip-present" : input.lastStrategy === NATIVE_FRAME_STRATEGY.LAYERED_REGION ? "layered-region" : input.lastStrategy === NATIVE_FRAME_STRATEGY.LAYERED_DIRTY ? "layered-dirty" : input.lastStrategy === NATIVE_FRAME_STRATEGY.FINAL_FRAME ? "final-frame" : null,
    framesSinceChange: input.framesSinceChange,
  })
  if (mode === "skip-present") return { strategy: NATIVE_FRAME_STRATEGY.SKIP_PRESENT, reasonFlags: NATIVE_FRAME_REASON.NO_DAMAGE }
  if (mode === "layered-region") return { strategy: NATIVE_FRAME_STRATEGY.LAYERED_REGION, reasonFlags: NATIVE_FRAME_REASON.REGION_CANDIDATE }
  if (mode === "layered-dirty") return { strategy: NATIVE_FRAME_STRATEGY.LAYERED_DIRTY, reasonFlags: NATIVE_FRAME_REASON.LAYERED_CANDIDATE }
  return { strategy: NATIVE_FRAME_STRATEGY.FINAL_FRAME, reasonFlags: 0 }
}

export function formatNativeFrameReasonFlags(flags: number): string {
  const labels = [
    [NATIVE_FRAME_REASON.NO_DAMAGE, "no-damage"],
    [NATIVE_FRAME_REASON.TRANSFORMS, "transforms"],
    [NATIVE_FRAME_REASON.FULL_REPAINT, "full-repaint"],
    [NATIVE_FRAME_REASON.ACTIVE_INTERACTION, "active-interaction"],
    [NATIVE_FRAME_REASON.REGION_CANDIDATE, "region-candidate"],
    [NATIVE_FRAME_REASON.LAYERED_CANDIDATE, "layered-candidate"],
    [NATIVE_FRAME_REASON.BYTES_FAVOR_LAYERED, "bytes-favor-layered"],
    [NATIVE_FRAME_REASON.HYSTERESIS_HELD, "hysteresis-held"],
  ] as const
  return labels.filter(([flag]) => (flags & flag) !== 0).map(([, label]) => label).join("|")
}

export function buildNativeFrameExecutionStats(input: NativeFrameExecutionStatsInput): NativeFrameExecutionStats {
  return input
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
