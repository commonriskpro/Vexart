# Estado, navegación y contratos compartidos

**Estado (2026-09-09):** el diseño y los contratos de Phase 0 siguen aceptados. El STOP histórico de Phase 1 sobre posición/recorte con transformaciones está conservado en [`api-blockers.md`](api-blockers.md) y [`validation.md`](validation.md). La base compartida permanece implementada en `examples/ps5/src` y el host monta todas las pantallas y overlays del inventario. La QA source final registra 30 PASS, 0 FAIL y 345 aserciones en 5 archivos; root y PS5 typecheck pasan, root reporta 30 capturas GPU (15 rutas × 2 tamaños) PASS, consumidor GPU con bundle temporal PASS en ambos tamaños y store 9/67 PASS. El baseline de textura queda corregido para la captura de identidad/traslación: Home source-public pasa en 1280/1920 con 2 tests, 48 aserciones y recorrido de 26 tiles. La guard native devuelve errores existentes de dimensión/readback sin panic y mantiene el límite habilitado de 2048 en el runtime de prueba; filtros blur del nodo raíz o descendientes, y transformaciones complejas mantienen captura completa. Quedan la fidelidad exacta, la aprobación visual manual, la terminal Kitty física, el rendimiento, el estrés de movimiento y la instalación/validación del tarball final.

## Contrato de tipos

El catálogo real lo entrega el worker de assets. Las pantallas solo consumen estas formas y no inventan datos:

```ts
export type GameId =
  | "ghost-of-tsushima" | "marvels-spider-man-2" | "god-of-war-ragnarok"
  | "returnal" | "ratchet-and-clank-rift-apart" | "astro-bot"
  | "demons-souls" | "horizon-forbidden-west" | "gran-turismo-7"
  | "the-last-of-us-part-i" | "marvels-spider-man-miles-morales"
  | "sackboy-a-big-adventure" | "kena-bridge-of-spirits" | "death-stranding-directors-cut"
  | "final-fantasy-vii-rebirth" | "stellar-blade" | "helldivers-2"
  | "baldurs-gate-3" | "resident-evil-4" | "alan-wake-2"
  | "cyberpunk-2077" | "hogwarts-legacy" | "assassins-creed-shadows"
  | "monster-hunter-wilds"
export type UserId = string
export type HomeUtilityId = "store" | "library"
export type HomeTileId = GameId | HomeUtilityId
export type HomeTile =
  | { kind: "game"; id: GameId }
  | { kind: "utility"; id: HomeUtilityId }
export type ScreenId =
  | "boot-users" | "home" | "game-hub" | "launch"
  | "library" | "control-center" | "switcher" | "settings"
  | "profile" | "notifications" | "game-base"
  | "store-media" | "gallery" | "power"

export type OverlayId =
  | "control-center" | "options" | "switcher"
  | "notification-detail" | "download-detail" | "power-confirm"
  | "control-music" | "control-sound" | "control-microphone" | "control-accessories"
export type OverlayOwner = "base" | "active-screen" | "control-center" | "notifications"

export type AsyncStatus = "idle" | "loading" | "ready" | "error"
export type EffectKind = "real" | "simulated" | "unavailable"
export type GamePhase = "idle" | "launching" | "loading" | "title" | "suspended" | "closed"
export type PowerMode = "on" | "rest" | "restarting" | "off-simulated"

export type Activity = {
  id: string
  title: string
  description: string
  progress: number
}

export type Trophy = {
  type: "bronze" | "silver" | "gold" | "platinum"
  name: string
  earned: boolean
}

export type GameCatalogEntry = {
  id: GameId
  title: string
  subtitle: string
  cover: string
  hero: string
  titleScreen: string
  logo?: string
  sizeGb: number
  installed: boolean
  progress: number
  genre: string
  description: string
  accent: string
  activities: Activity[]
  trophies: Trophy[]
}

export type DemoUser = {
  id: UserId
  name: string
  handle: string
  avatar: string
  accent: string
  lastActiveGame?: GameId
}

export type Notification = {
  id: string
  title: string
  body: string
  read: boolean
  createdAt: number
  target?: { screen: ScreenId; gameId?: GameId }
}

export type Download = {
  id: string
  gameId: GameId
  progress: number
  status: "queued" | "downloading" | "paused" | "complete" | "cancelled" | "error"
  error?: string
}

export type SettingsState = {
  reduceMotion: boolean
  highContrast: boolean
  textScale: "small" | "default" | "large"
  brightness: number
  volume: number
  network: "connected" | "limited" | "offline-simulated"
}

export type StorageState = {
  usedGb: number
  capacityGb: number
  installedGameIds: GameId[]
}

export type GameList = {
  id: string
  name: string
  gameIds: GameId[]
}

export type LocalMessage = {
  id: string
  authorId: UserId
  body: string
  createdAt: number
}

export type LocalChatThread = {
  id: string
  participantIds: UserId[]
  messages: LocalMessage[]
}

export type LocalParty = {
  id: string
  memberIds: UserId[]
  title: string
}

export type ControlCardId =
  | "home" | "switcher" | "notifications" | "game-base"
  | "music" | "sound" | "microphone" | "accessories"
  | "profile" | "power"

export type MusicState = {
  selectedTrackId: string
  playing: boolean
  volume: number
}

export type SoundState = {
  muted: boolean
  volume: number
  output: "tv-simulated" | "headset-simulated"
}

export type MicrophoneState = {
  muted: boolean
  level: number
}

export type AccessoriesState = {
  deviceName: string
  connected: boolean
  battery: number
}

export type NavigationEntry = {
  screen: ScreenId
  focusId?: string
  gameId?: GameId
}

export type OverlayReturnContext = {
  entry: NavigationEntry
  parentOverlayId?: OverlayId
}

export type OverlayEntry = {
  id: OverlayId
  returnTo: OverlayReturnContext
  focusId?: string
}

export type Ps5State = {
  boot: { status: AsyncStatus; userSelected: boolean }
  users: DemoUser[]
  activeUserId?: UserId
  screen: ScreenId
  navigation: NavigationEntry[]
  overlayStack: OverlayEntry[]
  focusedId?: string
  focusMemory: Partial<Record<ScreenId, string>>
  catalog: GameCatalogEntry[]
  selectedGameId?: GameId
  homeTiles: HomeTile[]
  homeIndex: number
  library: {
    query: string
    tab: "all" | "installed" | "lists"
    filter: string
    sort: "recent" | "name" | "size"
    lists: GameList[]
  }
  gameSession: { gameId?: GameId; phase: GamePhase; progress: number; status: AsyncStatus }
  recentGameIds: GameId[]
  profile: { tab: "overview" | "trophies"; selectedTrophy?: string }
  controlCenter: {
    selectedCard: ControlCardId
    order: ControlCardId[]
    visibility: Record<ControlCardId, boolean>
  }
  music: MusicState
  sound: SoundState
  microphone: MicrophoneState
  accessories: AccessoriesState
  gameBase: { tab: "friends" | "parties" | "messages"; threads: LocalChatThread[]; parties: LocalParty[] }
  notifications: Notification[]
  downloads: Download[]
  storage: StorageState
  settings: SettingsState
  powerMode: PowerMode
  screenStatus: Partial<Record<ScreenId, AsyncStatus>>
  transitionEpoch: number
}

export type SettingAction = {
  [K in keyof SettingsState]: { type: "setting/set"; key: K; value: SettingsState[K] }
}[keyof SettingsState]

export type Ps5Action =
  | { type: "boot/finish" }
  | { type: "user/select"; userId: UserId }
  | { type: "navigate"; screen: ScreenId; replace?: boolean }
  | { type: "back" }
  | { type: "focus/set"; id?: string }
  | { type: "overlay/open"; id: OverlayId }
  | { type: "overlay/close" }
  | { type: "home/move"; delta: -1 | 1 }
  | { type: "home/select"; tile: HomeTileId }
  | { type: "library/query"; value: string }
  | { type: "library/set"; tab?: Ps5State["library"]["tab"]; filter?: string; sort?: Ps5State["library"]["sort"] }
  | { type: "game/start"; gameId: GameId }
  | { type: "game/advance"; phase: GamePhase; progress: number }
  | { type: "game/cancel" }
  | { type: "game/close" }
  | { type: "switcher/select"; gameId: GameId }
  | { type: "switcher/resume"; gameId?: GameId }
  | { type: "notification/read"; id: string; read: boolean }
  | { type: "notification/clear"; id?: string }
  | { type: "download/start"; gameId: GameId }
  | { type: "download/cancel"; id: string }
  | { type: "download/complete"; id: string }
  | { type: "download/set"; id: string; status: Exclude<Download["status"], "complete" | "cancelled"> }
  | { type: "download/progress"; id: string; progress: number }
  | { type: "game/uninstall"; gameId: GameId }
  | SettingAction
  | { type: "library/list-upsert"; list: GameList }
  | { type: "library/list-remove"; id: string }
  | { type: "profile/tab"; tab: Ps5State["profile"]["tab"] }
  | { type: "profile/trophy"; id?: string }
  | { type: "control/select"; id: ControlCardId }
  | { type: "control/set-order"; order: ControlCardId[] }
  | { type: "control/set-visibility"; id: ControlCardId; visible: boolean }
  | { type: "control/music"; action: "play" | "pause" | "next" | "previous" | "select"; trackId?: string }
  | { type: "control/sound"; action: "mute" | "volume" | "output"; value?: number; output?: SoundState["output"] }
  | { type: "control/microphone"; action: "mute" | "level"; value?: number }
  | { type: "control/accessories"; action: "connect" | "disconnect" | "select" }
  | { type: "gamebase/message"; threadId: string; body: string }
  | { type: "gamebase/party"; party: LocalParty }
  | { type: "power/request"; mode: Exclude<PowerMode, "on"> }
  | { type: "power/cancel" }
  | { type: "power/complete"; mode: Exclude<PowerMode, "on"> }
  | { type: "power/wake" }
  | { type: "power/relaunch" }

export type Ps5Actions = {
  dispatch(action: Ps5Action): void
  go(screen: ScreenId, entry?: Partial<NavigationEntry>): void
  back(): void
  setFocus(id?: string): void
  openOverlay(id: OverlayId): void
  closeOverlay(): void
  moveHome(delta: -1 | 1): void
  selectGame(id: GameId): void
  selectHomeTile(tile: HomeTileId): void
  startGame(id: GameId): void
  cancelGameLaunch(): void
  selectRecentGame(id: GameId): void
  resumeRecentGame(id?: GameId): void
  setSetting<K extends keyof SettingsState>(key: K, value: SettingsState[K]): void
  setTextField(id: "library-query", value: string): void
  startDownload(gameId: GameId): void
  cancelDownload(id: string): void
  completeDownload(id: string): void
  uninstallGame(gameId: GameId): void
  setDownload(id: string, status: Exclude<Download["status"], "complete" | "cancelled">): void
  setNotificationRead(id: string, read: boolean): void
  setControlOrder(order: ControlCardId[]): void
  setControlVisibility(id: ControlCardId, visible: boolean): void
  requestPower(mode: Exclude<PowerMode, "on">): void
  cancelPower(): void
  wakePower(): void
  relaunchDemo(): void
}

export type Ps5Seed = {
  users: DemoUser[]
  catalog: GameCatalogEntry[]
  settings: SettingsState
  storage: StorageState
  lists: GameList[]
  gameBase: { threads: LocalChatThread[]; parties: LocalParty[] }
  music: MusicState
  sound: SoundState
  microphone: MicrophoneState
  accessories: AccessoriesState
}

export type Ps5Store = {
  state: () => Ps5State
  actions: Ps5Actions
}

export declare function createPs5Store(seed: Ps5Seed): Ps5Store
```

