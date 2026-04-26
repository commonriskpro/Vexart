import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createForm } from "./form"

describe("Form dirty check", () => {
  test("structural equality for objects", () => createRoot((dispose) => {
    const initial = { a: 1, b: 2 }
    const same = { a: 1, b: 2 }
    const different = { a: 1, b: 3 }

    expect(initial === same).toBe(false)
    expect(JSON.stringify(initial) === JSON.stringify(same)).toBe(true)
    expect(JSON.stringify(initial) === JSON.stringify(different)).toBe(false)

    const form = createForm({
      initialValues: { value: initial },
      onSubmit: () => {},
    })

    form.setValue("value", same)
    expect(form.dirty.value()).toBe(false)

    form.setValue("value", different)
    expect(form.dirty.value()).toBe(true)

    dispose()
  }))
})
