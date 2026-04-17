# TGE Package Migration Matrix

## Goal

Convertir la visión GPU-only en un mapa operativo **del repo real de hoy**:

- qué dominio es real,
- qué package es bridge,
- qué parte del hot path sigue cargando legacy,
- qué se mantiene,
- qué se fusiona,
- qué se retira,
- y en qué orden conviene reducir complejidad.

Este documento sigue siendo la fuente operativa principal, pero ahora está orientado a la etapa de **reducción y aclaración arquitectónica**.

---

## Status legend

- **real** — ownership real, no solo nominal
- **bridge** — facade temporal / boundary pública transicional
- **partial** — dirección correcta, pero incompleta
- **legacy** — compat path o modelo viejo
- **candidate-retire** — fuerte candidato a eliminar o colapsar
- **candidate-fuse** — conviene converger con otra abstracción

## Phase legend

- **P0-P7** — plan original de migración
- **R0-R6** — plan actualizado de reducción

---

## Execution tracking

### 2026-04-16 — first bridge pass

| Track | Status | Notes |
| --- | --- | --- |
| P0 | completed | Dirección GPU-only aceptada como narrativa principal. |
| P1 | strong partial | Se retiraron weak facades y quedaron sólo los bridges públicos con valor real. |
| P2 | partial | `loop.ts` ya no sostiene single-buffer fallback ni painter raster directo, pero sigue siendo demasiado central. |
| P3 | strong partial | `renderObjectId` ya domina `image/canvas/effect` en `render-graph.ts`, pero todavía queda trabajo de ownership fuera de ese base path. |
| P4 | strong partial | CPU backend, output compat, selectable ANSI y loop fallback ya salieron del path oficial. |
| P5 | partial | Runtime UI mejoró, pero la separación core/runtime no está cerrada. |
| P6 | partial | `OverlayRoot` existe, pero overlay/runtime policy no está completamente resuelta. |
| P7 | not started | La reintroducción formal de optimizaciones todavía NO ocurrió según las reglas del roadmap. |

### 2026-04-16 — updated plan objective

La prioridad ya no es “seguir agregando packages” sino:

1. mapear el ownership real,
2. retirar bridges innecesarios,
3. reducir compat/legacy del core oficial,
4. converger abstracciones duplicadas,
5. recién después recuperar optimizaciones.

---

## Current repo reality: public package vs real owner

| Public package / area | Real owner today | Status | Why it matters now | Reduction action |
| --- | --- | --- | --- | --- |
| `@tge/platform-terminal` | `packages/terminal/src/*` | bridge | el nombre nuevo existe, pero el ownership real sigue en `terminal` | keep publicly, avoid pretending the bridge is the owner |
| `@tge/input` | `packages/input/src/*` | real | parser/input ya tiene cohesión razonable | keep |
| `@tge/renderer-solid` | `packages/renderer-solid/src/*` + `packages/renderer/src/index.ts` compat umbrella | bridge | facade pública útil, pero el ownership engine/runtime principal ya vive en core/runtime | keep public, reduce umbrella scope over time |
| `@tge/scene` | `packages/core/src/node.ts` | bridge-to-real-ish | el árbol retenido ya tiene owner físico real aunque el package nominal siga siendo debatible | keep as concept or retire facade later |
| `@tge/layout-clay` | `packages/core/src/clay.ts` | bridge-to-real-ish | boundary útil con owner físico real | acceptable short term |
| `@tge/render-graph` | `packages/core/src/render-graph.ts` | bridge-to-real-ish | dominio ya tiene owner físico real en core | acceptable short term |
| `@tge/text` | `packages/core/src/text-layout.ts` + `font-atlas.ts` | bridge-to-real-ish | text ya no vive físicamente en renderer | acceptable short term |
| `@tge/gpu` | renderer GPU modules | bridge-to-real-ish | API pública útil, pero ownership sigue mezclado | keep public, simplify internal graph |
| `@tge/compositor` | renderer/output internals | bridge | package nominal sin ownership verdadero | decide real owner or retire |
| `@tge/output-kitty` | `packages/output/src/kitty*.ts` | bridge-to-real-ish | boundary oficial útil | keep, but clarify kitty/compositor split |
| `@tge/output-compat` | retired | retired | ya no sostiene nada del path oficial | remove from docs/runtime story |
| `@tge/compat-software` | retired | retired | wrapper eliminado; quedaba ocultando que el staging real vive en `@tge/pixel` | remove from docs/runtime story |
| `@tge/compat-canvas` | `packages/renderer/src/canvas*.ts` | bridge + legacy | imperative canvas sigue vivo | keep only as legacy/compat |
| `@tge/compat-text-ansi` | `packages/renderer/src/selection.ts` | bridge | poco claro que siga justificándose | candidate-retire |
| `@tge/components` | `packages/components/src/*` | real | package verdadero | keep |
| `@tge/void` | `packages/void/src/*` | real | package verdadero | keep |
| `@tge/windowing` | `packages/windowing/src/*` | real | ownership físico ya corregido | keep |

---

## Hot-path connection map today

```txt
packages/renderer/src/index.ts
  -> packages/runtime/src/loop.ts
  -> packages/core/src/node.ts
  -> packages/core/src/clay.ts
  -> packages/core/src/render-graph.ts
  -> gpu backends + raster staging helpers
  -> packages/output/src/layer-composer.ts
  -> terminal output
```

### Important implication

El sistema hoy sigue siendo más parecido a:

`renderer compat umbrella + runtime/core owners + kitty output helpers`

que a una cadena limpia de packages dueños independientes.

---

## Reduction matrix by domain

| Domain / file family | Status today | Keep | Fuse | Retire / Move | Notes |
| --- | --- | --- | --- | --- | --- |
| `packages/terminal/src/*` | stable | ✅ |  |  | buen dominio real |
| `packages/input/src/*` | stable | ✅ |  |  | buen dominio real |
| `packages/renderer/src/index.ts` | compatibility umbrella | ✅ |  | simplify | ya no es owner del engine/runtime; queda como facade pública |
| `packages/core/src/*` | real engine owner | ✅ |  |  | core físico ya consolidado |
| `packages/runtime/src/*` | real runtime owner | ✅ |  |  | runtime físico ya consolidado |
| `packages/renderer/src/cpu-renderer-backend.ts` | retired |  |  | remove | ya salió del repo oficial |
| `packages/pixel/src/*` | staging implementation |  |  | reduce conceptual role | no más centro conceptual del renderer |
| `packages/output/src/kitty*.ts` | official path | ✅ |  |  | keep as real backend owner |
| `packages/output/src/composer.ts` | retired |  |  | remove | ya salió del repo oficial |
| `packages/output/src/placeholder.ts` | retired |  |  | remove | ya salió del repo oficial |
| `packages/output/src/halfblock.ts` | retired |  |  | remove | ya salió del repo oficial |
| `packages/components/src/scene-canvas.tsx` | primary retained scene | ✅ |  |  | conservar como API declarativa oficial |
| `packages/components/src/retained-graph.tsx` | retired duplicate |  |  | retire | `SceneCanvas` absorbe esta responsabilidad |
| `packages/windowing/src/*` | real owner | ✅ |  |  | ownership físico ya corregido |
| `packages/renderer/src/focus.ts` | runtime semantics |  |  | move upward conceptually | no debería definir el engine |
| `packages/renderer/src/interaction.ts` | runtime semantics + hints |  |  | redesign | pasar de semantics a engine hints |
| `packages/renderer/src/scroll.ts` | mixed ownership |  |  | redesign | scroll state normalizado, no Clay leakage |
| `packages/renderer/src/selection.ts` | unclear place |  |  | review or retire | posible compat-only |
| `packages/renderer/src/router.ts` / `data.ts` / tree-sitter | product/runtime utilities |  |  | move out of core story | no deberían definir el engine |

---

## Biggest current architectural problems

### 1. Fake package clarity
Hay packages con buen naming pero sin ownership real.

### 2. Runtime loop still dominates reasoning
Aunque ya viva en `packages/runtime/src/loop.ts`, el loop sigue siendo la explicación operativa del sistema.

### 3. Compat still leaks into official path
El hot path oficial ya no arrastra CPU backend ni output compat, pero todavía arrastra demasiado staging raster (`PixelBuffer` / `@tge/pixel`) en rutas GPU internas.

### 4. Ownership cleanup is not fully done
La separación física principal ya está hecha, pero todavía queda limpieza en facades, shims y dominios adyacentes.

---

## Highest-impact reduction candidates

## R1 — Mark and retire fake boundaries

Candidates with strongest review pressure:

- `@tge/compositor`
- `@tge/render-graph`
- `@tge/scene`
- `@tge/text`
- `@tge/compat-text-ansi`

Rule:

- if they become real owners, great
- if not, stop pretending they are architecture

## R2 — Keep `SceneCanvas`, retire `RetainedGraph`

Decision already made:

- `SceneCanvas` survives as the primary retained visual model
- `RetainedGraph` is retired and the known product consumers were migrated away

## R3 — Consolidate windowing after the physical move

The move already happened:

- `packages/windowing/src/*` is now the physical owner

What remains is cleanup of stale references and dependency simplification.

## R4 — Finish explicit ownership

- make `renderObjectId` primary, not just preferred
- remove fallback matching by `color` / `cornerRadius` from the remaining base path
- continue cleanup in border/text/writeback/layer ownership after the `image/canvas/effect` cut

## R5 — Reduce raster staging from the hot path

- stop centering `PixelBuffer` / `@tge/pixel` in the official engine explanation
- keep only the minimum staging needed before Kitty raw output
- move the rest of the software painter logic out of the official path

---

## Imports and architecture policy

## Forbidden

- importing from `packages/*/src/*` outside the owning package
- treating bridge packages as proof of real ownership
- adding new product/runtime features on top of unresolved duplicated abstractions
- reintroducing optimizations before current ownership is simpler

## Allowed

- public compatibility facades when explicitly documented as bridges
- internal simplification that reduces package graph fiction
- keeping compat packages for external users while shrinking their architectural importance

---

## Recommended execution order now

1. Audit current ownership.
2. Mark bridges vs real owners.
3. Retire or collapse fake boundaries.
4. Remove CPU/output compat/selectable fallback paths from the official runtime.
5. Move `windowing` physically.
6. Choose one scene abstraction.
7. Reduce raster staging from the hot path.
8. Remove heuristic fallback where explicit IDs already exist.
9. Only then resume optimization recovery.

---

## Use of this document

Use this matrix when a session needs to decide:

- whether a package is real or bridge,
- whether code belongs in core, runtime or compat,
- what to keep / fuse / retire,
- what should be simplified before any more performance work,
- and what not to touch before a higher-priority reduction step is done.

This remains the operational source of truth for repo reshaping.
