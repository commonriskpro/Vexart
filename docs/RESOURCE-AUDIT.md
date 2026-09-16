# 🔬 Auditoría de Recursos — Vexart Engine

**Fecha**: 2026-09-16
**Capas auditadas**: Render loop TS · Rust/WGPU nativo · Memoria/eventos/reactivity · Styled/headless/app
**Hallazgos únicos**: 28 (consolidados de ~60 findings cruzados)

---

## 🔴 P0 — Críticos

### 1. Mouse move invalida TODOS los GPU layers en cada movimiento
`mount.ts:189` — `markDirty()` sin scope se dispara en cada `move` cuando
`!isButtonDown`, forzando `DIRTY_KIND.FULL` → `markAllDirty()`. Destruye
completamente el layer caching del compositor mientras el usuario simplemente
mueve el mouse.

### 2. Cursor blink (530ms) destruye y recrea el árbol completo de Input/Textarea
`input.tsx:249`, `textarea.tsx:511` — `blink()` está dentro de `createMemo`
que wrappea `renderedLines`. Cada 530ms, todo el viewport de líneas, segmentos
de syntax, y bounding boxes se tira y se remonta. Incluso idle.

### 3. O(N²) catastrófico en Diff parsing
`diff.tsx:185` — `diffLines()` (que llama `parseDiff`) se invoca DENTRO del
`.map()` por cada línea. Un diff de 500 líneas ejecuta `parseDiff` 502 veces →
250,000+ object allocations.

### 4. Slider/Switch destruyen el árbol completo en cada drag frame
`slider.tsx:154`, `switch.tsx:51` — `createMemo(() => props.renderSlider(...))`
retorna nuevo JSX en cada cambio de valor. A 60 FPS durante drag, Solid destruye
y remonta track + thumb 60x/segundo.

### 5. 8–33 MB de heap allocation POR FRAME en Rust readback/transport
`readback.rs:136`, `transport.rs:292` — `vec![0u8; needed]` aloca un buffer
RGBA completo del sistema en cada frame. A 60 FPS en 1080p = **500 MB/s** de
churn del allocator.

### 6. GPU vertex buffers se crean y destruyen en cada draw call
`composite/mod.rs` (8 sitios) — A pesar de tener `pctx.vertex_buffer` (2MB
persistente), NINGÚN path de compositing ni texto lo usa. Cada image layer, blur,
mask, y text batch crea un buffer temporal con `device.create_buffer_init()`.

### 7. `msync(MS_SYNC)` bloquea el CPU thread en cada frame SHM
`shm.rs:527` — Sync kernel call sobre 8–33 MB de shared memory en cada frame.
Totalmente redundante en POSIX SHM (tmpfs/page-cache). Agrega 2–6ms de latencia
por frame.

---

## 🟠 P1 — Alto Impacto

### 8. Layout completo + command generation se ejecuta incondicionalmente cada frame
`composite.ts:476` — No hay `isLayoutDirty` flag. Aunque solo cambie un color
de fondo, se ejecuta: walkTree → Flexily solve → command generation → layer
assignment.

### 9. 30,000–60,000 objetos efímeros por segundo en layout adapter
`layout-adapter.ts:482-715` — `_layoutMap`, `_childrenByParent`, y cada
`RenderCommand` se alocan como object literals frescos por frame. En un árbol de
500 nodos a 60 FPS → presión GC extrema.

### 10. Props destructuring rompe la reactividad de SolidJS en styled components
`button.tsx:152`, `badge.tsx:64`, `avatar.tsx:31`, `card.tsx:25` —
`const v = props.variant ?? "default"` evalúa una sola vez en mount. Cambios
dinámicos de variant/size/color se pierden silenciosamente.

### 11. Contextos de render con valores planos causan remounts completos
`combobox.tsx:180`, `select.tsx:183`, `progress-bar.tsx:57` — Pasan
`open: open()` en vez de `get open() { return open() }`. Solid trata el
subtree entero como dirty y lo recrea.

### 12. `.map()` sin key en Code, Diff, RadioGroup, Markdown
`code.tsx:157`, `diff.tsx:177`, `markdown.tsx:324` — Bypass de
`<For>`/`<Index>` de Solid. Cualquier update destruye y remonta TODOS los
hijos en vez de actualizar los que cambiaron.

### 13. VirtualList spacers se destruyen/recrean en cada scroll
`virtual-list.tsx:218` — Funciones inline que retornan `<box height={tp} />` se
evalúan como nuevos nodos. Cada cambio de `startIndex` destruye el spacer
anterior y crea uno nuevo.

### 14. VRAM triple-accounting + eviction muerta
`layer.rs:260`, `resource/mod.rs:240` — Cada layer target se registra 3 veces
en ResourceManager (300% inflado). Y `try_allocate` con LRU eviction nunca se
llama desde FFI → texturas no se reciclan.

### 15. Cascada de strings multi-MB en Kitty encoder
`encoder.rs:91`, `transport.rs:815` — Base64 encode → chunk split → format!
por chunk → from_utf8_lossy → format! final. Un payload de 1MB genera decenas
de MB en strings intermedios.

