# PS5-LIBRARY — Biblioteca, búsqueda y listas

**Owner:** Inicio/juegos. **Tipo:** pantalla de colección.

**Fase 0:** completa y aceptada por root, incluida la procedencia/cobertura del catálogo de 24 juegos. **Phase 1:** detenida por la limitación confirmada de posición/recorte con transformaciones. **Estado de implementación:** no iniciada y bloqueada hasta una decisión, un encargo de resolución en Vexart y un nuevo gate aceptado.

## Referencia, entrada y geometría

- Fuente visual: referencia local [`references/ps5-library-gamelist-view.jpg`](../references/ps5-library-gamelist-view.jpg) (captura primaria proporcionada) y [estructura oficial de biblioteca/listas](https://www.playstation.com/es-es/support/games/create-gamelist/); completar geometría con [`visual-motion-assets.md`](../visual-motion-assets.md#adaptación-de-tamaño).
- Entrada: Inicio/Buscar o acción `Biblioteca` del catálogo; el store recibe query, tab, filter, sort y listas persistentes.
- Retorno: vuelve al origen con query/filtros/scroll; hub conserva el `GameId` seleccionado.
- Geometría: fondo full-bleed oscuro; encabezado y tabs horizontales arriba (`Tu colección`, `Instalados`, `Listas`); fila de listas destacadas debajo; rejilla de juegos a continuación con scroll vertical y foco visible. En 1280×720 la fila de listas reduce cards, no se convierte en una sidebar.

## Controles

| Control | Efecto | Resultado |
|---|---|---|
| Pestañas `Tu colección`/`Instalados`/`Listas` | Real local | Cambia `library.tab` y filtra el catálogo. |
| Campo Buscar | Real local | Actualiza `library.query` con caracteres, Backspace, flechas, Home/End y Enter; no usa Ctrl+C. |
| Filtro | Real local | Abre opciones de género/instalación y actualiza la lista. |
| Ordenar | Real local | Alterna recent/name/size; mantiene foco en el juego si sigue visible. |
| Fila/tarjeta de juego | Real local | Selecciona `GameId` y abre hub con Enter/Space. |
| `Descargar` | Simulado | Crea/activa descarga local para un juego no instalado. |
| `Jugar` | Real local | Abre `PS5-LAUNCH` solo si `installed=true`. |
| `F2` | Real local | Menú de lista: añadir/quitar de lista local, ver detalles. |
| `Escape` | Real local | Vuelve a la pantalla de origen y restaura foco. |
| `F1` | Real local | Abre control center preservando query/filtros. |
| `Ctrl+C` | Real | Sale globalmente; no es shortcut de búsqueda. |

## Foco, scroll y estados

- Foco inicial: primer resultado o el último `GameId` seleccionado si permanece en la lista.
- Scroll vertical de resultados; PageUp/PageDown mueven viewport, Home/End primer/último resultado.
- Loading conserva cabecera, tabs y campo; skeleton de filas mantiene altura.
- Empty muestra `Sin resultados`, `Limpiar filtros` y `Volver`; error muestra `Reintentar` y conserva la query.

## Criterios de aceptación

- [ ] `Instalados` muestra los 18 instalados que entregue el catálogo, sin IDs inventados.
- [ ] `Descargar` actualiza la descarga compartida; al completar, el juego aparece instalado y cambia storage/notificaciones.
- [ ] El texto no roba F1/F2/Escape/Ctrl+C ni mueve el carrusel.
