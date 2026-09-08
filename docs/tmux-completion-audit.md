# Auditoría de completitud tmux

**Fecha:** 2026-09-08
**Estado:** la paridad Kitty solicitada está verificada; este inventario conserva
los límites de auditoría fuera de ese cierre.

Esta auditoría cruza los requisitos del [PRD](./PRD.md), el límite de
[arquitectura](./ARCHITECTURE.md), los exports públicos y sus tests fuente. El
snapshot automatizado del 2026-09-07 se conserva como evidencia histórica. La
revisión humana actual confirma las seis pestañas del showcase en Kitty directo y
dentro de tmux de forma cualitativa; no es medición pixel a pixel, no cubre todas
las permutaciones de interacción y no verifica Ghostty/FPS. La denegación de CUA
para Kitty (`net.kovidgoyal.kitty`) y Ghostty pertenece al intento histórico; no
hubo workaround.

## Estado actual — 2026-09-08

- La paridad Kitty solicitada está verificada. El usuario aprobó recuperación
  automática SHM (pausar sin cliente y reenviar el último frame al reconectar),
  sin cambios de configuración; el ciclo real ya tiene PASS.
- `/tmp/vexart-lifecycle-production-final.59302.1064` verifica 8 nombres SHM,
  incluido producer-only perdido, reconexión en el mismo TTY, frame fresco y
  geometría. La evidencia PTY de cleanup está en
  `/tmp/vexart-shm-review-lifecycle.1788868930.74725.20121`; no es un log de
  focused unit tests. Normal/reject/timeout pasan en serie y el negativo falla
  como espera; los gates finales de orden pasan en
  `/tmp/vexart-shm-runner-final-normal.1788869766.95269.19333` y
  `/tmp/vexart-shm-runner-final-lifecycle.1788869768.95269.5837`. La corrida serial
  final de cuatro modos pasa en `/tmp/vexart-resumed-final-pty.0Hc1os/`:
  normal 6 uploads/7 SHM/2 deletes; lifecycle 6 uploads/8 SHM/1 delete en el
  mismo TTY; reject/timeout 1 upload/2 SHM/1 delete cada uno, con FAIL esperado
  del productor. Los errores de cleanup se exponen; esto no garantiza la
  eliminación si falla la escritura hacia la terminal. El repro FAIL
  anterior `/tmp/vexart-lifecycle.33464.2337` queda histórico.
- Kitty normal y tmux comparten escena, layout, GPU y componentes; tmux añade
  transporte/presentación SHM y lifecycle. Collections y ScrollView están verdes
  tras ordenar solo `scissorLayers`, con imagen final
  `/tmp/vexart-collections-parity-scrollfix-final-1788868047588501000` y 2 checks
  de fondo de scroll PASS en `/tmp/vexart-scroll-background-final-1788870228543.log`.
  El Button estable corrige el livelock compartido; el overlay styled offscreen
  tiene 2 PASS y 5 expectativas negativas, con imagen revisada en
  `/tmp/vexart-styled-overlays-final.png`. El focused native estricto de
  ownership también pasa 1/1 en
  `/tmp/vexart-styled-overlays-ownership-green-1788870121501`, tras corregir
  [`native-presentation-ops.ts`](../packages/engine/src/ffi/native-presentation-ops.ts)
  para rastrear solo layer IDs publicados; el fallo directo previo queda en
  `/tmp/vexart-styled-overlays-final-matrix`.
