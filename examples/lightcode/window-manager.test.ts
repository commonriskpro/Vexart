import { describe, expect, test } from "bun:test"
import {
  createLightcodeOsWindowManager,
  LIGHTCODE_OS_KEYBOARD_MODE,
  LIGHTCODE_OS_POINTER_MODE,
  LIGHTCODE_OS_RESIZE_EDGE,
  LIGHTCODE_OS_SURFACE_KIND,
  LIGHTCODE_OS_SURFACE_LAYER,
  LIGHTCODE_OS_WINDOW_STATE,
  type LightcodeOsWindowInput,
} from "./window-manager"

function fixture(): LightcodeOsWindowInput[] {
  return [
    { id: "a", title: "Editor", subtitle: "main", kind: "editor", rect: { x: 40, y: 70, width: 320, height: 220 } },
    { id: "b", title: "Diff", subtitle: "changes", kind: "diff", rect: { x: 260, y: 110, width: 260, height: 190 } },
    { id: "c", title: "Agent", subtitle: "running", kind: "agent", rect: { x: 420, y: 280, width: 260, height: 190 }, state: LIGHTCODE_OS_WINDOW_STATE.MINIMIZED },
  ]
}

function manager() {
  return createLightcodeOsWindowManager({
    desktop: { width: 900, height: 600, topbarHeight: 56, dockHeight: 56 },
    windows: fixture(),
  })
}

