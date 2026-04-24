import { isNativeRetainedForcedOff, nativeRetainedFallbackReason } from "./native-retained-flags"

let enabled = false
let fallbackReason: string | null = null

export function isNativeRenderGraphForcedOff() {
  return isNativeRetainedForcedOff() || process.env.VEXART_NATIVE_RENDER_GRAPH === "0"
}

export function nativeRenderGraphForcedOffReason() {
  if (isNativeRetainedForcedOff()) return nativeRetainedFallbackReason()
  if (process.env.VEXART_NATIVE_RENDER_GRAPH === "0") return "VEXART_NATIVE_RENDER_GRAPH=0 (env override)"
  return null
}

export function enableNativeRenderGraph() {
  if (isNativeRenderGraphForcedOff()) {
    enabled = false
    fallbackReason = nativeRenderGraphForcedOffReason()
    return
  }
  enabled = true
  fallbackReason = null
}

export function disableNativeRenderGraph(reason?: string) {
  enabled = false
  fallbackReason = reason ?? fallbackReason
}

export function isNativeRenderGraphEnabled() {
  return enabled && !isNativeRenderGraphForcedOff()
}

export function getNativeRenderGraphFallbackReason() {
  if (isNativeRenderGraphForcedOff()) return nativeRenderGraphForcedOffReason()
  return fallbackReason
}
