# QA visual obligatoria — demo PS5

**Fecha:** 2026-09-09
**Resultado:** **PASS acotado al entorno local**; las suites funcionales, el
engine y las capturas requeridas pasan. Los assets visuales se consideran
aceptados por el usuario. P1 y el narrow P2 del alias `boxShadow` están cerrados en la inspección final:
ambos helpers `resolveProps(node)` y la regresión GPU del alias pasan. No queda un
engine gate abierto.
**Estado funcional:** las rutas locales y el recorrido de pantallas están
verificados; este gate separado mide fidelidad visual, no navegación.

**Evidencia final local:** root confirma la suite funcional con 35 PASS, 0 FAIL
y 399 assertions en 7 archivos, 28.43 s
(`/tmp/ps5-final-functional.log`). El engine final registra 76 PASS, 0 FAIL y
594 assertions en 7 archivos (`/tmp/ps5-final-engine.log`), con root y PS5
typechecks PASS. La captura mock final registra dos capturas exactas de
1672×941 con todos sus checks verdaderos (`/tmp/ps5-final-mock-visual.log`);
la cobertura visual anterior de 30 rutas y los cuatro estados secundarios también
se conserva como evidencia.

El fix P1 de `boundedTranslation` está aplicado: el guard idéntico de
paint/compositor preserva overflow y excluye effects, transforms descendientes y
freeze. P1 y el narrow P2 del alias `boxShadow` están cerrados en la inspección final:
ambos helpers `resolveProps(node)` y la regresión GPU del alias pasan. No queda un
engine gate abierto. Los assets están aceptados y no son un gate. El smoke del
tarball principal + `darwin-arm64` pasa en consumidor limpio y la pasada de
estrés offscreen recorre los 24 juegos; no se afirma una matriz multi-OS, Kitty
físico ni rendimiento visible certificado.

## Resultado P1: estilos de imagen y bounds del engine corregidos; PASS local acotado

El probe source-public termina con `result=public-api-capability-observed`,
`supported=true` y exit 0:

```sh
bash scripts/ps5-demo/run-app-source.sh tests/image-style-probe.tsx
```

Log versionado: [`image-style-fix.log`](scripts/ps5-demo/artifacts/image-style-fix.log).

Evidencia observada en el renderer GPU real:

- `<img cornerRadius={12}>` cambia la máscara: `cornerMaskDelta.total=62968`,
  `changed=192` y `roundedMaskApplied=true`.
- `<img objectFit="fill">` frente a `objectFit="cover">` cambia la
  composición: `fillVsCoverDelta.total=183600`, `changed=288` y
  `objectFitApplied=true`.
- `<img objectFit="contain">` conserva la imagen y aplica el letterbox;
  `letterboxingApplied=true`.

La corrección es interna a la frontera TS/native FFI y no cambia la API
pública. La regresión enfocada del engine registra 47 PASS/0 FAIL, 495
assertions en 4 archivos, incluida la igualdad RGBA de una región native con
crop x=5.

El baseline rojo se conserva en
[`image-style-probe.log`](scripts/ps5-demo/artifacts/image-style-probe.log):
`public-api-blocked`, delta cero para radio y `fill/cover`. Es evidencia
histórica del defecto que motivó el fix, no el resultado actual.

Los assets visuales del mock se consideran suficientemente parecidos y
**aceptados por el usuario**; se detiene el asset polish. La limitación técnica
de `directors-cut-brush.png` (2172×724, sobre el límite runtime de 2048 px) y
su fallback rectangular dorado quedan documentados, pero ya no son un blocker.
La cobertura final de funcionalidad, layout, motion y capturas pasa. El check
final de bounds/shadows también pasa en el engine;
cerrando el hallazgo sin que este documento anticipe ese cierre.

### Limitaciones separadas

- La prueba de estilos no ejercita el forwarding de opacidad. El worker reporta
  un cambio TS-only y el engine focused test cubre el caso retenido específico,
  y la suite ampliada deja cubierto el caso retenido; no hay un gate separado de
opacidad.
- El fixture histórico de recorte horizontal con offset bajo transform/layer
  queda como contexto de la ruta anterior; la prueba retained actual de imagen
  48 px en viewport 24 px con translate -5 devuelve RGB correcto. No se afirma
  causalidad retrospectiva; no constituye un gate separado de esta pasada.

## Comparación visual

La comparación obligatoria usa la referencia aprobada y las capturas locales
del renderer real:

- [Referencia aprobada Home/Control Center](docs/ps5-demo/references/approved-home-control-center.png)
- [Captura local Home](scripts/ps5-demo/artifacts/app-source-public-offscreen-mock-home-1672x941.png)
- [Captura local Control Center](scripts/ps5-demo/artifacts/app-source-public-offscreen-mock-control-center-1672x941.png)

El mock ya muestra progreso visual: Home y Control Center comparten la
composición, la ventana visible contiene cinco juegos mientras conserva los 24
assets del catálogo, estadísticas y avatar están alineados, y las pantallas
usan arte generado local. **No equivale a identidad pixel-perfect**: los assets
se aceptan por suficiencia visual, pero la captura no constituye una afirmación
de igualdad exacta.

## Estado de la pasada actual

La suite final confirma 35 PASS/0 FAIL/399 assertions en 7 archivos y 30
capturas en 15 rutas × 2 viewports, con los viewports solicitados y los 4 estados
secundarios PASS. El engine final registra 76 PASS/0 FAIL/594 assertions en 7 archivos y
confirma el check de bounds/shadows. Los assets están aceptados y no son un gate;
layout y motion quedan cubiertos por esta pasada. P1 y el narrow P2 del alias `boxShadow` están cerrados en la inspección final:
ambos helpers `resolveProps(node)` y la regresión GPU del alias pasan. No queda un
engine gate abierto. La pasada de estrés y sus límites están en
[`stress-performance.md`](docs/ps5-demo/stress-performance.md); el tarball y el
smoke empaquetado están registrados en sus logs versionados.

## Regla de parada

El probe mínimo de estilos, la suite funcional, el engine final y las
capturas requeridas pasan en el alcance local; los assets están aceptados y no se
reabre su polish. No queda un blocker funcional ni engine gate activo. No se añade
un fallback de raster ni se afirma validación física de Kitty, rendimiento o un
producto completamente perfecto.
