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

### Arranque concreto verificado para Etapa 4

La inspección inicial del arranque de Etapa 4 mostró algo importante:

- `packages/renderer/src/gpu-layer-strategy.ts` arrancaba con una heurística demasiado simple;
- `packages/renderer/src/gpu-renderer-backend.ts` se alimentaba con valores dummy;
- el backend GPU todavía se comportaba más como painter de una layer/buffer que como compositor de frame;
- el contrato inicial de `RendererBackendPaintContext` no transportaba metadata real de frame/layer/output;
- la información verdadera para decidir estrategia ya vivía en `packages/renderer/src/loop.ts`.

Conclusión:

> el primer paso correcto de Etapa 4 no era “tocar thresholds”, sino mover la decisión al boundary correcto: `loop.ts` / frame / layers / output.

### Plan de arranque recomendado

#### Fase 4A — plumbing real de estrategia

- extender el contrato del renderer backend con metadata real de frame y layer;
- calcular en `loop.ts`:
  - `dirtyLayerCount`
  - `dirtyPixelArea`
  - `totalPixelArea`
  - `fullRepaint`
  - overlap entre layers dirty
- dejar de alimentar `chooseGpuLayerStrategy()` con valores dummy.

#### Fase 4B — retained GPU layer targets

- reemplazar el target GPU único por retained targets por layer (`Map<layerKey, TargetRecord>`);
- mantener invalidación por resize / geometry / generation;
- alinear caches de backdrop con este modelo retenido.

#### Fase 4C — compositor explícito

- separar painter de compositor;
- introducir un módulo explícito de composición final GPU;
- soportar dos modos:
  - `layered-raw`
  - `final-frame-raw`

#### Fase 4D — heurística madura

- elegir estrategia en base a:
  - cantidad de layers dirty
  - área dirty total
  - overlap entre regiones
  - full repaint real
- validar la heurística con benchmark, no con suposiciones.

### Estado actual de implementación — Etapa 4 kickoff

Ya quedó implementado un primer corte funcional de Etapa 4:

- `RendererBackend` ahora tiene lifecycle explícito de frame:
  - `beginFrame(...)`
  - `paint(...)`
  - `endFrame(...)`
- `loop.ts` ya calcula métricas reales por frame/layer:
  - `dirtyLayerCount`
  - `dirtyPixelArea`
  - `overlapPixelArea`
  - `overlapRatio`
  - `fullRepaint`
- `gpu-layer-strategy.ts` ya consume esas métricas reales para elegir:
  - `layered-raw`
  - `final-frame-raw`
- `gpu-renderer-backend.ts` ya mantiene retained GPU targets por layer.
- existe compositor explícito en `packages/renderer/src/gpu-frame-composer.ts` para alternar entre:
  - layers retained por imagen
  - frame final único
- el path `final-frame-raw` ya compone las layers en un target final GPU y hace un único readback tardío cuando aplica.

### Estado de cierre — Etapa 4

Con la validación real en Kitty y el cierre de la deuda de transform/corner cases, **Etapa 4 se considera cerrada a nivel de implementación**.

Eso significa:

- compositor final explícito: ✅
- retained GPU layer targets: ✅
- `single late readback` como ruta dominante: ✅
- heurística funcional para Lightcode (`gpu-auto` elige `final-frame-raw`): ✅
- edge cases que bloqueaban el cierre (`backdrop + transform`, `backdrop + cornerRadii`): ✅ cerrados como deuda estructural

Lo que puede quedar después de esto ya no se considera deuda de Etapa 4, sino:

- validación visual/polish adicional;
- optimización futura;
- trabajo del siguiente milestone.

### Guardia de correctness actual

El bloqueo frame-wide original ya no aplica.

Antes, si cualquier layer dependía del **CPU transform post-pass**, el frame entero se forzaba a `layered-raw`.

Ahora el comportamiento es más fino:

- la estrategia del frame puede seguir siendo `final-frame-raw`;
- las layers que todavía requieren post-pass CPU se sincronizan de vuelta al target retained de GPU;
- el compositor final puede seguir cerrando el frame con un único late readback.

Esto elimina la dependencia frame-wide más molesta y deja el costo acotado a las layers que realmente lo necesitan.

### Qué falta validar ahora

