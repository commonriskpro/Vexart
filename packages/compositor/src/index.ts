/**
 * Temporary bridge package for layer and damage orchestration.
 */

export * from "../../renderer/src/layers"
export * from "../../renderer/src/damage"
export { createGpuFrameComposer } from "../../renderer/src/gpu-frame-composer"
export { chooseGpuLayerStrategy } from "../../renderer/src/gpu-layer-strategy"

export type LayerId = string

export function toLayerId(value: string): LayerId {
  return value
}
