/**
 * Test vexart paint pipeline: target → begin → paint rect → end → readback
 */
import { openVexartLibrary } from "../packages/engine/src/ffi/vexart-bridge"
import { ptr } from "bun:ffi"

const lib = openVexartLibrary()
const sym = lib.symbols

// Check version
const ver = sym.vexart_version()
console.log("version:", "0x" + ver.toString(16))

// Create context
const ctxBuf = new BigUint64Array(1)
sym.vexart_context_create(ptr(new Uint8Array(1)), 0, ptr(ctxBuf))
const ctx = ctxBuf[0]
console.log("ctx:", ctx)

// Create 64x64 target
const targetBuf = new BigUint64Array(1)
const r1 = sym.vexart_composite_target_create(ctx, 64, 64, ptr(targetBuf))
const target = targetBuf[0]
console.log("target:", target, "result:", r1)

// --- Test A: Paint WITHOUT layer (standalone path) ---
console.log("\n=== Test A: standalone (no begin/end layer) ===")
const graphA = buildRectGraph(0x00020000)
const rA = sym.vexart_paint_dispatch(ctx, target, ptr(graphA), graphA.length, ptr(new Uint8Array(64)))
console.log("dispatch result:", rA)
checkReadback(ctx, target, "A")

// --- Test B: Paint WITH layer ---
console.log("\n=== Test B: with begin/end layer ===")
const targetBuf2 = new BigUint64Array(1)
sym.vexart_composite_target_create(ctx, 64, 64, ptr(targetBuf2))
const target2 = targetBuf2[0]

const r2 = sym.vexart_composite_target_begin_layer(ctx, target2, 0, 0x00000000)
console.log("begin_layer:", r2)

const graphB = buildRectGraph(0x00020000)
const rB = sym.vexart_paint_dispatch(ctx, target2, ptr(graphB), graphB.length, ptr(new Uint8Array(64)))
console.log("dispatch result:", rB)

const r3 = sym.vexart_composite_target_end_layer(ctx, target2)
console.log("end_layer:", r3)
checkReadback(ctx, target2, "B")

// --- Test C: renderClear-style (clear via begin_layer with color) ---
console.log("\n=== Test C: clear with color via begin/end ===")
const targetBuf3 = new BigUint64Array(1)
sym.vexart_composite_target_create(ctx, 64, 64, ptr(targetBuf3))
const target3 = targetBuf3[0]

sym.vexart_composite_target_begin_layer(ctx, target3, 0, 0x00ff00ff) // green
sym.vexart_composite_target_end_layer(ctx, target3)
checkReadback(ctx, target3, "C (should be green if clear works)")

// Cleanup
sym.vexart_composite_target_destroy(ctx, target)
sym.vexart_composite_target_destroy(ctx, target2)
sym.vexart_composite_target_destroy(ctx, target3)

function buildRectGraph(version: number): Uint8Array {
  // BridgeRectInstance: 8 floats = 32 bytes
  // rect: x=-1, y=-1, w=2, h=2 (fill full NDC)
  // color: r=1, g=0, b=0, a=1
  const body = new Float32Array([-1, -1, 2, 2, 1, 0, 0, 1])
  const bodyBytes = new Uint8Array(body.buffer)

  const prefixSize = 8
  const payloadTotal = prefixSize + bodyBytes.length
  const buf = new ArrayBuffer(16 + payloadTotal)
  const v = new DataView(buf)
  const u8 = new Uint8Array(buf)

  // Header
  v.setUint32(0, 0x56584152, true) // magic
  v.setUint32(4, version, true)
  v.setUint32(8, 1, true)          // cmd_count
  v.setUint32(12, payloadTotal, true)

  // Prefix
  v.setUint16(16, 0, true)           // cmd_kind = 0 (rect)
  v.setUint16(18, 0, true)           // flags
  v.setUint32(20, bodyBytes.length, true) // body bytes

  // Body
  u8.set(bodyBytes, 24)
  return u8
}

function checkReadback(ctx: bigint, target: bigint, label: string) {
  const readbackBuf = new Uint8Array(64 * 64 * 4)
  const r = sym.vexart_composite_readback_rgba(ctx, target, ptr(readbackBuf), readbackBuf.length, ptr(new Uint8Array(64)))
  let nz = 0
  for (let i = 0; i < readbackBuf.length; i++) { if (readbackBuf[i] !== 0) nz++ }
  const off = (32 * 64 + 32) * 4
  console.log(`${label} readback=${r} center=[${readbackBuf[off]},${readbackBuf[off+1]},${readbackBuf[off+2]},${readbackBuf[off+3]}] nonzero=${nz}/${readbackBuf.length}`)
}
