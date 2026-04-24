import { afterEach, describe, expect, test } from "bun:test"
import { isNativeEventDispatchEnabled, getNativeEventDispatchFallbackReason } from "../ffi/native-event-dispatch-flags"
import { isNativeLayerRegistryEnabled, nativeLayerRegistryFallbackReason } from "../ffi/native-layer-registry-flags"
import { isNativePresentationEnabled, getNativePresentationFallbackReason } from "../ffi/native-presentation-flags"
import { isNativeRenderGraphEnabled, getNativeRenderGraphFallbackReason } from "../ffi/native-render-graph-flags"
import { isNativeSceneGraphEnabled, getNativeSceneGraphFallbackReason } from "../ffi/native-scene-graph-flags"
import { isNativeSceneLayoutEnabled, getNativeSceneLayoutFallbackReason } from "../ffi/native-scene-layout-flags"
import { createRenderLoop } from "./loop"

function createMockTerminal(transmissionMode: "direct" | "file" | "shm") {
  return {
    kind: "kitty" as const,
    caps: {
      kind: "kitty" as const,
      kittyGraphics: true,
      kittyPlaceholder: false,
      kittyKeyboard: false,
      sixel: false,
      truecolor: true,
      mouse: false,
      focus: false,
      bracketedPaste: false,
      syncOutput: false,
      tmux: false,
      parentKind: null,
      transmissionMode,
    },
    size: {
      cols: 80,
      rows: 24,
      pixelWidth: 640,
      pixelHeight: 384,
      cellWidth: 8,
      cellHeight: 16,
    },
    write() {},
    rawWrite() {},
    writeBytes() {},
    beginSync() {},
    endSync() {},
    onResize() { return () => {} },
    onData() { return () => {} },
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle() {},
    writeClipboard() {},
    suspend() {},
    resume() {},
    destroy() {},
  }
}

const originalRetained = process.env.VEXART_RETAINED

afterEach(() => {
  if (originalRetained === undefined) delete process.env.VEXART_RETAINED
  else process.env.VEXART_RETAINED = originalRetained
})

describe("Phase 3f native default cutover", () => {
  test("defaults to retained stack on kitty transports", () => {
    const loop = createRenderLoop(createMockTerminal("shm"))

    expect(isNativeSceneGraphEnabled()).toBe(true)
    expect(isNativeEventDispatchEnabled()).toBe(true)
    expect(isNativeSceneLayoutEnabled()).toBe(true)
    expect(isNativeRenderGraphEnabled()).toBe(true)
    expect(isNativePresentationEnabled()).toBe(true)
    expect(isNativeLayerRegistryEnabled()).toBe(true)

    loop.destroy()
  })

  test("preserves explicit opt-out fallback controls", () => {
    const loop = createRenderLoop(createMockTerminal("shm"), {
      experimental: {
        nativePresentation: false,
        nativeLayerRegistry: false,
        nativeSceneGraph: false,
        nativeEventDispatch: false,
        nativeSceneLayout: false,
        nativeRenderGraph: false,
      },
    })

    expect(isNativePresentationEnabled()).toBe(false)
    expect(getNativePresentationFallbackReason()).toBe("nativePresentation disabled by render loop option")
    expect(isNativeLayerRegistryEnabled()).toBe(false)
    expect(nativeLayerRegistryFallbackReason()).toBe("nativeLayerRegistry disabled by render loop option")
    expect(isNativeSceneGraphEnabled()).toBe(false)
    expect(getNativeSceneGraphFallbackReason()).toBe("nativeSceneGraph disabled by render loop option")
    expect(isNativeEventDispatchEnabled()).toBe(false)
    expect(getNativeEventDispatchFallbackReason()).toBe("nativeEventDispatch disabled by render loop option")
    expect(isNativeSceneLayoutEnabled()).toBe(false)
    expect(getNativeSceneLayoutFallbackReason()).toBe("nativeSceneLayout disabled by render loop option")
    expect(isNativeRenderGraphEnabled()).toBe(false)
    expect(getNativeRenderGraphFallbackReason()).toBe("nativeRenderGraph disabled by render loop option")

    loop.destroy()
  })

  test("global retained override disables the full retained stack", () => {
    process.env.VEXART_RETAINED = "0"
    const loop = createRenderLoop(createMockTerminal("shm"))

    expect(isNativeSceneGraphEnabled()).toBe(false)
    expect(isNativeEventDispatchEnabled()).toBe(false)
    expect(isNativeSceneLayoutEnabled()).toBe(false)
    expect(isNativeRenderGraphEnabled()).toBe(false)
    expect(isNativePresentationEnabled()).toBe(false)
    expect(isNativeLayerRegistryEnabled()).toBe(false)
    expect(getNativePresentationFallbackReason()).toBe("VEXART_RETAINED=0 (env override)")
    expect(nativeLayerRegistryFallbackReason()).toBe("VEXART_RETAINED=0 (env override)")
    expect(getNativeSceneGraphFallbackReason()).toBe("VEXART_RETAINED=0 (env override)")

    loop.destroy()
  })

  test("direct kitty transport also keeps the retained stack enabled", () => {
    const loop = createRenderLoop(createMockTerminal("direct"))

    expect(isNativeSceneGraphEnabled()).toBe(true)
    expect(getNativeSceneGraphFallbackReason()).toBe(null)
    expect(isNativeEventDispatchEnabled()).toBe(true)
    expect(getNativeEventDispatchFallbackReason()).toBe(null)
    expect(isNativeSceneLayoutEnabled()).toBe(true)
    expect(getNativeSceneLayoutFallbackReason()).toBe(null)
    expect(isNativeRenderGraphEnabled()).toBe(true)
    expect(getNativeRenderGraphFallbackReason()).toBe(null)
    expect(isNativePresentationEnabled()).toBe(true)
    expect(getNativePresentationFallbackReason()).toBe(null)
    expect(isNativeLayerRegistryEnabled()).toBe(true)
    expect(nativeLayerRegistryFallbackReason()).toBe(null)

    loop.destroy()
  })
})
