# Vexart — Kitty visual QA tracker

> Documento vivo de evidencia, no una lista de deseos. Una captura demuestra
> únicamente el estado que aparece en esa captura. Un test headless o un proceso
> vivo no demuestra que un efecto o interacción se vea correctamente en Kitty.

## Alcance y reglas

- Ejemplos mantenidos en el alcance: examples/effects-showcase.tsx y
  examples/void-showcase.tsx.
- examples/showcase-legacy.tsx es review-only/histórico: su inventario se
  conserva para no perder cobertura, pero no es prueba de la API actual.
- examples/facebook-app.tsx queda fuera de alcance por cancelación explícita del
  usuario. No contar sus capturas, tests ni interacciones.
- PASS requiere un caso identificable, evidencia atribuible a la OS window Kitty
  correcta y proceso vivo/stderr vacío cuando aplique.
- SMOKE significa que una vista o región se vio, pero no prueba todos los casos
  contenidos.
- BLOCKED significa que la captura o el input remoto no se puede atribuir con
  seguridad; no convertirlo en PASS ni FAIL de producto.
- OPEN significa evidencia de defecto o resultado aún no aislado.
- HISTORICAL significa evidencia de una pasada anterior, válida para contexto
  pero no para declarar el estado del run actual.
- VISUAL ONLY significa que el control no tiene un cambio observable que
  certifique su handler.

Este update del tracker no lanza Kitty. Las rutas /tmp/... son evidencia recibida
de pasadas anteriores o del run coordinado actual, no capturas producidas por
este documento.

## Protocolo Kitty

La evidencia válida usa una Kitty OS window independiente. El control remoto
envía teclas/mouse al child window y captura sólo su platform_window_id con
screencapture -x -l <id>. No se permite activar la ventana, traerla al
foreground ni usar captura de pantalla completa. Un PNG negro no se descarta
por su color: si la OS window/child window no se puede atribuir, queda BLOCKED;
si queda atribuido y un positive-control conocido sí renderiza en la misma
superficie, queda FAIL/OPEN de producto aunque stderr esté vacío. Si también
fallan el paquete Kitty rojo y kitten icat directos, el caso queda BLOCKED por
la superficie Kitty/WindowServer, no se atribuye a Vexart. Una ráfaga sintética
no sustituye navegación controlada; cada frame se clasifica por atribución,
settlement y positive control observados.

Metadatos históricos de la última pasada: Kitty 0.48.2,
 /Applications/kitty.app, socket /tmp/vexart-kitty-3.sock. No asumen que ese
estado siga vigente; la ventana y los IDs deben revalidarse en cada run.

## Evidencia automatizada y estado del run

