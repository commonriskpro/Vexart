export const NATIVE_RETAINED_ENV = "VEXART_RETAINED"

export function isNativeRetainedForcedOff() {
  return process.env.VEXART_RETAINED === "0"
}

export function nativeRetainedFallbackReason() {
  if (!isNativeRetainedForcedOff()) return null
  return `${NATIVE_RETAINED_ENV}=0 (env override)`
}
