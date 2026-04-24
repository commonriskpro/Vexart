# Vexart

**Pixel-native terminal rendering engine.** Write JSX, get browser-quality UI in your terminal.

Anti-aliased corners. Drop shadows. Linear & radial gradients. Glow effects. Backdrop blur (glassmorphism). Element opacity. Per-corner radius. All rendered as real GPU pixels — not ASCII boxes.

```tsx
import { mount, createTerminal } from "@vexart/engine"
import { Box, Text } from "@vexart/primitives"

const term = await createTerminal()
mount(() => (
  <Box
    width="100%"
    height="100%"
    backgroundColor={0x141414ff}
    alignX="center"
    alignY="center"
  >
    <Text color={0xfafafaff} fontSize={16}>Hello from Vexart!</Text>
  </Box>
), term)
```

---

## Features

- **GPU-accelerated rendering** — WGPU (Metal/Vulkan/DX12) via a single Rust cdylib
- **Pixel-perfect shapes** — SDF anti-aliased rounded rects, circles, lines, Bezier curves
- **JSX components** — SolidJS `createRenderer`; fine-grained reactive updates, no VDOM
- **CSS-grade layout** — Taffy flexbox in Rust; microsecond layout times
- **Design tokens** — shadcn-compatible dark theme with semantic color, spacing, radius, shadows
- **28 headless components** — Button, Input, Select, Dialog, Combobox, Slider, VirtualList, and more
- **Focus management** — Tab/Shift-Tab cycling, per-node keyboard handlers, focus scoping
- **Drop shadows & glow** — declarative `shadow` and `glow` props, rendered via GPU
- **Gradients** — linear and radial, multi-stop
- **Backdrop filters** — blur, brightness, contrast, saturate, grayscale, invert, sepia, hue-rotate
- **Element opacity** — per-element alpha with isolated compositing
- **Scroll containers** — virtualized lists, programmatic scroll, smooth inertia
- **Animations** — `createTransition` + `createSpring` with 12 easing presets, 30-60 fps adaptive
- **Pointer capture** — drag interactions via `setPointerCapture` / `releasePointerCapture`
- **Form validation** — `createForm()` with sync/async validators, touched/dirty/submitting state
- **Data fetching** — `useQuery` (retry, refetch, interval) and `useMutation` (optimistic + rollback)
- **Syntax highlighting** — Tree-sitter grammars, One Dark and Kanagawa themes
- **Markdown rendering** — inline styling via `<Markdown>` component

---

## Requirements

