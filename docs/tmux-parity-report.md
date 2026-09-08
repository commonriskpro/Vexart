# Informe de brechas de paridad tmux

**Fecha:** 2026-09-08<br>
**Estado:** Paridad Kitty solicitada verificada en directo y tmux mediante checks automatizados y revisión visual humana cualitativa; objetivo SHM aprobado; Ghostty/FPS y medición pixel a pixel quedan fuera de este cierre<br>
**Orden de trabajo:** evidencia primero; las regiones se decidirán después de medir rendimiento real

Este informe separa hechos demostrados, señales automatizadas y huecos abiertos. Registra el alcance aprobado sin reemplazar la implementación ni la [guía de tmux](./tmux.md) o la [auditoría de completitud](./tmux-completion-audit.md), y no confunde protocolo aceptado con pixels visibles.

## 1. Hallazgo principal

La escena TypeScript, Flexily, hit-testing, interacción, composición WGPU, codificación Kitty y helper nativo de SHM son reutilizables. tmux no necesita un segundo renderer.

La evidencia directa **histórica** es una ruta experimental de composición nativa de un frame completo, compresión zlib, Kitty directo y grid Unicode de placeholders en cada frame invocado. Es baseline de comparación, no validación SHM. El
objetivo aprobado para tmux es un frame completo por SHM local, sin fallback automático a direct/file; la ruta normal/reject/timeout, el lifecycle real, el gate de ownership de cleanup directo y la matriz cross-route tienen PASS automatizado. La revisión visual humana de las seis pestañas confirma Kitty directo y Kitty dentro de tmux de forma cualitativa; Ghostty, FPS y medición pixel a pixel siguen pendientes.

## Estado de auditoría — 2026-09-08

La paridad Kitty solicitada está verificada. El snapshot del
2026-09-07 que sigue es histórico. La revisión humana actual de las seis pestañas
confirma Kitty directo y Kitty dentro de tmux de forma cualitativa, no pixel a
pixel ni exhaustiva de callbacks/input; Ghostty y FPS siguen sin verificar. Kitty/
Ghostty CUA denegado pertenece a ese intento histórico y no se eludió.

- **Lifecycle/SHM:** el ciclo real tmux PASS en
  `/tmp/vexart-lifecycle-production-final.59302.1064` verifica 8 nombres SHM,
  incluido producer-only perdido, reconexión en el mismo TTY, frame fresco y
  geometría. La revisión de cleanup queda registrada como evidencia PTY en
  `/tmp/vexart-shm-review-lifecycle.1788868930.74725.20121` (no es un log de
  focused unit tests); normal/reject/timeout pasan en serie (el fallo del
  fixture negativo es esperado). Los últimos gates de orden del runner también
  pasan en `/tmp/vexart-shm-runner-final-normal.1788869766.95269.19333` y
  `/tmp/vexart-shm-runner-final-lifecycle.1788869768.95269.5837`. La corrida serial
  final de cuatro modos también pasa en `/tmp/vexart-resumed-final-pty.0Hc1os/`:
  normal 6 uploads/7 SHM/2 deletes; lifecycle 6 uploads/8 SHM/1 delete en el
  mismo TTY; reject y timeout 1 upload/2 SHM/1 delete cada uno, con FAIL esperado
  del productor. Los errores de cleanup se exponen; esto no garantiza la
  eliminación si falla la escritura hacia la terminal. El gate anterior
  `/tmp/vexart-lifecycle.33464.2337` queda como historia, no como estado actual.
  La recuperación automática aprobada (pausa sin cliente y reenvío del último
  frame SHM, sin configuración) está integrada en esta verificación. El focused
  native estricto de styled overlays ahora pasa 1/1 en
  `/tmp/vexart-styled-overlays-ownership-green-1788870121501`: el ownership se
  corrigió para rastrear solo layer IDs realmente publicados en
  [`native-presentation-ops.ts`](../packages/engine/src/ffi/native-presentation-ops.ts).
  El fallo directo previo queda como historia en
  `/tmp/vexart-styled-overlays-final-matrix`. La suite actual terminó 539 pass,
  0 fail, 82 archivos y 1781 expectativas en
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
- **Cobertura compartida:** Kitty normal conserva escena, layout, GPU y
  componentes compartidos; tmux añade solo transporte/presentación SHM y
  lifecycle. Los arreglos compartidos benefician ambas rutas. Collections y
  ScrollView quedaron verificadas tras ordenar solo `scissorLayers`, con imagen
  final `/tmp/vexart-collections-parity-scrollfix-final-1788868047588501000` y
  dos checks de fondo de scroll PASS en
  `/tmp/vexart-scroll-background-final-1788870228543.log`.
  El Button compartido usa render estable por getters; el rojo
  `/tmp/vexart-button-stable-red.log` y el verde
  `/tmp/vexart-button-stable-green.log` documentan la corrección del livelock.
- **Interacción visual:** el recorrido styled overlay offscreen terminó 2 PASS y
  5 expectativas negativas en `/tmp/vexart-styled-overlays-final.png`; el gate
  nativo estricto de ownership también pasa 1/1 como se indicó arriba. Unicode mantiene
  9 PASS/114 expectativas,
  parser 32 y keyboard 35, sin claim completo de grapheme, IME, mouse o
  navegación vertical.
- **Baselines:** las 42 referencias golden conservan sus hashes y pasan la
  verificación en `/tmp/vexart-resumed-final-golden-hashes.log`; no se regeneran.
  El boundary rerun conserva las 5 violaciones conocidas en
  `/tmp/vexart-resumed-final-boundaries.log`, sin nuevas violaciones SHM. Se
  solicitó además una comparación manual asíncrona de las 6 pestañas del showcase;
  la revisión humana actual confirma las seis pestañas en Kitty directo y dentro
  de tmux de forma cualitativa; no es medición pixel a pixel ni cobertura exhaustiva
  de callbacks/input. Ghostty y FPS siguen pendientes.

