# Architecture Audit V2 — Post Phases 1–4 Optimization Roadmap

**Fecha:** Septiembre 2026  
**Estado:** Diagnóstico completo / Listo para ejecución  
**Contexto:** Tras completar con éxito las Fases 1 a 4 de [ARCHITECTURE-AUDIT.md](ARCHITECTURE-AUDIT.md) (recorrido unificado `traverseFrame`, lectura asíncrona de GPU con doble búfer, pool de texturas, desacoplamiento 100% zero-dep de headless, pool de nodos Flexily y `TGENode` compacto de 23 propiedades), esta **Auditoría V2** identifica la siguiente ola de optimizaciones de alto impacto, poda de código muerto y mejoras de correctitud en todo el monorepo.

---

## Resumen Ejecutivo y Matriz de Hallazgos

| ID | Eje / Módulo | Hallazgo Arquitectónico | Impacto Estimado | Prioridad |
| :--- | :--- | :--- | :--- | :---: |
| **1.1** | **Native / GPU** | RegionalReadbackPool con doble búfer y zero-copy emission (Completado) | Eliminada alocación y CPU stall en daño regional | ✅ **Hecho** |
| **2.1** | **Engine Loop** | Doble recorrido DFS por frame (`walkTreeOnce` + `traverseFrame`) (Completado) | Eliminada primera pasada DFS y unificado ciclo en `traverseFrame` | ✅ **Hecho** |
| **2.2** | **Engine / Native** | MSDF Text batching con protocolo binario VXTX (Completado) | Eliminadas N llamadas FFI/draw calls; 1 FFI + 1 draw call por capa | ✅ **Hecho** |
| **3.1** | **App Framework** | Cache no acotado (`new Map`) en `class-name.ts` (`@vexart/app`) (Completado) | Eliminado memory leak con Bounded LRU Cache (2.048 entradas) | ✅ **Hecho** |
| **4.1** | **Headless** | Trampa de foco (`pushFocusScope`), descarte `Escape` y stack LIFO en `Popover` (Completado) | Aislamiento de foco, accesibilidad por teclado y dismiss coordinado LIFO | ✅ **Hecho** |
| **1.2** | **Native / Rust** | `ResourceManager` y `ImageAssetRegistry` desarmados (Completado) | Eliminadas 692 LOC; 3 mutexes reducidos a 1 (`SHARED_PAINT`) | ✅ **Hecho** |
| **1.3** | **Native / Rust** | 6 pipelines WGPU compilados en arranque que nunca se usan | 40–80 ms retraso en cold-start; ~1.200 LOC | **Media** |
| **2.3** | **Engine / FFI** | Scratch buffers zero-alloc en `msdfMeasureText` y cache ampliado (2048) (Completado) | Eliminadas 6 alocaciones por llamada y ampliado cache LRU a 2048 | ✅ **Hecho** |
| **3.2** | **App Framework** | Inversión de capas: Tier 1 `@vexart/app` importa Tier 2 `@vexart/styled` | Acoplamiento indebido de diseño | **Media** |
| **4.2** | **Headless** | `ScrollView` muta altura de layout para el thumb y colores hardcodeados | Recalculo de layout en cada tick de scroll | **Media** |
| **4.3** | **Engine Loop** | Scroll deja `layer.damageRect = null`, anulando repintado regional | Repintado de capa completa en cada scroll | **Media** |
| **3.3** | **App Framework** | `keepAliveCache` ordena arrays enteros al desalojar rutas | Alocaciones menores de GC | **Baja** |
| **5.1** | **Packaging** | Dependencia raíz redundante `marked` | Dependencia innecesaria en raíz | **Baja** |
| **5.2** | **Tooling** | Paquetes fantasma (`pretext`, `opentype.js`) en externals de bundler | Deuda de configuración en `build-dist.ts` | **Baja** |

---

## 1. Native / GPU (`native/libvexart/`)

### Hallazgo 1.1: Alocación de Buffers GPU y CPU Stall en Readback Regional (✅ Completado)
* **Prioridad:** **Alta** — *Implementado y Verificado*
* **Archivos:**
  * `native/libvexart/src/composite/readback.rs` (`RegionalReadbackPool`, `readback_region_with`, `readback_region`)
  * `native/libvexart/src/kitty/transport.rs` (`emit_region_target_with_stats`)
  * `native/libvexart/src/paint/mod.rs` (`PaintContext.regional_pool`)
  * `native/libvexart/src/composite/mod.rs` (`readback_region_rgba`)
