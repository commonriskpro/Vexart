import { create } from "@tge/compat-software"
import { CanvasContext, setCanvasPainterBackend, paintCanvasCommands } from "@tge/compat-canvas"
import { tryCreateWgpuCanvasPainterBackend } from "@tge/gpu"

const backend = tryCreateWgpuCanvasPainterBackend()
if (!backend) throw new Error("WGPU canvas backend is not available")

setCanvasPainterBackend(backend)

const buf = create(9, 9)
const ctx = new CanvasContext({ x: 0, y: 0, zoom: 1 })
ctx.circle(4, 4, 3, { fill: 0xff0000ff, stroke: 0xffffffff, strokeWidth: 1 })
paintCanvasCommands(buf, ctx, 9, 9)

setCanvasPainterBackend(null)

const center = (4 * 9 + 4) * 4
const edge = (1 * 9 + 4) * 4
console.log(JSON.stringify({
  center: Array.from(buf.data.slice(center, center + 4)),
  edge: Array.from(buf.data.slice(edge, edge + 4)),
}, null, 2))
