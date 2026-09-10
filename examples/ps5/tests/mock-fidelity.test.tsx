import { expect, test } from "bun:test"
import { focusedId } from "vexart"

import { Ps5App } from "../src/app"
import { createDefaultSeed } from "../src/catalog"
import { createPs5Store } from "../src/store"
import { renderToBufferAfterInteractions } from "../../../packages/engine/src/testing/render-to-buffer"

const width = 1672
const height = 941
const settleMs = 200
const settleFrames = 8
const homeRow = { x: 45, y: 120, width: 1080, height: 192 }

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function readyHome() {
  const store = createPs5Store(createDefaultSeed())
  store.actions.dispatch({ type: "boot/finish" })
  store.actions.dispatch({ type: "user/select", userId: store.state().users[0]!.id })
  return store
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

function meaningfulPixels(pixels: Uint8Array) {
  const reference = [pixels[0]!, pixels[1]!, pixels[2]!]
  let meaningful = 0
  let colorful = 0
  let min = 255
  let max = 0
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index]!
    const green = pixels[index + 1]!
    const blue = pixels[index + 2]!
    min = Math.min(min, red, green, blue)
    max = Math.max(max, red, green, blue)
    if (Math.abs(red - reference[0]!) + Math.abs(green - reference[1]!) + Math.abs(blue - reference[2]!) > 24 && red + green + blue > 18) meaningful++
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 40 && red + green + blue > 120) colorful++
  }
  return { meaningful, colorful, rgbRange: max - min }
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

async function capture(controlCenter: boolean) {
  const store = readyHome()
  const nativeFocus = { value: null as string | null }
  const result = await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await frame()
      await focusSelectedTile(keyPress, store)
      if (controlCenter) await keyPress("f1")
      await wait(settleMs)
      for (let index = 0; index < settleFrames; index++) await frame()
      nativeFocus.value = focusedId()
    },
    2,
  )
  return { store, result, nativeFocus }
}

async function focusSelectedTile(
  keyPress: (key: string, char?: string) => Promise<void>,
  store: ReturnType<typeof readyHome>,
) {
  for (let index = 0; index < store.state().homeTiles.length + 8; index++) {
    if (focusedId()?.startsWith("home-tile-")) break
    await keyPress("tab")
  }
  if (!focusedId()?.startsWith("home-tile-")) throw new Error(`mock Home tile focus was not reachable: ${focusedId() ?? "none"}`)
  const selectedIndex = store.state().homeIndex
  await keyPress("home")
  for (let index = 0; index < selectedIndex; index++) await keyPress("right")
}

test("approved mock viewport renders Home with the selected tile in the clipped rail", async () => {
  const { store, result, nativeFocus } = await capture(false)
  const scale = Math.min(width / 1920, height / 1080)
  const rowX = Math.round(homeRow.x * scale)
  const rowY = Math.round(homeRow.y * scale)
  const rowWidth = Math.round(homeRow.width * scale)
  const rowHeight = Math.round(homeRow.height * scale)
  const metrics = meaningfulPixels(result.pixels)
  const selectedId = store.state().selectedGameId

  expect(result.width).toBe(width)
  expect(result.height).toBe(height)
  expect(store.state().screen).toBe("home")
  expect(store.state().overlayStack).toHaveLength(0)
  expect(store.state().focusedId).toBe(`home-tile-${selectedId}`)
  expect(nativeFocus.value).toBe(`home-tile-${selectedId}`)
  expect(metrics.meaningful).toBeGreaterThan(1_000)
  expect(metrics.rgbRange).toBeGreaterThan(20)
  expect(metrics.colorful).toBeGreaterThan(100)
  expect(regionCoverage(result.pixels, width, rowX, rowY, rowWidth, rowHeight)).toBeGreaterThan(0.05)
  expect(longestBrightRun(result.pixels, width, rowX, rowY, rowWidth, rowHeight)).toBeGreaterThan(24)
})

test("approved mock viewport opens Control Center over active Home without losing Home output", async () => {
  const home = await capture(false)
  const center = await capture(true)
  const scale = Math.min(width / 1920, height / 1080)
  const bottomY = height - Math.round(148 * scale)
  const metrics = meaningfulPixels(center.result.pixels)

  expect(center.result.width).toBe(width)
  expect(center.result.height).toBe(height)
  expect(center.store.state().screen).toBe("home")
  expect(center.store.state().overlayStack.at(-1)?.id).toBe("control-center")
  expect(center.store.state().controlCenter.selectedCard).toBe("home")
  expect(center.store.state().focusedId).toBe("control-home")
  expect(center.nativeFocus.value).toBe("control-home")
  expect(metrics.meaningful).toBeGreaterThan(1_000)
  expect(metrics.rgbRange).toBeGreaterThan(20)
  expect(regionCoverage(center.result.pixels, width, 0, bottomY, width, height - bottomY)).toBeGreaterThan(0.02)
  expect(pixelDelta(home.result.pixels, center.result.pixels)).toBeGreaterThan(10_000)
})
