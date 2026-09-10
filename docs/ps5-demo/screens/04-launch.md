# PS5-LAUNCH — Lanzamiento, loading y title simulados

**Owner:** Inicio/juegos. **Tipo:** pantalla de ciclo de juego local.

**Phase 0:** completa y aceptada por root, incluida la procedencia/cobertura del catálogo de 24 juegos. **Phase 1:** el fix de posición/recorte y el baseline de textura se conservan como evidencia; el historial está en [`api-blockers.md`](../api-blockers.md), [`validation.md`](../validation.md) y [`gpu-texture-limit-blocker.md`](../gpu-texture-limit-blocker.md). **Estado de implementación:** Launch está implementado e integrado en el host. Su ciclo y foco locales están cubiertos por la QA source final; siguen pendientes la fidelidad exacta/manual de filtros blur del nodo raíz o descendientes y transformaciones complejas; no se marca como completo ni como PS5 completo.

## Referencia, entrada y geometría

- Fuente visual: layout de lanzamiento compartido en [`visual-motion-assets.md`](../visual-motion-assets.md#adaptación-de-tamaño), reutilizando `titleScreen`/`hero` del juego; el loading mantiene la composición del hub, no abre una ventana de terminal.
- Entrada: `PS5-GAME-HUB` con `gameSession.gameId`; retorno de selector/control center conserva fase y progreso.
- Retorno: cancelar vuelve al hub/origen; cerrar vuelve a home con el mismo juego seleccionado; `off-simulated` solo permite relanzar el demo.
- Geometría: fondo full-bleed; title/logo centrado en la región de marca, barra de progreso y CTA en columna izquierda x≈125; no hay scroll.

## Flujo

`PS5-GAME-HUB` llama `startGame(id)` y entra en `launching → loading → title`. El ciclo no inicia un proceso real ni ejecuta el juego.

## Controles

| Control | Efecto | Resultado |
|---|---|---|
| Autoavance de splash/loading | Simulado | Incrementa `gameSession.progress` y cambia de fase con duración determinista. |
| `Enter`/`Space` en loading | Simulado | Permite saltar al siguiente paso local, sin saltar estados inválidos. |
| `Continuar` en title | Simulado | Marca sesión `title`/`suspended` y deja una tarjeta de juego activo. |
| `Cerrar juego` | Real local | `game/close`, limpia sesión y vuelve a `PS5-HOME` conservando selección. |
| `Escape` durante loading | Real local | Cancela lanzamiento, limpia timers y vuelve al hub/origen. |
| `F1` | Real local | Abre centro de control encima del loading/title; al cerrar conserva fase/progreso. |
| `F2` | Real local | En title abre opciones; durante loading solo muestra `Cancelar`/`Volver`. |
| `Ctrl+C` | Real | Sale globalmente y limpia la sesión simulada. |

## Foco, scroll y estados

- Foco inicial: CTA válido (`Continuar` en title, `Cancelar` mientras carga).
- Sin scroll; las acciones caben en la vista y no se mueven mientras cambia el progreso.
- Loading muestra portada/titleScreen, barra/progreso y estado textual.
- Error simulado/local: `Reintentar` reinicia desde `launching`; `Cancelar` vuelve al hub. Nunca queda un timer activo al salir.
- Si falta `titleScreen`, usa `hero` como fallback y conserva título/ID.

## Criterios de aceptación

- [ ] F1 puede abrirse en todas las fases sin perder `gameSession`.
- [ ] Escape durante loading no reaparece luego como title.
- [ ] Cerrar cambia a `closed`/`idle` y no toca el proceso anfitrión.
