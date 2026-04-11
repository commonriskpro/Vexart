/**
 * TGE Syntax Highlighting Demo — tree-sitter powered code blocks.
 *
 * Demonstrates:
 *   - Tree-sitter WASM parsing in a worker thread
 *   - Per-token coloring with SyntaxStyle themes
 *   - ONE_DARK and KANAGAWA built-in themes
 *   - Code component with line numbers
 *
 * Controls:
 *   - T: toggle between ONE_DARK and KANAGAWA themes
 *   - Esc/Q: quit
 *
 * Run:  bun run demo15 (requires Ghostty WITHOUT tmux)
 * Requires: bun zig:build && bun run clay:build
 */

import { createSignal } from "solid-js"
import { mount, onInput, SyntaxStyle, ONE_DARK, KANAGAWA } from "@tge/renderer"
import { Box, Text, Code } from "@tge/components"
import { createTerminal } from "@tge/terminal"

const TS_CODE = `import { createSignal } from "solid-js"

// A simple counter component
function Counter() {
  const [count, setCount] = createSignal(0)
  const doubled = () => count() * 2

  return (
    <box direction="column" gap={8}>
      <text color="#e0e0e0">Count: {count()}</text>
      <text color="#98c379">Doubled: {doubled()}</text>
    </box>
  )
}`

const JS_CODE = `const express = require("express")
const app = express()

// REST API endpoint
app.get("/api/users", async (req, res) => {
  const users = await db.query("SELECT * FROM users")
  res.json({ data: users, total: users.length })
})

app.listen(3000, () => {
  console.log("Server running on port 3000")
})`

function App() {
  const [theme, setTheme] = createSignal<"onedark" | "kanagawa">("kanagawa")
  const style = () => SyntaxStyle.fromTheme(theme() === "onedark" ? ONE_DARK : KANAGAWA)

  onInput((event) => {
    if (event.type !== "key") return
    if (event.key === "escape" || event.key === "q") process.exit(0)
    if (event.key === "t") {
      setTheme((t) => t === "onedark" ? "kanagawa" : "onedark")
    }
  })

  return (
    <box direction="column" width="100%" height="100%" backgroundColor="#0a0a14" padding={20} gap={12}>
      <box direction="row" gap={20}>
        <text color="#e0e0e0" fontSize={14}>Syntax Highlighting Demo (demo15)</text>
        <text color="#888888" fontSize={14}>Theme: {theme()} — press T to toggle</text>
      </box>

      <box direction="row" gap={16}>
        {/* TypeScript */}
        <box direction="column" gap={4}>
          <text color="#888888" fontSize={14}>TypeScript</text>
          <Code
            content={TS_CODE}
            language="typescript"
            syntaxStyle={style()}
            width={480}
            lineNumbers
          />
        </box>

        {/* JavaScript */}
        <box direction="column" gap={4}>
          <text color="#888888" fontSize={14}>JavaScript</text>
          <Code
            content={JS_CODE}
            language="javascript"
            syntaxStyle={style()}
            width={480}
            lineNumbers
          />
        </box>
      </box>

      <text color="#555555" fontSize={14}>T=toggle theme  Esc=quit</text>
    </box>
  )
}

const terminal = await createTerminal()
const handle = mount(() => <App />, terminal)

process.on("SIGINT", () => {
  handle.destroy()
  process.exit(0)
})
