import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"
import { createTerminal } from "../packages/terminal/src"
import { patchRegion, transmitRawAt } from "../packages/output/src"
import {
  createWgpuCanvasContext,
  createWgpuCanvasTarget,
  destroyWgpuCanvasContext,
  destroyWgpuCanvasTarget,
  readbackWgpuCanvasTargetRGBA,
  renderWgpuCanvasTargetClear,
} from "../packages/renderer/src/wgpu-canvas-bridge"

const WIDTH = Number(process.env.TGE_WGPU_PATCH_WIDTH ?? 320)
const HEIGHT = Number(process.env.TGE_WGPU_PATCH_HEIGHT ?? 180)
const PATCH = Number(process.env.TGE_WGPU_PATCH_SIZE ?? 64)
const ITERATIONS = Number(process.env.TGE_WGPU_PATCH_ITERS ?? 12)
const OUTPUT_PATH = process.env.TGE_WGPU_PATCH_OUT ?? "/tmp/tge-wgpu-kitty-patch-benchmark.json"

function avg(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
}

function extractRegion(data: Uint8Array, width: number, rx: number, ry: number, rw: number, rh: number) {
  const out = new Uint8Array(rw * rh * 4)
  const srcStride = width * 4
  const dstStride = rw * 4
  for (let y = 0; y < rh; y++) {
    const srcOff = (ry + y) * srcStride + rx * 4
    const dstOff = y * dstStride
    out.set(data.subarray(srcOff, srcOff + dstStride), dstOff)
  }
  return out
}

async function main() {
  const term = await createTerminal({ skipColors: true })
  if (!term.caps.kittyGraphics) throw new Error("Kitty graphics support is required for this benchmark")

  const ctx = createWgpuCanvasContext()
  const target = createWgpuCanvasTarget(ctx, { width: WIDTH, height: HEIGHT })

  try {
    renderWgpuCanvasTargetClear(ctx, target, 0x3b82f6ff)
    const { data } = readbackWgpuCanvasTargetRGBA(ctx, target, WIDTH * HEIGHT * 4)
    const imageId = 9100
    const patchX = Math.max(0, Math.floor((WIDTH - PATCH) / 2))
    const patchY = Math.max(0, Math.floor((HEIGHT - PATCH) / 2))
    const patch = extractRegion(data, WIDTH, patchX, patchY, PATCH, PATCH)

    term.beginSync()
    transmitRawAt(term.write, { data, width: WIDTH, height: HEIGHT }, imageId, 0, 0, {
      z: -1,
      mode: term.caps.transmissionMode,
      compress: false,
      format: 32,
    })
    term.endSync()

    const fullRawTimes: number[] = []
    const patchTimes: number[] = []

    for (let i = 0; i < ITERATIONS; i++) {
      term.beginSync()
      const start = performance.now()
      transmitRawAt(term.write, { data, width: WIDTH, height: HEIGHT }, imageId, 0, 0, {
        z: -1,
        mode: term.caps.transmissionMode,
        compress: false,
        format: 32,
      })
      term.endSync()
      fullRawTimes.push(performance.now() - start)
    }

    for (let i = 0; i < ITERATIONS; i++) {
      term.beginSync()
      const start = performance.now()
      patchRegion(term.write, imageId, patch, patchX, patchY, PATCH, PATCH, {
        mode: term.caps.transmissionMode,
        compress: false,
      })
      term.endSync()
      patchTimes.push(performance.now() - start)
    }

    const result = {
      transmissionMode: term.caps.transmissionMode,
      width: WIDTH,
      height: HEIGHT,
      patchSize: PATCH,
      iterations: ITERATIONS,
      fullRawAvgMs: Number(avg(fullRawTimes).toFixed(2)),
      patchAvgMs: Number(avg(patchTimes).toFixed(2)),
      deltaMs: Number((avg(fullRawTimes) - avg(patchTimes)).toFixed(2)),
      note: "This benchmark isolates Kitty output only. It compares full-frame raw transmission against patchRegion for a centered square patch using the same source RGBA bytes.",
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
