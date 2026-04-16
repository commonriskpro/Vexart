# TGE GPU-Only Engine Architecture

## Goal

Documentar la arquitectura real del motor **como existe hoy**, qué partes son core real, qué partes siguen siendo bridges temporales, y cuál es la arquitectura objetivo más eficiente para reducir complejidad, legado CPU y ownership ambiguo.

Este documento ya no es solo una visión aspiracional.
Ahora también funciona como **reality check técnico** después de la primera pasada del refactor.

---

## Executive summary

TGE/Vexart ya avanzó bastante hacia una dirección GPU-first, pero el repo sigue en un estado intermedio:

- hay packages nuevos,
- hay mejores boundaries públicos,
- hay `renderObjectId`,
- hay más separación que antes,

pero todavía existe una diferencia importante entre:

- **arquitectura nominal** (lo que los package names sugieren), y
- **arquitectura real** (dónde vive el código y quién lo controla de verdad).

La ineficiencia principal HOY no es solo de performance.
Es de **modelo mental**.

Los problemas más caros ahora son:

- facades temporales que parecen paquetes reales,
- `loop.ts` todavía demasiado central,
- path CPU/compat todavía presente en el hot path conceptual,
- heurísticas que siguen vivas aunque ya exista identidad explícita,
- ownership físico partido entre `renderer`, `components`, `windowing`, `output` y varios bridges.

La dirección correcta ya no es “seguir agregando packages”.
La dirección correcta es:

> reducir capas falsas,
> colapsar bridges innecesarios,
> aislar compat fuera del core oficial,
> y dejar un engine que sea entendible de punta a punta.

---

## Design principles

### 1. GPU-only official path

El motor oficial debe optimizar para:

- renderer GPU,
- composición GPU,
- output Kitty raw/shm como path principal.

El software raster y los fallbacks pueden existir, pero no deben seguir dictando el diseño del core.

### 2. Real ownership over facade layering

Un package solo vale como boundary real si tiene:

- source ownership propio,
- API pública propia,
- responsabilidad propia,
- y dependencias coherentes.

Si un package es solo `export * from "../../otro/src/..."`, entonces es **bridge público**, no arquitectura real.

### 3. Core engine without UI policy

El core no debe seguir decidiendo:

- bubbling de `onPress`,
- focus scopes,
- tab order,
- drag semantics,
- resize semantics,
- semántica Enter/Space,
- overlay/dialog/window policy.

Eso es runtime UI.

### 4. Explicit identity over heuristics

El sistema debe rastrear ownership visual por IDs explícitos, no por:

- color placeholders,
- corner radius,
- path heurístico,
- orden implícito,
- matching textual/espacial ambiguo.

### 5. Fewer conceptual models

Si dos abstracciones resuelven el mismo problema central, una sobra.

El repo debe reducir:

- modelos duplicados de scene,
- package families puramente nominales,
- rutas paralelas de output/presentation,
- bridges perpetuos.

### 6. Correctness and clarity before optimization

No tiene sentido optimizar un sistema que todavía es difícil de explicar.

Primero:

- ownership claro,
- path oficial claro,
- compat aislado,
- runtime distinguido del core.

Después recién:

- partial updates,
- stable reuse,
- move-only,
- GPU readback minimization.

---

## Verified current architecture

## Real runtime flow today

```txt
app/examples
  -> packages/renderer/src/index.ts
  -> createRenderLoop() in packages/renderer/src/loop.ts
  -> TGENode retained tree
  -> Clay translation in packages/renderer/src/clay.ts
  -> RenderCommand[]
  -> render graph + layer planning in renderer internals
  -> GPU / CPU-ish paint helpers
  -> Kitty layer composer or compat composer
  -> terminal output
```

## Files that currently anchor the system

### Runtime entry
- `packages/renderer/src/index.ts`
- `packages/renderer/src/loop.ts`
- `packages/renderer/src/reconciler.ts`

### Scene/layout/graph
- `packages/renderer/src/node.ts`
- `packages/renderer/src/clay.ts`
- `packages/renderer/src/render-graph.ts`
- `packages/renderer/src/layout-writeback.ts`

### GPU/compositor/output
- `packages/renderer/src/gpu-renderer-backend.ts`
- `packages/renderer/src/gpu-frame-composer.ts`
- `packages/renderer/src/gpu-layer-strategy.ts`
- `packages/output/src/layer-composer.ts`
- `packages/output/src/kitty.ts`
- `packages/output/src/composer.ts`

