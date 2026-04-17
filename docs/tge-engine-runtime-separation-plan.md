# TGE Engine / Runtime Separation Plan

## Goal

Separate the TGE architecture into three explicit layers:

```txt
@tge/core
  -> graphics / render engine

@tge/runtime
  -> input, focus, pointer, interaction semantics, loop orchestration

@tge/renderer-solid
  -> Solid adapter / reconciler / mount wiring
```

This follows the useful packaging lesson from OpenTUI:

- `@opentui/core`
- `@opentui/solid`
- `@opentui/react`

but pushes the split further by not letting the core own all runtime semantics.

---

## Current reality

The main physical move tranche is complete.

`packages/renderer/src/*` no longer owns the engine/runtime hot path. It now keeps:

- the compatibility umbrella entrypoint in `packages/renderer/src/index.ts`
- Solid adapter / reconciler-adjacent files that still belong to the renderer-facing surface
- plugin / editor / JSX surfaces that still belong to the renderer-facing surface

The architectural ownership is now physically split across the repo:

- engine core lives in `packages/core/src/*`
- UI runtime lives in `packages/runtime/src/*`
- Solid adapter lives in `packages/renderer-solid/src/*`

What remains in renderer is mostly compatibility and adapter-facing surface area, not true core ownership.

Historically `packages/renderer/src/*` mixed all three concerns:

- engine core,
- runtime semantics,
- framework-facing surface area.

`packages/renderer-solid/src/index.ts` composes the adapter surface from:

- `@tge/core`
- `@tge/runtime`
- Solid-specific reconciler / mount / JSX exports

The public boundary and the physical ownership boundary now match for the main engine/runtime tranche.

---

## New package boundaries introduced now

The repo now has two new workspace packages:

- `packages/core` → `@tge/core`
- `packages/runtime` → `@tge/runtime`

These are now real ownership packages for the main engine/runtime tranche.

Compatibility now exists mainly through the umbrella entrypoint `@tge/renderer`, not through per-file shims.

### Progress

The main physical move tranche is now done.

#### Runtime files physically moved
- `dirty.ts`
- `input.ts`
- `interaction.ts`
- `pointer.ts`
- `drag.ts`
- `hover.ts`
- `scroll.ts`
- `selection.ts`
- `handle.ts`
- `animation.ts`
- `focus.ts`
- `router.ts`
- `loop.ts`
- `debug.ts`
- `data.ts`
- `image.ts`
- `frame-scheduler.ts`
- `hit-test.ts`

#### Core files physically moved
- `matrix.ts`
- `damage.ts`
- `damage-tracker.ts`
- `layer-planner.ts`
- `renderer-backend.ts`
- `gpu-renderer-backend.ts`
- `gpu-frame-composer.ts`
- `gpu-layer-strategy.ts`
- `render-graph.ts`
- `wgpu-mixed-scene.ts`
- `layers.ts`
- `resource-stats.ts`
- `render-surface.ts`
- `gpu-raster-staging.ts`
- `wgpu-canvas-bridge.ts`
- `clay.ts`
- `layout-writeback.ts`
- `frame-presenter.ts`
- `font-atlas.ts`
- `text-layout.ts`
- `particles.ts`
- `node.ts`
- `canvas.ts`
- `canvas-backend.ts`
- `canvas-raster-painter.ts`
- `wgpu-canvas-backend.ts`
- `pixel-buffer.ts`
- `paint-bridge.ts`

The per-file compatibility shims for those modules have been removed.

---

## Exact migration map

## 1. Engine Core (`@tge/core`)

### Belongs here

- `renderer-backend.ts`
- `gpu-renderer-backend.ts`
- `gpu-frame-composer.ts`
- `gpu-layer-strategy.ts`
- `render-graph.ts`
- `wgpu-mixed-scene.ts`
- `layers.ts`
- `damage.ts`
- `damage-tracker.ts`
- `matrix.ts`
- `resource-stats.ts`
- `render-surface.ts`
- `gpu-raster-staging.ts` (boundary helpers only; compat subparts should later move out)
- `wgpu-canvas-bridge.ts`
- `clay.ts`
- `layout-writeback.ts`
- `layer-planner.ts`
- `frame-presenter.ts`
- `font-atlas.ts`
- `text-layout.ts`
- `particles.ts`
- `canvas.ts` (temporary compat/core crossover; should later be split further)

