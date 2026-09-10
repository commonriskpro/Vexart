import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import sharp from "sharp"
import { focusedId } from "vexart"

import { Ps5App } from "../src/app"
import { createDefaultSeed } from "../src/catalog"
import { createPs5Store } from "../src/store"
import { renderToBufferAfterInteractions, type RenderToBufferResult } from "../../../packages/engine/src/testing/render-to-buffer"

const width = 1280
const height = 720
const settleMs = 180
const settleFrames = 6
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

async function tabTo(keyPress: (key: string, char?: string) => Promise<void>, id: string) {
  for (let index = 0; index < 160; index++) {
    if (focusedId() === id) return
    await keyPress("tab")
  }
  throw new Error(`secondary visual focus target was not reachable: ${id}; received ${focusedId() ?? "none"}`)
}

async function openSettingsCategory(
  keyPress: (key: string, char?: string) => Promise<void>,
  frame: () => Promise<void>,
  index: number,
) {
  await tabTo(keyPress, "settings-category-system")
  for (let step = 0; step < index; step++) await keyPress("down")
  await keyPress("enter")
  await frame()
}

function metrics(pixels: Uint8Array) {
  let alphaPixels = 0
  let meaningfulPixels = 0
  let min = 255
  let max = 0
  const reference = [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0]
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0
    const green = pixels[index + 1] ?? 0
    const blue = pixels[index + 2] ?? 0
    if ((pixels[index + 3] ?? 0) > 0) alphaPixels++
    min = Math.min(min, red, green, blue)
    max = Math.max(max, red, green, blue)
    if (Math.abs(red - reference[0]!) + Math.abs(green - reference[1]!) + Math.abs(blue - reference[2]!) > 24 && red + green + blue > 18) meaningfulPixels++
  }
  return { alphaPixels, meaningfulPixels, rgbRange: max - min }
}

async function writePng(name: string, result: RenderToBufferResult) {
  await sharp(Buffer.from(result.pixels), {
    raw: { width: result.width, height: result.height, channels: 4 },
  }).png().toFile(resolve(artifactDir, name))
}

type Capture = {
  name: string
  result: RenderToBufferResult
  focus: string | null
  state: ReturnType<typeof readyHome>
}

async function captureSettings(name: string, categoryIndex: number, adjust: (keyPress: CaptureKeyPress) => Promise<void>) {
  const store = readyHome()
  store.actions.go("settings")
  let focus: string | null = null
  const result = await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame, keyPress }) => {
      await frame()
      await openSettingsCategory(keyPress, frame, categoryIndex)
      await adjust(keyPress)
      await wait(settleMs)
      for (let index = 0; index < settleFrames; index++) await frame()
      focus = focusedId()
    },
    3,
  )
  await writePng(name, result)
  return { name, result, focus, state: store }
}

type CaptureKeyPress = (key: string, char?: string) => Promise<void>

async function captureLaunchTitle(name: string) {
  const store = readyHome()
  const gameId = store.state().selectedGameId!
  store.actions.startGame(gameId)
  let focus: string | null = null
  const result = await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={width} height={height} />,
    width,
    height,
    async ({ frame }) => {
      await frame()
      await wait(1_650)
      await frame()
      await wait(settleMs)
      for (let index = 0; index < settleFrames; index++) await frame()
      focus = focusedId()
      if (focus !== "launch-continue") throw new Error(`launch title focus mismatch: ${focus ?? "none"}`)
    },
    3,
  )
  await writePng(name, result)
  return { name, result, focus, state: store }
}

await mkdir(artifactDir, { recursive: true })

const captures: Capture[] = [
  await captureSettings("secondary-settings-screen-sound-1280x720.png", 1, async (keyPress) => {
    await keyPress("left")
    await keyPress("left")
  }),
  await captureSettings("secondary-settings-accessibility-1280x720.png", 2, async (keyPress) => {
    await keyPress("enter")
  }),
  await captureSettings("secondary-settings-network-1280x720.png", 4, async (keyPress) => {
    await keyPress("right")
  }),
  await captureLaunchTitle("secondary-launch-title-1280x720.png"),
]

const screenshots = captures.map((capture) => ({
  path: capture.name,
  focus: capture.focus,
  screen: capture.state.state().screen,
  phase: capture.state.state().gameSession.phase,
  ...metrics(capture.result.pixels),
}))

const report = {
  layer: "source-public-offscreen",
  renderer: "real GPU render-to-buffer adapter",
  source: "examples/ps5/src/app.tsx",
  viewport: { width, height },
  screenshots,
  checks: {
    allScreenshotsMeaningful: screenshots.every((shot) => shot.alphaPixels > 0 && shot.meaningfulPixels > 1_000 && shot.rgbRange > 20),
    settingsDetailsMounted: screenshots.slice(0, 3).every((shot) => shot.screen === "settings"),
    launchTitleMounted: screenshots[3]?.screen === "launch" && screenshots[3]?.phase === "title",
    physicalTerminalAssertions: false,
  },
}

if (!report.checks.allScreenshotsMeaningful || !report.checks.settingsDetailsMounted || !report.checks.launchTitleMounted) {
  throw new Error(`secondary visual capture checks failed: ${JSON.stringify(report.checks)}`)
}

await Bun.write(resolve(artifactDir, "secondary-visual.json"), JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(report))
