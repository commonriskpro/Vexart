# TGE GPU-Native Remaining Architecture

## Goal

Documentar qué parte del path oficial ya es realmente GPU-native, qué parte todavía no, y cómo deberíamos pensar las funciones restantes para implementarlas **sin volver a introducir raster CPU** en el core oficial.

For the exact file-by-file redesign needed to reach GPU-native end-to-end from the current state, see:

- `docs/tge-gpu-native-end-to-end-redesign.md`

Este documento NO es una wishlist vaga.
Es un mapa de diseño para decidir qué helpers deben:

- sobrevivir,
- reescribirse,
- moverse a compat,
- o desaparecer.

---

## Reality check

### What is already true

En el path oficial:

- `cpu-renderer-backend.ts` ya no existe,
- el loop oficial ya no sostiene single-buffer fallback,
- `layer-composer.ts` quedó raw-only,
- canvas en `gpu-renderer-backend.ts` ya no cae silenciosamente a raster CPU,
- `render-graph.ts` ya usa `renderObjectId` para `image` / `canvas` / `effect`.

### What is NOT done yet

Ya podemos decir que el path oficial quedó materialmente GPU-native end to end en arquitectura.

Lo que todavía NO está resuelto es la cobertura funcional faltante:

- subtree transforms retained/nested ya tienen un pass GPU-native basado en layer boundaries + final GPU composition, aunque todavía falta endurecer su cobertura/ergonomía,
- `CanvasContext` todavía vivo como modelo retained/compat,
- el painter backend `wgpu-canvas-backend.ts` todavía conserva fallbacks/raster que no pueden confundirse con el core oficial,
- el texto rasterizado sobrevive en compat (`createGpuTextImage()`), aunque ya no debe gobernar el renderer oficial.

---

## Canonical mental model

La arquitectura objetivo para el core oficial debe pensarse así:

```txt
loop
  -> render-graph
  -> gpu-renderer-backend
  -> gpu-frame-composer
  -> layer-composer (raw-only)
  -> kitty
```

Y dentro del renderer:

```txt
GPU targets
  -> GPU layers
  -> GPU images
  -> GPU compositor state
  -> readback RGBA only at the final boundary
```

La pregunta correcta ya NO es:

> "¿cómo hacemos fallback?"

La pregunta correcta es:

> "¿esta función describe una capacidad GPU-native real o está materializando bytes raster transicionales?"

---

## Remaining capability matrix

| Capability | Official path today | Status | What should happen next |
| --- | --- | --- | --- |
| Rects / rounded rects / gradients / glow / circles / polygons / beziers | GPU mixed-scene path | strong | keep GPU-native |
| Image compositing | GPU image path | strong | keep GPU-native |
| Canvas with supported mixed-scene ops | GPU target -> copy-to-image | strong transitional | keep until direct retained GPU canvas model exists |
| Empty canvas sprite | GPU clear target -> copy-to-image | acceptable transitional | keep if needed |
| Canvas with unsupported commands in official renderer | fail-fast | correct | replace by GPU-native implementation, not CPU fallback |
| Text in official renderer | GPU glyph atlas path or fail-fast | materially improved | keep expanding GPU-native text coverage without restoring CPU fallback |
| Subtree transforms | GPU layer boundary + final transformed image composition | materially complete | harden edge cases and extend coverage |
| Final Kitty presentation | GPU target -> readback RGBA -> raw bytes -> Kitty | intentional boundary | keep |

---

## Remaining functions: keep, replace, move, remove

### `packages/renderer/src/gpu-raster-staging.ts`

#### `createGpuTextImage()`

### Current behavior
- text
- `createTextRasterSurface()`
- `paint.drawText()`
- upload to GPU image

### Decision
**Move to compat-only usage.**

### Why
This is still:

```txt
text -> raster CPU surface -> GPU image
```

Eso contradice la dirección GPU-native del core oficial si vuelve a usarse ahí.

### Target model
- official renderer -> glyph atlas GPU path or fail-fast
- compat painter backend -> may still use this temporarily
- no silent CPU raster fallback in `gpu-renderer-backend.ts`

---

#### `createEmptyGpuImage()`

### Decision
**Keep.**

### Why
No materializa raster CPU.
Es GPU clear + copy-to-image.
Eso es una transición razonable mientras el sprite model todavía necesita image handles.

