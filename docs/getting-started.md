# Getting Started

This guide walks you through installing TGE, building the native libraries, and rendering your first pixel-perfect UI in the terminal.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Bun](https://bun.sh/) | >= 1.1.0 | Runtime, FFI, test runner |
| [Zig](https://ziglang.org/) | >= 0.13 | Build the pixel paint engine |
| A C compiler (`cc`) | Any | Build the Clay layout engine |
| Terminal with Kitty graphics | — | Kitty, Ghostty, or WezTerm |

### Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### Install Zig

```bash
# macOS
brew install zig

# Linux (download from ziglang.org)
# Windows (download from ziglang.org)
```

## Installation

```bash
# Clone the repo
git clone https://github.com/commonriskpro/Vexart.git tge
cd tge

# Install dependencies
bun install
```

## Build Native Libraries

TGE uses two native libraries via `bun:ffi`. You need to build both before running anything:

```bash
# 1. Build Zig pixel engine (libtge.dylib / libtge.so)
bun run zig:build

# 2. Build Clay layout engine (libclay.dylib / libclay.so)
bun run clay:build
```

These produce shared libraries in `zig/zig-out/lib/` and `vendor/` respectively.

## Verify Installation

```bash
# Run the Phase 1 demo (imperative pixel painting, no JSX)
bun run demo

# You should see a rendered card with gradients, rounded rects, and a glowing circle.
# Press Ctrl+C to exit.
```

If you see pixel output — congratulations, TGE is working.

## Your First App

Create a file called `my-app.tsx`:

```tsx
import { mount } from "@tge/renderer"
import { Box, Text } from "@tge/components"
import { surface, text, radius } from "@tge/tokens"
import { createTerminal } from "@tge/terminal"

function App() {
  return (
    <Box
      width="100%"
      height="100%"
      padding={24}
      backgroundColor={surface.void}
      direction="column"
      alignX="center"
      alignY="center"
    >
      <Box
        padding={20}
        backgroundColor={surface.card}
        cornerRadius={radius.xl}
        direction="column"
        gap={8}
      >
        <Text color={text.primary}>Welcome to TGE</Text>
        <Text color={text.muted}>Pixel-native terminal rendering</Text>
      </Box>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal)
```

Run it:

```bash
bun --conditions=browser run my-app.tsx
```

> **Why `--conditions=browser`?** SolidJS exports a reactive runtime under the `browser` condition and a one-shot SSR renderer under `node`. TGE needs the reactive runtime. The demo scripts in `package.json` already include this flag.

## Understanding the Pipeline

When you call `mount(App, terminal)`, TGE:

1. **Evaluates JSX** — SolidJS `createRenderer` converts your component tree into TGE nodes
2. **Runs Clay layout** — Nodes are measured and positioned by the Clay layout engine (C via FFI)
3. **Paints pixels** — Layout results are painted into a pixel buffer using Zig SDF primitives
4. **Outputs to terminal** — The pixel buffer is sent to the terminal via the Kitty graphics protocol

On every signal change, only step 2–4 re-run, and only for dirty regions.

## Adding Interactivity

```tsx
import { mount } from "@tge/renderer"
import { Box, Text, Button } from "@tge/components"
import { surface, text, accent, radius } from "@tge/tokens"
import { createTerminal } from "@tge/terminal"
import { createSignal } from "solid-js"

function App() {
  const [count, setCount] = createSignal(0)

  return (
    <Box width="100%" height="100%" padding={24} backgroundColor={surface.void}>
      <Box padding={16} backgroundColor={surface.card} cornerRadius={radius.lg} direction="column" gap={12}>
        <Text color={text.primary}>Count: {count()}</Text>
        <Button onPress={() => setCount(c => c + 1)}>Increment</Button>
      </Box>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal)
```

Press **Tab** to focus the button, then **Enter** or **Space** to increment. Press **Ctrl+C** to quit.

## Project Structure

When integrating TGE into your project, the key imports are:

```typescript
// Core — always needed
import { createTerminal } from "@tge/terminal"
import { mount } from "@tge/renderer"

// Components — pick what you need
import { Box, Text, Button, Input, Checkbox, Tabs, List, ProgressBar, ScrollView } from "@tge/components"

// Tokens — optional but recommended
import { surface, accent, text, border, spacing, radius, shadow } from "@tge/tokens"

// Hooks — for custom interactive components
import { useKeyboard, useMouse, useFocus, onInput } from "@tge/renderer"

// SolidJS — for reactive state
import { createSignal, createEffect, onCleanup } from "solid-js"
import { For, Show } from "@tge/renderer"
```

## Next Steps

- [Components](components.md) — Learn every built-in component
- [Hooks & Signals](hooks.md) — Build custom interactive components
- [Design Tokens](tokens.md) — Customize the visual theme
- [API Reference](api-reference.md) — Complete API for all packages
- [Examples & Recipes](examples.md) — Common patterns and cookbook
