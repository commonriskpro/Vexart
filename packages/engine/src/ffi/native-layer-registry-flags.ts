/**
 * native-layer-registry-flags.ts
 * Feature flag for Phase 2c Native Layer Registry.
 */

let enabled = true
let fallbackReason: string | null = null

export function isNativeLayerRegistryForcedOff() {
  return process.env.VEXART_NATIVE_LAYER_REGISTRY === "0"
}

export function nativeLayerRegistryForcedOffReason() {
  if (process.env.VEXART_NATIVE_LAYER_REGISTRY === "0") return "VEXART_NATIVE_LAYER_REGISTRY=0 (env override)"
  return null
}

export function enableNativeLayerRegistry() {
  if (isNativeLayerRegistryForcedOff()) {
    enabled = false
    fallbackReason = nativeLayerRegistryForcedOffReason()
    return
  }
  enabled = true
  fallbackReason = null
}

export function disableNativeLayerRegistry(reason: string) {
  enabled = false
  fallbackReason = reason
}

export function isNativeLayerRegistryEnabled() {
  return enabled && !isNativeLayerRegistryForcedOff()
}

export function nativeLayerRegistryFallbackReason() {
  if (isNativeLayerRegistryForcedOff()) return nativeLayerRegistryForcedOffReason()
  return fallbackReason
}
