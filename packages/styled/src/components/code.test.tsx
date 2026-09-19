import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createNode, solidRender, type TGENode, parseColor } from "@vexart/engine/internal"
import { VoidCode } from "./code"
import { setTheme, darkTheme, lightTheme } from "../theme/theme"
import { radius, space } from "../tokens/tokens"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")
const suite = browserRuntime ? describe : describe.skip

function renderScene(root: TGENode, scene: () => unknown) {
  return solidRender(scene as () => TGENode, root)
}

const SAMPLE_CODE = "const a = 1\nconst b = 2"

suite("VoidCode component", () => {
  beforeEach(() => {
    setTheme(darkTheme)
  })

  afterEach(() => {
    setTheme(darkTheme)
  })

  test("renders with Void theme tokens", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidCode content={SAMPLE_CODE} width={400} />
    ))

    try {
      const codeBox = root.children[0]
      expect(codeBox).toBeDefined()
      expect(codeBox.kind).toBe("box")
      expect(codeBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))
      expect(codeBox.props.cornerRadius).toBe(radius.md)
      expect(codeBox.props.padding).toBe(space[3])
    } finally {
      dispose()
    }
  })

  test("reacts dynamically to setTheme()", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidCode content={SAMPLE_CODE} width={400} />
    ))

    try {
      const codeBox = root.children[0]
      expect(codeBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))

      // Switch theme to light
      setTheme(lightTheme)
      expect(codeBox.props.backgroundColor).toBe(parseColor(lightTheme.colors.card))

      // Switch back to dark
      setTheme(darkTheme)
      expect(codeBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))
    } finally {
      dispose()
    }
  })

  test("accepts theme prop overrides while preserving token reactivity for other props", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidCode
        content={SAMPLE_CODE}
        theme={{
          radius: 20,
        }}
      />
    ))

    try {
      const codeBox = root.children[0]
      expect(codeBox.props.cornerRadius).toBe(20)
      expect(codeBox.props.backgroundColor).toBe(parseColor(darkTheme.colors.card))
    } finally {
      dispose()
    }
  })
})
