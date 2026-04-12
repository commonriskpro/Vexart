# TGE — Terminal Graphics Engine

**Pixel-native terminal rendering engine.** Write JSX, get browser-quality UI in your terminal.

Anti-aliased corners. Drop shadows. Gradients. Glow effects. Backdrop filters (blur, brightness, contrast, grayscale). Element opacity. Interactive focus management. Form validation. Data fetching hooks. Virtualized lists. All rendered as real pixels — not ASCII boxes.

```tsx
import { mount } from "@tge/renderer"
import { Box, Text, Button } from "@tge/components"
import { colors, radius, shadows } from "@tge/void"
import { createTerminal } from "@tge/terminal"

function App() {
  return (
    <Box padding={24} backgroundColor={colors.background} direction="column" gap={16}>
      <Box padding={16} backgroundColor={colors.card} cornerRadius={radius.lg} shadow={shadows.md}>
        <Text color={colors.foreground}>Hello from TGE</Text>
      </Box>
      <Button onPress={() => process.exit(0)}>Quit</Button>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal)
```

## How It Works

```
JSX (SolidJS createRenderer)
  → Clay layout (C via FFI — microsecond perf)
    → Pixel paint (Zig via FFI — SDF primitives)
      → Output backend (Kitty / placeholder / halfblock)
        → Terminal
```

TGE is **not** a cell-based TUI framework. It renders actual pixels using the Kitty graphics protocol, with SDF (Signed Distance Field) anti-aliasing for every shape. The result looks like a browser — but it's your terminal.

## Features

- **Pixel-perfect rendering** — SDF anti-aliased rounded rects, circles, lines, Bezier curves
- **JSX components** — Write SolidJS JSX, TGE handles the rest
- **Real layout engine** — Clay (C library) provides CSS-like flexbox layout in microseconds
- **Design tokens** — Built-in dark theme with semantic color, spacing, radius, and shadow tokens
- **28 headless components** — Button, Input, Select, Dialog, Combobox, Slider, VirtualList, and more
- **Focus management** — Tab/Shift+Tab cycling, per-component keyboard handlers
- **Reactive rendering** — SolidJS signals drive dirty-flag repaint (no VDOM diffing)
- **Layer compositing** — Per-component Kitty images, only dirty layers retransmit
- **Shadow & glow effects** — Drop shadows and glow as Box props, blur-composited in isolation
- **Multiple output backends** — Kitty direct, Kitty placeholder (tmux), halfblock fallback
- **Animations** — `createTransition` and `createSpring` with 12 easing presets and adaptive 30-60fps
- **Runtime theming** — Hot-swappable themes via `ThemeProvider`, `createTheme`, `setTheme`
- **Backdrop filters** — 7 CSS-spec filters: brightness, contrast, saturate, grayscale, invert, sepia, hue-rotate
- **Element opacity** — Per-element opacity multiplier with isolated compositing
- **Declarative focus** — `<box focusable>` with `focusStyle`, `onPress`, `onKeyDown`
- **Focus trap** — Dialog-level focus scoping with `pushFocusScope`
- **Form validation** — `createForm()` with sync/async validators, touched/dirty/submitting
- **Data fetching** — `useQuery` (retry, refetch, interval) and `useMutation` (optimistic + rollback)
- **List virtualization** — `VirtualList` renders only visible items with O(1) scroll
- **ARM64-safe FFI** — All Zig calls use ≤8 params via shared packed buffer (zero allocations)

## Requirements

