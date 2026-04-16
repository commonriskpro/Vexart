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
| P1 | bridge-pass complete | Se crearon package boundaries públicas, pero varias siguen siendo bridges. |
| P2 | partial | Se extrajeron helpers de `loop.ts`, pero el archivo sigue demasiado central. |
| P3 | partial | `renderObjectId` existe, pero todavía hay fallback heurístico. |
| P4 | partial | Compat fue renombrado/expuesto mejor, pero sigue presente en el hot path conceptual. |
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
| `@tge/renderer-solid` | `packages/renderer/src/index.ts` | bridge | runtime público útil, ownership físico todavía en renderer | keep public, reduce internal dependence on facade layering |
| `@tge/scene` | `packages/renderer/src/node.ts` | bridge | dominio nominal todavía no es package real | retire or make real |
| `@tge/layout-clay` | `packages/renderer/src/clay.ts` | bridge-to-real-ish | boundary útil, pero todavía simple reexport | acceptable short term; make real only if ownership moves |
| `@tge/render-graph` | `packages/renderer/src/render-graph.ts` | bridge | dominio todavía no es físicamente independiente | retire or make real |
| `@tge/text` | `packages/renderer/src/text-layout.ts` + `font-atlas.ts` | bridge | text no está físicamente separado | retire or make real |
| `@tge/gpu` | renderer GPU modules | bridge-to-real-ish | API pública útil, pero ownership sigue mezclado | keep public, simplify internal graph |
| `@tge/compositor` | renderer/output internals | bridge | package nominal sin ownership verdadero | decide real owner or retire |
| `@tge/output-kitty` | `packages/output/src/kitty*.ts` | bridge-to-real-ish | boundary oficial útil | keep, but clarify kitty/compositor split |
| `@tge/output-compat` | `packages/output/src/composer.ts` + fallbacks | bridge | compat real, package físico liviano | keep as compat only |
| `@tge/compat-software` | `packages/pixel/src/*` + cpu backend | bridge + legacy | todavía pesa demasiado en el hot path | keep public compat, reduce hot-path dependence |
| `@tge/compat-canvas` | `packages/renderer/src/canvas*.ts` | bridge + legacy | imperative canvas sigue vivo | keep only as legacy/compat |
| `@tge/compat-text-ansi` | `packages/renderer/src/selection.ts` | bridge | poco claro que siga justificándose | candidate-retire |
| `@tge/components` | `packages/components/src/*` | real | package verdadero | keep |
| `@tge/void` | `packages/void/src/*` | real | package verdadero | keep |
| `@tge/windowing` | `packages/windowing/src/*` | real | ownership físico ya corregido | keep |

---

## Hot-path connection map today

```txt
packages/renderer/src/index.ts
  -> packages/renderer/src/loop.ts
  -> packages/renderer/src/node.ts
  -> packages/renderer/src/clay.ts
  -> packages/renderer/src/render-graph.ts
  -> gpu/cpu-ish backend helpers
  -> packages/output/src/layer-composer.ts or packages/output/src/composer.ts
  -> terminal output
```

### Important implication

El sistema hoy sigue siendo más parecido a:

`renderer/index + loop + internal modules + output helpers`

que a una cadena limpia de packages dueños independientes.

---

## Reduction matrix by domain

| Domain / file family | Status today | Keep | Fuse | Retire / Move | Notes |
| --- | --- | --- | --- | --- | --- |
| `packages/terminal/src/*` | stable | ✅ |  |  | buen dominio real |
| `packages/input/src/*` | stable | ✅ |  |  | buen dominio real |
| `packages/renderer/src/index.ts` | overloaded | ✅ |  | simplify | sigue siendo kitchen sink runtime |
| `packages/renderer/src/loop.ts` | partial split | ✅ |  | simplify | todavía demasiado central |
| `packages/renderer/src/node.ts` | core but misplaced | ✅ |  | maybe move later | hoy sigue siendo dueño real del árbol |
| `packages/renderer/src/clay.ts` | healthy internal owner | ✅ |  | maybe move later | boundary útil |
| `packages/renderer/src/render-graph.ts` | improved but heuristic fallback remains | ✅ |  | simplify | hacer `renderObjectId` dominante de verdad |
| `packages/renderer/src/gpu-renderer-backend.ts` | official path but still mixed | ✅ |  | simplify | sacar dependencia conceptual de compat |
| `packages/renderer/src/gpu-frame-composer.ts` | adaptor | ✅ |  | review owner | define si queda en compositor o output |
| `packages/renderer/src/cpu-renderer-backend.ts` | legacy |  |  | move deeper into compat | no más core oficial |
| `packages/pixel/src/*` | legacy |  |  | compat only | no más centro conceptual |
| `packages/output/src/kitty*.ts` | official path | ✅ |  |  | keep as real backend owner |
| `packages/output/src/composer.ts` | compat |  |  | compat only | fuera del path oficial |
| `packages/output/src/placeholder.ts` | compat |  |  | compat only | fuera del path oficial |
| `packages/output/src/halfblock.ts` | compat |  |  | compat only | fuera del path oficial |
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

### 2. Loop still dominates reasoning
Aunque tenga helpers nuevos, `loop.ts` sigue siendo la explicación operativa del sistema.

### 3. Compat still leaks into official path
El hot path oficial todavía arrastra demasiado `compat-software` / `PixelBuffer`.

### 4. Heuristic fallback still alive
El render graph mejoró, pero no está totalmente liberado de heurísticas.

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
- remove fallback matching by `color` / `cornerRadius` from the base path

## R5 — Reduce compat-software from the hot path

- stop centering `PixelBuffer` in the official engine explanation
- isolate CPU/software fallback as true compat

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
4. Move `windowing` physically.
5. Choose one scene abstraction.
6. Remove heuristic fallback where explicit IDs already exist.
7. Reduce compat from the hot path.
8. Only then resume optimization recovery.

---

## Use of this document

Use this matrix when a session needs to decide:

- whether a package is real or bridge,
- whether code belongs in core, runtime or compat,
- what to keep / fuse / retire,
- what should be simplified before any more performance work,
- and what not to touch before a higher-priority reduction step is done.

This remains the operational source of truth for repo reshaping.
