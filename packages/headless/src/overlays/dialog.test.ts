import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { Dialog } from "./dialog"
import { dispatchInput, resetFocus } from "@vexart/engine"

type ReactProps = Record<string, unknown>
type ReactType = string | ((props: ReactProps) => unknown)

;(globalThis as typeof globalThis & {
  React?: { createElement: (type: ReactType, props: ReactProps | null, ...children: unknown[]) => unknown }
}).React = {
  createElement(type, props, ...children) {
    const next = { ...(props ?? {}) }
    if (children.length === 1) next.children = children[0]
    else if (children.length > 1) next.children = children
    return typeof type === "function" ? type(next) : { type, props: next, children }
  },
}

describe("Dialog", () => {
  test("DialogClose context receives onClose callback", () => createRoot((dispose) => {
    let closeCalled = false
    const onClose = () => { closeCalled = true }

    expect(typeof onClose).toBe("function")
    onClose()
    expect(closeCalled).toBe(true)

    dispose()
  }))

  test("Escape closes the active dialog even when focus belongs to a child", () => createRoot((dispose) => {
    resetFocus()
    let closeCount = 0
    Dialog({ onClose: () => { closeCount++ } })

    dispatchInput({
      type: "key",
      key: "escape",
      char: "",
      mods: { shift: false, alt: false, ctrl: false, meta: false },
    })

    expect(closeCount).toBe(1)
    dispose()
    resetFocus()
  }))
})
