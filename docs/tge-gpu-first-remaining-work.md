# TGE GPU-First — Remaining Work

## Goal

Cerrar la brecha entre la arquitectura ya migrada a `RenderGraphOp -> RendererBackend` y un renderer realmente GPU-first para todo el chrome/panel path, no sólo canvas.

---

## Already done

- `RenderCommand -> RenderGraphOp -> RendererBackend` ya existe.
- CPU/GPU renderer backends ya consumen `ctx.graph.ops`.
- `paintCommand()` ya despacha principalmente por `RenderGraphOp.kind`.
- Ya se extrajeron helpers legacy para:
  - `border`
  - `text`
  - `image`
  - `canvas`
- Canvas WGPU ya existe como backend híbrido separado.

---

## What still blocks real GPU-first

## 1. Finish CPU backend decomposition

El backend CPU todavía depende demasiado del bloque gigante de `paintCommand()` para:

- `rectangle`
- `effect`
  - shadow
  - glow
  - gradient fill
  - backdrop filters
  - opacity
  - transform

### Needed

- `paintRectangleRenderOp(...)`
- `paintEffectRenderOp(...)`
- helpers internos para:
  - image mask / rounded mask
  - glow temp-pass
  - shadow temp-pass
  - backdrop filter pass
  - rectangle fill/gradient pass
  - transform/opacity composite pass

### Done when

- `paintCommand()` queda como adaptador transicional o desaparece de la ruta principal.

---

## 2. Implement GPU renderer backend for generic UI ops

Hoy el backend GPU del renderer general es transicional.

### First real GPU ops to implement

- `rectangle`
- `border`
- `image`
- `text` (sprite path)
- `effect` subset:
  - gradient
  - glow
  - shadow

### Done when

- panels/chrome se renderizan por GPU aunque backdrop/transform complejos sigan cayendo a CPU.

---

## 3. Introduce generic WGPU box/effect bridge path

El bridge WGPU hoy está fuertemente orientado a canvas. Falta un path general de renderer UI.

### Needed

- batched draw APIs para:
  - rounded rect fill/stroke
  - gradient rect
  - image quad
  - text sprite quad
  - glow/shadow
- target/layer orchestration explícita para renderer UI, no sólo canvas

---

## 4. GPU compositor for layers

### Needed

- decisión por frame:
  - `layered-raw`
  - `final-frame-raw`
- targets GPU por layer o frame final
- composición GPU antes del readback

### Done when

- el caso común usa un único readback tardío.

---

## 5. Late readback default policy

### Needed

- una política real basada en:
  - dirty layer count
  - dirty pixel area
  - full repaint
  - overlapping regions

### Done when

- el renderer general puede elegir raw layered vs final frame con heurística real.

---

## 6. Advanced effects — updated direction

La decisión nueva para backdrop es importante y cambia la manera de encarar Etapa 3.

### Decisión

Para `backdropBlur` y backdrop filters, el camino correcto NO es seguir extendiendo el bridge CPU actual como si fuera la solución final.

El camino correcto es:

> **backdrop GPU real por surfaces retenidas + pass graph explícito**

Eso significa:

- materializar o reusar una `backdrop source surface` en GPU,
- correr blur/filter como un pass GPU explícito,
- recomponer el resultado en el target destino,
- reusar la source surface cuando el fondo sampleado no cambió.

### Lo que esto NO significa

No significa “hacer ya todo el compositor final”.

Lo correcto es introducir primero un modelo mínimo de retained surfaces para backdrop, sin tragarse todavía toda la Etapa 4.

### Qué sigue quedando para más tarde

- subtree transforms post-pass equivalentes en GPU para casos más generales
- partial region readback sólo cuando de verdad gane
- compositor final completamente retained para todo el frame

---

## Recommended implementation order

### Etapa 1 — completar ops rentables

- rect
- border
- image
- text sprite
- gradients
- glow
- shadow

### Etapa 2 — composición más continua

- menos fallback
- más continuidad GPU
- mejores batches
- menos readback

### Etapa 3 — effects avanzados

- backdrop blur
- backdrop filters
- transforms complejos

### Etapa 3.5 — retained backdrop foundation

- backdrop source surfaces retenidas
- crop/sample/output bounds explícitos
- `backdropSourceKey` / identidad de fuente sampleada
- pass graph mínimo para backdrop GPU
- reemplazo del branch actual `syncCpuBufferFromTarget() -> fallbackPaintOp() -> restartLayerFromCpuBuffer()`

### Etapa 4 — compositor final

- layers retained
- late readback único
- estrategia final de output

---

## Success milestone

El milestone serio no es “más canvas WGPU”.

El milestone serio es:

> `Lightcode stage 5` con panels/chrome mayormente renderizados por GPU, y un late readback final como ruta principal.

---

## Fluidez — mapa mental para seguir el trabajo

