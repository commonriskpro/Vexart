# Vexart — Architectural Optimization Audit

**Date**: 2026-09-17
**Status**: Diagnosis complete — pending design decisions before implementation.

---

## Executive Summary

Vexart arrastra una arquitectura de **modo inmediato** debajo de un motor
**retenido**. El layout adapter reconstruye 35 arrays paralelos cada frame
sobre un árbol Flexily que ya está retenido en `TGENode._flexNode`. La
frontera TS↔Rust tiene estado duplicado muerto en producción, pipelines WGPU
compilados pero nunca usados, y el transport hace un-premultiply en CPU
pixel-por-pixel. La capa de componentes tiene violaciones de capas, código
duplicado, y theme reactivity rota.

---

## 1. Problema Central: Layout Adapter Inmediato sobre Árbol Retenido

### Pipeline actual (8 pasadas por frame)

```
walkTree DFS → poblar 35 arrays → endLayout (Flexily solve + stacking sort + emitNode)
  → writeLayoutBack (copiar coords a TGENode.layout)
    → writeLayoutBack pass 2 (transforms)
      → applyScrollOffsets
        → assignLayersSpatial
          → buildRenderGraphFrame (re-wrappear RenderCommand → RenderGraphOp)
```

### Costo

Para una escena de 500 nodos, miles de objetos intermedios (`RenderCommand`,
`RenderGraphOp`, `RenderBounds`) son alocados y descartados cada frame. Las
coordenadas se copian **3 veces** (Flexily → `_layoutMap` →
`TGENode.layout` → `RenderCommand`).

### Oportunidad

Después de `calculateRoots()`, una sola pasada pre-order sobre `TGENode`
puede computar offsets absolutos, escribir `node.layout` directo, y emitir
render ops — sin arrays intermedios, sin `_layoutMap`, sin `writeLayoutBack`.

### Archivos afectados

- `packages/engine/src/loop/layout-adapter.ts` — 35 arrays paralelos, `_layoutMap`, `_childrenByParent`
- `packages/engine/src/loop/walk-tree.ts` — DFS completo cada frame
- `packages/engine/src/loop/layout.ts` — `writeLayoutBack()` redundante
- `packages/engine/src/ffi/render-graph.ts` — wrapping `RenderCommand → RenderGraphOp`

---

## 2. Frontera Nativa: Estado Muerto en Rust

### Registries duplicados (dead en producción)

| Registry Rust | LOC | Estado en producción |
| :--- | :--- | :--- |
| `LayerRegistry` (`layer.rs`) | 380 | Dead — `vexart_layer_upsert` nunca se llama en prod |
| `ImageAssetRegistry` (`image_asset.rs`) | 190 | Duplica `imageCache` de TS |
| `ResourceManager` (`resource/mod.rs`) | 360 | Evicta assets sin notificar a TS → rompe handles |

### Pipelines WGPU no usados (9 de 23)

Compilados sincrónicamente al startup (WGSL → MSL en macOS/Metal) pero nunca
referenciados por TypeScript:

`bezier`, `circle`, `filter`, `gradient_conic`, `nebula`, `polygon`,
`rect`, `rect_corners`, `starfield`

### FFI exports muertos (12 funciones)

**Completamente dead (0 callers):**
- `vexart_composite_readback_region_rgba`
- `vexart_kitty_emit_layer_target`
- `vexart_kitty_emit_region_target`
- `vexart_kitty_emit_placeholder_frame`

**Dead en producción (test-only o unreachable):**
- `vexart_layer_upsert`
- `vexart_layer_reuse`
- `vexart_layer_present_dirty`
- `vexart_layer_remove` (permanent no-op)
- `vexart_kitty_shm_prepare` (legacy pathway)

### Context handle cosmético

`vexart_context_create` siempre escribe `*out_ctx = 1`. Todos los FFI
exports reciben `_ctx: u64` y lo ignoran con `let _ = ctx;`.

### JSON serialization overhead

Font families se pasan como `JSON.stringify([family])` en TS y se parsean con
`serde_json::from_str` en Rust en **cada text render y measure call**.
Contribuye ~150KB al binary por `serde_json`.

---

## 3. Transport: CPU Bottleneck por Frame

### Readback sincrónico

`pollster::block_on` en `readback.rs:136` bloquea el thread hasta que la GPU
termine el mapping. No hay double-buffered async readback.

### Un-premultiply en CPU

Recorre **cada pixel** en software (`(channel * 255 + alpha / 2) / alpha`).
~8–15ms para un frame 4K en un solo core. Niega las ventajas de GPU rendering.

### SHM allocation per-frame

Cada frame: `shm_open` → `ftruncate` → `mmap` → `memcpy` → `munmap`,
con polling a 4ms desde JS.

`ShmRingBuffer` (225 LOC, 3 slots de reciclaje) ya existe en Rust pero el
engine lo bypasea completamente.

---

## 4. Reactivity: Granular Signals → Global Invalidation

SolidJS actualiza UN nodo, pero el engine responde con trabajo global:

