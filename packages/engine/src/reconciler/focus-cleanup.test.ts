import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { focusedId, resetFocus, useFocus } from "./focus"

afterEach(() => resetFocus())
beforeEach(() => resetFocus())

describe("useFocus cleanup", () => {
  test("focus entry is unregistered on disposal", () => {
    createRoot((dispose) => {
      const handle = useFocus({ id: "test-focus" })

      expect(handle.id).toBe("test-focus")
      expect(focusedId()).toBe("test-focus")

      dispose()
    })

    createRoot((dispose) => {
      const handle = useFocus({ id: "new-focus" })

      expect(handle.id).toBe("new-focus")
      expect(focusedId()).toBe("new-focus")

      dispose()
    })
  })
})
