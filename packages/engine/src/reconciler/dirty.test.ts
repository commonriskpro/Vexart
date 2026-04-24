import { describe, expect, test } from "bun:test"
import { createDirtyTracker } from "./dirty"

describe("dirty tracker", () => {
  test("conditional clear preserves dirty marks created during a frame", () => {
    const tracker = createDirtyTracker()

    tracker.markDirty()
    const frameVersion = tracker.dirtyVersion()
    tracker.markDirty()
    tracker.clearDirty(frameVersion)

    expect(tracker.isDirty()).toBe(true)
  })

  test("conditional clear clears when version did not change", () => {
    const tracker = createDirtyTracker()

    tracker.markDirty()
    const frameVersion = tracker.dirtyVersion()
    tracker.clearDirty(frameVersion)

    expect(tracker.isDirty()).toBe(false)
  })
})