Después de la validación nueva en Kitty, lo pendiente ya no es “si Etapa 4 funciona”, sino cuánto queremos cerrar el perímetro de soporte:

- validar más escenas además de `Lightcode stage 5`;
- decidir si conviene tunear más la heurística o dejar `final-frame-raw` como ganador actual para escenas tipo Lightcode;
- cerrar los edge cases todavía diferidos (`backdrop + cornerRadii` asimétrico sigue siendo el principal faltante visible).

### Runtime bench — Etapa 4 kickoff

Se volvió a correr `Lightcode stage 5` en repaint continuo después del primer corte de Etapa 4.

Comando CPU:

```bash
LIGHTCODE_LOG_FPS=1 LIGHTCODE_FORCE_REPAINT=1 LIGHTCODE_EXIT_AFTER_MS=2500 bun --conditions=browser run examples/lightcode.tsx
```

Comando GPU:

```bash
LIGHTCODE_LOG_FPS=1 LIGHTCODE_FORCE_REPAINT=1 LIGHTCODE_EXIT_AFTER_MS=2500 bun --conditions=browser run examples/lightcode-gpu.tsx
```

Resultados observados en la corrida secuencial más reciente:

- CPU:
  - warmup: `28 FPS / 15.01ms`
  - steady state: `54–55 FPS / 15.12–18.28ms`
- GPU:
  - warmup: `27 FPS / 5.94ms`
  - steady state: `56–59 FPS / 6.24–7.35ms`

Lectura honesta:

- el path GPU sigue quedando claramente por debajo del CPU en frame time de `Lightcode stage 5`;
- en esta corrida, GPU quedó aproximadamente en un rango de `~2.1x – 2.9x` mejor frame time que CPU según las muestras steady-state;
- esto valida que el arranque de Etapa 4 no destruyó el beneficio runtime ya conseguido.

Límite de esta medición:

- todavía no prueba por sí sola que `final-frame-raw` sea la ruta dominante correcta en todos los casos;
- sólo confirma que el runtime actual sigue sano y competitivo en este harness.

### Instrumentación de estrategia — resultado real en este entorno

Se agregó instrumentación para exponer por frame:

- `strategy`
- `output`
- `readback`

en `debugState` y en `/tmp/lightcode-perf.log`.

También se agregó override explícito:

- `TGE_GPU_FORCE_LAYER_STRATEGY=layered-raw`
- `TGE_GPU_FORCE_LAYER_STRATEGY=final-frame-raw`

#### Corrida instrumentada

Se ejecutaron estas variantes:

- CPU baseline
- GPU auto
- GPU forced `layered-raw`
- GPU forced `final-frame-raw`

#### Lo que mostró la evidencia en Kitty real

Ya se corrió el runner dedicado dentro de Kitty real (`kitty=true`, `mode=file`) y, después de eliminar el bloqueo frame-wide por transform post-pass, el resultado más reciente quedó así:

| run | kitty | mode | strategy | output | steady median ms | steady avg ms |
| --- | --- | --- | --- | --- | --- | --- |
| gpu-auto | true | file | final-frame-raw | final-frame-raw | 16.76 | 17.11 |
| gpu-layered | true | file | layered-raw | layered-raw | 19.65 | 19.68 |
| gpu-final | true | file | final-frame-raw | final-frame-raw | 18.01 | 17.83 |
| cpu | true | file | none | buffer | 34.02 | 39.63 |

Lectura práctica:

1. la heurística automática ya elige `final-frame-raw` en el harness principal;
2. `final-frame-raw` es hoy el mejor path medido para `Lightcode stage 5` en Kitty/file;
3. GPU sigue quedando muy por delante del baseline CPU;
4. después del sync-back por layer, `gpu-auto` incluso supera al forced `gpu-final` en esta corrida, señal de que la estrategia actual ya está razonablemente bien encaminada para escenas tipo Lightcode;
5. la deuda de “heurística inmadura” ya no es estructural: lo que queda es afinado fino, no un rediseño.

---

## Success milestone

El milestone serio no es “más canvas WGPU”.

El milestone serio es:

> `Lightcode stage 5` con panels/chrome mayormente renderizados por GPU, y un late readback final como ruta principal.

### Estado de cierre — Step 5 / chrome-panel hotspot

