# Vexart — Architecture Reference

**Version**: 0.2
**Status**: Target architecture — describes the state of the codebase after the Rust-retained engine cutover in the v0.9 roadmap.
**Owner**: Founder (solo developer)
**Companion to**: [PRD](./PRD.md), [API-POLICY](./API-POLICY.md)

---

## ⚠️ How to read this document

This document describes the **target architecture** — how Vexart is organized after all v0.9 phases and the Rust-retained engine cutover complete. It is **not** a description of temporary migration scaffolding.

**When reading this as an AI agent**: treat this as the source of truth for code organization. Any file layout, module boundary, data-flow contract, or convention described here is the authoritative answer. If your task contradicts this document, the document wins — flag the contradiction and stop.

**When reading this as a human reviewer**: expect the current code to diverge from this document during Phases 1-5. Each phase migrates the codebase closer to this target. The `Appendix A` lists known deviations and which phase resolves each.

**Rules for changes to this document**:
- Structural changes (package structure, data flow, threading model) require a PRD amendment with a Decisions Log entry.
- Clarifications and refinements are appended directly, with a dated comment.
- This document is versioned in lockstep with the PRD when architectural decisions shift.

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

If a conflict emerges, the PRD wins at the policy layer; this document wins at the implementation layer.

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
│  @vexart/primitives — JSX intrinsics               │
│  (<box>, <text>, <image>, <canvas>)                │
└──────────────────────┬─────────────────────────────┘
                       ▼
┌────────────────────────────────────────────────────┐
│  @vexart/engine — SolidJS shell + FFI binding      │
│  1. Reconciler sends node mutations to Rust        │
│  2. JS stores callback registry + public handles   │
│  3. JS forwards input and dispatches native events │
└──────────────────────┬─────────────────────────────┘
                       │  FFI (packed ArrayBuffer, ≤8 params)
                       ▼
┌────────────────────────────────────────────────────┐
│  libvexart.{dylib,so,dll} — Rust cdylib            │
│  Modules: scene / layout (Taffy) / damage /        │
│  hit-test / layer registry / render graph /        │
│  paint (WGPU) / composite / resource / text        │
│  (MSDF) / kitty encoder / frame orchestrator       │
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

### 2.2 Package layering (app framework + four public engine packages + internal)

```
PUBLIC PACKAGES (shipped to consumers)

@vexart/app       depends on: styled, headless, primitives, engine
  Bun-native app framework: router, className mapper, config, CLI helpers

┌───────────────────────────────────┐
│  @vexart/styled                   │  depends on: headless, primitives, engine
│  — Opinionated themed components  │
└──────────────┬────────────────────┘
               ▼
┌───────────────────────────────────┐
│  @vexart/headless                 │  depends on: primitives, engine
│  — Behavior, keyboard, state      │
└──────────────┬────────────────────┘
               ▼
┌───────────────────────────────────┐
│  @vexart/primitives               │  depends on: engine
│  — JSX intrinsics + prop types    │
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
@vexart/internal-benchmarks   ← performance benchmarks harness
```

### 2.3 The two-binary rule

Vexart ships exactly **two runtime artifacts**:

1. **TypeScript source (`.js`/`.d.ts`)** — the app framework, engine, primitives, headless, styled packages distributed via npm.
2. **Native binary (`libvexart`)** — one `.dylib`/`.so`/`.dll` per supported platform, embedded inside `@vexart/engine/native/{platform}/`.

No other binaries exist. No other languages. If a task proposes adding a third runtime artifact, it requires a PRD amendment.

### 2.4 Language-to-layer mapping

| Layer | Language | Why |
|---|---|---|
| App, Styled, Headless, Primitives | TypeScript (with JSX) | Developer-facing API surface. Leverages SolidJS reactivity and Bun-native tooling. |
| Engine | TypeScript | Public JS/JSX shell: reconciliation adapter, hooks, callback registry, handles, feature flags, compatibility fallback. Bun runtime. |
| libvexart | Rust (cdylib) | Retained scene graph, layout, damage, hit-testing, layer registry, render graph, frame orchestration, resources, paint, composite, Kitty encoding. Zero-overhead, cross-platform. |
| Shaders | WGSL | One shader language, runs on Metal, Vulkan, DX12 via WGPU. |

### 2.5 Retained ownership rule

After the retained-engine cutover, Rust is the single implementation owner for frame-critical behavior. TypeScript may request a frame, forward events, and dispatch callbacks, but it must not own ordinary layout state, render graph generation, layer target lifetime, terminal image IDs, or raw terminal presentation payloads.

Allowed TypeScript hot-path responsibilities:

- Encode SolidJS create/update/remove mutations into native scene FFI calls.
- Keep JS callback closures in a registry keyed by native node IDs.
- Forward keyboard/pointer input to Rust and invoke returned callback records.
- Maintain public handles as lightweight wrappers over native IDs.
- Keep explicit readback APIs for screenshot, debug, test, or offscreen rendering.

