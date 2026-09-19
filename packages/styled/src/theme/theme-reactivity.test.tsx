import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createNode, solidRender, type TGENode, parseColor } from "@vexart/engine/internal"
import { VoidInput, VoidTextarea, VoidSelect, VoidCard } from "../index"
import { setTheme, darkTheme, lightTheme } from "./theme"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")
const suite = browserRuntime ? describe : describe.skip

function renderScene(root: TGENode, scene: () => unknown) {
  return solidRender(scene as () => TGENode, root)
}

suite("Theme Reactivity in Styled Wrappers", () => {
  beforeEach(() => {
    setTheme(darkTheme)
  })

  afterEach(() => {
    setTheme(darkTheme)
  })

  test("VoidCard reacts dynamically to setTheme()", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => <VoidCard />)
    try {
      const cardBox = root.children[0]
      expect(cardBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))
      expect(cardBox.props.borderColor).toBe(parseColor(darkTheme.colors.border))

      setTheme(lightTheme)
      expect(cardBox.props.backgroundColor).toBe(parseColor(lightTheme.colors.card))
      expect(cardBox.props.borderColor).toBe(parseColor(lightTheme.colors.border))

      setTheme(darkTheme)
      expect(cardBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))
    } finally {
      dispose()
    }
  })

  test("VoidInput reacts dynamically to setTheme()", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => <VoidInput value="test" />)
    try {
      const inputBox = root.children[0]
      expect(inputBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))

      setTheme(lightTheme)
      expect(inputBox.props.backgroundColor).toBe(parseColor(lightTheme.colors.card))

      setTheme(darkTheme)
      expect(inputBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))
    } finally {
      dispose()
    }
  })

  test("VoidTextarea reacts dynamically to setTheme()", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => <VoidTextarea value="test" />)
    try {
      const taBox = root.children[0]
      expect(taBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))

      setTheme(lightTheme)
      expect(taBox.props.backgroundColor).toBe(parseColor(lightTheme.colors.card))

      setTheme(darkTheme)
      expect(taBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))
    } finally {
      dispose()
    }
  })

  test("VoidSelect reacts dynamically to setTheme()", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidSelect options={[{ label: "Opt1", value: "1" }]} />
    ))
    try {
      const triggerBox = root.children[0]?.children[0]?.children[0]
      expect(triggerBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))

      setTheme(lightTheme)
      expect(triggerBox.props.backgroundColor).toBe(parseColor(lightTheme.colors.card))

      setTheme(darkTheme)
      expect(triggerBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))
    } finally {
      dispose()
    }
  })
})
