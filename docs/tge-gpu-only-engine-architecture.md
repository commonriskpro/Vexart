# TGE GPU-Only Engine Architecture

## Goal

Rediseñar TGE/Vexart como un motor gráfico GPU-only, con dominios separados, responsabilidades claras y un core que exponga primitives de engine en vez de policy de UI.

Este documento define:

1. cómo funciona hoy el sistema,
2. qué responsabilidades están mal ubicadas,
3. cuál es la arquitectura target,
4. qué paquetes/dominios deben existir,
5. qué APIs sobreviven y cuáles deben deprecarse,
6. qué significa “done” para considerar el rediseño exitoso.

---

## Executive summary

Hoy TGE ya tiene piezas valiosas de motor gráfico real:

- terminal/caps,
- parser de input,
- adaptación a Clay para layout,
- render graph,
- backend GPU,
- compositor por capas,
- output Kitty con SHM/file/direct.

Pero el sistema sigue mezclando demasiada lógica de UI con el core del renderer. El problema dominante está en `packages/renderer/src/loop.ts`, que actúa como God Object y concentra:

- scheduling,
- layout,
- layout writeback,
- hit-testing,
- bubbling de eventos,
- focus,
- hover/active/focus state,
- layer planning,
- damage tracking,
- heurísticas de interacción,
- compositor,
- presentación final.

La dirección correcta NO es seguir parcheando bugs aislados. La dirección correcta es:

> separar engine core de runtime UI,
> hacer GPU-only el camino oficial,
> sacar el legado CPU y compat del hot path,
> y reemplazar heurísticas por identidad explícita.

---

## Design principles

## 1. GPU-only first

El core oficial del motor debe asumir:

- renderer GPU,
- composición GPU,
- output Kitty raw/shm como path principal.

Los paths CPU/universales pueden sobrevivir solo como `compat`/`legacy`, nunca como constraint de diseño del core.

## 2. Core engine without UI policy

El motor no debe decidir:

- bubbling de `onPress`,
- focus scopes,
- tab order,
- drag semantics,
- resize semantics,
- semántica Enter/Space,
- overlays de alto nivel,
- window manager behavior.

Eso vive en el runtime UI.

## 3. Explicit identity over heuristics

Nada de atar render objects por:

- overlap espacial ambiguo,
- color placeholders,
- text matching,
- orden implícito del árbol,
- path heurístico.

Todo objeto visual/layer/render op relevante necesita identidad explícita.

## 4. Correctness before optimization

Optimizaciones como:

- partial updates,
- move-only,
- stable reuse,
- retained interaction layers,

solo pueden vivir arriba de un pipeline correcto y verificable.

## 5. Domains over monolith

Cada dominio debe tener ownership claro:

- platform,
- input,
- scene,
- layout,
- render graph,
- gpu renderer,
- compositor,
- output,
- runtime UI,
- components,
- compat.

---

## Current architecture

## High-level flow today

```txt
stdin/terminal
  -> @tge/input parser
  -> @tge/renderer mount/index
  -> Solid reconciler
  -> retained TGENode tree
  -> walkTree() into Clay
  -> RenderCommand[]
  -> layer assignment + damage + render graph
  -> CPU/GPU backend
  -> layer composer / final composer
  -> Kitty / fallback output
```

## Packages involved today

### Platform / terminal
- `packages/terminal/src/index.ts`
- `packages/terminal/src/lifecycle.ts`
- `packages/terminal/src/caps.ts`
- `packages/terminal/src/detect.ts`

### Input
- `packages/input/src/parser.ts`
- `packages/input/src/mouse.ts`
- `packages/input/src/keyboard.ts`
- `packages/input/src/index.ts`

### Renderer/runtime
- `packages/renderer/src/index.ts`
- `packages/renderer/src/loop.ts`
- `packages/renderer/src/reconciler.ts`
- `packages/renderer/src/node.ts`
- `packages/renderer/src/focus.ts`
- `packages/renderer/src/interaction.ts`
- `packages/renderer/src/drag.ts`
- `packages/renderer/src/pointer.ts`
- `packages/renderer/src/scroll.ts`

### Layout
- `packages/renderer/src/clay.ts`

### Render graph and layers
- `packages/renderer/src/render-graph.ts`
- `packages/renderer/src/layers.ts`
- `packages/renderer/src/damage.ts`

