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
| `@tge/output-compat` | public bridge | `packages/output/src/composer.ts` + fallbacks | keep as compat only |
| `@tge/compat-software` | public bridge + legacy | `packages/pixel/src/*` + cpu backend | keep public, remove from official hot path |
| `@tge/compat-canvas` | low-value bridge | `packages/renderer/src/canvas*.ts` | keep only as legacy/compat |
| `@tge/compat-text-ansi` | retire candidate | `packages/renderer/src/selection.ts` | retire |
| `@tge/components` | real | `packages/components/src/*` | keep |
| `@tge/void` | real | `packages/void/src/*` | keep |
| `@tge/windowing` | real | `packages/windowing/src/*` | keep |

## Bridge conclusion

The new package graph improved public boundaries, but many target-domain packages are still bridges, not owners.

---

## 3. Compat leakage map

## A. Software/CPU leakage into the official renderer path

Files with direct `@tge/compat-software` impact in the hot path:

- `packages/renderer/src/loop.ts`
- `packages/renderer/src/layers.ts`
- `packages/renderer/src/renderer-backend.ts`
- `packages/renderer/src/gpu-renderer-backend.ts`
- `packages/renderer/src/wgpu-canvas-backend.ts`

### Why this matters

Even though compat has a package now, the renderer still thinks in `PixelBuffer` terms more than a truly GPU-first core should.

## B. CPU fallback still shapes the GPU path

Relevant files:

- `packages/renderer/src/gpu-renderer-backend.ts`
- `packages/renderer/src/cpu-renderer-backend.ts`
- `packages/renderer/src/wgpu-canvas-backend.ts`

### Current reality

- GPU backend still accepts fallback paint behavior
- CPU remains the conceptual default in several runtime paths
- examples still need explicit env forcing for GPU-first behavior

## C. Imperative canvas is not “just compat” yet

Relevant files:

- `packages/renderer/src/canvas.ts`
- `packages/components/src/scene-canvas.tsx`
- `examples/lightcode-gpu-first.tsx`

### Current reality

Two first-class visual abstractions still depend on `CanvasContext` semantics.

## D. Compat output still hangs from official presentation

Relevant files:

- `packages/renderer/src/loop.ts`
- `packages/output/src/composer.ts`

### Current reality

Fallback output is still part of the operational renderer path, not just a dusty corner package.

## E. ANSI/selectable text is still embedded in renderer behavior

Relevant files:

- `packages/renderer/src/index.ts`
- `packages/renderer/src/loop.ts`
- `packages/renderer/src/selection.ts`

### Compat leakage conclusion

Compat was renamed and surfaced better, but it is still structurally important enough to distort the official engine story.

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

1. `@tge/compat-text-ansi`
2. `@tge/compositor`
3. `@tge/render-graph`
4. `@tge/scene`
5. `@tge/text`

## `arch/10-scene-windowing-ownership`

Priority order:

1. finish removing `RetainedGraph` from code and docs
2. clean stale references to the old `components/src/windowing/*` location

## `arch/11-gpu-core-reduction`

Priority order:

1. reduce `@tge/compat-software` from renderer hot-path reasoning
2. push CPU/backend fallback deeper into compat
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
- compat still leaks into the official path,
- runtime policy still lives too low,
- and scene/composition ownership is still duplicated or ambiguous.

That means the right move now is not “more modularity theater”.

The right move is:

1. retire fake boundaries,
2. make real owners physically real,
3. reduce compat from the hot path,
4. converge duplicated abstractions,
5. only then optimize.