* **Problema:**
  Mientras que el readback de pantalla completa usa búferes prealocados y doble amortiguación asíncrona, `readback_region` no tenía pool. En cada daño regional (escritura en un Input, parpadeo del cursor, hover):
  1. Ejecuta `device.create_buffer_init` para uniformes de offset (`[w, h, x, y]`).
  2. Ejecuta `device.create_buffer` para almacenamiento de salida.
  3. Ejecuta `device.create_buffer` para el staging buffer (`MAP_READ`).
  4. Crea bind group y view de textura.
  5. Tras despachar el compute shader, invoca `device.poll(Wait)`, clavando la CPU de forma síncrona.
  6. Destruye inmediatamente todos los búferes y bind groups creados.
* **Solución Arquitectónica Implementada:**
  Se implementó `RegionalReadbackPool` adjunto a `PaintContext`:
  1. Pool reutilizable con `uniform_buffer` (actualizado via `queue.write_buffer`), `storage_buffer` prealocado con crecimiento geométrico (default 1MB, 512×512×4), y doble amortiguación (`staging_buffers: [Buffer; 2]`) con ping-pong (`staging_index: 0 | 1`).
  2. Reutilización de `rec.view` preexistente en `TargetRecord` en vez de `texture.create_view`.
  3. `readback_region_with`: consume el búfer mapped directamente via closure con zero intermediarios copies en `emit_region_target_with_stats`.
  4. Reducción a 0 alocaciones por daño regional y sondeo no bloqueante `device.poll(Poll)` previo a wait.

### Hallazgo 1.2: `ResourceManager` y `ImageAssetRegistry` Desarmados (✅ Completado)
* **Prioridad:** **Media** — *Implementado y Verificado*
* **Archivos:**
  * `native/libvexart/src/resource/mod.rs:1–372`
  * `native/libvexart/src/resource/stats.rs:1–162`
  * `native/libvexart/src/image_asset.rs:20–105`
  * `native/libvexart/src/lib.rs:154, 174, 322, 1302, 1321, 1364`
* **Problema:**
  Desde DEC-014, TypeScript gestiona el ciclo de vida de los recursos. En la Fase 1 se desarmó `ResourceManager` (los desalojos son no-ops). Sin embargo, cada textura sigue adquiriendo el mutex `SHARED_RESOURCE` para métricas debug que ya calcula TS. Al liberar una imagen (`vexart_image_asset_release`), el código bloquea tres mutexes en cascada: `SHARED_PAINT`, `SHARED_RESOURCE` y `SHARED_IMAGE_ASSETS`.
* **Solución Arquitectónica:**
  Eliminar `ResourceManager` (-534 LOC) e integrar un contador atómico simple en `PaintContext`. Consolidar `ImageAssetRegistry` dentro de `PaintContext.images` mediante un contador de referencias atómico en `ImageRecord` (-158 LOC). Reducción de 3 bloqueos de mutex a 1.

### Hallazgo 1.3: Pipelines WGPU Compilados sin Uso en Arranque
* **Prioridad:** **Media**
* **Archivos:**
  * `native/libvexart/src/paint/pipelines/mod.rs:40–115`
  * `native/libvexart/src/paint/shaders/` (`circle`, `polygon`, `bezier`, `nebula`, `starfield`, `gradient_conic`)
* **Problema:**
  En `PipelineRegistry::new`, WGPU compila 21 pipelines de forma síncrona. Sin embargo, TypeScript nunca emite los comandos de dibujo 3, 4, 5, 7, 8 ni 14, ya que las primitivas de canvas se rasterizan por CPU en TS y se suben como texturas RGBA.
* **Solución Arquitectónica:**
  Eliminar los 6 pipelines y shaders no utilizados (~1.200 LOC en Rust) o diferir su compilación a un esquema perezoso (lazy) al recibir el primer comando. Ahorro de 40–80 ms en el cold start.

---

## 2. Render Loop y Pipeline en TypeScript (`packages/engine/src/loop/`)

