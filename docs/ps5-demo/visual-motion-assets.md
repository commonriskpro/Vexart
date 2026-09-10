# Visual, movimiento y contrato de assets

**Estado (2026-09-09):** diseño de Phase 0 completo y aceptado por root. La procedencia y cobertura visual del catálogo de 24 juegos (18 instalados y 6 descargables) están validadas por el worker de assets. El STOP histórico de Phase 1 sobre posición/recorte con transformaciones queda documentado y el baseline de textura de [`gpu-texture-limit-blocker.md`](gpu-texture-limit-blocker.md) queda corregido para la ruta de identidad/traslación: Home source-public pasa en 1280/1920 con 2 tests, 48 aserciones y 26 tiles. La QA source final registra 30 PASS, 0 FAIL y 345 aserciones en 5 archivos; root reporta 30 capturas GPU (15 rutas × 2 tamaños) PASS, consumidor GPU con bundle temporal PASS en ambos tamaños y store 9/67 PASS. La guard devuelve errores existentes de dimensión/readback en vez de panic y mantiene el límite habilitado de 2048 en el runtime de prueba; filtros blur del nodo raíz o descendientes, y transformaciones complejas conservan captura completa. Las vistas integradas usan tokens y UI compartidos. El crossfade fresh-keyed `0 → 1` sobre la salida opaca está implementado, pero la QA visual/fidelidad exacta, el estrés de movimiento completo, terminal física y rendimiento siguen pendientes. La validación Kitty física no puede ejecutarse mediante CUA en esta tarea y no se aplica bypass. No se aplica shrinking, tiling genérico ni workaround adicional.

## Referencias y objetivo

La dirección visual parte de la [copia local del mock aprobado del centro de control](references/approved-home-control-center.png), cuya fuente original está fuera del repo en `/Users/saturno/.codex/generated_images/01a081a5-8919-7581-9022-95ec29b64afa/exec-b3cc8e0d-3074-42d3-8f96-a8f828d3372d.png`. El worker de assets mantiene la procedencia; el QA visual/artwork final sigue pendiente.

Referencias primarias para estructura y proporciones:

- [PS5 Quick Start Guide — pantalla de inicio anotada](https://www.playstation.com/content/dam/global_pdc/en/corporate/support/manuals/ps5-docs/1000b-digital-edition/CFI-10XXB_PS5_Quick_Start_Guide_EN_MEA.pdf).
- [Centro de control de PS5](https://www.playstation.com/es-es/support/games/customize-ps5-control-center/).
- [Listas de juegos/biblioteca](https://www.playstation.com/es-es/support/games/create-gamelist/).
- [Accesibilidad, texto y reducción de movimiento](https://www.playstation.com/es-es/support/hardware/ps5-accessibility-settings/).

La referencia aprobada no es una composición de hero separado + fila Netflix. Es una pantalla full-bleed: el fondo del juego ocupa todo el canvas; arriba hay barra y fila de tiles cuadrados; logo y CTA viven sobre el fondo; las actividades forman una fila inferior; el centro de control aparece como scrim/panel inferior. Las fichas de Home, Game Hub y Control Center deben conservar esta lectura.

## Tokens PS5 específicos

No importar ni forzar `colors`, `radius`, `shadows` o `glows` del tema Void para esta pantalla. Usar `Box`, `Text`, `Page` y componentes headless/sin estilos públicos de Vexart, con tokens locales de la aplicación PS5. Los tokens locales no deben convertirse en un nuevo sistema general del motor.

```ts
export const ps5Visual = {
  canvas: { width: 1920, height: 1080 },
  topBar: { x: 80, y: 42, height: 42 },
  gameRow: { x: 45, y: 120, normal: 130, selected: 172, gap: 14 },
  logo: { x: 125, y: 350, width: 460 },
  play: { x: 125, y: 557, width: 243, height: 59 },
  activities: { x: 117, y: 663, cardWidth: 540, cardHeight: 225, gap: 16 },
  bottomScrim: { y: 932, height: 148 },
  controlCard: { width: 132, height: 84, gap: 36 },
  pagePadding: 45,
} as const

export const ps5Colors = {
  background: "#0b0d10",
  scrim: "#07090dcc",
  panel: "#090c11ee",
  panelSoft: "#151a20cc",
  text: "#f5f5f5",
  mutedText: "#b8bbc0",
  focus: "#ffffff",
  focusGlow: "#ffffff80",
  divider: "#ffffff26",
  success: "#5de0a5",
  error: "#ff7777",
} as const

export const ps5Motion = {
  focus: 160,
  carousel: 250,
  background: 400,
  panel: 210,
  screen: 260,
  scrim: 180,
  loadingPulse: 900,
} as const
```

El borde/halo del foco activo es blanco (`ps5Colors.focus`), no cyan. El `accent` propio de cada juego puede colorear logo, progress o detalles, pero nunca sustituye el foco blanco del mock.

## Adaptación de tamaño

- Escenario principal: Kitty directo 1920×1080.
- En 1280×720, aplicar `scale = min(width/1920, height/1080)` a geometría: fila x≈30/y≈80, tiles normales≈87, seleccionado≈115, gap≈9; logo x≈83/y≈233/ancho≈307; CTA x≈83/y≈371/ancho≈162/alto≈39; activities y≈442, cards≈360×150; scrim desde y≈621 con h≈99.
- Mantener siempre el orden visual: barra → fila cuadrada → logo/CTA → activities → panel inferior. Reducir metadatos secundarios antes de ocultar controles.
- No ocultar el juego seleccionado, `Jugar`, retorno, F1/F2 ni ayuda de footer.
- El fondo `hero` es full-bleed con recorte proporcional y scrim oscuro; el recorte nunca desplaza el layout del foco.
- El centro de control se ancla abajo, por encima del scrim y del contenido; F1 no cambia la pantalla subyacente.
- Ajustes, biblioteca, listas, Game Base y galería usan una columna visible con scroll; el foco se desplaza dentro del viewport.

## Movimiento

- `createTransition` para desplazamiento de la fila, scrim, opacity y cambio de fondo; `createSpring` solo para énfasis de tile si la vista lo necesita.
- Re-target durante movimiento parte del valor actual; no encola pasos antiguos.
- Cerrar un overlay cancela su transición y deja la capa desmontada; una transición vieja no puede cambiar la selección.
- `reduceMotion` elimina scale/spring/pulse y usa un cambio discreto, preservando foco y estado.
- Duraciones iniciales, no mediciones de Sony: foco 140–180 ms; carrusel 220–280 ms; fondo 350–450 ms; panel 180–240 ms; pantalla 220–300 ms.
- Pulso de carga es local y se desactiva con reducción de movimiento.

## Contrato de assets

El worker de assets entrega 24 entradas estables (18 instaladas y 6 descargables), rutas relativas a `examples/ps5` y `catalog-provenance.json`; procedencia y cobertura visual están validadas para Phase 0. El shape consumido es el de `GameCatalogEntry` en [`state-and-navigation.md`](state-and-navigation.md):

- `id`, `title`, `subtitle`, `cover`, `hero`, `titleScreen`, opcional `logo`.
- `sizeGb`, `installed`, `progress` (0–100), `genre`, `description`, `accent`.
- `activities[]` con `id`, `title`, `description`, `progress`.
- `trophies[]` con `type`, `name`, `earned`.

Las pantallas no cargan URLs remotas ni crean placeholders con IDs distintos. Si un recurso falta, muestran fallback full-bleed degradado/accent, conservan título/ID y exponen el error para QA.

## Estados visuales obligatorios

Cada control interactivo debe tener default, hover, focus blanco, active y disabled/no disponible cuando aplique. El foco usa `focusStyle`/halo sin alterar layout. Loading conserva cajas y ratios; las ramas empty/error que una pantalla expone conservan navegación y ofrecen `Reintentar`/`Volver`. Cuando el catálogo o asset local no tiene una rama de fallo, la ficha debe describir su fallback explícito y no inventar un botón. Textos largos se recortan o envuelven dentro de sus límites, nunca desplazan el control de retorno.
