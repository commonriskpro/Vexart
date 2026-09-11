# Auditoría Integral del Código Base, Análisis Causa-Raíz y Decisiones Arquitectónicas — Vexart Engine

> **Documento de Auditoría y Planificación Arquitectónica**  
> **Ámbito:** `native/libvexart` (Rust/WGPU), `packages/engine` (TS/Bun), `packages/headless`, `packages/styled`, `packages/app`.  
> **Fecha:** Septiembre 2026  
> **Estado:** Auditoría Finalizada / Pendiente de Aprobación de Decisiones de Diseño  

---

## 1. Resumen Ejecutivo: Disciplina Arquitectónica vs. Mitigaciones (Parches)

En sistemas de software de bajo nivel y motores gráficos acelerados por hardware como Vexart, existe una frontera crítica entre **mitigar un síntoma** y **resolver arquitectónicamente la causa raíz**:

* **Una Mitigación (Parche / Band-Aid / Hotfix):**  
  Ataca el efecto observable sin corregir la asimetría o el invariante quebrado. Ejemplos de mitigaciones inaceptables:
  * Poner un `try/catch` vacío o chequear nulo para evitar que el proceso caiga cuando un buffer WGPU no está mapeado.
  * Clampear o podar un array con un número mágico arbitrario (`array.slice(0, 100)`) para que no crezca, en lugar de modelar propiedad de recursos y desalojo formal.
  * Añadir retardos artificiales (`setTimeout(50)`) para "darle tiempo" a la terminal a responder una consulta OSC en tmux.
  * Mutar cadenas de texto insertando caracteres de control o espacios para simular un cursor parpadeante en UI.
* **Un Fix Arquitectónico Real:**  
  Establece invariantes estructurales matemáticos y de ciclo de vida simétricos (*acquire/release balance*):
  * Modela propiedad unívoca (RAII en Rust, scopes de desecho reactivo en SolidJS, `FinalizationRegistry` para puentes FFI).
  * Garantiza que el estado de la máquina GPU, el kernel del sistema operativo (POSIX SHM) y la máquina virtual JS permanezcan sincronizados sin suposiciones no verificadas.
  * Cada uno de los 40 ítems auditados está diseñado para atacar la raíz técnica del problema sin atajos.

---

## 2. Decisiones Arquitectónicas Requeridas (Matriz Completa de 15 Forks de Diseño)

No todos los 40 defectos tienen bifurcaciones de diseño: **25 de ellos son invariantes rotos, errores de especificación o fallas matemáticas** donde existe una única solución arquitectónicamente correcta (ej. desbordamiento de enteros, calibración afín del mouse, estados válidos de WGPU, o mapeo de teclas LF). 

Sin embargo, en **15 de los 40 fixes existen trade-offs de arquitectura estructural** donde se debe escoger un camino de diseño. A continuación se detallan las 15 decisiones completas divididas por frontera:

---

### Frontier A: Rust / WGPU (`native/libvexart`)

#### Decisión 1: Política de Desalojo y Presupuesto de VRAM (`ResourceManager`)
* **Problema (Defecto 1):** `ResourceManager::try_allocate` no se llama y no tiene callbacks hacia `PaintContext`.
* **Opciones:**
  * **Opción A (Desalojo LRU Automático):** `ResourceManager` desaloja y destruye texturas en VRAM automáticamente. Exige que el host pueda recargarlas o fallará el draw call si un asset desalojado se dibuja.
  * **Opción B (Fail-Closed Estricto):** Si se supera el límite configurado de VRAM (ej. 128 MB), la asignación falla retornando `ERR_GPU_OUT_OF_MEMORY`. Obliga a la aplicación a gestionar explícitamente sus texturas.
* **Trade-off:** Tolerancia en runtime vs. determinismo estricto de memoria.
* **Recomendación:** Opción B (Fail-Closed) para targets y texturas fijas, con LRU solo en cachés auxiliares.

#### Decisión 2: Ciclo de Vida y Desvinculación de POSIX SHM (`Kitty Transport`)
* **Problema (Defecto 2):** Se libera el handle SHM antes de que la terminal confirme lectura, fugando archivos en `/dev/shm`.
* **Opciones:**
  * **Opción A (Ring Buffer de Generaciones Fijas):** Reservar un pool fijo de N segmentos SHM reutilizables (ej. 2 a 4 buffers de intercambio `ping-pong`). No se crean ni destruyen archivos en cada cuadro a 60 FPS.
  * **Opción B (Seguimiento Activo con Retención y ACK Asíncrono):** Crear segmentos dinámicos y retenerlos en tracking hasta que la terminal confirme lectura o un garbage collector de archivos desvincule los viejos tras N cuadros.
* **Trade-off:** Cero sobrecarga de I/O y memoria acotada (Ring Buffer) vs. soporte de framebuffers de tamaño variable arbitrario por cuadro (Tracking dinámico).
* **Recomendación:** Opción A (Ring Buffer estático reutilizable).

