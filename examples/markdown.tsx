/**
 * Vexart Markdown Demo — renders markdown with syntax-highlighted code blocks.
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
 * Requires: bun install && cargo build
 */

import { SyntaxStyle, KANAGAWA, useTerminalDimensions } from "@vexart/engine"
import { createApp, useAppTerminal } from "@vexart/app"
import { Markdown, ScrollView } from "@vexart/headless"

const MD_CONTENT = `# Welcome to Vexart

Vexart is a **pixel-native terminal rendering engine**. Write JSX, get browser-quality UI in your terminal.

## Features

- Anti-aliased corners with SDF primitives
- Shadow, glow, and gradient effects
- Tree-sitter syntax highlighting
- SolidJS JSX reconciler

## Quick Start

Install Vexart and create your first app:

\`\`\`typescript
import { createApp, Box, Text } from "@vexart/app"

function App() {
  return (
    <Box backgroundColor="#1a1a2e" cornerRadius={12} padding={20}>
      <Text color="#e0e0e0" fontSize={16}>Hello Vexart!</Text>
    </Box>
  )
}

await createApp(() => <App />)
\`\`\`

## Architecture

> Vexart uses Flexily for layout, Rust/WGPU for pixel painting, and SolidJS for JSX reconciliation.

1. JSX components declare the UI
2. Flexily computes the layout
3. Rust/WGPU paints pixels
4. Kitty protocol sends to terminal

---

That's it. **Happy hacking!**
`

function App() {
  const style = SyntaxStyle.fromTheme(KANAGAWA)
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)

  return (
    <box direction="column" width={dims.width()} height={dims.height()} backgroundColor="#0a0a14" padding={20} gap={8}>
      <text color="#888888" fontSize={14}>Markdown Demo (demo16) — Esc to quit</text>

      <ScrollView width="100%" height="100%" scrollY scrollSpeed={1} backgroundColor="#0f0f1a" cornerRadius={8} padding={16}>
        <Markdown content={MD_CONTENT} syntaxStyle={style} width="100%" />
      </ScrollView>
    </box>
  )
}

await createApp(() => <App />, {
  quit: ["q", "escape", "ctrl+c"],
  mount: {
    experimental: {
    },
  },
})
