# Vexart — Kitty visual QA tracker

> Documento vivo para no perder el hilo de la verificación visual. Se actualiza
> después de cada bloque de pruebas. La evidencia visual se captura en Kitty;
> una prueba headless no cuenta como prueba visual.

## Objetivo

Hacer que los ejemplos existentes de Vexart funcionen y se vean correctamente
en Kitty, sin secuencias de escape visibles, pantallas vacías, crashes ni
artefactos de layout.

## Entorno verificado

- **Kitty:** `/Applications/kitty.app`, versión 0.48.2.
- **Control remoto:** socket Unix `/tmp/vexart-kitty-3.sock`.
- **Ventana de QA:** Kitty OS window independiente (platform window `8786`,
  child window `18` durante la última pasada).
- **Evidencia:** capturas de pantalla de Kitty con `screencapture` y control de
  teclado con `kitten @ send-text`.
- **Regla importante:** `kitten @ launch --type=window` crea un split dentro de
  una OS window existente (shell + app) y produce capturas engañosas a la mitad.
  La QA visual válida usa `kitten @ launch --type=os-window`, que abre la app
  en una ventana de Kitty separada y completa.
- **Nota histórica:** algunas capturas inactivas antiguas devolvieron un frame
  negro cuando se capturó la pantalla completa. La captura dirigida al
  `platform_window_id` de Kitty (`screencapture -x -l ...`) conserva la ventana
  correcta sin traerla al frente; cualquier frame negro o de otra ventana se
  descarta como evidencia inválida.
- **Protocolo paralelo corregido (desde 2026-09-06):** cada agente conserva su
  propia Kitty OS window en background, envía teclas/mouse con
  `kitten @ ... send-text --match id:<child-window>` y captura únicamente su
  `platform_window_id` con `screencapture -x -l <platform_window_id>`. No se
  permite `osascript activate`, `focus-window` ni captura de pantalla completa;
  si el PNG no se puede atribuir a esa ventana, la prueba queda `BLOCKED` y no
  se cuenta como PASS/FAIL.

## Cambios realizados

### Render y Kitty

- `packages/engine/src/ffi/gpu-renderer-backend.ts`
  - Añadido factory interno de backend sin presentación Kitty para render-to-buffer.
  - El frame final usa un ID Kitty estable por proceso y el protocolo de frames
    animados; así se evita reemplazar/borrar la imagen raíz en cada tick.
  - Las capas retenidas se registran también durante reuse para que el compose
    final siempre tenga una escena completa.
- `packages/engine/src/loop/paint.ts`
  - El compose final se completa después de updates nativos de capas; evita que
    una actualización asíncrona deje visible un canvas incompleto.
- `native/libvexart/src/kitty/encoder.rs`
  - Transmisión inicial con placement explícito y updates `a=f`/`a=a`.
- `native/libvexart/src/kitty/transport.rs`
  - Coalescencia por hash de payload y tracking de frames por imagen.
  - Transporte directo y SHM comparten la misma semántica de frame/placement.
- `packages/engine/src/testing/render-to-buffer.ts`
  - Los golden/headless tests ya no escriben escapes Kitty en stdout.

### Reactividad y componentes

- `packages/headless/src/inputs/{button,checkbox,input,slider,switch,textarea}.tsx`
  - Render props envueltos en `createMemo`; el tracking de focus/blink sale del
    render para evitar recursión de SolidJS durante edición/focus.
- `packages/headless/src/containers/tabs.tsx`
  - El árbol de pestañas mantiene un contenedor estable y separa las regiones
    reactivas de headers/panel; cambiar focus o contenido ya no remonta
    subárboles interactivos ni recursa.
- `packages/headless/src/inputs/{button,checkbox,slider,switch}.tsx`
  - Cada render prop queda dentro de un wrapper `fit` estable; al cambiar focus,
    pressed o checked el control conserva su slot y no se intercambia con su
    hermano.
- `packages/app/src/components/primitives.tsx` y
  `packages/styled/src/components/card.tsx`
  - Children capturados con `untrack` para evitar que cada señal de un control
    reconstruya subárboles completos.

