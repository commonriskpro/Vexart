# TGE Window System Architecture

## Goal

Diseñar un sistema de ventanas tipo macOS / Windows sobre TGE que permita:

- mover ventanas libremente,
- enfocarlas al hacer click,
- minimizarlas / maximizarlas / restaurarlas,
- renderizarlas con estética web,
- escalar a más componentes sin convertir el árbol en una bomba de estado, layers y z-index manuales.

Este documento define:

1. la arquitectura recomendada,
2. el modelo mental correcto,
3. las reglas para que escale bien,
4. un plan de implementación por fases,
5. qué partes deberían integrarse en el motor para que este comportamiento sea “default” y no una colección de hacks por app.

---

## Current state of the engine (verified)

Antes de proponer arquitectura, verifiqué qué existe hoy en el motor:

- `useDrag` ya usa pointer capture y ciclo drag start / move / end.
- el sistema de foco ya soporta nodos `focusable`, `onKeyDown`, `onPress` y scopes.
- `floating="root"` y `floating="parent"` ya existen.
- `zIndex` ya existe para floating nodes.
- durante drag, el engine puede promover el nodo a interaction layer.
- el loop ya hace re-layout inmediato cuando hubo click/focus change para evitar un frame “viejo”.

### Archivos relevantes

- `packages/renderer/src/drag.ts`
- `packages/renderer/src/focus.ts`
- `packages/renderer/src/interaction.ts`
- `packages/renderer/src/loop.ts`
- `examples/lightcode.tsx`

### Conclusión

TGE ya tiene primitives importantes para construir un window manager serio.

Lo que falta NO es “inventar desde cero” drag/focus/floating, sino diseñar una capa de windowing consistente arriba del motor y, en paralelo, formalizar unas cuantas capacidades del engine para que no dependan de patrones repetidos en cada app.

---

## Problem statement

Hacer una ventana suelta es fácil.

Hacer un sistema de ventanas que siga siendo mantenible cuando agregás:

- popovers,
- tooltips,
- diálogos,
- editores,
- listas virtualizadas,
- overlays,
- menús contextuales,
- dock / taskbar,
- snapping,
- persistencia de layout,
- modales,

es un problema de arquitectura, no de “sumar props”.

El error clásico es modelar cada ventana como un componente autónomo con estado local de:

- `x`
- `y`
- `active`
- `zIndex`
- `minimized`
- `maximized`

Eso sirve en demos. Después explota.

---

## Architecture principles

## 1. Single source of truth

El estado de windowing debe vivir en un manager central, no repartido entre componentes.

## 2. Headless logic, visual shell separado

La lógica de ventanas y el chrome visual deben estar desacoplados.

## 3. Window focus != inner focus

Debe existir una distinción clara entre:

- foco de ventana (qué ventana está activa / delante)
- foco interno (qué control dentro de esa ventana recibe teclado)

## 4. A window is an entity, not just a component

Una ventana debe representarse como una entidad del sistema con estado, lifecycle y comandos.

## 5. Commands over ad-hoc mutations

Mover, resizear, minimizar o restaurar deben expresarse como operaciones del manager.

## 6. Layering with policy, not improvisation

El root de la ventana controla el stacking externo. Los hijos internos no deberían inventarse su propio `zIndex` salvo casos explícitos.

## 7. The engine should own generic interaction primitives

La app define reglas de negocio. El motor debería resolver primitives genéricas: foco, captura, layers, hit testing, floating, región activa, etc.

---

## Recommended architecture

Separar el sistema en cuatro capas.

## A. Window Manager

Fuente de verdad del estado global del sistema de ventanas.

### Responsibilities

- abrir / cerrar ventanas
- activar ventana
- llevar ventana al frente
- mantener orden de apilado
- mover y resizear
- minimizar / maximizar / restaurar
- persistir layout
- conocer restricciones (`movable`, `resizable`, `modal`, `keepAlive`)

---

## B. Desktop / Workspace

Contenedor del escritorio.

### Responsibilities

- renderizar el fondo
- renderizar ventanas según orden visual
- definir bounds disponibles para maximize / snap
- renderizar taskbar / dock
- renderizar overlays globales (guides, selections, drop targets)

---

## C. Window Frame

Shell visual e interactivo de cada ventana.

### Responsibilities

- titlebar
- botones (close / minimize / maximize)
- borde / sombra / glass / estados
- drag de header
- resize handles
- click para activar
- adaptación visual si está activa o no

