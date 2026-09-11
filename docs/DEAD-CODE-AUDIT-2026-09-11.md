# Auditoría Integral de Código Muerto, Redundante y Vestigios de Migración — Vexart Engine

> **Documento de Auditoría y Saneamiento Arquitectónico**  
> **Ámbito:** `native/libvexart` (Rust/WGPU), `packages/engine` (TS/Bun), `packages/headless`, `packages/styled`, `packages/app`.  
> **Fecha:** 11 de Septiembre de 2026  
> **Estado:** Auditoría Finalizada / Pendiente de Autorización de Saneamiento  

---

## 1. Resumen Ejecutivo y Disciplina Arquitectónica

El código muerto y las abstracciones zombis no son meras líneas sin ejecutar: **representan quiebres en los modelos mentales, asimetrías en el ciclo de vida de recursos y desincronización entre subsistemas**. 

En Vexart, la frontera nativa FFI (`bun:ffi` ↔ `libvexart` C ABI) y el render graph de TypeScript requieren un estricto respeto a los contratos de propiedad (DEC-014). Tras analizar en profundidad el grafo de dependencias, el flujo de llamadas y los históricos de migración, se identificaron cuatro fuentes primarias de degradación arquitectónica:

1. **Cicatrices de Reversión (Scene Graph de Rust):** Tras revertir el scene graph nativo retenido (`reverted-phase-3b-native-scene-graph`), quedaron parámetros ficticios (`_scene: u64`) pasando identificadores basura (`0n`) por el puente FFI en cada frame para recursos que residen en singletons globales de proceso.
2. **Abstracciones Fantasma de Solo-Escritura (Canvas Display Lists):** El árbol de renderizado serializa y envía display lists de canvas a Rust cada frame, pero Rust jamás los dibuja ni ejecuta (el rasterizado se realiza en JS mediante bitmaps planos). Esto quema ciclos de CPU en serialización FFI y reserva presupuestos de memoria falsos en el `ResourceManager` nativo.
3. **Fósiles de Migraciones Previas (Atlas PNG vs MSDF Dinámico):** La decisión DEC-008 reemplazó los atlas PNG estáticos por renderizado MSDF dinámico. Sin embargo, todo el pipeline viejo (`vexart_text_*`) quedó intacto en Rust y expuesto en el contrato de TypeScript.
4. **Quiebre de Simetría en Ciclo de Vida (Circuit-Breaker de Presentación):** El mecanismo de circuit-breaker para fallos nativos desactiva la GPU por 300 frames, pero la función encargada de decrementar el cooldown (`tickNativePresentationRecovery`) jamás fue conectada al bucle de animación, dejando al sistema permanentemente degradado ante un error transitorio.

---

## 2. Inventario Exhaustivo de Hallazgos y Causa Raíz

### 1. Módulo Rust de Estrategia de Frame no utilizado
- **Ubicación:** `native/libvexart/src/frame.rs:1-340` y `native/libvexart/src/lib.rs:10`
- **Símbolos:** `NativeFrameStrategy`, `NativeFramePlanInput`, `NativeFramePlan`, `choose_frame_strategy`.
- **Causa Raíz y Mecanismo:** En etapas iniciales se modeló la planificación de frames en Rust expuesta como `pub mod frame;`. No obstante, jamás se expuso por FFI ni se consume en ningún módulo interno de Rust. El motor resuelve la planificación de capas y frames íntegramente en TypeScript a través de `nativeChooseFrameStrategy` (`packages/engine/src/ffi/gpu-layer-strategy.ts:145`).
- **Clasificación:** Código Muerto / Módulo Huérfano.
- **Impacto:** 340 líneas de Rust compiladas que inflan el binario cdylib y el tiempo de compilación sin ningún valor en runtime.

---

### 2. Exports Nativos FFI Muertos: `vexart_frame_present_native` y `vexart_paint_present`
- **Ubicación:** `native/libvexart/src/lib.rs:1194-1201` y `1205-1211`
- **Símbolos:** `vexart_frame_present_native`, `vexart_paint_present`.
- **Causa Raíz y Mecanismo:** Son wrappers superfluos de `vexart_kitty_emit_frame_with_stats` y `vexart_kitty_emit_frame`. No están declarados en `VEXART_SYMBOLS` (`packages/engine/src/ffi/vexart-bridge.ts`) ni son invocados en ninguna parte del runtime de TypeScript o Rust.
- **Clasificación:** Export FFI Huérfano.
- **Impacto:** Símbolos nativos muertos exportados en la tabla de símbolos de la biblioteca compartida `libvexart`.

