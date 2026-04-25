# Getting Started

This guide walks you through installing Vexart, building the Rust native runtime, and rendering your first pixel-perfect terminal UI.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Bun](https://bun.sh/) | >= 1.1.0 | TypeScript runtime, FFI, package scripts, test runner |
| [Rust](https://www.rust-lang.org/tools/install) | stable | Builds `libvexart`, the native WGPU/Taffy runtime |
| **Terminal with Kitty graphics** | — | Required: Kitty, Ghostty, or WezTerm |

> Vexart is GPU/Kitty-protocol first. Plain ANSI terminals are not a v0.9 target.

## Installation

```bash
git clone https://github.com/commonriskpro/Vexart.git vexart
cd vexart
bun install
cargo build
```

## Your first app

Create `my-app.tsx`:

```tsx
import { createTerminal, mount, useTerminalDimensions } from "@vexart/engine"
import { colors, radius } from "@vexart/styled"

async function main() {
  const terminal = await createTerminal()

  function App() {
    const dims = useTerminalDimensions(terminal)

    return (
      <box
        width={dims.width()}
        height={dims.height()}
        backgroundColor={colors.background}
        alignX="center"
        alignY="center"
      >
        <box
          padding={20}
          backgroundColor={colors.card}
          cornerRadius={radius.xl}
          direction="column"
          gap={8}
        >
          <text color={colors.foreground}>Welcome to Vexart</text>
          <text color={colors.mutedForeground}>Pixel-native terminal rendering</text>
        </box>
      </box>
    )
  }

  mount(App, terminal)
}

main()
```

Run it:

```bash
bun --conditions=browser run my-app.tsx
```

> **Why `--conditions=browser`?** SolidJS exposes its reactive runtime under the `browser` condition. Vexart needs that runtime for live updates.

## Runtime pipeline

When you call `mount(App, terminal)`, Vexart:

1. Evaluates JSX with SolidJS.
2. Mirrors retained nodes into the Rust scene graph.
3. Computes layout with Taffy inside `libvexart`.
4. Paints supported retained primitives/effects with WGPU.
5. Presents through Kitty graphics, using native SHM on supported terminals.

TypeScript remains the JSX/Solid shell and callback boundary. Rust owns the retained scene, layout, render graph, paint, resource, and presentation fast paths.

## Package map

```ts
// Core renderer/runtime
import { createTerminal, mount, useTerminalDimensions } from "@vexart/engine"

// Intrinsic component wrappers
import { Box, Text, RichText, Span, WrapRow } from "@vexart/primitives"

// Headless behavior components
import { Button, Input, Textarea, Checkbox, Dialog } from "@vexart/headless"

// Styled components and design tokens
import { colors, radius, space, Button as StyledButton } from "@vexart/styled"
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
