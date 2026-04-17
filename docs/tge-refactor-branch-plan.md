# TGE Refactor Branch Plan

## Goal

Actualizar la estrategia de branches para la etapa actual del refactor.

La primera pasada ya hizo algo importante:

- creó boundaries públicas mejores,
- introdujo bridges temporales,
- y redujo parte del caos inicial.

Pero ahora el riesgo principal cambió.

Ya no es solo “mezclar package split con loop split”.
Ahora el riesgo es:

> quedarse demasiado tiempo en una arquitectura puente,
> con packages nominales,
> bridges eternos,
> y compat todavía demasiado cerca del hot path.

Por eso este branch plan se actualiza para priorizar **auditoría + reducción + retiro de bridges**.

---

## Branching principles

### 1. One reduction objective per branch

No mezclar en una sola branch:

- auditoría de ownership,
- retiro de bridges,
- convergencia de scene abstractions,
- cleanup del hot path GPU,
- runtime clarification,
- optimization recovery.

### 2. A branch must reduce ambiguity

Cada branch nueva debe dejar el repo:

- más fácil de explicar,
- con ownership más claro,
- o con menos bridges/deuda que antes.

### 3. Public compat is allowed; internal fiction is not

Un bridge público puede sobrevivir.
Pero no debe seguir gobernando la arquitectura interna.

### 4. Repros remain mandatory

`examples/window-drag-repro.tsx` y los harnesses de profiling relevantes siguen siendo diagnósticos oficiales del engine.

### 5. No optimization branch before structure is simpler

Si una branch mejora performance pero mantiene ownership confuso, está fuera de orden.

---

## What the previous branch pass achieved

La branch previa resolvió una **bridge pass** útil:

- boundaries públicas,
- helpers extraídos,
- `renderObjectId`,
- overlay root inicial,
- packages/facades para los dominios target.

Eso desbloqueó el siguiente trabajo.
No lo reemplaza.

---

## Suggested branch sequence now

## Branch 08 — Current-state audit

### Name
`arch/08-current-state-audit`

### Scope
- mapear cómo está conectado el motor HOY
- marcar packages reales vs bridges
- identificar duplicación y ownership ambiguo
- actualizar docs para reflejar realidad, no intención

### Key targets
- docs de arquitectura / roadmap / migration matrix
- package graph real
- hot path real (`renderer/index.ts` + `loop.ts` + output)

### Exit criteria
- existe un mapa explícito de real owners, bridges y legacy paths

### Execution document
- `docs/tge-current-state-audit-plan.md`

### Expected artifact
- `docs/tge-current-state-audit-report.md`

---

## Branch 09 — Bridge retirement

### Name
`arch/09-bridge-retirement`

### Scope
- retirar fachadas innecesarias
- documentar las que sobreviven como compat pública
- reducir dependencia interna de package aliases fake

### Key targets
- `@tge/compositor`
- `@tge/render-graph`
- `@tge/scene`
- `@tge/text`
- `@tge/compat-text-ansi`

### Exit criteria
- cada facade restante tiene razón explícita de existir
- el grafo interno del repo es más honesto que antes

---

## Branch 10 — Scene and windowing ownership cleanup

### Name
`arch/10-scene-windowing-ownership`

### Scope
- consolidar `SceneCanvas` como abstracción visual principal
- retirar `RetainedGraph`
- limpiar el dominio `windowing` después del move físico al package real

### Key targets
- `packages/components/src/scene-canvas.tsx`
- `packages/components/src/retained-graph.tsx`
- `packages/windowing/src/*`

### Exit criteria
- `SceneCanvas` queda como única familia visual retained
- `RetainedGraph` deja de existir en código productivo
- `windowing` queda limpio de referencias al ownership viejo

---

## Branch 11 — GPU core path reduction

### Name
`arch/11-gpu-core-reduction`

### Scope
- sacar compat/software del path conceptual oficial
- reducir dependencia de `PixelBuffer` en el hot path
- aclarar ownership entre renderer/gpu/compositor/output

### Key targets
- `packages/pixel/src/*`
- `packages/renderer/src/gpu-renderer-backend.ts`
- `packages/renderer/src/gpu-frame-composer.ts`
- `packages/renderer/src/gpu-raster-staging.ts`
- `packages/renderer/src/surface-transform-staging.ts`

### Exit criteria
- el path oficial del engine puede explicarse como GPU-first sin arrastrar compat como base mental

### Current status
- CPU backend eliminado
- output compat eliminado
- selectable ANSI eliminado
- loop fallback eliminado
- remaining work: shrink raster staging and finish GPU-native internals

### Recommended execution slices

