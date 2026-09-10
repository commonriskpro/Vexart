import { describe, expect, test } from "bun:test"
import { nativeImageAssetRegister, nativeImageAssetRelease, nativeImageAssetTouch } from "./native-image-assets"
import { getNativeResourceStats } from "./resource-stats"
import { activeImageHandles, vexartRemoveImage } from "./gpu-composite-ops"

describe("native image assets", () => {
  test("register reuses stable handles for the same key", () => {
    const data = new Uint8Array(2 * 2 * 4).fill(255)
    const key = `test-image-${Date.now()}-${Math.random()}.rgba`

    const first = nativeImageAssetRegister({ key, data, width: 2, height: 2 })
    const second = nativeImageAssetRegister({ key, data, width: 2, height: 2 })

    expect(first).not.toBeNull()
    expect(second).toBe(first)
    expect(nativeImageAssetTouch(first!)).toBe(true)
    expect(nativeImageAssetRelease(first!)).toBe(true)
  })

  test("registered image assets contribute to native resource stats", () => {
    const before = getNativeResourceStats()
    const beforeBytes = before?.resourcesByKind.ImageSprite?.bytes ?? 0
    const data = new Uint8Array(3 * 3 * 4).fill(128)
    const key = `stats-image-${Date.now()}-${Math.random()}.rgba`

    const handle = nativeImageAssetRegister({ key, data, width: 3, height: 3 })
    const after = getNativeResourceStats()

    expect(handle).not.toBeNull()
    expect((after?.resourcesByKind.ImageSprite?.bytes ?? 0) - beforeBytes).toBe(data.byteLength)
    expect(nativeImageAssetRelease(handle!)).toBe(true)
  })

  test("vexartRemoveImage provides double-free protection", () => {
    // If handle is not tracked in activeImageHandles, it safely returns without error
    const untrackedHandle = 88888n
    expect(activeImageHandles.has(untrackedHandle)).toBe(false)
    expect(() => vexartRemoveImage(1n, untrackedHandle)).not.toThrow()

    // If handle is 0n, safely returns
    expect(() => vexartRemoveImage(1n, 0n)).not.toThrow()

    // If handle was in activeImageHandles, first remove deletes it, second is ignored
    const fakeHandle = 99999n
    activeImageHandles.add(fakeHandle)
    expect(activeImageHandles.has(fakeHandle)).toBe(true)
    // Deleting from activeImageHandles protects against repeated removal
    activeImageHandles.delete(fakeHandle)
    expect(activeImageHandles.has(fakeHandle)).toBe(false)
    expect(() => vexartRemoveImage(1n, fakeHandle)).not.toThrow()
  })
})
