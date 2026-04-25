import { expect, test } from "bun:test"
import { rasterizeCanvas } from "./canvas-rasterizer"

test("rasterizes core canvas display-list commands", () => {
  const result = rasterizeCanvas((ctx) => {
    ctx.rect(2, 2, 14, 10, { fill: 0xff0000ff, stroke: 0xffffffff, strokeWidth: 1, radius: 2 })
    ctx.circle(28, 10, 6, { fill: 0x00ff00cc, stroke: 0xffffffff, strokeWidth: 1 })
    ctx.line(1, 28, 38, 28, { color: 0x0000ffff, width: 2 })
    ctx.bezier(2, 20, 16, 10, 34, 20, { color: 0xff00ffff, width: 1 })
    ctx.polygon(48, 14, 8, 5, { fill: 0xffff00aa, stroke: 0xffffffff, strokeWidth: 1 })
    ctx.text(4, 34, "OK", 0xffffffff)
  }, 64, 48)

  expect(result?.width).toBe(64)
  expect(result?.height).toBe(48)
  expect(result?.commandCount).toBe(6)
  expect(result?.data.some((value, index) => index % 4 === 3 && value > 0)).toBe(true)
})

test("rasterizes gradients, glow, image, starfield, and nebula safely", () => {
  const source = new Uint8Array([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255,
  ])
  const result = rasterizeCanvas((ctx) => {
    ctx.linearGradient(0, 0, 64, 16, 0xff0000ff, 0x0000ffff, 0)
    ctx.radialGradient(32, 24, 18, 0xffffffff, 0xffffff00)
    ctx.glow(48, 28, 12, 12, 0xa78bffff, 80)
    ctx.drawImage(4, 20, 16, 16, source, 2, 2, 0.9)
    ctx.starfield(0, 0, 64, 48, { seed: 3, count: 12 })
    ctx.nebula(0, 0, 64, 48, [{ color: 0x7c3aed88, position: 0.4 }], { seed: 8, dust: 30 })
  }, 64, 48)

  expect(result?.commandCount).toBe(6)
  expect(result?.data.some((value, index) => index % 4 === 3 && value > 0)).toBe(true)
})
