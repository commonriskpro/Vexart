import { expect, test } from "bun:test"
import { focusedId } from "vexart"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { Ps5App } from "../src/app"
import { createDefaultSeed } from "../src/catalog"
import { createPs5Store } from "../src/store"
import { renderToBufferAfterInteractions } from "../../../packages/engine/src/testing/render-to-buffer"

const width = 1280
const height = 720

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function pixelDelta(first: Uint8Array, second: Uint8Array) {
  let changed = 0
  for (let index = 0; index < Math.min(first.length, second.length); index++) {
    if (Math.abs(first[index]! - second[index]!) > 4) changed++
  }
  return changed
}

function readyHome(options: Parameters<typeof createPs5Store>[1] = {}) {
  const store = createPs5Store(createDefaultSeed(), options)
  store.actions.dispatch({ type: "boot/finish" })
  store.actions.dispatch({ type: "user/select", userId: store.state().users[0]!.id })
  return store
}

async function tabTo(keyPress: (key: string, char?: string) => Promise<void>, id: string) {
  for (let index = 0; index < 160; index++) {
    if (focusedId() === id) return
    await keyPress("tab")
  }
  throw new Error(`public focus target was not reachable: ${id}; received ${focusedId() ?? "none"}`)
}

async function tabToPrefix(keyPress: (key: string, char?: string) => Promise<void>, prefix: string) {
  for (let index = 0; index < 160; index++) {
    const id = focusedId()
    if (id?.startsWith(prefix)) return id
    await keyPress("tab")
  }
  throw new Error(`public focus target prefix was not reachable: ${prefix}; received ${focusedId() ?? "none"}`)
}

async function focusSelectedHomeTile(
  keyPress: (key: string, char?: string) => Promise<void>,
  store: ReturnType<typeof readyHome>,
) {
  for (let index = 0; index < store.state().homeTiles.length + 8; index++) {
    if (focusedId()?.startsWith("home-tile-")) break
    await keyPress("tab")
  }
  expect(focusedId()?.startsWith("home-tile-")).toBe(true)
  const selectedIndex = store.state().homeIndex
  await keyPress("home")
  for (let index = 0; index < selectedIndex; index++) await keyPress("right")
}

test("public screen entries restore the exact Home opener focus", async () => {
  const store = readyHome()
  const entries = [
    ["home-settings", "settings"],
    ["home-search", "library"],
    ["home-profile", "profile"],
    ["home-tab-media", "store-media"],
  ] as const

  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await frame()
      for (const [opener, screen] of entries) {
        await tabTo(keyPress, opener)
        await keyPress("enter")
        await frame()
        expect(store.state().screen).toBe(screen)
        expect(focusedId()).toBeTruthy()
        await keyPress("escape")
        await frame()
        expect(store.state().screen).toBe("home")
        expect(focusedId()).toBe(opener)
      }
    },
    3,
  )
})

test("gallery navigation preserves game identity and hub focus", async () => {
  const store = readyHome()
  const gameId = store.state().selectedGameId!

  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await frame()
      await focusSelectedHomeTile(keyPress, store)
      expect(focusedId()).toBe(`home-tile-${gameId}`)
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("game-hub")
      await tabTo(keyPress, "hub-card-0")
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("game-hub")
      expect(focusedId()).toBe("hub-activity-close")
      await keyPress("escape")
      await frame()
      expect(store.state().screen).toBe("game-hub")
      expect(focusedId()).toBe("hub-card-0")
      await tabTo(keyPress, "hub-card-2")
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("gallery")
      expect(store.state().selectedGameId).toBe(gameId)
      await keyPress("escape")
      await frame()
      expect(store.state().screen).toBe("game-hub")
      expect(focusedId()).toBe("hub-card-2")
      await keyPress("escape")
      await frame()
      expect(store.state().screen).toBe("home")
      expect(focusedId()).toBe(`home-tile-${gameId}`)
    },
    3,
  )
})

