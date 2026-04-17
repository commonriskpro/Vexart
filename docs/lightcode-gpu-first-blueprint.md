# Lightcode GPU-First Blueprint

## Goal

Construir un **nuevo mock de Lightcode diseñado desde cero para el renderer GPU-first**, en vez de seguir recargando `examples/lightcode.tsx` con efectos cinematográficos que degradan el drag y el pacing.

El objetivo no es “hacerlo lindo” primero.

El objetivo correcto es:

> mantener casi todo el trabajo visual en GPU, reducir al mínimo el CPU residual estructural, y sostener un budget real de rendimiento en Kitty/file.

---

## Non-negotiable truth

No existe “100% GPU absoluto” en este stack terminal.

### Razones estructurales

1. **Kitty no consume texturas GPU nativas**
   - siempre habrá un **late readback** a RGBA CPU-visible antes del output.

2. **Layout / input / scene orchestration**
   - JSX, Clay, focus, input, estado de la app y parte del scene building siguen siendo CPU.

Entonces la meta correcta NO es “CPU = 0”.

La meta correcta es:

> **CPU mínimo estructural + GPU dominante para paint/composición**.

---

## What we already know (verified)

Según `docs/tge-gpu-only-engine-architecture.md` y `docs/tge-current-state-audit-report.md`:

- rects/borders/gradients/glow-shadow genéricos ya tienen path GPU
- common backdrop path ya tiene soporte GPU como ruta principal
- composición final por GPU ya existe
- `final-frame-raw` + single late readback ya existe
- glyph UV path ya fue validado como parte de Step 6A
- canvas/image economics ya mejoraron en Step 6B
- retained reuse ya demostró ~`2ms` estático / ~`12ms` dinámico en el caso sano

### Residual CPU we want to minimize further

1. text strategy legacy que todavía pueda caer a sprites CPU
2. canvas callbacks que generen trabajo CPU evitable
3. transform-heavy subtree paths
4. localized masks/fallbacks que sigan escapando del path común GPU

---

## New artifact to create

## New entrypoint

```txt
examples/lightcode-gpu-first.tsx
```

Este archivo NO debe importar el `lightcode.tsx` cinematizado actual como si fuera solo un wrapper.

Debe ser una escena nueva con reglas explícitas de performance.

### Separation of concerns

- `examples/lightcode.tsx`
  - baseline/legacy/reference harness
- `examples/lightcode-gpu.tsx`
  - wrapper GPU del baseline actual
- `examples/lightcode-gpu-first.tsx`
  - **nuevo mock GPU-first diseñado con budget desde cero**

---

## Performance targets

### Target A — static retained

- objetivo: **~2ms steady median**
- condición:
  - sin repaint real
  - retained reuse funcionando
  - `gpu-auto` o `layered-raw` cuando corresponda

### Target B — dynamic interaction

- objetivo: **~12ms steady median**
- condición:
  - drag/panel move/node interaction
  - `final-frame-raw` o la estrategia que gane de verdad
  - Kitty/file real

### Guardrails

- no aceptar diseño visual que destruya esos budgets
- si un efecto hero rompe el pacing, sale del path principal

---

## Design rules for the new mock

## Rule 1 — No expensive moving glass

### Forbidden on drag surfaces

- `backdropBlur` en paneles draggeables
- sombras enormes dinámicas en paneles draggeables
- glow ancho constante sobre todas las superficies móviles

### Allowed

- gradientes baratos
- border specular sutil
- glow focalizado solo en 1 hero element

---

## Rule 2 — GPU primitives only in the common path

El mock nuevo debe usar principalmente:

- `RECTANGLE`
- `BORDER`
- linear/radial gradients ya soportados
- glow/shadow genérico ya validado
- text glyph path GPU cuando esté disponible
- compositor final GPU

### Avoid

- corner cases de mask compleja sin necesidad
- transforms 2.5D pesadas si no son críticas para el concepto
- composición de muchas capas con efectos simultáneos

---

## Rule 3 — Text must be GPU-friendly

### Preferred path

- glyph UV-atlas path
- textos cortos, estables, con poca churn por frame

### Avoid

- grandes bloques de texto animado
- muchas variaciones tipográficas por frame
- labels que cambien constantemente si no aportan lectura

### Practical interpretation

No queremos “menos texto”.

Queremos:

> **menos texto que invalide sprites/atlas/trabajo por frame**.

---

## Rule 4 — Canvas should behave like scene ops, not CPU painter nostalgia

Si usamos `<canvas>`, debe ser para:

- graph / overlays / hero glow controlado
- shapes y paths que ya tienen ruta WGPU sana

### Avoid

- callbacks canvas que simulen mini-rasterizador CPU arbitrario
- efectos especiales hechos imperativamente si ya existe equivalente declarativo o batcheable

### Long-term direction

Mover cada vez más Lightcode hacia:

> scene ops declarativas y batchables por GPU, en vez de callbacks CPU imperativos.

---

## Rule 5 — Build for retention first