Forbidden as target-state responsibilities:

- Rebuilding the layout tree per frame in TypeScript.
- Generating ordinary paint/render graph command batches in TypeScript.
- Owning GPU layer target handles or terminal image IDs in TypeScript.
- Returning full-frame or layer RGBA buffers to TypeScript for normal terminal presentation.
- Making final frame strategy decisions in TypeScript.

---

## 3. Package structure

Each public package has a fixed internal layout. New files go into existing directories, never at package root. New directories require updating this document.

### 3.1 `@vexart/engine`

```
packages/engine/
├── package.json
├── src/
│   ├── public.ts              — explicit public exports (see API-POLICY)
│   ├── index.ts               — re-exports public.ts (compatibility)
│   ├── mount.ts               — createTerminal(), mount(), unmount()
│   │
│   ├── reconciler/            — SolidJS universal reconciler integration
│   │   ├── index.ts           — createRenderer<TGENode>() instance
│   │   ├── node.ts            — TGENode type definition
│   │   ├── props.ts           — prop normalization (color parsing, sizing, effects)
│   │   ├── focus.ts           — focusable registration lifecycle
│   │   └── handle.ts          — createHandle, NodeHandle interface
│   │
│   ├── loop/                  — thin compatibility shell (index.ts ≤ 400 lines)
│   │   ├── index.ts           — createRenderLoop(): request native frames, dispatch callbacks
│   │   ├── fallback/          — legacy TS-owned path, test/emergency only after cutover
│   │   └── stats.ts           — decode native frame/presentation stats
│   │
│   ├── hooks/                 — SolidJS hooks for user code
│   │   ├── use-focus.ts
│   │   ├── use-keyboard.ts
│   │   ├── use-mouse.ts
│   │   ├── use-input.ts
│   │   ├── use-drag.ts
│   │   ├── use-hover.ts
│   │   └── use-query.ts       — data hooks (query, mutation)
│   │
│   ├── input/                 — terminal input pipeline and native-event bridge
│   │   ├── parser.ts          — ANSI/SGR/URXVT escape sequence decoder
│   │   ├── dispatch.ts        — parsed events → native input FFI → JS callback dispatch
│   │   ├── event-decoder.ts   — native event records → PressEvent / NodeMouseEvent wrappers
│   │   ├── pointer-capture.ts — setPointerCapture / releasePointerCapture
│   │   └── bracketed-paste.ts — paste event decoding
│   │
│   ├── animation/
│   │   ├── transition.ts      — createTransition (tween)
│   │   ├── spring.ts          — createSpring (physics)
│   │   ├── easing.ts          — easing presets
│   │   └── compositor-path.ts — compositor-thread fast path for transform/opacity
│   │
│   ├── scheduler/             — JS-side user timing / compatibility scheduler
│   │   ├── index.ts           — scheduleTask(priority, fn)
│   │   ├── priority.ts        — user-blocking / user-visible / background queues
│   │   └── budget.ts          — per-frame budget accounting
│   │
│   ├── ffi/                   — bridge to libvexart
│   │   ├── bridge.ts          — bun:ffi loader, dylib resolution
│   │   ├── buffer.ts          — packed ArrayBuffer(64) pattern
│   │   ├── types.ts           — TS mirrors of Rust FFI types
│   │   ├── scene.ts           — scene/node mutation wrappers
│   │   ├── props.ts           — prop encoder + generated prop IDs
│   │   ├── native-events.ts   — event record decoder
│   │   └── functions.ts       — stub signatures for every vexart_* export
│   │
│   ├── resources/             — TS-side observers of libvexart's ResourceManager
│   │   ├── stats.ts           — getRendererResourceStats()
│   │   └── budget.ts          — setGpuBudgetMb()
│   │
│   ├── terminal/              — terminal lifecycle
│   │   ├── detect.ts          — capability detection (Kitty / WezTerm / Ghostty)
│   │   ├── raw-mode.ts        — enter/exit raw mode
│   │   ├── signals.ts         — SIGWINCH (resize), SIGINT, exit cleanup
│   │   └── caps.ts            — Capabilities type
│   │
│   ├── debug/
│   │   ├── toggle.ts          — toggleDebug(), setDebug()
│   │   ├── stats-overlay.ts   — terminal-rendered FPS / strategy / stats
│   │   └── dump.ts            — debugDumpTree(), debugDumpCulledNodes()
│   │
│   └── types.ts               — TGEProps (the prop contract)
│
├── native/                    — prebuilt libvexart binaries
│   ├── aarch64-darwin/libvexart.dylib
│   ├── x86_64-darwin/libvexart.dylib
│   ├── aarch64-linux/libvexart.so
│   └── x86_64-linux/libvexart.so
│
└── jsx-runtime.d.ts           — auto-generated from TGEProps
```

**Key rules for engine**:

- `loop/index.ts` orchestrates only — never contains layout / paint / composite logic directly. Those live in their respective files.
- Every `vexart_*` Rust export has a TypeScript stub in `ffi/functions.ts`. No ad-hoc FFI calls.
- Hooks never import from `loop/`. Loop never imports from `hooks/`. They communicate via signals declared in `input/dispatch.ts` and focus state in `reconciler/focus.ts`.

### 3.2 `@vexart/primitives`

```
packages/primitives/
├── package.json
└── src/
    ├── public.ts
    ├── index.ts
    ├── box.tsx               — <Box> primitive wrapper (optional sugar)
    ├── text.tsx              — <Text> primitive wrapper
    ├── image.tsx             — <Image> primitive wrapper
    ├── canvas.tsx            — <Canvas> primitive wrapper
    ├── span.tsx              — <Span> inline text
    └── rich-text.tsx         — <RichText> multi-span text
```

**Purpose**: thin typed wrappers around the JSX intrinsics (`<box>`, `<text>`, etc.) that provide prop validation and convenience APIs. Consumers can use intrinsics directly or these wrappers; both are supported.

**Rule**: Primitives never contain state, effects, or event handlers beyond pass-through. If logic is needed, it belongs in headless.

### 3.3 `@vexart/headless`

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
    │   ├── select.tsx
    │   └── combobox.tsx
    │
    ├── display/
    │   ├── progress-bar.tsx
    │   ├── badge.tsx
    │   ├── avatar.tsx
    │   ├── skeleton.tsx
    │   ├── separator.tsx
    │   ├── code.tsx          — syntax-highlighted code block
    │   └── markdown.tsx
    │
    ├── containers/
    │   ├── scroll-view.tsx
    │   ├── tabs.tsx
    │   ├── card.tsx
    │   └── portal.tsx
    │
    ├── collections/
    │   ├── list.tsx
    │   ├── virtual-list.tsx
    │   └── table.tsx
    │
    ├── overlays/
    │   ├── dialog.tsx
    │   ├── tooltip.tsx
    │   ├── popover.tsx
    │   └── toast.tsx
    │
    ├── navigation/
    │   ├── router.tsx        — flat + stack
    │   └── diff.tsx
    │
    └── forms/
        └── create-form.ts    — createForm() factory
```

**Contract for headless components**:

- Every component accepts a `renderX` callback receiving a `ctx` object.
- `ctx` contains stable prop-bag fields: `ctx.buttonProps`, `ctx.toggleProps`, `ctx.itemProps(id)`, etc. These are spread onto the root primitive.
- The `ctx.*Props` API is part of the public contract. Adding fields is a minor version bump; removing or renaming is breaking.

### 3.4 `@vexart/styled`

```
packages/styled/
├── package.json
└── src/
    ├── public.ts
    ├── index.ts
    │
    ├── tokens/
    │   ├── colors.ts         — void theme palette
    │   ├── radius.ts
    │   ├── space.ts
    │   ├── typography.ts
    │   └── shadows.ts
    │
    ├── theme/
    │   ├── create-theme.ts   — createTheme(overrides)
    │   ├── provider.tsx      — ThemeProvider
    │   └── use-theme.ts      — useTheme() hook
    │
    ├── components/           — styled wrappers around headless
    │   ├── button.tsx        — uses @vexart/headless Button + tokens
    │   ├── card.tsx
    │   ├── badge.tsx
    │   ├── avatar.tsx
    │   ├── skeleton.tsx
    │   ├── separator.tsx
    │   ├── dialog.tsx
    │   ├── select.tsx
    │   ├── switch.tsx
    │   └── (etc.)
    │
    └── typography/
        ├── h1.tsx
        ├── h2.tsx
        ├── h3.tsx
        ├── h4.tsx
        ├── p.tsx
        ├── lead.tsx
        ├── large.tsx
        ├── small.tsx
        └── muted.tsx
```

**Contract for styled components**:

- Every styled component is a wrapper around a headless component that supplies a default `renderX` using tokens.
- Users can override styling by passing their own `renderX` to the styled component.
- Tokens are theme-scoped. Components read via `useTheme()`.

### 3.5 `@vexart/app`

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
    `-- runtime/               — Page, mountApp, app lifecycle helpers
```

**Contract for app framework**:

- Runtime is Bun-native: Next-like DX, Bun runtime, Vexart renderer.
- `@vexart/app` is the only public app-framework package during alpha/beta.
- Internal modules may be extracted later, but user docs should import from `@vexart/app`.
- The framework must not depend on Next.js, DOM, CSSOM, hydration, or React DOM.
- Filesystem routing discovers `app/**/page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, and `not-found.tsx`; route groups are omitted from URL paths and private folders (`_name`) are skipped.
- `vexart dev` generates `.vexart/routes.ts` plus `.vexart/dev.tsx` when no explicit entrypoint exists, then runs Bun with watch mode by default.

### 3.6 Internal tooling packages

Not published to npm. Live in the monorepo for development.

```
packages/internal-atlas-gen/    — CLI: TTF → MSDF atlas PNG + metrics JSON
packages/internal-benchmarks/   — bench:showcase, bench:optimizations runners
```

