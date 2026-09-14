# Plan de Implementación: SGR-Pixel (Mode 1016)

## Contexto

Vexart es un engine de UI GPU-rendered que produce píxeles exactos, pero recibe coordenadas de mouse cuantizadas a celdas de terminal (~8×16px). La conversión actual `(cell + 0.5) * cellSize` introduce un error de **±½ celda** (~±4px horizontal, ±8px vertical), lo que degrada el hit-testing en elementos pequeños, bordes, sliders, y esquinas redondeadas.

SGR-Pixel (mode 1016) elimina esta cuantización: el terminal reporta coordenadas en píxeles reales usando el **mismo formato de escape** que SGR 1006, haciendo la migración quirúrgica y limpia.

## Diferencia de protocolo

| | SGR 1006 (actual) | SGR-Pixel 1016 (objetivo) |
|---|---|---|
| Formato | `\x1b[<btn;X;Y{M\|m}` | `\x1b[<btn;Px;Py{M\|m}` |
| Coordenadas | Columna/fila de celda (1-based) | Píxeles desde top-left del viewport (1-based o 0-based según terminal) |
| Activación | `\x1b[?1006h` | `\x1b[?1016h` |
| Button encoding | Idéntico | Idéntico |
| Press/Release | `M`/`m` | `M`/`m` |

**Variación crítica de origen**: Kitty/Ghostty reportan **0-based**, WezTerm/foot/xterm/Contour reportan **1-based**.

## Arquitectura objetivo

```
stdin bytes
  → parser.ts (detecta SGR escape, sin cambio de regex)
    → mouse.ts (interpreta coords según modo activo: pixel directo o cell→pixel)
      → mount.ts (pasa coords a feedPointer — ya NO hace cell×cellSize)
        → hit-testing (coords ya son píxeles reales, precisión sub-celda)
```

## Fases de implementación

### Fase 1: Capabilities — Agregar `mousePixel` a `Capabilities`

**Archivo**: `packages/engine/src/terminal/caps.ts`

Agregar campos:
- `mousePixel: boolean` — indica si el terminal soporta mode 1016
- `mousePixelOrigin: 0 | 1` — 0 para Kitty/Ghostty (0-based), 1 para WezTerm/foot/xterm (1-based)

Inferencia estática en `inferCaps()`:

| Terminal | `mousePixel` | `mousePixelOrigin` | Razón |
|---|---|---|---|
| `kitty` | `true` | `0` | Soporte completo, 0-based |
| `ghostty` | `true` | `0` | Soporte completo, 0-based |
| `herdr` | `true` | `0` | Kitty-compatible |
| `wezterm` | `true` | `1` | Soporte completo, 1-based |
| `foot` | `true` | `1` | Soporte completo, 1-based |
| `contour` | `true` | `1` | Soporte completo, 1-based |
| `iterm2` | `false` | `1` | DECRQM roto |
| `alacritty` | `false` | `1` | Rechazado (wontfix) |
| `xterm` | `false` | `1` | Catch-all genérico |

**Regla tmux**: Si `caps.tmux === true`, forzar `mousePixel = false`.

### Fase 2: Lifecycle — Activación/desactivación de 1016

**Archivo**: `packages/engine/src/terminal/lifecycle.ts`

Hacer dinámicas las secuencias de mouse según `caps.mousePixel`:
- Si `mousePixel` → `\x1b[?1003h\x1b[?1016h` / `\x1b[?1016l\x1b[?1003l`
- Si no → `\x1b[?1003h\x1b[?1006h` / `\x1b[?1006l\x1b[?1003l`

Exclusivo, no stack. Comportamiento determinista.

### Fase 3: Parser — Enseñar a `parseMouse` el modo activo

**Archivo**: `packages/engine/src/input/mouse.ts`

El regex no cambia — formato idéntico entre 1006 y 1016.

`parseMouse` recibe `coordMode: "cell" | "pixel"` y `pixelOrigin: 0 | 1`:
- En modo `"pixel"`: `x = raw - pixelOrigin`, `y = raw - pixelOrigin`
- En modo `"cell"`: `x = raw - 1`, `y = raw - 1` (sin cambio)

