# Límite de textura GPU en Home — fix verificado en la ruta PS5

**Fecha:** 2026-09-09  
**Estado:** **resuelto para la ruta Home source-public de identidad/traslación**
en 1280×720 y 1920×1080; el gate global del demo sigue abierto para efectos,
integración y validación física.  
**API pública:** sin cambios. El fix sí incluye cambios internos en TypeScript
y native; no aumenta artificialmente los límites del dispositivo ni reduce el
diseño PS5.

## Baseline que motivó el fix

Root ejecutó el consumidor source-public aislado con:

```sh
bash scripts/ps5-demo/run-app-source.sh test tests/shell.test.tsx
```

La ejecución terminaba con **exit 134 / Abort trap: 6** al recorrer el Home.
El error nativo observado era:

```text
In Device::create_texture, label = 'vexart-offscreen-target'
Dimension X value 3233 exceeds the limit of 2048
```

Log completo versionado de esa ejecución: [`gpu-texture-limit-root.log`](../../scripts/ps5-demo/artifacts/gpu-texture-limit-root.log).
La copia original se obtuvo en `/tmp/ps5-home-texture-limit-root.log`.

Con viewport de 1280×720, el Home de 26 tiles calculaba `rowWidth=3233`; en
1920 px el ancho calculado llegaba a `4850`. Quitar únicamente la capa viewport
exterior no eliminó el abort, por lo que no se atribuye solamente a la prop o
capa explícita del viewport. La ejecución directa del worker reprodujo el mismo
fallo:

```sh
bun --conditions=browser test --preload ./solid-plugin.ts examples/ps5/tests/shell.test.tsx
```

La hipótesis de fuente era la combinación de `HomeScreen` conservando la fila
completa, la captura de un subárbol aislado y los límites solicitados con
`wgpu::Limits::downlevel_defaults()` en
`native/libvexart/src/paint/context.rs`. La ruta exacta del tamaño de target se
mantiene como evidencia causal de implementación, no como imposibilidad
universal de toda la API.

## Implementación del fix

### Límite native y seguridad del target

- `TargetRegistry` consulta los límites reales del device antes de crear el
  target y valida las dimensiones y la aritmética de readback.
- Cuando la dimensión no es válida devuelve el error existente en lugar de
  provocar el panic de `Device::create_texture`.
- No se solicitan límites superiores artificiales y no se cambia el contrato
  público.

### Captura aislada en el backend TypeScript

- El backend intersecta los bounds de captura aislada con el clip y traduce
  ese rectángulo al origen del source.
- Esta reducción de bounds solo se aplica a transformaciones identidad o de
  traslación; no se presenta como un sistema genérico de tiling.
- Un root con filtro blur o una transformación compleja conserva la captura
  completa. La paridad del glow analítico se conserva.

La estrategia evita exigir una textura única de 3233/4850 px cuando el clip
permite una captura menor, pero no afirma resolver todos los subárboles grandes:
los casos con blur o transformaciones complejas todavía requieren la QA de
dispositivo correspondiente.

## Validación disponible

- Build release de native: PASS.
- Worker native: 175 PASS, 1 ignored.
- GPU FFI: 4 PASS.
- Guard live JS: `4850×1` devuelve 0 y `2048×1` también completa correctamente;
  esto valida el guard de creación, no la apariencia del Home completo.
- `bunx tsc -p examples/ps5/tsconfig.json --noEmit`: PASS.
- Suite del engine: 487 tests PASS, 67 archivos, 1669 assertions.
- QA Home source-public: **2 PASS, 48 assertions**, recorriendo los 26 tiles a
  1280×720 y 1920×1080. Logs: [`bounded-capture-home.log`](../../scripts/ps5-demo/artifacts/bounded-capture-home.log).
- QA shell source-public: **1 PASS, 28 assertions**, sin abort de textura.
  Log: [`bounded-capture-shell.log`](../../scripts/ps5-demo/artifacts/bounded-capture-shell.log).

La ruta de captura acotada queda validada para Home en esas dos resoluciones.
No se debe convertirla en un PASS de todos los efectos GPU ni de la demo
completa. La integración de `GameHub` y `Launch` en el host sigue parcial: los
archivos fuente existen, pero el host aún no los importa/monta completamente.

## Residual y regla de gate

Este bloqueo es distinto de los bloqueos de transformación/recorte, que siguen
verificados como corregidos en la sonda de 1856 px. El fix actual valida la
ruta de identidad/traslación, pero no declara cubiertos root filters blur,
transformaciones complejas, todos los efectos GPU, el paquete, Kitty físico,
crossfade completo, rendimiento o el lifecycle completo del overlay.

**La ruta PS5 de Home queda desbloqueada; el gate global de Phase 1 continúa
pendiente** por las limitaciones residuales y la integración incompleta. No se
reduce el número de tarjetas, no se cambia el diseño PS5 y no se añade una API
pública para ocultar el problema.