### Snapshot histórico de verificación — 2026-09-07

Los checks de cierre registrados el 2026-09-07 aportan evidencia B y A, pero no
reemplazan el smoke físico:

- La suite TypeScript terminó **515 pass, 0 fail, 77 archivos y 1604
  `expect()`** en `/tmp/vexart-parity-final-tests.log`; `bun run typecheck`
  también pasó.
- `cd native/libvexart && cargo test --features gpu-tests` terminó **186 pass,
  0 fail y 1 ignorado** (180 unitarios, alpha, blur, tres image-transform y
  shadow) en `/tmp/vexart-parity-finish-native.log`. El build release de las
  22:23 locales es evidencia separada; no implica display físico ni FPS.
- Las escenas enfocadas `primitives-border-padding` y `theme-form` tuvieron
  paridad directa/tmux/readback PASS en
  `/tmp/vexart-border-px-parity.XYaC4F/{borders,theme}`. Ambos artefactos son
  packet/pixel parity con receptor sintético: no hay ACK, forwarding tmux real,
  UI Kitty/Ghostty ni FPS.
- El fixture final de inputs `tmux-scenes/inputs-interaction` pasó paridad
  directa/tmux/readback y typecheck en `/tmp/vexart-inputs-parity.MO08n1`; la
  prueba negativa final acepta el frame y rechaza 9/9 marcadores en copias del
  buffer en `/tmp/vexart-parity-finish-inputs-negative-final.log`. Solo verifica
  esas copias del buffer: no prueba resource cleanup, no modifica componentes de
  producción y no prueba una terminal física.
- El focused `overlays-verification` de
  `/tmp/vexart-overlay-parity.cHRekH/summary.json` prueba una escena
  bottom-right con paridad directa/SHM. Las seis posiciones × dos variantes de
  capacidad y Dialog Escape/unmount con restauración de foco pertenecen a los 7
  casos y 60 expectativas de [`scripts/visual-test/tmux-interaction.test.tsx`](../scripts/visual-test/tmux-interaction.test.tsx). La corrección de Toast
  usa `width="fit"` para el ancho intrínseco del stack; toda esta evidencia es
  offscreen, no UI Kitty/Ghostty.
- El recorrido `createTerminal` → render loop nativo → tmux 3.6a PTY pasó los
  tres modos en `/tmp/vexart-parity-finish-pty.1x5t8X`: modo normal PASS con 6
  uploads y 7 objetos SHM; rechazo y timeout PASS del runner con el fallo del
  productor esperado y cleanup. Es evidencia de integración con receptor
  sintético, no presentación física.
- La escena focused `tmux-scenes/paint-features` pasó paridad directa/tmux/readback
  y sus oracles (gradientes, sombras, glow, radios, opacidad, transforms y clip)
  en `/tmp/vexart-paint-parity-transform.DrOeKh`. La prueba negativa confirma
  los 7 grupos de desactivación y el rechazo del estado por defecto en
  `/tmp/vexart-paint-negative-final.txt`; no demuestra exhaustividad de cada
  subfeature.
- El focused de texto compartido `/tmp/vexart-text-parity-shared-final-1788835901411484000`
  pasa paridad; su escena verifica indent de Code, límites de Markdown y gutter
  de Diff. Los 6 casos de engine (whiteSpace/wordBreak, hard break, constrained
  wrap, keep-all, clip y reactive repaint) pasan en
  [`packages/engine/src/testing/text-whitespace.test.ts`](../packages/engine/src/testing/text-whitespace.test.ts); negrita/cursiva y Diff
  gutter se cubren en el content test. El pipeline comparte `whiteSpace`/`wordBreak`,
  cachea layout solo para pre-wrap y usa `maxWidth=0` en native; la rama
  `whiteSpace=normal` conserva su comportamiento y pre-wrap cambia en ambas rutas.
  No hay rebuild ABI/native.
  La API extractor aislada `/tmp/vexart-parity-api.2ddC76` PASS con warnings, con
  campos `@internal` excluidos del rollup público; no se afirma un `api:check`
  global limpio.
- La matriz completa de escenas terminó **50 PASS, 0 FAIL** (41
  `differential-only` y 9 `differential-plus-oracle`) en
  `/tmp/vexart-parity-final-matrix.4rdpKx/run/summary.json`: 99 frames directos,
  145 frames tmux y 145 objetos SHM; las tres comparaciones de pixels son true
  en las 50 escenas. Incluye `inputs-interaction`, `paint-features`, `code-docs`,
  overlays, texto, Canvas, filtros, imágenes y tema. Es paridad automatizada con
  receptor sintético; no es forwarding físico ni smoke Kitty/Ghostty.
- El compare-only final de goldens terminó **2 pass, 39 fail** en
  `/tmp/vexart-parity-final-goldens.log`, igual que el conteo histórico; las
  diferencias no están completamente clasificadas y no se regeneran referencias.
- El lint de límites conserva **5 violaciones preexistentes** sin nuevas
  violaciones SHM en `/tmp/vexart-parity-final-boundaries.log`; no es un fallo de
  pixel parity ni un `lint` global PASS.
- Los helpers de transporte SHM ya no forman un ciclo de tipos; 4 focused tests
  pasan en `/tmp/vexart-transport-lifecycle.log`, y el typecheck del scope pasa
  por separado.

La corrección del bug de bordes se verificó en los shaders `shape_rect.wgsl` y
`rect_corners.wgsl` al retirar el `- aa` interior extra; el borde de 1 px ahora
conserva 1 px. Las modificaciones
`font/*` son anteriores a SHM y permanecieron sin cambios en esta fase; no se
atribuye a tmux una regresión tipográfica por ese hecho.

