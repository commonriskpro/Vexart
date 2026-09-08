import { test } from "bun:test"
import { render, verify } from "../../../../scripts/visual-test/tmux-scenes/code-docs"

// Native Code/Docs rendering can exceed Bun's default timeout on a cold GPU start.
test("Code, Markdown, and Diff preserve source whitespace in both public routes", async () => {
  verify(await render())
}, 30_000)
