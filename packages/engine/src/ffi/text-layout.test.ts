import { describe, expect, test } from "bun:test"
import { layoutText, measureForLayout, measureTextConstrained } from "./text-layout"

describe("text layout metrics", () => {
  test("built-in font measurement scales with fontSize", () => {
    const small = measureForLayout("Lightcode", 0, 10)
    const large = measureForLayout("Lightcode", 0, 20)

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

  test("normal whitespace collapses while pre-wrap preserves hard breaks", () => {
    const normal = layoutText("one  \n two", 0, 100, 17, 14, { whiteSpace: "normal" })
    const preWrap = layoutText("one  \n two", 0, 100, 17, 14, { whiteSpace: "pre-wrap" })

    expect(normal.lineCount).toBe(1)
    expect(normal.lines[0]?.text).toBe("one two")
    expect(preWrap.lineCount).toBe(2)
    expect(preWrap.lines[0]?.text).toBe("one  ")
    expect(preWrap.lines[1]?.text).toBe(" two")
    expect(measureTextConstrained("one\ntwo", 0, 14, 100, undefined, undefined, undefined, { whiteSpace: "normal" }).height)
      .toBe(17)
    expect(measureTextConstrained("one\ntwo", 0, 14, 100, undefined, undefined, undefined, { whiteSpace: "pre-wrap" }).height)
      .toBe(34)
  })

  test("keep-all leaves an oversized word intact while normal breaks it", () => {
    const normal = layoutText("supercalifragilisticexpialidocious", 0, 50, 17, 14, { wordBreak: "normal" })
    const keepAll = layoutText("supercalifragilisticexpialidocious", 0, 50, 17, 14, { wordBreak: "keep-all" })

    expect(normal.lineCount).toBeGreaterThan(1)
    expect(normal.lines.every(line => line.width <= 50)).toBe(true)
    expect(keepAll.lineCount).toBe(1)
    expect(keepAll.lines[0]?.width).toBeGreaterThan(50)
  })
})