La ventana debería exponerse como un root flotante y layerizado:

```tsx
<box
  layer
  floating="root"
  focusable
  floatOffset={{ x: window.x, y: window.y }}
  zIndex={window.z}
  onPress={() => manager.focusWindow(window.id)}
>
  ...
</box>
```

---

## D. Window Content

Contenido interno desacoplado del sistema.

### Responsibilities

- UI específica de cada app/panel
- navegación interna
- formularios / listas / canvas / editor / data views

### Non-responsibilities

El contenido NO debería manejar por su cuenta:

- `zIndex` global
- drag de la ventana
- maximize/minimize
- reglas de stacking global

---

## State model

## Core types

```ts
type WindowStatus = "normal" | "minimized" | "maximized" | "closed"

type WindowBounds = {
  x: number
  y: number
  width: number
  height: number
}

type WindowDescriptor = {
  id: string
  kind: string
  title: string
  status: WindowStatus
  bounds: WindowBounds
  restoreBounds?: WindowBounds
  z: number
  focused: boolean
  movable: boolean
  resizable: boolean
  minimizable: boolean
  maximizable: boolean
  closable: boolean
  modal: boolean
  keepAlive: boolean
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}
```

## Manager state

```ts
type WindowManagerState = {
  windowsById: Map<string, WindowDescriptor>
  order: string[]
  focusedWindowId: string | null
  activeModalId: string | null
}
```

### Why this shape

- `windowsById` resuelve acceso rápido
- `order` expresa stacking y render order
- `focusedWindowId` separa foco global de árbol interno
- `activeModalId` ayuda a traps y políticas de interacción

---

## Window manager API

## Required operations

```ts
type WindowManager = {
  openWindow(input: OpenWindowInput): void
  closeWindow(id: string): void
  focusWindow(id: string): void
  bringToFront(id: string): void
  moveWindow(id: string, next: Partial<WindowBounds>): void
  resizeWindow(id: string, next: Partial<WindowBounds>): void
  minimizeWindow(id: string): void
  maximizeWindow(id: string, workspace: WindowBounds): void
  restoreWindow(id: string): void
  toggleMinimize(id: string): void
  toggleMaximize(id: string, workspace: WindowBounds): void
  listWindows(): WindowDescriptor[]
  getWindow(id: string): WindowDescriptor | undefined
}
```

## Strong recommendation

Internamente, estas operaciones deberían ejecutarse como comandos del sistema:

- `OPEN_WINDOW`
- `FOCUS_WINDOW`
- `BRING_TO_FRONT`
- `MOVE_WINDOW`
- `RESIZE_WINDOW`
- `MINIMIZE_WINDOW`
- `MAXIMIZE_WINDOW`
- `RESTORE_WINDOW`
- `CLOSE_WINDOW`

Esto habilita a futuro:

- undo / redo
- persistencia serializable
- time-travel / debug
- telemetría de interacciones
- replay de layout

---

## Focus model

Este punto es CRÍTICO.

## Two independent focus layers

### 1. Window focus

Qué ventana está activa.

Se actualiza cuando:

- hacés click en la ventana
- comenzás drag
- restaurás una ventana minimizada
- abrís una modal

### 2. Inner focus

Qué control dentro de esa ventana recibe teclado.

Esto ya puede apoyarse en el sistema actual de `focusable` y focus scopes del renderer.

## Rule

Cuando se hace click en una ventana:

1. primero se activa la ventana,
2. luego el sistema interno de foco decide qué nodo queda enfocado.

No mezclar ambas cosas en una sola signal.

---

## Z-order and stacking model

## Recommendation

No usar `zIndex` hardcodeado repartido por todos lados.

El manager debe calcular el stack visual.

### Policy

- el root de cada ventana recibe un `z`
- la ventana enfocada va al frente
- modales van por encima del stack normal
- overlays globales del desktop tienen una banda reservada superior

### Suggested z-bands

```txt
0-99     desktop background / workspace chrome
100-999  normal windows
1000+    modals / overlays / transient global UI
```

La banda no es estrictamente obligatoria, pero ayuda a mantener disciplina.

---

## Dragging model

## Correct flow

El drag de una ventana NO debería ser “la ventana se muta a sí misma porque sí”.

Debe seguir este flujo:

