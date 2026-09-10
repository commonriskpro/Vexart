# PS5-GAMEBASE — Amigos, grupos y conversaciones locales

**Owner:** Control center. **Tipo:** panel social simulado.

**Fase 0:** completa y aceptada por root, incluida la procedencia/cobertura del catálogo de 24 juegos. **Phase 1:** detenida por la limitación confirmada de posición/recorte con transformaciones. **Estado de implementación:** no iniciada y bloqueada hasta una decisión, un encargo de resolución en Vexart y un nuevo gate aceptado.

## Referencia, entrada y geometría

- Fuente visual: tarjeta Game Base del mock aprobado y panel inferior compartido en [`visual-motion-assets.md`](../visual-motion-assets.md#adaptación-de-tamaño); funciones de comunicación son locales.
- Entrada: Game Base desde control center; el store recibe tab, threads y parties de la seed local.
- Retorno: `Escape` vuelve al centro/origen; perfil/juego guardan `returnTo`; enviar mensaje vuelve a la misma conversación y scroll.
- Geometría: tabs en barra superior del panel, lista de amigos/grupos a la izquierda (~420 px), detalle/conversación a la derecha con scroll vertical.

## Controles

| Control | Efecto | Resultado |
|---|---|---|
| Pestañas Amigos/Grupos/Mensajes | Real local | Cambia colección del demo. |
| Friend/profile row | Real local | Abre perfil local y detalles. |
| Invite/create party | Simulado | Crea grupo local con perfiles de demostración; no envía invitaciones. |
| Message field + Send | Simulado | Añade conversación local; no usa red ni audio. |
| Abrir juego | Real local | Abre hub del juego asociado. |
| Chat de voz/llamada | No disponible | Muestra explicación; nunca abre micrófono/audio. |
| Indicador de red | Simulado | Refleja `settings.network` local. |
| `F2` | Real local | Opciones de amigo/grupo: abrir perfil, abandonar grupo, limpiar mensaje local. |
| `Escape` | Real local | Vuelve al centro/origen y restaura foco. |
| `F1` | Real local | Abre/permite volver al control center. |
| `Ctrl+C` | Real | Sale globalmente; no es shortcut del campo de mensaje. |

## Foco, scroll y estados

- Foco inicial: tab actual y primer amigo/mensaje; el campo se enfoca explícitamente, no por flechas del panel.
- Amigos/mensajes/grupos usan scroll vertical; el campo no propaga flechas al contenedor.
- Loading: skeleton de perfiles; error: `Reintentar` local. Empty: mensajes claros por tab.

## Criterios de aceptación

- [ ] Conversaciones y grupos solo existen en el estado del demo.
- [ ] Chat de voz y comunicaciones reales aparecen como no disponibles, no como botones muertos.
- [ ] El regreso conserva tab, fila y scroll.