### Compat still active
- `packages/renderer/src/cpu-renderer-backend.ts`
- `packages/pixel/src/*`
- `packages/renderer/src/canvas.ts`
- `packages/renderer/src/wgpu-canvas-backend.ts`

### UI/runtime coupling points
- `packages/renderer/src/focus.ts`
- `packages/renderer/src/interaction.ts`
- `packages/renderer/src/drag.ts`
- `packages/renderer/src/scroll.ts`
- `packages/components/src/scene-canvas.tsx`
- `packages/windowing/src/*`

---

## Current repo reality after the first bridge pass

## What improved

- public boundaries exist where before there were only folders,
- direct imports to `packages/*/src/*` from examples/scripts were cut,
- `renderObjectId` exists,
- `loop.ts` shed some helper responsibilities,
- `Portal`/overlay handling is less fake than before,
- windowing and profiling/repro material now exist explicitly.

## What is still not truly solved

### 1. Package graph is still partially performative

These packages exist today mainly as temporary facades:

- `@tge/renderer-solid`
- `@tge/platform-terminal`
- `@tge/windowing`
- `@tge/compositor`
- `@tge/render-graph`
- `@tge/scene`
- `@tge/text`
- `@tge/compat-text-ansi`

That is useful as a migration tool, but dangerous if people start treating facade names as proof of real ownership.

### 2. `loop.ts` is still the operational center of gravity

It is better than before, but still owns too much frame orchestration and too much policy coupling.

### 3. Compat/software abstractions still leak into the official path

`@tge/compat-software` is still present in imports used by:

- `packages/renderer/src/loop.ts`
- `packages/renderer/src/layers.ts`
- `packages/renderer/src/gpu-renderer-backend.ts`
- `packages/renderer/src/wgpu-canvas-backend.ts`

That means the core still thinks in terms of `PixelBuffer` more than a truly GPU-first architecture should.

### 4. Explicit identity is present, but heuristics still survive as fallback

`packages/renderer/src/render-graph.ts` now prefers `renderObjectId`, but still keeps fallback matching by:

- `color + cornerRadius`
- `color`

That keeps ambiguity alive.

### 5. Windowing ownership is now physically correct

`@tge/windowing` now owns its source in:

- `packages/windowing/src/*`

The remaining work is cleanup of stale references and dependency shaping, not the move itself.

### 6. Scene decision is now made

The retained visual model is no longer undecided:

- `SceneCanvas` survives,
- `RetainedGraph` is retired.

That removes one of the largest conceptual duplications in the repo.

---

## Architectural smells that matter most now

### 1. Fake boundaries in the hot path

Internal code should not need to hop through facade packages just to reach its own real owner.

### 2. Too many conceptual package families

The repo currently communicates more package domains than it truly owns.

### 3. Runtime semantics still live too low

Focus, interaction semantics and some widget/runtime policy are still too close to renderer core internals.

### 4. Compat is isolated publicly, but not conceptually enough

Moving code to `compat-*` names helps, but the hot path still carries too much of that worldview.

### 5. Composition ownership is still split

Today composition is spread across:

- `loop.ts`
- `gpu-frame-composer.ts`
- `output/src/layer-composer.ts`

The package called `@tge/compositor` does not yet own composition in a real sense.

---

## Efficiency-first target architecture

The most efficient architecture for this repo is **not** the one with the most package names.
It is the one with the clearest ownership.

## Layered model

```txt
Platform / Host
  -> Engine Core
  -> UI Runtime
  -> Components / Product
  -> Compat / Legacy / Lab
```

## 1. Platform / Host

### Keep real
- terminal lifecycle
- caps probing
- resize/raw mode
- semantic input parser

### Likely packages
- `@tge/platform-terminal`
- `@tge/input`

## 2. Engine Core

### Responsibilities
- retained node model or render object model
- layout replay
- explicit render identity
- render graph generation
- layer planning
- damage tracking
- GPU rendering
- Kitty presentation boundary

### Critical rule
This layer should be explainable without using widget words.

### Packages/domains
- scene/layout/render-graph/gpu/output may remain separate **only if** their ownership is physically real
- otherwise they should stay as internal modules until the split is real

## 3. UI Runtime

### Responsibilities
- Solid integration
- event routing above primitive hit-testing
- focus model
- press semantics
- hover/active/focus merge
- drag/resize abstractions
- overlay root policy

### Package
- `@tge/renderer-solid` or a renamed `@tge/runtime-ui`

### Rule
This is allowed to think in terms of widgets.
The engine core is not.

## 4. Components / Product

### Responsibilities
- headless widgets
- design system
- desktop/window manager
- demos/product conventions

### Packages
- `@tge/components`
- `@tge/void`
- `@tge/windowing`

