# Plan de implementación: recreación visual e interactiva de PS5 en Vexart

**Estado (2026-09-09):** la base funcional local y el baseline automatizado
anterior (30 PASS, 0 FAIL, 345 aserciones en 5 archivos; 30 rutas GPU, store
9/67 y typechecks PASS) se conservan como evidencia histórica, no como
aprobación visual ni resultado pixel-identical. La verificación automatizada
final registra 35 PASS, 0 FAIL y 399 assertions en 7 archivos; root y PS5 typecheck pasan.
El probe GPU source-public de estilos de `<img>` ahora termina exit 0 con
`supported=true`, `roundedMaskApplied=true`, `objectFitApplied=true` y
`letterboxingApplied=true`, tras un fix interno TS/native sin cambios de API
pública. La suite enfocada previa del engine registra 47 PASS/0 FAIL y 495 assertions
en 4 archivos. El engine final registra 76 PASS/0 FAIL/594 assertions en 7
archivos; root y PS5 typechecks pasan. La captura mock final registra dos
capturas exactas de 1672×941 con checks verdaderos, sin claim pixel-perfect.

Los assets de Home y Centro de control se consideran suficientemente parecidos y
**aceptados por el usuario**; se detiene el asset polish. La limitación técnica
de `directors-cut-brush.png` (2172×724, sobre el límite de 2048) queda como nota,
no como blocker. La suite funcional, el engine final y las capturas requeridas pasan en el
alcance local. P1 y el narrow P2 del alias `boxShadow` están cerrados en la inspección final:
ambos helpers `resolveProps(node)` y la regresión GPU del alias pasan. No queda un
engine gate abierto. No se afirma validación física de Kitty, rendimiento
certificado, tarball instalado ni un PS5 completamente perfecto.

**STOP histórico de Phase 1:** [`api-blockers.md`](ps5-demo/api-blockers.md) y
[`validation.md`](ps5-demo/validation.md) conservan la reproducción y evidencia
rojas originales. Ese STOP documenta la decisión previa; el bloqueo mínimo de
estilos quedó cerrado tras la repetición aceptada por root. El caso offset bajo
transform/layer es un seguimiento separado y no debe presentarse como resuelto.

**Estado de los bloqueos visuales:** [`gpu-texture-limit-blocker.md`](ps5-demo/gpu-texture-limit-blocker.md)
conserva el baseline de textura y su fix de identidad/traslación. La evidencia
nueva de estilos está en [`image-style-blocker.md`](ps5-demo/image-style-blocker.md)
y la revisión del mock en [`design-qa.md`](../design-qa.md); los assets se aceptan
por suficiencia visual y [`mock-assets.md`](ps5-demo/mock-assets.md) documenta su
procedencia y la ausencia de claim pixel-identical.

**Evidencia final de la pasada:** root confirma 35 PASS, 0 FAIL y 399 assertions
en 7 archivos, en 28.43 s (`/tmp/ps5-final-functional.log`). El engine final
registra 76 PASS, 0 FAIL y 594 assertions en 7 archivos
(`/tmp/ps5-final-engine.log`); motion, opacidad, crop y bounds/shadows pasan. La
captura mock final confirma dos capturas exactas de 1672×941 con checks verdaderos
(`/tmp/ps5-final-mock-visual.log`); la cobertura anterior de 30 rutas y cuatro
estados secundarios se conserva. Los assets están aceptados y no son un gate.
P1 y el narrow P2 del alias `boxShadow` pasan en la inspección final de root; no
queda un engine gate abierto. No se afirma Kitty físico, rendimiento o tarball.

**Producto:** una aplicación de demostración que recrea, dentro de una terminal, la experiencia visual y funcional de un sistema PS5. No emula juegos, PSN, compras, hardware, audio ni vídeo reales. Las funciones fuera del alcance se representan explícitamente como no disponibles o mediante simulaciones locales coherentes.