La referencia correcta no es “usar GPU” sino “sentirse como un browser moderno”.

## Browser moderno

```txt
DOM/React
  → style/layout
  → display list
  → retained layers/tiles
  → GPU compositor
  → present directo al sistema gráfico
```

## TGE actual

```txt
JSX/TGENode
  → Clay
  → RenderGraphOp
  → CPU/GPU mixed renderer
  → readback/output terminal
  → Kitty
```

## TGE objetivo

```txt
JSX/TGENode
  → Clay
  → RenderGraphOp
  → GPU-first renderer general
  → GPU compositor continuo
  → single late readback
  → Kitty raw output
```

## Qué hace fluidos a los browsers que todavía nos falta

1. **Menos trabajo nuevo por frame**
   - browsers reusan layers/tiles/caches;
   - TGE todavía repinta demasiado chrome/panel path.

2. **Más continuidad GPU**
   - browsers componen más de lo que rasterizan;
   - TGE todavía mezcla demasiado fallback CPU en medio del frame.

3. **Presentación tardía**
   - browsers llegan casi directos al present;
   - TGE todavía cruza a bytes terminal demasiado temprano/frecuente.

4. **Frame pacing estable**
   - no alcanza con el promedio; hay que evitar picos.

---

## Orden recomendado para mejorar fluidez

### Primero

- reducir fallback intercalado en el renderer GPU general
- soportar más `effect` rentable en GPU
- mejorar batching/composición continua por layer

### Después

- retained rendering/caches para panels pesados
- mejores heurísticas de output (`layered-raw` vs `final-frame-raw`)

### Último

- backdrop/transform parity total en GPU
- advanced region readback sólo donde realmente gane

---

## Plan técnico aterrizado — retained GPU backdrop

Este es el plan que se debe seguir para implementar backdrop GPU real sin perderse ni volver a caer en readback CPU por effect.

## Objetivo

Pasar del path actual:

```txt
flush GPU
  → sync CPU buffer desde target
    → fallbackPaintOp(backdrop)
      → restart layer desde CPU
```

al path objetivo:

```txt
render target actual
  → materialize/reuse backdrop source surface
    → GPU backdrop filter pass
      → composite result into destination target
```

---

## Principios obligatorios

1. **No readback CPU en el path normal de backdrop**
2. **Clip exacto o lo pagamos carísimo**
3. **Toda op de backdrop necesita bounds explícitos**
4. **Backdrop tiene que tener identidad (`backdropSourceKey`)**
5. **El pass de backdrop debe ser dependency-driven, no un branch ad-hoc**
6. **No afirmar mejoras sin logs / medición**

---

## Arquitectura mínima necesaria

## A. Estado liviano tipo property trees

Sin copiar Chromium entero, el primer corte necesita separar:

- `transformStateId`
- `clipStateId`
- `effectStateId`
- `backdropSourceKey?`

Esto permite:

- invalidar mejor,
- agrupar ops compatibles,
- decidir cuándo una backdrop source se puede reusar,
- dejar de mezclar transform/clip/effect como una sola rama plana de paint.

## B. Metadata obligatoria por backdrop op

Cada op de backdrop blur/filter debe tener:

- `backdropSourceKey`
- `inputBounds`
- `sampleBounds`
- `outputBounds`
- `clipBounds`
- `filterKind`
- `filterParams`
- `blendMode?`

### Semántica

- `inputBounds`: bounds lógicos del elemento que pide backdrop
- `sampleBounds`: región expandida por kernel/sigma
- `outputBounds`: región visible que se va a escribir
- `clipBounds`: clip duro visible del resultado

---

## C. Cache de backdrop surfaces

El backend GPU necesita una cache dedicada, conceptualmente:

```ts
type BackdropSurfaceRecord = {
  key: string
  bounds: { x: number; y: number; width: number; height: number }
  generation: number
  dirty: boolean
  sourceHandle: unknown
}
```

La implementación concreta puede variar, pero la semántica no:

- identidad estable,
- bounds conocidos,
- invalidación por generación,
- reuse cuando el fondo no cambió.

---

## Implementación por archivo

## 1. `packages/renderer/src/render-graph.ts`

### Objetivo

Dejar de representar backdrop como un effect ambiguo y pasar a un modelo con metadata suficiente para passes GPU.

### Trabajo concreto

- enriquecer `EffectRenderOp` o introducir subfamilia explícita para backdrop
- agregar metadata:
  - `backdropSourceKey`
  - `transformStateId`
  - `clipStateId`
  - `effectStateId`
  - `inputBounds`
  - `sampleBounds`
  - `outputBounds`
  - `clipBounds`
- asegurar que los bounds salgan normalizados/canonizados desde el render graph, no calculados tarde y distinto en varios lugares

### Done when

