import { isNativeRetainedForcedOff, nativeRetainedFallbackReason } from "./native-retained-flags"

let enabled = false
let fallbackReason: string | null = null

export function isNativeSceneGraphForcedOff() {
  return isNativeRetainedForcedOff() || process.env.VEXART_NATIVE_SCENE_GRAPH === "0"
}

export function nativeSceneGraphForcedOffReason() {
  if (isNativeRetainedForcedOff()) return nativeRetainedFallbackReason()
  if (process.env.VEXART_NATIVE_SCENE_GRAPH === "0") return "VEXART_NATIVE_SCENE_GRAPH=0 (env override)"
  return null
}

export function enableNativeSceneGraph() {
  if (isNativeSceneGraphForcedOff()) {
    enabled = false
    fallbackReason = nativeSceneGraphForcedOffReason()
    return
  }
  enabled = true
  fallbackReason = null
}

export function disableNativeSceneGraph(reason?: string) {
  enabled = false
  fallbackReason = reason ?? fallbackReason
}

export function isNativeSceneGraphEnabled() {
  return enabled && !isNativeSceneGraphForcedOff()
}

export function getNativeSceneGraphFallbackReason() {
  if (isNativeSceneGraphForcedOff()) return nativeSceneGraphForcedOffReason()
  return fallbackReason
}
