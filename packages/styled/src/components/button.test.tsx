import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { focusedId, setFocus } from "@vexart/engine"
import { createNode, dispatchFocusInput, parseColor, resetFocus, resolveProps, solidRender, type TGENode } from "@vexart/engine/internal"
import { VoidButton, type VoidButtonProps } from "./button"
import { gradients, radius, shadows } from "../tokens/tokens"
import { themeColors } from "../theme/theme"
import "@vexart/app"

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
      const visual = first(root)
      expect(visual.props.className).toBe("custom-btn w-full")
    } finally {
      dispose()
    }
  })

  test("keeps default hover text readable and changes background while pressed", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => <VoidButton>Click</VoidButton>)

    try {
      const initial = first(root)
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

      const pressed = first(root)
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
      const firstVisual = container.children[0]
      const secondVisual = container.children[1]
      if (!firstVisual || !secondVisual) throw new Error("expected two rendered buttons")

      setFocus("button-a")
      expect(firstVisual.props.borderWidth).toBe(2)

      setFocus("button-b")
      expect(container.children[0]).toBe(firstVisual)
      expect(firstVisual.props.borderWidth).toBeUndefined()
      expect(secondVisual.props.borderWidth).toBe(2)

      setFocus("button-a")
      expect(container.children[0]).toBe(firstVisual)
      expect(firstVisual.props.borderWidth).toBe(2)

      const initialBackground = firstVisual.props.backgroundColor
      const onPress = firstVisual.props.onPress as () => void
      onPress()
      expect(presses).toBe(1)
      expect(container.children[0]).toBe(firstVisual)
      expect(firstVisual.props.backgroundColor).not.toBe(initialBackground)

      await new Promise((resolve) => setTimeout(resolve, 120))
      expect(container.children[0]).toBe(firstVisual)
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

  test("applies Void 2.0 surface gradients and shadows across variants", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <box>
        <VoidButton variant="default">Primary</VoidButton>
        <VoidButton variant="secondary">Secondary</VoidButton>
        <VoidButton variant="destructive">Destructive</VoidButton>
      </box>
    ))

    try {
      const container = first(root)
      const defaultBtn = container.children[0]
      const secondaryBtn = container.children[1]
      const destructiveBtn = container.children[2]

      expect(defaultBtn.props.gradient).toEqual({
        type: "linear",
        angle: 180,
        from: parseColor(gradients.primaryButton.from),
        to: parseColor(gradients.primaryButton.to),
      })
      expect(defaultBtn.props.shadow).toEqual(shadows.xs)

      expect(secondaryBtn.props.gradient).toEqual({
        type: "linear",
        angle: 180,
        from: parseColor(gradients.secondaryButton.from),
        to: parseColor(gradients.secondaryButton.to),
      })
      expect(secondaryBtn.props.shadow).toEqual(shadows.xs)

      expect(destructiveBtn.props.gradient).toEqual({
        type: "linear",
        angle: 180,
        from: parseColor(gradients.destructiveButton.from),
        to: parseColor(gradients.destructiveButton.to),
      })
      expect(destructiveBtn.props.shadow).toEqual(shadows.xs)
    } finally {
      dispose()
    }
  })

  test('passing className="w-full h-12 bg-emerald-500 rounded-full" overrides width, height, backgroundColor, and cornerRadius', () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidButton className="w-full h-12 bg-emerald-500 rounded-full">
        Click
      </VoidButton>
    ))

    try {
      const visual = first(root)
      const r = resolveProps(visual)
      expect(r.width).toBe("100%")
      expect(r.height).toBe(48)
      expect(parseColor(r.backgroundColor)).toBe(parseColor("#10b981"))
      expect(r.cornerRadius).toBe(9999)
      // Gradient is omitted when custom background color is provided via className
      expect(r.gradient).toBeUndefined()
    } finally {
      dispose()
    }
  })

  test('reactive className switching on VoidButton reverts resolveProps and Flexily layout with zero stale props', () => {
    const root = createNode("root")
    const [cls, setCls] = createSignal("bg-emerald-500 rounded-full hover:bg-blue-500")
    const dispose = renderScene(root, () => (
      <VoidButton className={cls()}>
        Click
      </VoidButton>
    ))

    try {
      const visual = first(root)
      let r = resolveProps(visual)
      expect(parseColor(r.backgroundColor)).toBe(parseColor("#10b981"))
      expect(r.cornerRadius).toBe(9999)
      expect(parseColor(r.hoverStyle?.backgroundColor)).toBe(parseColor("#3b82f6"))
      expect(r.gradient).toBeUndefined()

      setCls("p-2")
      r = resolveProps(visual)
      expect(parseColor(r.backgroundColor)).toBe(parseColor(themeColors.primary))
      expect(r.cornerRadius).toBe(radius.md)
      expect(parseColor(r.hoverStyle?.backgroundColor)).toBe(parseColor(themeColors.foreground))
      expect(r.padding).toBe(8)
    } finally {
      dispose()
    }
  })
})