- **`bumpNodeMutation`**: sube hasta la raíz reseteando contadores de
  estabilidad en cada ancestor.
- **`markLayoutDirty()`**: flag global → full tree walk de **todos** los nodos.
- **`syncVisualPropsToCommands`**: en cambios visuales (sin layout), escanea
  **todos los commands** del frame, no solo los dirty.

No hay invalidación de subtree ni dirty-set visual.

### Oportunidad

- Flexily ya trackea `isDirty()` por nodo — permitiría skip de subtrees limpios.
- Un `Set<nodeId>` de nodos dirty permitiría O(K) vs O(N) en visual updates.

---

## 5. Scene Graph: TGENode Overhead

### Shape masivo

Cada `TGENode` tiene **43 campos** incluyendo 4 `Float64Array` para
transforms, bags de image/canvas, caches visuales, y heurísticas de
compositor. ~400–600 bytes por nodo en V8 heap antes de children arrays.

### Flexily subtree churn

Detach (`<Show>`, `<For>` toggle) destruye el subárbol Flexily completo.
Re-attach crea nuevas instancias y ejecuta `syncAllLayoutProps` recursivo.

### Oportunidad

- Split en core slim + lazy bags para transforms/canvas/image.
- Pool de Flexily nodes desattachados para evitar re-creación.

---

## 6. Image & Canvas Resource Flow

### Canvas: software rasterization en JS

Canvas commands se rasterizan pixel-por-pixel en JavaScript (`blend()` en
`canvas-rasterizer.ts`) y luego se suben como RGBA texture vía FFI.

### CPU nearest-neighbor scaling

`image.ts:50-70` hace scaling en CPU con `Uint8Array`, cacheado en LRU de
256 entries. WGPU tiene hardware samplers (`FilterMode::Nearest`) que hacen
esto gratis en GPU.

### 3-stage GPU copy para imágenes redondeadas

`renderStyledImage` en `gpu-renderer-backend.ts`:
1. Alloca target A → render transform → copy a image B → destroy A
2. Si radius > 0 → mask rounded rect → image C → destroy B
3. Render C al target final → destroy C al final del frame

**3 texturas + 3 shader passes** por cada imagen con border-radius.

### Oportunidad

Shader unificado que combine transform + object-fit + corner-radius en un solo
pass.

---

## 7. Headless/Styled: Violaciones de Capas

### Styling dentro de Headless

| Componente | Violación |
| :--- | :--- |
| `Code` (`display/code.tsx`) | `CODE_DEFAULTS` con colores hardcodeados, rendering de boxes |
| `Markdown` (`display/markdown.tsx`) | 15 colores de theme, import de `marked`, AST-to-JSX completo |
| `Diff` (`navigation/diff.tsx`) | `DIFF_DEFAULTS` con colores, container rendering |
| `Input` / `Textarea` | `InputTheme` / `TextareaTheme` con borders, backgrounds, cursor styling |
| `ScrollView` | Scrollbar colors hardcodeados |

`CHAR_WIDTH = 9` y `LINE_HEIGHT = 17` hardcodeados en 5 archivos.

### Headless en Styled

`VoidDropdownMenu` (241 LOC) implementa toda la interacción (context, state,
keyboard nav, outside-click) dentro de `@vexart/styled`.

### Theme reactivity rota

`VoidCode`, `VoidMarkdown`, `VoidDiff`, `VoidInput`, `VoidTextarea`
pasan theme tokens como objetos literales evaluados una vez al mount. No se
actualizan con `setTheme()`.

### Código duplicado

- 7 componentes reimplementan keyboard navigation (Up/Down/j/k/Home/End).
- `Checkbox` y `Switch` son clones idénticos de 51 líneas.
- `Input` y `Textarea` duplican ~600 líneas de text editing engine.
- Outside-click duplicado en `Combobox`, `Popover`, `DropdownMenu`; falta en `Select`.

### Wrapper boxes redundantes

`Button`, `Checkbox`, `Switch` wrappean en `<box width="fit" height="fit">`
innecesario, duplicando nodos en el scene graph.

### Reactivity bugs

- `List` y `Table`: stale `<For>` index closures (`const i = index()` capturado estáticamente).
- `Select` y `Combobox`: `.map()` sin `<For>` re-crea JSX completo en cada cambio.
- `createForm`: 3N+1 signals y `JSON.stringify` diffing por campo.

---

## 8. Dead Code y Waste Menor

### walk-tree.ts

- `parseAlignX`/`parseAlignY` calculados en cada box node, nunca leídos.
- `parseDirection` propagado en recursión sin uso.
- `layout.setId()` con FNV-1a string hashing — legacy de floating resolution.

### assign-layers.ts

- `findLayerBoundaries()` (50 LOC) nunca llamado en producción.
- `resolveNodeByPath()` — legacy fallback superseded por `nodeRefById`.

### Exports legacy

- `SIZING`, `DIRECTION`, `ALIGN_X`, `ALIGN_Y` enums numéricos del layout engine pre-Flexily.
- `RGBA` utility class redundante con `parseColor`.
- `createSlot`, `createSlotRegistry` — plugin mechanism con zero adopción.
- Prefijos "TGE" (`TGEProps`, `TGENodeKind`) en la API pública.