---

## 4. The native binary — `libvexart`

### 4.1 Crate layout

```
native/libvexart/
├── Cargo.toml
├── build.rs                   — embeds WGSL shaders, pipeline cache init
├── src/
│   ├── lib.rs                 — FFI exports (vexart_* functions)
│   │
│   ├── layout/                — Taffy integration
│   │   ├── mod.rs
│   │   ├── tree.rs            — TGENode-equivalent → Taffy tree
│   │   ├── writeback.rs       — Taffy computed layout → FFI buffer
│   │   └── measure.rs         — text measurement callback for Taffy
│   │
│   ├── paint/                 — WGPU rendering
│   │   ├── mod.rs             — paint() entry point, pipeline dispatch
│   │   ├── context.rs         — WGPU device/queue/surface lifetime
│   │   ├── pipelines/         — pipeline state objects
│   │   │   ├── mod.rs
│   │   │   ├── rect.rs
│   │   │   ├── circle.rs
│   │   │   ├── gradient.rs    — linear / radial / conic / multi-stop
│   │   │   ├── image.rs
│   │   │   ├── glyph.rs       — MSDF text
│   │   │   ├── glow.rs
│   │   │   ├── shadow.rs
│   │   │   ├── backdrop.rs    — backdrop filter chain
│   │   │   ├── filter.rs      — self filters
│   │   │   └── blend.rs       — CSS blend modes
│   │   ├── shaders/           — WGSL sources (compiled into binary)
│   │   │   ├── sdf_rect.wgsl
│   │   │   ├── msdf_text.wgsl
│   │   │   ├── linear_gradient.wgsl
│   │   │   ├── radial_gradient.wgsl
│   │   │   ├── conic_gradient.wgsl
│   │   │   ├── glow.wgsl
│   │   │   ├── shadow.wgsl
│   │   │   ├── backdrop_filter.wgsl
│   │   │   ├── self_filter.wgsl
│   │   │   └── blend_mode.wgsl
│   │   ├── instances.rs       — #[repr(C)] instance structs
│   │   ├── pipeline_cache.rs  — disk-persisted WGPU PipelineCache (Tier 1)
│   │   └── culling.rs         — viewport culling helpers (Tier 2)
│   │
│   ├── composite/             — layer compositing
│   │   ├── mod.rs             — composite() entry point
│   │   ├── target.rs          — offscreen render targets
│   │   ├── readback.rs        — GPU → CPU buffer for final output
│   │   └── damage.rs          — damage rect intersection / union
│   │
│   ├── resource/              — unified GPU memory budget (Tier 1)
│   │   ├── mod.rs             — ResourceManager
│   │   ├── priority.rs        — Visible / Recent / Cold tiers
│   │   ├── eviction.rs        — LRU walk + free
│   │   └── stats.rs           — stats export for observability
│   │
│   ├── text/                  — MSDF text pipeline (DEC-008)
│   │   ├── mod.rs
│   │   ├── atlas.rs           — runtime atlas loading + caching
│   │   ├── glyph_info.rs      — metrics, kerning (basic)
│   │   └── render.rs          — MSDF shader dispatch
│   │
│   ├── kitty/                 — Kitty protocol encoder (Tier 1, native Rust)
│   │   ├── mod.rs             — public kitty_emit_frame()
│   │   ├── encoder.rs         — base64 + compression + escape sequences
│   │   ├── transport.rs       — direct / file / shared-memory transport modes
│   │   └── writer.rs          — buffered stdout writer
│   │
│   ├── scheduler/             — work coordination within Rust (not public)
│   │   ├── mod.rs
│   │   └── task.rs
│   │
│   ├── ffi/                   — FFI decoders and safety helpers
│   │   ├── mod.rs
│   │   ├── buffer.rs          — packed ArrayBuffer decoder
│   │   ├── error.rs           — error codes, last_error storage
│   │   └── panic.rs           — catch_unwind wrapper for every export
│   │
│   └── types.rs               — shared Rust types (Color, Rect, TransformMatrix)
│
├── benches/
│   └── bench_optimizations.rs — Kitty encoding, ResourceManager, MSDF, pipeline cache
└── tests/
    ├── integration/
    └── unit/
```

### 4.2 FFI contract

Every export from `libvexart` obeys:

1. **Function signature**: `pub extern "C" fn vexart_<module>_<action>(...) -> i32` — integer return code (0 = OK, non-zero = error code).
2. **Parameter count**: ≤ 8 parameters. If more are needed, the last parameter is `*const u8` pointing to a packed ArrayBuffer with further fields.
3. **Panic safety**: every export wraps its body in `std::panic::catch_unwind`. A panic converts to error code `ERR_PANIC = -1` and stores the message in `thread_local` for retrieval.
4. **Error retrieval**: `vexart_get_last_error_length()` and `vexart_copy_last_error(*mut u8, u32)` expose the most recent error string to TypeScript.
5. **No allocations visible to caller**: caller-provided buffers are used for writes. Rust-internal allocations are bounded by `ResourceManager` or stack.

