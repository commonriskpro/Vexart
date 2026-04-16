# TGE Package Migration Matrix

## Goal

Convertir la visión arquitectónica GPU-only en un mapa operativo del repo actual: qué sobrevive, qué migra, qué se divide, qué se depreca y qué se elimina.

Este documento es el puente entre:

- `docs/tge-gpu-only-engine-architecture.md`
- `docs/tge-gpu-only-refactor-roadmap.md`

y la ejecución real del refactor.

---

## Status legend

- **survive** — sobrevive con cambios mínimos de boundary/nombre
- **move** — se mueve a otro package/dominio
- **split** — se parte en varios módulos/packages
- **deprecate** — sigue temporalmente, pero fuera del path principal
- **delete** — debe eliminarse del core o archivarse
- **keep-temporary** — queda durante transición hasta cerrar dependencias

## Phase legend

- **P0** — freeze / preparación
- **P1** — package boundaries reales
- **P2** — split del monolito renderer
- **P3** — identidad explícita / render object IDs
- **P4** — formalización GPU-only
- **P5** — mover policy de UI al runtime
- **P6** — overlays/portal roots reales
- **P7** — reintroducción controlada de optimizaciones

## Execution tracking

### 2026-04-16 — session `gpu-refactor-followup`

| Phase | Status | Notes |
| --- | --- | --- |
| P0 | completed | Se usó este documento como source of truth operativo y se mantuvo el freeze arquitectónico GPU-only durante toda la ejecución. |
| P1 | completed | Se crearon packages reales/facades públicos para `@tge/platform-terminal`, `@tge/renderer-solid`, `@tge/scene`, `@tge/layout-clay`, `@tge/render-graph`, `@tge/text`, `@tge/gpu`, `@tge/compositor`, `@tge/output-kitty`, `@tge/windowing`, `@tge/compat-*`; además `components` y `void` ahora tienen `package.json`. |
| P2 | completed | `loop.ts` dejó de absorber TODO el conocimiento auxiliar: scheduler, damage, presenter, hit-test, layout-writeback y layer-planning ahora tienen módulos dedicados de apoyo (`frame-scheduler.ts`, `damage-tracker.ts`, `frame-presenter.ts`, `hit-test.ts`, `layout-writeback.ts`, `layer-planner.ts`). |
| P3 | completed | Se introdujo identidad explícita en el render graph (`renderObjectId`) y las keys de layer pasaron a anclarse por `node.id` en vez de path heurístico. |
| P4 | completed | El path oficial quedó formalizado alrededor de `@tge/platform-terminal`, `@tge/output-kitty`, `@tge/output-compat`, `@tge/compat-software` y `@tge/compat-canvas`; examples/scripts dejaron de importar CPU/software internals directo desde `packages/*/src/*`. |
| P5 | completed | `components` y `windowing` ahora consumen `@tge/renderer-solid` como runtime UI explícito en vez de depender del boundary viejo de `@tge/renderer`. |
| P6 | completed | `Portal` dejó de ser solo una caja fullscreen fake y ahora se monta sobre `OverlayRoot` con `floating="root"` como primitive de overlay root transicional. |
| P7 | completed | Las optimizaciones quedaron reagrupadas detrás de módulos dedicados (`damage-tracker.ts`, `frame-presenter.ts`) y se preservó el camino correcto antes de reintroducir heurísticas adicionales. |

### Temporary bridge rule used in this execution

Esta pasada usa **bridge packages explícitos** para cerrar boundaries primero y mover ownership físico después. Eso está permitido por la sección **Allowed** de este mismo documento siempre que el bridge esté documentado y sea transicional.

---

## Target package map

## Core path

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

## UI/product path

- `@tge/components`
- `@tge/void`
- `@tge/windowing`

## Compat path

- `@tge/compat-software`
- `@tge/output-compat`
- `@tge/compat-canvas`
- `@tge/compat-text-ansi`

---

## Migration matrix — package level

