import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"
import { createTerminal } from "@vexart/engine"
import { createLayerComposer } from "@vexart/engine"
import {
  createWgpuCanvasContext,
  createWgpuCanvasTarget,
  destroyWgpuCanvasContext,
  destroyWgpuCanvasTarget,
  readbackWgpuCanvasTargetRGBA,
  renderWgpuCanvasTargetClear,
} from "@vexart/engine"

const WIDTH = Number(process.env.VEXART_WGPU_BENCH_WIDTH ?? 320)
const HEIGHT = Number(process.env.VEXART_WGPU_BENCH_HEIGHT ?? 180)
const ITERATIONS = Number(process.env.VEXART_WGPU_BENCH_ITERS ?? 12)
const OUTPUT_PATH = process.env.VEXART_WGPU_BENCH_OUT ?? "/tmp/tge-wgpu-kitty-raw-benchmark.json"

function avg(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
}

async function main() {
  const term = await createTerminal({ skipColors: true })
  if (!term.caps.kittyGraphics) {
    throw new Error("Kitty graphics support is required for this benchmark")
  }

  const composer = createLayerComposer(term.write, term.rawWrite, term.caps.transmissionMode, false)
  const ctx = createWgpuCanvasContext()
  const target = createWgpuCanvasTarget(ctx, { width: WIDTH, height: HEIGHT })

  try {
    renderWgpuCanvasTargetClear(ctx, target, 0x3b82f6ff)
    const { data, stats } = readbackWgpuCanvasTargetRGBA(ctx, target, WIDTH * HEIGHT * 4)
    const pixelBuf = { data, width: WIDTH, height: HEIGHT, stride: WIDTH * 4 }

    const layerTimes: number[] = []
    const rawTimes: number[] = []

    for (let i = 0; i < ITERATIONS; i++) {
      term.beginSync()
      const start = performance.now()
      composer.renderLayerRaw(pixelBuf.data, pixelBuf.width, pixelBuf.height, 9001, 0, 0, -1, term.size.cellWidth, term.size.cellHeight)
      term.endSync()
      layerTimes.push(performance.now() - start)
    }

    for (let i = 0; i < ITERATIONS; i++) {
      term.beginSync()
      const start = performance.now()
      composer.renderLayerRaw(data, WIDTH, HEIGHT, 9002, 0, 0, -1, term.size.cellWidth, term.size.cellHeight)
      term.endSync()
      rawTimes.push(performance.now() - start)
    }

    const result = {
      transmissionMode: term.caps.transmissionMode,
      width: WIDTH,
      height: HEIGHT,
      iterations: ITERATIONS,
      readbackStats: stats,
      renderLayerAvgMs: Number(avg(layerTimes).toFixed(2)),
      renderLayerRawAvgMs: Number(avg(rawTimes).toFixed(2)),
      deltaMs: Number((avg(layerTimes) - avg(rawTimes)).toFixed(2)),
      note: "This benchmark isolates the output boundary only. It compares Kitty layer transmission with a PixelBuffer-shaped wrapper versus direct raw RGBA bytes from WGPU readback.",
    }
    writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
  } finally {
    composer.destroy()
    destroyWgpuCanvasTarget(ctx, target)
    destroyWgpuCanvasContext(ctx)
    term.destroy()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
