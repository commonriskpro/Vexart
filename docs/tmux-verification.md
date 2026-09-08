# Catálogo reproducible de verificación tmux

**Fecha:** 2026-09-08<br>
**Estado:** paridad Kitty solicitada verificada en directo y tmux mediante checks automatizados y revisión visual humana cualitativa; Ghostty/FPS, medición pixel a pixel y cobertura exhaustiva quedan fuera de este cierre<br>
**Objetivo:** que cada feature visual/interactiva tenga un check ejecutable, una salida esperada y una etiqueta honesta de “pendiente físico” cuando corresponda.

Este catálogo toma los nombres públicos de [`@vexart/headless`](../packages/headless/src/public.ts), [`@vexart/styled`](../packages/styled/src/public.ts) y el showcase [`examples/void-showcase.tsx`](../examples/void-showcase.tsx). El snapshot histórico del 2026-09-07 registró **50/50 PASS**: 41 escenas `differential-only` y 9 con oracle, con 99 frames directos y 145 frames SHM. La corrida cross-route estable del 2026-09-08 terminó **52/52 PASS**: 41 escenas `differential-only` y 11 con oracle, con 128 frames directos y 182 frames SHM. La revisión visual humana de las seis pestañas confirma Kitty directo y Kitty dentro de tmux de forma cualitativa; no es una medición pixel a pixel ni cubre Ghostty, FPS o todas las interacciones. Las pruebas de texto del engine son evidencia separada del oracle `code-docs`; no se mezclan sus seis casos con ese artefacto. Los controles interactivos y varios displays mantienen sus límites explícitos de cobertura. No se modifica `tmux.conf`, una sesión de usuario ni una golden. El ledger por requisito está en [tmux-completion-audit.md](./tmux-completion-audit.md).

## Estado de auditoría — 2026-09-08

La paridad Kitty solicitada está verificada. El snapshot del 2026-09-07 que
sigue es histórico. Una revisión visual humana actual de las seis pestañas del
showcase confirma Kitty directo y Kitty dentro de tmux; es cualitativa, no pixel a
pixel ni exhaustiva de callbacks/input. Ghostty y FPS siguen sin verificar. Las
denegaciones CUA anteriores no se eludieron.

- **Lifecycle/SHM:** `/tmp/vexart-lifecycle-production-final.59302.1064` PASS
  con 8 nombres SHM (incluido producer-only perdido), reconexión en el mismo TTY,
  frame fresco y geometría. La evidencia PTY de cleanup está en
  `/tmp/vexart-shm-review-lifecycle.1788868930.74725.20121`; no se etiqueta como
  una corrida de focused unit tests. Normal/reject/timeout pasan en serie y el
  negativo falla como espera. Los gates finales de orden del runner pasan en
  `/tmp/vexart-shm-runner-final-normal.1788869766.95269.19333` y
  `/tmp/vexart-shm-runner-final-lifecycle.1788869768.95269.5837`. La corrida serial
  final de cuatro modos también pasa en `/tmp/vexart-resumed-final-pty.0Hc1os/`:
  normal 6 uploads/7 SHM/2 deletes; lifecycle 6 uploads/8 SHM/1 delete en el
  mismo TTY; reject y timeout 1 upload/2 SHM/1 delete cada uno, con FAIL esperado
  del productor. Los errores de cleanup se exponen; esto no garantiza la
  eliminación si falla la escritura hacia la terminal. El repro FAIL
  anterior `/tmp/vexart-lifecycle.33464.2337` queda histórico. Recuperación
  automática aprobada: pausa sin cliente y reenvío del último frame SHM, sin
  tocar config. El focused native estricto de styled overlays pasa 1/1 en
  `/tmp/vexart-styled-overlays-ownership-green-1788870121501` tras corregir el
  ownership para rastrear solo layer IDs publicados en
  [`native-presentation-ops.ts`](../packages/engine/src/ffi/native-presentation-ops.ts).
  El fallo directo previo queda en `/tmp/vexart-styled-overlays-final-matrix`.
  La suite actual terminó 539 PASS/0 FAIL/82 archivos/1781 expectativas en
  `/tmp/vexart-resumed-stable-tests.log`; main TSC y scripts TSC pasan en
  `/tmp/vexart-resumed-final-typecheck.log` y
  `/tmp/vexart-resumed-stable-scripts-tsc.log`. La matriz cross-route actual
  terminó **52/52 PASS, 0 FAIL** en
  `/tmp/vexart-resumed-stable-matrix.nZ3get/run`, con 41 escenas
  `differential-only` y 11 `differential-plus-oracle`, 128 frames directos,
  182 frames tmux y 182 objetos SHM; las tres comparaciones son exactas en las
  52 escenas. La auditoría lo confirma en
  `/tmp/vexart-resumed-stable-matrix-audit.json`.
  La corrida previa 51/52 queda como investigación histórica de settling:
  9066 diferencias de bytes de canal (=3022 pixels), bbox `[41,216,141,251]`,
  solo en Button; ambos oracles y ambas comparaciones readback eran exactos, sin
  corrupción de transporte. El pulso intencional pressed/focus de 100 ms fue
  capturado en momentos distintos. Tras esperar 120 ms y un frame luego de Escape,
  dos focused native parity pasan con SHA idéntico en
  `/tmp/vexart-styled-overlay-settled-matrix-{1,2}` y los focused tests pasan 2/2
  en `/tmp/vexart-styled-focused-after-settle.log`; no se confunde ese repro con
  el resultado estable.
