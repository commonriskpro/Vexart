import { create } from "@tge/compat-software"
import { CanvasContext, setCanvasPainterBackend, paintCanvasCommands } from "@tge/compat-canvas"
import { tryCreateWgpuCanvasPainterBackend } from "@tge/gpu"

const backend = tryCreateWgpuCanvasPainterBackend()
if (!backend) throw new Error("WGPU canvas backend is not available")

setCanvasPainterBackend(backend)

const buf = create(8, 8)
const ctx = new CanvasContext({ x: 0, y: 0, zoom: 1 })
ctx.rect(0, 0, 4, 8, { fill: 0xff0000ff })
ctx.rect(4, 0, 4, 8, { fill: 0x00ff00ff })
paintCanvasCommands(buf, ctx, 8, 8)

setCanvasPainterBackend(null)

console.log(JSON.stringify({
  leftPixel: Array.from(buf.data.slice(0, 4)),
  rightPixel: Array.from(buf.data.slice((4 * 4), (5 * 4))),
}, null, 2))
