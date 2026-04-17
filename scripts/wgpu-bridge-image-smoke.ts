import {
  createWgpuCanvasContext,
  createWgpuCanvasImage,
  createWgpuCanvasTarget,
  destroyWgpuCanvasContext,
  destroyWgpuCanvasImage,
  destroyWgpuCanvasTarget,
  readbackWgpuCanvasTargetRGBA,
  renderWgpuCanvasTargetImage,
} from "@vexart/engine"

const pixels = new Uint8Array([
  255, 0, 0, 255,
  0, 255, 0, 255,
  0, 0, 255, 255,
  255, 255, 255, 255,
])

const ctx = createWgpuCanvasContext()
const target = createWgpuCanvasTarget(ctx, { width: 2, height: 2 })
const image = createWgpuCanvasImage(ctx, { width: 2, height: 2 }, pixels)

const renderStats = renderWgpuCanvasTargetImage(ctx, target, image, { x: -1, y: 1, w: 2, h: -2, opacity: 1 }, 0x00000000)
const { data, stats } = readbackWgpuCanvasTargetRGBA(ctx, target, 2 * 2 * 4)

console.log(JSON.stringify({
  renderStats,
  readbackStats: stats,
  pixels: Array.from(data),
}, null, 2))

destroyWgpuCanvasImage(ctx, image)
destroyWgpuCanvasTarget(ctx, target)
destroyWgpuCanvasContext(ctx)