### 16. Full-frame CPU hash (SipHash) de 8–33 MB por frame
`transport.rs:136` — `payload_hash` hashea TODO el buffer RGBA para detectar
cambios, costando 4–10ms. El dirty tracking del scene graph ya sabe qué cambió.

### 17. Timer cancellation thrashing en cada mouse move
`loop.ts:290` — `nudgeInteraction()` hace `clearTimeout` + `setTimeout` en
cada evento de mouse. A 120Hz = cientos de timer registrations/cancellations por
segundo.

---

## 🟡 P2 — Medio Impacto

### 18. `resolveProps` hace 8 object spreads en cada prop dirty
`node.ts:186` — Cada cambio de prop, hover, o focus dispara 5 spreads + 3
`mergeInteractive` recursivos.

### 19. `writeLayoutBack` aloca 3 objetos por nodo antes de comparar
`layout.ts:53-97` — `prev`, `prevRect`, `nextRect` se alocan ANTES de
verificar si la geometría cambió. 500 nodos = 1,500 objetos inútiles por frame
estático.

### 20. O(depth) ancestor walk por nodo en `computeAccTransform`
`layout.ts:180` — Aloca `chain = []` y recorre ancestros para CADA nodo,
incluso cuando ningún nodo tiene transforms.

### 21. `assignLayersSpatial` — avalancha de Maps, Sets, y string keys por frame
`assign-layers.ts:244-490` — Decenas de estructuras temporales (`boundsKey` con
template strings, `rectCommandsByColor`, `claimedBounds`) se crean y descartan.

### 22. clipStack.slice() en cada render command
`render-graph.ts:682` — 500 commands = 500 array clones + 500 WeakMap inserts
por repaint.

### 23. `Float64Array(9)` nuevo por frame para cada leaf con transform
`walk-tree.ts:534` — TypedArray allocation en el hot path.

### 24. Readback buffers redundantes en offscreen targets
`target.rs:136` — Targets intermedios (blur, mask) alocan readback buffers de
8MB que nunca se leen.

### 25. GPU samplers duplicados en cada upload/effect
`lib.rs:107`, `composite/mod.rs` (6 sitios) — Samplers idénticos se crean
repetidamente; `WgpuContext` ya tiene uno cached.

### 26. Route matching re-sort y re-parse en cada navegación
`router.tsx:73` — Rutas no se pre-compilan. Cada `navigate()` hace sort +
split + normalize de todas las rutas.

### 27. Router destruye layouts compartidos entre páginas
`router.tsx:248` — Navegación entre subrutas (`/dash/settings` →
`/dash/analytics`) dispone el root entero y recrea todo el layout hierarchy.

---

## 🟢 Leaks Confirmados

### 28. Memory leaks reales
- **`scaledImageCaches`** (`image.ts:39`) — Set que crece sin límite, sin
  `destroy()`.
- **`subscribers`** (`input.ts:11`) — Set global que no se limpia en
  `mount.destroy()`.
- **`useQuery`** (`data.ts:90`) — Fetch/retry sin AbortController; callbacks
  disparan después de unmount.
- **`_msdfFamilyCache`** (`gpu-renderer-backend.ts:300`) — Nunca se limpia en
  `destroy()`.

---

## 📊 Impacto Estimado por Capa

| Capa | CPU Waste | Memory Waste | GPU Waste |
|------|-----------|-------------|-----------|
| **Render Loop** | 🔴 Altísimo (full tree walk + allocs every frame) | 🔴 60K+ objects/sec GC pressure | — |
| **Rust Native** | 🔴 Altísimo (8-33MB alloc + 10ms hash/frame) | 🔴 500MB/s heap churn | 🔴 Buffer thrash + samplers |
| **Events/Hit-Test** | 🟠 Alto (regex parsing + O(N) scans) | 🟠 Timer + event object churn | — |
| **Headless/Styled** | 🔴 Altísimo (tree teardowns at 60fps) | 🟠 Broken reactivity = extra nodes | — |
| **Leaks** | — | 🔴 Unbounded growth over time | — |

---

## 🔥 Decisiones de Diseño (Grilling)

### Resoluciones