| Capa | Estado | Evidencia / interpretación |
| --- | --- | --- |
| TypeScript typecheck — final | AUTOMATED PASS (TS only) | /tmp/vexart-phase17-final-types.log: typecheck passed. No Kitty proof. |
| TypeScript typecheck — prior verified | HISTORICAL | /tmp/vexart-phase17-type-verified.log: typecheck passed before the final frozen run. |
| Rust/native tests — prior baseline | HISTORICAL | /tmp/vexart-phase17-native.log: 157 unit + 1 blur + 3 transform = 161 pass, 0 fail; release build completed. |
| Rust/native tests — retry final | AUTOMATED PASS (native only) | Retry final reports 163 pass, 0 fail: 157 unit + alpha + blur + 3 AA + shadow. Target-premul opacity/AA and shadow tests pass; no Kitty proof. |
| Rust/native tests — prior alpha correction | HISTORICAL | /tmp/vexart-phase17-final-native.log: 162 pass, 0 fail before the retry shadow verification; prior root 161/0 remains historical. |
| Solid reactivity focused | AUTOMATED PASS (TS only) | /tmp/vexart-phase17-reactivity.log: compiler real con --conditions=browser --preload ./solid-plugin.ts, 5/5 tests, 36 assertions. Kitty pendiente. |
| Void interaction smoke — final | AUTOMATED PASS (TS only) | /tmp/vexart-phase17-final-interaction.log: void smoke pass; no Kitty input/presentation proof. |
| Production browser-unit run — retry final | AUTOMATED PASS (TS only) | /tmp/vexart-retry-final-unit.log: 389 pass, 0 fail, 924 assertions across 57 files. This is the latest automated gate; Kitty remains case-scoped. |
| Production browser-unit run — prior final | HISTORICAL | /tmp/vexart-phase17-final-unit.log: 387 pass, 0 fail, 919 assertions; prior 384/0, 379/5, 364/5, and no-plugin 360/4 remain historical. |
| Golden 800×600 — prior exact | HISTORICAL | /tmp/vexart-phase17-golden-aa.log: 480000/480000 pixels before retry shadow correction; the old 0.58% / 2,796-pixel mismatch history is preserved and no reference was mass-refreshed. |
| Golden after native alpha — prior exact | HISTORICAL | /tmp/vexart-phase17-final-golden.log: 480000/480000 before retry shadow correction; do not treat as current after shadow changes. |
| Golden after retry shadow correction | OPEN | /tmp/vexart-retry-final-golden.log: 3858/480000 pixels differ, max delta 78 (0.80%); no reference refresh. Current native/golden reconciliation remains open. |
| Transform/native AA focused | AUTOMATED PASS (native only) | Focused native 3/3 in tests/image_transform.rs (identity/90°/45°); the old golden is historical after retry shadow correction. Kitty C1/C2 remains pending. |
| Full visual suite — phase-start baseline | OPEN/HISTORICAL | /tmp/vexart-phase17-visual-before.log: 2 pass / 39 fail. Preservado como punto de comparación, no como estado actual. |
| Full visual suite — after-AA intermediate | HISTORICAL | /tmp/vexart-phase17-visual-after-aa.log: 3 pass / 38 fail. Preservado para comparar; el run posterior siguió cambiando layout/filter. |
| Full visual suite — prior frozen root | HISTORICAL | /tmp/vexart-phase17-final-visual.log: 2 pass / 39 fail before retry effects/shadow work. |
| Full visual suite — retry final | OPEN | /tmp/vexart-retry-final-visual.log: 2 pass / 39 fail after retry fixes. Remaining failures are unreconciled reference/visual cases; no blanket stale-reference claim. |
| Layout axis-aware FIT/grow | AUTOMATED PASS (TS only) | /tmp/vexart-phase17-layout-root.log: 12 pass, 29 assertions covering explicit FIT/grow fixes. Kitty resize/re-layout proof remains pending. |
| Effects pixel contracts — prior run | AUTOMATED PASS (HISTORICAL native/TS only) | /tmp/vexart-phase17-effects-contracts.log: six groups passed (dense blur, 7 independent filters, rounded mask, solid-fill scissor, group opacity, opacity/gradients/shadow/glow/multishadow/corners). Crop-equivalence and halo clipping were still pending; no Kitty proof. |
| Effects pixel contracts — interim mismatch | HISTORICAL | /tmp/vexart-phase17-effects-root.log recorded 7 pass / 1 fail; an intermediate report showed scrolled shadow color [118,42,63] versus no-scroll [40,66,99]. Superseded by the verified crop-equivalence run below. |
| Effects pixel contracts — verified intermediate | HISTORICAL | /tmp/vexart-phase17-effects-verified.log: all 8 pass, including interior crop equivalence, outside-halo clipping, and positive controls. |
| Effects pixel contracts — retry final | AUTOMATED PASS (native/TS only) | /tmp/vexart-retry-effects-contracts.log: all 8 groups pass, including strong halo, interior crop equivalence, outside-halo clipping, and positive controls. No golden/Kitty equivalence claim. |
| Shadow focused tests — retry final | AUTOMATED PASS (native/TS only) | /tmp/vexart-retry-shadow-tests.log: 13 tests / 93 assertions pass. Current golden mismatch remains separate OPEN evidence. |
| Shadow-band diagnosis | PASS (scoped retry; golden separate) | Native signed ±y tests are correct; pixel repro source green (120,82) changed [34,197,94] → [18,104,50] before the fix because the shader hollow shifted rect and TS `flushAll` painted source before shadow. Native solid-shadow interior/Gaussian-outside fix, tests/shadow.rs, and TS per-node paint order are verified by retry; current golden mismatch remains separate OPEN evidence. |
| Reviewer-confirmed group defect — transformed container + nested filter | AUTOMATED PASS (automated only) | `/tmp/vexart-phase17-final-effects.log` plus exact reviewer rerun closes the transform-loss case; Kitty visual proof remains pending. |
| Reviewer-confirmed group defect — overflow visible children | AUTOMATED PASS (automated only) | `/tmp/vexart-phase17-final-effects.log` plus exact reviewer rerun closes the parent-dimension clipping case; Kitty visual proof remains pending. |
| Reviewer-confirmed group defect — transformed filtered output + scroll | AUTOMATED PASS (automated only) | `/tmp/vexart-phase17-final-effects.log` plus exact reviewer rerun closes the transformed-scissor leak case; Kitty visual proof remains pending. |
| Kitty effects fresh capture | BLOCKED (Kitty surface control) | Las capturas effects (child 29/platform 10876) son negras, pero el paquete Kitty rojo sintético y kitten icat directos también fueron negros en ventanas nuevas 10912/10916. No es prueba de un fallo Vexart; repetir sólo en una ventana con positive control visible. |
| Kitty legacy initial capture | SMOKE/HISTORICAL | /tmp/vexart-phase17-legacy-initial.png es atribuible y sirve para revisar la vista inicial, no para certificar todas sus pestañas. |
| Kitty retry positive control | PASS (Kitty control only) | `/tmp/vexart-retry-positive-11082.png`, platform 11082, red packet rendered with background capture. This recovers the prior surface block but does not certify Vexart cases. |
| Kitty retry effects/interaction | PASS (Kitty scoped) + PARTIAL overall | New window platform 11111/PID 51544: `/tmp/vexart-retry-effects-fixed.png` has no colored shadow bands and real outer glow behind source; `/tmp/vexart-retry-glass-scroll-{before,after}.png` plus wheel×3 exposes Sepia/Hue/Contract. Focus false initially and after Glass scroll, stderr empty. This closes E1/E2/E3/G7-G9 only; it does not certify the full sequence. |
| Kitty void retry | SMOKE/PARTIAL | Void window platform 11097: `/tmp/vexart-phase17-void-retry-{inputs2,display2,collections2,code-docs2,overlays2,typography2}.png` shows six tabs. Dialog open is not verified; transient black captures after input recover in 2–3s and remain OPEN. |
| Kitty final validation | PARTIAL/PENDING | Effects subset is scoped PASS, but void modal/black recovery and remaining cases are open. Legacy window 5 and current effects window 43 are retained; no lock settings changed. Automated final logs do not close presentation/input proof. |
| Performance smoke — phase-start | OPEN/HISTORICAL | /tmp/vexart-phase17-perf-before.json: 1080p p95 15.37ms, dirty 20.12ms, compositor 10.69ms, hover 20.40ms, scroll 10.69ms, no-op 0.004ms. Muestra preliminar. |
| Performance smoke — prior after corrections | HISTORICAL | /tmp/vexart-phase17-perf-after.json: 800×600 p95 6.85ms, 1080p 15.43ms, no-op 0.0022ms, dirty 20.70ms, compositor 10.53ms, hover 20.49ms, scroll 10.39ms. |
| Performance smoke — final | OPEN (targets unmet) | /tmp/vexart-phase17-perf-final.json, 30 warm frames: 800×600 p95 7.43ms (before 6.58, +13%), 1080p 15.22ms (before 15.37), no-op 0.00258ms, dirty 19.97ms, compositor 10.37ms, hover 20.69ms, scroll 10.40ms. PRD targets remain unmet; profile the 800×600 regression; no overall optimization claim. |

