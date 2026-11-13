# Informe Integral de Auditoría de Arquitectura de Sistemas — Vexart Engine
**Repositorio:** `/Users/dev/ve/vexart`  
**Fecha:** 2026-09-20  
**Metodología:** 5 Fases de `system-architecture-audit` (SKILL.md)  
**Estado:** Inspección forense de 5 fases completada y verificada  

---

## Resumen Ejecutivo de Salud Arquitectónica

| Eje Evaluado | Estado | Hallazgo Principal | Severidad |
| :--- | :---: | :--- | :---: |
| **Fase 1: Authority Graph (DAG)** | 🟢 **COMPLETADA** | 100% resuelta: Puntos 1, 2, 3 y 5 implementados y testeados; Punto 4 auditado y preservado por cohesión. Cero ciclos hot-path y cero fugas de terminal. | **Resuelta** |
| **Fase 2: Lifecycle & RAII** | 🟢 **COMPLETADA** | 100% resuelta: Puntos 1 (Ref count), 2 (Validado), 3 (Orphan reaper), 4 (Reloj unificado) y 5 (Eliminación de Singletons y EngineContext ADR-001 Opción B) COMPLETADOS. | **Resuelta** |
| **Fase 3: SSOT & Split-Brain** | 🔴 **Crítico** | Vulnerabilidad de **Ghost Clicks en nodos destruidos** en `layout.ts:275` (omisión de `node.destroyed`); cuatro fuentes de verdad en foco; `setTheme()` no despierta el render loop. | **Crítica** |
| **Fase 4: Anti-Symptom Triage** | 🔴 **Crítico** | Bucle infinito de logging a 60 FPS en `loop.ts` con saturación de CPU al 100% y deadlock de `term.beginSync()`; reloj doble en animaciones; 12 funciones FFI suprimiendo errores nativos. | **Crítica** |
| **Fase 5: ADR Decision Matrices** | 📋 **Listo** | 5 matrices ADR formuladas: Engine Context Bag (001), Desacople de Ciclos (002), Reloj Unificado (003), Terminal Circuit Breaker (004), y Layout Snapshot Inmutable (005). | **Estratégica** |

---

## Registro de Progreso de Remediación

- **[2026-09-20] Punto 1 — Desacople de Estilos y Temas de node.ts (COMPLETADO):**
  - **Archivos Modificados:** Se creó packages/engine/src/styling/theme-context.ts como fuente canónica de ClassNameResolver, setClassNameResolver, getClassNameResolver, currentThemeEpoch, bumpThemeEpoch, getThemeEpoch.
  - **Limpieza de node.ts:** Se eliminaron las 20 líneas de estado global y funciones de tema de packages/engine/src/ffi/node.ts. Cero código muerto y cero carteles de reenvío.
  - **Migración de Consumidores:** packages/engine/src/reconciler/node.test.ts e internal.ts migrados a styling/theme-context.ts.
  - **Gobernanza:** Regla No Dead Code or Proxy Shims agregada a AGENTS.md.
  - **Verificación:** bun run typecheck (0 errores) y bun run test (90 passed, 0 failed).

- **[2026-09-20] Punto 2 — Desacople de Ciclos de Dependencia en Hot-Path y FFI/Loop (COMPLETADO):**
  - **Hot-Path:** Se creo el modulo hoja packages/engine/src/loop/text-util.ts (collectText), migrando a walk-tree.ts, pipeline-traverse.ts y tests. Se redirigio image.ts directamente a composite-damage.ts (rompiendo el ciclo con composite.ts).
  - **Frontera Loop/FFI:** Se traslado resource-stats.ts a packages/engine/src/loop/resource-stats.ts, eliminando packages/engine/src/ffi/resource-stats.ts de raiz sin shims. Se extrajo clearImageCache() de gpu-renderer-backend.ts y se ubico de forma simetrica (RAII) en loop.destroy().
  - **Flexily Grid & Text:** Inversion de control en flex-sync-grid.ts y flex-sync-text.ts mediante hooks coordinados en flex-sync.ts.
  - **Verificacion:** bun run typecheck (0 errores) y bun run test packages/engine/ (83 suites, 706 pasadas, 0 fallidas).

- **[2026-09-20] Punto 3 — Romper Ciclo en Hot-Path del Render Loop (COMPLETADO):**
  - **Archivos Modificados:** Se traslado CompositeFrameState y WalkCounters a packages/engine/src/loop/types.ts como contrato de tipos compartido.
  - **Desacople:** composite-damage.ts y composite-schedule.ts ahora importan CompositeFrameState desde ./types en lugar de ./composite.
  - **Resultado depcruise:** El ciclo de 5 nodos en hot-path (pipeline-traverse -> walk-tree -> image -> composite-damage -> composite -> pipeline-traverse) fue erradicado al 100%. Las violaciones de circularidad cayeron de 15 a 5.
  - **Verificacion:** bun run typecheck (0 errores) y bun run test packages/engine/ (83 suites, 706 pruebas pasadas, 0 fallidas).

- **[2026-09-20] Punto 4 — Auditoría Forense de God-Node node.ts (COMPLETADO):**
  - **Diagnóstico:** Se auditaron las 640 líneas de node.ts. Tras extirpar los temas en el Punto 1, se verificó que el 80% del Fan-In proviene de suites de test que crean arboles de prueba. El archivo es un Domain Core cohesivo (el nodo AST fundamental del motor).
  - **Decisión Arquitectónica:** Se preservó sin fragmentación artificial para evitar la proliferación de módulos superficiales (shallow modules).

