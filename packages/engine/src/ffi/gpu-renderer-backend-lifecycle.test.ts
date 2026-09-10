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