- [Bun](https://bun.sh/) >= 1.1.0
- [Zig](https://ziglang.org/) >= 0.14 (for building the paint engine)
- A terminal with [Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/) support (Kitty, Ghostty, WezTerm)

## Quick Start

```bash
# Clone and install
git clone https://github.com/commonriskpro/Vexart.git tge
cd tge
bun install

# Build native libraries
bun run zig:build    # Zig pixel engine → libtge.dylib
bun run clay:build   # Clay layout engine → libclay.dylib

# Run examples
bun run demo3        # JSX rendering
bun run demo4        # Interactive (focus, signals)
bun run demo8        # Component showcase
bun run demo9        # Shadow & glow effects
bun run demo10       # Text input form
```

> **Note:** JSX examples require the `--conditions=browser` flag (already set in package.json scripts). SolidJS needs the browser export condition for its reactive runtime.

## Architecture

TGE is a monorepo with 7 packages. Each layer is independent and can be used standalone.

| Package | Purpose | Layer |
|---------|---------|-------|
| [`@tge/terminal`](docs/api-reference.md#tgeterminal) | Terminal detection, capabilities, raw I/O | Foundation |
| [`@tge/input`](docs/api-reference.md#tgeinput) | Keyboard/mouse event parsing | Foundation |
| [`@tge/pixel`](docs/api-reference.md#tgepixel) | Pixel buffer + SDF paint primitives (Zig) | Foundation |
| [`@tge/output`](docs/api-reference.md#tgeoutput) | Kitty/placeholder/halfblock backends | Foundation |
| [`@tge/renderer`](docs/api-reference.md#tgerenderer) | SolidJS reconciler + Clay layout | Integration |
| [`@tge/components`](docs/components.md) | Box, Text, Button, Input, etc. | UI |
| [`@tge/void`](docs/void.md) | Design tokens, theming, and design system | UI |

### Low-Level (no JSX)

```typescript
import { createTerminal } from "@tge/terminal"
import { create, paint } from "@tge/pixel"
import { createComposer } from "@tge/output"

const term = await createTerminal()
const buf = create(term.size.pixelWidth, term.size.pixelHeight)
const composer = createComposer(term.write, term.rawWrite, term.caps)

// Paint directly
paint.roundedRect(buf, 10, 10, 200, 100, 0x4f, 0xc4, 0xd4, 0xff, 12)
paint.drawText(buf, 20, 30, "Hello", 0xe0, 0xe6, 0xf0, 0xff)

// Output to terminal
term.beginSync(term.write)
composer.render(buf, 0, 0, term.size.cols, term.size.rows, term.size.cellWidth, term.size.cellHeight)
term.endSync(term.write)
```

### High-Level (JSX)

```tsx
import { mount, useKeyboard, useMouse, useFocus, onInput, pushFocusScope,
         useQuery, useMutation, createTransition, createSpring } from "@tge/renderer"
import { Box, Text, Button, Input, Checkbox, Tabs, List, ProgressBar, ScrollView,
         Dialog, Select, Switch, RadioGroup, Table, Toast, Router,
         Tooltip, Combobox, Slider, VirtualList, createForm } from "@tge/components"
import { createTerminal } from "@tge/terminal"

function App() {
  return (
    <Box padding={16} backgroundColor={0x0e0e18ff} cornerRadius={8}>
      <Text color={0xe0e6f0ff}>Hello TGE</Text>
    </Box>
  )
}

const terminal = await createTerminal()
mount(App, terminal)
```

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/getting-started.md) | Installation, setup, first app |
| [API Reference](docs/api-reference.md) | Complete API for all packages |
| [Components](docs/components.md) | All components with props and examples |
| [Hooks & Signals](docs/hooks.md) | useKeyboard, useMouse, useFocus, onInput |
| [Design Tokens](docs/tokens.md) | Colors, spacing, radius, shadows |
| [Architecture](docs/architecture.md) | Rendering pipeline, internals |
| [Examples & Recipes](docs/examples.md) | Cookbook for common patterns |
| [Creating Theme Packages](manual/creating-theme-packages.md) | Creating custom design systems/themes |

## Examples

The `examples/` directory contains working demos for every feature:

| Demo | Command | Description |
|------|---------|-------------|
| Phase 1 | `bun run demo` | Imperative pixel painting (no JSX) |
| Phase 2 | `bun run demo2` | Clay layout engine (no JSX) |
| Hello | `bun run demo3` | First JSX rendering |
| Interactive | `bun run demo4` | Focus, signals, keyboard |
| Layers | `bun run demo5` | Per-component layer compositing |
| Dashboard | `bun run demo6` | Multi-widget dashboard (5 layers) |
| Scroll | `bun run demo7` | Scroll containers |
| Components | `bun run demo8` | Full component showcase |
| Effects | `bun run demo9` | Shadows and glow |
| Input | `bun run demo10` | Text input form |
| Showcase | `bun run showcase` | Comprehensive feature showcase (7 tabs) |

## Terminal Support

| Terminal | Backend | Quality |
|----------|---------|---------|
| Kitty | Direct | Best — native pixel rendering |
| Ghostty | Direct | Best — native pixel rendering |
| WezTerm | Direct/Placeholder | Good |
| tmux (in Kitty/Ghostty) | Placeholder | Good — Unicode placeholder mode |
| iTerm2 | Halfblock | Basic — 2 colors per cell |
| Other | Halfblock | Basic — fallback |

## Development

```bash
bun install           # Install dependencies
bun run zig:build     # Build Zig shared library
bun run clay:build    # Build Clay shared library
bun test              # Run tests (128 tests, ~150ms)
bun typecheck         # TypeScript type check
bun run zig:test      # Run Zig tests
```

## Tech Stack

- **[SolidJS](https://www.solidjs.com/)** — Reactive runtime via `createRenderer` (universal mode). No VDOM. Signal-driven dirty tracking.
- **[Clay](https://github.com/nicbarker/clay)** — Layout engine. Single C header, microsecond performance, CSS-like flexbox. Called via `bun:ffi`.
- **[Zig](https://ziglang.org/)** — Pixel painting engine. SDF primitives, alpha blending, box blur. Compiled to shared library, called via `bun:ffi`.
- **[Bun](https://bun.sh/)** — Runtime. FFI for native libraries, TypeScript execution, test runner.

## License

MIT
