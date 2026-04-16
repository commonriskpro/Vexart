# Lightcode GPU Fidelity — Phases

> Companion checklist: `docs/lightcode-gpu-fidelity-checklist.md`

## Goal

Llegar al mock objetivo de Lightcode con **fidelidad visual alta** usando el motor en **modo GPU-first**, sin degradar la honestidad técnica del renderer ni caer en parches visuales que después rompan performance, composición o mantenibilidad.

La referencia no es “que se parezca más o menos”.

La referencia correcta es:

> que Lightcode se sienta como una superficie premium, profunda, continua y estable, renderizada mayormente por GPU, con composición tardía y comportamiento predecible en Kitty.

---

## Constraints

- El harness principal sigue siendo `examples/lightcode.tsx`.
- El path GPU debe validarse explícitamente; no asumir que “si corre” ya está bien.
- No hacer claims de performance sin benchmark.
- No hacer claims de fidelidad sin validación visual.
- Para Kitty local, **`file` sigue siendo el transporte recomendado**.
- `shm` queda **experimental** hasta que exista evidencia visual sólida de que es confiable.
- No romper el baseline CPU de referencia.

---

## Runtime de referencia para este roadmap

### Modo de validación recomendado

```bash
LIGHTCODE_STAGE=6 \
LIGHTCODE_CANVAS_BACKEND=wgpu \
TGE_GPU_FORCE_LAYER_STRATEGY=final-frame-raw \
TGE_FORCE_TRANSMISSION_MODE=file \
bun --conditions=browser run examples/lightcode.tsx
```

### Qué estamos validando ahí

- composición GPU-first real
- frame final tardío
- transporte Kitty robusto
- fidelidad visual del shell Lightcode

---

## Definition of Done global

Se considera lograda la fidelidad del mock cuando se cumplan las cuatro cosas juntas:

1. **Silhouette parity**
   - marco general
   - distribución de paneles
   - jerarquía visual

2. **Material parity**
   - glass
   - glow
   - gradients
   - sombras
   - contraste entre planos

3. **Content parity**
   - editor central
   - diff
   - memory
   - agent
   - header/footer/status

4. **Operational parity**
   - corre estable en GPU mode
   - sin glitches visuales serios
   - sin fallback CPU descontrolado
   - con números reproducibles en Kitty/file

---

## Fase 0 — Congelar la referencia visual

### Objetivo

Traducir el mock a una especificación operable. Sin eso, terminás “ajustando cosas” sin norte.

### Entregables

- captura de referencia principal del mock
- lista de superficies principales
- lista de materiales principales
- mapa de layout con proporciones aproximadas
- lista de efectos que SON obligatorios vs cosméticos

### Checklist

- identificar paneles flotantes y prioridades de z-index
- identificar qué elementos deben leerse primero visualmente
- definir qué partes necesitan profundidad real y cuáles pueden ser austeras

### Done

- existe una lectura explícita del mock en términos de layout, materiales y capas

---

## Fase 1 — Shell structural parity

### Objetivo

Clavar la **silueta general** de Lightcode:

- marco exterior
- barra superior
- barra inferior
- distribución espacial del grafo y panels

### Incluye

- `WorkspaceFrame`
- `WorkspaceHeader`
- `WorkspaceFooter`
- offset general del grafo
- bounding box visual del workspace

### No incluye todavía

- microtipografía fina
- iconografía final
- contenido detallado de cada panel

### Criterios de aceptación

- la composición general se reconoce inmediatamente como el mock
- el lienzo no se siente “pantalla vacía con widgets”, sino sistema integrado
- header y footer ya actúan como chrome real del producto

### Riesgo técnico

Si esto se hace sin jerarquía de capas y sin materiales coherentes, después todo el polish se siente pegado con plasticola.

---

## Fase 2 — Panel language system

### Objetivo

Unificar el lenguaje visual de todos los paneles flotantes.

### Incluye

- `ShaderPanel`
- `PanelHeader`
- tokens de:
  - radio
  - borde
  - shadow
  - glow
  - glass/background
  - inner panel surface

### Qué se busca

- que Memory, Diff, Editor y Agent se perciban como familia
- que cada panel tenga profundidad y separación del fondo
- que el chrome no compita con el contenido

### Criterios de aceptación

- cualquier panel nuevo hereda el mismo lenguaje sin inventar estilos ad hoc
- el renderer GPU sostiene ese look sin artefactos notorios

### Validación

- captura comparativa panel por panel
- sanity check de brillo, contraste y stacking

---

## Fase 3 — Scene graph composition fidelity

### Objetivo

Llevar el **grafo central** a un nivel de presencia visual cercano al mock.

### Incluye

- posiciones de nodos
- pesos relativos de edges
- nodo activo central
- glow principal y halo
- chip/overlay de tarea
- balance entre nodos lejanos, medios y foco principal

### Qué importa de verdad

- no sólo “dibujar nodos”
- sino construir una composición donde el grafo dirija la mirada al editor

### Criterios de aceptación

- el nodo activo central domina la composición
- los edges acompañan y no ensucian
- el panel editor parece conectado al grafo, no arbitrario

### Dependencias GPU

- glow estable
- shapes correctas
- bezier consistente
- orden de composición sin glitches

---

## Fase 4 — Editor hero panel fidelity

### Objetivo

Convertir el editor central en el **corazón visual** del producto.

### Incluye

- barra superior del editor
- tabs/chips de contexto
- toolbar secundaria
- title row
- gutter
- líneas de código
- bottom action row
- CTA principal

### Qué NO hacer

- no meter features reales todavía si rompen la lectura visual
- primero estructura y densidad correcta

