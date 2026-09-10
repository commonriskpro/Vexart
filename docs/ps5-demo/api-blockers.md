# Bloqueos de API pública — demo PS5

> **Estado actualizado — 2026-09-09:** el fix interno de imagen está
> implementado y verificado sin cambios de API pública. El probe source-public
> termina con exit 0, `supported=true`, `roundedMaskApplied=true`,
> `objectFitApplied=true` y `letterboxingApplied=true`. La suite funcional final
> registra 35 PASS/0 FAIL/399 assertions en 7 archivos y la suite ampliada del
> engine 76 PASS/0 FAIL/594 assertions en 7 archivos. El cambio está limitado a
> la frontera TS/native FFI y cierra el bloqueo de estilos para el probe mínimo;
> el guard final de bounds/shadows pasa en el alcance local.
>
> Las rutas source-public con y sin layer del baseline de transform/clip se
> conservan abajo como historial y no constituyen el resultado actual del
> runtime. El caso adicional de recorte horizontal con offset no cero bajo
> transform/layer sigue produciendo composición vacía incluso con radio 0 en
> la ruta de operación de clip anterior; no se afirma que sea preexistente
> demostrado ni se ha aislado la causalidad. Ese caso separado no fue cubierto
> por el fix de máscara de región y permanece abierto.
>
> Los assets visuales de Home/Centro de control se consideran suficientemente
> parecidos y **aceptados por el usuario**; se detiene el asset polish. La
> limitación técnica de `directors-cut-brush.png` (2172×724, sobre 2048) queda
> registrada, pero ya no es blocker. La QA funcional/layout/motion, el engine
> final y las capturas requeridas pasan en el alcance local. La revisión
> P1 y el narrow P2 del alias `boxShadow` pasan en la inspección final de root; no
> queda un engine gate abierto. No se afirma un producto completamente perfecto ni
> validación física de Kitty.
>
> **Evidencia final de la pasada:** root confirma 35 PASS, 0 FAIL y 399 assertions
> en 7 archivos, en 28.43 s (`/tmp/ps5-final-functional.log`). El engine final
> registra 76 PASS/0 FAIL/594 assertions en 7 archivos
> (`/tmp/ps5-final-engine.log`); el guard idéntico de paint/compositor preserva
> overflow y excluye effects, transforms descendientes y freeze. La visual final
> de mock registra dos capturas exactas de 1672×941 con checks verdaderos
> (`/tmp/ps5-final-mock-visual.log`). Los assets están aceptados y no son un gate.
> El fix P1 y el narrow P2 del alias `boxShadow` pasan en el alcance local; root
> inspeccionó ambos helpers `resolveProps(node)` y la regresión GPU del alias. No
> queda un engine gate abierto.

**Baseline histórico (2026-09-08):** STOP confirmado para Phase 1. El patrón
de carrusel horizontal con posición, recorte e imágenes entrando tras una
transformación no quedó demostrado con el runtime público. La reproducción y
sus métricas se mantienen abajo para conservar la trazabilidad; no describen
la verificación posterior al fix.

**Alcance de la evidencia:** la aplicación de prueba usa el barrel público
`vexart`; el adaptador de observación de píxeles/input es interno y solo
pertenece a QA. La evidencia nueva demuestra el probe mínimo de estilos, no una
imposibilidad universal ni la fidelidad exacta de todas las composiciones.

## Evidencia posterior al fix de estilos — 2026-09-09

- Comando: `bash scripts/ps5-demo/run-app-source.sh tests/image-style-probe.tsx`.
- Log: [`image-style-fix.log`](../../scripts/ps5-demo/artifacts/image-style-fix.log).
- `cornerRadius={12}` produce delta de máscara (`total=62968`, `changed=192`).
- `fill` frente a `cover` produce delta (`total=183600`, `changed=288`) y
  `contain` muestra letterboxing sobre el fondo.
- La API pública no cambió; no se añadió un workaround de raster ni se
  sustituyeron assets para ocultar diferencias.

## Baseline histórico: fixture y reproducción (pre-fix)

