# PS5-BOOT — Arranque y selección de usuario

**Owner:** Base compartida. **Tipo:** pantalla raíz, no overlay.

**Phase 0:** completa y aceptada por root, incluida la procedencia/cobertura del catálogo de 24 juegos. **Phase 1:** el fix de posición/recorte y el baseline de textura se conservan como evidencia; el historial está en [`api-blockers.md`](../api-blockers.md), [`validation.md`](../validation.md) y [`gpu-texture-limit-blocker.md`](../gpu-texture-limit-blocker.md). **Estado de implementación:** la base compartida y la pantalla Boot/usuarios están implementadas e integradas en el host. La QA source final cubre su flujo local; siguen pendientes la fidelidad exacta, aprobación visual manual y gates físico/empaquetado; no se afirma un PS5 completo.

## Referencia, entrada y geometría

- Fuente visual: variante de arranque oscura del layout compartido en [`visual-motion-assets.md`](../visual-motion-assets.md#adaptación-de-tamaño); la fuente primaria de estructura es la [guía rápida de PS5](https://www.playstation.com/content/dam/global_pdc/en/corporate/support/manuals/ps5-docs/1000b-digital-edition/CFI-10XXB_PS5_Quick_Start_Guide_EN_MEA.pdf).
- Entrada: `boot.status=loading`, sin usuario activo; salida confirmada a `PS5-HOME` con `activeUserId`.
- Retorno: `Escape` selección→splash; desde home, cambio de usuario vuelve a este selector con el usuario candidato y no hereda foco de home.
- Geometría: canvas full-bleed oscuro; logo centrado arriba del panel; tarjetas de usuario en fila/rejilla centrada con mínimo 130×130 a 1920×1080 y escala proporcional a 1280×720; footer compartido abajo.

## Flujo

- Entrada: proceso inicia en `boot.status = loading`, sin usuario activo.
- Salidas: confirmar usuario → `PS5-HOME`; `Escape` desde usuario vuelve al splash; `Ctrl+C` termina el demo.
- El splash avanza a selección de usuario con una demora local determinista; no consulta el sistema anfitrión.

## Controles

| Control | Efecto | Resultado |
|---|---|---|
| Splash/continuar | Simulado | Completa boot y muestra usuarios. |
| Tarjeta de usuario | Real local | Mueve foco y marca usuario candidato. |
| `Enter`/`Space` sobre usuario | Real local | `user/select`, fija `activeUserId` y entra a inicio. |
| `Invitado` | Simulado | Crea/selecciona sesión invitada local sin persistencia externa. |
| `F2` | Real local | Abre opciones de la tarjeta: seleccionar/cambiar nombre visual local. |
| `Escape` | Real local | Desde selección vuelve al splash; desde splash no-op. |
| `F1` | No disponible | Centro de control no existe antes de tener usuario activo. |
| `Ctrl+C` | Real | Sale mediante `createApp({ quit: ["ctrl+c"] })`; no es atajo del formulario. |

## Foco, scroll y estados

- Foco inicial: primer usuario; se conserva el último usuario enfocado mientras no se confirme.
- Sin scroll en splash; si hay más usuarios que el viewport, la rejilla hace scroll vertical manteniendo el foco visible.
- Loading: logo/splash y skeleton de tarjetas con geometría estable.
- Error/asset: si un avatar falta, se usa fallback degradado con iniciales. El boot actual solo tiene carga local y no expone un botón `Reintentar`; cualquier fallo simulado/reintento queda como criterio pendiente, no como comportamiento ya validado.
- Al volver desde `home` por cambio de usuario, se restaura la selección de usuario, no el foco de home.

## Criterios de aceptación

- [ ] Usuario activo siempre está definido antes de `PS5-HOME`.
- [ ] F1 no abre un overlay en boot.
- [ ] Reposo/reinicio/apagado no se ejecutan desde esta pantalla ni afectan al host.
