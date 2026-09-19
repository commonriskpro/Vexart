# Architecture Audit V2 — Post Phases 1–4 Optimization Roadmap

**Fecha:** Septiembre 2026  
**Estado:** Diagnóstico completo / Listo para ejecución  
**Contexto:** Tras completar con éxito las Fases 1 a 4 de [ARCHITECTURE-AUDIT.md](ARCHITECTURE-AUDIT.md) (recorrido unificado `traverseFrame`, lectura asíncrona de GPU con doble búfer, pool de texturas, desacoplamiento 100% zero-dep de headless, pool de nodos Flexily y `TGENode` compacto de 23 propiedades), esta **Auditoría V2** identifica la siguiente ola de optimizaciones de alto impacto, poda de código muerto y mejoras de correctitud en todo el monorepo.

---

## Resumen Ejecutivo y Matriz de Hallazgos

| ID | Eje / Módulo | Hallazgo Arquitectónico | Impacto Estimado | Prioridad |
| :--- | :--- | :--- | :--- | :---: |
| **1.1** | **Native / GPU** | Readback regional aloca 3 buffers GPU y hace CPU wait stall por daño | Latencia de 2–6 ms por daño regional | **Alta** |
| **2.1** | **Engine Loop** | Doble recorrido DFS por frame (`walkTreeOnce` + `traverseFrame`) | Recorrido y resolución de props redundante | **Alta** |
| **2.2** | **Engine / Native** | MSDF Text sin batchear (1 llamada FFI + 1 draw call por cada texto) | Sobrecarga masiva de draw calls y mutexes | **Alta** |
| **3.1** | **App Framework** | Cache no acotado (`new Map`) en `class-name.ts` (`@vexart/app`) | Memory leak en procesos largos | **Alta** |
| **4.1** | **Headless** | `Popover` no tiene trampa de foco (`pushFocusScope`) ni escucha `Escape` | Violación de accesibilidad / fuga de foco | **Alta** |
| **1.2** | **Native / Rust** | `ResourceManager` y `ImageAssetRegistry` desarmados (Completado) | Eliminadas 692 LOC; 3 mutexes reducidos a 1 (`SHARED_PAINT`) | ✅ **Hecho** |
| **1.3** | **Native / Rust** | 6 pipelines WGPU compilados en arranque que nunca se usan | 40–80 ms retraso en cold-start; ~1.200 LOC | **Media** |
| **2.3** | **Engine / FFI** | 6 alocaciones por miss en `msdfMeasureText` y cache LRU chico (501) | Presión en GC durante word-wrapping | **Media** |
| **3.2** | **App Framework** | Inversión de capas: Tier 1 `@vexart/app` importa Tier 2 `@vexart/styled` | Acoplamiento indebido de diseño | **Media** |
| **4.2** | **Headless** | `ScrollView` muta altura de layout para el thumb y colores hardcodeados | Recalculo de layout en cada tick de scroll | **Media** |
| **4.3** | **Engine Loop** | Scroll deja `layer.damageRect = null`, anulando repintado regional | Repintado de capa completa en cada scroll | **Media** |
| **3.3** | **App Framework** | `keepAliveCache` ordena arrays enteros al desalojar rutas | Alocaciones menores de GC | **Baja** |
| **5.1** | **Packaging** | Dependencia raíz redundante `marked` | Dependencia innecesaria en raíz | **Baja** |
| **5.2** | **Tooling** | Paquetes fantasma (`pretext`, `opentype.js`) en externals de bundler | Deuda de configuración en `build-dist.ts` | **Baja** |

---

## 1. Native / GPU (`native/libvexart/`)

### Hallazgo 1.1: Alocación de Buffers GPU y CPU Stall en Readback Regional
* **Prioridad:** **Alta**
* **Archivos:**
  * `native/libvexart/src/composite/readback.rs:285–355` (`readback_region`)
  * `native/libvexart/src/kitty/transport.rs:735–752` (`emit_region_target_with_stats`)
* **Problema:**
  Mientras que el readback de pantalla completa usa búferes prealocados y doble amortiguación asíncrona, `readback_region` no tiene pool. En cada daño regional (escritura en un Input, parpadeo del cursor, hover):
  1. Ejecuta `device.create_buffer_init` para uniformes de offset (`[w, h, x, y]`).
  2. Ejecuta `device.create_buffer` para almacenamiento de salida.
  3. Ejecuta `device.create_buffer` para el staging buffer (`MAP_READ`).
  4. Crea bind group y view de textura.
  5. Tras despachar el compute shader, invoca `device.poll(Wait)`, clavando la CPU de forma síncrona.
  6. Destruye inmediatamente todos los búferes y bind groups creados.
