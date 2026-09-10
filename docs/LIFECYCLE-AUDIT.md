# Auditoría Exhaustiva de Ciclo de Vida, Fugas de Memoria y Teardown — Vexart Engine

> **Documento de Arquitectura y Auditoría de Sistema**  
> **Ámbito:** Reconciliación SolidJS, Motor TypeScript, Frontera FFI WGPU (Rust), Protocolo de Terminal Kitty/POSIX y Paquetes de Alto Nivel (`@vexart/headless`, `@vexart/app`, `@vexart/styled`).  
> **Fecha:** Septiembre 2026  
> **Estado:** Aprobado para Ejecución / Fase de Mitigación

---

## 1. Resumen Ejecutivo

### 1.1 Contexto del Motor Gráfico y Modelo de Ejecución Tríptico

Vexart es un motor de interfaz de usuario de renderizado nativo por píxeles para emuladores de terminal, acelerado por GPU vía WGPU y Rust, reconciliado reactivamente mediante SolidJS Universal Reconciler sobre TypeScript (Bun runtime) y proyectado al terminal a través del Kitty Graphics Protocol (directo, archivo y POSIX Shared Memory).

La arquitectura opera sobre un **modelo de ejecución tríptico** con semánticas de ciclo de vida inherentemente divergentes:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             1. JAVASCRIPT / BUN VM                                │
│  - SolidJS Universal Reconciler (Árbol reactivo sin VDOM, Signal Graph)          │
│  - Layout Engine Flexily / Walk-tree (Estructuras planas preasignadas en memoria) │
│  - Ciclo de vida: No determinístico, gobernado por Garbage Collector (GC).       │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ FFI (bun:ffi, punteros crudos u64)
┌────────────────────────────────────────▼─────────────────────────────────────────┐
│                            2. RUST / WGPU NATIVE                                  │
│  - libvexart (cdylib, pipelines de renderizado, rasterización, compositing)       │
│  - VRAM / Recursos GPU: Device, Queue, Textures, Atlas MSDF, BindGroups          │
│  - Ciclo de vida: Determinístico (RAII), pero atado a singletons estáticos y FFI. │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ IPC / Protocolo Gráfico / OS
┌────────────────────────────────────────▼─────────────────────────────────────────┐
│                          3. TERMINAL HOST / OPERATING SYSTEM                      │
│  - Emulador Kitty / Multiplexor tmux (Cuota de memoria de imágenes, Double Buffer)│
│  - Kernel OS: Segmentos POSIX SHM (/dev/shm), Descriptores de archivo, TTY Raw    │
│  - Ciclo de vida: Kernel lifetime (los recursos sobreviven a la muerte del proc). │
└──────────────────────────────────────────────────────────────────────────────────┘
```

La discordancia fundamental radica en que:
1. El **recolector de basura de JS no tiene visibilidad de la presión de memoria en VRAM ni en el kernel**, por lo que un objeto de pocos bytes en el heap de JS puede mantener ancladas texturas de 4K en GPU o segmentos de memoria compartida en `/dev/shm`.
2. Las estructuras planas de alto rendimiento en TypeScript (arrays preasignados para evitar `WeakMap`) retienen punteros a objetos destruidos (`TGENode`), impidiendo su recolección de basura.
3. Las terminaciones abruptas del proceso por señales POSIX (`SIGINT`, `SIGTERM`, `SIGHUP`) interrumpen la tubería de limpieza si no existe una coordinación síncrona a nivel de kernel.

### 1.2 Síntesis del Impacto en Producción

Las deficiencias de ciclo de vida identificadas a lo largo de las tres fronteras producen cuatro fallas críticas de estabilidad:

* **Fugas Progresivas de Memoria (RAM y VRAM):** Retención acumulativa de miles de nodos huérfanos en `layout-adapter.ts`, no-op en la destrucción del contexto nativo (`vexart_context_destroy`), colecciones `HashMap` no acotadas en Rust `PaintContext`, y falta de liberación de cachés de sprites en el backend GPU (`clearSpriteCaches()`).
* **Bloqueos de CPU a Tasa Máxima de Cuadros (100% Core Lock):** Captura de puntero huérfana cuando un nodo es desmontado antes del evento `pointerup`, provocando que `hasRecentInteraction()` retorne `true` perpetuamente y forzando al scheduler a renderizar a 120 FPS de manera ininterrumpida sin interacción del usuario.
* **Timers Zombies y Corrupción de Estado de UI:** Toasters y modales headless que dejan intervalos y `setTimeout` activos en background, o restauran ciegamente identificadores de foco inexistentes tras desmontajes asincrónicos.
* **Corrupción Catastrófica del Terminal del Usuario:** Al recibir `SIGINT`, la escritura de las secuencias de escape de restauración mediante `stdout.write` asíncrono compite con `process.exit(130)`, abortando el proceso antes de vaciar el buffer y dejando la terminal en Raw Mode, sin eco, con cursor oculto y bloqueada en la pantalla alterna.

---

## 2. Frontera 1: SolidJS Reactivity ↔ Engine

### 2.1 Layout Adapter: Retención de Nodos en Array Plano (`_allNodes`)
* **Ubicación:** `packages/engine/src/loop/layout-adapter.ts` (Líneas 124, 258–302, 374–387, 389–398).
* **Mecanismo del Fallo:**
  Para eliminar la sobrecarga de asignación por cuadro y evitar la degradación de rendimiento de `WeakMap`, `layout-adapter.ts` utiliza un conjunto de arrays planos paralelos (`_allNodes: Node[] = []`, `_nodeIds`, `_parentNodeIds`, etc.).
  En la función `_addNode` (Líneas 258–300), se asignan slots mediante `_allNodes[idx] = node`.
  En cada cuadro, `beginLayout()` (Línea 390) ejecuta `_nodeCount = 0`, reiniciando el cursor lógico. Sin embargo:
  1. `_allNodes` **nunca trunca su longitud** ni escribe `null` en los slots que quedan más allá del nuevo `_nodeCount`.
  2. Si una vista compleja monta 5,000 nodos (ej. una lista o tabla) y posteriormente el usuario cambia a una vista minimalista de 20 nodos, los slots `_allNodes[20..4999]` retienen referencias fuertes en memoria a los 4,980 `TGENode`s huérfanos con todos sus árboles hijos y closures asociados.
  3. En `destroy()` (Línea 374), `_allNodes` ni siquiera es vaciado (`_allNodes.length = 0` no se ejecuta), impidiendo que el motor de recolección de basura de Bun libere los nodos.
* **Impacto:** Fuga masiva de memoria en el heap de JavaScript proporcional al pico histórico de nodos renderizados en una sesión.

```ts
// packages/engine/src/loop/layout-adapter.ts
// ESTADO ACTUAL (Defectuoso):
beginLayout() {
  _nodeCount = 0
  _nodeStack.length = 0
  // _allNodes permanece intacto con referencias vivas a nodos del frame anterior
}

