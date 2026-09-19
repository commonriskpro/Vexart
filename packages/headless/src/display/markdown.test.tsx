import { describe, expect, test } from "bun:test"
import { createNode, solidRender, type TGENode } from "@vexart/engine/internal"
import {
  Markdown,
  parseMarkdown,
  parseFallbackMarkdown,
  MD_DEFAULTS,
} from "./markdown"

const browserRuntime = import.meta.resolve("solid-js").endsWith("/solid.js")
const suite = browserRuntime ? describe : describe.skip

function renderScene(root: TGENode, scene: () => unknown) {
  return solidRender(scene as () => TGENode, root)
}

describe("MD_DEFAULTS", () => {
  test("has neutral unstyled defaults", () => {
    expect(MD_DEFAULTS.fg).toBe("currentColor")
    expect(MD_DEFAULTS.heading).toBe("currentColor")
    expect(MD_DEFAULTS.muted).toBe("transparent")
    expect(MD_DEFAULTS.link).toBe("currentColor")
    expect(MD_DEFAULTS.bold).toBe("currentColor")
    expect(MD_DEFAULTS.italic).toBe("currentColor")
    expect(MD_DEFAULTS.codeFg).toBe("currentColor")
    expect(MD_DEFAULTS.codeBg).toBe("transparent")
    expect(MD_DEFAULTS.codeBlockBg).toBe("transparent")
    expect(MD_DEFAULTS.blockquoteBorder).toBe("currentColor")
    expect(MD_DEFAULTS.listBullet).toBe("currentColor")
    expect(MD_DEFAULTS.tableBg).toBe("transparent")
    expect(MD_DEFAULTS.tableHeader).toBe("currentColor")
    expect(MD_DEFAULTS.hrColor).toBe("currentColor")
    expect(MD_DEFAULTS.del).toBe("currentColor")
  })
})

describe("parseMarkdown (zero-dep built-in parser)", () => {
  test("aliases parseFallbackMarkdown to parseMarkdown", () => {
    expect(parseFallbackMarkdown).toBe(parseMarkdown)
  })

  test("returns empty array for empty string or whitespace", () => {
    expect(parseMarkdown("")).toEqual([])
    expect(parseMarkdown("   \n  \n  ")).toEqual([])
  })

  test("parses headings of various depths", () => {
    const tokens = parseMarkdown("# H1\n## H2\n### H3")
    expect(tokens.length).toBe(3)
    expect(tokens[0].type).toBe("heading")
    expect(tokens[0].depth).toBe(1)
    expect(tokens[0].text).toBe("H1")
    expect(tokens[1].depth).toBe(2)
    expect(tokens[2].depth).toBe(3)
  })

  test("parses fenced code blocks with language", () => {
    const md = "```typescript\nconst x: number = 42\n```"
    const tokens = parseMarkdown(md)
    expect(tokens.length).toBe(1)
    expect(tokens[0].type).toBe("code")
    expect(tokens[0].lang).toBe("typescript")
    expect(tokens[0].text).toBe("const x: number = 42")
  })

  test("parses blockquotes", () => {
    const md = "> quote line 1\n> quote line 2"
    const tokens = parseMarkdown(md)
    expect(tokens.length).toBe(1)
    expect(tokens[0].type).toBe("blockquote")
    expect(tokens[0].tokens.length).toBeGreaterThan(0)
  })

  test("parses unordered and ordered lists", () => {
    const ulist = "- first\n- second\n- third"
    const uTokens = parseMarkdown(ulist)
    expect(uTokens.length).toBe(1)
    expect(uTokens[0].type).toBe("list")
    expect(uTokens[0].ordered).toBe(false)
    expect(uTokens[0].items.length).toBe(3)
    expect(uTokens[0].items[0].text).toBe("first")

    const olist = "1. alpha\n2. beta"
    const oTokens = parseMarkdown(olist)
    expect(oTokens.length).toBe(1)
    expect(oTokens[0].type).toBe("list")
    expect(oTokens[0].ordered).toBe(true)
    expect(oTokens[0].start).toBe(1)
    expect(oTokens[0].items.length).toBe(2)
  })

  test("parses horizontal rules", () => {
    const tokens = parseMarkdown("---")
    expect(tokens.length).toBe(1)
    expect(tokens[0].type).toBe("hr")
  })

  test("parses paragraphs with inline markdown", () => {
    const md = "Hello **bold** and *italic* and `code` and [link](https://test.com)"
    const tokens = parseMarkdown(md)
    expect(tokens.length).toBe(1)
    expect(tokens[0].type).toBe("paragraph")
    const inlines = tokens[0].tokens
    expect(inlines.some((t: any) => t.type === "strong")).toBe(true)
    expect(inlines.some((t: any) => t.type === "em")).toBe(true)
    expect(inlines.some((t: any) => t.type === "codespan")).toBe(true)
    expect(inlines.some((t: any) => t.type === "link")).toBe(true)
  })

  test("parses tables", () => {
    const table = "| Col A | Col B |\n|---|---|\n| Val 1 | Val 2 |"
    const tokens = parseMarkdown(table)
    expect(tokens.length).toBe(1)
    expect(tokens[0].type).toBe("table")
    expect(tokens[0].header.length).toBe(2)
    expect(tokens[0].rows.length).toBe(1)
  })
})

suite("Markdown component", () => {
  test("renders out of the box with zero dependencies", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <Markdown content="# Title\n\nA paragraph with **bold**." width={500} />
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

  test("supports pluggable custom tokenizer", () => {
    const root = createNode("root")
    const customTokenizer = () => [
      { type: "heading", depth: 2, text: "Custom Heading", tokens: [{ type: "text", text: "Custom Heading" }] },
    ]

    const dispose = renderScene(root, () => (
      <Markdown content="ignored" tokenizer={customTokenizer} width={500} />
    ))

    try {
      const mdBox = root.children[0]
      expect(mdBox).toBeDefined()
      expect(mdBox.children.length).toBe(1)
    } finally {
      dispose()
    }
  })

  test("applies theme overrides", () => {
    const root = createNode("root")
    const dispose = renderScene(root, () => (
      <Markdown
        content="# Themed Heading"
        theme={{
          heading: "#ff00ff",
        }}
        width={500}
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