**Archivo**: `packages/engine/src/input/types.ts`

Agregar `pixel: boolean` a `MouseEvent` para indicar si x/y son píxeles.

**Archivo**: `packages/engine/src/input/parser.ts`

`createParser` recibe `coordMode`/`pixelOrigin` y los pasa a `parseMouse`.

### Fase 4: Mount — Eliminar conversión cell→pixel en modo pixel

**Archivo**: `packages/engine/src/mount.ts`

Branch condicional:
- Si `event.pixel`: `feedPointer(event.x, event.y, ...)` directo
- Si no: `feedPointer((event.x + 0.5) * cellWf, (event.y + 0.5) * cellHf, ...)`

### Fase 5: DevTools — Actualizar MCP click

Adaptar devtools `vexart_click` para coords pixel-mode.

### Fase 6: Tests

- Tests de `parseMouse` con ambos modos y ambos orígenes
- Test de round-trip pixel directo vs cell→pixel
- Edge cases: (0,0) 0-based, (1,1) 1-based, coords fuera de viewport

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `packages/engine/src/terminal/caps.ts` | Agregar `mousePixel`, `mousePixelOrigin` |
| `packages/engine/src/terminal/lifecycle.ts` | Secuencias dinámicas `1016h`/`1006h` |
| `packages/engine/src/input/mouse.ts` | `parseMouse` acepta `coordMode` + `pixelOrigin` |
| `packages/engine/src/input/types.ts` | Agregar `pixel: boolean` a `MouseEvent` |
| `packages/engine/src/input/parser.ts` | Pasar `coordMode`/`pixelOrigin` a `parseMouse` |
| `packages/engine/src/mount.ts` | Branch condicional pixel/cell |
| DevTools entrypoints | Adaptar click sintético |
| Tests de mouse | Nuevas variantes pixel-mode |

## Archivos NO tocados

| Archivo | Razón |
|---|---|
| `packages/engine/src/loop/loop.ts` | `feedPointer` ya recibe píxeles |
| `packages/engine/src/loop/layout.ts` | Hit-testing ya opera en píxeles |
| `packages/engine/src/reconciler/hit-test.ts` | `buildNodeMouseEvent` ya opera en píxeles |
| `packages/engine/src/terminal/detect.ts` | Detección por env vars no cambia |
| `packages/engine/src/terminal/size.ts` | Cell size query sigue necesario para layout/output |
| `native/libvexart/` | Rust no participa en input parsing |

## Decisiones tomadas

1. **Solo inferencia estática** (sin DECRQM probe) — Vexart usa inferencia estática para todo, conjunto cerrado de terminales.
2. **Modo exclusivo** (no stack 1006+1016) — comportamiento determinista, detección estática confiable.
3. **`mousePixelOrigin` como campo de Capabilities** — lógica de terminal aislada en caps.ts, parser genérico.

## Orden de ejecución

```
1. caps.ts          — Agregar campos (aditivo)
2. types.ts         — Agregar pixel:boolean a MouseEvent (aditivo)
3. mouse.ts         — Refactor parseMouse signature
4. parser.ts        — Adaptar caller de parseMouse
5. mount.ts         — Branch condicional pixel/cell
6. lifecycle.ts     — Secuencias dinámicas
7. Tests            — Actualizar y agregar
8. DevTools         — Adaptar click sintético
```

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| tmux no soporta 1016 | Clicks rotos en tmux | `mousePixel = false` cuando `caps.tmux` |
| Alacritty ignora 1016 | Sin mouse si exclusivo | Inferencia estática: `mousePixel = false` |
| 0-based vs 1-based mal calibrado | Offset de 1px | `mousePixelOrigin` per-terminal |
| Terminal desconocido | Default a 1006 (safe) | `mousePixel` defaults to `false` |
| Font size change en runtime | Cell dims stale (pre-existente) | Fuera de scope |

