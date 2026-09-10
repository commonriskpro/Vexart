# Validación del gate — demo PS5

> **Estado actualizado — 2026-09-09:** el fix interno de imagen está
> verificado sin cambios de API pública. El probe source-public termina con
> `supported=true`, `roundedMaskApplied=true`, `objectFitApplied=true` y
> `letterboxingApplied=true` (exit 0). La suite funcional final registra 35 PASS,
> 0 FAIL y 399 assertions en 7 archivos, en 28.43 s
> (`/tmp/ps5-final-functional.log`); root y PS5 typechecks pasan.
>
> El engine final registra 76 PASS, 0 FAIL y 594 assertions en 7 archivos
> (`/tmp/ps5-final-engine.log`). El guard idéntico de paint/compositor preserva
> overflow y excluye effects, transforms descendientes y freeze. La captura mock
> final registra dos capturas exactas de 1672×941 con checks verdaderos
> (`/tmp/ps5-final-mock-visual.log`); la cobertura anterior de 30 rutas y cuatro
> estados secundarios se conserva como evidencia.
>
> Los assets visuales se consideran suficientemente parecidos y aceptados por el
> usuario; se detiene el asset polish y no es blocker. El fix P1 y el narrow P2 del alias `boxShadow` pasan en el
> alcance local; ambos helpers `resolveProps(node)` y la regresión GPU del alias
> fueron inspeccionados por root. No queda un engine gate abierto. El tarball
> principal y el paquete nativo `darwin-arm64` también pasan un smoke de
> consumidor limpio; no se afirma todavía una matriz multi-OS ni Kitty físico.
>
> El fixture histórico de crop horizontal con offset bajo transform/layer queda
> como contexto de la ruta anterior; la comprobación retained actual de imagen
> 48 px en viewport 24 px con translate -5 devuelve RGB correcto. Los cambios de
> motion, opacidad y crop son TS-only.
>
> La matriz histórica debajo conserva el gate de transform/clip anterior y sus
> fallos; no sustituye la evidencia posterior al fix.


## Estado posterior al fix — 2026-09-09

- El runner source-public mínimo de transformación/recorte termina con exit 0;
  sus métricas visuales y de input están resumidas en
  [`engine-transform-clip-fix.md`](engine-transform-clip-fix.md).
- El test source-public del shell completo pasa 2/2 con 35 assertions y el
  Home pasa 4/4 con 84 assertions a 1280×720 y 1920×1080. Los logs acotados
  del baseline están en
  [`bounded-capture-shell.log`](../../scripts/ps5-demo/artifacts/bounded-capture-shell.log)
  y [`bounded-capture-home.log`](../../scripts/ps5-demo/artifacts/bounded-capture-home.log).
- El abort `vexart-offscreen-target` de 3233 px pertenece al baseline y queda
  documentado junto al fix en [`gpu-texture-limit-blocker.md`](gpu-texture-limit-blocker.md).
- El typecheck del ejemplo y `git diff --check` pasan; la validación source
  anterior queda registrada como 32/32 PASS y 367 assertions abajo. La suite
  funcional final posterior registra 35 PASS/0 FAIL/399 assertions en 7 archivos
  (`/tmp/ps5-final-functional.log`).
- Todas las pantallas del demo están integradas en el host. `run-app-packaged.sh
  verify` pasa sobre el build temporal y un consumidor limpio instaló los
  tarballs actuales de `vexart` y `@vexart-native/darwin-arm64`, compartió el
  reconciliador y creó el backend GPU. Esto no cubre aún otras plataformas.
- Visual source-public: 30/30 capturas PASS para 15 rutas en 1280×720 y
  1920×1080. Store empaquetado: 9 PASS, 67 assertions. Logs versionados:
  [`final-visual.log`](../../scripts/ps5-demo/artifacts/final-visual.log),
  [`final-packaged-gpu.log`](../../scripts/ps5-demo/artifacts/final-packaged-gpu.log)
  y [`final-packaged-store.log`](../../scripts/ps5-demo/artifacts/final-packaged-store.log).
- La ejecución source anterior pasa 32/32 con 367 assertions en 6 archivos. Log:
  [`final-source.log`](../../scripts/ps5-demo/artifacts/final-source.log). La
  evidencia funcional final posterior está en `/tmp/ps5-final-functional.log`.
