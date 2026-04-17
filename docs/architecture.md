# Architecture

How TGE turns JSX into pixels in your terminal.

---

## Rendering Pipeline

```
┌─────────────────────────────────────────────────────┐
│                     YOUR CODE                       │
│                                                     │
│   function App() {                                  │
│     return <box><text>Hello</text></box>            │
│   }                                                 │
│   mount(App, terminal)                              │
└──────────────────────┬──────────────────────────────┘
                       │
             ┌─────────▼─────────┐
             │  1. JSX → Nodes   │
             │  (SolidJS         │
             │   createRenderer) │
             └─────────┬─────────┘
                       │
             ┌─────────▼─────────┐
             │  2. Nodes → Layout│
             │  (Clay, C via FFI)│
             └─────────┬─────────┘
                       │
             ┌─────────▼─────────┐
             │  3. Layout → GPU  │
             │  (WGPU, Zig SDF   │
             │   primitives)     │
             └─────────┬─────────┘
                       │
             ┌─────────▼─────────┐
             │  4. GPU → Terminal│
             │  (Kitty SHM,      │
             │   readback)       │
             └─────────┬─────────┘
                       │
             ┌─────────▼─────────┐
             │  5. Terminal      │
             │  (GPU-rendered    │
             │   pixel image)    │
             └───────────────────┘
```

**TGE is GPU-only.** A terminal with Kitty graphics support is required (Kitty, Ghostty, WezTerm). The renderer throws at startup if the terminal does not support it.

---

## Step 1: JSX → Node Tree

TGE uses SolidJS's `createRenderer` in **universal mode**. SolidJS knows nothing about the DOM — it calls TGE's custom reconciler methods:

```
createElement(tag)        → creates a TGE node
createTextNode(text)      → creates a text node
insertNode(parent, child) → inserts into tree
setProp(node, key, value) → updates a property
```

The Babel plugin (`solid-plugin.ts`) compiles JSX using `babel-preset-solid` with `generate: "universal"` and `moduleName: "@tge/renderer-solid"`.

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

Clay runs in **microseconds** — fast enough for re-layout on every frame.

The output is a flat array of **render commands**: rectangles, borders, text, scissors. Each command has an absolute position and size.

---

## Step 3: Layout → GPU Render

Render commands are submitted to the **GPU renderer backend** (`gpu-renderer-backend.ts`) which translates them to WGPU draw calls via Zig SDF primitives.

### GPU Renderer Backend

The renderer maintains a **layer system**. Nodes with the `layer` prop get their own WGPU render target:

```
box layer  → own WGPU target (LayerSlot)
  text     → rendered into parent's target
box layer  → own WGPU target (LayerSlot)
  text     → rendered into this target
```

Each frame:
1. Walk the render command list
2. Assign commands to layer slots by spatial containment
3. For each dirty layer: run GPU paint operations
4. Composite layers into final output

### SDF Primitives (Zig → WGPU)

All shapes use SDF (Signed Distance Field) anti-aliasing:

```
distance = sdf(pixel, shape)
alpha = smoothstep(0.5, -0.5, distance)
blend(gpu_buffer, pixel, color * alpha)
```

This produces sub-pixel smooth edges. No jagged corners, no aliasing.

| Render Command | Zig Function |
|----------------|-------------|
| Rectangle (no radius) | `tge_fill_rect` |
| Rectangle (with radius) | `tge_rounded_rect` |
| Rectangle (per-corner radius) | `tge_rounded_rect_corners` |
| Border | `tge_stroke_rect` |
| Text | `tge_draw_text` / `tge_draw_text_font` |

### Effects Pipeline

Effects are handled in a side-map (`effectsQueue`) populated during tree walking:

1. If a node has `shadow`, `glow`, `gradient`, `backdropBlur`, backdrop filters, or `opacity`, record the effect config.
2. In `paintCommand()`, match effects to RECT commands.
3. Paint order:
   - **Glow** → blur → composite onto layer target
   - **Shadow** → blur at offset → composite (supports array for multi-shadow)
   - **Backdrop filters** → applied in-place: `backdropBlur`, `backdropBrightness`, `backdropContrast`, `backdropSaturate`, `backdropGrayscale`, `backdropInvert`, `backdropSepia`, `backdropHueRotate`
   - **Background/gradient** → solid color or gradient fill
   - **Opacity** → paint into temp buffer, composite via `withOpacity()`

### Glyph Atlas

Text uses a runtime-generated glyph atlas (~1146 glyphs across 7 Unicode blocks). The atlas is generated once at startup via `@napi-rs/canvas` and uploaded to the GPU as a texture. Glyphs are looked up by codepoint index.

Covered blocks: ASCII, Latin-1 + Extended-A, General Punctuation, Arrows, Mathematical Operators, Miscellaneous Technical, Box Drawing + Block + Geometric + Misc Symbols + Dingbats.

### Scissor Clipping

All paint primitives respect the active scissor (scroll container bounds):

| Strategy | Used for |
|----------|----------|
| Coordinate clamp | Flat rects |
| Temp buffer + copy | Rounded rects, borders, text |
| Region clamp | Backdrop filters |
| Composite clip | Shadows, glow |

---

## Step 4: GPU → Terminal

Each dirty layer is read back from WGPU via **SHM (shared memory)** and transmitted to the terminal using the Kitty graphics protocol.

### Kitty SHM Transport

```
WGPU readback → RGBA bytes in shared memory
  → Kitty SHM command: \x1b_Ga=T,t=s,f=32,...;<SHM path>\x1b\
    → Terminal GPU decodes and renders
```

