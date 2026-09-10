import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import sharp from "sharp"
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
const artifactDir = resolve(import.meta.dir, "../../../scripts/ps5-demo/artifacts")

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function readyHome() {
  const store = createPs5Store(createDefaultSeed())
  store.actions.dispatch({ type: "boot/finish" })
  store.actions.dispatch({ type: "user/select", userId: store.state().users[0]!.id })
  return store
}

function regionCoverage(pixels: Uint8Array, x: number, y: number, regionWidth: number, regionHeight: number) {
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

function longestBrightRun(pixels: Uint8Array, x: number, y: number, regionWidth: number, regionHeight: number) {
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

function metrics(pixels: Uint8Array) {
  const reference = [pixels[0]!, pixels[1]!, pixels[2]!]
  let alpha = 0
  let meaningful = 0
  let colorful = 0
  let min = 255
  let max = 0
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index]!
    const green = pixels[index + 1]!
    const blue = pixels[index + 2]!
    const opacity = pixels[index + 3]!
    if (opacity > 0) alpha++
    min = Math.min(min, red, green, blue)
    max = Math.max(max, red, green, blue)
    if (Math.abs(red - reference[0]!) + Math.abs(green - reference[1]!) + Math.abs(blue - reference[2]!) > 24 && red + green + blue > 18) meaningful++
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 40 && red + green + blue > 120) colorful++
  }
  const scale = Math.min(width / 1920, height / 1080)
  const rowX = Math.round(homeRow.x * scale)
  const rowY = Math.round(homeRow.y * scale)
  const rowWidth = Math.round(homeRow.width * scale)
  const rowHeight = Math.round(homeRow.height * scale)
  const bottomY = height - Math.round(148 * scale)
  return {
    alphaPixels: alpha,
    meaningfulPixels: meaningful,
    colorfulPixels: colorful,
    rgbRange: max - min,
    homeRowCoverage: regionCoverage(pixels, rowX, rowY, rowWidth, rowHeight),
    homeRowBrightRun: longestBrightRun(pixels, rowX, rowY, rowWidth, rowHeight),
    controlCenterCoverage: regionCoverage(pixels, 0, bottomY, width, height - bottomY),
  }
}

async function capture(controlCenter: boolean) {
  const store = readyHome()
  const nativeFocus = { value: null as string | null }
  const startedAt = performance.now()
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
  return {
    store,
    result,
    nativeFocus,
    elapsedMs: Math.round(performance.now() - startedAt),
    frameCount: 2 + 1 + settleFrames + (controlCenter ? 1 : 0),
  }
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

async function writePng(name: string, pixels: Uint8Array) {
  await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } }).png().toFile(resolve(artifactDir, name))
}

await mkdir(artifactDir, { recursive: true })
const home = await capture(false)
const center = await capture(true)
const homeMetrics = metrics(home.result.pixels)
const centerMetrics = metrics(center.result.pixels)

if (home.store.state().screen !== "home" || home.store.state().overlayStack.length !== 0) throw new Error("mock Home capture did not remain on the Home screen")
if (center.store.state().screen !== "home" || center.store.state().overlayStack.at(-1)?.id !== "control-center") throw new Error("mock Control Center capture did not open over Home")
if (center.store.state().controlCenter.selectedCard !== "home") throw new Error("mock Control Center capture did not select Home")
if (home.nativeFocus.value !== `home-tile-${home.store.state().selectedGameId}`) throw new Error(`mock Home capture focus mismatch: ${home.nativeFocus.value ?? "none"}`)
if (center.nativeFocus.value !== "control-home") throw new Error(`mock Control Center capture focus mismatch: ${center.nativeFocus.value ?? "none"}`)
if (homeMetrics.meaningfulPixels <= 1_000 || homeMetrics.colorfulPixels <= 100 || homeMetrics.homeRowCoverage <= 0.05 || homeMetrics.homeRowBrightRun <= 24) throw new Error("mock Home capture lacks meaningful row output")
if (centerMetrics.meaningfulPixels <= 1_000 || centerMetrics.rgbRange <= 20 || centerMetrics.controlCenterCoverage <= 0.02) throw new Error("mock Control Center capture lacks meaningful overlay output")

const shots = [
  {
    route: "home",
    path: "app-source-public-offscreen-mock-home-1672x941.png",
    ...homeMetrics,
    elapsedMs: home.elapsedMs,
    frameCount: home.frameCount,
  },
  {
    route: "control-center",
    path: "app-source-public-offscreen-mock-control-center-1672x941.png",
    ...centerMetrics,
    elapsedMs: center.elapsedMs,
    frameCount: center.frameCount,
  },
]
await writePng(shots[0]!.path, home.result.pixels)
await writePng(shots[1]!.path, center.result.pixels)

const report = {
  layer: "source-public-offscreen",
  renderer: "real GPU render-to-buffer adapter",
  source: "examples/ps5/src/app.tsx",
  approvedMock: {
    width,
    height,
    clock: "21:08",
    activeScreen: "home",
    controlCenterSelectedCard: "home",
  },
  screenshots: shots,
  checks: {
    exactViewport: shots.every((shot) => shot.path.endsWith("1672x941.png")),
    meaningfulHomeRow: homeMetrics.homeRowCoverage > 0.05 && homeMetrics.homeRowBrightRun > 24,
    meaningfulControlCenter: centerMetrics.controlCenterCoverage > 0.02,
    physicalTerminalAssertions: false,
    physicalFpsOrInputLatency: false,
  },
}
await Bun.write(resolve(artifactDir, "app-source-public-offscreen-mock.json"), JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(report))
