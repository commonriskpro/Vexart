import { describe, expect, test } from "bun:test"
import { createGpuRendererBackendForTesting } from "./gpu-renderer-backend"
import { openVexartLibrary } from "./vexart-bridge"
import { ptr } from "bun:ffi"
import {
  vexartCompositeTargetCreate,
  vexartCompositeTargetDestroy,
  vexartCompositeTargetBeginLayer,
  vexartCompositeTargetEndLayer,
} from "./gpu-composite-ops"
import {
  nativeLayerUpsert,
  nativeLayerRemove,
  clearNativeLayerRegistryMirror,
} from "./native-layer-registry"

describe("Step 4 Native Context & Resource Management", () => {
  test("instanceImageHandles tracks images per-backend instance without affecting other backends", () => {
    const backend1 = createGpuRendererBackendForTesting()
    const backend2 = createGpuRendererBackendForTesting()

    expect(backend1.instanceImageHandles).toBeInstanceOf(Set)
    expect(backend2.instanceImageHandles).toBeInstanceOf(Set)
    expect(backend1.instanceImageHandles).not.toBe(backend2.instanceImageHandles)

    // Render an image on backend1 to trigger texture and image allocation
    const imgData = new Uint8Array(16 * 16 * 4).fill(255)
    const imageOp = {
      kind: "image" as const,
      x: 0,
      y: 0,
      width: 16,
      height: 16,
      rect: {
        kind: "rectangle" as const,
        x: 0,
        y: 0,
        width: 16,
        height: 16,
        fill: 0xffffffff,
        radius: 0,
        image: null,
        canvas: null,
        effect: null,
      },
      image: {
        imageBuffer: {
          data: imgData,
          width: 16,
          height: 16,
        },
        display: "contain" as const,
      },
    }

    backend1.beginFrame?.({
      viewportWidth: 16,
      viewportHeight: 16,
      totalPixelArea: 256,
      dirtyPixelArea: 256,
      dirtyLayerCount: 1,
      layerCount: 1,
      overlapPixelArea: 0,
      overlapRatio: 0,
      fullRepaint: true,
      useLayerCompositing: true,
      hasSubtreeTransforms: false,
      hasActiveInteraction: false,
      transmissionMode: "direct",
      estimatedLayeredBytes: 1024,
      estimatedFinalBytes: 1024,
    })
    backend1.paint({
      graph: { ops: [imageOp as unknown as any] },
      targetWidth: 16,
      targetHeight: 16,
      backing: null,
      target: { width: 16, height: 16 },
      commands: [],
      offsetX: 0,
      offsetY: 0,
      frame: null,
      layer: null,
    })

    // backend1 should have tracked the uploaded image in instanceImageHandles
    expect(backend1.instanceImageHandles.size).toBeGreaterThan(0)

    // backend2 renders an independent image frame
    const imgData2 = new Uint8Array(8 * 8 * 4).fill(128)
    const imageOp2 = {
      kind: "image" as const,
      x: 0,
      y: 0,
      width: 8,
      height: 8,
      rect: {
        kind: "rectangle" as const,
        x: 0,
        y: 0,
        width: 8,
        height: 8,
        fill: 0xffffffff,
        radius: 0,
        image: null,
        canvas: null,
        effect: null,
      },
      image: {
        imageBuffer: {
          data: imgData2,
          width: 8,
          height: 8,
        },
        display: "contain" as const,
      },
    }

    backend2.beginFrame?.({
      viewportWidth: 8,
      viewportHeight: 8,
      totalPixelArea: 64,
      dirtyPixelArea: 64,
      dirtyLayerCount: 1,
      layerCount: 1,
      overlapPixelArea: 0,
      overlapRatio: 0,
      fullRepaint: true,
      useLayerCompositing: true,
      hasSubtreeTransforms: false,
      hasActiveInteraction: false,
      transmissionMode: "direct",
      estimatedLayeredBytes: 512,
      estimatedFinalBytes: 512,
    })
    backend2.paint({
      graph: { ops: [imageOp2 as unknown as any] },
      targetWidth: 8,
      targetHeight: 8,
      backing: null,
      target: { width: 8, height: 8 },
      commands: [],
      offsetX: 0,
      offsetY: 0,
      frame: null,
      layer: null,
    })

    expect(backend2.instanceImageHandles.size).toBeGreaterThan(0)

    // Destroy backend1: only backend1's instance image handles should be cleared
    backend1.destroy?.()
    expect(backend1.instanceImageHandles.size).toBe(0)
    // backend2's instance image handles must remain intact
    expect(backend2.instanceImageHandles.size).toBeGreaterThan(0)

    // Backend2 should still be completely valid and destroy cleanly
    backend2.destroy?.()
    expect(backend2.instanceImageHandles.size).toBe(0)
  })

  test("target create validates dimensions against GPU limits avoiding driver panics", () => {
    // 0 dimension should fail
    const target0 = vexartCompositeTargetCreate(1n, 0, 100)
    expect(target0).toBe(0n)

    const target0h = vexartCompositeTargetCreate(1n, 100, 0)
    expect(target0h).toBe(0n)

    // Oversized dimension (> 16384 for standard 2D texture limits)
    const targetHuge = vexartCompositeTargetCreate(1n, 100_000, 100_000)
    expect(targetHuge).toBe(0n)

    // Valid dimension succeeds
    const targetValid = vexartCompositeTargetCreate(1n, 64, 64)
    expect(targetValid).not.toBe(0n)
    vexartCompositeTargetDestroy(1n, targetValid)
  })

  test("exception-safe target layer end guarantees active_layer is cleared on error", () => {
    const target = vexartCompositeTargetCreate(1n, 32, 32)
    expect(target).not.toBe(0n)

    // Simulate an operation wrapped in try ... finally that throws
    expect(() => {
      vexartCompositeTargetBeginLayer(1n, target, 0, 0x00000000)
      try {
        throw new Error("simulated dispatch error")
      } finally {
        vexartCompositeTargetEndLayer(1n, target)
      }
    }).toThrow("simulated dispatch error")

    // If end_layer was called in finally, the target is rested and can begin a new layer without error
    expect(() => {
      vexartCompositeTargetBeginLayer(1n, target, 0, 0x00000000)
      vexartCompositeTargetEndLayer(1n, target)
    }).not.toThrow()

    vexartCompositeTargetDestroy(1n, target)
  })

  test("native layer registry operations accept dynamic context parameter", () => {
    const key = `test-layer-ctx-${Date.now()}`
    const result = nativeLayerUpsert(key, {
      target: 1n,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      z: 1,
    }, 1n)

    expect(result).not.toBeNull()
    expect(result?.handle).toBeGreaterThan(0n)

    const removedId = nativeLayerRemove(key, 1n)
    expect(removedId).not.toBeNull()

    clearNativeLayerRegistryMirror({ suppressTerminalImageDeletes: true }, 1n)
  })

  test("sprite cache trimming removes evicted handles from instanceImageHandles", () => {
    const backend = createGpuRendererBackendForTesting()
    expect(backend.instanceImageHandles.size).toBe(0)

    backend.beginFrame?.({
      viewportWidth: 32,
      viewportHeight: 32,
      totalPixelArea: 1024,
      dirtyPixelArea: 1024,
      dirtyLayerCount: 1,
      layerCount: 1,
      overlapPixelArea: 0,
      overlapRatio: 0,
      fullRepaint: true,
      useLayerCompositing: true,
      hasSubtreeTransforms: false,
      hasActiveInteraction: false,
      transmissionMode: "direct",
      estimatedLayeredBytes: 1024,
      estimatedFinalBytes: 1024,
    })

    const createCanvasOp = (id: number) => ({
      kind: "canvas" as const,
      x: 0,
      y: 0,
      width: 16,
      height: 16,
      rect: {
        kind: "rectangle" as const,
        x: 0,
        y: 0,
        width: 16,
        height: 16,
        fill: 0xffffffff,
        radius: 0,
        image: null,
        canvas: null,
        effect: null,
      },
      canvas: {
        color: 0xffffffff,
        displayListHash: `canvas-${id}`,
        onDraw: () => {},
      },
    })

    // Render first canvas sprite
    backend.paint({
      graph: { ops: [createCanvasOp(0) as unknown as any] },
      targetWidth: 32,
      targetHeight: 32,
      backing: null,
      target: { width: 32, height: 32 },
      commands: [],
      offsetX: 0,
      offsetY: 0,
      frame: null,
      layer: null,
    })

    expect(backend.instanceImageHandles.size).toBe(1)
    const firstCanvasHandle = Array.from(backend.instanceImageHandles)[0]
    expect(firstCanvasHandle).toBeDefined()
    expect(backend.instanceImageHandles.has(firstCanvasHandle)).toBe(true)

    // Render 64 more distinct canvas sprites (total 65), exceeding MAX_GPU_CANVAS_SPRITES (64)
    for (let i = 1; i <= 64; i++) {
      backend.paint({
        graph: { ops: [createCanvasOp(i) as unknown as any] },
        targetWidth: 32,
        targetHeight: 32,
        backing: null,
        target: { width: 32, height: 32 },
        commands: [],
        offsetX: 0,
        offsetY: 0,
        frame: null,
        layer: null,
      })
    }

    // The first handle should have been evicted and removed from instanceImageHandles
    expect(backend.instanceImageHandles.has(firstCanvasHandle)).toBe(false)
    expect(backend.instanceImageHandles.size).toBe(64)

    backend.destroy?.()
    expect(backend.instanceImageHandles.size).toBe(0)

    // Verify transform sprite cache trimming
    const backendTransform = createGpuRendererBackendForTesting()
    backendTransform.beginFrame?.({
      viewportWidth: 32,
      viewportHeight: 32,
      totalPixelArea: 1024,
      dirtyPixelArea: 1024,
      dirtyLayerCount: 1,
      layerCount: 1,
      overlapPixelArea: 0,
      overlapRatio: 0,
      fullRepaint: true,
      useLayerCompositing: true,
      hasSubtreeTransforms: false,
      hasActiveInteraction: false,
      transmissionMode: "direct",
      estimatedLayeredBytes: 1024,
      estimatedFinalBytes: 1024,
    })

    const createTransformOp = (id: number) => ({
      kind: "effect" as const,
      type: 0,
      x: 0,
      y: 0,
      width: 16,
      height: 16,
      color: 0xff0000ff,
      cornerRadius: 0,
      extra1: 0,
      extra2: 0,
      text: "",
      transformStateId: 0,
      clipStateId: 0,
      effectStateId: id,
      rect: {
        kind: "rectangle" as const,
        x: 0,
        y: 0,
        width: 16,
        height: 16,
        fill: 0xff0000ff,
        radius: 0,
        image: null,
        canvas: null,
        effect: null,
      },
      effect: {
        color: 0xff0000ff,
        transform: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
      },
      backdrop: null,
    })

    backendTransform.paint({
      graph: { ops: [createTransformOp(0) as unknown as any] },
      targetWidth: 32,
      targetHeight: 32,
      backing: null,
      target: { width: 32, height: 32 },
      commands: [],
      offsetX: 0,
      offsetY: 0,
      frame: null,
      layer: null,
    })

    expect(backendTransform.instanceImageHandles.size).toBe(1)
    const firstTransformHandle = Array.from(backendTransform.instanceImageHandles)[0]
    expect(firstTransformHandle).toBeDefined()
    expect(backendTransform.instanceImageHandles.has(firstTransformHandle)).toBe(true)

    // Render 64 more distinct transform sprites (total 65), exceeding MAX_GPU_TRANSFORM_SPRITES (64)
    for (let i = 1; i <= 64; i++) {
      backendTransform.paint({
        graph: { ops: [createTransformOp(i) as unknown as any] },
        targetWidth: 32,
        targetHeight: 32,
        backing: null,
        target: { width: 32, height: 32 },
        commands: [],
        offsetX: 0,
        offsetY: 0,
        frame: null,
        layer: null,
      })
    }

    // The first transform handle should have been evicted and removed from instanceImageHandles
    expect(backendTransform.instanceImageHandles.has(firstTransformHandle)).toBe(false)
    expect(backendTransform.instanceImageHandles.size).toBe(64)

    backendTransform.destroy?.()
    expect(backendTransform.instanceImageHandles.size).toBe(0)
  })
})