- **Compartido:** Kitty normal y tmux reutilizan escena, layout, GPU y
  componentes; tmux agrega transporte/presentación SHM y lifecycle. Collections y
  ScrollView quedan verificadas tras ordenar solo `scissorLayers`; imagen final:
  `/tmp/vexart-collections-parity-scrollfix-final-1788868047588501000`, más 2
  checks de fondo de scroll PASS en `/tmp/vexart-scroll-background-final-1788870228543.log`.
  El Button
  estable elimina el livelock compartido; rojo/verde en
  `/tmp/vexart-button-stable-{red,green}.log`.
- **Interacción visual:** el styled overlay offscreen terminó 2 PASS y 5
  expectativas negativas; la imagen revisada está en
  `/tmp/vexart-styled-overlays-final.png`. El focused native estricto de
  ownership pasa 1/1. Unicode conserva 9 PASS/114 expectativas, parser 32 y
  keyboard 35;
  no se afirma completitud de grapheme, IME, mouse o navegación vertical.
- **Baselines:** las 42 referencias golden mantienen hashes y pasan la
  verificación en `/tmp/vexart-resumed-final-golden-hashes.log`; no se regeneran.
  El boundary rerun conserva 5 violaciones conocidas, sin nuevas, en
  `/tmp/vexart-resumed-final-boundaries.log`. Se solicitó además una comparación
  manual asíncrona de las 6 pestañas del showcase; la respuesta humana queda
  pendiente por el bloqueo de UI. La corrida cross-route estable terminó 52/52,
  como se documenta arriba; la corrida previa 51/52 y sus 9066 channel bytes
  quedan solo como investigación histórica de settling.

### Snapshot histórico de verificación — 2026-09-07

Estos resultados acotados se conservaron para la revisión del 2026-09-07. Son
evidencia automatizada B/A y no una observación física de Kitty o Ghostty:

- **TypeScript:** 515 pass, 0 fail, 77 archivos y 1604 `expect()` en
  `/tmp/vexart-parity-final-tests.log`; `bun run typecheck` PASS (sin atribuir
  un log separado).
- **Native:** `cd native/libvexart && cargo test --features gpu-tests`: 186 pass,
  0 fail, 1 ignorado en `/tmp/vexart-parity-finish-native.log`; el build release
  de las 22:23 locales es evidencia separada y precede este test.
- **Packet/pixel parity:** `primitives-border-padding` y `theme-form` PASS en
  `/tmp/vexart-border-px-parity.XYaC4F/{borders,theme}`; el harness usa un
  receptor sintético y no incluye ACK, forwarding tmux real, UI ni FPS.
- **Inputs:** el fixture final `tmux-scenes/inputs-interaction` pasó paridad
  directa/tmux/readback y typecheck en `/tmp/vexart-inputs-parity.MO08n1`. La
  prueba negativa final acepta el frame y rechaza 9/9 marcadores en copias del
  buffer; no hace una afirmación de resource cleanup. Log:
  `/tmp/vexart-parity-finish-inputs-negative-final.log`.
- **Overlays:** `overlays-verification` prueba una escena bottom-right con
  paridad directa/SHM en `/tmp/vexart-overlay-parity.cHRekH/summary.json`. Las
  seis posiciones × dos variantes de capacidad y Dialog Escape/unmount con
  restauración de foco pertenecen a [`scripts/visual-test/tmux-interaction.test.tsx`](../scripts/visual-test/tmux-interaction.test.tsx) (7 casos, 60
  expectativas). La corrección de Toast usa `width="fit"` para el ancho
  intrínseco del stack; es paridad offscreen, no UI.
- **Paint:** `tmux-scenes/paint-features` pasó paridad enfocada y sus 7 grupos
  deshabilitados fueron rechazados por el oracle por defecto en
  `/tmp/vexart-paint-parity-transform.DrOeKh` y
  `/tmp/vexart-paint-negative-final.txt`.
