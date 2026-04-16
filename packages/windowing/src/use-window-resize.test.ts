import { describe, expect, test } from "bun:test"
import {
  WINDOW_RESIZE_EDGE,
  createWindowResizeHandleLayouts,
  resolveWindowResizeBounds,
} from "./use-window-resize"

describe("window resize helpers", () => {
  test("east resize grows width and clamps to max/workspace", () => {
    expect(resolveWindowResizeBounds(
      { x: 700, y: 0 },
      WINDOW_RESIZE_EDGE.EAST,
      {
        pointerX: 500,
        pointerY: 0,
        bounds: { x: 100, y: 120, width: 400, height: 280 },
      },
      { maxWidth: 520 },
      { x: 0, y: 0, width: 1000, height: 800 },
    )).toEqual({ x: 100, y: 120, width: 520, height: 280 })
  })

  test("west resize preserves right edge while enforcing min width", () => {
    expect(resolveWindowResizeBounds(
      { x: 330, y: 0 },
      WINDOW_RESIZE_EDGE.WEST,
      {
        pointerX: 100,
        pointerY: 0,
        bounds: { x: 100, y: 120, width: 300, height: 200 },
      },
      { minWidth: 220 },
      { x: 0, y: 0, width: 1000, height: 800 },
    )).toEqual({ x: 180, y: 120, width: 220, height: 200 })
  })

  test("north-west resize updates origin and size together", () => {
    expect(resolveWindowResizeBounds(
      { x: 60, y: 40 },
      WINDOW_RESIZE_EDGE.NORTH_WEST,
      {
        pointerX: 120,
        pointerY: 80,
        bounds: { x: 120, y: 80, width: 320, height: 240 },
      },
      { minWidth: 180, minHeight: 120 },
      { x: 0, y: 0, width: 900, height: 700 },
    )).toEqual({ x: 60, y: 40, width: 380, height: 280 })
  })

  test("resize is clamped to workspace when dragging beyond viewport", () => {
    expect(resolveWindowResizeBounds(
      { x: -400, y: -400 },
      WINDOW_RESIZE_EDGE.NORTH_WEST,
      {
        pointerX: 200,
        pointerY: 180,
        bounds: { x: 200, y: 180, width: 300, height: 220 },
      },
      undefined,
      { x: 40, y: 50, width: 500, height: 300 },
    )).toEqual({ x: 40, y: 50, width: 460, height: 300 })
  })

  test("createWindowResizeHandleLayouts returns all eight handles", () => {
    const layouts = createWindowResizeHandleLayouts({ x: 0, y: 0, width: 320, height: 240 }, 6, 12)
    expect(layouts).toHaveLength(8)
    expect(layouts[0]).toEqual({ edge: WINDOW_RESIZE_EDGE.NORTH, x: 12, y: 0, width: 296, height: 6 })
    expect(layouts[7]).toEqual({ edge: WINDOW_RESIZE_EDGE.SOUTH_WEST, x: 0, y: 228, width: 12, height: 12 })
  })
})
