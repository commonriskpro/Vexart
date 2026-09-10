import { expect, test } from "bun:test"
import { focusedId } from "vexart"

import { Ps5App } from "../src/app"
import { createDefaultSeed } from "../src/catalog"
import { createPs5Store } from "../src/store"
import { renderToBufferAfterInteractions } from "../../../packages/engine/src/testing/render-to-buffer"

const viewports = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function readyHome() {
  const store = createPs5Store(createDefaultSeed())
  store.actions.dispatch({ type: "boot/finish" })
  store.actions.dispatch({ type: "user/select", userId: store.state().users[0]!.id })
  return store
}

function viewportCoverage(pixels: Uint8Array, width: number, height: number) {
  const reference = [pixels[0]!, pixels[1]!, pixels[2]!]
  let varied = 0
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const difference = Math.max(
      Math.abs(pixels[offset]! - reference[0]!),
      Math.abs(pixels[offset + 1]! - reference[1]!),
      Math.abs(pixels[offset + 2]! - reference[2]!),
    )
    if (difference >= 8) varied++
  }
  return varied / (width * height)
}

function pixelDelta(left: Uint8Array, right: Uint8Array) {
  let delta = 0
  for (let index = 0; index < left.length; index += 4) {
    delta += Math.abs(left[index]! - right[index]!)
    delta += Math.abs(left[index + 1]! - right[index + 1]!)
    delta += Math.abs(left[index + 2]! - right[index + 2]!)
  }
  return delta
}

function regionCoverage(pixels: Uint8Array, width: number, x: number, y: number, regionWidth: number, regionHeight: number) {
  const start = (y * width + x) * 4
  const reference = [pixels[start]!, pixels[start + 1]!, pixels[start + 2]!]
  let varied = 0
  for (let row = y; row < y + regionHeight; row++) {
    for (let column = x; column < x + regionWidth; column++) {
      const offset = (row * width + column) * 4
      const difference = Math.max(
        Math.abs(pixels[offset]! - reference[0]!),
        Math.abs(pixels[offset + 1]! - reference[1]!),
        Math.abs(pixels[offset + 2]! - reference[2]!),
      )
      if (difference >= 8) varied++
    }
  }
  return varied / (regionWidth * regionHeight)
}

function longestBrightRun(pixels: Uint8Array, width: number, x: number, y: number, regionWidth: number, regionHeight: number) {
  let longest = 0
  for (let row = y; row < y + regionHeight; row++) {
    let run = 0
    for (let column = x; column < x + regionWidth; column++) {
      const offset = (row * width + column) * 4
      const bright = pixels[offset]! > 205 && pixels[offset + 1]! > 205 && pixels[offset + 2]! > 205
      run = bright ? run + 1 : 0
      longest = Math.max(longest, run)
    }
  }
  return longest
}

// The approved Home mock keeps the Store utility and Library utility fixed
// around a clipped game rail: Store starts at design x45, the rail starts at
// x189 and spans x748, and Library starts at x951. Keep the ROI wide enough
// to include the selected Library card while staying inside that mock row.
const homeRow = { x: 45, y: 120, width: 1080, height: 192 }

