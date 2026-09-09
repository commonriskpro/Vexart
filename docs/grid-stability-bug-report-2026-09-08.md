# Grid v1.x — Informe de estabilidad y búsqueda de bugs

**Fecha:** 2026-09-08
**Alcance:** revisión de estabilidad, bugs y preparación de release del trabajo Grid v1.x
**Base inspeccionada:** `0ea089d` (`feat(grid): complete v1.x beta implementation`)
**Responsable de cierre:** equipo Vexart

> La sección 1 conserva la línea de tiempo de la pasada inicial; las secciones
> siguientes registran las correcciones, los gates repetidos y la ruta de
> publicación sin reescribir la evidencia histórica.

## 1. Pasada de estabilidad

### Entorno

- macOS Darwin arm64
- Bun 1.3.14
- tmux 3.6a
- Rust 1.95.0
- Runner automatizado sin TTY físico ni identidad Kitty

### Gates ejecutados

| Gate | Resultado inicial | Observación |
| --- | --- | --- |
| `bun run typecheck` | PASS | TypeScript sin errores |
| Suite Bun con `--preload ./solid-plugin.ts` | 752/754 PASS | Dos fallos descritos abajo |
| Tests de código fuente excluyendo el gate físico | 737/737 PASS | Sin fallos de lógica observados en esa selección |
| Grid focalizado | 188 PASS / 1 FAIL sin baseline; 189/189 con baseline | El fallo sin baseline es un bug de manejo de artefacto ausente |
| `cd native/libvexart && cargo test` | 168 PASS, 1 ignored | Rust nativo estable |
| `bun run lint:boundaries` | FAIL (10 ciclos) | Todos están en el Flexily vendorizado |
| `bun test scripts/release-verification.test.mjs` | 13/13 PASS | Verificador de release estable |
| `bun run api:update` | PASS | Warnings documentales no bloqueantes |
| `bun run gen:types` | PASS | — |
| `bun run gen:jsx-runtime` | PASS | 111 props validadas |
| `bun run build:dist` / `bun run pack` | PASS | Artefactos generados localmente |
| Evidencia física G-037 | PASS previo | `artifacts/grid-parity/auto5-20260908-213404/report.json` registra Kitty real + tmux; no se puede repetir desde este runner sin TTY |

El test físico `scripts/visual-test/tmux-grid.test.ts` es deliberadamente estricto: fuera de Kitty/TTY informa `BLOCKED` en lugar de convertir el gate en un falso `PASS`. Esto es una limitación del entorno de ejecución, no una razón para debilitar el gate.

## 2. Hallazgos de bug y estabilidad

| ID | Severidad | Ubicación | Hallazgo | Estado inicial |
| --- | --- | --- | --- | --- |
| B-001 | P1 | `scripts/grid/perf.ts` | `sumBaselineP95` recibe un baseline opcional, pero dereferencia `report.results` cuando el reporte no existe. Un checkout limpio termina en `TypeError` en vez de quedar bloqueado con diagnóstico. | Abierto |
| B-002 | P1 | `packages/engine/src/terminal/tmux.test.ts` | El test crea un servidor aislado, pero construye `TMUX` con el PID del proceso de test y no con el PID real del servidor. Bun/tmux puede resolver el servidor equivocado y devolver `all` aunque la opción aislada sea `on`. | Abierto |
| B-003 | P1 | `.dependency-cruiser.cjs` | La incorporación de `packages/internal-flexily` expone diez ciclos internos intencionales del código vendorizado. El gate de límites falla aunque las capas de Vexart no tengan ciclos nuevos. | Abierto |
| B-004 | P1 | Metadatos de release | La versión raíz sigue en beta.27 aunque el commit actual añade API Grid; la política de API exige bump minor en 0.x. También había banner “Closed Source”, ruta de licencia Cargo inexistente y comandos de instalación que resuelven `latest` en vez del canal beta. | Abierto |
| B-005 | P2 | Evidencia Grid | El manifiesto de ejecución comprometido registra el commit histórico `9b839202` y apunta a evidencia no trackeada. No debe presentarse como evidencia del HEAD actual. | Abierto/documental |
| B-006 | P2 | Gate físico | El runner sin Kitty/TTY no puede volver a ejecutar G-037. La política actual exige un gate físico real y no permite skip sintético. | Bloqueo ambiental (sin cambio de código) |
| B-007 | P1 | API snapshot CI | Los warnings de API Extractor incluían rutas absolutas del checkout. El primer `phase4-gates` para `531eb2b` detectó ese prefijo distinto en CI aunque el contrato API era idéntico al local. | Descubierto al validar el commit de release |

