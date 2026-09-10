# PS5-POWER — Alimentación simulada

**Owner:** Base compartida. **Tipo:** overlay de confirmación y pantalla de transición.

**Phase 0:** completa y aceptada por root, incluida la procedencia/cobertura del catálogo de 24 juegos. **Phase 1:** el fix de posición/recorte y el baseline de textura se conservan como evidencia; el historial está en [`api-blockers.md`](../api-blockers.md), [`validation.md`](../validation.md) y [`gpu-texture-limit-blocker.md`](../gpu-texture-limit-blocker.md). **Estado de implementación:** la alimentación simulada y su overlay están implementados e integrados en el host. Sus recorridos locales están cubiertos por la QA source final; siguen pendientes la fidelidad exacta/aprobación visual manual y las puertas física, empaquetada y de rendimiento; no se afirma un PS5 completo.

## Referencia, entrada y geometría

- Fuente visual: tarjeta Alimentación del mock aprobado y panel de confirmación del layout compartido; no se afirma una captura oficial adicional no verificada.
- Entrada: Alimentación desde la décima tarjeta de `PS5-CONTROL`, con `returnTo` propio.
- Retorno: Cancelar/Escape cierra confirmación y restaura centro/foco; Reiniciar vuelve a `PS5-BOOT`; Off simulated queda en pantalla local con `Relanzar demo`.
- Geometría: overlay modal centrado sobre scrim full-bleed, ancho ~620 px en 1920×1080 y escala proporcional en 1280×720; botones verticales con Cancelar enfocado inicialmente.

## Controles

| Control | Efecto | Resultado |
|---|---|---|
| Modo reposo | Simulado | Pasa a `powerMode = rest`, muestra estado de demo y permite volver a `on`. |
| Reiniciar | Simulado | Muestra loading, reinicia store/boot local y vuelve a selección de usuario; no reinicia proceso anfitrión. |
| Apagar | Simulado | Pasa a `off-simulated`, muestra pantalla de apagado del demo y ofrece relanzar localmente. |
| Despertar/Reanudar | Simulado | Despacha `wakePower()` solo desde `rest`, devuelve `powerMode` a `on` y restaura la pantalla o la única sesión simulada; desde `off-simulated` no actúa. |
| Relanzar demo | Simulado | Despacha `relaunchDemo()`, vuelve a `PS5-BOOT` con `powerMode = on`, sesión cerrada y selección de usuario pendiente; conserva settings/catalog/storage locales y no relanza procesos reales. |
| Confirmar | Simulado | Ejecuta solo `power/complete` en el store. |
| Cancelar | Real local | `power/cancel`, cierra confirmación y restaura foco/origen. |
| `Escape` | Real local | Cancela el nivel superior; nunca confirma. |
| `F1` | Real local | Cierra/abre control center según capa, sin ejecutar power. |
| `F2` | Real local | Abre opciones de la tarjeta; no añade operación del host. |
| `Ctrl+C` | Real | Sale globalmente; limpia estado de simulación en memoria. |

## Foco, scroll y estados

- Foco inicial: `Cancelar` al abrir confirmación; la acción destructiva nunca queda preseleccionada sin confirmación.
- Sin scroll en confirmación; mensaje de transición cabe en 1920×1080 y 1280×720.
- Loading: reinicio/apagado muestran progreso o estado local determinista. No existe hoy una rama de error con `Reintentar`; ese criterio de fallo simulado queda pendiente de QA y no se cuenta como entregado.
- En `off-simulated`, solo una acción local `Relanzar demo` devuelve a boot; no se escribe ni ejecuta nada en el host.

## Criterios de aceptación

- [ ] Reposo/reinicio/apagado, despertar desde reposo y relanzamiento desde `off-simulated` están cubiertos por la base compartida y Phase 2.
- [ ] Ninguna acción de este módulo llama APIs de OS, terminal, FFI o procesos.
- [ ] Cancelar siempre restaura origen, returnTo y foco.