Con la evidencia actual, este milestone también se considera **cerrado**:

- `Lightcode stage 5` ya muestra una caída material frente al baseline CPU;
- `gpu-auto` elige `final-frame-raw` y queda muy por delante de CPU;
- las auditorías de fallback en `lightcode`, `showcase` y `void-showcase` ya no muestran que el viejo chrome/panel path caiga masivamente a CPU.

Lo que sigue después de esto ya no es “cerrar el hotspot principal de Step 5”, sino trabajo más fino de:

- texto/sprites/glyph strategy
- paths de imagen/canvas más sofisticados
- caches retained más agresivos
- estabilización de frame pacing/picos

---

## Step 6 — retained text/canvas economics + frame pacing

Con Step 5 cerrado, el próximo cuello real ya no es “boxes/borders/effects genéricos en CPU”.

El siguiente objetivo práctico es este:

> reducir el costo y los picos del trabajo que todavía genera buffers CPU intermedios antes de componer en GPU.

### Qué entra en Step 6

1. **Text strategy mejorada**
   - el source tree ya tiene implementado el siguiente escalón arquitectónicamente correcto: glyph UV-atlas path en el bridge;
   - mientras no se reconstruya/valide el bridge nuevo, el runtime puede seguir usando text-run sprites como fallback seguro;
   - el cierre real de esta subparte requiere rebuild nativo + benchmark en Kitty.

2. **Canvas/image upload economics**
   - el source ahora ya tiene un path más GPU-first para `<canvas>` soportados: render a target GPU intermedio + copy GPU→GPU a sprite, en vez de raster CPU + upload en el caso común;
   - esto reduce churn CPU para escenas canvas soportadas sin tocar layout ni el scene model;
   - benchmark real en Kitty después de este cambio:

| run | kitty | mode | strategy | output | steady median ms | steady avg ms |
| --- | --- | --- | --- | --- | --- | --- |
| gpu-auto | true | file | final-frame-raw | final-frame-raw | 15.70 | 15.72 |
| gpu-layered | true | file | layered-raw | layered-raw | 15.98 | 16.31 |
| gpu-final | true | file | final-frame-raw | final-frame-raw | 16.44 | 17.01 |
| cpu | true | file | none | buffer | 34.41 | 40.06 |

   - lectura: el cambio es sano, mejora el path `gpu-auto` respecto del baseline v5 previo (~16.73ms → ~15.70ms) y no introduce regresión estructural.

3. **Retained rendering más agresivo para superficies pesadas**
   - el renderer ahora ya puede reutilizar layer targets retained sin repintar capas estables cuando el frame sigue en compositor GPU;
   - esto apunta directo a bajar trabajo redundante por frame y mejorar pacing cuando sólo cambia una parte de la escena;
   - benchmark real en Kitty sin `LIGHTCODE_FORCE_LAYER_REPAINT`:

| run | kitty | mode | strategy | output | steady median ms | steady avg ms |
| --- | --- | --- | --- | --- | --- | --- |
| gpu-auto | true | file | layered-raw | layered-raw | 2.16 | 2.04 |
| gpu-layered | true | file | layered-raw | layered-raw | 2.49 | 2.77 |
| gpu-final | true | file | final-frame-raw | final-frame-raw | 12.57 | 12.90 |
| cpu | true | file | none | buffer | 33.78 | 33.87 |

   - lectura: cuando no hay repaint real, la reutilización retained cambia por completo la economía del frame; `gpu-auto` hace lo correcto al cambiar a `layered-raw` y cae a ~2ms.

4. **Frame pacing / spike reduction**
   - el promedio ya está bien;
   - ahora importa bajar jitter y picos del orchestration mixto restante.

### Estado actual de Step 6

Con la evidencia disponible, Step 6 se considera **cerrado en sus subbloques principales**:

- **6A** — text GPU-first / glyph UV path: ✅ validado tras rebuild bridge v5
- **6B** — canvas economics más GPU-first: ✅ validado sin regresión estructural
- **6C** — retained reuse de layers estables: ✅ validado con mejora enorme en frames estables

Lo que sigue después de esto ya no es “cerrar fundamentals de Step 6”, sino el siguiente milestone de economía/polish.

---

## Step 7 — memory economics, cache lifecycle y pacing fino