---

### 3. Función FFI No-Op Muerta: `vexart_context_resize`
- **Ubicación:** `native/libvexart/src/lib.rs:289-294` y `packages/engine/src/ffi/vexart-bridge.ts:43`
- **Símbolos:** `vexart_context_resize`.
- **Causa Raíz y Mecanismo:** Planeada originalmente para notificar a Rust los cambios de tamaño de terminal. En la arquitectura activa, los composite targets se dimensionan bajo demanda en `gpu-renderer-backend.ts`, convirtiendo la función en Rust en un no-op que ignora los argumentos (`let _ = (ctx, width, height); OK`). El binding existe en TypeScript pero ningún código lo invoca.
- **Clasificación:** FFI No-Op Muerto.
- **Impacto:** Firma FFI muerta y binding innecesario en la tabla de símbolos.

---

### 4. Módulo de Renderizado de Texto Muerto: `native/libvexart/src/text/render.rs`
- **Ubicación:** `native/libvexart/src/text/render.rs:1-171` y `native/libvexart/src/text/mod.rs`
- **Símbolos:** `batch_glyphs`, `glyph_ndc`.
- **Causa Raíz y Mecanismo:** Contiene únicamente dos funciones: `batch_glyphs` (líneas 17-41) y `glyph_ndc` (líneas 54-90). Ninguna es llamada en Rust ni por FFI. El renderizado de texto activo se despacha directamente vía `text::dispatch_glyph_instances` (`native/libvexart/src/text/mod.rs:424`) invocando `pctx.render_msdf_glyphs`.
- **Clasificación:** Código Muerto.
- **Impacto:** 171 líneas de código y tests unitarios completamente inalcanzables.

---

### 5. Exports FFI de Atlas PNG Pre-bakeado Obsoletos (`vexart_text_*`)
- **Ubicación:** 
  - `native/libvexart/src/lib.rs:1020-1133` (`vexart_text_load_atlas`, `vexart_text_dispatch`, `vexart_text_measure`)
  - `native/libvexart/src/text/mod.rs:328-422, 674-699` (`load_atlas`, `dispatch`, `measure`)
  - `native/libvexart/src/text/atlas.rs:57-118` (`AtlasRegistry::load_atlas`)
  - `packages/engine/src/ffi/vexart-bridge.ts:73-75`
- **Símbolos:** `vexart_text_load_atlas`, `vexart_text_dispatch`, `vexart_text_measure`.
- **Causa Raíz y Mecanismo:** En Fase 2 el texto dependía de atlas PNG estáticos y métricas JSON. La decisión arquitectónica DEC-008 migró el sistema a renderizado dinámico MSDF (`vexart_font_init`, `vexart_font_query`, `vexart_font_render_text`, `vexart_font_measure`). Los símbolos viejos quedaron como un fósil en el bridge sin que TypeScript los llame jamás.
- **Clasificación:** Resto Histórico / FFI Obsoleto.
- **Impacto:** Más de 250 líneas de código muerto (decodificación de PNG, parseo de JSON en Rust) y bindings zombis en el contrato del engine.

---

### 6. Parámetro Fantasma del Scene Graph de Rust: `_scene: u64`
- **Ubicación:** 
  - `native/libvexart/src/lib.rs:1778, 1796, 1822, 1861, 1879`
  - `packages/engine/src/ffi/native-image-assets.ts:49, 60`
  - `packages/engine/src/ffi/native-canvas-display-list.ts:25, 45, 56`
- **Símbolos:** Parámetro `_scene: u64` en `vexart_image_asset_touch`, `vexart_image_asset_release`, `vexart_canvas_display_list_*`.
- **Causa Raíz y Mecanismo:** Al revertir el scene graph nativo de Rust (`reverted-phase-3b-native-scene-graph`), se preservó el parámetro `_scene: u64` por supuesta compatibilidad ABI. Tanto Rust como TypeScript lo ignoran (TS pasa `0n`). Además, `_ctx: u64` también se ignora porque los recursos residen en singletons globales (`SHARED_IMAGE_ASSETS`, `SHARED_CANVAS_DISPLAY_LISTS`).
- **Clasificación:** Resto Histórico / Firma FFI Asimétrica.
- **Impacto:** Firmas FFI engañosas que pasan argumentos nulos en cada interacción.

---

