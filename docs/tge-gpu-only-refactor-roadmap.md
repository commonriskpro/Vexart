# TGE GPU-Only Refactor Roadmap

## Goal

Ejecutar un refactor completo del repo para convertir TGE/Vexart en un stack GPU-only, con dominios separados, package boundaries reales y un core limpio antes de seguir agregando features.

Este roadmap prioriza:

- claridad arquitectónica,
- separación de responsabilidades,
- rendimiento,
- correctitud,
- eliminación del legado CPU del hot path.

---

## Strategic decision

## We are optimizing for:

- GPU-only main path
- explicit ownership by domain
- correctness before optimizations
- clean packages before new features
- renderer core as engine, not as UI framework

## We are NOT optimizing for:

- preserving every compatibility path in the core
- zero breaking changes
- shipping more widgets before cleaning architecture
- universal fallback as a first-class architectural constraint

---

## Migration rules

## Rule 1
No new product/UI features until architecture phases 0-3 are complete.

## Rule 2
Every refactor step must move code toward stronger domain boundaries.

## Rule 3
Every optimization must be reintroduced only after the simpler correct path is proven.

## Rule 4
Every package must have a real public API boundary.

## Rule 5
Minimal repros like `examples/window-drag-repro.tsx` stay as official engine diagnostics.

---

## Phase 0 — Freeze and declare the pivot

### Objective

Congelar el crecimiento accidental y declarar GPU-only + clean split como la dirección oficial.

### Actions

- freeze de features nuevas de UI/windowing
- freeze de optimizaciones nuevas en renderer/compositor
- declarar `demo18` como repro oficial para bugs del engine
- documentar que CPU/fallback dejan de ser la dirección oficial del core

### Exit criteria

- el equipo acepta que la prioridad ya no es feature velocity sino refactor estructural
- hay una narrativa única de arquitectura target

---

## Phase 1 — Establish real package boundaries

### Objective

Transformar la estructura por carpetas en arquitectura real por paquetes.

### Actions

- crear `package.json` reales por dominio
- prohibir imports directos a `packages/*/src/*`
- definir exports map limpios por paquete
- mover compat/legacy a namespaces explícitos
- separar `components`, `void`, `windowing` y core runtime en packages reales

### Expected package families

- `@tge/platform-terminal`
- `@tge/input`
- `@tge/scene`
- `@tge/layout-clay`
- `@tge/render-graph`
- `@tge/text`
- `@tge/gpu`
- `@tge/compositor`
- `@tge/output-kitty`
- `@tge/renderer-solid`
- `@tge/components`
- `@tge/void`
- `@tge/windowing`
- `@tge/compat-*`

### Risks

- build scripts actuales dependen de supuestos monolíticos
- examples pueden romperse al primer corte de boundaries

### Exit criteria

- ningún example importa internals desde `src/`
- cada dominio tiene owner y frontera pública clara

---

## Phase 2 — Split `loop.ts`

### Objective

Eliminar el God Object principal.

### Extract into dedicated modules

- `frame-scheduler.ts`
- `layout-pass.ts`
- `layout-writeback.ts`
- `hit-test.ts`
- `event-dispatch.ts`
- `layer-planner.ts`
- `damage-tracker.ts`
- `frame-presenter.ts`

### Key rule

No cambiar comportamiento profundo todavía si no hace falta. Primero separar responsabilidades.

### Risks

- refactor grande con mucho surface area
- tests actuales pueden no cubrir suficientes invariantes

### Exit criteria

- `loop.ts` queda como orchestrator del frame, no como implementación total del sistema

---

## Phase 3 — Introduce explicit render identity

### Objective

Eliminar heurísticas frágiles y ownership ambiguo.

### Actions

- introducir `RenderObjectId`
- introducir identidad explícita para layers
- indexar render graph queues por ID, no por heurísticas
- asociar layout writeback por IDs explícitos cuando sea posible
- revisar `assignLayersSpatial()` y reemplazar overlap heurístico por ownership explícito donde aplique

### Problems this phase must solve

- contaminación de layers por commands fullscreen
- matching de images/canvas/effects por placeholders ambiguos
- writeback geométrico aproximado

### Exit criteria

- el renderer puede rastrear ownership visual sin apoyarse en color/path/text matching como base principal

---

## Phase 4 — Formalize GPU-only core

