export type GpuLayerStrategyMode = "layered-raw" | "final-frame-raw"

export type GpuLayerStrategyInput = {
  dirtyLayerCount: number
  dirtyPixelArea: number
  totalPixelArea: number
  overlapPixelArea: number
  overlapRatio: number
  fullRepaint: boolean
  transmissionMode: "direct" | "file" | "shm"
  estimatedLayeredBytes: number
  estimatedFinalBytes: number
}

export function chooseGpuLayerStrategy(input: GpuLayerStrategyInput): GpuLayerStrategyMode {
  if (input.fullRepaint) return "final-frame-raw"
  if (input.totalPixelArea <= 0) return "layered-raw"
  if (input.dirtyLayerCount === 0) return "layered-raw"
  const dirtyRatio = input.dirtyPixelArea / input.totalPixelArea
  const outputRatio = input.estimatedFinalBytes > 0 ? input.estimatedLayeredBytes / input.estimatedFinalBytes : 0
  if (input.transmissionMode === "direct" && outputRatio < 0.45) return "layered-raw"
  if (input.dirtyLayerCount <= 1 && dirtyRatio < 0.45 && input.overlapPixelArea <= 0) return "layered-raw"
  if (input.dirtyLayerCount <= 2 && dirtyRatio < 0.3 && input.overlapRatio < 0.08) return "layered-raw"
  if (dirtyRatio < 0.18 && input.overlapRatio < 0.04) return "layered-raw"
  return "final-frame-raw"
}
