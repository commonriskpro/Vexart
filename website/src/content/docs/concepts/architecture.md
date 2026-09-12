---
title: Architecture
description: How Vexart's layered engine works — from JSX to terminal pixels.
---

## Pipeline Overview

```
JSX (SolidJS createRenderer)
  → TypeScript scene graph + reactivity (Solid reconciler)
    → TypeScript walk-tree + Flexily layout + render graph
      → Rust libvexart (WGPU paint pipelines + text + resources)
        → Rust composite + Kitty encoding + SHM/file/direct transport
          → Terminal
```

## Ownership Boundary

**TypeScript owns:** scene graph, reactivity, walk-tree, layout (Flexily), render graph, event dispatch, interaction, focus, hit-testing.

**Rust owns:** WGPU paint pipelines, compositing, Kitty encoding, SHM/file/direct transport, image assets, GPU resources, native presentation.

Normal terminal presentation NEVER returns raw RGBA buffers to JavaScript.

The published `vexart/engine` boundary contains `mount`, `createTerminal`,
user-facing hooks/types, and supported debug controls. Raw
node/layout/reconciler/render-loop/native/FFI helpers and diagnostic
state/culling helpers are internal. JSX uses the shared reconciler through the published
`vexart/jsx-runtime`; `@vexart/engine/jsx-runtime` is compiler-only workspace
wiring, and `@vexart/engine/internal` is workspace-only for maintainers/tests.

## Package Layers

```
@vexart/app        → styled → headless → engine → libvexart
```

Dependencies flow strictly downward. Lateral and upward imports are prohibited and enforced by `dependency-cruiser` in CI.

## Frame Lifecycle

1. **Reconciliation** — SolidJS signals mutate the internal TGENode tree
2. **Walk tree** — depth-first traversal, viewport culling, layout input
3. **Layout** — Flexily computes pixel positions (reactive, incremental)
4. **Assign layers** — 3-phase algorithm (scroll → background → static)
5. **Paint** — `vexart_paint_dispatch` per dirty layer via FFI
6. **Composite** — z-order layer merge into final target
7. **Output** — Kitty encoding + transport (entirely in Rust)

The node-ref migration narrows public JSX refs to the cached `NodeHandle` for
this internal scene/layout tree. There is no public raw-node alternative.

## Native Binary — `libvexart`

Single Rust `cdylib` with 52 FFI exports. Built with `cargo build --release`.

Key subsystems:
- **Paint** — WGPU render pipelines (SDF rects, gradients, shadows, blur, MSDF text)
- **Composite** — offscreen targets, layer merging, backdrop filter chain
- **Kitty** — base64 + zlib compression + escape sequences + SHM/file/direct transport
- **Font** — native MSDF atlas generation via `fontdb` + `fdsm`
- **Resource** — unified GPU memory budget with LRU eviction (default 128MB)