### Why

These modules define:

- rendering contracts
- GPU composition
- layer/backing model
- transforms
- layout/render graph
- output-facing rendering boundaries

They are engine concerns, not UI runtime concerns.

---

## 2. UI Runtime (`@tge/runtime`)

### Belongs here

- `loop.ts`
- `input.ts`
- `focus.ts`
- `pointer.ts`
- `drag.ts`
- `hover.ts`
- `interaction.ts`
- `selection.ts`
- `scroll.ts`
- `router.ts`
- `debug.ts`
- `dirty.ts`
- `handle.ts`
- `animation.ts`
- `data.ts`
- `image.ts` (runtime-facing cache/hook side; later split if needed)

### Why

These modules define:

- input dispatch
- focus/hover/press semantics
- pointer capture and dragging
- scroll runtime behavior
- user-facing hooks and app runtime policy
- runtime scheduling and debug state

This is not the graphics engine.

---

## 3. Solid Adapter (`@tge/renderer-solid`)

### Belongs here

- `reconciler.ts`
- JSX/runtime types
- mount wiring
- Solid-specific exports
- context/provider glue

### Future rule

`@tge/renderer-solid` should stop re-exporting `../../renderer/src/index` and instead compose:

- `@tge/core`
- `@tge/runtime`
- adapter-only reconciler exports

---

## What moved physically first

## Phase 1 — boundary first (DONE now)

Introduced:

- `@tge/core`
- `@tge/runtime`

initially with transitional re-exports from `packages/renderer/src/*` before the physical move completed.

## Phase 2 — stop using `@tge/renderer` as the architecture story

### Update imports gradually

- engine-facing code/examples → `@tge/core`
- runtime-facing code/examples → `@tge/runtime`
- Solid apps → `@tge/renderer-solid`

## Phase 3 — physical moves

Completed for the main engine/runtime tranche:

- files moved from `packages/renderer/src/*` into `packages/core/src/*`
- files moved from `packages/renderer/src/*` into `packages/runtime/src/*`
- compatibility re-exports kept in `packages/renderer/src/*`

### Current status

- runtime tranche: main move complete
- core tranche: main move complete
- remaining work is small-scope cleanup, not the primary architectural split

## Phase 4 — shrink `@tge/renderer`

At the end, `@tge/renderer` should become either:

- a compatibility umbrella, or
- disappear entirely in favor of `core + runtime + renderer-solid`.

---

## Immediate migration sequence

### Step A
Treat `@tge/core` and `@tge/runtime` as both the public boundary and the physical ownership boundary for engine/runtime modules.

### Step B
DONE:

- `packages/renderer-solid/src/index.ts` now composes a real adapter surface from core/runtime/reconciler exports

### Step C
Update examples/docs/imports to stop depending on `@tge/renderer` for everything.

### Step D
Done for the main tranche.

Small leftovers remain:

- `packages/renderer/src/index.ts` as the compatibility umbrella
- `packages/renderer/src/reconciler.ts`, JSX/runtime types, and Solid adapter glue
- plugin/extmark/tree-sitter surfaces that are neither renderer core nor UI runtime hot-path owners

---

## Architectural rule from now on

When a module answers one of these questions:

### Engine question
- how do we render?
- how do we compose layers?
- how do we represent GPU backing?
- how do we turn commands into pixels/images/targets?

→ `@tge/core`

### Runtime question
- who has focus?
- what happens on click/drag/hover?
- how do we process input and schedule interaction frames?
- how do hooks expose runtime behavior to apps?

→ `@tge/runtime`

### Adapter question
- how do Solid components reconcile into TGE nodes?
- how do we mount a framework app onto the runtime/engine?

→ `@tge/renderer-solid`

---

## Bottom line

The OpenTUI lesson worth copying is:

> separate the core package from the framework/runtime adapter packages.

The improvement we want beyond OpenTUI is:

> also separate engine core from UI runtime semantics,
> instead of letting the core package own everything.
