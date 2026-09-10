# PS5-STORE-MEDIA — Store y multimedia local

**Owner:** Store/media. **Tipo:** catálogo visual con límites explícitos.

**Fase 0:** completa y aceptada por root, incluida la procedencia/cobertura del catálogo de 24 juegos. **Phase 1:** detenida por la limitación confirmada de posición/recorte con transformaciones. **Estado de implementación:** no iniciada y bloqueada hasta una decisión, un encargo de resolución en Vexart y un nuevo gate aceptado.

## Referencia, entrada y geometría

- Fuente visual: pestañas Juegos/Contenido multimedia de la [guía rápida oficial](https://www.playstation.com/content/dam/global_pdc/en/corporate/support/manuals/ps5-docs/1000b-digital-edition/CFI-10XXB_PS5_Quick_Start_Guide_EN_MEA.pdf) y patrón de catálogo de [`visual-motion-assets.md`](../visual-motion-assets.md#adaptación-de-tamaño).
- Entrada: pestaña `Contenido multimedia` desde Inicio o acción Store; catálogo es local.
- Retorno: `Escape` vuelve a Inicio/origen; `Abrir biblioteca` mantiene `GameId` y origen.
- `query`, pestaña, filtro y orden son estado de navegación transitorio de esta pantalla; solo el `returnTo`/foco útil se conserva al volver. No hay favoritos ni listas de deseos persistentes en el alcance.
- Geometría: barra superior con pestañas; filtros/consulta en fila secundaria; grid de cards con scroll vertical, cards de proporción estable y detalle en panel hijo.

## Controles

| Control | Efecto | Resultado |
|---|---|---|
| Pestañas Juegos/Contenido multimedia | Real local | Cambia catálogo local y entrada desde Inicio. |
| Buscar | Real local | Filtra tarjetas por texto; sin Ctrl+C dentro del campo. |
| Género/filtro/orden | Real local | Filtra/ordena catálogo local. |
| Tarjeta de producto/media | Real local | Abre detalle de ficha. |
| Comprar | No disponible | Explica que no hay PSN/pagos y no muta dinero/host. |
| Reproducir tráiler/streaming | No disponible | Muestra placeholder de media no disponible; no reproduce vídeo/audio. |
| Abrir biblioteca | Real local | Va a `PS5-LIBRARY` con `GameId` seleccionado. |
| `F2` | Real local | Opciones de ficha/abrir biblioteca/volver. |
| `Escape` | Real local | Vuelve a Inicio u origen. |
| `F1` | Real local | Abre centro de control. |
| `Ctrl+C` | Real | Sale globalmente. |

## Foco, scroll y estados

- Foco inicial: tab y tarjeta de origen; luego primera tarjeta.
- Grid con scroll vertical; filtros no cambian la columna de foco inesperadamente.
- Loading conserva tabs y skeleton; error ofrece `Reintentar`/`Volver`.
- Empty ofrece `Limpiar filtros`; media sin recurso usa card fallback.

## Criterios de aceptación

- [ ] Comprar, streaming y reproducción siempre están rotulados no disponibles.
- [ ] Consulta, pestaña, filtro y orden son estado de navegación local de la pantalla; no se inventa persistencia de favoritos ni listas de deseos.
- [ ] El regreso desde detalle restaura card y scroll.
