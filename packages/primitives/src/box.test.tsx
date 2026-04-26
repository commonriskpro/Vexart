import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { Box } from "./box"

const React = {
  Fragment(props: { children?: unknown }) {
    return props.children
  },
  createElement(type: string | ((props: unknown) => unknown), props: Record<string, unknown> | null, ...children: unknown[]) {
    const next = {
      ...(props ?? {}),
      children: children.length > 1 ? children : children[0],
    }
    if (typeof type === "function") return type(next)
    return { type, props: next }
  },
}

Object.assign(globalThis, { React })

describe("Box primitive", () => {
  test("renders without error", () => createRoot((dispose) => {
    const el = Box({ children: null })

    expect(el).toBeDefined()

    dispose()
  }))

  test("accepts TGEProps (backgroundColor, padding, etc)", () => createRoot((dispose) => {
    const el = Box({
      backgroundColor: 0xff0000ff,
      padding: 8,
      direction: "row",
      gap: 4,
      children: null,
    })

    expect(el).toBeDefined()
    dispose()
  }))
})