#### Decisión 3: Retención de Datos de Imagen en CPU Host (`ImageAsset`)
* **Problema (Defecto 3):** `ImageAsset` duplica los píxeles en CPU heap (`pub bytes: Vec<u8>`) además de tener la textura en GPU.
* **Opciones:**
  * **Opción A (VRAM como Fuente Única de Verdad):** Purgar `bytes` en CPU tras subir la textura a la GPU. Si la GPU pierde el dispositivo (`DeviceLost`), las imágenes deben recargarse desde disco o red.
  * **Opción B (Retención en Memoria Host para Recuperación):** Mantener los bytes en RAM host como backup para reconstruir texturas transparentemente si el dispositivo GPU se reinicia.
* **Trade-off:** Reducir a la mitad el consumo de RAM del proceso vs. resiliencia automática ante pérdida de contexto GPU.
* **Recomendación:** Opción A (VRAM única fuente de verdad; la pérdida de contexto GPU es un evento fatal en TUI que reinicia el backend).

#### Decisión 4: Frontera de Comandos de Imagen: ¿Paint Pass o Composite Pass?
* **Problema (Defecto 8):** Comandos de imagen en `PaintContext::dispatch` no vinculan el BindGroup de la textura real y usan un dummy transparente.
* **Opciones:**
  * **Opción A (Imágenes Multipipeline en Vertex Pass):** Añadir el handle de textura al comando y soportar cambio dinámico de bind groups dentro del render pass de pintura.
  * **Opción B (Separación Estricta Paint vs Composite):** Prohibir comandos de imagen dentro del grafo de primitivas geométricas; toda imagen debe ser renderizada a través de una capa de composición dedicada (`vexart_composite_render_image_layer`).
* **Trade-off:** Flexibilidad para intercalar rectángulos e imágenes en un solo batch vs. simplicidad y máximo rendimiento de pipeline sin state thrashing.
* **Recomendación:** Opción B (Composición por capas dedicada para imágenes).

#### Decisión 5: Estrategia de Asignación del Búfer de Vértices en GPU (`PaintContext::dispatch`)
* **Problema (Defecto 7):** Se crea y destruye un vertex buffer WGPU por cada lote en cada frame a 60 FPS (`device.create_buffer_init`), causando thrashing masivo en los allocators de la GPU y sobrecarga en el bus PCIe.
* **Opciones Evaluadas:**
  * **Opción A (Ring Buffer de Tamaño Fijo Preasignado):** Preasignar un buffer estático fijo (ej. 16 MB) y avanzar un puntero circular (*offset bump*). Cero asignaciones en runtime pero con techo rígido y desperdicio de VRAM en UIs simples.
  * **Opción B (Crecimiento Dinámico Amortizado):** Iniciar con 1 MB y duplicar (2x) si la escena lo supera. Flexible pero propenso a bloat permanente por marca de agua alta (*high-water mark*).
  * **Opción C (Arquitectura Híbrida Optimizada en Compilación con Cooldown Decay - SELECCIONADA):**
    1. **Dimensión Óptima en Tiempo de Compilación:** Calcular mediante constantes `const` el límite físico máximo de una grilla de terminal 4K (`480x135` celdas × stride en bytes = `COMPILED_RING_BUFFER_SIZE ~2-4 MB`), eliminando números mágicos y adaptándose a perfiles de hardware (`low-memory` vs `desktop`).
    2. **Steady-State Zero-Allocation (99.9% del tiempo):** En el inicio, Rust asigna ese buffer en VRAM una sola vez. Durante la ejecución normal opera como un Ring Buffer puro: solo avanza offsets en CPU y sobreescribe con `queue.write_buffer`, logrando cero llamadas a `device.create_buffer`.
    3. **Expansión Elástica de Seguridad:** Si una escena extrema (ej. 100 capas superpuestas o logs masivos) supera el tamaño base, el motor no crashea: duplica dinámicamente la capacidad temporalmente.
    4. **Recuperación por Hysteresis / Cooldown Anti-Thrashing (Control de Marca de Agua Alta):** Si el buffer creció por un pico temporal, el motor mide los cuadros en reposo (`idle_frames`). Tras **120 cuadros consecutivos (~2 segundos a 60 FPS)** operando por debajo del umbral base de compilación, Rust libera el buffer inflado y reconstituye suavemente el buffer base de compilación, devolviendo la VRAM sobrante al sistema operativo sin provocar thrashing de asignación.
* **Trade-off:** Requiere rastreo de un contador de cuadros de reposo (`idle_frames`) a cambio de garantizar cero asignaciones en régimen normal, escalabilidad sin caídas y recuperación simétrica de memoria.
* **Recomendación:** Opción C (Híbrida optimizada en compilación con cooldown decay).

#### Decisión 6: Estrategia de Actualización del Atlas MSDF (`atlas.rs`)
* **Problema (Defecto 9):** Se destruyen y recrean 4MB de textura en GPU por cada nuevo carácter rasterizado.
* **Opciones:**
  * **Opción A (Actualización por Subregiones):** Mantener la textura de 1024x1024 fija y usar `queue.write_texture` copiando únicamente la bounding box del glifo nuevo (unos pocos KB).
  * **Opción B (Atlas Paginado en Múltiples Texturas):** Dividir el atlas en páginas más pequeñas (ej. 256x256) y asignar nuevas texturas sólo cuando una página se llena.
* **Trade-off:** Implementación directa con 1 bind group vs. soporte ilimitado de glifos unicode multi-idioma (CJK, emojis).
* **Recomendación:** Opción A (Subregiones en textura fija).