describe("Lightcode OS window manager", () => {
  test("starts with topmost visible window active", () => {
    const os = manager()
    expect(os.activeId()).toBe("b")
    expect(os.visibleWindows().map((window) => window.id)).toEqual(["a", "b"])
    expect(os.minimizedWindows().map((window) => window.id)).toEqual(["c"])
  })

  test("focus raises a window without changing visible membership", () => {
    const os = manager()
    os.focus("a")
    expect(os.activeId()).toBe("a")
    expect(os.visibleWindows().at(-1)?.id).toBe("a")
  })

  test("move clamps normal windows to the desktop work area", () => {
    const os = manager()
    os.moveTo("a", { x: -999, y: -999, width: 320, height: 220 })
    const win = os.windows().find((window) => window.id === "a")!
    expect(win.rect.x).toBeGreaterThanOrEqual(12 - win.rect.width + 88)
    expect(win.rect.y).toBe(66)
  })

  test("resize respects minimum dimensions", () => {
    const os = manager()
    os.resizeTo("a", { x: 40, y: 70, width: 10, height: 10 })
    const win = os.windows().find((window) => window.id === "a")!
    expect(win.rect.width).toBe(240)
    expect(win.rect.height).toBe(150)
  })

  test("resizeBy updates only the requested axis", () => {
    const os = manager()
    os.resizeBy("a", LIGHTCODE_OS_RESIZE_EDGE.RIGHT, 50, 900)
    let win = os.windows().find((window) => window.id === "a")!
    expect(win.rect.width).toBe(370)
    expect(win.rect.height).toBe(220)

    os.resizeBy("a", LIGHTCODE_OS_RESIZE_EDGE.BOTTOM, 900, 30)
    win = os.windows().find((window) => window.id === "a")!
    expect(win.rect.width).toBe(370)
    expect(win.rect.height).toBe(250)
  })

  test("minimize hides a window and restore brings it back active", () => {
    const os = manager()
    os.minimize("b")
    expect(os.visibleWindows().map((window) => window.id)).toEqual(["a"])
    expect(os.minimizedWindows().map((window) => window.id)).toEqual(["b", "c"])

    os.restore("b")
    expect(os.activeId()).toBe("b")
    expect(os.visibleWindows().at(-1)?.id).toBe("b")
  })

  test("normal move updates the restore geometry used after minimize", () => {
    const os = manager()
    os.moveTo("a", { x: 160, y: 150, width: 320, height: 220 })
    const moved = os.windows().find((window) => window.id === "a")!.rect

    os.minimize("a")
    os.restore("a")

    expect(os.windows().find((window) => window.id === "a")?.rect).toEqual(moved)
  })

  test("maximize stores restore rect and toggle restores it", () => {
    const os = manager()
    const before = os.windows().find((window) => window.id === "a")!.rect
    os.toggleMaximize("a")
    let win = os.windows().find((window) => window.id === "a")!
    expect(win.state).toBe(LIGHTCODE_OS_WINDOW_STATE.MAXIMIZED)
    expect(win.rect.width).toBe(876)

    os.toggleMaximize("a")
    win = os.windows().find((window) => window.id === "a")!
    expect(win.state).toBe(LIGHTCODE_OS_WINDOW_STATE.NORMAL)
    expect(win.rect).toEqual(before)
  })

  test("close removes a window from visible and minimized lists", () => {
    const os = manager()
    os.close("b")
    expect(os.visibleWindows().map((window) => window.id)).toEqual(["a"])
    expect(os.minimizedWindows().map((window) => window.id)).toEqual(["c"])
    expect(os.windows().find((window) => window.id === "b")?.state).toBe(LIGHTCODE_OS_WINDOW_STATE.CLOSED)
  })

  test("orders surfaces by semantic layer before local stack index", () => {
    const os = createLightcodeOsWindowManager({
      desktop: { width: 900, height: 600, topbarHeight: 56, dockHeight: 56 },
      windows: [
        { id: "win", title: "Window", subtitle: "main", kind: "editor", rect: { x: 40, y: 70, width: 320, height: 220 } },
        { id: "dialog", title: "Dialog", subtitle: "modal", kind: "agent", surfaceKind: LIGHTCODE_OS_SURFACE_KIND.DIALOG, ownerId: "win", rect: { x: 90, y: 120, width: 260, height: 180 } },
      ],
    })

    os.focus("win")

    expect(os.paintWindows().map((window) => window.id)).toEqual(["win", "dialog"])
    expect(os.windows().find((window) => window.id === "dialog")?.layer).toBe(LIGHTCODE_OS_SURFACE_LAYER.MODAL)
    expect(os.windows().find((window) => window.id === "dialog")!.zIndex).toBeGreaterThan(os.windows().find((window) => window.id === "win")!.zIndex)
  })

  test("hit order is reverse paint order and skips pointer-disabled surfaces", () => {
    const os = createLightcodeOsWindowManager({
      desktop: { width: 900, height: 600, topbarHeight: 56, dockHeight: 56 },
      windows: [
        { id: "win", title: "Window", subtitle: "main", kind: "editor", rect: { x: 40, y: 70, width: 320, height: 220 } },
        { id: "tip", title: "Tip", subtitle: "help", kind: "memory", surfaceKind: LIGHTCODE_OS_SURFACE_KIND.TOOLTIP, pointerMode: LIGHTCODE_OS_POINTER_MODE.NONE, rect: { x: 90, y: 120, width: 260, height: 180 } },
      ],
    })

    expect(os.paintWindows().map((window) => window.id)).toEqual(["win", "tip"])
    expect(os.hitWindows().map((window) => window.id)).toEqual(["win"])
  })

  test("minimize and close cascade to owned surfaces", () => {
    const os = createLightcodeOsWindowManager({
      desktop: { width: 900, height: 600, topbarHeight: 56, dockHeight: 56 },
      windows: [
        { id: "owner", title: "Owner", subtitle: "main", kind: "editor", rect: { x: 40, y: 70, width: 320, height: 220 } },
        { id: "child", title: "Child", subtitle: "dialog", kind: "agent", surfaceKind: LIGHTCODE_OS_SURFACE_KIND.DIALOG, ownerId: "owner", rect: { x: 90, y: 120, width: 260, height: 180 } },
      ],
    })

    os.minimize("owner")
    expect(os.minimizedWindows().map((window) => window.id)).toEqual(["owner", "child"])

    os.restore("owner")
    expect(os.visibleWindows().map((window) => window.id)).toEqual(["owner", "child"])

    os.close("owner")
    expect(os.windows().find((window) => window.id === "child")?.state).toBe(LIGHTCODE_OS_WINDOW_STATE.CLOSED)
  })

  test("tracks active main and keyboard targets separately", () => {
    const os = createLightcodeOsWindowManager({
      desktop: { width: 900, height: 600, topbarHeight: 56, dockHeight: 56 },
      windows: [
        { id: "win", title: "Window", subtitle: "main", kind: "editor", rect: { x: 40, y: 70, width: 320, height: 220 } },
        { id: "hud", title: "Hud", subtitle: "read only", kind: "memory", surfaceKind: LIGHTCODE_OS_SURFACE_KIND.NOTIFICATION, focusable: true, keyboardMode: LIGHTCODE_OS_KEYBOARD_MODE.NONE, rect: { x: 90, y: 120, width: 260, height: 180 } },
      ],
    })

    os.focus("win")
    expect(os.keyboardId()).toBe("win")

    os.focus("hud")
    expect(os.activeId()).toBe("hud")
    expect(os.mainId()).toBe("hud")
    expect(os.keyboardId()).toBe("win")
  })
})
