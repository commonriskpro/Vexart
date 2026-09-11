import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createNode, dispatchFocusInput, focusedId, resetFocus, setFocus, solidRender, type TGENode } from "@vexart/engine"
import { VoidButton, type VoidButtonProps } from "./button"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")
const suite = browserRuntime ? describe : describe.skip

function first(root: TGENode) {
  const node = root.children[0]
  if (!node) throw new Error("expected a rendered root child")
  return node
}

function firstChild(node: TGENode) {
  const child = node.children[0]
  if (!child) throw new Error("expected a rendered child")
  return child
}

function renderScene(root: TGENode, scene: () => unknown) {
  return solidRender(scene as () => TGENode, root)
}

beforeEach(() => resetFocus())
afterEach(() => resetFocus())

suite("styled VoidButton", () => {
  test("accepts onPress prop", () => {
    const props: VoidButtonProps = { onPress: () => {}, children: "Click" }

    expect(VoidButton).toBeFunction()
    expect(props.onPress).toBeFunction()
  })

  test("accepts variant and size props without error", () => {
    const props: VoidButtonProps = { variant: "destructive", size: "lg", children: "Delete" }

    expect(props.variant).toBe("destructive")
    expect(props.size).toBe("lg")
  })

  test("accepts and passes className to the underlying box (DEF-06)", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => <VoidButton className="custom-btn w-full">Button</VoidButton>)

    try {
      const wrapper = first(root)
      const visual = firstChild(wrapper)
      expect(visual.props.className).toBe("custom-btn w-full")
    } finally {
      dispose()
    }
  })

  test("keeps default hover text readable and changes background while pressed", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => <VoidButton>Click</VoidButton>)

    try {
      const wrapper = first(root)
      const initial = firstChild(wrapper)
      const text = firstChild(initial)
      const onPress = initial.props.onPress as () => void
      const hoverStyle = initial.props.hoverStyle as { backgroundColor: unknown }
      const activeStyle = initial.props.activeStyle as { backgroundColor: unknown }

      expect(initial.props.borderWidth).toBe(2)
      expect(initial.props.alignX).toBe("left")
      expect(hoverStyle.backgroundColor).not.toBe(text.props.color)
      expect(activeStyle.backgroundColor).not.toBe(text.props.color)

      const initialBackground = initial.props.backgroundColor
      onPress()

      const pressed = firstChild(wrapper)
      const pressedActiveStyle = pressed.props.activeStyle as { backgroundColor: unknown }
      expect(pressed).toBe(initial)
      expect(pressedActiveStyle.backgroundColor).toBe(activeStyle.backgroundColor)
      expect(pressed.props.backgroundColor).not.toBe(initialBackground)
    } finally {
      dispose()
    }
  })

  test("keeps mounted visuals stable across focus changes and press reset", async () => {
    const root = createNode("root")
    let presses = 0
    const dispose = renderScene(root, () => (
      <box>
        <VoidButton focusId="button-a" onPress={() => presses++}>A</VoidButton>
        <VoidButton focusId="button-b">B</VoidButton>
      </box>
    ))

    try {
      const container = first(root)
      const firstWrapper = container.children[0]
      const secondWrapper = container.children[1]
      if (!firstWrapper || !secondWrapper) throw new Error("expected two rendered buttons")

      const firstVisual = firstChild(firstWrapper)
      const secondVisual = firstChild(secondWrapper)

      setFocus("button-a")
      expect(firstVisual.props.borderWidth).toBe(2)

      setFocus("button-b")
      expect(firstChild(firstWrapper)).toBe(firstVisual)
      expect(firstVisual.props.borderWidth).toBeUndefined()
      expect(secondVisual.props.borderWidth).toBe(2)

      setFocus("button-a")
      expect(firstChild(firstWrapper)).toBe(firstVisual)
      expect(firstVisual.props.borderWidth).toBe(2)

      const initialBackground = firstVisual.props.backgroundColor
      const onPress = firstVisual.props.onPress as () => void
      onPress()
      expect(presses).toBe(1)
      expect(firstChild(firstWrapper)).toBe(firstVisual)
      expect(firstVisual.props.backgroundColor).not.toBe(initialBackground)

      await new Promise((resolve) => setTimeout(resolve, 120))
      expect(firstChild(firstWrapper)).toBe(firstVisual)
      expect(firstVisual.props.backgroundColor).toBe(initialBackground)
    } finally {
      dispose()
    }
  })

  test("Tab navigation moves focus directly between buttons without double-tab ghosting", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <box>
        <VoidButton focusId="btn-1">First</VoidButton>
        <VoidButton focusId="btn-2">Second</VoidButton>
      </box>
    ))

    try {
      setFocus("btn-1")
      expect(focusedId()).toBe("btn-1")

      // One single Tab press should move directly to btn-2
      dispatchFocusInput({
        type: "key",
        key: "tab",
        char: "\t",
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      })
      expect(focusedId()).toBe("btn-2")
    } finally {
      dispose()
    }
  })
})
