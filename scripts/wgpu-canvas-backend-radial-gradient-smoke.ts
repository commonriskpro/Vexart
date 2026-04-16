import { create } from "@tge/compat-software"
import { CanvasContext, setCanvasPainterBackend, paintCanvasCommands } from "@tge/compat-canvas"
import { tryCreateWgpuCanvasPainterBackend } from "@tge/gpu"

const backend = tryCreateWgpuCanvasPainterBackend()
if (!backend) throw new Error("WGPU canvas backend is not available")

setCanvasPainterBackend(backend)

const buf = create(5, 5)
const ctx = new CanvasContext({ x: 0, y: 0, zoom: 1 })
ctx.radialGradient(2, 2, 2, 0xffffffff, 0x0000ffff)
paintCanvasCommands(buf, ctx, 5, 5)

setCanvasPainterBackend(null)

const center = (2 * 5 + 2) * 4
const corner = 0
console.log(JSON.stringify({
  center: Array.from(buf.data.slice(center, center + 4)),
  corner: Array.from(buf.data.slice(corner, corner + 4)),
}, null, 2))
