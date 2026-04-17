/**
 * TGE Paint Test — verify Zig FFI paints pixels correctly.
 *
 * Runs without entering the terminal (no raw mode, no alternate screen).
 * Useful for debugging the Zig ↔ TypeScript FFI boundary.
 *
 * Run: bun run examples/test-paint.ts
 * Requires: bun zig:build
 */

import { create, paint, get } from "@tge/pixel"

const buf = create(100, 100)

// ── Fill rect ──
paint.fillRect(buf, 10, 10, 80, 80, 255, 0, 0, 255)
const fill = get(buf, 50, 50)
console.log("fillRect (50,50):", fill.toString(16), fill === 0xff0000ff ? "✅" : "❌")

// ── Rounded rect ──
paint.roundedRect(buf, 20, 20, 60, 60, 0, 255, 0, 255, 8)
const rounded = get(buf, 50, 50)
console.log("roundedRect (50,50):", rounded.toString(16), rounded === 0x00ff00ff ? "✅" : "❌")

// ── Filled circle ──
paint.filledCircle(buf, 50, 50, 15, 15, 0, 0, 255, 255)
const circle = get(buf, 50, 50)
console.log("filledCircle (50,50):", circle.toString(16), circle === 0x0000ffff ? "✅" : "❌")

// ── Stroke rect ──
paint.strokeRect(buf, 5, 5, 90, 90, 255, 255, 0, 255, 0, 2)
const stroke = get(buf, 5, 50)
console.log("strokeRect (5,50):", stroke.toString(16), (stroke & 0xff) === 0xff ? "✅" : "❌")

// ── Line ──
paint.line(buf, 0, 0, 99, 99, 255, 128, 0, 255, 2)
const line = get(buf, 50, 50)
console.log("line (50,50):", line.toString(16), (line & 0xff) > 0 ? "✅" : "❌")

// ── Halo ──
const buf2 = create(60, 60)
paint.halo(buf2, 30, 30, 20, 20, 255, 0, 255, 200, 100)
const halo = get(buf2, 30, 30)
console.log("halo (30,30):", halo.toString(16), (halo & 0xff) > 0 ? "✅" : "❌")

// ── Linear gradient ──
const buf3 = create(100, 1)
paint.linearGradient(buf3, 0, 0, 100, 1, 0, 0, 0, 255, 255, 255, 255, 255, 0)
const left = get(buf3, 5, 0)
const right = get(buf3, 95, 0)
console.log("linearGradient left:", left.toString(16), "right:", right.toString(16), (right >>> 24) > (left >>> 24) ? "✅" : "❌")

// ── Radial gradient ──
const buf4 = create(40, 40)
paint.radialGradient(buf4, 20, 20, 15, 255, 0, 0, 255, 0, 0, 0, 0)
const center = get(buf4, 20, 20)
console.log("radialGradient center:", center.toString(16), (center & 0xff) > 200 ? "✅" : "❌")

// ── Blur ──
const buf5 = create(20, 20)
paint.fillRect(buf5, 9, 9, 2, 2, 255, 255, 255, 255)
paint.blur(buf5, 5, 5, 10, 10, 2, 3)
const blurred = get(buf5, 10, 10)
const neighbor = get(buf5, 12, 10)
console.log("blur spread:", (blurred >>> 24), "→", (neighbor >>> 24), (neighbor >>> 24) > 0 ? "✅" : "❌")

// ── Total pixel count ──
let painted = 0
for (let i = 3; i < buf.data.length; i += 4) {
  if (buf.data[i] > 0) painted++
}
console.log("\nTotal painted in main buf:", painted, "of", buf.width * buf.height)