### Visuales y tooling

- `examples/void-showcase.tsx`
  - Layout de seis pestañas con ancho completo, header legible y debug opt-in.
  - La ayuda de teclado vive en el subtítulo del header; se retiró el footer
    pegado al borde inferior porque Kitty puede recortar esa última fila.
- `packages/styled/src/components/tabs.tsx` y componentes de texto/diff/markdown
  - Dirección/anchos corregidos para que filas, paneles y columnas se pinten
    horizontalmente como fueron diseñados.
- `packages/internal-devtools/src/{kitty,server}.ts`
  - El control remoto busca el binario instalado de Kitty (incluido `.app`).

### Correcciones implementadas en esta pasada (2026-09-06)

- `packages/engine/src/loop/composite-scroll.ts`
  - El extent de un scroller recorre descendientes y textos directos, pero se
    detiene en scrollers anidados. El wheel ya mueve el contenido del ejemplo.
- `packages/engine/src/ffi/{flex-sync,text-layout}.ts` y `loop/walk-tree.ts`
  - Wrapping responsive con `whiteSpace`/`wordBreak`, medición con opciones de
    fuente, wrappers fit-content y `flexShrink` para columnas estrechas.
- `packages/styled/src/components/button.tsx` y
  `packages/headless/src/inputs/button.tsx`
  - Enter/Space/mouse comparten activación, el foco se conserva y los estados
    hover/active/focus tienen contraste. Los botones intrínsecos usan padding
    simétrico en vez de una justificación centrada que podía pintar el texto
    fuera del rectángulo durante la medición.
- `packages/headless/src/{containers/tabs,collections/list,collections/table}.tsx`
  - Headers, filas y celdas usan `<For>` estable; Tab/Down ya no desmonta el
    panel ni termina el proceso Bun.
- `packages/engine/src/loop/layout-adapter.ts` y
  `packages/headless/src/overlays/dialog.tsx`
  - Floating root se separa de su padre lógico, respeta ROOT/PARENT/ELEMENT,
    attach points, offsets, viewport y z-order; Escape cierra sólo el dialog
    superior aunque el foco esté en un hijo.

## Evidencia automatizada

| Prueba | Resultado | Evidencia |
| --- | --- | --- |
| TypeScript typecheck | ✅ 0 errores | `bun typecheck` |
| Tests TypeScript | ✅ 358 pass / 0 fail / 4 skip / 765 expect | `bun test` |
| Tests Rust | ✅ 146 pass / 0 fail | `cargo test` en `native/libvexart` |
| Golden render | ✅ pass (800×600, pixel-perfect) | `bun run test:golden:check` |
| Native release build | ✅ pass | `cargo build --release` |
| Kitty socket/devtools | ✅ responde | `kitten @ ... ls` |
| Regresiones enfocadas | ✅ 19 pass / 0 fail | `bun --conditions=browser test` (layout, text, scroll, Tabs/List/Table, Button, Dialog) |

## Matriz visual actual

### Ejemplos

| Ejemplo | Lanzado en Kitty | Se ve | stderr/crash | Estado |
| --- | ---: | ---: | ---: | --- |
| `examples/void-showcase.tsx` | ✅ | ✅ | ✅ vacío / proceso vivo | verificado |
| `examples/facebook-app.tsx` | — | — | — | fuera de alcance; QA cancelada por el usuario |

### Void Component Showcase

Las seis vistas se visitaron con flecha derecha en Kitty y se capturaron en
ventanas OS independientes con `screencapture -l` dirigido al target:

| Vista | Visual | Navegación | Pendiente de interacción profunda |
| --- | ---: | ---: | --- |
| Inputs | ✅ | ✅ | Textarea: captura parcial PASS; suite cursor/delete/multilínea BLOCKED por foco inesperado |
| Display | ✅ | ✅ | variantes y contraste de botones PASS (`/tmp/vexart-fix-scroll-display.png`); foco/teclado profundo pendiente |
| Collections | ✅ | ✅ | List/Table y Tab+Down PASS; ScrollView directo PASS tras fix (`/tmp/vexart-fix-scroll-after.png`) |
| Code & Docs | ✅ | ✅ | Code/Diff/Markdown PASS; scroll N/A (sin contenedor) |
| Overlays | ✅ | ✅ | geometría cerrada y botón `Open Dialog` PASS (`/tmp/vexart-fix-final-overlays.png`); modal abierto queda BLOCKED por captura background-safe |
| Typography | ✅ viewport normal | ✅ | wrapping responsive PASS en tests y viewport normal (`/tmp/vexart-fix-scroll-typography.png`); falta captura estrecha válida |

### Facebook clone

La revisión quedó cancelada por solicitud del usuario y está fuera de alcance.
`examples/facebook-app.tsx` se conserva sin stagear ni modificar en el backup;
no se ejecutarán más acciones sobre ese ejemplo.

## Conteo honesto al último update

- **Ejemplos lanzados visualmente en esta pasada:** 1/1 dentro de alcance
  (`void-showcase`; Facebook excluido).
- **Vistas principales capturadas:** 6/6 Showcase.
- **Smoke de navegación por teclado:** 6/6 pestañas Showcase.
- **Funciones de interacción profunda verificadas visualmente:** 12/≈20.
  `VoidInput` acepta texto (`xyz`), Checkbox cambia de estado, Radio selecciona
  Option B, Switch conserva el orden al activarse, Select abre su menú y luego
  selecciona `Rust` haciendo click sobre la opción, Combobox acepta una búsqueda
  sin resultados, Slider cambia de 42 a 86 y VoidList selecciona `Settings` por
  teclado y `Notifications` por click. Se suman wheel del ScrollView y la ruta
  `Tab + Down` de Table; cada acción dejó el proceso vivo y stderr vacío en una
  ventana Kitty independiente.
- **Smoke de reactividad:** Tab + escritura después del arreglo de Tabs no
  produce `RangeError` ni remount recursivo; la captura standalone conserva el
  layout completo.
- **QA visual corregida:** Code & Docs, Display, Collections (incluido wheel del
  ScrollView), Typography normal y Overlays cerrado se capturaron en ventanas
  Kitty independientes con PID vivo y stderr vacío. Table sobrevive `Tab + Down`
  en `/tmp/vexart-qa-table-bg-final3.keyboard.png`.
- **QA automatizada de regresión:** 19 pruebas enfocadas cubren layout floating,
  wrapping, scroll, estabilidad de Tabs/List/Table, activación/contraste de
  Button y Escape de Dialog; el golden sigue pixel-perfect.
- **QA bloqueada, no fallo de producto:** Textarea sólo tiene escritura parcial
  visible; la suite de cursor/delete/multilínea no se puede certificar porque el
  foco Kitty cambió durante la captura. Resize cambió la geometría correctamente
  (`166×49 ↔ 128×46`), pero las capturas posteriores quedaron negras sin activar
  la ventana, así que el re-layout visual queda pendiente.
- **Facebook clone:** la revisión adicional quedó cancelada y fuera de alcance
  por solicitud del usuario; no se incluye en los pendientes actuales.
- **Pendiente principal:** repetir Textarea y Resize con una captura background-safe
  válida. La apertura visual del modal también queda BLOCKED porque el input
  remoto pierde el frame al cambiar el foco; la geometría y Escape sí tienen
  cobertura automatizada.

## Próximo bloque de trabajo

1. Inputs: repetir edición/cursor profunda de Textarea sin perder el foco de la
   ventana objetivo.
2. Resize: repetir el ciclo `166×49 → 128×46 → 166×49` con captura dirigida
   no-negra; la geometría ya cambia correctamente.
3. Overlays: conseguir una captura válida con el modal abierto y verificar
   Tooltip después de cerrar, sin activar otra ventana.
4. Revisar `git diff` y eliminar únicamente los archivos QA temporales fuera del
   repositorio.

## Capturas relevantes

Las capturas son artefactos temporales fuera del repositorio; se conservan para
comparar durante esta sesión:

- `/tmp/vexart-stable-inputs.png`
- `/tmp/vexart-stable-right.png` (Display)
- `/tmp/vexart-stable-next.png` (Collections)
- `/tmp/vexart-final-code.png`
- `/tmp/vexart-final-overlays.png`
- `/tmp/vexart-final-typography.png`
- `/tmp/vexart-facebook-full.png`
- `/tmp/vexart-standalone-window.png` (OS window Kitty completa)
- `/tmp/vexart-standalone-input-xyz.png` (edición + Tab sin crash)
- `/tmp/vexart-wrapper-toggle.png` (Checkbox)
- `/tmp/vexart-wrapper-radio.png` (Radio Option B)
- `/tmp/vexart-wrapper-switch2.png` (Switch y orden estable)
- `/tmp/vexart-wrapper-select-open.png` (Select abierto)
- `/tmp/vexart-wrapper-combo.png` (Combobox sin resultados)
- `/tmp/vexart-final-proof-clean.png` (pasada standalone final: xyz, toggles,
  Radio B, Select Rust, Combobox rs y Slider 86; stderr vacío)
- `/tmp/vexart-facebook-confirm.png` (Confirm friend request + feedback visual)
- `/private/tmp/vexart-qa-typography-typography.png` (Typography normal)
- `/private/tmp/vexart-qa-typography-narrow.png` (Typography estrecho: clipping)
- `/private/tmp/vexart-qa-typography-code-narrow-before.png` y
  `/private/tmp/vexart-qa-typography-code-narrow-after-pagedown.png`
  (Code & Docs estrecho: clipping sin scroll)
- `/tmp/vexart-qa-code-bg-before.png` y `/tmp/vexart-qa-code-bg-after.png`
  (Code & Docs: captura dirigida en background, PASS)
- `/tmp/vexart-qa-list-bg-collections2.png`,
  `/tmp/vexart-qa-list-bg-list-keyboard2.png`,
  `/tmp/vexart-qa-list-bg-list-click2.png`,
  `/tmp/vexart-qa-list-bg-direct-scroll2b.png`
  (List PASS; ScrollView directo FAIL, captura dirigida en background)
- `/private/tmp/vexart-qa-typography-bg-normal.png` y
  `/private/tmp/vexart-qa-typography-bg-narrow.png`
  (Typography normal PASS; estrecho FAIL)
- `/tmp/vexart-qa-display-bg3-mouse-default-hover.png`,
  `/tmp/vexart-qa-display-bg3-mouse-outline-hover.png`,
  `/tmp/vexart-qa-display-bg3-key-enter.png`
  (Display: variantes/captura dirigida; contraste/foco pendiente)
- `/tmp/vexart-qa-table-bg-collections-hover-after.png`,
  `/tmp/vexart-qa-table-bg-click-row5-final.png`,
  `/tmp/vexart-qa-table-bg-after-keyboard-current.png`
  (Table: click PASS; keyboard termina el proceso)
- `/tmp/vexart-qa-overlays-bg-detached-dialog-open.png`,
  `/tmp/vexart-qa-overlays-bg-detached-dialog-focus-after-wait.png`,
  `/tmp/vexart-qa-overlays-bg-detached-tooltip-closed-after-wait.png`
  (Overlays: dialog/focus/tooltip FAIL)
- `/tmp/vexart-fix-scroll-after.png` (ScrollView directo: wheel mueve Line 1–5
  y el scrollbar cambia de posición).
- `/tmp/vexart-fix-scroll-display.png` (Display: variantes y labels legibles).
- `/tmp/vexart-fix-scroll-typography.png` (Typography: viewport normal).
- `/tmp/vexart-fix-final-overlays.png` (Overlays cerrado: `Open Dialog` visible,
  sin desplazamiento/ghosting).
- `/tmp/vexart-fix-final-dialog-wait.png` (intento de input remoto; no se usa
  como evidencia de modal abierto porque el frame perdió validez).

_Última actualización: 2026-09-06; última pasada en OS window Kitty separada._
