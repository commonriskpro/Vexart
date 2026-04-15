import { create } from "../packages/pixel/src"
import { CanvasContext, setCanvasPainterBackend, tryCreateWgpuCanvasPainterBackend } from "../packages/renderer/src"
import { paintCanvasCommands } from "../packages/renderer/src/canvas"

const backend = tryCreateWgpuCanvasPainterBackend()
if (!backend) throw new Error("WGPU canvas backend is not available")

setCanvasPainterBackend(backend)

const buf = create(24, 12)
const ctx = new CanvasContext({ x: 0, y: 0, zoom: 1 })
ctx.text(1, 1, "Hi", 0xffffffff)
paintCanvasCommands(buf, ctx, 24, 12)

setCanvasPainterBackend(null)

let maxAlpha = 0
for (let i = 3; i < buf.data.length; i += 4) {
  if (buf.data[i] > maxAlpha) maxAlpha = buf.data[i]
}

console.log(JSON.stringify({
  maxAlpha,
  corner: Array.from(buf.data.slice(0, 4)),
}, null, 2))