`Trophy.type` permanece en el enum técnico inglés `bronze | silver | gold | platinum`; el worker de assets normaliza el catálogo a esos valores y las fichas traducen solo las etiquetas visibles.

### Invariantes del store

- `catalog` tiene 24 entradas estables provenientes del contrato de assets; nunca se duplica el catálogo dentro de una pantalla. `progress` es un número local normalizado entre 0 y 100. El orden canónico es el de `GameId`; las tarjetas utilitarias `store` y `library` no cuentan como juegos.
- `homeTiles` inicia `[store, ...24 juegos, library]`, reflejando las tarjetas PlayStation Store y Biblioteca de juegos del mock; al enfocar una utilidad se conserva el último `selectedGameId` válido en vez de inventar otro.
- Cuando `selectedGameId` está presente siempre apunta a una entrada existente; `home`, `game-hub` y `launch` lo usan como juego activo, mientras las tarjetas utilitarias pueden dejarlo como selección previa.
- `overlayStack` recibe input en orden LIFO; cada `OverlayEntry` conserva su propio `returnTo` y `parentOverlayId`, por lo que las capas anidadas no comparten un contexto global accidental.
- `back()` primero cierra el overlay/options superior, luego sale de la pantalla; en `home` no sale sin una acción explícita de cambio de usuario.
- `homeIndex` se clampa entre 0 y `homeTiles.length - 1`; la fila no hace wrap.
- `startDownload(gameId)` crea o reinicia una sola descarga local para un juego no instalado (incluido reintento tras `cancelled`/`error`); no reserva ni elimina espacio real. `download/progress` solo mueve el progreso y `download/set` solo permite estados operativos no terminales o `error` de una descarga existente, sin aplicar efectos de instalación o cancelación.
- `download/complete` es la única transición a `complete`: al alcanzar 100, marca `catalog[].installed = true`, añade el ID una sola vez a `storage.installedGameIds`, suma `sizeGb` una sola vez a `storage.usedGb` y emite una única notificación de instalación. Repetir el dispatch de finalización o progreso no duplica ninguna de esas tres consecuencias.
- `download/cancel` es la única transición a `cancelled`: conserva `installed` y `storage` sin cambios, emite una única notificación de cancelación y las repeticiones son no-op. No hay borrado de archivos ni proceso de descarga real.
- `uninstallGame(gameId)` solo cambia el modelo local: si estaba instalado, lo desinstala, quita el ID y su tamaño del storage exactamente una vez y emite una única notificación; no borra archivos del host. Si ya estaba desinstalado, es no-op.
- El estado y esos efectos pertenecen al store/base compartido, no a settings ni a la UI de Control center; notificaciones y descargas solo son presentadas por su owner de UI.
- `gameSession` representa como máximo una sesión de juego simulada. `recentGameIds` es una lista ordenada de IDs, no un conjunto de sesiones independientes; seleccionar/reanudar solo cambia el destino/fase de esa única sesión.
- `game/start` coloca el ID al frente de `recentGameIds` sin duplicarlo; `switcher/select` solo selecciona ese ID y `switcher/resume` lo asigna a la única `gameSession`. Cerrar la sesión no crea ni conserva un motor paralelo.
- `power/request` solo cambia a una pantalla de confirmación/simulación; `power/complete` nunca llama APIs del host.
- `power/wake`/`wakePower()` solo actúa desde `powerMode = rest`: devuelve `powerMode` a `on` y permite reanudar la pantalla o la única sesión simulada; desde `off-simulated` es no-op. Nunca despierta hardware ni el proceso anfitrión.
- `power/relaunch`/`relaunchDemo()` solo actúa desde `off-simulated`: vuelve a `PS5-BOOT` con `powerMode = on`, sesión de juego cerrada y selección de usuario pendiente, conserva settings/catalog/storage locales y no relanza procesos reales.
- Cada navegación incrementa `transitionEpoch`; una transición vieja no puede aplicar estado después de una cancelación.
- Ningún worker crea un router o store alternativo.
- `controlCenter.order` inicia exactamente como `["home", "switcher", "notifications", "game-base", "music", "sound", "microphone", "accessories", "profile", "power"]`; `controlCenter.visibility` inicia con las diez claves en `true`. `setControlOrder` valida IDs únicos y conserva todas las funciones contractuales; `setControlVisibility` solo cambia la visibilidad local y el host mantiene un camino accesible a cada función.

