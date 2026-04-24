import { isNativeRetainedForcedOff, nativeRetainedFallbackReason } from "./native-retained-flags"

let enabled = false
let fallbackReason: string | null = null

export function isNativeEventDispatchForcedOff() {
  return isNativeRetainedForcedOff() || process.env.VEXART_NATIVE_EVENT_DISPATCH === "0"
}

export function nativeEventDispatchForcedOffReason() {
  if (isNativeRetainedForcedOff()) return nativeRetainedFallbackReason()
  if (process.env.VEXART_NATIVE_EVENT_DISPATCH === "0") return "VEXART_NATIVE_EVENT_DISPATCH=0 (env override)"
  return null
}

export function enableNativeEventDispatch() {
  if (isNativeEventDispatchForcedOff()) {
    enabled = false
    fallbackReason = nativeEventDispatchForcedOffReason()
    return
  }
  enabled = true
  fallbackReason = null
}

export function disableNativeEventDispatch(reason?: string) {
  enabled = false
  fallbackReason = reason ?? fallbackReason
}

export function isNativeEventDispatchEnabled() {
  return enabled && !isNativeEventDispatchForcedOff()
}

export function getNativeEventDispatchFallbackReason() {
  if (isNativeEventDispatchForcedOff()) return nativeEventDispatchForcedOffReason()
  return fallbackReason
}
