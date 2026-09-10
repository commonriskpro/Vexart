import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { Dialog } from "./dialog"

describe("Dialog", () => {
  test("exposes the documented overlay composition", () => {
    expect(Dialog).toBeFunction()
    expect(Dialog.Overlay).toBeFunction()
    expect(Dialog.Content).toBeFunction()
    expect(Dialog.Close).toBeFunction()
  })

  test("unmounts cleanly and pops focus scope without error", () => {
    createRoot((dispose) => {
      Dialog({
        onClose: () => {},
        children: null,
      })
      dispose()
    })
  })
})
