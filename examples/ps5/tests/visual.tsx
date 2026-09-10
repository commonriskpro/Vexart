import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import sharp from "sharp"

import { Ps5App } from "../src/app"
import { createDefaultSeed } from "../src/catalog"
import { createPs5Store } from "../src/store"
import { renderToBufferAfterInteractions } from "../../../packages/engine/src/testing/render-to-buffer"

type Viewport = { width: number; height: number }
type VisualRoute =
  | "seed"
  | "home"
  | "control-center"
  | "game-hub"
  | "launch"
  | "library"
  | "settings"
  | "profile"
  | "notifications"
  | "game-base"
  | "store-media"
  | "gallery"
  | "power"
  | "switcher"
  | "options"

const viewports: Viewport[] = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]

const artifactDir = resolve(import.meta.dir, "../../../scripts/ps5-demo/artifacts")
const settleMs = 200
const settleFrames = 8

function createAppState(route: VisualRoute) {
  const seed = createDefaultSeed()
  const store = createPs5Store(seed)
  if (route !== "seed") {
    store.actions.dispatch({ type: "boot/finish" })
    store.actions.dispatch({ type: "user/select", userId: store.state().users[0]!.id })
  }

  const gameId = seed.catalog.find((entry) => entry.installed)?.id ?? seed.catalog[0]!.id
  if (route === "game-hub" || route === "gallery") store.actions.go(route, { gameId })
  if (route === "launch") store.actions.startGame(gameId)
  if (route === "library" || route === "settings" || route === "profile" || route === "notifications" || route === "game-base" || route === "store-media") {
    store.actions.go(route)
  }
  if (route === "power") {
    store.actions.requestPower("rest")
    store.actions.dispatch({ type: "power/complete", mode: "rest" })
  }
  if (route === "switcher") {
    store.actions.startGame(gameId)
    store.actions.dispatch({ type: "game/advance", phase: "title", progress: 100 })
    store.actions.openOverlay("switcher")
  }
  if (route === "options") store.actions.openOverlay("options")
  return store
}

function alphaPixels(pixels: Uint8Array) {
  let count = 0
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index]! > 0) count++
  }
  return count
}

function meaningfulPixels(pixels: Uint8Array) {
  let count = 0
  let min = 255
  let max = 0
  const reference = [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0]
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0
    const green = pixels[index + 1] ?? 0
    const blue = pixels[index + 2] ?? 0
    const brightness = red + green + blue
    min = Math.min(min, red, green, blue)
    max = Math.max(max, red, green, blue)
    if (Math.abs(red - reference[0]!) + Math.abs(green - reference[1]!) + Math.abs(blue - reference[2]!) > 24 && brightness > 18) count++
  }
  let colorful = 0
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0
    const green = pixels[index + 1] ?? 0
    const blue = pixels[index + 2] ?? 0
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 40 && red + green + blue > 120) colorful++
  }
  return { count, range: max - min, colorful }
}

await mkdir(artifactDir, { recursive: true })

const screenshots: Array<{
  route: VisualRoute
  width: number
  height: number
  path: string
  alphaPixels: number
  meaningfulPixels: number
  colorfulPixels: number
  rgbRange: number
  elapsedMs: number
  frameCount: number
}> = []

const routes: VisualRoute[] = [
  "seed", "home", "control-center", "game-hub", "launch", "library", "settings",
  "profile", "notifications", "game-base", "store-media", "gallery", "power", "switcher", "options",
]
const imageRoutes = new Set<VisualRoute>(["home", "game-hub", "launch", "library", "profile", "store-media", "gallery", "switcher"])

for (const viewport of viewports) {
  for (const route of routes) {
    const store = createAppState(route)
    const scene = () => <Ps5App store={store} width={viewport.width} height={viewport.height} />
    const startedAt = performance.now()
    const result = await renderToBufferAfterInteractions(scene, viewport.width, viewport.height, async ({ keyPress, frame }) => {
      if (route === "control-center") await keyPress("f1")
      await new Promise<void>((resolve) => setTimeout(resolve, settleMs))
      for (let index = 0; index < settleFrames; index++) await frame()
    }, 2)
    const elapsedMs = performance.now() - startedAt
    const alpha = alphaPixels(result.pixels)
    const meaningful = meaningfulPixels(result.pixels)
    const name = `app-source-public-offscreen-${route}-${viewport.width}x${viewport.height}.png`
    const path = resolve(artifactDir, name)
    await sharp(Buffer.from(result.pixels), {
      raw: { width: result.width, height: result.height, channels: 4 },
    }).png().toFile(path)
    screenshots.push({
      route,
      width: viewport.width,
      height: viewport.height,
      path: name,
      alphaPixels: alpha,
      meaningfulPixels: meaningful.count,
      colorfulPixels: meaningful.colorful,
      rgbRange: meaningful.range,
      elapsedMs: Math.round(elapsedMs),
      frameCount: 2 + settleFrames + (route === "control-center" ? 1 : 0),
    })
  }
}

const report = {
  layer: "source-public-offscreen",
  renderer: "real GPU render-to-buffer adapter",
  source: "examples/ps5/src/app.tsx",
  routes,
  screenshots,
  checks: {
    allRequestedViewports: screenshots.length === routes.length * viewports.length
      && screenshots.every((shot) => shot.alphaPixels > 0
        && shot.meaningfulPixels > 1_000
        && shot.rgbRange > 20
        && (!imageRoutes.has(shot.route) || shot.colorfulPixels > 100)),
    physicalTerminalAssertions: false,
    physicalFpsOrInputLatency: false,
  },
}

await Bun.write(resolve(artifactDir, "app-source-public-offscreen.json"), JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(report))