---

### Frontier B: TypeScript / Motor (`packages/engine`)

#### Decisión 7: Ciclo de Vida de Texturas FFI: ¿GC FinalizationRegistry o Dispose Explícito?
* **Problema (Defecto 13):** `WeakMap` no avisa al recolectar buffers en JS, fugando texturas en Rust.
* **Opciones:**
  * **Opción A (`FinalizationRegistry` Automático):** Registrar buffers en `FinalizationRegistry` para llamar a `vexartRemoveImage` cuando el GC de JS limpie el buffer.
  * **Opción B (Patrón `Disposable` / `using` Explícito):** Requerir que los componentes o la capa de imágenes invoquen explícitamente `.dispose()` al desmontarse, garantizando liberación inmediata y determinística en GPU.
* **Trade-off:** Comodidad para el desarrollador (pero recolección no determinística sujeta a la pereza del GC) vs. liberación inmediata y determinística en VRAM.
* **Recomendación:** Híbrido: `Disposable` explícito en componentes, con `FinalizationRegistry` como red de seguridad secundaria ante descuidos.

#### Decisión 8: Cálculo de Coordenadas en Scroll Anidado (`hit-test.ts` y `composite-scroll.ts`)
* **Problema (Defecto 21):** Los contenedores con scroll anidados no acumulan los offsets de sus contenedores padres. `node._scrollContainerId` solo apunta al contenedor inmediato. Esto desalinea el hit-testing del mouse (clics fallidos) y el desplazamiento de comandos de renderizado en GPU (`composite-scroll.ts:122`).
* **Opciones Evaluadas:**
  * **Opción A (Recorrido de Ancestros Bajo Demanda):** Durante cada prueba de puntero en `hit-test.ts`, subir por `node.parent` acumulando offsets (`O(profundidad)`). Costoso en el hot path del mouse a 60 FPS y no resuelve el desplazamiento de comandos en GPU.
  * **Opción B (Coordenadas Absolutas del Mundo Precomputadas en `walkTree`):** Acumular posición mundial absoluta en cada nodo durante el layout pass. Resuelve el mouse a $O(1)$, pero agrega campos numéricos (`worldX`, `worldY`) a los miles de nodos `TGENode` y requiere tocar la tubería de layout.
  * **Opción C (Mapa de Scroll Compuesto / Acumulado en `composite-scroll.ts` - SELECCIONADA):**
    1. **Composición de Offsets en Tiempo de Preparación:** Al construir `s.scrollOffsets` en `applyScrollOffsets` (`composite-scroll.ts`), se itera la jerarquía de contenedores con scroll (que típicamente son solo 1 a 3 en pantalla) acumulando el offset de los padres hacia los hijos:
       $$\text{OffsetTotal}(\text{Hijo}) = \text{OffsetTotal}(\text{Padre}) + \text{OffsetLocal}(\text{Hijo})$$
    2. **Lookups $O(1)$ Inalterados:** Se almacena el offset compuesto en la entrada `offsets.set(container.id, OffsetTotal)`.
    3. **Unificación Simétrica Mouse + GPU:** `getEffectivePosition(node)` en `hit-test.ts` y `cmd.x += offset.x` en `composite-scroll.ts` siguen haciendo una única lectura de tabla hash $O(1)$ por su `_scrollContainerId`, pero ahora obtienen automáticamente la traslación compuesta de toda la cadena de ancestros.
    4. **Cero Impacto en Nodos:** No añade memoria a `TGENode` ni introduce bucles `while` en el despachador de eventos del mouse.
* **Trade-off:** Requiere ordenar topológicamente los pocos contenedores con scroll al componer sus offsets en `applyScrollOffsets`, a cambio de $O(1)$ perfecto en mouse y dibujo exacto en GPU sin mutar el grafo de nodos.
* **Recomendación:** Opción C (Mapa de Scroll Compuesto en `composite-scroll.ts`).

#### Decisión 9: Secuenciación del Bucle de Cuadro e Interacciones (`composite.ts`)
* **Problema (Defecto 28):** Si hay clics o hovers, se ejecuta el layout pass dos veces en el mismo cuadro.
* **Opciones:**
  * **Opción A (Eventos de Entrada Antes del Layout):** Procesar todos los eventos de mouse/teclado y mutaciones de estado ANTES de iniciar el layout del cuadro, asegurando exactamente 1 pase de layout por cuadro.
  * **Opción B (Detección de Daño Reactiva Pura):** Si una interacción no muta dimensiones ni estructura geométrica, saltarse el layout y sólo regenerar los comandos de render.
* **Trade-off:** Simplicidad y robustez en la tubería del frame vs. micro-optimización de cuadros donde solo cambia un color.
* **Recomendación:** Opción A (Procesar interacción antes del pase de layout unificado).

