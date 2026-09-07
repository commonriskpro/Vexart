import { afterEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { createNode, resetFocus, solidRender, type TGENode } from "@vexart/engine"
import { Card, CardDescription, CardTitle } from "./card"

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

suite("styled Card with the production Solid renderer", () => {
  test("updates scalar and conditional children while preserving stable interactive children", () => {
    const root = createNode("root")
    const [count, setCount] = createSignal(0)
    const [visible, setVisible] = createSignal(true)
    let presses = 0

    const dispose = renderScene(root, () => (
      <Card>
        <CardTitle>{count()}</CardTitle>
        <box focusable onPress={() => { presses += 1 }}>stable</box>
        {visible() ? <CardDescription>on</CardDescription> : <CardDescription>off</CardDescription>}
      </Card>
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
})
