# TGE GPU End-to-End — Execution Plan

## Purpose

Este documento es un playbook de ejecución, no un análisis.
Asume que el análisis ya está hecho (`docs/tge-gpu-native-remaining-architecture.md`).

Objetivo de este doc:

> Llegar a GPU end-to-end real en **una sola sesión de trabajo continua**.

Cada fase tiene: qué hacer, en qué archivo, cómo verificar que quedó.
Sin ambigüedad. Sin decisiones diferidas.

---

## Estado de partida (verificado post-refactor/gpu-only-package-migration)

### Ya GPU-native — no tocar

- `runtime/src/loop.ts` — no sostiene raw bytes por layers
- `core/src/layers.ts` — `Layer` no tiene `surface: RasterSurface`
- `core/src/gpu-renderer-backend.ts` — no llama `createGpuTextImage`, no usa `RasterSurface`
- `core/src/render-graph.ts` — todos los ops hablan `renderObjectId`
- `core/src/renderer-backend.ts` — contrato correcto, `buffer` es alias vacío
- Path oficial: `render-graph → gpu-renderer-backend → gpu-frame-composer → kitty`

### Todavía no resuelto

Los 3 blockers de limpieza y 3 gaps funcionales detallados abajo.

---

## Fase 1 — Eliminar el alias `ctx.buffer` del contrato oficial

**Objetivo**: el `RendererBackendPaintContext` debe tener un solo campo para las dimensiones del target GPU. Hoy tiene `target` y `buffer` (alias vacío de compat).

### Archivo

`packages/core/src/renderer-backend.ts`

### Qué hacer

1. Borrar el campo `buffer: { width: number; height: number }` del tipo `RendererBackendPaintContext`.
2. Buscar todos los usos de `ctx.buffer` en el codebase.
3. Reemplazar cada `ctx.buffer.width` / `ctx.buffer.height` por `ctx.target.width` / `ctx.target.height`.

### Búsqueda de usos

```
grep -rn "ctx\.buffer\." packages/ --include="*.ts"
```

### Verificación

```
bun typecheck
```

Cero errores de TypeScript = fase completa. Si hay usos en compat paths (`wgpu-canvas-backend.ts`, `canvas-raster-painter.ts`), actualizar también — esos archivos van a moverse en Fase 3 de todos modos.

---

## Fase 2 — Sacar `createGpuTextImage` de `core/`

**Objetivo**: `core/src/gpu-raster-staging.ts` no debe exportar helpers que materializan CPU raster. `createGpuTextImage` hace `text → CPU raster → GPU upload` — es compat, no core.

### Archivos involucrados

- `packages/core/src/gpu-raster-staging.ts` — origen
- `packages/compat-canvas/src/index.ts` — destino de re-export
- `packages/core/src/wgpu-canvas-backend.ts` — único consumidor actual

### Qué hacer

1. Mover las funciones privadas `createTextRasterSurface` y la función pública `createGpuTextImage` de `gpu-raster-staging.ts` a un nuevo archivo:
   `packages/compat-canvas/src/gpu-text-compat.ts`

2. En `compat-canvas/src/gpu-text-compat.ts` los imports cambian:
   - `createRasterSurface` → `"../../core/src/render-surface"`
   - `paint` → `"../../core/src/pixel-buffer"`
   - `createWgpuCanvasImage` → `"../../core/src/wgpu-canvas-bridge"`

3. En `packages/core/src/gpu-raster-staging.ts`: borrar `createGpuTextImage` y `createTextRasterSurface`.

4. En `packages/core/src/wgpu-canvas-backend.ts`: actualizar el import de `createGpuTextImage`:
   ```ts
   // antes
   import { createGpuTextImage, readbackTargetToSurface } from "./gpu-raster-staging"
   // después
   import { createGpuTextImage } from "../../compat-canvas/src/gpu-text-compat"
   import { readbackTargetToSurface } from "./gpu-raster-staging"
   ```

5. Re-exportar desde `packages/compat-canvas/src/index.ts`:
   ```ts
   export { createGpuTextImage } from "./gpu-text-compat"
   export type { GpuRasterImage } from "../../core/src/gpu-raster-staging"
   ```

### Verificación

```
bun typecheck
grep -rn "createGpuTextImage" packages/core/src/
```

El segundo comando debe devolver cero resultados.

---

## Fase 3 — Mover `wgpu-canvas-backend.ts` de `core/` a `compat-canvas/`

**Objetivo**: el painter backend de CanvasContext es compat, no core oficial. Su presencia en `core/src/` lo hace parte del mental model equivocado.

### Archivos involucrados

- `packages/core/src/wgpu-canvas-backend.ts` — origen
- `packages/compat-canvas/src/` — destino
- `packages/core/src/canvas-backend.ts` — define `CanvasPainterBackend`, lo referencia
- `packages/core/src/index.ts` — puede exportar el backend hoy

### Qué hacer

1. Mover `packages/core/src/wgpu-canvas-backend.ts` →
   `packages/compat-canvas/src/wgpu-canvas-backend.ts`