### Objective

Hacer que el camino principal del engine sea inequívocamente GPU-only.

### Actions

- mover `packages/pixel/src/*` a `compat-software`
- mover `cpu-renderer-backend.ts` fuera del core principal
- quitar el CPU path del hot path del renderer principal
- sacar output universal del renderer core
- dejar `output-kitty` como target principal de performance

### Important note

GPU-only no elimina todo readback CPU en el boundary final si Kitty lo requiere, pero sí elimina el software raster como modelo principal del sistema.

### Exit criteria

- el core principal ya no depende conceptualmente de `PixelBuffer` ni del CPU renderer para su operación oficial

---

## Phase 5 — Move UI policy to runtime layer

### Objective

Sacar lógica de framework/UI del core gráfico.

### Move out of core

- focus scopes
- focus registration policy
- tab order
- `onPress` bubbling
- Enter/Space semantics
- hover/active/focus merge
- drag/resize semantics
- dialog/window/portal policy

### Keep in core only as primitives

- primitive hit-test
- pointer capture primitive
- primitive event stream
- geometry/layout data

### Exit criteria

- el core engine ya no “piensa” como widget runtime

---

## Phase 6 — Real overlay and portal roots

### Objective

Dejar de resolver overlays estructuralmente con hacks visuales.

### Actions

- introducir overlay tree o portal root real
- separar parent lógico de parent visual cuando haga falta
- rediseñar `Portal`, `Dialog`, `Popover`, `Tooltip`, `Windowing` encima de esa primitive

### Exit criteria

- overlays y ventanas dejan de depender de cajas full-screen fake como mecanismo estructural

---

## Phase 7 — Reintroduce optimizations carefully

### Objective

Recuperar performance sobre una base correcta.

### Candidate optimizations to reintroduce

- partial updates
- move-only placement refresh
- stable layer reuse
- regional repaint
- retained interaction layers
- GPU readback minimization

### Condition

Cada optimización vuelve solo si tiene:

- repro mínimo,
- criterio de éxito,
- rollback claro,
- instrumentation/logging.

### Exit criteria

- performance improvements without correctness regressions in minimal repros and product demos

---

## Public API strategy during migration

## APIs that must remain stable as long as possible

- terminal creation
- input parser
- `mount()`
- core runtime hooks that truly belong to the runtime layer
- components headless already adopted by examples/apps

## APIs that should be deprecated early

- direct public CPU backend usage
- `PixelBuffer` as central user-facing abstraction
- imperative canvas path as strategic drawing API
- strategy tuning APIs exposed from renderer internals

## APIs that should move packages

- focus and interaction helpers
- runtime UI hooks
- windowing helpers
- compat output/backends

---

## Risks

## 1. Text system complexity

Text is usually the hardest part to move cleanly to GPU-only without hidden software assumptions.

## 2. Backdrop/transform/readback edge cases

Visual effects can force ugly readback paths if not redesigned carefully.

## 3. Packaging churn

A clean package split will break scripts/examples until boundaries are stabilized.

## 4. API churn fatigue

A real cleanup means deprecations and breaking changes. This must be accepted explicitly.

## 5. False halfway states

The worst possible outcome is a repo that is “half GPU-only, half legacy” for too long. That must be actively avoided.

---

## Success metrics

## Structural

- `loop.ts` no longer acts as a monolith
- package boundaries are real and enforced
- compat code is isolated from the official hot path

## Technical

- minimal engine repros can be debugged by following explicit IDs and stage ownership
- no heuristic ownership bugs remain in core layer assignment
- compositor strategy becomes understandable and testable

## Product-level

- windowing, overlays and complex UI can be built on top of the runtime without forcing engine hacks
- new features stop requiring “special cases” in the renderer core

---

## Recommended order of work today

1. Approve target architecture and package map.
2. Stop new feature work.
3. Create real package boundaries.
4. Split `loop.ts`.
5. Introduce explicit IDs.
6. Move CPU/compat out of the core path.
7. Move UI policy to runtime.
8. Rebuild windowing and overlays on the cleaned runtime.

---

## Final recommendation

Do not treat this as a small cleanup.

Treat it as a controlled architectural pivot.

The right success condition is not:

> “we fixed the drag bug”

The right success condition is:

> “the engine became understandable, separable and GPU-first enough that bugs like this stop being mysterious”.
