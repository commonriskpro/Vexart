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

La conclusión central es simple:

> el engine hoy no está gobernado por la cadena de package names nuevos;
> está gobernado por `packages/renderer/src/index.ts` + `packages/renderer/src/loop.ts` + output helpers.

La primera bridge pass sirvió para ordenar boundaries públicos, pero todavía no resolvió ownership físico ni el peso conceptual del legacy.

---

## 1. Hot-path map

## Public entry vs real owner

- `packages/renderer-solid/src/index.ts`
  - facade pública
  - reexporta `../../renderer/src/index`
- owner operativo real:
  - `packages/renderer/src/index.ts`

## Runtime path

```txt
mount()
  -> packages/renderer/src/index.ts
  -> createRenderLoop() in packages/renderer/src/loop.ts
  -> Solid reconciler in packages/renderer/src/reconciler.ts
  -> TGENode tree in packages/renderer/src/node.ts
  -> Clay translation in packages/renderer/src/clay.ts
  -> RenderCommand[]
  -> render graph + layer planning in renderer internals
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
  - `packages/renderer/src/input.ts`
- focus/runtime policy still in core:
  - `packages/renderer/src/focus.ts`
- pointer/scroll feed into frame loop:
  - `packages/renderer/src/loop.ts`

## Output path

### Layered Kitty path
- `packages/output/src/layer-composer.ts`
- `packages/output/src/kitty.ts`
- adapted by `packages/renderer/src/gpu-frame-composer.ts`

### Compat/fallback path
- `packages/output/src/composer.ts`
- `packages/output/src/placeholder.ts`
- `packages/output/src/halfblock.ts`

## Hot-path conclusion

The real owner graph today is still closer to:

`renderer/index -> renderer/loop -> renderer internals -> output internals`

than to a truly separated package graph.

---

## 2. Bridge inventory truth table

| Package | Classification | Real owner today | Decision |
| --- | --- | --- | --- |
| `@tge/platform-terminal` | public bridge | `packages/terminal/src/*` | keep public |
| `@tge/input` | real | `packages/input/src/*` | keep |
| `@tge/renderer-solid` | public bridge | `packages/renderer/src/index.ts` | keep public, reduce internal dependence |
| `@tge/scene` | retire candidate | `packages/renderer/src/node.ts` | retire or make real |
| `@tge/layout-clay` | low-value bridge | `packages/renderer/src/clay.ts` | acceptable short term |
| `@tge/render-graph` | retire candidate | `packages/renderer/src/render-graph.ts` | retire or make real |
| `@tge/text` | retire candidate | `packages/renderer/src/text-layout.ts`, `font-atlas.ts` | retire or make real |
| `@tge/gpu` | public bridge | renderer GPU modules | keep public |
| `@tge/compositor` | retire candidate | renderer/output internals | retire or make real |
| `@tge/output-kitty` | public bridge | `packages/output/src/kitty*.ts` | keep public |
| `@tge/output-compat` | retired | retired | removed from runtime and repo |
| `@tge/compat-software` | retired | retired | removed; the remaining raster staging lives directly under renderer + `@tge/pixel` |
| `@tge/compat-canvas` | low-value bridge | `packages/renderer/src/canvas*.ts` | keep only as legacy/compat |
| `@tge/compat-text-ansi` | retire candidate | `packages/renderer/src/selection.ts` | retire |
| `@tge/components` | real | `packages/components/src/*` | keep |
| `@tge/void` | real | `packages/void/src/*` | keep |
| `@tge/windowing` | real | `packages/windowing/src/*` | keep |

## Bridge conclusion

The new package graph improved public boundaries, but many target-domain packages are still bridges, not owners.

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

- `packages/renderer/src/layers.ts`
- `packages/renderer/src/renderer-backend.ts`
- `packages/renderer/src/gpu-renderer-backend.ts`
- `packages/renderer/src/wgpu-canvas-backend.ts`
- `packages/renderer/src/gpu-raster-staging.ts`
- `packages/renderer/src/surface-transform-staging.ts`

### Why this matters

The problem is no longer CPU fallback selection. The problem is that the renderer still creates temporary raster surfaces in several GPU paths instead of staying GPU-native all the way until final raw RGBA handoff.

### Residual legacy inventory

| File | Residual legacy role today | GPU-native target | Retirement condition |
| --- | --- | --- | --- |
| `packages/renderer/src/gpu-raster-staging.ts` | consolidated staging helper for temporary text/canvas/readback/upload/copy-to-image boundaries that still appear in GPU internals | direct GPU op encoding into retained GPU targets/layers without temporary raster surfaces | no common renderer op requires temporary raster surface materialization before final readback |
| `packages/renderer/src/surface-transform-staging.ts` | subtree transform post-pass that still depends on surface staging, even after removing the dead snapshot branch | transform composition handled as GPU pass or isolated compat path | transform-heavy subtrees stop forcing temporary CPU-visible surfaces in the official path |
| `packages/renderer/src/canvas.ts` | imperative `CanvasContext` family still shapes part of the official renderer reasoning | compat/lab boundary only, not structural core dependency | official path can be explained without `CanvasContext` as a central renderer concept |

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

- `packages/renderer/src/canvas.ts`
- `packages/components/src/scene-canvas.tsx`
- `examples/lightcode-gpu-first.tsx`

### Current reality

Two first-class visual abstractions still depend on `CanvasContext` semantics.

## D. Remaining staging pressure

Relevant files:

- `packages/renderer/src/gpu-raster-staging.ts`
- `packages/renderer/src/surface-transform-staging.ts`
- `packages/renderer/src/canvas.ts`

### Current reality

The official path is GPU-only at the backend/output level, but some render operations still require temporary raster surfaces before the final raw RGBA handoff to Kitty.

### Verified progress since the first GPU-only pass

- `gpu-raster-staging.ts` now owns copy-to-image staging instead of leaking raw bridge calls through `gpu-renderer-backend.ts`
- canvas fallback staging now forces direct CPU raster instead of bouncing through a GPU -> CPU -> GPU loop
- `surface-transform-staging.ts` no longer carries a dead `snapshot` branch; the current post-pass is explicitly copy -> clear -> affine blit

## E. Explicit ownership progress

Relevant files:

- `packages/renderer/src/render-graph.ts`
- `packages/renderer/src/loop.ts`

### Current reality

For `image`, `canvas`, and `effect` attachment, the render graph no longer falls back to matching by `color` / `cornerRadius`.
Those queues are now claimed by `renderObjectId`, which matches the way `loop.ts` enqueues them (`renderObjectId: node.id`).

### Remaining work

Explicit ownership still needs follow-up outside that base path:

- border-specific attachment logic
- text/layout/writeback relationships
- any remaining layer/content matching that still depends on geometry or content heuristics

### Compat leakage conclusion

The question is no longer “how do we stop falling back to CPU?”
The question now is “how much raster staging still remains before the renderer becomes GPU-native end to end?”.

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