### 7. Sistema de Canvas Display List en Rust de Solo-Escritura (Write-Only)
- **Ubicación:** 
  - `native/libvexart/src/canvas_display_list.rs:1-163`
  - `native/libvexart/src/lib.rs:180-188, 260-264, 1820-1888`
  - `packages/engine/src/ffi/native-canvas-display-list.ts:1-66`
  - `packages/engine/src/loop/walk-tree.ts:380-398`
- **Símbolos:** `CanvasDisplayListRegistry`, `SHARED_CANVAS_DISPLAY_LISTS`, `nativeCanvasDisplayListUpdate`.
- **Causa Raíz y Mecanismo:** En `walk-tree.ts`, para cada nodo `<canvas>`, se serializan sus comandos y se envían a Rust con `nativeCanvasDisplayListUpdate`. Rust los almacena en `CanvasDisplayListRegistry` y computa presupuestos en `ResourceManager`. Pero **Rust jamás los ejecuta ni los dibuja**: el renderizado de canvas se resolvió directamente en JS en `gpu-renderer-backend.ts:738-744` mediante `rasterizeCanvasCommands` (subiendo un bitmap RGBA plano). El display list nativo es un ciclo de CPU y memoria completamente desperdiciado.
- **Clasificación:** Código Redundante / Abstracción Incompleta.
- **Impacto:** Serialización inútil y llamadas FFI por frame en cada `<canvas>`, además de tracking de memoria fantasma en Rust.

---

### 8. Export FFI Muerto: `vexart_layer_mark_dirty`
- **Ubicación:** `native/libvexart/src/lib.rs:1421-1431` y `packages/engine/src/ffi/vexart-bridge.ts:102`
- **Símbolos:** `vexart_layer_mark_dirty`.
- **Causa Raíz y Mecanismo:** En la arquitectura actual, el cálculo de dirty regions y acumulación de daño se hace 100% en TypeScript (`packages/engine/src/ffi/layers.ts`). Al presentar una capa sucia se llama directamente a `vexart_layer_present_dirty`. `vexart_layer_mark_dirty` nunca es invocado.
- **Clasificación:** FFI Huérfano.
- **Impacto:** Export nativo y binding TypeScript muertos.

---

### 9. Exports FFI Muertos: `vexart_kitty_emit_frame` y `vexart_kitty_emit_region`
- **Ubicación:** `packages/engine/src/ffi/vexart-bridge.ts:78, 92`
- **Símbolos:** `vexart_kitty_emit_frame`, `vexart_kitty_emit_region`.
- **Causa Raíz y Mecanismo:** Existen pares duplicados de emisión: las versiones que reciben buffers de CPU vs las versiones con estadísticas/targets GPU (`vexart_kitty_emit_frame_with_stats` y `vexart_kitty_emit_region_target`). El pipeline de presentación usa exclusivamente las segundas. Las primeras nunca se invocan en el engine.
- **Clasificación:** Código Redundante / FFI Huérfano.
- **Impacto:** Contaminación del catálogo de símbolos FFI.

---

### 10. Funciones Desconectadas en `native-presentation-ops.ts`
- **Ubicación:** `packages/engine/src/ffi/native-presentation-ops.ts:134-172` y `177-216`
- **Símbolos:** `nativeEmitLayerTarget`, `nativeEmitRegionTarget`.
- **Causa Raíz y Mecanismo:** Se implementaron los wrappers para targets GPU de capas y regiones, pero jamás se conectaron al loop de pintura (`packages/engine/src/loop/paint.ts:41`), el cual solo importa `nativeEmitLayer` y `nativeDeleteLayer`. Tienen cero callers en todo el proyecto.
- **Clasificación:** Código Muerto.
- **Impacto:** Código muerto de presentación nativa.

---

### 11. Función Huérfana y Quiebre de Invariante de Recuperación: `tickNativePresentationRecovery`
- **Ubicación:** `packages/engine/src/ffi/native-presentation-ops.ts:46-53`
- **Símbolos:** `tickNativePresentationRecovery`.
- **Causa Raíz y Mecanismo:** Se implementó un circuit-breaker: tras 3 fallos consecutivos en FFI, se deshabilita la presentación nativa por 300 frames. `tickNativePresentationRecovery()` debía decrementar ese cooldown frame a frame. Pero **nadie llama a esta función en el render loop**. Si el circuit-breaker salta por un error transitorio, la presentación nativa queda apagada para siempre en ese proceso.
- **Clasificación:** Invariante Roto / Bug Arquitectónico de Ciclo de Vida.
- **Impacto:** Falta de auto-recuperación ante errores transitorios de renderizado.