* **Solución Arquitectónica:**
  Implementar un pool acotado de búferes de staging regional en `PaintContext` (o reutilizar los búferes de compute del target con tijeras/scissors), eliminando la creación de búferes por frame y desacoplando el sondeo de terminación.

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

### Hallazgo 2.1: Doble Recorrido DFS por Frame (`walkTreeOnce` + `traverseFrame`)
* **Prioridad:** **Alta**
* **Archivos:**
  * `packages/engine/src/loop/composite.ts:620–645`
  * `packages/engine/src/loop/walk-tree.ts:145–290`
  * `packages/engine/src/loop/pipeline-traverse.ts:1197–1250`
* **Problema:**
  `composite.ts` ejecuta `walkTreeOnce(s)` para poblar listas temporales de nodos (`rectNodes`, `boxNodes`, `textNodes`). Luego vacía esas listas completamente y llama a `traverseFrame`, que vuelve a recorrer todo el árbol en pre-order, resolviendo de nuevo `resolveProps` y repoblando las mismas colecciones.
* **Solución Arquitectónica:**
  Eliminar `walkTreeOnce` de `composite.ts`. Reactivar la creación de flex nodes de texto de forma granular en mutación y ejecutar `layoutAdapter.calculateRoots` directamente. `traverseFrame` debe ser el único recorrido DFS del árbol.

### Hallazgo 2.2: MSDF Text Rendering sin Batchear (1 FFI + 1 Draw Call por Texto)
* **Prioridad:** **Alta**
* **Archivos:**
  * `packages/engine/src/ffi/gpu-renderer-backend.ts:1236–1248` (`flushText`)
  * `native/libvexart/src/lib.rs:1444–1685` (`vexart_font_render_text`)
* **Problema:**
  En `flushText()`, el motor itera sobre cada texto individualmente y llama a `tryMsdfText`. Por cada texto en pantalla se produce 1 llamada FFI, 1 codificación UTF-8, bloqueos de mutex en Rust y **1 draw call independiente en WGPU**.
* **Solución Arquitectónica:**
  Batchear las operaciones de texto en un flujo de comandos binario por capa. En Rust, acumular los cuadriláteros de glifos en el vertex buffer común y despachar un único draw call para toda la tipografía de la capa.

### Hallazgo 2.3: Alocaciones en `msdfMeasureText` y Cache Reducido
* **Prioridad:** **Media**
* **Archivos:**
  * `packages/engine/src/ffi/msdf-font.ts:74–105`
  * `packages/engine/src/ffi/text-layout.ts:315`
* **Problema:**
  Cada fallo de caché en medición aloca 6 objetos y typed arrays (`Uint8Array`, `Float32Array`, etc.). Además, `nativeMeasureCache` tiene un tope de solo 501 entradas, lo que produce thrashing constante en logs o tablas dinámicas.
* **Solución Arquitectónica:**
  Reutilizar búferes scratch prealocados para la serialización de `msdfMeasureText` y ampliar la capacidad del caché a 2.048 entradas.

---

## 3. App Framework y Compilador de Clases (`packages/app/`)

### Hallazgo 3.1: Memory Leak por Cache no Acotado en `class-name.ts`
* **Prioridad:** **Alta**
* **Archivos:**
  * `packages/app/src/styles/class-name.ts:46, 380–410`
* **Problema:**
  `const cache = new Map<string, ClassNameResolveResult>()` almacena indefinidamente todas las clases generadas. En UIs con interpolación dinámica (`gap-${val}`, `w-[${px}]`), el mapa crece sin límite y nunca se purga.
* **Solución Arquitectónica:**
  Sustituir el `Map` plano por un LRU Cache con capacidad acotada (ej: 2.048 entradas).

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

### Hallazgo 4.1: Falta de Trampa de Foco y Tecla Escape en `Popover`
* **Prioridad:** **Alta**
* **Archivos:**
  * `packages/headless/src/overlays/tooltip.tsx:153–187` (`Popover`)
  * `packages/headless/src/overlays/dialog.tsx:64–77` (`DialogRoot`)
* **Problema:**
  `Dialog` implementa correctamente `pushFocusScope()` y escucha `Escape`. `Popover` omite ambos, permitiendo que la navegación por `Tab` se escape a elementos de fondo y no permitiendo cerrar el menú con el teclado.
* **Solución Arquitectónica:**
  Incorporar el aislamiento de foco (`pushFocusScope`) y descarte por tecla `Escape` en el componente `Popover`.

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
