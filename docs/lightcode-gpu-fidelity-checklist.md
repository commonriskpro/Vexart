# Lightcode GPU Fidelity — Execution Checklist

Companion doc for `docs/lightcode-gpu-fidelity-phases.md`.

Este archivo NO describe la visión. Describe el trabajo.

La regla es simple:

> no se avanza de fase porque “ya se ve mejor”, sino porque existe evidencia visual y técnica suficiente.

---

## Working mode

### Runtime recomendado

```bash
LIGHTCODE_STAGE=6 \
LIGHTCODE_CANVAS_BACKEND=wgpu \
TGE_GPU_FORCE_LAYER_STRATEGY=final-frame-raw \
TGE_FORCE_TRANSMISSION_MODE=file \
bun --conditions=browser run examples/lightcode.tsx
```

### Reglas operativas

- [ ] no usar `shm` como base de validación
- [ ] no declarar fidelidad sin screenshot comparativo
- [ ] no declarar performance sin benchmark reproducible
- [ ] no meter feature work real si todavía falta silhouette/material parity
- [ ] mantener `examples/lightcode.tsx` como harness principal
- [ ] no degradar el baseline CPU por perseguir polish visual

---

## Artefactos de evidencia

- [ ] definir carpeta o convención para screenshots de progreso
- [ ] guardar al menos una captura por fase cerrada
- [ ] guardar notas de gap visual entre captura actual y mock
- [ ] guardar benchmark final del shell completo en Kitty/file

Sugerencia de convención:

```txt
/tmp/lightcode-fidelity/
  phase-1-shell.png
  phase-2-panels.png
  phase-3-graph.png
  phase-4-editor.png
  phase-5-secondary-panels.png
  phase-10-summary.md
```

---

## Phase 0 — Freeze visual reference

### Deliverables

- [ ] identificar todas las superficies del mock
- [ ] identificar paneles flotantes y su jerarquía
- [ ] identificar materiales obligatorios vs cosméticos
- [ ] definir proporciones aproximadas del layout
- [ ] definir lectura visual prioritaria: qué mira primero el usuario

### Evidence gate

- [ ] existe una nota escrita con la lectura del mock
- [ ] existe una lista explícita de gaps entre mock y demo actual

### Exit condition

- [ ] ya no estamos “adivinando” qué construir

---

## Phase 1 — Shell structural parity

### Implementation

- [ ] ajustar `WorkspaceFrame`
- [ ] ajustar tamaño real del bounding shell
- [ ] ubicar `WorkspaceHeader` según mock
- [ ] ubicar `WorkspaceFooter` según mock
- [ ] alinear márgenes exteriores
- [ ] calibrar proporción entre grafo central y panels laterales

### Visual checks

- [ ] el shell se reconoce instantáneamente como el mock
- [ ] header y footer no parecen widgets aislados
- [ ] el marco exterior contiene la escena como producto, no como canvas suelto

### Technical checks

- [ ] corre en GPU mode sin glitches serios
- [ ] la composición final sigue usando `final-frame-raw`

### Exit condition

- [ ] silhouette parity base conseguida

---

## Phase 2 — Panel language system

### Implementation

- [ ] unificar `ShaderPanel`
- [ ] unificar `PanelHeader`
- [ ] normalizar radios
- [ ] normalizar bordes
- [ ] normalizar glow
- [ ] normalizar sombras
- [ ] normalizar surface exterior e interior
- [ ] definir tokens reutilizables para panel chrome

### Visual checks

- [ ] Memory, Diff, Editor y Agent se sienten familia
- [ ] el panel se separa del fondo sin verse pesado
- [ ] el chrome no pelea con el contenido

### Technical checks

- [ ] backdrop/glow usados sólo donde aportan lectura
- [ ] no aparecen artefactos de orden o blending

### Exit condition

- [ ] existe un lenguaje de panel consistente y reusable

---

## Phase 3 — Scene graph composition fidelity

### Implementation

- [ ] ajustar posiciones de nodos principales
- [ ] ajustar pesos/curvas/opacidad de edges
- [ ] reforzar nodo activo central
- [ ] recalibrar glow y halo del foco central
- [ ] ajustar overlay chip de tarea
- [ ] balancear densidad del grafo para que no tape el editor

### Visual checks

- [ ] el grafo guía la mirada al centro
- [ ] el nodo activo domina sin quemar la escena
- [ ] los edges suman profundidad y no ensucian
- [ ] editor y grafo se sienten conectados

### Technical checks

- [ ] glow de nodos estable en GPU
- [ ] bezier y shapes correctas
- [ ] sin problemas de orden visual

### Exit condition

- [ ] graph composition parity suficiente para que el shell deje de verse “vacío” 

---

## Phase 4 — Editor hero panel fidelity

### Implementation

- [ ] refinar barra superior del editor
- [ ] refinar tabs/chips contextuales
- [ ] refinar toolbar secundaria
- [ ] refinar title row
- [ ] refinar gutter de líneas
- [ ] refinar contenido de código placeholder
- [ ] refinar bottom metadata row
- [ ] refinar CTA principal
- [ ] ajustar spacing vertical del panel completo

### Visual checks

- [ ] el editor es claramente el héroe de la composición
- [ ] la densidad visual se parece al mock
- [ ] el panel ya no se siente placeholder
- [ ] el CTA se entiende sin gritar demasiado

### Technical checks

- [ ] textos y separadores sostienen la lectura en GPU
- [ ] no aparece jitter visual por chrome o border space

