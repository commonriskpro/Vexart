import { describe, expect, test } from "bun:test"
import { clampWindowPosition, isPointInWindowDragRegion, resolveWindowDragPosition } from "./use-window-drag"

describe("window drag helpers", () => {
  test("clampWindowPosition returns the original position when no workspace exists", () => {
    expect(clampWindowPosition({ x: 220, y: 140 }, { width: 300, height: 200 })).toEqual({ x: 220, y: 140 })
  })

  test("clampWindowPosition clamps the window inside workspace bounds", () => {
    expect(clampWindowPosition(
      { x: -50, y: 900 },
      { width: 400, height: 300 },
      { x: 0, y: 0, width: 1280, height: 720 },
    )).toEqual({ x: 0, y: 420 })
  })

  test("clampWindowPosition pins oversized windows to the workspace origin", () => {
    expect(clampWindowPosition(
      { x: 100, y: 200 },
      { width: 900, height: 700 },
      { x: 40, y: 50, width: 500, height: 300 },
    )).toEqual({ x: 40, y: 50 })
  })

  test("resolveWindowDragPosition keeps the original anchor and clamps the result", () => {
    expect(resolveWindowDragPosition(
      { x: 480, y: 330 },
      { pointerX: 32, pointerY: 18 },
      { x: 100, y: 120, width: 260, height: 180 },
      { x: 0, y: 0, width: 640, height: 360 },
    )).toEqual({ x: 380, y: 180 })
  })

  test("isPointInWindowDragRegion respects insets and header height", () => {
    expect(isPointInWindowDragRegion(
      { nodeX: 40, nodeY: 20, width: 360 },
      { topInset: 12, height: 30, leftInset: 12, rightInset: 76 },
    )).toBe(true)

    expect(isPointInWindowDragRegion(
      { nodeX: 350, nodeY: 20, width: 360 },
      { topInset: 12, height: 30, leftInset: 12, rightInset: 76 },
    )).toBe(false)
  })
})
