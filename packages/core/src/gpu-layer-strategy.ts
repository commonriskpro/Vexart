export type GpuLayerStrategyMode = "layered-raw" | "final-frame-raw"

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

export function chooseGpuLayerStrategy(input: GpuLayerStrategyInput): GpuLayerStrategyMode {
  if (input.hasSubtreeTransforms) return "final-frame-raw"
  if (input.hasActiveInteraction) return "layered-raw"
  if (input.fullRepaint) return "final-frame-raw"
  if (input.totalPixelArea <= 0) return "layered-raw"
  if (input.dirtyLayerCount === 0) return "layered-raw"
  const dirtyRatio = input.dirtyPixelArea / input.totalPixelArea
  const outputRatio = input.estimatedFinalBytes > 0 ? input.estimatedLayeredBytes / input.estimatedFinalBytes : 0

  let preferred: GpuLayerStrategyMode = "final-frame-raw"
  if (input.transmissionMode === "direct" && outputRatio < 0.45) preferred = "layered-raw"
  else if (input.dirtyLayerCount <= 1 && dirtyRatio < 0.45 && input.overlapPixelArea <= 0) preferred = "layered-raw"
  else if (input.dirtyLayerCount <= 2 && dirtyRatio < 0.3 && input.overlapRatio < 0.08) preferred = "layered-raw"
  else if (dirtyRatio < 0.18 && input.overlapRatio < 0.04) preferred = "layered-raw"

  if (!input.lastStrategy) return preferred
  if (preferred === input.lastStrategy) return preferred
  if (input.framesSinceChange < 2) {
    if (preferred === "final-frame-raw" && input.fullRepaint) return preferred
    if (preferred === "layered-raw" && outputRatio < 0.42) return preferred
    return input.lastStrategy
  }
  if (preferred === "layered-raw") {
    if (outputRatio < 0.42) return preferred
    if (dirtyRatio < 0.12 && input.overlapRatio < 0.03) return preferred
    return input.lastStrategy
  }
  if (dirtyRatio > 0.42) return preferred
  if (input.overlapRatio > 0.12) return preferred
  if (outputRatio > 0.82) return preferred
  return input.lastStrategy
}