## Store Solid recomendado

La base implementada usa señales Solid simples y acciones compartidas, sin contexto de negocio duplicado por pantalla. Las pantallas nuevas deben conservar esta superficie pública de runtime:

```tsx
import {
  Box, Text, Page, Show, For,
  createSignal, createMemo, createEffect, batch,
  createTransition, createSpring,
  useKeyboard, useMouse, useTerminalDimensions,
} from "vexart"
import type { JSX } from "solid-js"
```

La implementación de `createPs5Store` mantiene una única señal de estado y un único objeto de acciones. Las vistas fuente leen `store.state()` y llaman `store.actions`; no mutan señales internas ni acceden a FFI. El uso de `vexart/engine` queda reservado al JSX generado por el plugin distribuido cuando el empaquetado lo requiera, no a imports profundos de fuentes.

## Contrato exacto de módulos de pantalla

Todos los módulos deben respetar la misma firma:

```tsx
export type Ps5ScreenProps = {
  state: () => Ps5State
  actions: Ps5Actions
  onReady?: () => void
}

export type Ps5OverlayProps = Ps5ScreenProps & {
  returnContext?: OverlayReturnContext
}

export type Ps5ScreenComponent = (props: Ps5ScreenProps) => JSX.Element
export type Ps5OverlayComponent = (props: Ps5OverlayProps) => JSX.Element
export type OverlayRendererEntry = {
  owner: OverlayOwner
  render: Ps5OverlayComponent
}
export type OverlayRendererMap = Record<OverlayId, OverlayRendererEntry>
```

