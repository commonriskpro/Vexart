# Architecture

How TGE turns JSX into pixels in your terminal.

---

## Rendering Pipeline

```
                 ┌─────────────────────────────────────────────┐
                 │                  YOUR CODE                  │
                 │                                             │
                 │   function App() {                          │
                 │     return <Box><Text>Hello</Text></Box>    │
                 │   }                                         │
                 │   mount(App, terminal)                      │
                 └──────────────────┬──────────────────────────┘
                                    │
                          ┌─────────▼─────────┐
                          │  1. JSX → Nodes    │
                          │  (SolidJS          │
                          │   createRenderer)  │
                          └─────────┬──────────┘
                                    │
                          ┌─────────▼─────────┐
                          │  2. Nodes → Layout │
                          │  (Clay, C via FFI) │
                          └─────────┬──────────┘
                                    │
                          ┌─────────▼─────────┐
                          │  3. Layout → Paint │
                          │  (Zig via FFI,     │
                          │   SDF primitives)  │
                          └─────────┬──────────┘
                                    │
                          ┌─────────▼─────────┐
                          │  4. Paint → Output │
                          │  (Kitty graphics   │
                          │   protocol)        │
                          └─────────┬──────────┘
                                    │
                          ┌─────────▼─────────┐
                          │  5. Terminal       │
                          │  (GPU-rendered     │
                          │   pixel image)     │
                          └───────────────────┘
```

---

## Step 1: JSX → Node Tree

TGE uses SolidJS's `createRenderer` in **universal mode**. This means SolidJS knows nothing about the DOM — it calls TGE's custom reconciler methods:

```
createElement(tag)        → creates a TGE node
createTextNode(text)      → creates a text node
insertNode(parent, child) → inserts into tree
setProp(node, key, value) → updates a property
```

The Babel plugin (`solid-plugin.ts`) compiles JSX using `babel-preset-solid` with `generate: "universal"` and `moduleName: "@tge/renderer"`. This emits imports from `@tge/renderer` instead of the DOM renderer.

**Key point:** SolidJS doesn't create a virtual DOM. It generates fine-grained reactive subscriptions. When a signal changes, only the specific `setProp()` call that reads it re-executes.

---

## Step 2: Node Tree → Layout

Each TGE node is mapped to a Clay layout element. The tree is walked and translated to Clay API calls:

```
openElement() → configureSizing() → configureLayout() → configureRectangle() → closeElement()
```

Clay is a single C header (`vendor/clay.h`) compiled to a shared library. It provides CSS-like flexbox layout:

- Direction (row/column)
- Padding, gap
- Alignment (horizontal/vertical)
- Sizing (fixed, grow, fit-content, percentage)
- Border, corner radius
- SCISSOR clipping (for scroll containers)

Clay runs in **microseconds** — fast enough for 30fps re-layout on every frame.

The output is a flat array of **render commands**: rectangles, borders, text, scissors. Each command has an absolute position and size.

---

## Step 3: Layout → Pixel Paint

Render commands are painted into a `PixelBuffer` (RGBA, 4 bytes per pixel) using the Zig paint engine.

Each command type maps to a Zig FFI call:

| Command | Zig Function |
|---------|-------------|
| RECTANGLE (no radius) | `tge_fill_rect` |
| RECTANGLE (with radius) | `tge_rounded_rect` |
| BORDER | `tge_stroke_rect` |
| TEXT | `tge_draw_text` |

All paint functions use **SDF (Signed Distance Field)** anti-aliasing. The SDF is evaluated per-pixel:

```
distance = sdf(pixel, shape)
alpha = smoothstep(0.5, -0.5, distance)
blend(buffer, pixel, color * alpha)
```

This produces sub-pixel smooth edges — no jagged corners, no aliasing artifacts.

### Effects Pipeline

Shadow and glow effects are NOT part of Clay's layout. They're handled in a side-map (`effectsQueue`) populated during tree walking:

1. During tree walk, if a node has `shadow` or `glow` props, record the effect with the node's layout bounds.
2. Before painting the main commands, process the effects queue:
   - Create a **temporary isolated PixelBuffer**
   - Paint the shape (rounded rect) in the temp buffer
   - Apply blur to the temp buffer
   - Composite temp buffer onto main buffer using `src-over` alpha blending
3. Then paint the main commands on top.

**Why isolated buffers?** The blur function is destructive in-place — it modifies ALL pixels in the rectangular region, not just the ones you painted. Without isolation, blur would corrupt neighboring content.

---

## Step 4: Pixel Buffer → Terminal

The pixel buffer is converted to terminal output by the output backend.

### Kitty Direct Backend

The Kitty graphics protocol transmits pixel data as base64-encoded PNG/raw chunks:

```
\x1b_Ga=T,f=32,s=<width>,t=<height>,p=<placement_id>,q=2;
<base64 pixel data>
\x1b\
```

The terminal GPU decodes and renders the image. This is FAST — no per-cell overhead.

### Kitty Placeholder Backend (tmux)

Inside tmux, direct Kitty graphics don't work. Instead, TGE uses Unicode placeholder mode:

1. Upload the image to the terminal
2. Print a grid of Unicode placeholder characters (`\u10EEEE`)
3. Each character is decorated with diacritics that encode the image ID and position
4. The terminal maps placeholders to image regions

### Halfblock Backend (Fallback)

For terminals without Kitty graphics, TGE falls back to halfblock characters (`▀`):

- Each character cell represents 2 vertical pixels
- Foreground color = top pixel, background color = bottom pixel
- Resolution: 2 colors per cell (vs full RGBA with Kitty)