## Matriz de ejemplos (estado honesto)

| Ejemplo | Captura atribuible | Qué demuestra | Qué no demuestra | Estado |
| --- | --- | --- | --- | --- |
| effects-showcase.tsx | Retry fixed effects/Glass subset; four tabs visible | `/tmp/vexart-retry-effects-fixed.png` and Glass scroll before/after show no colored shadow bands, outer glow behind source, and Sepia/Hue/Contract exposed after wheel×3 | Focus-safe scoped subset only; Composition/States and remaining exact interactions are not certified | PARTIAL KITTY + SCOPED PASS |
| void-showcase.tsx | Retry six-tab smoke | `/tmp/vexart-phase17-void-retry-{inputs2,display2,collections2,code-docs2,overlays2,typography2}.png` shows all six tabs | Dialog open and transient black recovery remain unverified; no full interaction proof | SMOKE/PARTIAL KITTY |
| showcase-legacy.tsx | vista inicial en /tmp/vexart-phase17-legacy-initial.png | El snapshot review-only puede arrancar y mostrar su vista inicial | No es contrato de la API actual ni certifica sus pestañas restantes | HISTORICAL |
| facebook-app.tsx | ninguna | Nada | Todo | OUT OF SCOPE |

## Inventario finito: effects-showcase.tsx

