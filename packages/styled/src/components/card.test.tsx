import { afterEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { createNode, parseColor, resetFocus, resolveProps, solidRender, type TGENode } from "@vexart/engine/internal"
import { VoidCard, VoidCardDescription, VoidCardTitle } from "./card"
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

afterEach(() => resetFocus())

suite("styled VoidCard with the production Solid renderer", () => {
  test("updates scalar and conditional children while preserving stable interactive children", () => {
    const root = createNode("root")
    const [count, setCount] = createSignal(0)
    const [visible, setVisible] = createSignal(true)
    let presses = 0

    const dispose = renderScene(root, () => (
      <VoidCard>
        <VoidCardTitle>{count()}</VoidCardTitle>
        <box focusable onPress={() => { presses += 1 }}><text>stable</text></box>
        {visible() ? <VoidCardDescription>on</VoidCardDescription> : <VoidCardDescription>off</VoidCardDescription>}
      </VoidCard>
    ))

    try {
      const card = first(root)
      const title = card.children[0]
      const interactive = card.children[1]
      if (!title || !interactive) throw new Error("expected title and interactive children")
      const titleText = firstChild(title)
      const onPress = interactive.props.onPress as () => void
      expect(titleText.text).toBe("0")
      onPress()
      expect(presses).toBe(1)

      setCount(3)
      expect(first(root)).toBe(card)
      expect(card.children[0]).toBe(title)
      expect(firstChild(title)).toBe(titleText)
      expect(titleText.text).toBe("3")

      setVisible(false)
      expect(card.children[1]).toBe(interactive)
      expect(firstChild(card.children[2]).text).toBe("off")
      ;(interactive.props.onPress as () => void)()
      expect(presses).toBe(2)
    } finally {
      dispose()
    }
  })

  test("accepts and passes className to root elements (DEF-06)", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidCard className="my-card">
        <VoidCardTitle className="my-title">Title</VoidCardTitle>
      </VoidCard>
    ))

    try {
      const card = first(root)
      expect(card.props.className).toBe("my-card")
      const title = card.children[0]
      expect(title?.props.className).toBe("my-title")
    } finally {
      dispose()
    }
  })

  test("applies Void 2.0 surface gradient, corner radius and shadows", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidCard>
        <text>Card Content</text>
      </VoidCard>
    ))

    try {
      const card = first(root)
      expect(card.props.gradient).toEqual({
        type: "linear",
        angle: 180,
        from: parseColor(gradients.card.from),
        to: parseColor(gradients.card.to),
      })
      expect(card.props.cornerRadius).toBe(radius.lg)
      expect(card.props.shadow).toEqual(shadows.md)
    } finally {
      dispose()
    }
  })

  test('passing className="w-full h-12 bg-emerald-500 rounded-full" overrides width, height, backgroundColor, and cornerRadius', () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidCard className="w-full h-12 bg-emerald-500 rounded-full">
        <text>Overridden</text>
      </VoidCard>
    ))

    try {
      const card = first(root)
      const r = resolveProps(card)
      expect(r.width).toBe("100%")
      expect(r.height).toBe(48)
      expect(parseColor(r.backgroundColor)).toBe(parseColor("#10b981"))
      expect(r.cornerRadius).toBe(9999)
      // When custom backgroundColor is passed in className, default card gradient is omitted
      expect(r.gradient).toBeUndefined()
    } finally {
      dispose()
    }
  })

  test('reactive className switching reverts resolveProps and Flexily layout cleanly with zero stale props', () => {
    const root = createNode("root")
    const [cls, setCls] = createSignal("bg-emerald-500 rounded-full hover:bg-blue-500")
    const dispose = renderScene(root, () => (
      <VoidCard className={cls()}>
        <text>Content</text>
      </VoidCard>
    ))

    try {
      const card = first(root)
      let r = resolveProps(card)
      expect(parseColor(r.backgroundColor)).toBe(parseColor("#10b981"))
      expect(r.cornerRadius).toBe(9999)
      expect(parseColor(r.hoverStyle?.backgroundColor)).toBe(parseColor("#3b82f6"))
      expect(r.gradient).toBeUndefined()

      // Switch className to "p-2"
      setCls("p-2")
      r = resolveProps(card)
      expect(parseColor(r.backgroundColor)).toBe(parseColor(themeColors.card))
      expect(r.cornerRadius).toBe(radius.lg)
      expect(r.hoverStyle?.backgroundColor).toBeUndefined()
      expect(r.gradient).toEqual({
        type: "linear",
        angle: 180,
        from: parseColor(gradients.card.from),
        to: parseColor(gradients.card.to),
      })
      expect(r.padding).toBe(8)
      expect(card._flexNode?.getPadding(0).value).toBe(8)
    } finally {
      dispose()
    }
  })
})
