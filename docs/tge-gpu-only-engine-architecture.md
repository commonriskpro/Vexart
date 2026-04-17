# TGE GPU-Only Engine Architecture

## Goal

Documentar la arquitectura real del motor **como existe hoy**, qué partes son core real, qué partes siguen siendo bridges temporales, y cuál es la arquitectura objetivo más eficiente para reducir complejidad, legado CPU y ownership ambiguo.

Este documento ya no es solo una visión aspiracional.
Ahora también funciona como **reality check técnico** después de la primera pasada del refactor.

---

## Executive summary

TGE/Vexart ya dejó atrás la etapa más obvia de compat/CPU híbrido.

Hoy el path oficial ya es mucho más honesto:

- `cpu-renderer-backend.ts` fue eliminado,
- `RetainedGraph` fue retirado,
- `windowing` ya tiene ownership físico real,
- `legacy-render-painter.ts` fue eliminado,
- `@tge/compat-software` fue eliminado,
- `@tge/output-compat` y los backends `composer` / `placeholder` / `halfblock` fueron eliminados,
- `loop.ts` ya no sostiene un single-buffer fallback,
- `layer-composer.ts` quedó raw-only,
- `RasterSurface` ya no es alias de `PixelBuffer`.

Eso significa que la conversación cambió.

El problema principal YA NO es “cómo salimos del CPU backend”.
Eso ya salió.

El problema principal ahora es:

- cuánto staging raster transicional sigue vivo,
- cuánto del render graph sigue dependiendo de paths no 100% GPU-native,
- y qué piezas faltan para que el engine interno piense en GPU targets/layers/images primero,
  y en raw RGBA sólo al borde de Kitty.

La dirección correcta ya no es “seguir borrando fallbacks obvios”.
La dirección correcta es:

> reducir staging raster a lo mínimo necesario,
> hacer GPU-native los ops que todavía dependen de surfaces temporales,
> y dejar `PixelBuffer`/`@tge/pixel` como detalle interno cada vez más acotado.

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
  -> GPU backends + raster staging helpers
  -> Kitty layer composer (raw-only)
  -> terminal output
```

## Canonical official path

This is the path that all migration and cleanup work must preserve and simplify:

```txt
loop
  -> render-graph
  -> gpu-renderer-backend
  -> gpu-frame-composer
  -> layer-composer (raw-only)
  -> kitty
```

### Output boundary contract

The only mandatory raw crossing in the official path is:

```txt
GPU target
  -> readback RGBA
  -> raw bytes
  -> Kitty
```

Everything before that should be reasoned about as GPU targets, GPU images, GPU layers and GPU composition state — not as `PixelBuffer`-shaped engine architecture.

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

### Staging still active
- `packages/pixel/src/*`
- `packages/renderer/src/pixel-buffer.ts`
- `packages/renderer/src/render-surface.ts`
- `packages/renderer/src/gpu-raster-staging.ts`
- `packages/renderer/src/surface-transform-staging.ts`
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
- `loop.ts` shed major fallback responsibilities,
- `Portal`/overlay handling is less fake than before,
- `windowing` now owns its source physically,
- the official loop is Kitty-only + layered/raw-only,
- the official renderer path no longer has CPU fallback or selectable ANSI text.

## What is still not truly solved

### 1. Package graph is still partially performative

These packages exist today mainly as temporary facades:

- `@tge/renderer-solid`
- `@tge/platform-terminal`
- `@tge/windowing`

The weak facades (`compositor`, `render-graph`, `scene`, `text`, `compat-text-ansi`) were already retired.
The remaining bridges are the ones that still have public value.

### 2. `loop.ts` is still the operational center of gravity

It is better than before, but still owns too much frame orchestration and too much policy coupling.

### 3. Raster staging still leaks into the official path

The issue is no longer `@tge/compat-software` or CPU fallback.
The issue now is residual raster staging in:

- `packages/renderer/src/gpu-raster-staging.ts`
- `packages/renderer/src/surface-transform-staging.ts`
- `packages/renderer/src/canvas.ts`

That means the core no longer thinks in CPU backend terms, but it still does not think in GPU targets/images/layers all the way through.

### 4. Explicit identity is now real on the base render-graph path

`packages/renderer/src/render-graph.ts` now claims `image`, `canvas`, and `effect` attachment by `renderObjectId` without falling back to:

- `color + cornerRadius`
- `color`

That removes the old ambiguity from the base path.
Remaining ownership cleanup still lives in adjacent systems like border/text/writeback/layer assignment.

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

### 4. Staging is isolated better, but not GPU-native enough yet

We already removed CPU backend, selectable ANSI, output-compat and the obvious fallback layers.
What remains is the smaller but more important problem: the engine still creates temporary raster surfaces for some GPU paths.

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
- residual raster staging during the transition to GPU-native internals
- imperative canvas legacy
- profiling harnesses / experiments

### Packages
- `@tge/compat-canvas`
- `@tge/pixel` (implementation library, not core surface contract)

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
| weak facades (`@tge/compositor`, `@tge/render-graph`, `@tge/scene`, `@tge/text`, `@tge/compat-text-ansi`) | **retired** | no longer part of the real package graph |
| CPU backend / output compat / selectable ANSI | **retired** | no longer part of the official engine path |
| residual raster staging in GPU path | **reduce aggressively** | blocks true GPU-native internals |
| heuristic render-graph fallback | **retire** | explicit IDs already exist |

---

## Reduction priorities

## Priority 1 — Stop lying to ourselves about ownership

- mark which packages are bridges,
- stop using facade names internally where they obscure real ownership,
- keep bridges only as public compatibility boundaries.

## Priority 2 — Finish the last raster staging cuts

- remove raster staging from the official GPU paths wherever the bridge/paint helper only exists because a GPU-native implementation is missing,
- make `render-surface.ts` a neutral contract while shrinking the role of `pixel-buffer.ts`,
- keep raw RGBA only at the output boundary to Kitty.

## Priority 3 — Keep `SceneCanvas`, retire `RetainedGraph`

- migrate remaining consumers to `SceneCanvas`,
- remove `RetainedGraph` exports and implementation,
- keep a single retained visual model.

## Priority 4 — Finish windowing cleanup after the physical move

- treat `packages/windowing/src/*` as the real owner,
- remove stale references to the old `components/src/windowing/*` location,
- simplify cross-package dependencies over time.

## Priority 5 — Remove heuristics from render graph ownership

- make `renderObjectId` mandatory for image/canvas/effect ownership,
- kill fallback matching by `color` / `cornerRadius`.

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

## Forbidden transitional patterns

The cleanup is going in the wrong direction if any branch reintroduces one of these as part of the official path:

- a CPU renderer backend as normal runtime architecture
- output compat or selectable ANSI as part of the official renderer story
- `PixelBuffer` as the main conceptual boundary of the engine
- `CanvasContext` as the strategic future of the renderer core
- heuristic render ownership when `renderObjectId` is already available
- raw bytes before the final output boundary to Kitty

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
- raw bytes only appear at the final Kitty output boundary
- `canvas.ts` is no longer a structural dependency of the official path

## Runtime separation
- focus, bubbling, drag semantics and widget policy live above the core engine

## Identity and correctness
- layer/render ownership no longer depends on heuristic fallback as a base model
- `renderObjectId` is the dominant ownership mechanism where explicit identity exists

## Reduced conceptual surface
- only one primary scene abstraction survives
- composition ownership is understandable in one place
- `@tge/pixel` is implementation detail, not renderer mental model

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
