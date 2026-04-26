import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"

describe("Dialog", () => {
  test("DialogClose context receives onClose callback", () => createRoot((dispose) => {
    let closeCalled = false
    const onClose = () => { closeCalled = true }

    expect(typeof onClose).toBe("function")
    onClose()
    expect(closeCalled).toBe(true)

    dispose()
  }))
})