- La ejecución intermedia de 28 PASS/2 FAIL combinaba problemas de harness con
  un scope stale-dialog real; este último se corrigió montando base y overlay
  en dos fases. No se registra como blocker de API.
- El probe público de estilos de imagen termina `public-api-capability-observed`
  con `supported=true`: `cornerRadius` cambia la máscara
  (`cornerMaskDelta.total=62968`, `changed=192`), `fill` frente a `cover`
  cambia la composición (`fillVsCoverDelta.total=183600`, `changed=288`) y
  `contain` muestra letterboxing. Log nuevo:
  [`image-style-fix.log`](../../scripts/ps5-demo/artifacts/image-style-fix.log).
  El log rojo previo se conserva en
  [`image-style-probe.log`](../../scripts/ps5-demo/artifacts/image-style-probe.log)
  como baseline histórico.
- Suite enfocada del engine: 47 PASS/0 FAIL, 495 assertions en 4 archivos,
  incluida la verificación native de región con crop offset x=5 y píxel RGBA.
- La captura visual source-public del mock termina exit 0 con viewport exacto
  1672×941 para Home y Control Center. El log indica
  `physicalTerminalAssertions=false` y no hace una afirmación de identidad
  pixel-perfect: `/tmp/ps5-image-fix-visual.log` (log de ejecución, no artefacto versionado).
  La pasada visual final posterior confirma 30 capturas en 15 rutas × 2 viewports,
  `allRequestedViewports=true` y `exactMock=2`.
- Los assets de Home/Control Center se aceptan por suficiencia visual y no son
  un blocker; ver [`design-qa.md`](../../design-qa.md). La limitación secundaria
  de `directors-cut-brush.png` (2172×724, sobre 2048) y su fallback rectangular
  dorado quedan documentados, pero el usuario aceptó el resultado.
- El fixture histórico de crop offset queda como contexto; el worker reporta
  cambios TS-only para motion/opacidad/crop y el retained RGB crop específico
  pasa. El check final de bounds/shadows de `boundedTranslation` también pasa;
  P1 y el narrow P2 del alias `boxShadow` están cerrados en la inspección final:
ambos helpers `resolveProps(node)` y la regresión GPU del alias pasan. No queda un
engine gate abierto.
- La suite final funcional registra **35 PASS/0 FAIL, 399 assertions en 7
  archivos** (`/tmp/ps5-final-functional.log`). La pasada visual registra 30
  capturas (15 rutas × 2 viewports), `allRequestedViewports=true`, `exactMock=2`
  y los 4 estados secundarios PASS.
- La suite ampliada previa del engine registra **73 PASS/0 FAIL, 586 assertions
  en 7 archivos** (`/tmp/ps5-motion-engine-tests.log`). La ejecución final
  registra **76 PASS/0 FAIL, 594 assertions en 7 archivos**
  (`/tmp/ps5-final-engine.log`), con motion, opacidad, crop y bounds/shadows
  cubiertos; retained image de 48 px en viewport 24 px con translate -5 devuelve
  RGB correcto.
- Los assets de Home/Centro de control están aceptados por el usuario y se
  detiene el asset polish. Settings, Launch, Library y Hub quedan cubiertos por
  la pasada. No queda un blocker funcional ni engine gate activo.
- La ejecución final de mock visual registra dos capturas exactas de 1672×941,
  con checks verdaderos (`/tmp/ps5-final-mock-visual.log`).

- La pasada de estrés offscreen recorre el catálogo, las 18 instalaciones, el
  lanzamiento simulado y los overlays en dos viewports; sus métricas y límites
  están en [`stress-performance.md`](stress-performance.md).