- el backend GPU recibe ops de backdrop con identidad y bounds explícitos,
- ya no necesita “adivinar” el sampling region dentro del branch de paint.

---

## 2. `packages/renderer/src/gpu-renderer-backend.ts`

### Objetivo

Reemplazar el path actual de backdrop basado en CPU sync/fallback por un path GPU retained.

### Trabajo concreto

- introducir `backdropSurfaceCache`
- introducir lookup por `backdropSourceKey`
- decidir cuándo:
  - capturar source surface nueva
  - reusar source surface existente
  - invalidar una existente
- convertir backdrop en una secuencia de passes:
  1. flush de batches incompatibles si hace falta
  2. materialize/reuse backdrop source
  3. ejecutar filter pass GPU
  4. composite al target principal
- mantener medición separada para:
  - source capture
  - filter pass
  - composite

### Branch a eliminar como path principal

El branch actual alrededor de:

- `syncCpuBufferFromTarget()`
- `fallbackPaintOp(ctx, op)`
- `restartLayerFromCpuBuffer()`

debe quedar sólo como fallback extremo, no como ruta normal.

### Done when

- backdrop blur/filter no cae a CPU en el caso común,
- varias ops con misma fuente pueden reusar backdrop source,
- el buffer CPU no se sincroniza por cada effect.

---

## 3. `packages/renderer/src/wgpu-canvas-bridge.ts`

### Objetivo

Exponer las primitivas del bridge necesarias para tratar backdrop como source texture + filter pass + composite.

### Trabajo concreto

- agregar bindings para:
  - copiar una región de target a imagen/source surface
  - aplicar blur a una source surface con rects explícitos
  - aplicar color filters a una source surface con rects explícitos
  - componer una imagen filtrada al target destino

### Done when

- TypeScript puede ejecutar el pipeline retained-backdrop sin inventar semántica del lado Bun.

---

## 4. `native/wgpu-canvas-bridge/src/lib.rs`

### Objetivo

Implementar del lado Rust/WGPU los passes reales para backdrop source capture, blur/filter y composite.

### Trabajo concreto

- sumar resource lifecycle para images/surfaces temporales reutilizables
- sumar pass de copy/snapshot de región
- sumar pass de blur/filter sobre una source texture
- sumar composite final al target
- cuidar mucho que WGSL / strings / pipelines no contaminen el archivo accidentalmente

### Done when

- el bridge soporta backdrop GPU como operación explícita de render graph,
- no depende de roundtrip CPU para operar en el caso normal.

---

## 5. `examples/showcase.tsx` y `examples/void-showcase.tsx`

### Objetivo

Ser el harness principal de correctness para backdrop antes de volver a Lightcode.

### Casos a validar

- blur con clip ajustado
- múltiples panels con misma fuente sampleada
- overlapping backdrop cases
- backdrop + opacity
- backdrop + transform
- backdrop + rounded corners

### Done when

- backdrop se ve correcto visualmente en showcases,
- no aparecen crop bugs evidentes,
- no reaparece una regresión del estilo ~312ms por enfoque equivocado.

---

## Orden exacto recomendado de implementación

### Paso 1

Actualizar `render-graph.ts` con metadata y bounds explícitos para backdrop.

### Paso 2

Agregar cache y contrato interno de `BackdropSurfaceRecord` en `gpu-renderer-backend.ts`.

### Paso 3

Agregar API mínima en `wgpu-canvas-bridge.ts` y `lib.rs` para:

- snapshot region
- blur/filter source image
- composite filtered image

### Paso 4

Reemplazar el branch actual de backdrop CPU bridge por el pipeline retained GPU.

### Paso 5

Validar correctness en `showcase` / `void-showcase` con auto-exit y logs.

### Paso 6

Recién después medir y optimizar para Lightcode.

---

## Qué cuenta como Etapa 3 terminado

Etapa 3 queda bien cerrada cuando se cumplen TODAS:

1. `transform-test` sigue correcto y sin fallback inesperado.
2. `showcase` y `void-showcase` muestran backdrop correcto en GPU.
3. backdrop normal ya no usa CPU sync/fallback como path principal.
4. existe `backdropSourceKey` + source surface reuse.
5. los bounds/crops del blur/filter son explícitos y estables.

---

## Qué todavía es Etapa 4

Esto NO hay que confundirlo con backdrop retained mínimo:

- retained layers generalizados para todo el renderer
- compositor final completo
- `single late readback` como ruta dominante del frame entero
- heurística madura de `layered-raw` vs `final-frame-raw`

Etapa 3.5 prepara Etapa 4, pero no exige terminarla de una.

---

## Regla de seguridad para seguir trabajando

Si un experimento nuevo de backdrop:

- reintroduce CPU readback por effect,
- rompe clipping/correctness,
- o dispara una degradación fuerte,

entonces se revierte al último punto sano.

No dejar el árbol en un estado “capaz funciona”.