2. Ajustar todos los imports internos del archivo movido:
   - `"./render-surface"` → `"../../core/src/render-surface"`
   - `"./canvas-backend"` → `"../../core/src/canvas-backend"`
   - `"./canvas"` → `"../../core/src/canvas"`
   - `"./canvas-raster-painter"` → `"../../core/src/canvas-raster-painter"`
   - `"./font-atlas"` → `"../../core/src/font-atlas"`
   - `"./text-layout"` → `"../../core/src/text-layout"`
   - `"./gpu-raster-staging"` → `"../../core/src/gpu-raster-staging"`
   - `"./wgpu-canvas-bridge"` → `"../../core/src/wgpu-canvas-bridge"`
   - `"./wgpu-mixed-scene"` → `"../../core/src/wgpu-mixed-scene"`
   - `"./gpu-text-compat"` → `"./gpu-text-compat"` (mismo dir, Fase 2)

3. Verificar que `packages/core/src/index.ts` ya no exporta `tryCreateWgpuCanvasPainterBackend` / `getWgpuCanvasPainterCacheStats` directamente — si lo hace, mover esos exports a `compat-canvas/src/index.ts`.

4. `packages/compat-canvas/src/index.ts` ya re-exporta estas funciones:
   ```ts
   export { tryCreateWgpuCanvasPainterBackend, getWgpuCanvasPainterCacheStats } from "./wgpu-canvas-backend"
   ```
   Verificar que el import apunta al archivo movido, no al viejo core path.

### Búsqueda de usos del archivo viejo

```
grep -rn "wgpu-canvas-backend" packages/ --include="*.ts" | grep -v "compat-canvas"
```

Todos deben apuntar a `compat-canvas`, no a `core`.

### Verificación

```
bun typecheck
```

---

## Fase 4 — Mover `canvas-raster-painter.ts` de `core/` a `compat-canvas/`

**Objetivo**: CPU rasterization de canvas commands no es core oficial. Solo la usa el compat painter backend.

### Archivos involucrados

- `packages/core/src/canvas-raster-painter.ts` — origen
- `packages/compat-canvas/src/` — destino

### Qué hacer

1. Mover `packages/core/src/canvas-raster-painter.ts` →
   `packages/compat-canvas/src/canvas-raster-painter.ts`

2. Ajustar imports del archivo movido:
   - `"@tge/pixel"` → se queda igual (paquete externo)
   - `"./canvas-backend"` → `"../../core/src/canvas-backend"`
   - `"./canvas"` → `"../../core/src/canvas"`

3. En el archivo que quedó en `core/` (`canvas.ts`): actualizar el import de `paintCanvasCommandsToRasterSurface`:
   ```ts
   // antes
   import { paintCanvasCommandsToRasterSurface } from "./canvas-raster-painter"
   // después
   import { paintCanvasCommandsToRasterSurface } from "../../compat-canvas/src/canvas-raster-painter"
   ```
   **Nota**: si `canvas.ts` usa eso únicamente en paths de compat/fallback, esa dependencia cruzada es aceptable transitoriamente.

4. En `wgpu-canvas-backend.ts` (ya en `compat-canvas/` después de Fase 3): actualizar el import:
   ```ts
   import { paintCanvasCommandsCPU } from "./canvas-raster-painter"
   ```

### Verificación

```
bun typecheck
grep -rn "canvas-raster-painter" packages/core/src/ --include="*.ts"
```

El segundo comando debe devolver cero (o solo una referencia en `canvas.ts` que cruza a compat — documentar si queda).

---

## Fase 5 — Verificar texto con `supportsWgpuCanvasGlyphLayer = false`

**Objetivo**: garantizar que no existe fallback silencioso a CPU raster cuando el bridge no soporta glyph rendering. El path oficial dice "fail-fast".

### Qué buscar

```
grep -n "supportsWgpuCanvasGlyphLayer\|isSupportedText\|failGpuOnly" \
  packages/core/src/gpu-renderer-backend.ts
```

### Qué debe estar pasando

En `gpu-renderer-backend.ts`, el handler de `TextRenderOp` debe:

1. Llamar `supportsWgpuCanvasGlyphLayer()` al inicio.
2. Si retorna `false`: llamar `failGpuOnly(...)` — no hay rama de fallback a `createGpuTextImage` ni a `paintCanvasCommandsCPU`.
3. Si retorna `true`: ejecutar `renderWgpuCanvasTargetGlyphsLayer(...)`.

Si hay cualquier rama `else` que termine en CPU raster, es un bug de arquitectura.

### Fix si existe fallback

Reemplazar la rama else con:
```ts
failGpuOnly("text rendering requires glyph atlas support — bridge does not support glyph layer")
```

### Verificación

Buscar cualquier referencia a `createGpuTextImage` dentro de `gpu-renderer-backend.ts`:
```
grep -n "createGpuTextImage" packages/core/src/gpu-renderer-backend.ts
```

