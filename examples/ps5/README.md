# PS5 demo (source development)

Esta demo es una simulación local de la experiencia PS5. No conecta con PSN ni
con el sistema operativo, no reproduce audio/vídeo y no ejecuta juegos reales.
La base compartida, todas las pantallas del inventario y sus overlays están
implementados, integrados y funcionan dentro del alcance local simulado. El
baseline funcional automatizado anterior (30 PASS, 0 FAIL, 345 aserciones en 5
archivos; 30 rutas GPU, store 9/67 y typechecks PASS) queda como evidencia
histórica, no como aceptación visual ni resultado pixel-identical. La
verificación automatizada final registra 35 PASS, 0 FAIL y 399 assertions en
7 archivos; root y PS5 typecheck pasan.

El fix interno TS/native del probe público de estilos de `<img>` está verificado
sin cambios de API pública: `cornerRadius`, `objectFit` `fill/cover` y
letterboxing `contain` producen diferencias observables (`supported=true`). El
log nuevo es [`image-style-fix.log`](../../scripts/ps5-demo/artifacts/image-style-fix.log);
el baseline rojo se conserva en [`image-style-probe.log`](../../scripts/ps5-demo/artifacts/image-style-probe.log).
Los assets del mock son suficientemente parecidos y **aceptados por el usuario**;
se detiene el asset polish. La limitación técnica de `directors-cut-brush.png`
(2172×724, sobre el límite de 2048) queda como nota, no como blocker. El caso
separado de crop offset bajo transform/layer se conserva como contexto histórico;
la pasada retained específica y los cambios TS-only de motion, opacidad y crop
quedan documentados sin afirmar causalidad retrospectiva.

La suite funcional y el engine final pasan en el alcance local; la captura mock
final confirma dos capturas exactas de 1672×941 con checks verdaderos. P1 y el narrow P2 del alias `boxShadow` pasan en la inspección final de root; no
queda un engine gate abierto. No se afirma pixel-perfect, terminal Kitty física ni rendimiento certificado multi-host. El tarball principal y el paquete nativo `darwin-arm64` pasan un smoke de consumidor limpio; no se afirma una matriz multi-OS ni un PS5 completamente perfecto. PSN, compras, hardware, audio, vídeo
y gameplay permanecen como simulaciones o limitaciones locales explícitas.

> **Estado de validación:** el abort baseline de `vexart-offscreen-target`
> (`3233 > 2048` a `1280×720`, fila fuente `4850` a `1920×1080`) queda como
> evidencia histórica en [`gpu-texture-limit-blocker.md`](../../docs/ps5-demo/gpu-texture-limit-blocker.md).
> El source-public probe de estilos posterior termina exit 0 con
> `roundedMaskApplied=true`, `objectFitApplied=true` y `letterboxingApplied=true`;
> la suite funcional final registra 35 PASS/0 FAIL/399 assertions y el engine
> final 76 PASS/0 FAIL/594 assertions. La captura mock final confirma dos capturas
> exactas de 1672×941 con checks verdaderos; no certifica pixel-identical ni
> terminal física. Los filtros blur del nodo raíz o descendientes y las
> transformaciones cubiertas conservan captura completa; el crossfade fresh-keyed
> `0 → 1` está implementado. P1 y el narrow P2 del alias `boxShadow` pasan en la
> inspección final de root; no queda un engine gate abierto. Kitty físico,
> rendimiento multi-host y otras plataformas todavía no se certifican.
> La demo no es un PS5
> completo, no se reduce la escena ni se añade tiling genérico. La validación
> Kitty física no puede ejecutarse mediante CUA en esta tarea; no se aplica
> bypass.

**Evidencia final:** la suite funcional registra 35 PASS, 0 FAIL y 399 assertions
en 7 archivos, en 28.43 s (`/tmp/ps5-final-functional.log`). El engine final
registra 76 PASS, 0 FAIL y 594 assertions en 7 archivos
(`/tmp/ps5-final-engine.log`); motion, opacidad, crop y bounds/shadows pasan. La
captura mock final confirma dos capturas exactas de 1672×941 con checks verdaderos
(`/tmp/ps5-final-mock-visual.log`); la cobertura anterior de 30 rutas y cuatro
estados secundarios se conserva. Los assets están aceptados y no son un gate. El
P1 y el narrow P2 del alias `boxShadow` pasan en la inspección final de root; no
queda un engine gate abierto. No se afirma fidelidad pixel-perfect, Kitty físico
ni rendimiento multi-host; el smoke de tarball Darwin está documentado en
[`stress-performance.md`](../../docs/ps5-demo/stress-performance.md).


Consulta el [plan de implementación](../../docs/ps5-demo-implementation-plan.md)
para el alcance, las pantallas futuras y los gates pendientes.

