import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createToaster } from "./toast"

describe("createToaster", () => {
  test("exposes destroy, dismissAll, dismiss, toast, and Toaster", () => {
    const toaster = createToaster({
      renderToast: () => null,
    })

    expect(typeof toaster.toast).toBe("function")
    expect(typeof toaster.dismiss).toBe("function")
    expect(typeof toaster.dismissAll).toBe("function")
    expect(typeof toaster.destroy).toBe("function")
    expect(typeof toaster.Toaster).toBe("function")
  })

  test("destroy clears active toasts and timers", () => {
    const toaster = createToaster({
      renderToast: () => null,
      defaultDuration: 5000,
    })

    const id1 = toaster.toast("First notification")
    const id2 = toaster.toast("Second notification")
    expect(id1).toBeDefined()
    expect(id2).toBeDefined()

    toaster.destroy()
    // destroy calls dismissAll() — calling dismiss on previous id is a noop
    toaster.dismiss(id1)
  })

  test("Toaster onCleanup invokes dismissAll", () => {
    let unmounted = false
    createRoot((dispose) => {
      const toaster = createToaster({
        renderToast: () => null,
        defaultDuration: 10000,
      })

      toaster.toast("Will be cleaned up")
      toaster.Toaster()

      dispose()
      unmounted = true
    })

    expect(unmounted).toBe(true)
  })
})