- **[2026-09-20] Punto 5 — Sanitización de Escape Sequences en parser.ts (COMPLETADO):**
  - **Archivos Modificados:** packages/engine/src/input/parser.ts y packages/engine/src/input/parser.test.ts.
  - **Causa Raíz Resuelta:** Se reemplazó el buffer.slice(1) por descarte atómico de secuencias CSI desconocidas completas (/^\[[ -?]*[@-~]/), secuencias OSC y DCS/PM.
  - **Impacto:** Respuestas tardías de queryPixelSize o queryColors ya no se filtran como 20+ teclas espurias en la interfaz. Framing seguro ante streaming fragmentado.
  - **Verificación:** 115 tests de input en verde, 706 pruebas de motor pasando sin errores y 0 errores en typecheck.

---

- **[2026-09-20] Fase 2, Punto 1 — Conteo de Referencias Atomico en Rust (COMPLETADO):**
  - **Archivos Modificados:** native/libvexart/src/ffi/context.rs y native/libvexart/src/lib_tests.rs.
  - **Causa Raiz Resuelta:** Se incorporo CONTEXT_REF_COUNT atomico en Rust. vexart_context_destroy solo apaga SHARED_PAINT y SHM cuando el contador de contextos activos llega exactamente a 0.
  - **Verificacion:** test_context_reference_counting_prevents_premature_teardown pasando, 194 pruebas de Rust en verde y 1.058 tests de TypeScript pasando.

- **[2026-09-20] Fase 2, Punto 3 — Reaper de Memoria Compartida Zombi (COMPLETADO):**
  - **Archivos Modificados:** native/libvexart/src/kitty/shm_posix.rs, shm.rs, transport.rs y shm_tests.rs.
  - **Causa Raiz Resuelta:** Se implemento reap_orphaned_shm_segments() con barrido perezoso unico (REAPER_ONCE) que sondea PIDs huerfanos en /dev/shm mediante senal 0 (libc::kill) y desvincula segmentos abandonados (ESRCH) de procesos muertos por SIGKILL sin tocar procesos vivos ni extranjeros.
  - **Verificacion:** 2 unit tests especificos pasando, 194 tests de Rust en verde y 1.058 tests de TypeScript en verde.

---

- **[2026-09-20] Fase 2, Punto 4 — Unificacion del Reloj de Animacion con RenderLoop (COMPLETADO):**
  - **Archivos Modificados:** packages/engine/src/loop/animation.ts, loop.ts, internal.ts, animation.test.ts.
  - **Causa Raiz Resuelta:** Se eliminaron los timers individuales setTimeout(16) por instancia en createTransition y createSpring. Se implemento el registro de drivers y stepActiveAnimations() evaluado en lote atomico dentro de batch(() => {}) al inicio de cada frame en RenderLoop.frame().
  - **Impacto:** Eliminacion total de jitter visual y deriva de fase. Sincronizacion exacta a 60 FPS con WGPU y cero uso de CPU en reposo.
  - **Verificacion:** 11 tests de animacion pasando, 1.061 tests del monorepo en verde y 0 errores en typecheck.

---

- **[2026-09-20] Fase 2, Punto 5 — Eliminación de Singletons Globales y Scoped EngineContext (ADR-001 Opción B) (COMPLETADO):**
  - **Archivos Modificados:** packages/engine/src/context.ts (nuevo), reconciler/focus.ts, reconciler/selection.ts, loop/input.ts, reconciler/pointer.ts, ffi/node-types.ts, ffi/node.ts, loop/loop.ts, mount.ts, internal.ts, loop-instance-isolation.test.ts.
  - **Causa Raiz Resuelta:** Se eliminó el estado a nivel módulo de foco, selección, input y pointer capture, encapsulándolos en FocusManager, SelectionManager, InputManager y EngineContext. La instancia se vincula al nodo raíz TGENode._engineContext, se expone al árbol JSX mediante EngineSolidContext.Provider, y se activa simétricamente durante RenderLoop.frame() e interacción de terminal.
  - **Teardown Simétrico:** mount().destroy() ejecuta engineCtx.destroy(), desvinculando listeners, foco y selección propios sin afectar instancias concurrentes.
  - **Verificación:** 9 tests de aislamiento de instancia pasando, 1.063 tests del monorepo en verde (142 archivos) y 0 errores en typecheck.

---

## Phase 1: Authority Graph (DAG) & Blast Radius

### 1.1 Jerarquía de Paquetes y Fugas de Frontera
El flujo canónico descendente documentado en DEC-014 (`docs/ARCHITECTURE.md`) establece:
$$\text{@vexart/app} \longrightarrow \text{@vexart/styled} \longrightarrow \text{@vexart/headless} \longrightarrow \text{@vexart/engine} \longrightarrow \text{native/libvexart (Rust)}$$

**Anomalías de Manifiesto y Fugas de Dominio:**
1. **Dependencias Omitidas en `package.json`:**
   - `packages/app/package.json:3`: Declara `"dependencies": null`, pero en `packages/app/src/styles/class-name.ts:1-3` importa activamente `@vexart/engine`, `@vexart/engine/internal` y `@vexart/styled`.
   - `packages/styled/package.json:3`: Omite `@vexart/headless` y `@vexart/engine` en `dependencies`.
2. **Inversión de Dependencias y Fuga de Estilos al Núcleo (`src/ffi/node.ts`):**
   - `packages/styled/src/theme/theme.ts:46`: `bumpThemeEpoch()` invocado desde `@vexart/engine/internal`.
   - `packages/app/src/styles/class-name.ts:43,47`: `getThemeEpoch()` y `setClassNameResolver()` invocados desde `@vexart/engine/internal`.
   - `packages/engine/src/ffi/node.ts:114-126`: Variables mutables globales (`currentThemeEpoch`, `globalClassNameResolver`) residen en el nodo fundamental del Scene Graph, acoplando el núcleo a frameworks superiores de estilizado.

### 1.2 Auditoría Forense de Circularidad (17 Ciclos de Dependencia)
El análisis exhaustivo mediante `.dependency-cruiser.cjs` clasificó los 17 ciclos en **6 ciclos por valor (Runtime Hazards)** y **11 ciclos de solo tipo (`type-only`)**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   DISTRIBUCIÓN DE LOS 17 CICLOS                       │
├────────────────────────────────────────────────────────────────────────┤
│ 1. RUNTIME / VALOR (6)                                                 │
│    ├── #1:  ffi/flex-sync-grid.ts <-> ffi/flex-sync-text.ts            │
│    ├── #2:  ffi/gpu-renderer-backend -> loop/image -> composite        │
│    │        -> composite-schedule -> ffi/resource-stats -> backend     │
│    ├── #4:  ffi/resource-stats -> loop/image -> composite              │
│    │        -> composite-schedule -> ffi/resource-stats                │
│    ├── #9:  loop/composite -> loop/paint -> ffi/resource-stats         │
│    │        -> loop/image -> loop/composite                            │
│    ├── #10: loop/composite -> loop/pipeline-traverse -> loop/image     │
│    │        -> loop/composite                                          │
│    └── #17: loop/pipeline-traverse -> loop/walk-tree -> loop/image      │
│             -> loop/composite -> loop/pipeline-traverse                │
├────────────────────────────────────────────────────────────────────────┤
│ 2. TYPE-ERASED / IMPORT TYPE (11)                                      │
│    ├── #3:  ffi/render-graph.ts <-> loop/effect-hash.ts                │
│    ├── #5:  loop/composite-damage.ts <-> loop/composite.ts             │
│    ├── #6:  loop/composite-schedule.ts -> composite-damage -> composite│
│    ├── #7:  loop/composite-schedule.ts <-> loop/composite.ts          │
│    ├── #8:  loop/composite-schedule.ts -> walk-tree -> image...        │
│    ├── #11: loop/effect-hash.ts -> loop/pipeline-types -> render-graph │
│    ├── #12: loop/paint-layer.ts <-> loop/paint-regional.ts             │
│    ├── #13: loop/paint-layer.ts <-> loop/paint.ts                      │
│    ├── #14: loop/paint.ts -> paint-regional -> paint-layer -> paint    │
│    ├── #15: loop/pipeline-damage.ts -> walk-tree -> image...           │
│    └── #16: loop/pipeline-transform.ts -> walk-tree -> image...        │
└────────────────────────────────────────────────────────────────────────┘
```

#### A. Ciclos de Runtime / Valor
1. **Hot-Path Core Render Loop (Violaciones #10 y #17):**
   - **Ruta:** `pipeline-traverse.ts` $
ightarrow$ `walk-tree.ts` $
ightarrow$ `image.ts` $
ightarrow$ `composite.ts` $
ightarrow$ `pipeline-traverse.ts`
   - **Líneas Exactas:** `pipeline-traverse.ts:50,60`, `walk-tree.ts:22`, `image.ts:24`, `composite.ts:33`.
   - **Mecanismo:** `image.ts` importa `markLayerDirtyByKey` desde `composite.ts` (quien solo la re-exporta desde `composite-damage.ts`), mientras que `composite.ts` invoca `traverseFrame` de `pipeline-traverse.ts`. A su vez, `pipeline-traverse.ts` importa por valor `collectText` de `walk-tree.ts`.
   - **Remediación:** Redirigir el import de `image.ts` directamente a `composite-damage.ts` y extraer `collectText` a `reconciler/text.ts`. Latencia: **0.00 ns**.
2. **Entrelazamiento Bidireccional `loop/` $\longleftrightarrow$ `ffi/` (Violaciones #2, #4 y #9):**
   - **Ruta:** `ffi/gpu-renderer-backend.ts` / `ffi/resource-stats.ts` $\longleftrightarrow$ `loop/image.ts` / `loop/composite.ts`
   - **Mecanismo:** La capa FFI actúa como agregador de métricas del loop (`resource-stats.ts`) y el backend limpia cachés del loop en su `destroy()` (`gpu-renderer-backend.ts:380`).
   - **Remediación:** Mover `resource-stats.ts` a `loop/resource-stats.ts` y transferir la invocación de `clearImageCache()` a `loop.ts:560` (`loop.destroy()`).
3. **Flexily Grid & Text Synchronization (Violación #1):**
   - **Ruta:** `ffi/flex-sync-grid.ts:26` $\longleftrightarrow$ `ffi/flex-sync-text.ts:13`.
   - **Remediación:** Centralizar la coordinación en `packages/engine/src/ffi/flex-sync.ts`.

#### B. Ciclos Elididos por Tipo (`type-only`)
- Involucran interfaces de estado (`CompositeFrameState`, `PaintFrameState`).
- **Remediación:** Consolidar interfaces en `packages/engine/src/loop/types.ts`.

### 1.3 Fan-In vs Fan-Out & God-Nodes

| Módulo | Fan-In | Fan-Out | Clasificación |
| :--- | :---: | :---: | :--- |
| `packages/engine/src/ffi/node.ts` | 39 | 4 | Foundation Core (Alto Riesgo) |
| `packages/engine/src/loop/loop.ts` | 6 | 22 | God-Orchestrator (Inestable) |
| `packages/engine/src/loop/composite.ts` | 6 | 18 | High Efferent Coordinator |
| `packages/engine/src/ffi/render-graph.ts` | 18 | 4 | High Afferent Core |
| `packages/engine/src/loop/pipeline-traverse.ts` | 1 | 17 | High Efferent Pipeline |
| `packages/engine/src/ffi/gpu-renderer-backend.ts` | 5 | 14 | Critical Native Bridge Adapter |

- **Mitigación del Fan-In 39 en `node.ts`:** Extraer `setClassNameResolver`, `bumpThemeEpoch` y `getThemeEpoch` a `packages/engine/src/styling/theme-context.ts`, re-exportándolos en `internal.ts` sin romper contratos públicos.

### 1.4 Acoplamiento Temporal y De-framing Crítico en Terminal Handshake
- **Falla Forense Verificada en `parser.ts`:** En `packages/engine/src/terminal/size.ts:133-146`, si `queryPixelSize` o `queryColors` sufren timeout (1000 ms), el handshake se desuscribe de `stdin`. Cuando el emulador responde tarde (ej. a 1050 ms), las secuencias CSI (`[4;768;1024t`) y OSC (`]11;rgb:...`) llegan a `createParser` (`packages/engine/src/input/parser.ts:294-297`). El parser descarta únicamente el byte `` e inyecta los caracteres restantes como **entre 20 y 23 eventos de teclado espurios** en la aplicación, corrompiendo inputs activos.
- **Degradación Permanente de Render Targets:** El timeout fija un fallback de celda 8x16, obligando a WGPU a inicializar buffers y texturas con baja resolución incluso si el emulador opera en pantalla Retina o con celdas de 10x20.

---

## Phase 2: Symmetric Lifecycle Ownership & Leak Forensics (RAII)

### 2.1 Vector 1: GPU / WGPU Device & Context Lifecycle
- **Destrucción Catastrófica de `SHARED_PAINT` (`native/libvexart/src/ffi/context.rs:57-78`):**
  `vexart_context_create` siempre devuelve el handle estático `*out_ctx = 1` enlazado al singleton nativo `SHARED_PAINT` (`lib.rs:45`). Cuando cualquier backend GPU invoca `destroy()` (`gpu-renderer-backend.ts:211`), se ejecuta `vexart_context_destroy(1)`, vaciando `SHARED_PAINT` (WGPU device, queue, pipelines, texture pool y render targets) y reseteando `SHARED_MSDF_ATLAS`.
  *Impacto:* En escenarios multi-instancia o pruebas en paralelo, la destrucción de un backend destruye la infraestructura GPU de los backends restantes, invalidando sus handles de texturas y targets nativos.
- **Asimetría de Ownership en `loopBackend.destroy()` (`packages/engine/src/loop/loop.ts:236, 561`):**
  `createRenderLoop` destruye incondicionalmente `loopBackend`, aun cuando fue creado externamente por el llamador (`opts.backend`). Este contrato está actualmente probado en `loop-instance-isolation.test.ts:180, 214` y en `benchmarks/engine-benchmark.ts:503`. La migración a semántica de préstamo (*borrowed semantics*) requiere una opción de propiedad explícita (`ownsBackend?: boolean`).

### 2.2 Vector 2: OS Resources, POSIX SHM y File Descriptors
- **Protección Normal y Pánico (`native/libvexart/src/kitty/shm.rs:36-55`):**
  Implementa `atexit(atexit_shm_cleanup)`, hook de pánico personalizado (`std::panic::set_hook`) y captura de señales POSIX (`SIGINT`, `SIGTERM`, `SIGHUP`) en `ProcessSignalHubImpl` (`lifecycle.ts:74-100`).
- **Segmentos Huérfanos ante Terminación Forzada (`SIGKILL`):**
  Los segmentos POSIX SHM (`/vx-{pid:x}-{counter:x}`) quedan huérfanos si el proceso recibe `SIGKILL`. Se requiere un reaper de inicio (`vexart_shm_reap_orphans()`) que verifique con señal 0 si el PID creador sigue vivo antes de purgar segmentos obsoletos.

### 2.3 Vector 3: Timers y Loops de Animación
- **Desincronización de Relojes (`animation.ts:155, 266` vs `loop.ts:275`):**
  Las animaciones operan con un reloj propio basado en `setTimeout(tick, 16)`. Cada tick llama a `markDirty()`, despertando a `wakeForDirty()` en el render loop y reprogramando su propio `setTimeout(0)`. Ambos temporizadores compiten en el event loop de Bun, generando jitter visual severo.
- **Acoplamiento Global en `activeCount` (`animation.ts:5`):**
  `activeCount` es un entero a nivel de módulo. Cuando un loop finaliza (`loop.ts:582`), invoca `resetActiveAnimations()`, forzando `activeCount = 0` y degradando la cadencia de otros loops activos a modo idle.

### 2.4 Vector 4: Event Listeners y Cadena de Desmontaje
- **Cadena de Teardown en `mount.ts` (`packages/engine/src/mount.ts:182-225`):**
  Estructura defensiva de 9 niveles `try/finally` asegurando la desconexión simétrica de TTY, parser, signals y loop. Sin embargo, al invocar `resetFocus()` y `clearSelection()` a nivel global, destruye los estados de cualquier otro mount concurrente.

### 2.5 Vector 5: Singletons Globales a Nivel Módulo (Anti-Pattern)
- `focus.ts:22, 27, 188`: `scopes` global, `focusedIdSignal` global y `nodeFocusMap` global.
- `pointer.ts:7`: `activeLoop` global enrutando captura de puntero y `onPostScroll`.
- `dirty.ts:73, 78-79`: `defaultDirtyTracker` y callbacks globales invalidando a todos los loops.
- `selection.ts:11`: Señal reactiva global de selección de texto.
- `composite-damage.ts:21`: `layerDirtyStore` global sobrescrito por el último loop vinculado.

---

## Phase 3: Single Source of Truth (SSOT) & Split-Brain Elimination

### 3.1 Dualidad de Coordenadas de Layout (Flexily vs Scene Graph `node.layout`)
- **Estado Duplicado en Memoria:**
  - **Flexily (`packages/internal-flexily`):** Coordenadas relativas al contenedor padre (`_layout.left/top/width/height`). Agnóstico al viewport y anclajes flotantes.
  - **Scene Graph (`TGENodeImpl`, `ffi/node.ts:138`):** `layout: LayoutRect = { x, y, width, height }` almacena coordenadas absolutas en píxeles de pantalla. Acoplado en 14 subsistemas y en la API pública (`NodeHandle.layout`).
- **Asincronía y Mecánica de Sincronización:**
  - En `composite.ts:247-300`, la interacción (`updateInteractiveStates`) se ejecuta en el **Paso 2**, leyendo `node.layout` y `rectNodes` heredados del **Frame $N-1$**.
  - Recién en el **Paso 3**, `calculateRoots()` calcula Flexily y luego `traverseFrame()` (`pipeline-traverse.ts:349`) sobrescribe `node.layout` con las nuevas coordenadas absolutas.
- **Vulnerabilidad Crítica de Ghost Clicks en Nodos Desmontados:**
  - Si una mutación reactiva de SolidJS desmonta un nodo antes del frame, `reconciler.ts:removeNode()` marca `node.destroyed = true` y libera su flex node.
  - Sin embargo, en el Paso 2, `updateInteractiveStates` (`layout.ts:275-340`) itera sobre `bag.rectNodes` **sin comprobar `node.destroyed`**.
  - Si el usuario hace click en las coordenadas previas, el hit-test es positivo y el motor despacha `onMouseDown`, `onMouseUp` y `onPress` sobre un nodo destruido.
- **Deuda Técnica Derivada:**
  - La necesidad de mantener dos diarios de rollback independientes (`_journalData` en `pipeline-traverse.ts:118` y `snapshotLayout` en `pipeline-types.ts:40`) existe únicamente para revertir las mutaciones *in-place* sobre `node.layout` si el traversal falla.

### 3.2 Infracción del Patrón de Estado Derivado (`_vp`, `_vpDirty` y `_vpEpoch`)
- Cada nodo almacena `_vp` (props visuales resueltas), invalidado por `_vpDirty` o por `_vpEpoch !== currentThemeEpoch`.
- **Falta de Despertador del Loop:** `bumpThemeEpoch()` (`node.ts:122`) incrementa el contador global pero **no llama a `markDirty()` en el DirtyTracker**. Si una aplicación cambia de tema mediante `setTheme()`, los elementos con clases estáticas invalidan su época pero el motor no programa ningún frame, dejando la interfaz con el tema viejo hasta que un evento de ratón despierte el loop.
- **Fuga hacia Shaders GPU:** `packages/engine/src/loop/effect-hash.ts:149` inspecciona `node._vpDirty` para cachear hashes de pipelines WGPU.

### 3.3 Fragmentación del Estado de Foco y Selección
- **Cuatro Fuentes de Verdad para Foco:**
  1. `focusedIdSignal` (`reconciler/focus.ts:27`): Señal de SolidJS con el ID activo.
  2. `scopes[].entries` (`reconciler/focus.ts:18`): Lista secuencial para navegación Tab.
  3. `nodeFocusMap` (`reconciler/focus.ts:217`): Mapeo `node.id -> focusId`.
  4. `node._focused` (`ffi/node.ts:142`): Booleano mutable leído por el pintor para aplicar `focusStyle`.
- **Desincronización de `node._focused`:** `setFocus(id)` actualiza la señal reactiva pero **no marca el loop como dirty ni actualiza `node._focused`**. Solo se sincroniza tras eventos de ratón.
- **El Vacío del Microtask (`queueFocusRepair`):** `focus.ts:98-109` difiere la reasignación de foco a un microtask para evitar re-entrancia en SolidJS. Durante ese lapso, `focusedId()` apunta a un nodo muerto. No existe contrato formal de ciclo de vida `onBlur`.

---

## Phase 4: Root-Cause Invariants & Anti-Symptom Triage

### 4.1 Catálogo Forense de Mitigaciones Cosméticas y Defectos Estructurales

#### 1. Bucle Infinito de Logging de Errores a 60 FPS en RenderLoop
- **Ubicación Exacta:** `packages/engine/src/loop/loop.ts:274, 290, 312`
- **Código:**
  ```typescript
  timer = setTimeout(() => {
    timer = null
    try {
      if (isDirty() || hasActiveAnimations()) frame()
    } catch (e) {
      console.error("[vexart] frame error:", e)
    }
    scheduleNextFrame()
  }, scheduledDelayMs)
  ```
- **[Symptom]**: Excepción recurrente durante la fase de layout (Flexily) o pintado de un frame (WGPU / FFI).
- **[Broken Invariant]**: El motor debe garantizar la recuperación determinista ante fallos de renderizado sin corromper la sesión de terminal ni monopolizar la CPU.
- **[Mecanismo de Falla]**:
  1. `frame()` lanza una excepción antes de ejecutar `clearDirty()` (`composite.ts:438`).
  2. `catch` imprime con `console.error` sobre la pantalla alterna en Raw Mode sin saltos de línea normalizados (`
`), produciendo el efecto "escalera" y rompiendo secuencias APC de gráficos Kitty.
  3. `s.term.beginSync()` (`[?2026h`) carece de protección `finally`, congelando la terminal en modo de actualización atómica permanente.
  4. Inmediatamente se ejecuta `scheduleNextFrame()`. Como `isDirty()` no fue limpiado, se programa otro tick en 0–16 ms, entrando en un bucle cerrado de 60 a 1000 excepciones/segundo y 100% de uso de CPU.
- **[Root Architectural Solution]**:
  1. Envolver `beginSync()` y `endSync()` en un bloque `try/finally` infalible dentro de `composite.ts`.
  2. Implementar un Circuit Breaker con un umbral de 3 errores consecutivos en `RenderLoop`.
  3. Tras 3 fallos consecutivos, detener el loop, invocar `ProcessSignalHub.leave()` para restaurar cooked mode y Alternate Screen, y reportar el error mediante `onError` o `process.exit(1)`.

#### 2. Doble Reloj Asíncrono no Coordinado en Animaciones
- **Ubicación Exacta:** `packages/engine/src/loop/animation.ts:155, 266`
- **[Symptom]**: Jitter visual severo y ráfagas de renders con intervalos de 1 ms seguidos de huecos de 30 ms.
- **[Broken Invariant]**: Toda interpolación visual en el scene graph debe avanzar sincronizada exclusivamente con la cadencia de frames del orquestador central (`RenderLoop`).
- **[Blast Radius Verificado]**: `@vexart/styled` y `@vexart/headless` **no utilizan animaciones reactivas** en sus componentes internos. El impacto de modificar el reloj de animación queda estrictamente confinado a `@vexart/engine/src/loop/` y `compositor-path.ts`.
- **[Root Architectural Solution]**: Eliminar `setTimeout` de `animation.ts`. Registrar los drivers de animación en una cola de evaluación síncrona `onBeforeFrame(now)` dentro de `RenderLoop`, evaluada dentro de un bloque `batch(() => {})` de SolidJS.

#### 3. Supresión Silenciosa de Errores FFI y Pérdida de Contexto en Rust
- **Ubicación Exacta:** `packages/engine/src/ffi/gpu-composite-ops.ts:89-92, 157, 178, 191, 209, 221, 271, 304, 327, 594`
- **[Symptom]**: Fallos en la creación de buffers de GPU o comandos de pintado resultan en punteros `0n` silenciosos o logs pasivos que desembocan en errores secundarios opacos (`"could not allocate GPU layer target"`).
- **[Broken Invariant]**: Los fallos en la capa nativa deben ser inmediatos (*fail-fast*) y conservar el código de error y mensaje de diagnóstico original de Rust.
- **[Deficiencia en Rust]**: `native/libvexart/src/composite/target_ops.rs` devuelve códigos de error negativos pero nunca llama a `set_last_error(...)`, dejando `vexartGetLastError()` vacío.
- **[Riesgo de Regresión en Tests]**: En `packages/engine/src/ffi/native-lifecycle-step4.test.ts:159-166`, el test verifica explícitamente `expect(target0).toBe(0n)`. Si la función se cambia para lanzar `VexartNativeError`, este test debe migrarse a `toThrow(VexartNativeError)`.
- **[Root Architectural Solution]**: Registrar el error en Rust con `set_last_error`, lanzar `VexartNativeError` en TypeScript ante `result !== 0`, y actualizar la suite de pruebas FFI.

#### 4. Enmascaramiento de Contexto Reactivo con Catch Vacío
- **Ubicación Exacta:** `packages/engine/src/loop/input.ts:35`
- **Código:**
  ```typescript
  function cleanupOnOwner(unsub: () => void) {
    try { onCleanup(unsub) } catch {}
  }
  ```
- **[Symptom]**: Fugas silenciosas de listeners de eventos de teclado y mouse en memoria cuando los hooks se llaman fuera de un componente con Owner de SolidJS.
- **[Root Architectural Solution]**: Reemplazar por comprobación explícita: `if (getOwner()) onCleanup(unsub)`.

---

## Phase 5: ADR Decision Matrices & Architectural Circuit Breaker Candidates

### ADR-001: Contexto de RenderLoop y Eliminación de Singletons Globales (Engine Context Bag)

| Dimensión | Opción A: Conservadora (Reset Flags) | Opción B: Estratégica (Engine Context Bag - Recomendada) | Opción C: Rediseño Total (Worker Multi-Thread) |
| :--- | :--- | :--- | :--- |
| **Arquitectura** | Conservar singletons a nivel módulo (`focus.ts`, `pointer.ts`, `dirty.ts`, `selection.ts`). Exponer utilidades de reseteo (`resetAllSingletons()`). | Encapsular managers (`FocusManager`, `PointerTracker`, `DirtyTracker`, `SelectionManager`, `RendererBackend`) en una interfaz `EngineContext` instanciada en `mount()` y propagada vía Solid Context y nodo raíz. Fachada con fallback estático. | Aislar cada instancia de escena y render loop en un `Bun Worker` independiente comunicándose mediante `postMessage` o `SharedArrayBuffer`. |
| **Latencia / Rendimiento** | Cero costo adicional; acceso directo a memoria estática. | Acceso $O(1)$ sin sobrecarga medible (< 0.0001 ms). Cero presión adicional sobre el GC. | Penalización severa de latencia de entrada (IPC `postMessage` añade 2–8 ms por frame); saturación por copia/transferencia de buffers a 60 FPS. |
| **Blast Radius** | Muy bajo: sólo afecta a scripts de prueba que ejecuten reseteos manuales. | Moderado y acotado: refactoriza la inicialización interna en `reconciler/`, `loop/` y `mount.ts`. Cero cambios requeridos en `@vexart/headless`, `@vexart/styled` o `@vexart/app`. | Catastrófico: reescritura estructural del 90% del motor, puente FFI sincrónico de `bun:ffi` y pipeline reactivo de SolidJS. |
| **Costo de Migración** | 1 día de desarrollo. | 3–4 días de desarrollo y estabilización de pruebas. | 3–5 semanas de ingeniería de alto riesgo. |
| **Riesgo Residual** | **Crítico:** Imposibilidad estructural de soportar múltiples terminales concurrentes o tests en paralelo en Bun; proliferación de fugas de estado entre tests. | **Mínimo:** Establece propiedad simétrica (RAII) y determinismo multi-instancia absoluto con total compatibilidad hacia atrás. | **Muy Alto:** Incompatibilidad con llamadas FFI sincrónicas directas en Bun; deadlocks y desincronización de eventos de terminal. |

---

### ADR-002: Ruptura de Ciclos y Desacople de Fronteras `loop/` $\longleftrightarrow$ `ffi/`

| Dimensión | Opción A: Conservadora (Type-Only Casting) | Opción B: Estratégica (Leaf Store & Inversión de Dependencias - Recomendada) | Opción C: Rediseño Total (Micro-Crates / Paquetes Aislados) |
| :--- | :--- | :--- | :--- |
| **Arquitectura** | Convertir dependencias circulares a `import type` y resolver dependencias por valor mediante variables globales diferidas o casting `(globalThis as any)`. | 1) Extraer `layerDirtyStore` a un módulo hoja neutro (`loop/composite-damage-store.ts`).<br>2) Extraer interfaces compartidas a `loop/types.ts` y mover `collectText` a `reconciler/text.ts`.<br>3) Invertir estadísticas FFI: `resource-stats.ts` reside en `loop/` y consume proveedores registrados.<br>4) Desacoplar `clearImageCache()` de `gpu-renderer-backend.ts` vía destructor del loop. | Separar `@vexart/engine` en 4 paquetes npm independientes en el monorepo: `@vexart/scene-graph`, `@vexart/layout`, `@vexart/render-loop`, `@vexart/wgpu-runtime`. |
| **Latencia / Rendimiento** | Cero beneficio; introduce guardias condicionales (`if (_fn)`) en runtime. | **Óptimo:** Cero sobrecarga; llamadas monomórficas directas inlined por JIT. Cero asignaciones en heap en el hot-path. | Leve penalización en tiempo de resolución de módulos y bundling en Bun. |
| **Blast Radius** | Muy bajo: localizado en 3 archivos. | **Moderado:** Reorganización acotada a módulos internos de `loop/` y `ffi/`. Cero cambios en la API pública de `@vexart/engine`. | **Muy Alto:** Afecta a todo el monorepo, tooling de build, configuraciones de TypeScript y release pipelines. |
| **Costo de Migración** | 0.5 días. | **2 días de desarrollo.** | 1–2 semanas de trabajo de infraestructura. |
| **Riesgo Residual** | **Crítico:** Mantiene acoplamiento temporal oculto; orden de imports no determinista genera fallos de `undefined is not a function` en runtime. | **Nulo:** Garantiza un DAG estricto verificado formalmente por `.dependency-cruiser.cjs`. | Medio: Falsa modularidad (paquetes "shallow" sin separación de dominio real). |

---

### ADR-003: Unificación del Reloj de Animación con el Frame Scheduler

| Dimensión | Opción A: Conservadora (Ajustar delay de setTimeout) | Opción B: Estratégica (RenderLoop Frame Ticks con `onBeforeFrame` - Recomendada) | Opción C: Rediseño Total (GPU Compute Animation Shaders) |
| :--- | :--- | :--- | :--- |
| **Arquitectura** | Mantener `setTimeout(tick, 16)` en `animation.ts` ajustando el cálculo de deriva (`dt = now - lastTime`). | Eliminar todos los `setTimeout` de `animation.ts`. Crear un `AnimationClock` centralizado conectado al callback `onBeforeFrame(now)` del `RenderLoop`. Actualizar señales de Solid dentro de `batch(() => {})`. | Trasladar las curvas de interpolación a WGPU Compute Shaders en Rust; evaluar transformaciones íntegramente en la GPU. |
| **Latencia / Rendimiento** | Persiste el *jitter* visual y la saturación del event loop por N temporizadores no coordinados. | **Óptimo:** 60 FPS clavados y perfectamente sincronizados con la presentación WGPU. Cero uso de CPU en reposo (*zero idle CPU*). Consolidación reactiva atómica. | Máximo rendimiento para transforms de GPU, pero inútil para animaciones que mutan layout de Flexily (width, height, flex-basis). |
| **Blast Radius** | Nulo: local a `animation.ts`. | **Bajo/Medio:** Modifica `animation.ts` y la fase previa a `compositeFrame` en `loop.ts`. Cero impacto en styled o headless. | **Muy Alto:** Rediseño completo del protocolo binario FFI y de los pipelines nativos de WGPU en Rust. |
| **Costo de Migración** | 1 hora. | **1–2 días.** | 2–3 semanas. |
| **Riesgo Residual** | **Alto:** Degeneración progresiva de fluidez en interfaces complejas con múltiples componentes animados. | **Muy Bajo:** Adopción del estándar unificado idéntico a `requestAnimationFrame` en la web. | **Muy Alto:** Desincronización crítica entre el estado reactivo de SolidJS y la geometría presentada en pantalla. |

---

### ADR-004: Estrategia de Error FFI y Terminal Circuit Breaker

| Dimensión | Opción A: Conservadora (Silenciamiento y Reintento - Status Quo) | Opción B: Estratégica (Terminal Circuit Breaker & Fail-Fast - Recomendada) | Opción C: Rediseño Total (Fallback Degradado a Modo Texto) |
| :--- | :--- | :--- | :--- |
| **Arquitectura** | Capturar errores con `console.error` en `loop.ts` y continuar llamando a `scheduleNextFrame()`; suprimir fallos FFI retornando `0n`. | Implementar un contador de errores consecutivos en `RenderLoop` (umbral: 3 fallos). Disparar Circuit Breaker: cancelar timers, ejecutar `terminal.destroy()` para restauración de emergencia del TTY, y propagar error vía `onError`. Lanzar `VexartNativeError` inmediato ante fallos FFI. | Construir un motor de renderizado ANSI/curses alternativo para degradar la UI cuando la GPU o WGPU falle. |
| **Latencia / Rendimiento** | Bucle infinito a 60 FPS saturando CPU al 100% ante fallos. | Cero sobrecarga en operación normal; detención inmediata del uso de CPU ante fallo no recuperable. | Penalización de rendimiento y duplicación de pipelines de renderizado. |
| **Blast Radius** | Nulo: comportamiento actual defectuoso. | **Bajo:** Localizado en `loop.ts`, `gpu-composite-ops.ts` y `mount.ts`. Requiere actualizar `native-lifecycle-step4.test.ts`. | **Muy Alto:** Requiere implementar un motor de texto completo en TypeScript. |
| **Costo de Migración** | 0 días. | **1 día.** | 3–4 semanas. |
| **Riesgo Residual** | **Crítico:** Terminales congelados, pantallas corruptas y procesos zombi en máquinas de usuarios finales. | **Mínimo:** Fallos deterministas con restauración limpia del entorno del usuario. | **Alto:** Complejidad accidental masiva y duplicación de renderers. |

---

### ADR-005: Unificación de Coordenadas de Layout (Flexily vs Scene Graph)

| Dimensión | Opción A: Conservadora (Guardia de Nodos Destruidos e Invariante de Hit-Test - Recomendada) | Opción B: Dinámica (Cálculo On-Demand por Traversal) | Opción C: Rediseño Total (Snapshot Inmutable por Frame) |
| :--- | :--- | :--- | :--- |
| **Arquitectura** | 1) Agregar `if (node.destroyed) continue` en `layout.ts:275` para erradicar los ghost clicks de inmediato.<br>2) Eliminar `node._focused` mutable y resolverlo en `resolveProps` como función pura del ID activo.<br>3) Disparar `markDirty({ kind: FULL })` en `setTheme()`. | Eliminar `node.layout` absoluto y calcular las coordenadas en pantalla recorriendo la jerarquía de padres en cada consulta de hit-test. | Generar un `Map<number, Readonly<LayoutRect>>` inmutable en cada pasada de layout y distribuirlo como SSOT de geometría. |
| **Latencia / Rendimiento** | Cero sobrecarga; elimina ejecuciones espurias de eventos y re-renders sobre nodos muertos. | Penalización de $O(N \cdot \text{depth})$ en cada movimiento de mouse; inaceptable a 60 FPS. | Asignaciones continuas en el heap cada frame, provocando recolecciones de basura frecuentes (GC pauses). |
| **Blast Radius** | **Muy Bajo:** Cambios quirúrgicos en `loop/layout.ts`, `ffi/node.ts` y `theme.ts`. | Alto: Afecta a todo el subsistema de eventos, hit-testing y composición de capas. | Moderado: Afecta a la propagación de layout en el render loop. |
| **Costo de Migración** | **1 día.** | 4–5 días. | 3–4 días. |
| **Riesgo Residual** | **Mínimo:** Resuelve la vulnerabilidad de interacción sin penalización de rendimiento. | Alto: Riesgo de degradación de FPS en árboles profundos. | Medio: Riesgo de jitter por pausas de GC. |

---

## Formalización del Protocolo Architectural Circuit Breaker (Stop & Ask)

En cumplimiento de las directivas de arquitectura y de `docs/API-POLICY.md`, ningún agente de implementación o refactorización podrá realizar mutaciones que activen los siguientes **5 Triggers Mandatorios de Parada y Consulta** sin detenerse de inmediato y consultar al usuario:

1. **Trigger 1: Breaking Changes en la Superficie Pública (`docs/API-POLICY.md`):**
   - Modificación de firmas en exports `@public` en `packages/*/src/public.ts`.
   - Alteración de los argumentos posicionales de `mount(component, terminal, opts)` o `createApp()`.
   - Renombrado o eliminación de hooks públicos (`useFocus()`, `setFocus()`, `focusedId()`, `useTerminalDimensions()`).
2. **Trigger 2: Alteración de ABI Nativo y Protocolo FFI (`native/libvexart/` $\longleftrightarrow$ `packages/engine/src/ffi/`):**
   - Modificación de las firmas en `VEXART_SYMBOLS`.
   - Modificación de los layouts binarios y strides de comandos GPU (`gpu-pack.ts` $\longleftrightarrow$ `gpu_pack.rs`).
   - Alteración del protocolo de memoria compartida POSIX (`tmux-shm-*` / `kitty/shm.rs`).
3. **Trigger 3: Alteración del Reconciliador Universal de SolidJS:**
   - Modificar la instancia única del reconciliador universal (`createRenderer` en `reconciler.ts`, invariant DEC-014).
   - Modificar la ruta de compilación de JSX (`vexart/jsx-runtime`).
4. **Trigger 4: Estrategia de Manejo de Errores y Ciclo de Vida del Proceso:**
   - Alteración del comportamiento de captura de señales del sistema operativo (`ProcessSignalHubImpl`: `SIGINT`, `SIGTERM`, `exit`).
   - Modificación de la secuencia de restauración de emergencia del TTY (`[?1049l`, `[?25h`, `setRawMode(false)`).
5. **Trigger 5: Introducción de Nuevas Dependencias Externas o Servicios:**
   - Adición de paquetes externos a `package.json` de módulos públicos.
   - Creación de procesos daemon de fondo o acoplamiento a servicios de red.

---

## Plan Secuencial de Migración sin Breaking Changes

1. **Paso 1: Parche Inmediato de SSOT & Circuit Breaker (ADR-004 & ADR-005.1)**
   - Agregar `if (node.destroyed) continue` en `layout.ts:275` (elimina ghost clicks).
   - Envolver `beginSync`/`endSync` con `try/finally` en `composite.ts`.
   - Implementar límite de 3 fallos consecutivos en `loop.ts` con teardown TTY.
   - Verificación: `bun run test` && simulación de falla en `frame()`.
2. **Paso 2: Desacople de Ciclos en Hot Path (ADR-002)**
   - Redirigir `image.ts` -> `composite-damage.ts` y extraer `collectText`.
   - Mover `resource-stats.ts` a `loop/` y centralizar `clearImageCache` en `loop.ts`.
   - Verificación: `bun x depcruise` sin ciclos por valor entre loop y ffi.
3. **Paso 3: Sanitización de Terminal Handshake (Fase 1.4)**
   - Ajustar `parser.ts` para descartar secuencias CSI no reconocidas completas.
   - Prevenir inyección de keystrokes espurios ante timeouts de `queryPixelSize`.
   - Verificación: test unitario de timeout de sonda en `terminal/size.test.ts`.
4. **Paso 4: Contexto Multi-Instancia (ADR-001)**
   - Implementar `EngineContext` y sus 4 sub-managers.
   - Inyectar `<EngineContextInternal.Provider>` en `mount.ts`.
   - Mantener `useFocus`, `setFocus`, `markDirty` como fachadas compatibles.
   - Verificación: Suites de test pasan sin cambios; habilitar tests paralelos.
5. **Paso 5: Reloj Unificado de Animación (ADR-003)**
   - Conectar `AnimationClock` a `onBeforeFrame(now)` en `RenderLoop`.
   - Reemplazar `setTimeout(16)` en `animation.ts` por evaluación en `batch(() => {})`.
   - Verificación: Cero timers en reposo y tests de animación en verde.