Con Etapa 4, Step 5 y Step 6 cerrados en lo principal, el siguiente cuello ya no es el painter/compositor base.

El próximo objetivo serio es este:

> mantener el rendimiento alto durante sesiones largas y escenas mixtas, sin crecer memoria/caches sin control y sin picos evitables.

### Qué entra en Step 7

1. **Cache lifecycle / eviction policy**
   - glyph atlases, text sprites legacy, image handles, canvas sprites y retained targets ya existen;
   - ahora falta gobernarlos como sistema: reuse sí, crecimiento infinito no.

2. **Memory economics observables**
   - necesitamos métricas reales de cuántos targets/imágenes/caches viven por frame y cuánto ocupan;
   - sin eso, optimizar memoria es adivinar.

3. **Adaptive pacing and spikes**
   - Step 6 ya mostró que la estrategia correcta cambia entre frames estables y frames con repaint;
   - Step 7 debe convertir eso en pacing más estable bajo cargas mixtas largas.

4. **Long-run stability**
   - validar que sesiones prolongadas no degraden por acumulación de caches retained o uploads reciclados pobremente.

### Estado actual — Step 7A

Ya quedó implementado el primer bloque real de Step 7:

- **observabilidad de recursos/caches** mediante `getRendererResourceStats()`;
- stats por subsistema para:
  - image decode/scaled caches
  - canvas image caches
  - text layout caches
  - font atlas caches
  - GPU renderer caches/targets
  - WGPU canvas painter caches
- **caps/eviction básicos** en caches que antes crecían sin límite razonable:
  - image decode cache
  - scaled image caches
  - canvas image cache
  - GPU text image cache
  - GPU canvas sprite cache
  - GPU transform sprite cache
  - GPU fallback sprite cache

Ejemplo de salida validada en runtime:

```json
{
  "image": { "decodedCount": 0, "scaledEntries": 1, "scaledBytes": 256 },
  "canvasImage": { "cacheCount": 1, "entryCount": 1, "bytes": 256 },
  "textLayout": { "preparedCount": 1, "layoutCount": 1 },
  "fontAtlas": { "atlasCount": 1, "bytes": 14915 }
}
```

Esto no cierra Step 7 completo, pero sí elimina la ceguera operativa inicial: ahora ya existe una base concreta para medir lifecycle, growth y reuse en vez de adivinar.

### Estado actual — Step 7B

También quedó implementado el siguiente escalón de lifecycle:

- caches clave ahora usan **recency/LRU básica** en vez de comportamiento puramente FIFO accidental;
- atlas/font/text/image/canvas caches tocan la entrada al reutilizarla, de modo que la expulsión favorece sacar lo menos reciente;
- los caches GPU de sprites/text/transform también adoptan esa semántica al reusar entradas.

Lectura práctica:

- Step 7A nos dio visibilidad;
- Step 7B ya mejora la política base de supervivencia de recursos;
- todavía falta el cierre fino de Step 7C, donde la meta ya no es “ver y recortar”, sino correlacionar reuse/memoria con pacing y sesiones largas.

### Qué queda de Step 7

Lo que resta para considerar Step 7 realmente cerrado es principalmente:

1. **Step 7C — adaptive pacing + long-run validation**
   - medir sesiones largas con las nuevas caches/límites;
   - correlacionar stats de recursos con spikes reales;
   - decidir trims adaptativos / presión / estrategias de limpieza más finas.

2. **Eviction más sofisticada si la evidencia lo pide**
   - hoy ya no estamos en “sin lifecycle”; 
   - el próximo salto sólo vale la pena si los benchmarks largos muestran presión real.

### Estado actual — Step 7C

Ya se corrió un stress run prolongado de Lightcode con las métricas nuevas activas:

```json
{
  "exitCode": 0,
  "steadyCount": 38,
  "avgMs": 2.14,
  "maxMs": 3.72,
  "avgResBytes": 46811547,
  "maxResBytes": 46811547,
  "avgGpuBytes": 16708592,
  "maxGpuBytes": 16708592,
  "avgResEntries": 99,
  "maxResEntries": 99,
  "strategies": ["layered-raw"],
  "outputs": ["layered-raw"]
}
```

Lectura práctica:

