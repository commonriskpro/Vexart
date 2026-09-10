# Work items y reglas para agentes Luna

**Estado (2026-09-09):** la implementación local sigue integrada y el
baseline funcional automatizado anterior (30 PASS, 0 FAIL, 345 aserciones en 5
archivos; 30 rutas GPU, store 9/67 y typechecks PASS) queda como evidencia
histórica, no como aceptación del mock ni resultado pixel-identical. La
verificación automatizada final registra 35 PASS, 0 FAIL y 399 assertions en 7
archivos; root y PS5 typecheck pasan. El fix interno TS/native del probe público de estilos de
`<img>` está verificado: `supported=true`, máscara `cornerRadius`,
`objectFit` `fill/cover` y letterboxing `contain` observables; la API pública no
cambió. Evidencia: [`image-style-blocker.md`](image-style-blocker.md) y el log
nuevo [`image-style-fix.log`](../../scripts/ps5-demo/artifacts/image-style-fix.log).

Los assets del mock se consideran suficientemente parecidos y **aceptados por el
usuario**; se detiene el asset polish y ya no son un gate. La limitación técnica
de `directors-cut-brush.png` sobre 2048 px y el fixture histórico de crop offset
se conservan como notas, sin afirmar pixel-perfect ni causalidad retrospectiva.
La pasada funcional/visual final y el engine final pasan en el alcance local;
no queda un gate funcional ni engine gate activo. Root inspeccionó P1 y el narrow
P2 del alias `boxShadow`. No se usa bypass físico ni se afirma un PS5 completamente
perfecto. Esta es coordinación documental; el engine fix ya
fue realizado por su propietario y no se modifica código en este encargo.

**Evidencia final de la pasada:** root confirma 35 PASS, 0 FAIL y 399 assertions
en 7 archivos, en 28.43 s (`/tmp/ps5-final-functional.log`). El engine final
registra 76 PASS, 0 FAIL y 594 assertions en 7 archivos
(`/tmp/ps5-final-engine.log`); motion, opacidad, crop y bounds/shadows pasan. La
visual final de mock confirma dos capturas exactas de 1672×941 con checks
verdaderos (`/tmp/ps5-final-mock-visual.log`); la cobertura anterior de 30 rutas
se conserva. Los assets están aceptados y no son un gate. P1 y el narrow P2 del
alias `boxShadow` pasan en la inspección final de root; no queda engine gate abierto.


## Propiedad por módulo

| Propietario | Módulos de especificación ahora | Futura propiedad de implementación | No puede tocar |
|---|---|---|---|
| Base compartida | `PS5-BOOT`, `PS5-POWER`, host raíz, estado/acciones, catálogo instalado/descargas/storage | store, host, boot, selección de usuario, alimentación simulada y fuente de instalación/storage | UI de settings/control center; API del motor |
| Inicio y juegos | `PS5-HOME`, `PS5-GAME-HUB`, `PS5-LAUNCH`, `PS5-LIBRARY` | carrusel, hubs, loading/title, biblioteca | router/store duplicado, assets fuente |
| Centro de control | `PS5-CONTROL`, `PS5-SWITCHER`, `PS5-PROFILE`, `PS5-NOTIFICATIONS`, `PS5-GAMEBASE` | overlays, selector, perfil, notificaciones, descargas, Game Base | store compartido, settings |
| Ajustes | `PS5-SETTINGS` | UI de categorías/storage, controles, persistencia y accesibilidad; despacha acciones al store compartido | fuente de catálogo, instalación, descargas y storage; overlays compartidos |
| Store/media | `PS5-STORE-MEDIA`, `PS5-GALLERY` | catálogos locales, multimedia no disponible, galería | motor, assets fuente |
| QA/integración | criterios de cada ficha | pruebas y escenas separadas | app source durante Phase 0 |

Notificaciones y descargas pertenecen al propietario de Centro de control como UI, pero su estado y efectos sobre instalación/storage viven en Base compartida. Ajustes posee la UI de storage, no su fuente. Boot, selección de usuario, catálogo instalado, descargas, storage y alimentación simulada pertenecen a Base compartida.

## Rutas bajo propiedad de este encargo

Estas son las rutas documentales bajo propiedad de este encargo; reflejan el avance de Phase 2/3 sin convertirlo en una aprobación de implementación:

- `docs/ps5-demo-implementation-plan.md` (estado y gates).
- `docs/ps5-demo/scope.md`.
- `docs/ps5-demo/state-and-navigation.md`.
- `docs/ps5-demo/visual-motion-assets.md`.
- `docs/ps5-demo/work-items.md`.
- `docs/ps5-demo/screens/*.md`.