1. `focusWindow(id)`
2. `bringToFront(id)`
3. `beginMove(id, anchor)`
4. `moveWindow(id, nextBounds)` durante pointer move
5. `endMove(id)`

## Drag anchor

Para mover con estabilidad:

- capturar `anchorX = evt.nodeX`
- capturar `anchorY = evt.nodeY`
- calcular nueva posición con `evt.x - anchorX`, `evt.y - anchorY`

Ese patrón ya existe hoy en `examples/lightcode.tsx` y es válido como primitive.

## Important rule

El drag debería vivir en el frame/header, no en cualquier parte del contenido, salvo que explícitamente se quiera una ventana arrastrable completa.

---

## Resize model

## Recommendation

El resize debe ser una capability explícita del `WindowFrame`, mediante handles:

- norte
- sur
- este
- oeste
- esquinas

## Constraints

Debe respetar:

- `minWidth`
- `minHeight`
- `maxWidth`
- `maxHeight`
- bounds del workspace cuando aplique

## Future-proofing

Si el resize ya se modela como comando, después podés agregar:

- snap edges
- resize from grid
- docking
- magnetic guides

sin cambiar el contrato principal.

---

## Minimize / maximize / restore model

## Minimize

Minimizar NO debería significar automáticamente “destroy”.

### Option A — unmount while minimized

**Pros**

- menos costo de render
- implementación simple

**Cons**

- el contenido puede perder estado si no se persiste
- remount potencialmente costoso

### Option B — keepAlive while minimized

**Pros**

- mantiene estado
- UX más cercana a desktop real

**Cons**

- más memoria
- más cuidado con timers / queries / loops

## Recommendation

Implementar `keepAlive` por ventana y arrancar con política mixta:

- por defecto: `minimized` no se renderiza en desktop
- opcionalmente: algunas ventanas pueden mantenerse vivas

## Maximize

Maximizar requiere guardar `restoreBounds`.

### Required flow

1. guardar bounds actuales en `restoreBounds`
2. reemplazar bounds por el área del workspace
3. marcar `status = "maximized"`

## Restore

Si existe `restoreBounds`, volver a ese valor exacto.

Esto NO debe resolverse con heurísticas posteriores. Debe ser parte del modelo desde el día uno.

---

## Rendering and layers

## Rule of thumb

Cada ventana debería tener un root flotante propio y, en general, un `layer` propio.

## Why

Porque el sistema de ventanas naturalmente genera:

- superposición,
- invalidación parcial,
- stacking,
- efectos visuales costosos,
- interacción intensiva.

## But do not over-layer children

No convertir cada hijo en `layer` por paranoia.

### Good candidates for child layers

- canvas pesado
- editor rico
- graph / scene viewport
- drag preview
- overlay especializado

### Bad candidates

- header común
- filas normales
- chips
- texto corriente
- wrappers decorativos sin costo real

---

## Component boundary recommendations

## Suggested structure

```txt
packages/components/src/windowing/
  types.ts
  manager.ts
  context.ts
  Desktop.tsx
  WindowHost.tsx
  WindowFrame.tsx
  WindowHeader.tsx
  WindowControls.tsx
  WindowResizeHandles.tsx
  Taskbar.tsx
  hooks/
    useWindowDrag.ts
    useWindowResize.ts
    useWindowFocus.ts
```

## Headless / visual split

- `manager.ts`: estado y operaciones
- `context.ts`: provider / consumer
- `WindowFrame.tsx`: shell visual reusable
- `WindowHost.tsx`: decide si renderizar, mantener alive, montar portales internos, etc.

---

## Event flow

## Click on a window

1. click entra al root/frame
2. `focusWindow(id)`
3. `bringToFront(id)`
4. foco interno continúa con sistema normal

## Drag titlebar

1. `focusWindow(id)`
2. `bringToFront(id)`
3. `beginMove(id)`
4. pointer capture
5. `moveWindow(id, nextBounds)`
6. `endMove(id)`

## Click minimize

1. `minimizeWindow(id)`
2. taskbar refleja estado
3. desktop deja de renderizar o conserva keepAlive según policy

## Click maximize

1. guardar `restoreBounds`
2. ocupar workspace
3. desactivar drag libre si así se decide

## Restore from taskbar

1. `restoreWindow(id)`
2. `focusWindow(id)`
3. `bringToFront(id)`

---

## What not to do

## Avoid these traps