### Hallazgo 2.1: Doble Recorrido DFS por Frame (`walkTreeOnce` + `traverseFrame`) (✅ Completado)
* **Prioridad:** **Alta** — *Implementado y Verificado*
* **Archivos:**
  * `packages/engine/src/loop/composite.ts`
  * `packages/engine/src/ffi/node.ts`
  * `packages/engine/src/ffi/flex-sync.ts`
  * `packages/engine/src/loop/image.ts`
  * `packages/engine/src/loop/walk-tree.ts` (mantenida exportación legacy para tests)
* **Problema:**
  `composite.ts` ejecutaba `walkTreeOnce(s)` para poblar listas temporales de nodos (`rectNodes`, `boxNodes`, `textNodes`) y materializar flex nodes de texto. Luego vaciaba esas listas completamente y llamaba a `traverseFrame`, que volvía a recorrer todo el árbol en pre-order, resolviendo de nuevo `resolveProps` y repoblando las mismas colecciones.
* **Solución Arquitectónica Implementada:**
  1. **Materialización Reactiva de Flex Nodes de Texto**: En `packages/engine/src/ffi/node.ts` (`ensureFlexSubtree`, `insertChild`, `insertFlexChild`) y `flex-sync.ts` (`createTextFlexNode`, `syncAllLayoutProps`, `syncLayoutProp`), los flex nodes de texto se materializan inmediatamente en el árbol retained de Flexily al insertarse o sincronizarse, garantizando que queden insertados en el orden de `_siblingIndex` con su función de medida `setMeasureFunc`. En mutaciones de texto (`reconciler.ts:replaceText` o cambios de props tipográficas), `_flexNode.markDirty()` y `markLayoutDirty()` invalidan el layout inmediatamente.
  2. **Intrinsic Sizing de Imágenes Asíncronas**: En `packages/engine/src/loop/image.ts:publish`, al completarse la decodificación de imagen, si el nodo no posee ancho/alto explícito en sus props de layout, se asignan las dimensiones intrínsecas a `_flexNode` (`setWidth`/`setHeight`), marcando `_flexNode.markDirty()` y `markLayoutDirty()` antes de renderizar el siguiente frame.
  3. **Eliminación de `walkTreeOnce` y Unificación en `traverseFrame`**: En `composite.ts`, se eliminó la pasada redundante `walkTreeOnce(s)` y el vaciado intermedio de las 7 listas acumuladoras (`s.rectNodes.length = 0`, etc.). `traverseFrame` es la única pasada DFS que recorre el árbol, resuelve props, escribe la geometría final y emite las operaciones al render graph.

### Hallazgo 2.2: MSDF Text Rendering sin Batchear (✅ Completado)
* **Prioridad:** **Alta** — *Implementado y Verificado*
* **Archivos:**
  * `native/libvexart/src/lib.rs` (`vexart_font_render_batch`)
  * `packages/engine/src/ffi/vexart-bridge.ts` (`MSDF_FONT_SYMBOLS`)
  * `packages/engine/src/ffi/gpu-renderer-backend.ts` (`flushText`, `ensureBatchCapacity`)
* **Problema:**
  En `flushText()`, el motor iteraba sobre cada texto individualmente y llamaba a `tryMsdfText`. Por cada texto en pantalla se producía 1 llamada FFI, 1 codificación UTF-8, re-parseo de métricas TTF, 3 bloqueos de mutex en Rust y **1 draw call independiente en WGPU**.
* **Solución Arquitectónica Implementada:**
  1. **Protocolo Binario VXTX**: Se definió un layout binario estructurado con cabecera de 16 bytes (`magic: 0x56585458`, `version: 1`, `item_count`, `total_bytes`) y registros compactos de 32 bytes más cadenas dinámicas UTF-8 para familias y texto.
  2. **Endpoint FFI Batched (`vexart_font_render_batch`)**: Nuevo export C nativo en `lib.rs` que adquiere los mutexes de font system, context y MSDF atlas **una sola vez por lote**.
  3. **Caché Local de Face**: Evita re-consultar `font_system` y re-parsear las métricas de la fuente TTF (`units_per_em`, `ascender`) entre textos consecutivos que comparten la misma familia, peso y estilo.
  4. **Unificación de Instancias y Draw Call**: Acumula todas las instancias `MsdfGlyphInstance` de todos los textos del lote en un único buffer y despacha un solo `dispatch_glyph_instances` a WGPU (1 draw call por atlas).
  5. **Búfer Elástico Zero-Alloc en Engine**: Prealocación de `_msdfBatchBuf` (64KB) con crecimiento elástico (2x) y serialización in-place usando `DataView` y `TextEncoder.prototype.encodeInto`, manteniendo fallback seguro a `tryMsdfText` para dylibs heredados.