test("settings changes persist through the real settings control", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "vexart-ps5-settings-")), "state.json")
  try {
    const store = readyHome({ persistence: path })
    await renderToBufferAfterInteractions(
      () => <Ps5App store={store} width={width} height={height} />,
      width,
      height,
      async ({ frame, keyPress }) => {
        await frame()
        await tabTo(keyPress, "home-settings")
        await keyPress("enter")
        await frame()
        expect(store.state().screen).toBe("settings")
        await tabTo(keyPress, "settings-category-accessibility")
        await keyPress("enter")
        await frame()
        await tabTo(keyPress, "settings-accessibility-reduce-motion")
        await keyPress("enter")
        await frame()
        expect(store.state().settings.reduceMotion).toBe(true)
      },
      3,
    )

    const restored = readyHome({ persistence: path })
    expect(restored.state().settings.reduceMotion).toBe(true)
  } finally {
    rmSync(path, { force: true })
    rmSync(join(path, ".."), { recursive: true, force: true })
  }
})

test("settings controls change the real GPU output, not only labels", async () => {
  const renderAccessibility = async (changes: { highContrast?: boolean; textScale?: "large" }) => {
    const store = readyHome()
    const result = await renderToBufferAfterInteractions(
      () => <Ps5App store={store} width={width} height={height} />,
      width,
      height,
      async ({ frame, keyPress }) => {
        await frame()
        await tabTo(keyPress, "home-settings")
        await keyPress("enter")
        await frame()
        await tabTo(keyPress, "settings-category-accessibility")
        await keyPress("enter")
        await frame()
        if (changes.highContrast) {
          await tabTo(keyPress, "settings-accessibility-high-contrast")
          await keyPress("enter")
          await frame()
        }
        await tabTo(keyPress, "settings-accessibility-text-large")
        if (changes.textScale) await keyPress("enter")
        await frame()
      },
      3,
    )
    expect(result.pixels.some((pixel, index) => index % 4 === 3 && pixel > 0)).toBe(true)
    return { result, store }
  }

  const baseline = await renderAccessibility({})
  const highContrast = await renderAccessibility({ highContrast: true })
  const largeText = await renderAccessibility({ textScale: "large" })

  expect(highContrast.store.state().settings.highContrast).toBe(true)
  expect(largeText.store.state().settings.textScale).toBe("large")
  expect(pixelDelta(baseline.result.pixels, highContrast.result.pixels)).toBeGreaterThan(5_000)
  expect(pixelDelta(baseline.result.pixels, largeText.result.pixels)).toBeGreaterThan(5_000)

  const renderBrightness = async (decrements: number) => {
    const store = readyHome()
    const result = await renderToBufferAfterInteractions(
      () => <Ps5App store={store} width={width} height={height} />,
      width,
      height,
      async ({ frame, keyPress }) => {
        await frame()
        await tabTo(keyPress, "home-settings")
        await keyPress("enter")
        await frame()
        await tabTo(keyPress, "settings-category-screen-sound")
        await keyPress("enter")
        await frame()
        await tabTo(keyPress, "settings-screen-sound-brightness")
        for (let index = 0; index < decrements; index++) await keyPress("left")
        await frame()
      },
      3,
    )
    return { result, store }
  }

  const normalBrightness = await renderBrightness(0)
  const dimmed = await renderBrightness(8)
  expect(dimmed.store.state().settings.brightness).toBe(normalBrightness.store.state().settings.brightness - 40)
  expect(pixelDelta(normalBrightness.result.pixels, dimmed.result.pixels)).toBeGreaterThan(5_000)
})

test("library search and installed filter use public input", async () => {
  const store = readyHome()
  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await frame()
      await tabTo(keyPress, "home-search")
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("library")
      await tabTo(keyPress, "library-query")
      for (const char of "ghost") await keyPress(char, char)
      expect(store.state().library.query).toBe("ghost")
      await keyPress("backspace")
      expect(store.state().library.query).toBe("ghos")
      await keyPress("enter")
      await tabTo(keyPress, "library-tab-installed")
      await keyPress("enter")
      await frame()
      expect(store.state().library.tab).toBe("installed")
    },
    3,
  )
})