- **Code/Markdown/Diff:** el oracle enfocado verifica indentación de Code,
  espacios a ambos lados de spans Markdown en negrita/cursiva y gutter de Diff
  horizontal y sin overflow en `/tmp/vexart-text-parity-shared-final-1788835901411484000`.
  La solución comparte metadata `whiteSpace` del engine; el content test
  `packages/headless/src/display/content.test.tsx` cubre negrita/cursiva y
  gutter, mientras los seis tests de whitespace del engine son evidencia
  separada y no forman parte del artefacto `code-docs`.
- **Matriz final:** 50/50 escenas PASS (41 `differential-only`, 9 con oracle),
  99 frames directos y 145 frames SHM en
  `/tmp/vexart-parity-final-matrix.4rdpKx/run`.
- **Goldens:** el compare-only terminó 2 PASS y 39 FAIL; esas diferencias
  preexistentes no están completamente clasificadas y no se regeneraron
  referencias. Log: `/tmp/vexart-parity-final-goldens.log`.
- **Lint de límites:** conserva 5 violaciones preexistentes; no es un PASS
  global de lint ni una regresión de la matriz. Log:
  `/tmp/vexart-parity-final-boundaries.log`.
- **Production PTY:** los tres modos del recorrido `createTerminal` → render loop
  nativo → tmux 3.6a están en PASS del runner en
  `/tmp/vexart-parity-finish-pty.1x5t8X/{normal,reject,timeout}`. `normal` tiene
  6 uploads y 7 objetos SHM; `reject`/`timeout` contienen el fallo esperado del
  productor y cleanup.

La corrección del bug de bordes (retiro del `- aa` interior extra en
`shape_rect.wgsl` y `rect_corners.wgsl`) está cubierta por esos checks; el borde
de 1 px conserva 1 px. El snapshot histórico no contiene evidencia D: su smoke
físico estaba pendiente/bloqueado y no se infiere desde logs, capturas anteriores
o un receptor sintético. En la auditoría actual, una revisión humana de las seis
pestañas confirma Kitty directo y Kitty dentro de tmux de forma cualitativa; no es
medición pixel a pixel, no cubre todas las interacciones y no verifica Ghostty ni
FPS. El snapshot registraba el goal `PAUSED`; ese estado es histórico. Las
denegaciones CUA de Kitty para
`net.kovidgoyal.kitty` y de Ghostty son históricas; no se usaron capturas, CLI o
UI alternativas para eludirlas.

## 1. Niveles y comandos base

| Nivel | Comando exacto | Salida esperada |
| --- | --- | --- |
| Offscreen unit | `bun --conditions=browser test --preload ./solid-plugin.ts <test-file>` | Assertions del control; no visibilidad |
| Offscreen script | `bun --conditions=browser run scripts/void-interaction-smoke.tsx` | Línea `void interaction smoke: PASS ...`; pixels/callbacks del script |
| Visual oracle | `bun --conditions=browser run scripts/visual-test/runner.ts` | Métricas compare-only por scene ID; no escribe PNG |
| Native packet decode | `bun --conditions=browser test --preload ./solid-plugin.ts packages/engine/src/loop/tmux-presentation.test.ts` | Direct baseline: RGBA normal/tmux igual, wrappers DCS/grid y lifecycle; sin ACK en este harness |
| Real tmux PTY | `python3 experiments/tmux-shm/verify.py --frames 20` | JSON de ACK/digest/bytes/cleanup; receptor headless |
| Production tmux PTY | `base=$(mktemp -d "${TMPDIR:-/tmp}/vexart-shm-pty.XXXXXX"); python3 scripts/visual-test/tmux-shm-pty.py --mode=normal --out="$base/run"` | `PASS` de createTerminal/native GPU/render loop/SHM; hidden pane, burst latest, resume y cleanup; sin display físico/FPS |
| Production negative PTY | El mismo patrón con `--mode=reject` y `--mode=timeout` (cada uno con un `--out` nuevo) | Runner PASS con producer `FAIL`/exit 1 esperado, cleanup y sin fallback |
| Physical smoke | `bun --conditions=browser run examples/void-showcase.tsx` dentro de Kitty/Ghostty+tmux | Revisión humana cualitativa de las seis pestañas PASS en Kitty directo y tmux; Ghostty, pixel exacto, callbacks exhaustivos y FPS siguen pendientes |

Repetición exacta de los tres modos de producción (cada `--out` apunta a un
directorio que todavía no existe):

