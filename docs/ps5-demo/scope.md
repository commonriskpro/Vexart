# Fase 0 — Alcance cerrado y referencias

**Estado:** Phase 0 completa y aceptada por root: diseño, contratos y procedencia/cobertura del catálogo de 24 juegos (18 instalados + 6 descargables) validados. Phase 1 técnica de API pública está detenida bajo `/root/ps5_public_api_gate` por la limitación confirmada de posición/recorte con transformaciones; no se inició implementación de pantallas. Phase 2 y las posteriores permanecen bloqueadas hasta decisión y nuevo gate.

## Objetivo

Construir una recreación visual e interactiva local del sistema PS5 para Kitty directo. El objetivo es que el flujo se sienta completo: arranque, usuarios, inicio, carrusel de 24 juegos, hubs, loading/title simulado, centro de control, ajustes, biblioteca, perfil, paneles, galería y alimentación simulada. No se emulan juegos ni se conectan PSN, compras, audio, vídeo o hardware real.

Todas las simulaciones mutan únicamente el estado local del demo. Nunca apagan, reinician, suspenden ni modifican el ordenador anfitrión.

## Superficies de referencia

- Plan maestro: [`../ps5-demo-implementation-plan.md`](../ps5-demo-implementation-plan.md).
- Producto y decisiones: [`../PRD.md`](../PRD.md).
- Arquitectura vigente: [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
- Política de API: [`../API-POLICY.md`](../API-POLICY.md).
- Referencia runtime/distribución: [`../agent-reference.md`](../agent-reference.md).
- Mock aprobado del centro de control: [copia local](references/approved-home-control-center.png), con fuente original fuera del repositorio en `/Users/saturno/.codex/generated_images/01a081a5-8919-7581-9022-95ec29b64afa/exec-b3cc8e0d-3074-42d3-8f96-a8f828d3372d.png`; la procedencia local existe y su QA visual final sigue en progreso.
- Fuente primaria con pantalla de inicio anotada: [PS5 Quick Start Guide (PDF)](https://www.playstation.com/content/dam/global_pdc/en/corporate/support/manuals/ps5-docs/1000b-digital-edition/CFI-10XXB_PS5_Quick_Start_Guide_EN_MEA.pdf).
- Fuente primaria del centro de control: [Personalizar el centro de control de PS5](https://www.playstation.com/es-es/support/games/customize-ps5-control-center/).
- Fuente primaria de listas/biblioteca: [Crear listas de juegos en PS5](https://www.playstation.com/es-es/support/games/create-gamelist/).
- Fuente primaria de movimiento/accesibilidad: [Ajustes de accesibilidad de PS5](https://www.playstation.com/es-es/support/hardware/ps5-accessibility-settings/).

Las referencias oficiales fijan estructura y comportamiento observable; el mock aprobado fija la dirección visual del demo. No se copian assets ni se afirma una reproducción pixel-perfect del firmware sin una referencia aprobada para cada pantalla.

## Entorno fijo

- Escenario principal: Kitty directo, 1920×1080.
- Adaptación obligatoria: 1280×720 y redimensionado sin perder la selección ni el foco.
- El contrato de teclado, foco y ratón vive en [`state-and-navigation.md`](state-and-navigation.md); las fichas no pueden redefinir atajos globales ni crear conflictos con campos de texto.

## Inventario cerrado de áreas

| ID | Pantalla/área | Propiedad | Resultado local |
|---|---|---|---|
| `PS5-BOOT` | Arranque y selección de usuario | Base compartida | Splash determinista, usuarios locales, entrada a inicio. |
| `PS5-HOME` | Inicio de juegos | Inicio/juegos | Carrusel de 24 juegos, fondo, hub y opciones. |
| `PS5-GAME-HUB` | Centro del juego | Inicio/juegos | Actividades, trofeos, galería y acción de iniciar. |
| `PS5-LAUNCH` | Lanzamiento/loading/title | Inicio/juegos | Estados simulados interrumpibles y coherentes. |
| `PS5-LIBRARY` | Biblioteca | Inicio/juegos | Colección, instalados, búsqueda, filtros, orden y listas. |
| `PS5-CONTROL` | Centro de control | Control center | Tarjetas, paneles, notificaciones, descargas y retorno de foco. |
| `PS5-SWITCHER` | Selector de juegos | Control center | Recientes, reanudar y cerrar sesión simulada. |
| `PS5-SETTINGS` | Ajustes | Ajustes | Categorías, almacenamiento, controles, accesibilidad y persistencia local. |
| `PS5-PROFILE` | Perfil y trofeos | Control center | Perfil local, cambio de usuario, catálogo y detalles. |
| `PS5-NOTIFICATIONS` | Notificaciones y descargas | Control center | Leer/descartar y progreso simulado con pausa/reanudación/cancelación. |
| `PS5-GAMEBASE` | Game Base | Control center | Amigos, grupos y conversaciones locales simuladas. |
| `PS5-STORE-MEDIA` | Store y multimedia | Store/media | Catálogos locales; compras, streaming y reproducción no disponibles. |
| `PS5-GALLERY` | Galería | Store/media | Rejilla derivada del catálogo, viewer, siguiente/anterior y filtros transitorios. |
| `PS5-POWER` | Alimentación | Base compartida | Reposo, reinicio y apagado de la simulación solamente. |

Cada ID tiene una ficha ejecutable en [`screens/`](screens/). La ficha define controles, efecto (`real`, `simulado` o `no disponible`), foco, retorno, scroll y estados no listados en esta tabla.

## Estados de finalización de Phase 0

- [x] Las 14 fichas no dejan controles o salidas sin especificar.
- [x] El contrato de estado/acciones es único y no hay routers por trabajador.
- [x] El contrato de catálogo acepta 24 IDs proporcionados por el worker de assets: 18 instalados y 6 descargables, sin inventar IDs en pantallas.
- [x] Este scope consume assets por contrato y procedencia; la procedencia/QA visual final pertenece al worker de assets.
- [x] Tokens, keymap, adaptación 1280×720 y reglas de reducción de movimiento están cerrados.
- [x] Root revisó y aceptó estos documentos; Phase 1 puede comenzar bajo su gate técnico.
- [x] La procedencia y cobertura visual del catálogo de 24 juegos (18 instalados + 6 descargables) están validadas por el worker de assets.

Ante cualquier capacidad no demostrable con la API pública, se pausa la implementación del proyecto/demo y se espera una decisión; no se improvisa una API privada.