### Backends and composition
- `packages/renderer/src/gpu-renderer-backend.ts`
- `packages/renderer/src/cpu-renderer-backend.ts`
- `packages/renderer/src/gpu-frame-composer.ts`
- `packages/output/src/layer-composer.ts`
- `packages/output/src/composer.ts`
- `packages/output/src/kitty.ts`
- `packages/output/src/transport-manager.ts`

### Legacy software paint
- `packages/pixel/src/index.ts`
- `packages/pixel/src/buffer.ts`
- `packages/pixel/src/composite.ts`

### UI/product layer
- `packages/components/src/*`
- `packages/components/src/windowing/*`
- `packages/void/src/*` (packaging todavía no consolidado)

---

## Architectural smells in the current design

## 1. `loop.ts` is a God Object

`packages/renderer/src/loop.ts` concentra demasiada arquitectura. Es el smell principal del repo.

Consecuencia:

- debugging difícil,
- ownership confuso,
- optimizaciones acopladas a policy,
- bugs transversales difíciles de aislar.

## 2. UI policy inside renderer core

Hoy el core del renderer participa en:

- focus registration,
- focus scopes,
- click bubbling,
- hover/active/focus semantics,
- drag interaction promotion,
- relayout inmediato post-click,
- hit-area expansion,
- scroll-aware hit-testing de widgets.

Eso es runtime UI, no graphics engine.

## 3. Heuristic layer assignment

`assignLayersSpatial()` en `loop.ts` usa heurísticas de overlap/bounds para decidir ownership visual. El repro `demo18` mostró por evidencia que esto puede contaminar un layer local con commands fullscreen.

## 4. CPU legacy contaminates the hot path

El core todavía arrastra:

- `PixelBuffer` como modelo fundacional,
- backend CPU en el mismo dominio conceptual,
- fallback composer universal,
- canvas imperative legacy,
- selectable ANSI text mezclado con renderer visual.

## 5. Kitchen-sink public surface

`packages/renderer/src/index.ts` exporta demasiadas cosas heterogéneas. Eso debilita fronteras de dominio y ownership.

## 6. Package boundaries are partially fake

Hay separación por carpetas, pero no siempre por package real. Mientras eso siga así, la arquitectura por dominios no existe de verdad.

---

## What must leave the core path

## Move to compat / legacy

- `packages/pixel/src/*`
- `packages/renderer/src/cpu-renderer-backend.ts`
- `packages/output/src/composer.ts` como default principal
- `packages/output/src/placeholder.ts`
- `packages/output/src/halfblock.ts`
- `packages/renderer/src/canvas.ts` como primitive central
- ANSI/selectable text mixed into the main renderer path

## Move to UI runtime

- focus scopes
- focus registry
- press bubbling
- Enter/Space semantics
- hover/active/focus style merge
- drag semantics
- resize semantics
- portal/overlay behavior
- widget-specific hit-testing policy

---

## Target architecture

## Layered model

```txt
Platform/Host
  -> Input
  -> Core Engine
  -> UI Runtime
  -> Components / Product Features
  -> Compat / Legacy
```

## 1. Platform / Host

### Packages
- `@tge/platform-terminal`
- `@tge/input`

### Responsibilities
- terminal lifecycle
- caps probing
- raw mode / alt screen
- resize
- byte streams to semantic input events

## 2. Core Engine

### Packages
- `@tge/scene`
- `@tge/layout-clay`
- `@tge/render-graph`
- `@tge/gpu`
- `@tge/compositor`
- `@tge/output-kitty`

### Responsibilities
- scene graph / render object model
- transforms
- layout integration
- hit-test primitives
- render graph generation
- damage tracking
- layer planning
- GPU rendering
- composition
- Kitty presentation

### Non-responsibilities
The core engine must NOT own:

- widget semantics,
- focus policy,
- bubbling,
- dialog/window semantics,
- drag naming/policy.

## 3. UI Runtime

### Package
- `@tge/runtime-ui` or `@tge/renderer-solid`

### Responsibilities
- Solid reconciler
- event routing on top of primitive hit-test
- focus model
- hover/active/focus states
- press semantics
- drag/resize abstractions
- portal/overlay roots

## 4. Components / Product layer

