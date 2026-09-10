import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDefaultSeed } from "../src/catalog"
import { createPs5Store } from "../src/store"

let temp: string | undefined

beforeEach(() => {
  temp = mkdtempSync(join(tmpdir(), "vexart-ps5-store-"))
})

afterEach(() => {
  if (temp) rmSync(temp, { recursive: true, force: true })
  temp = undefined
})

describe("PS5 catalog and shared store", () => {
  test("creates canonical local assets and the 26-tile home", () => {
    const seed = createDefaultSeed()
    const store = createPs5Store(seed)
    const state = store.state()

    expect(seed.catalog).toHaveLength(24)
    expect(seed.storage.usedGb).toBe(seed.catalog.filter((entry) => entry.installed).reduce((sum, entry) => sum + entry.sizeGb, 0))
    expect(seed.storage.usedGb).toBeLessThanOrEqual(seed.storage.capacityGb)
    expect(state.homeTiles).toHaveLength(26)
    expect(state.homeTiles[0]).toEqual({ kind: "utility", id: "store" })
    expect(state.homeTiles.at(-1)).toEqual({ kind: "utility", id: "library" })
    expect(seed.catalog.every((entry) => entry.cover.startsWith("/"))).toBe(true)
    expect(seed.catalog.every((entry) => entry.hero.startsWith("/"))).toBe(true)
  })

  test("restores exact focus through nested overlays in LIFO order", () => {
    const store = createPs5Store(createDefaultSeed())
    store.actions.dispatch({ type: "boot/finish" })
    store.actions.dispatch({ type: "user/select", userId: "alex" })
    store.actions.setFocus("home-play")
    store.actions.openOverlay("control-center")
    store.actions.setFocus("control-switcher")
    store.actions.openOverlay("switcher")

    expect(store.state().overlayStack.map((entry) => entry.id)).toEqual(["control-center", "switcher"])
    store.actions.closeOverlay()
    expect(store.state().focusedId).toBe("control-switcher")
    store.actions.closeOverlay()
    expect(store.state().focusedId).toBe("home-play")
    expect(store.state().overlayStack).toHaveLength(0)
  })

  test("restores a control-center origin after screen navigation without resurrecting stale history", () => {
    const store = createPs5Store(createDefaultSeed())
    store.actions.dispatch({ type: "boot/finish" })
    store.actions.dispatch({ type: "user/select", userId: "alex" })
    store.actions.setFocus("home-play")
    store.actions.openOverlay("control-center")
    store.actions.setFocus("control-profile")
    store.actions.go("profile")

    expect(store.state().overlayStack).toHaveLength(0)
    expect(store.state().navigation.at(-1)?.returnOverlayStack?.map((entry) => entry.id)).toEqual(["control-center"])
    store.actions.back()
    expect(store.state().screen).toBe("home")
    expect(store.state().overlayStack.map((entry) => entry.id)).toEqual(["control-center"])
    expect(store.state().focusedId).toBe("control-profile")

    store.actions.go("profile")
    store.actions.openOverlay("options")
    store.actions.setFocus("options-close")
    store.actions.closeOverlay()
    expect(store.state().navigation.at(-1)?.returnOverlayStack?.map((entry) => entry.id)).toEqual(["control-center"])
    store.actions.back()
    expect(store.state().overlayStack.map((entry) => entry.id)).toEqual(["control-center"])
    expect(store.state().focusedId).toBe("control-profile")

    store.actions.go("profile")
    store.actions.back()
    expect(store.state().overlayStack.map((entry) => entry.id)).toEqual(["control-center"])
    expect(store.state().focusedId).toBe("control-profile")
    store.actions.closeOverlay()
    expect(store.state().overlayStack).toHaveLength(0)
    expect(store.state().focusedId).toBe("home-play")
  })

  test("completing a download is idempotent and updates installation, storage, and notifications once", () => {
    const seed = createDefaultSeed()
    const game = seed.catalog.find((entry) => !entry.installed)!
    const store = createPs5Store(seed)
    const usedBefore = store.state().storage.usedGb

    store.actions.startDownload(game.id)
    const download = store.state().downloads.find((entry) => entry.gameId === game.id)!
    store.actions.setDownload(download.id, "downloading")
    store.actions.setDownload(download.id, "downloading")
    store.actions.completeDownload(download.id)
    store.actions.completeDownload(download.id)

    const state = store.state()
    expect(state.catalog.find((entry) => entry.id === game.id)?.installed).toBe(true)
    expect(state.storage.installedGameIds.filter((id) => id === game.id)).toHaveLength(1)
    expect(state.storage.usedGb).toBe(usedBefore + game.sizeGb)
    expect(state.downloads.find((entry) => entry.id === download.id)?.status).toBe("complete")
    expect(state.notifications.filter((entry) => entry.title === "Juego instalado")).toHaveLength(1)
  })

  test("cancelling a download is idempotent without touching storage", () => {
    const seed = createDefaultSeed()
    const game = seed.catalog.find((entry) => !entry.installed)!
    const store = createPs5Store(seed)
    const storageBefore = store.state().storage

    store.actions.startDownload(game.id)
    const downloadId = store.state().downloads[0].id
    store.actions.cancelDownload(downloadId)
    store.actions.cancelDownload(downloadId)

    expect(store.state().storage).toEqual(storageBefore)
    expect(store.state().downloads[0].status).toBe("cancelled")
    expect(store.state().notifications.filter((entry) => entry.title === "Descarga cancelada")).toHaveLength(1)
  })

  test("control media and Game Base reducers apply every local action", () => {
    const store = createPs5Store(createDefaultSeed())

    store.actions.dispatch({ type: "control/music", action: "next" })
    expect(store.state().music.selectedTrackId).toBe("game-theme")
    expect(store.state().music.playing).toBe(true)
    store.actions.dispatch({ type: "control/music", action: "previous" })
    expect(store.state().music.selectedTrackId).toBe("menu-theme")

    store.actions.dispatch({ type: "gamebase/message", threadId: "thread-demo", body: "Hola desde la demo" })
    expect(store.state().gameBase.threads).toHaveLength(1)
    expect(store.state().gameBase.threads[0].messages[0].body).toBe("Hola desde la demo")
    store.actions.dispatch({ type: "gamebase/message", threadId: "thread-demo", body: "Segundo mensaje" })
    expect(store.state().gameBase.threads[0].messages).toHaveLength(2)
    store.actions.dispatch({ type: "gamebase/tab", tab: "messages" })
    expect(store.state().gameBase.tab).toBe("messages")
    store.actions.dispatch({ type: "gamebase/messages-clear", threadId: "thread-demo" })
    expect(store.state().gameBase.threads[0].messages).toHaveLength(0)

    store.actions.dispatch({ type: "gamebase/party", party: { id: "party-demo", memberIds: ["alex"], title: "Demo" } })
    expect(store.state().gameBase.parties.some((party) => party.id === "party-demo")).toBe(true)
    store.actions.dispatch({ type: "gamebase/party-leave", partyId: "party-demo" })
    expect(store.state().gameBase.parties.some((party) => party.id === "party-demo")).toBe(false)

    const gameId = store.state().catalog.find((entry) => entry.installed)!.id
    store.actions.startGame(gameId)
    expect(store.state().recentGameIds).toContain(gameId)
    store.actions.dispatch({ type: "game/close" })
    expect(store.state().screen).toBe("home")
    expect(store.state().recentGameIds).not.toContain(gameId)
  })

  test("settings reset restores defaults and the active user's persisted profile", () => {
    const seed = createDefaultSeed()
    const store = createPs5Store(seed)
    store.actions.dispatch({ type: "boot/finish" })
    store.actions.dispatch({ type: "user/select", userId: "alex" })
    store.actions.setSetting("reduceMotion", true)
    store.actions.dispatch({ type: "settings/reset" })
    expect(store.state().settings).toEqual(seed.settings)

    store.actions.setSetting("highContrast", true)
    store.actions.dispatch({ type: "user/select", userId: "sam" })
    store.actions.dispatch({ type: "user/select", userId: "alex" })
    expect(store.state().settings.highContrast).toBe(true)
    expect(store.state().settings.reduceMotion).toBe(false)
  })

  test("malformed persistence falls back to seed and valid settings persist per user", () => {
    const path = join(temp!, "state.json")
    writeFileSync(path, "{ definitely not json", "utf8")
    const seed = createDefaultSeed()
    const first = createPs5Store(seed, { persistence: path })
    expect(first.state().users).toHaveLength(seed.users.length)
    expect(first.state().storage).toEqual(seed.storage)

    first.actions.dispatch({ type: "boot/finish" })
    first.actions.dispatch({ type: "user/select", userId: "alex" })
    first.actions.setSetting("reduceMotion", true)

    const second = createPs5Store(seed, { persistence: path })
    second.actions.dispatch({ type: "boot/finish" })
    second.actions.dispatch({ type: "user/select", userId: "alex" })
    expect(second.state().settings.reduceMotion).toBe(true)
    expect(second.state().catalog[0].cover).toBe(seed.catalog[0].cover)
  })

  test("power simulation never calls host operations and only relaunches from off-simulated", () => {
    const store = createPs5Store(createDefaultSeed())
    store.actions.dispatch({ type: "boot/finish" })
    store.actions.dispatch({ type: "user/select", userId: "alex" })
    store.actions.setFocus("home-play")
    store.actions.requestPower("rest")
    expect(store.state().overlayStack.at(-1)?.id).toBe("power-confirm")
    store.actions.dispatch({ type: "power/complete", mode: "rest" })
    expect(store.state().powerMode).toBe("rest")
    store.actions.wakePower()
    expect(store.state().powerMode).toBe("on")
    expect(store.state().screen).toBe("home")
    expect(store.state().focusedId).toBe("home-play")

    const centerRest = createPs5Store(createDefaultSeed())
    centerRest.actions.dispatch({ type: "boot/finish" })
    centerRest.actions.dispatch({ type: "user/select", userId: "alex" })
    centerRest.actions.setFocus("home-play")
    centerRest.actions.openOverlay("control-center")
    centerRest.actions.setFocus("control-power")
    centerRest.actions.requestPower("rest")
    centerRest.actions.dispatch({ type: "power/complete", mode: "rest" })
    centerRest.actions.wakePower()
    expect(centerRest.state().screen).toBe("home")
    expect(centerRest.state().focusedId).toBe("home-play")

    store.actions.requestPower("off-simulated")
    store.actions.dispatch({ type: "power/complete", mode: "off-simulated" })
    expect(store.state().powerMode).toBe("off-simulated")
    store.actions.wakePower()
    expect(store.state().powerMode).toBe("off-simulated")
    store.actions.relaunchDemo()
    expect(store.state().powerMode).toBe("on")
    expect(store.state().screen).toBe("boot-users")
    expect(store.state().activeUserId).toBeUndefined()

    const restart = createPs5Store(createDefaultSeed())
    restart.actions.dispatch({ type: "boot/finish" })
    restart.actions.dispatch({ type: "user/select", userId: "alex" })
    restart.actions.requestPower("restarting")
    restart.actions.dispatch({ type: "power/complete", mode: "restarting" })
    expect(restart.state().powerMode).toBe("restarting")
    restart.actions.dispatch({ type: "power/complete", mode: "restarting" })
    expect(restart.state().powerMode).toBe("on")
    expect(restart.state().screen).toBe("boot-users")
  })
})
