# PS5-GAME-HUB — Centro del juego

**Owner:** Inicio/juegos. **Tipo:** pantalla de detalle por `GameId`.

**Phase 0:** completa y aceptada por root, incluida la procedencia/cobertura del catálogo de 24 juegos. **Phase 1:** el fix de posición/recorte y el baseline de textura se conservan como evidencia; el historial está en [`api-blockers.md`](../api-blockers.md), [`validation.md`](../validation.md) y [`gpu-texture-limit-blocker.md`](../gpu-texture-limit-blocker.md). **Estado de implementación:** Game Hub está implementado e integrado en el host. Su recorrido local está cubierto por la QA source final; siguen pendientes la fidelidad exacta/manual de filtros blur del nodo raíz o descendientes y transformaciones complejas; no se marca como completo ni como PS5 completo.

## Composición visual

- Mantener el `hero` full-bleed del juego como fondo, con logo/CTA sobre la imagen y cards de actividad en la zona inferior; no convertirlo en una caja independiente.
- El foco activo sigue siendo blanco; el accent del juego solo colorea contenido secundario.

## Referencia, entrada y geometría

- Fuente visual: mismo mock aprobado y layout full-bleed de [`visual-motion-assets.md`](../visual-motion-assets.md#referencias-y-objetivo); cards de actividad del mock son la referencia del hub.
- Entrada: `PS5-HOME`, `PS5-LIBRARY` o `PS5-SWITCHER` con `selectedGameId` válido.
- Retorno: `Escape` vuelve al `NavigationEntry` de origen; F1/overlays vuelven al hub con la actividad y foco anteriores.
- Geometría: fondo full-bleed; logo/metadata en región x125/y350; CTA x125/y557; actividades/trofeos/noticias en cards desde y663, cada una dentro de la fila visible y con scroll vertical solo para detalle.

## Flujo

- Entrada: `PS5-HOME`, `PS5-LIBRARY` o `PS5-SWITCHER` con `selectedGameId`.
- Salidas: `Jugar` → `PS5-LAUNCH`; Trofeos → `PS5-PROFILE`; Galería → `PS5-GALLERY`; `Escape` vuelve al origen; `F1` abre control.

## Controles

| Control | Efecto | Resultado |
|---|---|---|
| `Jugar`/`Iniciar` | Real local | Crea `gameSession` y abre loading simulado. |
| Activity card | Real local | Selecciona actividad y muestra detalle/progreso local. |
| Trophy card | Real local | Abre perfil filtrado por el juego y trofeos. |
| Galería | Real local | Abre galería filtrada por el juego. |
| `F2`/Options | Real local | Menú: lista local, cerrar hub, abrir biblioteca. |
| Izquierda/derecha | Real local | Desplaza la fila de actividades/acciones. |
| Arriba/abajo/PageUp/PageDown | Real local | Scroll vertical del hub; el foco se mantiene visible. |
| `Escape` | Real local | Vuelve a la pantalla de origen y restaura juego/foco. |
| `F1` | Real local | Abre control center; retorno exacto al control del hub. |
| `Ctrl+C` | Real | Sale globalmente. |

## Foco, scroll y estados

- Foco inicial: `Jugar` si está instalado; si no, `Descargar`/estado de instalación.
- Las actividades/trofeos usan scroll vertical; el fondo full-bleed no se desplaza fuera de su viewport.
- Carga/error: el catálogo se resuelve localmente, sin skeleton de red en la vista actual. Si falta el `GameId`, el panel `No se pudo cargar el hub` ofrece `Reintentar` y `Volver`; la validación de ese estado sigue pendiente.

## Criterios de aceptación

- [ ] Un juego descargable no muestra `Jugar` como si estuviera instalado; ofrece el estado de descarga definido.
- [ ] El regreso conserva `homeIndex` y foco.
- [ ] Los botones de actividad/trofeo/galería cambian de pantalla con datos del mismo `GameId`.
