import * as bridge from "../packages/engine/src/ffi/wgpu-canvas-bridge"

const probe = bridge.probeWgpuCanvasBridge()
console.log("probe:", probe)
if (!probe.available) { console.log("GPU not available"); process.exit(1) }

const ctx = bridge.createWgpuCanvasContext({ width: 64, height: 64 })
const target = bridge.createWgpuCanvasTarget(ctx, { width: 64, height: 64 })

// Test: paint rects WITHOUT layer (standalone path — line 3336 in bridge)
console.log("\n=== Test: paint rects standalone (no beginLayer) ===")
const rects: bridge.WgpuCanvasRectFill[] = [{
  x: -1, y: -1, w: 2, h: 2,
  r: 1, g: 0, b: 0, a: 1,
  cornerRadius: 0,
  borderR: 0, borderG: 0, borderB: 0, borderA: 0,
  borderWidth: 0,
}]
bridge.renderWgpuCanvasTargetRectsLayer(ctx, target, rects, 0, 0xff0000ff)
const rb = bridge.readbackWgpuCanvasTargetRGBA(ctx, target, 64 * 64 * 4)
let nz = 0
for (let i = 0; i < rb.data.length; i++) { if (rb.data[i] !== 0) nz++ }
console.log("center:", rb.data[32*64*4+32*4], rb.data[32*64*4+32*4+1], rb.data[32*64*4+32*4+2], rb.data[32*64*4+32*4+3])
console.log("non-zero:", nz, "/", rb.data.length)

// Test: paint rects WITH layer
console.log("\n=== Test: paint rects WITH layer ===")
const target2 = bridge.createWgpuCanvasTarget(ctx, { width: 64, height: 64 })
bridge.beginWgpuCanvasTargetLayer(ctx, target2, 0, 0x00000000)
bridge.renderWgpuCanvasTargetRectsLayer(ctx, target2, rects, 1, 0x00000000)
bridge.endWgpuCanvasTargetLayer(ctx, target2)
const rb2 = bridge.readbackWgpuCanvasTargetRGBA(ctx, target2, 64 * 64 * 4)
let nz2 = 0
for (let i = 0; i < rb2.data.length; i++) { if (rb2.data[i] !== 0) nz2++ }
console.log("center:", rb2.data[32*64*4+32*4], rb2.data[32*64*4+32*4+1], rb2.data[32*64*4+32*4+2], rb2.data[32*64*4+32*4+3])
console.log("non-zero:", nz2, "/", rb2.data.length)

bridge.destroyWgpuCanvasTarget(ctx, target)
bridge.destroyWgpuCanvasTarget(ctx, target2)
console.log("\ndone")