El snapshot del 2026-09-07 no contiene evidencia D: la observación física en
Kitty/Ghostty seguía pendiente/bloqueada. En la auditoría actual, la revisión
humana de las seis pestañas confirma Kitty directo y Kitty dentro de tmux de forma
cualitativa, no pixel a pixel ni exhaustiva; Ghostty y FPS siguen sin verificar.
No se debe inferir más visibilidad desde estos logs, capturas anteriores o un
receptor Python.

La matriz SHM batch **histórica** del repositorio intentó 48 escenas y terminó
**47/48 PASS**. El focused corregido de `theme-form` también pasó, pero ese
agregado no debe presentarse como un batch limpio 48/48. El artefacto histórico
usa un receptor sintético del harness, no tmux forwarding real ni una UI
Kitty/Ghostty, y no acredita FPS. La comparación de pixels y el readback son
artefactos de test; la producción reporta `rgbaBytesRead=0`. La matriz completa registrada en ese snapshot terminó **50/50 PASS** en el
artefacto indicado arriba; la corrida cross-route estable actual terminó 52/52
(11 escenas con oracle), y los checks y sus limitaciones se enumeran abajo.

La evidencia directa histórica terminó **45/45 PASS**: 41 escenas existentes son
`differential-only` y `canvas-api`, `filters-complete`, `image-decode` y
`text-glyphs` son `differential-plus-oracle`; sus controles negativos también
pasaron. Resumen: `/tmp/vexart-tmux-feature-parity-1788825845/summary.json`.
No hay ACK, forwarding por tmux real, observación Kitty/Ghostty ni FPS en ese
artefacto. El PTY/SHM aislado con tmux real y receptor sintético es evidencia
separada; no se mezclan esos resultados con la verificación actual.

La matriz SHM batch histórica ya incluía `code-docs` y `overlays-verification`; el
focused SHM corregido de `theme-form` completó entonces un agregado histórico de
**48 escenas distintas** (41 differential-only y 7 con oracle; no un batch limpio
de 48).
Las comparaciones focused directas históricas de `code-docs` y `overlays-verification`
pasaron en
`/tmp/vexart-parity-code-docs-aU3Z`, pero observó espacios inline colapsados en Code/Markdown en ambas rutas; Diff no fue observado. Ese artefacto es anterior a la corrección compartida de `whiteSpace`; la discrepancia ya no se presenta como estado actual. `overlays-verification` pasó en
`/tmp/vexart-tmux-overlay-final-1788826553`; ese resultado histórico se
complementa con el focused actual `/tmp/vexart-overlay-parity.cHRekH/summary.json`,
que pasa una escena bottom-right. Las seis posiciones × dos variantes de
capacidad y la restauración de foco del Dialog están cubiertas por
[`scripts/visual-test/tmux-interaction.test.tsx`](../scripts/visual-test/tmux-interaction.test.tsx) (7 casos, 60 expectativas). El repro anterior
`/tmp/vexart-overlay-toast-before-fix.txt` conserva el bbox rojo izquierdo
observado antes de la corrección; no describe el estado actual. La ruta SHM
normal de Kitty sigue disponible fuera de tmux. El experimento aislado muestra
una vía reutilizable para reducir tráfico, pero no prueba display
visible en Ghostty o Kitty. La integración de producción tiene PASS en PTY sintético;
smoke físico y medición de rendimiento siguen pendientes.
No se crea otro motor ni un fallback directo/file.
### No inferir

- 39 fallos visuales no equivalen a 39 features rotas.
- Un ACK confirma aceptación/procesamiento, no que se haya mostrado un frame.
- Un receptor Python no es Kitty ni Ghostty físicos.
- La matriz SHM histórica 47/48 más el focused de `theme-form` no cubre interacción ni lifecycle físico completo.
- El test de callback/cleanup ante `SIGHUP` existe en `lifecycle.test.ts`; un detach normal de tmux no equivale a `SIGHUP` ni demuestra detach/reattach físico.
- No se regeneran baselines desde este informe.
## 2. Niveles y alcance de evidencia

| Nivel | Evidencia | Permite afirmar |
| --- | --- | --- |
| A | PTY/protocolo aislado con receptor sintético | Bytes, ACK, digest y limpieza; no visibilidad |
| B | Tests, fuente y build | Contratos internos y compilación |
| C | Comparación visual automatizada | Divergencias para investigar; no causa automática |
| D | Smoke observado en terminal objetivo | Experiencia visible y paridad física |
Esta revisión incluye nivel D cualitativo para Kitty directo y Kitty dentro de
tmux: el usuario revisó las seis pestañas del showcase y las encontró bastante
exactas. No es medición pixel a pixel ni cubre todas las interacciones; Ghostty,
FPS y latencia siguen sin verificar. El snapshot del 2026-09-07 registró la meta
de la app como `PAUSED`; ese estado es histórico. La captura CUA de Kitty fue
denegada para
`net.kovidgoyal.kitty`, y Ghostty ya había sido denegado en una ejecución previa;
ambas denegaciones son históricas y no se eludieron con otra captura, CLI o UI.

La auditoría visual histórica se ejecutó sobre un workspace sucio basado en HEAD
`07f3b8d`, con `target/release/libvexart.dylib` construido el 2026-09-07 a las
18:49 local; ese timestamp no describe la biblioteca reconstruida después. El
offscreen run quedó registrado a las 19:36; por ello no atribuye regresión a un
HEAD limpio. Las modificaciones en `font/*` son anteriores al trabajo SHM y
permanecieron sin cambios en esta fase; sus diferencias de baseline quedan sin
clasificar y no se atribuyen a tmux ni se arreglan aquí.

### Evidencia histórica de tests y transporte — 2026-09-07

1. `/tmp/vexart-parity-final-tests.log`: 515 pasadas, 0 fallos, 77 archivos,
   1604 `expect()`; `bun run typecheck` PASS.