- poner estado de posicionamiento en cada ventana de forma aislada
- dejar que cada componente defina su propio `zIndex` global
- usar minimize como alias de close
- mezclar foco de ventana y foco interno en una sola flag
- usar `floating="root"` arbitrariamente en hijos internos sin política
- esconder reglas del sistema en componentes visuales dispersos
- convertir todo en layer “por si acaso”

---

## Phased implementation plan

## Phase 1 — Core manager and state model

### Objective

Tener una base headless y estable del sistema.

### Scope

- definir `WindowDescriptor`, `WindowBounds`, `WindowStatus`
- crear `createWindowManager()`
- implementar store central
- implementar operaciones base
- definir orden visual
- definir contrato para workspace bounds

### Deliverables

- `types.ts`
- `manager.ts`
- tests del manager
- API mínima usable desde componentes

### Exit criteria

- se pueden abrir, cerrar, enfocar y apilar ventanas sin UI compleja

---

## Phase 2 — Desktop and WindowFrame shell

### Objective

Renderizar ventanas reales con chrome visual reusable.

### Scope

- crear `Desktop.tsx`
- crear `WindowFrame.tsx`
- crear `WindowHeader.tsx`
- crear `WindowControls.tsx`
- renderizar ventanas desde el manager
- aplicar focus visual / active visual

### Deliverables

- shell visual funcional
- click para activar
- stack visual consistente

### Exit criteria

- múltiples ventanas visibles, enfocables y estilables como web

---

## Phase 3 — Dragging and bring-to-front

### Objective

Agregar movimiento sólido de ventanas con comportamiento desktop.

### Scope

- `useWindowDrag.ts`
- drag desde header
- pointer capture
- `focusWindow + bringToFront` al iniciar drag
- constraints básicas del workspace

### Deliverables

- drag suave y estable
- sin pérdida de foco ni glitches de stack

### Exit criteria

- varias ventanas se pueden mover sin interferirse

---

## Phase 4 — Minimize, maximize, restore, taskbar

### Objective

Completar lifecycle principal de ventanas.

### Scope

- minimize
- maximize
- restore
- `restoreBounds`
- `Taskbar.tsx`
- restaurar desde taskbar
- política `keepAlive`

### Deliverables

- ciclo de vida completo
- barra inferior o dock funcional

### Exit criteria

- una ventana puede minimizarse, restaurarse y maximizarse sin perder consistencia

---

## Phase 5 — Resize and constraints

### Objective

Agregar resize serio.

### Scope

- `WindowResizeHandles.tsx`
- resize por bordes y esquinas
- límites mínimos y máximos
- clamping al workspace

### Deliverables

- resize handles reutilizables
- UX coherente en ventanas complejas

### Exit criteria

- resize correcto sin corrupción visual ni layout roto

---

## Phase 6 — Advanced overlays and transient UI

### Objective

Resolver componentes que conviven con ventanas.

### Scope

- tooltips
- popovers
- dropdowns
- context menus
- modal stacking rules
- overlays per-window vs globales

### Deliverables

- política clara de transient layers
- integración limpia con el window manager

### Exit criteria

- transient UI no rompe foco ni stacking

---

## Phase 7 — Persistence, snapping and ergonomics

### Objective

Llevar el sistema a nivel “producto”.

### Scope

- persistencia de layout
- snap a bordes
- tiling parcial
- keyboard shortcuts globales
- restore session

### Deliverables

- experiencia robusta de desktop
- estado persistente entre sesiones

### Exit criteria

- sistema listo para apps complejas y workspace duradero

---

## What should live in components vs engine

## Should live in components/windowing layer

- `WindowManager`
- `Desktop`
- `Taskbar`
- `WindowFrame`
- `WindowControls`
- reglas de negocio de minimize / maximize / restore
- persistencia de layout
- políticas de stacking de la aplicación

## Should be integrated in the engine for first-class support

- primitives de dragging más declarativas
- focus/activation helpers para roots flotantes
- mejor política de stacking para floating interactivos
- resize cursor / resize semantics si se vuelve parte del lenguaje de componentes
- transient overlay model consistente

---

## Engine integrations required for default support

Este apartado separa qué necesitamos integrar en el motor para que el comportamiento de “ventanas desktop” no dependa de repetir hacks por aplicación.

## 1. Window activation primitive

### Problem

Hoy la activación de una ventana se puede construir con `onPress`, `focusable` y `zIndex`, pero la semántica de “activar root flotante” todavía es una convención de app.

### Engine addition