La escena debe pensarse para que el motor pueda reutilizar surfaces retained.

### Practical consequences

- paneles estables no deben repintarse por cambios locales ajenos
- graph y chrome deben estar segmentados con intención
- overlays dinámicos deben ser pocos y baratos

### Desired behavior

- estático: retained reuse casi total
- dinámico: solo cambia el mínimo subconjunto posible

---

## Proposed composition

## Layer model

### Layer 1 — Background field

- fondo espacial o abstracto barato
- sin blur global
- sin animación continua costosa

### Layer 2 — Graph plane

- nodos y edges GPU-friendly
- glow focal en nodo activo
- pocas variaciones de material

### Layer 3 — Hero editor plane

- panel central con fuerte jerarquía visual
- sin blur en movimiento
- gradients y borders bien calibrados

### Layer 4 — Secondary panels

- Memory / Diff / Agent más austeros que el editor hero
- materiales más baratos
- visualmente subordinados

### Layer 5 — Lightweight chrome

- header/footer/status mínimos
- nada de glass pesado full-screen como condición base

---

## CPU residual policy

## CPU allowed

- JSX reconciliation
- Clay layout
- input/focus
- state transitions
- scene graph assembly
- late readback RGBA final
- terminal transmit

## CPU not allowed in the common visual path

- painter de paneles/chrome como ruta principal
- blur/mask/readback intermedio por efecto común
- subtree transform CPU frame-wide si puede evitarse
- canvas raster CPU como camino normal para la escena principal

---

## Validation matrix

## Runtime

```bash
env \
LIGHTCODE_GPU_FIRST=1 \
LIGHTCODE_CANVAS_BACKEND=wgpu \
TGE_GPU_FORCE_LAYER_STRATEGY=final-frame-raw \
TGE_FORCE_TRANSMISSION_MODE=file \
bun --conditions=browser run examples/lightcode-gpu-first.tsx
```

## What to verify

1. **Static retained**
   - steady median cerca de ~`2ms`

2. **Dynamic drag**
   - steady median cerca de ~`12ms`
   - sin sensación de arrastre pesado

3. **Renderer truth**
   - el path dominante realmente es GPU-first
   - no hay fallback CPU escondido en el camino común

4. **Transport truth**
   - Kitty/file como modo recomendado

---

## Build phases

## Phase 0 — Create clean artifact

- crear `examples/lightcode-gpu-first.tsx`
- NO importar el `lightcode.tsx` cinematizado actual como wrapper ciego
- definir scene config separada

## Phase 1 — Fast shell skeleton

- shell liviano
- hero panel base
- graph básico
- sin efectos caros todavía

### Gate

- drag ya debe sentirse sano

## Phase 2 — GPU-friendly hero editor

- editor central como foco visual
- materiales baratos y estables
- text path GPU-friendly

### Gate

- no perder pacing interactivo

## Phase 3 — Graph + overlays

- graph con glow focal
- chip/overlay activo mínimo
- edges/nodes bien batcheados

### Gate

- dinámica sana con node selection

## Phase 4 — Secondary panels

- Memory / Diff / Agent austeros
- nada que compita con hero panel

### Gate

- no destruir static retained

## Phase 5 — Final polish under budget

- solo efectos que entren en budget
- si algo rompe pacing, no entra al default

---

## Explicit anti-patterns

No repetir estas cosas en el nuevo mock:

1. usar `WorkspaceFrame` glass full-screen pesado como base obligatoria
2. blur en paneles draggeables
3. glow/shadow fuerte en todas las superficies móviles
4. meter interaction chrome por todos lados sin valor real
5. usar el harness GPU como wrapper de una escena ya contaminada

---

## Success criteria

El nuevo mock se considera correcto si cumple TODAS estas:

1. se siente claramente GPU-first
2. el drag vuelve a sentirse directo y liviano
3. mantiene el lenguaje visual de Lightcode sin hundir pacing
4. conserva CPU solo para lo estructural
5. la salida final sigue siendo single late readback + Kitty/file

---

## Recommendation

La próxima implementación correcta es esta:

1. restaurar el baseline sano de `examples/lightcode.tsx`
2. crear `examples/lightcode-gpu-first.tsx`
3. construir el nuevo mock con este blueprint, no sobre el archivo ya contaminado

Es así de simple.

No más parches sobre una escena que dejó de respetar el budget.

---

## Current status

- `examples/lightcode-gpu-first.tsx` ya fue creado como **nuevo entrypoint independiente**.
- El primer slice implementado cubre:
  - shell liviano
  - graph base
  - hero editor
  - paneles secundarios austeros
  - header/footer mínimos
- Se verificó que monta con `canvasBackend=wgpu` y bridge disponible.
- Todavía **NO** se considera benchmark cerrado:
  - la muestra actual se corrió fuera de Kitty (`mode=direct`)
  - quedó registrada en `/tmp/lightcode-gpu-first-perf.log`
  - falta validación real en Kitty/file antes de hacer claims de budget.