2. `cd native/libvexart && cargo test --features gpu-tests` terminó 186 pasadas,
   0 fallos y 1 ignorada en `/tmp/vexart-parity-finish-native.log`; el build
   release de las 22:23 locales también pasó (ese build precedió este test).
3. `/tmp/vexart-border-px-parity.XYaC4F/{borders,theme}` contiene dos escenas
   enfocadas con paridad directa/tmux/readback PASS; es evidencia de test, no
   forwarding real ni display físico.
4. El fixture final de interacción `tmux-scenes/inputs-interaction` pasó
   paridad directa/tmux/readback y typecheck en
   `/tmp/vexart-inputs-parity.MO08n1`; la prueba negativa final también acepta
  el frame y rechaza 9/9 marcadores en copias del buffer en
  `/tmp/vexart-parity-finish-inputs-negative-final.log`. Solo verifica esas
  copias del buffer: no prueba resource cleanup, no modifica componentes de
  producción ni prueba una terminal física.
5. El focused `overlays-verification` de
   `/tmp/vexart-overlay-parity.cHRekH/summary.json` prueba una escena
   bottom-right con paridad directa/SHM. Las seis posiciones × dos variantes de
   capacidad y Dialog Escape/unmount con restauración de foco pertenecen a los 7
   casos y 60 expectativas de [`scripts/visual-test/tmux-interaction.test.tsx`](../scripts/visual-test/tmux-interaction.test.tsx). La corrección de Toast
   usa `width="fit"` para el ancho intrínseco del stack; toda esta evidencia es
   offscreen, no UI Kitty/Ghostty.
6. La escena focused `tmux-scenes/paint-features` pasó sus oracles y paridad en
   `/tmp/vexart-paint-parity-transform.DrOeKh`; los 7 grupos negativos pasan en
   `/tmp/vexart-paint-negative-final.txt`. Esto no demuestra cada subfeature.
7. El focused de texto compartido pasó en
   `/tmp/vexart-text-parity-shared-final-1788835901411484000`: indent de Code,
   límites de Markdown y gutter de Diff. Los 6 casos de whitespace del engine
   pasan en [`packages/engine/src/testing/text-whitespace.test.ts`](../packages/engine/src/testing/text-whitespace.test.ts) dentro de la
   suite completa; la API extractor aislada pasa con warnings en
   `/tmp/vexart-parity-api.2ddC76`.
8. El batch SHM 47/48 y el focused `theme-form` PASS son resultados históricos,
   separados de la matriz histórica 50/50. Su harness compara normal y `tmux-shm`
   con un receptor sintético y no implementa ACK.
9. Los checks de decoder, routing y focused de escenas citados más abajo son
   evidencia histórica o acotada; no se presentan como forwarding físico por
   tmux ni smoke Kitty/Ghostty.

### Experimento SHM aislado

Se reutilizó el helper nativo con tmux 3.6a real y receptor Python sintético que no renderiza: 20 frames de 1280×720, patrón RGBA y ACK por frame.

| Medición | Directo | SHM |
| --- | ---: | ---: |
| Frames solicitados/aceptados | 20/20 | 20/20 |
| Bytes APC | 17.754.396 | 2.060 |
| Grid | 413 B, una vez | 413 B, una vez |
| Digest | idéntico | idéntico |
| Limpieza productor SHM | — | 21 entradas |

Se verificaron ACK fragmentados, rechazo y timeout. `/tmp/vexart-tmux-shm-720p.json` es la fuente efímera. El experimento combinado (directo+SHM) eliminó 2 imágenes propias; no es una métrica exclusiva de SHM. Esto mide tráfico/preparación
del receptor sintético, no FPS, latencia visible, Ghostty, Kitty o sesión de usuario.

Una comprobación adicional sobre tmux 3.6a real encontró que `allow-passthrough all` reenvía una secuencia desde un pane de origen oculto, mientras `on` la descarta; el ACK `ESC_G` vuelve al pane activo, no al de origen. Es evidencia de
routing, no de presentación física. El destino aprobado limita la integración a un cliente adjunto en todo el servidor tmux y solo a uso local: se rechazan `SSH_CONNECTION`, `SSH_CLIENT` y `SSH_TTY`. `is_consumed` es la finalización primaria de SHM, con error/timeout como limpieza, y no se hace progresar un frame
por ACK. Repro: `/tmp/vexart-tmux-ack-routing-result.json` y `/tmp/vexart-check-tmux-ack-routing.py`. Las APC del baseline directo usan Kitty `q=2` para suprimir éxito y error; el upload SHM usa `q=1` para errores opcionales. El ACK observado no gobierna la progresión de frames.

