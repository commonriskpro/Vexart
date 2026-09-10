import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"

import { Ps5App } from "../src/app"
import { createDefaultSeed } from "../src/catalog"
import { createPs5Store } from "../src/store"
import { renderToBufferAfterInteractions } from "../../../packages/engine/src/testing/render-to-buffer"

type Viewport = { width: number; height: number }

const viewports: Viewport[] = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]
const cycles = 2
const artifactDir = resolve(import.meta.dir, "../../../scripts/ps5-demo/artifacts")

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))
  return sorted[index] ?? 0
}

function pixelsAreMeaningful(pixels: Uint8Array) {
  let nonzero = 0
  let min = 255
  let max = 0
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0
    const green = pixels[index + 1] ?? 0
    const blue = pixels[index + 2] ?? 0
    min = Math.min(min, red, green, blue)
    max = Math.max(max, red, green, blue)
    if (red + green + blue > 18) nonzero++
  }
  return { nonzero, rgbRange: max - min }
}

async function runViewport(viewport: Viewport) {
  const seed = createDefaultSeed()
  const store = createPs5Store(seed)
  store.actions.dispatch({ type: "boot/finish" })
  store.actions.dispatch({ type: "user/select", userId: store.state().users[0]!.id })
  const gameIds = seed.catalog.map((game) => game.id)
  const installedIds = new Set(seed.catalog.filter((game) => game.installed).map((game) => game.id))
  const frameTimes: number[] = []
  let actionCount = 0
  const startedAt = performance.now()
  const result = await renderToBufferAfterInteractions(
    () => <Ps5App store={store} width={viewport.width} height={viewport.height} />,
    viewport.width,
    viewport.height,
    async ({ frame }) => {
      const measureFrame = async () => {
        const frameStartedAt = performance.now()
        await frame()
        frameTimes.push(performance.now() - frameStartedAt)
      }

      await measureFrame()
      for (let cycle = 0; cycle < cycles; cycle++) {
        for (const gameId of gameIds) {
          store.actions.selectGame(gameId)
          actionCount++
          await measureFrame()
          if (!installedIds.has(gameId)) continue

          store.actions.startGame(gameId)
          actionCount++
          await measureFrame()
          store.actions.dispatch({ type: "game/advance", phase: "title", progress: 100 })
          actionCount++
          await measureFrame()
          store.actions.openOverlay("control-center")
          actionCount++
          await measureFrame()
          store.actions.closeOverlay()
          actionCount++
          await measureFrame()
          store.actions.dispatch({ type: "game/close" })
          actionCount++
          await measureFrame()
        }
        store.actions.go("library")
        actionCount++
        await measureFrame()
        store.actions.go("settings")
        actionCount++
        await measureFrame()
        store.actions.back()
        actionCount++
        await measureFrame()
        store.actions.go("home")
        actionCount++
        await measureFrame()
      }
    },
    2,
  )
  const elapsedMs = performance.now() - startedAt
  const metrics = pixelsAreMeaningful(result.pixels)
  return {
    viewport,
    cycles,
    catalogGames: gameIds.length,
    installedGames: installedIds.size,
    actionCount,
    frames: frameTimes.length,
    elapsedMs: Math.round(elapsedMs),
    frameMs: {
      p50: Math.round(percentile(frameTimes, 0.5) * 100) / 100,
      p95: Math.round(percentile(frameTimes, 0.95) * 100) / 100,
      max: Math.round(Math.max(...frameTimes) * 100) / 100,
    },
    pixels: result.pixels.length,
    nonzeroPixels: metrics.nonzero,
    rgbRange: metrics.rgbRange,
    finalScreen: store.state().screen,
    finalOverlayCount: store.state().overlayStack.length,
  }
}

await mkdir(artifactDir, { recursive: true })
const results = []
for (const viewport of viewports) results.push(await runViewport(viewport))

const report = {
  kind: "ps5-offscreen-stress",
  renderer: "real GPU render-to-buffer adapter",
  results,
  checks: {
    allFramesMeaningful: results.every((result) => result.nonzeroPixels > 1_000 && result.rgbRange > 20),
    routesRecovered: results.every((result) => result.finalScreen === "home" && result.finalOverlayCount === 0),
    physicalTerminalAssertions: false,
    physicalFpsOrInputLatency: false,
    certifiedPerformance: false,
    gpuMatrix: "current-host-only",
  },
}

if (!report.checks.allFramesMeaningful || !report.checks.routesRecovered) {
  throw new Error(`PS5 stress checks failed: ${JSON.stringify(report.checks)}`)
}

await Bun.write(resolve(artifactDir, "stress-report.json"), JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(report))
