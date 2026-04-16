import { performance } from "node:perf_hooks"
import { create } from "@tge/compat-software"
import { setCanvasPainterBackend, CanvasContext, paintCanvasCommandsCPU, paintCanvasCommands } from "@tge/compat-canvas"
import { tryCreateWgpuCanvasPainterBackend, probeWgpuCanvasBridge } from "@tge/gpu"

const WIDTH = Number(process.env.TGE_SCENE_BENCH_WIDTH ?? 440)
const HEIGHT = Number(process.env.TGE_SCENE_BENCH_HEIGHT ?? 180)
const ITERATIONS = Number(process.env.TGE_SCENE_BENCH_ITERS ?? 40)

const imagePixels = new Uint8Array([
  255, 0, 0, 255,   255, 180, 0, 255,   255, 255, 255, 255,   255, 255, 255, 255,
  255, 0, 0, 255,   255, 180, 0, 255,   255, 255, 255, 255,   255, 255, 255, 255,
  40, 160, 255, 255,  40, 160, 255, 255,  255, 255, 255, 255,  255, 255, 255, 255,
  40, 160, 255, 255,  40, 160, 255, 255,  255, 255, 255, 255,  255, 255, 255, 255,
])

function drawSupportedScene(ctx: CanvasContext) {
  ctx.rect(0, 0, WIDTH, HEIGHT, { fill: 0x0b1020ff })
  ctx.linearGradient(12, 12, WIDTH - 24, 48, 0x0f172aff, 0x1d4ed8ff, 0)
  ctx.rect(18, 18, 96, 36, { fill: 0xff7a18ff })
  ctx.rect(126, 18, 96, 36, { fill: 0x4fd1c5ff })
  ctx.rect(234, 18, 96, 36, { fill: 0xa78bfaff })
  ctx.radialGradient(92, 126, 64, 0xffffff66, 0x00000000)
  ctx.radialGradient(250, 116, 72, 0x56d4c855, 0x00000000)
  ctx.radialGradient(360, 122, 54, 0xf472b655, 0x00000000)
  ctx.drawImage(36, 86, 96, 64, imagePixels, 4, 4, 1)
  ctx.drawImage(172, 80, 104, 72, imagePixels, 4, 4, 0.92)
  ctx.drawImage(308, 88, 88, 56, imagePixels, 4, 4, 1)
  ctx.linearGradient(24, 154, WIDTH - 48, 14, 0x56d4c8ff, 0xf472b6ff, 90)
}

function avg(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
}

function runCpu() {
  const buf = create(WIDTH, HEIGHT)
  const times: number[] = []
  for (let i = 0; i < ITERATIONS; i++) {
    buf.data.fill(0)
    const ctx = new CanvasContext({ x: 0, y: 0, zoom: 1 })
    drawSupportedScene(ctx)
    const start = performance.now()
    paintCanvasCommandsCPU(buf, ctx, WIDTH, HEIGHT)
    times.push(performance.now() - start)
  }
  return avg(times)
}

function runWgpu() {
  const probe = probeWgpuCanvasBridge()
  const backend = probe.available ? tryCreateWgpuCanvasPainterBackend() : null
  if (!backend) throw new Error(`WGPU backend unavailable: ${probe.reason}`)

  const buf = create(WIDTH, HEIGHT)
  const times: number[] = []
  setCanvasPainterBackend(backend)
  try {
    for (let i = 0; i < ITERATIONS; i++) {
      buf.data.fill(0)
      const ctx = new CanvasContext({ x: 0, y: 0, zoom: 1 })
      drawSupportedScene(ctx)
      const start = performance.now()
      paintCanvasCommands(buf, ctx, WIDTH, HEIGHT)
      times.push(performance.now() - start)
    }
  } finally {
    setCanvasPainterBackend(null)
  }
  return avg(times)
}

const cpuMs = runCpu()
const wgpuMs = runWgpu()

console.log(JSON.stringify({
  width: WIDTH,
  height: HEIGHT,
  iterations: ITERATIONS,
  cpuAvgMs: Number(cpuMs.toFixed(2)),
  wgpuAvgMs: Number(wgpuMs.toFixed(2)),
  deltaMs: Number((cpuMs - wgpuMs).toFixed(2)),
  note: "Scene benchmark compares CPU paintCanvasCommandsCPU against the hybrid WGPU backend for a canvas scene made only of currently supported GPU primitives.",
}, null, 2))
