# Getting Started

This guide walks you through installing TGE, building the native libraries, and rendering your first pixel-perfect UI in the terminal.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Bun](https://bun.sh/) | >= 1.1.0 | Runtime, FFI, test runner |
| [Zig](https://ziglang.org/) | >= 0.14 | Build the pixel paint engine |
| A C compiler (`cc`) | Any | Build the Clay layout engine |
| **Terminal with Kitty graphics** | — | **Required** — Kitty, Ghostty, or WezTerm |

> TGE is GPU-only. It **will not run** in terminals without Kitty graphics protocol support (xterm, Terminal.app, iTerm2, etc.).

### Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### Install Zig

```bash
# macOS
brew install zig

# Linux / Windows — download from https://ziglang.org/download/
```

## Installation

```bash
git clone https://github.com/commonriskpro/Vexart.git tge
cd tge
bun install
```

## Build Native Libraries

TGE uses two native libraries via `bun:ffi`. Build both before running:

```bash
# 1. Zig pixel + GPU engine (libtge.dylib / libtge.so)
bun run zig:build

# 2. Clay layout engine (libclay.dylib / libclay.so)
bun run clay:build
```

## Your First App

Create `my-app.tsx`:

```tsx
import { createTerminal, mount, useTerminalDimensions } from "@tge/renderer-solid"
import { colors, radius } from "@tge/void"
import { createSignal } from "solid-js"

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
          <text color={colors.foreground}>Welcome to TGE</text>
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

> **Why `--conditions=browser`?** SolidJS exports a reactive runtime under the `browser` condition and a one-shot SSR runtime under `node`. TGE needs the reactive runtime. All example scripts in `package.json` already include this flag.

## Understanding the Pipeline

When you call `mount(App, terminal)`, TGE:

1. **Evaluates JSX** — SolidJS `createRenderer` converts your component tree into TGE nodes
2. **Runs Clay layout** — Nodes are measured and positioned (C via FFI, microseconds)
3. **Renders on GPU** — Layout results are rendered via WGPU using Zig SDF primitives
4. **Outputs via SHM** — The GPU frame is read back and sent to the terminal via Kitty graphics over shared memory

On every signal change, only dirty layers re-render and retransmit.

## Adding Interactivity

```tsx
import { createTerminal, mount, useTerminalDimensions } from "@tge/renderer-solid"
import { Button } from "@tge/components"
import { colors, radius, space } from "@tge/void"
import { createSignal } from "solid-js"

async function main() {
  const terminal = await createTerminal()

  function App() {
    const dims = useTerminalDimensions(terminal)
    const [count, setCount] = createSignal(0)

    return (
      <box
        width={dims.width()}
        height={dims.height()}
        padding={space[6]}
        backgroundColor={colors.background}
        direction="column"
        gap={space[4]}
        alignX="center"
        alignY="center"
      >
        <text color={colors.foreground}>Count: {count()}</text>
        <Button onPress={() => setCount(c => c + 1)}>
          Increment
        </Button>
      </box>
    )
  }

  mount(App, terminal)
}

main()
```

Press **Tab** to focus the button, **Enter** or **Space** to increment. **Ctrl+C** to quit.

## Import Map

Everything you need comes from a small set of packages:

```typescript
// ── Core (single entry point) ──
import {
  createTerminal,         // create + probe terminal
  mount,                  // mount your app
  useTerminalDimensions,  // reactive terminal size
  createSignal,           // from solid-js, re-exported
  For, Show,              // control flow
  useKeyboard, useMouse,  // input hooks
  useFocus, setFocus,     // focus management
  useDrag, useHover,      // interaction hooks
  createTransition,       // animation
  createSpring,           // physics animation
  setPointerCapture,      // drag support
  RGBA,                   // color utility class
} from "@tge/renderer-solid"

// ── UI Components ──
import {
  Button, Input, Textarea, Checkbox, Switch,
  Tabs, List, VirtualList, Table,
  Select, Combobox, Slider,
  Dialog, Toast, Tooltip, Popover,
  ScrollView, Diff, Code, Markdown,
  ProgressBar,
} from "@tge/components"

// ── Canvas / Scene graph ──
import {
  SceneCanvas, SceneNode, SceneEdge,
  createSpaceBackground,
} from "@tge/components"

// ── Design tokens ──
import { colors, space, radius, font, weight, shadows } from "@tge/void"

// ── Windowing system ──
import {
  createWindowManager,
  Desktop, WindowHost, WindowFrame,
  WindowControls, WindowHeader,
} from "@tge/windowing"

// ── SolidJS reactivity ──
import { createSignal, createEffect, createMemo, onCleanup } from "solid-js"
```

## Next Steps

- [Components](components.md) — Every built-in component
- [Hooks & Signals](hooks.md) — Custom interactive components
- [Visual Effects](../manual/visual-effects.md) — Shadows, gradients, blur, glow
- [Layout & Sizing](../manual/layout-and-sizing.md) — Flexbox layout system
- [API Reference](api-reference.md) — Complete package API
- [Examples & Recipes](examples.md) — Common patterns
