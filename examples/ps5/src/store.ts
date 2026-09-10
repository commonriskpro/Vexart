import { batch, createSignal } from "vexart"
import { createDefaultSeed, findGame } from "./catalog"
import { createFilePersistence, type Ps5Persistence, type Ps5PersistenceSnapshot, type Ps5PersistedCatalogEntry, type Ps5PersistedUser } from "./persistence"
import type {
  AccessoriesState,
  ControlCardId,
  Download,
  GameId,
  GamePhase,
  HomeTileId,
  NavigationEntry,
  OverlayId,
  Ps5Action,
  Ps5Actions,
  Ps5Seed,
  Ps5State,
  Ps5Store,
  SettingsState,
} from "./types"

export type CreatePs5StoreOptions = {
  persistence?: Ps5Persistence | string
}

const controlOrder: ControlCardId[] = [
  "home", "switcher", "notifications", "game-base", "music",
  "sound", "microphone", "accessories", "profile", "power",
]
const controlCardSet = new Set(controlOrder)
const guestId = "guest"

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

function statusForPhase(phase: GamePhase) {
  if (phase === "title" || phase === "suspended") return "ready" as const
  if (phase === "idle" || phase === "closed") return "idle" as const
  return "loading" as const
}

const musicTrackIds = ["menu-theme", "game-theme", "ambient"] as const

function createPersistenceSnapshot(state: Ps5State, settingsByUser: Record<string, SettingsState>): Ps5PersistenceSnapshot {
  return {
    version: 1,
    users: state.users.map(({ id, name, handle, lastActiveGame }): Ps5PersistedUser => ({ id, name, handle, ...(lastActiveGame ? { lastActiveGame } : {}) })),
    catalog: state.catalog.map(({ id, installed, progress }): Ps5PersistedCatalogEntry => ({ id, installed, progress })),
    settingsByUser: clone(settingsByUser),
    storage: clone(state.storage),
    lists: clone(state.library.lists),
    gameBase: clone(state.gameBase),
    music: clone(state.music),
    sound: clone(state.sound),
    microphone: clone(state.microphone),
    accessories: clone(state.accessories),
  }
}

function mergeCatalog(seed: Ps5Seed, persisted?: Ps5PersistenceSnapshot) {
  if (!persisted) return clone(seed.catalog)
  const mutable = new Map(persisted.catalog.map((entry) => [entry.id, entry]))
  return seed.catalog.map((entry) => {
    const saved = mutable.get(entry.id)
    return saved ? { ...clone(entry), installed: saved.installed, progress: clamp(saved.progress) } : clone(entry)
  })
}

function mergeUsers(seed: Ps5Seed, persisted?: Ps5PersistenceSnapshot) {
  if (!persisted) return clone(seed.users)
  const mutable = new Map(persisted.users.map((user) => [user.id, user]))
  return seed.users.map((user) => {
    const saved = mutable.get(user.id)
    return saved
      ? { ...clone(user), name: saved.name, handle: saved.handle, ...(saved.lastActiveGame ? { lastActiveGame: saved.lastActiveGame } : {}) }
      : clone(user)
  })
}

function hasAllControlCards(order: ControlCardId[]) {
  return order.length === controlOrder.length
    && new Set(order).size === controlOrder.length
    && order.every((id) => controlCardSet.has(id))
}

function findHomeIndex(tiles: Ps5State["homeTiles"], tile: HomeTileId) {
  return tiles.findIndex((entry) => entry.id === tile)
}

function firstRecent(state: Ps5State, gameId?: GameId) {
  if (gameId && state.recentGameIds.includes(gameId)) return gameId
  return state.recentGameIds[0]
}

function appendNotification(state: Ps5State, title: string, body: string, target?: Ps5State["notifications"][number]["target"]) {
  const id = `${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${state.notifications.length + 1}`
  return {
    id,
    title,
    body,
    read: false,
    createdAt: Date.now(),
    ...(target ? { target } : {}),
  }
}

