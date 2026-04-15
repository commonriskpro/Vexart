export type GpuLayerStrategyMode = "layered-raw" | "final-frame-raw"

export type GpuLayerStrategyInput = {
  dirtyLayerCount: number
  dirtyPixelArea: number
  totalPixelArea: number
  fullRepaint: boolean
}

export function chooseGpuLayerStrategy(input: GpuLayerStrategyInput): GpuLayerStrategyMode {
  if (input.fullRepaint) return "final-frame-raw"
  if (input.totalPixelArea <= 0) return "layered-raw"
  const dirtyRatio = input.dirtyPixelArea / input.totalPixelArea
  if (input.dirtyLayerCount <= 1 && dirtyRatio < 0.45) return "layered-raw"
  return "final-frame-raw"
}
