import { describe, expect, test } from "bun:test"
import { createWindowManager } from "./manager"
import { createWindowManagerBindings } from "./context"
import { WINDOW_STATUS } from "./types"

function createWorkspace() {
  return {
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
  }
}

describe("createWindowManagerBindings", () => {
  test("mirrors manager state reactively", () => {
    const manager = createWindowManager()
    const bindings = createWindowManagerBindings(manager)

    manager.openWindow({
      id: "explorer",
      kind: "explorer",
      title: "Explorer",
      bounds: { x: 10, y: 10, width: 400, height: 300 },
    })

    expect(bindings.focusedWindowId()).toBe("explorer")
    expect(bindings.windows().map((window) => window.id)).toEqual(["explorer"])
    expect(bindings.getWindow("explorer")?.title).toBe("Explorer")

    bindings.dispose()
  })

  test("toggleMaximize uses workspace when available", () => {
    const manager = createWindowManager({
      initialWindows: [
        {
          id: "editor",
          kind: "editor",
          title: "Editor",
          bounds: { x: 40, y: 60, width: 800, height: 600 },
        },
      ],
    })
    const bindings = createWindowManagerBindings(manager, createWorkspace())

    bindings.toggleMaximize("editor")

    expect(manager.getWindow("editor")?.status).toBe(WINDOW_STATUS.MAXIMIZED)
    expect(manager.getWindow("editor")?.bounds).toEqual(createWorkspace())

    bindings.toggleMaximize("editor")

    expect(manager.getWindow("editor")?.status).toBe(WINDOW_STATUS.NORMAL)
    expect(manager.getWindow("editor")?.bounds).toEqual({ x: 40, y: 60, width: 800, height: 600 })

    bindings.dispose()
  })

  test("toggleMaximize is a no-op when no workspace exists", () => {
    const manager = createWindowManager({
      initialWindows: [
        {
          id: "preview",
          kind: "preview",
          title: "Preview",
          bounds: { x: 20, y: 20, width: 500, height: 320 },
        },
      ],
    })
    const bindings = createWindowManagerBindings(manager)

    bindings.toggleMaximize("preview")

    expect(manager.getWindow("preview")?.status).toBe(WINDOW_STATUS.NORMAL)

    bindings.dispose()
  })

  test("dispose stops future state synchronization", () => {
    const manager = createWindowManager()
    const bindings = createWindowManagerBindings(manager)

    bindings.dispose()
    manager.openWindow({
      id: "late",
      kind: "panel",
      title: "Late",
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    })

    expect(bindings.windows()).toEqual([])
  })
})
