/**
 * End-to-end trace: simulates what the engine does per frame.
 * Creates a VexartLayoutCtx, builds a simple tree, paints, readbacks.
 */
import { ptr } from "bun:ffi"
import { openVexartLibrary } from "../packages/engine/src/ffi/vexart-bridge"

const lib = openVexartLibrary()
const sym = lib.symbols

// Step 1: context
const ctxBuf = new BigUint64Array(1)
sym.vexart_context_create(ptr(new Uint8Array(1)), 0, ptr(ctxBuf))
const ctx = ctxBuf[0]
sym.vexart_context_resize(ctx, 200, 200)
console.log("1. Context created, resized to 200x200")

// Step 2: build layout buffer manually with CORRECT nesting
// Tree: Root(id=1, grow, column) -> Child(id=2, 200x200, red bg)
const MAGIC = 0x56584152
const VERSION = 0x00020000
const OPEN = 0
const CLOSE = 1
const OPEN_PAYLOAD = 112

function writeOpen(buf: DataView, u8: Uint8Array, off: number, nodeId: number, parentId: number, flags: number, opts: {
  flexDir?: number, sizeWKind?: number, sizeHKind?: number, sizeW?: number, sizeH?: number, flexGrow?: number
} = {}): number {
  // prefix
  buf.setUint16(off, OPEN, true)
  buf.setUint16(off + 2, flags, true)
  buf.setUint32(off + 4, OPEN_PAYLOAD, true)
  off += 8
  // payload
  const p = off
  buf.setBigUint64(p, BigInt(nodeId), true)
  buf.setBigUint64(p + 8, BigInt(parentId), true)
  u8[p + 16] = opts.flexDir ?? 1 // column
  u8[p + 17] = 0 // relative
  u8[p + 18] = opts.sizeWKind ?? 0 // auto
  u8[p + 19] = opts.sizeHKind ?? 0 // auto
  buf.setFloat32(p + 20, opts.sizeW ?? 0, true)
  buf.setFloat32(p + 24, opts.sizeH ?? 0, true)
  buf.setFloat32(p + 44, opts.flexGrow ?? 0, true)
  buf.setFloat32(p + 48, 1.0, true) // flexShrink
  u8[p + 52] = 255 // justify none
  u8[p + 53] = 255 // align none
  u8[p + 54] = 255 // alignContent none
  return off + OPEN_PAYLOAD
}

function writeClose(buf: DataView, off: number): number {
  buf.setUint16(off, CLOSE, true)
  buf.setUint16(off + 2, 0, true)
  buf.setUint32(off + 4, 0, true)
  return off + 8
}

// Build: OPEN(root) OPEN(child) CLOSE(child) CLOSE(root) = 4 commands
const layoutBuf = new ArrayBuffer(1024)
const lv = new DataView(layoutBuf)
const lu8 = new Uint8Array(layoutBuf)

let off = 16 // skip header
off = writeOpen(lv, lu8, off, 1, 0, 1, { flexGrow: 1.0 }) // root, IS_ROOT
off = writeOpen(lv, lu8, off, 2, 1, 0, { sizeWKind: 1, sizeW: 200, sizeHKind: 1, sizeH: 200 }) // child, fixed 200x200
off = writeClose(lv, off)
off = writeClose(lv, off)

// header
lv.setUint32(0, MAGIC, true)
lv.setUint32(4, VERSION, true)
lv.setUint32(8, 4, true) // 4 commands
lv.setUint32(12, off - 16, true)

console.log("2. Layout buffer:", off, "bytes, 4 commands")

// Step 3: compute layout
const outBuf = new ArrayBuffer(4096)
const outU8 = new Uint8Array(outBuf)
const usedBuf = new Uint32Array(1)
const r1 = sym.vexart_layout_compute(ctx, ptr(lu8), off, ptr(outU8), outBuf.byteLength, ptr(usedBuf))
console.log("3. layout_compute:", r1, "used:", usedBuf[0])

// Parse output
const ov = new DataView(outBuf)
const cmdCount = ov.getUint32(8, true)
console.log("   output cmd_count:", cmdCount)
for (let i = 0; i < cmdCount; i++) {
  const base = 16 + i * 40
  const nid = ov.getBigUint64(base, true)
  const x = ov.getFloat32(base + 8, true)
  const y = ov.getFloat32(base + 12, true)
  const w = ov.getFloat32(base + 16, true)
  const h = ov.getFloat32(base + 20, true)
  console.log(`   node ${nid}: x=${x} y=${y} w=${w} h=${h}`)
}