```sh
base=$(mktemp -d "${TMPDIR:-/tmp}/vexart-shm-pty.XXXXXX")
python3 scripts/visual-test/tmux-shm-pty.py --mode=normal --out="$base/normal"
base=$(mktemp -d "${TMPDIR:-/tmp}/vexart-shm-pty.XXXXXX")
python3 scripts/visual-test/tmux-shm-pty.py --mode=reject --out="$base/reject"
base=$(mktemp -d "${TMPDIR:-/tmp}/vexart-shm-pty.XXXXXX")
python3 scripts/visual-test/tmux-shm-pty.py --mode=timeout --out="$base/timeout"
```

Los dos últimos comandos deben terminar con el runner en PASS y el productor
en el fallo esperado; no convierten una ejecución negativa en un fallback.

### Matriz SHM histórica consolidada — 2026-09-07

Comando completo de la ejecución registrada:
```sh
base=$(mktemp -d "${TMPDIR:-/tmp}/vexart-tmux-feature-parity.XXXXXX")
bun --conditions=browser run scripts/visual-test/tmux-parity.ts \
  --out="$base/run"
```

El snapshot registró **50/50 PASS**: 41 escenas `differential-only` y 9
`differential-plus-oracle`, con 99 frames directos y 145 frames SHM. El artefacto
consolidado es `/tmp/vexart-parity-final-matrix.4rdpKx/run/summary.json`; la
corrida cross-route estable actual terminó 52/52 con 11 escenas
`differential-plus-oracle`.
El harness ejecuta ambas rutas con un receptor sintético; no es forwarding por
tmux real, observación física ni FPS.
PNG/readback son artefactos de test y la ruta de producción reporta
`rgbaBytesRead=0`.

### Comparación directa histórica

El artefacto histórico terminó **45/45 PASS** en el batch nativo: 41 escenas
`differential-only` y cuatro (`canvas-api`, `filters-complete`, `image-decode`,
`text-glyphs`) `differential-plus-oracle`; incluye controles negativos. PNG/readback
son artefactos de test. No hay ACK, forwarding por tmux real, observación física ni
FPS. Es baseline de transporte directo, no validación de la integración SHM.
Resumen: `/tmp/vexart-tmux-feature-parity-1788825845/summary.json`.

El decoder de `scripts/visual-test/tmux-parity.test.ts` tiene **8 tests PASS**.
`code-docs` (repetible con `base=$(mktemp -d "${TMPDIR:-/tmp}/vexart-scene.XXXXXX"); bun --conditions=browser run scripts/visual-test/tmux-parity.ts --scene=tmux-scenes/code-docs --out="$base/run"`) tiene focused parity PASS; su oracle verifica tokens, indentación de Code, ambos límites de spans Markdown y gutter de Diff. El artefacto histórico que observaba espacios inline colapsados precede la corrección compartida de `whiteSpace`; no describe el estado actual.
`overlays-verification` (misma forma con `--scene=tmux-scenes/overlays-verification`) tuvo focused parity PASS directo histórico: Popover/Tooltip/Toast headless y variantes deshabilitadas se comprobaron. El focused actual `/tmp/vexart-overlay-parity.cHRekH/summary.json` prueba una escena bottom-right con paridad directa/SHM; las seis posiciones × dos variantes de capacidad y Dialog Escape/unmount con restauración de foco pertenecen a `scripts/visual-test/tmux-interaction.test.tsx` (7 casos, 60 expectativas). El focused SHM corregido de `theme-form` se describe arriba; cubre dirty/touched/errors/submit, cambio dark→light y foco preservado.

Repetición exacta de los tres focused, con directorios de salida nuevos:

```sh
base=$(mktemp -d "${TMPDIR:-/tmp}/vexart-tmux-focused.XXXXXX")
for scene in code-docs overlays-verification theme-form; do
  bun --conditions=browser run scripts/visual-test/tmux-parity.ts \
    --scene="tmux-scenes/$scene" --out="$base/$scene"
done
```

Repro de posición previo (test-only): `bun --conditions=browser --preload ./solid-plugin.ts -e 'const m=await import("./scripts/visual-test/tmux-scenes/overlays-verification.tsx");const f=await m.renderWithToastPosition("bottom-right");if(f.pixels[(205*f.width+300)*4]!==239)throw new Error("expected red bbox x244..403,y182..223")'` observó x16..175,y182..223 (6688 pixels) y quedó registrado en `/tmp/vexart-overlay-toast-before-fix.txt`. El focused actual `/tmp/vexart-overlay-parity.cHRekH/summary.json` pasa una escena bottom-right; las seis posiciones × dos variantes pertenecen a `scripts/visual-test/tmux-interaction.test.tsx`.
El snapshot incluye `code-docs`, `inputs-interaction`,
`overlays-verification`, `paint-features` y `theme-form`, además de las escenas
base. `scripts/visual-test/tmux-interaction.test.tsx` tiene 7 casos y 60
expectativas para Tab, UTF-8/paste, mouse/rueda, Toast y Dialog; no cubre todas
las capacidades. Dialog Escape, unmount y restauración de foco están cubiertos;
la cobertura de cada export styled, Ghostty y la medición pixel a pixel siguen pendientes.
El check PTY sintético adicional acepta casos explícitos:

