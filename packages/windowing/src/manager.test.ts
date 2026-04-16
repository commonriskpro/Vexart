import { describe, expect, test } from "bun:test"
import { createWindowManager } from "./manager"
import { WINDOW_PLACEMENT, WINDOW_STATUS } from "./types"

function createWorkspace() {
  return {
    x: 0,
    y: 0,
    width: 1280,
    height: 720,
  }
}

describe("createWindowManager", () => {
  test("opens windows in order and focuses the latest visible window", () => {
    const manager = createWindowManager()

    manager.openWindow({
      id: "explorer",
      kind: "explorer",
      title: "Explorer",
      bounds: { x: 10, y: 20, width: 400, height: 300 },
    })
    manager.openWindow({
      id: "editor",
      kind: "editor",
      title: "Editor",
      bounds: { x: 50, y: 60, width: 500, height: 320 },
    })

    const state = manager.getState()

    expect(state.order).toEqual(["explorer", "editor"])
    expect(state.focusedWindowId).toBe("editor")
    expect(state.windowsById.explorer.zIndex).toBe(100)
    expect(state.windowsById.editor.zIndex).toBe(101)
    expect(state.windowsById.editor.focused).toBe(true)
  })

  test("bringToFront keeps focus unchanged but reorders stacking", () => {
    const manager = createWindowManager({
      initialWindows: [
        {
          id: "a",
          kind: "panel",
          title: "A",
          bounds: { x: 0, y: 0, width: 100, height: 100 },
        },
        {
          id: "b",
          kind: "panel",
          title: "B",
          bounds: { x: 10, y: 10, width: 100, height: 100 },
        },
      ],
    })

    manager.bringToFront("a")

    const state = manager.getState()

    expect(state.order).toEqual(["b", "a"])
    expect(state.focusedWindowId).toBe("b")
    expect(state.windowsById.a.zIndex).toBe(101)
  })

  test("focusWindow brings the target to front and marks it focused", () => {
    const manager = createWindowManager({
      initialWindows: [
        {
          id: "left",
          kind: "panel",
          title: "Left",
          bounds: { x: 0, y: 0, width: 100, height: 100 },
        },
        {
          id: "right",
          kind: "panel",
          title: "Right",
          bounds: { x: 10, y: 10, width: 100, height: 100 },
        },
      ],
    })

    manager.focusWindow("left")

    const state = manager.getState()

    expect(state.order).toEqual(["right", "left"])
    expect(state.focusedWindowId).toBe("left")
    expect(state.windowsById.left.focused).toBe(true)
    expect(state.windowsById.right.focused).toBe(false)
  })

  test("move and resize respect capabilities and constraints", () => {
    const manager = createWindowManager({
      initialWindows: [
        {
          id: "locked",
          kind: "panel",
          title: "Locked",
          bounds: { x: 10, y: 10, width: 300, height: 200 },
          capabilities: { movable: false },
          constraints: { minWidth: 250, maxWidth: 400, minHeight: 180, maxHeight: 260 },
        },
      ],
    })

    manager.moveWindow("locked", { x: 500, y: 600 })
    manager.resizeWindow("locked", { width: 900, height: 100 })

    const locked = manager.getWindow("locked")

    expect(locked?.bounds.x).toBe(10)
    expect(locked?.bounds.y).toBe(10)
    expect(locked?.bounds.width).toBe(400)
    expect(locked?.bounds.height).toBe(180)
  })

  test("minimizing the focused window moves focus to the next visible one", () => {
    const manager = createWindowManager({
      initialWindows: [
        {
          id: "first",
          kind: "panel",
          title: "First",
          bounds: { x: 0, y: 0, width: 100, height: 100 },
        },
        {
          id: "second",
          kind: "panel",
          title: "Second",
          bounds: { x: 20, y: 20, width: 100, height: 100 },
        },
      ],
    })

    manager.minimizeWindow("second")

    const state = manager.getState()

    expect(state.focusedWindowId).toBe("first")
    expect(state.windowsById.second.status).toBe(WINDOW_STATUS.MINIMIZED)
    expect(state.windowsById.second.restorePlacement).toBe(WINDOW_PLACEMENT.NORMAL)
  })

  test("maximize stores restore bounds and restore returns to normal geometry", () => {
    const manager = createWindowManager({
      initialWindows: [
        {
          id: "editor",
          kind: "editor",
          title: "Editor",
          bounds: { x: 40, y: 50, width: 640, height: 480 },
        },
      ],
    })

    manager.maximizeWindow("editor", createWorkspace())

    const maximized = manager.getWindow("editor")

    expect(maximized?.status).toBe(WINDOW_STATUS.MAXIMIZED)
    expect(maximized?.restoreBounds).toEqual({ x: 40, y: 50, width: 640, height: 480 })
    expect(maximized?.bounds).toEqual(createWorkspace())

    manager.restoreWindow("editor")

    const restored = manager.getWindow("editor")

    expect(restored?.status).toBe(WINDOW_STATUS.NORMAL)
    expect(restored?.bounds).toEqual({ x: 40, y: 50, width: 640, height: 480 })
    expect(restored?.restoreBounds).toBeUndefined()
  })

  test("minimize after maximize restores back to maximized state", () => {
    const manager = createWindowManager({
      initialWindows: [
        {
          id: "preview",
          kind: "preview",
          title: "Preview",
          bounds: { x: 30, y: 30, width: 500, height: 400 },
        },
      ],
    })

    manager.maximizeWindow("preview", createWorkspace())
    manager.minimizeWindow("preview")

    const minimized = manager.getWindow("preview")

    expect(minimized?.status).toBe(WINDOW_STATUS.MINIMIZED)
    expect(minimized?.restorePlacement).toBe(WINDOW_PLACEMENT.MAXIMIZED)

    manager.restoreWindow("preview")

    const restored = manager.getWindow("preview")

    expect(restored?.status).toBe(WINDOW_STATUS.MAXIMIZED)
    expect(restored?.bounds).toEqual(createWorkspace())
  })

  test("close removes the window and recalculates focus", () => {
    const manager = createWindowManager({
      initialWindows: [
        {
          id: "alpha",
          kind: "panel",
          title: "Alpha",
          bounds: { x: 0, y: 0, width: 100, height: 100 },
        },
        {
          id: "beta",
          kind: "panel",
          title: "Beta",
          bounds: { x: 20, y: 20, width: 100, height: 100 },
        },
      ],
    })

    manager.closeWindow("beta")

    const state = manager.getState()

    expect(state.order).toEqual(["alpha"])
    expect(state.focusedWindowId).toBe("alpha")
    expect(state.windowsById.beta).toBeUndefined()
  })

  test("subscribe receives immutable snapshots on every commit", () => {
    const manager = createWindowManager()
    const snapshots: string[] = []
    const unsubscribe = manager.subscribe((state) => {
      snapshots.push(state.order.join(","))
      if (state.order.length > 0) {
        state.order[0] = "mutated"
      }
    })

    manager.openWindow({
      id: "one",
      kind: "panel",
      title: "One",
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    })
    manager.openWindow({
      id: "two",
      kind: "panel",
      title: "Two",
      bounds: { x: 10, y: 10, width: 100, height: 100 },
    })
    unsubscribe()

    expect(snapshots).toEqual(["one", "one,two"])
    expect(manager.getState().order).toEqual(["one", "two"])
  })

  test("opening a duplicate window id throws", () => {
    const manager = createWindowManager()

    manager.openWindow({
      id: "dup",
      kind: "panel",
      title: "Dup",
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    })

    expect(() => manager.openWindow({
      id: "dup",
      kind: "panel",
      title: "Dup again",
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    })).toThrow("Window 'dup' already exists")
  })
})