---

### 12. Helpers Muertos en `native-presentation-stats.ts`
- **Ubicación:** `packages/engine/src/ffi/native-presentation-stats.ts:149-151` y `157-159`
- **Símbolos:** `isNativeStatsValid`, `isNativeStatsFallback`.
- **Causa Raíz y Mecanismo:** Funciones auxiliares internas para verificar flags de estadísticas nativas. No están exportadas en `public.ts` y ningún archivo ni test las consume.
- **Clasificación:** Código Muerto.
- **Impacto:** Helpers inalcanzables.

---

### 13. Buffer Prototipo y Encoders Muertos en `vexart-buffer.ts`
- **Ubicación:** `packages/engine/src/ffi/vexart-buffer.ts:24, 27, 43-48, 65-74`
- **Símbolos:** `graphBuffer`, `graphView`, `writeHeader`, `writeCommandPrefix`.
- **Causa Raíz y Mecanismo:** Un prototipo estático de 64KB para encolar comandos a `vexart_paint_dispatch`. En producción, el renderer dinámico (`gpu-composite-ops.ts`) usa buffers dinámicos con `ensureBatchBuf` y escribe los headers inline. Estas funciones y el buffer estático solo se referencian en su propio test unitario.
- **Clasificación:** Código Muerto / Prototipo Abandonado.
- **Impacto:** 64KB retenidos estáticamente y lógica redundante.

---

### 14. Función Duplicada `writeHeader` en `vexart-functions.ts`
- **Ubicación:** `packages/engine/src/ffi/vexart-functions.ts:81-86` y `packages/engine/src/public.ts:222`
- **Símbolos:** `writeHeader`.
- **Causa Raíz y Mecanismo:** Duplicación exacta de la lógica de cabecera de buffer pero recibiendo un `DataView`. No se usa en ningún lugar del pipeline de renderizado activo.
- **Clasificación:** Código Redundante.
- **Impacto:** Duplicación de lógica y contaminación de API pública.

---

### 15. Función Huérfana `measureTextHeight`
- **Ubicación:** `packages/engine/src/ffi/text-layout.ts:101-109`
- **Símbolos:** `measureTextHeight`.
- **Causa Raíz y Mecanismo:** Wrapper de `layoutText(text, fontId, maxWidth, lineHeight).height`. No se exporta en `public.ts` y nadie la invoca (el resto del código accede directo al resultado de layout o usa `measureForLayout`).
- **Clasificación:** Código Muerto.
- **Impacto:** Función huérfana inalcanzable.

---

### 16. Funciones Idénticas Duplicadas: `clearSelection` y `resetSelection`
- **Ubicación:** `packages/engine/src/reconciler/selection.ts:29, 37` y `public.ts:345, 347`
- **Símbolos:** `clearSelection`, `resetSelection`.
- **Causa Raíz y Mecanismo:** Ambas ejecutan exactamente `setSelectionSignal(null)`. Ambas se exportan públicamente. Distintos call sites usan una u otra indistintamente.
- **Clasificación:** Código Redundante.
- **Impacto:** Polución de la API pública y confusión de contrato.

---

### 17. Mini-Router Muerto en Engine
- **Ubicación:** `packages/engine/src/reconciler/router.ts:1-94` y `public.ts:325-341`
- **Símbolos:** `useRouter`, `createRouter`, `createNavigationStack`, y tipos asociados.
- **Causa Raíz y Mecanismo:** Un router primitivo dentro del engine que quedó abandonado cuando se creó el router real y completo en `@vexart/app` (`packages/app/src/router/router.tsx`). Tiene cero tests y ningún consumidor. Además genera colisión de nombres exportando `useRouter` desde dos paquetes distintos.
- **Clasificación:** Código Redundante / Violación de Responsabilidad de Módulo.
- **Impacto:** 94 líneas de lógica redundante en el core engine.

---

### 18. Hooks de Datos Huérfanos: `useQuery` y `useMutation`
- **Ubicación:** `packages/engine/src/reconciler/data.ts:1-184` y `public.ts:227-229`
- **Símbolos:** `useQuery`, `useMutation`.
- **Causa Raíz y Mecanismo:** 184 líneas de hooks de fetching/mutación sin un solo test unitario en el repositorio y sin ningún componente (ni headless, ni styled, ni showcases) que los use.
- **Clasificación:** Abstracción Huérfana.
- **Impacto:** Deuda técnica y complejidad no verificada en `@vexart/engine`.

