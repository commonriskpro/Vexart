import { describe, expect, test } from "bun:test"
import { Dialog } from "./dialog"

describe("Dialog", () => {
  test("exposes the documented overlay composition", () => {
    expect(Dialog).toBeFunction()
    expect(Dialog.Overlay).toBeFunction()
    expect(Dialog.Content).toBeFunction()
    expect(Dialog.Close).toBeFunction()
  })
})