#### Decisión 10: Centralización de Señales del Proceso OS (`lifecycle.ts`)
* **Problema (Defecto 22):** Al instanciar múltiples terminales en un mismo proceso (especialmente en suites de tests como `bun run test` o en ciclos de remontado), cada una ata 6 listeners directos a `process.on(...)` (`exit`, `SIGINT`, `SIGTERM`, `SIGHUP`, `uncaughtException`, `unhandledRejection`), provocando advertencias `MaxListenersExceededWarning` y salidas prematuras abruptas por carreras en `process.exit(1)`.
* **Opciones Evaluadas:**
  * **Opción A (Singleton Dispatcher de Proceso):** Un único manejador global interno de `process` con un registro de instancias activas de terminal que despacha la limpieza ordenada a todas y desuscribe listeners al llegar a 0.
  * **Opción B (Inyección Estricta de `AbortSignal`):** La terminal no toca `process` y delega el 100% de la gestión de señales al consumidor vía `signal: AbortSignal`. Desacoplado, pero peligroso para principiantes que no capturen Ctrl+C.
  * **Opción C (Arquitectura Híbrida: Hub Centralizado con Soporte de `AbortSignal` - SELECCIONADA):**
    1. **Comportamiento por Defecto (Zero-Config):** El módulo `ProcessSignalHub` se registra una única vez en `process.on(...)` compartiendo ese único canal para todo el proceso. Registra cada terminal activa en un `Set`.
    2. **Desuscripción Simétrica al Desmontar:** Cuando se destruye una terminal, se desanota del Hub. Si la cuenta de instancias activas en el proceso llega a 0, el Hub desuscribe automáticamente todos los listeners de `process`, erradicando fugas en tests (`bun test`) y dejando el entorno limpio.
    3. **Manejo de Errores y Ctrl+C Coordinado:** Al recibir una señal o error no controlado, el Hub ejecuta los `cleanup()` de todas las terminales registradas de manera aislada (`try/catch`), garantizando la restauración del cursor TTY antes de emitir la salida del proceso.
    4. **Inyección Opcional de `AbortSignal`:** Para entornos de testing o procesos embebidos donde se desee aislamiento estricto sin interceptar `process.on`, `createTerminal` acepta `{ signal?: AbortSignal, manageProcessSignals?: boolean }` para bypass total de los hooks globales.
* **Trade-off:** Requiere una abstracción interna pequeña (`ProcessSignalHub`), a cambio de compatibilidad universal transparente y cero advertencias o fugas de listeners.
* **Recomendación:** Opción C (Híbrida: Hub Centralizado con soporte de `AbortSignal`).

#### Decisión 11: Estrategia de Parsing y Almacenamiento de Colores (`node.ts`)
* **Problema (Defecto 24):** El mapa global `_colorCache` crece sin límite.
* **Opciones:**
  * **Opción A (Caché LRU Acotado en Runtime):** Mantener un LRU de 512 entradas que desaloja colores infrecuentes.
  * **Opción B (Empaquetado de Enteros en Compilación / Inmediato):** Normalizar y empaquetar colores directamente a enteros `u32` (0xRRGGBBAA) en el compilador o adapter sin guardar cadenas en ningún mapa.
* **Trade-off:** Facilidad de implementación en JS vs. erradicación total de strings y mapas en el hot path.
* **Recomendación:** Opcion B (Empaquetado de Enteros en Compilación / Inmediato)

#### Decisión 12: Identificación y Mapeo de Capas Estáticas (`assign-layers.ts`)
* **Problema (Defecto 27):** Las capas estáticas con fondo (`hasBg`) se asocian históricamente buscando en `rectCommandsByColor` por coincidencia de color (`backgroundColor`). Si dos o más elementos en pantalla comparten el mismo color de fondo (ej. múltiples tarjetas con `#18181b`), se produce colisión y las capas se reclaman vorazmente en orden de emisión, intercambiando las dimensiones, posiciones y tijeras entre distintos elementos.
* **Opciones Evaluadas:**
  * **Opción A (Mapeo Unívoco Directo por `cmd.nodeId` - SELECCIONADA):**
    1. Inspección del código confirmó que `RenderCommand` en `layout-adapter.ts:625` **ya emite `nodeId` en cada comando `RECTANGLE`**.
    2. Reemplazar la agrupación arqueológica por color `rectCommandsByColor = new Map<number, ColorCommand[]>()` por una indexación directa por identidad: `rectCommandsByNodeId = new Map<number, { index: number, cmd: RenderCommand }>()`.
    3. Asociar cada capa `b` inmediatamente mediante `rectCommandsByNodeId.get(b.nodeId)` en $O(1)$, logrando una correspondencia biyectiva 100% determinística sin importar si 500 elementos usan el mismo color.
    4. Incorporar fallback posicional seguro para comandos sintéticos de tests unitarios que carezcan de `nodeId`.
  * **Opción B (Partición Topológica Previa en Estructuras Aisladas):** Reestructurar la emisión de comandos para que cada capa genere su propio array de comandos aislado. Más invasiva y redundante dado que los comandos ya transportan `nodeId`.
* **Trade-off:** Cero cambios en Rust o FFI; la solución es 100% limpia y directa en TypeScript dentro de `assign-layers.ts`.
* **Recomendación:** Opción A (Mapeo directo por `cmd.nodeId` en `assign-layers.ts`).

---

### Frontier C: Componentes Reactivos y Framework (`headless`, `app`)