## Requisitos

- Bun y las dependencias ya instaladas del repositorio.
- Para ejecutar el app en una terminal física: Kitty y la biblioteca nativa
  existente de Vexart. No reinstalar dependencias ni reconstruir el native como
  parte de estos comandos.

## Ejecutar desde el repositorio

Desde la raíz de Vexart:

```bash
# App/diagnóstico contra el árbol fuente público (no es preview completa).
bash scripts/ps5-demo/run-app-source.sh

# Pruebas del demo (diagnóstico; no sustituye los gates finales).
bash scripts/ps5-demo/run-app-source.sh test

# Escenas/QA offscreen (diagnóstico; no es un gate de preview completa).
bash scripts/ps5-demo/run-app-source.sh qa

# Estrés reproducible de catálogo, overlays y retorno de rutas.
bun run --cwd examples/ps5 demo:stress

# Consumidor con bundle temporal generado y escenas GPU reales.
bash scripts/ps5-demo/run-app-packaged.sh verify
```

La reproducción histórica del baseline funcional es:

```bash
bash scripts/ps5-demo/run-app-source.sh test tests/shell.test.tsx
```

La evidencia histórica de Home source-public cubre la ruta de
identidad/traslación; el baseline `abort 134` solo documenta la evidencia que
motivó el fix. Todas las pantallas locales están montadas en el host. La QA
source final histórica registra 30 PASS, 0 FAIL y 345 aserciones en 5 archivos;
la verificación automatizada previa registra 32 PASS, 0 FAIL y 367 aserciones;
la suite final posterior registra 35 PASS, 0 FAIL y 399 assertions;
la pasada visual vigente confirma 30 capturas en 15 rutas × 2 viewports y los
cuatro estados secundarios; los assets están aceptados y no son un gate. El
engine final (76 PASS/0 FAIL/594 assertions) cubre motion, opacidad, crop y
bounds/shadows en el alcance local. P1 y el narrow P2 del alias `boxShadow` pasan
en la inspección final de root; no queda un engine gate abierto. No se añade una
reducción silenciosa de la escena. Kitty físico y rendimiento multi-host no se
certifican en este documento; el smoke Darwin del tarball sí está registrado.

Checks de contexto del baseline funcional: QA source final histórica `30 PASS, 0 FAIL`, 345 aserciones
sobre 5 archivos, suite de engine `487` tests y `1669` aserciones PASS, root y PS5
typecheck PASS, y guard native con errores existentes de dimensión/readback en vez
de panic. El baseline registra 30 capturas GPU (15 rutas × 2 tamaños) PASS, consumidor GPU
con bundle temporal PASS en ambos tamaños y store 9/67 PASS. Estos resultados no
certifican la fidelidad exacta, aprobación visual manual, tarball instalado, Kitty
físico, estrés de movimiento ni el rendimiento. La validación Kitty física no puede
ejecutarse mediante CUA en esta tarea; no se aplica bypass.

El mismo app interactivo puede iniciarse desde el package del ejemplo:

```bash
bun run --cwd examples/ps5 demo:source
```

El runner `run-app-source.sh` copia `src` y `tests` a un consumidor temporal y
crea un alias aislado de `vexart` hacia el barrel público fuente. Esto permite
diagnosticar el desarrollo contra la API pública y mantiene el árbol del
repositorio sin instalar ni modificar dependencias; **no es una prueba del
producto empaquetado ni del tarball `dist`**, y no demuestra un preview completo
aunque el probe de estilos y Home pasen sus checks acotados. El consumidor
empaquetado final, la terminal física, la fidelidad exacta, el caso offset bajo
transform/layer y la matriz de rendimiento pertenecen a gates externos; el
runner genera el bundle en un workspace temporal y no modifica el `dist` del
repositorio. El smoke de tarball Darwin y la pasada de estrés están documentados
por separado y no equivalen a validar otras plataformas o Kitty físico.

## Estado persistente

Por defecto se usa:

```text
~/.local/state/vexart/ps5-demo/state.json
```

Para aislar una sesión o una prueba, define `PS5_DEMO_STATE`:

```bash
PS5_DEMO_STATE=/tmp/ps5-demo-state.json bash scripts/ps5-demo/run-app-source.sh
```

La persistencia guarda únicamente estado local de la simulación (usuario,
ajustes, catálogo instalado, storage y paneles). Las acciones de reposo,
reinicio y apagado solo cambian el estado del demo; nunca afectan al ordenador
anfitrión.

La pasada de estrés offscreen queda documentada en
[`stress-performance.md`](../../docs/ps5-demo/stress-performance.md) y produce
[`stress-report.json`](../../scripts/ps5-demo/artifacts/stress-report.json).
