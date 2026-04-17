# TGE Current-State Audit Report

## Goal

Documentar el estado real del sistema después de la primera bridge pass:

- cómo corre el hot path hoy,
- qué packages son owners reales y cuáles son bridges,
- dónde sigue entrando compat/legacy al path oficial,
- qué abstracciones están duplicadas,
- y qué cleanup queda desbloqueado para las branches siguientes.

Este documento es el **output operativo** de `arch/08-current-state-audit`.

---

## Audit summary

La conclusión central, actualizada después del move físico principal, es esta:

> el ownership real del engine/runtime principal ya no vive en `packages/renderer/src/*`;
> vive en `packages/core/src/*` + `packages/runtime/src/*`, mientras `packages/renderer/src/index.ts` quedó como umbrella de compat.

La primera bridge pass resolvió el ownership físico del tranche principal. Lo que queda ahora es cleanup conceptual y reducción de compat.

---

## 1. Hot-path map

## Public entry vs real owner

- `packages/renderer-solid/src/index.ts`
  - facade pública
  - compone `@tge/core` + `@tge/runtime` + reconciler/mount glue
- owner operativo real:
  - `packages/core/src/*`
  - `packages/runtime/src/*`
  - `packages/renderer/src/index.ts` como umbrella de compat

## Runtime path

```txt
mount()
  -> packages/renderer/src/index.ts
  -> createRenderLoop() in packages/runtime/src/loop.ts
  -> Solid reconciler in packages/renderer/src/reconciler.ts
  -> TGENode tree in packages/core/src/node.ts
  -> Clay translation in packages/core/src/clay.ts
  -> RenderCommand[]
  -> render graph + layer planning in core internals
  -> backend paint (GPU + fallback paths)
  -> output layered Kitty or output compat
  -> terminal write
```

## Input path

- terminal creation real:
  - `packages/terminal/src/index.ts`
- public facade:
  - `packages/platform-terminal/src/index.ts`
- parser:
  - `packages/input/src/parser.ts`
- dispatch bus:
  - `packages/runtime/src/input.ts`
- focus/runtime policy:
  - `packages/runtime/src/focus.ts`
- pointer/scroll feed into frame loop:
  - `packages/runtime/src/loop.ts`

## Output path

### Layered Kitty path
- `packages/output/src/layer-composer.ts`
- `packages/output/src/kitty.ts`
- adapted by `packages/core/src/gpu-frame-composer.ts`

### Compat/fallback path
- `packages/output/src/composer.ts`
- `packages/output/src/placeholder.ts`
- `packages/output/src/halfblock.ts`

## Hot-path conclusion

This report originally described the pre-move state.

After the main physical move tranche, the hot path is now closer to:

`renderer compat umbrella -> runtime/loop -> core internals -> output internals`

The remaining mismatch is now mostly facade/shim cleanup, not missing physical ownership for the main engine/runtime path.

---

## 2. Bridge inventory truth table

| Package | Classification | Real owner today | Decision |
| --- | --- | --- | --- |
| `@tge/platform-terminal` | public bridge | `packages/terminal/src/*` | keep public |
| `@tge/input` | real | `packages/input/src/*` | keep |
| `@tge/renderer-solid` | public bridge | `packages/renderer-solid/src/*` + compat umbrella | keep public, reduce internal dependence |
| `@tge/scene` | retire candidate | `packages/core/src/node.ts` | retire facade or make real |
| `@tge/layout-clay` | low-value bridge | `packages/core/src/clay.ts` | acceptable short term |
| `@tge/render-graph` | retire candidate | `packages/core/src/render-graph.ts` | retire facade or make real |
| `@tge/text` | retire candidate | `packages/core/src/text-layout.ts`, `font-atlas.ts` | retire facade or make real |
| `@tge/gpu` | public bridge | `packages/core/src/*` GPU modules | keep public |
| `@tge/compositor` | retire candidate | core/output internals | retire or make real |
| `@tge/output-kitty` | public bridge | `packages/output/src/kitty*.ts` | keep public |
| `@tge/output-compat` | retired | retired | removed from runtime and repo |
| `@tge/compat-software` | retired | retired | removed; the remaining raster staging lives directly under renderer + `@tge/pixel` |
| `@tge/compat-canvas` | low-value bridge | `packages/renderer/src/canvas*.ts` | keep only as legacy/compat |
| `@tge/compat-text-ansi` | retire candidate | `packages/renderer/src/selection.ts` | retire |
| `@tge/components` | real | `packages/components/src/*` | keep |
| `@tge/void` | real | `packages/void/src/*` | keep |
| `@tge/windowing` | real | `packages/windowing/src/*` | keep |

## Bridge conclusion

The public package graph still has bridge packages, but the main engine/runtime owners now live physically in `packages/core/src/*` and `packages/runtime/src/*`.

---

## 3. Compat leakage map

### Update after GPU-only cleanup

The original audit is now partially outdated.
The following legacy pieces were removed from the official path after the audit:

- `cpu-renderer-backend.ts`
- `legacy-render-painter.ts`
- selectable ANSI path
- `@tge/compat-software`
- `@tge/output-compat`
- `output/src/composer.ts`
- `output/src/placeholder.ts`
- `output/src/halfblock.ts`
- the single-buffer fallback branch in `loop.ts`

So the current problem is no longer “CPU fallback dominates the official path”.
The current problem is residual raster staging inside an otherwise GPU-only renderer.

## A. Residual raster staging in the official renderer path

Relevant files:

- `packages/core/src/layers.ts`
- `packages/core/src/renderer-backend.ts`
- `packages/core/src/gpu-renderer-backend.ts`
- `packages/core/src/wgpu-mixed-scene.ts`
- `packages/core/src/gpu-raster-staging.ts`

### Why this matters

The problem is no longer CPU fallback selection. The core official path already stopped depending on layer-owned raster surfaces; the remaining work is isolating compat raster helpers and reintroducing missing features with GPU-native implementations.

### Residual legacy inventory

| File | Residual legacy role today | GPU-native target | Retirement condition |
| --- | --- | --- | --- |
| `packages/core/src/gpu-raster-staging.ts` | consolidated staging helper for compat text plus readback/upload/copy-to-image boundaries | direct GPU op encoding into retained GPU targets/layers without temporary raster surfaces | the official core no longer depends on compat text raster and the remaining readback/upload helpers stay boundary-only |
| `packages/core/src/canvas.ts` | imperative `CanvasContext` family still shapes part of the official renderer reasoning | compat/lab boundary only, not structural core dependency | official path can be explained without `CanvasContext` as a central renderer concept |
| `packages/core/src/wgpu-canvas-backend.ts` | compat/lab painter backend that still does readback and CPU fallback for imperative canvas validation | move fully out of the core official mental model | examples/scripts/tooling stop treating it as core architecture |

### Operational rule

Any new migration work should remove entries from this table or shrink their role.
If a change adds a new staging helper to the official path, it is architectural debt, not progress.

## B. CPU fallback no longer shapes the official path

Current reality:

- `cpu-renderer-backend.ts` was removed
- total fallback and per-op fallback were removed from the official GPU backend
- the loop no longer keeps a single-buffer fallback branch

## C. Imperative canvas is not “just compat” yet

Relevant files:

- `packages/core/src/canvas.ts`
- `packages/components/src/scene-canvas.tsx`
- `examples/lightcode-gpu-first.tsx`

### Current reality

Two first-class visual abstractions still depend on `CanvasContext` semantics.

## D. Remaining staging pressure

Relevant files:

- `packages/core/src/gpu-raster-staging.ts`
- `packages/core/src/canvas.ts`

### Current reality

The official path is now GPU-native end-to-end in architecture: the loop no longer owns layer raster memory, and the backend returns explicit raw presentation payloads only at the presentation boundary.
The official path is GPU-only at the backend/output level, and subtree/nested transforms now fail fast instead of using surface staging.
The official path is GPU-only at the backend/output level, and subtree/nested transforms now run through GPU layer-boundary composition instead of surface staging.

The layer model also started its migration away from raw ownership:

- `Layer` now exposes GPU-facing `backing` metadata as its identity
- `updateLayerGeometry()` no longer allocates or owns raw backing memory
- `loop.ts` now consumes raw layer payloads returned by the backend instead of painting/diffing/presenting from `RasterSurface`
- backend paint/layer contexts now carry `backing` + target dimensions, so the contract no longer talks only in terms of layer-owned raw surfaces

### Verified end-to-end progress

- the official core no longer keeps `RasterSurface` as layer state in `layers.ts` / `loop.ts`
- `gpu-renderer-backend.ts` no longer allocates `createRasterSurface(...)` for sprite rendering
- raw bytes now appear in the official path as backend output payloads for Kitty presentation, not as the renderer's default layer memory model

### Verified progress since the first GPU-only pass

- `gpu-raster-staging.ts` now owns copy-to-image staging instead of leaking raw bridge calls through `gpu-renderer-backend.ts`
- the official canvas renderer path no longer falls back to CPU raster; unsupported canvas commands now require a GPU-native implementation or fail-fast
- subtree/nested retained transforms no longer use surface staging in the official path; support now runs through GPU layer-boundary composition
- `gpu-renderer-backend.ts` no longer falls back to `createGpuTextImage()`; official text now uses glyph atlas or fail-fast
- mixed-scene GPU analysis moved into `packages/core/src/wgpu-mixed-scene.ts` so the official core no longer imports the compat painter backend module

## E. Explicit ownership progress

Relevant files:

- `packages/core/src/render-graph.ts`
- `packages/runtime/src/loop.ts`

### Current reality

For `image`, `canvas`, and `effect` attachment, the render graph no longer falls back to matching by `color` / `cornerRadius`.
Those queues are now claimed by `renderObjectId`, which matches the way `loop.ts` enqueues them (`renderObjectId: node.id`).

### Remaining work

Explicit ownership still needs follow-up outside that base path:

