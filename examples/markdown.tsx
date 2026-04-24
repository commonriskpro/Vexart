/**
 * TGE Markdown Demo — renders markdown with syntax-highlighted code blocks.
 *
 * Demonstrates:
 *   - Headings (h1-h3)
 *   - Paragraphs with inline text
 *   - Fenced code blocks with tree-sitter highlighting
 *   - Bullet and numbered lists
 *   - Blockquotes
 *   - Horizontal rules
 *
 * Controls:
 *   - Esc/Q: quit
 *
 * Run:  bun run demo16 (requires Ghostty WITHOUT tmux)
 * Requires: bun zig:build && bun run clay:build
 */

import { mount, onInput, SyntaxStyle, KANAGAWA, useTerminalDimensions } from "@vexart/engine"
import { Box, Text } from "@vexart/primitives"
import { Markdown, ScrollView } from "@vexart/headless"
import { createTerminal } from "@vexart/engine"

const MD_CONTENT = `# Welcome to TGE

TGE is a **pixel-native terminal rendering engine**. Write JSX, get browser-quality UI in your terminal.

## Features

- Anti-aliased corners with SDF primitives
- Shadow, glow, and gradient effects
- Tree-sitter syntax highlighting
- SolidJS JSX reconciler

## Quick Start

Install TGE and create your first app:

\`\`\`typescript
import { mount } from "tge"
import { Box, Text } from "tge/components"
import { createTerminal } from "tge/terminal"

function App() {
  return (
    <Box backgroundColor="#1a1a2e" cornerRadius={12} padding={20}>
      <Text color="#e0e0e0" fontSize={16}>Hello TGE!</Text>
    </Box>
  )
}

const terminal = await createTerminal()
mount(() => <App />, terminal)
\`\`\`

## Architecture

> TGE uses Clay for layout (microsecond performance), Zig for pixel painting (SDF primitives), and SolidJS for JSX reconciliation.

1. JSX components declare the UI
2. Clay computes the layout
3. Zig paints pixels with SDF
4. Output backend sends to terminal

---

That's it. **Happy hacking!**
`

function App(props: { terminal: Parameters<typeof useTerminalDimensions>[0] }) {
  const style = SyntaxStyle.fromTheme(KANAGAWA)
  const dims = useTerminalDimensions(props.terminal)

  onInput((event) => {
    if (event.type !== "key") return
    if (event.key === "escape" || event.key === "q") process.exit(0)
  })

  return (
    <box direction="column" width={dims.width()} height={dims.height()} backgroundColor="#0a0a14" padding={20} gap={8}>
      <text color="#888888" fontSize={14}>Markdown Demo (demo16) — Esc to quit</text>

      <ScrollView width="100%" height="100%" scrollY scrollSpeed={1} backgroundColor="#0f0f1a" cornerRadius={8} padding={16}>
        <Markdown content={MD_CONTENT} syntaxStyle={style} width="100%" />
      </ScrollView>
    </box>
  )
}

const terminal = await createTerminal()
const handle = mount(() => <App terminal={terminal} />, terminal, {
  experimental: {
  },
})

process.on("SIGINT", () => {
  handle.destroy()
  process.exit(0)
})