// CORRECCIÓN ARQUITECTÓNICA:
beginLayout() {
  // Limpiar referencias huérfanas más allá de nodeCount en el pase anterior
  for (let i = _nodeCount; i < _allNodes.length; i++) {
    _allNodes[i] = null as unknown as Node
  }
  _nodeCount = 0
  _nodeStack.length = 0
  // ...
}
```

### 2.2 Pointer Capture & Bloqueo a Tasa Máxima de Cuadros (100% FPS Lock)
* **Ubicación:** `packages/engine/src/reconciler/reconciler.ts` (Líneas 501–510) y `packages/engine/src/loop/frame-scheduler.ts` (Líneas 21–23) / `packages/engine/src/loop/loop.ts` (Líneas 268, 532–541).
* **Mecanismo del Fallo:**
  El planificador de cuadros utiliza `hasRecentInteraction()` para determinar si debe operar a 120 FPS o caer en reposo (idle cadence).
  ```ts
  // packages/engine/src/loop/frame-scheduler.ts:21-23
  export function hasRecentInteraction(now: number, interactionBoostUntilMs: number, capturedNodeId: number, pointerDown: boolean) {
    if (capturedNodeId !== 0 || pointerDown) return true
    return now < interactionBoostUntilMs
  }
  ```
  Cuando un usuario inicia un arrastre (ej. slider, scrollbar, split pane o drag and drop), el nodo adquiere captura vía `setPointerCapture(nodeId)` (`pointer.capturedNodeId = nodeId`).
  Si dicho nodo es desmontado del árbol de SolidJS mientras la captura está activa (por ejemplo, al cambiar de ruta, cerrar un modal, o por una condición reactiva disparada durante el drag):
  - `removeNode(parent, node)` en `reconciler.ts` desregistra el foco y las capas, pero **ignora por completo el estado del puntero**.
  - `pointer.capturedNodeId` mantiene el ID del nodo destruido indefinidamente, ya que el evento `pointerup` o `releasePointerCapture` nunca ocurrirá sobre un elemento que ya no existe en el DOM.
  - Consecuentemente, `capturedNodeId !== 0` evalúa a `true` en cada iteración del bucle de renderizado.
* **Impacto:** El motor queda permanentemente trabado en modo de alta interacción (`120 FPS`), consumiendo el 100% de un núcleo de CPU, generando calor y drenando la batería del dispositivo del usuario aun con la aplicación en reposo.

### 2.3 Descriptores de Animación del Compositor Huérfanos
* **Ubicación:** `packages/engine/src/reconciler/reconciler.ts` (Líneas 501–510) y `packages/engine/src/animation/compositor-path.ts` (Líneas 113–117).
* **Mecanismo del Fallo:**
  El sistema de animación en el compositor mantiene un registro global de descriptores activos (`descriptors = new Map<string, AnimationDescriptor>()`). `compositor-path.ts` expone la función:
  ```ts
  export function deregisterAllDescriptors(nodeId: number): void {
    for (const property of ["transform", "opacity"] as const) {
      descriptors.delete(descriptorKey(nodeId, property))
    }
  }
  ```
  Sin embargo, en `reconciler.ts`:
  ```ts
  removeNode(parent: TGENode, node: TGENode) {
    unregisterSubtree(node)
    unmarkSubtreeLayerBacking(node)
    onSubtreeChanged(parent.id)
    removeChild(parent, node)
    markDirty()
  }
  ```
  `unmarkSubtreeLayerBacking(node)` solo limpia las banderas de layer backing. `deregisterAllDescriptors(node.id)` **no es invocado** ni para el nodo removido ni para sus descendientes.
* **Impacto:** Los descriptores de animación quedan en el mapa global. En cuadros subsiguientes, el orquestador continúa intentando interpolar propiedades sobre IDs de nodos extintos o reutilizados por el asignador de IDs, produciendo fallas de aserción o desincronización de transformaciones.

### 2.4 Retención de Nodos en Puntero y Teardown Incompleto en `loop.destroy()`
* **Ubicación:** `packages/engine/src/loop/loop.ts` (Líneas 226, 592–603).
* **Mecanismo del Fallo:**
  El objeto interno `pointer` mantiene una referencia directa al último nodo activo:
  ```ts
  const pointer = { ... prevActiveNode: null as TGENode | null }
  ```
  En `loop.destroy()` (Líneas 592–603):
  - Se desuscriben eventos globales de dirty y resize.
  - Se destruye el backend activo y se resetea el layer cache.
  - Se libera el árbol de flexily (`freeFlexTree(root)`).
  - **Omisión:** `pointer.prevActiveNode` no es reseteado a `null`. Si una referencia a la clausura del loop persiste (por ejemplo, en un handler de depuración o test runner), el subárbol completo de `prevActiveNode` queda anclado en memoria. Además, las estructuras de tracking de daño no son purgadas explícitamente.

### 2.5 Scopes de Foco y Orden Inverso de Destrucción
* **Ubicación:** `packages/engine/src/reconciler/focus.ts` (Líneas 21–26, 115–126, 239–255) y `packages/engine/src/mount.ts` (Líneas 219–228).
* **Mecanismo del Fallo:**
  1. **Orden de Destrucción Invertido en `mount.ts`:**
     ```ts
     destroy: () => {
       unsubData()
       unsubResize()
       parser.destroy()
       unbindLoop()
       resetFocus()     // <-- 1. Se resetea el sistema de foco primero
       resetSelection()
       dispose()        // <-- 2. Se destruye el árbol de Solid después
       loop.destroy()
     }
     ```
     `resetFocus()` vacía los scopes (`scopes.length = 1; scopes[0].entries.length = 0`) y desuscribe el input. Inmediatamente después, `dispose()` invoca las rutinas de limpieza (`onCleanup`) de los componentes Solid montados. En `useFocus()` (`focus.ts:185`), `onCleanup(unregister)` intenta remover entradas de un array que ya fue destruido, o re-encolar microtareas de reparación de foco sobre un estado reseteado.
  2. **Restauración Ciega de IDs Muertos en `pushFocusScope()`:**
     ```ts
     return () => {
       const idx = scopes.indexOf(scope)
       if (idx > 0) {
         scopes.splice(idx, 1)
         setFocusedId(scope.previousFocusId)
       }
     }
     ```
     Al cerrar un scope de foco (ej. desmontar un modal), `scope.previousFocusId` es asignado ciegamente a `focusedId` sin validar si dicho nodo continúa existiendo en el árbol activo (`activeRegistry().some(e => e.id === id)`).
  3. **Retención en `scope.entries`:** Cada `FocusEntry` retiene opcionalmente `node?: TGENode`. Si un scope no se desapila por error de ciclo de vida, los nodos DOM son retenidos por el singleton de scopes.

### 2.6 Drag and Drop: Falta de `onCleanup` en `useDrag`
* **Ubicación:** `packages/engine/src/reconciler/drag.ts` (Líneas 34–103).
* **Mecanismo del Fallo:**
  El hook `useDrag` gestiona la transición del puntero hacia el modo de interacción (`beginInteraction()`, que eleva la prioridad y marca capas para renderizado rápido o congelamiento).
  No obstante, `useDrag` no importa ni registra ningún `onCleanup` de SolidJS.
  Si un elemento interactivo que está siendo arrastrado es eliminado abruptamente del árbol de componentes, `endInteraction()` nunca se ejecuta, `setDragging(false)` no corre, y la capa del compositor queda permanentemente en el estado `"drag"`, afectando el repintado y la congelación de capas adyacentes.

### 2.7 Font Registry sin Desalojo
* **Ubicación:** `packages/engine/src/ffi/text-layout.ts` (Líneas 28–38).
* **Mecanismo del Fallo:**
  `const fontRegistry = new Map<number, FontDescriptor>()` almacena descriptores de fuentes mediante `registerFont(id, desc)`.
  No existe una función `unregisterFont(id)` ni ningún mecanismo de purga o límite de capacidad. En entornos donde se cargan fuentes tipográficas de forma dinámica, la colección crece de forma no acotada.

### 2.8 Caché Global de Colores Infinito
* **Ubicación:** `packages/engine/src/ffi/node.ts` (Líneas 380–397).
* **Mecanismo del Fallo:**
  `const _colorCache = new Map<string, number>()` memoiza la conversión de cadenas de color (`"#RRGGBB"`, `"#RRGGBBAA"`) a enteros de 32 bits empaquetados.
  El mapa carece de cota máxima y de política de desalojo LRU (Least Recently Used). Aplicaciones con animaciones de color continuas, paletas procedimentales o selectores de color insertan miles de cadenas únicas en el mapa, incrementando constantemente el uso de memoria.

### 2.9 Suscriptores de Input Huérfanos
* **Ubicación:** `packages/engine/src/loop/input.ts` (Líneas 11, 24–27).
* **Mecanismo del Fallo:**
  `const subscribers = new Set<InputSubscriber>()` es un singleton a nivel de módulo. Si consumidores o utilitarios de prueba registran suscriptores mediante `onInput` fuera del ciclo de vida reactivo de Solid (sin `onCleanup`), no existe ningún método de limpieza (`clearSubscribers()`), acumulando callbacks huérfanos entre ejecuciones sucesivas en el mismo proceso.

---

## 3. Frontera 2: TypeScript Engine ↔ Rust / WGPU (FFI)

### 3.1 `vexart_context_destroy` como No-Op y Retención de `SHARED_PAINT`
* **Ubicación:** `native/libvexart/src/lib.rs` (Líneas 44–48, 216–221).
* **Mecanismo del Fallo:**
  En la interfaz FFI de Rust:
  ```rust
  /// Currently a no-op because GPU state is singleton-managed.
  #[no_mangle]
  pub extern "C" fn vexart_context_destroy(ctx: u64) -> i32 {
      ffi_guard!({
          let _ = ctx;
          OK
      })
  }
  ```
  El contexto de renderizado de la GPU reside en un singleton estático protegido por mutex:
  ```rust
  static SHARED_PAINT: LazyLock<Mutex<Option<paint::PaintContext>>> = ...
  ```
  Cuando el motor de TypeScript finaliza (`mount.destroy()` -> `backend.destroy()`), invoca `symbols.vexart_context_destroy(_vexartCtx)`.
  Dado que la función de Rust descarta el parámetro y retorna `OK` de inmediato:
  1. `SHARED_PAINT` nunca es desmantelado ni puesto en `None`.
  2. El `wgpu::Device`, la `wgpu::Queue`, los pipelines de shaders (SDF, blur, glow, gradients) y las texturas internas de offscreen targets permanecen totalmente asignados en la VRAM del hardware gráfico hasta que el proceso del sistema operativo muere por completo.
  3. En escenarios de pruebas automatizadas, recargas en caliente (HMR) o múltiples ciclos de vida de aplicaciones en el mismo runtime, los recursos de GPU se acumulan sin límite.

### 3.2 Colecciones No Acotadas en `PaintContext` de Rust
* **Ubicación:** `native/libvexart/src/paint/mod.rs` (Líneas 36–52) y `native/libvexart/src/lib.rs` (Línea 1468).
* **Mecanismo del Fallo:**
  El struct `PaintContext` encapsula tres colecciones centrales sin políticas de tamaño máximo ni desalojo automático:
  1. `pub images: HashMap<u64, ImageRecord>`: Registro de texturas de imágenes subidas a la GPU.
  2. `pub targets: crate::composite::target::TargetRegistry`: Texturas intermedias de capas de composición.
  3. `SHARED_MSDF_ATLAS: LazyLock<Mutex<MsdfAtlasManager>>`: Atlas de glifos generados por fontdb y msdfgen.
  Si la capa de TypeScript sufre una desincronización y olvida emitir `vexart_paint_remove_image` o `vexart_composite_target_destroy`, la colección nativa en Rust retiene las texturas de WGPU de forma indefinida sin ningún mecanismo de recolección de basura por envejecimiento.

### 3.3 Omisión de `clearSpriteCaches()` en `backend.destroy()`
* **Ubicación:** `packages/engine/src/ffi/gpu-renderer-backend.ts` (Líneas 572–590, 3003–3023).
* **Mecanismo del Fallo:**
  Para optimizar animaciones de transformación y canvas, `gpu-renderer-backend.ts` mantiene cuatro cachés de sprites de texturas nativas:
  - `transformSpriteCache`
  - `canvasSpriteCache`
  - `backdropSourceCache`
  - `backdropSpriteCache`
  En la función `clearSpriteCaches()` (Línea 572), se recorren estas colecciones y se invoca `vexartRemoveImage(vctx, record.handle)` para cada textura nativa antes de vaciar los slots.
  Sin embargo, en la implementación de `backend.destroy()` (Líneas 3003–3023):
  ```ts
  destroy() {
    if (_vexartCtx !== null) {
      for (const handle of activeImageHandles) {
        vexartRemoveImage(_vexartCtx, handle)
      }
      activeImageHandles.clear()
      destroyTargetRecord(standaloneTarget)
      standaloneTarget = null
      destroyTargetRecord(finalFrameTarget)
      finalFrameTarget = null
      for (const record of layerTargets.values()) {
        vexartCompositeTargetDestroy(_vexartCtx, record.handle)
      }
      layerTargets.clear()
      cacheStats.layerTargetCount = 0
      cacheStats.layerTargetBytes = 0
      const { symbols } = openVexartLibrary()
      symbols.vexart_context_destroy(_vexartCtx)
      _vexartCtx = null
    }
  }
  ```
  `clearSpriteCaches()` **nunca es invocado**.
* **Impacto:** Todas las texturas de transformación, canvas y efectos de backdrop activas en el momento de la destrucción permanecen vivas en el `HashMap` de Rust (`SHARED_PAINT.images`), consumiendo VRAM residual.

### 3.4 Falta de Invalidación de Sprites en Redimensionamiento bajo Composición de Capas
* **Ubicación:** `packages/engine/src/ffi/gpu-renderer-backend.ts` (Línea 623 frente a Línea 631).
* **Mecanismo del Fallo:**
  Al cambiar el tamaño del terminal o ventana:
  - En la ruta monolítica `getStandaloneTarget(width, height)` (Línea 623), se llama explícitamente a `clearSpriteCaches()`.
  - En la ruta estándar de composición multicapa `getFinalFrameTarget(width, height)` (Líneas 631–641), **no se llama a `clearSpriteCaches()`**.
* **Impacto:** Al redimensionar la ventana en modo multicapa, los sprites de backdrop y transformación generados con la resolución previa se preservan en caché, produciendo distorsión de muestreo en los filtros de desenfoque de fondo y retención de texturas con dimensiones obsoletas.

### 3.5 Ciclo de Vida de Texturas Nativas e Integración con `FinalizationRegistry`
* **Ubicación:** `packages/engine/src/ffi/gpu-composite-ops.ts` (Líneas 59–66, 183–189, 191–204).
* **Mecanismo del Fallo:**
  En `gpu-composite-ops.ts`, existe un `_imageFinalizationRegistry` (Líneas 59–66) asociado a buffers `Uint8Array` pasados a `vexartUploadImage`.
  No obstante:
  1. En `copyGpuTargetRegionToImage` (Línea 183), se ejecuta `vexartCompositeCopyRegionToImage`, creando un handle nativo de imagen directamente en GPU sin un buffer de JS asociado. Dicho handle se empaqueta en un objeto `{ handle, width, height }` ordinario.
  2. Este objeto no está registrado en `_imageFinalizationRegistry` ni en `activeImageHandles`.
  3. Si el código consumidor de TypeScript descarta el objeto `GpuRasterImage` sin llamar manualmente a la API de liberación, el handle nativo de Rust queda huérfano en VRAM para siempre, inmune al GC de JS.

---

## 4. Frontera 3: Rust ↔ Terminal / OS

### 4.1 Fuga de Segmentos POSIX SHM en Terminaciones Anómalas
* **Ubicación:** `native/libvexart/src/kitty/shm.rs` (Líneas 193–227, 235–270) y `native/libvexart/src/kitty/transport.rs`.
* **Mecanismo del Fallo:**
  En la comunicación de alto rendimiento para terminales compatibles con SHM, Vexart reserva memoria compartida POSIX mediante `shm_open`, `ftruncate` y `mmap` bajo nombres con patrón `/tge-shm-XXXXXX`.
  Los handles activos se registran en `KITTY_SHM_HANDLES: Mutex<HashMap<u64, ShmHandleEntry>>`.
  La liberación y desvinculación (`shm_unlink`) de dichos archivos en el sistema operativo depende de que el emulador Kitty confirme el procesamiento y la capa de transporte invoque `shm_release(handle, 1)`.
  Si el proceso finaliza por una señal no controlada (`SIGKILL`, `SIGABRT`), un panic en Rust, o un crash imprevisto:
  - Los segmentos POSIX SHM poseen **tiempo de vida a nivel de Kernel del Sistema Operativo** (`kernel lifetime`).
  - No desaparecen al cerrarse los descriptores de archivo; persisten en `/dev/shm` (en Linux) o en el subsistema mach de macOS.
  - Rust carece de un handler `atexit` o hook de pánico global que recorra `KITTY_SHM_HANDLES` y ejecute `shm_unlink` para limpiar los buffers residuales.
* **Impacto:** Con el tiempo o durante sesiones de depuración intensivas, `/dev/shm` puede llenarse de archivos temporales de frames huérfanos, consumiendo gigabytes de memoria física del sistema operativo.

### 4.2 Pérdida de Secuencias de Restauración de Terminal por Salida Asíncrona
* **Ubicación:** `packages/engine/src/terminal/lifecycle.ts` (Líneas 182–228) y `packages/engine/src/terminal/index.ts` (Línea 136).
* **Mecanismo del Fallo:**
  En `packages/engine/src/terminal/index.ts`, la función de escritura primaria está ligada a:
  ```ts
  const rawWrite = (data: string) => { stdout.write(data) }
  ```
  En Node.js y Bun, cuando `stdout` es una TTY, `stdout.write` opera en modo **asíncrono y almacenado en buffer**.
  En `packages/engine/src/terminal/lifecycle.ts`, los manejadores de señales POSIX están estructurados de la siguiente forma:
  ```ts
  const onSigint = () => {
    try {
      cleanup() // invoca leave(), que emite las secuencias ANSI a través de rawWrite()
    } finally {
      process.exit(130) // <-- TERMINACIÓN INMEDIATA DEL PROCESO
    }
  }
  ```
  Al dispararse `process.exit(130)` dentro del bloque `finally` inmediato:
  1. El runtime de Bun/Node interrumpe la ejecución síncrona y mata el proceso antes de que el event loop vacíe el buffer en memoria de `stdout` hacia el kernel (File Descriptor 1).
  2. Las secuencias de restauración crítica (`\x1b[?1049l` para salir de Alternate Screen, `\x1b[?25h` para mostrar el cursor, y la deshabilitación del Raw Mode y Mouse Tracking SGR) nunca llegan al emulador de terminal.
* **Impacto:** La terminal del usuario queda permanentemente corrupta: pantalla en negro o congelada, cursor desaparecido, y caracteres no visibles al escribir debido al modo Raw remanente, obligando al usuario a ejecutar ciegamente `reset` o matar la ventana.

### 4.3 Bypassing de Teardown en `createApp` ante Señales del SO
* **Ubicación:** `packages/app/src/runtime/create-app.ts` (Líneas 67–82).
* **Mecanismo del Fallo:**
  `createApp` implementa el cierre ordenado (`ctx.destroy()`) únicamente cuando el usuario presiona combinaciones de teclas declaradas en el arreglo de salida:
  ```ts
  const stopInput = onInput((event) => {
    if (event.type !== "key") return
    const key = normalizeInputKey(event)
    if (!quitSet.has(key)) return
    ctx.destroy()
    process.exit(0)
  })
  ```
  Sin embargo, `createApp` **no vincula los eventos de señal del sistema operativo** (`SIGINT`, `SIGTERM`, `SIGHUP`) con `ctx.destroy()`.
  Cuando el usuario presiona `Ctrl+C` en terminales donde la señal no se intercepta como tecla cruda o se envía `SIGTERM` desde un gestor de procesos:
  - Solo se dispara el handler de `terminal/lifecycle.ts`.
  - `handle.destroy()` (que desmonta el árbol de Solid, ejecuta los `onCleanup` de la aplicación, destruye el loop y limpia WGPU) es completamente omitido.

### 4.4 Cuota de Memoria de Imágenes en Kitty y Doble Búfer (`r=1` / `r=2`)
* **Ubicación:** `native/libvexart/src/kitty/encoder.rs` (Líneas 98–120) y `native/libvexart/src/kitty/transport.rs` (Líneas 139–140).
* **Mecanismo Arquitectónico:**
  El protocolo gráfico de Kitty define una cuota de memoria estricta en el cliente (320 MB de textura por omisión). Si una aplicación envía cuadros completos mediante comandos de adición continua (`a=f,m=0`), Kitty reserva memoria para cada frame en su pila interna. Al superar 320 MB, el emulador rechaza la transferencia, congela el renderizado o expulsa al proceso.
* **Resolución Implementada en Vexart:**
  Vexart resuelve esto mediante un algoritmo de **Ping-Pong Double Buffering** con marcos de animación (`r=1` y `r=2`):
  - El primer cuadro crea la imagen base (`a=T,i=<id>,p=1`).
  - El segundo cuadro añade el frame de composición 1 (`a=f,i=<id>,c=1`).
  - El tercer cuadro sobreescribe explícitamente el frame 1 indicando `r=1,c=2`.
  - El cuarto cuadro sobreescribe el frame 2 indicando `r=2,c=1`.
  Gracias a esta alternancia cíclica, Kitty únicamente retiene en memoria dos cuadros concurrentes en todo momento, garantizando que el consumo en el cliente se mantenga constante (< 16 MB para 4K) y nunca alcance la cuota límite de 320 MB.

---

## 5. Auditoría de Paquetes de Alto Nivel

### 5.1 `@vexart/headless`

#### 5.1.1 Toaster (`packages/headless/src/overlays/toast.tsx`)
* **Ubicación:** Líneas 81–94, 122–126, 148–153, 175.
* **Análisis Técnico:**
  1. **Timers Zombies y Toasts Huérfanos al Desmontar `<Toaster />`:**
     El estado (`toasts`, `timers`) pertenece al closure de `createToaster()`. La rutina `onCleanup` se ubica únicamente dentro de la función de renderizado `Toaster()` (Líneas 149–152):
     ```ts
     function Toaster() {
       onCleanup(() => {
         for (const timer of timers.values()) clearTimeout(timer)
         timers.clear()
       })
       // ...
     }
     ```
     Al desmontarse `<Toaster />`, se cancelan los temporizadores `setTimeout` de `timers`, pero **el signal `toasts()` no se vacía**. Si el componente se vuelve a montar en otra ruta, los toasts vencidos reaparecen en pantalla, pero al haberse cancelado sus temporizadores y no reprogramarse, quedan congelados permanentemente como elementos zombies.
  2. **Emisión Fuera de Vista:** Si se llama a `toast()` antes de montar el componente visual o en un worker/servicio, los temporizadores corren sin un contenedor reactivo que responda por ellos en caso de un error de ciclo de vida.
  3. **Ausencia de Método de Destrucción:** `createToaster` devuelve `{ toast, dismiss, dismissAll, Toaster }`. No proporciona un método `destroy()` para desechar la instancia del factory.

#### 5.1.2 Dialog (`packages/headless/src/overlays/dialog.tsx`)
* **Ubicación:** Líneas 59–84.
* **Análisis Técnico:**
  1. **Restauración Duplicada y Desincronización de Foco:**
     En `DialogRoot`:
     ```ts
     const popScope = pushFocusScope()
     // ...
     onCleanup(() => {
       unsubscribe()
       const index = openDialogs.indexOf(close)
       if (index >= 0) openDialogs.splice(index, 1)
       popScope()
       if (savedFocusId) setFocusedId(savedFocusId)
     })
     ```
     `popScope()` ya realiza internamente la restauración del foco previo (`setFocusedId(scope.previousFocusId)`). La línea 82 vuelve a forzar `setFocusedId(savedFocusId)` de manera redundante.
  2. **Violación de Orden en Diálogos Anidados:** Si dos modales son abiertos consecutivamente (Dialog A -> Dialog B) y por una actualización de estado reactivo Dialog A se desmonta antes que Dialog B (violación del orden LIFO), `popScope()` retira el scope superior incorrecto, desincronizando la pila de foco y restaurando el foco hacia el interior de un diálogo ya cerrado.

#### 5.1.3 Tabs (`packages/headless/src/containers/tabs.tsx`)
* **Ubicación:** Líneas 88–113.
* **Análisis Técnico:**
  1. **Pérdida de Reactividad por Ausencia de Component Boundary:**
     Dentro de `<For each={props.tabs}>`, el callback de renderizado crea `ctx` con getters reactivos (`get active() { return active() === i }`) e invoca `props.renderTab(tab, ctx)` directamente como función, sin crear un componente Solid (`createComponent`). Si el renderer desestructura `active` en su signatura (`({ active }) => ...`), la reactividad se rompe de inmediato.
  2. **Aislamiento Erróneo mediante `untrack` en el Panel:**
     En `panelContent`:
     ```ts
     const panelContent = () => {
       const current = active()
       return untrack(() => {
         const tab = props.tabs[current]
         const content = tab ? tab.content() : null
         return <>{content}</>
       })
     }
     ```
     El uso de `untrack` desconecta cualquier suscripción reactiva que los componentes hijos dentro de `tab.content()` intenten inicializar durante su fase de construcción sincrónica.

---

### 5.2 `@vexart/app` & `@vexart/styled`

#### 5.2.1 Router (`packages/app/src/router/router.tsx`)
* **Ubicación:** Líneas 154, 186–188, 246–258.
* **Análisis Técnico:**
  1. **Fuga de Memoria por Historial Infinito:**
     ```ts
     setHistory((prev) => [...prev.slice(0, cursor() + 1), next])
     ```
     El router almacena todas las entradas en un array plano sin límite de profundidad (cap). En aplicaciones de monitoreo o dashboards de terminal de ejecución perpetua con navegación frecuente, `history` acumula decenas de miles de objetos de estado.
  2. **Llamada Directa a Componentes de Ruta sin `createComponent`:**
     En `RouteOutlet`:
     ```ts
     let element = Component({ params: match.params })
     for (const Layout of layouts.slice().reverse()) {
       element = Layout({ children: element, params: match.params })
     }
     ```
     Invocar componentes como funciones ordinarias elimina la barrera de aislamiento reactivo de SolidJS. Los efectos secundarios y `onCleanup` declarados dentro de las vistas de ruta quedan subordinados al contexto del `RouteOutlet` y no al de la ruta individual, produciendo limpiezas retardadas o fugas de suscripciones.
  3. **Microtarea Fantasma con Foco Inválido:**
     `restoreFocus()` encola sistemáticamente `setFocus(focusId)` mediante `queueMicrotask`, usando `"vexart-route-root"` como fallback. Si la vista de la ruta no define dicho ID o tarda múltiples cuadros en estabilizar el montaje, la búsqueda de foco falla silenciosamente tras consumir ciclos innecesarios en el microtask queue.

#### 5.2.2 Clases de Estilo y Tematización (`class-name.ts` y `theme.ts`)
* **Ubicación:** `packages/app/src/styles/class-name.ts` (Líneas 38–48) y `packages/styled/src/theme/theme.ts` (Líneas 81–91, 156–171).
* **Análisis Técnico:**
  1. **Caché No Acotada en `className`:**
     `const cache = new Map<string, ClassNameResolveResult>()` memoiza la interpretación de cadenas de utilidades de estilo. No tiene tamaño máximo ni desalojo LRU, acumulando combinaciones arbitrarias indefinidamente.
  2. **Desincronización de Colores ante `setTheme`:**
     Las utilidades resuelven colores hex estáticos al momento de parsear y los guardan en `cache`. Cuando el usuario cambia el tema mediante `setTheme()`, las clases ya cacheadas en `className` **no se invalidan automáticamente**; continúan devolviendo los valores hexadecimales antiguos a menos que se invoque manualmente `clearClassNameCache()`.
  3. **Mutación Global sin Limpieza en `ThemeProvider`:**
     ```ts
     export function ThemeProvider(props: { theme?: Required<ThemeDefinition>; children?: JSX.Element }) {
       if (props.theme) {
         setTheme(props.theme) // <-- MUTACIÓN DEL SINGLETON GLOBAL
       }
       // ...
     }
     ```
     `ThemeProvider` muta el singleton global `colorSignals`. No guarda el tema previo ni registra un `onCleanup` para restaurarlo cuando el componente se desmonta. El uso de un `ThemeProvider` local para estilizar un diálogo o subsección corrompe irreversiblemente el tema global de toda la aplicación.

---

## 6. Matriz de Priorización y Plan de Acción (Fases de Mitigación)

### 6.1 Matriz de Severidad e Impacto

| ID | Subsistema / Componente | Severidad | Impacto Primario | Archivos Afectados | Estrategia de Mitigación |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **LC-01** | Terminal Lifecycle | **CRÍTICA** | Terminal inutilizable al salir con SIGINT (Raw mode/hidden cursor). | `packages/engine/src/terminal/lifecycle.ts`<br>`packages/engine/src/terminal/index.ts` | Reemplazar `stdout.write` asíncrono en exit handlers por `fs.writeSync(1, ...)` síncrono antes de `process.exit`. |
| **LC-02** | Rust FFI Context | **CRÍTICA** | Fuga permanente de Device WGPU, Pipelines y VRAM al destruir loop. | `native/libvexart/src/lib.rs`<br>`native/libvexart/src/paint/mod.rs` | Implementar `vexart_context_destroy` real que extraiga y limpie `SHARED_PAINT.take()` liberando recursos GPU. |
| **LC-03** | Pointer Scheduler Lock | **CRÍTICA** | Bloqueo a 120 FPS / 100% CPU lock si un nodo con captura se desmonta. | `packages/engine/src/reconciler/reconciler.ts`<br>`packages/engine/src/loop/loop.ts` | En `removeNode`, comprobar si `pointer.capturedNodeId === node.id` o descendiente y forzar release inmediato. |
| **LC-04** | POSIX SHM Transport | **ALTA** | Fuga de buffers en `/dev/shm` tras cierres abruptos o panics. | `native/libvexart/src/kitty/shm.rs`<br>`native/libvexart/src/kitty/transport.rs` | Instalar hook `atexit` / signal handler en Rust para iterar y desvincular (`shm_unlink`) handles pendientes. |
| **LC-05** | Layout Adapter Retention | **ALTA** | Retención de miles de nodos huérfanos (`_allNodes`) en el heap de JS. | `packages/engine/src/loop/layout-adapter.ts` | Limpiar con `null` los índices huérfanos en `beginLayout()` y truncar arrays en `destroy()`. |
| **LC-06** | GPU Backend Sprites | **ALTA** | Texturas de canvas, transform y backdrop quedan vivas en GPU al salir. | `packages/engine/src/ffi/gpu-renderer-backend.ts` | Invocar `clearSpriteCaches()` en `backend.destroy()` y al redimensionar en `getFinalFrameTarget`. |
| **LC-07** | Focus Lifecycle Order | **ALTA** | Excepciones y corrupción de foco por orden invertido de teardown. | `packages/engine/src/mount.ts`<br>`packages/engine/src/reconciler/focus.ts` | Invertir orden en `mount.destroy`: ejecutar `dispose()` de SolidJS primero y `resetFocus()` después. Validar existencia en pop. |
| **LC-08** | App Signal Integration | **ALTA** | Teardown de Solid y WGPU es salteado por completo en `createApp` ante SIGINT. | `packages/app/src/runtime/create-app.ts` | Escuchar `SIGINT`/`SIGTERM` en `createApp` para disparar `ctx.destroy()` ordenadamente. |
| **LC-09** | Compositor Descriptors | **MEDIA** | Descriptores de animación huérfanos tras eliminar elementos del DOM. | `packages/engine/src/reconciler/reconciler.ts`<br>`packages/engine/src/animation/compositor-path.ts` | Invocar `deregisterAllDescriptors(node.id)` recursivamente en `removeNode`. |
| **LC-10** | Headless Toaster | **MEDIA** | Toasts zombies permanentes y timers no cancelados al desmontar vista. | `packages/headless/src/overlays/toast.tsx` | Resetear signal `toasts([])` al desmontar `Toaster` y proveer método explícito `destroy()`. |
| **LC-11** | Headless Dialog | **MEDIA** | Restauración ciega/duplicada de foco y colapso en modales no-LIFO. | `packages/headless/src/overlays/dialog.tsx` | Eliminar restauración manual redundante en `onCleanup` y gestionar scopes con stack indexado estricto. |
| **LC-12** | Headless Tabs | **MEDIA** | Pérdida de reactividad en headers e invalidación de contexto reactivo. | `packages/headless/src/containers/tabs.tsx` | Envolver renderizado de tabs en `createComponent` y remover `untrack` innecesario del panel. |
| **LC-13** | App Router History | **MEDIA** | Crecimiento no acotado de la pila de historial en sesiones largas. | `packages/app/src/router/router.tsx` | Implementar límite deslizante (LRU/cap de 50 entradas) y renderizar rutas vía `createComponent`. |
| **LC-14** | ThemeProvider Scope | **MEDIA** | Mutación del tema global que afecta toda la app sin restauración al salir. | `packages/styled/src/theme/theme.ts`<br>`packages/app/src/styles/class-name.ts` | Implementar `onCleanup` en `ThemeProvider` para restaurar tema previo; purgar `cache` de `className` en `setTheme`. |
| **LC-15** | Dynamic Colors & Fonts | **BAJA** | Crecimiento ilimitado de `_colorCache` y mapa de registro de fuentes. | `packages/engine/src/ffi/node.ts`<br>`packages/engine/src/ffi/text-layout.ts` | Añadir límite LRU (1024 entradas) a `_colorCache` y exponer `unregisterFont`. |

---

### 6.2 Plan de Mitigación por Fases

#### Fase 1: Estabilidad de Proceso y Terminal (Inmediata / P0)
* **Objetivo:** Garantizar que la salida de la aplicación nunca corrompa el terminal del usuario y que los recursos del sistema operativo no se fuguen.
1. **LC-01:** Modificar `packages/engine/src/terminal/lifecycle.ts` para que `leave()` acepte o utilice internamente `fs.writeSync(1, ...)` cuando se ejecuta dentro de los exit handlers de señales.
2. **LC-08:** Actualizar `packages/app/src/runtime/create-app.ts` agregando listeners para `process.on("SIGINT", ...)` y `process.on("SIGTERM", ...)` que ejecuten `ctx.destroy()`.
3. **LC-04:** En `native/libvexart/src/kitty/shm.rs`, implementar un destructor / handler de salida que recorra `KITTY_SHM_HANDLES` y aplique `shm_unlink` para cada segmento remanente.

#### Fase 2: CPU y Fugas en Reconciliador / Layout (P1)
* **Objetivo:** Eliminar picos de 100% CPU lock en el scheduler y purgar referencias huérfanas en el heap de JavaScript.
1. **LC-03:** En `packages/engine/src/reconciler/reconciler.ts` (`removeNode`), consultar el estado del puntero (`loop.releasePointerCaptureIfHeld(node.id)`) para desbloquear `hasRecentInteraction()`.
2. **LC-05:** En `packages/engine/src/loop/layout-adapter.ts`, vaciar los slots huérfanos con `null` en `beginLayout()` y asegurar `_allNodes.length = 0` en `destroy()`.
3. **LC-09:** Integrar `deregisterAllDescriptors(node.id)` dentro del pase de desregistro de subárboles en `removeNode`.
4. **LC-07:** Reordenar el teardown en `mount.ts`: ejecutar `dispose()` antes de `resetFocus()`. En `focus.ts`, validar que `previousFocusId` exista en el registro activo antes de reasignarlo.

#### Fase 3: Recursos Nativos WGPU y Cachés FFI (P1)
* **Objetivo:** Garantizar que la memoria de video y pipelines en GPU se liberen completamente.
1. **LC-02:** En `native/libvexart/src/lib.rs`, sustituir el cuerpo de `vexart_context_destroy` para que extraiga el contexto global `SHARED_PAINT.lock().unwrap().take()` y ejecute el desmantelamiento de pipelines y buffers.
2. **LC-06:** En `packages/engine/src/ffi/gpu-renderer-backend.ts`, invocar `clearSpriteCaches()` dentro del método `destroy()` y en la rama de redimensionamiento de `getFinalFrameTarget`.
3. **LC-15:** Limitar `_colorCache` en `node.ts` con una política LRU acotada a 1,024 elementos.

#### Fase 4: Componentes Headless, App Framework y Estilos (P2)
* **Objetivo:** Corregir ciclos de vida de interfaz, modales, toasters y scoping de temas.
1. **LC-10:** En `packages/headless/src/overlays/toast.tsx`, resetear el signal `toasts` al desmontar el visual y agregar método `destroy()` a `ToasterHandle`.
2. **LC-11:** En `packages/headless/src/overlays/dialog.tsx`, eliminar la restauración redundante de foco en `onCleanup`.
3. **LC-12:** En `packages/headless/src/containers/tabs.tsx`, instanciar tabs mediante `createComponent` y eliminar `untrack` en el panel activo.
4. **LC-13:** En `packages/app/src/router/router.tsx`, limitar el historial a un máximo de 50 entradas y renderizar vistas con `createComponent`.
5. **LC-14:** En `packages/styled/src/theme/theme.ts`, guardar el tema previo en `ThemeProvider` y restaurarlo en `onCleanup`; llamar a `clearClassNameCache()` dentro de `setTheme()`.