- Unicode queda verde para `é`/`😀` (9 PASS/114 expectativas, parser 32,
  keyboard 35); no se afirma completitud de grapheme, IME, mouse ni navegación
  vertical. La suite actual terminó 539 PASS/0 FAIL/82 archivos/1781 expectativas
  en `/tmp/vexart-resumed-stable-tests.log`; main TSC y scripts TSC pasan en
  `/tmp/vexart-resumed-final-typecheck.log` y
  `/tmp/vexart-resumed-stable-scripts-tsc.log`. La corrida cross-route estable
  terminó **52/52 PASS, 0 FAIL** en `/tmp/vexart-resumed-stable-matrix.nZ3get/run`,
  con 41 escenas `differential-only` y 11 `differential-plus-oracle`, 128 frames
  directos, 182 frames tmux y 182 objetos SHM; las tres comparaciones son exactas
  en las 52 escenas. La auditoría está en
  `/tmp/vexart-resumed-stable-matrix-audit.json`. La corrida previa 51/52 queda
  como investigación histórica de settling. Ese run tuvo un mismatch de 9066
  diferencias de bytes de canal
  (=3022 pixels), bbox `[41,216,141,251]`, solo en Button. Ambos oracles y ambas
  comparaciones readback eran exactos, sin corrupción de transporte. El pulso
  intencional pressed/focus de 100 ms fue capturado en momentos distintos. Tras
  esperar 120 ms y un frame luego de Escape, dos focused native parity pasan con
  SHA idéntico en `/tmp/vexart-styled-overlay-settled-matrix-{1,2}` y focused
  tests pasan 2/2 en `/tmp/vexart-styled-focused-after-settle.log`; scripts TSC
  sigue PASS. Ese repro queda como investigación histórica de settling. 42 hashes
  golden pasan en
  `/tmp/vexart-resumed-final-golden-hashes.log` sin regenerarse y boundary conserva
  5 violaciones conocidas en `/tmp/vexart-resumed-final-boundaries.log`.

## Cómo leer el ledger

- **Autoridad:** el requisito/documento y el test o fuente que puede probarlo;
  un export aislado no prueba comportamiento.
- **Cobertura registrada:** solo resultados ya observados. La matriz estable 52/52 es
  paridad diferencial automatizada (41 `differential-only`, 11
  `differential-plus-oracle`); el snapshot 50/50 queda histórico. Ninguna de
  las dos cifras implica finalización del producto ni cobertura semántica de todas
  las APIs.
- **Estado:** `PROBADO` significa probado en la capa indicada; `PARCIAL`
  conserva un hueco explícito; `FALTA` requiere evidencia; `CONTRADICHO`
  identifica una discrepancia entre requisito y fuente/resultado.

**Diagnóstico de presentación:** [`terminal-transport-matrix.ts`](../scripts/terminal-transport-matrix.ts) ahora selecciona `kittyPlaceholder` para tmux y `kittyGraphics` para Kitty directo mediante `canCreateRenderLoop`; el predicado real tiene focused test en [`terminal-transport-matrix.test.ts`](../scripts/terminal-transport-matrix.test.ts) y el CLI estático pasa. `afterLoopEnabled` solo refleja la bandera posterior al constructor: no prueba que exista un frame ni que haya presentación física. La evidencia autoritativa sigue siendo el PTY SHM y, cuando exista, el smoke físico.

## Ledger por requisito y familia pública