### Dependencias

- `opentype.js` en root `devDependencies` — completamente sin uso.
- `zod` en root — solo usado por `internal-devtools`.
- `marked` declarado en root Y en `@vexart/headless`.
- `@vexart/app` declara peer dep en `@vexart/headless` pero nunca lo importa.
- `.dependency-cruiser.cjs` tiene 5 reglas para `@vexart/primitives` (retirado).

### Rust dead code

- `text/glyph_info.rs` (215 LOC) — parser de métricas MSDF pre-baked, sin callers.
- `font/cache.rs` (255 LOC) — disk cache MSDF con serialización binaria, sin callers.
- `ShmRingBuffer` (225 LOC) — ring buffer funcional pero bypaseado.

---

## 9. Cross-Package Dependency Issues

### Internal API leaks

- `packages/styled/src/theme/theme.ts:23`: importa `bumpThemeEpoch` de `@vexart/engine/internal`
- `packages/app/src/styles/class-name.ts:2`: importa `setClassNameResolver` de `@vexart/engine/internal`

### CLI Babel plugin inconsistency

`packages/app/src/cli/solid-plugin.ts:23` usa `moduleName: "vexart/engine"`
en vez de `"vexart/jsx-runtime"` — viola el invariante del reconciler singleton.

### Misplaced utility class compiler

`class-name.ts` (403 LOC) vive en `@vexart/app` (Tier 1) pero compila
tokens de `@vexart/styled` (Tier 2). Inversión arquitectónica.

---

## Roadmap de Optimización

### Fase 1: Limpieza (bajo riesgo, impacto inmediato)

- [ ] Podar dead code en `walk-tree.ts` (ax/ay, parseDirection, setId)
- [ ] Eliminar 12 FFI exports muertos y 9 pipelines no usados
- [ ] Remover registries Rust muertos (LayerRegistry, ResourceManager, ImageAssetRegistry dead paths)
- [ ] Remover `serde_json` → pasar font family como string prefijado
- [ ] Limpiar deps: sacar `opentype.js`, mover `zod` a `internal-devtools`
- [ ] Corregir `solid-plugin.ts` CLI (`"vexart/engine"` → `"vexart/jsx-runtime"`)
- [ ] Limpiar `.dependency-cruiser.cjs` (reglas de `@vexart/primitives`)
- [ ] Remover phantom peer dep `@vexart/headless` de `@vexart/app`

### Fase 2: Pipeline Unificado (impacto grande, cambio estructural)

- [ ] Unificar `RenderCommand` y `RenderGraphOp` en una sola estructura
- [ ] Reemplazar los 35 arrays paralelos con traversal directo sobre `TGENode`
- [ ] Escribir layout directo: `_flexNode` → `node.layout` → render ops en una pasada
- [ ] Implementar dirty-set visual para `syncVisualPropsToCommands`
- [ ] Subtree layout invalidation usando Flexily `isDirty()`

### Fase 3: Transport & GPU (impacto en performance real)

- [ ] GPU un-premultiply (shader pass en composite, no CPU loop)
- [ ] Activar `ShmRingBuffer` existente en vez de alloc per-frame
- [x] Texture pooling para offscreen targets
- [x] Shader unificado para imagen con radius (eliminar 3-stage copy)
- [x] Usar GPU sampler para scaling en vez de CPU nearest-neighbor
- [ ] Async double-buffered readback (eliminar `pollster::block_on` stall)

### Fase 4: Componentes (calidad y correctitud)

- [ ] Mover `Code`/`Markdown`/`Diff` a `@vexart/styled`; headless queda zero-dep
- [ ] Extraer `useListNavigation` hook compartido (7 componentes)
- [ ] Mover `DropdownMenu` headless a `@vexart/headless`
- [ ] Arreglar theme reactivity en styled wrappers (getters reactivos)
- [ ] Eliminar wrapper boxes redundantes en Button/Checkbox/Switch
- [ ] Fix stale `<For>` index closures en List/Table
- [ ] Unificar text editing engine entre Input y Textarea
- [ ] Agregar outside-click a Select
- [ ] Slim TGENode shape (core + lazy bags)
- [ ] Pool de Flexily nodes desattachados

---

## Decisiones Pendientes

Antes de implementar se necesitan estas decisiones arquitectónicas:

1. **Fase 2 — Layout adapter**: ¿Reescritura completa de `layout-adapter.ts`
   y `walk-tree.ts`, o approach incremental (primero unificar
   RenderCommand/RenderGraphOp, después atacar layout adapter)?

2. **Rust registries muertos**: ¿Eliminar directamente LayerRegistry,
   ResourceManager e ImageAssetRegistry dead paths (~930 LOC), o marcar
   deprecated para fase posterior?

3. **Mover Code/Markdown/Diff a styled**: Esto es un breaking change en
   `@vexart/headless`. ¿Aceptable ahora, o re-exportar con deprecation
   warning?