**Baseline histórico (2026-09-08):** Phase 1 detenida por los bloqueos
[`PS5-API-CLIP-NOLAYER-POSITION`](api-blockers.md#ps5-api-clip-nolayer-position)
y [`PS5-API-CLIP-LAYER-IMAGE`](api-blockers.md#ps5-api-clip-layer-image).
Phase 2–5 no se iniciaron. Esta matriz distingue observación de pass; no
habilitaba implementación.

**Baseline histórico:** las filas de la matriz y el estado anterior corresponden
a la ejecución del 2026-09-08, antes del fix. La validación posterior está
resumida en [`engine-transform-clip-fix.md`](engine-transform-clip-fix.md).

## Matriz de evidencia

| Área | Resultado | Evidencia/alcance |
|---|---|---|
| `<img>` público: `cornerRadius` / `objectFit` | **PASS acotado** | Probe real source-public: `supported=true`, máscara, `fill/cover` y `contain` observables; [`image-style-fix.log`](../../scripts/ps5-demo/artifacts/image-style-fix.log). |
| Engine image-style focused | **PASS** | El check final del engine registra 76 PASS/0 FAIL, 594 assertions en 7 archivos; incluye región native, crop x=5 y guard de bounds/shadows. |
| Mock visual Home + Control Center | **PASS acotado** | Dos capturas finales exactas de 1672×941 con checks verdaderos; assets aceptados, sin claim pixel-perfect ni terminal física. |
| Crop offset bajo transform/layer | **PASS acotado** | Retained image 48 px en viewport 24 px con translate -5 devuelve RGB correcto; fixture anterior queda como contexto, sin blocker separado. |
| Forwarding de opacidad de imagen | **PASS acotado** | Worker reporta cambio TS-only y el engine final cubre el caso retenido; bounds/shadows también pasan en el alcance local. |
| Nueva pasada source (35/0/399) | **PASS** | Suite final funcional: 35 PASS/0 FAIL, 399 assertions en 7 archivos. |
| Home/CC iconos, logo y tarjetas | **Aceptado por usuario** | Assets suficientemente parecidos; se detiene el asset polish. |
| Settings/Launch/Library/Hub polish | **PASS acotado** | Visual secundaria y pasada final cubren las rutas; sin gate de assets. |
| Engine motion/opacidad/crop/bounds | **PASS acotado** | 76 PASS/0 FAIL/594 assertions; retained RGB crop, guard de bounds/shadows y alias `boxShadow` pasan en el alcance local; no queda engine gate abierto. |
| Visual secundaria (4 estados) | **PASS** | Settings brightness/accessibility/network y Launch title a 1280; `secondary4=true`. |
| Capturas finales | **PASS acotado** | 30 capturas previas y dos capturas finales exactas de 1672×941 con checks verdaderos; no claim pixel-perfect ni físico. |

Las filas siguientes son el **baseline histórico pre-fix** del gate de
transform/clip y se conservan para trazabilidad; sus FAIL no describen la
repetición posterior de ese fix.

| Área | Resultado | Evidencia/alcance |
|---|---|---|
| Runtime source-public + barrel `vexart` | Observado | [`source-public-qa.json`](../../scripts/ps5-demo/artifacts/source-public-qa.json); adaptador interno solo para QA. |
| Imágenes locales | Observado | `localImageAndIntermediateAlphaObserved=true`; no implica crossfade completo validado. |
| Alpha/crossfade | Parcial, no pass | Root observó imagen/alpha intermedia; el crossfade final no se valida porque el reset del target fue imperfecto (`crossfadeVisualFinal=false`). |
| Sin layer: posición y clip | **FAIL / blocker** | Colores observados púrpura/verde/fondo, no azul/púrpura/verde; `outsideInk=639`. |
| Con layer: posiciones y bleed | Parcial | Posiciones de color observadas y `outsideInk=0`, pero falla la imagen que debía entrar. |
| Con layer: imagen Ghost entrando | **FAIL / blocker** | `imageBuckets=1`, `enteringImageVisible=false`; esperado en x=198..238. Igual tras overlay. |
| Pointer hit transformado | **FAIL de criterio global** | Sin layer no observado; la variante layer lo observa, pero el criterio exige todas las variantes. |
| Foco al cerrar overlay | Observado | `overlayFocusRestore=true` en la sonda source-public; no resuelve el bloqueo visual. |
| Navegación rápida | Observado | `rapidNavigation=true`; la fila transformada continúa sin cumplir el patrón visual. |
| Fila de 24 tarjetas | Pendiente/falla secundaria | La sonda también termina vacía tras navegación/ciclo de overlay (`runtimeRow.visibleAfterNavigation=false`, `pending-row-empty-after-overlay-lifecycle`); no se atribuye solo al overlay. |
| Leaf transform/filter/clip de root | PASS acotado | 8 assertions; no prueba la fila de 24 tarjetas ni sustituye el gate. |
| Consumidor empaquetado | Parcial | Instalación normal en temp con tarball/native; typecheck PASS y singleton `true,true`. |
| Kitty sintético PIPE | PASS acotado | `ready/destroy=1`, sin error en el smoke sintético. |
| PTY sintético | No pass | Exit 0, pero emitió 7 errores `-7 EAGAIN`. |
| Terminal sin Kitty | Rechazo esperado | El runtime declara la carencia de Kitty; no es un pass del entorno PS5. |
| Kitty físico / performance final | No ejecutado | No se afirma validación física ni de rendimiento. |
| Typecheck baseline del repositorio | No pass fuera de scope | Falló con TS2554 en `composite-scroll.test.ts:38,63`; no se atribuye a este cambio documental. |

## Fixture reproducido

- Fixture mínima 420×300; fila x=18, y=48, w=220, h=80. La sonda integrada de 24 tarjetas usa 720×560.
- Cuatro bloques coloreados de 48 px y dos imágenes, gap=12; `translateX(0 → -60)` y espera de 180 ms.
- Sin layer: esperado x=42/102/162; actual púrpura [93,59,143], verde [47,140,119] y fondo [9,9,9].
- Con layer: el recorte exterior queda contenido, pero el asset Ghost que debería entrar en x=198..238 queda ausente en un único bucket de imagen.
- PNG disponibles: [`clip-no-layer`](../../scripts/ps5-demo/artifacts/clip-no-layer-final.png), [`clip-layer`](../../scripts/ps5-demo/artifacts/clip-layer-final.png), [`clip-layer-overlay`](../../scripts/ps5-demo/artifacts/clip-layer-overlay-final.png) y sus snapshots `initial`.

## Paquete y binario

- Snapshot dist beta.26: [`dist-snapshot.json`](../../scripts/ps5-demo/artifacts/dist-snapshot.json); el source runtime resolvió el bridge del repositorio y el path empaquetado sigue sin quedar probado por el PTY.
- Candidato instalado verificado: `node_modules/@vexart-native/darwin-arm64/libvexart.dylib`.
- SHA-256 coincidente de los candidatos/binario listado: `644b20a1bf72a9c91df2336dc7c7d3357a4bb0054e2966e6931f885d8d600d07`. No se afirma qué path exacto fue cargado porque no hubo instrumentación de carga.
- Revisión empaquetada temporal: `/tmp/vexart-ps5-package-review-1788887759-35479`. Sus logs `packaged-mounted-pipe.log` y `packaged-mounted-pty.log` contienen respectivamente el smoke sintético sin errores y el intento con errores EAGAIN; root verificó ambos. Esos logs son temporales, no artefactos versionados.
- El archivo versionado [`packaged-consumer-pty.log`](../../scripts/ps5-demo/artifacts/packaged-consumer-pty.log) registra únicamente el rechazo por ausencia de Kitty del intento anterior; no demuestra el smoke sintético ni su presentación.

## Comando verificado

Root verificó el runner histórico y reprodujo los dos IDs de bloqueo en sus
tres variantes; esa reproducción pre-fix termina con exit 1/STOP y se conserva
solo como historial:

```sh
bash scripts/ps5-demo/run-source-public-qa.sh
```

Checks de script y TypeScript de la sonda, también verificados por root:

```sh
bash -n scripts/ps5-demo/run-source-public-qa.sh
./node_modules/.bin/tsc -p examples/ps5/tsconfig.json --noEmit
```

Ambos terminan con exit 0. Los resultados citados provienen de los artefactos registrados y de esa reproducción; no se recompiló native.

## Decisión requerida

No hace falta una decisión adicional para el bloqueador de estilos del probe
mínimo: la corrección interna está implementada y verificada. La suite funcional,
el engine final y las capturas/checks pasan en el alcance local; los assets no son
un gate. P1 y el narrow P2 del alias `boxShadow` pasan en la inspección final de root; no queda un engine gate abierto.

No se añade un fallback ni se presenta una certificación física de Kitty,
rendimiento o producto completamente perfecto. El smoke del tarball cubre el
paquete principal y `darwin-arm64` en un consumidor limpio; las capturas
offscreen y ese smoke no equivalen a una matriz multi-OS ni a la experiencia
visible de Kitty.
