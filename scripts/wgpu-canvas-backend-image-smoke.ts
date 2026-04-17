import { create } from "@tge/pixel"
import { CanvasContext, setCanvasPainterBackend, paintCanvasCommands, tryCreateWgpuCanvasPainterBackend } from "@tge/compat-canvas"

const backend = tryCreateWgpuCanvasPainterBackend()
if (!backend) throw new Error("WGPU canvas backend is not available")

setCanvasPainterBackend(backend)

const pixels = new Uint8Array([
  255, 0, 0, 255,
  0, 255, 0, 255,
  0, 0, 255, 255,
  255, 255, 255, 255,
])

const buf = create(2, 2)
const ctx = new CanvasContext({ x: 0, y: 0, zoom: 1 })
ctx.drawImage(0, 0, 2, 2, pixels, 2, 2, 1)
paintCanvasCommands(buf, ctx, 2, 2)

setCanvasPainterBackend(null)

console.log(JSON.stringify({ pixels: Array.from(buf.data) }, null, 2))
