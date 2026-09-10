# PS5-PROFILE — Perfil y trofeos

**Owner:** Control center. **Tipo:** pantalla de perfil local.

**Fase 0:** completa y aceptada por root, incluida la procedencia/cobertura del catálogo de 24 juegos. **Phase 1:** detenida por la limitación confirmada de posición/recorte con transformaciones. **Estado de implementación:** no iniciada y bloqueada hasta una decisión, un encargo de resolución en Vexart y un nuevo gate aceptado.

## Referencia, entrada y geometría

- Fuente visual: referencia local [`references/ps5-profile-friends-profile.jpg`](../references/ps5-profile-friends-profile.jpg) (captura primaria proporcionada); usa foco blanco, tarjeta central oscura y fondo full-bleed del juego.
- Entrada: Perfil desde centro de control/Inicio; recibe `activeUserId` y tab/foco opcionales.
- Retorno: `Escape` vuelve al overlay/origen; cambio de usuario vuelve a `PS5-BOOT`; detalle de trofeo retorna a la misma fila y scroll.
- Geometría: panel central oscuro de ~650 px de ancho sobre fondo full-bleed; cabecera de avatar/nombre, fila de acciones, bloque de juego actual/progreso y rejilla de recientes; el centro de control queda en el borde inferior. En trofeos, mantener la misma cabecera y cambiar el cuerpo a lista vertical.

## Controles

| Control | Efecto | Resultado |
|---|---|---|
| Avatar/nombre de usuario | Real local | Selecciona perfil y muestra datos del usuario activo. |
| Cambiar usuario | Real local | Vuelve a `PS5-BOOT`/selector y conserva catálogo local. |
| Pestañas Resumen/Trofeos | Real local | Cambia `profile.tab`. |
| Fila de trofeo | Real local | Selecciona detalle; filtra por `GameId`/estado. |
| Ordenar/filtrar trofeos | Real local | Ordena por tipo, obtenido o juego dentro del perfil. |
| Abrir juego | Real local | Va al hub del juego del trofeo. |
| `F2` | Real local | Opciones de perfil: cambiar usuario, ordenar, volver. |
| `Escape` | Real local | Vuelve al origen y restaura foco. |
| `F1` | Real local | Abre control center. |
| `Ctrl+C` | Real | Sale globalmente. |

## Foco, scroll y estados

- Foco inicial: tab anterior y luego primera fila válida.
- Scroll vertical de trofeos; detalle puede usar panel lateral/overlay con retorno exacto.
- Loading: skeleton de avatar y filas.
- Empty: perfil sin trofeos muestra mensaje y `Volver`; error muestra retry local.

## Criterios de aceptación

- [ ] Trofeos y progreso provienen del `GameCatalogEntry` seleccionado.
- [ ] Cambiar usuario no deja el perfil anterior como activo.
- [ ] Volver desde detalle restaura la fila y posición de scroll.