Example FFI export:

```rust
#[no_mangle]
pub extern "C" fn vexart_paint_dispatch(
    context: u64,
    target: u64,
    graph_ptr: *const u8,
    graph_len: u32,
    stats_out: *mut FrameStats,
) -> i32 {
    std::panic::catch_unwind(|| {
        let ctx = unsafe { &*(context as *const PaintContext) };
        let graph = unsafe { std::slice::from_raw_parts(graph_ptr, graph_len as usize) };
        paint::dispatch(ctx, target, graph, unsafe { &mut *stats_out })
    })
    .unwrap_or(ERR_PANIC)
}
```

### 4.3 Shader organization

- All shaders in WGSL.
- One `.wgsl` file per pipeline variant.
- Shader modules embedded in the binary via `include_str!` at compile time.
- Pipeline compilation happens at startup, persisted to disk via WGPU's `PipelineCache`.
- No runtime shader generation or string concatenation. If a feature needs variants, they are separate shader files.

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
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│ Reconciler  │────▶│  Walk tree  │────▶│   Layout     │
│ (SolidJS)   │     │ (+ viewport │     │  (Taffy FFI) │
│             │     │    cull)    │     │              │
└─────────────┘     └─────────────┘     └──────┬───────┘
                                                │
                                                ▼
                                         ┌─────────────┐
                                         │  Assign     │
                                         │  layers     │
                                         │ (3-phase)   │
                                         └──────┬──────┘
                                                │
                                                ▼
                                         ┌─────────────┐
                                         │    Paint    │
                                         │  (WGPU FFI) │
                                         └──────┬──────┘
                                                │
                                                ▼
                                         ┌─────────────┐
                                         │  Composite  │
                                         │  (layer     │
                                         │   merge)    │
                                         └──────┬──────┘
                                                │
                                                ▼
                                         ┌─────────────┐
                                         │   Output    │
                                         │  (Kitty     │
                                         │ encoder FFI)│
                                         └──────┬──────┘
                                                │
                                                ▼
                                          [stdout bytes]
```

### 5.2 Phase contracts

Each phase is a function with a strict input/output type. Phases are never reordered or interleaved; the loop is deterministic.

#### 5.2.1 Reconciliation (SolidJS)

- **Location**: `engine/src/reconciler/`.
- **Input**: JSX function calls from user code.
- **Output**: mutations to the `TGENode` tree.
- **Side effect**: sets a dirty flag via `markDirty()`.

This phase is asynchronous relative to the frame loop — SolidJS mutates the tree as signals fire. The loop reads the tree at the start of each frame.

#### 5.2.2 Walk tree

- **Location**: `engine/src/loop/walk-tree.ts`.
- **Signature**:
  ```ts
  walkTree(root: TGENode, viewport: Rect): WalkResult
  ```
- **Output type**:
  ```ts
  type WalkResult = {
    clayCommands: ClayCommand[]      // flat list in tree order
    interactiveNodes: InteractiveNode[]
    transformSubtrees: TransformSubtree[]
    culledCount: number              // for debug / telemetry
  }
  ```
- **Responsibilities**:
  - Depth-first traversal of `TGENode` tree.
  - Compute axis-aligned bounding box per subtree (bottom-up).
  - Skip subtrees whose AABB is fully outside `viewport` (viewport culling, Tier 2).
  - Emit layout commands for Taffy.
  - Collect interactive nodes (focusable, onPress, etc.).
  - Collect transform subtrees for the 3-pass paint pipeline.

#### 5.2.3 Layout

- **Location**: `engine/src/loop/layout.ts` (TS orchestration) + `native/libvexart/src/layout/` (Taffy integration).
- **Signature**:
  ```ts
  runLayout(walk: WalkResult, size: TerminalSize): LayoutFrame
  ```
- **Output type**:
  ```ts
  type LayoutFrame = {
    positioned: PositionedCommand[]
    damage: DamageRect[]
    rootRect: Rect
  }
  ```
- **Responsibilities**:
  - Send layout commands to Taffy via FFI (`vexart_layout_compute`).
  - Taffy computes box positions, dimensions, text wrap.
  - Read back computed positions into `PositionedCommand[]`.
  - Diff against previous frame's layout → produce damage rects.

#### 5.2.4 Assign layers

- **Location**: `engine/src/loop/assign-layers.ts`.
- **Signature**:
  ```ts
  assignLayers(frame: LayoutFrame, interactionMode: InteractionMode): LayerPlan
  ```
- **Output type**:
  ```ts
  type LayerPlan = {
    layers: Layer[]
    commandsPerLayer: Map<LayerId, PositionedCommand[]>
    z_order: LayerId[]
  }
  ```
- **Three-phase algorithm** (Phase 1 → 2 → 3):
  1. **Scroll**: extract scroll containers → one layer per viewport + scissor pair.
  2. **Background**: color-anchor solid backgrounds and decorations into background layers.
  3. **Static**: remaining commands → spatial + content-based assignment.

#### 5.2.5 Paint

- **Location**: `engine/src/loop/paint.ts` (dispatcher) + `native/libvexart/src/paint/` (implementation).
- **Signature**:
  ```ts
  paintLayers(plan: LayerPlan): PaintResult
  ```
- **Output type**:
  ```ts
  type PaintResult = {
    paintedLayerIds: LayerId[]
    skippedCleanLayers: LayerId[]
    timingMs: number
  }
  ```
- **Responsibilities**:
  - For each dirty layer, call `vexart_paint_dispatch` with its command slice.
  - Clean layers reuse their previous GPU target — no FFI call.
  - Compositor-animated nodes skip paint entirely — only uniform update.

#### 5.2.6 Composite

- **Location**: `engine/src/loop/composite.ts` (dispatcher) + `native/libvexart/src/composite/` (implementation).
- **Signature**:
  ```ts
  compositeLayers(plan: LayerPlan, paint: PaintResult): CompositeResult
  ```
- **Output type**:
  ```ts
  type CompositeResult = {
    finalTargetHandle: u64         // GPU target with merged layers
    needsReadback: boolean
  }
  ```
- **Responsibilities**:
  - Z-order composition of layers onto a final target.
  - Handle transform subtrees (inverse blit pass).
  - If `needsReadback`, prepare GPU → CPU transfer.

#### 5.2.7 Output (Kitty encoding)

- **Location**: `engine/src/loop/output.ts` (dispatcher) + `native/libvexart/src/kitty/` (implementation, Tier 1).
- **Signature**:
  ```ts
  emitFrame(result: CompositeResult): EmitStats
  ```
- **Output type**:
  ```ts
  type EmitStats = {
    bytesWritten: number
    encodingTimeMs: number
    transportMode: 'direct' | 'file' | 'shm'
  }
  ```
- **Responsibilities**:
  - Call `vexart_kitty_emit_frame(finalTargetHandle)`.
  - Rust encodes base64 + compression + escape sequences entirely on native side.
  - Bytes streamed directly to stdout via buffered writer.
  - **Never** goes through JavaScript `Buffer.toString('base64')`.

### 5.3 End-to-end type flow (one diagram)

```
TGENode tree
   │
   │ walkTree()
   ▼