---

### 19. Documentación Fantasma de Primitivas Inexistentes (`Span`, `RichText`, `WrapRow`)
- **Ubicación:** `AGENTS.md:75`, `packages/app/src/components/primitives.tsx` y manuales.
- **Símbolos:** `<Span>`, `<RichText>`, `<WrapRow>`.
- **Causa Raíz y Mecanismo:** Cuando se eliminó `@vexart/primitives`, la documentación afirmó que estas funciones pasaban a `@vexart/app`. En la práctica fueron eliminadas por completo y en `app` solo existen `<Box>` y `<Text>`.
- **Clasificación:** Documentación Errónea.
- **Impacto:** Confusión para agentes y desarrolladores que intentan importar primitivas inexistentes.

---

## 3. Plan de Acción Detallado (Fidelidad 1:1)

- [ ] **1. Purgar `native/libvexart/src/frame.rs`**: Eliminar el archivo y remover `pub mod frame;` de `lib.rs`.
- [ ] **2. Purgar exports FFI nativos muertos en `native/libvexart/src/lib.rs`**: Eliminar `vexart_frame_present_native` y `vexart_paint_present`.
- [ ] **3. Purgar `vexart_context_resize`**: Eliminar la función no-op en Rust y su binding en `packages/engine/src/ffi/vexart-bridge.ts`.
- [ ] **4. Purgar `native/libvexart/src/text/render.rs`**: Eliminar el archivo y su declaración en `native/libvexart/src/text/mod.rs`.
- [x] **5. Eliminar pipeline legacy de atlas PNG (`vexart_text_*`)**: Purgar `vexart_text_load_atlas`, `vexart_text_dispatch`, `vexart_text_measure` de Rust (`lib.rs`, `text/mod.rs`, `text/atlas.rs`) y de `vexart-bridge.ts`.
- [ ] **6. Sanear firmas FFI eliminando el parámetro zombi `_scene: u64`**: Actualizar las funciones de image asset y display list en Rust y TypeScript para no pasar handles ficticios.
- [x] **7. Desmantelar el display list nativo de canvas de solo-escritura**: Quitar la serialización y llamadas FFI en `packages/engine/src/loop/walk-tree.ts`, y eliminar `CanvasDisplayListRegistry` en Rust.
- [x] **8. Eliminar export FFI `vexart_layer_mark_dirty`**: Purgar de `lib.rs` y de `vexart-bridge.ts`.
- [x] **9. Limpiar exports muertos `vexart_kitty_emit_frame` y `vexart_kitty_emit_region`**: Purgar sus bindings en `vexart-bridge.ts`.
- [x] **10. Conectar o purgar `nativeEmitLayerTarget` y `nativeEmitRegionTarget`**: Eliminar las funciones no referenciadas en `native-presentation-ops.ts`.
- [x] **11. Restaurar invariante del circuit-breaker**: Conectar `tickNativePresentationRecovery()` dentro del tick de frame en `packages/engine/src/loop/loop.ts` para garantizar auto-recuperación simétrica.
- [x] **12. Eliminar helpers muertos `isNativeStatsValid` e `isNativeStatsFallback`**: Purgar de `native-presentation-stats.ts`.
- [x] **13. Eliminar buffer estático de 64KB y writers redundantes en `vexart-buffer.ts`**: Remover `graphBuffer`, `graphView`, `writeHeader`, `writeCommandPrefix` y actualizar sus tests.
- [x] **14. Eliminar `writeHeader` duplicado en `vexart-functions.ts`**: Remover la función y su re-export en `public.ts`.
- [x] **15. Eliminar `measureTextHeight`**: Remover de `text-layout.ts`.
- [x] **16. Consolidar `clearSelection` y `resetSelection`**: Mantener una única función canónica en `selection.ts` y unificar en `public.ts`.
- [ ] **17. Purgar mini-router obsoleto de engine**: Eliminar `packages/engine/src/reconciler/router.ts` y sus exports de `public.ts` (el router canónico es `@vexart/app`).
- [ ] **18. Purgar hooks huérfanos `useQuery`/`useMutation`**: Eliminar `packages/engine/src/reconciler/data.ts` y sus exports de `public.ts`.
- [ ] **19. Corregir documentación fantasma**: Actualizar `AGENTS.md` y manuales eliminando las referencias a `Span`, `RichText` y `WrapRow`.
