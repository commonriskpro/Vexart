import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { createNode, solidRender, type TGENode } from "@vexart/engine/internal"
import {
  Code,
  createCode,
  useCodeTokens,
  CODE_DEFAULTS,
  type HighlightToken,
} from "./code"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")
const suite = browserRuntime ? describe : describe.skip

function renderScene(root: TGENode, scene: () => unknown) {
  return solidRender(scene as () => TGENode, root)
}

describe("CODE_DEFAULTS", () => {
  test("has neutral unstyled defaults", () => {
    expect(CODE_DEFAULTS.bg).toBe("transparent")
    expect(CODE_DEFAULTS.fg).toBe("currentColor")
    expect(CODE_DEFAULTS.lineNumberFg).toBe("currentColor")
    expect(CODE_DEFAULTS.radius).toBe(0)
    expect(CODE_DEFAULTS.padding).toBe(0)
  })
})

describe("createCode / useCodeTokens", () => {
  test("aliases useCodeTokens to createCode", () => {
    expect(useCodeTokens).toBe(createCode)
  })

  test("splits raw text into line tokens with default foreground", () => {
    createRoot((dispose) => {
      const { tokens, lineCount } = createCode("const a = 1\nconst b = 2")
      expect(lineCount()).toBe(2)
      expect(tokens()).toEqual([
        [{ text: "const a = 1", color: "currentColor" }],
        [{ text: "const b = 2", color: "currentColor" }],
      ])
      dispose()
    })
  })

  test("reacts to signal content changes", () => {
    createRoot((dispose) => {
      const [content, setContent] = createSignal("line 1")
      const { tokens, lineCount } = createCode({ content })

      expect(lineCount()).toBe(1)
      expect(tokens()[0][0].text).toBe("line 1")

      setContent("line 1\nline 2\nline 3")
      expect(lineCount()).toBe(3)
      expect(tokens()[2][0].text).toBe("line 3")

      dispose()
    })
  })

  test("uses pluggable synchronous highlighter", () => {
    createRoot((dispose) => {
      const highlighter = (code: string) => [
        [{ text: code, color: "#ff0000" }],
      ]

      const { tokens } = createCode({
        content: "hello",
        highlighter,
      })

      expect(tokens()).toEqual([[{ text: "hello", color: "#ff0000" }]])
      dispose()
    })
  })

  test("uses pluggable asynchronous highlighter", async () => {
    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        const highlighter = async (code: string) => [
          [{ text: code, color: "#00ff00" }],
        ]

        const { tokens } = createCode({
          content: "async code",
          highlighter,
        })

        // Immediately shows fallback
        expect(tokens()[0][0].text).toBe("async code")

        setTimeout(() => {
          expect(tokens()).toEqual([[{ text: "async code", color: "#00ff00" }]])
          dispose()
          resolve()
        }, 20)
      })
    })
  })
})

suite("Code component", () => {
  test("renders unstyled container with zero radius and transparent background", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <Code content={"const x = 10\nreturn x"} />
    ))

    try {
      const codeBox = root.children[0]
      expect(codeBox).toBeDefined()
      expect(codeBox.kind).toBe("box")
      expect(codeBox.props.backgroundColor).toBe(0)
      expect(codeBox.props.cornerRadius).toBe(0)
      expect(codeBox.props.padding).toBe(0)
    } finally {
      dispose()
    }
  })

  test("renders with line numbers when requested", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <Code content={"line 1\nline 2"} lineNumbers />
    ))

    try {
      const codeBox = root.children[0]
      expect(codeBox.children.length).toBe(2)
      const firstLine = codeBox.children[0]
      // First child is line number gutter box
      const gutterBox = firstLine.children[0]
      expect(gutterBox.kind).toBe("box")
      expect(gutterBox.children.length).toBeGreaterThan(0)
    } finally {
      dispose()
    }
  })

  test("accepts theme prop overrides", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <Code
        content={"styled"}
        theme={{
          bg: "#112233",
          radius: 8,
          padding: 12,
        }}
      />
    ))

    try {
      const codeBox = root.children[0]
      expect(codeBox.props.cornerRadius).toBe(8)
      expect(codeBox.props.padding).toBe(12)
    } finally {
      dispose()
    }
  })
})
