import { isNativeRetainedForcedOff, nativeRetainedFallbackReason } from "./native-retained-flags"

let enabled = false
let fallbackReason: string | null = null

export function isNativeSceneLayoutForcedOff() {
  return isNativeRetainedForcedOff() || process.env.VEXART_NATIVE_SCENE_LAYOUT === "0"
}

export function nativeSceneLayoutForcedOffReason() {
  if (isNativeRetainedForcedOff()) return nativeRetainedFallbackReason()
  if (process.env.VEXART_NATIVE_SCENE_LAYOUT === "0") return "VEXART_NATIVE_SCENE_LAYOUT=0 (env override)"
  return null
}

export function enableNativeSceneLayout() {
  if (isNativeSceneLayoutForcedOff()) {
    enabled = false
    fallbackReason = nativeSceneLayoutForcedOffReason()
    return
  }
  enabled = true
  fallbackReason = null
}

export function disableNativeSceneLayout(reason?: string) {
  enabled = false
  fallbackReason = reason ?? fallbackReason
}

export function isNativeSceneLayoutEnabled() {
  return enabled && !isNativeSceneLayoutForcedOff()
}

export function getNativeSceneLayoutFallbackReason() {
  if (isNativeSceneLayoutForcedOff()) return nativeSceneLayoutForcedOffReason()
  return fallbackReason
}
