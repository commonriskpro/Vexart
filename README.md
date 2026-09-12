# Vexart

**Pixel-native terminal rendering engine.** Write JSX, get browser-quality UI in your terminal.

Anti-aliased corners. Drop shadows. Linear & radial gradients. Glow effects. Backdrop blur (glassmorphism). Element opacity. Per-corner radius. All rendered as real GPU pixels — not ASCII boxes.

```tsx
import { createApp, Box, Text, colors } from "vexart"

await createApp(() => (
  <Box
    width="100%"
    height="100%"
    backgroundColor={colors.background}
    alignX="center"
    alignY="center"
  >
    <Text color={colors.foreground} fontSize={16}>Hello from Vexart!</Text>
  </Box>
))
```

---

## Features

- **GPU-accelerated rendering** — WGPU (Metal/Vulkan/DX12) via a single Rust cdylib
- **Pixel-perfect shapes** — SDF anti-aliased rounded rects, circles, lines, Bezier curves
- **JSX components** — SolidJS `createRenderer`; fine-grained reactive updates, no VDOM
- **Incremental layout** — Flexily flexbox (pure JS), reactive tree synced from reconciler; only dirty subtrees recompute
- **Design tokens** — shadcn-compatible dark theme with semantic color, spacing, radius, shadows
- **20 headless components + 2 factories** — Button, Input, Select, Dialog, Combobox, Slider, VirtualList, Table, createForm, createToaster, and more
- **App router** — Declarative file-system router with `<RouteOutlet>` and `useRouter` via `@vexart/app`
- **Focus management** — Tab/Shift-Tab cycling, per-node keyboard handlers, focus scoping
- **Drop shadows & glow** — declarative `shadow` and `glow` props, rendered via GPU
- **Gradients** — two-stop linear and radial gradients (`from`/`to`)
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
| tmux (optional) | ≥ 3.4 | Experimental Kitty passthrough from a Kitty/Ghostty outer terminal; see [`docs/tmux.md`](docs/tmux.md) |

> Vexart requires a terminal that supports the [Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/). It exits with a clear error on unsupported terminals.
>
> tmux support is experimental and requires user-applied `allow-passthrough all` in tmux. The G-037 physical gate covers Kitty direct and private tmux+SHM runs; offscreen checks are not physical terminal evidence. There is no automatic direct/file fallback or ASCII/cell-based fallback; see [`docs/tmux.md`](docs/tmux.md) for setup and limitations.

## Quick Start

```bash
# 1. Install the beta
bun add vexart@beta
```

```toml
# 2. Configure the universal SolidJS JSX transform in bunfig.toml
preload = ["vexart/solid-plugin"]
```

```bash
# 3. Write your app and run it with the browser condition
bun --conditions=browser run app.tsx
```

```tsx
import { createApp, Box, Text, Button, colors, radius, space } from "vexart"

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
      <Button onPress={() => process.exit(0)}>Quit</Button>
    </Box>
  )
}

await createApp(() => <App />)
```

`createApp()` is the managed entry point. For advanced integrations, `mountApp()` exposes the async app lifecycle and `mount()` remains the low-level engine alternative when you need to provide your own terminal and input plumbing.

---

## Architecture

```
JSX (SolidJS createRenderer)
  → Reconciler syncs reactive Flexily tree (incremental layout)
    → TypeScript walk-tree (render metadata collection)
      → Rust libvexart (WGPU paint + composite + readback + Kitty emit)
        → Terminal
```

The Flexily layout tree is **persistent and reactive** — props and tree structure sync from the SolidJS reconciler. `calculateLayout()` only recomputes dirty subtrees. Rust owns the entire output path: GPU paint → readback → compress → Kitty encoding → terminal write. Zero bytes cross the FFI boundary for presentation. Inside tmux, the same GPU-composited frame is sent through local SHM, Kitty Unicode placeholders, and per-sequence tmux passthrough wrappers. The G-037 physical gate validates Kitty direct and private tmux+SHM presentation; offscreen checks do not establish physical terminal support. `a=f` animation updates are not claimed for the Ghostty 1.3.1 target; see the versioned source note in [`docs/tmux.md`](docs/tmux.md).

Vexart is **not** a cell-based TUI framework. It renders actual pixels using the [Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/) — the result looks like a browser running inside your terminal.

### Package layers

| Package | Purpose | Layer |
|---------|---------|-------|
| `@vexart/app` | Managed app framework: router, className mapper, config, CLI helpers | App |
| `@vexart/styled` | Design tokens + styled components (shadcn-compatible): `colors`, `radius`, `space`, `font`, `shadows` | Styled |
| `@vexart/headless` | Behaviour-only components: Button, Input, Dialog, Select, Tabs, List, Table, VirtualList, etc. | Headless |
| `@vexart/primitives` | **Merged into `@vexart/app`**. Use `<Box>`, `<Text>` app components or `<box>`, `<text>` intrinsics directly. Legacy helpers (`Span`, `RichText`, `WrapRow`) were permanently purged. | ❌ Removed |
| `@vexart/engine` | Core engine: render loop, GPU backend, SolidJS reconciler, input, focus, animation, data fetching | Foundation |

