import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { ptr } from "bun:ffi"
import { openVexartLibrary } from "./vexart-bridge"
import {
  vexartUploadImage,
  vexartRemoveImage,
  copyGpuTargetRegionToImage,
  vexartCompositeTargetCreate,
  vexartCompositeTargetDestroy,
  vexartCompositeImageFilterBackdrop,
  vexartCompositeImageMaskRoundedRect,
  vexartCompositeImageMaskRoundedRectRegion,
  activeImageHandles,
  _vexartImageHandles,
  _handleUnregisterTokens,
  _handleToBuffer,
  _handleImageFinalization,
} from "./gpu-composite-ops"

describe("Defect 13: Image Texture Lifecycle and FinalizationRegistry Safety Net", () => {
  let vctx: bigint

  beforeAll(() => {
    const { symbols } = openVexartLibrary()
    const ctxBuf = new BigUint64Array(1)
    const optsPtr = ptr(new Uint8Array(1))
    const rc = symbols.vexart_context_create(optsPtr, 0, ptr(ctxBuf)) as number
    expect(rc).toBe(0)
    vctx = ctxBuf[0]
    expect(vctx).not.toBe(0n)
  })

  afterAll(() => {
    if (vctx) {
      const { symbols } = openVexartLibrary()
      symbols.vexart_context_destroy(vctx)
    }
  })

  test("explicit dispose() removes handle from activeImageHandles and cleans up registration", () => {
    const target = vexartCompositeTargetCreate(vctx, 16, 16)
    expect(target).not.toBe(0n)

    try {
      const img = copyGpuTargetRegionToImage(vctx, target, { x: 0, y: 0, width: 16, height: 16 })
      const handle = img.handle
      expect(handle).not.toBe(0n)
      expect(activeImageHandles.has(handle)).toBe(true)
      expect(_handleUnregisterTokens.has(handle)).toBe(true)

      // Calling dispose explicitly
      img.dispose()

      expect(activeImageHandles.has(handle)).toBe(false)
      expect(_handleUnregisterTokens.has(handle)).toBe(false)

      // Double-dispose should be a safe no-op
      expect(() => img.dispose()).not.toThrow()
    } finally {
      vexartCompositeTargetDestroy(vctx, target)
    }
  })

  test("Symbol.dispose removes handle from activeImageHandles and unregisters token", () => {
    const target = vexartCompositeTargetCreate(vctx, 16, 16)
    expect(target).not.toBe(0n)

    try {
      let handle: bigint
      {
        using img = copyGpuTargetRegionToImage(vctx, target, { x: 0, y: 0, width: 16, height: 16 })
        handle = img.handle
        expect(handle).not.toBe(0n)
        expect(activeImageHandles.has(handle)).toBe(true)
        expect(_handleUnregisterTokens.has(handle)).toBe(true)
      }

      // After leaving block with 'using', [Symbol.dispose]() was executed
      expect(activeImageHandles.has(handle!)).toBe(false)
      expect(_handleUnregisterTokens.has(handle!)).toBe(false)
    } finally {
      vexartCompositeTargetDestroy(vctx, target)
    }
  })

  test("removing an image invalidates _vexartImageHandles so re-upload creates a new valid handle", () => {
    const data = new Uint8Array(8 * 8 * 4).fill(200)

    const handle1 = vexartUploadImage(vctx, data, 8, 8)
    expect(handle1).not.toBe(0n)
    expect(activeImageHandles.has(handle1)).toBe(true)
    expect(_vexartImageHandles.get(data)).toBe(handle1)
    expect(_handleUnregisterTokens.has(handle1)).toBe(true)
    expect(_handleToBuffer.get(handle1)?.deref()).toBe(data)

    // Repeated upload while active returns cached handle
    const handleCached = vexartUploadImage(vctx, data, 8, 8)
    expect(handleCached).toBe(handle1)

    // Remove image
    vexartRemoveImage(vctx, handle1)

    expect(activeImageHandles.has(handle1)).toBe(false)
    expect(_handleUnregisterTokens.has(handle1)).toBe(false)
    expect(_handleToBuffer.has(handle1)).toBe(false)
    expect(_vexartImageHandles.get(data)).toBeUndefined()

    // Re-upload same buffer: creates a new valid handle instead of returning stale handle1
    const handle2 = vexartUploadImage(vctx, data, 8, 8)
    expect(handle2).not.toBe(0n)
    expect(activeImageHandles.has(handle2)).toBe(true)
    expect(_vexartImageHandles.get(data)).toBe(handle2)
    expect(_handleUnregisterTokens.has(handle2)).toBe(true)

    // Clean up handle2
    vexartRemoveImage(vctx, handle2)
    expect(activeImageHandles.has(handle2)).toBe(false)
  })

  test("re-upload purges stale cache if activeImageHandles does not have cached handle", () => {
    const data = new Uint8Array(4 * 4 * 4).fill(123)
    const staleHandle = 99999999n

    // Artificially inject stale cache entry that is not in activeImageHandles
    _vexartImageHandles.set(data, staleHandle)
    expect(activeImageHandles.has(staleHandle)).toBe(false)

    // vexartUploadImage must detect stale cache, delete it, and re-upload cleanly
    const newHandle = vexartUploadImage(vctx, data, 4, 4)
    expect(newHandle).not.toBe(0n)
    expect(newHandle).not.toBe(staleHandle)
    expect(activeImageHandles.has(newHandle)).toBe(true)
    expect(_vexartImageHandles.get(data)).toBe(newHandle)

    vexartRemoveImage(vctx, newHandle)
    expect(activeImageHandles.has(newHandle)).toBe(false)
  })

  test("FinalizationRegistry callback invokes vexartRemoveImage safely", () => {
    const data = new Uint8Array(4 * 4 * 4).fill(77)
    const handle = vexartUploadImage(vctx, data, 4, 4)
    expect(handle).not.toBe(0n)
    expect(activeImageHandles.has(handle)).toBe(true)

    // Directly invoking the finalization registry callback
    _handleImageFinalization({ vctx, handle })

    expect(activeImageHandles.has(handle)).toBe(false)
    expect(_handleUnregisterTokens.has(handle)).toBe(false)
    expect(_vexartImageHandles.get(data)).toBeUndefined()

    // Second call on already-removed handle should safely do nothing
    expect(() => _handleImageFinalization({ vctx, handle })).not.toThrow()
  })

  test("FinalizationRegistry secondary safety net cleans up orphaned GpuRasterImage on GC", async () => {
    const target = vexartCompositeTargetCreate(vctx, 16, 16)
    expect(target).not.toBe(0n)

    try {
      let handle: bigint
      (() => {
        const img = copyGpuTargetRegionToImage(vctx, target, { x: 0, y: 0, width: 16, height: 16 })
        handle = img.handle
        expect(handle).not.toBe(0n)
        expect(activeImageHandles.has(handle)).toBe(true)
      })()

      // Force GC in Bun to trigger FinalizationRegistry
      Bun.gc(true)
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(activeImageHandles.has(handle!)).toBe(false)
      expect(_handleUnregisterTokens.has(handle!)).toBe(false)
    } finally {
      vexartCompositeTargetDestroy(vctx, target)
    }
  })

  test("tracks handles in activeImageHandles for backdrop and mask operations", () => {
    const target = vexartCompositeTargetCreate(vctx, 16, 16)
    expect(target).not.toBe(0n)

    try {
      const sourceImg = copyGpuTargetRegionToImage(vctx, target, { x: 0, y: 0, width: 16, height: 16 })
      const srcHandle = sourceImg.handle
      expect(activeImageHandles.has(srcHandle)).toBe(true)

      // 1. Backdrop filter
      const filtered = vexartCompositeImageFilterBackdrop(vctx, srcHandle, {
        blur: 2,
        brightness: null,
        contrast: null,
        saturate: null,
        grayscale: null,
        invert: null,
        sepia: null,
        hueRotate: null,
      })
      if (filtered !== 0n) {
        expect(activeImageHandles.has(filtered)).toBe(true)
        vexartRemoveImage(vctx, filtered)
        expect(activeImageHandles.has(filtered)).toBe(false)
      }

      // 2. Mask rounded rect
      const rectBuf = new Float32Array(10)
      const masked = vexartCompositeImageMaskRoundedRect(vctx, srcHandle, rectBuf)
      if (masked !== 0n) {
        expect(activeImageHandles.has(masked)).toBe(true)
        vexartRemoveImage(vctx, masked)
        expect(activeImageHandles.has(masked)).toBe(false)
      }

      // 3. Mask rounded rect region
      const regionMasked = vexartCompositeImageMaskRoundedRectRegion(vctx, srcHandle, rectBuf)
      if (regionMasked !== 0n) {
        expect(activeImageHandles.has(regionMasked)).toBe(true)
        vexartRemoveImage(vctx, regionMasked)
        expect(activeImageHandles.has(regionMasked)).toBe(false)
      }

      sourceImg.dispose()
      expect(activeImageHandles.has(srcHandle)).toBe(false)
    } finally {
      vexartCompositeTargetDestroy(vctx, target)
    }
  })
})