| Requisito/familia | Evidencia autoritativa | Cobertura registrada exacta | Estado y prioridad |
| --- | --- | --- | --- |
| **Seam TS → Rust y tmux SHM-only** | [PRD §5.1 tmux](./PRD.md#tmux-presentation-experimental); [`tmux-shm.test.ts`](../packages/engine/src/terminal/tmux-shm.test.ts), [`tmux-shm-presentation.test.ts`](../packages/engine/src/ffi/tmux-shm-presentation.test.ts), [`tmux-shm-pty.py`](../scripts/visual-test/tmux-shm-pty.py) | PTY tmux 3.6a serial normal/reject/timeout PASS; lifecycle real PASS con 8 nombres SHM y reconexión/fresh frame/geometry. Matriz estable: 52/52, 128 frames directos, 182 tmux y 182 objetos SHM; 41 differential-only y 11 differential-plus-oracle. El snapshot histórico conserva 50/50, 99/145/145. | **PARCIAL:** protocolo, ownership y lifecycle automatizados probados; revisión Kitty directo/tmux cualitativa confirmada, pero no prueba Ghostty, todas las versiones tmux, medición pixel a pixel ni FPS. **P1** |
| **Primitivas, Flexily, layout, hit-testing, scroll** | [PRD §5.1 primitives](./PRD.md#primitives-vexartprimitives); [`layout.test.ts`](../packages/engine/src/loop/layout.test.ts), [`layout-adapter.test.ts`](../packages/engine/src/loop/layout-adapter.test.ts), [`walk-tree.test.ts`](../packages/engine/src/loop/walk-tree.test.ts), [`composite-scroll.test.ts`](../packages/engine/src/loop/composite-scroll.test.ts) | Las 41 escenas base + 9 focused tienen paridad diferencial; `primitives-scroll` es diferencial-only; scroll/wheel aparece en [`tmux-interaction.test.tsx`](../scripts/visual-test/tmux-interaction.test.tsx). Resize/split/join se agrupan antes del frame, no son pixel PASS separados. | **PARCIAL:** geometría y scroll tienen checks offscreen, pero no hay smoke físico ni prueba exhaustiva de props. **P1** |
| **Intrinsics y límite de paquete** | El PRD histórico nombra `@vexart/primitives`; la fuente actual expone [`Box`/`Text` desde app`](../packages/app/src/components/primitives.tsx) y [`app/public.ts`](../packages/app/src/public.ts); el árbol no contiene `packages/primitives`. | Las escenas de primitives y layout están en la matriz diferencial; la propiedad vigente es TS/engine + helpers de app. | **FUERA DE ESTE CIERRE:** PRD/API docs y árbol actual requieren reconciliación de nombres; no es una brecha nueva de transporte tmux. |
| **Efectos WGPU: bordes, radios, gradientes, sombras, glow, opacity, transforms, clip/filter** | [PRD visual effects](./PRD.md#visual-effects); [`paint.test.ts`](../packages/engine/src/loop/paint.test.ts), [`effects-paint-order.test.ts`](../packages/engine/src/testing/effects-paint-order.test.ts), [`self-filter.test.ts`](../packages/engine/src/testing/self-filter.test.ts), [`paint-features.tsx`](../scripts/visual-test/tmux-scenes/paint-features.tsx) | `paint-features` PASS directo/tmux/readback y 7 grupos deshabilitados rechazados por oracle; corrección de borde 1 px conservada. | **PARCIAL:** focused/oracles prueban un subconjunto; las 42 referencias golden siguen sin regenerar y su revisión separa 20 divergencias de contenido/paint, 19 causas no aisladas y 2 PASS. **P1** |
| **Gradientes multi-stop** | PRD §5.1 promete multi-stop; [`GradientConfig`](../packages/engine/src/ffi/node.ts) actualmente expone `from`/`to`; `paint-features` prueba 2 stops. | Solo 2-stop lineal/radial en escena y matriz. | **FUERA DE ESTE CIERRE:** la redacción del PRD y la forma actual no coinciden; requiere una decisión de alcance separada, no una atribución de regresión tmux. |
| **Texto, Code, Markdown, Diff y whitespace** | [`text-whitespace.test.ts`](../packages/engine/src/testing/text-whitespace.test.ts), [`content.test.tsx`](../packages/headless/src/display/content.test.tsx), [`code-docs.tsx`](../scripts/visual-test/tmux-scenes/code-docs.tsx), [`text-offset.ts`](../packages/headless/src/inputs/text-offset.ts), [`input.tsx`](../packages/headless/src/inputs/input.tsx), [`textarea.tsx`](../packages/headless/src/inputs/textarea.tsx), [`tmux-interaction.test.tsx`](../scripts/visual-test/tmux-interaction.test.tsx) | 6 casos engine (whiteSpace/wordBreak, hard-break, constrained-wrap, keep-all, clip, reactive repaint) pasan en la suite; focused compartido prueba Code indent, límites Markdown y Diff gutter. Unicode montado CSI-u/modifyOtherKeys queda verde: 9 PASS/114 expectativas en `/tmp/vexart-astral-green-final.log`, parser 32 PASS, keyboard 35 PASS y typecheck principal PASS; cubre inserción, navegación, borrado y selección de `é`/`😀` en dos variantes de capability. | **PROBADO offscreen / FALTA físico:** `text-offset`/Input/Textarea usan `e.char.length` y límites de codepoint UTF-16; no se afirma completitud de grapheme, IME, mouse ni navegación vertical, y no hay texto visible probado en Kitty/Ghostty. Los repros rojos previos (`/tmp/vexart-astral-red.log`, `/tmp/vexart-astral-red2.log`) quedan como regresiones corregidas. **P1** |
| **Images, `<img>` y Canvas** | [`canvas-image.test.ts`](../packages/engine/src/testing/canvas-image.test.ts), [`canvas-rasterizer.test.ts`](../packages/engine/src/ffi/canvas-rasterizer.test.ts), [`native-image-assets.test.ts`](../packages/engine/src/ffi/native-image-assets.test.ts), escenas [`canvas-api`](../scripts/visual-test/tmux-scenes/canvas-api.tsx) / [`image-decode`](../scripts/visual-test/tmux-scenes/image-decode.tsx) | `canvas-api` e `image-decode` están entre los 9 focused oracle; Canvas readback y assets tienen tests nativos/TS. | **PARCIAL:** decode/drawImage y rutas automatizadas cubiertos; no smoke físico, ni prueba de todas las formas Canvas/recursos. **P1** |
| **Headless inputs:** Button, Checkbox, Switch, RadioGroup, Input, Textarea, Slider, Select y Combobox | Exports en [`headless/public.ts`](../packages/headless/src/public.ts); [`input.test.ts`](../packages/headless/src/inputs/input.test.ts), [`slider.test.ts`](../packages/headless/src/inputs/slider.test.ts), fixture [`inputs-interaction.tsx`](../scripts/visual-test/tmux-scenes/inputs-interaction.tsx) | Fixture final cubre 8 controles styled (Input, Textarea, Checkbox, Switch, Radio, Slider, Select, Combobox) con callbacks y paridad; typecheck PASS. El negativo rechaza 9/9 marcadores en copias del buffer, sin afirmar resource cleanup. | **PARCIAL:** Button no está en ese fixture; Input/Slider son los únicos unit tests headless dedicados; faltan montajes de teclado/mouse para toda la familia y smoke físico. **P1** |
| **Keyboard, mouse, focus, paste, pointer capture y drag** | [`parser.test.ts`](../packages/engine/src/input/parser.test.ts), [`keyboard.test.ts`](../packages/engine/src/input/keyboard.test.ts), [`mouse.test.ts`](../packages/engine/src/input/mouse.test.ts), [`drag.ts`](../packages/engine/src/reconciler/drag.ts), [`tmux-interaction.test.tsx`](../scripts/visual-test/tmux-interaction.test.tsx) | La integración actual de Unicode registra 9 casos/114 expectativas en `/tmp/vexart-astral-green-final.log`, además de parser 32 y keyboard 35; cubre `é`/`😀`, navegación, borrado y selección por límites UTF-16. El fixture histórico de tmux tiene 7 casos/60 expectativas: Tab/Shift-Tab, UTF-8 fragmentado, paste, Dialog, captura SGR de click/drag y wheel. | **PROBADO automatizado / FALTA físico:** la tabla antigua no reflejaba el test de drag existente y debe tratarse como corregida; no se afirma completitud de grapheme, IME, mouse o navegación vertical ni hay prueba de eventos en terminal externo real. **P1** |
| **Display headless:** Code, Markdown, ProgressBar | Exports en [`headless/public.ts`](../packages/headless/src/public.ts); [`content.test.tsx`](../packages/headless/src/display/content.test.tsx), escenas Code/Docs y showcase. | Code/Markdown/Diff focused PASS; Progress aparece en escenas base/showcase y matriz. | **PARCIAL:** contenido y oracles acotados; no hay test unitario específico de Progress ni smoke físico del showcase. **P2** |
| **Containers/collections:** OverlayRoot, Portal, ScrollView, Tabs, List, Table, VirtualList | Exports en [`headless/public.ts`](../packages/headless/src/public.ts); [`list.tsx`](../packages/headless/src/collections/list.tsx), [`table.tsx`](../packages/headless/src/collections/table.tsx), [`VoidList`](../packages/styled/src/components/list.tsx), [`VoidTable`](../packages/styled/src/components/table.tsx), [`tabs.test.tsx`](../packages/headless/src/containers/tabs.test.tsx), [`list.test.tsx`](../packages/headless/src/collections/list.test.tsx), [`table.test.tsx`](../packages/headless/src/collections/table.test.tsx), [`virtual-list.test.ts`](../packages/headless/src/collections/virtual-list.test.ts), [`tmux-collections.test.tsx`](../scripts/visual-test/tmux-collections.test.tsx) | Tabs/List/Table prueban foco/selección/montaje; VirtualList prueba ventana; escenas de scroll están verificadas tras ordenar solo `scissorLayers`; focused 3/3 y parity 1/1 en `/tmp/vexart-collections-parity-scrollfix-final-1788868047588501000`. Getters reactivos y nodos estables conservan estado. | **PARCIAL:** OverlayRoot/Portal y ScrollView aún no tienen aquí test unitario dedicado; no hay smoke físico ni semántica exhaustiva de callbacks. **P2** |
| **Overlays headless:** Dialog, Tooltip, Popover, createToaster | [`dialog.test.ts`](../packages/headless/src/overlays/dialog.test.ts), [`overlays-verification.tsx`](../scripts/visual-test/tmux-scenes/overlays-verification.tsx), [`tmux-interaction.test.tsx`](../scripts/visual-test/tmux-interaction.test.tsx) | Focused overlay PASS para una escena bottom-right; 6 posiciones × 2 variantes y Dialog Escape/unmount/foco en 7 casos/60 expectativas; Toast usa `width="fit"`. | **PARCIAL:** automatizado probado en esas superficies; revisión Kitty cualitativa confirmada, pero no UI Ghostty, medición pixel a pixel ni todas las variantes/posiciones como escena visual. **P1** |
| **Forms:** createForm y validación/dirty/touched/submit | [`form.ts`](../packages/headless/src/forms/form.tsx), [`form.test.ts`](../packages/headless/src/forms/form.test.ts), [`theme-form.tsx`](../scripts/visual-test/tmux-scenes/theme-form.tsx) | Unit test de igualdad estructural y focused theme-form cubre dirty/touched/errors/submit, dark→light y foco. | **PARCIAL:** contrato acotado probado; no integración física ni exhaustividad de validadores async. **P2** |
| **Styled tokens, theme y typography** | Exports en [`styled/public.ts`](../packages/styled/src/public.ts); [`theme.test.ts`](../packages/styled/src/theme/theme.test.ts), escenas [`theming-cards`](../scripts/visual-test/scenes/theming-cards.tsx) / [`theming-typography`](../scripts/visual-test/scenes/theming-typography.tsx) | Tokens/theme aparecen en el snapshot de matriz; theme-form prueba cambio dark→light; typography tiene escena diferencial. | **PARCIAL:** la matriz estable 52/52 no demuestra todos los tokens ni callback/runtime de cada export; Ghostty, medición pixel a pixel y smoke exhaustivo siguen pendientes. **P2** |
| **Styled components** (Avatar/Badge/Button/Card, Void* inputs, lists/tables/tabs, code/docs/diff, overlays) | Exports en [`styled/public.ts`](../packages/styled/src/public.ts); Button headless estable en [`button.tsx`](../packages/headless/src/inputs/button.tsx); tests [`button.test.tsx`](../packages/styled/src/components/button.test.tsx), [`card.test.tsx`](../packages/styled/src/components/card.test.tsx), [`theme.test.ts`](../packages/styled/src/theme/theme.test.ts), [`tmux-styled-overlays.test.tsx`](../scripts/visual-test/tmux-styled-overlays.test.tsx), [`styled-overlays-interaction.tsx`](../scripts/visual-test/tmux-scenes/styled-overlays-interaction.tsx) y showcase. | El fixture de inputs cubre 8 wrappers; Button/Card tienen unit tests. El render estable por getters corrige el livelock cerrado (`/tmp/vexart-button-stable-green.log`); un regression focused montado de dos Buttons suma 4 PASS (focus away/back, callback de press, reset a 120 ms e identidad visual); el overlay offscreen tiene 2 PASS y 5 expectativas negativas, con imagen revisada en `/tmp/vexart-styled-overlays-final.png`; el focused native estricto de ownership pasa 1/1 en `/tmp/vexart-styled-overlays-ownership-green-1788870121501`. La corrida cross-route estable de 52 escenas termina 52/52 PASS; 41 son differential-only y 11 differential-plus-oracle, con todas las comparaciones exactas. | **PARCIAL:** el gate native de ownership directo pasa y Kitty fue revisado cualitativamente, pero no existe interacción dedicada para cada export styled ni verificación Ghostty/pixel-exact/FPS. **P1** |
| **Navigation / Router / Route / NavigationStack / Diff** | PRD §5.1 lista esos conceptos; [`headless/public.ts`](../packages/headless/src/public.ts) exporta `Diff`, no Router/Route/NavigationStack; los tests de router viven en [`app/src/router`](../packages/app/src/router/router.test.ts). | Diff tiene focused de content/gutter; el router de app tiene tests separados. | **FUERA DE ESTE CIERRE:** la lista del PRD no coincide con el barrel público headless; requiere una decisión separada de API/documentación, no una implementación automática para paridad tmux. |
| **createTerminal, lifecycle y recursos SHM** | [`lifecycle.test.ts`](../packages/engine/src/terminal/lifecycle.test.ts), [`transport-lifecycle.test.ts`](../packages/engine/src/terminal/transport-lifecycle.test.ts), [`focus-cleanup.test.ts`](../packages/engine/src/reconciler/focus-cleanup.test.ts), PTY fixture. | 4 focused transport-lifecycle tests PASS; lifecycle real `/tmp/vexart-lifecycle-production-final.59302.1064` PASS con 8 nombres SHM incluido producer-only perdido, mismo TTY, frame fresco y geometría. La evidencia PTY de cleanup está en `/tmp/vexart-shm-review-lifecycle.1788868930.74725.20121` y no se etiqueta como corrida de focused unit tests. Corrida serial final de cuatro modos PASS en `/tmp/vexart-resumed-final-pty.0Hc1os/`; los errores de cleanup se exponen, pero no se garantiza eliminación ante fallo de escritura. | **PARCIAL / FALTA físico exhaustivo:** recuperación automática SHM aprobada y verificada en automatización; ownership directo validado por separado; Kitty tiene revisión visual cualitativa, pero no hay smoke Ghostty, medición pixel a pixel ni FPS. **P0** |
| **App runtime, router, manifest y CLI** | Exports en [`app/public.ts`](../packages/app/src/public.ts); tests [`router.test.ts`](../packages/app/src/router/router.test.ts), [`router-reactive.test.ts`](../packages/app/src/router/router-reactive.test.ts), [`manifest.test.ts`](../packages/app/src/router/manifest.test.ts), [`cli/index.test.ts`](../packages/app/src/cli/index.test.ts). | Los tests de app están incluidos en la suite del snapshot histórico (515); no hay escena tmux que pruebe routing/CLI montado. | **PARCIAL:** contratos app automatizados, pero integración visual/terminal y navegación multi-route no están en esta matriz. **P2** |
| **Engine avanzado:** animación, data, extmarks, selección, font/MSDF y scheduler | [`engine/public.ts`](../packages/engine/src/public.ts); tests [`animation.test.ts`](../packages/engine/src/loop/animation.test.ts), [`extmarks.test.ts`](../packages/engine/src/reconciler/extmarks.test.ts), [`scheduler/index.test.ts`](../packages/engine/src/scheduler/index.test.ts), [`text-layout.test.ts`](../packages/engine/src/ffi/text-layout.test.ts). | La suite root los ejecuta; la matriz estable 52/52 no es un oracle exhaustivo de estas APIs. | **PARCIAL:** hay pruebas unitarias internas, pero falta evidencia tmux específica y no se afirma rendimiento de animación/MSDF. **P2** |
| **Public API/type contract** | Barrels [`engine/public.ts`](../packages/engine/src/public.ts), [`headless/public.ts`](../packages/headless/src/public.ts), [`styled/public.ts`](../packages/styled/src/public.ts); API extractor aislada `/tmp/vexart-parity-api.2ddC76`. | La suite reanudada registra 523 PASS/0 FAIL/78 archivos/1707 `expect()` en `/tmp/vexart-resumed-tests.log`; main TSC y scripts TSC pasan en los logs `resumed`; extractor aislado PASS con warnings y excluye `@internal`. | **PARCIAL:** no afirmar `api:check` global limpio; falta mapear cada export a un test de tipos/comportamiento. El conteo de suite precede al cambio de lifecycle de producción. **P1** |
| **Visual goldens** | [PRD §7.2](./PRD.md#visual-regression), referencias [`scripts/visual-test/references`](../scripts/visual-test/references), log `/tmp/vexart-parity-final-goldens.log`. | Las 42 referencias permanecen sin regenerar y pasan verificación de hash en `/tmp/vexart-resumed-final-golden-hashes.log`; la revisión compare-only separa 20 divergencias de contenido/paint, 19 causas no aisladas y 2 PASS. Linear/radial compara 1 de 3 paneles; List width 100% mide 194 frente a 105; panel post-fix de 1 px confirmado. | **ABIERTO:** no se etiqueta todo como stale, no se regeneran referencias y 19 causas siguen sin aislar. **P1** |
| **Physical terminal and performance gates** | [PRD §7.3–7.4](./PRD.md#performance), checklist de [`tmux.md`](./tmux.md). | Lifecycle y PTY/receptor sintético tienen PASS automatizado; la revisión humana confirma visualmente las seis pestañas en Kitty directo y dentro de tmux, sin medición pixel a pixel. | **PARCIAL:** Ghostty físico, FPS/latencia, medición pixel a pixel y verificación exhaustiva por terminal externo. **P0** |

## Prioridades de auditoría adicional — fuera del cierre Kitty

1. **P0 — evidencia D restante:** completar el smoke humano en Ghostty dentro de
   tmux y, si se requiere, registrar outer/version/passthrough y separar
   visibilidad de ACK/readback. La revisión Kitty directo/tmux ya está registrada
   como cualitativa y no pixel a pixel.
2. **P1 — familias interactivas y documentación:** ampliar los casos por export
   más allá de los checks ya verificados de Button/Dropdown/Tabs/overlays/input
   keyboard+mouse; conservar esos checks y el test de drag como evidencia, no
   como pendientes ficticios. Las discrepancias PRD
   Router/multi-stop están fuera de este cierre y requieren decisión separada.
3. **P1 — visuales sin causa:** clasificar las causas abiertas de las 42
   referencias golden sin regenerar y anotar si son baseline/font/scene drift o
   implementación.
4. **P2 — profundidad:** ampliar Progress, ScrollView/Portal, async forms,
   styled tokens/variants y pruebas type-level por export.

La auditoría no redefine el objetivo por los conteos de la matriz estable 52/52 ni
de la investigación histórica 51/52: registra qué capa está probada y qué
requisitos quedan fuera del cierre de paridad Kitty. La revisión Kitty directa y
en tmux queda verificada; Ghostty, FPS, medición pixel a pixel y cobertura
exhaustiva permanecen como límites separados.