```sh
python3 experiments/tmux-shm/verify.py --width 1280 --height 720 --frames 20
python3 experiments/tmux-shm/verify.py --frames 3 --fragment-acks
python3 experiments/tmux-shm/verify.py --frames 3 --reject-shm
python3 experiments/tmux-shm/verify.py --frames 3 --timeout-shm
```

Debe esperarse aceptación, rechazo y timeout según el caso, no una promesa de
FPS. El experimento helper SHM de 20 frames queda separado de la matriz de
escenas; la integración de producción SHM-only tiene PASS por PTY, sin fallback
automático direct/file y sin nuevo renderer. No implica display físico ni FPS.

El routing real de tmux 3.6a tiene evidencia aparte en
`/tmp/vexart-tmux-ack-routing-result.json`: `allow-passthrough all` reenvía el
contenido de un pane de origen oculto, `on` lo descarta y el ACK `ESC_G` llega
al pane activo, no al origen. El destino SHM requiere un cliente adjunto en
todo el servidor; `is_consumed` es completion primaria y el ACK no gobierna el
avance de frames. Las APC del baseline directo usan Kitty `q=2` para suprimir
éxito y error; el upload SHM usa `q=1` para errores opcionales. Esto sigue siendo
nivel A (PTY), no una prueba física.

El recorrido de código de producción `createTerminal` → GPU/render loop → tmux 3.6a PTY →
receptor sintético pasó SHM probe y 6 uploads (2 con el pane oculto/zoom), burst
latest-frame, resume y cleanup: 7 objetos `0600` consumidos/desenlazados y 2
imágenes propias borradas. Stats: SHM, flags `5`, `rgbaBytesRead=0`,
`compress_us=0`; ningún ACK de frame. Artefacto actual:
`/tmp/vexart-parity-finish-pty.1x5t8X/normal/pty-result.json`.
Esto valida el contrato de producción a nivel A; no una UI Kitty/Ghostty, FPS ni
una corrida física. Los negativos de terminal rechazado y
timeout también pasan como fallos esperados en
`/tmp/vexart-parity-finish-pty.1x5t8X/{reject,timeout}/pty-result.json`.

## 2. Controles headless: inputs

Fuente de nombres: `packages/headless/src/public.ts`.

| Export/control | Oracle existente o manual | Resultado esperado |
| --- | --- | --- |
| `Button` | `components-button-variants`, `components-button-sizes`; `DisplayTab` del showcase (176–200) | Cada variante/tamaño pinta y press dispara una vez |
| `Checkbox` | `components-checkbox-switch`; showcase Inputs | Space/click alterna checked y conserva label |
| `Combobox` | `components-combobox`; showcase Inputs | Escribir filtra opciones y elegir actualiza valor |
| `Input` | `components-input`; `inputs/input.test.ts` | Escena/showcase: edición visible; test unitario solo normaliza CRLF/tabs |
| `RadioGroup` | `components-radio-slider`; showcase Inputs | Flechas/press dejan una opción seleccionada |
| `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` | `components-select`; showcase Inputs | Abrir, navegar, elegir y cerrar sin perder foco |
| `Slider` | `components-radio-slider`; `inputs/slider.test.ts` | Flechas/pointer respetan min/max/step; snap estable |
| `Switch` | `components-checkbox-switch`; showcase Inputs | Toggle cambia estado y etiqueta |
| `Textarea` | `scripts/void-interaction-smoke.tsx`; showcase Inputs | Multilínea, cursor, backspace y pixels cambian; no golden dedicado |

El fixture final [`tmux-scenes/inputs-interaction.tsx`](../scripts/visual-test/tmux-scenes/inputs-interaction.tsx)
pasó con eventos de teclado reales del harness, paridad directa/tmux/readback y
typecheck. La prueba negativa acepta el frame y rechaza 9/9 marcadores en copias
del buffer; no prueba resource cleanup. Artefactos:
`/tmp/vexart-inputs-parity.MO08n1` y
`/tmp/vexart-parity-finish-inputs-negative-final.log`; no es observación
Kitty/Ghostty.