---

## Layer Compositing

When a `<Box>` has the `layer` prop, it's promoted to its own Kitty image:

```tsx
<Box layer>          ←  gets its own Kitty image (ID 1)
  <Text>Static</Text>
</Box>
<Box layer>          ←  gets its own Kitty image (ID 2)
  <Text>{counter()}</Text>
</Box>
```

Each layer:
- Has its own `PixelBuffer`
- Tracks its own dirty flag
- Only retransmits to the terminal when its content changes
- Stays in terminal GPU VRAM when clean

**Spatial command assignment**: Clay emits a flat array of commands. TGE assigns each command to a layer based on spatial containment — if the command's bounding box falls within a layer's anchor rectangle, it belongs to that layer.

This is critical for performance. In a dashboard with 5 widgets, updating one counter only retransmits ~1KB instead of the entire screen.

---

## Reactive Update Cycle

```
Signal change (createSignal setter)
  → SolidJS fires effect
    → setProp(node, key, newValue)
      → markDirty()
        → next frame tick (30fps):
          → Clay beginLayout/endLayout
            → walk commands
              → paint dirty regions
                → output dirty layers
```

The entire cycle from signal change to pixels on screen takes single-digit milliseconds.

---

## Module Dependency Graph

```
@tge/components ──→ @tge/renderer ──→ @tge/pixel ──→ Zig (libtge)
       │                  │                │
       │                  │                └──→ bun:ffi
       │                  │
       ├──→ @tge/void     ├──→ @tge/terminal ──→ process.stdin/stdout
       │                  │
       │                  ├──→ @tge/input
       │                  │
       │                  ├──→ @tge/output ──→ Kitty protocol
       │                  │
       │                  └──→ Clay (libclay) ──→ bun:ffi
       │
       └──→ solid-js (signals, control flow)
```

### Independence

Each lower package can be used without the packages above it:

- **@tge/pixel** alone: imperative pixel painting
- **@tge/pixel + @tge/output**: paint and display, no layout
- **@tge/pixel + @tge/output + @tge/terminal**: full imperative pipeline
- **+ @tge/renderer**: add JSX and layout
- **+ @tge/components + @tge/void**: full framework experience

---

## Build System

### Zig Shared Library

```bash
bun run zig:build
# → cd zig && zig build -Doptimize=ReleaseFast
# → produces zig/zig-out/lib/libtge.dylib (macOS) or libtge.so (Linux)
```

The Zig build compiles:
- `lib.zig` — FFI exports
- `rect.zig`, `circle.zig`, `line.zig` — SDF primitives
- `shadow.zig` — Box blur
- `halo.zig` — Radial glow
- `gradient.zig` — Linear/radial gradients
- `text.zig` — Bitmap text renderer
- `font_atlas.zig` — Generated SF Mono 14px glyph data

### Clay Shared Library

```bash
bun run clay:build
# → cc -shared -O2 -o vendor/libclay.dylib -DCLAY_IMPLEMENTATION vendor/clay_wrapper.c
```

Clay is a single C header. The wrapper adds TGE-specific functions: `configure_clip`, `get_scroll_offset`, `set_id`.

### SolidJS Babel Plugin

```bash
# Automatically loaded via bunfig.toml preload
preload = ["./solid-plugin.ts"]
```

The plugin transforms `.tsx` files through `babel-preset-solid` with universal renderer mode, targeting `@tge/renderer` instead of the DOM.

---

## Key Design Decisions

### Why SolidJS (not React)?

- **No VDOM** — SolidJS compiles to direct signal subscriptions. When a signal changes, only the exact DOM operation (in TGE's case, `setProp`) re-executes. React's reconciliation would re-render entire subtrees.
- **`createRenderer`** — SolidJS provides a universal renderer API (10 methods). TGE implements these 10 methods to own the entire rendering pipeline. React's `react-reconciler` is far more complex.
- **Tiny runtime** — SolidJS's reactive core is ~7KB. No scheduler, no fiber tree, no synthetic events.

### Why Clay (not Yoga/Taffy)?

- **Single C header** — No build system, no cmake, no cargo. One `#include`, one `cc` command.
- **Microsecond performance** — Clay is designed for 60fps game UIs. It's faster than any other layout engine we benchmarked.
- **Renderer-agnostic** — Clay outputs render commands, not DOM mutations. Perfect for TGE's pixel pipeline.

### Why Zig (not Rust/C)?

- **Zero overhead FFI** — Zig compiles to C ABI with no runtime. `bun:ffi` calls Zig functions with no marshaling cost.
- **Comptime** — The font atlas is a comptime-evaluated 2D array. No runtime file loading.
- **Simplicity** — SDF paint primitives are ~200 lines of Zig each. No allocator needed (we write directly into the caller's buffer).

### Why Bun (not Node)?

- **`bun:ffi`** — Native FFI without N-API or node-gyp. Load a `.dylib` and call functions directly.
- **Fast startup** — Bun starts in <50ms. Node takes 200ms+ with similar workload.
- **TypeScript native** — No tsc build step needed. Bun runs .ts/.tsx directly.

### Why Pixel-Native (not Cell-Based)?

Cell-based TUI frameworks (Blessed, Ink, Bubbletea) are limited to character grid resolution. They can't render:
- Anti-aliased rounded corners
- Drop shadows with blur
- Gradients
- Glow effects
- Sub-cell positioning

TGE renders at full pixel resolution. A 1920x1080 terminal gets 1920x1080 pixels of rendering space — same as a browser window.