Este inventario sale del JSX actual. La columna de estado no se infiere del
nombre de la prop: requiere evidencia del caso indicado.

| ID | Caso esperado | Estado actual | Nota |
| --- | --- | --- | --- |
| E1 | shadow de una capa | PASS (Kitty scoped) | `/tmp/vexart-retry-effects-fixed.png` shows no colored band above the single shadow after the native + TS per-node paint-order fix; focus false, stderr empty. Golden remains OPEN separately. |
| E2 | shadow como array/multi-shadow | PASS (Kitty scoped) | Same fixed retry capture shows no colored band above multi-shadow; exact scoped Kitty proof only. |
| E3 | glow exterior | PASS (Kitty scoped) | Fixed retry shows real outer glow behind source; no claim for remaining glow combinations. |
| E4 | gradient linear con ángulo | SMOKE/HISTORICAL | Igual. |
| E5 | gradient radial | SMOKE/HISTORICAL | Igual. |
| E6 | cornerRadii por esquina + opacity | SMOKE/HISTORICAL | Igual. |
| G1 | backdropBlur sobre fondo visible | SMOKE/HISTORICAL | La tarjeta fue corregida para dejar gradiente detrás; falta caso aislado actual. |
| G2 | backdropBrightness | SMOKE/HISTORICAL | No declarar por una diferencia de color no cuantificada. |
| G3 | backdropContrast | SMOKE/HISTORICAL | Swatch independiente en la galería; falta una aserción visual atribuible actual. |
| G4 | backdropSaturate | SMOKE/HISTORICAL | Swatch independiente en la galería; falta una aserción visual atribuible actual. |
| G5 | backdropGrayscale | SMOKE/HISTORICAL | Swatch independiente; falta una aserción visual atribuible al swatch. |
| G6 | backdropInvert | SMOKE/HISTORICAL | Swatch independiente; se observó diferencia histórica, no run actual. |
| G7 | backdropSepia | PASS (Kitty scoped) | `/tmp/vexart-retry-glass-scroll-{before,after}.png`; targeted wheel ×3 exposes Sepia after live `scrollY` gallery fix. |
| G8 | backdropHueRotate | PASS (Kitty scoped) | Same live scroll retry exposes Hue; focus false after scroll and stderr empty. |
| G9 | Filter contract card / stripe-backed swatches | PASS (Kitty scoped) | Same live scroll retry exposes Contract card; not an extra API filter and not a full gallery PASS. |
| C1 | transform.rotate | AUTOMATED PASS (native only) | Native AA focused 3/3; reference regenerada previa no es la prueba. Kitty actual pendiente. |
| C2 | transform.scale + translateY | AUTOMATED PASS (native only) | Native AA focused 3/3; reference regenerada previa no es la prueba. Kitty actual pendiente. |
| C3 | self filter grayscale + contrast | AUTOMATED PASS (TS only) | /tmp/vexart-phase17-self-root.log: 11 tests / 88 assertions. Kitty visual proof remains pending; la captura naranja histórica no se convierte en Kitty PASS. |
| C4 | retained layer + willChange + opacity/glow | SMOKE/HISTORICAL | Composition se vio; no hay prueba aislada de reuse/composite. |
| S1 | Button default/outline: hover, active, focus | PARTIAL | States se vio; no hay matriz de los tres estados con input atribuible. |
| S2 | Box focusable: hover, active, focusStyle | PARTIAL | El box alternó históricamente; cobertura de cada pseudoestado abierta. |
| S3 | Press mouse dos veces y contador 0→2 | PASS (Kitty partial) | Retry states shows actual mouse press 0→1 in `/tmp/vexart-retry-states-press.png`; the second-press 0→2 sequence remains unverified. |
| S4 | Arm comparte señal con Button y Box; re-layout same-frame | PASS (Kitty partial) | `/tmp/vexart-retry-states-arm.png` shows Arm→Armed and Box Enabled green; focus returned false for States, so full background-safe sequence remains pending. |