### Exit condition

- [ ] editor hero panel cerca del mock en lectura general

---

## Phase 5 — Secondary panels fidelity

### Memory panel

- [ ] ajustar chips superiores
- [ ] ajustar rows de datos
- [ ] ajustar references
- [ ] mejorar contraste y jerarquía

### Diff panel

- [ ] ajustar header de archivo
- [ ] ajustar diff rows
- [ ] ajustar highlight de línea activa
- [ ] ajustar CTA secundaria

### Agent panel

- [ ] ajustar encabezado de estado
- [ ] ajustar bloque de logs
- [ ] ajustar fila inferior de input/control

### Visual checks

- [ ] cada panel cuenta una historia distinta
- [ ] ninguno compite con el editor central
- [ ] ninguno queda “vacío” o demasiado genérico

### Exit condition

- [ ] content parity básica completa fuera del editor hero

---

## Phase 6 — Material fidelity pass

### Implementation

- [ ] ajustar gradients panel por panel
- [ ] ajustar backdrop blur sólo donde da separación real
- [ ] ajustar sombras por profundidad
- [ ] ajustar glows cálidos del foco
- [ ] ajustar bordes especulares sutiles
- [ ] ajustar opacidades para evitar barro visual

### Review questions

- [ ] este material mejora lectura o sólo “decora”?
- [ ] este blur justifica su costo?
- [ ] este glow separa planos o quema la escena?

### Exit condition

- [ ] material parity suficiente sin ruido visual innecesario

---

## Phase 7 — Typography and iconography pass

### Implementation

- [ ] limpiar strings placeholder deformadas
- [ ] jerarquizar tamaños tipográficos
- [ ] normalizar pesos/contrastes
- [ ] alinear baseline y ritmo vertical
- [ ] reemplazar iconografía improvisada por sistema coherente

### Visual checks

- [ ] la UI se sostiene aunque apagues mentalmente el glow
- [ ] el contenido se ordena por sí mismo

### Exit condition

- [ ] desaparece la sensación de prototipo tipográfico

---

## Phase 8 — Interaction fidelity

### Implementation

- [ ] hover states de chrome
- [ ] focus states donde aplique
- [ ] drag de paneles consistente
- [ ] selección de nodos conectada al resto de la escena
- [ ] microfeedback de CTAs

### Technical checks

- [ ] interacción sigue usando scheduling agresivo sano
- [ ] no reaparecen spikes dominantes grotescos
- [ ] no hay flicker por re-layout/present

### Exit condition

- [ ] la UI se siente viva sin romper frame pacing

---

## Phase 9 — GPU correctness audit

### Audit

- [ ] verificar qué partes siguen cayendo a CPU
- [ ] distinguir fallback aceptable vs deuda real
- [ ] validar `final-frame-raw` como ruta dominante
- [ ] revisar logs de debug/perf
- [ ] ejecutar corrida en Kitty/file

### Evidence gate

- [ ] screenshot en Kitty real
- [ ] logs sin glitches visuales serios
- [ ] lectura honesta de limitaciones restantes

### Exit condition

- [ ] podemos afirmar que la fidelidad conseguida vive mayormente en el path GPU principal

---

## Phase 10 — Benchmark and closeout

### Benchmark tasks

- [ ] medir steady-state ms
- [ ] medir repaint continuo
- [ ] medir interacción
- [ ] comparar shell completo vs baseline previo
- [ ] registrar transporte y estrategia usados

### Documentation tasks

- [ ] guardar captura final
- [ ] documentar gaps restantes
- [ ] documentar qué quedó fuera del milestone
- [ ] documentar decisión final sobre defaults recomendados

### Exit condition

- [ ] existe evidencia visual y técnica suficiente para cerrar el milestone

---

## Current progress snapshot

Actualizar esto a medida que avancemos.

- [x] roadmap por fases escrito
- [x] primer shell slice iniciado en `examples/lightcode.tsx`
- [x] primer editor hero slice iniciado en `examples/lightcode.tsx`
- [x] primer secondary-panels slice iniciado en `examples/lightcode.tsx`
- [x] primer material-pass slice iniciado en `examples/lightcode.tsx`
- [x] primer typography/iconography slice iniciado en `examples/lightcode.tsx`
- [x] primer interaction-fidelity slice iniciado en `examples/lightcode.tsx`
- [x] primer benchmark slice registrado en `/tmp/lightcode-perf.log`
- [x] política honesta de transporte: `file` recomendado, `shm` experimental
- [ ] Phase 1 cerrada
- [ ] Phase 2 cerrada
- [ ] Phase 3 cerrada
- [ ] Phase 4 cerrada
- [ ] Phase 5 cerrada
- [ ] Phase 6 cerrada
- [ ] Phase 7 cerrada
- [ ] Phase 8 cerrada
- [ ] Phase 9 cerrada
- [ ] Phase 10 cerrada

---

## Recommended next action

La próxima ejecución recomendada es:

1. cerrar **Phase 1** visualmente
2. inmediatamente entrar a **Phase 4 — Editor hero panel fidelity**

¿Y por qué no ir lineal perfecto 1→2→3→4?

Porque el editor central es el ancla perceptual del mock. Si el héroe no está, el resto parece escenografía.

Pero ojo:

- no saltarse shell parity base
- no saltarse lenguaje mínimo de paneles

Primero cimientos. Después la pieza hero. Siempre.
