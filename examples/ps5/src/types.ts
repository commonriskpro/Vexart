import type { JSX } from "solid-js"

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
  /** Overlay context to restore when this destination is popped. */
  returnOverlayStack?: OverlayEntry[]
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
  | { type: "gamebase/tab"; tab: Ps5State["gameBase"]["tab"] }
  | { type: "gamebase/message"; threadId: string; body: string }
  | { type: "gamebase/party"; party: LocalParty }
  | { type: "gamebase/party-leave"; partyId: string }
  | { type: "gamebase/messages-clear"; threadId?: string }
  | { type: "settings/reset" }
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