### Criterios de aceptación

- el editor central concentra el foco
- la densidad del contenido se parece al mock
- la lectura del panel se siente premium, no placeholder

### Validación

- screenshot lado a lado con el mock
- revisar spacing, ritmo vertical y masas oscuras/claras

---

## Fase 5 — Secondary panels fidelity

### Objetivo

Subir la fidelidad de los paneles auxiliares sin quitar protagonismo al editor.

### Incluye

#### Memory
- chips
- grupos de datos
- rows
- references

#### Diff / Changes
- header de archivo
- diff rows
- CTA secundaria

#### Agent
- estado
- bloque de logs
- input/footer control

### Criterios de aceptación

- cada panel cuenta una historia distinta
- la composición sigue teniendo jerarquía clara
- los secundarios no se ven vacíos ni sobrecargados

---

## Fase 6 — Material fidelity pass

### Objetivo

Hacer el pase de materiales finos que separa un demo correcto de una locura cósmica visual.

### Incluye

- ajuste fino de gradients
- backdrop blur donde realmente suma
- sombras con mejor separación de planos
- glows cálidos controlados
- bordes especulares sutiles
- opacidades por superficie

### Regla arquitectónica

Cada material agregado debe justificar:

1. qué plano separa
2. qué lectura visual mejora
3. cuánto cuesta compositivamente

Si no mejora lectura, se va. Punto.

### Criterios de aceptación

- el shell se siente profundo y continuo
- no hay ruido visual gratuito
- el GPU path sigue siendo el principal, no un fallback maquillado

---

## Fase 7 — Typography and iconography pass

### Objetivo

Cerrar la brecha de “parece un prototipo” a través de ritmo tipográfico e iconografía coherente.

### Incluye

- jerarquía de tamaños
- contraste entre primary/secondary/muted text
- alineación vertical de labels
- reemplazo de glyphs temporales por iconografía consistente
- limpieza de strings placeholder o deformadas

### Criterios de aceptación

- la UI ya no depende sólo del glow para verse bien
- el contenido se entiende y se ordena por sí mismo

---

## Fase 8 — Interaction fidelity

### Objetivo

Agregar la sensación de producto vivo sin destruir frame pacing.

### Incluye

- hover state en panel chrome
- foco visual en elementos interactivos
- drag fluido de paneles
- selección de nodo activa coherente con editor/paneles
- microfeedback de CTA

### Dependencias

- Step 8 del renderer ya cerrado: interacción y scheduling más agresivo
- `requestInteractionFrame(kind)` como base operativa

### Criterios de aceptación

- la interacción se siente directa
- no reaparecen picos dominantes grotescos
- la UI no “parpadea” al interactuar

---

## Fase 9 — GPU correctness and fallback audit

### Objetivo

Verificar que la fidelidad conseguida es **realmente GPU-first** y no una ilusión sostenida por fallback CPU invisible.

### Incluye

- revisar qué partes siguen cayendo a CPU
- decidir si esas caídas son aceptables o deuda real
- validar `final-frame-raw` como path dominante
- comparar con baseline CPU

### Validación mínima

- logs de debug/perf
- screenshot en Kitty real
- corrida steady-state reproducible

### Criterios de aceptación

- la fidelidad visual conseguida sobrevive en el path GPU principal
- el modo recomendado sigue siendo consistente: Kitty/file

---

## Fase 10 — Benchmark and polish gate

### Objetivo

Cerrar el trabajo con evidencia, no con sensaciones.

### Medir

- ms steady-state
- estabilidad de frame pacing
- costo del shell completo vs slices previos
- costo con repaint continuo
- costo con interacción

### Gate de salida

No se considera cerrado hasta que existan:

- capturas finales
- lectura de gaps restantes
- benchmark reproducible
- decisión explícita de qué queda fuera del milestone

---

## Orden recomendado de ejecución

1. Fase 0 — congelar referencia
2. Fase 1 — shell structural parity
3. Fase 2 — panel language system
4. Fase 3 — scene graph composition
5. Fase 4 — editor hero panel
6. Fase 5 — secondary panels
7. Fase 6 — material pass
8. Fase 7 — typography/iconography
9. Fase 8 — interaction fidelity
10. Fase 9 — GPU correctness audit
11. Fase 10 — benchmark + cierre

Este orden importa.

Si arrancás por tipografía fina antes de clavar la silueta, estás pintando paredes sin haber levantado la estructura.

---

## Qué queda explícitamente fuera

Para no mezclar capas de problema, este roadmap NO incluye como condición de entrada:

- resolver `shm`
- convertir Lightcode en producto funcional completo
- shipping multiplataforma
- feature work real de editor/diff/agent

Primero se cierra **fidelidad visual GPU-first**.

---

## Estado actual sugerido

Con el trabajo ya hecho en `examples/lightcode.tsx`, el proyecto está aproximadamente acá:

- **Fase 1** — iniciada
- **Fase 2** — iniciada parcialmente
- **Fase 3** — base existente, necesita composición fina
- **Fase 4** — todavía incompleta

El siguiente slice recomendado es:

> **Fase 4 — Editor hero panel fidelity**

Porque el editor central es el ancla visual del mock. Si eso no está bien, todo lo demás se siente accesorio.

---

## Short version

Primero clavar:

1. shell
2. lenguaje de paneles
3. composición del grafo
4. editor central

Después:

5. paneles secundarios
6. materiales finos
7. tipografía
8. interacción
9. auditoría GPU
10. benchmark final

Es así de fácil. Bueno, fácil no. Pero CLARO, sí.
