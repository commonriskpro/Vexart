import { describe, expect, test } from "bun:test"
import { resolveDesktopBounds, resolveDesktopWorkspace, resolveTaskbarBounds } from "./desktop-layout"

describe("desktop layout helpers", () => {
  test("resolveDesktopBounds prefers explicit workspace", () => {
    expect(resolveDesktopBounds({ x: 4, y: 8, width: 900, height: 700 }, 100, 100)).toEqual({
      x: 4,
      y: 8,
      width: 900,
      height: 700,
    })
  })

  test("resolveDesktopBounds falls back to numeric width/height", () => {
    expect(resolveDesktopBounds(undefined, 1280, 720)).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    })
  })

  test("resolveDesktopWorkspace subtracts the taskbar height", () => {
    expect(resolveDesktopWorkspace({ x: 0, y: 0, width: 1000, height: 800 }, 48)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 752,
    })
  })

  test("resolveTaskbarBounds creates a bottom strip", () => {
    expect(resolveTaskbarBounds({ x: 10, y: 20, width: 1400, height: 900 }, 50)).toEqual({
      x: 10,
      y: 870,
      width: 1400,
      height: 50,
    })
  })
})
