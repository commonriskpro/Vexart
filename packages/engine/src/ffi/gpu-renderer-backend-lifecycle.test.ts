import { describe, expect, test } from "bun:test"
import { createGpuRendererBackendForTesting } from "./gpu-renderer-backend"

describe("gpu renderer backend lifecycle", () => {
  test("destroy succeeds on an uninitialized backend", () => {
    const backend = createGpuRendererBackendForTesting()
    expect(() => backend.destroy?.()).not.toThrow()
  })

  test("destroy succeeds after target allocation and clears resources", () => {
    const backend = createGpuRendererBackendForTesting()
    // Readback initializes context and targets
    const buf = backend.readbackForTest?.(10, 10)
    // Destroy cleans up sprite caches, targets, handles, and context
    expect(() => backend.destroy?.()).not.toThrow()
    // Subsequent readback returns null since context is destroyed
    expect(backend.readbackForTest?.(10, 10)).toBeNull()
  })
})

// Failed allocations exercise real GPU limits, not injected return values.
test("failed standalone resize preserves the previous target for a later frame", () => {
  const backend = createGpuRendererBackendForTesting()
  const paint = (width: number) => backend.paint({
    targetWidth: width, targetHeight: 2, backing: null,
    target: { width, height: 2 }, commands: [], graph: { ops: [] },
    offsetX: 0, offsetY: 0, frame: null, layer: null,
  })
  try {
    paint(2)
    const before = backend.readbackForTest(2, 2)
    expect(before?.length).toBe(16)
    expect(() => paint(1_000_000)).toThrow("could not allocate")
    expect(backend.readbackForTest(2, 2)).toEqual(before)
    expect(() => paint(2)).not.toThrow()
    expect(backend.readbackForTest(2, 2)).toEqual(before)
  } finally { backend.destroy?.() }
})

for (const failed of ["layer", "final"] as const) {
  test(`failed ${failed} resize preserves targets for subsequent composition`, () => {
    const backend = createGpuRendererBackendForTesting()
    const frame = (width: number) => ({
      viewportWidth: width, viewportHeight: 2, dirtyLayerCount: 1, layerCount: 1,
      dirtyPixelArea: width * 2, totalPixelArea: width * 2, overlapPixelArea: 0,
      overlapRatio: 0, fullRepaint: true, useLayerCompositing: true,
      hasSubtreeTransforms: false, hasActiveInteraction: false,
      transmissionMode: "direct" as const, estimatedLayeredBytes: 16, estimatedFinalBytes: width * 8,
    })
    const render = (viewport: number, width: number) => {
      const context = frame(viewport)
      const bounds = { x: 0, y: 0, width, height: 2 }
      backend.beginFrame?.(context)
      backend.paint({
        targetWidth: width, targetHeight: 2, backing: null,
        target: { width, height: 2 }, commands: [],
        graph: { ops: [{ kind: "rectangle", renderObjectId: null, type: 1, ...bounds, color: 0xff0000ff, cornerRadius: 0, extra1: 0, extra2: 0, radius: 0, image: null, canvas: null, effect: null }] },
        offsetX: 0, offsetY: 0, frame: context,
        layer: { key: "stable", z: 0, bounds, backing: null, subtreeTransform: null,
          isBackground: true, dirtyRect: bounds, repaintRect: null, allowRegionalRepaint: false,
          retainedDuringInteraction: false },
      })
      return backend.endFrame?.(context)
    }
    try {
      render(2, 2)
      const before = backend.readbackForTest(2, 2)
      expect(before).toEqual(new Uint8Array([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]))
      if (failed === "layer") expect(() => render(2, 1_000_000)).toThrow("could not allocate")
      else expect(render(1_000_000, 2)).toBeNull()
      expect(backend.readbackForTest(2, 2)).toEqual(before)
      expect(() => render(2, 2)).not.toThrow()
      expect(backend.readbackForTest(2, 2)).toEqual(before)
    } finally { backend.destroy?.() }
  })
}