// Step 4: create target, begin layer, paint red rect, end layer
const tBuf = new BigUint64Array(1)
sym.vexart_composite_target_create(ctx, 200, 200, ptr(tBuf))
const target = tBuf[0]
console.log("4. Target created:", target)

sym.vexart_composite_target_begin_layer(ctx, target, 0, 0x00000000)

// Paint a red rect filling the whole target
const body = new Float32Array([-1, -1, 2, 2, 1, 0, 0, 1]) // NDC full, red
const bodyU8 = new Uint8Array(body.buffer)
const graphSize = 16 + 8 + bodyU8.length
const graphBuf = new ArrayBuffer(graphSize)
const gv = new DataView(graphBuf)
const gu8 = new Uint8Array(graphBuf)
gv.setUint32(0, MAGIC, true)
gv.setUint32(4, VERSION, true)
gv.setUint32(8, 1, true)
gv.setUint32(12, 8 + bodyU8.length, true)
gv.setUint16(16, 0, true) // cmd_kind=0 rect
gv.setUint16(18, 0, true)
gv.setUint32(20, bodyU8.length, true)
gu8.set(bodyU8, 24)

const r2 = sym.vexart_paint_dispatch(ctx, target, ptr(gu8), graphSize, ptr(new Uint8Array(64)))
console.log("5. paint_dispatch:", r2)

sym.vexart_composite_target_end_layer(ctx, target)
console.log("6. end_layer done")

// Step 5: readback
const rbBuf = new Uint8Array(200 * 200 * 4)
sym.vexart_composite_readback_rgba(ctx, target, ptr(rbBuf), rbBuf.length, ptr(new Uint8Array(64)))
let nz = 0
for (let i = 0; i < rbBuf.length; i++) if (rbBuf[i] !== 0) nz++
const cx = (100 * 200 + 100) * 4
console.log("7. Readback: center=[" + rbBuf[cx] + "," + rbBuf[cx+1] + "," + rbBuf[cx+2] + "," + rbBuf[cx+3] + "] nonzero=" + nz + "/" + rbBuf.length)

// Step 6: Now test composeFinalFrame flow
// Create a "final" target, copy the painted target to an image, composite onto final, readback
const fBuf = new BigUint64Array(1)
sym.vexart_composite_target_create(ctx, 200, 200, ptr(fBuf))
const finalTarget = fBuf[0]

// Copy painted target region to image (params are x, y, w, h as separate u32, not a pointer)
const imgBuf = new BigUint64Array(1)
const r3 = sym.vexart_composite_copy_region_to_image(ctx, target, 0, 0, 200, 200, ptr(imgBuf))
console.log("8. copy_region_to_image:", r3, "image:", imgBuf[0])

// Begin layer on final, composite the image
sym.vexart_composite_target_begin_layer(ctx, finalTarget, 0, 0x00000000)

// Composite image onto final target (pixel coords: x=0, y=0, w=200, h=200)
const r4 = sym.vexart_composite_render_image_layer(ctx, finalTarget, imgBuf[0], 0.0, 0.0, 200.0, 200.0, 0, 0x00000000)
console.log("9. composite_render_image_layer:", r4)

sym.vexart_composite_target_end_layer(ctx, finalTarget)

// Readback final
const fbBuf = new Uint8Array(200 * 200 * 4)
sym.vexart_composite_readback_rgba(ctx, finalTarget, ptr(fbBuf), fbBuf.length, ptr(new Uint8Array(64)))
let fnz = 0
for (let i = 0; i < fbBuf.length; i++) if (fbBuf[i] !== 0) fnz++
console.log("10. Final readback: center=[" + fbBuf[cx] + "," + fbBuf[cx+1] + "," + fbBuf[cx+2] + "," + fbBuf[cx+3] + "] nonzero=" + fnz + "/" + fbBuf.length)

if (fnz > 0) console.log("\n=== PIPELINE WORKS: pixels present in final composite ===")
else console.log("\n=== PIPELINE BROKEN: final composite has zero pixels ===")

// Cleanup
sym.vexart_composite_target_destroy(ctx, target)
sym.vexart_composite_target_destroy(ctx, finalTarget)
sym.vexart_paint_remove_image(ctx, imgBuf[0])