Agregar una primitive declarativa tipo:

```tsx
<box windowRoot windowId="editor" />
```

o bien props equivalentes:

```tsx
<box floating="root" activatable windowScope="window:editor" />
```

### Benefit

- click-to-activate uniforme
- foco de ventana formalizado
- menos boilerplate por app

---

## 2. Declarative draggable regions

### Problem

Hoy el patrón existe con `useDrag`, pero el header draggable sigue siendo manual.

### Engine addition

Agregar soporte declarativo para regiones de drag:

```tsx
<box draggableRegion windowTarget="editor" />
```

o una primitive headless del renderer/components.

### Benefit

- reduce código repetido
- estandariza pointer capture + bring-to-front
- evita errores por anchors inconsistentes

---

## 3. Declarative resize regions

### Problem

Resize será repetitivo si cada app reimplementa handles y cálculos.

### Engine addition

Agregar handles / regiones declarativas:

```tsx
<box resizeRegion="east" windowTarget="editor" />
```

### Benefit

- resize consistente
- integración natural con bounds y hit targets
- base para cursores y feedback visual

---

## 4. First-class floating root stacking policy

### Problem

Hoy el engine tiene `floating` y `zIndex`, pero no una política explícita de “top active floating root” o bandas de stacking por rol.

### Engine addition

Formalizar roles de stack:

- `desktop`
- `window`
- `modal`
- `overlay`
- `tooltip`

Ejemplo:

```tsx
<box floating="root" stackRole="window" />
<box floating="root" stackRole="modal" />
```

### Benefit

- menos `zIndex` mágico
- reglas coherentes para toda la app
- mejor compatibilidad entre ventanas y transient UI

---

## 5. Window-local focus scopes by default

### Problem

Hoy hay focus scopes, pero una ventana como unidad interactiva todavía requiere coordinación manual para que su foco interno sea aislable/recuperable.

### Engine addition

Permitir que un root flotante activable cree automáticamente un scope interno de foco.

### Benefit

- separación limpia entre foco global y foco interno
- mejor comportamiento con tabs, modales y restore

---

## 6. Transient overlay anchoring model

### Problem

Popovers, dropdowns, tooltips y context menus son inevitables. Si no se define un modelo claro, el stack se vuelve inconsistente.

### Engine addition

Agregar un modelo explícito para overlays transientes:

- overlay local a ventana
- overlay global de desktop
- prioridad por rol
- dismiss / focus-loss rules coherentes

### Benefit

- menos bugs de stacking
- overlays correctamente anclados a su ventana o al root global

---

## 7. Workspace bounds / viewport service

### Problem

Maximize, snap y clamping dependen de conocer claramente el área disponible.

### Engine addition

Exponer de forma estándar:

- bounds del terminal
- bounds del workspace útil
- cambios de resize con API más directa para windowing

### Benefit

- maximize consistente
- snapping sencillo
- menos lógica duplicada por app

---

## 8. Optional built-in windowing package

### Problem

Si cada app implementa su propio window manager encima del engine, se duplican patrones y bugs.

### Engine addition

Agregar un paquete oficial tipo:

```txt
@tge/windowing
```

con:

- manager headless
- Desktop
- WindowFrame
- Taskbar
- drag/resize helpers

### Benefit

- patrón canónico
- adopción más rápida
- menor dispersión arquitectónica

---

## Recommended implementation order for engine work

Si hay que priorizar integraciones al motor, este sería el orden correcto:

1. **window activation primitive**
2. **declarative draggable regions**
3. **first-class stacking roles**
4. **window-local focus scopes**
5. **declarative resize regions**
6. **transient overlay model**
7. **workspace bounds service**
8. **official `@tge/windowing` package**

---

## Final recommendation

La mejor estrategia para TGE NO es saltar directo a “hacer ventanas bonitas”.

La estrategia correcta es:

1. construir un `WindowManager` headless central,
2. montar `Desktop + WindowFrame` como shell reusable,
3. usar el motor actual para drag/focus/floating/layers,
4. formalizar en el engine las primitives que hoy todavía son convención,
5. recién después avanzar a snap, docking, persistencia y ergonomía avanzada.

En otras palabras:

> primero sistema,
> después estética,
> después ergonomía avanzada.

Si se respeta ese orden, el windowing de TGE puede crecer como plataforma.
Si se invierte, termina siendo una demo espectacular con arquitectura frágil.
