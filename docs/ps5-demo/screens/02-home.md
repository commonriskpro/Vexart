# PS5-HOME — Inicio de juegos y carrusel

**Owner:** Inicio/juegos. **Tipo:** pantalla principal.

**Phase 0:** completa y aceptada por root, incluida la procedencia/cobertura del catálogo de 24 juegos. **Phase 1:** el fix de posición/recorte y el baseline de textura se conservan como evidencia; el historial está en [`api-blockers.md`](../api-blockers.md), [`validation.md`](../validation.md) y [`gpu-texture-limit-blocker.md`](../gpu-texture-limit-blocker.md). **Estado de implementación:** la ruta Home de identidad/traslación pasa source-public en 1280/1920 con 2 tests, 48 aserciones y recorrido completo de 26 tiles. El módulo está integrado en el host; filtros blur del nodo raíz o descendientes, y transformaciones complejas conservan captura completa, por lo que la fidelidad exacta y la aprobación visual/manual siguen pendientes. No se afirma un PS5 completo, no se reduce la escena, no se añade tiling genérico ni se adopta un workaround adicional o una elevación artificial de límites.

## Composición visual

- Fondo `hero` a pantalla completa con scrim/gradiente; no existe un contenedor hero separado.
- Barra superior aproximada (1920×1080): x=80, y=42. Fila de juegos en y=120: tiles normales 130×130, seleccionado 172×172, gap 14; conserva recorte horizontal.
- Logo/metadatos del juego en x=125, y=350, ancho aproximado 460; CTA `Jugar` x=125, y=557, 243×59. Actividades desde y=663 con cards aproximadas 540×225 y gap 16.
- El centro de control es el scrim/panel inferior desde y≈932, h≈148; se superpone sin cambiar el fondo.

## Referencia, entrada y geometría

- Fuente visual: [copia local del mock aprobado](../references/approved-home-control-center.png) y [guía rápida oficial](https://www.playstation.com/content/dam/global_pdc/en/corporate/support/manuals/ps5-docs/1000b-digital-edition/CFI-10XXB_PS5_Quick_Start_Guide_EN_MEA.pdf); la procedencia original está indicada en `scope.md` y el QA visual final sigue en progreso.
- Entrada: `PS5-BOOT` con usuario activo, o retorno de `PS5-CONTROL`/otras pantallas con `NavigationEntry`.
- Retorno: overlays restauran pantalla, `GameId`, índice y foco; una pantalla secundaria vuelve a su origen y no reinicia el carrusel.
- Geometría: usar los anchors de referencia de [`visual-motion-assets.md`](../visual-motion-assets.md#tokens-ps5-específicos): barra x80/y42, fila cuadrada y120, logo x125/y350, CTA x125/y557, activities y663 y panel inferior y932.

## Flujo

- Entrada: `PS5-BOOT` con `activeUserId`; regreso desde overlays conserva `selectedGameId`, `homeIndex` y foco.
- Salidas: tarjeta/juego → `PS5-GAME-HUB`; Biblioteca → `PS5-LIBRARY`; Ajustes/Perfil/Buscar → sus pantallas; `F1` → `PS5-CONTROL`.

## Controles

| Control | Efecto | Resultado |
|---|---|---|
| PlayStation Store | Real local | Tarjeta utilitaria; abre `PS5-STORE-MEDIA` sin cambiar `selectedGameId`. |
| Juego seleccionado | Real local | `home/select`; cambia fondo full-bleed, logo, metadata y acciones al `GameId`. |
| Biblioteca de juegos | Real local | Tarjeta utilitaria; abre `PS5-LIBRARY` sin crear un juego ficticio. |
| Izquierda/derecha | Real local | `home/move(-1/+1)` entre todas las tarjetas de `homeTiles`, clamp en extremos y desplaza fila. |
| `Enter`/`Space` en tarjeta de juego | Real local | Abre el hub del juego seleccionado; la CTA `Jugar` es la ruta directa de lanzamiento. |
| `Enter`/`Space` en tarjeta utilitaria | Real local | Abre Store o Biblioteca según `HomeUtilityId`. |
| `Jugar` | Real local | Si `installed=true`, llama `startGame` y abre `PS5-LAUNCH` directamente. |
| `Descargar` | Simulado | Para un juego no instalado, crea/activa descarga local; al completar cambia catálogo/storage/notificaciones. |
| `F2` | Real local | Menú contextual: abrir hub, añadir/quitar lista local, ver detalles. |
| `Juegos`/`Contenido multimedia` | Real local | Contenido multimedia va a `PS5-STORE-MEDIA`; Juegos devuelve a este inicio. |
| Buscar | Real local | Abre `PS5-LIBRARY` con campo de consulta enfocado. |
| Ajustes/Perfil | Real local | Entra a `PS5-SETTINGS` o `PS5-PROFILE`, con retorno a juego/foco. |
| `F1` | Real local | Abre/cierra el centro de control sin cambiar la pantalla base. |
| `Escape` | Real local | Vuelve al usuario/boot solo desde una acción explícita de cambio; en home normal no-op. |
| `Ctrl+C` | Real | Sale globalmente; nunca se usa para editar texto. |

## Foco, scroll y estados

- Foco visual activo: borde blanco/halo blanco; no usar cyan como color de foco.
- Foco inicial: juego seleccionado; dentro de la composición principal, orden `Jugar → Actividades → Trofeos → Galería → Opciones`.
- Fila horizontal de tarjetas `[PlayStation Store, 24 juegos, Biblioteca de juegos]`: sin wrap; las tarjetas utilitarias no alteran el juego seleccionado y el elemento enfocado queda visible/centrado dentro del viewport.
- las teclas `Home`/`End` van al primer/último juego; inputs rápidos re-targetean la animación sin cola.
- Carga/error: el catálogo se resuelve localmente, sin skeleton de red en la vista actual. Si falta hero, cover o logo, se usa fallback degradado/accent y se conserva título/ID; Home no expone hoy un botón de reintento de asset, por lo que ese criterio queda pendiente de QA y no se cuenta como entregado.

## Criterios de aceptación

- [ ] El recorrido `1 → 24 → 1` funciona con inversión durante la animación, sin perder las tarjetas utilitarias de Store/Biblioteca en los extremos.
- [ ] Fondo y textos siempre corresponden al último `GameId`.
- [ ] `Jugar` lanza directamente los instalados y `Descargar` inicia la simulación para los no instalados.
- [ ] F1 cierra/restaura el overlay sin perder foco ni scroll.
