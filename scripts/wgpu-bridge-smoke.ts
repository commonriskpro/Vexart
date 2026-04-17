import {
  createWgpuCanvasContext,
  createWgpuCanvasTarget,
  destroyWgpuCanvasContext,
  destroyWgpuCanvasTarget,
  readbackWgpuCanvasTargetRGBA,
  renderWgpuCanvasTargetClear,
} from "@vexart/engine"

const ctx = createWgpuCanvasContext()
const target = createWgpuCanvasTarget(ctx, { width: 4, height: 4 })

const renderStats = renderWgpuCanvasTargetClear(ctx, target, 0xff0000ff)
const { data, stats } = readbackWgpuCanvasTargetRGBA(ctx, target, 4 * 4 * 4)

console.log(JSON.stringify({
  renderStats,
  readbackStats: stats,
  firstPixel: Array.from(data.slice(0, 4)),
  lastPixel: Array.from(data.slice(data.length - 4)),
}, null, 2))

destroyWgpuCanvasTarget(ctx, target)
destroyWgpuCanvasContext(ctx)
