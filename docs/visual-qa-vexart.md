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

## Evidencia automatizada

| Prueba | Resultado | Evidencia |
| --- | --- | --- |
| TypeScript typecheck | ✅ 0 errores | `bun typecheck` |
| Tests TypeScript | ✅ 349 pass / 0 fail / 733 expect | `bun test` |
| Tests Rust | ✅ 146 pass / 0 fail | `cargo test` en `native/libvexart` |
| Golden render | ✅ pass (800×600, pixel-perfect) | `bun run test:golden:check` |
| Native release build | ✅ pass | `cargo build --release` |
| Kitty socket/devtools | ✅ responde | `kitten @ ... ls` |

## Matriz visual actual

### Ejemplos

| Ejemplo | Lanzado en Kitty | Se ve | stderr/crash | Estado |
| --- | ---: | ---: | ---: | --- |
| `examples/void-showcase.tsx` | ✅ | ✅ | ✅ vacío / proceso vivo | verificado |
| `examples/facebook-app.tsx` | ✅ | ✅ | ✅ vacío / proceso vivo | verificado |

### Void Component Showcase

Las seis vistas se visitaron con flecha derecha en Kitty y se capturaron en
primer plano:

| Vista | Visual | Navegación | Pendiente de interacción profunda |
| --- | ---: | ---: | --- |
| Inputs | ✅ | ✅ | Textarea: captura parcial PASS; suite cursor/delete/multilínea BLOCKED por foco inesperado |
| Display | ✅ | ✅ | variantes mouse PASS; **FAIL** contraste hover y foco/teclado sin delta visible |
| Collections | ✅ | ✅ | List/VirtualList PASS; ScrollView directo FAIL; **Table FAIL** en navegación de teclado |
| Code & Docs | ✅ | ✅ | Code/Diff/Markdown PASS; scroll N/A (sin contenedor) |
| Overlays | ✅ | ✅ | **FAIL** dialog/composite/focus/cierre; tooltip clipping/stale; Popover no incluido |
| Typography | ✅ viewport normal | ✅ | **FAIL responsive:** texto largo se recorta en viewport estrecho; wrapping/scroll pendiente |

### Facebook clone

La pantalla inicial se capturó sin artifacts y el proceso sobrevivió una
secuencia de foco/teclas. `Confirm` en Friend requests también se verificó: la
tarjeta desaparece, aparece `Request confirmed` y stderr queda vacío. **QA del
Facebook clone pausada por solicitud del usuario; queda fuera de alcance y no
se ejecutarán más acciones.**

## Conteo honesto al último update

- **Ejemplos lanzados visualmente:** 2/2.
- **Vistas principales capturadas:** 7/7 (6 Showcase + 1 Facebook).
- **Smoke de navegación por teclado:** 6/6 pestañas Showcase.
- **Funciones de interacción profunda verificadas visualmente:** 10/≈20.
  `VoidInput` acepta texto (`xyz`), Checkbox cambia de estado, Radio selecciona
  Option B, Switch conserva el orden al activarse, Select abre su menú y luego
  selecciona `Rust` haciendo click sobre la opción, Combobox acepta una búsqueda
  sin resultados, Slider cambia de 42 a 86 y VoidList selecciona `Settings` por
  teclado y `Notifications` por click. Cada acción dejó el proceso vivo y
  stderr vacío en la ventana Kitty independiente; Facebook `Confirm` elimina la
  solicitud y muestra su confirmación.
- **Smoke de reactividad:** Tab + escritura después del arreglo de Tabs no
  produce `RangeError` ni remount recursivo; la captura standalone conserva el
  layout completo.
- **QA paralela (captura dirigida en background):** Code & Docs pasa; List pasa
  por teclado/click; ScrollView directo falla al hacer wheel; Typography normal
  pasa, pero el viewport estrecho recorta texto largo sin wrap. Todos los
  procesos verificados quedaron vivos y con stderr vacío.
- **QA adicional válida:** Display pinta todas las variantes y tamaños, pero el
  texto del hover default queda casi ilegible y Space/Enter/Tab no muestran
  foco/acción. Table acepta click, pero `Tab + Down` termina el proceso; hover
  no tiene styling visible. Overlays muestra desplazamiento/ghosting negro del
  dialog, foco que se escapa al tooltip, Escape/outside-click inconsistentes y
  tooltip recortado/pegado tras salir.
- **QA bloqueada, no fallo de producto:** Textarea sólo tiene escritura parcial
  visible; la suite de cursor/delete/multilínea no se puede certificar porque el
  foco Kitty cambió durante la captura. Resize cambió la geometría correctamente
  (`166×49 ↔ 128×46`), pero las capturas posteriores quedaron negras sin activar
  la ventana, así que el re-layout visual queda pendiente.
- **Facebook clone:** la revisión adicional quedó cancelada y fuera de alcance
  por solicitud del usuario; no se incluye en los pendientes actuales.
- **Pendiente principal:** corregir los fallos compartidos de ScrollView,
  Typography, Display, Table y Overlays; después repetir Textarea/Resize, que
  quedaron bloqueados por la captura background-safe.

## Próximo bloque de trabajo

1. Inputs: Textarea y edición/cursor profunda; probar también clicks en el área
   vacía del popover (la selección ya funciona al pulsar el texto de la opción).
2. Display/Collections: contraste/foco de botones, crash de Table y corregir el
   extent de ScrollView para hijos directos de texto (List/VirtualList pasan).
3. Overlays: composición/foco/cierre de Dialog y ciclo de vida de Tooltip.
4. Corregir wrapping responsive de Typography, luego Resize/scroll en Kitty;
   guardar capturas finales y actualizar este conteo.
5. Revisar `git diff` y eliminar únicamente los archivos QA temporales no
   pertenecientes al producto.

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

_Última actualización: 2026-09-06; última pasada en OS window Kitty separada._
