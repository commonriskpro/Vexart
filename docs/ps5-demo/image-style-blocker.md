# `<img>` image-style blocker

## Result

**Estado posterior al fix — 2026-09-09:** el probe GPU source-public termina
con `result=public-api-capability-observed`, `supported=true` y exit 0. La
ruta pública de `<img>` aplica ahora `cornerRadius` y `objectFit` sin cambios
de API pública; el cambio queda limitado a la frontera interna TS/native.

La evidencia final aplica la máscara redondeada (`roundedMaskApplied=true`),
el cálculo source-aware de `fill/cover` (`objectFitApplied=true`) y el
letterboxing de `contain` (`letterboxingApplied=true`). Esto cierra el
bloqueador de estilos de imagen para el probe mínimo; no demuestra fidelidad
pixel-identical del mock ni resuelve todos los casos de composición.

El engine final registra 76 PASS, 0 FAIL y 594 assertions en 7 archivos
(`/tmp/ps5-final-engine.log`); el guard idéntico de paint/compositor preserva
overflow y excluye effects, transforms descendientes y freeze. P1 y el narrow P2 del alias `boxShadow` pasan en la inspección final de root;
no queda un engine gate abierto.

## Nueva pasada de fidelidad — evidencia final

La suite final registra 35 PASS, 0 FAIL y 399 assertions en 7 archivos, en
28.43 s (`/tmp/ps5-final-functional.log`). El engine final registra 76 PASS, 0
FAIL y 594 assertions en 7 archivos (`/tmp/ps5-final-engine.log`); el worker
reporta cambios TS-only para motion, opacidad y crop, con una comprobación
retained de imagen 48 px en viewport 24 px y translate -5 devolviendo RGB correcto.
La visual previa confirma 30 capturas (15 rutas × 2 viewports),
`allRequestedViewports=true`, `exactMock=2` y cuatro estados secundarios PASS; el
mock final añade dos capturas exactas de 1672×941 con checks verdaderos
(`/tmp/ps5-final-mock-visual.log`).

Los assets de Home y Centro de control están aceptados por el usuario y se detiene
su polish; Settings, Launch, Library y Hub quedan cubiertos por la pasada visual.
El engine final pasa P1 y el narrow P2 del alias `boxShadow` en el alcance local;
root inspeccionó ambos helpers `resolveProps(node)` y no queda un engine gate abierto.

## Focused check

```sh
bash scripts/ps5-demo/run-app-source.sh tests/image-style-probe.tsx
```

El probe genera un PNG RGBA temporal de 4×2 con cuatro columnas distintas y
lo renderiza en una caja 24×24 sobre un fondo conocido. Ejecuta tres capturas
GPU reales secuenciales mediante el adaptador offscreen existente (son
secuenciales porque el adaptador intercambia estado global del backend).

**Evidencia posterior al fix:**

- `cornerRadius={12}` cambia las esquinas (`cornerMaskDelta.total=62968`,
  `changed=192`) y conserva el píxel central; `roundedMaskApplied=true`.
- `objectFit="fill"` conserva las cuatro columnas; `objectFit="cover"`
  recorta horizontalmente como se espera para una fuente 2:1 en una caja
  cuadrada; `fillVsCoverDelta.total=183600`, `changed=288`,
  `objectFitApplied=true`.
- `objectFit="contain"` conserva las cuatro columnas y pinta el letterbox
  superior/inferior con el fondo (`letterboxingApplied=true`).

Log versionado: [`image-style-fix.log`](../../scripts/ps5-demo/artifacts/image-style-fix.log).
Los logs temporales de ejecución son `/tmp/ps5-image-style-after.log`,
`/tmp/ps5-image-fix-tests.log`, `/tmp/engine-image-fix-tests.log` y
`/tmp/ps5-image-fix-visual.log`; no se tratan como artefactos versionados.
La suite PS5 previa registra 32 PASS/0 FAIL/367 assertions en 6 archivos; la
suite enfocada previa del engine registra 47 PASS/0 FAIL/495 assertions en 4 archivos.

## Baseline histórico (pre-fix)

El baseline rojo se conserva sin sobrescribir en
[`image-style-probe.log`](../../scripts/ps5-demo/artifacts/image-style-probe.log).
En esa ejecución, `supported=false` (`public-api-blocked`):

- `cornerRadius={12}` dejaba la esquina igual que `cornerRadius={0}`;
  `cornerMaskDelta.total=0`, `changed=0`.
- `objectFit="fill"` y `objectFit="cover"` producían las mismas cuatro
  muestras (rojo, verde, azul, amarillo); `fillVsCoverDelta.total=0`,
  `changed=0`.

Ese resultado documenta el defecto que motivó el fix y no describe el runtime
posterior. Para la fuente 2:1 en caja cuadrada, `cover` debe recortar los
bordes horizontales mientras `fill` conserva las cuatro columnas.

## Source/API evidence

- La documentación pública lista `cornerRadius` como prop visual en
  `docs/agent-reference.md`, `objectFit` como prop de imagen y `<img>` como
  intrínseco público.
- `walk-tree` conserva ambas props en `ImagePaintConfig`; la implementación
  actual resuelve máscara, destino temporal y ajuste de fuente antes de pasar
  la región al compositor native.
- El cambio es interno (TS/native FFI); la API pública y el uso de `<img>` no
  cambian.

## Limitaciones separadas

- La prueba de estilos no ejercita el forwarding de opacidad. La limitación
  observada en la revisión de fuente se aborda en la pasada actual con cambios
  TS-only y un test enfocado; queda documentada con alcance acotado y no abre un
  blocker separado.
- Un fixture adicional con recorte horizontal de offset no cero bajo
  transform/layer de subárbol conserva la composición vacía en la ruta de
  operación de clip anterior, incluso con radio 0. No se afirma que sea un
  comportamiento preexistente demostrado ni se ha aislado su causalidad. El
  retained específico de 48 px/24 px/translate -5 devuelve RGB correcto; el
  fixture anterior queda como contexto y no como blocker independiente de esta
  pasada.

## Scope/next step

El bloqueador de estilos para el probe público mínimo está cerrado con la
evidencia anterior. Los assets visuales están aceptados por el usuario y no son
un gate; la limitación técnica de `directors-cut-brush.png` de 2172×724 que
supera 2048 queda documentada sin reabrir asset polish. La funcionalidad,
layout, motion, engine final y capturas requeridas pasan en el alcance local. P1 y
el narrow P2 del alias `boxShadow` están cerrados; no queda un engine gate abierto.
Tampoco se afirma un PS5 completamente perfecto ni una certificación física a
partir de este probe.