function initialState(seed: Ps5Seed, persisted?: Ps5PersistenceSnapshot): Ps5State {
  const catalog = mergeCatalog(seed, persisted)
  const installedGameIds = catalog.filter((entry) => entry.installed).map((entry) => entry.id)
  const usedGb = catalog.filter((entry) => entry.installed).reduce((total, entry) => total + entry.sizeGb, 0)
  const capacityGb = Math.max(seed.storage.capacityGb, persisted?.storage?.capacityGb ?? 0, usedGb)
  const storage = { usedGb, capacityGb, installedGameIds }
  const users = mergeUsers(seed, persisted)
  const homeTiles = [
    { kind: "utility" as const, id: "store" as const },
    ...catalog.map((entry) => ({ kind: "game" as const, id: entry.id })),
    { kind: "utility" as const, id: "library" as const },
  ]
  const selectedGameId = catalog.find((entry) => entry.installed)?.id ?? catalog[0]?.id
  return {
    boot: { status: "loading", userSelected: false },
    users,
    screen: "boot-users",
    navigation: [{ screen: "boot-users" }],
    overlayStack: [],
    focusedId: undefined,
    focusMemory: {},
    catalog,
    selectedGameId,
    homeTiles,
    homeIndex: 0,
    library: {
      query: "",
      tab: "all",
      filter: "",
      sort: "recent",
      lists: clone(persisted?.lists ?? seed.lists),
    },
    gameSession: { phase: "idle", progress: 0, status: "idle" },
    recentGameIds: [],
    profile: { tab: "overview" },
    controlCenter: {
      selectedCard: "home",
      order: [...controlOrder],
      visibility: Object.fromEntries(controlOrder.map((id) => [id, true])) as Record<ControlCardId, boolean>,
    },
    music: clone(persisted?.music ?? seed.music),
    sound: clone(persisted?.sound ?? seed.sound),
    microphone: clone(persisted?.microphone ?? seed.microphone),
    accessories: clone(persisted?.accessories ?? seed.accessories),
    gameBase: { tab: "friends", ...(clone(persisted?.gameBase ?? seed.gameBase)) },
    notifications: [],
    downloads: [],
    storage,
    settings: clone(seed.settings),
    powerMode: "on",
    screenStatus: { "boot-users": "loading" },
    transitionEpoch: 0,
  }
}

