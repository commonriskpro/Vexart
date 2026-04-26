import { describe, expect, test } from "bun:test"

describe("VirtualList windowing", () => {
  test("startIndex and endIndex calculate correct window", () => {
    const itemHeight = 20
    const height = 100
    const overscan = 2
    const totalItems = 1000
    const viewportItems = Math.ceil(height / itemHeight)

    const scrollPos = 0
    const startIndex = Math.max(0, Math.floor(scrollPos / itemHeight) - overscan)
    const endIndex = Math.min(totalItems, Math.floor(scrollPos / itemHeight) + viewportItems + overscan)

    expect(startIndex).toBe(0)
    expect(endIndex).toBe(7)

    const scrollPos2 = 500
    const startIndex2 = Math.max(0, Math.floor(scrollPos2 / itemHeight) - overscan)
    const endIndex2 = Math.min(totalItems, Math.floor(scrollPos2 / itemHeight) + viewportItems + overscan)

    expect(startIndex2).toBe(23)
    expect(endIndex2).toBe(32)
  })
})