WalkResult { clayCommands, interactiveNodes, transformSubtrees }
   │
   │ runLayout()
   ▼
LayoutFrame { positioned, damage, rootRect }
   │
   │ assignLayers()
   ▼
LayerPlan { layers, commandsPerLayer, z_order }
   │
   │ paintLayers()
   ▼
PaintResult { paintedLayerIds, skippedCleanLayers }
   │
   │ compositeLayers()
   ▼
CompositeResult { finalTargetHandle, needsReadback }
   │
   │ emitFrame()
   ▼
EmitStats { bytesWritten, encodingTimeMs, transportMode }
   │
   ▼
Terminal receives pixel image via Kitty protocol
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
Compositor path reuses retained layer target and applies transform/opacity update
         │
         ▼
vexart_composite_update_uniform(target, sourceTarget, transformQuad+opacity)
         │
         ▼
WGPU updates retained composition without walk/layout/assign/paint
         │
         ▼
Composite + Kitty emit as normal
```

### 7.3 Why this bypasses the main thread

- Production today already skips walk-tree, layout, assign-layers, and paint for qualifying compositor-only retained frames.
- The frame loop reuses retained layer targets and runs only compositor composition + output for those frames.
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
    budget_bytes: u64,
    current_usage: AtomicU64,
    resources: DashMap<ResourceKey, Resource>,
    priority_index: RwLock<BinaryHeap<PriorityEntry>>,
    eviction_stats: EvictionStats,
}

pub enum ResourceKind {
    LayerTarget,
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
    kind: ResourceKind,
    size_bytes: u64,
    priority: Priority,
    last_used_frame: u64,
    gpu_handle: WgpuHandle,
}
```

### 8.2 Lifecycle

1. **Create**: caller requests a resource; manager allocates if budget allows, otherwise triggers eviction.
2. **Use**: each frame, when a resource is touched (read/bind), the manager updates its `last_used_frame` and promotes to `Visible`.
3. **Demote**: at end of frame, resources not touched move `Visible → Recent`; after 5 seconds unused, `Recent → Cold`.
4. **Evict**: when total usage > budget, walk heap from `Cold` to `Recent` (never `Visible`) until usage ≤ budget.

### 8.3 Configuration

