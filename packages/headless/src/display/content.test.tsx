import { test } from "bun:test"
import { render, verify } from "../../../../scripts/visual-test/tmux-scenes/code-docs"

test("Code, Markdown, and Diff preserve source whitespace in both public routes", async () => {
  verify(await render())
})