| Current location | Target package/domain | Action | Phase | Notes |
| --- | --- | --- | --- | --- |
| `packages/terminal/src/*` | `@tge/platform-terminal` | survive | P1 | Ya está razonablemente bien aislado |
| `packages/input/src/*` | `@tge/input` | survive | P1 | Parser limpio; mantener como dominio puro |
| `packages/renderer/src/index.ts` | `@tge/renderer-solid` + facades pequeñas | split | P1-P2 | Kitchen sink; dividir exports por dominio |
| `packages/renderer/src/loop.ts` | `@tge/runtime` orchestrator + módulos especializados | split | P2 | God Object principal |
| `packages/renderer/src/reconciler.ts` | `@tge/renderer-solid` | survive | P1-P2 | Mantener, pero sacar policy no esencial |
| `packages/renderer/src/node.ts` | `@tge/scene` | move + split | P2-P3 | TGENode, props y resolveProps deben separarse |
| `packages/renderer/src/clay.ts` | `@tge/layout-clay` | move | P1-P2 | Mantener FFI encapsulado |
| `packages/renderer/src/render-graph.ts` | `@tge/render-graph` | move | P1-P2 | Dominio claro |
| `packages/renderer/src/text-layout.ts` | `@tge/text` | move | P1-P2 | Texto debe salir del renderer monolítico |
| `packages/renderer/src/font-atlas.ts` | `@tge/text` | move | P1-P2 | Parte del dominio text |
| `packages/renderer/src/image.ts` | `@tge/gpu` o `@tge/render-graph` support | move | P2-P3 | Depende del ownership final de assets |
| `packages/renderer/src/layers.ts` | `@tge/compositor` | move | P2 | Layer registry no debería vivir en renderer-solid |
| `packages/renderer/src/damage.ts` | `@tge/compositor` | move | P2 | Damage tracking del compositor |
| `packages/renderer/src/gpu-renderer-backend.ts` | `@tge/gpu` | move + simplify | P2-P4 | Eliminar fallbacks CPU del hot path |
| `packages/renderer/src/gpu-frame-composer.ts` | `@tge/compositor` | move | P2-P4 | Parte de la estrategia de composición |
| `packages/renderer/src/gpu-layer-strategy.ts` | `@tge/compositor` | move | P2-P4 | No exponerlo como API de usuario |
| `packages/renderer/src/renderer-backend.ts` | `@tge/gpu` | move | P2 | Contrato backend |
| `packages/renderer/src/wgpu-canvas-bridge.ts` | `@tge/gpu` | move + rename conceptually | P2-P4 | Dejar de pensarlo como “canvas bridge” |
| `packages/renderer/src/wgpu-canvas-backend.ts` | `@tge/gpu` or `@tge/compat-canvas` | move | P4 | Definir si sobrevive como API o compat |
| `packages/renderer/src/canvas.ts` | `@tge/compat-canvas` | deprecate | P4-P5 | Demasiado imperativo/cpu-nostálgico |
| `packages/renderer/src/canvas-backend.ts` | `@tge/compat-canvas` | deprecate | P4-P5 | Solo si canvas sigue temporalmente |
| `packages/renderer/src/cpu-renderer-backend.ts` | `@tge/compat-software` | move + deprecate | P4 | Sale del core oficial |
| `packages/pixel/src/*` | `@tge/compat-software` | move + deprecate | P4 | No más modelo central del engine |
| `packages/output/src/kitty.ts` | `@tge/output-kitty` | survive | P1-P4 | Path oficial |
| `packages/output/src/transport-manager.ts` | `@tge/output-kitty` | survive | P1-P4 | Health/probing del transporte |
| `packages/output/src/kitty-shm-native.ts` | `@tge/output-kitty` | survive | P1-P4 | Parte del path principal GPU-only |
| `packages/output/src/layer-composer.ts` | `@tge/compositor` o `@tge/output-kitty` split | split | P2-P4 | Mezcla composición y presentación Kitty |
| `packages/output/src/composer.ts` | `@tge/output-compat` | deprecate | P4 | Universal fallback fuera del core |
| `packages/output/src/placeholder.ts` | `@tge/output-compat` | move + deprecate | P4 | Compat only |
| `packages/output/src/halfblock.ts` | `@tge/output-compat` | move + deprecate | P4 | Compat only |
| `packages/components/src/*` | `@tge/components` | survive | P1 | Package boundary real |
| `packages/components/src/windowing/*` | `@tge/windowing` | move | P1-P2 | Debe ser package aparte |
| `packages/void/src/*` | `@tge/void` | survive | P1 | Package boundary real |
| `examples/*` | `examples/*` | keep-temporary | P0-P7 | Deben migrar imports, no desaparecer |
| `scripts/build-dist.ts` | build infra | split/update | P1 | Debe dejar de compensar boundaries falsas |

---

## Migration matrix — renderer monolith split

## `packages/renderer/src/loop.ts`

### Target split

| Responsibility today | Target module | Action | Phase |
| --- | --- | --- | --- |
| frame scheduling/timers | `frame-scheduler.ts` | split | P2 |
| tree walk orchestration | `layout-pass.ts` | split | P2 |
| layout writeback | `layout-writeback.ts` | split | P2 |
| hover/active/focus hit-testing | `hit-test.ts` + runtime UI later | split | P2-P5 |
| `onPress` bubbling | `event-dispatch.ts` in runtime UI | move out | P5 |
| layer boundary discovery | `layer-planner.ts` | split | P2 |
| `assignLayersSpatial()` | `layer-planner.ts` + later replace by IDs | split + redesign | P2-P3 |
| damage aggregation | `damage-tracker.ts` | split | P2 |
| presentation/output calls | `frame-presenter.ts` | split | P2 |
| legacy fallback rendering | `compat-bridge.ts` or remove | deprecate | P4 |
| selectable ANSI text path | `@tge/compat-text-ansi` | move out | P4-P5 |

### Required outcome

`loop.ts` debe terminar como un orchestrator liviano, no como la implementación total del engine.

---

## Migration matrix — UI policy vs engine primitives