Nombres y exports de los módulos de pantalla del inventario; todos están integrados en el host y la QA source final cubre sus recorridos locales. La fidelidad exacta, la aprobación visual/manual y las puertas física, de rendimiento y de tarball siguen pendientes:

```ts
export function BootUsersScreen(props: Ps5ScreenProps): JSX.Element
export function HomeScreen(props: Ps5ScreenProps): JSX.Element
export function GameHubScreen(props: Ps5ScreenProps): JSX.Element
export function LaunchScreen(props: Ps5ScreenProps): JSX.Element
export function LibraryScreen(props: Ps5ScreenProps): JSX.Element
export function OptionsOverlay(props: Ps5OverlayProps): JSX.Element
export function ControlCenterOverlay(props: Ps5OverlayProps): JSX.Element
export function SwitcherOverlay(props: Ps5OverlayProps): JSX.Element
export function NotificationsOverlay(props: Ps5OverlayProps): JSX.Element
export function SettingsScreen(props: Ps5ScreenProps): JSX.Element
export function ProfileScreen(props: Ps5ScreenProps): JSX.Element
export function NotificationsScreen(props: Ps5ScreenProps): JSX.Element
export function GameBaseScreen(props: Ps5ScreenProps): JSX.Element
export function StoreMediaScreen(props: Ps5ScreenProps): JSX.Element
export function GalleryScreen(props: Ps5ScreenProps): JSX.Element
export function PowerOverlay(props: Ps5OverlayProps): JSX.Element
```

El host raíz selecciona `screenModules[state().screen]`, renderiza una sola pantalla y después la capa superior de `overlayStack`. Esa tabla es el único host de navegación; no se usa un router por área para este demo.

### Propiedad y dispatch de overlays

El dispatch de overlays es una tabla explícita y cerrada, no un framework genérico ni un router por worker. El host toma el `OverlayId` superior, conserva su `returnTo` y llama al renderer indicado. Un mismo owner puede cambiar internamente de rama según el ID:

