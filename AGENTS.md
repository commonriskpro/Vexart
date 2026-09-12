# Vexart — GPU-Accelerated Terminal UI Engine

## Project references

Vexart's product and architecture context is maintained in the documents below.
Consult the relevant reference alongside current code and focused checks. If
prose and implementation differ, inspect the discrepancy and reconcile the
smallest in-scope change; a documentation mismatch is not an automatic stop.

- [docs/PRD.md](docs/PRD.md) — product requirements, phased roadmap, and decisions.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — target layering and native boundary.
- [docs/API-POLICY.md](docs/API-POLICY.md) — public vs. internal API rules.
- [docs/AI-REFERENCE.md](docs/AI-REFERENCE.md) — detailed technical reference for AI agents.
- [docs/packages/README.md](docs/packages/README.md) — 4-tier package architecture and invariants.

## What is Vexart

Vexart is a pixel-native, GPU-accelerated terminal UI engine. Developers write JSX
with SolidJS reconciliation; Vexart renders browser-quality UI in the terminal with
anti-aliased corners, shadows (single + multi), gradients (linear + radial), glow
effects, backdrop blur (glassmorphism), image/canvas support, retained layers, and
per-corner radius.

## Architecture

```
JSX (SolidJS createRenderer)
  → TypeScript scene graph + reactivity (Solid reconciler)
    → TypeScript walk-tree + Flexily layout + render graph + event dispatch
      → Rust libvexart (WGPU paint pipelines + text + image/canvas resources)
        → Rust composite + Kitty encoding + SHM/file/direct transport
          → Terminal (Kitty, Ghostty, Herdr, WezTerm, tmux)
```

Current ownership boundary (DEC-014): TypeScript owns scene graph, reactivity,
walk-tree, layout (Flexily), render graph construction, event dispatch, interaction,
focus, hit-testing, and canvas rasterization (canvas commands are rasterized in JS
and uploaded as RGBA textures). Rust owns WGPU paint pipelines, compositing, Kitty
encoding, SHM/file/direct transport, image assets, GPU resources, and native
readback/presentation.

The Rust-retained/native scene graph path is historical only. The active model is a
TypeScript-owned scene graph with a Rust/WGPU native rendering boundary.

## Critical runtime invariant

The published `vexart.js` barrel and `engine.js` must share one SolidJS
universal reconciler instance. Consumer JSX compiles with
`moduleName: "vexart/engine"`; see
[docs/AI-REFERENCE.md](docs/AI-REFERENCE.md)
for details.

## Architectural Discipline: No Hotfixes, No Ad-Hoc Patches

- **Root-Cause Architecture Only**: Symptom mitigations, band-aids (e.g. hardcoded caps, magic-number delays, null checks masking invariant violations, swallowing errors) are strictly prohibited. Every fix must address the root-cause architecture, preserve symmetrical lifecycle ownership (acquire/release balance), and establish robust invariants so future changes do not re-break it.
- **Stop and Ask on Design Decisions**: If a fix requires an architectural trade-off, ownership redesign, or public API/contract change, STOP immediately, present the trade-offs clearly, and ask the user what to decide before writing code. Never guess or apply makeshift workarounds.

## Commands

- `bun install` — install dependencies.
- `bun run typecheck` — TypeScript type check (`tsc --noEmit`).
- `bun run test` — TypeScript tests with the required browser condition and Solid preload.
- `cd native/libvexart && cargo test` — run Rust tests.
- `cd native/libvexart && cargo build --release` — build the Rust native library.
- `bun run showcase` — run Void component showcase (6 tabs: Inputs, Display, Collections, Code & Docs, Overlays, Typography).
- `bun run build:dist` — build npm distribution.

## Modules

| Package | Purpose | Status |
| ------- | ------- | ------ |
| `@vexart/engine` | SolidJS reconciler, render loop, hooks, FFI bridge to `libvexart`, terminal lifecycle, input parsing, focus, hit-testing, output transport | ✅ Active |
| `@vexart/primitives` | **Merged into `@vexart/app`**. Use `<Box>`, `<Text>` app components or `<box>`, `<text>` intrinsics directly. Legacy helpers (`Span`, `RichText`, `WrapRow`) were permanently purged. | ❌ Removed |
| `@vexart/headless` | 23 headless components + 2 state factories (25 primitives total): logic, keyboard/mouse interaction, accessibility contracts, no styling | ✅ Active |
| `@vexart/styled` | Themed components and void theme tokens — dark, shadcn-inspired design system | ✅ Active |
| `@vexart/app` | App framework: router, route manifest helpers, className mapper, app mounting, CLI helpers | ✅ Active |
| `@vexart/internal-atlas-gen` | Internal font atlas generator | ✅ Internal |
| `@vexart/internal-devtools` | Internal MCP devtools server | ✅ Internal |

## Key Dependencies

- **Flexily** — Pure JavaScript layout engine with a Yoga-compatible API and zero
  dependencies. Used from `packages/engine/src/loop/layout-adapter.ts`.
- **SolidJS** (`solid-js/universal`) — `createRenderer` for JSX reconciliation; no VDOM.
- **Rust/WGPU** (`native/libvexart`) — Single native `cdylib` (`libvexart`) for GPU paint
  pipelines, compositing, Kitty encoding, transport, image assets, and GPU resource management.
- **Bun** — Runtime, package manager, tests, TypeScript execution, and `bun:ffi` native bridge.
- **marked** — Markdown parsing for the `Markdown` headless component.
- **web-tree-sitter** — Tree-sitter WASM runtime for syntax highlighting.
- **Zod** (`zod@4`) — Schema validation.

## Current Build Shape

1. **TypeScript front-end**: SolidJS reconciler creates a retained TS node tree.
2. **Layout**: `walkTree` builds a Flexily tree and computes pixel layout in TS.
3. **Render graph**: TS converts layout + resolved props into render graph queues.
4. **Native rendering**: `@vexart/engine` calls `libvexart` via `bun:ffi`.
5. **Presentation**: Rust/WGPU paints and composites targets, then emits Kitty frames,
   layers, or dirty regions through direct/file/SHM transport.

## Style Guide

### General

- Prefer single-word variable names.
- Use `const` over `let`.
- Prefer early returns over `else`.
- Avoid `try/catch` where possible.
- Avoid `any` type.
- Prefer functional array methods over loops when it stays readable.
- Use Bun APIs when possible.

### TypeScript

- Prefer type inference over explicit annotations.
- Avoid destructuring unless it clearly improves readability.
- Avoid mocks in tests — test real implementations.
- Public APIs are explicit named exports; avoid broad `export *` from public surfaces.
- Keep package boundaries aligned with `docs/API-POLICY.md`.

### Rust

- Native boundary lives under `native/libvexart`.
- FFI exports are `#[no_mangle] extern "C"` functions prefixed with `vexart_`.
- Wrap FFI bodies in panic guards and return error codes, not panics, across the boundary.
- Keep packed-buffer FFI patterns where needed to satisfy ARM64 parameter limits.

## Detailed technical reference

For visual effects, interaction, complete element props and exports, styled/app
APIs, package layout, and reference links, read
[docs/AI-REFERENCE.md](docs/AI-REFERENCE.md) when the task touches those
areas.
