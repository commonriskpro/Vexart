# Plan de implementación de Grid v1.x en Vexart
**Estado:** plan cerrado de ejecución. La edición de este documento solo planifica;
no inicia implementación, no abre un fork remoto, no publica paquetes y no
actualiza goldens. La ejecución futura requiere una autorización separada para
seleccionar el diseño local y seguir estas tareas. No existe una fase 0, spike,
sondeo de aceptación upstream ni decisión técnica aplazada.
**Versión objetivo:** línea `v1.x @beta` de la feature. Durante la ejecución no se
cambia ninguna versión, no se publica npm y no se modifica el PRD para hacer que
parezca que Grid ya está soportado. La documentación de producto se actualiza
solo en la tarea final, después de pasar los gates.
**Fuente normativa congelada:** [CSS Grid Layout Module Level 1, Candidate
Recommendation Draft de 26-03-2025](https://www.w3.org/TR/2025/CRD-css-grid-1-20250326/).
Este plan usa sus secciones 7 (definición de grid), 8 (placement), 10
(alignment) y 11 (grid layout algorithm). La CR es una referencia de comportamiento,
no una promesa de implementar CSS/DOM completo.
---
## 1. Resultado operativo y límites
El resultado es un modo `layout="grid"` dentro del árbol TypeScript existente:
```text
SolidJS universal reconciler
  -> TGENode retenido y reactividad
  -> Flexily 0.6.0 vendorizado (un único Node; flex o grid)
  -> layoutMap / rectángulos locales
  -> render graph, interacción, layers y Rust/WGPU sin nueva frontera FFI
```
El modo debe servir dashboards, formularios, tarjetas, tablas y paneles de
terminal. El alcance v1.x conserva el inventario que ya tenía la propuesta:
- tracks explícitos e implícitos de columnas y filas;
- tamaños en px, porcentajes, `auto`, `min-content`, `max-content`, `fr`,
  `minmax()`, `fit-content()` y `repeat()` fijo, `auto-fill` y `auto-fit`;
- placement por líneas numéricas, líneas nombradas, `span` y áreas nombradas;
- auto-placement por filas o columnas y `dense` opt-in;
- `gap`, padding, bordes, márgenes numéricos, min/max, alineación de tracks e
  ítems, contenido intrínseco y resize del terminal;
- anidamiento Flex -> Grid, Grid -> Flex y Grid -> Grid;
- placement de hijos `box`, `text`, `img` y `canvas` mediante el mismo árbol;
- floating/absolute, scroll, clip, focus, hit-testing, transforms y damage
  consumiendo el mismo resultado de layout.
Es un **subset terminal explícito**, no CSS entero: el eje es horizontal LTR, no
hay writing modes ni CSSOM, y no se añaden `subgrid`, masonry, layout de `table`,
multicolumna, fragmentación, selectores, cascada ni DOM. Baseline/auto margins de
CSS no forman parte de esta API: los márgenes existentes siguen siendo números
px; `baseline`, `safe/unsafe` y `auto` en margin producen diagnóstico determinista
si se intentan introducir. El floating existente conserva su contrato de Vexart,
pero no se promete el algoritmo CSS de placement de absolutamente posicionados,
marcado at-risk por la CR.
La exclusión de una capacidad CSS debe estar reflejada en tipos, validación,
fixtures y documentación; nunca se obtiene por fallback silencioso a Flex ni
por geometría `Infinity`/`NaN`.
---
## 2. Decisiones cerradas
### 2.1 Un solo Flexily interno
- El único motor es un workspace privado `packages/internal-flexily/` con
  `package.json.name = "flexily"`, `private: true`, versión fuente `0.6.0`.
- El `package.json` raíz conservará la dependencia con la forma exacta
  `"flexily": "workspace:*"`. Los imports existentes `from "flexily"` no se
  cambian a rutas internas ni a otro nombre.
- La fuente se clona del checkout reproducible de
  [beorn/flexily en e9a752aacef9d84d20c383443b9c89f2ad2daf4a](https://github.com/beorn/flexily/tree/e9a752aacef9d84d20c383443b9c89f2ad2daf4a),
  que es el commit correspondiente al tag `v0.6.0`.
- El tarball de comprobación es
  [flexily-0.6.0.tgz](https://registry.npmjs.org/flexily/-/flexily-0.6.0.tgz).
  La integridad observada en `bun.lock` antes de enlazar el workspace es
  `sha512-V2z9Nx+a77dicQUM5ktU6A4wSoNUbbVRocOCjXgLHIkhl/pdmrtX8MWQTwBJ3mCuB4pkniitvKW5C4tBo94XIg==`; se usa para verificar el tarball vendorizado. Después de `workspace:*`, Bun debe resolver el workspace y no el tarball.
- No se edita `node_modules`, no se espera aceptación upstream, no se abre PR
  upstream y no se publica el fork. MIT debe quedar documentada y preservada.
- La vendorización incluye la configuración de build/typecheck necesaria para
  que `logger.ts` mantenga sus imports dinámicos de `loggily`/`debug` de forma
  reproducible. Copiar solo el contenido visible en un sourcemap no basta.
- El inventario de fuentes que deben verificarse contra el artefacto incluye
  `layout-zero.ts`, `layout-measure.ts`, `layout-flex-lines.ts`, `node-zero.ts`,
  `layout-helpers.ts`, `layout-traversal.ts`, `layout-stats.ts`, `types.ts` e
  `index.ts`. Si un sourcemap no embebe `index.ts` o `text-layout.ts`, el
  checkout fijado y el tarball son la autoridad: no se inventa un
  `text-layout.ts` de Flexily.
- El algoritmo Grid vive en nuevos `packages/internal-flexily/src/grid/*.ts`
  granulares. `packages/engine/src/ffi/flex-sync.ts` traduce props; no contiene
  un segundo solver.
### 2.2 Propiedad de datos y límites de integración
TypeScript conserva la propiedad de árbol, reactividad, walk-tree, Flexily
layout, render graph, eventos, foco, interacción e hit-testing. Rust conserva
WGPU, composición, Kitty, SHM/file/direct, imágenes, canvas y recursos GPU.
Grid no crea una frontera FFI ni un mapa de layout paralelo.
La integración con `node.ts` y `layout.ts` tiene un propietario único en la
Tarea G-031. Otros workers no editan esos archivos en paralelo. El adaptador
solo lee rectángulos calculados, y `Node.layout` sigue recibiendo rectángulos
locales; cachés y `layoutMap` no se sustituyen por un formato Grid.
Anclas actuales que deben releerse antes de editar:
| Contrato actual | Ubicación comprobada |
|---|---|
| `LAYOUT_PROPS`, sync full/incremental | `packages/engine/src/ffi/flex-sync.ts:28-39,106-127,129-218` |
| alias físicos Flex | `packages/engine/src/ffi/flex-sync.ts:305-315` |
| measure de texto y caso no restringido | `packages/engine/src/ffi/flex-sync.ts:221-250` |
| reparent/insert/remove | `packages/engine/src/ffi/node.ts:194-249` |
| setters Solid, arrays y sizing | `packages/engine/src/reconciler/reconciler.ts:233-235,287-395` |
| resize del viewport | `packages/engine/src/loop/loop.ts:447-468` |
| calculate y salida retained | `packages/engine/src/loop/layout-adapter.ts:335-350` |
| writeback, damage y transforms | `packages/engine/src/loop/layout.ts:74-218` |
| walk del árbol y text/box placement | `packages/engine/src/loop/walk-tree.ts:153-268` |
### 2.3 Contrato TypeScript público congelado
Los tipos se declaran explícitamente en el bloque de tipos público del engine;
no se usa `export *` para añadirlos. Todos los arrays son readonly para hacer
visible que una actualización debe reemplazar la referencia completa.
```ts
export type GridPercent = { readonly percent: number } // 0..100
export type GridFr = { readonly fr: number } // > 0
export type GridBreadth =
  | number // px >= 0
  | GridPercent
  | "auto"
  | "min-content"
  | "max-content"
export type GridMaxBreadth = GridBreadth | GridFr
export type GridMinMax = {
  readonly minmax: readonly [GridBreadth, GridMaxBreadth]
}
export type GridFitContent = {
  readonly fitContent: number | GridPercent
}
export type GridRepeatCount = number | "auto-fill" | "auto-fit"
export type GridTrackSize =
  | GridBreadth
  | GridFr
  | GridMinMax
  | GridFitContent
export type GridTrack =
  | GridTrackSize
  | { readonly size: GridTrackSize; readonly before?: readonly string[]; readonly after?: readonly string[] }
  | { readonly repeat: { readonly count: GridRepeatCount; readonly tracks: readonly GridTrack[] } }
export type GridLineRef =
  | number // 1-based; negative counts backwards; zero is invalid
  | { readonly name: string; readonly occurrence?: number }
  | { readonly span: number; readonly name?: string }
export type GridPlacement = {
  readonly start?: GridLineRef | "auto"
  readonly end?: GridLineRef | "auto"
}
export type GridAreaPlacement = string | {
  readonly rowStart: GridLineRef | "auto"
  readonly columnStart: GridLineRef | "auto"
  readonly rowEnd: GridLineRef | "auto"
  readonly columnEnd: GridLineRef | "auto"
}
export type GridAutoFlow = "row" | "column" | "row-dense" | "column-dense"
export type GridContentAlignment =
  | "start" | "end" | "center" | "space-between" | "space-around"
  | "space-evenly" | "stretch"
export type GridItemAlignment = "start" | "end" | "center" | "stretch"
export type GridErrorCode =
  | "GRID_INVALID_VALUE" | "GRID_INVALID_TRACK" | "GRID_INVALID_REPEAT"
  | "GRID_TRACK_LIMIT" | "GRID_INVALID_AREA" | "GRID_CONFLICTING_PLACEMENT"
  | "GRID_INVALID_PLACEMENT" | "GRID_LINE_UNRESOLVED"
  | "GRID_UNSUPPORTED_ALIGNMENT" | "GRID_MEASURE_INVALID"
export type GridLayoutError = {
  readonly code: GridErrorCode; readonly path: string; readonly nodeId: number
}
```
`TGEProps` añade exactamente estas propiedades, además de `layout`:
```ts
layout?: "flex" | "grid"
gridTemplateColumns?: readonly GridTrack[]
gridTemplateRows?: readonly GridTrack[]
gridAutoColumns?: GridTrackSize
gridAutoRows?: GridTrackSize
gridAutoFlow?: GridAutoFlow
gridTemplateAreas?: readonly (readonly (string | null)[])[]
gridColumn?: GridPlacement
gridRow?: GridPlacement
gridArea?: GridAreaPlacement
alignContent?: GridContentAlignment
justifyItems?: GridItemAlignment
justifySelf?: GridItemAlignment
alignSelf?: GridItemAlignment
justifyContent?: "left" | "right" | "center" | "space-between" | "flex-start" | "flex-end"
  | "start" | "end" | "space-around" | "space-evenly" | "stretch"
alignItems?: "top" | "bottom" | "center" | "space-between" | "flex-start" | "flex-end"
  | "start" | "end" | "stretch"
```

La superficie elimina deliberadamente nuevas props ambiguas: `display`,
`layoutMode`, strings CSS, `grid`, `gridGap`, `rowGap`, `columnGap`, longhands
`gridRowStart`/`gridColumnEnd` y márgenes `auto` no se añaden. `gridRow` y
`gridColumn` son el único shorthand estructurado de placement; `gridArea` cubre
nombre u objeto de cuatro líneas.
`justifyContent` y `alignItems` siguen siendo props existentes y no se renombran.
Para que los módulos no inventen una seam distinta, estas firmas internas son
el **contrato mínimo** de implementación (los nombres son fijos y no son API
pública). G-011 materializa estos campos y puede añadir datos scratch necesarios
para el algoritmo sin cambiar estas entradas/salidas ni la API pública.

```ts
export type GridAxis = "columns" | "rows"
export type GridAvailableSpace =
  | { readonly kind: "definite"; readonly px: number }
  | { readonly kind: "indefinite"; readonly constraint: "min-content" | "max-content" }
export type GridIntrinsicSizes = {
  readonly minContent: number; readonly maxContent: number
  readonly minimum: number; readonly preferred: number
} // todos los valores en px
export type GridTrackState = {
  min: GridTrackSize; max: GridTrackSize
  base: number; growthLimit: number; offset: number
}
export type GridSnapshot = { readonly nodeId: number; readonly revision: number; readonly style: GridStyle }
export type ExpandedTracks = { readonly axis: GridAxis; readonly tracks: readonly GridTrackState[]; readonly explicitCount: number }
export type ResolvedLines = {
  readonly axis: GridAxis; readonly positions: readonly number[]
  readonly names: ReadonlyMap<string, readonly number[]>; readonly explicitCount: number
}
export type GridExpandedAxes = { readonly columns: ExpandedTracks; readonly rows: ExpandedTracks }
export type GridResolvedLineSet = { readonly columns: ResolvedLines; readonly rows: ResolvedLines }
export type GridItemInput = { readonly nodeId: number; readonly style: GridItemStyle }
export type PlacementResult = { readonly items: readonly GridResolvedPlacement[]; readonly rowCount: number; readonly columnCount: number }
export type GridIntrinsicContribution = {
  readonly nodeId: number; readonly axis: GridAxis
  readonly start: number; readonly end: number // zero-based, end-exclusive
  readonly minContent: number; readonly maxContent: number
  readonly minimum: number; readonly preferred: number
} // px; contribution is for this item span on this axis
export type AxisSizingInput = {
  readonly axis: GridAxis; readonly available: GridAvailableSpace
  readonly tracks: ExpandedTracks; readonly gap: number
  readonly items: PlacementResult
  readonly contributions: readonly GridIntrinsicContribution[]
}
export type AxisSizingResult = { readonly axis: GridAxis; readonly tracks: readonly GridTrackState[]; readonly lines: readonly number[] }
export type AlignmentInput = {
  readonly rows: AxisSizingResult; readonly columns: AxisSizingResult
  readonly style: GridStyle; readonly items: readonly GridResolvedPlacement[]
  readonly itemSizes: readonly GridResolvedRect[]
}
export type AlignedGrid = {
  readonly rows: AxisSizingResult; readonly columns: AxisSizingResult
  readonly items: readonly GridResolvedPlacement[]
  readonly boxes: readonly GridResolvedRect[]
}
export type GridResolvedRect = { readonly nodeId: number; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export type GridCalculateStats = {
  readonly intrinsicPasses: 1 | 2; readonly cacheHit: boolean; readonly noOp: boolean
}
export type GridCalculateResult = {
  readonly error: GridLayoutError | null; readonly stats: GridCalculateStats
}
export type GridResolvedPlacement = {
  readonly nodeId: number
  readonly rowStart: number; readonly rowEnd: number
  readonly columnStart: number; readonly columnEnd: number
}
export type GridStyle = {
  readonly columns: readonly GridTrack[]; readonly rows: readonly GridTrack[]
  readonly autoColumns: GridTrackSize; readonly autoRows: GridTrackSize
  readonly autoFlow: GridAutoFlow; readonly areas: readonly (readonly (string | null)[])[]
  readonly gap: number; readonly justifyContent: GridContentAlignment
  readonly alignContent: GridContentAlignment; readonly justifyItems: GridItemAlignment
  readonly alignItems: GridItemAlignment
}
export type GridItemStyle = {
  readonly row?: GridPlacement; readonly column?: GridPlacement
  readonly area?: GridAreaPlacement; readonly justifySelf?: GridItemAlignment
  readonly alignSelf?: GridItemAlignment
}
export type GridIntrinsicMeasureFunc = (
  axis: GridAxis, availableInlineWidth: number | undefined,
) => GridIntrinsicSizes // px; undefined = inline axis indefinido

export function normalize(style: GridStyle, nodeId: number, revision: number): GridSnapshot | GridLayoutError
export function expand(axis: GridAxis, tracks: readonly GridTrack[], available: GridAvailableSpace): ExpandedTracks | GridLayoutError
export function resolveLines(snapshot: GridSnapshot, expanded: GridExpandedAxes): GridResolvedLineSet | GridLayoutError
export function place(snapshot: GridSnapshot, lines: GridResolvedLineSet, items: readonly GridItemInput[]): PlacementResult | GridLayoutError
export function sizeAxis(axis: GridAxis, input: AxisSizingInput): AxisSizingResult | GridLayoutError
export function align(input: AlignmentInput): AlignedGrid | GridLayoutError
export function writeback(input: AlignedGrid): readonly GridResolvedRect[]

Node.setLayoutMode(mode: "flex" | "grid"): void
Node.setGridStyle(style: GridStyle): void
Node.setGridItem(item: GridItemStyle): void
Node.setIntrinsicMeasureFunc(fn: GridIntrinsicMeasureFunc | null): void
Node.calculateLayout(width?: number, height?: number, direction?: number): GridCalculateResult // DIRECTION_LTR en el perfil Grid
```

`GridResolvedPlacement` usa índices de línea zero-based y `end` exclusivo; la
API pública sigue expresando líneas como en §2.3. `GridTrackState` es mutable
solo dentro del solver; los arrays que cruzan módulos son readonly.
`GridIntrinsicContribution` acompaña cada item y span a `sizeAxis`; no se
reconstruye desde placement después de medir. El callback siempre recibe px: para
`axis:"rows"`, su segundo argumento es el ancho inline de columnas ya resueltas;
solo es `undefined` si ese ancho inline es indefinido. `intrinsicPasses`,
`cacheHit` y `noOp` se leen en `GridCalculateResult.stats` y se reflejan en
`Node.stats` para los contadores del engine. Los setters son métodos del Node
interno vendorizado: Flexily no importa ningún módulo de engine, y `flex-sync.ts`
es su único traductor Vexart. `AlignmentInput.itemSizes` contiene boxes pre-alineados
con `nodeId`; `align` solo ajusta esos boxes y `writeback` se limita a copiar
`AlignedGrid.boxes` en orden, sin inventar `nodeId`, rects ni líneas.

### 2.4 Defaults, precedencia y transiciones
1. Sin `layout` o con `layout="flex"`, el comportamiento es el actual:
   `direction`/`flexDirection` default `column`; `alignX` gana a
   `justifyContent`, `alignY` gana a `alignItems`; `syncAlign` conserva el mapeo
   físico de `flex-sync.ts:305-315`; `flexGrow`, `flexShrink`, `width="grow"`
   y `height="grow"` conservan sus semánticas Flex.
2. Con `layout="grid"`, el eje inline es horizontal LTR y el block es vertical,
   sin depender de `direction`/`flexDirection`. `justifyContent` distribuye el
   grid en horizontal y `alignContent` en vertical; ambos default `stretch` en
   este perfil, como la distribución `normal` de un grid CSS cuando hay espacio
   definido. `justifyItems` y `alignItems` default `stretch`; `justifySelf` y
   `alignSelf` heredan esos valores. En Grid los aliases legacy se traducen así:
   `justifyContent:left`/`flex-start`→`start`, `right`/`flex-end`→`end`;
   `alignItems:top`/`flex-start`→`start` y `bottom`/`flex-end`→`end`.
   `alignItems:space-between`/`space-around`/`space-evenly` produce
   `GRID_UNSUPPORTED_ALIGNMENT`; `alignX`/`alignY` siguen siendo Flex-only y
   se diagnostican.
   `flexGrow`/`flexShrink` del hijo siguen aplicando si su padre es Flex, aunque
   el hijo tenga `layout="grid"`; si el padre es Grid se diagnostican como
   Flex-only. `direction` del propio Grid se ignora, pero la dirección del
   padre Flex sigue determinando cómo crece ese ítem.
3. `gridTemplateColumns` y `gridTemplateRows` default listas vacías; los
   ítems crean tracks implícitos con `gridAutoColumns`/`gridAutoRows` (ambos `GridTrackSize`),
   default `"auto"`. El límite duro es 1024 tracks por eje; excederlo es
   `GRID_TRACK_LIMIT`, no truncamiento. `gridAutoColumns`/`gridAutoRows` solo
   aceptan `GridTrackSize`, no repeat ni line names. Auto-repeat acepta un solo
   track de tamaño fijo o `minmax(fixed, 1fr)` por eje, como máximo una
   expresión auto-repeat por eje; un eje indefinido usa una repetición. En
   `minmax(min,max)`, si ambos extremos numéricos y `max < min`, el max efectivo
   es `min`, siguiendo §7.2.1; no se produce un track negativo.
4. `gridAutoFlow` default `"row"`; `dense` solo cambia la búsqueda del cursor,
   nunca el orden del árbol ni foco/lectura. El orden de fuente rompe empates.
   Las tracks vacías de `auto-fit` colapsan después de placement y antes de
   sizing `fr` y gutters; `auto-fill` las conserva.
5. `gridTemplateAreas` debe ser matriz rectangular. `null` es celda vacía;
   cada nombre no nulo debe formar un rectángulo. El nombre de `gridArea` gana
   semánticamente sobre líneas, pero combinar `gridArea` con `gridRow` o
   `gridColumn` explícitos es `GRID_CONFLICTING_PLACEMENT`; no se ignora una
   prop para ocultar un error. Overlaps entre dos placements explícitos están
   permitidos por el perfil; auto-placement evita celdas ocupadas.
6. Placement explícito resuelve primero ambos ejes, después un eje y al final
   auto-placement. Una línea numérica es 1-based; negativa cuenta desde el final de la grid
   explícita (después de repeat/áreas y antes de crear tracks implícitos). Un
   nombre intenta primero el área implícita `<name>-start`/`<name>-end`; si no
   existe, se asignan líneas implícitas con ese nombre en el lado de búsqueda,
   como §8.3. `span` es entero positivo y puede restringirse a una línea
   nombrada. occurrence default 1 y occurrence 0 es inválida; solo falla si no
   puede resolverse dentro de 1024 líneas.
7. `width`/`height` numéricos son px y dominan el tamaño del ítem dentro de su
   área, sujetos a min/max. Porcentaje usa el área disponible cuando es
   definida. `fit` pide tamaño intrínseco (`max-content` del perfil terminal);
   `grow` y el valor omitido estiran hasta el área, salvo `justifySelf`/
   `alignSelf` y min/max. `width`/`height` no cambian el tamaño base de tracks
   ya resueltos salvo por su contribución intrínseca especificada.
8. Reemplazar una lista (`gridTemplateColumns`, áreas, etc.) es la única forma
   de invalidarla: no se detecta mutación in-place. Los setters marcan una
   revisión dirty; normalización/validación ve el snapshot completo en el
   siguiente `calculateLayout`. Un no-op por misma referencia/valor no vuelve a
   parsear ni incrementa la revisión.
9. `GridLayoutError` lleva `code`, `path` y `nodeId`. `Node.calculateLayout` devuelve
   `{ error }` (no lanza); en error no muta sus rects. `layout-adapter` conserva
   el último mapa y el loop traduce/diagnostica el error sin writeback ni frame
   parcial. No se convierten errores en `Infinity`, `NaN`, width cero ni fallback
   silencioso a Flex.
### 2.5 Texto, nesting y redondeo
El callback actual de `flex-sync.ts:226-246` conserva la regla: ancho no
restringido (`MEASURE_MODE_UNDEFINED`, `Infinity` o `<=0`) usa la medición no
restringida; no se usa `width=0` como hack. `normal` puede romper palabras por
carácter cuando hay overflow, `keep-all` conserva la palabra, y el `lineHeight`
actual se mantiene. Para las contribuciones del perfil terminal, `minContent` de
`normal` es el máximo ancho de carácter/segmento que resulta de la segmentación
actual; `keep-all` es el máximo ancho del token indivisible; `maxContent` es el
ancho de la línea máxima sin wrapping después de `normalizeTextForLayout`. Para
filas, la altura se mide a `availableInlineWidth` con el `lineHeight` real; no se
deriva una fuente ficticia. `minimum`/`preferred` son contribuciones para
min-width/min-height y width/height del engine, no sinónimos de los anchos raw
del texto.
Grid añade un callback intrínseco separado en Flexily y otro adaptador en Vexart
que recibe el ancho real de la celda. Primero se resuelven columnas, luego se
mide el texto con ese ancho, después filas; cuando el ancho de columna cambia la
contribución se recalculan columnas y filas una vez según la dependencia
especificada en §11.1/§11.5 de la CR. No se rompe wrapping, `text` puede ser
hijo directo o estar anidado bajo Flex/Grid, y la medida sigue cacheada por nodo
cuando contenido, fuente y restricción no cambian.
El solver trabaja en `f64`/números JS sin redondear; sus fixtures aceptan
`1e-6`. La salida normal de Flexily conserva su política: `layout-zero.ts`
redondea bordes absolutos con `Math.round` y el camino de texto puede hacer
`floor` en posiciones. Se comparan por separado solver, salida Flexily y
`Node.layout`; no se confunde subpixel CSS con redondeo final.
---
## 3. Algoritmo congelado para implementación
Cada etapa es observable en fixtures y no puede reemplazarse por la lista
simplista «fijo -> auto -> fr».
1. **Available space:** content box = tamaño del container menos padding y
   bordes; cada eje puede ser definido o indefinido. El gap se resta solo del
   presupuesto de tracks, nunca del content box. Porcentajes en eje indefinido
   son contribuciones intrínsecas hasta que exista una restricción; nunca se
   convierten a cero.
2. **Normalize:** validar el snapshot, expandir `repeat` fijo y calcular
   `auto-fill`/`auto-fit` solo con una base fija válida; available indefinido
   produce una repetición. Detectar líneas, nombres y áreas y crear el límite
   de 1024 tracks por eje.
3. **Place:** construir la explicit grid, resolver colocación de ambos ejes,
   reservar celdas ocupadas y ejecutar el algoritmo de auto-placement con cursor
   row/column. `dense` busca huecos anteriores; el modo normal no retrocede.
   Luego colapsar las tracks auto-fit vacías antes de sizing.
4. **Initialize track sizes:** para cada track guardar min sizing function, max
   sizing function, base size y growth limit; gutters cuentan como tamaños fijos.
   `minmax()` separa min/max, `auto`/`fit-content()` se trata como función
   intrínseca según los límites definidos arriba.
5. **Intrinsic contributions:** medir ítems span=1 por min-content y max-content;
   resolver en orden creciente de span los spans mayores, distribuir espacio
   adicional solo entre tracks afectadas y respetar growth limits. Tracks `fr`
   con min intrínseco participan donde corresponda; no se descartan por ser
   flexibles.
6. **Maximize:** en espacio definido, crecer tracks inflexibles/intrínsecos
   hasta los límites y el espacio disponible, congelando los que alcancen growth
   limit. El espacio libre se calcula restando bases y gutters, con piso cero.
7. **Expand `fr`:** calcular hypothetical fr por el conjunto de tracks y la
   restricción; congelar fr cuyo tamaño hipotético sea menor que base, repartir
   leftover según factores restantes y volver a respetar min/max. En eje
   indefinido usar la contribución max-content especificada, no una fracción
   arbitraria del viewport.
8. **Stretch auto:** si `alignContent`/`justifyContent` es `stretch` y queda
   espacio, estirar solo tracks `auto` elegibles. `space-*` altera gutters en la
   fase de alignment, no durante sizing.
9. **Item size/alignment:** formar el área con líneas y gutters ya alineados;
   resolver width/height, min/max, márgenes numéricos, `justifySelf` y
   `alignSelf`; stretch no supera límites ni inventa tamaño negativo.
10. **Intrinsic recalc:** medir de nuevo texto/flex-wrap dependiente del ancho de
    columna, resolver filas; si cambió una contribución min/max, repetir la
    resolución de columnas y filas una vez. Registrar el número de pasadas para
    diagnóstico y caché; no usar incremental-vs-fresh como oráculo de CSS.
11. **Writeback:** emitir rectángulos locales estándar para cada Node y poblar
    el `layoutMap` retenido. El adaptador y `layout.ts` usan esos rectángulos
    para commands, damage, transforms, scroll, foco y hit-test existentes.
12. **Rounding boundary:** aplicar únicamente al salir del solver la política
    Flexily actual. Las pruebas de solver comparan antes de rounding; las de
    `Node.layout` comparan la forma redondeada esperada.
Baseline alignment y auto margins están fuera del subset; la etapa 9 debe
rechazarlos con el error documentado. La medida de texto sigue siendo intrínseca
y no una llamada al mismo solver disfrazada de oráculo.
---
## 4. Fixtures y oráculo independiente
Cada feature tiene al menos un fixture numérico y un caso Vexart real. Los IDs
`F-*` son estables: G-034 los materializa en JSON y cada expected se escribe
antes de ejecutar el solver. Los valores de solver son px, pre-rounding, con
error máximo `1e-6`; la columna Node separa la política de redondeo de Flexily.

| Fixture / feature | Entrada completamente determinada | Expected obligatorio (solver pre-round) | Oráculo / tarea |
|---|---|---|---|
| F-01 px, `auto`, gap | content box 300; `[80px, auto, 100px]`; gap 10; ítem auto min/max-content 90; `justifyContent:start` | tracks `[80,90,100]`; líneas `[0,80,90,180,190,290]`; sobra final 10 | cálculo manual CR §11; G-018/G-019/G-034 |
| F-02 `fr` | ancho 300; `gap:10`; columnas `[1fr,2fr]` | free 290; tracks `[96.66666666666667,193.33333333333334]`; líneas `[0,96.66666666666667,106.66666666666667,300]` | fixture numérico independiente; G-022/G-034 |
| F-03 porcentaje y gap | outer 340, padding inline 20+20, content 300; `[50%,50%]`; gap 10 | tracks `[150,150]`; origen 20; líneas `[20,170,180,330]`; overflow de 10 explícito (el gap no se resta dos veces) | cálculo manual CR §11.2; G-023/G-034 |
| F-04 porcentaje indefinido | ancho `indefinite(max-content)`; una columna `50%`; contribución del único hijo `maxContent=120` | una repetición/track de 120 px, nunca 0, `Infinity` o `NaN` | fixture independiente de contribución; G-023/G-034 |
| F-05 `minmax` + fr | content 240; dos `minmax(100px,1fr)`; gap 10 | bases 100+100, free 30; tracks `[115,115]`; líneas `[0,115,125,240]` | cálculo manual CR §11.6; G-020/G-022/G-024 |
| F-06 `repeat` fijo | content 145; `repeat(3,40px)`; gap 5; `justifyContent:start` | tracks `[40,40,40]`; líneas `[0,40,45,85,90,130]`; sobra 15 | cálculo manual; G-017/G-034 |
| F-07 `auto-fill` vs `auto-fit` | content 300; gap 10; dos ítems; comparar `repeat(auto-fill,minmax(80px,1fr))` y `repeat(auto-fit,minmax(80px,1fr))` | fill: 3 tracks `[280/3,280/3,280/3]`; fit: `[145,145,0]`, tercer gutter colapsado antes de fr/alignment | Chromium verificado + CR §11.2; G-017/G-035 |
| F-08 líneas, negativo y span | tres columnas de 50, gap 10; `start:1,end:{span:2}` y otro `start:-2,end:-1` | primer placement `[0,2)` y área 110 px; segundo placement `[2,3)` y área 50 px; gap 10 fijo | cálculo de líneas CR §8.3; G-012/G-013 |
| F-09 áreas | matriz `header header header` / `nav null content`, dos filas y tres columnas | header `[row 0,1)×[col 0,3)`; nav `[1,2)×[0,1)`; content `[1,2)×[2,3)` | navegador independiente; G-012/G-013 |
| F-10 `dense` | 3 columnas; A explícito row0 col0 span2; B auto span2; C auto span1 | normal: A row `[0,1)` cols `[0,2)`, B row `[1,2)` cols `[0,2)`, C row `[1,2)` cols `[2,3)`; dense: C row `[0,1)` cols `[2,3)`; source order idéntico | pasos CR §8.5, no solver; G-014/G-015 |
| F-11 `fit-content` e intrínsecos | content 300; `[min-content,fit-content(100px),max-content]`; contribuciones por track `[min/max:40/40,60/120,60/60]`; gap 10 | tracks `[40,100,60]`; total con gutters 220; sobra 80 con start; min de track 2 no baja de 60 | cálculo CR §11.5 + medida independiente; G-019/G-024 |
| F-12 texto restringido | **Capa solver:** nodo `text` real en medidor monospace Flexily configurado con advance real 12, texto `aaaaaa`, columna 36 y line-height 12. **Capa native:** misma forma con fuente fijada y advance medido `u`, columna `3u` (no se presupone `u=12`) | **Solver:** `normal` líneas `[36,36]`, height 24; `keep-all` token indivisible 72, una línea height 12 y overflow permitido. **Native:** `normal` dos líneas de tres avances, `keep-all` una línea de seis avances; callback recibe width inline 3u | medidor Flexily real para números fijos y prueba native real separada para `u`; ambos tras `normalizeTextForLayout`, sin métrica fabricada ni browser CSS; G-010/G-026 |
| F-13 nesting | outer 300, dos columnas `1fr 1fr`, gap 10; hijo Grid→Flex en segunda celda | outer tracks `[145,145]`; hijo local x=155,width=145; Flex child conserva su dirección/crecimiento | Node real y layoutMap único; G-028/G-031/G-032 |
| F-14 alineación | content 300; `[50px,50px]`; gap 10; `justifyContent:center` | grid width 110; inicio 95; líneas `[95,145,155,205]`; base sizes no cambian | CR §10.5 + navegador; G-025/G-035 |
| F-15 error atómico / arrays | frame válido rect `[x:0,y:0,w:100,h:20]`; reemplazo de columns con `{percent:101}` | `GRID_INVALID_VALUE`, path exacto de la prop, rect previo sin cambios y sin frame parcial | test Node/reconciler real; G-007/G-008/G-031 |
| F-16 cache/no-op | mismo snapshot/revision dos veces; luego nueva referencia equivalente; luego cambio de ancho | segunda misma referencia: parse 0/cache hit; nueva referencia: una invalidación; ancho nuevo: medida nueva; geometría equivale solo como cache check | proceso independiente, nunca oracle CSS; G-005/G-039 |

El oráculo independiente se ejecuta contra fixtures JSON y una implementación
externa (números publicados por la CR o un navegador verificado). Nunca importa
`packages/internal-flexily/src/grid`, nunca llama al solver Vexart y nunca usa
la salida incremental como expected. Para F-12, la prueba real de texto aporta
las métricas del perfil terminal; no se sustituyen por una regla de wrapping del
navegador. Si el navegador o el fixture externo no está disponible, el check
queda **bloqueado** con evidencia; no se reporta `skip` como pass. Los expected
Node se comparan después de aplicar `Math.round`/`floor` de Flexily, por separado
de los expected solver de 1e-6.
---
## 5. Ejecución por tareas pequeñas
### Plantilla común para cada worker
Cada worker recibe el ID, ejecuta solo `allowed_paths`, añade el test del mismo
cambio y deja un handoff con diff y comandos. Los workers son las instancias
Luna configuradas por el entorno, sin `model`, `thinking` ni capacidad target
override. El Root revisa cada diff y cada check; ningún worker decide una API
alternativa.
```text
ID / propietario
allowed_paths exactos
Depende de
Objetivo operativo
Tests y aceptación
Exclusiones
Handoff
```
Desde la raíz, la comprobación estándar de toda tarea que tenga tests es:
`bun --conditions=browser test --preload ./solid-plugin.ts <paths .test.ts/.tsx de allowed_paths>`
y `bun run typecheck`; se sustituyen los corchetes por paths concretos, nunca
por un glob que incluya tareas de otro worker. G-001, G-002 y G-003 usan solo
las validaciones locales que enumeran, porque todavía no hay resolución root;
G-004 usa además su instalación exacta.
Un archivo de test cuenta como parte inseparable de la tarea aunque no aumente
el límite de 2-3 archivos productivos. Un archivo generado, vendorizado o
sourcemap puede exceder ese límite solo cuando se indica.
### Fase A — Infraestructura, fork local y baseline cerrado
#### G-001 — Crear workspace privado Flexily
- **Propietario:** Luna-infra-package.
- **allowed_paths:** `packages/internal-flexily/package.json`, `packages/internal-flexily/tsconfig.json`.
- **Depende de:** —.
- **Objetivo operativo:** crear el paquete privado llamado exactamente `flexily`, versión fuente 0.6.0, entrada ESM y configuración compatible con el root sin introducir otro nombre de import.
- **Tests y aceptación:** validar con un parser JSON que `package.json` y `tsconfig.json` tienen los campos requeridos y que sus paths declarados existen o son los destinos de G-002; no ejecutar `tsc` todavía porque aún no hay fuentes. G-001 no escribe `bun.lock`; la resolución con lock queda para G-004.
- **Exclusiones:** no copiar aún Grid, no tocar root `package.json`, no tocar `node_modules` ni publicar.
- **Handoff:** adjuntar diff, manifest del paquete y salida exacta de resolución.
#### G-002 — Clonar fuente pinned y MIT
- **Propietario:** Luna-infra-vendor.
- **allowed_paths:** `packages/internal-flexily/LICENSE`, `packages/internal-flexily/UPSTREAM.md`, `packages/internal-flexily/src/` (fuentes vendorizadas del commit fijado, incluidos `layout-zero.ts`, `layout-measure.ts`, `layout-flex-lines.ts`, `node-zero.ts`, `layout-helpers.ts`, `layout-traversal.ts`, `layout-stats.ts`, `types.ts`, `index.ts`; paths vendorizados son excepción).
- **Depende de:** G-001.
- **Objetivo operativo:** reproducir sin cambios semánticos el código del commit exacto `e9a752aacef9d84d20c383443b9c89f2ad2daf4a`, conservar la API de imports `flexily` y dejar un punto único donde añadir `src/grid/*.ts`.
- **Tests y aceptación:** comparar árbol y hash de fuentes con checkout pinned; importar `Node` y constantes desde `packages/internal-flexily/src/index.ts` en un proceso local, sin exigir aún el nombre `flexily`; todas las pruebas de esta tarea apuntan a esa entrada local y no a `node_modules`.
- **Exclusiones:** no implementar Grid, no editar `logger.ts` en esta tarea, no modificar Flexily base por conveniencia.
- **Handoff:** entregar manifest de archivos/fuente y diferencias semánticas cero respecto del commit.
#### G-003 — Hacer reproducible logger y build vendorizado
- **Propietario:** Luna-infra-build.
- **allowed_paths:** `packages/internal-flexily/src/logger.ts`, `packages/internal-flexily/package.json`.
- **Depende de:** G-002.
- **Objetivo operativo:** preservar los imports dinámicos `loggily`/`debug` de upstream y configurar exports/types/build para que la copia compile aun si el sourcemap no incluye todo el paquete.
- **Tests y aceptación:** build/typecheck local aislado del paquete desde `packages/internal-flexily/src/index.ts`; import ESM en un proceso limpio y chequeo de ausencia de resolución accidental a `node_modules/flexily`.
- **Exclusiones:** no sustituir logger por console global, no cambiar niveles de logging, no añadir dependencia pública nueva.
- **Handoff:** indicar cómo se resolvieron los imports dinámicos y adjuntar las dos salidas de build/typecheck.
#### G-004 — Enlazar dependencia y lock integridad
- **Propietario:** Luna-infra-lock.
- **allowed_paths:** `package.json`, `bun.lock`.
- **Depende de:** G-003.
- **Objetivo operativo:** cambiar solo la dependencia raíz `flexily` a `workspace:*`, preservar todos los demás paquetes y registrar en el handoff que el artefacto upstream es MIT 0.6.0 con integridad `sha512-V2z9Nx+a77dicQUM5ktU6A4wSoNUbbVRocOCjXgLHIkhl/pdmrtX8MWQTwBJ3mCuB4pkniitvKW5C4tBo94XIg==`.
- **Tests y aceptación:** `bun install --frozen-lockfile`; `bun pm ls flexily` muestra solo workspace; diff de lock limitado a la entrada esperada.
- **Exclusiones:** no actualizar versiones Vexart, no regenerar toda la lockfile por otra razón, no publicar ni editar `node_modules`.
- **Handoff:** adjuntar diff de dos archivos y comando de instalación reproducible.
#### G-005 — Capturar baseline real y contadores de caché
- **Propietario:** Luna-benchmark-baseline.
- **allowed_paths:** `scripts/grid/baseline.ts`, `scripts/grid/baseline.test.ts`.
- **Depende de:** G-004.
- **Objetivo operativo:** comparar en el mismo proceso y fixtures el tarball `flexily@0.6.0` pinned aislado (resolución antes del workspace) contra la workspace vendorizada (resolución después), y medir layout inicial, no-op, leaf dirty, resize y nesting con 100/400/1000 nodos; separar sync, cálculo, writeback y render y registrar contadores de cache/no-op.
- **Tests y aceptación:** cada variante ejecuta 5 runs seriales; cada run tiene 100 frames de calentamiento y 1000 frames medidos. Guardar `artifacts/perf/grid-baseline/<run-id>/tarball/report.json` y `artifacts/perf/grid-baseline/<run-id>/workspace/report.json` con OS, Bun, commit, CPU/GPU, terminal y versión. La comparación tarball/workspace usa las mismas seeds y proceso.
- **Exclusiones:** no crear solver Grid, no usar mocks, no presentar incremental vs fresh como oracle de conformidad.
- **Handoff:** entregar reporte y semilla reproducible; un resultado faltante es blocker, no `skip`.
### Fase B — Contrato, normalización y placement
#### G-006 — Publicar tipos Grid y límites estáticos
- **Propietario:** Luna-api-types.
- **allowed_paths:** `packages/engine/src/ffi/grid-types.ts`, `packages/engine/src/ffi/grid-types.test.ts`, `packages/engine/src/ffi/node-types.ts`, `packages/engine/src/public.ts`.
- **Depende de:** G-005.
- **Objetivo operativo:** materializar exactamente los tipos de §2.3, readonly arrays, unidades y props en `TGEProps`, con JSDoc de beta y sin export wildcard.
- **Tests y aceptación:** type assertions cubren cada unión y rechazan formas desconocidas; la mutación de arrays readonly no compila. `fr<=0`, porcentajes inválidos, placement ambiguo y matrices irregulares son validación runtime de G-007; `bun run typecheck`.
- **Exclusiones:** no cambiar todavía reconciler, Flex defaults, versión ni reportes generados.
- **Handoff:** enumerar símbolos públicos añadidos y compatibilidad Flex probada.
#### G-011 — Crear modelo interno de grid
- **Propietario:** Luna-grid-model.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-model.ts`, `packages/internal-flexily/src/grid/grid-model.test.ts`.
- **Depende de:** G-006.
- **Objetivo operativo:** materializar la seam compartida de §2.3: `GridAxis`, `GridAvailableSpace` discriminado (`definite`/`indefinite`), `GridTrackState` con `min`/`max`/`base`/`growthLimit`/`offset`, `GridResolvedPlacement` zero-based y end-exclusive, `GridIntrinsicSizes` en px, snapshots y revisiones; todos los arrays cruzan módulos como readonly.
- **Tests y aceptación:** construir modelos explícitos/implícitos vacíos y límites, comprobar índices y unidades; arrays scratch se reutilizan entre cálculos y no comparten estado entre Nodes; exportar los DTOs usados por normalize/placement/sizing sin importar engine.
- **Exclusiones:** no normalizar valores públicos, no resolver tamaños, no emitir rects ni modificar TGENode.
- **Handoff:** diagrama de invariantes, tipos exportados y counters de alloc del modelo.

#### G-007 — Normalizar snapshot y errores atómicos
- **Propietario:** Luna-grid-contract.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-normalize.ts`, `packages/internal-flexily/src/grid/grid-errors.ts`, `packages/internal-flexily/src/grid/grid-normalize.test.ts`.
- **Depende de:** G-006, G-011.
- **Objetivo operativo:** validar números finitos, porcentajes 0..100, fr, minmax, fit-content, repeat, áreas, nombres y límite 1024; devolver snapshot inmutable con revisión y `GridLayoutError(code,path,nodeId)`. Áreas amplían la explicit grid; nombres desconocidos crean líneas implícitas según §8.3; occurrence 0, nested repeat y over-limit fallan.
- **Tests y aceptación:** normalización pura no escribe rects; casos inválidos no producen Infinity/NaN y el mismo snapshot no reparsea. La atomicidad global de writeback queda en G-031.
- **Exclusiones:** no hacer placement ni sizing; no fallback a Flex.
- **Handoff:** tabla de códigos, paths y entradas que cada código rechaza.


#### G-010 — Separar callback intrínseco de texto
- **Propietario:** Luna-text-measure.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-measure.ts`, `packages/engine/src/ffi/grid-text-intrinsics.ts`, `packages/engine/src/ffi/grid-text-measure.test.ts`.
- **Depende de:** G-002, G-006, G-007, G-011.
- **Objetivo operativo:** añadir callback intrínseco Grid con `(axis,availableInlineWidth)` en Flexily y el adaptador Vexart en `grid-text-intrinsics.ts`; para filas pasar siempre el ancho inline de columnas resueltas (undefined solo si es indefinido); conservar en Flexily/Vexart la regla de `flex-sync.ts:226-246` para ancho undefined, Infinity o <=0; `normal`, `keep-all`, nesting y caché quedan intactos.
- **Tests y aceptación:** texto restringido envuelve igual que antes, `normal` calcula minContent como máximo carácter/segmento, `keep-all` como token indivisible y maxContent como línea sin wrapping; filas reciben el ancho inline real y height/lineHeight real. La capa solver fija advance 12 para F-12 y la prueba native usa su `u` medido con ancho 3u; texto indefinido sigue usando `measureForLayout`, cambio de ancho invalida filas, y no aparece width=0 artificial.
- **Exclusiones:** no editar `text-layout.ts` ni `flex-sync.ts`, no cambiar política de fuentes ni convertir el callback en oracle.
- **Handoff:** matriz de modos de medida y claves de cache verificadas.

#### G-012 — Resolver líneas nombradas y áreas
- **Propietario:** Luna-placement-names.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-lines.ts`, `packages/internal-flexily/src/grid/grid-areas.ts`, `packages/internal-flexily/src/grid/grid-placement-names.test.ts`.
- **Depende de:** G-011.
- **Objetivo operativo:** indexar líneas 1-based/negativas, occurrence de nombres, `before/after`, matriz rectangular de áreas y rectángulos de nombres según §7.2.2-§7.3.
- **Tests y aceptación:** `header/header`, `nav/content`, nombres repetidos, `null`, áreas que amplían explicit grid, áreas desconectadas y referencias negativas tienen resultados o errores esperados; no hay nombres silenciosos.
- **Exclusiones:** no auto-placement ni sizing.
- **Handoff:** tabla línea->índice y fixture de áreas entregado a G-035.
#### G-013 — Resolver placement explícito, spans y conflictos
- **Propietario:** Luna-placement-explicit.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-placement.ts`, `packages/internal-flexily/src/grid/grid-placement.test.ts`.
- **Depende de:** G-012.
- **Objetivo operativo:** colocar ambos ejes, un eje, `span`, negative lines y área object; aplicar precedencia y conflicto de `gridArea` ya congeladas; overlap explícito permitido y auto evita ocupados.
- **Tests y aceptación:** cubre 1/3, -1, `span 2`, nombre+span, occurrence 0, nombres implícitos, overlap explícito y placement parcial, comparando celdas ocupadas y no solo proceso.
- **Exclusiones:** no cursor automático, dense ni track sizing.
- **Handoff:** lista de reglas de desempate y casos fuente ordenados.
#### G-014 — Implementar auto-placement row/column
- **Propietario:** Luna-placement-auto.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-auto-placement.ts`, `packages/internal-flexily/src/grid/grid-auto-placement.test.ts`.
- **Depende de:** G-013.
- **Objetivo operativo:** implementar cursor row/column, ítems con ambos ejes auto, un eje definido y expansión implícita respetando source order.
- **Tests y aceptación:** fixtures con spans y huecos producen exactamente las celdas §8.5; auto-flow inválido falla antes de publicar geometría.
- **Exclusiones:** no dense, no sizing de track, no reordenar árbol/foco.
- **Handoff:** cursor inicial/final y occupancy dump por fixture.
#### G-015 — Añadir dense sin alterar accesibilidad
- **Propietario:** Luna-placement-dense.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-dense.ts`, `packages/internal-flexily/src/grid/grid-dense.test.ts`.
- **Depende de:** G-014.
- **Objetivo operativo:** `row-dense`/`column-dense` buscan huecos anteriores, sin mover el orden de lectura, foco o eventos.
- **Tests y aceptación:** mismo conjunto dense/no-dense difiere solo en celdas visuales esperadas; source order e índices DFS permanecen iguales.
- **Exclusiones:** no implementar `order`, DOM accessibility ni masonry.
- **Handoff:** occupancy snapshots y prueba de foco/source-order.
#### G-016 — Crear tracks implícitos
- **Propietario:** Luna-placement-implicit.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-implicit.ts`, `packages/internal-flexily/src/grid/grid-implicit.test.ts`.
- **Depende de:** G-014, G-011.
- **Objetivo operativo:** añadir filas/columnas implícitas con `gridAutoRows`/`gridAutoColumns` de tipo `GridTrackSize`, default auto, extender líneas y aplicar límite 1024.
- **Tests y aceptación:** placement fuera de explicit grid crea el número exacto de tracks; exceso devuelve `GRID_TRACK_LIMIT` sin truncar.
- **Exclusiones:** no fr/minmax/auto-repeat ni writeback.
- **Handoff:** tabla explicit/implicit y límite comprobado.
#### G-017 — Expandir repeat fijo y auto-fill/auto-fit
- **Propietario:** Luna-placement-repeat.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-repeat.ts`, `packages/internal-flexily/src/grid/grid-repeat.test.ts`.
- **Depende de:** G-016.
- **Objetivo operativo:** expandir repeat fijo y, como máximo, un auto-repeat por eje de pista fija o `minmax(fixed, 1fr)`; `auto-fit` colapsa vacías después de placement y antes de sizing fr/gutters, `auto-fill` las retiene.
- **Tests y aceptación:** con ancho definido 300 px, gap 10 px y `minmax(80px,1fr)`, `auto-fill` expande tres tracks y `auto-fit` marca vacía la tercera después de placement, colapsando track y gutter **antes** de pasar a sizing `fr`; available indefinido genera exactamente 1 repetición; count 0, repeat anidado y base no válida dan errores tipados. Los anchos finales `280/3` y `145` son verificados por G-028/G-034, no por esta tarea de expansión.
- **Exclusiones:** no usar browser como implementación, no sizing final de fr.
- **Handoff:** repeat expansion antes de rounding, con occupancy adjunta.
### Fase C — Sizing de tracks e ítems
#### G-018 — Inicializar funciones y bases de track
- **Propietario:** Luna-sizing-init.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-track-init.ts`, `packages/internal-flexily/src/grid/grid-track-init.test.ts`.
- **Depende de:** G-017.
- **Objetivo operativo:** convertir track size a min function, max function, base size y growth limit; tratar gutters como tracks fijos.
- **Tests y aceptación:** px, percent, auto, intrinsic, minmax, fr y fit-content exponen campos exactos y ningún tamaño negativo.
- **Exclusiones:** no medir hijos, maximizar ni repartir fr.
- **Handoff:** dump de estado inicial por fixture.
#### G-019 — Resolver contribuciones intrínsecas span=1
- **Propietario:** Luna-sizing-intrinsic.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-intrinsic.ts`, `packages/internal-flexily/src/grid/grid-intrinsic.test.ts`.
- **Depende de:** G-018, G-010.
- **Objetivo operativo:** obtener min-content/max-content y minimum contribution de ítems no spanning, usando medida real de texto y perfil terminal, no una regla browser de `wordBreak` distinta.
- **Tests y aceptación:** texto normal/keep-all, `fit`, `min-content`, `max-content` y límites actualizan base/growth limit esperados.
- **Exclusiones:** no spans mayores, no fr, no callback externo oracle.
- **Handoff:** contribuciones por nodo y clave de medida.
#### G-020 — Distribuir crecimiento de spans
- **Propietario:** Luna-sizing-spans.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-span-growth.ts`, `packages/internal-flexily/src/grid/grid-span-growth.test.ts`.
- **Depende de:** G-019.
- **Objetivo operativo:** recorrer spans en orden creciente, distribuir extra entre tracks elegibles, congelar growth limits y permitir fr con min intrínseco donde la CR lo exige.
- **Tests y aceptación:** span 2/3 con límites, combinación intrínseca+fr y acumulación por track pasan expected independientes; no se duplica espacio.
- **Exclusiones:** no resolver `fr` final ni alignment.
- **Handoff:** tabla de distribución por span y tracks congelados.
#### G-021 — Maximizar tracks en espacio definido
- **Propietario:** Luna-sizing-maximize.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-maximize.ts`, `packages/internal-flexily/src/grid/grid-maximize.test.ts`.
- **Depende de:** G-020.
- **Objetivo operativo:** calcular free space como available menos bases y gutters, crecer hasta growth limits y distinguir available definido de min/max-content indefinido.
- **Tests y aceptación:** free space negativo se fija a cero y límites se congelan; tracks+gaps conservan el content box solo cuando la alineación/función lo exige, y preservan overflow o espacio sobrante en el resto dentro de `1e-6`.
- **Exclusiones:** no stretch de auto ni fr final.
- **Handoff:** estados before/after maximize con unidades px.
#### G-022 — Expandir `fr` con hypothetical fr
- **Propietario:** Luna-sizing-flex.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-flex.ts`, `packages/internal-flexily/src/grid/grid-flex.test.ts`.
- **Depende de:** G-021.
- **Objetivo operativo:** implementar hypothetical fr, congelado de tracks bajo base, leftover y proporción de factores; eje indefinido usa max-content.
- **Tests y aceptación:** ancho 300/gap 10/`1fr 2fr` da `290/3` y `580/3` antes de rounding; factores 0, underflow y minmax fr tienen error/resultado determinista.
- **Exclusiones:** no usar `Math.round` en solver ni cambiar Flex.
- **Handoff:** reporte pre-round y comprobación de suma.
#### G-023 — Resolver porcentajes definidos e indefinidos
- **Propietario:** Luna-sizing-percent.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-available-space.ts`, `packages/internal-flexily/src/grid/grid-available-space.test.ts`.
- **Depende de:** G-018, G-021.
- **Objetivo operativo:** resolver `{ percent: n }` contra content box definido y dejar contribución intrínseca cuando el eje es indefinido; aplicar min/max del container sin Infinity.
- **Tests y aceptación:** 50% de 300, porcentaje con padding/gap, eje indefinido y resize del viewport coinciden con fixtures independientes.
- **Exclusiones:** no inventar viewport para eje indefinido ni modificar API width/height Vexart.
- **Handoff:** tabla de available space por eje y pass count.
#### G-024 — Aplicar minmax y fit-content
- **Propietario:** Luna-sizing-limits.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-limits.ts`, `packages/internal-flexily/src/grid/grid-limits.test.ts`.
- **Depende de:** G-020, G-023.
- **Objetivo operativo:** respetar min/max sizing y cap de fit-content; normalizar max menor que min según contrato sin tamaños negativos.
- **Tests y aceptación:** content bajo/sobre límite, fit px/percent, minmax intrinsic/fr y growth limit producen bases y caps esperados; max<min numérico usa min como max efectivo según §7.2.1.
- **Exclusiones:** no aceptar CSS tokens no tipados ni usar fallback browser.
- **Handoff:** tabla min/max/base final por track.
#### G-025 — Alinear tracks y estirar `auto`
- **Propietario:** Luna-sizing-alignment.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-alignment.ts`, `packages/internal-flexily/src/grid/grid-alignment.test.ts`.
- **Depende de:** G-021, G-024.
- **Objetivo operativo:** aplicar `justifyContent` horizontal, `alignContent` vertical, `space-*`, center/end/start y stretch después del sizing.
- **Tests y aceptación:** gaps efectivos, espacio extra y track spanning reflejan §10.5; `space-between` no altera base size y default stretch solo estira auto.
- **Exclusiones:** no baseline ni auto margins; esos códigos se prueban como exclusión, no como skip.
- **Handoff:** líneas finales y gutters alineados antes de item placement.
#### G-026 — Dimensionar y alinear cada ítem
- **Propietario:** Luna-sizing-items.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-item-size.ts`, `packages/internal-flexily/src/grid/grid-item-size.test.ts`.
- **Depende de:** G-025, G-019.
- **Objetivo operativo:** resolver area, width/height px/percent/fit/grow, min/max, margins numéricos, `justifySelf`/`alignSelf`/defaults stretch y produce rect local no negativo.
- **Tests y aceptación:** box/text/img/canvas, padding/border, min/max, fit/grow y cada alignment tienen rects numéricos esperados.
- **Exclusiones:** no writeback TGENode, no transforms, no auto margins/baseline.
- **Handoff:** item-area dump y tabla de rects pre-round.
#### G-027 — Recalcular columnas/filas por intrinsic dependency
- **Propietario:** Luna-sizing-recalc.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-intrinsic-cycle.ts`, `packages/internal-flexily/src/grid/grid-intrinsic-cycle.test.ts`.
- **Depende de:** G-010, G-019, G-023, G-026.
- **Objetivo operativo:** medir con columna resuelta, recalcular filas, detectar cambio de min-content y ejecutar exactamente la segunda pasada permitida por §3; cachear contribuciones por restricción y publicar la segunda salida válida sin inventar un criterio de convergencia o fallback.
- **Tests y aceptación:** texto wrapping, Flex column-wrap anidado y grid nesting cambian altura correctamente; `intrinsicPasses` es 1 o 2, el presupuesto máximo es 2 y nunca hay geometría parcial.
- **Exclusiones:** no introducir más iteraciones abiertas, aspect-ratio, writing modes ni usar incremental-vs-fresh como oracle.
- **Handoff:** log de restricciones y dos pasadas con seeds reproducibles.
### Fase D — Composición e integración Vexart
#### G-028 — Componer solver Grid en el Node Flexily único
- **Propietario:** Luna-flexily-composition.
- **allowed_paths:** `packages/internal-flexily/src/grid/grid-layout.ts`, `packages/internal-flexily/src/node-zero.ts`, `packages/internal-flexily/src/layout-zero.ts`, `packages/internal-flexily/src/layout-measure.ts`, `packages/internal-flexily/src/index.ts`, `packages/internal-flexily/src/grid/grid-layout.test.ts` (los paths vendorizados son una excepción).
- **Depende de:** G-011, G-012, G-013, G-014, G-015, G-016, G-017, G-018, G-019, G-020, G-021, G-022, G-023, G-024, G-025, G-026, G-027.
- **Objetivo operativo:** orquestar `normalize`/`expand`/`resolveLines`/`place`/`sizeAxis`/`align`/`writeback` en el dispatcher real del mismo Node/API Flexily, preservando `calculateLayout`, `getLayout` y caché existente.
- **Tests y aceptación:** un Node real configurado Flex sigue igual; un Node Grid produce rects locales; Grid hijo de Flex y Flex hijo de Grid comparten una sola instancia/caché sin objetos por frame evitables; setters y callback de medida se prueban en el Node real.
- **Exclusiones:** no tocar engine, layout-adapter, Rust ni crear un segundo árbol retained.
- **Handoff:** diagrama de llamadas y counters Flex/Grid/no-op.
#### G-008 — Integrar invalidación por reemplazo y batch Solid
- **Propietario:** Luna-reactivity.
- **allowed_paths:** `packages/engine/src/reconciler/reconciler.ts`, `packages/engine/src/reconciler/grid-props.test.ts`.
- **Depende de:** G-007, G-029.
- **Objetivo operativo:** incluir props Grid en `isLayoutProp`/flags, marcar revisión dirty solo al reemplazar valor/lista, y validar snapshot completo en `calculateLayout`, no en cada setter intermedio; no duplicar el translator que pertenece a G-029.
- **Tests y aceptación:** probar el reconciler real aplicando áreas antes que tracks y dimensiones en setters sucesivos hasta un snapshot válido; un array mutado in-place no se promete detectable; array nuevo sí invalida una vez; no-op no parsea.
- **Exclusiones:** no cambiar merge visual, colores, interacción ni aliases Flex no relacionados.
- **Handoff:** secuencia de setters reproducible y contadores de revisiones.
#### G-009 — Preservar lifecycle, reparent y resize
- **Propietario:** Luna-node-layout-integration.
- **allowed_paths:** `packages/engine/src/ffi/node.ts`, `packages/engine/src/loop/loop.ts`, `packages/engine/src/ffi/node-grid-lifecycle.test.ts`.
- **Depende de:** G-008, G-028.
- **Objetivo operativo:** conservar insert/remove/reparent, índices hermanos, creación/destrucción de Node retenido y `onResize` con dirty del grid; Grid no deja nodos huérfanos ni stale parent.
- **Tests y aceptación:** reparenta Grid bajo Flex y viceversa, elimina subtree, redimensiona viewport y verifica un único cálculo completo con rects locales.
- **Exclusiones:** no tocar Rust, compositor, hit-test ni algoritmo de tracks.
- **Handoff:** diff limitado a lifecycle y log de resize/reparent.

#### G-029 — Traducir props y distinguir semántica Flex/Grid
- **Propietario:** Luna-flex-sync-grid.
- **allowed_paths:** `packages/engine/src/ffi/flex-sync.ts`, `packages/engine/src/ffi/flex-sync-grid.test.ts`.
- **Depende de:** G-006, G-010, G-028.
- **Objetivo operativo:** ampliar `LAYOUT_PROPS`, traducir snapshot Grid una vez por revisión, conservar aliases físicos Flex y mapear alignment Grid por semántica; cambios de hijo/medida/viewport marcan dirty.
- **Tests y aceptación:** toggle Flex->Grid->Flex conserva defaults, no hay solver paralelo, props Flex-only en Grid diagnostican, arrays reemplazados sincronizan exactamente una vez.
- **Exclusiones:** no cambiar public exports ni writeback.
- **Handoff:** tabla prop->setter/revisión y regresión de `syncAlign`.
#### G-030 — Leer Grid desde layout-adapter
- **Propietario:** Luna-layout-adapter.
- **allowed_paths:** `packages/engine/src/loop/layout-adapter.ts`, `packages/engine/src/loop/layout-adapter-grid.test.ts`.
- **Depende de:** G-029.
- **Objetivo operativo:** usar el mismo begin/end layout, roots, arrays paralelos, calculate y `PositionedCommand`; no redondear ni duplicar mapa.
- **Tests y aceptación:** Grid emite commands y `getLastLayoutMap` con rects locales; Flex baseline byte/rect equivalente; render graph consume solo el mapa estándar.
- **Exclusiones:** no cambiar algoritmo Grid ni transportes Kitty/SHM.
- **Handoff:** comparación de mapas y alloc profile.
#### G-031 — Integrar node/layout con propietario único
- **Propietario:** Luna-node-layout-integration.
- **allowed_paths:** `packages/engine/src/ffi/node.ts`, `packages/engine/src/loop/layout.ts`, `packages/engine/src/ffi/node-layout-grid.test.ts`.
- **Depende de:** G-030, G-009.
- **Objetivo operativo:** conectar creación/reparent y writeback al rect local estándar; conservar `Node.layout`, damage, transforms y caché anterior; Grid inválido conserva geometría previa.
- **Tests y aceptación:** cada box/text rect se escribe; damage solo cambia por transición real; transforms e hit-test ven el mismo layoutMap; error inicial no publica frame parcial.
- **Exclusiones:** ningún otro worker edita estos dos archivos en la misma ola; no remover props para simular rollback.
- **Handoff:** diff completo revisado por Root y trazas before/after.
#### G-032 — Alimentar walk-tree y resize sin doble layout
- **Propietario:** Luna-walk-resize.
- **allowed_paths:** `packages/engine/src/loop/walk-tree.ts`, `packages/engine/src/loop/loop.ts`, `packages/engine/src/loop/walk-grid.test.ts`.
- **Depende de:** G-031.
- **Objetivo operativo:** mantener una sola pasada de árbol, placement de text/ flex/grid anidados y resize del root; no pre-medición que rompa callback ni reconstrucción del árbol por frame.
- **Tests y aceptación:** escenas reales Flex/Grid/nesting, cambio de viewport, wrapping y rects locales; contadores prueban una sola calculate por frame.
- **Exclusiones:** no alterar paint, layer assignment, scroll policy ni Rust.
- **Handoff:** trace de walk/calculate/writeback con conteos.
#### G-033 — Conservar floating, scroll, focus e hit-test
- **Propietario:** Luna-interaction-regression.
- **allowed_paths:** `packages/engine/src/loop/layout-adapter.ts`, `packages/engine/src/reconciler/hit-test.ts`, `packages/engine/src/loop/grid-interaction.test.ts`.
- **Depende de:** G-030, G-031, G-032.
- **Objetivo operativo:** verificar que floating queda fuera del flujo como hoy, scroll offsets/clips, focus, hover, click, transforms y hit-test consumen rects Grid sin cambiar stacking ni source order.
- **Tests y aceptación:** fixture de grid con scroll/floating/focus recibe los mismos eventos y damage; floating no ocupa una celda; rects comparados antes de pixels.
- **Exclusiones:** no implementar CSS absolute placement at-risk, no tocar Rust.
- **Handoff:** matriz de interacción y cualquier discrepancia aislada como blocker, no parche lateral.
### Fase E — Tests, visual, rendimiento y documentación
#### G-034 — Registrar matriz feature->fixture->tarea
- **Propietario:** Luna-fixture-catalog.
- **allowed_paths:** `scripts/grid/fixtures/feature-matrix.json`, `scripts/grid/fixtures/grid-contract-fixtures.json`, `scripts/grid/fixtures/grid-contract.test.ts`.
- **Depende de:** G-008, G-009, G-010, G-012, G-013, G-014, G-015, G-016, G-017, G-018, G-019, G-020, G-021, G-022, G-023, G-024, G-025, G-026, G-027, G-028, G-029, G-030, G-031, G-032, G-033.
- **Objetivo operativo:** convertir la tabla de §4 en fixtures ejecutables con expected solver, expected Flexily rounding y expected Node rect separados.
- **Tests y aceptación:** cada fila tiene ID, tarea, referencia CR/oracle, tolerancia y estado; todos los features originales aparecen al menos una vez.
- **Exclusiones:** no usar salida actual del solver para generar expected, no actualizar goldens visuales.
- **Handoff:** catálogo completo y lista de huecos (hueco bloquea gate).
#### G-035 — Ejecutar oráculo externo
- **Propietario:** Luna-independent-oracle.
- **allowed_paths:** `scripts/grid/oracle/grid-oracle.ts`, `scripts/grid/oracle/grid-oracle.test.ts`.
- **Depende de:** G-034.
- **Objetivo operativo:** comparar fixtures contra números de spec y navegador externo verificado; registrar browser/version/OS y no importar módulos Grid de Vexart.
- **Tests y aceptación:** `1fr 2fr`, auto-fill/fit, placement/areas, spans y alignment tienen expected independiente; browser ausente falla con blocker, nunca skip-pass.
- **Exclusiones:** no llamar `calculateLayout`, no hacer snapshot incremental el oracle, no aceptar golden como expected numérico.
- **Handoff:** `artifacts/grid/oracle/<run-id>/report.json` con fuente y versión.
#### G-036 — Añadir escena visual Grid sin actualizar golden
- **Propietario:** Luna-visual-scene.
- **allowed_paths:** `scripts/visual-test/scenes/grid-dashboard.tsx`, `scripts/visual-test/scene-layout.test.tsx`.
- **Depende de:** G-034, G-035.
- **Objetivo operativo:** escena real dashboard/formulario con cards, áreas, spans, auto-fit, texto, nesting, padding/border y estados interactivos.
- **Tests y aceptación:** escena exporta width/height/Scene reales y sus rects pasan el test de escena; comando registrado exactamente como `bun --conditions=browser run scripts/visual-test/runner.ts --scene=grid-dashboard`.
- **Exclusiones:** `--update` requiere permiso explícito posterior; esta tarea no escribe `scripts/visual-test/references/`.
- **Handoff:** lista de IDs de escena y captura/rect dump candidato, no golden.
#### G-037 — Validar Kitty directo y tmux+SHM físicamente
- **Propietario:** Luna-terminal-parity.
- **allowed_paths:** `scripts/visual-test/tmux-grid.test.ts`, `scripts/visual-test/tmux-parity.ts`.
- **Depende de:** G-036.
- **Objetivo operativo:** ejecutar por separado Kitty directo y tmux SHM sobre la escena exacta `scenes/grid-dashboard`, usando siempre directorio nuevo con `--out=artifacts/grid-parity/<run-id>`; comparar rects, bytes, SHM y passthrough, no solo exit code.
- **Tests y aceptación:** registrar un comando por escena: `bun --conditions=browser run scripts/visual-test/tmux-parity.ts --scene=scenes/grid-dashboard --out=artifacts/grid-parity/<run-id>`. Directo y tmux pasan sin falsos `skip`; physical UI != offscreen runner.
- **Exclusiones:** no generar golden, no reutilizar out anterior, no fingir Kitty/tmux físico desde un buffer offscreen.
- **Handoff:** reportes direct/tmux, terminal/tmux/SHM versions y blocker si falta hardware/terminal real.
#### G-038 — API reports, tipos y barriles explícitos
- **Propietario:** Luna-api-release.
- **allowed_paths:** `scripts/gen-types.ts`, `scripts/gen-jsx-runtime.ts`, `packages/app/src/barrel.ts` (solo si falta un export Grid ya decidido), más outputs generados `types/`, `packages/engine/etc/engine.api.md`, `packages/headless/etc/headless.api.md`, `packages/styled/etc/styled.api.md`, `packages/app/etc/app.api.md`.
- **Depende de:** G-029, G-031, G-036.
- **Objetivo operativo:** editar `scripts/gen-types.ts` y su plantilla JSX para actualizar el generador real de `types/engine.d.ts`, `types/vexart.d.ts` y JSX, y reconciliar los exports explícitos de engine/app sin `export *`; el consumidor real de ambos barriles queda en G-039.
- **Tests y aceptación:** `bun run api:update`, diff de reports (`engine`, `headless`, `styled`, `app`; el config barrel tiene `apiReport.enabled=false`) revisado, `bun run gen:types` y `bun run gen:jsx-runtime` en modo auditor; no asumir que `--update` de gen-jsx hace nada porque ese script audita props y el comentario hand-maintained; `bun run build:dist` y `bun test scripts/release-verification.test.mjs` pasan. Las exportaciones se comprueban contra el barrel explícito y los `.d.ts` generados; el smoke solo cubre metadatos/artifacts, no sustituye al consumidor real de G-039.
- **Exclusiones:** no subir versión, no publicar ni introducir `export *`; no ocultar flexily leak con cambios no documentados; un cambio en `packages/app/src/barrel.ts` solo se permite dentro de esta tarea si es necesario para el símbolo Grid decidido en §2.3 y se prueba en el barrel.
- **Handoff:** reports, generadores, barrel si cambió, y lista exacta de exports.
#### G-039 — Ejecutar gates de rendimiento, caché y consumidor real
- **Propietario:** Luna-perf-gate.
- **allowed_paths:** `scripts/grid/perf.ts`, `scripts/grid/perf.test.ts`, `scripts/consumer/dual-barrel.test.ts`.
- **Depende de:** G-005, G-028, G-030, G-034, G-038.
- **Objetivo operativo:** medir serialmente Flex comparable y Grid 400 con exactamente 5 runs, cada uno con 100 frames de calentamiento y 1000 medidos, separando sync, calculate, writeback y render; además ejecutar un consumidor real que importe los dos barriles y comparta un reconciler Solid universal.
- **Tests y aceptación:** p95 Flex <= 1.05x baseline; Grid400 <=2x Flex comparable; `bun test scripts/consumer/dual-barrel.test.ts` pasa contra build local; reportar OS, Bun, commit, GPU/terminal, `v1.x @beta` y `artifacts/perf/grid/<run-id>/report.json`. Incremental-vs-fresh solo verifica cache/dirty, nunca conformidad CSS.
- **Exclusiones:** no mezclar latencia Kitty/tmux con solver, no benchmark paralelo, no cambiar umbrales por una ejecución mala; `scripts/release-verification.test.mjs` sigue siendo solo smoke de metadatos/artifacts, no prueba este consumidor.
- **Handoff:** report, seeds, cinco runs, resultado del consumidor y decisión pass/blocker para Root.
#### G-040 — Actualizar documentación y cerrar manifest
- **Propietario:** Luna-docs-closeout.
- **allowed_paths:** `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/agent-reference.md`, `CHANGELOG.md`.
- **Depende de:** G-034, G-035, G-037, G-038, G-039.
- **Objetivo operativo:** documentar `layout="grid"`, tipos, límites terminales, placement/sizing, texto, nesting, errores, exclusiones y gates sin prometer CSS entero; reconciliar explícitamente que el PRD anterior difería de Grid v1.x y añadir en `CHANGELOG.md` una entrada Added/Unreleased para el perfil beta, sin bump.
- **Tests y aceptación:** links internos y W3C resuelven, ejemplos coinciden con API, no quedan frases de “fase 0”, spike, decisión pendiente o publish; `git diff --check` y revisión de contradicciones pasan.
- **Exclusiones:** no editar esta planificación durante ejecución, no cambiar versión, no publicar ni modificar código para hacer encajar la prosa; la entrada de changelog es solo Added/Unreleased y no es una release.
- **Handoff:** diff documental, lista de links comprobados y petición para que Root escriba `artifacts/grid/execution/<run-id>/manifest.json` con una entrada individual G-001, G-002, …, G-040 y estado PASS/BLOCKED.
## 6. DAG, oleadas y reglas de coordinación

La siguiente lista es la representación calculable del DAG. Cada dependencia es
un ID individual; no se interpretan rangos, orden textual ni “todas las tareas
anteriores”. Una tarea solo comienza cuando todos sus IDs están en `PASS`.

```text
G-001: []
G-002: [G-001]
G-003: [G-002]
G-004: [G-003]
G-005: [G-004]
G-006: [G-005]
G-007: [G-006, G-011]
G-008: [G-007, G-029]
G-009: [G-008, G-028]
G-010: [G-002, G-006, G-007, G-011]
G-011: [G-006]
G-012: [G-011]
G-013: [G-012]
G-014: [G-013]
G-015: [G-014]
G-016: [G-014, G-011]
G-017: [G-016]
G-018: [G-017]
G-019: [G-018, G-010]
G-020: [G-019]
G-021: [G-020]
G-022: [G-021]
G-023: [G-018, G-021]
G-024: [G-020, G-023]
G-025: [G-021, G-024]
G-026: [G-025, G-019]
G-027: [G-010, G-019, G-023, G-026]
G-028: [G-011, G-012, G-013, G-014, G-015, G-016, G-017, G-018, G-019, G-020, G-021, G-022, G-023, G-024, G-025, G-026, G-027]
G-029: [G-006, G-010, G-028]
G-030: [G-029]
G-031: [G-030, G-009]
G-032: [G-031]
G-033: [G-030, G-031, G-032]
G-034: [G-008, G-009, G-010, G-012, G-013, G-014, G-015, G-016, G-017, G-018, G-019, G-020, G-021, G-022, G-023, G-024, G-025, G-026, G-027, G-028, G-029, G-030, G-031, G-032, G-033]
G-035: [G-034]
G-036: [G-034, G-035]
G-037: [G-036]
G-038: [G-029, G-031, G-036]
G-039: [G-005, G-028, G-030, G-034, G-038]
G-040: [G-034, G-035, G-037, G-038, G-039]
```

Oleadas topológicas permitidas (cada fila solo contiene tareas con todas sus
dependencias en filas anteriores). La paralelización es opcional; si se usa,
los `allowed_paths` de los IDs de una fila no se solapan.

| Ola | IDs paralelizables | Regla |
|---|---|---|
| O1 | G-001 | scaffold del paquete |
| O2 | G-002 | un solo escritor de fuente vendorizada |
| O3 | G-003 | logger/build sobre el checkout fijado |
| O4 | G-004 | único escritor de root package y lock |
| O5 | G-005 | baseline tarball/workspace aislado |
| O6 | G-006 | contrato público; no toca reconciler |
| O7 | G-011 | modelo interno antes del normalizador |
| O8 | G-007 | snapshot/errores puros |
| O9 | G-010, G-012 | callback de medida y líneas/áreas son paths disjuntos |
| O10 | G-013 | placement explícito |
| O11 | G-014 | cursor auto-placement |
| O12 | G-015, G-016 | dense e implícitas en archivos distintos |
| O13 | G-017 | repeat y auto-repeat |
| O14 | G-018 | inicialización de sizing |
| O15 | G-019 | contribuciones span=1 |
| O16 | G-020 | crecimiento de spans |
| O17 | G-021 | maximize |
| O18 | G-022, G-023 | fr y available-space no comparten archivos |
| O19 | G-024 | minmax/fit-content |
| O20 | G-025 | alignment de tracks |
| O21 | G-026 | alignment/tamaño de ítems |
| O22 | G-027 | recálculo con presupuesto fijo |
| O23 | G-028 | único compositor y seam de Node vendorizado |
| O24 | G-029 | único escritor de `flex-sync.ts` |
| O25 | G-008 | reconciler y batch Solid |
| O26 | G-009 | lifecycle/reparent/resize |
| O27 | G-030 | único escritor de `layout-adapter.ts` |
| O28 | G-031 | propietario único de `node.ts` + `layout.ts` |
| O29 | G-032 | walk/resize |
| O30 | G-033 | interacción/hit-test |
| O31 | G-034 | catálogo ejecutable de fixtures |
| O32 | G-035 | oráculo externo |
| O33 | G-036 | escena visual sin golden |
| O34 | G-037 | Kitty/tmux físico separado |
| O35 | G-038 | generadores, reports y barriles |
| O36 | G-039 | consumidor real y benchmark serial |
| O37 | G-040 | documentación y cierre Root |

Un worker no puede editar un path ajeno aunque encuentre una mejora incidental.
Un fallo repetido por estado externo se entrega como blocker con comando,
versión, path de reporte y evidencia; la escalación solo puede preguntar o
proponer un cambio acotado, nunca inventar una implementación alternativa.
---
## 7. Verificación transversal y gates de salida

### Correctitud y atomicidad

- `bun run typecheck` y `bun run test` deben pasar con `--conditions=browser` y
  el preload Solid requerido por el root.
- `cd native/libvexart && cargo test` es regresión obligatoria aunque Rust no
  cambie.
- `bun run api:update`/diff, `bun run build:dist` y el smoke de
  `scripts/release-verification.test.mjs` deben pasar con los dos barriles y
  un reconciler universal compartido.
- Los fixtures numéricos comparan solver pre-round a `1e-6`; la capa Node usa
  la redondeada por Flexily. Cada error debe preservar el último rect válido.
- Se verifican cambios reactivos, replacement de arrays, batch de props,
  reparent, resize, nesting, texto restringido, scroll, floating, focus,
  hit-test y transforms con implementaciones reales, nunca mocks.

### Visual y terminal físico

- El runner existente mantiene umbral de 0.5% de píxeles con diferencia de
  canal `>4`; `--update` de goldens solo con autorización explícita y se
  registran archivos modificados.
- `scripts/visual-test/runner.ts --scene=grid-dashboard` es offscreen y solo
  prueba la escena/píxeles; no prueba terminal físico.
- `scripts/visual-test/tmux-parity.ts --scene=scenes/grid-dashboard --out=<dir nuevo>`
  debe ejecutarse aparte para Kitty directo y tmux+SHM, consumir SHM real,
  validar passthrough, frames, rects y bytes. Ausencia de terminal físico es
  blocker, no pass.
- Se conserva el inventario de goldens existente; no se borra ni regenera una
  escena no relacionada.

### Rendimiento y observabilidad

- Cada reporte incluye `runId`, commit, Bun, OS, CPU/GPU, terminal, tamaño,
  número de nodos, seeds, warmup, frames medidos y rutas de artefacto.
- El benchmark es serial y repite exactamente cinco runs; cada run calienta 100
  frames y mide 1000. p95 Flex no puede superar 1.05x baseline, Grid400 no puede
  superar 2x Flex comparable.
- Se observan counters no-op, revisión Grid, cache hit/miss y tiempos separados
  `sync`, solver, writeback y render. Incremental-vs-fresh es solo una prueba
  de caché, no un oráculo de conformidad.

## 8. Rollback, revisión y manifest

El rollback de una feature incompleta revierte el enlace de dependencia y la
integración del solver juntos: `packages/internal-flexily/` y las modificaciones
de `flex-sync`/adaptador/node/layout se restauran como una unidad, preservando
cualquier trabajo ajeno en otros paths. No se usa `reset --hard`, `clean`,
checkout amplio ni force push. Quitar `layout="grid"` de un ejemplo no es
revertir el engine, y quitar una prop pública no es un rollback válido.

El único manifest de ejecución es `artifacts/grid/execution/<run-id>/manifest.json`;
no vive junto a esta planificación y ningún worker lo escribe. Root lo crea y
actualiza después de cada handoff, sin mezclar estados. Su forma inicial debe
contener cada ID individual, no rangos:

```json
{
  "runId": "<run-id>",
  "tasks": [
    {"id":"G-001","status":"PENDING"},
    {"id":"G-002","status":"PENDING"},
    {"id":"G-003","status":"PENDING"},
    {"id":"G-004","status":"PENDING"},
    {"id":"G-005","status":"PENDING"},
    {"id":"G-006","status":"PENDING"},
    {"id":"G-007","status":"PENDING"},
    {"id":"G-008","status":"PENDING"},
    {"id":"G-009","status":"PENDING"},
    {"id":"G-010","status":"PENDING"},
    {"id":"G-011","status":"PENDING"},
    {"id":"G-012","status":"PENDING"},
    {"id":"G-013","status":"PENDING"},
    {"id":"G-014","status":"PENDING"},
    {"id":"G-015","status":"PENDING"},
    {"id":"G-016","status":"PENDING"},
    {"id":"G-017","status":"PENDING"},
    {"id":"G-018","status":"PENDING"},
    {"id":"G-019","status":"PENDING"},
    {"id":"G-020","status":"PENDING"},
    {"id":"G-021","status":"PENDING"},
    {"id":"G-022","status":"PENDING"},
    {"id":"G-023","status":"PENDING"},
    {"id":"G-024","status":"PENDING"},
    {"id":"G-025","status":"PENDING"},
    {"id":"G-026","status":"PENDING"},
    {"id":"G-027","status":"PENDING"},
    {"id":"G-028","status":"PENDING"},
    {"id":"G-029","status":"PENDING"},
    {"id":"G-030","status":"PENDING"},
    {"id":"G-031","status":"PENDING"},
    {"id":"G-032","status":"PENDING"},
    {"id":"G-033","status":"PENDING"},
    {"id":"G-034","status":"PENDING"},
    {"id":"G-035","status":"PENDING"},
    {"id":"G-036","status":"PENDING"},
    {"id":"G-037","status":"PENDING"},
    {"id":"G-038","status":"PENDING"},
    {"id":"G-039","status":"PENDING"},
    {"id":"G-040","status":"PENDING"}
  ]
}
```

Un ID pasa a `PASS` solo con evidencia local reproducible. `BLOCKED` requiere
el comando fallido, entorno/versiones, path de reporte y por qué el bloqueo no
se puede resolver dentro de `allowed_paths`; no se marca `PASS` por saltar un
fixture, un navegador, Kitty, tmux, SHM, benchmark o cargo. La finalización de
G-040 no autoriza publicar, cambiar versión ni actualizar goldens sin una
aprobación externa específica.