Conclusión de la galería: 4/4 es sólo smoke de vistas históricas. No es 23/23
efectos/estados. E1/E2/E3 y G7-G9 tienen PASS Kitty scoped en la retry window,
pero C3 sólo tiene regresión automatizada (11/88), States/Composition y el
resto de casos aún no tienen proof exacta; el retry no convierte la galería en
PASS total ni resuelve el golden 0.80% mismatch.

## Inventario finito: void-showcase.tsx

Los siguientes 25 casos se derivan de los handlers y controles presentes en el
ejemplo.

| ID | Tab / caso | Estado actual | Evidencia o bloqueo |
| --- | --- | --- | --- |
| V1 | navegación a Inputs, Display, Collections, Code & Docs, Overlays, Typography | SMOKE (Kitty scoped) | Void retry captures show all 6 tabs; exact interaction cases remain separate. |
| V2 | VoidInput: escribir texto | PASS (HISTORICAL) | xyz visible en captura dirigida. |
| V3 | VoidTextarea: multilinea, cursor, delete/backspace | AUTOMATED SMOKE (TS only) | La secuencia automatizada cubre multilinea, cursor y delete/backspace; falta Kitty input/capture atribuible. |
| V4 | Checkbox mutable Enable notifications | PASS (HISTORICAL) | Toggle visible en captura dirigida. |
| V5 | Checkbox estático Marketing emails | VISUAL ONLY | No tiene onChange; no hay interacción esperada. |
| V6 | Switch mutable Dark mode | PASS (HISTORICAL) | Toggle visible. |
| V7 | Switch estático Auto-save | VISUAL ONLY | No tiene onChange; no hay interacción esperada. |
| V8 | RadioGroup seleccionar Option B | PASS (HISTORICAL) | Selección visible. |
| V9 | Select abrir menú y elegir Rust | PASS (HISTORICAL) | Secuencia dirigida visible. |
| V10 | Combobox escribir filtro sin resultados | PASS (HISTORICAL) | Query sin resultados visible; elegir una opción queda abierto. |
| V11 | Slider 42→86 | PASS (HISTORICAL) | Cambio visible en captura dirigida. |
| V12 | Button variants default/secondary/outline/ghost/destructive | VISUAL ONLY | Handlers vacíos; sólo apariencia. |
| V13 | Button sizes xs/sm/default/lg | VISUAL ONLY | Sólo apariencia. |
| V14 | Card footer Cancel/Save | VISUAL ONLY | Handlers vacíos; sólo apariencia. |
| V15 | List teclado: seleccionar Settings | PASS (HISTORICAL) | Captura dirigida. |
| V16 | List mouse: seleccionar Notifications | PASS (HISTORICAL) | Captura dirigida. |
| V17 | ScrollView wheel y scrollbar | PASS (HISTORICAL) | /tmp/vexart-fix-scroll-after.png. |
| V18 | Table click row 5 | PASS (HISTORICAL) | Captura de click dirigida. |
| V19 | Table Tab + Down | AUTOMATED PASS (TS only) | El gate retry final `/tmp/vexart-retry-final-unit.log` está 389/0; el conflicto de teclado Kitty histórico sigue sin captura atribuible. |
| V20 | Code/Diff/Markdown render | PASS (HISTORICAL SMOKE) | Región visible; no es interacción. |
| V21 | Open Dialog y mantener overlay cerrado | SMOKE/HISTORICAL | El botón Open Dialog es visible en /tmp/vexart-fix-final-overlays.png; no prueba abrir/interactuar con el modal. |
| V22 | Dialog abierto; Cancel/Delete cierran | OPEN (Kitty; automated pass) | `/tmp/vexart-phase17-final-overlay.log` named dialog-layout/top-modal group passes, but retry did not verify the dialog open state; transient black captures after input recover in 2–3s and remain undismissed. |
| V23 | Escape cierra el dialog superior | AUTOMATED PASS (TS only) | Final overlay groups include dropdown-items Escape/select; falta captura background-safe con modal abierto. |
| V24 | Toast success/error/info | UNVERIFIED | Handlers existen; no hay captura atribuible de cada variante. |
| V25 | Tooltip en Button y Badge por hover | AUTOMATED PASS (TS only) | Final overlay verification covers all 8 tooltip placement cases on the first frame, including popover anchor; Kitty hover/capture remains pending. |

