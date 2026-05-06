# Getting Started

This guide walks you through installing Vexart, building the Rust native runtime, and rendering your first pixel-perfect terminal UI.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Bun](https://bun.sh/) | >= 1.1.0 | TypeScript runtime, FFI, package scripts, test runner |
| [Rust](https://www.rust-lang.org/tools/install) | stable | Builds `libvexart`, the native WGPU paint/presentation runtime |
| **Terminal with Kitty graphics** | — | Required: Kitty, Ghostty, or WezTerm |

> Vexart is GPU/Kitty-protocol first. Plain ANSI terminals are not a v0.9 target.

## Installation

```bash
git clone https://github.com/commonriskpro/Vexart.git vexart
cd vexart
bun install
cd native/libvexart && cargo build --release && cd ../..
```

## Your first app

Create `my-app.tsx`:

```tsx
import { createApp, Box, Text, useAppTerminal, colors, radius } from "vexart"
import { useTerminalDimensions } from "vexart/engine"

function App() {
  const terminal = useAppTerminal()
  const dims = useTerminalDimensions(terminal)

  return (
    <Box
      width={dims.width()}
      height={dims.height()}
      backgroundColor={colors.background}
      alignX="center"
      alignY="center"
    >
      <Box
        padding={20}
        backgroundColor={colors.card}
        cornerRadius={radius.xl}
        direction="column"
        gap={8}
      >
        <Text color={colors.foreground}>Welcome to Vexart</Text>
        <Text color={colors.mutedForeground}>Pixel-native terminal rendering</Text>
      </Box>
    </Box>
  )
}

await createApp(() => <App />)
```

Run it:

```bash
bun --conditions=browser run my-app.tsx
```

> **Why `--conditions=browser`?** SolidJS exposes its reactive runtime under the `browser` condition. Vexart needs that runtime for live updates.

## Runtime pipeline

When you call `createApp(() => <App />)`, Vexart:

1. Evaluates JSX with SolidJS.
2. Creates and manages the terminal lifecycle.
3. Walks the TypeScript-owned scene graph and computes layout with Flexily in pure JavaScript.
4. Builds a TypeScript render graph and dispatches paint commands to `libvexart`.
5. Presents through Kitty graphics, using native direct/file/SHM transport as appropriate.

TypeScript owns scene graph, reactivity, walk-tree, Flexily layout, render graph generation, event dispatch, focus, and hit-testing. Rust owns WGPU paint, compositing, Kitty encoding, transport, image assets, canvas display lists, and GPU resources.

## Package map

```ts
// Everything in one barrel — app framework, headless, primitives, styled
import { createApp, Box, Text, useAppTerminal, RichText, Span, WrapRow,
         Button, Input, Textarea, Checkbox, Dialog,
         colors, radius, space, Button as StyledButton } from "vexart"

// Low-level engine/runtime for advanced integrations
import { createTerminal, mount, useTerminalDimensions } from "vexart/engine"
```

## Validation commands

```bash
cargo test
cargo build
bun run typecheck
bun test
bun run test:visual
bun run docs:build
```

## Next steps

- [Components](components.md)
- [Hooks & Signals](hooks.md)
- [Examples & Recipes](examples.md)
- [API Reference](api-reference.md)
- [License Verification](license-verification.md)
