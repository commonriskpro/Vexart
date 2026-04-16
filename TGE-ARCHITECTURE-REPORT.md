# TGE Architecture Report

**Version**: 1.0
**Last Updated**: April 2026
**Status**: Maintainer Reference

---

## Executive Summary

TGE (Terminal Graphics Engine) is a pixel-native terminal rendering engine that produces browser-quality UI in the terminal. Developers write JSX (SolidJS), TGE renders with anti-aliased corners, shadows, gradients, glow effects, backdrop blur (glassmorphism), and per-corner radius.

The architecture spans **5 distinct layers** with **3 native tiers**:

```
JSX (SolidJS createRenderer)
  → Clay layout (C via FFI, microsecond perf)
    → Pixel paint (Zig via FFI, SDF primitives)
      → GPU canvas (Rust/WGPU, offscreen targets)
        → Output backend (Kitty/placeholder/halfblock)
          → Terminal
```

**Key innovations:**
- **Pixel-native**: Every element is positioned in pixel space, not character cells
- **Zero-alloc FFI**: All native calls use ≤8 parameters via packed `ArrayBuffer` — eliminates ~18,000 allocations/s at 60fps
- **GPU-accelerated rendering**: WGPU canvas bridge with 5-layer strategy and hysteresis
- **Adaptive render loop**: Idle=8–30fps, active=up to 60fps with interaction boost windows
- **Layer compositing**: Spatial command assignment via scissor pairs, color anchoring, and text content matching
- **Subtree transforms**: Background snapshot capture → flat paint → inverse affineBlit post-pass

---

## ASCII Diagrams