---

#### `copyGpuTargetRegionToImage()`

### Decision
**Keep as transitional GPU-native helper.**

### Why
No introduce raster CPU.
Convierte target GPU en image GPU.
Es staging, sí, pero staging GPU-to-GPU.

---

#### `uploadRasterDataToTarget()`

### Decision
**Shrink or move toward compat-only over time.**

### Why
Su contrato sigue partiendo de raw RGBA externo.
Puede ser útil para boundaries transicionales, pero no debería crecer como API conceptual del core.

---

#### `readbackTargetToSurface()` / `compositeTargetReadbackToSurface()`

### Decision
**Keep only as explicit readback boundary helpers.**

### Why
El readback final sí es real y necesario para Kitty.
Lo incorrecto sería usar estos helpers para volver a meter lógica raster intermedia en el renderer.

---

### Subtree transform support

### Current behavior
- subtree/nested retained transforms no longer use surface staging in the official path
- transformed subtrees are promoted to GPU layer boundaries
- final-frame GPU composition applies the subtree transform quad over the retained layer target

### Decision
**Keep this as the official subtree transform path.**

### Next work
- harden nested/edge cases
- decide whether transformed subtree layers should always force final-frame composition or gain a future optimized layered path
- expand tests/examples around transformed retained hierarchies

---

### `packages/renderer/src/canvas.ts`

#### `CanvasContext`

### Decision
**Keep as compat/lab boundary, not as official renderer model.**

### Why
Todavía sostiene `SceneCanvas` y ejemplos retained relevantes.
Pero no debe volver a justificar raster CPU en el core oficial.

---

## Recommended GPU-native implementation direction

## 1. Text first

Este es el siguiente frente grande.

### Short-term rule
- official renderer text uses glyph atlas GPU path
- official renderer fail-fast for unsupported text cases
- compat painter backend may keep raster text temporarily, but that is NOT the official path

### Proper target
- atlas-backed glyph rendering for the covered charset/font families
- explicit segmentation between:
  - GPU atlas text,
  - future GPU image/glyph-run path,
  - compat-only text fallback outside the official core path

### Why text first
Porque el siguiente salto de calidad ya no es “sacar fallback CPU del core oficial” — eso ya se cortó — sino ampliar la cobertura GPU-native del texto sin volver a depender de compat raster.

---

## 2. Transform hardening second

Una vez que texto deje de depender del raster staging oficial, el siguiente frente fuerte es:

- endurecer subtree/nested transforms sobre layers/images retenidas
- cubrir mejor casos de composición avanzada sin reintroducir compat raster

---

## 3. Canvas semantics third

Después de eso recién conviene decidir si:

- `CanvasContext` sobrevive sólo como compat/lab,
- o si parte de sus comandos merecen una API retained GPU-native distinta.

No mezclar esta decisión con el texto ni con transforms.
Son problemas distintos.

---

## Architecture rules from now on

1. No new CPU raster fallback in the official renderer path.
2. If an op is unsupported in GPU-native form, prefer fail-fast over silent software fallback.
3. GPU-to-GPU staging is acceptable as transition; CPU raster staging is not acceptable in the official path.
4. Readback is allowed only as an explicit boundary to Kitty or explicit diagnostics.
5. `CanvasContext` may survive publicly, but it must not dictate the internal architecture of the core renderer.

---

## Immediate next decisions

### Decision A — official text policy

Choose one explicit rule for `gpu-renderer-backend.ts`:

- **Option 1:** glyph-atlas only + fail-fast for unsupported text
- **Option 2:** implement broader GPU-native text path before removing the fallback

### Decision B — transform policy

The subtree transform pass now exists.

The remaining decision is optimization policy:

- **Option 1:** keep forcing final-frame composition when transformed subtree layers exist
- **Option 2:** later add a more optimized transformed-layer presentation path without changing the GPU-native architecture

---

## Bottom line

El canvas oficial ya dejó de esconder raster CPU.
El texto oficial también dejó de caer silenciosamente a raster CPU.

Lo que sigue vivo ahora es texto raster en el painter/compat path, no en el renderer oficial.

Por eso, el siguiente objetivo GPU-native serio del core oficial debería ser:

> expand GPU-native text coverage so fail-fast becomes less necessary,
> then harden the new GPU-native subtree transform pass and widen unsupported canvas coverage.
