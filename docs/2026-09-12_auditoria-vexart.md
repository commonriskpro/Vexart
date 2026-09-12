# Auditoría consolidada de Vexart — contratos, motor y demos

**Fecha de las evidencias:** 12 de septiembre de 2026.
**Estado:** diagnóstico y propuestas; no se implementaron las reparaciones del motor ni de contratos como parte de estas auditorías. Algunas correcciones de demos sí fueron realizadas en su tarea original y se identifican por separado.
**Veredicto de las auditorías:** `NEEDS_CORRECTION` para los defectos verificados pendientes; `BLOCKED` para la aceptación visual idéntica y la validación física pendiente en sus cortes. M01 permanece sin causa vigente demostrada.
**Alcance de esta entrega:** consolidación documental de los dos informes anteriores; sin nuevas pruebas de runtime ni cambios de código, configuración o contratos.

## Ejecución posterior autorizada

Los hallazgos y recibos originales que siguen son históricos. Después de la auditoría, el usuario aprobó la migración a intrínsecos y la retirada de APIs internas, con commits separados:

| Commit | Cambio | Validación |
|---|---|---|
| `b0db951` | Retirada de `Box`/`Text`; refs y directivas con `NodeHandle`; eliminación de `_node` público | Typecheck, pruebas de refs/reactividad y 17 pruebas de demos; revisión independiente aprobada |
| `680bc32` | API pública de engine separada de internals de workspace y ABI de compilador `vexart/jsx-runtime` | API Extractor, declaraciones sin `TGENode`/`_node`, build aislado, consumo entre entrypoints (26 aserciones), emisión nativa de payload Kitty; revisión independiente aprobada |
| `e84548f` | F01: identidad de foco consultada en el registro vigente | Regresión roja antes del fix; pruebas finales de handle/focus: 24 pass, 0 fail, 61 aserciones; revisión independiente aprobada |

**Estado:** F01 reparado. La propuesta F02 de conservar wrappers queda sustituida por su retirada; el atributo `ref` de imagen sigue siendo un pendiente independiente. No se declaran implementados los demás hallazgos F/M de este informe.

**Límites:** no se publicó ningún paquete ni se sustituyó el `dist/` existente. El build se verificó en un directorio temporal. Las pruebas de emisión nativa no certifican un terminal físico. `lint:boundaries` detecta el ciclo preexistente `node.ts ↔ native-image-assets.ts`, comprobado también en el commit base `7ddcc96`; no se modificaron esos módulos como parte de estas reparaciones. Los cambios previos ajenos y las demos que ya estaban sin seguimiento se preservaron fuera de los commits de esta tarea.

## Resumen ejecutivo

El informe reúne **ocho hallazgos de contratos (F01–F08)**, **cinco temas del motor (M01–M05), con subhallazgos M02-LH y M03-S**, y **quince incidencias o limitaciones de demos (D01–D15)**. No son todos defectos abiertos: se distingue entre causas confirmadas, riesgos de mantenimiento, capacidades no implementadas, correcciones históricas y casos sin reproducción vigente.

- **Contratos:** incoherencias de identidad de foco, refs, eventos, montaje y tipos; también riesgos de resolución y mantenimiento de declaraciones/protocolo.
- **Motor confirmado:** métricas distintas entre medición y pintura; índices de batches obsoletos que invierten el orden fill/sombra; cobertura Canvas superpuesta artificialmente.
- **M01 — clipping:** el desplazamiento histórico de 40 px no se reproduce en el Studio actual. No se presenta como una causa raíz vigente demostrada ni como un defecto resuelto.
- **M03-S — sombra interior:** decidir su semántica es independiente del bug de batching M03.
- **M05 — áreas arbitrarias:** es una capacidad de API pendiente, no una regresión confirmada.
- **Aceptación visual y terminal físico:** no quedan aprobados por los tests o readbacks offscreen. Las capturas no prueban identidad con los mocks ni recepción del portapapeles.

Las propuestas siguen pendientes de decisión e implementación. No se recomienda fusionar las capas del producto, eliminar APIs públicas ni trasladar layout a Rust como respuesta automática.

## Procedencia y lectura

Se consolidaron `2026-09-12_auditoria-contratos-vexart.md` y `2026-09-12_fallos-motor-thread-demos.md` en este archivo. Se conservan los IDs originales para mantener trazabilidad.

