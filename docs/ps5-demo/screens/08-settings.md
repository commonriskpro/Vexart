# PS5-SETTINGS — Ajustes, almacenamiento y accesibilidad

**Owner:** Ajustes. **Tipo:** pantalla de configuración.

**Fase 0:** completa y aceptada por root, incluida la procedencia/cobertura del catálogo de 24 juegos. **Phase 1:** detenida por la limitación confirmada de posición/recorte con transformaciones. **Estado de implementación:** no iniciada y bloqueada hasta una decisión, un encargo de resolución en Vexart y un nuevo gate aceptado.

## Referencia, entrada y geometría

- Fuente visual: [ajustes de accesibilidad oficiales](https://www.playstation.com/es-es/support/hardware/ps5-accessibility-settings/) y patrón de panel vertical compartido en [`visual-motion-assets.md`](../visual-motion-assets.md#adaptación-de-tamaño).
- Entrada: barra superior/Inicio o `Ajustes` desde un panel; se guarda `returnTo` y foco de categoría.
- Retorno: `Escape` sube de subpantalla a categorías y luego al origen; F1 abre control center sin perder la clave enfocada.
- Geometría: barra superior x80/y42; columna de categorías ~320 px a la izquierda; panel de controles a la derecha, ancho restante, scroll vertical y sliders en línea.

## Controles

| Control | Efecto | Resultado |
|---|---|---|
| Categoría Sistema | Real local | Abre preferencias de sistema del demo. |
| Pantalla y sonido / brillo | Simulado | Cambia brillo/contraste de la representación, no el monitor del host. |
| Accesibilidad / Reducir movimiento | Real local | Actualiza `settings.reduceMotion` y desactiva scale/spring/pulse. |
| Accesibilidad / Alto contraste | Real local | Cambia la paleta visual local y foco reforzado. |
| Accesibilidad / Tamaño del texto | Real local | Cambia escala small/default/large dentro de mínimos legibles. |
| Volumen | Simulado | Cambia indicador local; no emite ni silencia audio del host. |
| Red | Simulado | Alterna estado local; no abre sockets. |
| Almacenamiento | Real local | Lista uso/capacidad, cancela descargas o despacha `uninstallGame(gameId)` sobre el modelo local; no borra archivos del host. |
| Usuarios y cuentas | Real local | Vuelve a selección de usuario o cambia `activeUserId` local. |
| Toggle/checkbox/select/slider | Real local | Escribe la clave tipada en `SettingsState` y conserva foco. |
| Restablecer ajustes | Real local | Confirmación; restablece defaults del demo, no configuración del sistema. |
| `F2` | Real local | Opciones de categoría/valor, incluyendo reset cuando corresponda. |
| `Escape` | Real local | Vuelve a subcategoría, luego a origen/centro de control. |
| `F1` | Real local | Abre control center sobre la configuración. |
| `Ctrl+C` | Real | Sale globalmente; no se usa como shortcut de formulario. |

## Foco, scroll y estados

- Foco inicial: última categoría/clave enfocada; fallback a primera categoría.
- Scroll vertical por categorías y contenido; sliders usan izquierda/derecha sin cambiar de fila.
- Loading: skeleton de panel conserva label/control.
- Error: mensaje local y `Reintentar`; si storage no está disponible, mostrar datos de fallback sin tocar disco del host.

## Criterios de aceptación

- [ ] La UI de Almacenamiento pertenece a este propietario, pero `storage`, instalaciones y descargas provienen del store/base compartido y se actualizan mediante acciones tipadas.
- [ ] Reduce Motion modifica todas las transiciones declaradas por el demo.
- [ ] Reposo/reinicio/apagado se ofrecen desde Alimentación, no ejecutan acciones del ordenador anfitrión.
