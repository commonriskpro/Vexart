# Informe de preflight de release

## Alcance y resultado (preflight histórico)

El bloque siguiente conserva el preflight de empaquetado anterior sobre la
versión local `0.9.0-beta.26`. En esa corrida, el artefacto Darwin local se
construyó, empaquetó, instaló desde tarballs y cargó en un consumidor aislado.
Este registro está fechado el `2026-09-08`; sus conclusiones son históricas y
no sustituyen la verificación final que se agrega más abajo.

Base de evidencia del preflight histórico:
`/tmp/vexart-release-preflight-k0nkvfut/`. Las rutas `package/`, `visual/` y
los logs de suite de ese bloque son relativas a esa base. La verificación final usa
la base separada `/tmp/vexart-boundaries-preview-5lc9yetl/`: sus checks están bajo
`verification/` y sus artefactos de package/API en la raíz de esa base.

> Las secciones históricas se conservan para trazabilidad. En particular, sus
> referencias a deuda de boundaries, conteos anteriores y estados pendientes no
> describen el estado actual.

## Evidencia de empaquetado

- Se preservó el `dist` previo en
  `/tmp/vexart-release-preflight-k0nkvfut/package/dist-before/` (25 archivos).
- `cargo build --release` terminó correctamente; evidencia en
  `package/cargo-build.log`.
- `bun run build:dist` terminó correctamente; evidencia en
  `package/build-dist-final2.log`.
- Se generaron los dos tarballs host:
  - `vexart-0.9.0-beta.26.tgz` — SHA-256
    `7ddb751216775a51dfdab4b226afe0d72d93b72ee04083de317c9eafb544d0a6`.
  - `vexart-native-darwin-arm64-0.9.0-beta.26.tgz` — SHA-256
    `86976bda3de4b80355aa9a23d2db3c41b5b7601c465dd4713d2efb7cae146ff1`.
- El binario nativo fuente, `dist` e instalación del consumidor coinciden:
  SHA-256 `644b20a1bf72a9c91df2336dc7c7d3357a4bb0054e2966e6931f885d8d600d07`
  y 3,410,032 bytes (`package/native-provenance-final.log`).
- La validación de manifiesto, exports y contenido de tarballs pasó en
  `package/artifact-check-final.log`.
- Los tarballs se instalaron en un consumidor temporal separado usando ambos
  archivos locales; no se usó un symlink al `node_modules` del repositorio.

## Runtime, JSX y API pública

- Importaciones de `vexart` y `vexart/engine` pasaron y expusieron 166 y 223
  exports, respectivamente (`package/consumer-import-final.log`).
- La identidad compartida del reconciliador quedó verificada:
  `vexart.render === engine.render` y
  `vexart.createRenderer === engine.createRenderer`.
- El typecheck del consumidor con la configuración Bun documentada
  (`typescript`, `@types/bun`, `@types/node`, `skipLibCheck`) pasó en
  `package/consumer-types-final.log`. El typecheck estricto sin esos ambientes
  produjo errores de `bun:ffi`/Node y no se considera un bloqueo del runtime
  Bun documentado.
- Un app JSX real del consumidor compiló con el CLI empaquetado a
  `consumer/build-final/main.js` (`package/consumer-cli-build-final.log`).
- El smoke nativo cargó la dylib instalada y verificó la versión FFI
  `133888` (`package/consumer-native-smoke-final.log`). Un frame nativo con
  JSX se ejecutó fuera de una UI física y emitió bytes Kitty capturados
  (`package/consumer-native-render-stats-final.log`). Esto no demuestra
  visibilidad en Kitty/Ghostty.
- La generación de API se ejecutó en una copia aislada; los tipos sincronizados
  conservan únicamente los cambios esperados. Los 13 checks del release helper
  están en estado PASS en el canal beta local.

## Verificación final de runtime y paridad

- `bun run test` estándar terminó `548 PASS / 0 FAIL`, `1803` expectativas,
  `84` archivos, `39.53 s` (`full-tests-standard-final.log`). Para el timeout
  GPU se elevó a `30_000` ms el timeout explícito del test de Input en
  `scripts/visual-test/tmux-interaction.test.tsx`, después de medir `13.7 s`
  en GPU fría; no cambió assertions ni producción. Los cambios de coordenadas
  del overlay se verificaron por separado con geometría real.
