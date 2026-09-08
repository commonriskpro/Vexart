# Informe de rendimiento tmux

**Fecha:** 2026-09-08

**Alcance:** mediciones internas preliminares de transporte para la paridad
Kitty/tmux. No es un benchmark de la experiencia visible.

## Decisión de aceptación

**PASS de aceptación práctica — aprobado por el usuario el 2026-09-08.** El
usuario considera suficientemente cercano el rendimiento observado y acepta
estas corridas para cerrar esta verificación, sin exigir otra medición ahora.
Esto no establece paridad cuantitativa, una diferencia fija de 10 ms ni el
costo aislado de tmux: siguen vigentes los límites de emulador, geometría y
medición descritos abajo. No se requieren optimizaciones para esta aceptación.

## Resultados live del usuario

Los dos `fixture.json` live terminaron `PASS`. La ruta `plain` se identifica como
Kitty sin tmux; el usuario confirmó que ejecutó la ruta `tmux` en Ghostty. El
asistente no observó el renderizado ni la pantalla. El JSON conserva
`measurementScope=live actual-terminal-unobserved` y
`visibleFpsMeasured=false`.

- `plain`: el detector registró `kind=kitty`, sin tmux, 1820×884 px, celda 7×13.
- `tmux`: el detector registró `kind=ghostty`, con tmux, 1645×1026 px, celda
  7×18; la identidad Ghostty fue confirmada por el usuario.

La detección se deriva de variables heredadas (véanse [`detect.ts`](/Users/dev/ve/vexart/packages/engine/src/terminal/detect.ts) y [`tmux.ts`](/Users/dev/ve/vexart/packages/engine/src/terminal/tmux.ts)); la etiqueta no sustituye la confirmación del outer terminal. Las áreas y métricas de celda no coinciden, por lo que layout/font metrics cambian: no es una comparación controlada ni permite atribuir diferencias a tmux o normalizar pixels.

Ambas corridas recorrieron siete fases (`idle`, `typing`, `hover`, `scroll`,
`overlay`, `animation`, `full-repaint`), con 300 solicitudes, 20 warmup y
`16.667 ms`; cada fase activa produjo 300 perfiles y `idle` produjo 0. Usaron
SHM crudo y estrategia `final-frame`.

### Trabajo interno live

`renderedProfiles / wallTimeMs × 1000` es trabajo interno por segundo; `p95` es
`frameWallMs.p95` en ms. Ninguna columna es delivery rate ni FPS visible.

| Fase | Kitty trabajo/s | Ghostty + tmux trabajo/s | Kitty p95 | Ghostty + tmux p95 |
| --- | ---: | ---: | ---: | ---: |
| Idle | 0.00 | 0.00 | 0.039 | 0.024 |
| Typing | 46.94 | 50.97 | 29.733 | 20.528 |
| Hover | 59.76 | 59.54 | 17.374 | 12.447 |
| Scroll | 48.59 | 44.91 | 30.327 | 22.700 |
| Overlay | 43.34 | 48.74 | 30.860 | 22.011 |
| Animation | 43.73 | 59.78 | 33.405 | 6.485 |
| Full repaint | 47.01 | 59.73 | 33.792 | 13.409 |

El p95 solo cubre la llamada síncrona: parte del trabajo de presentación tmux
ocurre después. Su valor menor no demuestra una presentación más rápida.

Evidencia: [`plain fixture.json`](/tmp/vexart-live-plain.gG6qV5/fixture.json),
[`tmux fixture.json`](/tmp/vexart-live-tmux.EaaSEm/fixture.json) y análisis
recalculado [`live-analysis.json`](/tmp/vexart-live-analysis-0h9rgbx7/analysis.json).
El intento tmux anterior [`KOljk7/fixture.json`](/tmp/vexart-live-tmux.KOljk7/fixture.json)
falló el guard de tamaño mínimo (700×1026); no es un fallo de rendimiento.

## Dataset sintético v1 — control separado

Las seis pruebas serializadas del control pasaron: 21/21 hashes de fase final
exactos y cleanup SHM verificado. Usaron Apple M4/16 GB, macOS 26.6.2, Bun
1.3.14, tmux 3.6a privado, WGPU real y receptor sintético que copia RGBA; cada
ruta tuvo 120 frames + 20 warmup por fase a 1920×1080. Las tasas son **frames/s
del receptor, no FPS visibles**:

| Fase | Plain | tmux |
| --- | ---: | ---: |
| Idle | 0.00 | 0.00 |
| Typing | 48.50 | 49.57 |
| Hover | 59.46 | 59.02 |
| Scroll | 51.89 | 53.30 |
| Overlay | 49.98 | 45.53 |
| Animation | 49.49 | 52.25 |
| Full repaint | 48.59 | 52.38 |

En fases activas se observaron 360 uploads por ruta, salvo tmux hover (357/360);
son observaciones sintéticas, no un contador preciso de coalescing. Idle subió
0. El p95 síncrono puede hacer parecer tmux 24–38% más rápido porque su
presentación asíncrona queda fuera de parte de la ventana; no demuestra mejora
del motor. No se evaluó significancia estadística; la variación de estas fases
cortas no justifica un veredicto de bug/optimización.

## Reproducción y límites

Driver PTY sintético, cada ruta en un directorio nuevo:

```fish
set base (mktemp -d /tmp/vexart-performance.XXXXXX)
python3 scripts/tmux-performance-pty.py \
  --route=plain --out="$base/plain" --frames=120 --warmup=20 --interval=16.667
python3 scripts/tmux-performance-pty.py \
  --route=tmux --out="$base/tmux" --frames=120 --warmup=20 --interval=16.667
```

La ejecución live del usuario usó este fixture, primero fuera de tmux y luego
dentro de tmux:

```fish
cd /Users/dev/ve/vexart
set route plain
set -q TMUX; and set route tmux
set out (mktemp -d /tmp/vexart-live-$route.XXXXXX)
/usr/bin/env VEXART_NATIVE_PRESENTATION=1 VEXART_NATIVE_LAYER_REGISTRY=1 \
  VEXART_GPU_FORCE_LAYER_STRATEGY=final-frame VEXART_KITTY_SHM_COMPRESSION=0 \
  bun --conditions=browser scripts/tmux-performance-fixture.tsx \
  --live --out=$out --route=$route --frames=300 --warmup=20 --interval=16.667
```

El live usa la terminal real para emitir, pero no mide latencia completa hasta
pantalla ni FPS visibles. No se afirma CPU
agregado de tmux/Kitty: CPU y RSS son del productor; snapshots de memoria no
prueban ausencia de fugas. No hay significancia estadística. Si más adelante se
quiere aislar el impacto de tmux, la comparación deberá repetirse en Kitty con
viewport igual al de la corrida plain. Esa medición queda como trabajo opcional,
no como requisito pendiente de la aceptación actual.

Archivos sintéticos completos y fuentes archivadas: [`experiment.json`](/tmp/vexart-performance-results.Hfs5B9/experiment.json), [`analysis.json`](/tmp/vexart-performance-results.Hfs5B9/analysis.json), [`delivery-analysis.json`](/tmp/vexart-performance-results.Hfs5B9/delivery-analysis.json) y [`source/`](/tmp/vexart-performance-results.Hfs5B9/source/). El manifiesto registra SHA-256 de fixture, driver y `target/release/libvexart.dylib`; no hubo cambios de renderer, showcase o arquitectura.

El dataset sintético v1 precede al modo live y al layout adaptable del fixture
actual. Sus fuentes archivadas preservan la versión realmente medida; las
corridas live usan una escena revisada y no deben mezclarse con ese dataset.