- **F01–F08:** auditoría transversal de contratos, procedente de otra revisión; no se atribuye a los subagentes de demos.
- **M y D:** revisión de [Crear demos antes del post](codex://threads/01a0968d-57cb-7020-a736-da7951229391), seguida por investigación de causa raíz en esta tarea.
- **Precedencia:** para el motor se utiliza el diagnóstico posterior, no las hipótesis iniciales. La evolución se resume al final, sin repetir conclusiones obsoletas como si fueran actuales.
- **Temporalidad:** “actual”, “corregido” y los números de tests dentro de los hallazgos corresponden al corte de su investigación, no a una nueva certificación del repositorio al fusionar documentos.
- **Formato:** inventario individual, ubicación, causa, impacto, evidencia, remediación propuesta y aceptación, siguiendo el esquema de OpenCode consultado. Las prioridades son técnicas, no una clasificación de vulnerabilidades.

## Arquitectura y límites de atribución

El flujo relevante es: árbol Solid/TS → layout y medición TS → render graph → backend GPU → Rust/WGPU → readback o transporte al terminal. Hit-testing utiliza layout TS. Canvas se rasteriza en JavaScript y se sube como RGBA.

Por tanto, una captura WGPU errónea no demuestra automáticamente un fallo en Rust; puede originarse en coordenadas, métricas o comandos preparados en TS. Una captura correcta tampoco demuestra transporte Kitty, mouse físico o recepción del portapapeles.

## 1. Contratos transversales — F01–F08

| ID | Grupo | Hallazgo | Prioridad | Evidencia disponible |
|---|---|---|---|---|
| F01 | Interacción | Identidad de foco contradictoria | Alta | Reproducción runtime |
| F02 | Interacción | Refs distintos para el mismo nodo | Alta | Prueba de tipos y lectura del runtime |
| F04 | Interacción | Evento descartado por Button | Media | Reproducción runtime |
| F05 | Ciclo de vida | Montaje sin contexto ni liberación del terminal propio | Alta | Inspección de la cadena de montaje y destrucción |
| F03 | Tipos y distribución | JSX fuente y generado divergen | Media | Prueba comparativa de tipos |
| F06 | Tipos y distribución | Imports locales resuelven a versiones distintas | Media | Resolución local comprobada; riesgo al mezclarlos |
| F07 | Tipos y distribución | Declaraciones antiguas y comentarios contradictorios | Media | Inspección de fuente, generador y build |
| F08 | Tipos y distribución | Constantes del protocolo repetidas en TypeScript | Baja | Duplicación confirmada; valores actualmente iguales |

Las prioridades expresan impacto técnico, no una clasificación de vulnerabilidades. Las evidencias corresponden a la auditoría de esta fecha; no certifican futuras versiones ni un paquete remoto publicado.

### Interacción

#### F01 — El handle y el registro discrepan sobre la identidad de foco

- **Explicación corta:** el nodo puede estar enfocado mientras su handle dice que no lo está.
- **Causa raíz:** `NodeHandle` calcula `node-${id}`, pero el registro usa `focusId`, `id` o `node-focus-${id}`. Hay dos reglas independientes para identificar el mismo foco.
- **Impacto:** `focus()` apunta a una identidad incorrecta; `isFocused` puede devolver `false` y `blur()` no desenfoca el nodo registrado. Afecta también IDs explícitos.
- **Solución recomendada:** consultar el `getNodeFocusId(node)` que ya existe en cada operación del handle. No conservar un ID inventado ni capturarlo permanentemente: el registro permite actualizarlo.
- **Beneficios:** foco coherente por teclado y acceso imperativo; una única autoridad para la identidad; menos errores silenciosos.
- **Validación propuesta:** cubrir ID por defecto, `focusId` explícito, cambio de ID y operaciones `focus`/`blur`/`isFocused`. Definir explícitamente qué ocurre con nodos no registrados o destruidos.
- **Decisión pendiente:** conservar el contrato público actual y corregir su implementación; no hace falta introducir otra API de foco.

**Ubicaciones:** [handle.ts:25–34](/Users/dev/ve/vexart/packages/engine/src/reconciler/handle.ts:25), [registro de foco:202–212](/Users/dev/ve/vexart/packages/engine/src/reconciler/focus.ts:202), [getNodeFocusId:266](/Users/dev/ve/vexart/packages/engine/src/reconciler/focus.ts:266).

#### F02 — Box, box e img declaran refs incompatibles

> **Corrección de la auditoría al migrar:** la afirmación original de que JSX siempre entrega `NodeHandle` era incompleta. La compilación real de Babel usa `engine.use` para refs explícitos y `engine.spread` para props expandidas; Solid universal entrega `TGENode` directamente en ambos caminos, sin pasar por `setProperty("ref")`. Las declaraciones exigen `NodeHandle`. Con el nodo directo pasan 17 pruebas de demos, pero queda el error de tipos; con `_node` pasan los tipos y fallan 6 de 17 pruebas. Ese fue el bloqueo previo a la decisión; posteriormente se eligió y unificó `NodeHandle`, según los commits de la sección de ejecución.

> **Decisión posterior del usuario:** retirar los wrappers públicos `Box` y `Text` y migrar consumidores a los intrínsecos `<box>` y `<text>`, cuya resolución de `className` ya pertenece al motor. La propuesta original de mantener y tipar los wrappers queda sustituida por esa migración. La evidencia inferior describe el corte previo, no la API objetivo. La ausencia de `ref` en `<img>` es un pendiente independiente y no queda resuelta por eliminar los wrappers.

- **Explicación corta:** el mismo valor runtime queda correctamente tipado en unos elementos y sin protección en otros.
- **Causa raíz:** `AppBoxProps` y `AppTextProps` no declaran `ref`. En componentes, Solid permite el atributo genérico `ref?: unknown`; el intrínseco `box` sí exige `NodeHandle`. En `img` falta el atributo.
- **Impacto comprobado:** `<Box ref={(node: TGENode) => …}>` compila, pero `<box>` rechaza ese callback. `<img ref={…}>` rechaza el atributo. El runtime entrega `NodeHandle`, no `TGENode`.
- **Solución recomendada:** definir una sola firma de ref público y reutilizarla en los intrínsecos y componentes que lo reenvían. Corregir los consumidores que anotan `TGENode` sin extraer el nodo real. No resolverlo mediante casts.
- **Beneficios:** TypeScript detecta el error de la captura antes de ejecutar; mismo contrato en mayúsculas y minúsculas; mejor autocompletado para usuarios e IA.
- **Validación propuesta:** pruebas de tipos positivas con `NodeHandle` y negativas con `TGENode` para Box, Text e intrínsecos. Comprobar también el valor real recibido por el callback.
- **Decisión pendiente:** recomendar `NodeHandle` como contrato público de ref, manteniendo `TGENode` como representación del motor. Eliminar `_node` o dejar de exportar `TGENode` sería un cambio adicional de API, no parte necesaria de esta corrección.

**Ubicaciones:** [primitives.tsx:10–21](/Users/dev/ve/vexart/packages/app/src/components/primitives.tsx:10), [JSX box:25](/Users/dev/ve/vexart/packages/engine/src/reconciler/jsx.d.ts:25), [JSX img:77](/Users/dev/ve/vexart/packages/engine/src/reconciler/jsx.d.ts:77), [entrega del ref:306–309](/Users/dev/ve/vexart/packages/engine/src/reconciler/reconciler.ts:306).

#### F04 — Button descarta el evento que VoidButton permite recibir

- **Explicación corta:** la API styled admite `PressEvent`, pero el callback recibe `undefined`.
- **Causa raíz:** `VoidButton` declara `onPress(event?: PressEvent)` y lo reenvía al headless. Este último usa `activate()` sin evento y llama a `props.onPress?.()`.
- **Impacto:** se pierde el evento recibido desde el motor y no se puede detener su propagación desde el callback de `VoidButton`.
- **Solución recomendada:** reutilizar la firma de activación del motor y conservar el evento a través del contexto headless y styled. Revisar la activación por teclado para que mantenga una semántica explícita, no solo el camino de mouse. Corregir el comentario legado del wrapper styled.
- **Beneficios:** mismo comportamiento de activación entre capas; soporte efectivo de `stopPropagation()`; ausencia de callbacks que aparentan ofrecer datos que nunca llegan.
- **Validación propuesta:** comprobar identidad del evento recibido, propagación en botones anidados y activación por teclado. Mantener funcionando callbacks existentes sin parámetros.
- **Decisión pendiente:** recomendar conservar `PressEvent`. La alternativa es retirar esa capacidad del contrato styled, pero reduciría funcionalidad y requiere una decisión pública explícita.

**Ubicaciones:** [ButtonProps:28–36](/Users/dev/ve/vexart/packages/headless/src/inputs/button.tsx:28), [activate:70–84](/Users/dev/ve/vexart/packages/headless/src/inputs/button.tsx:70), [VoidButtonProps:28–35](/Users/dev/ve/vexart/packages/styled/src/components/button.tsx:28), [reenvío:152](/Users/dev/ve/vexart/packages/styled/src/components/button.tsx:152).

### Ciclo de vida

#### F05 — mountApp no comparte el contexto ni la liberación de createApp

- **Explicación corta:** dos entradas del framework montan una aplicación con garantías diferentes que no quedan suficientemente delimitadas.
- **Causa raíz:** `createApp` instala `TerminalContext` y libera montaje y terminal. `mountApp` puede crear el terminal y entrega directamente el `MountHandle` del motor, que no destruye ese terminal ni lo expone.
- **Impacto:** el camino de `mountApp` no proporciona el contexto requerido por `useAppTerminal()`. Si crea el terminal, su handle no completa la liberación del recurso propio. Si el usuario proporciona un terminal, su propiedad debe seguir siendo externa.
- **Solución recomendada:** compartir la lógica mínima de montaje con contexto y propiedad explícita. El camino que crea el terminal debe liberarlo al destruirse y ante un fallo de montaje; el que recibe un terminal no debe apropiarse de él. Mantener la gestión de teclas de salida en `createApp`.
- **Beneficios:** componentes reutilizables en ambos caminos; adquisición y liberación simétricas; no destruir terminales ajenos ni dejar propios sin cierre.
- **Validación propuesta:** contexto accesible por ambos caminos; terminal propio liberado exactamente una vez; terminal recibido preservado; limpieza ante excepciones y destrucción repetida.
- **Decisión pendiente:** confirmar la semántica de propiedad de `mountApp`. Se recomienda preservar ambas entradas y el retorno existente si resulta suficiente, en vez de introducir una tercera API pública.

**Ubicaciones:** [mount-app.ts:5–13](/Users/dev/ve/vexart/packages/app/src/runtime/mount-app.ts:5), [create-app.ts:47–77](/Users/dev/ve/vexart/packages/app/src/runtime/create-app.ts:47), [terminal-context.ts:7–10](/Users/dev/ve/vexart/packages/app/src/runtime/terminal-context.ts:7), [MountHandle.destroy:218–252](/Users/dev/ve/vexart/packages/engine/src/mount.ts:218).

### Tipos y distribución

#### F03 — Los tipos JSX fuente y generados aceptan propiedades diferentes

- **Explicación corta:** código válido durante desarrollo puede ser rechazado por las declaraciones destinadas al consumidor.
- **Causa raíz:** la declaración del reconciliador y la plantilla de generación repiten campos de `TGEProps`. El workspace usa una intersección; el generado usa una interfaz que redefine `focusStyle` con un subconjunto. El chequeo de sincronización no compara estos contratos anidados.
- **Impacto comprobado:** `focusStyle: { filter: { blur: 2 } }` es aceptado por el tipo fuente de `box` y rechazado por el tipo generado. No es solo una diferencia de formato.
- **Solución recomendada:** mantener una definición canónica de props JSX y derivar de ella las declaraciones de desarrollo y distribución. Reutilizar `TGEProps` e `InteractiveStyleProps`; añadir únicamente particularidades como `ref`, `children` o `src` obligatorio. Eliminar listas manuales redundantes.
- **Beneficios:** mismo contrato para desarrollo y consumo; añadir una propiedad no exige actualizar varias listas; menos falsos positivos del chequeo de sincronización.
- **Validación propuesta:** compilar las mismas fixtures contra fuente y tipos generados, con casos positivos y negativos para refs y estilos anidados. La generación debe ser reproducible y no depender de editar a mano su salida.
- **Decisión pendiente:** escoger la declaración fuente canónica; recomendar que las salidas se deriven de ella, sin mantener otra plantilla con firmas independientes.

**Ubicaciones:** [JSX fuente:25–50](/Users/dev/ve/vexart/packages/engine/src/reconciler/jsx.d.ts:25), [JSX generado:18–42](/Users/dev/ve/vexart/types/jsx-runtime.d.ts:18), [plantilla:200](/Users/dev/ve/vexart/scripts/gen-types.ts:200), [chequeo:160](/Users/dev/ve/vexart/scripts/gen-jsx-runtime.ts:160), [InteractiveStyleProps:161](/Users/dev/ve/vexart/packages/engine/src/ffi/node-types.ts:161).

#### F06 — Imports relacionados resuelven a estados diferentes del proyecto

- **Explicación corta:** en el entorno auditado, importar `vexart` no equivale a usar la fuente local de `@vexart/*`.
- **Causa raíz:** el workspace resuelve `@vexart/*` a fuente, mientras `vexart` y `vexart/engine` resuelven a un tarball temporal instalado de versión `0.9.0-beta.26`. El proyecto raíz declara `0.10.0-beta.4`.
- **Impacto:** mezclar ambos caminos puede combinar APIs, tipos o instancias distintas del motor. La resolución divergente está comprobada; no se afirma que todos los demos estén mezclando ambas instancias.
- **Solución recomendada:** establecer una resolución coherente de desarrollo para `vexart`, `vexart/engine` y los imports emitidos por JSX. Separar las pruebas del paquete generado en un entorno aislado y comprobar allí el contrato de consumidor. Inspeccionar el origen del tarball antiguo antes de retirarlo; no borrar dependencias indiscriminadamente.
- **Beneficios:** demos representativos de la API pública; menos elecciones ambiguas para una IA; preservación del reconciliador único.
- **Validación propuesta:** comprobar las resoluciones en desarrollo y la identidad del reconciliador; ejecutar una fixture equivalente contra el paquete generado aislado.
- **Decisión pendiente:** definir el camino oficial para demos locales. Se recomienda el barrel público con resolución a fuente, manteniendo pruebas separadas del artefacto distribuido. Esto afecta configuración y debe implementarse como cambio explícito.

**Ubicaciones:** [tsconfig.json:16–21](/Users/dev/ve/vexart/tsconfig.json:16), [package.json](/Users/dev/ve/vexart/package.json), [barrel fuente](/Users/dev/ve/vexart/packages/app/src/barrel.ts), [singleton del build:115–125](/Users/dev/ve/vexart/scripts/build-dist.ts:115).

#### F07 — Se conservan declaraciones obsoletas e instrucciones contradictorias

- **Explicación corta:** herramientas y lectores encuentran descripciones diferentes de la misma API.
- **Causa raíz:** `components.d.ts` contiene firmas antiguas; el generador solo crea los stubs si no existen, por lo que conserva los existentes. El build copia `components.d.ts` y `void.d.ts` al paquete. Además, comentarios del barrel y del stub asignan `Button` a styled cuando el export real es headless.
- **Impacto:** el stub declara, por ejemplo, `buttonProps.focusable: true`, mientras la fuente usa `focusable?: boolean`. También presenta nombres y rutas antiguas. Estas declaraciones no son entradas del export map raíz: el problema no implica que el rollup principal tenga necesariamente esas firmas erróneas.
- **Solución recomendada:** comprobar referencias activas a los stubs. Si no son necesarios, retirarlos de la generación y del paquete; si lo son, generarlos desde fuente. Corregir la documentación para que `Button` sea headless y `VoidButton` styled.
- **Beneficios:** menos contratos que mantener; documentación fiable; menor probabilidad de que una IA use componentes o imports equivocados.
- **Validación propuesta:** comprobar referencias antes de retirar archivos; compilar un consumidor del paquete; verificar que nombres, firmas y comentarios coincidan con el barrel real.
- **Decisión pendiente:** revisar compatibilidad de consumidores antes de retirar archivos distribuidos, aunque no figuren en el export map.

**Ubicaciones:** [components.d.ts:19–40](/Users/dev/ve/vexart/types/components.d.ts:19), [generación condicional:325–334](/Users/dev/ve/vexart/scripts/gen-types.ts:325), [copia al paquete:224–236](/Users/dev/ve/vexart/scripts/build-dist.ts:224), [comentario del barrel:19](/Users/dev/ve/vexart/packages/app/src/barrel.ts:19), [export real:247–272](/Users/dev/ve/vexart/packages/app/src/barrel.ts:247).

#### F08 — El protocolo tiene dos copias de sus constantes en TypeScript

- **Explicación corta:** el encoder y la API pública toman constantes equivalentes de archivos diferentes.
- **Causa raíz:** `GRAPH_MAGIC` y `GRAPH_VERSION` están declaradas en `vexart-buffer.ts` y `vexart-functions.ts`. El encoder importa la primera copia y el barrel público exporta la segunda.
- **Impacto:** los valores coinciden hoy, pero pueden divergir al actualizar el protocolo. Los tests actuales comparan con literales; no prueban por sí solos la concordancia entre todas las definiciones TS y Rust.
- **Solución recomendada:** conservar una única definición TypeScript y reexportarla desde la API existente. Verificar por separado la paridad con el decoder Rust. No hace falta crear un generador nuevo para eliminar estas dos copias locales.
- **Beneficios:** menor mantenimiento y menor riesgo de anunciar una versión distinta de la que codifica el motor.
- **Validación propuesta:** comprobar identidad de valores públicos y del encoder; mantener una prueba explícita del contrato TS/Rust.
- **Decisión pendiente:** ninguna modificación de valores ni del protocolo; recomendar solo consolidación interna y preservación de exports.

**Ubicaciones:** [vexart-buffer.ts:15–18](/Users/dev/ve/vexart/packages/engine/src/ffi/vexart-buffer.ts:15), [vexart-functions.ts:17–19](/Users/dev/ve/vexart/packages/engine/src/ffi/vexart-functions.ts:17), [encoder:13](/Users/dev/ve/vexart/packages/engine/src/ffi/gpu-composite-ops.ts:13), [decoder Rust:5–6](/Users/dev/ve/vexart/native/libvexart/src/ffi/buffer.rs:5), [tests:18–23](/Users/dev/ve/vexart/packages/engine/src/ffi/vexart-buffer.test.ts:18).

### Diferencias que no son fallos por sí mismas

- **TGENode y NodeHandle:** estado interno y acceso público; no representan dos árboles independientes. Su frontera puede mejorarse sin fusionarlos.
- **Headless y styled:** lógica y presentación. El problema de F04 es perder información al pasar entre capas, no la existencia de ambas.
- **Reexports y artefactos generados:** son válidos si derivan de una única definición y no se mantienen manualmente en paralelo.
- **Contratos TS/Rust:** la frontera binaria necesita representaciones en ambos lenguajes; requiere paridad, no borrar uno de los lados.
- **ProgressBar/VoidProgress y tipos de rutas:** no se confirmó un defecto por sus diferencias de tamaño o repetición de formas. No se recomienda introducir abstracciones solo por similitud.
- **theme.preset:** no se incluyó como fallo confirmado; faltó evidencia de una obligación de aplicación automática en el runtime.

## 2. Motor — diagnóstico de causa raíz vigente

### Inventario y diagnóstico vigente

| ID | Resultado vigente | Evidencia |
|---|---|---|
| M01 | Desplazamiento de clipping no reproducido actualmente | Studio completo: true, false y omitido producen los mismos píxeles |
| M02 | Medición y pintura usan tamaños diferentes | Reproducción de wrapping y readback GPU |
| M02-LH | La medida no incorpora correctamente lineHeight explícito | Árbol/layout y extensión de píxeles cambian de forma inconsistente |
| M03 | Índices obsoletos de batches invierten el orden fill/sombra | Inspección de fuente, reproducción GPU y control con capa explícita |
| M03-S | El shader cubre el interior de la forma de sombra | Comportamiento confirmado; decisión de semántica separada de M03 |
| M04 | Cobertura artificialmente superpuesta en Canvas | Reproducción RGBA antes de GPU y verificación independiente |
| M05 | Paths arbitrarios siguen siendo una capacidad de API | No se reclasifica como defecto ni se autoriza su implementación |

### M02 — Tipografía: medición y pintura utilizan tamaños distintos

**Causa confirmada:** layout conserva el tamaño fraccionario, pero [render-graph.ts:368](/Users/dev/ve/vexart/packages/engine/src/ffi/render-graph.ts:368) lo redondea después de medir. El tamaño original se conserva en [layout-adapter.ts:847](/Users/dev/ve/vexart/packages/engine/src/loop/layout-adapter.ts:847).

Reproducción con `Running`, Helvetica Neue, peso 400:

| Etapa | Tamaño | Ancho | Resultado |
|---|---:|---:|---|
| Medición | 11.71875 px | 44 px | Una línea |
| Operación de pintura | 12 px | 44 px | `Runnin` + `g` |
| Control coherente | 12 px | 45 px | Una línea |

La reproducción utilizó `measureForLayout`, `buildRenderGraphFrame` y `layoutText` reales. La aserción de igualdad de cantidad de líneas falló, como corresponde al defecto. Un readback GPU adicional mostró dos grupos de filas con texto para el caso fraccionario y uno para el control entero.

**Conclusión:** la divergencia se introduce en TypeScript. Rust recibe tamaños `f32`; no hay evidencia de que el backend obligue a usar enteros. Redondear en las demos evita el input que dispara el problema, pero no corrige el contrato entre medición y pintura.

#### M02-LH — Inconsistencia adicional de lineHeight

La medición restringida utiliza `Math.ceil(fontSize * 1.2)` en [text-layout.ts:332](/Users/dev/ve/vexart/packages/engine/src/ffi/text-layout.ts:332), mientras pintura recibe el `lineHeight` explícito. El callback de medida está en [flex-sync.ts:762–787](/Users/dev/ve/vexart/packages/engine/src/ffi/flex-sync.ts:762).

En una escena real con `Text`, ancho 40, fuente 14 y contenido `Running Running`, cambiar `lineHeight` de omitido a `30`:

- No cambió la altura calculada del nodo: 17 px en ambos casos.
- Sí cambió la separación y extensión vertical de los píxeles: última fila con tinta 67 frente a 106.

También se comprobó el desacuerdo mediante un árbol Flexily aislado. Es independiente del redondeo de fuente. El ejemplo completo presenta además una altura insuficiente para el texto envuelto incluso con line-height por defecto; no se atribuye todo el desbordamiento exclusivamente al valor explícito.

### M03 — Vidrio: índices de batches obsoletos invierten el orden de pintura

**Esta conclusión corrige el diagnóstico inicial que explicaba el oscurecimiento únicamente por el shader.**

Secuencia verificada en [gpu-renderer-backend.ts](/Users/dev/ve/vexart/packages/engine/src/ffi/gpu-renderer-backend.ts):

1. Al entrar al efecto se guardan `haloShapeRectStart` y `haloShapeCornerStart` ([1591–1592](/Users/dev/ve/vexart/packages/engine/src/ffi/gpu-renderer-backend.ts:1591)). Con el fondo del padre pendiente, el primer índice vale 1.
2. El backdrop fuerza `flushAll()` ([1738](/Users/dev/ve/vexart/packages/engine/src/ffi/gpu-renderer-backend.ts:1738)). `flushInstances()` vacía las listas mediante `items.length = 0` ([1229](/Users/dev/ve/vexart/packages/engine/src/ffi/gpu-renderer-backend.ts:1229)).
3. El fill propio se añade después a la lista vacía, en índice 0 ([1971–1981](/Users/dev/ve/vexart/packages/engine/src/ffi/gpu-renderer-backend.ts:1971)).
4. `shapeRects.splice(haloShapeRectStart)` sigue usando el índice antiguo, 1, y no extrae el fill ([2019](/Users/dev/ve/vexart/packages/engine/src/ffi/gpu-renderer-backend.ts:2019)).
5. El `flushAll()` siguiente pinta el fill; la sombra se pinta después. Esto invierte la invariante documentada: halo antes del fill propio.

#### Reproducción GPU real

Fondo uniforme `#646464`, panel `#ffffff1e`, sombra negra `#00000088`, blur de sombra 4 y misma geometría:

| Caso | RGB interior |
|---|---|
| Sin backdrop | `[71,71,71]` |
| Con backdrop blur 4 | `[55,55,55]` |
| Capa explícita sin backdrop | `[71,71,71]` |
| Capa explícita con backdrop blur 4 | `[71,71,71]` |

Sin sombra, activar el backdrop mantuvo `[118,118,118]`. Con el orden defectuoso, la sombra aplicada sobre ese fill ya compuesto explica el valor 55. El control con capa explícita evita el índice obsoleto; no se propone convertirlo en workaround de la aplicación.

La aserción de igualdad con/sin backdrop sobre el fondo uniforme falló. La inspección independiente confirmó el mecanismo de índices obsoletos. Existe la misma vulnerabilidad estructural en la lista de radios por esquina si contiene elementos pendientes; esa variante no tiene aquí una reproducción GPU independiente.

**Conclusión:** es un bug interno de orden y ciclo de vida del batching TS. No requiere elegir otra semántica pública de sombra para establecer que el comportamiento es incorrecto.

#### M03-S — Semántica de sombra: cuestión independiente

El shader [shadow.wgsl:71–81](/Users/dev/ve/vexart/native/libvexart/src/paint/shaders/shadow.wgsl:71) aplica cobertura completa dentro de la geometría de la sombra mediante `dist = max(sd, 0.0)`. Eso explica parte del oscurecimiento a través de un fill translúcido, pero no justifica M03.

Decidir si la sombra debe excluir el interior de la geometría fuente sigue siendo una decisión de contrato. No debe confundirse con reparar el orden de pintura ni resolverse cambiando ciegamente `sd < 0`.

### M04 — Canvas: doble cobertura en rectángulos adyacentes

**Causa confirmada:** [canvas-rasterizer.ts:63–66](/Users/dev/ve/vexart/packages/engine/src/ffi/canvas-rasterizer.ts:63) aplica `floor` al inicio y `ceil` al final, y pinta cada píxel incluido con cobertura completa.

Dos rectángulos geométricamente adyacentes `[0,3.5)` y `[3.5,8)` terminan pintando ambos la columna 3:

```text
Alpha solicitado: 128
División entera:       128 128 128 128 128 128 128 128
División fraccionaria: 128 128 128 192 128 128 128 128
```

El blending source-over calcula correctamente dos aplicaciones. Lo incorrecto es la cobertura artificialmente superpuesta.

#### Relación con Mission Control

Se recuperó la construcción histórica del área desde el registro del implementador y se minimizó a 50 puntos de altura constante:

- Ancho 453 px: 405 columnas con alpha 32 y **48 con alpha 60**.
- Ancho 490 px, divisiones enteras: todas con alpha 32.
- Añadir el `+1` histórico de la demo aumenta el solapamiento; no lo corrige.
- Las ejecuciones repetidas produjeron los mismos resultados.

La banda existe en el RGBA generado por TypeScript antes de subirlo a GPU. Hacer opaco el relleno oculta la acumulación, pero no corrige la cobertura.

**Hallazgo relacionado:** [drawLine:90–101](/Users/dev/ve/vexart/packages/engine/src/ffi/canvas-rasterizer.ts:90) aplica pequeños rectángulos superpuestos dentro de una sola primitiva. Una línea con alpha 128 produjo alpha 192 en buena parte de su interior. Puede afectar líneas de grilla translúcidas; no explica por sí solo el relleno del área ni se atribuye a la línea de datos opaca.

### M01 — Clipping: desplazamiento histórico sin reproducir actualmente

Se probó el Studio actual completo, con árboles nuevos y esperando la carga de imágenes:

- `viewportClip=true` explícito.
- `viewportClip=false`.
- Propiedad omitida.

```text
Diferencia true/false:   0 bytes
Diferencia true/omitido: 0 bytes
Readback por caso:       6.291.456 bytes
Layout exterior:        x=0, y=40, width=1536, height=912
```

Se comprobaron píxeles de chrome, bordes y contenido para descartar buffers uniformes o vacíos. La comprobación del root incluyó composición final, carga de imágenes y copia del readback antes de destruir recursos.

**Conclusión:** no puede afirmarse que quitar el clip corrigiera un defecto vigente del motor. Tampoco debe atribuirse al commit `0f80a68`, que ya existía cuando se produjo el reporte histórico. Para cerrar M01 falta el estado exacto que reproducía el desplazamiento. No se recomienda elegir una reparación sobre aquella atribución sin recuperar la reproducción.

### M05 — Falta una primitiva de área arbitraria para gráficos

- **Ubicación:** [CanvasContext.polygon:264–274](/Users/dev/ve/vexart/packages/engine/src/ffi/canvas.ts:264), [Mission:186–196](/Users/dev/ve/vexart/examples/demos/mission-control.tsx:186).
- **Mecanismo:** `polygon()` construye polígonos regulares por centro/radio/lados; no acepta la lista arbitraria de puntos de una serie temporal. La demo aproxima el área con rectángulos.
- **Impacto:** el relleno escalonado/plano no reproduce exactamente la curva del mock.
- **Estado:** limitación de capacidad, no evidencia de una API prometida que funciona mal.
- **Remediación:** si la fidelidad de áreas es requisito de producto, decidir una primitiva mínima de path/polígono arbitrario; no introducir una abstracción mayor sin necesidad.
- **Aceptación:** una serie de puntos define un área continua con alpha uniforme, escalado y cierre correctos.

## 3. Demos — incidencias y estado en su corte original

Cada fila conserva un problema separado y su acción correspondiente. Son hallazgos históricos del thread; el trabajo concurrente puede haberlos corregido después del corte.

| ID | Hallazgo / ubicación | Mecanismo e impacto | Remediación y estado registrado |
|---|---|---|---|
| D01 | Mission: highlight de servicio obsoleto; `serviceRow` | Booleano seleccionado capturado al crear una fila de `<For>`; detalles cambian pero fondo sigue en api | Accessor reactivo. Corregido y revalidado independientemente |
| D02 | Mission: flechas no mueven foco | Cambia selección, permanece foco anterior; Enter puede actuar sobre otra fila | Sincronizar foco/selección. Revalidado con web → worker → Enter |
| D03 | Studio: flechas/Enter discrepan | Selección avanza a coast, foco permanece en dunes; Enter abre dunes | Mover foco al destino y probar preview. Fuente actual incorpora cambios; no consta cierre independiente en los mensajes revisados |
| D04 | Studio: filtro deja preview no coincidente | La selección no se reconcilia con resultados visibles | Seleccionar resultado visible o estado vacío. Fuente actual contiene reconciliación; cierre independiente pendiente |
| D05 | Mission: “Pause stream” no gobierna un stream de logs | Timer cambia métricas pero logs permanecen estáticos | Append determinista y pausa de métricas/logs. Revalidado; 4 tests, 29 assertions |
| D06 | Mission: canvas no responde a resize in-place | Ancho/alto calculados una sola vez | Accessors y cache key reactivos. Verificador confirmó identidad del nodo y nuevas dimensiones |
| D07 | Shared Label: lineHeight=1.3 | App interpretaba multiplicador donde la API recibe píxeles; líneas se superponen | Usar line-height en px. Corregido; separado de M02 |
| D08 | Keycaps se encogen y hacen wrap | Shrink/espacio de la composición compartida | `flexShrink={0}` y métricas coherentes; regresiones reportadas para Space/Esc |
| D09 | Sliders: área de click demasiado fina | Track visual usado como hitbox; interacción difícil | Hitbox transparente de 28 px y decoraciones passthrough; corrección reportada |
| D10 | Effects: vidrio repartido entre capas y brillo compensatorio | Composición de demo dificulta correspondencia entre specimen/controles/JSX | Un Box con efectos reales; retirar brillo añadido. No resuelve M03 |
| D11 | Effects: valores/código/controles necesitaban alinearse | Saturación de mock `1.4` no representa API porcentual; opacidad de gradiente y color debían actualizar output | JSX con `140`, alpha reactivo, color validado y reset; 4 tests reportados |
| D12 | Studio: grid muestra 6 de 12 registros | `slice(0,6)` limita resultados aunque toolbar anuncia 12 | Galería realmente desplazable o conteo explícito. Fuente actual usa `visibleImages`; cierre independiente pendiente |
| D13 | Assets no idénticos | Regenerar fotografías/cintas conserva concepto, no píxeles | Resolver fuente visual/criterio de identidad; no “arreglar el motor” para igualar fotografías distintas |
| D14 | Tipografía, iconos y trazas no idénticos | Familias/pesos/rasterización y trazas del mock difieren | Comparación controlada por superficie; no equivale automáticamente a M02 ni a bug nativo |
| D15 | Reporte QA inicialmente ajeno/desactualizado | README enlazaba un `design-qa.md` centrado en Pi | Se agregó sección de las tres demos. Como la tarea sigue activa, sus recibos pueden quedar rezagados respecto a los subagentes |

**Resize:** el verificador inicialmente sospechó también de todo el artboard compartido. El root aportó una regresión de resize del mismo nodo que pasó. No es correcto conservar esa sospecha amplia como defecto confirmado del reconciliador.

**Errores de compilación intermedios:** se registraron `values` no definido, imports faltantes y referencias temporales como `galleryImages` durante ediciones simultáneas. Son problemas de integración de demos, no evidencia de fallos del engine. Un typecheck anterior verde no certifica una edición posterior.

## 4. Evidencias y límites por investigación

### 4.1 Auditoría transversal de contratos

Resultados de la auditoría previa que este documento agrupa; no se presentan como una nueva ejecución de las suites al redactarlo:

| Comprobación | Resultado | Qué demuestra |
|---|---|---|
| `bun run typecheck` | Pasó | El árbol del corte auditado compila; no detecta los huecos de contrato mostrados por las fixtures |
| Tests existentes de handles y constantes | 12 pasaron | Cobertura existente de esas dos unidades, no equivalencia de todos los contratos |
| Foco con nodo registrado y handle real | Fallo reproducido | Identidades divergentes y comportamiento incorrecto de foco |
| Fixture de tipos Box/box/img | Diferencias reproducidas | Contrato de ref inconsistente |
| Fixture de tipos fuente/generado | Diferencia reproducida | Rechazo de `focusStyle.filter` en la declaración generada |
| Button real con `createRoot` y `createPressEvent` | Callback recibió `undefined` | Pérdida del evento en headless |
| Resolución de imports con Bun | Fuente local y tarball antiguo | Riesgo real de mezclar estados distintos |
| Cadena de montaje y destrucción | Inspeccionada en fuente | Falta de provider y cierre del terminal propio en mountApp |

No se ejecutó una suite completa GPU, una prueba física del terminal ni una publicación remota. No se afirma exhaustividad sobre cada contrato del repositorio: la auditoría transversal cubrió los ocho hallazgos contrastados en la auditoría transversal.

### 4.2 Investigación posterior del motor

Recibos de esta investigación, distintos de los del inventario inicial:

| Comprobación | Resultado |
|---|---|
| Reproducción de métricas de `Running` | Aserción roja: 1 línea frente a 2; control entero consistente |
| Readback GPU de `Running` | Dos grupos de filas frente a uno |
| Reproducción de orden backdrop/sombra | Aserción roja: 71 frente a 55; control de capa 71/71 |
| Reproducción de cobertura Canvas | Aserción roja: columna alpha 192 frente a 128; control entero uniforme |
| Tests existentes de texto/layout/render graph | 42 pasaron, 133 assertions |
| `bun run test ./packages/engine/src/testing/transform-clip.test.ts --timeout 30000` | 14 pasaron, 57 assertions |
| Tests existentes Canvas/rasterizador | 3 pasaron |
| Tests nativos de sombra con `gpu-tests` | 4 pasaron |

Las suites existentes no cubren las invariantes violadas por las reproducciones. Los fallos intencionales de las aserciones diagnósticas son evidencia de los defectos, no reparaciones realizadas.

Los probes principales se ejecutaron en memoria con Bun y las implementaciones reales. Hubo además harnesses temporales fuera del repositorio y artefactos de pruebas. Un harness Rust aislado confirmó la cobertura interior de la sombra, pero no se usó como sustituto de la comprobación TS/WGPU completa. Dos intentos iniciales con nodos crudos abortaron con `GPU layer render failed for bg`; no sustentan conclusiones sobre la corrección del pipeline. Las comprobaciones posteriores válidas utilizaron componentes reales.

No se modificaron código ni configuración del repositorio durante la investigación. No se verificó terminal físico ni recepción del portapapeles. Estos recibos corresponden a la investigación previa; la consolidación documental no volvió a ejecutar esos experimentos ni autoriza reparaciones.

### 4.3 Recibos de la tarea original de demos

Estos son recibos de la conversación original, **no suites ejecutadas de nuevo para este informe**:

| Recibo | Resultado | Alcance |
|---|---|---|
| `bun run typecheck` | Pasó en una etapa; hubo errores en etapas concurrentes posteriores | Compilación de ese corte, no del futuro estado final |
| `bun run test:demos` | Root: 11 passed / 92 assertions antes de correcciones posteriores | No detectó inicialmente varios defectos de interacción |
| `bun run test ./examples/demos/shared.test.tsx` | 3 passed / 45 assertions | Incluye resize del mismo artboard |
| Mission re-verificación | 4 passed / 29 assertions + auditoría nativa | Selección, foco, Enter, logs, pausa y resize |
| Effects corrección | 4 passed + captura nativa | Recibo del implementador, no prueba de identidad visual |
| Capturas 1536×1024 y 1200×800 | Tres demos renderizadas | Readback Rust/WGPU; no terminal físico |
| Suite completa registrada | 1044 passed / 1 failed / 6617 assertions | Falla preflight Kitty/tmux por falta de TTY real; no clasificar como regresión GPU |
| Ghostty / clipboard | Sin verificación física | CUA denegó acceso; OSC52 despachado no prueba recepción del SO |

No se ejecutaron reproducciones nuevas ni se modificó código, configuración, memoria o procesos del thread original. Ese inventario solo produjo documentación. Las prioridades son técnicas, no clasificaciones de seguridad.

## Decisiones, dependencias y criterios de aceptación

### Contratos: orden propuesto, no ejecución autorizada

Cada punto conserva su ID original. Las casillas representan trabajo propuesto, no autorizado ni realizado por este documento.

1. [ ] **F01:** eliminar la identidad de foco paralela y probar el handle contra el registro real.
2. [ ] **F02:** fijar el contrato único de ref y corregir sus consumidores mal tipados.
3. [ ] **F05:** explicitar propiedad del terminal y compartir contexto/liberación.
4. [ ] **F04:** acordar y propagar el evento de activación entre capas.
5. [ ] **F03:** derivar JSX fuente y distribución de la misma definición.
6. [ ] **F07:** retirar o regenerar stubs obsoletos y corregir comentarios.
7. [ ] **F06:** alinear resolución de desarrollo y aislar pruebas del paquete.
8. [ ] **F08:** consolidar constantes TypeScript y verificar paridad.

F02 y F03 deben coordinarse para que el contrato de ref corregido también llegue a distribución. No se propone eliminar APIs públicas ni cambiar nombres como paso automático.

### Motor: decisiones separadas de reparaciones internas

| ID | Próximo paso o decisión | Criterio de aceptación propuesto |
|---|---|---|
| M01 | Recuperar la reproducción histórica antes de elegir una reparación | Si reaparece: píxeles e hit-testing coinciden; recortar no desplaza contenido. Cubrir offsets positivos/negativos y capas anidadas |
| M02 / M02-LH | Una política coherente de métricas y participación de lineHeight en la medida; no redondeos dispersos por demo | Fuente entera/fraccionaria, ancho fit, multilineal y resize del mismo árbol: layout y pintura usan métricas compatibles, sin recortes |
| M03 | Reparar la invariante existente de orden y propiedad de batches, sin cambiar la API de sombra | Halo antes del fill propio incluso después de flush intermedio; control uniforme 71/71 con/sin backdrop; verificar colas uniformes y radios por esquina |
| M03-S | Decidir si la sombra excluye el interior de la geometría fuente y cómo preservar compatibilidad | Superficies opacas/translúcidas, offsets positivos/negativos, radios y sombras múltiples. No eliminar ciegamente todo sd<0 de la sombra desplazada |
| M04 | Decidir una política coherente de cobertura, manteniendo source-over correcto | Tiras adyacentes sin doble cobertura artificial; distinguir solapamiento intencional; probar coordenadas fraccionarias y líneas translúcidas |
| M05 | Evaluar si el área arbitraria es necesaria como capacidad de producto | Una serie de puntos define un área continua con alpha uniforme, escalado y cierre correctos |

M02 y M02-LH comparten el límite de métricas, pero no son el mismo defecto. M03 puede repararse sin decidir M03-S. M04 no exige por sí mismo ampliar la API de M05. F02/F03 deben coordinar el ref de desarrollo y distribución. F01 no demuestra que D02/D03 provengan del handle: los defectos de navegación de las demos tenían sus propios estados y handlers.

Las siguientes adaptaciones históricas no certifican una reparación del motor: redondear fuentes en la demo, reducir la opacidad de sombra o subir brillo, añadir layer explícita, reemplazar áreas translúcidas por opacas, o desactivar clipping. No se recomienda convertir los controles diagnósticos en workarounds de producción.

No se propone reescribir el reconciliador ni mover layout a Rust. La frontera TS/Rust y los contratos públicos se preservan salvo decisión explícita.

## Evolución de los diagnósticos iniciales

| Tema | Observación o propuesta inicial | Conclusión posterior que prevalece |
|---|---|---|
| M01 | El explorer registró raíz/sidebar y=40, viewport y=118 y hero y=181; atribuyó un desplazamiento de 40 px a viewportClip y reportó mejora al desactivarlo | El control posterior true/false/omitido produce 0 bytes de diferencia. Esa atribución histórica no basta para identificar una causa vigente ni justificar una corrección |
| M02 | Escala 0.78125: 15→11.71875 px y 20→15.625 px. Se aplicó Math.round(s(...)) en las demos | La investigación verificó el desacuerdo layout/render y reprodujo Running en dos líneas; además encontró M02-LH |
| M03 | Se explicó el vidrio pesado solo por shadow.wgsl. La demo pasó por backdropBrightness=130 y cambió sombra #00000088→#00000022 al retirar la compensación | M03 demuestra un orden de pintura defectuoso causado por índices obsoletos. La cobertura interior del shader permanece como M03-S, una cuestión separada |
| M04 | Las bandas se atribuían tentativamente a alpha/solapamientos; se usaron tiras opacas | Se confirmó doble cobertura en rasterización TS; añadir +1 en las tiras agrava el solapamiento. No es una falla del source-over ni evidencia de culpa en Rust |
| Resize | Se sospechó inicialmente de todo el artboard compartido | La regresión del mismo nodo pasó; el canvas de Mission sí tenía dimensiones capturadas y su corrección se revalidó |

**Referencias del clipping histórico, no causas vigentes demostradas:** [paint.ts:489–560](/Users/dev/ve/vexart/packages/engine/src/loop/paint.ts:489), [coordenadas locales:1156–1189](/Users/dev/ve/vexart/packages/engine/src/ffi/gpu-renderer-backend.ts:1156). El riesgo de clicks desplazados era una inferencia a partir de la discrepancia reportada, no una prueba física de mouse.

## Método de revisión de la tarea de demos

Se consultó `read_thread`, pero devolvió vacíos los items de las dos etapas recientes. Se recuperaron los dos registros locales de la conversación principal y los ocho subagentes asociados por `session_id` y `parent_thread_id`:

| Subagente | Responsabilidad y evidencia relevante |
|---|---|
| `demo_explore` | Arquitectura, clipping de 40 px, line-height, tamaños fraccionarios y sombra del vidrio |
| `asset_dunes` | Generación de la fotografía principal; no diagnosticó el motor |
| `asset_landscapes` | Cinco fotografías; no diagnosticó el motor |
| `asset_glass` | Fondo de cintas sin panel de vidrio horneado; no diagnosticó el motor |
| `apply_studio` | Implementación, eliminación del clip exterior y correcciones de interacción |
| `apply_mission` | Selección, foco, logs, resize y relleno de gráficos |
| `apply_effects` | Controles, composición del vidrio y retirada de compensación de brillo |
| `demo_verifier` | Auditoría independiente de interacción y revalidación de Mission |

Se revisaron mensajes disponibles, informes, resultados de herramientas pertinentes y fuente actual de los mecanismos principales. Algunos argumentos de delegación están serializados de forma opaca; no se presentan como texto recuperado. No se afirma haber descifrado contenido inaccesible ni que una tarea activa tenga ya un resultado definitivo.

**Formato OpenCode consultado directamente:** [explore.md](/Users/saturno/.config/opencode/agents/explore.md) y [verify.md](/Users/saturno/.config/opencode/agents/verify.md). Se conserva inventario individual, ubicación, mecanismo, impacto, clasificación, evidencia y remediación uno a uno. Se añade estado para no confundir un fallo histórico con uno pendiente.

## Trazabilidad de conversaciones

Registros bajo `/Users/saturno/.codex/sessions/2026/09/12/`:

- Principal: `rollout-2026-09-12T12-57-20-01a0968d-57cb-7020-a736-da7951229391.jsonl` y `rollout-2026-09-12T13-05-25-01a0968d-57cb-7020-a736-da7951229391_01a09694-bda1-7ee2-90a4-67b405e44952.jsonl`.
- Explorer: `rollout-2026-09-12T13-10-38-01a09699-8585-7893-bf5d-3b0caabde2f1.jsonl`: mensajes en líneas 258/299 (clip y line-height), 333 (fuentes), 411 (sombra).
- Dunes: `rollout-2026-09-12T13-11-44-01a0969a-8747-7b41-b7da-a4b61510e907.jsonl`: línea 111.
- Landscapes: `rollout-2026-09-12T13-12-01-01a0969a-ca1c-75a2-86ea-0c9d49dd7215.jsonl`: línea 126.
- Glass asset: `rollout-2026-09-12T13-12-13-01a0969a-f899-7322-85ff-13ef66857a7a.jsonl`: línea 81.
- Studio: `rollout-2026-09-12T13-14-05-01a0969c-aee0-7e11-9b17-bbc4099cd550.jsonl`: líneas 529/784.
- Mission: `rollout-2026-09-12T13-14-42-01a0969d-3ccc-7b81-afef-7022b24cf09f.jsonl`: líneas 604/769.
- Effects: `rollout-2026-09-12T13-15-06-01a0969d-9a10-7253-b426-fd5f23c957cf.jsonl`: líneas 465/807/853.
- Verifier: `rollout-2026-09-12T13-38-19-01a096b2-db17-7200-8f77-bc7c618fd0b1.jsonl`: líneas 418 (hallazgos) y 480 (Mission revalidado).

Las líneas de código históricas de los mensajes pueden desplazarse por las ediciones activas; los enlaces del cuerpo corresponden a las ubicaciones inspeccionadas al redactar.

**Límite de procedencia:** el historial de Pi conservado en `design-qa.md` queda fuera de esta auditoría consolidada. F01–F08 sí están incluidos aquí, pero conservan el origen de la auditoría transversal: no se atribuyen a la conversación de demos las reproducciones de NodeHandle ni PressEvent.

**Verificación de esta consolidación:** revisión documental y de enlaces; no se repitieron las suites anteriores ni se implementaron soluciones. Los dos archivos de origen se sustituyen por este informe único.
