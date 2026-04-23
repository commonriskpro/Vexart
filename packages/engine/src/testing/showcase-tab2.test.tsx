import { describe, expect, test } from "bun:test"
import { renderNodeToBuffer } from "./render-to-buffer"
import { createShowcaseTab2Scene, SHOWCASE_TAB2_H, SHOWCASE_TAB2_W } from "./showcase-tab2-scene"

const W = SHOWCASE_TAB2_W
const H = SHOWCASE_TAB2_H

function avg(pixels: Uint8Array, width: number, x: number, y: number, w: number, h: number) {
  let sum = 0
  let count = 0

  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const i = (py * width + px) * 4
      sum += pixels[i] + pixels[i + 1] + pixels[i + 2]
      count++
    }
  }

  if (count === 0) return 0
  return sum / (count * 3)
}

function sample(pixels: Uint8Array, width: number, x: number, y: number) {
  const i = (y * width + x) * 4
  return pixels[i] + pixels[i + 1] + pixels[i + 2]
}

describe("showcase tab 2 visual regression", () => {
  test("renders the lower opacity strip in the minimal scene", async () => {
    const frame = await renderNodeToBuffer(createShowcaseTab2Scene(), W, H)

    expect(frame.width).toBe(W)
    expect(frame.height).toBe(H)

    expect(avg(frame.pixels, frame.width, 40, 378, 440, 50)).toBeGreaterThan(35)

    expect(sample(frame.pixels, frame.width, 90, 403)).toBeGreaterThan(40)
    expect(sample(frame.pixels, frame.width, 202, 403)).toBeGreaterThan(40)
    expect(sample(frame.pixels, frame.width, 314, 403)).toBeGreaterThan(40)
    expect(sample(frame.pixels, frame.width, 426, 403)).toBeGreaterThan(20)
  })

  test("renders the top backdrop demos instead of black", async () => {
    const frame = await renderNodeToBuffer(createShowcaseTab2Scene(), W, H)

    expect(avg(frame.pixels, frame.width, 40, 40, 460, 120)).toBeGreaterThan(40)
    expect(avg(frame.pixels, frame.width, 120, 112, 320, 36)).toBeGreaterThan(35)
    expect(avg(frame.pixels, frame.width, 36, 224, 250, 88)).toBeGreaterThan(25)
    expect(avg(frame.pixels, frame.width, 60, 286, 210, 24)).toBeGreaterThan(15)
  })
})