async function focusSelectedTile(
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

for (const viewport of viewports) {
  test(`source-public Home renders and traverses all 26 tiles at ${viewport.width}x${viewport.height}`, async () => {
    const startStore = readyHome()
    const startFocus = { value: null as string | null }
    const start = await renderToBufferAfterInteractions(
      () => <Ps5App store={startStore} width={viewport.width} height={viewport.height} />,
      viewport.width,
      viewport.height,
      async ({ frame, keyPress }) => {
        await frame()
        await focusSelectedTile(keyPress, startStore)
        startFocus.value = focusedId()
      },
      4,
    )

    expect(startStore.state().screen).toBe("home")
    expect(startStore.state().homeTiles).toHaveLength(26)
    const firstGameIndex = startStore.state().homeTiles.findIndex((tile) => tile.kind === "game" && tile.id === startStore.state().selectedGameId)
    expect(firstGameIndex).toBeGreaterThan(0)
    expect(startStore.state().homeIndex).toBe(firstGameIndex)
    expect(startFocus.value).toBe(`home-tile-${startStore.state().selectedGameId}`)

    const endStore = readyHome()
    const endFocus = { value: null as string | null }
    const end = await renderToBufferAfterInteractions(
      () => <Ps5App store={endStore} width={viewport.width} height={viewport.height} />,
      viewport.width,
      viewport.height,
      async ({ frame, keyPress }) => {
        await frame()
        await focusSelectedTile(keyPress, endStore)
        expect(focusedId()).toBe(`home-tile-${endStore.state().selectedGameId}`)

        // Walk through every tile, including both utility endpoints. The
        // logical tile list must stay at the full 26 entries while the row is
        // clipped to the viewport by the public scene.
        const lastIndex = endStore.state().homeTiles.length - 1
        const toEnd = lastIndex - endStore.state().homeIndex
        for (let index = 0; index < toEnd; index++) await keyPress("right")
        expect(endStore.state().homeIndex).toBe(25)
        expect(focusedId()).toBe("home-tile-library")

        const toStart = endStore.state().homeIndex
        for (let index = 0; index < toStart; index++) await keyPress("left")
        expect(endStore.state().homeIndex).toBe(0)
        expect(focusedId()).toBe("home-tile-store")
        const toEndAgain = lastIndex - endStore.state().homeIndex
        for (let index = 0; index < toEndAgain; index++) await keyPress("right")
        expect(endStore.state().homeIndex).toBe(25)
        await keyPress("left")
        await wait(360)
        await frame()
        endFocus.value = focusedId()
      },
      4,
    )

    const farGame = endStore.state().homeTiles[24]
    expect(farGame?.kind).toBe("game")
    if (!farGame || farGame.kind !== "game") throw new Error("expected the last game tile before Library")
    expect(endStore.state().screen).toBe("home")
    expect(endStore.state().homeTiles).toHaveLength(26)
    expect(endStore.state().homeIndex).toBe(24)
    expect(endStore.state().selectedGameId).toBe(farGame.id)
    expect(endFocus.value).toBe(`home-tile-${farGame.id}`)

    const startCoverage = viewportCoverage(start.pixels, start.width, start.height)
    const endCoverage = viewportCoverage(end.pixels, end.width, end.height)
    const scale = Math.min(viewport.width / 1920, viewport.height / 1080)
    const rowX = Math.round(homeRow.x * scale)
    const rowY = Math.round(homeRow.y * scale)
    const rowWidth = Math.round(homeRow.width * scale)
    const rowHeight = Math.round(homeRow.height * scale)
    const startRowCoverage = regionCoverage(start.pixels, start.width, rowX, rowY, rowWidth, rowHeight)
    const endRowCoverage = regionCoverage(end.pixels, end.width, rowX, rowY, rowWidth, rowHeight)
    expect(startCoverage).toBeGreaterThan(0.02)
    expect(endCoverage).toBeGreaterThan(0.02)
    expect(startRowCoverage).toBeGreaterThan(0.05)
    expect(endRowCoverage).toBeGreaterThan(0.05)
    expect(pixelDelta(start.pixels, end.pixels)).toBeGreaterThan(10_000)
  })

  test(`source-public Home keeps focused tiles visible at first, middle, and last positions with reduced motion at ${viewport.width}x${viewport.height}`, async () => {
    const scale = Math.min(viewport.width / 1920, viewport.height / 1080)
    const rowX = Math.round(homeRow.x * scale)
    const rowY = Math.round(homeRow.y * scale)
    const rowWidth = Math.round(homeRow.width * scale)
    const rowHeight = Math.round(homeRow.height * scale)
    const targets = [1, 13, 25]

    for (const target of targets) {
      const store = readyHome()
      store.actions.setSetting("reduceMotion", true)
      const nativeFocus = { value: null as string | null }
      const result = await renderToBufferAfterInteractions(
        () => <Ps5App store={store} width={viewport.width} height={viewport.height} />,
        viewport.width,
        viewport.height,
        async ({ frame, keyPress }) => {
          await frame()
          await focusSelectedTile(keyPress, store)
          await keyPress("home")
          const distance = target - store.state().homeIndex
          if (distance > 0) {
            for (let index = 0; index < distance; index++) await keyPress("right")
          }
          await frame()
          nativeFocus.value = focusedId()
        },
        4,
      )
      expect(store.state().screen).toBe("home")
      expect(store.state().homeIndex).toBe(target)
      expect(store.state().focusedId).toBe(`home-tile-${store.state().homeTiles[target]!.id}`)
      expect(nativeFocus.value).toBe(store.state().focusedId ?? null)
      // The focused border is a real white paint run in the Home row. This
      // catches a selected card whose logical index changes but whose actual
      // transformed bounds are outside the clipped viewport.
      expect(longestBrightRun(result.pixels, result.width, rowX, rowY, rowWidth, rowHeight)).toBeGreaterThan(24)
    }
  })
}
