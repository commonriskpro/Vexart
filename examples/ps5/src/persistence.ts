import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type {
  AccessoriesState,
  DemoUser,
  GameCatalogEntry,
  GameList,
  LocalChatThread,
  LocalParty,
  MicrophoneState,
  MusicState,
  SettingsState,
  SoundState,
  StorageState,
} from "./types"

export type Ps5PersistedCatalogEntry = Pick<GameCatalogEntry, "id" | "installed" | "progress">
export type Ps5PersistedUser = Pick<DemoUser, "id" | "name" | "handle" | "lastActiveGame">

export type Ps5PersistenceSnapshot = {
  version: 1
  /** Mutable user fields only; canonical avatars/accent stay in the seed. */
  users: Ps5PersistedUser[]
  /** Only mutable catalog state is persisted; asset paths stay canonical in the seed. */
  catalog: Ps5PersistedCatalogEntry[]
  settingsByUser: Record<string, SettingsState>
  storage: StorageState
  lists: GameList[]
  gameBase: { threads: LocalChatThread[]; parties: LocalParty[] }
  music: MusicState
  sound: SoundState
  microphone: MicrophoneState
  accessories: AccessoriesState
}

export type Ps5Persistence = {
  load(): Ps5PersistenceSnapshot | undefined
  save(snapshot: Ps5PersistenceSnapshot): void
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isUser(value: unknown): value is Ps5PersistedUser {
  return isObject(value)
    && isString(value.id)
    && isString(value.name)
    && isString(value.handle)
    && (value.lastActiveGame === undefined || isString(value.lastActiveGame))
}

function isCatalogState(value: unknown): value is Ps5PersistedCatalogEntry {
  return isObject(value)
    && isString(value.id)
    && typeof value.installed === "boolean"
    && isNumber(value.progress)
    && value.progress >= 0 && value.progress <= 100
}

function isSettings(value: unknown): value is SettingsState {
  return isObject(value)
    && typeof value.reduceMotion === "boolean"
    && typeof value.highContrast === "boolean"
    && (value.textScale === "small" || value.textScale === "default" || value.textScale === "large")
    && isNumber(value.brightness) && value.brightness >= 0 && value.brightness <= 100
    && isNumber(value.volume) && value.volume >= 0 && value.volume <= 100
    && (value.network === "connected" || value.network === "limited" || value.network === "offline-simulated")
}

function isStorage(value: unknown): value is StorageState {
  return isObject(value)
    && isNumber(value.usedGb)
    && isNumber(value.capacityGb)
    && value.usedGb >= 0
    && value.capacityGb >= 0
    && Array.isArray(value.installedGameIds)
    && value.installedGameIds.every(isString)
}

function isList(value: unknown): value is GameList {
  return isObject(value)
    && isString(value.id)
    && isString(value.name)
    && Array.isArray(value.gameIds)
    && value.gameIds.every(isString)
}

function isThread(value: unknown): value is LocalChatThread {
  return isObject(value)
    && isString(value.id)
    && Array.isArray(value.participantIds)
    && value.participantIds.every(isString)
    && Array.isArray(value.messages)
    && value.messages.every((message) => isObject(message)
      && isString(message.id)
      && isString(message.authorId)
      && isString(message.body)
      && isNumber(message.createdAt))
}

function isParty(value: unknown): value is LocalParty {
  return isObject(value)
    && isString(value.id)
    && isString(value.title)
    && Array.isArray(value.memberIds)
    && value.memberIds.every(isString)
}

function isMusic(value: unknown): value is MusicState {
  return isObject(value) && isString(value.selectedTrackId) && typeof value.playing === "boolean" && isNumber(value.volume) && value.volume >= 0 && value.volume <= 100
}

function isSound(value: unknown): value is SoundState {
  return isObject(value)
    && typeof value.muted === "boolean"
    && isNumber(value.volume)
    && value.volume >= 0 && value.volume <= 100
    && (value.output === "tv-simulated" || value.output === "headset-simulated")
}

function isMicrophone(value: unknown): value is MicrophoneState {
  return isObject(value) && typeof value.muted === "boolean" && isNumber(value.level) && value.level >= 0 && value.level <= 100
}

function isAccessories(value: unknown): value is AccessoriesState {
  return isObject(value) && isString(value.deviceName) && typeof value.connected === "boolean" && isNumber(value.battery) && value.battery >= 0 && value.battery <= 100
}

function isSnapshot(value: unknown): value is Ps5PersistenceSnapshot {
  if (!isObject(value)) return false
  return value.version === 1
    && Array.isArray(value.users)
    && value.users.every(isUser)
    && Array.isArray(value.catalog)
    && value.catalog.every(isCatalogState)
    && isObject(value.settingsByUser)
    && Object.values(value.settingsByUser).every(isSettings)
    && isObject(value.storage)
    && isStorage(value.storage)
    && Array.isArray(value.lists)
    && value.lists.every(isList)
    && isObject(value.gameBase)
    && Array.isArray(value.gameBase.threads)
    && value.gameBase.threads.every(isThread)
    && Array.isArray(value.gameBase.parties)
    && value.gameBase.parties.every(isParty)
    && isMusic(value.music)
    && isSound(value.sound)
    && isMicrophone(value.microphone)
    && isAccessories(value.accessories)
}

function cloneSnapshot(snapshot: Ps5PersistenceSnapshot): Ps5PersistenceSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as Ps5PersistenceSnapshot
}

export function createFilePersistence(path: string): Ps5Persistence {
  return {
    load() {
      try {
        const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
        return isSnapshot(parsed) ? parsed : undefined
      } catch {
        return undefined
      }
    },
    save(snapshot) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify(snapshot), "utf8")
    },
  }
}

export function createMemoryPersistence(initial?: Ps5PersistenceSnapshot): Ps5Persistence {
  let snapshot = initial ? cloneSnapshot(initial) : undefined
  return {
    load() {
      return snapshot ? cloneSnapshot(snapshot) : undefined
    },
    save(next) {
      snapshot = cloneSnapshot(next)
    },
  }
}
