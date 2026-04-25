import { describe, expect, test } from "bun:test"
import { createWindowManager, LIGHTCODE_RESIZE_EDGE, LIGHTCODE_WINDOW_STATUS, type LightcodeWindowInput } from "./window-manager"

const desktop = { width: 1200, height: 800, inset: 16 }

function windows(): LightcodeWindowInput[] {
  return [
    {
      id: "memory",
      title: "Memory",
      rect: { x: 60, y: 420, width: 320, height: 180 },
      zIndex: 100,
    },
    {
      id: "editor",
      title: "Compute Shader Pipeline",
      rect: { x: 520, y: 180, width: 520, height: 300 },
      zIndex: 101,
    },
  ]
}

describe("createWindowManager", () => {
  test("focus raises the selected window and marks it active", () => {
    const manager = createWindowManager({ windows: windows(), desktop })

    manager.focus("memory")

    const memory = manager.windows().find((window) => window.id === "memory")
    const editor = manager.windows().find((window) => window.id === "editor")

    expect(manager.activeId()).toBe("memory")
    expect(memory?.active).toBe(true)
    expect(editor?.active).toBe(false)
    expect(memory!.zIndex).toBeGreaterThan(editor!.zIndex)
  })

  test("close removes a window from visible desktop snapshots", () => {
    const manager = createWindowManager({ windows: windows(), desktop })

    manager.close("editor")

    const editor = manager.windows().find((window) => window.id === "editor")

    expect(editor?.status).toBe(LIGHTCODE_WINDOW_STATUS.CLOSED)
    expect(manager.visibleWindows().map((window) => window.id)).toEqual(["memory"])
  })

  test("minimize hides a window but preserves restore rect", () => {
    const manager = createWindowManager({ windows: windows(), desktop })
    const before = manager.windows().find((window) => window.id === "editor")!.restoreRect

    manager.minimize("editor")

    const editor = manager.windows().find((window) => window.id === "editor")!

    expect(editor.status).toBe(LIGHTCODE_WINDOW_STATUS.MINIMIZED)
    expect(editor.restoreRect).toEqual(before)
    expect(manager.visibleWindows().map((window) => window.id)).toEqual(["memory"])
    expect(manager.minimizedWindows().map((window) => window.id)).toEqual(["editor"])
  })

  test("focus restores a minimized window from the dock", () => {
    const manager = createWindowManager({ windows: windows(), desktop })

    manager.minimize("editor")
    manager.focus("editor")
    const editor = manager.windows().find((window) => window.id === "editor")!

    expect(editor.status).toBe(LIGHTCODE_WINDOW_STATUS.NORMAL)
    expect(editor.active).toBe(true)
    expect(manager.visibleWindows().map((window) => window.id)).toEqual(["memory", "editor"])
    expect(manager.minimizedWindows()).toEqual([])
  })

  test("minimize active window focuses the next topmost visible window", () => {
    const manager = createWindowManager({ windows: windows(), desktop })

    manager.focus("editor")
    manager.minimize("editor")

    expect(manager.activeId()).toBe("memory")
    expect(manager.windows().find((window) => window.id === "memory")?.active).toBe(true)
  })

  test("close active window focuses the next topmost visible window", () => {
    const manager = createWindowManager({ windows: windows(), desktop })

    manager.focus("editor")
    manager.close("editor")

    expect(manager.activeId()).toBe("memory")
    expect(manager.windows().find((window) => window.id === "memory")?.active).toBe(true)
  })

  test("dock restore of maximized window returns to normal bounds", () => {
    const manager = createWindowManager({ windows: windows(), desktop })
    const before = manager.windows().find((window) => window.id === "editor")!.rect

    manager.maximize("editor")
    manager.minimize("editor")
    manager.focus("editor")
    const editor = manager.windows().find((window) => window.id === "editor")!

    expect(editor.status).toBe(LIGHTCODE_WINDOW_STATUS.NORMAL)
    expect(editor.rect).toEqual(before)
  })

  test("maximize and restore preserve previous bounds", () => {
    const manager = createWindowManager({ windows: windows(), desktop })
    const before = manager.windows().find((window) => window.id === "editor")!.rect

    manager.maximize("editor")
    const maximized = manager.windows().find((window) => window.id === "editor")!

    expect(maximized.status).toBe(LIGHTCODE_WINDOW_STATUS.MAXIMIZED)
    expect(maximized.rect).toEqual({ x: 16, y: 16, width: 1168, height: 768 })

    manager.restore("editor")
    const restored = manager.windows().find((window) => window.id === "editor")!

    expect(restored.status).toBe(LIGHTCODE_WINDOW_STATUS.NORMAL)
    expect(restored.rect).toEqual(before)
  })

  test("move updates normal rect and clamps minimum size", () => {
    const manager = createWindowManager({ windows: windows(), desktop })

    manager.move("memory", { x: 10.4, y: 20.6, width: 10, height: 12 })
    const memory = manager.windows().find((window) => window.id === "memory")!

    expect(memory.rect).toEqual({ x: 10, y: 21, width: 220, height: 120 })
    expect(memory.restoreRect).toEqual(memory.rect)
  })

  test("resize updates dimensions and clamps minimum size", () => {
    const manager = createWindowManager({ windows: windows(), desktop })

    manager.resize("memory", { x: 60, y: 420, width: 180, height: 90 })
    const memory = manager.windows().find((window) => window.id === "memory")!

    expect(memory.rect).toEqual({ x: 60, y: 420, width: 220, height: 120 })
    expect(memory.restoreRect).toEqual(memory.rect)
  })

  test("resizeBy applies edge-specific deltas", () => {
    const manager = createWindowManager({ windows: windows(), desktop })

    manager.resizeBy("editor", LIGHTCODE_RESIZE_EDGE.RIGHT, 40, 90)
    manager.resizeBy("editor", LIGHTCODE_RESIZE_EDGE.BOTTOM, 30, 50)
    manager.resizeBy("editor", LIGHTCODE_RESIZE_EDGE.CORNER, 10, 20)
    const editor = manager.windows().find((window) => window.id === "editor")!

    expect(editor.rect).toEqual({ x: 520, y: 180, width: 570, height: 370 })
  })

  test("resize ignores maximized windows", () => {
    const manager = createWindowManager({ windows: windows(), desktop })

    manager.maximize("editor")
    manager.resizeBy("editor", LIGHTCODE_RESIZE_EDGE.CORNER, -900, -900)
    const editor = manager.windows().find((window) => window.id === "editor")!

    expect(editor.rect).toEqual({ x: 16, y: 16, width: 1168, height: 768 })
  })

  test("move and resize ignore minimized windows", () => {
    const manager = createWindowManager({ windows: windows(), desktop })
    const before = manager.windows().find((window) => window.id === "editor")!.rect

    manager.minimize("editor")
    manager.move("editor", { x: 0, y: 0, width: 999, height: 999 })
    manager.resize("editor", { x: 0, y: 0, width: 999, height: 999 })
    manager.focus("editor")

    expect(manager.windows().find((window) => window.id === "editor")?.rect).toEqual(before)
  })

  test("initial maximized windows compute desktop bounds and restore input bounds", () => {
    const manager = createWindowManager({
      desktop,
      windows: [{
        id: "editor",
        title: "Editor",
        rect: { x: 20, y: 30, width: 400, height: 240 },
        status: LIGHTCODE_WINDOW_STATUS.MAXIMIZED,
      }],
    })
    const editor = manager.windows()[0]!

    expect(editor.rect).toEqual({ x: 16, y: 16, width: 1168, height: 768 })
    manager.restore("editor")
    expect(manager.windows()[0]?.rect).toEqual({ x: 20, y: 30, width: 400, height: 240 })
  })

  test("focus keeps window z-index below chrome band after repeated activation", () => {
    const manager = createWindowManager({ windows: windows(), desktop })

    for (let i = 0; i < 10_000; i++) manager.focus(i % 2 === 0 ? "editor" : "memory")

    const maxZ = Math.max(...manager.windows().map((window) => window.zIndex))
    expect(maxZ).toBeLessThan(9_500)
  })
})
