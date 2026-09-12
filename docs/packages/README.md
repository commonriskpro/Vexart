# Vexart — System Architecture & Documentation (Version 3)

Vexart is a pixel-native, GPU-accelerated terminal user interface (TUI) engine. Developers write declarative JSX compiled via SolidJS universal reconciliation, while Vexart computes subpixel geometry via Flexily, compiles render graph queues in TypeScript, and executes hardware-accelerated WGPU rendering pipelines in native Rust (`libvexart`). Visual output—including per-corner anti-aliased radii, multi-layered Gaussian drop shadows, radial and conic gradients, glowing halos, real-time backdrop blur (glassmorphism), and MSDF vector typography—is transmitted directly to modern terminal emulators using high-throughput Kitty graphics protocols and POSIX shared memory.

---

## 1. 4-Tier Architecture Stack

Vexart strictly separates presentation, interaction behavior, visual theming, layout, and hardware acceleration across four distinct layers, spanning TypeScript (Bun) and native Rust:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Tier 1: Application Framework (@vexart/app)                            │
│  - App lifecycle orchestration (createApp, mountApp)                    │
│  - File-system router, nested layouts, specificity scoring, RouteOutlet │
│  - className compiler (Tailwind utility subset, LRU theme cache)        │
│  - Canonical primitives: <Box> and <Text> (with className support)      │
│  - Unified barrel entry point ("vexart")                                │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ imports & wraps
┌────────────────────────────────────▼────────────────────────────────────┐
│  Tier 2: Styled Design System (@vexart/styled)                          │
│  - Void Design System (OLED-calibrated dark theme semantic tokens)      │
│  - Zero-remount runtime theming via fine-grained SolidJS signal getters │
│  - 28+ pre-styled UI components, structural layouts & typography scales │
│  - Variant style merging with intrinsic element properties              │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ imports & wraps
┌────────────────────────────────────▼────────────────────────────────────┐
│  Tier 3: Headless Interaction Primitives (@vexart/headless)             │
│  - 25 unstyled interaction and collection primitives                    │
│  - Render props, prop getters, compound contexts & state factories      │
│  - Terminal accessibility: focus contracts, Vim navigation, focus scopes│
│  - Zero styling opinions, absolute behavioral and state integrity       │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ renders to intrinsics
┌────────────────────────────────────▼────────────────────────────────────┐
│  Tier 4: Core Engine (@vexart/engine)                                   │
│  - SolidJS universal reconciler (createRenderer<TGENode>)               │
│  - Intrinsics: <box>, <text>, <img>, <canvas> (no DOM, no VDOM)         │
│  - Flexily layout engine (packages/internal-flexily: Flexbox + Grid)    │
│  - Render graph construction (7 RenderGraphOp kinds), layer boundaries  │
│  - Fast-path compositor, dual-cadence & 3-priority frame scheduler     │
│  - Terminal lifecycle, ANSI/Kitty parser, transform-aware hit testing   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ bun:ffi (binary command buffers, max 8 args)
┌────────────────────────────────────▼────────────────────────────────────┐
│  Native Runtime Boundary (native/libvexart — Rust / WGPU 29.0.1)        │
│  - Headless WGPU device in SHARED_PAINT with 21 render pipelines        │
│  - 2MB base vertex buffer with peak tracking & 120-frame decay cooldown │
│  - 50 C FFI exports (#[no_mangle] extern "C" fn vexart_*)               │
│  - MSDF vector typography (fdsm, ttf-parser, fontdb) & dynamic atlas    │
│  - Retained layer registry & LRU resource manager (128MB VRAM budget)   │
│  - Kitty transport: Direct Base64 (4096B zlib), Temp File, POSIX SHM,  │
│    and Tmux Unicode Placeholder (U+10EEEE + combining marks via DCS)   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Critical Architectural Invariants

Every subsystem in Vexart is governed by non-negotiable architectural invariants:

1. **Reconciler Singleton Invariant**: The root `vexart` barrel and `@vexart/engine` must resolve to exactly one SolidJS universal reconciler instance (`createRenderer<TGENode>`). Consumer JSX is compiled with Babel using `moduleName: "vexart/engine"`. Creating multiple reconcilers fragments node tracking, breaks fine-grained reactivity, and leaks retained layout nodes.
2. **Ownership Boundary Invariant (DEC-014)**: TypeScript strictly owns the retained scene graph (`TGENode`), reactivity graphs, walk-tree traversal, Flexily layout calculation (Flexbox + CSS Grid), render graph queue compilation, input parsing, focus graphs, hit-testing, and canvas rasterization (canvas commands are rasterized in JS and uploaded as RGBA textures). Rust strictly owns WGPU hardware pipelines, compositing targets, Kitty protocol serialization, SHM/direct/tmux transport, image decoding caches, GPU resource budgets, and presentation. Rust-retained scene graphs and native canvas command lists are obsolete and prohibited.
3. **Alpha Representation Invariant**: GPU render targets operate in **premultiplied alpha** ($[R \cdot A, G \cdot A, B \cdot A, A]$) to preserve linear blending, filtering, and blur correctness without dark edge fringing. Image assets, canvas buffers, and CPU host readback buffers operate in **straight alpha** ($[R, G, B, A]$). Region readback operations must explicitly execute an unpremultiply pass (`image_unpremultiply` pipeline) before serializing data to the host CPU.
4. **ARM64 FFI Parameter Limit Invariant**: Foreign function calls between Bun (`bun:ffi`) and native Rust (`libvexart`) must never exceed **8 register arguments**. Any operation requiring more parameters must serialize parameters into a contiguous binary packed struct passed by pointer (`*const u8` or `*mut u8`).
5. **Terminal Accessibility Invariant**: Terminal emulators lack browser DOM trees, HTML elements, and web accessibility APIs (no `role="button"`, no `aria-expanded`). Accessibility in Vexart is implemented through explicit focus trees (`FocusScope`), circular tab cycling, Vim navigation keymaps (`h`/`j`/`k`/`l`), and focus traps for modal overlays.
6. **No Hotfixes / No Ad-Hoc Patches Invariant**: Mitigations and symptom patches (such as magic-number timeouts, arbitrary array clamping, swallowing errors in empty catch blocks, or inserting whitespace strings to simulate cursors) are strictly forbidden. All modifications must establish clean invariants, symmetric lifecycle ownership (acquire/release balance), and formal mathematical models.

---

## 3. Package Topology & Monorepo Matrix

| Package Path | Package Name | Role & Scope | Status |
| :--- | :--- | :--- | :--- |
| `packages/app` | `@vexart/app` | Tier 1: Application lifecycle (`createApp`, `mountApp`), file-system router, `<RouteOutlet>`, `className` compiler, canonical `<Box>` and `<Text>`, and unified `"vexart"` barrel. | Active |
| `packages/styled` | `@vexart/styled` | Tier 2: Void Design System, OLED-calibrated color tokens, reactive runtime theming (`themeColors`, `setTheme`), and 28+ styled UI components. | Active |
| `packages/headless` | `@vexart/headless` | Tier 3: 25 unstyled UI interaction primitives (inputs, containers, collections, overlays, display, forms) with zero styling opinions. | Active |
| `packages/engine` | `@vexart/engine` | Tier 4: Universal reconciler, Flexily layout adapter, render graph builder, frame scheduler, terminal ANSI/Kitty parser, focus manager, and `bun:ffi` bridge. | Active |
| `packages/internal-flexily` | `flexily` | Vendored zero-dependency Yoga-compatible Flexbox and CSS Grid layout engine written in pure TypeScript/JavaScript. | Internal |
| `packages/internal-devtools`| `@vexart/internal-devtools`| Model Context Protocol (MCP) server providing 11 automated tools for AI agent and test harness interaction via Kitty. | Internal |
| `packages/internal-atlas-gen` | `@vexart/internal-atlas-gen` | Offline utility generator converting TTF fonts into 1024×1024 MSDF pre-baked atlas PNGs and glyph metrics JSON. | Internal |
| `native/libvexart` | `libvexart` | Rust native `cdylib` compiling WGPU 29.0.1 rendering pipelines, composite targets, MSDF font engine, and Kitty transports. | Active |

---

## 4. Unified Barrel Import Rules & Export Precedence

Applications import framework symbols from the root `"vexart"` barrel. Because multiple tiers implement related concepts, the root barrel enforces explicit export precedence:

```typescript
// Standard application consumption
import { 
  createApp, 
  Box, 
  Text, 
  Button, 
  ToggleSwitch, 
  useRouter, 
  colors, 
  setTheme 
} from "vexart"
```

### Collision Resolution Rules
1. **`<Box>` and `<Text>`**: Exported from `@vexart/app` (NOT `@vexart/engine`). They wrap the engine intrinsics `<box>` and `<text>` while providing support for the `className` utility compiler and reactive style diffing.
2. **`<Button>` vs `<VoidButton>`**: `Button` is exported from `@vexart/headless` (unstyled primitive requiring `renderButton`). For the themed Void Design System button with variants, use `VoidButton` from `@vexart/styled`. Both are exported directly from `"vexart"`.
3. **ToggleSwitch**: Headless `Switch` from `@vexart/headless` is renamed to `ToggleSwitch` in the unified barrel to prevent collisions with SolidJS's core `<Switch>` control flow component.
4. **`useRouter`**: Exported from `@vexart/app` (canonical file-system application router).
5. **Purged Primitives**: `<Span>`, `<RichText>`, and `<WrapRow>` **do not exist**. Use `<box>` and `<text>` intrinsics or `<Box>` and `<Text>` app components directly.

---

## 5. Hardware Capabilities & Performance Benchmarks

Vexart targets 120fps-class responsiveness under active terminal interaction, adhering to strict frame budgets (DEC-013):

| Scenario | Target Budget | Runtime Behavior |
| :--- | :--- | :--- |
| **No-Op / Idle Frame** | `< 1.0 ms` | Reconciler skips pass; damage tracker detects 0 dirty pixels; frame is completely suppressed. |
| **Small Damage Region** | `< 5.0 ms` | Scoped subtree walk; dirty layer scissor blit; incremental Kitty region emit. |
| **Compositor Animation** | `< 8.33 ms` (120 FPS) | Fast-path compositor bypasses reconciler and layout, updating GPU uniforms directly. |
| **Full Screen Layout** | `< 16.6 ms` (60 FPS) | Complete Flexily layout pass, render graph rebuild, full WGPU multi-pass draw. |

### Memory & Hardware Invariants
- **VRAM Memory Cap**: `ResourceManager` enforces a default **128 MB** VRAM budget with LRU eviction for offscreen render targets and textures.
- **Zero-Allocation Vertex Buffer**: Rust pre-allocates a **2 MB** vertex buffer (`BASE_VERTEX_BUFFER_CAPACITY`). During normal steady-state execution, instances are appended via pointer offset bumping with zero `device.create_buffer` overhead.
- **Peak Tracking & Decay Hysteresis**: Under sudden extreme scenes, the vertex buffer doubles dynamically. If peak frame usage remains below 2 MB for **120 consecutive idle frames** (~2 seconds at 60 FPS), the buffer smoothly decays back to 2 MB, releasing excess VRAM to the OS.
- **Color Parsing Elimination**: Colors are resolved once from strings to packed `u32` (0xRRGGBBAA) during `setProperty()` and cached in a 512-entry LRU cache. The render loop operates exclusively on raw integers.

---

## 6. Master Context Pointers Table

Use this navigation matrix to access specialized authoritative documentation across the Vexart architecture:

| Domain / Subsystem | Scope & Trigger Condition | Authoritative Document |
| :--- | :--- | :--- |
| **Engine Runtime & Reconciler** | Modifying SolidJS universal renderer, `TGENode` tree, Flexily Flexbox or CSS Grid solver, atomic writeback, frame scheduling, ANSI/Kitty input parser, or hooks (`useDrag`, `useHover`, `useQuery`). | [`docs/packages/engine-runtime.md`](./engine-runtime.md) |
| **Native WGPU Boundary & FFI** | Modifying Rust `libvexart`, WGPU 29.0.1 pipelines, all 21 `cmd_kind` IDs, 50 C FFI exports, 2MB vertex ring buffer with 120-frame decay cooldown, or Kitty transports (direct, SHM, tmux placeholder). | [`docs/packages/native-wgpu-boundary.md`](./native-wgpu-boundary.md) |
| **Application Framework & Router** | Implementing `createApp`, file-system routing rules, specificity scoring, nested `<RouteOutlet>` lifecycle, `className` Tailwind compiler, `createStyles`, or configuration schemas (`defineConfig`). | [`docs/packages/app-framework.md`](./app-framework.md) |
| **Headless UI Primitives** | Inspecting or creating unstyled interaction components, focus contracts, Vim keymaps, prop getters, composite overlays, outside-click handling, or form state management across the 25 primitives. | [`docs/packages/headless-primitives.md`](./headless-primitives.md) |
| **Styled Void Design System** | Adjusting Void design tokens, OLED color calibration, reactive `themeColors` getters, zero-remount theme switching, or styled component variants (`VoidInput`, `VoidDialog`, etc.). | [`docs/packages/styled-void-system.md`](./styled-void-system.md) |
| **Tooling, Governance & Packaging** | NPM package layout, `@vexart/internal-devtools` 11 MCP tools, `@vexart/internal-atlas-gen`, platform binaries resolution, quality verification gates, or API deprecation policies. | [`docs/packages/tooling-and-distribution.md`](./tooling-and-distribution.md) |