El script de Textarea usa `bun --conditions=browser run` para cargar el mismo
transformer JSX universal que el showcase; no reemplazarlo por un test sin preload.

## 3. Headless: display, containers, collections y overlays

| Familia / export | Oracle exacto | Estado/resultado esperado |
| --- | --- | --- |
| `Code` | `tmux-scenes/code-docs.tsx`; showcase Code & Docs (`VoidCode`) | Focused parity PASS de tokens e indentación; `whiteSpace="pre-wrap"` compartido |
| `Markdown` | `tmux-scenes/code-docs.tsx`; showcase Code & Docs (`VoidMarkdown`) | Focused parity PASS de headings y espacios a ambos lados de spans en negrita/cursiva |
| `ProgressBar` | `components-progress`; showcase Display | Proporción 72/100 coincide con valor |
| `Diff` | `tmux-scenes/code-docs.tsx`; showcase Code & Docs (`VoidDiff`) | Focused parity PASS de tokens, indentación y gutter horizontal sin overflow |
| `OverlayRoot`, `Portal` | `tmux-scenes/overlays-verification.tsx`; indirecto en Dialog/Toast/Tooltip | Contenido aparece sobre root y se desmonta; focused bottom-right PASS; posiciones adicionales en interacción |
| `ScrollView` | `primitives-scroll`; showcase Collections | Clip, wheel/scroll y contenido no invade viewport |
| `Tabs` | `components-tabs-default`, `components-tabs-line`; `containers/tabs.test.tsx`; interaction smoke | Tab activo, foco y panel cambian sin recreación recursiva |
| `List` | `components-list`; `collections/list.test.tsx` | Tab/flechas mueven selección y filas siguen montadas |
| `Table` | `components-table`; `collections/table.test.tsx` | Columnas, filas y selección sobreviven al foco |
| `VirtualList` | `components-virtual-list`; `collections/virtual-list.test.ts` | Ventana/overscan produce start/end esperados |
| `Dialog`, `DialogOverlay`, `DialogContent`, `DialogClose` | `components-dialog`; showcase Overlays; `overlays/dialog.test.ts` | Escape/unmount restaura foco en `scripts/visual-test/tmux-interaction.test.tsx`; escena/showcase física aún pendiente |
| `createToaster` | `tmux-scenes/overlays-verification.tsx`; showcase Overlays | Focused PASS en una escena bottom-right; posiciones/variantes adicionales en `scripts/visual-test/tmux-interaction.test.tsx` |
| `Tooltip` | `tmux-scenes/overlays-verification.tsx`; showcase Overlays | Focused bottom-right PASS; posiciones/variantes adicionales en interacción; foco físico pendiente |
| `Popover` | `tmux-scenes/overlays-verification.tsx`; no usado en showcase | Trigger, placement y portal pasan en focused oracle; smoke físico pendiente |
| `createForm` | `tmux-scenes/theme-form.tsx`; `forms/form.test.ts` | Focused PASS: dirty/touched/errors/submit; UI física pendiente |

Los focused oracles comprueban contratos headless concretos, no todas las
variantes styled, posiciones de toast ni interacción física por tmux.

## 4. Styled: tokens, tema, tipografía y componentes