### Hallazgo 2.3: Alocaciones en `msdfMeasureText` y Cache Reducido (✅ Completado)
* **Prioridad:** **Media** — *Implementado y Verificado*
* **Archivos:**
  * `packages/engine/src/ffi/msdf-font.ts` (`msdfMeasureText`)
  * `packages/engine/src/ffi/text-layout.ts` (`MAX_CACHE`, `nativeMeasure`)
* **Problema:**
  Cada fallo de caché en medición aloca 6 objetos y typed arrays (`Uint8Array`, `Float32Array`, etc.). Además, `nativeMeasureCache` tiene un tope de solo 501 entradas, lo que produce thrashing constante en logs o tablas dinámicas.
* **Solución Arquitectónica Implementada:**
  1. Reutilización de scratch buffers elásticos de módulo (`_textScratchBuf`, `_famScratchBuf`) con `TextEncoder.prototype.encodeInto(...)` y crecimiento geométrico factor 2x si `text.length * 3 > buf.byteLength`.
  2. Fast-path de retorno `{ width: 0, height: 0 }` para `text.length === 0` sin llamar a FFI.
  3. Fast-path con búfer estático pre-codificado para la familia por defecto (`"sans-serif"`).
  4. Vistas de bytes y TypedArrays reutilizables (`_outW`, `_outH`, `_outWBytes`, `_outHBytes`) pasadas a `ptr(...)` en Bun FFI, eliminando 4 alocaciones (`Float32Array` y `Uint8Array`) por llamada.
  5. Optimización de clave en `nativeMeasure` evitando `families.join(",")` cuando `families.length === 1` (caso del 99% de las llamadas).
  6. Ampliación de la capacidad de `nativeMeasureCache` de 501 a 2.048 entradas para eliminar thrashing en logs y tablas dinámicas.

---

## 3. App Framework y Compilador de Clases (`packages/app/`)

### Hallazgo 3.1: Memory Leak por Cache no Acotado en `class-name.ts` (✅ Completado)
* **Prioridad:** **Alta** — *Implementado y Verificado*
* **Archivos:**
  * `packages/app/src/styles/class-name.ts:46–63, 384–423`
  * `packages/app/src/styles/class-name.test.ts`
* **Problema:**
  `const cache = new Map<string, ClassNameResolveResult>()` almacenaba indefinidamente todas las clases generadas. En UIs con interpolación dinámica (`gap-${val}`, `w-[${px}]`), el mapa crecía sin límite y nunca se purgaba.
* **Solución Arquitectónica Implementada:**
  1. Sustitución del `Map` no acotado por un Bounded LRU Cache con capacidad máxima de 2.048 entradas (`MAX_CLASS_NAME_CACHE_SIZE = 2048`).
  2. En Cache Hit: refresco de recencia (`cache.delete(className); cache.set(className, cached);`) garantizando orden LRU genuino.
  3. En Cache Miss: desalojo preventivo de la entrada más antigua (`cache.keys().next().value`) al alcanzar la capacidad máxima previo a la inserción.
  4. Preservación del vaciado atómico en `clearClassNameCache()` y ante cambios reactivos de tema (`version !== lastThemeVersion`).
  5. Exportación de `@internal function getClassNameCacheSize(): number` y `MAX_CLASS_NAME_CACHE_SIZE` para testing, métricas y observabilidad.

### Hallazgo 3.2: Inversión de Capas entre `@vexart/app` y `@vexart/styled`
* **Prioridad:** **Media**
* **Archivos:**
  * `packages/app/src/styles/class-name.ts:3`
  * `packages/app/package.json:20`
* **Problema:**
  `@vexart/app` (Tier 1) importa tokens directamente desde `@vexart/styled` (Tier 2). Esto rompe la regla de arquitectura de capas y acopla el framework a un sistema de diseño particular.