#### 11A — Quarantine imperative canvas
- make `canvas.ts` and `CanvasContext` explicitly compat/lab-oriented in the docs and imports
- stop treating canvas semantics as default renderer architecture
- done when the official path can be described without centering `canvas.ts`

#### 11B — Neutralize raster staging helpers
- shrink `gpu-raster-staging.ts` and `surface-transform-staging.ts`
- keep canvas text/readback staging folded into `gpu-raster-staging.ts` instead of spawning a second staging module
- push any unavoidable temporary surfaces behind neutral helper boundaries
- done when staging is implementation residue, not the engine story

#### 11C — Make GPU terminology canonical
- describe internals as GPU targets, GPU images, GPU layers, GPU compositor state
- keep raw RGBA only at the output edge
- done when docs and code comments stop explaining the engine through `PixelBuffer`

#### 11D — Finish explicit ownership
- make `renderObjectId` dominant where explicit identity exists
- remove heuristic fallback matching by `color` / `cornerRadius`
- done when ownership bugs are traceable without guesswork

#### 11E — Lock the output boundary
- keep `layer-composer` raw-only and Kitty-only in the official path
- validate that the path remains `GPU target -> readback RGBA -> raw bytes -> Kitty`
- done when no internal stage reintroduces raw-byte reasoning before final presentation

---

## Branch 12 — Runtime UI clarification

### Name
`arch/12-runtime-ui-clarification`

### Scope
- mover más policy de UI arriba del core
- aclarar focus / press / drag / resize / scroll ownership
- terminar de separar engine primitives de widget semantics

### Key targets
- `focus.ts`
- `interaction.ts`
- event routing / press semantics
- scroll ownership
- overlay/dialog policy

### Exit criteria
- el core engine ya no piensa como widget runtime

---

## Branch 13 — Explicit ownership completion

### Name
`arch/13-explicit-ownership-completion`

### Scope
- terminar el retiro de heurísticas
- hacer que `renderObjectId` sea la base real del ownership
- simplificar writeback y layer ownership

### Key targets
- `packages/renderer/src/render-graph.ts`
- `packages/renderer/src/layer-planner.ts`
- `packages/renderer/src/layout-writeback.ts`

### Exit criteria
- ownership visual ya no depende principalmente de color/path/radius/text heuristics

---

## Branch 14 — Controlled optimization recovery

### Name
`arch/14-optimization-recovery`

### Scope
- reintroducir partial updates, stable reuse, move-only, etc.
- solo después de la reducción estructural

### Required conditions
- repro mínimo
- criterio de éxito
- rollback plan
- instrumentation/logging

### Exit criteria
- optimizaciones medidas y revertibles, sin volver a esconder deuda estructural

---

## Cross-cutting rules for all branches

## Required validation

Each branch must specify:

- which repros/examples validate it
- which docs are updated
- which bridges are introduced, retired or kept
- what the rollback plan is
- what ambiguity the branch removes

## Required docs to update

At minimum, each branch must update one or more of:

- `docs/tge-gpu-only-engine-architecture.md`
- `docs/tge-gpu-only-refactor-roadmap.md`
- `docs/tge-package-migration-matrix.md`

---

## Branch ownership recommendation

| Branch | Owner focus |
| --- | --- |
| 08 | architecture audit / system mapping |
| 09 | package graph honesty / bridge retirement |
| 10 | scene model and windowing ownership |
| 11 | GPU/output/compositor core reduction |
| 12 | runtime UI and component contracts |
| 13 | render ownership / IDs / heuristics removal |
| 14 | performance and optimization |

---

## Main execution document for future sessions

If a future session needs to **execute the updated plan**, the primary operational document should still be:

## `docs/tge-package-migration-matrix.md`

Why:

- it now tells you what is real,
- what is bridge,
- what should be reduced,
- what should be fused,
- and what phase/branch owns each cleanup.

The supporting documents are:

- `docs/tge-gpu-only-engine-architecture.md` — current reality + target architecture
- `docs/tge-gpu-only-refactor-roadmap.md` — reduction strategy
- `docs/tge-refactor-branch-plan.md` — branch execution order
- `docs/tge-current-state-audit-plan.md` — concrete backlog for `arch/08-current-state-audit`
- `docs/tge-current-state-audit-report.md` — actual output of the audit branch

If someone asks “what do we do NEXT?”, start with the branch plan.
If someone asks “how is the system connected TODAY?”, start with the architecture doc.
If someone asks “what exact packages/files should we reduce or retire?”, start with the migration matrix.

---

## Final recommendation

Use branches to protect the repo from a new kind of failure:

not panic-driven changes,
but **bridge-driven complacency**.

The next stage is not about adding more structure.

It is about removing the structure that only looks real from far away.
