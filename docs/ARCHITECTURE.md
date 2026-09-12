# Vexart — Architecture Reference

**Version**: 0.2
**Status**: Architecture reference — records the intended paint-forward TS/Rust
boundary after DEC-014 restored TypeScript ownership of scene, layout, render
graph, and event dispatch. Target and migration descriptions are historical
context unless current code and focused checks confirm them.
**Owner**: Founder (solo developer)
**Companion to**: [PRD](./PRD.md), [API-POLICY](./API-POLICY.md)

---

## ⚠️ How to read this document

This document records the intended architecture after all v0.9 phases and
DEC-014's paint-forward TS/Rust boundary. Target directory trees and migration
notes are historical context unless current code and focused checks confirm
them. Preserve the active ownership boundary when using this reference.

**When reading this as an AI agent**: use it as design guidance for code
organization, module boundaries, and data flow. If current code differs, inspect
the discrepancy and preserve active ownership/API safeguards; do not treat a
prose mismatch as an automatic stop.

**When reading this as a human reviewer**: some sections describe historical
phase migrations and target structures. The `Appendix A` lists known deviations
and the phase context that produced them.

**Guidance for changes to this document**:
- Update this reference intentionally when architecture decisions change; no
  particular proposal workflow is required.
- Clarifications and refinements can be appended with a dated comment when they
  improve current understanding.
- Keep version metadata aligned when architectural decisions shift.

---

## Table of contents

