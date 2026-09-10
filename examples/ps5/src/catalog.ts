import { resolve } from "node:path"
import catalogJson from "../catalog.json"
import type { DemoUser, GameCatalogEntry, GameList, GameId, LocalChatThread, LocalParty, MusicState, Ps5Seed, SettingsState, SoundState, MicrophoneState, AccessoriesState, StorageState } from "./types"

const exampleRoot = resolve(import.meta.dir, "..")

function assetPath(path: string) {
  return resolve(exampleRoot, path)
}

function absoluteCatalog() {
  return (catalogJson as GameCatalogEntry[]).map((entry) => ({
    ...entry,
    cover: assetPath(entry.cover),
    hero: assetPath(entry.hero),
    titleScreen: assetPath(entry.titleScreen),
    ...(entry.logo ? { logo: assetPath(entry.logo) } : {}),
    activities: entry.activities.map((activity) => ({ ...activity })),
    trophies: entry.trophies.map((trophy) => ({ ...trophy })),
  }))
}

const avatar = assetPath("assets/icons/users-three.svg")
const alexAvatar = assetPath("assets/mock/avatar-samurai.png")

const defaultUsers: DemoUser[] = [
  { id: "alex", name: "Alex", handle: "@alex", avatar: alexAvatar, accent: "#5b8cff", lastActiveGame: "ghost-of-tsushima" },
  { id: "sam", name: "Sam", handle: "@sam", avatar, accent: "#c37dff", lastActiveGame: "astro-bot" },
  { id: "guest", name: "Invitado", handle: "@guest", avatar, accent: "#8e98aa" },
]

const defaultSettings: SettingsState = {
  reduceMotion: false,
  highContrast: false,
  textScale: "default",
  brightness: 80,
  volume: 65,
  network: "connected",
}

const defaultStorage: StorageState = {
  usedGb: 0,
  // The catalog is a deliberately expanded local demo library, so use a
  // virtual capacity that can hold every seeded installed title.
  capacityGb: 2000,
  installedGameIds: [],
}

const defaultMusic: MusicState = { selectedTrackId: "menu-theme", playing: false, volume: 60 }
const defaultSound: SoundState = { muted: false, volume: 65, output: "tv-simulated" }
const defaultMicrophone: MicrophoneState = { muted: false, level: 72 }
const defaultAccessories: AccessoriesState = { deviceName: "DualSense inalámbrico", connected: true, battery: 78 }
const defaultThreads: LocalChatThread[] = []
const defaultParties: LocalParty[] = []
const defaultLists: GameList[] = []

export function createDefaultSeed(): Ps5Seed {
  const catalog = absoluteCatalog()
  const installedGameIds = catalog.filter((entry) => entry.installed).map((entry) => entry.id)
  const usedGb = catalog.filter((entry) => entry.installed).reduce((total, entry) => total + entry.sizeGb, 0)
  return {
    users: defaultUsers.map((user) => ({ ...user })),
    catalog,
    settings: { ...defaultSettings },
    storage: { ...defaultStorage, usedGb, installedGameIds },
    lists: defaultLists.map((list) => ({ ...list, gameIds: [...list.gameIds] })),
    gameBase: { threads: [...defaultThreads], parties: [...defaultParties] },
    music: { ...defaultMusic },
    sound: { ...defaultSound },
    microphone: { ...defaultMicrophone },
    accessories: { ...defaultAccessories },
  }
}

export function findGame(catalog: GameCatalogEntry[], gameId: GameId) {
  return catalog.find((entry) => entry.id === gameId)
}