- Typecheck del proyecto y del alcance de scripts: PASS en
  `typecheck-final.log` y `scripts-typecheck-final.log`.
- Construcción de documentación: 22 páginas PASS en
  `docs-build-local.log`.
- Cinco casos Direct/tmux-SHM actualizados pasaron: `components-dropdown`,
  `components-avatar-badge`, `effects-backdrop-blur`, `hello` y
  `styled-overlays-interaction`. Sus logs son los `parity-*.log` y la carpeta
  `parity-final/` del conjunto de evidencia. Son verificaciones de bytes/píxeles
  nativos; sólo `styled-overlays-interaction` incluye oracle adicional. No son
  pruebas de UI física.
- La repetibilidad de `41` candidatos quedó en diff `0` frente al source actual
  (`visual/candidate-repeatability.log`). Después de la aprobación de
  goldens, `bun run test:visual` terminó `41 PASS / 0 FAIL`, todos con diff
  `0.00%` (`visual/approved-goldens-check.log`). Las referencias instaladas
  coinciden con `candidate_sha`; el backup de `42` referencias coincide con
  `old_sha`, incluido `lightcode-os`, que se preservó intacto.
- La preservación final no omitió ningún archivo previo y quedó limitada a los
  alcances autorizados (`preservation-final.json`).

## Estado de verificación relacionado

Estos resultados no deben leerse como una señal de release listo:

- El snapshot intermedio fue `543` PASS y `2` FAIL; ambos fallos del click del
  fixture de overlay se resolvieron usando la geometría real del item y
  manteniendo el oracle. El estado final de la suite está documentado arriba.
- Los `41` candidatos intermedios no eran aprobación; tras la aprobación
  explícita del usuario, la comparación oficial quedó en `41/41` PASS y diff
  `0.00%`. No se actualizaron goldens sin esa aprobación.
- La auditoría Badge/blur confirmó que los fixtures originales no cabían; se
  corrigieron esos fixtures y `hello` sin registrar una regresión del motor. El
  Badge conserva la limitación conocida de wrap en contenedores extremadamente
  estrechos.
- Boundary checks ya ejecutadas: `5` errores preexistentes (4 ciclos y la
  dependencia `headless table test → styled`); son deuda pendiente y no se
  declaran PASS.
- La paridad visual humana previa y el rendimiento práctico previamente
  aceptado (Ghostty/tmux frente a Kitty/plain, sin afirmar FPS de efectos) son
  contexto, no evidencia adicional de este preflight.
- Sólo se validó el host `darwin-arm64`. Los tres targets CI no se ejecutaron.
- `0.9.0-beta.26` es sólo la versión local probada; no afirma disponibilidad
  nueva en el registro.

## Archivos relevantes de esta etapa

Frente al estado dirty previo, esta etapa agrupó: canal beta y release helper
(`.github/workflows/build-native.yml`, `scripts/release-verification.mjs`,
`scripts/release-verification.test.mjs`); APIs/tipos sincronizados
(`packages/engine/etc/engine.api.md`, `types/engine.d.ts`); documentación de
release; 40 goldens aprobados en `scripts/visual-test/references/`; y las dos
pruebas geométricas nuevas `scripts/visual-test/dropdown-layout.test.tsx` y
`scripts/visual-test/scene-layout.test.tsx`. También se corrigieron
`packages/styled/src/components/dropdown-menu.tsx` y los tres fixtures de
`scripts/visual-test/scenes/` (`components-avatar-badge.tsx`,
`effects-backdrop-blur.tsx`, `hello.tsx`), más el timeout de harness citado.
Las pruebas de fixtures se ejecutaron desde el repositorio: los scripts de
`scripts/visual-test/` no forman parte del tarball. El empaquetado confirmó el
source de dropdown en el artefacto actual; no hubo cambios posteriores en
native Darwin ni en packaging.

No se hizo `publish`, `push`, tag ni commit. Tampoco se realizó control físico
de Kitty/Ghostty.

---

## Verificación final — 2026-09-08