1. [Purpose and scope](#1-purpose-and-scope)
2. [System overview](#2-system-overview)
3. [Package structure](#3-package-structure)
4. [The native binary — `libvexart`](#4-the-native-binary--libvexart)
5. [Frame lifecycle — data flow](#5-frame-lifecycle--data-flow)
6. [Input lifecycle — data flow](#6-input-lifecycle--data-flow)
7. [Compositor-thread animation path](#7-compositor-thread-animation-path)
8. [Resource management](#8-resource-management)
9. [Threading model](#9-threading-model)
10. [Error handling](#10-error-handling)
11. [Frame budget scheduler](#11-frame-budget-scheduler)
12. [Build system](#12-build-system)
13. [File and directory conventions](#13-file-and-directory-conventions)
14. [Testing strategy](#14-testing-strategy)
15. [Observability](#15-observability)
16. [Extension points](#16-extension-points)
17. [Appendix A — Known debt](#appendix-a--known-debt-v01--v09-migration)
18. [Appendix B — Contract reference](#appendix-b--contract-reference)

---

## 1. Purpose and scope

### 1.1 What this document is

A technical reference for Vexart's target architecture after v0.9 ships. It answers:

- How is the code organized?
- How do pieces communicate?
- Where do new files go?
- What are the contracts between modules?
- How does a single frame flow through the system?
- How is input processed?
- How are resources managed?

### 1.2 What this document is not

- A user-facing guide (see `docs/getting-started.md` when it exists).
- A product description (see `docs/PRD.md`).
- An API reference for users (see `docs/api-reference.md`).
- A description of the current v0.1 codebase.

### 1.3 Relationship to the PRD

The PRD answers **what** and **why**. This document answers **how**. When they overlap:

| Topic | PRD (high-level) | ARCHITECTURE (executable) |
|---|---|---|
| Package layering | 4 layers, named | Exact subdirectory structure, per-file responsibility |
| Stack | TS + Rust | Which crate, which module, which responsibility |
| Public API | Uses `public.ts`, no `export *` | Contract generation, snapshot tooling |
| FFI | Packed ArrayBuffer, ≤8 params | Buffer layout, offset table, decoder contract |
| Performance targets | Numbers in §7.3 | How those numbers are achieved |

Use both documents as references: the PRD frames product policy and intent,
while this document records implementation guidance. Resolve discrepancies by
checking current code and focused checks; neither prose mismatch is an automatic
stop.

---

## 2. System overview

### 2.1 End-to-end pipeline

```
┌────────────────────────────────────────────────────┐
│  Developer code (user's app)                       │
│  <Button onPress={save} variant="primary">Save</>  │
└──────────────────────┬─────────────────────────────┘
                       │  JSX → SolidJS
                       ▼
┌────────────────────────────────────────────────────┐
│  @vexart/styled — themed components                │
│  (Button wraps headless Button, applies tokens)    │
└──────────────────────┬─────────────────────────────┘
                       ▼
┌────────────────────────────────────────────────────┐
│  @vexart/headless — logic components               │
│  (Button exposes ctx.buttonProps; no visuals)      │
└──────────────────────┬─────────────────────────────┘
                       ▼
┌────────────────────────────────────────────────────┐
│  @vexart/app — framework + layout helpers            │
│  (Box, Text, router, CLI)                          │
└──────────────────────┬─────────────────────────────┘
                       ▼
┌────────────────────────────────────────────────────┐
│  @vexart/engine — TS scene/layout/event owner      │
│  1. Solid reconciler owns scene graph/reactivity   │
│  2. Walk-tree + Flexily layout produce paint cmds  │
│  3. TS dispatches input, focus, and interactions   │
└──────────────────────┬─────────────────────────────┘
                       │  paint-forward FFI (packed ArrayBuffer, ≤8 params)
                       ▼
┌────────────────────────────────────────────────────┐
│  libvexart.{dylib,so,dll} — Rust cdylib            │
│  Modules: paint (WGPU) / composite / layer         │
│  registry / resource / image assets / text (MSDF)  │
│  / Kitty encoder / SHM-file-direct transport       │
└──────────────────────┬─────────────────────────────┘
                       │  bytes to stdout (Kitty protocol)
                       ▼
                 ┌──────────┐
                 │ Terminal │
                 │ (Kitty / │
                 │  WezTerm/│
                 │  Ghostty)│
                 └──────────┘
```

### 2.2 Package layering (app framework + three engine/UI packages + internal)

```
PUBLIC PACKAGES (shipped to consumers)

@vexart/app       depends on: styled, headless, engine
  App framework: Box, Text, layout helpers, router, className mapper, config, CLI

┌───────────────────────────────────┐
│  @vexart/styled                   │  depends on: headless, engine
│  — Opinionated themed components  │
└──────────────┬────────────────────┘
               ▼
┌───────────────────────────────────┐
│  @vexart/headless                 │  depends on: engine
│  — Behavior, keyboard, state      │
└──────────────┬────────────────────┘
               ▼
┌───────────────────────────────────┐
│  @vexart/engine                   │  depends on: (nothing vexart-internal)
│  — Reconciler, loop, FFI, hooks   │
└──────────────┬────────────────────┘
               ▼
       libvexart (native cdylib, shipped as a
       prebuilt binary per platform inside the
       @vexart/engine package payload)

INTERNAL PACKAGES (not shipped, for dev/build only)

@vexart/internal-atlas-gen    ← MSDF atlas generator CLI (dev tool)
@vexart/internal-devtools     ← MCP devtools server (inspector)
flexily (internal)             ← vendored Flexily 0.6.0 flex/grid solver
```

### 2.3 The two-binary rule

Vexart ships exactly **two runtime artifacts**:

1. **TypeScript source (`.js`/`.d.ts`)** — the 4 official packages (`@vexart/app`, `@vexart/styled`, `@vexart/headless`, `@vexart/engine`) distributed via npm.
2. **Native binary (`libvexart`)** — one `.dylib`/`.so`/`.dll` per supported platform, embedded inside `@vexart/engine/native/{platform}/`.

No other binaries exist. No other languages. If a task proposes adding a third runtime artifact, it requires a PRD amendment.

### 2.4 Language-to-layer mapping

| Layer | Language | Why |
|---|---|---|
| App, Styled, Headless | TypeScript (with JSX) | Developer-facing API surface. Leverages SolidJS reactivity and Bun-native tooling. |
| Engine | TypeScript | Public JS/JSX shell plus scene graph, Solid reactivity, walk-tree, Flexily layout, render graph generation, event dispatch, interaction, hooks, callback registry, handles, and compatibility/test/offscreen fallbacks. Bun runtime. |
| libvexart | Rust (cdylib) | Paint pipelines (WGPU), composite, Kitty encoding, SHM/file/direct transport, layer target lifecycle, image assets, resources, and native stats. Cross-platform. |
| Shaders | WGSL | One shader language, runs on Metal, Vulkan, DX12 via WGPU. |

### 2.5 Paint-forward ownership rule

After DEC-014 and DEC-015, TypeScript is the implementation owner for scene graph, Solid reactivity, layout (Flexily), render graph generation, event dispatch, focus, hit-testing, and interaction. Rust is the implementation owner for paint and presentation below the paint-command boundary.

Allowed TypeScript hot-path responsibilities:

- Maintain the SolidJS scene graph and callback registry.
- Walk the tree, compute Flexily layout in TS, generate render graph / paint commands, and assign layer plans.
- Parse and dispatch keyboard/pointer input, focus, pointer capture, bubbling, and interaction state.
- Keep explicit readback APIs for screenshot, debug, test, or offscreen rendering.

Allowed Rust hot-path responsibilities:

- Execute WGPU paint pipelines, effect shaders, text paint, and paint-command dispatch.
- Composite layer targets and own Kitty encoding plus SHM/file/direct terminal transport.
- Store image assets, GPU resources, pipeline caches, and native presentation stats.

Forbidden target-state responsibilities:

- Rust must not own scene graph state, layout writeback, render graph
  generation, or event dispatch without a new PRD decision superseding DEC-014.
- TypeScript must not receive full-frame or layer RGBA buffers for normal terminal presentation.

---

## 3. Package structure

Each public package has a fixed internal layout. New files go into existing directories, never at package root. New directories require updating this document.

### 3.1 `@vexart/engine`

```
packages/engine/
├── package.json
├── src/
│   ├── public.ts              — explicit public exports (512+ lines, see API-POLICY)
│   ├── index.ts               — re-exports public.ts (compatibility)
│   ├── mount.ts               — mount(), RGBA, MouseButton, useTerminalDimensions
│   │
│   ├── reconciler/            — SolidJS universal reconciler + interaction
│   │   ├── index.ts           — internal reconciler barrel
│   │   ├── reconciler.ts      — SolidJS createRenderer<TGENode>() instance
│   │   ├── data.ts            — useQuery, useMutation
│   │   ├── dirty.ts           — dirty tracking via signals
│   │   ├── drag.ts            — useDrag hook
│   │   ├── extmarks.ts        — ExtmarkManager (virtual text/lines)
│   │   ├── focus.ts           — focus system (registration, Tab nav, scopes)
│   │   ├── handle.ts          — createHandle, NodeHandle
│   │   ├── hit-test.ts        — hit testing + scroll viewport clipping
│   │   ├── hover.ts           — useHover hook
│   │   ├── interaction.ts     — interaction layer management
│   │   ├── jsx.d.ts           — JSX intrinsic element types
│   │   ├── plugins.ts         — slot registry for plugins
│   │   ├── pointer.ts         — pointer capture, loop binding
│   │   ├── selection.ts       — text selection across nodes
│   │   └── tree-sitter/       — syntax highlighting (client, parsers, styles)
│   │
│   ├── loop/                  — render loop + pipeline phases
│   │   ├── loop.ts            — createRenderLoop
│   │   ├── walk-tree.ts       — depth-first traversal + layout input
│   │   ├── layout-adapter.ts  — Flexily integration (persistent nodes)
│   │   ├── layout.ts          — layout helpers
│   │   ├── paint.ts           — paint command dispatch
│   │   ├── composite.ts       — layer compositing
│   │   ├── assign-layers.ts   — 3-phase layer assignment
│   │   ├── layer-boundary.ts  — layer boundary detection
│   │   ├── frame-scheduler.ts — adaptive frame rate + boost windows
│   │   ├── input.ts           — input dispatch (keyboard, mouse, useInput)
│   │   ├── scroll.ts          — scroll handles + geometry
│   │   ├── image.ts           — image decoding + scaled cache
│   │   ├── animation.ts       — createTransition, createSpring, easing
│   │   ├── debug.ts           — debug overlay + tree dump
│   │   ├── predicates.ts      — node predicates
│   │   └── types.ts           — loop-internal types
│   │
│   ├── animation/
│   │   └── compositor-path.ts — compositor-thread fast path for transform/opacity
│   │
│   ├── scheduler/             — JS-side priority scheduler
│   │   ├── index.ts           — scheduleTask(priority, fn)
│   │   ├── priority.ts        — user-blocking / user-visible / background queues
│   │   └── budget.ts          — per-frame budget accounting
│   │
│   ├── ffi/                   — bridge to libvexart + render graph + node system
│   │   ├── vexart-bridge.ts   — bun:ffi dlopen + VEXART_SYMBOLS + MSDF_FONT_SYMBOLS
│   │   ├── vexart-functions.ts — high-level wrappers (version, error)
│   │   ├── vexart-buffer.ts   — packed ArrayBuffer pattern
│   │   ├── renderer-backend.ts — RendererBackend interface
│   │   ├── gpu-renderer-backend.ts — GPU renderer backend implementation
│   │   ├── gpu-layer-strategy.ts — layer strategy selection
│   │   ├── render-graph.ts    — render graph queues and ops
│   │   ├── resource-stats.ts  — getRendererResourceStats()
│   │   ├── matrix.ts          — 3x3 matrix transforms
│   │   ├── damage.ts          — damage rect utilities
│   │   ├── canvas.ts          — CanvasContext and draw commands
│   │   ├── canvas-rasterizer.ts — canvas software rasterizer
│   │   ├── text-layout.ts     — font registration and text cache
│   │   ├── msdf-font.ts       — native MSDF font system wrappers
│   │   ├── particles.ts       — particle system
│   │   ├── layers.ts          — layer store
│   │   ├── lru-cache.ts       — generic LRU cache
│   │   ├── node.ts            — TGENode, props, constants, parsers
│   │   ├── flex-sync.ts       — Flexily prop sync
│   │   ├── grid-types.ts       — public/internal Grid contracts and validation
│   │   ├── grid-text-intrinsics.ts — intrinsic text measurement adapter
│   │   ├── native-presentation-*.ts — native presentation flags/ops/stats
│   │   ├── native-layer-registry*.ts — native layer registry + flags
│   │   └── native-image-assets.ts    — native image asset management
│   │
│   ├── input/                 — terminal input parsing
│   │   ├── parser.ts          — ANSI/SGR/URXVT escape sequence decoder
│   │   ├── keyboard.ts        — keyboard event parsing
│   │   ├── mouse.ts           — mouse event parsing
│   │   └── types.ts           — InputEvent, KeyEvent, MouseEvent types
│   │
│   ├── output/                — Kitty graphics protocol output
│   │   ├── kitty.ts           — Kitty transport (probe, transmit, patch)
│   │   ├── kitty-shm-native.ts — native SHM helpers
│   │   └── transport-manager.ts — transport mode management + failover
│   │
│   ├── terminal/              — terminal lifecycle
│   │   ├── index.ts           — createTerminal
│   │   ├── detect.ts          — terminal kind detection
│   │   ├── caps.ts            — capability probing (Kitty graphics, colors)
│   │   ├── lifecycle.ts       — enter/leave raw mode, sync mode
│   │   ├── platform.ts        — platform detection
│   │   ├── size.ts            — terminal size + pixel size + resize
│   │   └── tmux.ts            — tmux detection + passthrough
│   │
│   └── testing/               — test helpers (not public)
│       ├── render-to-buffer.ts
│       └── showcase-*.ts      — showcase test scenes
│
└── etc/                       — api-extractor output
    └── engine.api.md
```

**Key rules for engine**:

- `loop/loop.ts` orchestrates only — never contains layout / paint / composite logic directly. Those live in their respective files.
- Every `vexart_*` Rust export is bound in `ffi/vexart-bridge.ts`. High-level wrappers live in `ffi/vexart-functions.ts`.
- The reconciler owns interaction hooks (drag, hover, focus, pointer) and dispatches via the loop input system.

### 3.2 `@vexart/headless`

```
packages/headless/
├── package.json
└── src/
    ├── public.ts
    ├── index.ts
    │
    ├── inputs/
    │   ├── button.tsx        — Button (ctx.buttonProps)
    │   ├── checkbox.tsx
    │   ├── switch.tsx
    │   ├── radio-group.tsx
    │   ├── input.tsx         — single-line text input
    │   ├── textarea.tsx      — multi-line editor
    │   ├── slider.tsx
    │   ├── select.tsx        — Select, SelectTrigger, SelectContent, SelectItem
    │   └── combobox.tsx
    │
    ├── display/
    │   ├── progress-bar.tsx
    │   ├── code.tsx          — syntax-highlighted code block
    │   └── markdown.tsx
    │
    ├── containers/
    │   ├── overlay-root.tsx  — OverlayRoot container
    │   ├── portal.tsx
    │   ├── scroll-view.tsx
    │   └── tabs.tsx
    │
    ├── collections/
    │   ├── list.tsx
    │   ├── virtual-list.tsx
    │   └── table.tsx
    │
    ├── overlays/
    │   ├── dialog.tsx        — Dialog, DialogOverlay, DialogContent, DialogClose
    │   ├── tooltip.tsx       — Tooltip, Popover
    │   └── toast.tsx         — createToaster
    │
    ├── navigation/
    │   └── diff.tsx
    │
    └── forms/
        └── form.ts           — createForm() factory
```

Note: Badge, Avatar, Skeleton, Separator, and Card are styled-only components
in `@vexart/styled`, not headless. Headless contains only logic/interaction
components with no visual opinions.

**Contract for headless components**:

- Every component accepts a `renderX` callback receiving a `ctx` object.
- `ctx` contains stable prop-bag fields: `ctx.buttonProps`, `ctx.toggleProps`, `ctx.itemProps(id)`, etc. These are spread onto the root primitive.
- The `ctx.*Props` API is part of the public contract. Adding fields is a minor version bump; removing or renaming is breaking.

### 3.3 `@vexart/styled`

```
packages/styled/
├── package.json
└── src/
    ├── public.ts
    ├── index.ts
    │
    ├── tokens/
    │   └── tokens.ts         — colors, radius, space, font, weight, shadows, glows, theme
    │
    ├── theme/
    │   └── theme.ts          — createTheme, darkTheme, lightTheme, themeColors,
    │                            setTheme, getTheme, getThemeVersion
    │
    ├── components/           — styled wrappers (30+ components)
    │   ├── avatar.tsx
    │   ├── badge.tsx
    │   ├── button.tsx
    │   ├── card.tsx          — Card, CardHeader, CardTitle, CardDescription,
    │   │                        CardContent, CardFooter, CardAction
    │   ├── checkbox.tsx      — VoidCheckbox
    │   ├── combobox.tsx      — VoidCombobox
    │   ├── dialog.tsx        — VoidDialog, VoidDialogTitle, VoidDialogDescription,
    │   │                        VoidDialogFooter
    │   ├── dropdown-menu.tsx — VoidDropdownMenu + Trigger/Content/Item/Separator/Label
    │   ├── input.tsx         — VoidInput
    │   ├── popover.tsx       — VoidPopover
    │   ├── progress.tsx      — VoidProgress
    │   ├── radio-group.tsx   — VoidRadioGroup
    │   ├── select.tsx        — VoidSelect
    │   ├── separator.tsx     — Separator
    │   ├── skeleton.tsx      — Skeleton
    │   ├── slider.tsx        — VoidSlider
    │   ├── switch.tsx        — VoidSwitch
    │   ├── table.tsx         — VoidTable
    │   ├── tabs.tsx          — VoidTabs
    │   ├── toast.tsx         — createVoidToaster
    │   └── tooltip.tsx       — VoidTooltip
    │
    └── typography/
        └── typography.tsx    — H1, H2, H3, H4, P, Lead, Large, Small, Muted
```

**Contract for styled components**:

- Every styled component is a wrapper around a headless component that supplies a default `renderX` using tokens.
- Users can override styling by passing their own `renderX` to the styled component.
- Tokens are theme-scoped. Components read token values reactively from `themeColors` (which uses SolidJS signal getters), updated via `setTheme()` without component remounting or Context Providers.
- Styled-only components (Avatar, Badge, Separator, Skeleton, Card) have no headless counterpart — they are visual-only with token-based styling.

### 3.4 `@vexart/app`

`@vexart/app` is the Bun-native application framework layer. It gives users a single public entrypoint while keeping internals separated so router/styles can be extracted later if adoption demands it.

```
packages/app/
|-- package.json
`-- src/
    |-- public.ts              — explicit public exports (see API-POLICY)
    |-- index.ts               — re-exports public.ts (compatibility)
    |
    |-- router/                — route matching, filesystem manifest, outlet/provider
    |-- styles/                — Tailwind-like className -> Vexart props mapper
    |-- cli/                   — vexart create/dev/build/routes/doctor
    |-- config/                — defineConfig() and defaults
    |-- components/            — app-level primitive wrappers with className
    `-- runtime/               — Page, createApp, mountApp, app lifecycle helpers
```

**Contract for app framework**:

- Runtime is Bun-native: Next-like DX, Bun runtime, Vexart renderer.
- `createApp()` is the canonical managed entry point for user documentation.
- `mountApp()` is the lower-level async app lifecycle helper for custom bootstrapping.
- `mount()` from `@vexart/engine` remains the manual, low-level alternative for advanced integrations that manage terminal and input plumbing directly.
- `useAppTerminal()` exposes the managed terminal from `createApp()` / `mountApp()` context.
- `@vexart/app` is the only public app-framework package during alpha/beta.
- Internal modules may be extracted later, but user docs should import from `@vexart/app`.
- The framework must not depend on Next.js, DOM, CSSOM, hydration, or React DOM.
- Filesystem routing discovers `app/**/page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, and `not-found.tsx`; route groups are omitted from URL paths and private folders (`_name`) are skipped.
- `vexart dev` generates `.vexart/routes.ts` plus `.vexart/dev.tsx` when no explicit entrypoint exists, then runs Bun with watch mode by default.

### 3.5 Internal tooling packages

Not published to npm. Live in the monorepo for development.

```
packages/internal-atlas-gen/    — CLI: TTF → MSDF atlas PNG + metrics JSON
packages/internal-devtools/     — MCP devtools server for inspector integration
packages/internal-flexily/      — vendored Flexily 0.6.0 flex/grid solver
```

---

## 4. The native binary — `libvexart`

### 4.1 Crate layout

```
native/libvexart/
├── Cargo.toml                 — cdylib + rlib; wgpu, bytemuck, nix, base64, flate2,
│                                 fontdb, ttf-parser, fdsm, nalgebra, serde_json
├── src/
│   ├── lib.rs                 — exactly 50 #[no_mangle] FFI exports (core + modules)
│   ├── types.rs               — FrameStats, NativePresentationStats, shared types
│   ├── frame.rs               — frame types
│   ├── layer.rs               — native layer registry (Phase 2c)
│   ├── image_asset.rs         — image asset registry
│   │
│   ├── paint/                 — WGPU rendering
│   │   ├── mod.rs             — paint dispatch entry point
│   │   ├── context.rs         — PaintContext (WGPU device, queues, pipelines)
│   │   ├── instances.rs       — #[repr(C)] instance structs (BridgeImageTransformInstance, MsdfGlyphInstance)
│   │   ├── pipeline_cache.rs  — pipeline caching
│   │   ├── pipelines/         — WGPU render pipeline definitions (21 pipelines)
│   │   └── shaders/           — WGSL shader source files
│   │
│   ├── composite/             — layer compositing
│   │   ├── mod.rs             — compositing ops dispatch
│   │   ├── target.rs          — render target lifecycle
│   │   └── readback.rs        — GPU → CPU readback
│   │
│   ├── resource/              — unified GPU memory budget
│   │   ├── mod.rs             — ResourceManager
│   │   ├── priority.rs        — resource priority tiers
│   │   ├── eviction.rs        — LRU eviction
│   │   └── stats.rs           — stats collection / JSON output
│   │
│   ├── text/                  — MSDF text pipeline (atlas-based)
│   │   ├── mod.rs
│   │   ├── atlas.rs           — MSDF atlas loading / management
│   │   ├── glyph_info.rs      — glyph metric info
│   │   └── render.rs          — MSDF text rendering dispatch
│   │
│   ├── font/                  — native font system (fontdb + fdsm MSDF)
│   │   ├── mod.rs
│   │   ├── cache.rs           — font cache
│   │   ├── layout.rs          — text layout (line breaking)
│   │   ├── msdf_atlas.rs      — MSDF atlas page generation
│   │   └── system.rs          — FontSystem (fontdb-backed discovery)
│   │
│   ├── kitty/                 — Kitty protocol encoder (native Rust)
│   │   ├── mod.rs
│   │   ├── encoder.rs         — base64 + zlib compression + escape sequences
│   │   ├── shm.rs             — POSIX SHM prepare / release
│   │   ├── transport.rs       — frame / layer / region emission
│   │   └── writer.rs          — buffered stdout writer
│   │
│   └── ffi/                   — FFI safety helpers
│       ├── mod.rs
│       ├── buffer.rs          — packed ArrayBuffer helpers
│       ├── error.rs           — thread-local last_error + 2 FFI exports
│       └── panic.rs           — ffi_guard! macro + error codes
│
└── tests/                     — integration and unit tests
```

### 4.2 FFI contract

Every export from `libvexart` obeys:

1. **Function signature**: `pub extern "C" fn vexart_<module>_<action>(...) -> i32` — integer return code (0 = OK, non-zero = error code).
2. **Parameter count**: ≤ 8 parameters (ARM64 calling convention limit). If more are needed, the last parameter is `*const u8` pointing to a packed ArrayBuffer with further fields.
3. **Panic safety**: every export wraps its body in `std::panic::catch_unwind` (via `ffi_guard!`). A panic converts to error code `ERR_PANIC = -1` and stores the message in `thread_local` for retrieval.
4. **Error retrieval**: `vexart_get_last_error_length()` and `vexart_copy_last_error(*mut u8, u32)` expose the most recent error string to TypeScript.
5. **State management & context**: Rust manages its native rendering and presentation state via the global singleton `SHARED_PAINT: LazyLock<Mutex<Option<PaintContext>>>`. The `_ctx: u64` handle passed from TypeScript is reserved for ABI compatibility and forward multi-context extensibility, while internal thread safety and resource access are governed by the `Mutex` around `SHARED_PAINT`.
6. **No allocations visible to caller**: caller-provided buffers are used for writes. Rust-internal allocations are bounded by `ResourceManager` or stack.

Example FFI export:

```rust
#[no_mangle]
pub extern "C" fn vexart_paint_dispatch(
    _ctx: u64,
    target: u64,
    graph_ptr: *const u8,
    graph_len: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    ffi_guard!({
        let mut guard = lock_or_recover(&SHARED_PAINT);
        let ctx = guard.as_mut().ok_or(ERR_INVALID_HANDLE)?;
        let graph = unsafe { std::slice::from_raw_parts(graph_ptr, graph_len as usize) };
        paint::dispatch(ctx, target, graph, unsafe { &mut *stats_out })
    })
}
```

### 4.3 Shader organization and canonical pipelines

- All shaders are written in WGSL.
- One `.wgsl` file per pipeline variant.
- Shader modules embedded in the binary via `include_str!` at compile time.
- Pipeline compilation happens at startup, persisted to disk via WGPU's `PipelineCache`.
- No runtime shader generation or string concatenation. If a feature needs variants, they are separate shader files.

#### Canonical WGPU Render Pipelines (`cmd_kind` 0 to 20)

`PipelineRegistry` maintains exactly 21 pipelines indexed by `cmd_kind` (§17.6):

| `cmd_kind` | Pipeline / Feature | Shader (`.wgsl`) | Rust module (`pipelines/`) | Notes |
|---|---|---|---|---|
| 0 | Rect | `rect.wgsl` | `rect.rs` | Solid color rectangle |
| 1 | Shape Rect | `shape_rect.wgsl` | `shape_rect.rs` | Rounded rectangle with uniform radius |
| 2 | Shape Rect Corners | `rect_corners.wgsl` | `rect_corners.rs` | Per-corner radius support (`rect_corners.rs`) |
| 3 | Circle | `circle.wgsl` | `circle.rs` | Anti-aliased circle |
| 4 | Polygon | `polygon.wgsl` | `polygon.rs` | Regular polygon |
| 5 | Bezier | `bezier.wgsl` | `bezier.rs` | Quadratic/cubic bezier curves |
| 6 | Glow | `glow.wgsl` | `glow.rs` | Outer box glow effect |
| 7 | Nebula | `nebula.wgsl` | `nebula.rs` | Procedural space background effect |
| 8 | Starfield | `starfield.wgsl` | `starfield.rs` | Procedural starfield effect |
| 9 | Image | `image.wgsl` | `image.rs` | Prohibited in direct graph dispatch; dispatched via image ops |
| 10 | Image Transform | `image_transform.wgsl` | `image_transform.rs` | Prohibited in direct graph dispatch; transformed image layer |
| 11 | *(Reserved)* | *(none)* | *(none)* | Legacy glyph slot (unused; 21+ reserved for future) |
| 12 | Gradient Linear | `gradient_linear.wgsl` | `gradient_linear.rs` | Linear gradient (multi-stop in shader, 2-stop in TS API) |
| 13 | Gradient Radial | `gradient_radial.wgsl` | `gradient_radial.rs` | Radial gradient |
| 14 | Gradient Conic | `gradient_conic.wgsl` | `gradient_conic.rs` | Conic/angular gradient |
| 15 | Backdrop Blur | `backdrop_blur.wgsl` | `backdrop_blur.rs` | Dual-pass Gaussian/box blur sampling background |
| 16 | Backdrop Filter | `backdrop_filter.wgsl` | `backdrop_filter.rs` | Color matrix/adjustments on backdrop texture |
| 17 | Image Mask | `image_mask.wgsl` | `image_mask.rs` | Rounded rectangle / region clipping for images |
| 18 | Glyph (MSDF Text) | `msdf_text.wgsl` | `glyph.rs` | Multi-channel signed distance field font rendering |
| 19 | Self Filter | `self_filter.wgsl` | `filter.rs` | Element self-filter post-processing |
| 20 | Shadow | `shadow.wgsl` | `shadow.rs` | Analytic anti-aliased box-shadow pipeline |

---

## 5. Frame lifecycle — data flow

A frame is triggered by the render loop when at least one of:
- A signal marked a node dirty.
- A compositor-thread animation is running.
- An interactive state changed.
- Terminal resize occurred.
- Explicit `markDirty()` call.

### 5.1 Phase diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 1: Feed scroll & pointer state + check compositor-only fast path       │
│ (routeScrollDeltas, applyScrollOffsets, evaluate hasCompositorAnimations)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (if compositor-only: uniform update + emit)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 2: Update interactive states                                           │
│ (updateInteractiveStates: hover, active, focus, pointer capture)            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 3: Single unified layout pass                                          │
│ (walkTree → layoutAdapter / Flexily in TS → endLayout → writeLayoutBack)    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 4: Layer boundary detection & spatial assignment                       │
│ (findLayerBoundaries → assignLayersSpatial: layer slots, dirty damage rects)│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 5: Frame presentation & compositing                                    │
│ (beginSync → paintFrame / WGPU FFI → composite → native Kitty emit → endSync)│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Phase contracts (the 5-step cycle coordinated by `loop.ts` and `compositeFrame()`)

The frame lifecycle is coordinated by `packages/engine/src/loop/loop.ts`, which delegates each frame's execution to `compositeFrame()` in `packages/engine/src/loop/composite.ts`. Each step enforces strict invariants and sequential determinism:

#### Step 1: Feed scroll & pointer state & evaluate compositor fast path
- **Location**: `packages/engine/src/loop/composite.ts`, `composite-scroll.ts`, `packages/engine/src/animation/compositor-path.ts`.
- **Responsibilities**:
  - Routes scroll deltas (`routeScrollDeltas`) and updates active scroll offsets (`applyScrollOffsets`).
  - Evaluates active compositor animations (`hasCompositorAnimations()`, `isCompositorOnlyFrame()`).
  - **Fast path**: If only compositor-eligible properties (`transform`, `opacity`) on layer-backed nodes mutated, the frame bypasses Steps 2–4. It immediately invokes `vexart_composite_update_uniform(_ctx, target, source_target, params_ptr, clear_rgba)` to update GPU uniforms and proceeds directly to presentation, maintaining 60fps without JS layout or paint costs.

#### Step 2: Update interactive states
- **Location**: `packages/engine/src/loop/layout.ts` (`updateInteractiveStates`).
- **Responsibilities**:
  - Evaluates pointer coordinates against interactive node bounds and active scroll viewports.
  - Computes `hoveredId`, `activeId`, and focus-ring states.
  - Marks layout/paint dirty flags only when visual interaction states transition, preventing redundant frame invalidation.

#### Step 3: Single unified layout pass (`walkTree` → `layoutAdapter` → `endLayout` → `writeLayoutBack`)
- **Location**: `packages/engine/src/loop/walk-tree.ts`, `layout-adapter.ts`, `layout.ts`.
- **Responsibilities**:
  - Depth-first traversal (`walkTree`) accumulates ancestor transforms, tracks clipping viewports, performs viewport culling, and builds Flexily input trees.
  - Flexily computes Flex and Grid layout directly in TypeScript without native writeback FFI.
  - `writeLayoutBack` writes resolved bounding rectangles into `node.layout`, handles text wrap geometry, computes `damageRectForLayoutTransition` for animated transitions, and accumulates damage rectangles.

##### Grid layout profile (v1.x beta)

When a container has `layout="grid"`, the same Flexily node seam is used with
the vendored `packages/internal-flexily/` Grid modules. The TypeScript path
normalizes the public snapshot, expands explicit/implicit tracks and repeats,
resolves lines/areas and auto-placement, measures intrinsic text, sizes tracks,
applies content/item alignment, and writes the resulting local rectangles back
to the existing `layoutMap`. Flex and Grid nodes can be nested in either
direction; no native layout FFI or parallel Grid map is introduced.

The terminal profile supports px, percentages, `auto`, intrinsic
`min-content`/`max-content`, `fr`, `minmax()`, `fit-content()`, fixed and
`auto-fill`/`auto-fit` repeats, named lines/areas, spans, row/column dense
auto-flow, numeric gaps/box metrics, and the existing text/image/canvas node
contracts. Unsupported CSS concepts (writing modes, subgrid, masonry,
table/multicolumn layout, fragmentation, CSSOM/cascade, baseline/safe
alignment, and auto margins) are rejected rather than silently routed to Flex.

Normalization and calculation return deterministic `GridLayoutError` codes.
Diagnostics include intrinsic-pass count, cache hit, and no-op state. A failed
Grid calculation aborts writeback/paint for that frame and retains the last
valid rectangles, preserving damage and interaction consistency.

#### Step 4: Layer boundary detection & spatial assignment
- **Location**: `packages/engine/src/loop/layer-boundary.ts`, `assign-layers.ts`.
- **Responsibilities**:
  - `findLayerBoundaries` identifies boundaries requiring dedicated GPU render targets: explicit `layer={true}`, scroll viewports, backdrop filters, and complex transforms.
  - `assignLayersSpatial` assigns positioned render commands to layer slots, determines layer z-indices, calculates layer bounding boxes, diffs against prior layer states, and computes layer-local damage rectangles (`layer.damageRect`). Clean layers are marked for GPU reuse.

#### Step 5: Frame presentation & compositing
- **Location**: `packages/engine/src/loop/paint.ts`, `packages/engine/src/ffi/gpu-renderer-backend.ts`, `native/libvexart/src/composite/`, `native/libvexart/src/kitty/`.
- **Responsibilities**:
  - Wraps presentation in synchronized terminal mode (`beginSync` / `endSync`).
  - For dirty layers, builds the render graph buffer and dispatches paint commands via `vexart_paint_dispatch(_ctx, target, graph_ptr, graph_len, stats_out)` to WGPU. Clean layers are reused without repainting.
  - Composites layer targets into the root render target in z-order.
  - Transmits output to the terminal using the Kitty graphics protocol (`vexart_kitty_emit_frame_with_stats`, layer emission, or POSIX SHM ring buffers).
  - Collects `FrameProfile` timing metrics and updates observability/debug overlays.

### 5.3 End-to-end data flow (one diagram)

```
Reconciler (SolidJS signals mutate TGENode tree)
   │
   ▼
[loop.ts coordinator triggers frame()]
   │
   ├─► Step 1: composite-scroll & evaluate compositor fast path
   │            (qualifying? → vexart_composite_update_uniform → emit → done)
   │
   ├─► Step 2: updateInteractiveStates (hover, active, focus)
   │
   ├─► Step 3: Single unified layout pass
   │            walkTree() ──► Flexily layout() ──► writeLayoutBack()
   │
   ├─► Step 4: Layer assignment
   │            findLayerBoundaries() ──► assignLayersSpatial()
   │
   └─► Step 5: Paint, composite, and emit
                paintFrame() (WGPU FFI) ──► native composite ──► Kitty encoder
                                                                      │
                                                                      ▼
                                                               Terminal Display
```

---

## 6. Input lifecycle — data flow

```
┌──────────────────┐
│  Terminal stdin  │   raw bytes (ANSI escape sequences, UTF-8)
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  engine/src/input/parser.ts          │
│  — decode ANSI / SGR / URXVT         │
│  — decode bracketed paste            │
│  — produce structured InputEvent     │
└────────┬─────────────────────────────┘
         │  InputEvent = key | mouse | focus | paste | resize
         ▼
┌──────────────────────────────────────┐
│  engine/src/input/dispatch.ts        │
│  — InputEvent → SolidJS signals      │
│  — mouseX, mouseY, buttons, keys, …  │
│  — terminalWidth, terminalHeight     │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  engine/src/loop/ (next frame)       │
│  — on mouse delta: hit-test          │
│  — update hoveredId / activeId       │
│  — compute PressEvent if release     │
│  — dispatch onPress (bubbles up)     │
│  — dispatch onMouse* (per-node)      │
│  — update focus on Tab/Shift-Tab     │
└────────┬─────────────────────────────┘
         │
         ▼
User's event handlers (onPress, onMouseDown, etc.)
```

### 6.1 Hit testing

- **Location**: `engine/src/input/hit-test.ts`.
- **Algorithm**:
  1. If pointer is captured → return captured node.
  2. Walk interactive nodes in reverse z-order.
  3. For each node: apply ancestor transforms to compute screen-space bounds, check inclusion, honor scissor culling.
  4. First match wins.
- **Complexity**: O(n) where n is the number of interactive nodes. Acceptable for n < 1000. A spatial index (BVH / R-Tree) is deferred to v1.x per DEC-010.

### 6.2 Event dispatch

**onPress (bubbling)**:

- Created on mouse button release over a node matching the press-target.
- Walks up the parent chain:
  1. If node has `focusable`, set focus.
  2. If node has `onPress`, call with `PressEvent { stopPropagation, propagationStopped }`.
  3. If `event.propagationStopped`, stop.
- After dispatch: force a frame re-layout in the same tick to avoid 33ms lag between click and visual response (click re-layout optimization).

**onMouse* (per-node, no bubbling)**:

- Dispatched directly to the hit-tested node.
- Events: `onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseOver`, `onMouseOut`.
- Each receives `NodeMouseEvent { x, y, nodeX, nodeY, width, height }`.

**onKeyDown**:

- Dispatched to the currently focused node.
- Triggered by keyboard input after signal bridge.
- Receives `KeyEvent { key, ctrl, shift, alt, meta }`.

### 6.3 Focus system

- **Location**: `engine/src/reconciler/focus.ts`.
- **Registration**: nodes with `focusable={true}` register on mount; unregister on unmount (recursive for subtrees).
- **Tab navigation**: cycles through focusable nodes in DOM order within the active focus scope.
- **Focus scopes**: `pushFocusScope(scopeId)` / pop on close. Used by Dialog, Popover.
- **Focus restoration**: on scope pop, focus returns to the element that was focused before push.

---

## 7. Compositor-thread animation path

(See DEC-008 in PRD for the decision; this section describes the implementation.)

### 7.1 Qualification

A node's animation runs on the compositor-thread path if **all** of:

1. The animated properties are a subset of `{ transform, opacity }`.
2. The node has an explicit layer backing (from `layer={true}` or `willChange`).
3. No other property mutates during the animation window.
4. The animation is driven by `createTransition` or `createSpring`.

If any condition fails at runtime, Vexart falls back to the normal path with a `console.warn` identifying the offending node.

### 7.2 Data flow for a compositor-animated frame

```
createSpring(0, 1, { compositor: { nodeId, property: 'transform' } })
         │
         ▼
Animation descriptor registered:
  { nodeId, property: 'transform', from, to, easing, startTime }
         │
         ▼ (qualifying compositor-only frame)
Compositor path reuses cached layer targets and applies transform/opacity update
         │
         ▼
vexart_composite_update_uniform(_ctx, target, source_target, params_ptr, clear_rgba)
         │
         ▼
WGPU updates cached composition without walk/layout/assign/paint
         │
         ▼
Composite + Kitty emit as normal
```

### 7.3 Why this bypasses the main thread

- Production today already skips walk-tree, layout, assign-layers, and paint for qualifying compositor-only frames.
- The frame loop reuses cached layer targets and runs only compositor composition + output for those frames.
- The remaining gap is FULL JS-bypass ownership: Solid/reconciler updates may still happen before the compositor-only frame is selected.
- Target remains: 60fps maintained even if the main thread is busy with unrelated work.

### 7.4 When to fall back

Fall-back conditions force a full frame:

- Size-mutating properties (width, height, padding, margin, font-size) change during animation.
- `transform-origin` shifts (v1.x prop; not in v0.9).
- Node subtree adds/removes children.
- Layer backing is evicted by `ResourceManager`.

Fall-back incurs normal frame cost. Agents should warn users via `docs/performance.md` when a pattern is likely to force fall-back.

---

## 8. Resource management

(See DEC-010 in PRD for the decision; this section describes the implementation.)

### 8.1 `ResourceManager` struct

```rust
pub struct ResourceManager {
    pub budget_bytes: u64,
    pub current_usage: AtomicU64,
    pub high_water_mark: AtomicU64,
    pub resources: HashMap<ResourceKey, Resource>,
    pub evictions_last_frame: u32,
    pub evictions_total: u64,
    startup: Instant,
}

pub enum ResourceKind {
    LayerTarget,
    TerminalImage,
    FontAtlas,
    GlyphAtlas,
    ImageSprite,
    TransformSprite,
    BackdropSprite,
}

pub enum Priority {
    Visible,   // currently rendered
    Recent,    // used within the last 5 seconds
    Cold,      // older
}

pub struct Resource {
    pub kind: ResourceKind,
    pub size_bytes: u64,
    pub priority: Priority,
    pub last_used_frame: u64,
    pub gpu_handle: WgpuHandle,
    pub seconds_since_last_use: f64,
}
```

### 8.2 Lifecycle

1. **Create**: caller requests a resource; manager allocates if budget allows, otherwise triggers eviction.
2. **Use**: each frame, when a resource is touched (read/bind), the manager updates its `last_used_frame` and promotes to `Visible`.
3. **Demote**: at end of frame, resources not touched move `Visible → Recent`; after 5 seconds unused, `Recent → Cold`.
4. **Evict**: when total usage > budget, walk entries from `Cold` to `Recent` (never `Visible`) until usage ≤ budget.

### 8.3 Configuration

- Default budget: 512 MB (`DEFAULT_BUDGET_BYTES = 512 * 1024 * 1024`).
- Minimum: 32 MB (`MIN_BUDGET_BYTES = 32 * 1024 * 1024`, enforced in `set_budget`).
- Configurable via `mount({ gpuBudgetMb: 512 })` or `setNativeResourceBudget(mb)`.
- Maximum: unbounded (user's choice).

### 8.4 Observability

Resource metrics are split cleanly between native GPU management and TypeScript caches:

**Native Resource Manager stats (`getNativeResourceStats()` via FFI)**:

```ts
export type ResourceStats = {
  budgetBytes: number
  currentUsage: number
  highWaterMark: number
  resourcesByKind: Record<string, { count: number; bytes: number }>
  evictionsLastFrame: number
  evictionsTotal: number
}
```

**Aggregate Engine Resource stats (`getRendererResourceStats()`)**:

```ts
export function getRendererResourceStats(): {
  image: ImageCacheStats
  textLayout: TextLayoutCacheStats
  gpuRenderer: GpuRendererBackendCacheStats
  native: ResourceStats | null // Native stats from getNativeResourceStats()
}
```

---

## 9. Threading model

### 9.1 Threads in play

| Thread | Owner | What runs there |
|---|---|---|
| **JS event loop** | Bun | Solid reconciler adapter, scene graph, reactivity, walk-tree, Flexily layout, render graph generation, hooks, callback registry, input byte parsing, event dispatch, compatibility/test/offscreen fallback |
| **Rust sync thread** | Rust main | Paint-forward FFI calls from JS execute here; paint dispatch, composite, layer registry targets, image assets, Kitty encode/present, SHM/file/direct transport |
| **WGPU submission** | WGPU internal | Command buffer submission to GPU driver (Metal/Vulkan/DX12) |
| **WGPU GPU callbacks** | WGPU internal | GPU fence callbacks, readback completion |
| **Kitty writer** | Rust-owned | Buffered stdout writes from the Kitty encoder |

**There is no worker thread in JavaScript**. Bun's event loop is the single JS thread. All TS scene/layout/event work is synchronous or `async`-over-microtasks. Paint/composite/presentation work is native-owned; JavaScript does not run a separate render worker.

**There is no `tokio` or `rayon` in the Rust main path** for v0.9. Parallelism is deferred to v1.x per DEC-010's non-goal list.

### 9.2 Thread safety contract

- FFI calls from JS to Rust are synchronous. TS awaits completion.
- Rust internal paint/composite/presentation state is managed via the `SHARED_PAINT: LazyLock<Mutex<Option<PaintContext>>>` global singleton. The `_ctx: u64` parameter is reserved for ABI compatibility and forward multi-context extensibility; internal concurrency safety is guaranteed by the `Mutex`.
- WGPU handles concurrency internally — user code does not interact with GPU threads directly.
- The Kitty writer is a buffered `std::io::BufWriter` over stdout; writes are serialized at the OS level.

### 9.3 Why this model is sufficient for terminal UI

- Frame budget (16.6ms at 60fps) is mostly consumed by paint + composite + output, all of which happen in Rust → GPU. The JS thread stays on control-plane work and callback dispatch.
- Terminal UIs have small node counts (50-500 typical). Parallelism overhead > gain.
- Input latency is already below perception threshold with the adaptive loop + boost windows.

If profiling in v1.x shows the JS thread saturated, the solution is to optimize TS scene/layout/event work or split JS user-visible tasks across frames. Moving scene/layout/render/event ownership back to Rust requires new benchmark evidence and a new PRD decision superseding DEC-014.

---

## 10. Error handling

### 10.1 Error categories

| Category | Origin | Handling |
|---|---|---|
| **FFI error** | Rust returns non-zero code | TS checks return; fetches `vexart_get_last_error()`; throws `VexartNativeError` |
| **Panic in Rust** | Unexpected state | `catch_unwind` converts to error code `-1 (ERR_PANIC)`; TS re-throws with panic message |
| **GPU device lost** | WGPU callback | Rust emits `on_device_lost` signal; TS unmounts and attempts re-mount |
| **GPU OOM** | Exceeded resource budget | `ResourceManager` evicts aggressively; if still fails, frame is skipped with warning |
| **Terminal disconnected** | stdin EOF / SIGHUP | Engine unmounts cleanly; process exits 0 |
| **Unsupported terminal** | Capability probe fails | Engine exits at startup with clear error message + doc URL |
| **Layout impossible** | Flexily layout fails in TS | Log warning, fall back to zero-sized node, continue |
| **Animation target invalid** | Node destroyed mid-animation | Animation cancels silently |
| **User handler throws** | `onPress` raises | Caught at dispatch boundary, logged, frame continues |

### 10.2 Error types in TypeScript

```ts
export class VexartNativeError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message)
    this.name = 'VexartNativeError'
  }
}
```

### 10.3 Error code table (Rust → TS)

| Code | Name | Meaning |
|---|---|---|
| 0 | OK | Success |
| -1 | ERR_PANIC | Rust panic caught |
| -2 | ERR_INVALID_HANDLE | Context or target handle invalid |
| -3 | ERR_OUT_OF_BUDGET | GPU resource budget exhausted after eviction |
| -4 | ERR_GPU_DEVICE_LOST | WGPU device lost |
| -5 | ERR_LAYOUT_FAILED | Reserved for legacy/native layout errors; current layout is TS-side via Flexily |
| -6 | ERR_SHADER_COMPILE | Shader failed to compile (should not happen with pipeline cache) |
| -7 | ERR_KITTY_TRANSPORT | Kitty encoding / stdout write failed |
| -8 | ERR_INVALID_FONT | Font atlas corrupted or unsupported |

### 10.4 Logging strategy

- No implicit logging in hot paths. Every log is opt-in via env vars: `VEXART_DEBUG=1`, `VEXART_LOG_FPS=1`, `VEXART_LOG_EVICTION=1`.
- Logs go to stderr (not stdout — stdout is the Kitty protocol channel).
- `debugDumpTree()`, `debugDumpCulledNodes()` are explicit functions users call in their own debug flows.

---

## 11. Frame budget scheduler

(See DEC-010 Tier 2 in PRD for the decision; this section describes the implementation.)

### 11.1 Priority lanes

```ts
type TaskPriority = 'user-blocking' | 'user-visible' | 'background'

interface Task {
  priority: TaskPriority
  run: () => void
  enqueuedAt: number
}
```

- **`user-blocking`**: input parsing, focus changes, pointer events. **Never deferred.** Runs first each frame.
- **`user-visible`**: dirty layer repaint, animation ticks for non-compositor properties. Runs if budget remains.
- **`background`**: cache warming, telemetry aggregation, tree-sitter re-parse for idle documents. Runs only in idle windows.

### 11.2 Budget allocation per frame

Target frame time: 16.6ms at 60fps.
Budget cap before deferral: **12ms** (leaves 4ms of slack for OS overhead, JIT, GC).

Algorithm each frame:

```
1. Drain user-blocking queue. No budget check.
2. If elapsed < 12ms: drain user-visible queue, check budget before each task.
3. If elapsed < 12ms AND no dirty layers AND no input: drain background queue.
4. Budget exceeded tasks remain in queue for next frame.
```

### 11.3 Usage

Factory pattern in `packages/engine/src/scheduler/index.ts`:

```ts
import { createFrameScheduler } from '@vexart/engine'

const scheduler = createFrameScheduler()

// Enqueue tasks
const cancel = scheduler.scheduleTask('user-blocking', () => handleFocusChange())

// Per-frame execution (called by render loop)
scheduler.drainFrame(12, () => !isDirty && !hasRecentInput)

// Inspection & cleanup
scheduler.pendingCount()
scheduler.pendingInLane('background')
scheduler.clear()
```

### 11.4 Benchmarks protecting this behavior

- `bench:scheduler:saturation` — 10× background tasks running; verify user-blocking input latency still < 16ms.
- `bench:scheduler:fairness` — long-running user-visible split across frames; verify no task starves.

---

## 12. Build system

### 12.1 Workspace layout

```
vexart/
├── package.json              — Bun workspace root
├── tsconfig.json
├── Cargo.toml                — Cargo workspace for native/
├── native/
│   └── libvexart/            — the one and only Rust cdylib
├── packages/
│   ├── app/
│   ├── engine/
│   ├── headless/
│   ├── styled/
│   ├── internal-atlas-gen/
│   ├── internal-devtools/
│   └── internal-flexily/
├── scripts/
│   ├── build-native.ts       — cross-compile libvexart for all platforms
│   ├── build-dist.ts         — assemble npm tarball
│   └── gen-jsx-runtime.ts    — generate jsx-runtime.d.ts from TGEProps
└── docs/
```

### 12.2 Build commands

| Command | What it does |
|---|---|
| `bun install` | Install TS deps, resolve workspace links |
| `bun run native:build` | `cargo build --release` for the current platform, copy to `packages/engine/native/{platform}/` |
| `bun run native:build:all` | Cross-compile for aarch64-darwin, x86_64-darwin, aarch64-linux, x86_64-linux |
| `bun run typecheck` | `tsc --noEmit` across workspace |
| `bun run test` | Run all unit + integration tests |
| `bun run test:visual` | Run golden image suite |
| `bun run test:visual:update` | Regenerate golden references |
| `bun run bench` | Run `bench:showcase` + `bench:optimizations` |
| `bun run build` | Full distribution build: `native:build:all` + `build-dist` |
| `bun run showcase` | Run the comprehensive demo (development) |

### 12.3 FFI loading

`packages/engine/src/ffi/vexart-bridge.ts` loads `libvexart`:

```ts
function loadLib(): LibraryHandle {
  const platform = detectPlatform()  // e.g. "aarch64-darwin"
  const ext = platform.endsWith('darwin') ? '.dylib' :
              platform.endsWith('linux')  ? '.so'    :
              '.dll'
  const path = new URL(`../../native/${platform}/libvexart${ext}`, import.meta.url).pathname
  return dlopen(path, symbolSignatures)
}
```

The binary is packaged inside `@vexart/engine/native/{platform}/` in the npm tarball. `detectPlatform()` chooses at runtime.

### 12.4 Cross-compilation (for release)

- macOS host compiles for aarch64-darwin + x86_64-darwin natively.
- Linux builds run on a Linux CI host (GitHub Actions Linux runner).
- Windows support (v1.x) requires a Windows CI runner; skipped in v0.9.

### 12.5 Shader compilation

- At build time: WGSL files are embedded into the binary via `include_str!`.
- At first run: WGPU compiles them to native format, writes to `~/.cache/vexart/pipeline.{platform}-{version}.bin`.
- On subsequent runs: WGPU loads from cache. No recompile.

### 12.6 Reproducible builds

- `cargo build --release --locked` for deterministic Rust builds.
- `bun install --frozen-lockfile` for deterministic TS builds.
- Native binaries checksummed in `dist/native/SHA256SUMS`.

---

## 13. File and directory conventions

Rules for where things go. Following these keeps agents from inventing locations.

### 13.1 Adding a new hook

- Location: `packages/engine/src/hooks/use-X.ts`.
- Export from: `packages/engine/src/public.ts`.
- Test location: `packages/engine/src/hooks/use-X.test.ts`.

### 13.2 Adding a new primitive

Not expected in v0.9. New primitives require PRD amendment because they are architectural changes.

### 13.3 Adding a new headless component

- Location: `packages/headless/src/{category}/name.tsx` where category is `inputs`, `display`, `containers`, `collections`, `overlays`, `navigation`, `forms`.
- Export from: `packages/headless/src/public.ts`.
- Must expose `ctx.xxxProps` render-prop pattern.

### 13.4 Adding a new styled component

- Location: `packages/styled/src/components/name.tsx`.
- Must wrap an existing headless component.
- Uses tokens from `packages/styled/src/tokens/`.

### 13.5 Adding a new effect prop (shadow variant, etc.)

- Prop definition: `packages/engine/src/types.ts` (in `TGEProps`).
- Prop parsing: `packages/engine/src/reconciler/props.ts`.
- Effect config generation: `packages/engine/src/loop/paint.ts` (feed into render graph).
- Rust handling: `native/libvexart/src/paint/pipelines/{name}.rs` + `shaders/{name}.wgsl`.
- Documented in: `docs/api-reference.md`.

### 13.6 Adding a new shader

- Location: `native/libvexart/src/paint/shaders/name.wgsl`.
- Embedded via `include_str!` in the corresponding pipeline module (`pipelines/name.rs`).
- Added to `PipelineCache` build list.

### 13.7 Adding a new FFI function

- Rust implementation: `native/libvexart/src/{module}/`.
- Rust export: `native/libvexart/src/lib.rs` (all `#[no_mangle]` exports live here).
- TS stub: `packages/engine/src/ffi/functions.ts`.
- TS wrapper (if it provides safer types): in the module that uses it (`loop/paint.ts`, etc.).

### 13.8 Adding a new test

- Unit tests: colocated — `foo.ts` + `foo.test.ts`.
- Integration tests: `packages/{pkg}/tests/integration/`.
- Visual tests: `tests/visual/` (repo root). One PNG per scene.
- Benchmarks: `native/libvexart/benches/` (Rust) or `scripts/bench*.ts` / `scripts/frame-breakdown.tsx` (TS).

### 13.9 Adding documentation

- User docs: `docs/`.
- Architecture notes: this file. Existing derived design documents in
  `openspec/changes/*/design.md` are historical references, not a current
  execution requirement.
- API reference: auto-generated from `api-extractor` (`*.api.md` files in `etc/`).

### 13.10 Naming conventions

| Thing | Convention | Example |
|---|---|---|
| TS file | kebab-case | `hit-test.ts` |
| TS type | PascalCase | `PressEvent` |
| TS function | camelCase | `setFocusedId` |
| TS constant | SCREAMING_SNAKE | `MAX_CACHE` |
| Rust module | snake_case | `kitty_encoder` |
| Rust type | PascalCase | `ResourceManager` |
| Rust function | snake_case | `paint_dispatch` |
| FFI export | `vexart_{module}_{action}` | `vexart_paint_dispatch` |
| Shader file | snake_case | `msdf_text.wgsl` |
| Token | camelCase | `colors.primary` |

---

## 14. Testing strategy

### 14.1 Test pyramid

```
                     ┌─────────────────┐
                     │  Golden images  │  ~40 scenes
                     │  (visual)       │
                     └─────────────────┘
                    ┌───────────────────┐
                    │  Integration      │  ~50 tests
                    │  (pipeline phases)│
                    └───────────────────┘
                  ┌─────────────────────┐
                  │  Unit tests         │  ~200 tests
                  │  (per module)       │
                  └─────────────────────┘
                ┌───────────────────────┐
                │  Benchmarks           │  protects regression
                │  (bench:*)            │
                └───────────────────────┘
```

### 14.2 Unit tests

- Each exported function in a module has a test.
- Framework: `bun:test` (TS), `cargo test` (Rust).
- Coverage target: 80% of non-trivial functions.

### 14.3 Integration tests

- Each pipeline phase (walk-tree, layout, assign-layers, paint, composite, output) has fixture-based input → expected output.
- Fixtures stored as JSON in `packages/engine/src/loop/fixtures/`.
- Verify output shape, not exact bytes.

### 14.4 Visual tests (golden images)

- 40 scenes covering primitives, effects, components, and interaction snapshots.
- Reference PNGs stored in `scripts/visual-test/references/`.
- Diff threshold: 0.5% of pixels.
- Refreshed via `bun run test:visual:update` after human review.
- CI gate lives in `.github/workflows/phase4-gates.yml` and runs both API snapshot and visual regression checks.

### 14.5 Benchmarks

- `bench:showcase` — end-to-end FPS / latency under realistic load.
- `bench:optimizations` — micro-benchmarks for:
  - Kitty encoding throughput
  - WGPU PipelineCache cold / warm start
  - Viewport culling savings
  - ResourceManager eviction correctness
  - MSDF text throughput
- CI fails if any metric regresses by >10%.

---

## 15. Observability

### 15.1 Debug mode

- Activated via `VEXART_DEBUG=1` or `toggleDebug()` at runtime.
- Displays a terminal-rendered overlay with:
  - FPS (instant + p99)
  - GPU strategy (layered / sprite / full-redraw / full-layer)
  - Layer count (total / dirty / reused)
  - Resource usage (current / budget / high-water)
  - Input latency histogram

### 15.2 Programmatic introspection

Public APIs for observability (exposed from `@vexart/engine`):

```ts
debugDumpTree()                  — console.log-style TGENode tree
debugDumpCulledNodes()           — nodes skipped by viewport cull
debugState()                     — current frame stats
debugStatsLine()                 — one-line summary for logging
getRendererResourceStats()       — ResourceManager stats
getFontAtlasCacheStats()         — font/atlas cache stats
getTextLayoutCacheStats()        — text layout cache stats
getImageCacheStats()             — image cache stats
```

### 15.3 Trace exports

When `VEXART_TRACE=1`, the engine writes a Chrome-tracing-compatible JSON file to `~/.cache/vexart/trace-{timestamp}.json` at exit. This can be opened in `chrome://tracing/` for flamegraph analysis.

---

## 16. Extension points

Explicit places where user code or plugins can hook into Vexart. Everything else is internal.

### 16.1 `RendererBackend`

```ts
export type RendererBackend = {
  name: string
  beginFrame?: (ctx) => Plan | void
  paint: (ctx) => PaintResult | void
  reuseLayer?: (ctx) => boolean | void
  endFrame?: (ctx) => FrameResult | null | void
}
```

- Location: `packages/engine/src/public.ts`.
- Default: `createGpuRendererBackend()` (WGPU).
- Swap via `setRendererBackend(customBackend)`.
- Use case: testing / instrumentation / experimental alternative backends.

### 16.2 Theme system

- `createTheme(overrides)` in `@vexart/styled/src/theme/theme.ts`.
- `setTheme(theme)` updates SolidJS signals; components read reactive token getters from `themeColors` (e.g. `themeColors.background`) without component remounting or Context Providers.
- `getTheme()` and `getThemeVersion()` inspect the active theme and track updates.

### 16.3 Font atlas registration

- `registerFont({ id, source, metrics })` loads an MSDF atlas at runtime.
- Atlas produced by `@vexart/internal-atlas-gen` (CLI) from a TTF source.

### 16.4 Slot registry (plugins)

- `createSlotRegistry()` + `createSlot(name: string, registry: SlotRegistry)` for plugins to inject UI fragments without modifying core packages.
- Use case: devtools plugins, telemetry panels.

### 16.5 What is NOT an extension point (internal only)

- `ResourceManager` internals.
- Layer assignment algorithm.
- FFI contract.
- Shader set.
- Kitty encoding path.
- Reconciler implementation.

Touching any of these requires modifying Vexart itself, not extending it.

---

## Appendix A — Known debt (v0.1 → v0.9 migration)

This section documents deviations between the current v0.1 codebase and the target architecture described above. Each item is resolved in a specific phase. **This table is deleted when v0.9 ships.**

| Current state (v0.1) | Target | Resolved in |
|---|---|---|
| 16 packages with ghost / stub ones (`compat-*`, `compositor`, `output-compat`, `render-graph`, `scene`, `text`, `layout-clay`, `platform-terminal`, `gpu`, `output-kitty`) | 4 official packages (`@vexart/app`, `@vexart/styled`, `@vexart/headless`, `@vexart/engine`) + 3 internal | Phase 1 |
| Legacy package namespace | `@vexart/*` | Phase 1 |
| Relative imports across packages (`../../otro-paquete/src/...`) | Workspace imports (`@vexart/*`), CI-enforced | Phase 1 |
| Packages have no declared `dependencies` | Explicit `workspace:*` dependencies | Phase 1 |
| Former C layout engine and vendored layout sources | Flexily in TypeScript; no native layout writeback FFI | Phase 2 + DEC-014 + DEC-015 |
| Former CPU paint path | Deleted; GPU-only via WGPU | Phase 2 |
| `output-placeholder` + `output-halfblock` backends | Deleted; Kitty-only | Phase 2 |
| `gpu-frame-composer.ts` with CPU/GPU switch | Deleted; no CPU mode | Phase 2 |
| Multiple legacy native binaries | One native binary (`libvexart`) | Phase 2 |
| Kitty encoding / normal presentation in TypeScript (`Buffer.from(...).toString('base64')` and raw RGBA payloads) | Native Rust presentation; JS receives stats/status only | Native Presentation |
| `cache: None` in all WGPU pipelines (`native/wgpu-canvas-bridge/src/lib.rs` lines 676, 771, 882, 999, 1109, 1228, 1377, 1484, 1568, 1660) | Shared persistent `PipelineCache` on disk | Phase 2b |
| 5 independent caches with `MAX_*` constants (text-layout, font-atlas, image, etc.) | Unified `ResourceManager` with 512 MB default budget | Phase 2b |
| 89-glyph ASCII bitmap font atlas | MSDF atlas (1024×1024) per runtime-loaded font | Phase 2b |
| No compositor-thread animation path | `transform` / `opacity` animations bypass main thread | Phase 2b |
| No self-filter support (only `backdrop-*`) | `filter` prop paralleling `backdropFilter` | Phase 2b |
| No `willChange` / `contain` props | Declarative compositor hints | Phase 2b |
| No viewport culling | Automatic in `walk-tree` | Phase 3 |
| No frame budget scheduler | Three-priority scheduler in `engine/src/scheduler/` | Phase 3 |
| `loop.ts` at 2451 lines (God Module) | < 400 lines, decomposed into 6 files (`walk-tree`, `layout`, `assign-layers`, `paint`, `composite`, `output`) | Phase 3 |
| `gpu-renderer-backend.ts` at 2007 lines | Decomposed into `native/libvexart/src/paint/` modules | Phase 2 + Phase 3 |
| `export *` from package entries (leaks all internals) | Explicit `public.ts` per package, `api-extractor`-snapshotted | Phase 4 |
| `any` casts in reconciler `setProperty` | Discriminated-union prop handlers | Phase 4 |
| Hand-written `jsx-runtime.d.ts` | Auto-generated from `TGEProps` | Phase 4 |
| No golden image tests | 40+ golden tests in CI | Phase 4 |
| No API surface snapshot | `api-extractor` `.api.md` files locked by CI | Phase 4 |
| No `bench:optimizations` benchmark suite | Per-optimization micro-benchmarks | Phase 2b + Phase 3 |
| `starfield` / `nebula` experimental primitives | Moved to `examples/` or deleted | Phase 2 |
| Runtime font atlases limited to 15 ids | Unlimited (governed by `ResourceManager` budget) | Phase 2b |
| TS owns layer GPU target handles and terminal image IDs | Rust `LayerRegistry` owns target/image lifecycle and resource accounting | Native layer registry |
| Native ownership plan for scene graph / layout / render graph / event dispatch | Reverted; TS owns scene graph, reactivity, Flexily layout, render graph, and event dispatch | DEC-014 / Phase 14 |
| Native scene/layout/render/event experimental flags | Removed from public `mount()` API | DEC-014 / Phase 14 |
| Paint/composite/transport in TS hot path | Rust owns WGPU paint, composite, Kitty encoding, SHM/file/direct transport, and image assets (canvas is rasterized in TS and uploaded as RGBA) | DEC-014 / Phase 14 |

---

## Appendix B — Contract reference

Quick index of the type contracts that agents reference most.

### B.1 Core types (in `@vexart/engine`)

| Type | Location | Purpose |
|---|---|---|
| `TGENode` | `ffi/node-types.ts` | TypeScript scene tree node |
| `TGEProps` | `ffi/node-types.ts` | Prop contract for all primitives |
| `PressEvent` | `reconciler/pointer.ts` | Event for `onPress` bubbling |
| `NodeMouseEvent` | `input/types.ts` | Event for `onMouse*` per-node |
| `Layer` | `ffi/layers.ts` | Compositing layer |
| `WalkResult`, `LayoutFrame`, `LayerPlan`, `PaintResult`, `CompositeResult`, `EmitStats` | `loop/{phase}.ts` | Phase contracts |
| `Terminal`, `Capabilities`, `TerminalSize` | `terminal/index.ts` | Terminal handle |

### B.2 FFI functions (in `libvexart`)

All exports prefixed `vexart_{module}_{action}`. Exactly 50 native functions are exported by `libvexart`:

```
// Version & Lifecycle (3)
vexart_version
vexart_context_create
vexart_context_destroy

// Paint (3)
vexart_paint_dispatch
vexart_paint_upload_image
vexart_paint_remove_image

// Composite & Target Lifecycle (13)
vexart_composite_target_create
vexart_composite_target_destroy
vexart_composite_target_begin_layer
vexart_composite_target_end_layer
vexart_composite_target_set_scissor
vexart_composite_target_reset_scissor
vexart_composite_render_image_layer
vexart_composite_render_image_transform_layer
vexart_composite_update_uniform
vexart_composite_copy_region_to_image
vexart_composite_image_filter_backdrop
vexart_composite_image_mask_rounded_rect
vexart_composite_image_mask_rounded_rect_region

// Readback (2)
vexart_composite_readback_rgba
vexart_composite_readback_region_rgba

// Kitty Transport & Presentation (10)
vexart_kitty_set_transport
vexart_kitty_shm_prepare
vexart_kitty_shm_release
vexart_kitty_emit_frame_with_stats
vexart_kitty_emit_layer
vexart_kitty_emit_layer_target
vexart_kitty_emit_region_target
vexart_kitty_delete_layer
vexart_kitty_emit_placeholder_frame
vexart_kitty_delete_placeholder

// POSIX SHM Extended & Cleanup (3)
vexart_kitty_emit_placeholder_shm_frame
vexart_kitty_shm_is_consumed
vexart_kitty_shm_cleanup_all

// Native Layer Registry (5)
vexart_layer_upsert
vexart_layer_reuse
vexart_layer_remove
vexart_layer_clear
vexart_layer_present_dirty

// Resource Manager (2)
vexart_resource_get_stats
vexart_resource_set_budget

// Image Assets (3)
vexart_image_asset_register
vexart_image_asset_touch
vexart_image_asset_release

// MSDF Font System (4)
vexart_font_init
vexart_font_query
vexart_font_render_text
vexart_font_measure

// Error Retrieval (2)
vexart_get_last_error_length
vexart_copy_last_error
```

The exact list is maintained across `native/libvexart/src/lib.rs` (and submodules) and mirrored in `packages/engine/src/ffi/vexart-bridge.ts`.

### B.3 Extension point interfaces

| Interface | Location |
|---|---|
| `RendererBackend` | `@vexart/engine` `public.ts` |
| `ThemeDefinition`, `ColorTokens` | `@vexart/styled` `theme/` |
| `FontDescriptor` | `@vexart/engine` `public.ts` |
| `SlotRegistry`, `Slot` | `@vexart/engine` `public.ts` |

---

**END OF ARCHITECTURE v0.2**
