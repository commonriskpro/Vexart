import { create } from "@tge/compat-software"
import { CanvasContext, setCanvasPainterBackend, paintCanvasCommands } from "@tge/compat-canvas"
import { tryCreateWgpuCanvasPainterBackend } from "@tge/gpu"

const backend = tryCreateWgpuCanvasPainterBackend()
if (!backend) throw new Error("WGPU canvas backend is not available")

setCanvasPainterBackend(backend)

const buf = create(11, 11)
const ctx = new CanvasContext({ x: 0, y: 0, zoom: 1 })
ctx.polygon(5, 5, 4, 6, { fill: 0x00ff00ff, stroke: 0xffffffff, strokeWidth: 1, rotation: 30 })
paintCanvasCommands(buf, ctx, 11, 11)

setCanvasPainterBackend(null)

const center = (5 * 11 + 5) * 4
const top = (1 * 11 + 5) * 4
console.log(JSON.stringify({
  center: Array.from(buf.data.slice(center, center + 4)),
  top: Array.from(buf.data.slice(top, top + 4)),
}, null, 2))
