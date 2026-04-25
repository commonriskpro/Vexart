import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { runOpenCodeCosmicShellSelfTests } from "./app"
import { OPENCODE_WINDOW_ID, createOpenCodeShellWindows, createOpenCodeWindowManager } from "./window-manager"

test("opencode cosmic shell model is internally consistent", () => {
  const result = runOpenCodeCosmicShellSelfTests()
  expect(result.errors).toEqual([])
  expect(result.passed).toBe(true)
})

test("opencode shell window plan hides unavailable responsive surfaces", () => {
  const windows = createOpenCodeShellWindows({ width: 980, height: 720, railVisible: false, novaVisible: false, overlayVisible: false })
  const visible = windows.filter((window) => window.visible !== false).map((window) => window.id)

  expect(visible).toContain(OPENCODE_WINDOW_ID.BACKGROUND)
  expect(visible).toContain(OPENCODE_WINDOW_ID.EDITOR)
  expect(visible).toContain(OPENCODE_WINDOW_ID.DOCK)
  expect(visible).not.toContain(OPENCODE_WINDOW_ID.RAIL)
  expect(visible).not.toContain(OPENCODE_WINDOW_ID.NOVA)
  expect(visible).not.toContain(OPENCODE_WINDOW_ID.OVERLAY)
})

test("opencode shell window manager exposes only visible layers for rendering", () => {
  createRoot((dispose) => {
    const manager = createOpenCodeWindowManager(() => createOpenCodeShellWindows({ width: 1512, height: 756, railVisible: true, novaVisible: true, overlayVisible: false }))

    expect(manager.visibleWindow(OPENCODE_WINDOW_ID.EDITOR)?.focusable).toBe(true)
    expect(manager.visibleWindow(OPENCODE_WINDOW_ID.OVERLAY)).toBe(null)
    expect(manager.visibleWindow(OPENCODE_WINDOW_ID.BACKGROUND)?.focusable).toBe(false)

    manager.focus(OPENCODE_WINDOW_ID.NOVA)
    expect(manager.activeId()).toBe(OPENCODE_WINDOW_ID.NOVA)
    expect((manager.visibleWindow(OPENCODE_WINDOW_ID.NOVA)?.zIndex ?? 0) > (manager.visibleWindow(OPENCODE_WINDOW_ID.EDITOR)?.zIndex ?? 0)).toBe(true)

    dispose()
  })
})
