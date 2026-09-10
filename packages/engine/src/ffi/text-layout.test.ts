import { describe, expect, test } from "bun:test"
import {
  layoutText,
  measureForLayout,
  measureTextConstrained,
  registerFont,
  unregisterFont,
  clearFontRegistry,
  getFont,
  getTextLayoutCacheStats,
} from "./text-layout"

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

describe("font registry lifecycle", () => {
  test("unregisterFont rejects id 0", () => {
    expect(unregisterFont(0)).toBe(false)
    expect(getFont(0)).toEqual({ family: "sans-serif", size: 14 })
  })

  test("unregisterFont removes registered font and invalidates text cache", () => {
    registerFont(42, { family: "monospace", size: 18 })
    expect(getFont(42).family).toBe("monospace")

    // Populate layout cache
    layoutText("hello font lifecycle", 42, 200, 20, 18)
    expect(getTextLayoutCacheStats().layoutCount).toBeGreaterThan(0)

    const removed = unregisterFont(42)
    expect(removed).toBe(true)
    // Cache was cleared on unregister
    expect(getTextLayoutCacheStats().layoutCount).toBe(0)
    // Fallback to default font (sans-serif 14)
    expect(getFont(42)).toEqual({ family: "sans-serif", size: 14 })

    // Second unregister returns false
    expect(unregisterFont(42)).toBe(false)
  })

  test("clearFontRegistry resets all fonts to default and clears cache", () => {
    registerFont(10, { family: "serif", size: 16 })
    registerFont(11, { family: "sans-serif", size: 20 })
    layoutText("cached line", 10, 200, 20, 16)

    clearFontRegistry()

    expect(getFont(0)).toEqual({ family: "sans-serif", size: 14 })
    expect(getFont(10)).toEqual({ family: "sans-serif", size: 14 })
    expect(getFont(11)).toEqual({ family: "sans-serif", size: 14 })
    expect(getTextLayoutCacheStats().layoutCount).toBe(0)
  })
})
