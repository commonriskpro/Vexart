# PS5-NOTIFICATIONS — Notificaciones y descargas

**Owner:** Control center. **Tipo:** panel local alcanzable desde centro de control y biblioteca.

**Fase 0:** completa y aceptada por root, incluida la procedencia/cobertura del catálogo de 24 juegos. **Phase 1:** detenida por la limitación confirmada de posición/recorte con transformaciones. **Estado de implementación:** no iniciada y bloqueada hasta una decisión, un encargo de resolución en Vexart y un nuevo gate aceptado.

## Referencia, entrada y geometría

- Fuente visual: panel de tarjetas del [centro de control oficial](https://www.playstation.com/es-es/support/games/customize-ps5-control-center/) y layout vertical compartido.
- Entrada: tarjeta Notificaciones del control center; pestaña Descargas es hija del mismo panel y no una tarjeta por defecto.
- Retorno: `Escape` vuelve al control center con la tarjeta Notificaciones enfocada; `Abrir destino` guarda retorno y navega al hub/biblioteca/settings.
- Geometría: panel inferior al abrirse desde F1; al entrar a detalle, columna central ~720 px con filas de altura estable y scroll vertical.

## Controles

| Control | Efecto | Resultado |
|---|---|---|
| Pestañas Notificaciones/Descargas | Real local | Cambia la colección visible. |
| Fila de notificación | Real local | Abre detalle y marca leída al confirmar. |
| Mark read/unread | Real local | Cambia `Notification.read`. |
| Clear one/all | Real local | Elimina la notificación local tras confirmación. |
| Fila de descarga | Real local | Abre detalle de progreso y juego objetivo. |
| Pausar/Reanudar | Simulado | Cambia estado `paused`/`downloading`, sin red. |
| Cancelar | Simulado | Despacha `cancelDownload(id)`; marca `cancelled` una vez, no instala ni cambia storage y genera una sola notificación local. |
| Reintentar | Simulado | Despacha `startDownload(gameId)` y reinicia la descarga local desde `queued`; sin red. |
| Abrir destino | Real local | Navega a hub, biblioteca o settings según `target`. |
| `F2` | Real local | Opciones de item: leer, borrar, pausar/reanudar/cancelar. |
| `Escape` | Real local | Vuelve al centro de control/origen. |
| `F1` | Real local | Alterna centro de control encima del panel. |
| `Ctrl+C` | Real | Sale globalmente. |

## Foco, scroll y estados

- Foco inicial: primer item no leído o descarga activa; fallback al primer item.
- Scroll vertical; PageUp/PageDown cambian de página sin perder item.
- Loading: skeleton de filas; error: retry local y `Volver`.
- Empty: mensajes separados para sin notificaciones y sin descargas.

## Criterios de aceptación

- [ ] Completar una descarga despacha `completeDownload(id)` y, exactamente una vez, marca el juego instalado, actualiza storage y crea notificación; repetir la acción es no-op.
- [ ] Cancelar/pausar/reanudar se refleja en cualquier otra pantalla al regresar; cancelar repetido no duplica notificaciones ni altera storage.
- [ ] El propietario es Centro de control; no se duplica estado en ajustes o biblioteca.
