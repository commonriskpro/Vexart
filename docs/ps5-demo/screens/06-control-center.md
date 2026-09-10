# PS5-CONTROL — Centro de control

**ID:** `PS5-CONTROL`. **Owner:** Control center. **Tipo:** overlay inferior sobre cualquier pantalla lista.

**Phase 0:** completa y aceptada por root, incluida la procedencia/cobertura del catálogo de 24 juegos. **Phase 1:** el fix de posición/recorte y el baseline de textura se conservan como evidencia; el historial está en [`api-blockers.md`](../api-blockers.md), [`validation.md`](../validation.md) y [`gpu-texture-limit-blocker.md`](../gpu-texture-limit-blocker.md). **Estado de implementación:** Control Center y sus ramas locales están implementados e integrados en el host. Su integración local de foco y overlays está cubierta por la QA source final; siguen pendientes la fidelidad exacta/manual de filtros blur del nodo raíz o descendientes y transformaciones complejas; no se afirma un recorrido visual completo ni un PS5 completo.

## Referencia, entrada y geometría

- Fuente visual: [copia local del mock aprobado](../references/approved-home-control-center.png), más [referencia oficial del centro de control](https://www.playstation.com/es-es/support/games/customize-ps5-control-center/). La procedencia original está indicada en `scope.md` y el QA visual final sigue en progreso.
- Entrada: `F1` desde cualquier pantalla lista, o acción de la aplicación que abre `overlayStack` con `returnTo` propio.
- Retorno: `F1`/`Escape` cierra la entrada superior y restaura su `returnTo.entry`, `parentOverlayId` y `focusId`; abrir un panel hijo no sustituye el contexto de la pantalla base.
- Geometría: scrim full-bleed sobre la pantalla subyacente; panel inferior desde y≈932 con h≈148 en 1920×1080, y≈621/h≈99 en 1280×720. La fila por defecto ocupa exactamente diez tarjetas centradas, con separación uniforme y foco blanco.

## Controles

El orden inicial es exactamente: **Inicio, Selector, Notificaciones, Game Base, Música, Sonido, Micrófono, Accesorios, Perfil, Alimentación**. No se añade Red ni Ajustes como tarjeta por defecto. Descargas se alcanzan desde Notificaciones o su panel hijo.

| Control visible | Efecto | Resultado |
|---|---|---|
| **Inicio** | Real local | Cierra el overlay y va a `PS5-HOME`, conservando sesión/selección. |
| **Selector** | Real local | Abre `PS5-SWITCHER` como panel hijo. |
| **Notificaciones** | Real local | Abre `PS5-NOTIFICATIONS`; su panel incluye la pestaña Descargas. |
| **Game Base** | Real local | Abre `PS5-GAMEBASE`. |
| **Música** | Simulado | Abre panel de selección de pista, anterior/siguiente, reproducir/pausar y volumen local; no reproduce audio real. |
| **Sonido** | Simulado | Abre slider de volumen, mute y salida TV/auriculares simulada; no controla audio del host. |
| **Micrófono** | Simulado | Abre mute y nivel visual; no accede al micrófono. |
| **Accesorios** | Simulado | Muestra mando/dispositivo, conectado/desconectado y batería; no consulta hardware. |
| **Perfil** | Real local | Abre `PS5-PROFILE`. |
| **Alimentación** | Real local | Abre `PS5-POWER` para confirmar una simulación local. |
| **Opciones** (`F2`) | Real local | Despacha `setControlOrder(order)`/`setControlVisibility(id, visible)` con tipos `ControlCardId`; las diez funciones contractuales siguen accesibles aunque cambie el orden. |
| `Escape` | Real local | Cierra la capa superior; si no hay hijo, cierra el centro. |
| `F1` | Real local | Alterna abrir/cerrar el centro, sin cambiar la pantalla subyacente. |
| `Ctrl+C` | Real | Sale globalmente; no es acción de un panel de texto. |

## Foco, scroll y estados

- Foco inicial: última tarjeta activa o **Inicio** en la primera apertura. El borde/halo activo es blanco, no cyan.
- La fila de tarjetas hace scroll horizontal dentro del panel inferior; los paneles Música/Sonido/Micrófono/Accesorios usan scroll vertical solo si su contenido supera el viewport.
- Un panel hijo conserva su propia entrada `OverlayEntry` y retorna al centro con foco en la tarjeta que lo abrió.
- Carga/error: los paneles actuales usan estado local y no tienen carga remota ni una rama de error con `Reintentar`; ese criterio permanece explícito para QA/futuras fallas simuladas y no se cuenta como entregado.

## Criterios de aceptación

- [ ] La fila inicial coincide en orden y número con el mock aprobado.
- [ ] Cada tarjeta abre su panel/acción definido y solo modifica estado local.
- [ ] Notificaciones y descargas se atribuyen a este propietario como UI, pero actualizan el estado/base compartido.
- [ ] F1/Escape cierran correctamente capas anidadas y restauran el contexto exacto.
- [ ] No existe tarjeta Red por defecto ni se afirma audio, micrófono o hardware real.