- Default budget: 128 MB.
- Configurable via `mount({ gpuBudgetMb: 256 })`.
- Minimum: 32 MB (smaller risks performance collapse).
- Maximum: unbounded (user's choice).

### 8.4 Observability

`getRendererResourceStats()` exposes:

```ts
type ResourceStats = {
  budgetBytes: number
  currentUsage: number
  highWaterMark: number
  resourcesByKind: Record<string, { count: number; bytes: number }>
  evictionsLastFrame: number
  evictionsTotal: number
}
```

---

## 9. Threading model

### 9.1 Threads in play

| Thread | Owner | What runs there |
|---|---|---|
| **JS event loop** | Bun | Solid reconciler adapter, hooks, callback registry, input byte parsing, event dispatch, compatibility fallback |
| **Rust sync thread** | Rust main | FFI calls from JS execute here; retained scene mutation, layout, damage, hit-testing, layer registry, render graph generation, frame orchestration, paint dispatch, composite, Kitty encode/present |
| **WGPU submission** | WGPU internal | Command buffer submission to GPU driver (Metal/Vulkan/DX12) |
| **WGPU GPU callbacks** | WGPU internal | GPU fence callbacks, readback completion |
| **Kitty writer** | Rust-owned | Buffered stdout writes from the Kitty encoder |

**There is no worker thread in JavaScript**. Bun's event loop is the single JS thread. All TS code is synchronous or `async`-over-microtasks. Compositor-fast-path work is native-owned; JavaScript does not run a separate render worker.

**There is no `tokio` or `rayon` in the Rust main path** for v0.9. Parallelism is deferred to v1.x per DEC-010's non-goal list.

### 9.2 Thread safety contract

- FFI calls from JS to Rust are synchronous. TS awaits completion.
- Rust internal state is not accessed concurrently. Every FFI call takes a context/scene handle and mutates it in-thread.
- WGPU handles concurrency internally — user code does not interact with GPU threads directly.
- The Kitty writer is a buffered `std::io::BufWriter` over stdout; writes are serialized at the OS level.

### 9.3 Why this model is sufficient for terminal UI

- Frame budget (16.6ms at 60fps) is mostly consumed by paint + composite + output, all of which happen in Rust → GPU. The JS thread stays on control-plane work and callback dispatch.
- Terminal UIs have small node counts (50-500 typical). Parallelism overhead > gain.
- Input latency is already below perception threshold with the adaptive loop + boost windows.

If profiling in v1.x shows the JS thread saturated, the solution is to move additional control-plane work into the native event/frame boundary or split JS user-visible tasks across frames — not to reintroduce JS frame ownership.

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
| **Layout impossible** | Taffy returns error | Log warning, fall back to zero-sized node, continue |
| **Animation target invalid** | Node destroyed mid-animation | Animation cancels silently |
| **User handler throws** | `onPress` raises | Caught at dispatch boundary, logged, frame continues |

### 10.2 Error types in TypeScript

```ts
export class VexartError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VexartError'
  }
}

export class VexartNativeError extends VexartError {
  code: number
  constructor(code: number, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'VexartNativeError'
    this.code = code
  }
}

export class VexartTerminalError extends VexartError {
  constructor(message: string, public docUrl?: string) {
    super(message)
    this.name = 'VexartTerminalError'
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
| -5 | ERR_LAYOUT_FAILED | Taffy returned error |
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

Internal APIs (not part of public surface):

```ts
scheduleTask(priority, fn)          // enqueue
drainLane(priority, budgetMs)       // frame loop uses
cancelTask(handle)                  // cleanup
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
│   ├── engine/
│   ├── primitives/
│   ├── headless/
│   ├── styled/
│   ├── internal-atlas-gen/
│   └── internal-benchmarks/
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

`engine/src/ffi/bridge.ts` loads `libvexart`:

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
- Benchmarks: `native/libvexart/benches/` (Rust) or `packages/internal-benchmarks/` (TS).

### 13.9 Adding documentation

- User docs: `docs/`.
- Architecture notes: this file or derived design documents in `openspec/changes/*/design.md`.
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

- `createTheme(partial): Theme` in `@vexart/styled/src/theme/create-theme.ts`.
- `<ThemeProvider theme={myTheme}>` in `@vexart/styled/src/theme/provider.tsx`.
- `useTheme()` hook for styled components to read tokens.

### 16.3 Font atlas registration

- `registerFont({ id, source, metrics })` loads an MSDF atlas at runtime.
- Atlas produced by `@vexart/internal-atlas-gen` (CLI) from a TTF source.

### 16.4 Slot registry (plugins)

- `createSlotRegistry()` + `createSlot(registry, name)` for plugins to inject UI fragments without modifying core packages.
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
| 16 packages with ghost / stub ones (`compat-*`, `compositor`, `output-compat`, `render-graph`, `scene`, `text`, `layout-clay`, `platform-terminal`, `gpu`, `output-kitty`) | 4 public packages (`engine`, `primitives`, `headless`, `styled`) + 2 internal | Phase 1 |
| Package names `@tge/*` | `@vexart/*` | Phase 1 |
| Relative imports across packages (`../../otro-paquete/src/...`) | Workspace imports (`@vexart/*`), CI-enforced | Phase 1 |
| Packages have no declared `dependencies` | Explicit `workspace:*` dependencies | Phase 1 |
| Clay (C) layout engine + `vendor/clay*` | Taffy (Rust) inside `libvexart` | Phase 2 |
| Zig CPU paint path (`zig/` + `@tge/pixel`) | Deleted; GPU-only via WGPU | Phase 2 |
| `output-placeholder` + `output-halfblock` backends | Deleted; Kitty-only | Phase 2 |
| `gpu-frame-composer.ts` with CPU/GPU switch | Deleted; no CPU mode | Phase 2 |
| Three native binaries (`libclay`, `libtge` Zig, `libwgpu_bridge`) | One native binary (`libvexart`) | Phase 2 |
| Kitty encoding / normal presentation in TypeScript (`Buffer.from(...).toString('base64')` and raw RGBA payloads) | Native Rust presentation; JS receives stats/status only | Retained R1 / Phase 2b Native Presentation |
| `cache: None` in all WGPU pipelines (`native/wgpu-canvas-bridge/src/lib.rs` lines 676, 771, 882, 999, 1109, 1228, 1377, 1484, 1568, 1660) | Shared persistent `PipelineCache` on disk | Phase 2b |
| 5 independent caches with `MAX_*` constants (text-layout, font-atlas, image, etc.) | Unified `ResourceManager` with 128 MB default budget | Phase 2b |
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
| `starfield` / `nebula` Zig primitives | Moved to `examples/` or deleted | Phase 2 |
| Runtime font atlases limited to 15 ids | Unlimited (governed by `ResourceManager` budget) | Phase 2b |
| TS owns layer GPU target handles and terminal image IDs | Rust `LayerRegistry` owns target/image lifecycle and resource accounting | Retained R2 |
| TS `TGENode` tree is the only retained scene state | Rust-retained scene graph is the default runtime on SHM-capable terminals; fallback remains available via `VEXART_RETAINED=0` during the compatibility window | Retained R3-R7 |
| TS computes layout, damage, hit-testing, and event target traversal | Rust computes layout/damage/hit-test and returns event records to JS | Retained R4 |
| TS generates ordinary render graph / paint command batches | Rust generates and batches render ops from native scene data | Retained R5 |
| TS chooses frame strategy and coordinates presentation lifecycle | Rust frame orchestrator chooses `skip-present`, `layered-dirty`, `layered-region`, or `final-frame` | Retained R6 |
| Old TS render graph and raw presentation path remain compatibility code | Native retained path is default; old path emergency/test-only, then deleted or isolated | Retained R7-R8 |

---

## Appendix B — Contract reference

Quick index of the type contracts that agents reference most.

### B.1 Core types (in `@vexart/engine`)

| Type | Location | Purpose |
|---|---|---|
| `TGENode` | `reconciler/node.ts` | Retained tree node |
| `TGEProps` | `types.ts` | Prop contract for all primitives |
| `PressEvent` | `reconciler/node.ts` | Event for `onPress` bubbling |
| `NodeMouseEvent` | `reconciler/node.ts` | Event for `onMouse*` per-node |
| `Layer` | `loop/assign-layers.ts` | Compositing layer |
| `WalkResult`, `LayoutFrame`, `LayerPlan`, `PaintResult`, `CompositeResult`, `EmitStats` | `loop/{phase}.ts` | Phase contracts |
| `Terminal`, `Capabilities`, `TerminalSize` | `terminal/caps.ts` | Terminal handle |

### B.2 FFI functions (in `libvexart`)

All exports prefixed `vexart_{module}_{action}`. Each has a matching stub in `packages/engine/src/ffi/functions.ts`. The current set:

```
vexart_context_create / destroy
vexart_scene_create / destroy / clear
vexart_node_create / destroy / insert / remove / set_props
vexart_text_set_content / load_atlas / dispatch
vexart_input_pointer / key / events_read
vexart_frame_request / render / present
vexart_layer_upsert / mark_dirty / reuse / remove / present_dirty
vexart_target_create / destroy
vexart_layout_compute              // compatibility/offscreen fallback path
vexart_paint_dispatch              // explicit offscreen / emergency fallback path after 3g cleanup
vexart_composite_merge             // explicit offscreen / emergency fallback path after 3g cleanup
vexart_resource_stats / evict / set_budget
vexart_kitty_emit_frame / emit_layer_target / emit_region_target / delete_layer / set_transport
vexart_pipeline_cache_load / save
vexart_get_last_error_length / copy_last_error
vexart_version
```

The exact list is maintained in `native/libvexart/src/lib.rs` and mirrored in `packages/engine/src/ffi/functions.ts`. These two files must stay in sync; CI checks this.

### B.3 Extension point interfaces

| Interface | Location |
|---|---|
| `RendererBackend` | `@vexart/engine` `public.ts` |
| `Theme`, `ThemeOverrides` | `@vexart/styled` `theme/` |
| `FontDescriptor` | `@vexart/engine` `public.ts` |
| `SlotRegistry`, `Slot` | `@vexart/engine` `public.ts` |

---

**END OF ARCHITECTURE v0.2**
