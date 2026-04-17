# TGE Current-State Audit Plan

## Goal

Convertir `arch/08-current-state-audit` en una branch ejecutable, con backlog concreto por área/archivo, criterios de salida y orden de reducción posterior.

Esta branch NO existe para mover código todavía.
Existe para producir un mapa confiable del sistema real y dejar listos los insumos que necesita `arch/09-bridge-retirement`.

---

## Why this branch exists

Después de la primera bridge pass, el repo quedó mejor, pero también más peligroso en un sentido:

- hay más package names,
- más facades,
- más aliases,
- y más riesgo de confundir boundary pública con ownership real.

Si no auditamos eso ahora, el siguiente refactor va a apoyarse sobre supuestos falsos.

---

## Required outputs of `arch/08-current-state-audit`

La branch se considera útil solo si produce TODOS estos outputs:

1. **Hot-path map**
   - cuál es el camino real desde `mount()` hasta output final

2. **Bridge inventory**
   - qué packages son reales
   - cuáles son facades temporales
   - cuáles ya deberían retirarse

3. **Compat leakage map**
   - dónde sigue entrando CPU/software/imperative canvas al path oficial

4. **Duplicate abstraction map**
   - especialmente scene/runtime/windowing

5. **Ownership conflict list**
   - qué package dice ser dueño de algo pero no lo es físicamente

6. **Reduction handoff**
   - orden concreto de retiro de bridges para `arch/09+`

### Implemented artifact
- `docs/tge-current-state-audit-report.md`

---

## Scope

## In scope

- `packages/renderer/src/index.ts`
- `packages/renderer/src/loop.ts`
- `packages/renderer/src/node.ts`
- `packages/renderer/src/clay.ts`
- `packages/renderer/src/render-graph.ts`
- `packages/renderer/src/layout-writeback.ts`
- `packages/renderer/src/layer-planner.ts`
- `packages/renderer/src/gpu-renderer-backend.ts`
- `packages/renderer/src/gpu-frame-composer.ts`
- `packages/renderer/src/gpu-layer-strategy.ts`
- `packages/renderer/src/gpu-raster-staging.ts`
- `packages/renderer/src/surface-transform-staging.ts`
- `packages/renderer/src/render-surface.ts`
- `packages/renderer/src/canvas.ts`
- `packages/renderer/src/wgpu-canvas-backend.ts`
- `packages/renderer/src/focus.ts`
- `packages/renderer/src/interaction.ts`
- `packages/renderer/src/drag.ts`
- `packages/renderer/src/scroll.ts`
- `packages/output/src/kitty.ts`
- `packages/output/src/layer-composer.ts`
- `packages/pixel/src/*`
- `packages/components/src/scene-canvas.tsx`
- `packages/windowing/src/*`
- all bridge package `src/index.ts`
- `scripts/build-dist.ts`
- official repros / harnesses

## Out of scope

- feature implementation
- optimization tuning
- deleting code during the audit unless it is trivially dead and explicitly proven
- redesigning APIs before the map is complete

---

## Audit backlog by area

## A1 — Runtime hot path map

### Objective
Describir el camino real del frame y del input.

### Files
- `packages/renderer/src/index.ts`
- `packages/renderer/src/loop.ts`
- `packages/renderer/src/reconciler.ts`
- `packages/renderer/src/node.ts`
- `packages/renderer/src/clay.ts`

### Questions to answer
- dónde entra el input real
- dónde nace el retained tree
- dónde se traduce a `RenderCommand[]`
- dónde se decide presentation/output
- dónde siguen viviendo políticas de runtime UI

### Deliverable
- diagrama textual del hot path real
- lista de módulos obligatorios vs accesorios

---

## A2 — Render ownership audit

### Objective
Medir cuánto ownership explícito existe de verdad y cuánto fallback heurístico queda vivo.

### Files
- `packages/renderer/src/render-graph.ts`
- `packages/renderer/src/layout-writeback.ts`
- `packages/renderer/src/layer-planner.ts`
- `packages/renderer/src/loop.ts`

### Questions to answer
- qué usa `renderObjectId` hoy
- dónde sigue existiendo fallback por color/radius/path/order
- qué writeback sigue siendo aproximado
- qué invariantes necesita `arch/13-explicit-ownership-completion`

### Deliverable
- tabla: explicit ownership vs heuristic fallback
- lista priorizada de heurísticas a retirar

---

## A3 — GPU/compositor/output audit

### Objective
Entender quién compone realmente y dónde sigue entrando compat/fallback.

### Files
- `packages/renderer/src/gpu-renderer-backend.ts`
- `packages/renderer/src/gpu-frame-composer.ts`
- `packages/renderer/src/gpu-layer-strategy.ts`
- `packages/output/src/layer-composer.ts`
- `packages/output/src/kitty.ts`
- `packages/pixel/src/*`
- `packages/renderer/src/gpu-raster-staging.ts`
- `packages/renderer/src/surface-transform-staging.ts`

### Questions to answer
- quién es el compositor real hoy
- cuándo entra `PixelBuffer`
- cuándo se cae a compat/fallback
- qué parte del path oficial todavía piensa en software raster

### Deliverable
- mapa de ownership compositor/output
- compat leakage report

---

## A4 — Bridge package truth table