## 5. Compat / Legacy / Lab

### Responsibilities
- software raster fallback
- fallback output
- imperative canvas legacy
- ANSI/selectable text legacy
- profiling harnesses / experiments

### Packages
- `@tge/compat-software`
- `@tge/output-compat`
- `@tge/compat-canvas`
- `@tge/compat-text-ansi`

### Rule
These packages may survive for compatibility, but they must stop shaping the official engine story.

---

## Keep / fuse / retire

| Area | Recommendation | Why |
| --- | --- | --- |
| `@tge/platform-terminal` + `@tge/input` | **keep** | real cohesive ownership |
| `renderer/src/index.ts` + `loop.ts` + runtime helpers | **keep but simplify** | still the operational core |
| `@tge/renderer-solid` facade | **keep publicly, reduce internally** | public boundary useful, internal bridge harmful |
| `@tge/windowing` | **keep** | package now owns its source physically |
| `SceneCanvas` | **keep as primary retained scene API** | declarative scene abstraction with integrated hit-testing and overlays |
| `RetainedGraph` | **retire** | duplicated retained model with higher conceptual cost |
| `@tge/compositor` facade | **retire or make real** | today it is mostly a label, not an owner |
| `@tge/render-graph` facade | **retire or make real** | same problem |
| `@tge/scene` facade | **retire or make real** | same problem |
| `@tge/text` facade | **retire or make real** | same problem |
| `@tge/compat-text-ansi` | **retire if unused** | looks transitional and low-value today |
| CPU/software path in hot path | **reduce aggressively** | blocks clean GPU-first reasoning |
| heuristic render-graph fallback | **retire** | explicit IDs already exist |

---

## Reduction priorities

## Priority 1 — Stop lying to ourselves about ownership

- mark which packages are bridges,
- stop using facade names internally where they obscure real ownership,
- keep bridges only as public compatibility boundaries.

## Priority 2 — Keep `SceneCanvas`, retire `RetainedGraph`

- migrate remaining consumers to `SceneCanvas`,
- remove `RetainedGraph` exports and implementation,
- keep a single retained visual model.

## Priority 3 — Finish windowing cleanup after the physical move

- treat `packages/windowing/src/*` as the real owner,
- remove stale references to the old `components/src/windowing/*` location,
- simplify cross-package dependencies over time.

## Priority 4 — Remove heuristics from render graph ownership

- make `renderObjectId` mandatory for image/canvas/effect ownership,
- kill fallback matching by `color` / `cornerRadius`.

## Priority 5 — Reduce compat from the official hot path

- stop making `PixelBuffer` the conceptual center of the renderer,
- isolate CPU/software fallbacks behind explicit compat boundaries.

## Priority 6 — Make compositor ownership real

Decide whether composition lives in:

- a real `@tge/compositor` package,
- or in renderer/output internals with no fake package pretending otherwise.

---

## API strategy

## APIs that should survive

- terminal creation APIs
- input parser APIs
- `mount()`
- Solid integration APIs that truly belong to the runtime layer
- Kitty raw/shm transport APIs
- headless components
- design system components

## APIs to deprecate

- `createCpuRendererBackend`
- direct public reliance on `PixelBuffer`
- `CanvasContext` as the main drawing future
- backend strategy APIs exposed to app consumers
- imports of internal `packages/*/src/*`

## APIs to remove from the core public story

- universal fallback composer as principal abstraction
- direct exposure of software paint as part of the official path
- widget semantics mixed into core renderer exports
- facade-only packages presented as if they were real domain owners

---

## Definition of Done

The architecture is only “done” when all of these are true:

## Ownership and package truth
- hot-path ownership is physically real, not facade-driven fiction
- bridges are documented as bridges or removed
- `windowing` source ownership matches package ownership

## GPU-first clarity
- the official engine path is GPU-first end to end
- compat/software paths are outside the main reasoning path

## Runtime separation
- focus, bubbling, drag semantics and widget policy live above the core engine

## Identity and correctness
- layer/render ownership no longer depends on heuristic fallback as a base model

## Reduced conceptual surface
- only one primary scene abstraction survives
- composition ownership is understandable in one place

## Operational confidence
- minimal repros exist for engine bugs
- optimization recovery happens only after structure is simplified and verified

---

## Final recommendation

Do not keep optimizing the repo as if the hard part were just performance.

The hard part now is architectural honesty.

The engine will get faster only after it gets:

- easier to explain,
- easier to trace,
- easier to own,
- and less polluted by fake boundaries and legacy assumptions.

That is the next architectural objective.
