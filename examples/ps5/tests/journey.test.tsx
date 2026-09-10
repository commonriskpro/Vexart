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

function readyStore() {
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

test("launch timer is cancelled by navigation and cannot resurrect title", async () => {
  const store = readyStore()

  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await openGameHub(keyPress, frame, store)
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("launch")
      expect(store.state().gameSession.phase).toBe("launching")

      // Cancel before the mounted host's 300ms launch step. The stale timer
      // must fail the store epoch guard rather than advance a hidden launch.
      const canceledEpoch = store.state().transitionEpoch
      await wait(100)
      await keyPress("escape")
      await frame()
      expect(store.state().screen).toBe("game-hub")
      expect(store.state().gameSession.phase).toBe("idle")
      expect(store.state().transitionEpoch).toBeGreaterThan(canceledEpoch)

      await wait(360)
      await frame()
      expect(store.state().gameSession.phase).toBe("idle")
      expect(store.state().screen).toBe("game-hub")
    },
    2,
  )
})

test("control center navigation does not stall launch or downloads", async () => {
  const store = readyStore()

  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ clickAt, frame, keyPress }) => {
      const downloadIndex = store.state().homeTiles.findIndex((tile) => tile.kind === "game" && !store.state().catalog.find((entry) => entry.id === tile.id)?.installed)
      expect(downloadIndex).toBeGreaterThan(0)
      for (let index = store.state().homeIndex; index < downloadIndex; index++) await keyPress("right")
      await clickAt(width * 0.15, height * 0.54)
      const startedDownload = store.state().downloads[0]
      expect(startedDownload?.status).toBe("downloading")
      const downloadId = startedDownload!.id

      // Pointer activation focuses the Play/Download action. Restore the
      // selected tile through the public keyboard path before navigating to
      // the installed neighbor below; do not mutate selection in the test.
      const downloadTile = store.state().homeTiles[downloadIndex]
      expect(downloadTile?.kind).toBe("game")
      await tabTo(keyPress, `home-tile-${downloadTile!.id}`)

      const installedIndex = store.state().homeTiles.findIndex((tile) => tile.kind === "game" && store.state().catalog.find((entry) => entry.id === tile.id)?.installed)
      for (let index = store.state().homeIndex; index > installedIndex; index--) await keyPress("left")
      await openGameHub(keyPress, frame, store)
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("launch")
      await keyPress("f1")
      await frame()
      expect(store.state().overlayStack.at(-1)?.id).toBe("control-center")
      const progressBeforeClose = store.state().downloads[0]!.progress
      const launchBeforeClose = store.state().gameSession.progress

      await wait(100)
      await keyPress("escape")
      await frame()
      expect(store.state().overlayStack).toHaveLength(0)
      await wait(420)
      await frame()

      const completedDownload = store.state().downloads.find((entry) => entry.id === downloadId)!
      expect(completedDownload.progress).toBeGreaterThan(progressBeforeClose)
      expect(store.state().gameSession.progress).toBeGreaterThan(launchBeforeClose)
      expect(store.state().gameSession.phase).not.toBe("idle")
      expect(store.state().overlayStack).toHaveLength(0)
    },
    2,
  )
})

async function openGameHub(
  keyPress: (key: string, char?: string) => Promise<void>,
  frame: () => Promise<void>,
  store: ReturnType<typeof readyStore>,
) {
  const gameId = store.state().selectedGameId!
  expect(store.state().screen).toBe("home")
  await tabTo(keyPress, `home-tile-${gameId}`)
  expect(focusedId()).toBe(`home-tile-${gameId}`)
  await keyPress("enter")
  await frame()
  expect(store.state().screen).toBe("game-hub")
}

test("home traverses all 26 tiles, restores focus from hub, and reaches title", async () => {
  const store = readyStore()
  const gameId = store.state().selectedGameId!

  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await frame()
      const homeFocus = focusedId()
      expect(homeFocus).toBe(`home-tile-${gameId}`)
      expect(store.state().homeTiles).toHaveLength(26)

      // The Store utility is index 0 and Library is index 25. Exercise the
      // actual keyboard path and clamp at both ends rather than mutating the
      // store's selection directly.
      for (let index = 0; index < 25; index++) await keyPress("right")
      expect(store.state().homeIndex).toBe(25)
      expect(focusedId()).toBe("home-tile-library")
      await keyPress("right")
      expect(store.state().homeIndex).toBe(25)
      await keyPress("home")
      expect(store.state().homeIndex).toBe(0)
      expect(focusedId()).toBe("home-tile-store")
      await keyPress("right")
      expect(store.state().homeIndex).toBe(1)
      expect(focusedId()).toBe(`home-tile-${gameId}`)

      await openGameHub(keyPress, frame, store)
      await keyPress("escape")
      await frame()
      expect(store.state().screen).toBe("home")
      expect(focusedId()).toBe(homeFocus)

      await openGameHub(keyPress, frame, store)
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("launch")
      expect(store.state().gameSession.phase).toBe("launching")
      await wait(1_650)
      await frame()
      expect(store.state().gameSession.phase).toBe("title")
      expect(focusedId()).toBe("launch-continue")
    },
    2,
  )
})

test("Escape during a mounted launch cancels it and blocks stale title", async () => {
  const store = readyStore()

  await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await frame()
      await openGameHub(keyPress, frame, store)
      await keyPress("enter")
      await frame()
      expect(store.state().screen).toBe("launch")
      expect(store.state().gameSession.phase).toBe("launching")

      await wait(100)
      await keyPress("escape")
      await frame()
      expect(store.state().screen).toBe("game-hub")
      expect(store.state().gameSession.phase).toBe("idle")
      await wait(420)
      await frame()
      expect(store.state().screen).toBe("game-hub")
      expect(store.state().gameSession.phase).toBe("idle")
    },
    2,
  )
})