### Full Pipeline (JSX → Terminal)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DEVELOPER CODE                                  │
│                                                                          │
│   <box cornerRadius={16} shadow={{ x:0, y:4, blur:12 }}>                   │
│     <text>Hello World</text>                                              │
│   </box>                                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SOLIDJS RECONCILER                                 │
│  createComponent → createElement → createTextNode                           │
│  insertNode / insert / spread / setProp / mergeProps                       │
│  effect / memo / use                                                       │
│  Source: packages/renderer/src/reconciler.ts (248 lines)                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TGENode TREE                                     │
│  TGENode { id, tag, props, children, parent, layout?, rect?,                │
│            interactive?, effect?, refs?, element? }                       │
│  Source: packages/renderer/src/node.ts (425 lines)                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WALK TREE + LAYOUT                                 │
│  walkTree() → clay_ffi.computeLayout() → RenderCommand[]                   │
│  clay.ts bindings → clay_wrapper.c → clay.h (Clay v0.14, 4961 lines C)     │
│  Source: packages/renderer/src/clay.ts (400 lines)                         │
│          vendor/clay_wrapper.c (538 lines)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RENDER GRAPH                                      │
│  RenderCommand[] → graph.addOperation() → typed op nodes                    │
│  10 op types: rectangle, border, text, image, canvas,                      │
│               effect, raw-command, container-start/end                      │
│  GPU vs CPU routing via effect.metadata                                    │
│  Source: packages/renderer/src/render-graph.ts (511 lines)                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌─────────────────────────────┐       ┌─────────────────────────────┐
│       GPU PATH              │       │       CPU PATH                 │
│  gpu-renderer-backend.ts   │       │  pixel/index.ts (zig FFI)     │
│  ├─ WGPU canvas bridge     │       │  ├─ tge_rounded_rect()        │
│  │   (Rust, lib.rs 3869L)  │       │  ├─ tge_linear_gradient()      │
│  ├─ 5-layer strategy       │       │  ├─ tge_blur()                 │
│  │   (hysteresis 5-frame)   │       │  ├─ tge_halo() (glow)          │
│  ├─ Layer targets cache    │       │  ├─ tge_filter_*()             │
│  ├─ Glyph/texture caches   │       │  ├─ tge_draw_text()           │
│  └─ Backdrop filter chain   │       │  └─ tge_affine_blit()         │
│  Source: gpu-renderer-     │       │  Source: packages/pixel/       │
│          backend.ts (1700+L)│       │          src/index.ts (559L)   │
└─────────────────────────────┘       └─────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LAYER COMPOSITOR                                   │
│  layers.ts: Layer { id, geometry, dirty, nodes[], commands[] }             │
│  3-phase assignment:                                                        │
│    Phase 1: Scroll → scissor pairs (viewport isolation)                     │
│    Phase 2: Background → color anchoring (backgrounds, decorations)         │
│    Phase 3: Static → spatial assignment (text, images, buttons)            │
│  Source: packages/renderer/src/layers.ts (232 lines)                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          OUTPUT BACKENDS                                    │
│  output/index.ts → TerminalBackend { begin(), commit(), ... }                │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │  KITTY BACKEND  │  │ PLACEHOLDER     │  │  HALFBLOCK FALLBACK        │ │
│  │  (primary)      │  │ (tmux support)  │  │  (ansionly terminals)      │ │
│  │  direct + shm   │  │  U+2800-U+28FF  │  │  block elements + ansi     │ │
│  │  + file         │  │  braille chars  │  │  1 cell = 2px vertical    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│  Source: packages/output/src/*.ts                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                              ┌───────────┐
                              │ TERMINAL  │
                              │  (Kitty,  │
                              │  WezTerm, │
                              │  etc.)    │
                              └───────────┘
```

### Native Bridge Architecture (Triple Stack)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TYPESCRIPT LAYER                                  │
│  packages/pixel/src/index.ts              packages/renderer/src/             │
│  ├─ paint primitives (40+)               ├─ clay.ts (Clay FFI)              │
│  ├─ packed params ArrayBuffer pattern     ├─ wgpu-canvas-bridge.ts          │
│  └─ runtime font atlas loading           └─ gpu-renderer-backend.ts          │
└─────────────────────────────────────────────────────────────────────────────┘
                    │                               │                    │
                    ▼                               ▼                    ▼
         ┌──────────────────┐           ┌──────────────────┐     ┌──────────────────┐
         │      ZIG         │           │        C         │     │      RUST        │
         │  libtge.dylib    │           │  libclay.dylib   │     │  libwgpu_bridge  │
         │  (609 FFI export)│           │  (clay_wrapper.c) │     │  (cdylib)        │
         ├──────────────────┤           ├──────────────────┤     ├──────────────────┤
         │ @font-face SDF   │           │ text measurement  │     │ WGPU v26 GPU     │
         │ rounded rects    │           │ render cmd readback│     │ offscreen targets│
         │ circles/lines    │           │ element ID hashing │     │ glyph/text layer │
         │ gradients        │           │                   │     │ shape/transform  │
         │ shadows/glows    │           │ clay.h (4961L C)  │     │ gradients/glows  │
         │ backdrop filters │           │ flexbox layout    │     │ backdrop filters │
         │ blend modes      │           │                   │     │ image composite  │
         │ affine blit      │           │                   │     │                  │
         │ text rendering   │           │                   │     │ stable C ABI v4  │
         └──────────────────┘           └──────────────────┘     │ bridge v5        │
                                                                     └──────────────────┘
```

### Input Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TERMINAL INPUT STREAM                                │
│  ANSI escape sequences:                                                     │
│    CSI Mouse:  CSI ? 9 6 0 0  ; 1  ; 1  M   (mouse press)                  │
│    CSI Mouse:  CSI ? 9 6 0 0  ; 1  ; 1  m   (mouse release)               │
│    CSI Mouse:  CSI < 0 ; 1 ; 1  T           (scroll up)                    │
│  SGR mode (extended):  CSI < 64;1;1M                                                │
│  Source: packages/input/src/index.ts (45 lines)                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       INPUT PARSER (ANSI/SGR)                               │
│  InputEvent { type: "mouse" | "key" | "focus" | "paste" | "resize",          │
│               data: MouseEvent | KeyEvent | FocusEvent | ... }              │
│  Source: packages/input/src/parser.ts                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INPUT SIGNAL BRIDGE                                  │
│  input.ts: bridge input events → SolidJS signals                            │
│  ├─ mouseX, mouseY (fractional cell → pixel)                                │
│  ├─ mouseButtons, lastMouseButtons                                          │
│  ├─ focusedId, hoveredId, activeId, draggingId                               │
│  ├─ keys, ctrlHeld, shiftHeld, altHeld, metaHeld                            │
│  ├─ clipboard                                                              │
│  └─ terminalWidth, terminalHeight                                          │
│  Source: packages/renderer/src/input.ts (144 lines)                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌─────────────────────────────┐       ┌─────────────────────────────┐
│    HIT TESTING              │       │    INTERACTIVE STATES        │
│  hitTest(x, y) → nodeId     │       │  updateInteractiveStates()    │
│  ├─ transform-aware bounds   │       │  ├─ hoverStyle (MouseOver)  │
│  ├─ pointer capture check   │       │  ├─ activeStyle (MouseDown) │
│  └─ scroll container culling │       │  ├─ focusStyle (keyboard)   │
│  Source: loop.ts walkTree    │       │  └─ press event bubbling    │
└─────────────────────────────┘       └─────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FOCUS SYSTEM                                        │
│  focus.ts: focusRegistry, focusScopes[], focusedId                          │
│  ├─ Tab navigation (forward/backward within scope)                         │
│  ├─ Focus ring: canvas layer + TTY overlay                                  │
│  ├─ Focus trap for Dialog                                                  │
│  └─ Focus restoration on popover/dialog close                              │
│  Source: packages/renderer/src/focus.ts (328 lines)                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Layer Compositing (3-Phase Assignment)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LAYER GEOMETRY: Layer { id, geometry, dirty, nodes[], commands[] }         │
│  Geometry: { x, y, width, height, zIndex, floating?, scissor? }           │
│  Source: packages/renderer/src/layers.ts (232 lines)                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────┬─────────────────┬─────────────────────────────────────────┐
│  PHASE 1      │  PHASE 2        │  PHASE 3                                │
│  SCROLL       │  BACKGROUND     │  STATIC                                 │
│               │                 │                                         │
│ Extract all   │ Color anchoring: │ Spatial assignment:                     │
│ scrollX/scroll│ Assign bg layers│ Match by:                               │
│ containers    │ by exact color  │   • text content + layout rect           │
│               │ match           │   • image rect + z-index                │
│ Generate      │                 │   • scissor region intersection         │
│ scissor pairs│ Handle gradient │                                         │
│ for each      │ backgrounds     │ Handle transform subtrees:               │
│ viewport      │ separately      │   1. capture bg snapshot                │
│               │                 │   2. paint flat to layer                 │
│ Assign to     │ Merge adjacent  │   3. inverse affineBlit post-pass      │
│ scroll layers │ same-color bg   │   (reverse depth order)                 │
│               │                 │                                         │
└───────────────┴─────────────────┴─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LAYER OUTPUT → GPU FRAME COMPOSITOR                                         │
│  gpu-frame-composer.ts: GPU mode → WGPU blit layers → Kitty composite        │
│                         CPU mode → pixel buffer → Kitty composite           │
│  Source: packages/renderer/src/gpu-frame-composer.ts (109 lines)             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Package Dependency Graph

```
                                    ┌─────────────────┐
                                    │    EXAMPLES     │
                                    │   *.tsx demos   │
                                    └────────┬────────┘
                                             │ bun run
                                             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                              @tge/components                                │
│  35+ headless UI: Box, Text, ScrollView, Button, Tabs, Select, Dialog,     │
│  Slider, Combobox, Table, List, VirtualList, Router, SceneCanvas, etc.       │
│  Props spread: ctx.buttonProps, ctx.toggleProps, ctx.tabProps, etc.         │
│  Source: packages/components/src/index.ts                                    │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │ depends on
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                               @tge/void                                     │
│  shadcn-inspired design system: Button, Card, Badge, Avatar, Dialog,        │
│  Select, Switch + semantic tokens (colors, radius, space, shadows)          │
│  Built on @tge/components, adds themed variants                             │
│  Source: packages/void/src/index.ts                                         │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │ depends on
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                            @tge/renderer                                   │
│  Core engine: reconciler, loop, clay FFI, layer system, GPU renderer,      │
│  GPU frame composer, input, focus, interaction, scroll, selection,        │
│  animation, router, text layout, font atlas, image pipeline, canvas API,  │
│  particles, matrix transforms, extmarks, tree-sitter, plugins/slots        │
│  Source: packages/renderer/src/index.ts (main export hub, mount())         │
└─────────────────┬──────────────────┬──────────────────┬────────────────────┘
                 │                  │                  │
        ┌────────┴────────┐  ┌──────┴──────┐  ┌────────┴────────┐
        ▼                 ▼  ▼             ▼  ▼                 ▼
┌───────────────┐ ┌──────────────────┐ ┌──────────────┐ ┌─────────────────────┐
│  @tge/pixel   │ │  @tge/terminal   │ │  @tge/output │ │ @tge/devtools       │
│               │ │                  │ │              │ │                     │
│ Zig FFI wrap: │ │ Terminal factory:│ │ Kitty backend│ │ MCP-based devtools  │
│ 40+ primitives│ │ detection, caps,  │ │ placeholder  │ │ server              │
│ packed params │ │ raw I/O, resize, │ │ halfblock    │ │ Source:             │
│ runtime fonts │ │ clipboard, OSC   │ │ layer comp   │ │ devtools/           │
│ Source:       │ │ Source:          │ │ Source:      │ │                     │
│ packages/pixel│ │ packages/terminal│ │ packages/out │ │                     │
└───────────────┘ └──────────────────┘ └──────────────┘ └─────────────────────┘

   NATIVE DEPENDENCIES (not npm, built separately):
   ┌──────────────────┐  ┌───────────────────┐  ┌─────────────────────────┐
   │      ZIG         │  │    C (Clay)        │  │       RUST              │
   │  libtge.dylib    │  │  libclay.dylib     │  │  libwgpu_bridge.dylib   │
   │  (zig build)     │  │  (C wrapper build) │  │  (cargo build)          │
   └──────────────────┘  └───────────────────┘  └─────────────────────────┘
```

### GPU Renderer — 5-Layer Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  5-LAYER STRATEGY (with 5-frame hysteresis)                                │
│  gpu-renderer-backend.ts — gpuLayerStrategy()                               │
│  Source: packages/renderer/src/gpu-renderer-backend.ts (~1700 lines)       │
│                                                                          │
│  Strategy determination (each frame):                                     │
│    if (newStrategy != lastStrategy) resetHysteresis()                     │
│    if (hysteresisFrames < 5) use lastStrategy                              │
│    else use newStrategy                                                    │
│                                                                          │
│  Strategy types:                                                          │
│  ┌─────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ LAYERED │  │  SPRITE     │  │  FULL        │  │  FULL_LAYER          │ │
│  │ target  │  │  blit only  │  │  REDRAW      │  │  (scroll isolation)  │ │
│  │ per-layer│ │ no caches   │  │  all pixels  │  │  offscreen targets   │ │
│  │ offscreen│ │ simple      │  │  recomposite │  │  for each layer      │ │
│  └─────────┘  └─────────────┘  └──────────────┘  └──────────────────────┘ │
│                                                                          │
│  CACHE HIERARCHY:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ Layer targets cache (id → OffscreenCanvas, eviction on LRU)         │ │
│  ├─────────────────────────────────────────────────────────────────────┤ │
│  │ Text image cache (text content + fontId + fontSize → OffscreenCanvas)│ │
│  ├─────────────────────────────────────────────────────────────────────┤ │
│  │ Glyph atlas cache (WGSL texture + GPU-resident)                     │ │
│  ├─────────────────────────────────────────────────────────────────────┤ │
│  │ Canvas sprite cache (canvasId → OffscreenCanvas)                    │ │
│  ├─────────────────────────────────────────────────────────────────────┤ │
│  │ Transform sprite cache (transformId → OffscreenCanvas)             │ │
│  ├─────────────────────────────────────────────────────────────────────┤ │
│  │ Fallback sprite cache (raw pixels → OffscreenCanvas)                 │ │
│  ├─────────────────────────────────────────────────────────────────────┤ │
│  │ Backdrop source cache (blurred pixel sources)                        │ │
│  │ Backdrop sprite cache (processed blur results)                       │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  BACKDROP FILTER PIPELINE:                                                 │
│  1. readback from WGPU layer target (GPU → CPU)                           │
│  2. GPU filter chain: brightness → contrast → saturate → grayscale       │
│                        → invert → sepia → hue-rotate                     │
│  3. composite back to layer target                                        │
│  4. CPU fallback path via pixel.ts primitives                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Subsystem Analysis

### @tge/renderer — Core Engine

**Entry point**: `packages/renderer/src/index.ts` — exports 61 values, 38 types via `mount()`.

The renderer is the monolith. At its core is the **render loop** (`loop.ts`, 2500+ lines) which orchestrates the entire frame pipeline:

1. **walkTree()** — walks the TGENode tree, computes layout via Clay FFI, produces `RenderCommand[]`
2. **assignLayers()** — 3-phase layer assignment (scroll → background → static)
3. **paintFrame()** — routes commands to GPU or CPU backend
4. **compositeFrame()** — GPU frame compositor merges layers to final output

Key modules:

| Module | Lines | Purpose |
|--------|-------|---------|
| `reconciler.ts` | 248 | SolidJS `createRenderer` — 10 methods, no VDOM |
| `clay.ts` | 400 | Clay C FFI bindings — layout compute, text measure |
| `node.ts` | 425 | TGENode type, layout rect, press/mouse event types |
| `loop.ts` | 2500+ | Render loop, walkTree, layer assignment, frame rendering |
| `layers.ts` | 232 | Layer type, geometry, dirty tracking, compositing |
| `gpu-renderer-backend.ts` | ~1700 | GPU backend with 5-layer strategy + hysteresis |
| `gpu-frame-composer.ts` | 109 | GPU vs CPU mode switching compositor |
| `wgpu-canvas-bridge.ts` | 822 | TS bindings for Rust WGPU bridge |
| `input.ts` | 144 | Input event → SolidJS signal bridge |
| `focus.ts` | 328 | Focus registry, scopes, Tab nav, focus ring |
| `interaction.ts` | 83 | Interaction mode (drag), layer freezing |
| `scroll.ts` | ~400 | Scroll container, viewport, programmatic scroll |
| `selection.ts` | ~200 | Selection signal, text selection via extmarks |
| `text-layout.ts` | ~300 | Multi-path text: bitmap atlas, GPU glyph, runtime fonts |
| `font-atlas.ts` | ~250 | Bitmap font atlas (JetBrains Mono 7x13, 89 glyphs) |
| `image.ts` | ~300 | Image pipeline: decode, cache, render |
| `canvas.ts` | ~400 | Imperative canvas API, particles, transforms |
| `matrix.ts` | ~200 | 3×3 matrix transforms, affine decomposition |
| `render-graph.ts` | 511 | Typed render graph ops, GPU vs CPU routing |
| `animation.ts` | ~400 | Transitions, springs, easing presets |
| `router.ts` | ~300 | Flat + stack navigation |
| `extmarks.ts` | ~300 | Virtual text, virtual lines, selection via extmarks |
| `tree-sitter/` | ~1000 | Syntax highlighting, parser workers, WASM grammars |
| `plugins.ts` | ~200 | Slot registry, plugin hooks |
| `handle.ts` | ~100 | createHandle, createScrollHandle, resetScrollHandles |
| `dirty.ts` | ~150 | Dirty region tracking |
| `damage.ts` | ~100 | Frame damage computation |

### @tge/pixel — Zig FFI Wrapper

**Entry point**: `packages/pixel/src/index.ts` (559 lines) — 40+ paint primitives.

Every function uses the **packed params pattern**: a shared `ArrayBuffer(64)` zeroed per call, with fields written at specific byte offsets. This eliminates heap allocation entirely — the buffer is stack-allocated in the calling TypeScript.

```
tge_fill_rect(offset=0,  w=4, h=4,  color=4)          → 5 params
tge_rounded_rect(offset=0, w=4, h=4, r=4, color=20)   → 5 params
tge_linear_gradient(offset=0, w=4, h=4, angle=20, ...) → 8 params (packed)
tge_blur(offset=0, w=4, h=4, radius=20)              → 4 params
tge_halo(offset=0, w=4, h=4, radius=20, color=24,     → 8 params (packed)
         intensity=28, plateau=32)
tge_draw_text(offset=0, x=0, y=4, text=8, ...)        → 7 params (packed)
tge_affine_blit(offset=0, ...)                         → 8 params (packed)
```

All FFI exports are prefixed `tge_`. The shared library is built with Zig's stdlib-free target for minimal binary size.

### @tge/output — Terminal Output

Single entry point (`packages/output/src/index.ts`, 32 lines) that exports the `TerminalBackend` interface and creates the appropriate backend:

```typescript
interface TerminalBackend {
  begin(): void
  drawImage(data: Uint8Array, width: number, height: number, x: number, y: number): void
  drawLayer(layerId: string, data: Uint8Array, width: number, height: number, x: number, y: number): void
  clearScreen(): void
  moveCursor(x: number, y: number): void
  commit(): void
  getColorAt(x: number, y: number): number
}
```

Backends: **Kitty** (primary, direct + shm + file), **Placeholder** (tmux, U+2800–U+28FF braille), **Halfblock** (fallback, block elements).

### @tge/terminal — Terminal Factory

`packages/terminal/src/index.ts` (310 lines). Creates the terminal instance:

```
detectCaps() → probeKitty() / probeWezTerm() / probeFallback()
             ↓
createTerminal({ backend, cols, rows })
             ↓
rawMode() → setupRawMode() → enableMouseTracking() → enableBracketedPaste()
```

Key capabilities: **Kitty keyboard protocol**, **SGR mouse**, **focus tracking via OSC**, **tmux passthrough**, **clipboard via OSC 52**, **terminal resize handling**.

### @tge/input — Input Parser

Minimal parser (`packages/input/src/index.ts`, 45 lines) that delegates to `parser.ts`:

```typescript
type InputEvent =
  | { type: "mouse"; data: MouseEvent }
  | { type: "key"; data: KeyEvent }
  | { type: "focus"; data: FocusEvent }
  | { type: "paste"; data: PasteEvent }
  | { type: "resize"; data: ResizeEvent }
```

Supports **ANSI** (out-of-box), **SGR** (extended), and **URXVT** mouse modes.

### @tge/components — Headless UI

35+ components built on the core engine's interaction props. Each exports a render function that takes a `render` callback:

```typescript
Button({ onPress, render: (ctx) => <box {...ctx.buttonProps}>...</box> })
Checkbox({ checked, onChange, render: (ctx) => <box {...ctx.toggleProps}>...</box> })
Tabs({ value, onChange, render: (ctx) => <For each={items}>{(item) =>
  <box {...ctx.tabProps(item.id)}>...</box>
}</For> })
VirtualList({ items, onSelect, renderContainer: (ctx) => <box {...ctx.containerProps}>...</box> })
```

The **VirtualList** stands out — handles hover/click internally at container level, unlike other components that spread per-item props.

### @tge/void — Design System

Themed wrapper around `@tge/components` with semantic tokens:

```typescript
// Tokens
colors.background    // 0x141414ff
colors.primary       // 0xe5e5e5ff
colors.border        // 0xffffff1a
radius.sm/md/lg/xl   // 6/8/10/14
space[1]..space[10]  // 4..40px
shadows.sm/md/lg/xl   // preset configs

// Themed components
<Button variant="default" | "secondary" | "outline" | "ghost" | "destructive" />
<Card><CardHeader><CardTitle><CardDescription><CardContent><CardFooter />
<Badge variant="default" | "secondary" | "outline" | "destructive" />
<VoidDialog />
<VoidSelect />
<VoidSwitch />
```

---

## Native Bridge Architecture

### Zig Layer (`libtge.dylib`)

**Source**: `zig/src/lib.zig` (609 lines, 30+ FFI exports)

Built with `zig build -Doptimize=ReleaseFast`. Targets stdlib-free for minimal binary.

FFI safety contract: all exported functions take ≤8 parameters (ARM64 register limit). Functions with >5 params use the packed `ArrayBuffer` pattern where a single `[*c]const u8` pointer points to a 64-byte buffer with values at specific offsets.

| Category | Functions |
|----------|-----------|
| Basic shapes | `tge_fill_rect`, `tge_rounded_rect`, `tge_stroke_rect`, `tge_rounded_rect_corners`, `tge_stroke_rect_corners` |
| Circles/lines | `tge_filled_circle`, `tge_stroked_circle`, `tge_line`, `tge_bezier` |
| Effects | `tge_blur`, `tge_halo` (glow with plateau+falloff), `tge_inset_shadow` |
| Gradients | `tge_linear_gradient`, `tge_radial_gradient`, `tge_linear_gradient_multi`, `tge_radial_gradient_multi`, `tge_conic_gradient`, `tge_gradient_stroke` |
| Backdrop filters | `tge_filter_brightness`, `tge_filter_contrast`, `tge_filter_saturate`, `tge_filter_grayscale`, `tge_filter_invert`, `tge_filter_sepia`, `tge_filter_hue_rotate` |
| Blend/composite | `tge_blend_mode` (16 CSS modes) |
| Text | `tge_draw_text`, `tge_measure_text`, `tge_load_font_atlas` (ids 1–15), `tge_draw_text_font` |
| Transform | `tge_affine_blit`, `tge_rgba_blit` |

### C/Clay Layer (`libclay.dylib`)

**Source**: `vendor/clay_wrapper.c` (538 lines) + `vendor/clay.h` (Clay v0.14, 4961 lines C)

Clay is a flexbox layout engine in a single C header, fork-extended with `space-between` alignment. The C wrapper provides FFI-friendly C exports:

```c
// clay_wrapper.c exports
void tge_clay_init(uint32_t width, uint32_t height);
void tge_clay_set_text_measurement(C_TextMeasurementFn fn);
void tge_clay_begin_layout();
void tge_clay_set_root_dimensions(float width, float height, ...);
void tge_clay_element_define_layout(uint64_t id, ...);
void tge_clay_end_layout();
uint32_t tge_clay_get_render_commands_length();
void tge_clay_read_render_commands(float* buffer, uint32_t length);
uint64_t tge_clay_hash_string(const char* str, uint32_t len);
```

Clay layout is deterministic: `tge_clay_begin_layout()` → `element_define_layout()` for each node → `tge_clay_end_layout()` → read back float buffer of render commands.

Render commands encode: element ID, position (x, y), dimensions (w, h), corner radii (4×), background color, border color/width (4×), shadow config, content (text/glyph), etc.

### Rust/WGPU Layer (`libwgpu_bridge.dylib`)

**Source**: `native/wgpu-canvas-bridge/src/lib.rs` (3869 lines, `cdylib`)

Stable C ABI version 4, bridge version 5. Provides GPU-accelerated canvas rendering via WGPU v26.

Typed FFI structs for zero-copy parameter passing:

```rust
#[repr(C)]
pub struct RectFillInstance { pub x:f32, pub y:f32, pub w:f32, pub h:f32, pub color:u32 }
#[repr(C)]
pub struct ImageInstance { pub src_x:f32, pub src_y:f32, pub dst_x:f32, pub dst_y:f32, pub w:f32, pub h:f32, pub z:f32, pub alpha:f32 }
#[repr(C)]
pub struct GlyphInstance { pub x:f32, pub y:f32, pub glyph_index:u32, pub font_size:f32, pub color:u32, pub z:f32 }
#[repr(C)]
pub struct ImageTransformInstance { pub src_x:f32, pub src_y:f32, pub matrix:[f32;9], pub w:f32, pub h:f32, pub alpha:f32 }
#[repr(C)]
pub struct LinearGradientInstance { pub x:f32, pub y:f32, pub w:f32, pub h:f32, pub angle:f32, pub from:u32, pub to:u32, pub z:f32 }
#[repr(C)]
pub struct RadialGradientInstance { pub x:f32, pub y:f32, pub w:f32, pub h:f32, pub from:u32, pub to:u32, pub z:f32 }
#[repr(C)]
pub struct CircleInstance { pub x:f32, pub y:f32, pub radius:f32, pub color:u32, pub z:f32 }
#[repr(C)]
pub struct GlowInstance { pub x:f32, pub y:f32, pub w:f32, pub h:f32, pub radius:f32, pub color:u32, pub intensity:f32, pub z:f32 }
```

GPU path features: offscreen render targets, glyph atlas texture, shape instancing, gradient shaders, glow/halo shaders, image compositing with alpha, backdrop filter chain (brightness → contrast → saturate → grayscale → invert → sepia → hue-rotate), matrix transforms.

---

## Rendering & Compositing Pipeline

### Retained Tree + Immediate Mode Hybrid

The TGENode tree is **retained** (SolidJS reactive updates), but the actual drawing is **immediate mode** — each frame computes layout and repaints. Dirty tracking (`dirty.ts`) avoids unnecessary work for unchanged regions.

### Layer Assignment Algorithm

`layers.ts` implements 3-phase assignment:

**Phase 1 — Scroll isolation**: Extract all `scrollX`/`scrollY` containers. Generate scissor pairs per viewport. Assign to scroll layers. Skip nodes outside viewport during hit-testing.

**Phase 2 — Background anchoring**: Color-based assignment for solid backgrounds and decorations. Merges adjacent same-color backgrounds. Handles gradient backgrounds separately (use exact color match for gradients).

**Phase 3 — Spatial assignment**: For remaining static content (text, images, buttons). Uses three matching heuristics:
1. Text content + layout rect match
2. Image rect + z-index match
3. Scissor region intersection

**Transform subtrees**: When a node has `matrix` transform, the subtree gets special treatment:
1. Capture background snapshot of the transform region
2. Paint subtree flat (no transform) to the layer
3. Apply inverse `affineBlit` as a post-pass in reverse depth order

### GPU Renderer Backend

`gpu-renderer-backend.ts` (~1700 lines) implements:

- **5-layer strategy** with hysteresis: `layered` → `sprite` → `fullRedraw` → `fullLayer` → back to `layered`
- **Per-strategy caches**: layer targets, text images, glyph atlases, canvas sprites, transform sprites, fallback sprites, backdrop sources/sprites — all with LRU eviction limits
- **Text rendering**: multi-path — bitmap atlas (ASCII, JetBrains Mono 7×13, 89 glyphs), WGPU glyph layer for GPU path, runtime font atlas loading via `tge_load_font_atlas` (ids 1–15)
- **Damage tracking**: frame damage computation, dirty regions
- **Subtree transforms**: matrix decomposition, snapshot capture, affine blit post-pass

### Render Graph

`render-graph.ts` (511 lines) defines 10 operation types:

```typescript
type RenderOpType =
  | "rectangle"    // { x, y, w, h, color, cornerRadius?, cornerRadii? }
  | "border"       // { x, y, w, h, color, width, cornerRadius? }
  | "text"         // { x, y, content, fontSize?, color? }
  | "image"        // { x, y, w, h, imageId }
  | "canvas"       // { canvasId, x, y, w, h }
  | "effect"       // { effect, x, y, w, h, opacity?, }
  | "raw-command"  // { command: "clear" | "fill", x, y, w, h, color? }
  | "container-start" | "container-end"
```

GPU vs CPU routing: effects (shadow, glow, backdrop filters) are routed to GPU backend. Basic shapes and text can use either path.

---

## Input, Focus, Pointer & Drag Architecture

### Input Signal Bridge

`input.ts` (144 lines) bridges raw terminal input → SolidJS signals:

```typescript
mouseX: Signal<number>        // fractional pixel X
mouseY: Signal<number>        // fractional pixel Y
mouseButtons: Signal<number>  // bitmask: bit 0=left, 1=middle, 2=right
lastMouseButtons: Signal<number>
focusedId: Signal<string | null>
hoveredId: Signal<string | null>
activeId: Signal<string | null>
draggingId: Signal<string | null>
keys: Signal<Map<string, boolean>>
ctrlHeld: Signal<boolean>
shiftHeld: Signal<boolean>
altHeld: Signal<boolean>
metaHeld: Signal<boolean>
clipboard: Signal<string>
terminalWidth: Signal<number>
terminalHeight: Signal<number>
```

### Hit Testing

`loop.ts` walkTree performs hit testing with transform-aware bounds. Scissor culling prevents off-screen items from receiving events. Pointer capture overrides hit-test (captured node always receives events).

### Interactive States

`updateInteractiveStates()` merges styles based on state:
- **Hover**: `hoverStyle` props applied when mouse enters bounds (`onMouseOver`)
- **Active**: `activeStyle` props applied when mouse button pressed (`onMouseDown`)
- **Focus**: `focusStyle` props applied when node is keyboard-focused (`focusedId` matches)

If `focusStyle`, `hoverStyle`, or `activeStyle` define `borderWidth`, the engine reserves that space in Clay with a transparent border when inactive — prevents layout jitter (like CSS `outline`).

### Event Bubbling (onPress)

`onPress` events bubble up the parent chain. Each handler receives `PressEvent { stopPropagation, propagationStopped }`. Mouse position is normalized to node-local coordinates.

### Per-Node Mouse Events (no bubbling)

`onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseOver`, `onMouseOut` are dispatched directly to the target node. Each receives `NodeMouseEvent { x, y, nodeX, nodeY, width, height }`.

### Pointer Capture

```typescript
setPointerCapture(nodeId)     // Lock — all mouse events go to this node
releasePointerCapture(nodeId) // Unlock — auto-released on button up
```

### Focus System

`focus.ts` (328 lines):
- **Focus registry**: maps nodeId → focusable element
- **Focus scopes**: isolate Tab navigation within a scope (Dialog, Popover)
- **Tab navigation**: forward/backward within scope, wraps at boundaries
- **Focus ring**: dual display — canvas layer for GPU path, TTY overlay for fallback
- **Focus trap**: Dialog automatically traps focus within
- **Focus restoration**: returns focus to trigger element on close

### Drag Mode

`interaction.ts` (83 lines): When `draggingId` is set, the render loop enters drag mode — freezes layer compositing (prevents shimmer during fast pointer movement), increases interaction boost window to 520ms.

### Hover & Drag Hooks

```typescript
const [dragState, dragProps] = useDrag(onDragStart, onDragMove, onDragEnd, options)
const [hoverState, hoverProps] = useHover(onHoverEnter, onHoverLeave, options)
```

---

## Build System

```
bun install
     ↓
zig/build.zig ──→ zig/libtge.dylib    (zig build -Doptimize=ReleaseFast)
     │
vendor/clay_wrapper.c + clay.h ──→ vendor/libclay.dylib (C build)
     │
native/wgpu-canvas-bridge/Cargo.toml ──→ libwgpu_bridge.dylib (cargo build)
     │
bun --conditions=browser run examples/hello.tsx
bun run showcase
```

16 smoke/benchmark scripts test GPU/WGPU/Kitty paths. Bun FFI loads native libs at runtime.

---

## Example Architecture

| Example | Lines | What It Proves |
|---------|-------|---------------|
| `hello.tsx` | ~100 | Phase 3: basic box + text rendering |
| `interactive.tsx` | ~300 | Phase 5: reactive updates, onPress, hover/active styles |
| `layers.tsx` | ~250 | Per-layer granularity, independent compositing |
| `scroll.tsx` | ~300 | ScrollView, viewport, scissor clipping, programmatic scroll |
| `effects.tsx` | ~400 | Shadow, glow, gradient, backdrop blur, interactive states |
| `showcase.tsx` | 1598 | All features: effects, forms, dialogs, table, tabs, select, scroll, tree-sitter, markdown, etc. |
| `lightcode-gpu-first.tsx` | ~300 | GPU-first rendering path, WGPU canvas backend |
| `lightcode-gpu.tsx` | ~300 | GPU rendering with GPU frame compositor |
| `wgpu-canvas-demo.tsx` | ~200 | Direct WGPU canvas bridge API |
| `lightcode.tsx` | ~200 | CPU path via pixel.ts primitives |
| `textarea.tsx` | ~300 | Textarea with 2D cursor, syntax highlighting |
| `syntax.tsx` | ~200 | Tree-sitter integration, multiple language parsers |
| `markdown.tsx` | ~200 | Markdown renderer with inline styling |
| `diff.tsx` | ~150 | Unified diff viewer |
| `virtual-list.tsx` | ~300 | VirtualList with keyboard nav + mouse hover/click |

---

## Risks, Coupling Hotspots & Architectural Debt

### Risks

1. **Triple native stack maintenance burden** — Zig, C, and Rust each have their own build pipeline, ABI compatibility requirements, and debugging story. When Zig or WGPU releases break API, all three need updating. The Rust `lib.rs` at 3869 lines is particularly large for a native bridge.

2. **GPU vs CPU path divergence** — Two complete rendering pipelines with different code paths, caches, and behaviors. The CPU path via `pixel.ts` and the GPU path via `wgpu-canvas-bridge.ts` may produce visually different results for edge cases.

3. **Subtree transform complexity** — The 3-step transform pipeline (snapshot → flat paint → inverse blit) is elegant but fragile. Background content behind transformed elements must be captured before the transform paints, but the capture must not include sibling transforms. Multiple overlapping transforms compound the complexity.

4. **Layer assignment heuristics** — The 3-phase assignment with text content matching and spatial heuristics is non-deterministic in edge cases. Two nodes with identical text content at overlapping positions could be assigned to the same layer incorrectly.

5. **Tree-sitter integration** — WASM grammars, worker threads, and parser lifecycle management add significant complexity. If the main thread blocks, syntax highlighting may lag.

6. **tmux passthrough** — The Kitty graphics protocol does not work through tmux. The Placeholder backend (braille characters) is a degraded fallback. Users in tmux/screen get inferior visuals.

### Coupling Hotspots

1. **`loop.ts` as God Module** — 2500+ lines handling: walkTree, layout, layer assignment, interactive states, hit testing, paint commands, compositing, scroll, animation, selection, focus ring, debug overlay. Any change to rendering or input ripples through this file.

2. **`clay.ts` ↔ `clay_wrapper.c` tight coupling** — The float buffer layout (field offsets) is shared between the C wrapper's render command write and the TypeScript's read. Changing any Clay layout property requires updating both.

3. **`gpu-renderer-backend.ts` ↔ `wgpu-canvas-bridge.ts`** — The bridge's C ABI struct layouts must exactly match the Rust `#[repr(C)]` definitions. Any change to `lib.rs` structs requires TS updates.

4. **Reconciler ↔ Node props** — `reconciler.ts` parses props into structured data that `loop.ts` consumes. The prop normalization (color parsing, shadow normalization, etc.) happens once in `setProperty`, but the loop reads raw u32 values. If the normalization logic drifts from the read logic, visual bugs appear.

5. **`@tge/components` ↔ `@tge/renderer`** — Components spread `ctx.buttonProps` etc. onto box elements. These prop sets are implicit contracts. If the renderer changes what props an interactive node needs, components must be updated.

### Architectural Strengths

1. **ARM64 FFI safety via packed params** — Zero heap allocations at 60fps for native calls. This is the right approach and eliminates GC pressure entirely.

2. **Adaptive render loop** — Idle at 8–30fps, active up to 60fps, with interaction boost windows prevents CPU spinning when idle while ensuring responsiveness during input.

3. **Layer compositing design** — The 3-phase assignment is well-thought-out. Spatial isolation via scissor pairs prevents cross-layer contamination.

4. **Component architecture** — Headless components with render callbacks and spread props is idiomatic and flexible. The `ctx.buttonProps` pattern is clean.

5. **Multi-backend output** — Kitty/Placeholder/Halfblock covers 99% of terminals. The backend interface is clean and adding new backends (Sixel, iTerm2) would be straightforward.

6. **Design tokens in `@tge/void`** — Semantic tokens separate from implementation. shadcn-inspired conventions make the component API familiar.

### Architectural Debt

1. **No integration tests** — The smoke scripts (`bun run smoke:*`) test individual paths but there's no end-to-end test that exercises JSX → terminal output. Given the triple-native-stack complexity, a rendering regression is easy to introduce.

2. **Debugging story** — `toggleDebug()` outputs text to the terminal showing FPS, strategy, layers, etc. But debugging a visual regression in the GPU path vs CPU path requires deep knowledge of both pipelines.

3. **Font atlas limits** — Bitmap atlas has 89 glyphs (ASCII subset). Non-ASCII text falls back to runtime font loading. The boundary between these two paths is not surfaced to users.

4. **`any` type in reconciler** — `setProperty()` uses `any` for prop values. With 55+ props across multiple prop groups (layout, visual, effects, interaction, backdrop, compositing, text, floating), type safety is lacking.

5. **No persistent state** — No serialization of the TGENode tree or layout state. App restart always starts fresh. For apps that need state restoration, this is extra work.

6. **`pointer-events: none` gap** — `pointerPassthrough` exists for floating elements but there's no general `pointer-events` property. Complex overlay scenarios may need this.

7. **No accessibility story** — Terminal apps have inherent accessibility limitations, but there's no ARIA-like attribute system, screen reader announcements, or keyboard navigation guides for complex widgets (Table, VirtualList, etc.).

---

## Key Learnings

- **Packed `ArrayBuffer(64)` for FFI is the right pattern** — eliminates all heap allocation for native calls. Zig, C, and Rust all agree on ≤8 params for ARM64 FFI safety. This pattern should be documented prominently.

- **Adaptive render loop is essential for terminal apps** — Idle terminals don't need 60fps rendering. The boost windows (key=220ms, scroll=320ms, pointer=520ms) balance responsiveness with power savings.

- **Layer assignment is the hardest part of compositing** — The 3-phase approach (scroll → background → static) works but has edge cases. Text content matching as a heuristic is fragile — two nodes with identical text at different positions could collide.

- **Transform subtrees need 3-step pipeline** — snapshot → flat paint → inverse blit. This is non-obvious and the comments in `loop.ts` at lines ~1800-2200 are essential for maintainers to understand it.

- **GPU strategy hysteresis prevents oscillation** — The 5-frame hysteresis window prevents the GPU renderer from oscillating between strategies when the scene is on the boundary (e.g., frequent small updates vs large redraws).

- **Reconciler is intentionally minimal** — SolidJS `createRenderer` with 10 methods and no VDOM. This is the correct trade-off — the reconciler transforms JSX to TGENodes, nothing more.

- **Hit-testing must account for transforms** — A node's screen bounds may not match its layout rect when transforms are involved. The `getNodeScreenBounds()` function must apply ancestor transforms.

- **Pointer capture overrides hit-testing** — Essential for drag. The captured node receives ALL mouse events regardless of cursor position. `releasePointerCapture` auto-releases on button up.

- **Focus scopes enable Dialog focus traps** — Push/pop scope with Tab navigation confined to the scope. Focus restoration on close returns to the trigger element. Clean mental model.

- **The triple native stack (Zig/C/Rust) is ambitious** — Zig for pixel primitives, C for Clay layout, Rust for WGPU. Each adds build complexity. The project manages it with separate build commands in `package.json`, but this is a maintenance burden.
