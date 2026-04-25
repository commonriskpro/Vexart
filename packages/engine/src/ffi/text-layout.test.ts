import { describe, expect, test } from "bun:test"
import { layoutText, measureForClay } from "./text-layout"

describe("text layout metrics", () => {
  test("built-in font measurement scales with fontSize", () => {
    const small = measureForClay("Lightcode", 0, 10)
    const large = measureForClay("Lightcode", 0, 20)

    expect(large.width).toBeGreaterThan(small.width)
    expect(large.height).toBeGreaterThan(small.height)
  })

  test("built-in text wrapping uses scaled advance", () => {
    const text = "compute shader pipeline"
    const small = layoutText(text, 0, 90, 12, 10)
    const large = layoutText(text, 0, 90, 24, 20)

    expect(large.lineCount).toBeGreaterThanOrEqual(small.lineCount)
    expect(large.height).toBeGreaterThan(small.height)
  })
})