test("library list detail opens and closes with exact list focus", async () => {
  const store = readyHome()
  const gameId = store.state().selectedGameId!
  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await frame()
      expect(focusedId()).toBe(`home-tile-${gameId}`)

      // Add the selected game through the actual Options overlay so the list
      // route is seeded by public input rather than a reducer shortcut.
      await keyPress("f2")
      await frame()
      await tabTo(keyPress, "options-add-to-list")
      await keyPress("enter")
      expect(store.state().library.lists.some((list) => list.id === "ps5-favorites" && list.gameIds.includes(gameId))).toBe(true)
      await keyPress("escape")
      await frame()
      expect(store.state().overlayStack).toHaveLength(0)

      await tabTo(keyPress, "home-search")
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("library")
      await tabTo(keyPress, "library-tab-lists")
      await keyPress("enter")
      await frame()
      expect(store.state().library.tab).toBe("lists")
      await tabTo(keyPress, "library-list-ps5-favorites")
      await keyPress("enter")
      await frame()
      expect(focusedId()).toBe(`library-list-game-${gameId}`)
      await keyPress("escape")
      await frame()
      expect(store.state().screen).toBe("library")
      expect(focusedId()).toBe("library-list-ps5-favorites")
      await keyPress("escape")
      await frame()
      expect(store.state().screen).toBe("home")
      expect(focusedId()).toBe("home-search")
    },
    3,
  )
})

test("clearing a notification detail restores the next surviving row", async () => {
  const store = readyHome()
  const games = store.state().catalog.filter((entry) => !entry.installed).slice(0, 2)
  expect(games).toHaveLength(2)
  for (const game of games) {
    store.actions.startDownload(game!.id)
    store.actions.setDownload(`download-${game!.id}`, "downloading")
    store.actions.completeDownload(`download-${game!.id}`)
  }
  const notifications = store.state().notifications
  expect(notifications).toHaveLength(2)
  const firstId = notifications[0]!.id
  const secondId = notifications[1]!.id

  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await frame()
      await keyPress("f1")
      await frame()
      await tabTo(keyPress, "control-notifications")
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("notifications")
      await tabTo(keyPress, `notification-${firstId}`)
      await keyPress("enter")
      await frame()
      expect(store.state().overlayStack.at(-1)?.id).toBe("notification-detail")
      await tabTo(keyPress, "notification-detail-clear")
      await keyPress("enter")
      await frame()
      expect(store.state().notifications.some((entry) => entry.id === firstId)).toBe(false)
      expect(store.state().notifications.some((entry) => entry.id === secondId)).toBe(true)
      expect(store.state().overlayStack).toHaveLength(0)
      expect(focusedId()).toBe(`notification-${secondId}`)
    },
    3,
  )
})

test("download completion updates catalog, storage, and notification state", async () => {
  const store = readyHome()
  const before = store.state().storage.usedGb
  const game = store.state().catalog.find((entry) => !entry.installed)!
  const gameIndex = store.state().homeTiles.findIndex((tile) => tile.kind === "game" && tile.id === game.id)

  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ clickAt, frame, keyPress }) => {
      await frame()
      await focusSelectedHomeTile(keyPress, store)
      for (let index = store.state().homeIndex; index < gameIndex; index++) await keyPress("right")
      await clickAt(width * 0.15, height * 0.54)
      expect(store.state().downloads[0]?.status).toBe("downloading")
      await wait(3_350)
      await frame()
      expect(store.state().downloads[0]?.status).toBe("complete")
    },
    3,
  )

  expect(store.state().catalog.find((entry) => entry.id === game.id)?.installed).toBe(true)
  expect(store.state().storage.usedGb).toBe(before + game.sizeGb)
  expect(store.state().notifications.some((entry) => entry.target?.gameId === game.id)).toBe(true)
})

