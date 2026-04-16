import { create } from "@tge/compat-software"
import { CanvasContext, setCanvasPainterBackend, paintCanvasCommands } from "@tge/compat-canvas"
import { tryCreateWgpuCanvasPainterBackend } from "@tge/gpu"

const backend = tryCreateWgpuCanvasPainterBackend()
if (!backend) throw new Error("WGPU canvas backend is not available")

setCanvasPainterBackend(backend)

const buf = create(9, 9)
const ctx = new CanvasContext({ x: 0, y: 0, zoom: 1 })
ctx.glow(4, 4, 4, 4, 0x00ffffff, 90)
paintCanvasCommands(buf, ctx, 9, 9)

setCanvasPainterBackend(null)

const center = (4 * 9 + 4) * 4
const edge = (4 * 9 + 1) * 4
const corner = 0
console.log(JSON.stringify({
  center: Array.from(buf.data.slice(center, center + 4)),
  edge: Array.from(buf.data.slice(edge, edge + 4)),
  corner: Array.from(buf.data.slice(corner, corner + 4)),
}, null, 2))