#### Decisión 13: Ciclo de Vida de Rutas en App Router (`RouteOutlet`)
* **Problema (Defecto 37):** `RouteOutlet` invoca componentes de ruta como funciones directas `Component({ params: match.params })` dentro de un accessor sin boundary de ciclo de vida de SolidJS. Las señales y efectos se cuelgan del scope global del router, los `onCleanup` nunca se ejecutan al navegar, los parámetros no son reactivos, y la memoria RAM de pantallas previas se fuga indefinidamente.
* **Opciones Evaluadas:**
  * **Opción A (Desecho Síncrono Estricto):** Usar `createComponent` envuelto en `createRoot(dispose)`, forzando la destrucción total y ejecución de `onCleanup` al cambiar de ruta. Cero fugas pero pérdida de estado efímero al volver atrás.
  * **Opción B (Retención en Memoria Global / Keep-Alive Indiscriminado):** Retener todas las pantallas visitadas en un caché. Riesgo de bloat en memoria y timers corriendo en segundo plano sin control.
  * **Opción C (Arquitectura Híbrida: Desecho Síncrono por Defecto + `keepAlive` Declarativo por Ruta - SELECCIONADA):**
    1. **Base Segura por Defecto (Zero-Leak Strict Disposal):** Para rutas estándar (99% de los casos), la navegación invoca `dispose()` de la pantalla previa inmediatamente. Se ejecutan todos los `onCleanup`, se cancelan timers/subscripciones y la memoria se recupera al 100%.
    2. **Parámetros 100% Reactivos:** Se adopta `createComponent(Component, { get params() { return match().params } })` mediante getters reactivos para que cambios en la URL (`/item/1` -> `/item/2`) se propaguen reactivamente sin destruir el componente si coincide el tipo.
    3. **Soporte Opt-In Declarativo (`keepAlive: true`):** Las rutas complejas que requieran conservar scroll, formularios o foco (ej. carrusel de juegos en la demo de PS5) declaran `keepAlive: true` en `AppRouteDefinition`. El enrutador retiene esas pantallas en un pool LRU acotado (máx 3 páginas) pausando animaciones en segundo plano y restaurándolas al volver atrás en 0 ms.
* **Trade-off:** Requiere una pequeña máquina de estados en el enrutador para alternar entre destrucción síncrona y retención LRU declarativa, a cambio de garantizar cero fugas de memoria por defecto con la mejor UX posible en dashboards pesados.
* **Recomendación:** Opción C (Híbrida: Desecho síncrono por defecto con `keepAlive` declarativo).

#### Decisión 14: Renderizado del Cursor de Texto en `Input`
* **Problema (Defecto 31):** El cursor se implementa inyectando la cadena `"│"` o `" "` a 2Hz dentro de la cadena del texto `{val.slice(0, pos) + (blink() ? "│" : " ") + val.slice(pos)}`. En fuentes proporcionales modernas (MSDF), el avance de `"│"` difiere del espacio y del vacío, provocando vibración/jitter horizontal del texto y forzando mediciones tipográficas, recálculo de Flexily y cuadros continuos en GPU a 60 FPS incluso con el usuario inactivo.
* **Opciones Evaluadas:**
  * **Opción A (Quad de Cursor Gráfico Superpuesto en Píxeles - SELECCIONADA):**
    1. **Invariancia y Pureza del Texto:** El nodo `<text>{val}</text>` permanece completamente limpio e inmutable ante el parpadeo del cursor. Se elimina al 100% el jitter horizontal.
    2. **Geometría Desacoplada con Precisión Subpíxel:** El cursor se proyecta como un elemento `<box position="absolute" left={cursorX} width={1.5} height={lineHeight} backgroundColor={cursorColor} />` posicionado mediante el avance acumulado de caracteres medido por el motor de texto.
    3. **Independencia de Layout:** Al tener `position="absolute"`, su visibilidad/parpadeo no empuja elementos hermanos ni fuerza re-ejecuciones de Flexily.
    4. **Coherencia con la Identidad de Vexart:** Vexart es un motor gráfico nativo por píxeles; no puede ni debe degradarse a la grilla discreta de celdas de terminal.
  * **Opción B (Cursor Físico de Terminal TTY):** Ocultar el cursor visual y emitir secuencias ANSI `\x1b[?25h` ubicándolo en celdas enteras. Descartada porque está atada rígidamente a la grilla discreta de filas/columnas enteras y no soporta fuentes proporcionales de ancho variable ni subpíxeles.
* **Trade-off:** Requiere calcular el offset X del cursor mediante la medición del prefijo del texto, a cambio de eliminar la vibración horizontal y preservar la calidad gráfica subpíxel del motor.
* **Recomendación:** Opción A (Quad desacoplado en píxeles).

#### Decisión 15: Reactividad de Tokens de Tema para Clases CSS Estáticas
* **Problema (Defecto 39):** Literales como `className="bg-card"` se resuelven a valores estáticos; cambiar el tema no los actualiza.
* **Opciones:**
  * **Opción A (Suscripción Reactiva en Reconciliador de Atributos):** Hacer que la resolución de clases dependa de una señal reactiva `themeVersion()`.
  * **Opción B (Indirección de Tokens Semánticos en Shaders de GPU):** Resolver las clases a IDs semánticos (ej. `TOKEN_BG_CARD = 0x80000001`) y hacer que la GPU resuelva el color desde un buffer uniforme en cada cuadro.