**Estado:** la cobertura funcional, visual, paridad automatizada y QA del
paquete Darwin están en verde. La preview sigue siendo experimental: no es una
aprobación global ni un waiver de los gates estrictos. Sólo puede considerarse
para aceptación explícita con las limitaciones de rendimiento documentadas y
sin validar Linux/CI. No se publicó ningún paquete.

### Preparación beta.27

El usuario aceptó explícitamente el valor repetido de `5.07 ms` para esta
Developer Preview y autorizó publicar `0.9.0-beta.27` únicamente con el tag
`beta`. Esta autorización no modifica los umbrales del PRD, no declara la
versión publicada y no implica que CI haya pasado.

### Checks finales

- **Boundary:** `0` violaciones en `268` módulos y `919` dependencias
  (`/tmp/vexart-boundaries-preview-5lc9yetl/verification/boundaries.log`). Los
  cuatro ciclos de contratos leaf/callback obligatorio quedaron resueltos y la
  quinta violación `headless table test → styled` se eliminó moviendo el test de
  integración a `scripts/visual-test/table-tabs.test.tsx`; no se añadieron
  globals ni configuración al alcance de este cierre. Los archivos nuevos
  relevantes son `packages/engine/src/ffi/node-types.ts` y
  `scripts/visual-test/table-tabs.test.tsx`. La preservación final no omitió
  archivos existentes y dejó intactas referencias y snapshots en
  `/tmp/vexart-boundaries-preview-5lc9yetl/preservation-final.json`.
- **Tipos y suite:** typecheck principal y de scripts PASS
  (`verification/typecheck.log`, `verification/scripts-typecheck.log`). La
  suite terminó `549 PASS / 0 FAIL`, `1,805` expectativas, `85` archivos y
  `17.31 s` (`verification/full-tests.log`).
- **Visual:** `41 PASS / 0 FAIL`, diff `0%`, sin modificar goldens
  (`verification/visual.log`).
- **Paridad:** `52 PASS / 0 FAIL` en comparaciones de paquetes Kitty y píxeles
  decodificados; esta evidencia es automatizada y no es observación de UI física
  (`verification/parity.log`).
- **API:** `api-update-root-final.log` terminó con código `0` en copia aislada y
  `api-update-root-final-record.json` confirma que el repositorio real quedó
  intacto. La comparación de nueve archivos conserva las mismas declaraciones
  y mensajes; las diferencias de texto se limitan a la normalización del
  `import type` de Node y ubicaciones diagnósticas
  (`api-comparison-root-final.json`). Una mutación intermedia de tres archivos
  fue restaurada al hash baseline; no se infiere su causa.
- **Artefacto local:** `package/final/` contiene build, ambos tarballs,
  instalación aislada y comprobaciones de imports/types. `package/final/artifact-root-review.json`
  confirma que `dist` y el consumidor coinciden; `vexart` expone `166` exports y
  `vexart/engine`, `223`. `package/final/consumer-root-checks.json` confirma CLI
  build y carga nativa con exit `0`, además de un frame capturado de `4,723`
  bytes Kitty (FFI `133888`); no es observación de UI física. El runtime
  `jsx-runtime` es type-only por diseño. QA del paquete Darwin PASS.

### Rendimiento y límites

- El smoke de rendimiento pasó: `7.53 ms/frame` frente al umbral de `9.02 ms`
  (`verification/performance/smoke.log`); el orquestador también pasó
  (`verification/performance/orchestrator.log`).
- El frame-breakdown usa `300` frames, `5` warmup y SHM full-frame, pero sólo
  mide tiempos internos en este proceso; no mide tmux real, latencia de terminal
  ni FPS visible. La corrida inicial falló dashboard (`11.295792` vs `<10 ms`)
  y dirty-region (`5.685083` vs `<5 ms`); compositor (`6.106792` vs `<8.33 ms`)
  y noop (`0.009542` vs `<1 ms`) pasaron. La repetición falló sólo
  dirty-region (`5.071917`), mientras dashboard (`9.843125`), compositor
  (`4.727375`) y noop (`0.009709`) pasaron. Evidencia:
  `verification/performance/frame-breakdown{,-repeat}.json` y
  `gate{,-repeat}.log`.
- No se cambió ningún umbral del PRD ni se interpreta la variación como una
  regresión causal sin un benchmark comparable. La matriz Linux/CI y la
  presentación física siguen sin validarse en esta sesión.