La especificación de [Kitty Unicode placeholders](https://sw.kovidgoyal.net/kitty/graphics-protocol/) respalda separar APC de grid. Como evidencia acotada a Ghostty 1.3.1, su [fuente de acciones
Kitty](https://github.com/ghostty-org/ghostty/blob/v1.3.1/src/terminal/kitty/graphics_exec.zig) devuelve acción no implementada para `a=f`/`a=a`; no se extrapola automáticamente a otras versiones.

### Integración SHM de producción (PASS de nivel A, receptor sintético)

El recorrido real `createTerminal` → native GPU/render loop → tmux 3.6a PTY →
receptor sintético pasó la sonda SHM y **6 uploads completos**, incluidos 2 con
el pane de origen oculto/zoom. También pasó burst/latest-frame, el resume del
runner (no detach/reattach) y cleanup:
7 objetos SHM con modo `0600` fueron consumidos/desenlazados y se borraron 2
imágenes propias. Stats: transporte SHM, flags `5`, `rgbaBytesRead=0`,
`compress_us=0`; no hubo ACK de frame. Reproducción (requiere un directorio de
salida nuevo): `base=$(mktemp -d "${TMPDIR:-/tmp}/vexart-shm-pty.XXXXXX");
python3 scripts/visual-test/tmux-shm-pty.py --mode=normal --out="$base/run"`, con fixture
[`tmux-shm-runtime-fixture.ts`](../scripts/visual-test/tmux-shm-runtime-fixture.ts).
Evidencia actual: `/tmp/vexart-parity-finish-pty.1x5t8X/{normal,reject,timeout}`;
los tres `pty-result.json` tienen estado PASS del runner. En `normal`,
`upload_count=6` y `shm_objects=7`; en `reject` y `timeout`, el fallo del
productor es el resultado esperado y el objeto propio se limpia.

Este PASS cubre el contrato de producción por PTY sintético, no display físico ni
FPS. Las ejecuciones fallidas previas fueron
un problema del shell de prueba que restablecía `allow-passthrough` a `on`; se
corrigió usando shell/argv controlados, sin cambiar backend ni configuración del
usuario. El hook exacto del usuario no fue inspeccionado.

### Auditoría visual offscreen — histórica 2026-09-07

`bun run test:visual` compare-only produjo 2 pasadas y 39 fallos de 41 escenas: colores 0% y layout 0,30%; log: `/tmp/vexart-tmux-audit-visual.log`. La repetición normalizada terminó con los mismos porcentajes; log:
`/tmp/vexart-tmux-goal-visual-regression.log`. Las referencias conservaron el mismo SHA; no se regeneraron.

La ruta correcta es [`scripts/visual-test/scenes`](../scripts/visual-test/scenes), no `tests/visual`. El runner ignora `--native-render-graph-parity`, así que ese flag no prueba dos render graphs.

`effects-gradient-linear` a 420×320 reprodujo exactamente 92,300595%; el artefacto actual está en `/tmp/vexart-tmux-audit-gradient-current.png`. La escena actual tiene tres paneles, título y fondo; la referencia inspeccionada solo el panel
naranja derecho y “180” sobre negro. Al menos esa referencia no describe la fuente actual; no prueba que los demás gradientes o fallos estén rotos.

La escena [`primitives-canvas.tsx`](../scripts/visual-test/scenes/primitives-canvas.tsx) contiene solo cajas y no usa Canvas API; no cuenta como cobertura real de Canvas. El test
[`canvas-image.test.ts`](../packages/engine/src/testing/canvas-image.test.ts) sí cubre rectángulo Canvas público, `drawImage` predecodificado, fuentes/capas múltiples y backdrop, pero es offscreen/readback. En la ruta activa,
[`gpu-renderer-backend.ts`](../packages/engine/src/ffi/gpu-renderer-backend.ts) rasteriza Canvas en TypeScript y luego sube la imagen; existe registro nativo de display lists, pero no es dueño de esa rasterización. Para tmux se
debe conservar la ruta funcional; migrar Canvas a native es alcance separado.

La auditoría de golden también falló en `dashboard-800x600`: 3.858 de 480.000 pixels (0,80%, máximo de canal 78), log `/tmp/vexart-tmux-audit-dashboard.log`. La causa no está diagnosticada, no es atribuible a tmux y no se escribieron
baselines. Ninguna referencia se regenera con estos datos.

Otra discrepancia general, no una regresión tmux: [`GradientConfig`](../packages/engine/src/ffi/node.ts) expone dos stops (`from`/`to`) para linear/radial, mientras PRD §2.3 describe multi-stop. No se amplía esa feature en este
trabajo.
## 3. Matriz de cobertura visual e interactiva

"Parcial" significa evidencia interna, no smoke físico. "No cubierto" no significa que la implementación esté rota. La matriz SHM batch 47/48, la comparación directa 45/45 y el 50/50 (41 differential-only y 9 differential-plus-oracle) son resultados históricos; la matriz cross-route actual quedó verificada en 52/52 con 11 oracles, sin reemplazar el smoke físico. En esta tabla, "No cubierto" significa que falta oracle específico, interacción o smoke físico, no que falte el transporte diferencial.

| Feature / scene ID | Directo existente | tmux demostrado (baseline directo histórico) | Próxima prueba |
| --- | --- | --- | --- |
| Formas/bordes | Tests/render; `primitives-border-padding` focused packet/pixel PASS | Matriz histórica del snapshot 50/50; paint/scene oracles acotados | Escenas completas, Kitty/Ghostty |
| Gradiente lineal (`effects-gradient-linear`) | Golden divergente; `paint-features` oracle | Matriz histórica del snapshot 50/50; paint feature oracle | Smoke físico |
| Gradiente radial (`effects-gradient-radial`) | Código/reference; `paint-features` oracle | Matriz histórica del snapshot 50/50; paint feature oracle | Comparación por outer terminal |
| Sombras single/multi (`effects-shadow`) | Código/tests; `paint-features` oracle | Matriz histórica del snapshot 50/50; 7 negative groups | Smoke visual |
| Glow (`effects-glow`) | Código/reference; `paint-features` oracle | Matriz histórica del snapshot 50/50; 7 negative groups | Smoke visual |
| Per-corner (`effects-corner-radii`) | Código/reference; `paint-features` oracle | Matriz histórica del snapshot 50/50; paint feature oracle | Radios no uniformes |
| Paint features (`tmux-scenes/paint-features`) | Focused parity + variant oracles | PASS directo/tmux/readback; 7 grupos negativos PASS | No implica exhaustividad; smoke físico |
| Backdrop blur (`effects-backdrop-blur`) | Código/tests | `filters-complete`: differential-plus-oracle | Glassmorphism y clipping físico |
| Backdrop filters (`effects-backdrop-filters`) | Código/tests | `filters-complete`: differential-plus-oracle | Smoke físico; todos los filtros |
| Self-filter (`self-filter.test.ts`) | Tests native | `filters-complete`: differential-plus-oracle | Checks por propiedad, separado de backdrop |
| Opacity (`effects-opacity`) | Código/reference; `paint-features` oracle | Matriz histórica del snapshot 50/50; paint feature oracle | Alpha anidada |
| Transforms (`effects-transform-scale`, `effects-transform-rotate`) | Código/reference; `paint-features` oracle | Matriz histórica del snapshot 50/50; rotate/skew geometry probes | Scale/skew/rotate y clipping |
| Clipping/scroll (`primitives-scroll`) | Componentes; `paint-features` clip oracle | Matriz histórica del snapshot 50/50 | Scroll y límites del pane |
| Texto (`components-input`, `theming-typography`) | Renderer; shared text parity | Matriz histórica del snapshot 50/50; `text-glyphs` + `code-docs` oracles | MSDF y copy mode |
| Image assets / predecoded drawImage (`canvas-image.test.ts`) | Readback native | `canvas-api`: differential-plus-oracle | Tamaño, fuentes y capas distintas |
| `<img>` decode golden | Sin golden dedicado | `image-decode`: differential-plus-oracle | Golden separado; smoke físico |
| Kitty output image/grid (`tmux-presentation.test.ts` + matriz) | Kitty transport | Matriz histórica del snapshot 50/50; 3 comparaciones true por escena | Invalidation y cleanup físico |
| Canvas API (`canvas-image.test.ts`) | Rect + drawImage predecodificado, capas/backdrop | `canvas-api`: differential-plus-oracle | Smoke físico |
| Code/Markdown/Diff (`tmux-scenes/code-docs.tsx`) | Showcase, focused oracle | Shared text parity PASS: el focused cubre indent de Code, límites de Markdown y gutter de Diff; los 6 casos de engine están en [`packages/engine/src/testing/text-whitespace.test.ts`](../packages/engine/src/testing/text-whitespace.test.ts), sin workaround de fragmentación | Smoke físico |
| Flexily/hit-testing (`layout`) | Tests layout | `layout`: differential-only | Splits, join y windows |
| Teclado UTF-8 | Parser tests; `tmux-scenes/inputs-interaction` focused parity + typecheck PASS | Frame final y callbacks de input verificados offscreen; negativo rechaza 9/9 marcadores en copias del buffer (sin afirmar resource cleanup) | Modificadores y terminfo físicos |
| Mouse/rueda/multi-button | Callbacks; candidato fuente | No regresión reproducida | Smoke solo para diferencia tmux |
| Focus/paste | Código; focus dispatch; `tmux-scenes/inputs-interaction` focused parity PASS | Valores finales de input y rechazo de 9/9 marcadores en copias del buffer verificados offscreen (sin afirmar resource cleanup) | Probar solo una diferencia tmux |
| Overlays/dialogs | Componentes | `overlays-verification` focused PASS para una escena bottom-right; [`scripts/visual-test/tmux-interaction.test.tsx`](../scripts/visual-test/tmux-interaction.test.tsx): 6 posiciones × 2 variantes y Dialog Escape/unmount restaura foco (7 casos, 60 expectativas) | Smoke físico; cobertura por cada export styled |
| Scroll/drag | Componentes; `scripts/visual-test/tmux-interaction.test.tsx` | El test de interacción cubre captura SGR de click/drag y estado de wheel; `primitives-scroll` queda en differential-only | Smoke físico de scroll/drag |
| Resize | Tests/fixture | Comandos agrupados antes del frame; no pixel PASS por operación ni pane físico | Pane y ventana físicos |
| Switch de pane/window | Insuficiente | No cubierto | Recalcular y limpiar |
| Detach/reattach | Lifecycle | `/tmp/vexart-lifecycle-production-final.59302.1064` PASS: 8 nombres SHM incluido producer-only perdido, mismo TTY reconectado, frame fresco y geometría; evidencia de cleanup PTY en `/tmp/vexart-shm-review-lifecycle.1788868930.74725.20121` | Recuperación automática SHM aprobada y verificada; smoke físico |
| Otro outer terminal | No aplica | Restart requerido | Parar, reiniciar, reprobar |
| Suspend/resume/cleanup | Lifecycle | Resume parcial | Editor externo, señales, modos |
| Theme + form (`tmux-scenes/theme-form.tsx`) | `createForm`, theme signals; focused packet/pixel PASS | Focused PASS: dirty/touched/errors/submit, dark→light y foco | Smoke físico |

El golden histórico `effects-backdrop-filters` cubre brightness, contrast y saturate; `filters-complete` aporta oracle para cada filtro, pero requiere smoke físico. El repro test-only de `renderWithToastPosition("bottom-right")` en `/tmp/vexart-overlay-toast-before-fix.txt` observó x16..175,y182..223 (6688 pixels rojos) antes de la corrección. El focused actual en `/tmp/vexart-overlay-parity.cHRekH/summary.json` pasa una escena bottom-right; las seis posiciones × dos variantes y Dialog focus pertenecen a [`scripts/visual-test/tmux-interaction.test.tsx`](../scripts/visual-test/tmux-interaction.test.tsx). El self-filter tampoco debe inferirse desde un backdrop.
## 4. Qué cambiar, compartir o diferir

### Necesario verificar o extender para una ruta tmux sólida

- El probe de outer, `allow-passthrough`, Kitty, pane y DCS por APC ya existe; extender regresiones para identidad, ESC duplicado y grid normal fuera del DCS.
- Mantener separados los ACK/timeout/rechazo/reintento/cierre/limpieza del
experimento PTY; la matriz nativa no implementa ACK.
- Invalidar el grid al cambiar pane, window, split, tamaño o imagen.
- Mantener y extender la integración SHM local aprobada con un cliente adjunto
  por servidor, ownership acotado por `is_consumed`/error/timeout y un frame en
  vuelo más el último pendiente. Si falla, rechazar o detener la ruta tmux: no
  hay fallback automático directo/file, ASCII, half-block ni cell-art.
- Cubrir efectos, texto, imágenes, Canvas, input, overlays y lifecycle en ambos.
- Mantener restart/reprobe documentado tras otro outer; reprobe dinámico es scope opcional, no un requisito asumido de esta primera ruta.

### Compartido o solo verificar

- Scene graph TS, Flexily, render graph, eventos, focus y hit-testing.
- Pipelines WGPU, composición, assets y display lists de Canvas.
- Encoder Kitty, helper SHM y parser de UTF-8/CSI/SS3/mouse/focus/paste.
- Límite actual de placeholders: 1–297 filas por 1–297 columnas.
- Configuración propiedad del usuario; Vexart no escribe `tmux.conf`.

Estas piezas no exigen nueva API pública. Las capabilities internas deben seguir seleccionando transporte sin mover el límite TS/Rust.

### Diferido o fuera de este análisis

- WezTerm sobre tmux: WezTerm sigue siendo target directo, no ruta placeholder.
- `a=f` como promesa Ghostty: Ghostty 1.3.1 responde acción no implementada; es evidencia versionada, no una afirmación para toda versión futura.
- Parches por capa, renderer alternativo, modo cell-art o API pública nueva.
- Regenerar las 42 referencias, arreglar golden no diagnosticado o font baseline.
- IME, clipboard READ y API de focus del terminal externo: limitaciones generales también presentes en Kitty directo, no brechas tmux.
- Multi-button mouse y limpieza de `mountApp`: candidatos generales de fuente, no regresiones tmux reproducidas.
- Reprobe dinámico tras cambiar de outer terminal: decisión de alcance aparte; por ahora se documenta parar, reiniciar y reprobar.
- Prometer FPS o latencia visible sin evidencia D.

## 5. Alcance arquitectónico aprobado e integración verificada por PTY

### Límite que se debe preservar

TS mantiene escena, layout, render graph, interacción y focus. Rust mantiene WGPU, capas retenidas, composición, Kitty, recursos y presentación. Solo la presentación tmux emite un frame compuesto; eso no desactiva capas o repaints
retenidos. tmux es transporte/presentación: el pane lleva placeholders y los APC cruzan por DCS; no hay segunda escena ni pipeline de pintura.

### Baseline A — directo full-frame (evidencia previa)

Conserva zlib directo, frame completo y grid en cada invocación. Es la ruta usada por el batch diferencial de 45 escenas y el experimento comparativo; no es el destino aprobado para la presentación tmux.

**Pros:** menor estado, depuración simple, fixture aprobado y sin SHM entre procesos.

**Contras:** el experimento observó 17.754.396 B por 20 frames; el tráfico no se compara con metas de Kitty SHM.

### Destino aprobado B — SHM + placeholders

Usa el helper SHM existente para un frame completo, cuando probes y outer terminal pasen. El usuario aprobó SHM local solamente para tmux: un cliente adjunto en todo el servidor, `allow-passthrough all`, y ninguna selección automática de
directo/file si SHM falla.

**Pros:** mismo digest y APC bajó de 17.754.396 a 2.060 B en experimento; la limpieza del productor quedó observada.

**Contras:** necesita identidad y nombre único por upload, ownership hasta `is_consumed`, error/timeout, rechazo, borrado y concurrencia acotada; requiere checks de integración y smoke D. El ACK no gobierna el avance del frame.

### Opción C — parches, capas o animación (diferida)

Podría reducir tráfico en cambios pequeños, pero añade invalidación/cleanup y
`a=f` no es contrato de Ghostty 1.3.1; no es necesario para esta primera brecha.

La integración B debe ser el seam existente de presentación/capabilities, sin segundo renderer, file transport, layout distinto, backend de caracteres, pool ilimitado ni API app/JSX pública. Mantiene el mismo compositor y grid `U=1`, con un
upload en vuelo y solo el último frame pendiente. `allow-passthrough all` es requisito del destino: `on` puede perder secuencias de panes ocultos y no es una configuración equivalente. El objetivo está aprobado y la ruta de código tiene PASS por PTY sintético; el batch SHM histórico queda en 47/48 y el focused `theme-form` completó entonces la cobertura de 48 escenas distintas. La revisión Kitty manual cualitativa está confirmada; Ghostty, FPS y la medición
pixel a pixel siguen pendientes.

## 6. Aceptación por fases

### Fase 0 — evidencia

- Congelar goldens, registrar escena, tamaño, runner, HEAD sucio y fuente.
- Ejecutar [`scripts/visual-test/scenes`](../scripts/visual-test/scenes), no `tests/visual`.
- Registrar que `--native-render-graph-parity` es ignorado.
- Reconciliar `effects-gradient-linear` y dashboard sin regenerar referencias.
- Etiquetar cada resultado A/B/C/D y no atribuir causa sin evidencia.
- Registrar la aprobación del objetivo SHM-only; la implementación y sus
métricas de cierre quedan pendientes.

**Salida:** inventario reproducible de brechas.

### Fase 1 — conexión y protocolo

- Sesión tmux 3.6a nueva, `allow-passthrough all` efectivo, cliente `RGB` y
  outer identificado.
- Validar APC individual por DCS, ESC duplicado, grid externo y fragmentación.
- Verificar rechazo, timeout, cierre y ausencia de imágenes huérfanas; el ACK
  sintético solo es diagnóstico y no gobierna la progresión del frame.

**Salida:** contrato de conexión observable en PTY aislado.

### Fase 2 — SHM-only y lifecycle

- Repetir 20 frames 1280×720 con receptor sintético y digest idéntico.
- Confirmar grid una vez por imagen, invalidación por resize/imagen y cleanup.
- Forzar rechazo, timeout y ausencia SHM; confirmar rechazo/stop sin fallback
automático directo/file.
- Confirmar cliente único por servidor, `is_consumed` como completion primaria y
un frame en vuelo más el último pendiente.

**Salida:** evidencia A, no rendimiento físico.

### Fase 3 — geometría y render

- Consultar área pixel y celda por separado con `CSI 14t` y `CSI 16t`.
- Probar límites 1–297 y rechazo explícito fuera de rango.
- Ejecutar escenas de efectos, texto, imágenes, Canvas API, overlays y transforms.

**Salida:** matriz Kitty/Ghostty con golden reconciliado.

### Fase 4 — interacción y lifecycle

- Probar UTF-8, modificadores, function keys, paste, mouse, rueda y focus.
- Probar scroll, drag, overlays, Escape, focus trap, resize, split/join y switch;
  los comandos agrupados antes del frame no equivalen a pixel PASS por operación.
- Probar detach/reattach igual; otro outer exige parar, reiniciar y reprobar.
- Suspender, reanudar y salir normalmente; el test de callback/cleanup ante
  `SIGHUP` ya existe, pero no sustituye la observación física de detach/reattach.

**Salida:** smoke D firmado por combinación terminal/tmux; copy mode documenta placeholders, no pixels ni texto semántico.

### Fase 5 — medición y decisión de optimización posterior (sin implementación aquí)

- Medir bytes, preparación, ACK RTT, compresión, grid, SHM y cleanup.
- No reportar FPS/latencia visible hasta tener evidencia D.
- Comparar A/B solo después de Fases 1–4 y presentar una decisión regional/perf; no es la primera decisión arquitectónica de este informe.

## 7. Criterio de salida y referencias

La matriz SHM batch histórica terminó 47/48 y el focused `theme-form` corregido
pasó; ese agregado cubrió 48 escenas distintas y 124 frames SHM, sin afirmar un
batch limpio 48/48. El snapshot de matriz terminó 50/50, además de los checks;
la corrida cross-route estable del 2026-09-08 terminó 52/52 con 11 oracles,
128 frames directos, 182 frames tmux y 182 objetos SHM. Los checks nativos, de
bordes/tema, texto, inputs, paint y producción PTY enumerados arriba permanecen
como evidencia acotada. La paridad física exhaustiva no está lista mientras falten smoke D de Ghostty,
interacción exhaustiva y lifecycle físico observado; Kitty directo/tmux ya tiene
una revisión humana cualitativa, no una medición pixel a pixel. La integración SHM aprobada ya tiene
PASS por PTY sintético; no se promete velocidad SHM ni visibilidad.

No es necesario esperar UI física para hacer verificables las features: el criterio alternativo es que **todas** tengan checks ejecutables y reproducibles, salida esperada y artefacto registrado, con etiqueta honesta de “pendiente físico”.
La afirmación de paridad visible ya tiene una revisión Kitty cualitativa; una
afirmación pixel a pixel y la cobertura completa requieren observación D adicional.
El objetivo SHM está aprobado y tiene PASS de integración en PTY; quedan Ghostty y
la medición de rendimiento.

Referencias durables:

- [README](../README.md), límites y matriz de terminales.
- [PRD](./PRD.md), excepción experimental y amendment fechado.
- [agent-reference](./agent-reference.md), capabilities y límite interno.
- [guía de tmux](./tmux.md), setup y smoke checklist.
- [auditoría de completitud](./tmux-completion-audit.md), ledger por requisito y familia pública.
- [check de SHM por PTY](../scripts/visual-test/tmux-shm-pty.py) y su
  [fixture de runtime](../scripts/visual-test/tmux-shm-runtime-fixture.ts).
- [escenas visuales](../scripts/visual-test/scenes) y [referencias](../scripts/visual-test/references).

Evidencia efímera del snapshot histórico: `/tmp/vexart-parity-final-tests.log` (515 pass, 0
fail, 77 archivos, 1604 `expect()`), `/tmp/vexart-parity-final-boundaries.log`,
`/tmp/vexart-parity-finish-native.log`,
`/tmp/vexart-border-px-parity.XYaC4F/{borders,theme}`,
`/tmp/vexart-inputs-parity.MO08n1`,
`/tmp/vexart-parity-finish-inputs-negative-final.log`,
`/tmp/vexart-overlay-parity.cHRekH/summary.json`,
`/tmp/vexart-overlay-toast-before-fix.txt`,
`/tmp/vexart-parity-finish-pty.1x5t8X/{normal,reject,timeout}`,
`/tmp/vexart-paint-parity-transform.DrOeKh`,
`/tmp/vexart-paint-negative-final.txt`,
`/tmp/vexart-text-parity-shared-final-1788835901411484000`,
`/tmp/vexart-parity-api.2ddC76`,
`/tmp/vexart-parity-final-matrix.4rdpKx/run/summary.json`,
`/tmp/vexart-parity-final-goldens.log`, `/tmp/vexart-transport-lifecycle.log`.
Evidencia histórica: `/tmp/vexart-shm-final-checks.DsqSz8/tests.log`,
`/tmp/vexart-shm-final-checks.DsqSz8/typecheck-complete.log`,
`/tmp/vexart-shm-final-checks.DsqSz8/scenes-typecheck-complete.log`,
`/tmp/vexart-tmux-rust-tests.log`,
`/tmp/vexart-tmux-feature-parity-1788825845/summary.json` (histórico),
`/tmp/vexart-parity-code-docs-aU3Z`, `/tmp/vexart-tmux-overlay-final-1788826553`,
`/tmp/vexart-theme-focus.0CHIMz/summary.json`, `/tmp/vexart-tmux-audit-visual.log`,
`/tmp/vexart-tmux-goal-visual-regression.log`,
`/tmp/vexart-tmux-audit-gradient-current.png`,
`/tmp/vexart-tmux-audit-dashboard.log`, `/tmp/vexart-tmux-shm-720p.json`.
No se embeben archivos `/tmp` ni se tratan como artefactos durables. Los futuros resultados de smoke físico deben añadirse como actualización fechada, conservando la separación entre protocolo, código, comparación visual y experiencia
observada.
