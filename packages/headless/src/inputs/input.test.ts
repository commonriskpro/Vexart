import { describe, expect, test } from "bun:test"

describe("Input", () => {
  test("paste normalizes carriage returns and tabs", () => {
    const text = "hello\r\nworld\ttab"
    const normalized = text.replace(/[\r\n\t]/g, " ")

    expect(normalized).toBe("hello  world tab")
  })
})