**Referencia visual aprobada:** [copia local del mock del centro de control](ps5-demo/references/approved-home-control-center.png). Su fuente original está fuera del repositorio en `/Users/saturno/.codex/generated_images/01a081a5-8919-7581-9022-95ec29b64afa/exec-b3cc8e0d-3074-42d3-8f96-a8f828d3372d.png`; el worker de assets ya copió la referencia local y validó la procedencia/cobertura del catálogo. La referencia sigue siendo contrato visual; la integración del inventario no equivale a fidelidad exacta ni a un PS5 completo.

---

## 1. Objetivo y definición de «completo»

La aplicación debe sentirse como un sistema PS5 completo en lo visual y en la interacción local: pantallas conectadas, foco consistente, navegación direccional, overlays, transiciones, cargas simuladas, configuración persistente y estados que se reflejan entre áreas. «Completo» significa cubrir el inventario cerrado de este documento, no reproducir todas las funciones de cualquier versión futura del firmware.

La referencia del [Centro de control de PlayStation](https://www.playstation.com/es-es/support/games/customize-ps5-control-center/) y la estructura de listas de [biblioteca y listas de juegos](https://www.playstation.com/es-es/support/games/create-gamelist/) deben guiar la navegación. Las opciones de movimiento y accesibilidad deben ser coherentes con las [opciones de accesibilidad de PS5](https://www.playstation.com/es-es/support/hardware/ps5-accessibility-settings/).

### Inventario de pantallas y áreas

- **Arranque y usuarios:** splash inicial, selección de usuario y entrada al inicio.
- **Inicio de juegos:** carrusel de **24 juegos** con selección, desplazamiento hacia ambos lados, cambio de fondo, información y menú contextual. Debe haber suficientes juegos para que el desplazamiento y la aparición de elementos adicionales sean perceptibles.
- **Centro de cada juego:** información, actividades, trofeos, galería y acción de iniciar; el contenido depende del juego seleccionado.
- **Lanzamiento simulado:** imagen de arranque → pantalla de carga → pantalla de título. Se puede abrir el centro de control, volver, cambiar de juego o cerrar la sesión simulada sin dejar transiciones pendientes.
- **Biblioteca:** colección, instalados, búsqueda, filtros, ordenación y listas de juegos.
- **Centro de control:** tarjetas desplazables, controles seleccionables, apertura de paneles y restauración exacta del foco al cerrar.
- **Selector de juegos:** juegos recientes, regresar a uno y cerrarlo.
- **Ajustes:** categorías, subpantallas, interruptores, selectores, deslizadores, confirmaciones y persistencia local.
- **Perfil y trofeos:** perfil local, cambio de usuario, catálogo de trofeos y detalles.
- **Notificaciones y descargas:** leer/descartar notificaciones; progreso simulado con pausar, reanudar y cancelar.
- **Game Base:** amigos, perfiles de demostración, conversaciones locales y paneles de grupo; sin comunicaciones reales.
- **Store y multimedia:** navegación por catálogos y fichas; sin compras, streaming ni reproducción.
- **Galería:** rejilla de imágenes locales, apertura, siguiente/anterior y regreso.
- **Alimentación:** reposo, reinicio y apagado de la **simulación**, nunca del ordenador anfitrión.

### Clases de comportamiento

Cada control debe quedar clasificado en la especificación de su pantalla:

1. **Real dentro de la aplicación:** búsqueda, ordenación, cambio de usuario, edición de texto, listas y ajustes.
2. **Simulado con estado coherente:** volumen, conexión, almacenamiento, descargas y sesión del juego. Cambian los datos mostrados sin tocar el sistema anfitrión.
3. **Fuera de alcance:** compras, PSN, audio, vídeo, hardware y gameplay. Deben mostrar una limitación clara; nunca dejar un botón que parezca funcionar y no haga nada.

Las pantallas no pueden ser islas. Por ejemplo, completar una descarga simulada debe marcar el juego como instalado, actualizar el almacenamiento y generar una notificación.

---

## 2. Paquete de especificaciones para los agentes

La documentación de trabajo futura deberá vivir bajo `docs/ps5-demo/`. Este plan es el índice y contrato de alto nivel; cada agente recibirá solo las fichas relevantes además de los contratos compartidos.

| Documento futuro | Contenido mínimo |
|---|---|
| `scope.md` | Inventario, exclusiones, referencias y estado de cada requisito. |
| `screens/*.md` | Especificación por pantalla con diseño, contenido, controles, destinos y criterios de aceptación. |
| `state-and-navigation.md` | Estado global, acciones, persistencia, foco, overlays y ciclo de vida de juegos. |
| `visual-motion-assets.md` | Tokens, medidas, tipografía, iconos, imágenes, animaciones, reducción de movimiento y adaptación de tamaño. |
| `work-items.md` | Dependencias, propietario, archivos permitidos, checks y condición de parada por tarea. |
| `api-blockers.md` | Reproducción, evidencia, impacto y decisión para cualquier limitación de la API pública. |

### Ficha obligatoria de cada pantalla

Cada ficha debe incluir:

- ID estable y referencia visual aprobada.
- Cómo se entra y estado inicial.
- Geometría, assets y textos.
- Cada control y su acción.
- Navegación direccional, foco inicial y foco de regreso.
- Límites del desplazamiento.
- Animaciones, cancelación, inversión e interrupción.
- Estados de carga, vacío, error y función no disponible.
- Datos que se conservan al salir o reiniciar.
- Pruebas de comportamiento y evidencia visual requeridas.

No se deben delegar pantallas secundarias con decisiones de diseño esenciales abiertas. Antes de implementar ajustes, biblioteca, lanzamiento, perfil, galería y paneles se necesitan referencias o diseños cerrados equivalentes a la dirección aprobada para el inicio.

---

## 3. Contratos compartidos

Antes de paralelizar pantallas se debe acordar una única base reactiva y de navegación. No introducir otro framework ni sistemas genéricos que no sean necesarios.

### Modelo mínimo de estado

- Usuario activo.
- Catálogo de juegos y estado de instalación.
- Pantalla actual.
- Overlay activo y destino de retorno.
- Juego seleccionado.
- Sesión del juego: `idle`, `launching`, `loading`, `title`, `suspended` o `closed`.
- Ajustes locales.
- Descargas y notificaciones.
- Preferencias de accesibilidad, incluida reducción de movimiento.

### Acciones compartidas

Las pantallas consumen acciones comunes para navegar, volver, seleccionar juego, iniciar, cerrar, abrir panel, cambiar ajuste y actualizar datos. Ningún agente crea su propio router, catálogo o sistema de foco.

### Reglas de interacción

- Flechas: navegación según el contexto.
- Confirmar: activa el control enfocado.
- Volver: cierra primero el panel superior y luego retrocede de pantalla.
- Tecla dedicada para el centro de control y otra para opciones, verificadas en la terminal objetivo.
- En campos de texto, las flechas editan texto y no mueven el carrusel.
- Ratón y teclado desembocan en las mismas acciones.
- Solo la capa superior recibe input.
- Selección y foco son distintos: el juego puede seguir seleccionado detrás de un panel, pero no recibe teclas mientras el panel está activo.
- Al cerrar un overlay se restaura la pantalla, la selección, el desplazamiento y el foco anteriores.

### Contrato del carrusel de 24 juegos

- La fila inicia con las tarjetas utilitarias PlayStation Store y Biblioteca de juegos, contiene los 24 juegos del catálogo entre ellas y no cuenta las utilitarias como juegos.
- Cada juego tiene un ID estable, portada, fondo, título, metadatos y recursos de lanzamiento propios.
- Izquierda/derecha seleccionan el anterior/siguiente.
- Cuando la selección alcanza el borde visible, la fila se desplaza para revelarla.
- Los extremos se detienen; no hay salto circular salvo que una referencia aprobada lo exija.
- Invertir la dirección durante una animación continúa desde la posición actual.
- Los inputs rápidos no generan una cola de animaciones atrasadas.
- Fondo, textos y detalles siempre terminan correspondiendo al último juego seleccionado.
- Abrir/cerrar el centro de control conserva selección y desplazamiento.
- Redimensionar conserva visible el juego seleccionado.
- El recorrido de prueba incluye `1 → 24 → 1` e inversión durante el movimiento.

---

## 4. Dirección visual, assets y movimiento

### Base visual

- Usar el mock aprobado como referencia del centro de control y del lenguaje visual general.
- Tomar **1920 × 1080 en Kitty directo** como escenario principal de diseño y validación, además de 1280 × 720 y redimensionado.
- Unificar tipografía, espaciados, radios, iconografía, sombras, transparencias y estados de selección.
- Mantener assets locales durante la ejecución; no depender de descargas en mitad de una navegación.
- Proporcionar para cada uno de los 24 juegos portada, fondo, título y recursos de lanzamiento; no repetir tres imágenes para fingir un catálogo amplio.

### Movimiento

Los valores siguientes son una propuesta inicial de diseño, no tiempos medidos de Sony:

| Transición | Duración inicial |
|---|---:|
| Énfasis del elemento enfocado | 140–180 ms |
| Desplazamiento del carrusel | 220–280 ms |
| Cambio de fondo | 350–450 ms |
| Apertura/cierre de panel | 180–240 ms |
| Cambio de pantalla | 220–300 ms |

La tabla debe vivir como tokens centrales. Cada animación define también su cancelación, inversión y estado final. La opción de reducir movimiento debe tener efecto real en transiciones y énfasis.

No se añaden efectos solo para cargar el motor: la exigencia debe venir de reproducir de forma consistente el sistema visual, el carrusel, los fondos, los overlays y las transiciones.

---

## 5. Validación de la API pública y regla de bloqueo

La aplicación de demostración debe usar las exportaciones públicas de aplicación de Vexart, preferentemente el barrel unificado [`packages/app/src/barrel.ts`](../packages/app/src/barrel.ts), que corresponde a `import { ... } from "vexart"`. El runtime de la demo no debe acceder directamente a FFI, helpers de testing como `renderToBuffer`, nodos privados ni imports profundos de fuentes internas. El JSX generado puede referenciar legítimamente `vexart/engine` cuando lo requiera el plugin de compilación distribuido; ese subpath no se prohíbe por sí mismo. Las dependencias públicas ordinarias tampoco se consideran privadas automáticamente: cada import debe seguir el contrato público/documentado, en lugar de saltarse la distribución con aliases internos.

Referencias de arquitectura que deben mantenerse alineadas:

- [`docs/PRD.md`](./PRD.md) — requisitos y decisiones de producto.
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — capas y frontera TypeScript/Rust.
- [`docs/API-POLICY.md`](./API-POLICY.md) — API pública frente a API interna.
- [`docs/agent-reference.md`](./agent-reference.md) — referencia detallada de runtime y distribución.
- [`packages/app/src/barrel.ts`](../packages/app/src/barrel.ts) — contrato de entrada pública de la aplicación.
- [`packages/engine/src/loop/scroll.ts`](../packages/engine/src/loop/scroll.ts) — evidencia actual del contrato de `ScrollHandle`.

### Prueba técnica inicial

El runner source-public aislado se acepta como gate de desarrollo después del
fix de posición/recorte con transformaciones. La ruta Home de
identidad/traslación ya pasa la QA de 1280/1920 y el recorrido de 26 tiles, pero
no es una prueba de una preview completa; el baseline de textura y sus límites
se conservan en [`gpu-texture-limit-blocker.md`](ps5-demo/gpu-texture-limit-blocker.md).
La pasada final cubre las rutas solicitadas. El probe público de estilos de
`<img>` pasa de forma acotada (`cornerRadius`, `fill/cover` y `contain` observables),
con evidencia en [`image-style-blocker.md`](ps5-demo/image-style-blocker.md); esto
no sustituye los no-claims de terminal física ni fidelidad pixel-perfect.
El probe público de estilos de `<img>` queda demostrado para el caso mínimo
documentado. La suite funcional final registra 35 PASS, 0 FAIL y 399 assertions
en 7 archivos (`/tmp/ps5-final-functional.log`). El engine final registra 76 PASS,
0 FAIL y 594 assertions en 7 archivos (`/tmp/ps5-final-engine.log`); la visual
secundaria de cuatro estados, la pasada final de 30 capturas y el mock final pasan.
Bounds/shadows y el narrow P2 del alias `boxShadow` pasan en la inspección final
de root; no queda un engine gate abierto. No se cierran claims de Kitty físico,
rendimiento o tarball con esta evidencia.
El baseline funcional histórico forma parte del resultado source anterior: 30
PASS, 0 FAIL y 345 aserciones en 5 archivos. La suite final posterior registra
35 PASS, 0 FAIL y 399 assertions, con root y PS5 typecheck PASS; la pasada visual
final confirma 30 capturas solicitadas y el mock final confirma dos capturas
exactas de 1672×941. Esto no implica un claim pixel-perfect ni validación física.
El engine final pasa bounds/shadows en el alcance local; no queda un engine gate
abierto. No se certifican Kitty físico, rendimiento o tarball. El runner `scripts/ps5-demo/run-app-packaged.sh verify`
genera un consumidor y bundle temporales: root reporta GPU PASS en ambos tamaños y
store 9/67, pero el tarball final todavía no está instalado ni validado y el runner
no modifica el `dist` del repositorio.

La prueba mínima inicial y sus checks de continuación deben cubrir, usando el consumidor público previsto:

1. Muestre imágenes locales.
2. Presente una fila con selección, recorte y desplazamiento correcto.
3. Cambie fondos durante navegación rápida.
4. Abra un overlay y restaure el foco.
5. Mantenga correctos los clics mientras los elementos están transformados.
6. Compruebe el ciclo de vida del consumidor publicado y el reconciliador compartido.

El `ScrollHandle` actual expone `scrollTo`, `scrollBy` y `scrollIntoView` para el eje vertical, mientras expone `scrollX`/`scrollY` como estado. La ruta de traslación queda validada sin ampliar la API; las capturas de filtros blur del nodo raíz o descendientes, y transformaciones complejas conservan su comportamiento completo. No se debe ocultar el límite reduciendo la escena, añadiendo tiling genérico o introduciendo un workaround.

### Parada y reporte ante una limitación

Si una conducta requerida no puede conseguirse correctamente mediante la API pública:

- El agente se detiene y avisa al coordinador.
- Se pausa la implementación del proyecto/demo para tomar una decisión explícita sobre el siguiente paso.
- Se registra en `api-blockers.md`: requisito, reproducción mínima, API utilizada, resultado esperado, resultado observado, evidencia, impacto y alternativas.
- No se parchea el motor, no se usa una API privada y no se elimina silenciosamente la función.
- La aproximación alternativa solo se adopta después de una decisión explícita.

No declarar una capacidad imposible antes de probarla. Tampoco ocultar una limitación externa ya excluida del alcance.

**Advertencia de lectura del código:** comentarios antiguos que indiquen que el compositor o el fast path están ausentes no deben usarse como evidencia; fueron contradichos por la verificación actual. Este plan no afirma que el fast path esté desconectado.

---

## 6. Fases y criterios de salida

### Fase 0 — Cerrar especificaciones y referencias

**Estado:** completa y aceptada por root: diseño, contratos y procedencia/cobertura visual del catálogo de 24 juegos (18 instalados + 6 descargables) validados. La implementación se registra en las fases siguientes.

**Entregables:** inventario cerrado, exclusiones, fichas de pantallas, assets, estados, tokens visuales, referencias secundarias y criterios de aceptación.

**Salida:**

- [x] Todas las áreas del inventario tienen ficha y referencia.
- [x] Las decisiones esenciales de diseño no quedan abiertas para los agentes.
- [x] Los 24 juegos tienen IDs y shape de metadatos definidos; el QA final del artwork queda pendiente.
- [x] Las simulaciones y las funciones fuera de alcance están etiquetadas.
- [x] Existe el contrato único de estado, navegación y foco.
- [x] Correcciones del contrato de demo (descargas, overlays, galería, selector y personalización del centro) revisadas y aceptadas por root.
- [x] La procedencia y cobertura visual del catálogo de 24 juegos (18 instalados + 6 descargables) quedan validadas por el worker de assets.

### Fase 1 — Validar API pública

**Estado:** el gate **source-public** de desarrollo valida la ruta Home de identidad/traslación en 1280/1920 (2 tests, 48 aserciones, 26 tiles). La QA source anterior registra 30 PASS, 0 FAIL y 345 aserciones como baseline histórico; la suite funcional final registra 35 PASS, 0 FAIL y 399 assertions, con root y PS5 typecheck PASS. El probe mínimo de estilos de `<img>` está PASS acotado: `cornerRadius`, `fill/cover` y `contain` producen diferencias observables; ver [`image-style-blocker.md`](ps5-demo/image-style-blocker.md). La reproducción histórica de transform/clip permanece en [`api-blockers.md`](ps5-demo/api-blockers.md) y [`validation.md`](ps5-demo/validation.md). La pasada final confirma 76 PASS/0 FAIL/594 assertions del engine, cuatro estados secundarios PASS y 30 capturas en 15 rutas × 2 viewports. Los assets están aceptados; el engine final pasa bounds/shadows en el alcance local y P1 y el narrow P2 del alias `boxShadow` pasan en la inspección final de root; no queda un engine gate abierto.

**Entregables:** prueba mínima del carrusel, imágenes, overlays y consumidor empaquetado.

**Salida:**

- [x] La aplicación fuente compila mediante la entrada pública `vexart` en el runner aislado de desarrollo; el typecheck pasa.
- [x] La ruta Home de carrusel de identidad/traslación funciona con recorte, foco y selección en 1280/1920: 2 tests, 48 aserciones y recorrido completo de 26 tiles.
- [x] La QA source final cubre navegación rápida y cambio de fondo sin estado incoherente; queda pendiente su aprobación visual/manual.
- [x] La QA source final cubre recuperación de foco y selección del overlay; queda pendiente su aprobación visual/manual.
- [x] La limitación anterior tiene reporte, evidencia y decisión explícita de continuación; no se oculta ni se confunde con la validación final.

### Fase 2 — Construir la base común

**Estado:** base común y módulos de pantalla están implementados e integrados a nivel fuente; todas las pantallas funcionan dentro del alcance local simulado. La QA source final, el engine final y root/PS5 typechecks pasan. La fidelidad visual queda aceptada dentro del criterio de assets del usuario; no queda un gate funcional activo en el alcance local. P1 y el narrow P2 del alias `boxShadow` están cerrados en la inspección final:
ambos helpers `resolveProps(node)` y la regresión GPU del alias pasan. No queda un
engine gate abierto. No se aplican workarounds.

**Entregables:** estado, acciones, navegación, foco, overlays, tokens, assets, persistencia, arranque, selección de usuario y alimentación simulada.

**Salida:**

- [x] Los contratos compartidos, el store único y el host fuente están establecidos; las vistas piloto consumen las acciones compartidas.
- [x] El shell registra una capa de input superior para overlays/power.
- [x] La QA source final cubre el retorno de foco al cerrar overlays; Control Center y Options están integrados. La cobertura visual final pasa; no se afirma terminal física.
- [x] Arranque, selección de usuario y reposo/reinicio/apagado simulados funcionan sin tocar el ordenador anfitrión.
- [x] Los ajustes, catálogo mutable y storage persisten en el ámbito local de la aplicación.
- [x] La reducción de movimiento modifica las transiciones locales; la suite final cubre motion de forma acotada y el check final de bounds/shadows pasa; no queda un engine gate abierto.

### Fase 3 — Completar un recorrido vertical

**Estado:** los módulos de Phase 3 y el recorrido de host Home → Game Hub → Launch → Centro de control están implementados e integrados y funcionan localmente. La suite funcional final registra 35 PASS, 0 FAIL y 399 assertions; la pasada visual confirma 30 capturas en 15 rutas × 2 viewports y la captura mock final registra dos capturas exactas de 1672×941. Los assets están aceptados por el usuario y no son un gate. El engine final registra 76 PASS, 0 FAIL y 594 assertions con motion/opacidad/crop/bounds-shadows cubiertos. P1 y el narrow P2 del alias `boxShadow` están cerrados en la inspección final:
ambos helpers `resolveProps(node)` y la regresión GPU del alias pasan. No queda un
engine gate abierto. No se encoge la escena ni se adopta tiling genérico, workaround adicional o elevación artificial de límites.

**Entregables:** inicio con 24 juegos → centro del juego → lanzamiento → carga → título → centro de control → regreso.

**Salida:**

- [x] La QA source final recorre `1 → 24 → 1` en ambos sentidos y las capturas finales cubren las rutas solicitadas; no se afirma pixel-perfect.
- [x] La QA source final confirma que fondo, textos y detalles siguen la selección; el signoff visual queda pendiente.
- [x] La QA source final cubre lanzamiento, loading y title como estados simulados navegables.
- [x] La QA source final cubre Centro de control, vuelta, cambio y cierre sin perder foco ni dejar animaciones huérfanas; el estrés visual completo queda pendiente.
- [x] La QA source final ejercita el recorrido con teclado y puntero; no se presenta como validación física de Kitty.

### Fase 4 — Completar áreas secundarias

**Estado:** las pantallas secundarias del inventario están implementadas, integradas y funcionales dentro del alcance local simulado. La QA source final y las capturas requeridas cubren las rutas; los assets están aceptados y no son un gate. No se afirma validación física de Kitty.

**Entregables:** biblioteca, ajustes y subpantallas, selector, perfil, trofeos, notificaciones, descargas, Game Base, Store/multimedia y galería.

**Salida:**

- [x] Las pantallas del inventario están montadas y las rutas principales de entrada/salida quedan cubiertas por la QA source final y la pasada visual; no se afirma signoff físico.
- [x] Búsqueda, filtros, ordenación, listas, toggles, selectores, sliders y confirmaciones producen cambios observables dentro del estado local; la cobertura visual requerida pasa.
- [x] Descargas, instalaciones, notificaciones y almacenamiento se mantienen coherentes dentro de la simulación local; los recorridos cruzados aún requieren signoff manual.
- [x] El perfil y las preferencias se reflejan donde corresponde en el estado y las vistas locales; no se afirma una copia pixel-perfect.
- [x] Las funciones no disponibles están señalizadas y no aparentan operar en la simulación local.

### Fase 5 — Integración y validación final

**Estado:** la integración de módulos está realizada. La suite funcional final registra 35 PASS, 0 FAIL y 399 assertions; el engine final 76 PASS, 0 FAIL y 594 assertions; la visual secundaria de cuatro estados, las 30 capturas previas y las dos capturas mock exactas pasan. Los assets son suficientemente parecidos y aceptados; no son un gate. P1 y el narrow P2 del alias `boxShadow` están cerrados en la inspección final:
ambos helpers `resolveProps(node)` y la regresión GPU del alias pasan. No queda un
engine gate abierto. No se afirma Kitty físico, rendimiento certificado, tarball instalado ni producto pixel-perfect.

**Entregables:** recorridos cruzados, escenas visuales, checks de interacción, perfil interno, smoke de terminal y prueba de paquete.

**Salida:**

- [ ] Se cumplen las pruebas de comportamiento y las referencias visuales aprobadas.
- [ ] No hay pérdida de foco, selección, estado ni overlays atascados en recorridos cruzados.
- [ ] El consumidor empaquetado funciona sin depender de aliases del monorepo.
- [ ] Se distinguen resultados offscreen, internos, de terminal física y de consumidor empaquetado.
- [ ] Los bloqueos conocidos están reportados y decididos.

---

## 7. División de trabajo para agentes Luna

No repartir pantallas antes de cerrar las fases 0–2. Una vez estabilizada la base, usar propietarios con archivos exclusivos:

| Área | Responsabilidad |
|---|---|
| Inicio, biblioteca y juegos | Carrusel de 24 juegos, fondos, detalles, biblioteca, listas y lanzamiento simulado. |
| Ajustes | Categorías, subpantallas, controles, almacenamiento, confirmaciones, persistencia y accesibilidad. |
| Centro de control, perfil y paneles sociales | Overlays, selector, perfil, trofeos, Game Base, notificaciones, descargas y restauración de foco. |
| Base compartida y ciclo de arranque | Estado común, arranque, selección de usuario y alimentación simulada. |
| Store, multimedia y galería | Catálogos locales, fichas, galería y estados no disponibles. |
| Validación | Pruebas de comportamiento, escenas visuales, oráculos negativos, métricas y packaging en archivos separados. |

Un solo propietario modifica archivos compartidos. Los demás solicitan cambios de contrato al coordinador; no crean routers, catálogos, tokens o helpers paralelos.

Cada encargo a Luna debe incluir: objetivo, IDs de requisitos, referencia, dependencias, archivos de escritura exclusivos, checks enfocados y condición de parada. «Compila» o «se ve bien aislado» no es criterio suficiente para terminar una pantalla.

---

## 8. Rendimiento y validación sin confundir capas

La aplicación debe llevar el motor a una carga representativa, pero cualquier afirmación debe indicar qué se midió.

### Cargas reproducibles

1. **Navegación normal:** selección, cambios de pantalla, ajustes y overlays.
2. **Navegación intensa:** recorrer todo el catálogo, invertir rápidamente, cambiar fondos y abrir paneles.
3. **Sesión prolongada:** repetir recorridos para detectar acumulación de recursos, degradación y pérdida de foco.

24 fondos RGBA de 1920×1080 representan aproximadamente 190 MiB de píxeles sin comprimir, antes de copias y recursos adicionales. Hay que observar caché, memoria y liberación de recursos; no cargar todo indiscriminadamente.

### Objetivos y métricas

Usar como contexto los objetivos de calidad del PRD: primer frame menor de 120 ms, 60 fps sostenidos en el showcase, input→visual menor de 50 ms p95 e idle CPU menor de 2 %. No inventar un presupuesto específico de PS5. Si se aprueba una línea base para este demo, usar una puerta de regresión relativa de como máximo 10 %.

Registrar, cuando corresponda, total/frame p50, p95 y p99, además de walk, layout, paint, composite, readback, emisión nativa, bytes de transporte y memoria. Los objetivos aspiracionales del runtime a 120 fps no equivalen a una certificación de este demo.

### Capas de evidencia

- **Comportamiento:** estados, acciones, conteos de callbacks, teclado y ratón; independiente de los píxeles.
- **GPU offscreen:** frames estables, foco, selección, overlays y comparación visual.
- **Transporte interno:** perfiles de etapas y bytes; no prueba la imagen visible ni los fps.
- **Terminal física:** Kitty directo y revisión de input/latencia/fluidez en el terminal real; no sustituirla con una PTY sintética.
- **Consumidor empaquetado:** tarball limpio, imports públicos y reconciliador compartido; no se demuestra con aliases del monorepo.

No afirmar «60 fps visibles» a partir de un render offscreen o de `frame-breakdown`. No afirmar compatibilidad física a partir de tests internos.

### Secuencia de checks

1. Typecheck y compilación con imports públicos.
2. Pruebas enfocadas de comportamiento y estados, incluyendo teclado y puntero.
3. Escenas GPU offscreen y oráculos de píxeles.
4. Perfil interno a 1920×1080 para carrusel, overlays y navegación rápida.
5. Smoke/captura de Kitty directo en terminal física.
6. Tras los checks integrados, repetir el build y smoke completo del tarball en un consumidor limpio para la aplicación integrada.

Los checks destructivos o que reescriban referencias, baselines, snapshots de API o `dist` requieren una decisión explícita y deben ejecutarse en aislamiento; no son parte automática de este guardado de plan.

---

## 9. Criterio final de terminado

La recreación se considera lista cuando:

- Todas las pantallas del inventario son alcanzables y tienen salida.
- Cada control produce el resultado real o simulado especificado.
- Ajustes, descargas, instalaciones, notificaciones, usuarios y juegos permanecen coherentes entre pantallas.
- El catálogo completo se navega sin perder selección o foco.
- Las cargas se pueden interrumpir sin reaparecer después de salir.
- Las pantallas coinciden con sus referencias aprobadas.
- Pasan checks de comportamiento, GPU, recorridos físicos y consumidor empaquetado, cada uno identificado por su capa.
- No quedan bloqueos conocidos escondidos ni cambios de API pública introducidos por la demo.
