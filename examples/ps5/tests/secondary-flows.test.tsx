import { expect, test } from "bun:test"
import { focusedId } from "vexart"

import { Ps5App } from "../src/app"
import { createDefaultSeed } from "../src/catalog"
import { createPs5Store } from "../src/store"
import { renderToBufferAfterInteractions } from "../../../packages/engine/src/testing/render-to-buffer"

const width = 1280
const height = 720

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function readyHome() {
  const store = createPs5Store(createDefaultSeed())
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

test("settings categories open, back, and adjust through keyboard controls", async () => {
  const store = readyHome()

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
      expect(focusedId()).toBe("settings-category-system")

      await keyPress("down")
      expect(focusedId()).toBe("settings-category-screen-sound")
      await keyPress("enter")
      await frame()
      expect(focusedId()).toBe("settings-screen-sound-brightness")
      const brightness = store.state().settings.brightness
      await keyPress("left")
      expect(store.state().settings.brightness).toBe(brightness - 5)

      // Escape is owned by the mounted Settings screen: first it closes the
      // detail pane and restores the exact category focus.
      await keyPress("escape")
      await frame()
      expect(store.state().screen).toBe("settings")
      expect(focusedId()).toBe("settings-category-screen-sound")

      await keyPress("down")
      expect(focusedId()).toBe("settings-category-accessibility")
      await keyPress("enter")
      await frame()
      expect(focusedId()).toBe("settings-accessibility-reduce-motion")
      await keyPress("enter")
      expect(store.state().settings.reduceMotion).toBe(true)

      await keyPress("escape")
      await frame()
      expect(focusedId()).toBe("settings-category-accessibility")
      await keyPress("down")
      expect(focusedId()).toBe("settings-category-volume")
      await keyPress("enter")
      await frame()
      const volume = store.state().settings.volume
      await keyPress("right")
      expect(store.state().settings.volume).toBe(volume + 5)

      await keyPress("escape")
      await frame()
      expect(focusedId()).toBe("settings-category-volume")
      await keyPress("escape")
      await frame()
      expect(store.state().screen).toBe("home")
      expect(focusedId()).toBe("home-settings")
    },
    3,
  )
})

test("launch advances from loading to title and into suspended state", async () => {
  const store = readyHome()
  const gameId = store.state().selectedGameId!

  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await frame()
      await tabTo(keyPress, `home-tile-${gameId}`)
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("game-hub")
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("launch")
      expect(store.state().gameSession.phase).toBe("launching")

      await wait(1_650)
      await frame()
      expect(store.state().gameSession.phase).toBe("title")
      expect(focusedId()).toBe("launch-continue")

      await keyPress("enter")
      await frame()
      expect(store.state().gameSession.phase).toBe("suspended")
      expect(store.state().gameSession.status).toBe("ready")
      expect(focusedId()).toBe("launch-continue")
    },
    3,
  )
})

function pixelDelta(first: Uint8Array, second: Uint8Array) {
  let changed = 0
  for (let index = 0; index < Math.min(first.length, second.length); index += 4) {
    changed += Math.abs(first[index]! - second[index]!)
    changed += Math.abs(first[index + 1]! - second[index + 1]!)
    changed += Math.abs(first[index + 2]! - second[index + 2]!)
  }
  return changed
}

test("library end navigation scrolls the long catalog and keeps last-card focus", async () => {
  const renderLibrary = async (moveToEnd: boolean) => {
    const store = readyHome()
    const result = await renderToBufferAfterInteractions(
      () => <Ps5App store={store} width={width} height={height} />,
      width,
      height,
      async ({ frame, keyPress }) => {
        await frame()
        await tabTo(keyPress, "home-search")
        await keyPress("enter")
        await frame()
        expect(store.state().screen).toBe("library")
        const firstGameId = store.state().catalog[0]!.id
        const lastGameId = store.state().catalog.at(-1)!.id
        await tabTo(keyPress, `library-game-${firstGameId}`)
        expect(focusedId()).toBe(`library-game-${firstGameId}`)
        if (!moveToEnd) return

        await keyPress("end")
        await frame()
        expect(focusedId()).toBe(`library-game-${lastGameId}`)
      },
      3,
    )
    return { result, store }
  }

  const initial = await renderLibrary(false)
  const end = await renderLibrary(true)
  expect(end.store.state().screen).toBe("library")
  expect(end.store.state().catalog.length).toBeGreaterThan(5)
  expect(pixelDelta(initial.result.pixels, end.result.pixels)).toBeGreaterThan(5_000)
})
