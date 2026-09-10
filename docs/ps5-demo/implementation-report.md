# Informe de implementación — demo PS5

**Fecha:** 2026-09-09
**API pública:** sin cambios.
**Estado:** implementación integrada; las rutas source-public y el consumidor
GPU del bundle generado están verificados. El probe mínimo de estilos de
`<img>` está **PASS acotado** tras un cambio interno TS/native: aplica máscara
`cornerRadius`, `objectFit` (`fill/cover`) y letterboxing `contain`. Los assets
visuales son suficientemente parecidos y están **aceptados por el usuario**;
se detiene el asset polish. Las pruebas funcionales, el engine final y las
capturas locales requeridas pasan; el resultado es **PASS acotado al entorno
local**. P1 y el narrow P2 del alias `boxShadow` están cerrados en la inspección
final; no queda un engine gate abierto.

La suite final registra 35 PASS, 0 FAIL y 399 assertions en 7 archivos, en 28.43 s
(`/tmp/ps5-final-functional.log`). El engine final registra 76 PASS, 0 FAIL y
594 assertions en 7 archivos (`/tmp/ps5-final-engine.log`), con motion, opacidad,
crop y bounds/shadows cubiertos; el guard idéntico de paint/compositor preserva
overflow y excluye effects, transforms descendientes y freeze. La captura mock
final registra dos capturas exactas de 1672×941 con checks verdaderos
(`/tmp/ps5-final-mock-visual.log`). No se afirma producto completamente perfecto,
Kitty físico, rendimiento o tarball.


## Correcciones del motor

### Transformación y recorte

El motor mantiene un único dueño para la transformación de una frontera de
subárbol y conserva la ascendencia/espacio de los clips al separar capas. El
hit testing utiliza la geometría transformada y los clips vacíos no se
confunden con ausencia de clip. El cambio es interno y conserva el contrato
web observable de transformación más `overflow: hidden`.

### Estilos de imagen (`cornerRadius` / `objectFit`)

La frontera interna TS/native ahora calcula el ajuste source-aware y entrega la
región nativa para la máscara de radio, sin cambiar la API pública ni el uso de
`<img>`. El probe source-public termina exit 0 con
`roundedMaskApplied=true`, `objectFitApplied=true` y
`letterboxingApplied=true`; evidencia: [`image-style-fix.log`](../../scripts/ps5-demo/artifacts/image-style-fix.log).
La regresión enfocada del engine registra 47 PASS/0 FAIL, 495 assertions en 4
archivos, incluida una comprobación directa de región con crop x=5 y píxel
RGBA. El baseline rojo pre-fix se conserva en
[`image-style-probe.log`](../../scripts/ps5-demo/artifacts/image-style-probe.log)
y no se sobrescribe.

### Capturas grandes del Home

- `TargetRegistry` consulta los límites reales del device y valida dimensiones
  y aritmética de readback antes de crear targets.
- Los tamaños inválidos devuelven el error existente en lugar de provocar un
  panic de wgpu; no se solicitan límites artificialmente superiores.
- Para capturas aisladas con transformaciones identidad o de traslación, el
  backend intersecta los bounds con el clip y traduce el rectángulo al origen
  del source.
- Roots con blur o transformaciones complejas conservan la captura completa.
  No se introdujo un sistema genérico de tiling y la paridad del glow analítico
  se conserva.

El límite de textura que motivó esta corrección está documentado, con su
baseline y logs, en [`gpu-texture-limit-blocker.md`](gpu-texture-limit-blocker.md).

## Integración de la aplicación

Todas las pantallas del demo están integradas en el host. Se corrigió el
registro duplicado de foco que provocaba el hang de Library y la navegación
automatizada queda verificada. El crossfade usa una transición keyed fresca
`0 → 1`: la entrada parte de alpha 0 y sube sobre la salida opaca, aunque el
stress de movimiento y el rendimiento manual todavía no están probados. La
integración no implica
emulación de juegos, PSN ni hardware real.

## Nueva pasada de fidelidad — evidencia final

- La suite final registra **35 PASS, 0 FAIL y 399 assertions en 7 archivos**, en
  28.43 s; log: `/tmp/ps5-final-functional.log`.
- El engine final registra **76 PASS, 0 FAIL y 594 assertions en 7 archivos**
  (`/tmp/ps5-final-engine.log`). El guard idéntico de paint/compositor preserva
  overflow y excluye effects, transforms descendientes y freeze; root y PS5
  typechecks pasan.
- La visual previa conserva 30 rutas × 2 viewports y la captura mock final añade
  dos capturas exactas de 1672×941 con checks verdaderos
  (`/tmp/ps5-final-mock-visual.log`).
