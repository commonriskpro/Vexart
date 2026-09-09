import { describe, expect, it } from "bun:test"
import { layoutText, measureForLayout } from "./text-layout"
import {
  createGridTextIntrinsicMeasure,
  getGridTextIntrinsicMeasureStats,
} from "./grid-text-intrinsics"

describe("Grid text intrinsic callback", () => {
  it("reports normal character, keep-all token, and unwrapped max-content widths", () => {
    const normal = createGridTextIntrinsicMeasure({ text: "aa aaaa", fontId: 0, fontSize: 14, lineHeight: 17, wordBreak: "normal" })
    const keepAll = createGridTextIntrinsicMeasure({ text: "aa aaaa", fontId: 0, fontSize: 14, lineHeight: 17, wordBreak: "keep-all" })
    const character = measureForLayout("a", 0, 14).width
    const token = measureForLayout("aaaa", 0, 14).width
    const full = measureForLayout("aa aaaa", 0, 14).width

    const normalColumns = normal("columns", undefined)
    const keepAllColumns = keepAll("columns", undefined)
    expect(normalColumns.minContent).toBe(character)
    expect(keepAllColumns.minContent).toBe(token)
    expect(normalColumns.maxContent).toBe(full)
    expect(keepAllColumns.maxContent).toBe(full)
    expect(normalColumns.preferred).toBe(full)
  })

  it("passes the resolved inline width to rows and preserves real lineHeight", () => {
    const fontSize = 14
    const lineHeight = 17
    const text = "aaaaaa"
    const unit = measureForLayout("a", 0, fontSize).width
    const width = unit * 3
    const normal = createGridTextIntrinsicMeasure({ text, fontId: 0, fontSize, lineHeight, wordBreak: "normal" })
    const keepAll = createGridTextIntrinsicMeasure({ text, fontId: 0, fontSize, lineHeight, wordBreak: "keep-all" })

    const normalRows = normal("rows", width)
    const keepAllRows = keepAll("rows", width)
    const expected = layoutText(text, 0, width, lineHeight, fontSize, { wordBreak: "normal" }).height
    expect(normalRows.preferred).toBe(expected)
    expect(normalRows.preferred).toBeGreaterThan(keepAllRows.preferred)
    expect(normalRows.preferred % lineHeight).toBe(0)
    expect(keepAllRows.preferred).toBe(lineHeight)
  })

  it("keeps the existing unconstrained branch for undefined, Infinity, and non-positive widths", () => {
    const text = "one two three"
    const callback = createGridTextIntrinsicMeasure({ text, fontId: 0, fontSize: 14, lineHeight: 19 })
    const natural = measureForLayout(text, 0, 14).height

    for (const width of [undefined, Infinity, 0, -1] as Array<number | undefined>) {
      expect(callback("rows", width).preferred).toBe(natural)
    }
  })

  it("normalizes whitespace before max-content and keeps pre-wrap line widths", () => {
    const normal = createGridTextIntrinsicMeasure({ text: "one  \n two", fontId: 0, fontSize: 14, whiteSpace: "normal" })
    const preWrap = createGridTextIntrinsicMeasure({ text: "one  \n two", fontId: 0, fontSize: 14, whiteSpace: "pre-wrap" })
    const normalExpected = measureForLayout("one two", 0, 14).width
    const preWrapExpected = Math.max(measureForLayout("one  ", 0, 14).width, measureForLayout(" two", 0, 14).width)

    expect(normal("columns", undefined).maxContent).toBe(normalExpected)
    expect(preWrap("columns", undefined).maxContent).toBe(preWrapExpected)
  })

  it("caches each axis/width independently and invalidates rows when width changes", () => {
    const callback = createGridTextIntrinsicMeasure({ text: "aaaaaa", fontId: 0, fontSize: 14 })
    callback("columns", undefined)
    callback("columns", undefined)
    callback("rows", 30)
    callback("rows", 30)
    callback("rows", 40)
    const stats = getGridTextIntrinsicMeasureStats(callback)

    expect(stats.misses).toBe(3)
    expect(stats.hits).toBe(2)
    const second = createGridTextIntrinsicMeasure({ text: "aaaaaa", fontId: 0, fontSize: 14 })
    second("rows", 30)
    expect(getGridTextIntrinsicMeasureStats(second).misses).toBe(1)
    expect(getGridTextIntrinsicMeasureStats(callback).misses).toBe(3)
  })
})