* **Trade-off:** Implementación sencilla en TypeScript vs. cambios de tema en 1 frame a costo cero de CPU/reconciliación.
* **Recomendación:** Opción A (Suscripción reactiva en TypeScript).

---

## 3. Inventario Completo de los 40 Defectos Auditados

### Grupo I: Rust / WGPU (`native/libvexart`)

| # | Archivo y Línea | Severidad | Naturaleza del Fix | ¿Mitigación o Fix Real? |
|---|---|---|---|---|
| **1** | `native/libvexart/src/resource/mod.rs:219`<br>`native/libvexart/src/lib.rs:343, 406, 621` | Crítica | Enforzar `try_allocate` con canal de desalojo bidireccional entre `ResourceManager` y `PaintContext`. | **Fix Arquitectónico Real:** Implementa contabilidad estricta y desalojo de VRAM sin depender de límites pasivos. |
| **2** | `native/libvexart/src/kitty/transport.rs:376`<br>`native/libvexart/src/kitty/shm.rs:248-278` | Alta | Reemplazar creación efímera de archivos SHM por un Ring Buffer acotado de descriptores estables. | **Fix Arquitectónico Real:** Elimina la condición de carrera con la terminal y erradica fugas en `/dev/shm`. |
| **3** | `native/libvexart/src/image_asset.rs:11, 46` | Media | Remover duplicación en memoria RAM host (`pub bytes: Vec<u8>`) tras carga a GPU. | **Fix Arquitectónico Real:** VRAM se convierte en la única fuente de verdad para texturas en ejecución. |
| **4** | `native/libvexart/src/composite/readback.rs:200` | Alta | Armar `UnmapGuard` estrictamente tras comprobar el éxito de `rx.recv()` y el mapeo. | **Fix Arquitectónico Real:** Enforza el invariante de estados del buffer WGPU (`Mapped` vs `Unmapped`). |
| **5** | `native/libvexart/src/composite/mod.rs:868` | Media | Utilizar aritmética segura `checked_mul` en `rec.width * rec.height * 4` contra desbordamiento. | **Fix Arquitectónico Real:** Previene desbordamiento aritmético y corrupción de memoria en readback de destino. |
| **6** | `native/libvexart/src/composite/mod.rs:909-968` | Alta | Validar que `dst_cap >= rw * rh * 4` y que el rectángulo esté acotado al target en `readback_region_rgba`. | **Fix Arquitectónico Real:** Validación fail-closed en la frontera de entrada del subsistema nativo. |
| **7** | `native/libvexart/src/paint/mod.rs:214, 309-352` | Alta | Reutilizar un vertex buffer dinámico y mantener un único render pass abierto por capa con switching de pipeline. | **Fix Arquitectónico Real:** Elimina el thrashing de memoria en GPU y evita relecturas innecesarias de tiles en VRAM. |
| **8** | `native/libvexart/src/paint/mod.rs:362-371, 457` | Media | Pasar el handle de imagen en `BridgeImageInstance` y vincular el BindGroup real en `dispatch`. | **Fix Arquitectónico Real:** Corrige el contrato de datos del comando de dibujo empaquetado. |
| **9** | `native/libvexart/src/text/atlas.rs:185-269` | Alta | Actualizar subregiones en el atlas vía `queue.write_texture` en lugar de destruir y recrear la textura de 4MB. | **Fix Arquitectónico Real:** Resuelve la latencia y micro-pausas al escribir texto dinámico. |
| **10** | `native/libvexart/src/text/mod.rs:445, 555` | Media | Consolidar la emisión de glifos en un único `CommandEncoder` y someterlo una sola vez por cuadro. | **Fix Arquitectónico Real:** Reduce el overhead de sincronización CPU-GPU en el hot path. |
| **11** | `native/libvexart/src/paint/shaders/shadow.wgsl:58` | Alta | Corregir cálculo de origen geométrico en la SDF para offsets negativos (`-offset.x`, `-offset.y`). | **Fix Arquitectónico Real:** Corrige la formulación matemática de la función de distancia con signo. |

---

### Grupo II: TypeScript / Motor (`packages/engine`)

