import { create } from "@tge/pixel"
import { CanvasContext, setCanvasPainterBackend, paintCanvasCommands } from "@tge/compat-canvas"
import { tryCreateWgpuCanvasPainterBackend } from "@tge/gpu"

const backend = tryCreateWgpuCanvasPainterBackend()
if (!backend) throw new Error("WGPU canvas backend is not available")

setCanvasPainterBackend(backend)

const pixels = new Uint8Array([
  255, 255, 255, 255,
])

const buf = create(4, 4)
const ctx = new CanvasContext({ x: 0, y: 0, zoom: 1 })
ctx.rect(0, 0, 4, 4, { fill: 0xff0000ff })
ctx.drawImage(1, 1, 2, 2, pixels, 1, 1, 1)
paintCanvasCommands(buf, ctx, 4, 4)

setCanvasPainterBackend(null)

const center = (1 * 4 + 1) * 4
console.log(JSON.stringify({
  topLeft: Array.from(buf.data.slice(0, 4)),
  center: Array.from(buf.data.slice(center, center + 4)),
}, null, 2))