## 3. Criterio de corrección

- Un baseline ausente o inválido debe producir estado `BLOCKED` con valores nulos y diagnóstico, nunca una excepción no controlada.
- El test tmux debe identificar el servidor que acaba de crear y limpiar sólo su socket/sesión.
- El lint de límites debe seguir detectando ciclos entre capas Vexart; los ciclos internos del vendorizado Flexily deben quedar documentados como excepción explícita y acotada.
- La release debe usar una versión compatible con `docs/API-POLICY.md`, tener metadatos coherentes y publicarse mediante el workflow matricial (no desde el `dist/` Darwin parcial local).
- Las rutas/artefactos no relacionados del árbol de trabajo permanecen intactos y fuera del commit.

## 4. Cierre

La pasada de fixes quedó aplicada en el árbol de trabajo y se repitieron los
gates de código. El único resultado no verde es el gate físico G-037 cuando se
ejecuta desde este proceso automatizado sin TTY/Kitty; la política exige
mantenerlo bloqueado en ese entorno en vez de fabricar un `PASS`.

Tras el primer push del release, el workflow `phase4-gates` (run
`34305000182`) falló únicamente en el snapshot API por el prefijo absoluto del
checkout del runner. Ese incidente añadió B-007; la corrección y su rerun se
incluyen en las tablas siguientes.

## 5. Correcciones aplicadas

| ID | Corrección | Regresión/gate de cierre |
| --- | --- | --- |
| B-001 | `sumBaselineP95()` acepta un reporte ausente y devuelve `null`; la normalización queda en `BLOCKED` con diagnóstico. | `scripts/grid/perf.test.ts`: caso de baseline indefinido; 4/4 PASS. |
| B-002 | El test tmux consulta el PID real del servidor y el pane real, usa opciones pane-scoped para aislar la resolución y limpia únicamente su servidor/socket. | `packages/engine/src/terminal/tmux.test.ts`: 7/7 PASS. |
| B-003 | Se documentó una excepción acotada al subárbol vendorizado `packages/internal-flexily/src/`; los ciclos entre capas Vexart continúan siendo errores. | `bun run lint:boundaries`: 0 violaciones, 345 módulos. |
| B-004 | La release usa `0.10.0-beta.1` (bump minor requerido por la política 0.x); se actualizaron changelog, instalación beta, sitio, banners y licencia Cargo. | `api:update`, `gen:types`, `gen:jsx-runtime`, `docs:build`, `build:dist`, `pack` y smoke de release PASS. |
| B-005 | El manifiesto histórico `grid-v1x-20260908-215411` no se reescribió: queda identificado como evidencia del commit anterior y no se presenta como evidencia del HEAD. | Este informe conserva la trazabilidad y separa artefactos históricos de los gates actuales. |
| B-006 | No se modifica el gate físico ni se añade un skip. La evidencia física previa sigue disponible y el runner actual informa el bloqueo ambiental con detalle. | La prueba completa conserva G-037 como `BLOCKED` fuera de Kitty/TTY. |
| B-007 | `scripts/normalize-api-reports.ts` reemplaza el prefijo variable anterior a `.api-extractor-temp/` por `<repo>/` y conserva el formato de fin de línea canónico de cada snapshot después de `api:update`; así el snapshot sólo conserva el diagnóstico relevante. | `scripts/normalize-api-reports.test.ts`: 4/4 PASS; `bun run api:update` deja los cuatro snapshots sin drift local. |