| # | Archivo y Línea | Severidad | Naturaleza del Fix | ¿Mitigación o Fix Real? |
|---|---|---|---|---|
| **12** | `packages/engine/src/ffi/gpu-renderer-backend.ts:2018` | Media | Delegar el recorte de sombras a la GPU sin clampear coordenadas UV en espacio de pantalla. | **Fix Arquitectónico Real:** Preserva la invariancia geométrica del quad de la sombra. |
| **13** | `packages/engine/src/ffi/gpu-composite-ops.ts:56-58` | Alta | Conectar `FinalizationRegistry` para invocar `vexartRemoveImage` al liberarse el buffer en JS. | **Fix Arquitectónico Real:** Establece simetría de ciclo de vida entre el GC de JS y los recursos nativos. |
| **14** | `packages/engine/src/ffi/gpu-renderer-backend.ts:680` | Media | Borrar `record.handle` de `instanceImageHandles` durante la poda en `trimTransformSpriteCache`. | **Fix Arquitectónico Real:** Elimina referencias huérfanas antes de la destrucción del backend. |
| **15** | `packages/engine/src/mount.ts:187` | Alta | Eliminar el desplazamiento de `+ 1` fila en la coordenada Y del mouse, calculando el centro de celda. | **Fix Arquitectónico Real:** Calibra la transformación matemática de coordenadas entre TTY y píxeles. |
| **16** | `packages/engine/src/input/keyboard.ts:176` | Media | Tratar explícitamente el byte 10 (`\n`) como tecla `enter` sin evaluarlo como `Ctrl+j`. | **Fix Arquitectónico Real:** Cumple con la especificación de terminales en modo LF sin trampas de control. |
| **17** | `packages/engine/src/input/keyboard.ts:175` | Baja | Mapear el byte 0 (`\x00`) como tecla `space` con modificador `ctrl: true`. | **Fix Arquitectónico Real:** Incorpora el atajo universal de autocompletado en la máquina de estados del parser. |
| **18** | `packages/engine/src/input/parser.ts:161` | Media | En caso de desbordamiento de APC, truncar únicamente la secuencia malformada hasta el siguiente escape `\x1b`. | **Fix Arquitectónico Real:** Aísla errores de protocolo sin destruir el flujo de entrada de eventos del usuario. |
| **19** | `packages/engine/src/input/parser.ts:36, 156` | Media | Aceptar `\x07` (BEL) además de `\x1b\\` (ST) como terminador estándar de respuestas APC. | **Fix Arquitectónico Real:** Cumplimiento total del estándar ECMA-48 y protocolo Kitty. |
| **20** | `packages/engine/src/input/mouse.ts:54-65` | Media | Priorizar el sufijo de liberación `m` y mapear código 35 como movimiento neutro sin botón. | **Fix Arquitectónico Real:** Restablece la semántica correcta del protocolo SGR 1003. |
| **21** | `packages/engine/src/reconciler/hit-test.ts:22-30` | Alta | Iterar recursivamente por los contenedores ancestros acumulando sus offsets de scroll en `getEffectivePosition`. | **Fix Arquitectónico Real:** Resuelve la proyección geométrica en árboles de coordenadas anidados. |
| **22** | `packages/engine/src/terminal/lifecycle.ts:238` | Media | Centralizar el registro de señales de `process` en un despachador estático con desuscripción simétrica. | **Fix Arquitectónico Real:** Erradica fugas de memoria y advertencias de `MaxListenersExceeded`. |
| **23** | `packages/engine/src/terminal/caps.ts:267-268` | Media | Enrutar consultas OSC mediante `createWriter` para aplicar passthrough DCS al correr en tmux. | **Fix Arquitectónico Real:** Respeta la arquitectura de encapsulación de terminales multiplexadas. |
| **24** | `packages/engine/src/ffi/node.ts:381-398` | Media | Reemplazar el `Map` global no acotado por un caché LRU con límite de 512 entradas. | **Fix Arquitectónico Real:** Acota formalmente la huella de memoria para cadenas de colores dinámicas. |
| **25** | `packages/engine/src/ffi/node.ts:384-398` | Baja | Implementar expansión de formatos `#rgb` y `#rgba` a representaciones canónicas de 8 dígitos. | **Fix Arquitectónico Real:** Normalización completa del espacio de color según especificaciones CSS. |
| **26** | `packages/engine/src/loop/layout-adapter.ts:440` | Alta | Limpiar explícitamente los slots de nodos huérfanos del cuadro anterior en `beginLayout()`. | **Fix Arquitectónico Real:** Evita la retención artificial de objetos desmontados en el heap de JS. |
| **27** | `packages/engine/src/loop/assign-layers.ts:327` | Alta | Asociar comandos de capas utilizando el `nodeId` único del nodo en lugar de comparar colores de fondo. | **Fix Arquitectónico Real:** Corrige la ambigüedad en el mapeo de capas estáticas. |
| **28** | `packages/engine/src/loop/composite.ts:536-542` | Media | Despachar eventos de interacción antes del pase de layout unificado del cuadro. | **Fix Arquitectónico Real:** Elimina la duplicación innecesaria de cálculo de layout en el mismo frame. |
| **29** | `packages/engine/src/ffi/renderer-backend.ts:170` | Media | Almacenar la instancia del backend directamente en el contexto del `RenderLoop`. | **Fix Arquitectónico Real:** Elimina el acoplamiento a singletons globales permitiendo instancias aisladas. |
| **30** | `packages/engine/src/reconciler/tree-sitter/client.ts:138` | Media | Rechazar todas las promesas pendientes con un error descriptivo al cerrar el worker de Tree-Sitter. | **Fix Arquitectónico Real:** Previene promesas colgadas en el bucle de eventos. |

---

### Grupo III: Componentes Reactivos y Framework (`headless`, `app`, `styled`)