| Familia pública | Scene/showcase exacto | Resultado esperado |
| --- | --- | --- |
| `colors`, `radius`, `space`, `font`, `weight`, `shadows`, `glows`, `theme` | `colors`, `theming-cards`, `theming-typography`; todos los tabs | Tokens mantienen color, spacing, radios, peso y efectos consistentes |
| `createTheme`, `darkTheme`, `lightTheme`, `themeColors`, `setTheme`, `getTheme`, `ThemeProvider`, `useTheme` | `tmux-scenes/theme-form.tsx`; showcase importa tokens | Focused PASS: dark→light cambia pixels y conserva foco; smoke físico pendiente |
| `H1`/`H2`/`H3`/`H4`, `P`, `Lead`, `Large`, `Small`, `Muted` | `theming-typography`; showcase Typography | Escala, peso y muted/lead visibles; font baseline se registra, no se atribuye |
| `Avatar`, `Badge`, `Separator`, `Skeleton` | `components-avatar-badge`, `components-skeleton-separator`; showcase Display | Variantes, iniciales, separador y skeleton conservan geometría |
| `Button`, `Card` y subcomponentes `CardHeader/Title/Description/Content/Footer/Action` | `components-button-*`, `theming-cards`; showcase Display | Variantes, tamaños y anatomía se pintan; click no rompe layout |
| `VoidInput`, `VoidTextarea` | `components-input`; showcase Inputs | Wrapper conserva edición/cursor; Textarea cubre multilinea |
| `VoidCheckbox`, `VoidSwitch`, `VoidRadioGroup`, `VoidSlider` | `components-checkbox-switch`, `components-radio-slider`; showcase Inputs | Estado/selección/valor visual coinciden con callback |
| `VoidSelect`, `VoidCombobox` | `components-select`, `components-combobox`; showcase Inputs | Menú/filtro/selección y focus son navegables |
| `VoidDialog`, títulos/descripción/footer; `VoidDropdownMenu` | `components-dialog`, `components-dropdown`; showcase Overlays | Overlay/menu base; cobertura interactiva de cada export y smoke físico pendientes |
| `VoidPopover`, `VoidTooltip`, `createVoidToaster` | `tmux-scenes/overlays-verification.tsx`; showcase Overlays | Focused bottom-right PASS; posiciones/variantes de interacción cubiertas por `scripts/visual-test/tmux-interaction.test.tsx`; cobertura de cada export y smoke físico pendientes |
| `VoidProgress`, `VoidCode`, `VoidMarkdown`, `VoidDiff` | `components-progress`; `tmux-scenes/code-docs.tsx`; showcase Code & Docs | Progress; focused Code/Markdown/Diff parity PASS, con whitespace compartido y oracle de indentación/gutter |
| `VoidList`, `VoidVirtualList`, `VoidScrollView`, `VoidTable`, `VoidTabs` | `components-list`, `components-virtual-list`, `primitives-scroll`, `components-table`, `components-tabs-*`; showcase Collections | Windowing, scroll, selection y tab panel conservan foco |

La cobertura styled es una composición de headless + tokens; un snapshot estático
no demuestra callbacks. Los checks de interacción deben registrar callback y
pixel/digest, no solo que un export sea una función.

## 5. Qué prueban realmente los tests existentes

Estos comandos son reproducibles y requieren el preload explícito; sus resultados
son oracles offscreen, no pruebas de terminal. El snapshot histórico registró
**515 PASS/0 FAIL/77 archivos/1604 `expect()`**
(`/tmp/vexart-parity-final-tests.log`) y `bun run typecheck` PASS (sin
atribuir un log separado). La suite estable actual terminó **539 PASS/0 FAIL/82
archivos/1781 `expect()`** en `/tmp/vexart-resumed-stable-tests.log`.

```sh
bun --conditions=browser test --preload ./solid-plugin.ts \
  packages/headless/src/inputs/input.test.ts \
  packages/headless/src/inputs/slider.test.ts \
  packages/headless/src/forms/form.test.ts
bun --conditions=browser test --preload ./solid-plugin.ts \
  packages/headless/src/collections/list.test.tsx \
  packages/headless/src/collections/table.test.tsx \
  packages/headless/src/containers/tabs.test.tsx
bun --conditions=browser test --preload ./solid-plugin.ts \
  packages/headless/src/collections/virtual-list.test.ts \
  packages/headless/src/overlays/dialog.test.ts
```

`Input` verifica normalización de CRLF/tabs y `Slider` verifica snap/división
cero; no son montajes visuales completos. `Form` verifica dirty estructural;
`List`, `Table` y `Tabs` sí ejercitan foco/selección en runtime browser, mientras
`VirtualList` verifica cálculo de ventana y `Dialog` verifica composición de
exports. Tests styled de `button`, `card` y `theme` cubren sus contratos; una
aserción de export no sustituye la acción manual o un pixel oracle.

### Recorrido manual exacto del showcase

Ejecutar el comando del nivel físico y navegar con Tab, flechas y Space/Enter:

- **Inputs:** escribir en `VoidInput`/`VoidTextarea`; abrir Select/Combobox;
  alternar Checkbox/Switch; cambiar Radio y mover Slider.
- **Display:** observar las cinco variantes y cuatro tamaños de Button, cuatro
  Badge, cuatro Avatar, Card anatomy, Progress 72/100 y tres Skeleton.
- **Collections:** mover selección de List/Table y hacer scroll en ScrollView.
- **Code & Docs:** inspeccionar syntax-highlighted `VoidCode`, hunk de `VoidDiff`
  y heading/list/fence/quote de `VoidMarkdown`.
- **Overlays:** abrir/cerrar Dialog, Cancel/Delete, tres Toasts y hover de
  Tooltips. `VoidPopover` no está en el showcase; foco Tooltip y posiciones
  adicionales quedan pendientes.
- **Typography:** recorrer H1–H4, Lead/P/Large/Small/Muted y Separator; `q` sale.

Resultado esperado: control visible, estado/callback correcto y layout estable;
anotar cualquier diferencia como pendiente física, no como PASS automático.

