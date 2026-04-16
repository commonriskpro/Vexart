import { describe, expect, test } from "bun:test"
import { getTaskbarAction, listTaskbarWindows, TASKBAR_ACTION } from "./taskbar-helpers"
import { WINDOW_STATUS, type WindowDescriptor } from "./types"

function createWindow(partial: Partial<WindowDescriptor>): WindowDescriptor {
  return {
    id: partial.id ?? "w1",
    kind: partial.kind ?? "panel",
    title: partial.title ?? "Window",
    status: partial.status ?? WINDOW_STATUS.NORMAL,
    bounds: partial.bounds ?? { x: 0, y: 0, width: 100, height: 100 },
    restoreBounds: partial.restoreBounds,
    restorePlacement: partial.restorePlacement,
    zIndex: partial.zIndex ?? 100,
    focused: partial.focused ?? false,
    modal: partial.modal ?? false,
    keepAlive: partial.keepAlive ?? false,
    capabilities: partial.capabilities ?? {
      movable: true,
      resizable: true,
      minimizable: true,
      maximizable: true,
      closable: true,
    },
    constraints: partial.constraints ?? {},
  }
}

describe("taskbar helpers", () => {
  test("listTaskbarWindows preserves window ordering", () => {
    const windows = [createWindow({ id: "a" }), createWindow({ id: "b", status: WINDOW_STATUS.MINIMIZED })]
    expect(listTaskbarWindows(windows).map((window) => window.id)).toEqual(["a", "b"])
  })

  test("getTaskbarAction restores minimized windows", () => {
    expect(getTaskbarAction(createWindow({ status: WINDOW_STATUS.MINIMIZED }))).toBe(TASKBAR_ACTION.RESTORE)
  })

  test("getTaskbarAction minimizes the focused active window", () => {
    expect(getTaskbarAction(createWindow({ focused: true }))).toBe(TASKBAR_ACTION.MINIMIZE)
  })

  test("getTaskbarAction focuses inactive visible windows", () => {
    expect(getTaskbarAction(createWindow({ focused: false }))).toBe(TASKBAR_ACTION.FOCUS)
  })
})