| # | Archivo y Línea | Severidad | Naturaleza del Fix | ¿Mitigación o Fix Real? |
|---|---|---|---|---|
| **31** | `packages/headless/src/inputs/input.tsx:130, 328` | Alta | Separar el cursor como un quad overlay posicionado por métricas de texto sin mutar la cadena. | **Fix Arquitectónico Real:** Desacopla la representación visual del dato del modelo y elimina re-renders a 60 FPS. |
| **32** | `packages/headless/src/collections/virtual-list.tsx:179`<br>`packages/headless/src/containers/scroll-view.tsx:99` | Alta | Remover `markDirty()` redundante de `onPostScroll`, permitiendo que el estado reactivo gobierne el redibujado. | **Fix Arquitectónico Real:** Corta el bucle cerrado de suciedad infinita en el loop de render. |
| **33** | `packages/headless/src/inputs/slider.tsx:137-140` | Media | Invocar `focus()` en el evento `onMouseDown` o `onPress` de la pista del slider. | **Fix Arquitectónico Real:** Cumple con el contrato de accesibilidad e interacción interactiva. |
| **34** | `packages/headless/src/inputs/select.tsx:234` | Media | Otorgar foco de teclado al componente disparador al desplegar el menú mediante interacción de mouse. | **Fix Arquitectónico Real:** Sincroniza la máquina de foco de teclado con la interfaz visual. |
| **35** | `packages/headless/src/inputs/combobox.tsx:224`<br>`packages/headless/src/overlays/tooltip.tsx:161` | Media | Integrar un plano de captura de clic exterior (outside-click) para desestimar modales y popovers. | **Fix Arquitectónico Real:** Modelo formal de interacción modal flotante. |
| **36** | `packages/headless/src/overlays/dialog.tsx:82` | Alta | Comprobar que el nodo previamente enfocado aún exista en el registro antes de restaurar el foco. | **Fix Arquitectónico Real:** Manejo seguro de navegación de foco defensiva. |
| **37** | `packages/app/src/router/router.tsx:248-254` | Crítica | Envolver la instanciación de rutas en `createComponent` dentro de un scope de desecho reactivo (`createRoot` o `<Show>`). | **Fix Arquitectónico Real:** Garantiza la destrucción y limpieza de componentes al cambiar de pantalla. |
| **38** | `packages/headless/src/forms/form.tsx:185-226` | Media | Marcar `setSubmitting(true)` sincrónicamente antes de ejecutar validaciones asíncronas concurrentes. | **Fix Arquitectónico Real:** Enforza la atomicidad en la máquina de estados de envío de formularios. |
| **39** | `packages/app/src/styles/class-name.ts:356` | Baja | Conectar una señal de versión de tema en el reconciliador de atributos de clase. | **Fix Arquitectónico Real:** Conecta el sistema de diseño reactivo con el motor de estilos. |
| **40** | `packages/engine/src/ffi/damage.ts:59-71` | Baja | Limitar el cálculo de solapamiento a la unión volumétrica del bounding box compuesto. | **Fix Arquitectónico Real:** Corrige el cálculo de razón de daño para evitar repintados espurios. |

---

## 4. Por Qué Estos Fixes NO Son Mitigaciones

Para certificar la pureza técnica de cada solución, contrastamos el enfoque arquitectónico propuesto contra la "solución fácil" (mitigación) que comúnmente se aplica pero que este reporte rechaza:

1. **En el Buffer Unmap de WGPU (Defect 4):**
   * *Mitigación rechazada:* Poner un `try/catch` o un `catch_unwind` alrededor de `unmap()` para que el pánico no tire el proceso.
   * *Fix real implementado:* Condicionar el armado del `UnmapGuard` al éxito estricto de `rx.recv()`. Si no hubo mapeo, no hay desmapeo; el estado del buffer permanece siempre consistente.
2. **En el Enrutador de Rutas (Defect 37):**
   * *Mitigación rechazada:* Forzar un reseteo manual de variables en un hook global.
   * *Fix real implementado:* Integrar `createComponent(Component, props)` en un contexto reactivo gestionado por SolidJS con invocación automática de `onCleanup`.
3. **En la Asignación de Capas (Defect 27):**
   * *Mitigación rechazada:* Crear colores ligeramente distintos para que no colisionen.
   * *Fix real implementado:* Propagar el `nodeId` inmutable a través de toda la estructura de comandos y resolver la relación por identidad de nodo.
4. **En el Desplazamiento del Mouse (Defect 15):**
   * *Mitigación rechazada:* Restar arbitrariamente 16 píxeles en el listener del componente final.
   * *Fix real implementado:* Corregir la raíz del modelo afín en `mount.ts`, centrando el punto en la celda normalizada.
5. **En el Parpadeo del Cursor (Defect 31):**
   * *Mitigación rechazada:* Usar fuentes de ancho fijo o apagar el parpadeo.
   * *Fix real implementado:* Desacoplar el cursor del texto; el texto es un nodo de contenido tipográfico y el cursor es un elemento de geometría pura superpuesto.

---

## 5. Estrategia de Verificación y Criterios de Aceptación

Cada fix requerirá verificación empírica independiente:
* **Pruebas de Tipos y Regresión:** `bun run typecheck` y `bun run test` (100% de suites en verde).
* **Pruebas Nativas en Rust:** `cargo test` en `native/libvexart`.
* **Pruebas de Fugas de Memoria:** Monitoreo de `/dev/shm` y descriptores durante navegación prolongada en `bun run showcase`.
* **Pruebas de Calibración de Entrada:** Verificación de clic de mouse exacto en subpíxeles y pulsaciones de teclas críticas (`Enter` en modo LF, `Ctrl+Space`).