Además, la búsqueda de bugs encontró y corrigió tres defectos de Grid que no
aparecían en la pasada inicial: el cursor de auto-placement con un eje
definido, los gutters omitidos por `auto-fit`, y el conteo de `auto-repeat`
cuando hay varios tracks fijos. También se excluyeron hijos absolutos/flotantes
del flujo de celdas y se evitó publicar errores retenidos de subárboles ocultos.

## 6. Gates finales

Ejecutados sobre el árbol corregido (`0ea089d` como commit base de la pasada;
el commit de release incorpora este informe):

| Gate | Resultado |
| --- | --- |
| `bun run typecheck` | PASS |
| `bun run test` | 761 PASS / 1 BLOCKED: sólo G-037 físico por ausencia de TTY/Kitty; el resto de 762 tests pasa, incluido tmux. |
| Suite de paquetes usada por CI (excluye pruebas GPU/TTY) | 652 PASS / 0 FAIL |
| `bun --conditions=browser test --preload ./solid-plugin.ts packages/internal-flexily/src/grid` | 139 PASS / 0 FAIL |
| `packages/engine/src/loop/layout-adapter-grid.test.ts` | 5 PASS / 0 FAIL |
| tmux + perf focalizados | 11 PASS / 0 FAIL |
| `bun --conditions=browser run scripts/grid/perf.ts --runs=5 --warmup=100 --frames=1000` | G-039 PASS: Flex 1.028x del baseline normalizado (límite 1.05x); Grid 0.328x de Flex (límite 2x). |
| `bun run perf:check` | PASS; −46.9% frente al baseline de 800×600. |
| `cd native/libvexart && cargo test` | 168 PASS, 1 ignored; `cargo build --release` PASS. |
| `bun run api:update` / `gen:types` / `gen:jsx-runtime` | PASS (warnings TSDoc preexistentes, no bloqueantes); snapshots normalizados para checkout estable. |
| `bun run docs:build` | PASS, 22 páginas. |
| `bun run build:dist` / `bun run pack` | PASS; paquete `vexart-0.10.0-beta.1.tgz`. |
| `node --test scripts/release-verification.test.mjs` | 13 PASS / 0 FAIL. |
| `bun run test:visual` | 41 PASS; `grid-dashboard` queda sin PNG por diseño G-036 (escena candidata, no golden). |
| `git diff --check` (código y documentación) | PASS; los warnings `trailing whitespace` que Git muestra en las líneas nuevas de `headless.api.md`/`styled.api.md` son los `CR` de su formato CRLF ya existente. |
| `phase4-gates` para `531eb2b` (`34305000182`) | FAIL sólo en API snapshot por B-007; follow-up con el normalizador pendiente al cierre de este informe. |

La validación local de artefactos multiplataforma queda deliberadamente para
el workflow matricial: el `dist/` Darwin local no contiene los binarios Linux.
No se publicó desde ese artefacto parcial.

## 7. Release

- **Versión:** `0.10.0-beta.1`.
- **Canal:** `beta` (derivado por `scripts/release-verification.mjs`).
- **Ruta de publicación:** push del commit a `main`, espera de
  `phase4-gates`, tag anotado `v0.10.0-beta.1` y workflow `build-native` para
  compilar/publicar los tres paquetes nativos y `vexart`.
- **Gate de snapshots:** los reportes API se normalizan a `<repo>/` para que el
  resultado sea reproducible entre checkouts locales y CI.
- **Limitación local:** `npm whoami` no está autenticado en este entorno; la
  publicación se realiza únicamente mediante el workflow con `NPM_TOKEN`.