test("profile and Game Base remain local and reachable through Control Center", async () => {
  const store = readyHome()
  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await frame()
      await tabTo(keyPress, "home-profile")
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("profile")
      await tabToPrefix(keyPress, "profile-tab-")
      await keyPress("right")
      await frame()
      expect(store.state().profile.tab).toBe("trophies")
      await keyPress("escape")
      await frame()
      expect(store.state().screen).toBe("home")

      await keyPress("f1")
      await frame()
      await tabTo(keyPress, "control-profile")
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("profile")
      expect(store.state().overlayStack).toHaveLength(0)
      await keyPress("escape")
      await frame()
      expect(store.state().screen).toBe("home")
      expect(store.state().overlayStack.at(-1)?.id).toBe("control-center")
      expect(focusedId()).toBe("control-profile")
      await keyPress("escape")
      await frame()
      expect(store.state().overlayStack).toHaveLength(0)
      expect(store.state().screen).toBe("home")
      // Closing the restored Control Center must leave the Home focus scope
      // usable; verify a real Home control remains reachable without opening
      // it (a stale overlay scope can otherwise orphan the entire row).
      await tabTo(keyPress, "home-settings")
      expect(focusedId()).toBe("home-settings")

      await keyPress("f1")
      await frame()
      await tabTo(keyPress, "control-game-base")
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("game-base")
      await tabTo(keyPress, "gamebase-tab-friends")
      await keyPress("right")
      await frame()
      expect(store.state().gameBase.tab).toBe("parties")
      await keyPress("right")
      await frame()
      expect(store.state().gameBase.tab).toBe("messages")
      await keyPress("escape")
      await frame()
      expect(store.state().screen).toBe("home")
      expect(store.state().overlayStack.at(-1)?.id).toBe("control-center")
      expect(focusedId()).toBe("control-game-base")
      await keyPress("escape")
      await frame()
      expect(store.state().overlayStack).toHaveLength(0)
      expect(store.state().screen).toBe("home")
      // Repeat after Game Base's restored-scope close, which exercises the
      // reverse navigation path independently of the profile route.
      await tabTo(keyPress, "home-settings")
      expect(focusedId()).toBe("home-settings")
    },
    3,
  )
})

test("control-center music cycles tracks through the mounted branch", async () => {
  const store = readyHome()
  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await frame()
      await keyPress("f1")
      await frame()
      await tabTo(keyPress, "control-music")
      await keyPress("enter")
      await frame()
      expect(store.state().overlayStack.at(-1)?.id).toBe("control-music")
      await tabTo(keyPress, "music-track-menu-theme")
      await keyPress("right")
      expect(store.state().music.selectedTrackId).toBe("game-theme")
      expect(focusedId()).toBe("music-track-game-theme")
      await keyPress("left")
      expect(store.state().music.selectedTrackId).toBe("menu-theme")
      expect(focusedId()).toBe("music-track-menu-theme")
      await keyPress("escape")
      await frame()
      expect(store.state().overlayStack.at(-1)?.id).toBe("control-center")
      expect(focusedId()).toBe("control-music")
      await keyPress("escape")
      await frame()
      expect(store.state().overlayStack).toHaveLength(0)
      expect(store.state().screen).toBe("home")
    },
    3,
  )
})

test("Switcher is a nested overlay and Escape pops one layer at a time", async () => {
  const store = readyHome()
  const gameId = store.state().selectedGameId!
  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await frame()
      await focusSelectedHomeTile(keyPress, store)
      await keyPress("enter")
      await frame()
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("launch")
      expect(store.state().recentGameIds).toContain(gameId)
      await keyPress("f1")
      await frame()
      await tabTo(keyPress, "control-switcher")
      await keyPress("enter")
      await frame()
      expect(store.state().overlayStack.map((entry) => entry.id)).toEqual(["control-center", "switcher"])
      await keyPress("escape")
      await frame()
      expect(store.state().overlayStack.map((entry) => entry.id)).toEqual(["control-center"])
      expect(focusedId()).toBe("control-switcher")
      await keyPress("escape")
      await frame()
      expect(store.state().overlayStack).toHaveLength(0)
      expect(store.state().screen).toBe("launch")
    },
    3,
  )
})
