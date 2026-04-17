import { create } from "@tge/pixel"
import { CanvasContext, setCanvasPainterBackend, paintCanvasCommands, tryCreateWgpuCanvasPainterBackend } from "@tge/compat-canvas"

const backend = tryCreateWgpuCanvasPainterBackend()
if (!backend) throw new Error("WGPU canvas backend is not available")

setCanvasPainterBackend(backend)

const buf = create(9, 9)
const ctx = new CanvasContext({ x: 0, y: 0, zoom: 1 })
ctx.bezier(1, 7, 4, 1, 7, 7, { color: 0xffffffff, width: 2 })
paintCanvasCommands(buf, ctx, 9, 9)

setCanvasPainterBackend(null)

const center = (4 * 9 + 4) * 4
const corner = 0
console.log(JSON.stringify({
  center: Array.from(buf.data.slice(center, center + 4)),
  corner: Array.from(buf.data.slice(corner, corner + 4)),
}, null, 2))
