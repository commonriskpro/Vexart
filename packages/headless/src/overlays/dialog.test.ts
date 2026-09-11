import { beforeEach, describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import {
  createComponent,
  focusedId,
  resetFocus,
  setFocusedId,
  useFocus,
} from "@vexart/engine"
import { Dialog } from "./dialog"

describe("Dialog", () => {
  beforeEach(() => {
    resetFocus()
  })

  test("exposes the documented overlay composition", () => {
    expect(Dialog).toBeFunction()
    expect(Dialog.Overlay).toBeFunction()
    expect(Dialog.Content).toBeFunction()
    expect(Dialog.Close).toBeFunction()
  })

  test("restores focus when dialog closes and previous focus element is still in registry", () => {
    createRoot((disposeApp) => {
      useFocus({ id: "trigger-btn" })
      setFocusedId("trigger-btn")
      expect(focusedId()).toBe("trigger-btn")

      let disposeDialog!: () => void
      createRoot((d) => {
        disposeDialog = d
        createComponent(Dialog as any, {
          children: () => {
            useFocus({ id: "dialog-btn" })
            return null
          },
        })
      })

      expect(focusedId()).toBe("dialog-btn")

      disposeDialog()

      expect(focusedId()).toBe("trigger-btn")
      disposeApp()
    })
  })

  test("safely avoids assigning focus to unmounted trigger element when dialog closes", () => {
    createRoot((disposeApp) => {
      useFocus({ id: "fallback-btn" })

      let disposeTrigger!: () => void
      createRoot((d) => {
        disposeTrigger = d
        useFocus({ id: "trigger-btn" })
      })

      setFocusedId("trigger-btn")
      expect(focusedId()).toBe("trigger-btn")

      let disposeDialog!: () => void
      createRoot((d) => {
        disposeDialog = d
        createComponent(Dialog as any, {
          children: () => {
            useFocus({ id: "dialog-btn" })
            return null
          },
        })
      })

      expect(focusedId()).toBe("dialog-btn")

      // Trigger button is unmounted while dialog is open
      disposeTrigger()

      // Close dialog
      disposeDialog()

      // Focus should safely fall back to another registered element instead of dead focus ID
      expect(focusedId()).not.toBe("trigger-btn")
      expect(focusedId()).toBe("fallback-btn")

      disposeApp()
    })
  })

  test("safely keeps focus null when previous focus element is unmounted and no elements remain", () => {
    let disposeTrigger!: () => void
    createRoot((d) => {
      disposeTrigger = d
      useFocus({ id: "trigger-btn" })
    })

    setFocusedId("trigger-btn")
    expect(focusedId()).toBe("trigger-btn")

    let disposeDialog!: () => void
    createRoot((d) => {
      disposeDialog = d
      createComponent(Dialog as any, {})
    })

    disposeTrigger()
    disposeDialog()

    expect(focusedId()).toBeNull()
    expect(focusedId()).not.toBe("trigger-btn")
  })
})