| Decisión | Resolución |
|----------|-----------|
| Alcance | Fase 1 primero, medir impacto, luego decidir si continuar |
| Estabilidad | Calidad gráfica sin degradación |
| TS + Rust | Fase 1 = TS only + leaks. Rust = Fase 2 separada |
| Bugs de reactividad (#10, #11) | Fuera de scope, PR separados con `fix()` |
| Leaks | Todos los 4 incluidos en Fase 1 |
| Branching | Main directo, commits atómicos después de cada fix |
| `payload_hash` (Fase 3) | Eliminar; fixear dirty tracking si tiene gaps |
| Fix `mount.ts:189` | Eliminar `markDirty()` bare, confiar en `feedPointer()` |
| `shouldRepaint` agresivo | Dejarlo para Fase 2, fix de markDirty cubre el 95% |
| Aislación `blink()` | Cursor como hijo en layout, solo `opacity` lee `blink()` |
| Micro-benchmark | Script standalone `benchmarks/render-loop.ts` |
| Verificación | Tests + showcase visual + benchmark antes/después |
| Orden de ejecución | 6 quick wins (mayor impacto primero) + 4 leaks |

### Fix `mount.ts:189` — Mouse move dirty scope

**Problema**: `markDirty()` sin scope se dispara en cada mouse move cuando
`!isButtonDown`, forzando `DIRTY_KIND.FULL` → `markAllDirty()`. Invalida
todos los GPU layers en cada hover.

**Opciones evaluadas**:
- (A) Eliminar `markDirty()` — confiar en `feedPointer()` que ya marca
  `DIRTY_KIND.INTERACTION`.
- (B) Reemplazar con `markDirty({ kind: DIRTY_KIND.INTERACTION })` — redundante
  con `feedPointer`.
- (C) Condicionar a hover state change real — más robusto pero más complejo.

**Resolución: A.**

**Evidencia**:
1. `feedPointer()` se ejecuta PRIMERO (línea 177) y ya marca
   `DIRTY_KIND.INTERACTION` + `pointer.dirty = true`.
2. `markDirty()` se ejecuta DESPUÉS (línea 190) y sobreescribe con
   `DIRTY_KIND.FULL`.
3. `updateInteractiveStates` detecta hover via hit-testing coordinado por
   `pointer.dirty`, dispara `onNodeVisualChanged`, marca dirty solo el layer
   afectado vía `DIRTY_KIND.NODE_VISUAL` + `markLayerDirtyByKey`.
4. Durante drag (`isButtonDown === true`), `shouldGlobalDirty` ya evaluaba a
   `false` — hovers durante drag siempre funcionaron sin `markDirty()`.

### Aislación de `blink()` — Cursor como hijo

**Opciones evaluadas**:
- (A) Cursor como hijo en layout tree, solo `opacity` lee `blink()`.
- (B) Cursor como overlay absoluto fuera del flujo de texto.

**Resolución: A.**

**Análisis de rendimiento**:
- Blink toggle → `setProperty("opacity", 0/1)` en UN nodo →
  `markNodeDirty(cursor)` → `DIRTY_KIND.NODE_VISUAL` → solo el layer del
  cursor se marca dirty → damage rect mínima (~2×16 px).
- Opacity no afecta layout. No dispara Flexily. No recalcula posiciones.
- Costo total: 1 prop mutation + 1 damage rect + 1 layer partial repaint cada
  530ms.

### Micro-benchmark

Script standalone `benchmarks/render-loop.ts`:
- Monta árbol sintético de ~500 nodos.
- Corre N frames headless.
- Reporta: frames/sec, tiempo promedio por frame, allocs estimadas por frame.
- Reproducible, no contamina tests ni showcase.
- Se corre antes y después de cada fase para medir impacto.

---

## 🗺️ Roadmap de Remediación

### Fase 1 — Quick Wins TS + Leaks (main directo, commits atómicos)

1. `mount.ts:189` — eliminar `markDirty()` en mouse move
2. `writeLayoutBack` — early-return escalar antes de alocar
3. `debugUpdateStats` — guard con `if (isDebugEnabled())`
4. `markDirty()` — default scope como const frozen
5. `blink()` — aislar al nodo cursor (solo opacity)
6. `parseDiff` — `createMemo` + hoistear `maxLineDigits`
7. `scaledImageCaches` — agregar `destroy()` para remover del Set
8. `subscribers` — reset en `mount.destroy()`
9. `useQuery` — AbortController + guard `isMounted`
10. `_msdfFamilyCache` — limpiar en `backend.destroy()`

### Fase 2 — Hot Path Rust
- Persistent scratch buffer para readback (eliminar 500MB/s churn)
- Unificar vertex uploads via `pctx.vertex_buffer`
- Eliminar `msync(MS_SYNC)` + persistir SHM ring mappings
- Streaming base64 en Kitty encoder (eliminar cascada de strings)
- Eliminar `payload_hash` → fixear dirty tracking si tiene gaps

### Fase 3 — Hot Path TS avanzado
- Layout dirty gating (`isLayoutDirty`)
- Flatten `_layoutMap` a Float64Array parallel buffers
- `.map()` → `<Index>`/`<For>` en Code/Diff/Markdown
- Persistent spacers en VirtualList
- Timer coalescing en `nudgeInteraction`
- Refinar `shouldRepaint` para no agendar frames innecesarios

### Fase 4 — Arquitectura
- Fix VRAM triple-accounting + activar eviction
- Lazy readback buffers + samplers compartidos
- Router layout preservation
- Subpath exports + `sideEffects: false`

### Fuera de Scope (PRs separados)
- Finding #10: Props destructuring rompe reactividad en styled components
- Finding #11: Contextos de render con valores planos causan remounts
- Ambos son bugs funcionales. Commit type: `fix()`.