### Objective
Clasificar todos los `packages/*/src/index.ts` como:

- real owner,
- public bridge,
- low-value bridge,
- retire candidate.

### Files
- `packages/platform-terminal/src/index.ts`
- `packages/renderer-solid/src/index.ts`
- `packages/scene/src/index.ts`
- `packages/layout-clay/src/index.ts`
- `packages/render-graph/src/index.ts`
- `packages/text/src/index.ts`
- `packages/gpu/src/index.ts`
- `packages/compositor/src/index.ts`
- `packages/output-kitty/src/index.ts`
- `packages/compat-canvas/src/index.ts`
- `packages/compat-text-ansi/src/index.ts`
- `packages/windowing/src/index.ts`

### Questions to answer
- cuál bridge existe por compat pública legítima
- cuál bridge solo agrega ruido interno
- cuál todavía no puede morir porque tapa ownership no resuelto

### Deliverable
- truth table bridge-by-bridge
- candidate order for retirement

---

## A5 — Scene/runtime duplication audit

### Objective
Respaldar la decisión de conservar `SceneCanvas` y retirar `RetainedGraph`.

### Files
- `packages/components/src/scene-canvas.tsx`
- `examples/lightcode.tsx`
- `examples/lightcode-gpu-first.tsx`
- `examples/window-drag-repro.tsx`
- profiling harnesses `examples/lightcode-gpu-first*.tsx`

### Questions to answer
- qué problemas resuelve cada abstracción
- qué APIs se superponen
- cuál está más alineada con el target GPU-first
- cuál sería el costo de convergencia en cada dirección

### Deliverable
- recommendation memo confirming `SceneCanvas` as the surviving retained scene API

---

## A6 — Windowing ownership audit

### Objective
Dejar lista la migración física a `packages/windowing/src/*`.

### Files
- `packages/windowing/src/index.ts`
- `packages/windowing/src/*`
- `packages/components/src/index.ts`

### Questions to answer
- qué exports pertenecen realmente a windowing
- qué dependencias arrastran desde components/runtime
- qué tests y examples validan la migración física

### Deliverable
- move plan file-by-file
- dependency checklist before moving

---

## A7 — Runtime UI boundary audit

### Objective
Detectar qué parts siguen demasiado abajo en renderer core.

### Files
- `packages/renderer/src/focus.ts`
- `packages/renderer/src/interaction.ts`
- `packages/renderer/src/drag.ts`
- `packages/renderer/src/scroll.ts`
- `packages/renderer/src/selection.ts`
- `packages/components/src/*` consumers of `@tge/renderer-solid`

### Questions to answer
- qué es primitive de engine
- qué es policy de runtime
- qué debería subir a `renderer-solid`/runtime-ui
- qué debería quedarse como primitive neutral

### Deliverable
- engine primitive vs runtime semantics matrix

---

## Exact branch deliverables

`arch/08-current-state-audit` should leave behind:

1. updated docs
2. one explicit truth table of bridges
3. one explicit hot-path map
4. one explicit list of duplicate abstractions
5. one explicit compat leakage report
6. one prioritized handoff section for `arch/09` to `arch/14`

If those artifacts are missing, the branch is incomplete.

---

## Validation

### Required repros/examples to use as references
- `examples/window-drag-repro.tsx`
- `examples/lightcode-gpu-first.tsx`
- `examples/lightcode-gpu-first-gpu-profile-shm-cadence-dirty.tsx`
- `examples/lightcode-gpu-first-nodes-profile.tsx`

### Required docs to update
- `docs/tge-gpu-only-engine-architecture.md`
- `docs/tge-gpu-only-refactor-roadmap.md`
- `docs/tge-package-migration-matrix.md`
- `docs/tge-refactor-branch-plan.md`
- this document
- `docs/tge-current-state-audit-report.md`

---

## Decision rules for bridge retirement

A bridge survives to `arch/09+` only if at least one of these is true:

1. it is needed as a stable public API boundary,
2. it isolates external consumers from a still-moving owner,
3. removing it immediately would block a higher-priority cleanup.

If none of those are true, it is a retirement candidate.

---

## Recommended bridge retirement order after the audit

This is the **default order**, pending audit confirmation.

### Wave 1 — easiest/lowest-value bridges
- `@tge/compat-text-ansi`
- `@tge/compositor`
- `@tge/render-graph`

### Wave 2 — bridges that must become real or die
- `@tge/scene`
- `@tge/text`
- `@tge/windowing`

### Wave 3 — bridges likely worth keeping publicly, but not internally
- `@tge/renderer-solid`
- `@tge/platform-terminal`
- `@tge/output-kitty`
- `@tge/output-compat`
- `@tge/compat-software`
- `@tge/compat-canvas`
- `@tge/gpu`

### Rule
Wave 3 is not “safe forever”.
It only means those bridges currently have higher compatibility value.

---

## Exit criteria

`arch/08-current-state-audit` is done when:

- the repo has a trustworthy current-state map,
- the bridge inventory is explicit,
- the next branch can start deleting ambiguity instead of rediscovering it,
- and the team can explain the engine without hand-waving package names.

---

## Final recommendation

Do not use this branch to look busy.

Use it to get brutally honest.

If this audit is weak, every branch after it will be slower, noisier and more political.

If this audit is strong, the next reductions become mechanical.
