import { create } from "../packages/pixel/src"
import { CanvasContext, setCanvasPainterBackend, tryCreateWgpuCanvasPainterBackend } from "../packages/renderer/src"
import { paintCanvasCommands } from "../packages/renderer/src/canvas"

const backend = tryCreateWgpuCanvasPainterBackend()
if (!backend) throw new Error("WGPU canvas backend is not available")

setCanvasPainterBackend(backend)

const buf = create(9, 9)
const ctx = new CanvasContext({ x: 0, y: 0, zoom: 1 })
ctx.rect(1, 1, 7, 7, { fill: 0xff0000ff, stroke: 0xffffffff, strokeWidth: 1, radius: 2 })
paintCanvasCommands(buf, ctx, 9, 9)

setCanvasPainterBackend(null)

const center = (4 * 9 + 4) * 4
const top = (1 * 9 + 4) * 4
const corner = (1 * 9 + 1) * 4
console.log(JSON.stringify({
  center: Array.from(buf.data.slice(center, center + 4)),
  top: Array.from(buf.data.slice(top, top + 4)),
  corner: Array.from(buf.data.slice(corner, corner + 4)),
}, null, 2))
