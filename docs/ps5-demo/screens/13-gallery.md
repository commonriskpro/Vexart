# PS5-GALLERY — Galería local

**Owner:** Store/media. **Tipo:** rejilla/viewer de media local.

**Fase 0:** completa y aceptada por root, incluida la procedencia/cobertura del catálogo de 24 juegos. **Phase 1:** detenida por la limitación confirmada de posición/recorte con transformaciones. **Estado de implementación:** no iniciada y bloqueada hasta una decisión, un encargo de resolución en Vexart y un nuevo gate aceptado.

## Referencia, entrada y geometría

- Fuente visual: layout de grid/panel compartido de [`visual-motion-assets.md`](../visual-motion-assets.md#adaptación-de-tamaño); no se afirma una captura oficial no verificada para esta pantalla.
- Entrada: Galería desde hub, Store/media o control local; el filtro y item de origen se conservan.
- Retorno: `Escape` cierra viewer y vuelve al thumbnail/scroll; segunda pulsación vuelve al origen; F1 abre overlay sin perder item.
- Geometría: tabs arriba; grid de thumbnails de 3–5 columnas según ancho; viewer full-bleed dentro del canvas con contador y acciones en footer.
- Colección: conjunto fijo derivado del catálogo (`cover`, `hero` y `titleScreen` por juego), sin capturas, vídeos, favoritos ni borrado. `filter` y `selectedIndex` son estado transitorio local de esta pantalla; solo el `returnTo`/foco útil se conserva al salir.

## Controles

| Control | Efecto | Resultado |
|---|---|---|
| Pestañas Todos/Juego actual | Real local | Filtra la colección derivada del catálogo; no descarga ni persiste media. |
| Thumbnail | Real local | Enfoca/abre viewer. |
| `Enter`/`Space` | Real local | Abre la imagen seleccionada en viewer. |
| Izquierda/derecha | Real local | Anterior/siguiente dentro del viewer. |
| `F2` | Real local | Opciones de item: abrir, cambiar filtro o volver. |
| `Escape` | Real local | Cierra viewer y luego vuelve al origen. |
| `F1` | Real local | Abre centro de control sin perder item. |
| `Ctrl+C` | Real | Sale globalmente. |

## Foco, scroll y estados

- Foco inicial: item origen si existe; fallback primera thumbnail.
- Grid con scroll vertical; viewer no hace scroll y mantiene contador/ID.
- Loading: skeleton de thumbnails; empty/error: mensajes y `Reintentar`/`Volver`.
- Asset faltante usa el fallback visual común con título/ID; no se ofrece reproducción de vídeo.

## Criterios de aceptación

- [ ] Siguiente/anterior envuelve solo dentro de la colección visible definida, no cambia de pantalla.
- [ ] La colección es reproducible desde el catálogo y filtro/índice se reinician o restauran solo dentro del retorno de esta pantalla.
- [ ] Cerrar viewer restaura thumbnail y posición.