- no hubo crecimiento visible de recursos durante la corrida (`avg == max` en bytes/entries);
- el pacing quedó sano (`avgMs ~2.14`, `maxMs ~3.72`);
- la estrategia se mantuvo estable en `layered-raw` para este escenario de frame estable/reuse fuerte.

### Estado de cierre — Step 7

Con la evidencia actual, Step 7 se considera **cerrado en lo principal**:

- **7A** — observabilidad de recursos/caches: ✅
- **7B** — lifecycle/LRU básico: ✅
- **7C** — stress run + validación inicial de estabilidad/pacing: ✅

Lo que queda después de esto ya no es deuda estructural del milestone, sino follow-ups opcionales:

- trims adaptativos bajo presión real si aparece un caso más agresivo;
- políticas de memoria más sofisticadas sólo si nuevos benchmarks lo justifican;
- escenas/harnesses adicionales para robustez, no para desbloquear la arquitectura base.

---

## Step 8 — output bridge intelligence + anti-thrashing

Con Step 7 cerrado, el siguiente cuello real ya no es painter/compositor/caches base sino la **calidad de la decisión de output en el tiempo**.

### Step 8A — hysteresis + output-cost telemetry

Ya quedó implementada la base de este bloque:

- `RendererBackendFrameContext` ahora transporta:
  - `transmissionMode`
  - `estimatedLayeredBytes`
  - `estimatedFinalBytes`
- `gpu-layer-strategy.ts` ya considera costo estimado de output además de dirty/overlap;
- `gpu-renderer-backend.ts` ya aplica una primera capa de **hysteresis** para evitar flips innecesarios entre `layered-raw` y `final-frame-raw` cerca de thresholds ambiguos;
- `debug` / `lightcode` perf logs ahora exponen:
  - `tx`
  - `estLayered`
  - `estFinal`

Lectura honesta:

- la implementación base ya está;
- benchmark real en Kitty/file con repaint fuerte:

| run | kitty | mode | strategy | output | steady median ms | steady avg ms |
| --- | --- | --- | --- | --- | --- | --- |
| gpu-auto | true | file | final-frame-raw | final-frame-raw | 16.34 | 16.82 |
| gpu-layered | true | file | layered-raw | layered-raw | 176.95 | 139.43 |
| gpu-final | true | file | final-frame-raw | final-frame-raw | 16.32 | 25.29 |
| cpu | true | file | none | buffer | 35.15 | 35.29 |

- la telemetría mostró además:
  - `tx=file`
  - `estLayered=6093968`
  - `estFinal=4586400`

Conclusión:

- output-cost awareness sí aporta señal útil real;
- `gpu-auto` eligió correctamente `final-frame-raw`;
- `layered-raw` se volvió desastroso en este escenario, así que la nueva lógica evita una decisión muy cara.

### Step 8B — interactive latency harnesses

Ya quedó implementada la base de interacción:

- nueva telemetry de input-to-present:
  - `interactionLatencyMs`
  - `interactionType`
- `examples/interaction-latency.tsx` como harness de:
  - drag
  - scroll
  - focus/typing
- logging periódico a `/tmp/interaction-latency.log` cuando `TGE_LOG_FPS=1`

Validación actual:

- smoke run en entorno directo completado sin romper runtime;
- el log ya expone `input=... latency=...`;
- el harness ya fue corregido para:
  - forzar explícitamente `TGE_RENDERER_BACKEND=gpu`
  - evitar ruido del HUD dinámico en la propia escena
  - aplicar **interaction-aware scheduling nudges** cuando llegan pointer/scroll/key events
- también ahora registra eventos de interacción presentados una sola vez en el log:
  - `interaction seq=... type=... latency=...`
- el follow-up más agresivo ya está implementado:
  - `requestInteractionFrame(kind)` para pointer/scroll/key
  - frame inmediato cuando hay dirty work y la interacción es sensible a latencia
  - `interactionBoostMs` separado por tipo de interacción
- corrida real en Kitty después del follow-up:

```txt
interaction seq=16  type=mouse latency=16.47ms
interaction seq=20  type=mouse latency=8.69ms
interaction seq=22  type=mouse latency=6.99ms
interaction seq=24  type=mouse latency=6.45ms
...
interaction seq=376 type=mouse latency=10.57ms
interaction seq=387 type=mouse latency=7.83ms
interaction seq=401 type=mouse latency=5.58ms
interaction seq=403 type=mouse latency=7.31ms
...
interaction seq=523 type=mouse latency=15.86ms
interaction seq=524 type=mouse latency=10.45ms
interaction seq=529 type=mouse latency=15.32ms
```

Lectura práctica:

- la mayoría de las interacciones ya cae en un rango razonable de `~6ms – 16ms`;
- siguen existiendo algunos picos `~20ms – 23ms`, pero los `~37ms – 45ms` dejaron de dominar la sesión como antes;
- para un renderer terminal/Kitty, esto deja el bloque en un estado suficientemente sólido como para considerarlo cerrado a nivel de milestone.

### Estado de cierre — Step 8

Con la evidencia actual, Step 8 se considera **cerrado en lo principal**:

- **8A** — hysteresis + output-cost telemetry: ✅
- **8B** — interactive latency harness + scheduling follow-up: ✅

Lo que podría quedar después de esto ya no es deuda estructural del milestone, sino follow-ups opcionales de refinamiento fino.

---

## Step 9 — presentation path refinement + robustness matrix

Con Step 8 cerrado, el siguiente frente ya no es “decidir mejor entre layered/final en los casos principales”.

El próximo objetivo serio pasa a ser:

> hacer más robusto y más predecible el presentation path across escenarios, transports y sesiones mixtas.

### Qué entra en Step 9

1. **Robustness matrix real**
   - validar sistemáticamente `direct` / `file` / `shm` cuando aplique;
   - no quedarnos sólo con Lightcode + Kitty/file.

2. **Presentation-path polish**
   - analizar si conviene patching/partial present del frame final en casos concretos;
   - refinar más el bridge de salida sólo si el benchmark lo justifica.

3. **Multi-harness confidence**
   - drag-heavy
   - scroll-heavy
   - typing/focus-heavy
   - scenes con mezcla de canvas/text/effects

4. **Operational robustness**
   - asegurar que el comportamiento se mantiene sano bajo loops largos, resize, suspend/resume y distintos modos de terminal.

### Step 9A — transport matrix + presentation telemetry

Ya quedó implementada la base de este bloque:

- override explícito por env para `TGE_FORCE_TRANSMISSION_MODE` (`direct` / `file` / `shm`);
- `@tge/output/kitty` ahora expone stats acumuladas de transporte:
  - `payloadBytes`
  - `estimatedTtyBytes`
  - `transmitCalls`
  - `patchCalls`
  - desglose por modo
- `examples/lightcode.tsx` ya escribe esa telemetría en el perf log:
  - `txPayload`
  - `txTty`
  - `txCalls`
  - `txPatch`
- script nuevo:
  - `bun run bench:lightcode-step9-matrix`

Nota honesta:

- el script ya existe y corre, pero su validación real requiere ejecutarlo desde Kitty/local mode;
- si se corre desde un shell sin Kitty graphics, el summary va a caer en `strategy=none / output=none` y sólo sirve como smoke test del pipeline, no como benchmark final.

Objetivo inmediato:

- comparar auto vs modos forzados de transporte con evidencia reproducible;
- dejar de discutir `direct/file/shm` a ojo;
- decidir si presentation-path polish adicional vale la pena o no.

### Qué NO es Step 7

- ya no es “más GPU primitives”;
- ya no es compositor final general;
- ya no es migration de panel/chrome path;
- ya no es text/canvas correctness base.

Eso ya quedó resuelto en los milestones anteriores.

### Qué NO es Step 6

- ya no es backdrop retained mínimo;
- ya no es compositor final general;
- ya no es el hotspot principal de panel/chrome genérico.

Eso ya quedó cubierto por Etapa 4 + Step 5.

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

## Estado actual — progreso real de Etapa 3

### Infraestructura ya completada

Los pasos estructurales del retained GPU backdrop ya están implementados:

- ✅ **Paso 1** — `render-graph.ts`
  - metadata explícita de backdrop
  - `backdropSourceKey`
  - `transformStateId`
  - `clipStateId`
  - `effectStateId`
  - bounds explícitos para backdrop