| Dependency | Version | Notes |
|------------|---------|-------|
| [Bun](https://bun.sh/) | ≥ 1.1.0 | Runtime |
| Rust toolchain | stable | For `cargo build` (native library) |
| Kitty-compatible terminal | — | Kitty, Ghostty, or WezTerm |

> Vexart requires a terminal that supports the [Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/). It exits with a clear error on unsupported terminals.

### Retained runtime default

- The Rust-retained runtime is now the **default path** on Kitty-compatible transports (`direct`, `file`, and `shm`).
- Explicit raw readback stays isolated to offscreen / screenshot / debug flows.
- Emergency fallback for the full retained stack:

```bash
VEXART_RETAINED=0 bun run showcase
```

- Narrow per-feature overrides still exist for debugging, but `VEXART_RETAINED=0` is the compatibility-window kill switch.

---

## Quick Start

```bash
# 1. Install
bun add vexart

# 2. Configure JSX transform (babel.config.js or similar)
import { vexartSolidPlugin } from "vexart/solid-plugin"
# moduleName: "vexart/engine"

# 3. Write your app
```

```tsx
import { mount, createTerminal, createParser } from "@vexart/engine"
import { Box, Text, Button } from "@vexart/primitives"
import { colors, radius, space } from "@vexart/styled"

function App() {
  return (
    <Box
      width="100%"
      height="100%"
      backgroundColor={colors.background}
      direction="column"
      alignX="center"
      alignY="center"
      gap={space[4]}
    >
      <Box
        backgroundColor={colors.card}
        cornerRadius={radius.lg}
        padding={space[6]}
        direction="column"
        gap={space[2]}
      >
        <Text color={colors.foreground} fontSize={16}>Hello from Vexart</Text>
        <Text color={colors.mutedForeground} fontSize={12}>Browser-quality UI in your terminal</Text>
      </Box>
      <Button onPress={() => process.exit(0)}>
        {(ctx) => (
          <Box {...ctx.buttonProps} backgroundColor={colors.primary} cornerRadius={radius.md} padding={space[3]}>
            <Text color={colors.background}>Quit</Text>
          </Box>
        )}
      </Button>
    </Box>
  )
}

const term = await createTerminal()
const app = mount(() => <App />, term)
const parser = createParser((e) => {
  if (e.type === "key" && e.key === "q") process.exit(0)
})
term.onData((d) => parser.feed(d))
```

---

## Architecture

```
JSX (SolidJS createRenderer)
  → Taffy layout (Rust via FFI — microsecond perf)
    → WGPU paint (Rust GPU — SDF primitives, compositor)
      → Kitty graphics protocol
        → Terminal
```

Vexart is **not** a cell-based TUI framework. It renders actual pixels using the [Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/) — the result looks like a browser running inside your terminal.

### Package layers

| Package | Purpose | Layer |
|---------|---------|-------|
| `@vexart/engine` | Core engine: render loop, GPU backend, SolidJS reconciler, input, focus, animation, data fetching | Foundation |
| `@vexart/primitives` | Low-level JSX nodes: `Box`, `Text`, `RichText`, `Span`, `WrapRow` | Primitives |
| `@vexart/headless` | Behaviour-only components: Button, Input, Dialog, Select, Tabs, List, Table, VirtualList, etc. | Headless |
| `@vexart/styled` | Design tokens + styled components (shadcn-compatible): `colors`, `radius`, `space`, `font`, `shadows` | Styled |

Dependencies flow one way: `engine → primitives → headless → styled`. You can use any layer independently.

### Native binary — libvexart

A single Rust cdylib (`native/target/release/libvexart.dylib`) handles all GPU work:
- **Layout** — Taffy flexbox (CSS Grid / Flex)
- **Paint** — WGPU shaders: SDF rounded rects, shadows, gradients, blur, compositor
- **MSDF text** — Multi-channel signed-distance-field font rendering; sharp at any size

Built with:
```bash
cargo build --release
```

---

## Components (28)

| Component | Category | Description |
|-----------|----------|-------------|
| `Box` | Primitives | Layout container with all visual props |
| `Text` | Primitives | Text display with font, color, size |
| `RichText` | Primitives | Multi-span inline text |
| `Span` | Primitives | Inline text span within RichText |
| `WrapRow` | Primitives | Flex-wrap row (Clay compat) |
| `ScrollView` | Containers | Scrollable container with visual scrollbar |
| `Portal` | Containers | Render subtree at root level |
| `Button` | Inputs | Clickable element (headless render context) |
| `Input` | Inputs | Single-line text input |
| `Textarea` | Inputs | Multi-line editor (2D cursor, syntax, keybindings) |
| `Checkbox` | Inputs | Toggle checkbox |
| `Switch` | Inputs | Toggle switch |
| `RadioGroup` | Inputs | Radio option group |
| `Slider` | Inputs | Numeric range (click-to-position + drag) |
| `Select` | Overlays | Dropdown with keyboard navigation |
| `Combobox` | Overlays | Autocomplete with filtering |
| `Dialog` | Overlays | Modal with focus trap + Escape |
| `Tooltip` | Overlays | Delayed tooltip on hover |
| `Popover` | Overlays | Controlled popover panel |
| `Tabs` | Navigation | Tab switcher |
| `Router` | Navigation | Flat + stack navigation |
| `List` | Collections | Scrollable selectable list |
| `Table` | Collections | Data table with row selection |
| `VirtualList` | Collections | Virtualized list (O(1) scroll, fixed-height rows) |
| `ProgressBar` | Display | Progress indicator |
| `Code` | Display | Syntax-highlighted code block |
| `Markdown` | Display | Markdown renderer with inline styling |
| `Diff` | Display | Unified diff viewer |

Also: `createForm` factory, `Toast` (imperative), `createToaster`.

---

## Effects reference

All effects are JSX props — no imperative API needed:

```tsx
// Drop shadow
<Box shadow={{ x: 0, y: 4, blur: 12, color: 0x00000060 }}>

// Multi-shadow
<Box shadow={[{ x: 0, y: 2, blur: 4, color: 0x0000004f }, { x: 0, y: 8, blur: 24, color: 0x00000030 }]}>

// Outer glow
<Box glow={{ radius: 20, color: 0x56d4c8ff, intensity: 60 }}>

// Linear gradient
<Box gradient={{ type: "linear", from: 0x1a1a2eff, to: 0x0a0a0fff, angle: 90 }}>

// Radial gradient
<Box gradient={{ type: "radial", from: 0x56d4c8ff, to: 0x00000000 }}>

// Backdrop blur (glassmorphism)
<Box backdropBlur={12} backgroundColor={0xffffff1a}>

// Per-corner radius
<Box cornerRadii={{ tl: 20, tr: 20, br: 0, bl: 0 }}>

// Interactive states
<Box
  focusable
  backgroundColor={0x1e1e2eff}
  hoverStyle={{ backgroundColor: 0x2a2a3eff }}
  activeStyle={{ backgroundColor: 0x3a3a4eff }}
  focusStyle={{ borderColor: 0x4488ccff, borderWidth: 2 }}
  onPress={() => doAction()}
>
```

---

## Terminal Support

| Terminal | Protocol | Quality |
|----------|----------|---------|
| Kitty | Kitty direct | ✅ Best — native pixel rendering |
| Ghostty | Kitty direct | ✅ Best — native pixel rendering |
| WezTerm | Kitty direct | ✅ Best |
| tmux (inside Kitty/Ghostty) | Kitty placeholder | ✅ Good |
| Other | — | ❌ Exits with clear error message |

---

## Development

```bash
bun install                  # Install JS dependencies
cargo build --release        # Build libvexart (Rust GPU backend)

bun test                     # Run unit tests
bun typecheck                # TypeScript type check
cargo test                   # Run Rust unit tests

bun run example              # Run hello world example
bun run showcase             # Run comprehensive feature showcase (7 tabs)
bun run test:visual          # Run 40-scene golden image visual suite
bun run test:visual:update   # Regenerate visual test references
bun run perf:baseline        # Run perf baseline + save to scripts/perf-baseline.json
bun run build:dist           # Build distributable tge-0.0.1.tgz
```

---

## Examples

See [`examples/README.md`](examples/README.md) for a full list of examples with descriptions and run commands.

Quick-start examples:

```bash
bun run example        # Hello World — first JSX render
bun run demo4          # Interactive — focus, signals, keyboard
bun run demo7          # Scroll containers
bun run demo8          # Component showcase (all 28 components)
bun run demo9          # Shadow & glow effects
bun run showcase       # Comprehensive 7-tab feature showcase
```

---

## Links

- [Product Requirements (PRD)](docs/PRD.md) — phased roadmap and decision log
- [Architecture Reference](docs/ARCHITECTURE.md) — package structure and data-flow contracts
- [API Policy](docs/API-POLICY.md) — public vs. internal API rules
- [Examples](examples/) — working demos for every feature
- [Kitty Graphics Protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
- [WGPU](https://wgpu.rs/) — GPU abstraction (Metal / Vulkan / DX12)
- [Taffy](https://github.com/DioxusLabs/taffy) — Rust layout engine (CSS Flex + Grid)
- [SolidJS Universal](https://github.com/solidjs/solid/tree/main/packages/solid/universal) — JSX reconciler

---

## License

Source-available. Free for personal use, open-source projects, and commercial products with annual revenue under $1M USD. A commercial license is required for products at or above $1M ARR.

See [LICENSE](LICENSE) for full terms.
