import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createNode, solidRender, type TGENode } from "@vexart/engine/internal"
import { VoidMarkdown } from "./markdown"
import { setTheme, darkTheme, lightTheme } from "../theme/theme"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")
const suite = browserRuntime ? describe : describe.skip

function renderScene(root: TGENode, scene: () => unknown) {
  return solidRender(scene as () => TGENode, root)
}

const SAMPLE_MD = "# Void Title\n\nThis is a paragraph with **bold** and *italic*."

suite("VoidMarkdown component", () => {
  beforeEach(() => {
    setTheme(darkTheme)
  })

  afterEach(() => {
    setTheme(darkTheme)
  })

  test("renders with Void theme tokens and marked Lexer", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidMarkdown content={SAMPLE_MD} width={400} />
    ))

    try {
      const mdBox = root.children[0]
      expect(mdBox).toBeDefined()
      expect(mdBox.kind).toBe("box")
      expect(mdBox.children.length).toBeGreaterThan(0)
    } finally {
      dispose()
    }
  })

  test("reacts dynamically to setTheme()", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidMarkdown content={SAMPLE_MD} width={400} />
    ))

    try {
      const mdBox = root.children[0]
      expect(mdBox).toBeDefined()

      // Switch theme to light
      setTheme(lightTheme)
      expect(mdBox.children.length).toBeGreaterThan(0)

      // Switch back to dark
      setTheme(darkTheme)
      expect(mdBox.children.length).toBeGreaterThan(0)
    } finally {
      dispose()
    }
  })

  test("accepts theme prop overrides", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <VoidMarkdown
        content={SAMPLE_MD}
        theme={{
          heading: "#123456",
        }}
      />
    ))

    try {
      const mdBox = root.children[0]
      expect(mdBox).toBeDefined()
    } finally {
      dispose()
    }
  })
})