SHM transport avoids base64 encoding and socket copying — the terminal reads directly from the memory-mapped region. This is the lowest-latency Kitty transport mode.

### Layer Compositing

Layers map to Kitty image placements. Each layer has a stable Kitty image ID. Only dirty layers retransmit:

```
Frame N: layer 1 dirty (counter changed) → transmit ~1KB
Frame N: layer 2 clean (background) → no transmission
```

In a dashboard with 5 widgets, updating one counter retransmits ~1KB instead of the entire screen.

---

## Reactive Update Cycle

```
Signal change (createSignal setter)
  → SolidJS fires effect
    → setProp(node, key, newValue)  ← pre-parses color/sizing ONCE
      → markDirty()
        → next frame tick (adaptive fps):
          → Clay beginLayout/endLayout
            → walk commands
              → GPU paint dirty layers
                → SHM readback + Kitty output
```

Animation active → 60fps. Idle → lower fps. The entire cycle from signal change to pixels on screen takes single-digit milliseconds.

### FFI ARM64 Safety

ARM64 passes function arguments in 8 registers (x0–x7). `bun:ffi` silently corrupts parameters beyond the 8th.

**Solution:** All FFI functions that exceed 8 params use a packed buffer pattern:
- TypeScript packs params into a shared `ArrayBuffer(64)` via `DataView`
- A single `Uint8Array` view is passed as one pointer argument
- Zig unpacks via `@bitCast` (zero-cost reinterpret)

The `ArrayBuffer` is allocated **once at module load**. Zero allocations per FFI call.

---

## Focus System

```
<box focusable>
  → reconciler.setProperty("focusable", true)
    → registerNodeFocusable(node) → FocusEntry in active scope
      → Tab/Shift+Tab cycles through scope
        → focusedId() signal updates
          → updateInteractiveStates() sets node._focused
            → resolveProps() merges focusStyle
              → paintCommand renders merged visual props
```

**Focus scopes** enable focus traps (e.g., Dialog):
- `pushFocusScope()` creates a new scope — Tab only cycles within it
- Nested dialogs create nested traps

**Event bubbling**: `onPress` bubbles up the parent chain. Per-node mouse events (`onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseOver`, `onMouseOut`) do NOT bubble. Pointer capture (`setPointerCapture`/`releasePointerCapture`) routes all mouse events to a specific node, enabling drag.

Interactive elements have a minimum hit area of one terminal cell to ensure small elements are clickable.

---

## Module Dependency Graph

```
@tge/components ──→ @tge/renderer-solid ──→ @tge/pixel ──→ Zig (libtge)
       │                    │                    │
       │                    │                    └──→ bun:ffi
       │                    │
       ├──→ @tge/void        ├──→ @tge/terminal
       │                    │
       │                    ├──→ @tge/input
       │                    │
       │                    ├──→ @tge/output-kitty ──→ Kitty SHM
       │                    │
       │                    └──→ Clay (libclay) ──→ bun:ffi
       │
       └──→ solid-js (signals, control flow)

@tge/windowing ──→ @tge/renderer-solid
```

**Single entry point for apps:** `@tge/renderer-solid` re-exports everything you need — `createTerminal`, `mount`, all hooks, all types.

---

## Key Design Decisions

### Why GPU-only?

CPU raster pipelines (painting to a `Uint8Array` then base64-encoding for Kitty) are bottlenecked by:
- Memory bandwidth (CPU → GPU copy per frame)
- Encoding cost (base64 is ~33% overhead)
- No layer caching (entire screen retransmitted on any change)

The GPU path eliminates all three: WGPU renders directly, SHM avoids encoding, layer caching retransmits only dirty regions.

### Why SolidJS (not React)?

- **No VDOM** — fine-grained reactive subscriptions, only dirty `setProp` calls re-execute
- **`createRenderer`** — 10-method universal renderer API, no reconciler complexity
- **Tiny runtime** — ~7KB reactive core, no scheduler, no fiber tree

### Why Clay (not Yoga/Taffy)?

- **Single C header** — no cmake, no cargo
- **Microsecond performance** — designed for 60fps game UIs
- **Renderer-agnostic** — outputs render commands, not DOM mutations

### Why Zig (not Rust/C)?

- **Zero overhead FFI** — compiles to C ABI, `bun:ffi` calls with no marshaling cost
- **Comptime** — font atlas computed at compile time
- **Simplicity** — SDF primitives are ~200 lines each, write directly into caller's buffer

### Why Bun (not Node)?

- **`bun:ffi`** — native FFI without N-API or node-gyp
- **Fast startup** — <50ms vs Node's 200ms+
- **TypeScript native** — runs `.ts`/`.tsx` directly

### Why Pixel-Native (not Cell-Based)?

Cell-based TUI frameworks (Blessed, Ink, Bubbletea) cannot render:
- Anti-aliased rounded corners
- Drop shadows with blur
- Gradients
- Glow effects
- Sub-cell positioning

TGE renders these natively because it owns the pixel buffer.

---

## Build System

### Zig Shared Library

```bash
bun run zig:build
# cd zig && zig build -Doptimize=ReleaseFast
# → zig/zig-out/lib/libtge.dylib (macOS) or libtge.so (Linux)
```

### Clay Shared Library

```bash
bun run clay:build
# cc -shared -O2 -o vendor/libclay.dylib -DCLAY_IMPLEMENTATION vendor/clay_wrapper.c
```

### SolidJS Babel Plugin

```bash
# Automatically loaded via bunfig.toml preload
preload = ["./solid-plugin.ts"]
```

Transforms `.tsx` files through `babel-preset-solid` with universal renderer mode, targeting `@tge/renderer-solid`.
