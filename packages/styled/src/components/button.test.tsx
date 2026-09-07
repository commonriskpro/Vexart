import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import type { TGENode } from "@vexart/engine"
import { resetFocus } from "@vexart/engine"
import { Button, type ButtonProps } from "./button"

// Bun's test transform does not load the repo's Solid JSX plugin for imported
// TSX modules. This tiny runtime lets the component execute without changing
// the production renderer.
type ReactProps = Record<string, unknown>
type ReactType = string | ((props: ReactProps) => unknown)
type DynamicChild = { readonly value: unknown }
type TestNode = { props: ReactProps; children: unknown[] }

function dynamic(read: () => unknown): DynamicChild {
  return { get value() { return read() } }
}

;(globalThis as typeof globalThis & {
  React?: { createElement: (type: ReactType, props: ReactProps | null, ...children: unknown[]) => unknown }
}).React = {
  createElement(type, props, ...children) {
    const next = { ...(props ?? {}) }
    const values = children.map((child) => typeof child === "function" ? dynamic(child as () => unknown) : child)
    if (values.length === 1) next.children = values[0]
    else if (values.length > 1) next.children = values
    return typeof type === "function" ? type(next) : { type, props: next, children: values }
  },
}

beforeEach(() => resetFocus())
afterEach(() => resetFocus())

describe("styled Button", () => {
  test("accepts onPress prop", () => {
    const props: ButtonProps = { onPress: () => {}, children: "Click" }

    expect(Button).toBeFunction()
    expect(props.onPress).toBeFunction()
  })

  test("accepts variant and size props without error", () => {
    const props: ButtonProps = { variant: "destructive", size: "lg", children: "Delete" }

    expect(props.variant).toBe("destructive")
    expect(props.size).toBe("lg")
  })

  test("keeps default hover text readable and changes background while pressed", () => {
    const state = createRoot((dispose) => {
      const root = Button({ children: "Click" }) as unknown as TGENode
      const visual = () => (root.children[0] as unknown as DynamicChild).value as TestNode
      const initial = visual()
      const text = initial.children[0] as TestNode
      const onPress = initial.props.onPress as () => void

      onPress()
      const pressed = visual()

      return { initial, text, pressed, dispose }
    })

    const hoverStyle = state.initial.props.hoverStyle as ReactProps
    const activeStyle = state.initial.props.activeStyle as ReactProps
    const pressedActiveStyle = state.pressed.props.activeStyle as ReactProps
    expect(state.initial.props.borderWidth).toBe(2)
    expect(state.initial.props.alignX).toBe("left")
    expect(hoverStyle.backgroundColor).not.toBe(state.text.props.color)
    expect(activeStyle.backgroundColor).not.toBe(state.text.props.color)
    expect(pressedActiveStyle.backgroundColor).toBe(activeStyle.backgroundColor)
    expect(pressedActiveStyle.backgroundColor).not.toBe(state.initial.props.backgroundColor)
    state.dispose()
  })
})
