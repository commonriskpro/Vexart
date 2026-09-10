# Stress y rendimiento — demo PS5

**Fecha:** 2026-09-09

## Pasada offscreen reproducible

Comando:

```sh
bash scripts/ps5-demo/run-app-source.sh tests/stress.tsx
```

La escena recorre los 24 juegos del catálogo dos veces, inicia los 18
instalados, cambia a título, abre/cierra el Centro de control y visita
Biblioteca/Ajustes antes de volver a Inicio. Cada viewport produce 236 acciones
y 237 frames medidos.

| Viewport | Tiempo total | p50 frame | p95 frame | Máximo | Estado final |
|---|---:|---:|---:|---:|---|
| 1280×720 | 2867 ms | 7.36 ms | 16.51 ms | 40.46 ms | home, sin overlays |
| 1920×1080 | 1916 ms | 5.93 ms | 11.50 ms | 21.00 ms | home, sin overlays |

La pasada confirma píxeles significativos, rango RGB completo, retorno a Inicio
y cierre de overlays. El reporte bruto queda en
[`stress-report.json`](../../scripts/ps5-demo/artifacts/stress-report.json).
La salida de la ejecución queda en
[`final-stress.log`](../../scripts/ps5-demo/artifacts/final-stress.log).

Estos tiempos son métricas **offscreen del host actual**, no FPS visibles ni
latencia de entrada de una terminal. No se convierten en una certificación de
60/120 FPS, memoria o p95 físico; pueden variar entre ejecuciones por caché y
disponibilidad del GPU.

## Paquete y GPU

- El paquete principal y el paquete nativo `darwin-arm64` se empaquetaron como
  tarballs actuales; un consumidor limpio instaló ambos, compartió el
  reconciliador Solid, validó el bridge `133888` y creó/destruyó el backend GPU.
  La salida está en [`final-tarball-consumer.log`](../../scripts/ps5-demo/artifacts/final-tarball-consumer.log).
- `run-app-packaged.sh verify` también pasó con escenas GPU reales a 1280×720 y
  1920×1080.
  La salida está en [`final-packaged-verify.log`](../../scripts/ps5-demo/artifacts/final-packaged-verify.log).
- La máquina disponible expone **Apple M4 / Metal 4**. No se ejecutó una matriz
  física en AMD, NVIDIA, Intel, Linux o Windows; esa cobertura requiere hosts o
  CI adicionales. El check actual queda marcado como `current-host-only`.
- Kitty físico no se ejecutó en esta tarea; no se sustituye con CUA, PTY o
  afirmaciones de rendimiento visible.

## Próximo gate externo

Para cerrar la preview fuera de este host todavía hace falta repetir el smoke
del tarball, la pasada de estrés y una captura manual en Kitty en cada GPU/OS
que se quiera soportar. No es un blocker de la demo local ni requiere cambiar
la API pública.