Dependencies flow downward across the active packages: `app → styled → headless → engine`. You can use any active layer independently.

### Native binary — libvexart

A single Rust cdylib (`target/release/libvexart.dylib`) handles all GPU and presentation work:
- **Paint** — WGPU shaders: SDF rounded rects, shadows, gradients, blur, compositor
- **MSDF text** — Multi-channel signed-distance-field font rendering + measurement; sharp at any size
- **Presentation** — GPU readback → zlib compress → Kitty encoding → direct/file/SHM transport write. The entire output path lives in Rust — no pixel data crosses back to JS.

Built with:
```bash
cargo build --release
```

---

## Components

| Component | Category | Description |
|-----------|----------|-------------|
| `Box` | Primitives | Layout container with all visual props |
| `Text` | Primitives | Text display with font, color, size |
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
| `Tabs` | Containers | Tab switcher |
| `OverlayRoot` | Containers | Modal overlay host root |
| `List` | Collections | Scrollable selectable list |
| `Table` | Collections | Data table with row selection |
| `VirtualList` | Collections | Virtualized list (O(1) scroll, fixed-height rows) |
| `ProgressBar` | Display | Progress indicator |
| `Code` | Display | Syntax-highlighted code block |
| `Markdown` | Display | Markdown renderer with inline styling |
| `Diff` | Navigation | Unified diff viewer |

Also: `createForm` factory, `createToaster` factory (and router via `@vexart/app`).

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
| Kitty 0.41+ | Kitty direct + SHM | ✅ Best — native pixel rendering |
| Ghostty | Kitty direct | ✅ Best — native pixel rendering |
| WezTerm 2025.04+ | Kitty direct | ✅ Best |
| tmux 3.4+ in Kitty/Ghostty | Kitty passthrough + Unicode placeholders + local SHM | 🧪 Experimental — G-037 physical Kitty/tmux+SHM gate; no pixel-exact or FPS claim; [`docs/tmux.md`](docs/tmux.md) |
| tmux in WezTerm, Alacritty, iTerm2, Windows Terminal | — | ❌ Unsupported or not claimed — exits with clear error |

Direct Kitty, Ghostty, and WezTerm support is unchanged. WezTerm remains a
supported direct target, but this release does not claim the Unicode-placeholder
route through tmux for WezTerm. tmux support requires a recognized outer Kitty or
Ghostty, tmux ≥ 3.4, effective `allow-passthrough all`, client `RGB` features,
and successful runtime probes.
The tmux SHM route conservatively requires exactly one attached client across
the tmux server; Vexart does not edit the user's tmux configuration.

---

## Development

```bash
bun install                  # Install JS dependencies
cargo build --release        # Build libvexart (Rust GPU backend)

bun test                     # Run unit tests
bun typecheck                # TypeScript type check
cargo test                   # Run Rust unit tests

bun run example              # Run hello world example
bun run showcase             # Run the Void component showcase
bun run effects-showcase     # Run the GPU visual-effects showcase in Kitty
bun run showcase:legacy      # Review-only recovery of the 7-tab legacy showcase
bun run test:visual          # Run 40-scene golden image visual suite
bun run test:visual:update   # Regenerate visual test references
bun run build:dist           # Build distributable Vexart npm package

# Performance
bun run perf:baseline        # Save avg frame time baseline
bun run perf:check           # Compare current vs saved baseline (exits 1 on regression)
bun run perf:snapshot        # Full frame breakdown (7 scenarios, per-stage timing)
bun run perf:compare         # Diff current vs pre-optimization baseline
bun run test:golden          # Save visual golden snapshot
bun run test:golden:check    # Compare render output vs golden (pixel-perfect)
```

---

## Examples

See [`docs/examples.md`](docs/examples.md) for a full list of examples with descriptions and run commands.

Quick-start examples:

```bash
bun run example        # Hello World — first JSX render
bun run demo4          # Interactive — focus, signals, keyboard
bun run demo7          # Scroll containers
bun run demo8          # Component showcase
bun run demo9          # Shadow & glow effects
bun run showcase       # Void component showcase
bun run effects-showcase # GPU visual-effects showcase
bun run showcase:legacy # Review-only legacy showcase snapshot
```

---

## Links

- [Product Requirements (PRD)](docs/PRD.md) — phased roadmap and decision log
- [Architecture Reference](docs/ARCHITECTURE.md) — package structure and data-flow contracts
- [API Policy](docs/API-POLICY.md) — public vs. internal API rules
- [Examples](examples/) — working demos for every feature
- [Kitty Graphics Protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
- [WGPU](https://wgpu.rs/) — GPU abstraction (Metal / Vulkan / DX12)
- [Flexily](https://www.npmjs.com/package/flexily) — pure JavaScript layout engine
- [SolidJS Universal](https://github.com/solidjs/solid/tree/main/packages/solid/universal) — JSX reconciler

---

## License

Source-available. Free for personal use, open-source projects, and commercial products with annual revenue under $1M USD. A commercial license is required for products at or above $1M ARR.

See [LICENSE](LICENSE) for full terms.