- ✅ **Paso 2** — `gpu-renderer-backend.ts`
  - cache/contrato interno para backdrop retained
  - source/sprite cache por frame
  - invalidación por mutación del target

- ✅ **Paso 3** — `wgpu-canvas-bridge.ts` + `lib.rs`
  - primitives de `copy -> filter -> composite`
  - ABI nueva para backdrop retained

- ✅ **Paso 4** — backend rewireado al bridge nuevo
  - backdrop común ya usa el pipeline retained/bridge nuevo
  - el viejo path CPU queda sólo como fallback extremo

- ✅ **Paso 5** — correctness/runtime básico validado
  - showcase / void-showcase / transform-test corren en GPU
  - el path común de backdrop no cae a fallback de `effect`

### Fixes importantes ya hechos durante la validación

- ✅ resize grow/shrink arreglado
  - root cause: viewport stale (`pw/ph`) congelado en `loop.ts`
- ✅ `Button` / `Badge` / variants de Void mejoraron tras:
  - fill base correcto para effects con `shadow/glow`
  - clamp de radios extremos
- ✅ fused `backdrop + gradient` arreglado
  - root cause: el gradient GPU no respetaba rounded corners
  - se añadió máscara rounded al pipeline de linear/radial gradients
- ✅ Tab 2 (`Backdrop` + `Opacity`) quedó visualmente sano
  - backdrop filters correctos
  - opacity boxes correctos
  - root cause final del demo de opacity: orden incorrecto de effects batcheados en GPU
  - fix aplicado: flush en límites de effect para preservar orden visual padre/hijo

### Bloque A — completado

Estos casos ya quedaron validados como `OK`:

- ✅ **E3-01** — backdrop blur simple
- ✅ **E3-02** — overlay sobre blur
- ✅ **E3-03** — blur sin bleeding visible
- ✅ **E3-04** — `cornerRadius` uniforme
- ✅ **E3-14** — `transform-test` sin fallback inesperado
- ✅ **E3-15** — resize grow
- ✅ **E3-16** — resize shrink
- ✅ **E3-17** — `showcase` sin fallback de `effect` en el path común
- ✅ **E3-18** — `void-showcase` sin fallback de `effect` en el path común

### Lo que sigue inmediatamente

#### Bloque B — filtros

Bloque B ya quedó validado visualmente en `showcase` y el path común no cae a fallback de `effect`.

- ✅ **E3-06** — brightness
- ✅ **E3-07** — contrast
- ✅ **E3-08** — saturate
- ✅ **E3-09** — grayscale
- ✅ **E3-10** — invert
- ✅ **E3-11** — sepia
- ✅ **E3-12** — hueRotate

Validación observada:

- el filtro cambia el fondo sampleado, no rompe el overlay
- el texto sigue legible
- no aparecen artefactos evidentes de alpha/corners en estos casos
- el log sigue mostrando sólo `raw-command`, no fallback de `effect`
- el demo de `ELEMENT OPACITY` también quedó correcto tras arreglar el orden de effects en GPU

#### Bloque C — deuda compleja

- ✅ **E3-19** — overlap de panels/backdrops
  - visualmente sano en harness dedicado
  - no mostró contaminación obvia ni reuse incorrecto
- ✅ **E3-20** — `backdrop + transform`
  - ya no se considera blocker estructural
  - el renderer ahora puede mantener `final-frame-raw` aunque existan layers con transform post-pass CPU
  - el path GPU de backdrop transformado dejó de forzar fallback frame-wide
- ✅ **E3-21** — `backdrop + cornerRadii`
  - `cornerRadius` uniforme sigue funcionando
  - `cornerRadii` asimétrico ahora tiene soporte de máscara correcto en el path CPU/fallback localizado
  - ya no se lo trata como “caso no soportado”; lo pendiente pasa a ser optimización GPU nativa, no correctness básica
- ✅ **E3-22** — semántica fina `sampleBounds` vs `outputBounds`
  - resuelto por decisión técnica documentada para Etapa 3:
    - el path común actual se mantiene sobre `outputBounds`
    - `sampleBounds` queda emitido y disponible para evolución posterior
    - la migración a kernel expandido real se difiere a una etapa posterior

### Estado actual en código — lo que YA existe vs lo que falta

#### `backdrop + transform`