Debe devolver cero resultados.

---

## Fase 6 — Decidir y documentar `CanvasContext` / `canvas.ts`

**Objetivo**: `core/src/canvas.ts` define `CanvasContext` y vive en el core oficial. Según los docs de arquitectura es compat/lab. Esta fase documenta y aísla esa decisión.

### Evaluación (leer antes de tocar)

```
grep -n "CanvasContext\|canvas\.ts" packages/core/src/gpu-renderer-backend.ts | head -10
grep -n "CanvasContext\|canvas\.ts" packages/runtime/src/loop.ts | head -10
```

### Decisión A — Si `CanvasContext` solo aparece en paths de compat canvas nodes

`canvas.ts` puede quedarse en `core/src/` con un comment header explícito:

```ts
/**
 * CanvasContext — compat/lab boundary.
 *
 * This is NOT the canonical rendering model for TGE.
 * It exists to support imperative canvas APIs (SceneCanvas, etc.)
 * without dictating the internal architecture of the GPU renderer.
 *
 * The official GPU path does not center canvas semantics.
 * New rendering features must be implemented through render-graph ops,
 * not through CanvasContext extensions.
 */
```

### Decisión B — Si `CanvasContext` aparece como base de razonamiento del renderer oficial

Mover `canvas.ts` a `compat-canvas/src/` y actualizar todos los imports.

### Qué registrar en este doc

Al terminar esta fase, anotar en la sección "Decisiones tomadas" al final cuál de las dos opciones se tomó.

---

## Fase 7 — Renombrar `RendererBackendPaintResult.output` (naming cleanup)

**Objetivo**: el valor `"raw-layer"` en el contrato del backend suena como si el modelo interno fuera raw bytes. La semántica real es "payload de presentación Kitty".

### Archivo

`packages/core/src/renderer-backend.ts`

### Cambio

```ts
// antes
output: "raw-layer" | "skip-present"

// después
output: "kitty-payload" | "skip-present"
```

Y en `rawLayer` → `kittyPayload`:

```ts
// antes
rawLayer?: { data: Uint8Array; width: number; height: number }

// después
kittyPayload?: { data: Uint8Array; width: number; height: number }
```

### Búsqueda de todos los usos a actualizar

```
grep -rn '"raw-layer"\|\.rawLayer\b' packages/ --include="*.ts"
```

Actualizar cada sitio. Principalmente `gpu-renderer-backend.ts` y `loop.ts`.

### Verificación

```
bun typecheck
```

---

## Verificación final de sesión

Después de completar las 7 fases, ejecutar:

```bash
# 1. TypeScript sin errores
bun typecheck

# 2. Ningún helper raster CPU en el core oficial
grep -rn "createGpuTextImage\|createRasterSurface\|paintCanvasCommandsCPU" \
  packages/core/src/ --include="*.ts"

# 3. ctx.buffer eliminado del contrato
grep -rn "ctx\.buffer\b" packages/ --include="*.ts"

# 4. wgpu-canvas-backend no en core
ls packages/core/src/wgpu-canvas-backend.ts 2>/dev/null && echo "FAIL: still in core" || echo "OK: moved"

# 5. canvas-raster-painter no en core
ls packages/core/src/canvas-raster-painter.ts 2>/dev/null && echo "FAIL: still in core" || echo "OK: moved"

# 6. No fallback silencioso en text path
grep -n "createGpuTextImage" packages/core/src/gpu-renderer-backend.ts
```

Cada comando debe devolver cero resultados o "OK". Si alguno falla, la sesión no terminó.

---

## Exit criteria de la sesión completa

- [ ] `bun typecheck` — cero errores
- [ ] `ctx.buffer` no existe en ningún archivo de `packages/`
- [ ] `createGpuTextImage` no existe en `packages/core/src/`
- [ ] `wgpu-canvas-backend.ts` vive en `compat-canvas/`, no en `core/`
- [ ] `canvas-raster-painter.ts` vive en `compat-canvas/`, no en `core/`
- [ ] `RendererBackendPaintResult.output` dice `"kitty-payload"`, no `"raw-layer"`
- [ ] Texto sin soporte de glyph layer → `failGpuOnly`, no CPU fallback
- [ ] `CanvasContext` tiene header de compat documentado (o se movió a compat-canvas)

---

## Decisiones tomadas

*(completar al ejecutar)*

- Fase 6 — CanvasContext: `[ ] quedó en core con header | [ ] movido a compat-canvas`

---

## Qué NO hace este plan

Este plan NO implementa capacidades nuevas.

Cuando termines las 7 fases, el engine tiene el mismo comportamiento funcional pero con ownership limpio.

El siguiente trabajo después de este plan es capacidad:

- Text: ampliar cobertura GPU-native del glyph atlas
- Transforms: hardening de subtree/nested transform edge cases
- Canvas: decidir si `CanvasContext` sobrevive como compat permanente o evoluciona a una API retained GPU-native

Ese trabajo es otro documento.
