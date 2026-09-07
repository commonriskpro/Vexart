import { afterEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import {
  createNode,
  parseColor,
  resetFocus,
  solidRender,
  type TGENode,
} from "@vexart/engine"
import { Box, Text } from "./primitives"

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

suite("app primitives with the production Solid renderer", () => {
  test("updates reactive Box visual props without replacing the node", () => {
    const root = createNode("root")
    const [color, setColor] = createSignal<string | number>("#111111")
    const [gradient, setGradient] = createSignal<{ type: "linear"; from: string; to: string } | undefined>({ type: "linear", from: "#111111", to: "#ffffff" })
    const [shadow, setShadow] = createSignal<{ x: number; y: number; blur: number; color: string } | undefined>({ x: 0, y: 2, blur: 4, color: "#00000080" })
    const [glow, setGlow] = createSignal<{ radius: number; color: string; intensity: number } | undefined>({ radius: 8, color: "#00ffff", intensity: 50 })

    const dispose = renderScene(root, () => (
      <Box backgroundColor={color()} gradient={gradient()} shadow={shadow()} glow={glow()}>
        <Text color={color()}>stable</Text>
      </Box>
    ))

    try {
      const node = first(root)
      const child = firstChild(node)
      expect(node.props.backgroundColor).toBe(parseColor("#111111"))
      expect((node.props.gradient as { from: number }).from).toBe(parseColor("#111111"))
      expect(child.props.color).toBe(parseColor("#111111"))

      setColor("#ff0000")
      setGradient({ type: "linear", from: "#ff0000", to: "#0000ff" })
      setShadow({ x: 1, y: 3, blur: 6, color: "#ffffff80" })
      setGlow({ radius: 12, color: "#00ff00", intensity: 75 })

      expect(first(root)).toBe(node)
      expect(firstChild(node)).toBe(child)
      expect(node.props.backgroundColor).toBe(parseColor("#ff0000"))
      expect((node.props.gradient as { from: number }).from).toBe(parseColor("#ff0000"))
      expect(child.props.color).toBe(parseColor("#ff0000"))
      expect((node.props.shadow as { y: number }).y).toBe(3)
      expect((node.props.glow as { radius: number }).radius).toBe(12)

      setGradient(undefined)
      setGlow(undefined)
      expect(node.props.gradient).toBeUndefined()
      expect(node.props.glow).toBeUndefined()
    } finally {
      dispose()
    }
  })

  test("keeps className below style and direct props while both remain reactive", () => {
    const styledRoot = createNode("root")
    const [className, setClassName] = createSignal("bg-primary")
    const [style, setStyle] = createSignal({ backgroundColor: "#ff0000" })
    const disposeStyled = renderScene(styledRoot, () => (
      <Box className={className()} style={style()}>styled</Box>
    ))

    const directRoot = createNode("root")
    const disposeDirect = renderScene(directRoot, () => (
      <Box className="bg-primary" style={{ backgroundColor: "#ff0000" }} backgroundColor="#00ff00">
        direct
      </Box>
    ))

    try {
      const styled = first(styledRoot)
      expect(styled.props.backgroundColor).toBe(parseColor("#ff0000"))

      setStyle({ backgroundColor: "#0000ff" })
      expect(styled.props.backgroundColor).toBe(parseColor("#0000ff"))

      setClassName("bg-secondary")
      expect(styled.props.backgroundColor).toBe(parseColor("#0000ff"))
      expect(first(directRoot).props.backgroundColor).toBe(parseColor("#00ff00"))
    } finally {
      disposeStyled()
      disposeDirect()
    }
  })

  test("clears className and style visuals when their reactive values are removed", () => {
    const root = createNode("root")
    const [className, setClassName] = createSignal("bg-primary")
    const [style, setStyle] = createSignal<{ backgroundColor: string; glow: { radius: number; color: string } } | Record<string, never>>({
      backgroundColor: "#ff0000",
      glow: { radius: 8, color: "#00ffff" },
    })
    const dispose = renderScene(root, () => (
      <Box className={className()} style={style()}>clearable</Box>
    ))

    try {
      const node = first(root)
      expect(node.props.backgroundColor).toBe(parseColor("#ff0000"))
      expect(node.props.glow).toBeDefined()

      setClassName("")
      setStyle({})

      expect(node.props.backgroundColor).toBe(0)
      expect(node.props.glow).toBeUndefined()
    } finally {
      dispose()
    }
  })

  test("updates scalar and conditional Text children without remounting stable interactive content", () => {
    const root = createNode("root")
    const [count, setCount] = createSignal(0)
    const [visible, setVisible] = createSignal(true)
    let presses = 0

    const dispose = renderScene(root, () => (
      <Box>
        <Box focusable onPress={() => { presses += 1 }}>stable</Box>
        <Text>{count()}</Text>
        {visible() ? <Text>on</Text> : <Text>off</Text>}
      </Box>
    ))

    try {
      const container = first(root)
      const interactive = container.children[0]
      const scalar = container.children[1]
      if (!interactive || !scalar) throw new Error("expected interactive and scalar children")
      const scalarText = firstChild(scalar)
      const onPress = interactive.props.onPress as () => void
      expect(scalarText.text).toBe("0")
      onPress()
      expect(presses).toBe(1)

      setCount(2)
      expect(firstChild(scalar)).toBe(scalarText)
      expect(scalarText.text).toBe("2")

      setVisible(false)
      expect(container.children[0]).toBe(interactive)
      expect(firstChild(container.children[2]).text).toBe("off")
      ;(interactive.props.onPress as () => void)()
      expect(presses).toBe(2)
    } finally {
      dispose()
    }
  })
})