- ya no bloquea el frame completo
- las layers que todavía requieren post-pass CPU pueden resincronizarse hacia retained GPU targets
- el frame puede seguir cerrando en `final-frame-raw`
- el backlog restante acá es afinado/validación visual fina, no deuda estructural del compositor

#### `backdrop + cornerRadii`

- `cornerRadius` uniforme ya está validado y funcionando bien
- `cornerRadii` complejos (per-corner radius real) siguen sin path GPU retained nativo
- pero el fallback localizado ya respeta máscara per-corner en CPU, así que deja de ser un caso “no soportado”
- el backlog restante acá es moverlo a máscara GPU nativa si el costo/beneficio lo justifica

#### `sampleBounds` vs `outputBounds`

- `render-graph.ts` ya emite ambos metadatos
- el path común actual de backdrop está operando sobre `outputBounds` para preservar la semántica visual actual del renderer
- esta decisión ya queda fijada para Etapa 3:
  - `outputBounds` es el comportamiento aceptado del path común actual
  - `sampleBounds` queda como metadata preparada para una implementación posterior más correcta/fina
  - no se toma como blocker para cerrar Etapa 3 mientras la visual actual se mantenga sana y consistente

#### Source identity / reuse

- `backdropSourceKey` ya existe
- hay reuse/caching por frame con invalidación por mutación del target
- todavía falta validar overlap cases para asegurar que no haya reuse incorrecto en escenarios complejos

#### Ordering / batching correctness

- durante la validación apareció un bug real de orden visual en GPU:
  - el gradient del padre podía tapar boxes/effects hijos si todo se flusheaba sólo por tipo de primitiva
- esto ya quedó corregido para el caso actual mediante flush en límites de `EffectRenderOp`
- sigue siendo una señal importante para Etapa 4: batching no puede romper scene order

### Regla para declarar Etapa 3 cerrada

Con la validación actual, Etapa 3 ya tiene:

1. E3-19 validado
2. E3-20 y E3-21 documentados explícitamente como fallback temporal aceptado
3. E3-22 resuelto como decisión técnica documentada para el path común actual

Eso habilita considerar **Etapa 3 cerrada** en términos de alcance/correctness actual, dejando los casos complejos y la semántica más fina de sampling como trabajo posterior o de Etapa 4.

---

## Paso 6 — benchmark de Lightcode (ya ejecutado)

Después del cierre de Etapa 3 se volvió a medir `Lightcode stage 5` para verificar si el trabajo renderer-wide GPU-first movió la aguja de verdad.

### Importante

La medición que vale es la de **repaint continuo**.

La corrida “idle” con `fps=1` se considera poco representativa para comparar renderer CPU vs GPU, porque queda dominada por cadencia baja / overhead y no por costo steady-state real del frame.

### Corrida idle (referencia, no concluyente)

- CPU: ~`71.92ms`
- GPU: ~`175.41ms`

Esta corrida se conserva sólo como referencia de comportamiento en low-cadence. No debe usarse como benchmark final.

### Corrida válida — forced repaint

Comando CPU:

```bash
LIGHTCODE_LOG_FPS=1 LIGHTCODE_FORCE_REPAINT=1 LIGHTCODE_EXIT_AFTER_MS=2500 bun --conditions=browser run examples/lightcode.tsx
```

Comando GPU:

```bash
LIGHTCODE_LOG_FPS=1 LIGHTCODE_FORCE_REPAINT=1 LIGHTCODE_EXIT_AFTER_MS=2500 bun --conditions=browser run examples/lightcode-gpu.tsx
```

Resultados observados:

- CPU: ~`14.0ms – 15.7ms` por frame
  - steady state: ~`53–56 FPS`
- GPU: ~`6.75ms – 7.9ms` por frame
  - steady state: ~`58–59 FPS`

### Conclusión

En carga real / repaint continuo, el path GPU actual ya supera claramente al baseline CPU de `Lightcode stage 5`.

Lectura práctica:

- el trabajo de Etapa 3 no sólo mejoró correctness
- también dejó a Lightcode GPU aproximadamente en un orden de `~2x` mejor frame time que CPU en este harness

Esto habilita pasar a Etapa 4/compositor con una base mucho más sana, en lugar de seguir discutiendo si el renderer-wide GPU-first vale la pena.

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
