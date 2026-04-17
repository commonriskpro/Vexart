import {
  createWgpuCanvasContext,
  createWgpuCanvasTarget,
  destroyWgpuCanvasContext,
  destroyWgpuCanvasTarget,
  readbackWgpuCanvasTargetRGBA,
  renderWgpuCanvasTargetRects,
} from "@tge/gpu"

const ctx = createWgpuCanvasContext()
const target = createWgpuCanvasTarget(ctx, { width: 8, height: 8 })

const stats = renderWgpuCanvasTargetRects(ctx, target, [
  { x: -1, y: 1, w: 1, h: -1, color: 0xff0000ff },
  { x: 0, y: 0, w: 1, h: -1, color: 0x00ff00ff },
])

const { data, stats: readbackStats } = readbackWgpuCanvasTargetRGBA(ctx, target, 8 * 8 * 4)

console.log(JSON.stringify({
  renderStats: stats,
  readbackStats,
  topLeft: Array.from(data.slice(0, 4)),
  topRight: Array.from(data.slice((7 * 4), (8 * 4))),
}, null, 2))

destroyWgpuCanvasTarget(ctx, target)
destroyWgpuCanvasContext(ctx)
