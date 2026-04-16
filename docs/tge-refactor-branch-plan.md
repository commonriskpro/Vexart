# TGE Refactor Branch Plan

## Goal

Ejecutar el refactor GPU-only del repo con branches claras, scope acotado por fase y menor riesgo de mezclar workstreams incompatibles.

Este documento define:

- la estrategia de branches,
- qué entra en cada una,
- el orden recomendado,
- qué depende de qué,
- cómo saber si una branch está lista para merge.

---

## Branching principles

## 1. One architectural objective per branch

No mezclar:

- package split,
- loop split,
- IDs,
- GPU-only cleanup,
- UI runtime extraction

en una sola branch monstruosa.

## 2. Merge by enabling the next branch

Cada branch debe desbloquear la siguiente, no intentar cerrar todo el rediseño de una sola vez.

## 3. Keep compatibility bridges temporary and explicit

Si una branch necesita adapters temporales, se documentan y se eliminan en la fase siguiente.

## 4. Repros are mandatory

`examples/window-drag-repro.tsx` debe seguir funcionando y usarse como criterio de validación del engine.

---

## Suggested branch sequence

## Branch 00 — Architecture freeze

### Name
`arch/00-freeze-gpu-only-direction`

### Scope
- docs only
- freeze statement
- architectural decisions
- acceptance criteria for the pivot

### Inputs
- `docs/tge-gpu-only-engine-architecture.md`
- `docs/tge-gpu-only-refactor-roadmap.md`
- `docs/tge-package-migration-matrix.md`

### Exit criteria
- the project formally accepts GPU-only + domain split as the direction

---

## Branch 01 — Real package boundaries

### Name
`arch/01-package-boundaries`

### Scope
- add/normalize `package.json` per real package
- exports map cleanup
- stop importing `packages/*/src/*` directly
- update build scripts to respect package boundaries

### Key targets
- `packages/components`
- `packages/void`
- `packages/renderer`
- output/input/terminal package boundaries
- scripts and examples imports

### Risks
- examples and dist build may break temporarily

### Exit criteria
- examples and app code import through public package boundaries only

---

## Branch 02 — Split renderer monolith

### Name
`arch/02-split-loop-monolith`

### Scope
- split `packages/renderer/src/loop.ts`
- extract scheduler/layout/layer/damage/presenter modules
- no major behavior redesign yet

### Key targets
- `loop.ts`
- new modules:
  - `frame-scheduler.ts`
  - `layout-pass.ts`
  - `layout-writeback.ts`
  - `layer-planner.ts`
  - `damage-tracker.ts`
  - `frame-presenter.ts`

### Exit criteria
- `loop.ts` is orchestration-only or close to it

---

## Branch 03 — Explicit render identity

### Name
`arch/03-render-object-ids`

### Scope
- introduce explicit IDs for render objects/layers
- remove heuristic ownership assumptions where possible
- redesign `assignLayersSpatial()` and related ownership rules

### Key targets
- render object identity
- layer planner
- render graph queues
- layout writeback ownership

### Exit criteria
- ownership does not depend primarily on overlap/path/color/text heuristics

---

## Branch 04 — GPU-only core cleanup

### Name
`arch/04-gpu-only-core`

### Scope
- remove CPU path from official hot path
- move software raster pieces to compat packages
- redefine official output path around Kitty raw/shm

### Key targets
- `packages/pixel/src/*`
- `cpu-renderer-backend.ts`
- `output/composer.ts`
- fallback output backends

### Exit criteria
- official engine path is unambiguously GPU-only

---

## Branch 05 — UI runtime extraction

### Name
`arch/05-runtime-ui-extraction`

### Scope
- move focus, bubbling, interaction policy and widget semantics above the core
- leave only primitives in the engine

### Key targets
- `focus.ts`
- event routing / press semantics
- hover/active/focus merge
- drag/resize semantics policy
- portal/overlay semantics preparation

### Exit criteria
- core engine no longer behaves like a widget runtime

---

## Branch 06 — Overlay and portal roots

### Name
`arch/06-overlay-roots`

### Scope
- introduce real overlay root / portal tree
- refactor dialog/tooltip/popover/windowing to use it

### Exit criteria
- overlays no longer depend on structural hacks

---

## Branch 07 — Controlled optimization reintroduction

### Name
`arch/07-optimization-recovery`

### Scope
- reintroduce partial updates, stable reuse, move-only, etc.
- only after correctness is reestablished on the new architecture

### Exit criteria
- optimizations exist with repros, metrics and rollback strategy

---

## Cross-cutting rules for all branches

## Required validation

Each branch must specify:

- which repros/examples validate it
- which docs are updated
- which temporary adapters are introduced
- what the rollback plan is

## Required docs to update

At minimum, each branch must update one or more of:

- `docs/tge-gpu-only-engine-architecture.md`
- `docs/tge-gpu-only-refactor-roadmap.md`
- `docs/tge-package-migration-matrix.md`

---

## Branch ownership recommendation

| Branch | Owner focus |
| --- | --- |
| 00 | architecture / decision-making |
| 01 | repo/package/build system |
| 02 | renderer core refactor |
| 03 | scene/layout/render-graph ownership model |
| 04 | GPU/output/compositor core |
| 05 | runtime UI and component contracts |
| 06 | overlays/windowing integration |
| 07 | performance and optimization |

---

## Main execution document for future sessions

If a future session needs to **execute the plan**, the primary operational document should be:

## `docs/tge-package-migration-matrix.md`

Why:

- it tells you what survives,
- what moves,
- what dies,
- what phase owns each area,
- and prevents accidental work on the wrong layer.

The supporting documents are:

- `docs/tge-gpu-only-engine-architecture.md` — the why and target shape
- `docs/tge-gpu-only-refactor-roadmap.md` — the phase strategy
- `docs/tge-refactor-branch-plan.md` — the branch execution order

If someone asks “what do we do NEXT?”, start with the branch plan.
If someone asks “why are we doing this?”, start with the architecture doc.
If someone asks “what exact files/packages are in scope?”, start with the migration matrix.

---

## Final recommendation

Use branches to protect the architecture from panic-driven changes.

The biggest risk now is not slowness.
The biggest risk is mixing package split, engine redesign, UI extraction and optimizations in the same branch and losing the plot.

This branch plan exists to prevent exactly that.