### Packages
- `@tge/components`
- `@tge/void`
- `@tge/windowing`
- product-specific packages later (`@tge/lightcode`, etc.)

### Responsibilities
- headless components
- design system
- desktop/window manager
- application/product conventions

## 5. Compat / Legacy

### Packages
- `@tge/compat-software`
- `@tge/output-compat`
- `@tge/compat-canvas`
- `@tge/compat-text-ansi`

### Responsibilities
- software raster fallback
- halfblock/placeholder output
- legacy imperative canvas
- ANSI/selectable text path

### Rule
Never drive the main architectural decisions of the core.

---

## Proposed package map

## Core packages

### `@tge/platform-terminal`
Owns:
- terminal creation
- lifecycle
- caps
- resize

### `@tge/input`
Owns:
- parser
- keyboard/mouse/focus/paste events

### `@tge/scene`
Owns:
- scene nodes
- render object identity
- normalized props
- handles

### `@tge/layout-clay`
Owns:
- Clay FFI
- scene -> layout translation
- layout readback contract

### `@tge/render-graph`
Owns:
- render ops
- layer/frame plan
- metadata for effects/text/images/canvas

### `@tge/text`
Owns:
- font registry
- glyph atlases
- text layout
- text GPU path

### `@tge/gpu`
Owns:
- GPU renderer backend
- retained targets
- draw passes
- readback boundary

### `@tge/compositor`
Owns:
- composition strategy
- layering
- retained surfaces
- final frame vs layered frame policy

### `@tge/output-kitty`
Owns:
- Kitty raw transmit
- placement
- patching
- SHM/file/direct transport health

## Runtime / product packages

### `@tge/renderer-solid`
Owns:
- Solid renderer integration
- mount
- runtime UI policy built on primitives

### `@tge/components`
Owns headless widgets.

### `@tge/void`
Owns the design system.

### `@tge/windowing`
Owns desktop/window manager behavior.

## Compat packages

### `@tge/compat-software`
Owns:
- `PixelBuffer`
- Zig software raster
- CPU renderer backend

### `@tge/output-compat`
Owns:
- halfblock
- placeholder

### `@tge/compat-canvas`
Owns:
- imperative canvas adapter

### `@tge/compat-text-ansi`
Owns:
- selectable ANSI text mode

---

## API strategy

## APIs that should survive

- terminal creation APIs
- input parser APIs
- `mount()`
- Solid reconciler public integration
- clean runtime hooks that truly belong to the runtime layer
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
- direct exposure of legacy software paint as part of official engine path
- widget semantics mixed into core renderer exports

---

## Required conceptual changes

## 1. Replace heuristics with explicit IDs

Introduce stable identifiers for:

- render objects,
- layers,
- effect payloads,
- images,
- canvas payloads,
- layout ownership.

Without this, the engine will keep producing ambiguous ownership bugs.

## 2. Replace widget semantics with compositing hints

Instead of compositor logic based on `interactionMode: "drag"`, move toward neutral engine hints such as:

- `compositingHint`
- `retentionHint`
- `movementHint`
- `readbackHint`

## 3. Real overlay / portal root

Portals must be structural primitives, not full-screen visual hacks.

## 4. Scroll state owned by engine, not by components through Clay internals

The runtime/components should consume normalized scroll state from the engine.

---

## Definition of Done

The redesign is only considered complete when all of these are true:

## Package boundaries
- package ownership is real, not folder-based fiction
- examples stop importing internals from `packages/*/src/*`

## GPU-only core
- the official engine path is GPU-only
- CPU/software paths are fully outside the main hot path

## Clean architecture
- `loop.ts` no longer acts as God Object
- event policy is not embedded in the core render loop
- layer assignment does not depend on fragile heuristics

## Runtime/UI separation
- focus, bubbling, drag semantics and widget policy live above the core engine

## Operational confidence
- minimal repros exist for render/compositor/layout bugs
- performance optimizations are reintroduced only behind validated tests and instrumentation

---

## Final recommendation

The project should intentionally pivot from:

> “renderer with a lot of UI logic inside”

to:

> “GPU graphics engine + UI runtime + components on top”.

That means accepting:

- a complete repo refactor,
- package boundary cleanup,
- deprecations,
- and probably breaking changes.

That is not a failure.

That is the cost of getting to a real engine architecture.