Las implementaciones de base y pantallas no escriben `api-blockers.md`,
`validation.md`, referencias, app source, engine, configuración ni assets. La
implementación pertenece a sus workers; el propietario documental mantiene los
estados, contratos y coordinación, incluidos los reportes de blockers.

## Formato de una futura tarea de implementación

Cada tarea debe incluir:

1. IDs de requisitos y ficha de pantalla.
2. Un único módulo y archivos de escritura exclusivos.
3. Dependencias explícitas sobre `Ps5State`, `Ps5Actions`, `GameCatalogEntry` y tokens.
4. Punto de entrada/retorno, foco, scroll, loading/error y controles cubiertos.
5. Check enfocado de comportamiento y evidencia visual requerida.
6. Condición de parada: si la API pública no permite la conducta, pausar la implementación del proyecto/demo, registrar reproducción/evidencia y esperar decisión de root.

Para cualquier trabajo futuro, compilar o verse aislado no basta: debe consumir el store compartido y cerrar el recorrido de entrada/acción/retorno. Los módulos actuales ya están integrados en ese host común.

## Orden de gates

- [x] Root acepta el alcance y las 14 fichas.
- [x] Root acepta `state-and-navigation.md` y el shape de catálogo del worker de assets.
- [x] Root acepta tokens, keymap y adaptación.
- [x] Root resuelve y acepta las correcciones del contrato de demo antes de Phase 2; no es un bloqueo de API del motor.
- [x] El STOP histórico de Phase 1 está documentado en [`api-blockers.md`](api-blockers.md) y [`validation.md`](validation.md); la decisión de root permite continuar tras el fix.
- [x] El runner source-public es el gate de desarrollo aceptado; su alias de fuente no demuestra el consumidor empaquetado.
- [x] La base común de Phase 2 está en `examples/ps5/src`; typecheck fuente y store enfocado pasan.
- [x] Home source-public pasa en 1280/1920 con 2 tests, 48 aserciones y recorrido completo de 26 tiles; la QA source final queda registrada arriba con su conteo vigente.
- [x] Los filtros blur del nodo raíz o descendientes y las transformaciones cubiertas por la pasada visual conservan la captura solicitada; no se introduce tiling genérico ni elevación artificial de límites.
- [x] La integración automatizada de foco, overlays y recorridos está cubierta por la suite funcional final; no se presenta como validación física/manual de Kitty.
- [x] El recorrido vertical de Phase 3 está integrado y cubierto por la suite funcional y las 30 capturas finales; no se afirma fidelidad pixel-perfect ni validación física.
- [x] La decisión sobre [`gpu-texture-limit-blocker.md`](gpu-texture-limit-blocker.md) permite continuar tras el fix; no se acepta reducir la escena, tiling genérico ni elevar artificialmente los límites como atajo.
- [x] El probe público de estilos de `<img>` queda cerrado para el caso mínimo: `cornerRadius`, `fill/cover` y `contain` producen diferencias observables; no equivale a fidelidad exacta.
- [x] Motion, crop offset retained y forwarding TS-only de opacidad tienen checks acotados; el fixture histórico bajo transform/layer se conserva como contexto y no se atribuye causalidad sin evidencia.
- [x] Los assets de Home/Centro de control (iconos/logo/tarjetas) son suficientemente parecidos y aceptados por el usuario; se detiene el asset polish.
- [x] Settings/Launch/Library/Hub quedan cubiertos por las capturas finales y los cuatro estados secundarios; los assets no son un gate.
- [x] Motion, opacidad, crop offset y bounds/shadows pasan el check final del engine: 76 PASS/0 FAIL/594 assertions; el guard preserva overflow y excluye effects, transforms descendientes y freeze.
- [x] P1 y el narrow P2 del alias `boxShadow` pasan en el alcance local; root inspeccionó ambos helpers `resolveProps(node)` y la regresión GPU del alias. Las capturas requeridas pasan.

El tarball instalado, Kitty físico y rendimiento no se evalúan en esta pasada; no se afirma evidencia de esas capas.
- [x] Procedencia y cobertura visual del catálogo de 24 juegos finalizadas y validadas por el worker de assets.

## Regla de coordinación

Una pantalla solicita cambios al contrato compartido en vez de crear un helper paralelo. El host es el único que decide la capa que recibe input. Los workers pueden proponer ajustes en sus fichas, pero root debe aceptar cambios de contrato antes de implementarlos.
