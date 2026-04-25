import { afterEach, describe, expect, test } from "bun:test"
import {
  disableNativeLayerRegistry,
  enableNativeLayerRegistry,
  isNativeLayerRegistryEnabled,
  nativeLayerRegistryFallbackReason,
} from "./native-layer-registry-flags"

const originalEnv = process.env.VEXART_NATIVE_LAYER_REGISTRY

afterEach(() => {
  if (originalEnv === undefined) delete process.env.VEXART_NATIVE_LAYER_REGISTRY
  else process.env.VEXART_NATIVE_LAYER_REGISTRY = originalEnv
  enableNativeLayerRegistry()
})

describe("native layer registry flags", () => {
  test("can be disabled with a fallback reason", () => {
    disableNativeLayerRegistry("test disable")

    expect(isNativeLayerRegistryEnabled()).toBe(false)
    expect(nativeLayerRegistryFallbackReason()).toBe("test disable")
  })

  test("env override forces disable", () => {
    process.env.VEXART_NATIVE_LAYER_REGISTRY = "0"
    enableNativeLayerRegistry()

    expect(isNativeLayerRegistryEnabled()).toBe(false)
    expect(nativeLayerRegistryFallbackReason()).toBe("VEXART_NATIVE_LAYER_REGISTRY=0 (env override)")
  })
})
