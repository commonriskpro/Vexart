import { create } from "../packages/pixel/src"
import { CanvasContext, setCanvasPainterBackend, tryCreateWgpuCanvasPainterBackend } from "../packages/renderer/src"
import { paintCanvasCommands } from "../packages/renderer/src/canvas"

const backend = tryCreateWgpuCanvasPainterBackend()
if (!backend) throw new Error("WGPU canvas backend is not available")

setCanvasPainterBackend(backend)

const buf = create(4, 1)
const ctx = new CanvasContext({ x: 0, y: 0, zoom: 1 })
ctx.linearGradient(0, 0, 4, 1, 0xff0000ff, 0x0000ffff, 0)
paintCanvasCommands(buf, ctx, 4, 1)

setCanvasPainterBackend(null)

console.log(JSON.stringify({ pixels: Array.from(buf.data) }, null, 2))