export function createPs5Store(seed: Ps5Seed = createDefaultSeed(), options: CreatePs5StoreOptions = {}): Ps5Store {
  const persistence = typeof options.persistence === "string"
    ? createFilePersistence(options.persistence)
    : options.persistence
  let persisted: Ps5PersistenceSnapshot | undefined
  try {
    persisted = persistence?.load()
  } catch {
    persisted = undefined
  }
  const settingsByUser: Record<string, SettingsState> = clone(persisted?.settingsByUser ?? {})
  let powerReturn: NavigationEntry[] | undefined
  let powerFocus: string | undefined

  const [state, setState] = createSignal<Ps5State>(initialState(seed, persisted))

  const save = (next: Ps5State) => {
    try {
      persistence?.save(createPersistenceSnapshot(next, settingsByUser))
    } catch {
      // Persistence is best effort: a read-only or full local path must not break the demo.
    }
  }

  const commit = (next: Ps5State, shouldPersist = true) => {
    batch(() => setState(next))
    if (shouldPersist) save(next)
  }

  const isDurableAction = (action: Ps5Action) => action.type === "user/select"
    || action.type === "setting/set"
    || action.type === "settings/reset"
    || action.type === "download/complete"
    || action.type === "game/uninstall"
    || action.type.startsWith("library/list-")
    || action.type === "control/set-order"
    || action.type === "control/set-visibility"
    || action.type === "control/music"
    || action.type === "control/sound"
    || action.type === "control/microphone"
    || action.type === "control/accessories"
    || action.type === "gamebase/message"
    || action.type === "gamebase/party"
    || action.type === "gamebase/party-leave"
    || action.type === "gamebase/messages-clear"

  const epoch = (next: Ps5State) => ({ ...next, transitionEpoch: next.transitionEpoch + 1 })

  const restoreEntry = (next: Ps5State, entry: NavigationEntry) => {
    const navigation = next.navigation.length > 0 ? [...next.navigation] : [{ screen: entry.screen }]
    navigation[navigation.length - 1] = clone(entry)
    return {
      ...next,
      screen: entry.screen,
      navigation,
      ...(entry.gameId ? { selectedGameId: entry.gameId } : {}),
      focusedId: undefined,
    }
  }

  const navigate = (next: Ps5State, screen: Ps5State["screen"], entry?: Partial<NavigationEntry>, replace = false) => {
    const current: NavigationEntry = {
      screen,
      ...(entry?.focusId ? { focusId: entry.focusId } : {}),
      ...(entry?.gameId ? { gameId: entry.gameId } : {}),
      ...(entry?.returnOverlayStack ? { returnOverlayStack: clone(entry.returnOverlayStack) } : {}),
    }
    const navigation = replace
      ? [...next.navigation.slice(0, -1), current]
      : [...next.navigation, current]
    return epoch({
      ...next,
      screen,
      navigation: navigation.length > 0 ? navigation : [current],
      ...(entry?.gameId ? { selectedGameId: entry.gameId } : {}),
      focusedId: entry?.focusId,
    })
  }

  const closeOverlayState = (next: Ps5State) => {
    const overlay = next.overlayStack[next.overlayStack.length - 1]
    if (!overlay) return next
    const base = restoreEntry({ ...next, overlayStack: next.overlayStack.slice(0, -1) }, overlay.returnTo.entry)
    return epoch({
      ...base,
      focusedId: overlay.returnTo.entry.focusId,
    })
  }

  const dispatch = (action: Ps5Action) => {
    const current = state()
    let next = current
    switch (action.type) {
      case "boot/finish":
        if (current.boot.status === "ready") return
        next = { ...current, boot: { status: "ready", userSelected: false }, screenStatus: { ...current.screenStatus, "boot-users": "ready" } }
        break
      case "user/select": {
        const user = current.users.find((entry) => entry.id === action.userId)
        if (!user) return
        if (current.activeUserId && current.activeUserId !== guestId) settingsByUser[current.activeUserId] = clone(current.settings)
        const settings = action.userId === guestId ? current.settings : clone(settingsByUser[action.userId] ?? seed.settings)
        if (action.userId !== guestId) settingsByUser[action.userId] ??= clone(settings)
        const lastGame = user.lastActiveGame && findGame(current.catalog, user.lastActiveGame)
          ? user.lastActiveGame
          : current.selectedGameId
        const homeIndex = lastGame ? findHomeIndex(current.homeTiles, lastGame) : -1
        next = navigate({
          ...current,
          overlayStack: [],
          activeUserId: action.userId,
          settings,
          boot: { status: "ready", userSelected: true },
          ...(homeIndex >= 0 ? { homeIndex } : {}),
        }, "home", { gameId: lastGame }, true)
        break
      }
      case "navigate":
        next = navigate(current, action.screen, undefined, action.replace)
        break
      case "back":
        if (current.overlayStack.length > 0) {
          next = closeOverlayState(current)
          break
        }
        if (current.screen === "home" || current.navigation.length <= 1) return
        {
          const destination = current.navigation.at(-1)
          const returnOverlayStack = destination?.returnOverlayStack
          if (returnOverlayStack?.length) {
            const restoredOverlays = clone(returnOverlayStack)
            const returnEntry = restoredOverlays.at(-1)?.returnTo.entry
              ?? current.navigation[current.navigation.length - 2]
              ?? { screen: "home" as const }
            const navigation = current.navigation.slice(0, -1)
            const base = restoreEntry({ ...current, navigation, overlayStack: restoredOverlays }, returnEntry)
            next = epoch({
              ...base,
              overlayStack: restoredOverlays,
              focusedId: restoredOverlays.at(-1)?.focusId ?? returnEntry.focusId,
            })
            break
          }
        }
        next = epoch({
          ...current,
          navigation: current.navigation.slice(0, -1),
          screen: current.navigation[current.navigation.length - 2]?.screen ?? "home",
          focusedId: undefined,
        })
        break
      case "focus/set": {
        const topIndex = current.overlayStack.length - 1
        const overlayFocusMatches = topIndex >= 0 && current.overlayStack[topIndex]?.focusId === action.id
        const baseFocusMatches = current.overlayStack.length === 0 && (!action.id || current.focusMemory[current.screen] === action.id)
        if (current.focusedId === action.id && (overlayFocusMatches || baseFocusMatches)) return
        const focusMemory = { ...current.focusMemory }
        if (action.id && current.overlayStack.length === 0) focusMemory[current.screen] = action.id
        const overlayStack = topIndex >= 0
          ? current.overlayStack.map((entry, index) => index === topIndex ? { ...entry, ...(action.id ? { focusId: action.id } : { focusId: undefined }) } : entry)
          : current.overlayStack
        next = { ...current, focusedId: action.id, focusMemory, overlayStack }
        break
      }
      case "overlay/open": {
        const top = current.overlayStack[current.overlayStack.length - 1]
        if (top?.id === action.id) return
        const navigationEntry = current.navigation.at(-1)
        const returnTo: NavigationEntry = {
          ...navigationEntry,
          screen: current.screen,
          ...(current.focusedId ? { focusId: current.focusedId } : {}),
          ...(current.selectedGameId ? { gameId: current.selectedGameId } : {}),
        }
        next = epoch({
          ...current,
          overlayStack: [...current.overlayStack, {
            id: action.id,
            returnTo: { entry: returnTo, ...(top ? { parentOverlayId: top.id } : {}) },
            ...(current.focusedId ? { focusId: current.focusedId } : {}),
          }],
          focusedId: undefined,
        })
        break
      }
      case "overlay/close":
        next = closeOverlayState(current)
        if (next === current) return
        break
      case "home/move": {
        const index = Math.max(0, Math.min(current.homeTiles.length - 1, current.homeIndex + action.delta))
        const tile = current.homeTiles[index]
        next = {
          ...current,
          homeIndex: index,
          ...(tile?.kind === "game" ? { selectedGameId: tile.id } : {}),
          focusedId: `home-tile-${tile?.id ?? index}`,
        }
        break
      }
      case "home/select": {
        const index = findHomeIndex(current.homeTiles, action.tile)
        if (index < 0) return
        const tile = current.homeTiles[index]
        const selected = { ...current, homeIndex: index, focusedId: `home-tile-${action.tile}` }
        if (tile.kind === "game") {
          next = navigate({ ...selected, selectedGameId: tile.id }, "game-hub", { gameId: tile.id })
        } else {
          next = navigate(selected, tile.id === "store" ? "store-media" : "library")
        }
        break
      }
      case "library/query":
        next = { ...current, library: { ...current.library, query: action.value } }
        break
      case "library/set":
        next = { ...current, library: { ...current.library, ...(action.tab ? { tab: action.tab } : {}), ...(action.filter !== undefined ? { filter: action.filter } : {}), ...(action.sort ? { sort: action.sort } : {}) } }
        break
      case "game/start": {
        const game = findGame(current.catalog, action.gameId)
        if (!game?.installed) return
        next = navigate({
          ...current,
          selectedGameId: action.gameId,
          gameSession: { gameId: action.gameId, phase: "launching", progress: 0, status: "loading" },
          recentGameIds: [action.gameId, ...current.recentGameIds.filter((id) => id !== action.gameId)],
        }, "launch", { gameId: action.gameId })
        break
      }
      case "game/advance":
        if (!current.gameSession.gameId) return
        next = { ...current, gameSession: { ...current.gameSession, phase: action.phase, progress: clamp(action.progress), status: statusForPhase(action.phase) } }
        break
      case "game/cancel":
        next = navigate({ ...current, gameSession: { phase: "idle", progress: 0, status: "idle" } }, "game-hub", { gameId: current.selectedGameId }, true)
        break
      case "game/close":
        {
          const closingId = current.gameSession.gameId
          const recentGameIds = closingId
            ? current.recentGameIds.filter((id) => id !== closingId)
            : current.recentGameIds
          const neighborId = recentGameIds[0] ?? current.selectedGameId
          const focusId = recentGameIds[0] ? `home-tile-${recentGameIds[0]}` : "home-play"
          const homeIndex = neighborId ? findHomeIndex(current.homeTiles, neighborId) : current.homeIndex
          next = navigate({
            ...current,
            overlayStack: [],
            recentGameIds,
            gameSession: { phase: "idle", progress: 0, status: "idle" },
            ...(homeIndex >= 0 ? { homeIndex } : {}),
          }, "home", { ...(neighborId ? { gameId: neighborId } : {}), focusId }, true)
        }
        break
      case "switcher/select":
        if (!current.recentGameIds.includes(action.gameId)) return
        next = { ...current, selectedGameId: action.gameId, gameSession: { ...current.gameSession, gameId: action.gameId } }
        break
      case "switcher/resume": {
        const gameId = firstRecent(current, action.gameId)
        if (!gameId) return
        next = navigate({
          ...current,
          selectedGameId: gameId,
          gameSession: { gameId, phase: "title", progress: current.gameSession.gameId === gameId ? current.gameSession.progress : 100, status: "ready" },
          overlayStack: [],
        }, "launch", { gameId }, true)
        break
      }
      case "notification/read": {
        const index = current.notifications.findIndex((entry) => entry.id === action.id)
        if (index < 0) return
        const notifications = [...current.notifications]
        notifications[index] = { ...notifications[index], read: action.read }
        next = { ...current, notifications }
        break
      }
      case "notification/clear":
        next = { ...current, notifications: action.id ? current.notifications.filter((entry) => entry.id !== action.id) : [] }
        break
      case "download/start": {
        const game = findGame(current.catalog, action.gameId)
        if (!game || game.installed) return
        const id = `download-${action.gameId}`
        const existing = current.downloads.find((entry) => entry.id === id)
        const download: Download = { id, gameId: action.gameId, progress: 0, status: "queued" }
        next = {
          ...current,
          downloads: existing
            ? current.downloads.map((entry) => entry.id === id ? download : entry)
            : [...current.downloads, download],
        }
        break
      }
      case "download/cancel": {
        const entry = current.downloads.find((download) => download.id === action.id)
        if (!entry || entry.status === "cancelled" || entry.status === "complete") return
        const notifications = current.notifications.some((item) => item.id === `${entry.id}-cancelled`)
          ? current.notifications
          : [...current.notifications, { ...appendNotification(current, "Descarga cancelada", `Se canceló la descarga de ${findGame(current.catalog, entry.gameId)?.title ?? entry.gameId}.`, { screen: "notifications", gameId: entry.gameId }), id: `${entry.id}-cancelled` }]
        next = { ...current, downloads: current.downloads.map((download) => download.id === action.id ? { ...download, status: "cancelled" } : download), notifications }
        break
      }
      case "download/complete": {
        const entry = current.downloads.find((download) => download.id === action.id)
        if (!entry || entry.status === "complete" || entry.status === "cancelled") return
        const game = findGame(current.catalog, entry.gameId)
        if (!game) return
        const alreadyInstalled = game.installed || current.storage.installedGameIds.includes(game.id)
        const catalog = alreadyInstalled ? current.catalog : current.catalog.map((item) => item.id === game.id ? { ...item, installed: true, progress: Math.max(item.progress, 0) } : item)
        const storage = alreadyInstalled
          ? current.storage
          : { ...current.storage, installedGameIds: [...current.storage.installedGameIds, game.id], usedGb: current.storage.usedGb + game.sizeGb }
        const notifications = alreadyInstalled || current.notifications.some((item) => item.id === `${entry.id}-complete`)
          ? current.notifications
          : [...current.notifications, { ...appendNotification(current, "Juego instalado", `${game.title} ya está listo para jugar.`, { screen: "game-hub", gameId: game.id }), id: `${entry.id}-complete` }]
        next = {
          ...current,
          catalog,
          storage,
          downloads: current.downloads.map((download) => download.id === action.id ? { ...download, status: "complete", progress: 100 } : download),
          notifications,
        }
        break
      }
      case "download/set": {
        const entry = current.downloads.find((download) => download.id === action.id)
        if (!entry || entry.status === "complete" || entry.status === "cancelled") return
        next = { ...current, downloads: current.downloads.map((download) => download.id === action.id ? { ...download, status: action.status } : download) }
        break
      }
      case "download/progress": {
        const entry = current.downloads.find((download) => download.id === action.id)
        if (!entry || entry.status === "complete" || entry.status === "cancelled") return
        next = { ...current, downloads: current.downloads.map((download) => download.id === action.id ? { ...download, progress: clamp(action.progress) } : download) }
        break
      }
      case "game/uninstall": {
        const game = findGame(current.catalog, action.gameId)
        if (!game?.installed) return
        next = {
          ...current,
          catalog: current.catalog.map((entry) => entry.id === action.gameId ? { ...entry, installed: false } : entry),
          storage: { ...current.storage, usedGb: Math.max(0, current.storage.usedGb - game.sizeGb), installedGameIds: current.storage.installedGameIds.filter((id) => id !== action.gameId) },
          notifications: [...current.notifications, { ...appendNotification(current, "Juego desinstalado", `${game.title} se quitó del almacenamiento simulado.`, { screen: "settings", gameId: game.id }), id: `uninstall-${game.id}-${current.notifications.length + 1}` }],
        }
        break
      }
      case "setting/set": {
        const value = action.key === "brightness" || action.key === "volume" ? clamp(Number(action.value)) : action.value
        const settings = { ...current.settings, [action.key]: value } as SettingsState
        if (current.activeUserId && current.activeUserId !== guestId) settingsByUser[current.activeUserId] = clone(settings)
        next = { ...current, settings }
        break
      }
      case "library/list-upsert":
        next = { ...current, library: { ...current.library, lists: [...current.library.lists.filter((list) => list.id !== action.list.id), clone(action.list)] } }
        break
      case "library/list-remove":
        next = { ...current, library: { ...current.library, lists: current.library.lists.filter((list) => list.id !== action.id) } }
        break
      case "profile/tab":
        next = { ...current, profile: { ...current.profile, tab: action.tab } }
        break
      case "profile/trophy":
        next = { ...current, profile: { ...current.profile, ...(action.id ? { selectedTrophy: action.id } : { selectedTrophy: undefined }) } }
        break
      case "control/select":
        next = { ...current, controlCenter: { ...current.controlCenter, selectedCard: action.id } }
        break
      case "control/set-order":
        if (!hasAllControlCards(action.order)) return
        next = { ...current, controlCenter: { ...current.controlCenter, order: [...action.order] } }
        break
      case "control/set-visibility":
        next = { ...current, controlCenter: { ...current.controlCenter, visibility: { ...current.controlCenter.visibility, [action.id]: action.visible } } }
        break
      case "control/music": {
        const currentIndex = Math.max(0, musicTrackIds.indexOf(current.music.selectedTrackId as typeof musicTrackIds[number]))
        const trackIndex = action.action === "next"
          ? (currentIndex + 1) % musicTrackIds.length
          : action.action === "previous"
            ? (currentIndex - 1 + musicTrackIds.length) % musicTrackIds.length
            : currentIndex
        const selectedTrackId = action.action === "select" && action.trackId
          ? action.trackId
          : musicTrackIds[trackIndex]
        next = {
          ...current,
          music: {
            ...current.music,
            ...(action.action === "play" ? { playing: true } : {}),
            ...(action.action === "pause" ? { playing: false } : {}),
            ...(action.action === "select" || action.action === "next" || action.action === "previous" ? { selectedTrackId } : {}),
            ...(action.action === "next" || action.action === "previous" ? { playing: true } : {}),
          },
        }
        break
      }
      case "control/sound":
        next = {
          ...current,
          sound: {
            ...current.sound,
            ...(action.action === "mute" ? { muted: !current.sound.muted } : {}),
            ...(action.action === "volume" && action.value !== undefined ? { volume: clamp(action.value) } : {}),
            ...(action.action === "output" && action.output ? { output: action.output } : {}),
          },
        }
        break
      case "control/microphone":
        next = {
          ...current,
          microphone: {
            ...current.microphone,
            ...(action.action === "mute" ? { muted: !current.microphone.muted } : {}),
            ...(action.action === "level" && action.value !== undefined ? { level: clamp(action.value) } : {}),
          },
        }
        break
      case "control/accessories": {
        const accessories: AccessoriesState = {
          ...current.accessories,
          ...(action.action === "connect" ? { connected: true } : {}),
          ...(action.action === "disconnect" ? { connected: false } : {}),
        }
        next = { ...current, accessories }
        break
      }
      case "gamebase/tab":
        if (current.gameBase.tab === action.tab) return
        next = { ...current, gameBase: { ...current.gameBase, tab: action.tab } }
        break
      case "gamebase/message": {
        const thread = current.gameBase.threads.find((entry) => entry.id === action.threadId)
        const message = { id: `${action.threadId}-${(thread?.messages.length ?? 0) + 1}`, authorId: current.activeUserId ?? guestId, body: action.body, createdAt: Date.now() }
        const hasThread = thread !== undefined
        const threads = current.gameBase.threads.map((thread) => thread.id === action.threadId ? {
          ...thread,
          messages: [...thread.messages, message],
        } : thread)
        next = {
          ...current,
          gameBase: {
            ...current.gameBase,
            threads: hasThread
              ? threads
              : [...threads, { id: action.threadId, participantIds: [current.activeUserId ?? guestId], messages: [message] }],
          },
        }
        break
      }
      case "gamebase/party":
        next = { ...current, gameBase: { ...current.gameBase, parties: [...current.gameBase.parties.filter((party) => party.id !== action.party.id), clone(action.party)] } }
        break
      case "gamebase/party-leave":
        if (!current.gameBase.parties.some((party) => party.id === action.partyId)) return
        next = { ...current, gameBase: { ...current.gameBase, parties: current.gameBase.parties.filter((party) => party.id !== action.partyId) } }
        break
      case "gamebase/messages-clear": {
        const threads = action.threadId
          ? current.gameBase.threads.map((thread) => thread.id === action.threadId ? { ...thread, messages: [] } : thread)
          : current.gameBase.threads.map((thread) => ({ ...thread, messages: [] }))
        if (action.threadId && !current.gameBase.threads.some((thread) => thread.id === action.threadId)) return
        next = { ...current, gameBase: { ...current.gameBase, threads } }
        break
      }
      case "settings/reset": {
        const settings = clone(seed.settings)
        if (current.activeUserId && current.activeUserId !== guestId) settingsByUser[current.activeUserId] = clone(settings)
        next = { ...current, settings }
        break
      }
      case "power/request":
        if (current.powerMode !== "on") return
        if (current.overlayStack.at(-1)?.id === "power-confirm") return
        {
          const returnTo: NavigationEntry = {
            screen: current.screen,
            ...(current.focusedId ? { focusId: current.focusedId } : {}),
            ...(current.selectedGameId ? { gameId: current.selectedGameId } : {}),
          }
          const top = current.overlayStack.at(-1)
          next = epoch({
            ...current,
            overlayStack: [...current.overlayStack, {
              id: "power-confirm",
              returnTo: { entry: returnTo, ...(top ? { parentOverlayId: top.id } : {}) },
              ...(current.focusedId ? { focusId: current.focusedId } : {}),
            }],
            focusedId: undefined,
          })
        }
        break
      case "power/cancel":
        next = closeOverlayState(current)
        if (next === current) return
        break
      case "power/complete": {
        if (action.mode === "rest" || action.mode === "off-simulated") {
          powerReturn = clone(current.navigation)
          const origin = current.overlayStack[0]?.returnTo.entry ?? current.overlayStack.at(-1)?.returnTo.entry
          powerFocus = origin?.focusId ?? current.focusedId
        }
        if (action.mode === "rest") {
          next = epoch({ ...current, screen: "power", navigation: [{ screen: "power" }], overlayStack: [], focusedId: "power-wake", powerMode: "rest" })
        } else if (action.mode === "off-simulated") {
          next = epoch({ ...current, screen: "power", navigation: [{ screen: "power" }], overlayStack: [], focusedId: "power-relaunch", powerMode: "off-simulated", gameSession: { phase: "idle", progress: 0, status: "idle" } })
        } else if (current.powerMode !== "restarting") {
          // The host owns the deterministic delay. The first completion enters
          // the visible restart state; the host dispatches this action again
          // after its epoch-guarded timer to finish the local reboot.
          next = epoch({ ...current, screen: "power", navigation: [{ screen: "power" }], overlayStack: [], focusedId: undefined, powerMode: "restarting" })
        } else {
          next = epoch({ ...current, screen: "boot-users", navigation: [{ screen: "boot-users" }], overlayStack: [], focusedId: undefined, activeUserId: undefined, boot: { status: "loading", userSelected: false }, powerMode: "on", gameSession: { phase: "idle", progress: 0, status: "idle" }, screenStatus: { ...current.screenStatus, "boot-users": "loading" } })
        }
        break
      }
      case "power/wake":
        if (current.powerMode !== "rest") return
        next = epoch({
          ...current,
          powerMode: "on",
          navigation: powerReturn?.length ? clone(powerReturn) : [{ screen: "home" }],
          screen: powerReturn?.at(-1)?.screen ?? "home",
          overlayStack: [],
          focusedId: powerFocus,
        })
        powerReturn = undefined
        powerFocus = undefined
        break
      case "power/relaunch":
        if (current.powerMode !== "off-simulated") return
        next = epoch({ ...current, powerMode: "on", screen: "boot-users", navigation: [{ screen: "boot-users" }], overlayStack: [], focusedId: undefined, activeUserId: undefined, boot: { status: "loading", userSelected: false }, gameSession: { phase: "idle", progress: 0, status: "idle" }, screenStatus: { ...current.screenStatus, "boot-users": "loading" } })
        powerReturn = undefined
        powerFocus = undefined
        break
      default:
        return
    }
    commit(next, isDurableAction(action))
  }

  const actions: Ps5Actions = {
    dispatch,
    go(screen, entry) {
      const current = state()
      const homeIndex = entry?.gameId ? findHomeIndex(current.homeTiles, entry.gameId) : -1
      const returnOverlayStack = current.overlayStack.length > 0 ? clone(current.overlayStack) : undefined
      commit(navigate({
        ...current,
        overlayStack: [],
        ...(entry?.gameId ? { selectedGameId: entry.gameId } : {}),
        ...(homeIndex >= 0 ? { homeIndex } : {}),
      }, screen, { ...entry, ...(returnOverlayStack ? { returnOverlayStack } : {}) }), false)
    },
    back() { dispatch({ type: "back" }) },
    setFocus(id) { dispatch({ type: "focus/set", id }) },
    openOverlay(id) { dispatch({ type: "overlay/open", id }) },
    closeOverlay() { dispatch({ type: "overlay/close" }) },
    moveHome(delta) { dispatch({ type: "home/move", delta }) },
    selectGame(id) {
      const current = state()
      const index = findHomeIndex(current.homeTiles, id)
      if (index < 0) return
      commit({ ...current, selectedGameId: id, homeIndex: index, focusedId: `home-tile-${id}` }, false)
    },
    selectHomeTile(tile) { dispatch({ type: "home/select", tile }) },
    startGame(id) { dispatch({ type: "game/start", gameId: id }) },
    cancelGameLaunch() { dispatch({ type: "game/cancel" }) },
    selectRecentGame(id) { dispatch({ type: "switcher/select", gameId: id }) },
    resumeRecentGame(id) { dispatch({ type: "switcher/resume", gameId: id }) },
    setSetting(key, value) { dispatch({ type: "setting/set", key, value } as Ps5Action) },
    setTextField(id, value) { if (id === "library-query") dispatch({ type: "library/query", value }) },
    startDownload(gameId) { dispatch({ type: "download/start", gameId }) },
    cancelDownload(id) { dispatch({ type: "download/cancel", id }) },
    completeDownload(id) { dispatch({ type: "download/complete", id }) },
    uninstallGame(gameId) { dispatch({ type: "game/uninstall", gameId }) },
    setDownload(id, status) { dispatch({ type: "download/set", id, status }) },
    setNotificationRead(id, read) { dispatch({ type: "notification/read", id, read }) },
    setControlOrder(order) { dispatch({ type: "control/set-order", order }) },
    setControlVisibility(id, visible) { dispatch({ type: "control/set-visibility", id, visible }) },
    requestPower(mode) { dispatch({ type: "power/request", mode }) },
    cancelPower() { dispatch({ type: "power/cancel" }) },
    wakePower() { dispatch({ type: "power/wake" }) },
    relaunchDemo() { dispatch({ type: "power/relaunch" }) },
  }

  return { state, actions }
}
