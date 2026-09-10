# PS5-SWITCHER — Selector de juegos recientes

**Owner:** Control center. **Tipo:** overlay/pantalla secundaria.

**Phase 0:** completa y aceptada por root, incluida la procedencia/cobertura del catálogo de 24 juegos. **Phase 1:** el fix de posición/recorte y el baseline de textura se conservan como evidencia; el historial está en [`api-blockers.md`](../api-blockers.md), [`validation.md`](../validation.md) y [`gpu-texture-limit-blocker.md`](../gpu-texture-limit-blocker.md). **Estado de implementación:** Switcher está implementado e integrado como overlay del host. Su foco y retorno locales están cubiertos por la QA source final; siguen pendientes la fidelidad exacta/manual de filtros blur del nodo raíz o descendientes y transformaciones complejas; no se afirma un overlay visual completamente verificado ni un PS5 completo.

## Referencia, entrada y geometría

- Fuente visual: panel inferior del mock aprobado y [centro de control oficial](https://www.playstation.com/es-es/support/games/customize-ps5-control-center/); usa la misma tarjeta/foco blanco del layout compartido.
- Entrada: tarjeta `Selector` de `PS5-CONTROL`, con `returnTo` apuntando a centro y pantalla base.
- Retorno: `Escape`/F1 vuelve al centro con su tarjeta enfocada; elegir Inicio reemplaza el destino por Inicio; cerrar/resumir conserva la sesión seleccionada.
- Geometría: panel inferior; fila horizontal de recientes en cards 130–172 px cuadrados, metadata debajo en panel hijo si hace falta.
- Datos: la fila consume `recentGameIds`; hay como máximo una `gameSession` simulada activa. Seleccionar otro reciente cambia el objetivo de esa sesión, no crea sesiones independientes ni motores de juego adicionales.

## Controles

| Control | Efecto | Resultado |
|---|---|---|
| Recent game card | Real local | Despacha `selectRecentGame(gameId)` y muestra fase/progreso de la única sesión. |
| `Reanudar` | Simulado | Despacha `resumeRecentGame(gameId)`; cierra selector y devuelve a `PS5-LAUNCH` en `title`/`suspended`. |
| `Cerrar juego` | Real local | Marca sesión cerrada y vuelve a home sin matar procesos reales. |
| `Abrir hub` | Real local | Cierra selector y abre `PS5-GAME-HUB` del juego. |
| `Inicio` | Real local | Va a inicio conservando catálogo/estado. |
| Izquierda/derecha | Real local | Desplaza recientes sin wrap. |
| `Escape`/`F1` | Real local | Cierra selector y restaura centro/origen. |
| `F2` | Real local | Opciones de la tarjeta: resumir, hub, cerrar. |
| `Ctrl+C` | Real | Sale globalmente. |

## Foco, scroll y estados

- Foco inicial: sesión activa; si no existe, primer reciente.
- Scroll horizontal con recorte; PageUp/PageDown no cambian de pantalla, desplazan si hay metadata vertical.
- Estado vacío: `No hay juegos recientes` ofrece `Volver`. La vista actual no simula carga/error ni expone `Reintentar`; ese criterio queda pendiente de una falla local explícita y no se cuenta como entregado.

## Criterios de aceptación

- [ ] Seleccionar/reanudar usa `recentGameIds` y mantiene como máximo una sesión simulada; no arranca sesiones paralelas.
- [ ] Cerrar un juego simulado elimina la tarjeta y el foco va a la vecina estable.
- [ ] El cierre restaura el foco del centro de control si no se eligió Inicio.