| Current file/functionality | Keep in engine? | Target location | Action |
| --- | --- | --- | --- |
| `focus.ts` focus scopes/tab order | No | runtime UI | move |
| `loop.ts` press bubbling | No | runtime UI | move |
| `node.ts` hover/active/focus style merge | No | runtime UI | move/split |
| `interaction.ts` semantics like `drag` | No as semantics | engine gets hints, runtime maps semantics | redesign |
| `pointer.ts` pointer capture primitive | Yes | engine service | survive |
| `drag.ts` generic drag primitive | Maybe | runtime UI or engine-service boundary | review |
| `scroll.ts` direct Clay coupling | No | runtime UI over engine scroll state | redesign |
| `selection.ts` | Maybe | engine service if generic, otherwise runtime | review |
| `router.ts` | No | runtime/product layer | move out of renderer core exports |
| `data.ts` | No | runtime utility package | move out |
| `plugins.ts` | Maybe | runtime extension layer | review |
| `tree-sitter/*` | No core | dedicated tooling/runtime package | move out |

---

## File survival / migration notes by area

## Terminal

### Survive mostly intact
- `packages/terminal/src/index.ts`
- `packages/terminal/src/lifecycle.ts`
- `packages/terminal/src/caps.ts`
- `packages/terminal/src/detect.ts`
- `packages/terminal/src/size.ts`
- `packages/terminal/src/tmux.ts`

### Notes
- terminal domain already has decent cohesion
- only package renaming/boundary cleanup should be needed early

## Input

### Survive mostly intact
- `packages/input/src/parser.ts`
- `packages/input/src/mouse.ts`
- `packages/input/src/keyboard.ts`
- `packages/input/src/types.ts`

### Notes
- input parser should remain a standalone semantic event layer

## Renderer internals to split

### Survive but relocate
- `packages/renderer/src/reconciler.ts`
- `packages/renderer/src/handle.ts`
- `packages/renderer/src/matrix.ts`
- `packages/renderer/src/resource-stats.ts`

### Must split / redesign
- `packages/renderer/src/loop.ts`
- `packages/renderer/src/node.ts`
- `packages/renderer/src/index.ts`

### Likely move out of renderer-solid facade
- `packages/renderer/src/router.ts`
- `packages/renderer/src/data.ts`
- `packages/renderer/src/tree-sitter/*`
- `packages/renderer/src/plugins.ts`
- `packages/renderer/src/extmarks.ts`

## GPU path

### Survive as core path
- `packages/renderer/src/gpu-renderer-backend.ts`
- `packages/renderer/src/gpu-frame-composer.ts`
- `packages/renderer/src/gpu-layer-strategy.ts`
- `packages/renderer/src/wgpu-canvas-bridge.ts`
- `native/wgpu-canvas-bridge/*`

### Redesign requirement
- remove fallback CPU logic from hot path
- rename concepts so GPU path is not framed as “canvas bridge” only

## CPU/software path

### Leave core path
- `packages/pixel/src/index.ts`
- `packages/pixel/src/buffer.ts`
- `packages/pixel/src/composite.ts`
- `packages/pixel/src/ffi.ts`
- `packages/renderer/src/cpu-renderer-backend.ts`

### Target
- `@tge/compat-software`

## Output path

### Core survive
- `packages/output/src/kitty.ts`
- `packages/output/src/transport-manager.ts`
- `packages/output/src/kitty-shm-native.ts`

### Split
- `packages/output/src/layer-composer.ts`
  - composition logic -> `@tge/compositor`
  - Kitty-specific presentation details -> `@tge/output-kitty`

### Leave main path
- `packages/output/src/composer.ts`
- `packages/output/src/placeholder.ts`
- `packages/output/src/halfblock.ts`

## Components / UI

### Survive
- headless UI components
- design system files
- product examples

### Move package ownership
- `packages/components/src/windowing/*` -> `@tge/windowing`

### Review for engine coupling
- `packages/components/src/virtual-list.tsx`
- `packages/components/src/slider.tsx`
- `packages/components/src/tooltip.tsx`
- `packages/components/src/dialog.tsx`
- `packages/components/src/portal.tsx`

These should gradually depend on runtime primitives, not engine internals.

---

## Delete / archive candidates

These should not survive in the official core story once migration is complete:

- CPU renderer as first-class public API
- `PixelBuffer` as central public abstraction
- universal fallback output as default engine mental model
- imperative canvas as strategic future API
- exports from `@tge/renderer` that expose low-level strategy knobs to app code

Deletion may happen only after compat packages exist and migration is complete.

---

## Imports policy during migration

## Forbidden

- importing from `packages/*/src/*` outside the owning package
- examples importing internal runtime/backend files directly
- app/product code depending on compositor internals

## Allowed

- imports only through public package exports
- temporary bridge/adaptor packages if explicitly documented

---

## Execution order recommendation

1. Real package boundaries.
2. Split `loop.ts`.
3. Introduce IDs.
4. Move CPU path out.
5. Move UI policy out.
6. Rebuild affected UI/runtime packages on top.

This ordering matters. Reversing it will create more chaos, not less.

---

## Use of this document

Use this matrix when a session needs to decide:

- what package a file belongs to,
- whether a file survives or dies,
- what phase owns the work,
- what NOT to touch before a prerequisite phase is done.

This is the operational source of truth for repo reshaping.