- Fixture mínima source-public offscreen: 420×300. La sonda integrada de 24 tarjetas usa 720×560.
- Viewport de fila: x=18, y=48, w=220, h=80.
- Contenido: cuatro bloques de color de 48 px y dos imágenes, gap=12.
- Movimiento: `translateX(0 → -60)` tras esperar 180 ms.
- Expectativa sin layer: los tres bloques visibles deben quedar en x=42, 102 y 162.
- Expectativa con layer: la imagen Ghost que entra debe aportar píxeles en x=198..238.
- Evidencia primaria: [`source-public-qa.json`](../../scripts/ps5-demo/artifacts/source-public-qa.json), [`source-public-qa-stop.log`](../../scripts/ps5-demo/artifacts/source-public-qa-stop.log) y los PNG de las variantes [no-layer](../../scripts/ps5-demo/artifacts/clip-no-layer-initial.png), [layer](../../scripts/ps5-demo/artifacts/clip-layer-initial.png) y [layer-overlay](../../scripts/ps5-demo/artifacts/clip-layer-overlay-initial.png), con sus respectivos `final`.
- **Comando verificado por root:** `bash scripts/ps5-demo/run-source-public-qa.sh` reproduce las tres variantes y los dos IDs de bloqueo, termina con exit 1 y deja el STOP confirmado. Además, `bash -n scripts/ps5-demo/run-source-public-qa.sh` y `./node_modules/.bin/tsc -p examples/ps5/tsconfig.json --noEmit` terminan con exit 0.

## Bloqueos

### PS5-API-CLIP-NOLAYER-POSITION

- **Variante:** sin layer.
- **Esperado:** centros de color de los tres bloques en x=42/102/162 después de `translateX(-60)`.
- **Observado:** [93, 59, 143] (púrpura), [47, 140, 119] (verde) y [9, 9, 9] (fondo) en lugar de azul/púrpura/verde; `outsideInk=639`, lo que evidencia bleed fuera del viewport de 220 px.
- **Resultado:** falla posición/recorte; la selección transformada no puede usarse como contrato de carrusel fiel.

### PS5-API-CLIP-LAYER-IMAGE

- **Variantes:** con layer y con layer + overlay abierto/cerrado.
- **Esperado:** Ghost aporta píxeles en x=198..238 después de la transformación.
- **Observado:** las posiciones de color y el límite exterior sí se ven correctos (`outsideInk=0`), pero el detector informa `imageBuckets=1` y no observa la imagen entrante (`enteringImageVisible=false`). Tras abrir/cerrar el diálogo el resultado se mantiene.
- **Resultado:** falla la entrada de imagen requerida aunque el recorte geométrico aparente estar contenido.

## Evidencia secundaria y límites

- La sonda de fila de 24 tarjetas también termina vacía después de la navegación/ciclo de overlay (`runtimeRow.status=pending-row-empty-after-overlay-lifecycle`, `visibleAfterNavigation=false`). No se atribuye este resultado únicamente al overlay; es evidencia secundaria del mismo gate pendiente.
- Se observaron imágenes locales y un estado alpha intermedio; el crossfade completo no está validado porque el reset del target del fixture fue imperfecto (`crossfadeVisualFinal=false`).
- El leaf transform/filter/clip test de root pasó 8 assertions, pero no prueba el row de 24 tarjetas y no invalida estos bloqueos.
- La causa interna exacta sigue sin diagnóstico. No se afirma que `ScrollHandle`, el compositor o toda la API pública sean imposibles; solo que este patrón público de posición/recorte no alcanzó el criterio.

## Runtime nativo y paquete

- El bridge de source-public observó el runtime TypeScript del repositorio con el adaptador de QA; no se instrumentó qué path nativo exacto cargó.
- El candidato instalado `node_modules/@vexart-native/darwin-arm64/libvexart.dylib`, el candidato `target/release/libvexart.dylib` referido por el gate y el binario listado en el snapshot dist comparten el SHA-256 `644b20a1bf72a9c91df2336dc7c7d3357a4bb0054e2966e6931f885d8d600d07`; esto verifica coincidencia de hash, no el path cargado.
- El consumidor empaquetado se instaló en `/tmp/vexart-ps5-package-review-1788887759-35479` con tarball y native package. Typecheck pasó y el check de singleton fue `true,true`; el smoke Kitty sintético hizo `ready/destroy=1` sin error. El PTY sintético terminó con exit 0, pero emitió 7 errores `-7 EAGAIN`, por lo que no es un pass. En una terminal sin Kitty se obtuvo el rechazo esperado.
- Kitty físico y performance final no se ejecutaron.
- No se recompiló native en este trabajo; la evidencia usa el snapshot beta.26 y el binario existente.

## Próximo paso y regla de parada

El bloqueo de API pública del probe mínimo de estilos permanece cerrado para el
caso acotado demostrado por la repetición y sus logs. La suite funcional, el
engine final y las capturas requeridas pasan en el alcance local; los assets están
aceptados y no requieren polish. No queda un blocker de API ni engine gate activo;
root inspeccionó P1 y el narrow P2 del alias `boxShadow`.

El caso de composición vacía con crop offset no cero bajo transform/layer se
conserva como contexto separado: el retained RGB específico pasa, pero no se
añade fallback ni se afirma causalidad retrospectiva. La opacidad conserva su
alcance TS-only; ninguna de estas notas se eleva a blocker de API adicional.