Los tres registros de defectos de grupo en la tabla de evidencia son hallazgos
confirmados por revisión, no tres API functions ni IDs adicionales del gate:
ahora tienen una corrección automatizada, pero aún requieren Kitty proof.

## Casos globales de runtime

Los 48 rows anteriores son los casos source-derived de las dos galerías,
incluido el Filter contract card de Glass. Estos dos casos globales completan el
gate Phase 17 (50 case IDs en total); no son 50 API functions: son casos de
evidencia, y algunos pueden ejercitar una misma familia de render o handler.

| ID | Caso global | Estado actual | Evidencia o bloqueo |
| --- | --- | --- | --- |
| R1 | Resize 166×49 → 128×46 → 166×49 y re-layout visual estable | BLOCKED | La geometría cambió en una prueba, pero capturas posteriores fueron negras sin atribución válida. |
| N1 | Navegación rápida entre tabs sin frame negro, RangeError o stack overflow | AUTOMATED PASS (TS only) + BLOCKED Kitty | Root reports 100 right/tab cycles without stack overflow; current Kitty black frame remains BLOCKED by the red/icat positive-control surface failure. Keep the historical RangeError separate from the presentation block. |

Hallazgos globales: R1 y N1 permanecen separados de los 48 rows source-derived.
Resize 166×49 ↔ 128×46 cambió geometría en una prueba, pero las capturas
posteriores fueron negras (BLOCKED); no certificar re-layout visual. Tab +
escritura ya cubre 100 ciclos sin stack overflow en automatización, pero el
frame negro actual sigue BLOCKED por el positive control físico Kitty y no se
convierte en un FAIL de producto.

## Inventario review-only: showcase-legacy.tsx