- Los assets están aceptados; no son un gate. No queda un blocker funcional ni
  engine gate activo; root inspeccionó P1 y el narrow P2 del alias `boxShadow`.
- No se afirma Kitty físico, rendimiento certificado, tarball instalado ni un
  producto completamente perfecto.

## Evidencia disponible

- Source-public previo al cierre final: **32 PASS, 0 FAIL**, 367 assertions en 6 archivos,
  incluyendo recorrido de 26 tiles y navegación/overlays. Log:
  [`final-source.log`](../../scripts/ps5-demo/artifacts/final-source.log).
- Visual source-public previo: **30/30 capturas PASS**, 15 rutas a 1280×720 y
  1920×1080. Log: [`final-visual.log`](../../scripts/ps5-demo/artifacts/final-visual.log).
- Home source-public: 4 tests PASS, 84 assertions, recorrido de 26 tiles y
  foco en primera, media y última posición a 1280×720 y 1920×1080. El shell
  source-public pasa 2 tests con 35 assertions, sin abort de textura; los logs
  acotados del baseline están en
  [`bounded-capture-home.log`](../../scripts/ps5-demo/artifacts/bounded-capture-home.log)
  y [`bounded-capture-shell.log`](../../scripts/ps5-demo/artifacts/bounded-capture-shell.log).
- Suite del engine del fix previo: 487 tests PASS, 67 archivos, 1669
  assertions; además se verificó la regresión enfocada de transformación
  retenida con 14 tests y 57 assertions.
- Native release, validaciones de `TargetRegistry`, GPU FFI y typecheck pasan.
- Consumidor GPU del bundle generado: PASS a 1280×720 y 1920×1080; store del
  bundle: 9 PASS, 67 assertions. Logs: [`final-packaged-gpu.log`](../../scripts/ps5-demo/artifacts/final-packaged-gpu.log),
  [`final-packaged-store.log`](../../scripts/ps5-demo/artifacts/final-packaged-store.log)
  y [`final-root-types.log`](../../scripts/ps5-demo/artifacts/final-root-types.log).
- La suite source previa queda en 32 PASS y 0 FAIL, con 367 assertions. La
  ejecución intermedia de 28 PASS/2 FAIL combinaba problemas de harness con un
  scope stale-dialog real; este último se corrigió montando base y overlay en
  dos fases. No se clasifica todo el fallo histórico como setup.
- La verificación empaquetada usa un build temporal generado por
  `run-app-packaged.sh`; todavía no es una instalación de tarball.
- Probe público de estilos de imagen: **PASS acotado**; `cornerRadius=12`
  cambia la máscara (`total=62968`, `changed=192`), `fill` frente a `cover`
  cambia la composición (`total=183600`, `changed=288`) y `contain` aplica
  letterboxing. Log: [`image-style-fix.log`](../../scripts/ps5-demo/artifacts/image-style-fix.log).
  La prueba no ejercita forwarding de opacidad.
- Limitación técnica documentada: `directors-cut-brush.png` mide 2172×724,
  supera el límite runtime de 2048 px y Home usa un fallback rectangular dorado;
  el usuario acepta la similitud visual y no es un blocker.
- QA final: **PASS acotado al entorno local**; funcionalidad/layout/motion, engine
  final y capturas requeridas pasan. P1 y el narrow P2 del alias `boxShadow` pasan; el estado de aceptación está en
  [`design-qa.md`](../../design-qa.md).
- Limitaciones separadas: el probe mínimo no ejercita opacidad. El worker
  reporta un cambio TS-only para el forwarding de opacidad y crop, y la prueba
  retained específica pasa. El check final de bounds/shadows introducido por
  `boundedTranslation` y el alias `boxShadow` también pasan en el alcance local;
  root inspeccionó ambos helpers `resolveProps(node)`. Un fixture con crop offset no cero bajo
  transform/layer continúa vacío incluso con radio 0 en la ruta de clip
  anterior; no se afirma que sea preexistente demostrado ni que la causalidad
  esté aislada. No se añade fallback.

## Estado de revisión

No queda un blocker funcional ni engine gate activo en el alcance local: suites
funcionales, engine final y capturas requeridas pasan; los assets están aceptados
y no constituyen un gate. Root inspeccionó P1 y el narrow P2 del alias `boxShadow`.

No se afirma validación física de Kitty, rendimiento certificado, tarball
instalado ni un producto completamente perfecto; esas capas no son evidencia
para este cierre documental.

Por estos gates, este informe no declara terminado el menú PS5 completo aunque
las pantallas ya estén integradas y los recorridos locales estén verificados.
Tampoco es una certificación de developer preview ni una afirmación pixel-perfect.