## 6. Mapa de las escenas visuales documentadas

El oracle debe descubrir exactamente estos IDs bajo
[`scripts/visual-test/scenes`](../scripts/visual-test/scenes):

- **Base:** `hello`, `colors`, `app-framework`.
- **Effects:** `effects-backdrop-blur`, `effects-backdrop-filters`,
  `effects-corner-radii`, `effects-glow`, `effects-gradient-linear`,
  `effects-gradient-radial`, `effects-opacity`, `effects-shadow`,
  `effects-transform-rotate`, `effects-transform-scale`.
- **Components:** `components-avatar-badge`, `components-button-sizes`,
  `components-button-variants`, `components-checkbox-switch`,
  `components-combobox`, `components-dialog`, `components-dropdown`,
  `components-input`, `components-list`, `components-progress`,
  `components-radio-slider`, `components-select`,
  `components-skeleton-separator`, `components-table`,
  `components-tabs-default`, `components-tabs-line`, `components-virtual-list`.
- **Interaction:** `interaction-focus`, `interaction-hover`, `interaction-press`.
- **Primitives/layout:** `layout`, `primitives-border-padding`,
  `primitives-canvas`, `primitives-floating`, `primitives-scroll`,
  `primitives-sizing`.
- **Theming:** `theming-cards`, `theming-typography`.

`primitives-canvas` es una instantánea de cajas con nombre histórico; no es
Canvas API. Las 41 escenas anteriores se complementan con estos 9 focused bajo
[`scripts/visual-test/tmux-scenes`](../scripts/visual-test/tmux-scenes):
`canvas-api`, `code-docs`, `filters-complete`, `image-decode`,
`inputs-interaction`, `overlays-verification`, `paint-features`, `text-glyphs` y
`theme-form`. El snapshot histórico registró **50/50 PASS** (41
`differential-only`, 9 `differential-plus-oracle`); la corrida cross-route estable
actual terminó 52/52 PASS (41 `differential-only`, 11 `differential-plus-oracle`).
`<img>`, Canvas, filtros, Code/Markdown whitespace, posiciones Toast y los grupos
de paint tienen checks automatizados; la cobertura de cada export styled,
interacción física y smoke físico siguen pendientes.

## 7. Capas de tmux y aceptación

Para cada control, conservar tres artefactos separados:

1. **Feature oracle:** assertion o PNG/JSON offscreen con salida esperada.
2. **Packet parity:** normal Kitty vs tmux native decoded, sin RGBA en el emisor
   de producción y con APC/DCS/grid/lifecycle comprobados; el harness usa
   readback explícito y no implementa ACK.
3. **Physical smoke:** observación humana de Kitty y Ghostty reales dentro de
   tmux; la revisión Kitty actual es cualitativa, no pixel a pixel, y no se afirma
   PASS desde un receptor Python.

Antes de una ejecución física, el usuario aplica su configuración compatible y
se inspeccionan sin escribir opciones:

```sh
tmux -V
tmux show-options -pAv -t "$TMUX_PANE" allow-passthrough
tmux display-message -p 'client_terminal=#{client_termname} client_width=#{client_width} client_height=#{client_height}'
```

Se espera tmux ≥3.4, passthrough efectivo `all`, outer Kitty/Ghostty y `RGB` en
las features del cliente adjunto. La ruta SHM es solo local y rechaza sesiones
con `SSH_CONNECTION`, `SSH_CLIENT` o `SSH_TTY`; no se reclama tmux sobre SSH.
Mouse, foco y extended keys son opcionales.
El copy mode puede mostrar placeholders, no pixels ni texto semántico. Otro outer
terminal exige detener/reiniciar para reprobar; el reprobe dinámico es una
opción de arquitectura, no un supuesto de este catálogo.

La salida de este documento es un inventario con check ejecutable (o hueco
explícito), expected output, artefacto y nivel A/B/C/D por feature. El snapshot
histórico fue 50/50 PASS y el focused de overlays cubre una escena bottom-right;
las seis posiciones × dos variantes y Dialog focus están en
`scripts/visual-test/tmux-interaction.test.tsx`. La corrida cross-route estable
actual es 52/52 PASS; la corrida previa 51/52 se conserva como investigación
histórica del pulso temporal. La revisión humana actual confirma las seis pestañas
del showcase en Kitty directo y dentro de tmux de forma cualitativa; Ghostty, FPS
y la cobertura exhaustiva siguen pendientes. El objetivo SHM-only está aprobado y
la ruta de código pasa por PTY; el batch/receptor sintético no sustituye la
medición pixel a pixel ni esa cobertura restante.