| `OverlayId` | Owner/render entry | Rama obligatoria y retorno |
|---|---|---|
| `control-center` | `ControlCenterOverlay` / Centro de control | Fila de diez tarjetas; cierra a su `returnTo`. |
| `options` | `OptionsOverlay` / owner de la pantalla activa | Acciones del foco actual; vuelve al `parentOverlayId` o a la pantalla base. |
| `switcher` | `SwitcherOverlay` / Centro de control | Recientes, seleccionar/reanudar; retorna al centro salvo que el usuario elija Inicio. |
| `notification-detail` | `NotificationsOverlay` / Centro de control | Detalle y marcar leída; vuelve a Notificaciones con fila/foco. |
| `download-detail` | `NotificationsOverlay` / Centro de control | Progreso, pausa/reanudar/cancelar; vuelve a Descargas con fila/foco. |
| `power-confirm` | `PowerOverlay` / Base compartida | Confirmación de reposo/reinicio/apagado; vuelve al origen o a Boot según acción. |
| `control-music` | `ControlCenterOverlay` / Centro de control | Rama Música: pista, reproducción y volumen simulados; vuelve a la tarjeta Música. |
| `control-sound` | `ControlCenterOverlay` / Centro de control | Rama Sonido: mute, volumen y salida simulada; vuelve a la tarjeta Sonido. |
| `control-microphone` | `ControlCenterOverlay` / Centro de control | Rama Micrófono: mute y nivel visual; vuelve a la tarjeta Micrófono. |
| `control-accessories` | `ControlCenterOverlay` / Centro de control | Rama Accesorios: conexión y batería simuladas; vuelve a la tarjeta Accesorios. |

La forma equivalente para el código es esta tabla cerrada (los nombres son entradas de módulo, no un registro dinámico):

```ts
const overlayRenderers: OverlayRendererMap = {
  "control-center": { owner: "control-center", render: ControlCenterOverlay },
  options: { owner: "active-screen", render: OptionsOverlay },
  switcher: { owner: "control-center", render: SwitcherOverlay },
  "notification-detail": { owner: "notifications", render: NotificationsOverlay },
  "download-detail": { owner: "notifications", render: NotificationsOverlay },
  "power-confirm": { owner: "base", render: PowerOverlay },
  "control-music": { owner: "control-center", render: ControlCenterOverlay },
  "control-sound": { owner: "control-center", render: ControlCenterOverlay },
  "control-microphone": { owner: "control-center", render: ControlCenterOverlay },
  "control-accessories": { owner: "control-center", render: ControlCenterOverlay },
}
```

No se registran overlays dinámicos: los paneles Música, Sonido, Micrófono y Accesorios son ramas tipadas del owner de Control center, y los dos detalles son ramas del owner de Notificaciones.

## Foco, entrada y retorno

- Al entrar, cada pantalla llama `actions.setFocus(state().focusMemory[id] ?? firstFocusableId)` después de montar.
- Cada click hace foco antes de activar; `onPress` es la ruta común para teclado `Enter`/`Space` y ratón.
- F1 alterna `control-center`; F2 abre `options` para el foco actual; Escape cierra el nivel superior o llama `back()`.
- En un campo de texto solo se aceptan caracteres, Backspace, flechas, Home/End y Enter. `Ctrl+C` sigue siendo salida global y no copia ni borra texto.
- Al cerrar cualquier overlay, se restaura el `returnTo` de esa entrada y el foco exacto. Si el elemento desapareció, se elige el primer control estable de la misma región.
- El foco no se mueve a contenido fuera del viewport; el contenedor hace scroll antes de confirmar el foco.

## Scroll, carga y error

- Carruseles: el fix histórico de posición/recorte con transformaciones y el fix de captura de identidad/traslación quedan separados de la QA pendiente de filtros blur del nodo raíz o descendientes, y transformaciones complejas. No reducir la escena, añadir tiling genérico ni asumir que un setter horizontal de `ScrollHandle` resuelve esos casos.
- Paneles, bibliotecas, ajustes, listas, Game Base y galería: contenedor vertical con `scrollY`/`createScrollHandle` público o scroll nativo del componente público.
- Loading: skeleton conserva geometría y foco lógico; solo simula latencia local determinista.
- Error: banner/panel local con `Reintentar` que vuelve a `loading`, y `Volver` que restaura la pantalla anterior. Asset faltante usa fondo degradado, título y estado visible de fallback.
- Ningún estado de error ejecuta red, PSN, FFI ni una operación del sistema anfitrión.