* **Solución Arquitectónica:**
  Introducir una interfaz `ThemeTokenResolver` en el framework y permitir que el paquete styled inyecte su resolución de tokens en el arranque.

---

## 4. Componentes y Accesibilidad (`packages/headless/`)

### Hallazgo 4.1: Falta de Trampa de Foco y Tecla Escape en `Popover` (✅ Completado)
* **Prioridad:** **Alta** — *Implementado y Verificado*
* **Archivos:**
  * `packages/headless/src/overlays/overlay-stack.ts` (`pushOverlayDismiss`, `isTopOverlay`)
  * `packages/headless/src/overlays/popover.tsx` (`Popover`, `PopoverProps`, `PopoverPanel`)
  * `packages/headless/src/overlays/dialog.tsx` (`DialogRoot`)
  * `packages/headless/src/overlays/tooltip.tsx`
* **Problema:**
  `Dialog` implementa correctamente `pushFocusScope()` y escucha `Escape`. `Popover` omite ambos, permitiendo que la navegación por `Tab` se escape a elementos de fondo y no permitiendo cerrar el menú con el teclado.
* **Solución Arquitectónica Implementada:**
  1. Se introdujo una pila compartida LIFO (`overlay-stack.ts`) para coordinar el descarte de múltiples overlays jerárquicos con la tecla `Escape`.
  2. `DialogRoot` se adaptó para usar `pushOverlayDismiss` e `isTopOverlay(close)`, garantizando que si un `Popover` se abre dentro de un `Dialog`, la primera pulsación de `Escape` descarte únicamente el `Popover`.
  3. Se creó `packages/headless/src/overlays/popover.tsx` con soporte para `modal?: boolean` (por defecto `true`). Al abrirse en modo modal, captura sincrónicamente `focusedId()` y aísla la navegación mediante `pushFocusScope()`. Al cerrarse, desapila el scope y restaura el foco al disparador.
  4. Soporte para descarte por `Escape` en modo modal y no modal coordinado vía `overlay-stack`, y descarte por click en backdrop exterior `floating="root"`.

### Hallazgo 4.2: `ScrollView` Altera Alturas de Layout para Posicionar el Thumb
* **Prioridad:** **Media**
* **Archivos:**
  * `packages/headless/src/containers/scroll-view.tsx:50–57, 148`
* **Problema:**
  Para mover la barra de desplazamiento, renderiza `<box height={thumbOffset()} />`. Cada movimiento de scroll modifica la altura de este nodo, forzando un recálculo de layout en Flexily. Además, incluye colores fijos dentro del paquete headless.
* **Solución Arquitectónica:**
  Posicionar el scrollbar thumb mediante transformación geométrica (`transform: { translateY }`) para evitar recálculos de Flexily, y delegar los colores al wrapper de styled.

### Hallazgo 4.3: Inexistencia de `layer.damageRect` en Eventos de Scroll
* **Prioridad:** **Media**
* **Archivos:**
  * `packages/engine/src/loop/pipeline-scroll.ts:168–172`
  * `packages/engine/src/loop/paint.ts:697–705`
* **Problema:**
  Al scrollear, se marca la capa como sucia pero `damageRect` queda en `null`, anulando la optimización de repintado regional en `paint.ts`. Cada tick de scroll provoca un repintado completo de la capa.
* **Solución Arquitectónica:**
  Calcular el área de daño real durante el scroll para permitir el repintado regional, o habilitar blit de texturas con desplazamiento en Rust.

---

## 5. Higiene de Paquetes y Distribución

### Hallazgo 5.1: Dependencia Raíz Redundante `marked`
* **Prioridad:** **Baja**
* `marked` figura en `package.json` raíz y solo se usa en `@vexart/styled`, que ya lo tiene en su propio manifiesto.
* **Acción:** Remover de `package.json` raíz.

### Hallazgo 5.2: Paquetes Fantasma en Externals de `build-dist.ts`
* **Prioridad:** **Baja**
* `scripts/build-dist.ts` referencia `opentype.js` y `@chenglou/pretext` en el array de exclusiones externas cuando ya fueron eliminados del proyecto.
* **Acción:** Limpiar las referencias obsoletas en el script de empaquetado.
