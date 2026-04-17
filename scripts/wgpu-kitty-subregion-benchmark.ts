import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"
import { createTerminal } from "@tge/platform-terminal"
import { patchRegion, transmitRawAt } from "@tge/output-kitty"
import {
  createWgpuCanvasContext,
  createWgpuCanvasTarget,
  destroyWgpuCanvasContext,
  destroyWgpuCanvasTarget,
  readbackWgpuCanvasTargetRGBA,
  readbackWgpuCanvasTargetRegionRGBA,
  renderWgpuCanvasTargetClear,
} from "@tge/gpu"

const WIDTH = Number(process.env.TGE_WGPU_SUBREGION_WIDTH ?? 320)
const HEIGHT = Number(process.env.TGE_WGPU_SUBREGION_HEIGHT ?? 180)
const PATCH = Number(process.env.TGE_WGPU_SUBREGION_PATCH ?? 64)
const ITERATIONS = Number(process.env.TGE_WGPU_SUBREGION_ITERS ?? 12)
const OUTPUT_PATH = process.env.TGE_WGPU_SUBREGION_OUT ?? "/tmp/tge-wgpu-subregion-benchmark.json"

function avg(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
}

async function main() {
  const term = await createTerminal({ skipColors: true })
  if (!term.caps.kittyGraphics) throw new Error("Kitty graphics support is required for this benchmark")

  const ctx = createWgpuCanvasContext()
  const target = createWgpuCanvasTarget(ctx, { width: WIDTH, height: HEIGHT })
  const imageId = 9200
  const patchX = Math.max(0, Math.floor((WIDTH - PATCH) / 2))
  const patchY = Math.max(0, Math.floor((HEIGHT - PATCH) / 2))

  try {
    renderWgpuCanvasTargetClear(ctx, target, 0x3b82f6ff)
    const full = readbackWgpuCanvasTargetRGBA(ctx, target, WIDTH * HEIGHT * 4)
    term.beginSync()
    transmitRawAt(term.write, { data: full.data, width: WIDTH, height: HEIGHT }, imageId, 0, 0, {
      z: -1,
      mode: term.caps.transmissionMode,
      compress: false,
      format: 32,
    })
    term.endSync()

    const fullPathTimes: number[] = []
    const regionPathTimes: number[] = []
    const fullReadbackTimes: number[] = []
    const regionReadbackTimes: number[] = []

    for (let i = 0; i < ITERATIONS; i++) {
      const readbackStart = performance.now()
      const frame = readbackWgpuCanvasTargetRGBA(ctx, target, WIDTH * HEIGHT * 4)
      fullReadbackTimes.push(performance.now() - readbackStart)

      term.beginSync()
      const txStart = performance.now()
      transmitRawAt(term.write, { data: frame.data, width: WIDTH, height: HEIGHT }, imageId, 0, 0, {
        z: -1,
        mode: term.caps.transmissionMode,
        compress: false,
        format: 32,
      })
      term.endSync()
      fullPathTimes.push(performance.now() - txStart)
    }

    for (let i = 0; i < ITERATIONS; i++) {
      const readbackStart = performance.now()
      const region = readbackWgpuCanvasTargetRegionRGBA(ctx, target, { x: patchX, y: patchY, width: PATCH, height: PATCH })
      regionReadbackTimes.push(performance.now() - readbackStart)

      term.beginSync()
      const txStart = performance.now()
      patchRegion(term.write, imageId, region.data, patchX, patchY, PATCH, PATCH, {
        mode: term.caps.transmissionMode,
        compress: false,
      })
      term.endSync()
      regionPathTimes.push(performance.now() - txStart)
    }

    const result = {
      transmissionMode: term.caps.transmissionMode,
      width: WIDTH,
      height: HEIGHT,
      patchSize: PATCH,
      iterations: ITERATIONS,
      fullReadbackAvgMs: Number(avg(fullReadbackTimes).toFixed(2)),
      regionReadbackAvgMs: Number(avg(regionReadbackTimes).toFixed(2)),
      fullTransmitAvgMs: Number(avg(fullPathTimes).toFixed(2)),
      patchTransmitAvgMs: Number(avg(regionPathTimes).toFixed(2)),
      fullPathAvgMs: Number((avg(fullReadbackTimes) + avg(fullPathTimes)).toFixed(2)),
      regionPathAvgMs: Number((avg(regionReadbackTimes) + avg(regionPathTimes)).toFixed(2)),
      deltaMs: Number(((avg(fullReadbackTimes) + avg(fullPathTimes)) - (avg(regionReadbackTimes) + avg(regionPathTimes))).toFixed(2)),
      note: "This benchmark compares full-frame WGPU readback + raw Kitty transmit against region readback + Kitty patchRegion.",
    }

    writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
  } finally {
    destroyWgpuCanvasTarget(ctx, target)
    destroyWgpuCanvasContext(ctx)
    term.destroy()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