- border-specific attachment logic
- text/layout/writeback relationships
- any remaining layer/content matching that still depends on geometry or content heuristics

### Compat leakage conclusion

The question is no longer “how do we stop falling back to CPU?” and it is no longer “when do we become GPU-native end to end?” for the core path.
The question now is “which missing capabilities do we reintroduce next with GPU-native implementations, and which compat raster helpers can be isolated further?”.

For the architecture-level replacement map of the remaining text/transform/canvas functions, see:

- `docs/tge-gpu-native-remaining-architecture.md`
- `docs/tge-gpu-native-end-to-end-redesign.md`

---

## 4. Duplicate abstraction map

## A. `SceneCanvas` vs `RetainedGraph`

Relevant files:

- `packages/components/src/scene-canvas.tsx`
- `examples/lightcode.tsx`
- `examples/lightcode-gpu-first.tsx`

### Shared territory

- retained visual graph-like scenes
- overlay rendering
- drag and interaction coordination
- viewport transforms
- `CanvasContext`-driven drawing

### Why this is expensive

Keeping both as first-class abstractions doubles:

- mental model cost
- invalidation logic
- drag policy surface
- future migration cost

### Audit decision

Decision implemented:

- keep `SceneCanvas` as the retained scene abstraction
- migrate `lightcode-gpu-first.tsx` away from `RetainedGraph` ✅
- retire `RetainedGraph` from product code and package exports ✅

## B. Composition ownership duplication

Composition is effectively spread across:

- `packages/renderer/src/loop.ts`
- `packages/renderer/src/gpu-frame-composer.ts`
- `packages/output/src/layer-composer.ts`
- `packages/output/src/composer.ts`

`@tge/compositor` names the domain but does not yet own it.

## C. Layout writeback duplication

Relevant files:

- `packages/renderer/src/layout-writeback.ts`
- `packages/renderer/src/loop.ts`

Current reality:

- sequential command writeback exists,
- Clay element-id writeback exists,
- best-effort approximation still exists on top.

That means layout ownership is still not singular.

## D. Interaction/drag policy duplication

Relevant files:

- `packages/renderer/src/drag.ts`
- `packages/components/src/scene-canvas.tsx`
- `packages/windowing/src/use-window-drag.ts`
- `packages/windowing/src/use-window-resize.ts`

Current reality:

- generic drag primitive exists,
- custom scene drag exists,
- windowing wraps another semantic layer on top.

---

## 5. Ownership conflict list

## Conflict 1 — `@tge/windowing`

Nominal owner:
- `packages/windowing/src/index.ts`

Real owner now:
- `packages/windowing/src/*`

### Result
This ownership conflict was resolved by moving the source physically into `packages/windowing/src/*`.

## Conflict 2 — `@tge/compositor`

Nominal owner:
- `packages/compositor/src/index.ts`

Real owner today:
- renderer/output internals

### Cost
Makes composition look more settled than it really is.

## Conflict 3 — `@tge/scene`, `@tge/render-graph`, `@tge/text`

Nominal owners:
- bridge packages

Real owners today:
- renderer internals

### Cost
Encourages domain language without domain ownership.

## Conflict 4 — `@tge/renderer-solid`

Nominal owner:
- runtime package

Real owner today:
- `packages/renderer/src/index.ts`

### Cost
Useful public API, but still an internal bridge if overused.

---

## 6. Handoff priorities for next branches

## `arch/09-bridge-retirement`

Priority order:

1. clean remaining public bridges that still only exist for packaging value
2. keep only `renderer-solid`, `platform-terminal`, `output-kitty`, `gpu` where they still provide real external value

## `arch/10-scene-windowing-ownership`

Priority order:

1. finish removing `RetainedGraph` from code and docs
2. clean stale references to the old `components/src/windowing/*` location

## `arch/11-gpu-core-reduction`

Priority order:

1. reduce `@tge/pixel` / `PixelBuffer` from renderer hot-path reasoning
2. push raster staging behind neutral surface helpers
3. isolate imperative canvas fallback more aggressively

## `arch/12-runtime-ui-clarification`

Priority order:

1. `focus.ts`
2. `interaction.ts`
3. `drag.ts`
4. `scroll.ts`
5. selection / runtime semantics still sitting too low

## `arch/13-explicit-ownership-completion`

Priority order:

1. make `renderObjectId` dominant
2. remove fallback matching by `color` / `cornerRadius`
3. simplify writeback ownership

## `arch/14-optimization-recovery`

Only after all previous ambiguity is materially reduced.

---

## Audit conclusion

The repo is now in a better state than before the bridge pass.

But it is still in an intermediate architecture where:

- public package structure suggests more separation than physically exists,
- residual raster staging still leaks into the official path,
- runtime policy still lives too low,
- and scene/composition ownership is still duplicated or ambiguous.

That means the right move now is not “more modularity theater”.

The right move is:

1. retire fake boundaries,
2. make real owners physically real,
3. reduce compat from the hot path,
4. converge duplicated abstractions,
5. only then optimize.