El snapshot histórico tiene estas áreas fuente, todas HISTORICAL/SOURCE ONLY hasta
que una prueba actual las aísle:

1. Visual Effects: presets/custom/multi-shadow, cuatro glows, gradients
   linear/radial, cuatro combinaciones de per-corner, shadow+glow combinado.
2. Backdrop Filters: blur, brightness, contrast, grayscale, invert, sepia,
   hue-rotate, combinación blur+brightness+saturate y cuatro niveles de opacity.
3. Interactive: hover/active/focus, press counter/reset, dialog overlay y
   botones de acción, transition y spring.
4. Forms: input, combobox, slider y submit/reset de createForm.
5. Data/Virtual: query/refetch, selección de VirtualList y tablas/listas.
6. Void Theme: theme toggle, variantes/tamaños/disabled de Button, card,
   upload/progress y skeleton.
7. Event Bubbling: parent bubble, stopPropagation, bubble desde Button y clear log.

Esto conserva la cobertura esperada sin presentar el snapshot como suite actual ni
mezclarlo con la galería mantenida.

## Bloqueos y criterios para cerrar

1. Completar Kitty proof para C3 (self grayscale) después de su regresión TS
   de 11 tests / 88 assertions; no elevarlo a visual PASS por automatización.
2. El retry tiene positive control rojo PASS y cierra E1/E2/E3/G7-G9 en alcance
   exacto; repetir effects/N1 restante sólo en una secuencia cuya focus
   attribution sea uniformemente background-safe. N1 stack-overflow está cubierto
   por 100 ciclos; su frame negro anterior queda separado del retry parcial.
3. Repetir V3 Textarea, V19 Table keyboard, V22 modal, V24 toast, V25 tooltip y
   resize con una sola OS window background-safe por caso; los 4 tabs visibles no
   sustituyen esa atribución.
4. Mantener el gate browser retry final 389/0 como automatizado y no convertirlo
   en PASS Kitty; los runs previos 387/0, 384/0 y 379/5 quedan trazables y los casos visuales
   de Tabs/List/Table aún requieren secuencias Kitty exactas.
5. El golden exacto 480000/480000 es histórico tras el retry shadow correction:
   `/tmp/vexart-retry-final-golden.log` queda OPEN en 3858 diferencias (0.80%),
   sin refresco de referencia. Conservar ambas evidencias y completar Kitty C1/C2.
6. Cambiar un estado a PASS sólo con evidencia del caso exacto; un screenshot de
   una tab no cierra su inventario completo.
7. El run final de visual suite queda OPEN en 2/39: reconciliar fallos y
   referencias caso por caso, sin asumir que todos son stale.
8. Performance queda OPEN: el smoke final pierde 13% en 800×600 y no cumple
   los objetivos PRD; perfilar antes de cualquier claim de optimización.
9. E1/E2/E3 y G7-G9 tienen PASS Kitty scoped tras la corrección nativa/TS y el
   scroll live; conservar el alcance exacto y no convertirlo en PASS total de la
   galería mientras el golden y los casos restantes estén abiertos.
10. V22 dialog open sigue OPEN: la automatización pasa, pero Kitty no verificó
    apertura/cierre y los frames negros post-input sólo recuperaron en 2–3s.

## Evidencia y rollback

Las capturas temporales viven fuera del repositorio. Las referencias versionadas
de transform son scripts/visual-test/references/effects-transform-rotate.png y
effects-transform-scale.png. No regenerar referencias masivamente ni borrar
artefactos para mejorar porcentajes.

Si una corrección del engine empeora Kitty, el rollback debe ser el cambio
acotado que introdujo la regresión (o git revert del commit correspondiente),
preservando referencias y capturas para comparar. Para cada rollback repetir
typecheck, tests enfocados y una captura Kitty atribuible del caso afectado.

Última actualización: 2026-09-07; inventario actualizado con baseline Phase 17.
