import assert from "node:assert/strict"
import type { RenderToBufferResult } from "../../../packages/engine/src/testing/render-to-buffer"

export const width = 420
export const height = 200
const BACKGROUND = [8, 11, 22]

export function Scene() {
  return (
    <box width={width} height={height} backgroundColor={0x080b16ff} padding={16} direction="column" gap={10}>
      <text color={0x38bdf8ff} fontSize={12}>ASCII 0123456789</text>
      <text color={0xf97316ff} fontSize={20}>é ΩЖ</text>
      <text color={0xa78bffff} fontSize={32}>Native Glyphs</text>
    </box>
  )
}

function changedPixels(frame: RenderToBufferResult, top: number, bottom: number, predicate: (pixel: Uint8Array) => boolean) {
  let count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < frame.width; x++) {
      const index = (y * frame.width + x) * 4
      const pixel = frame.pixels.slice(index, index + 4)
      if (predicate(pixel)) count++
    }
  }
  return count
}

export function verify(frame: RenderToBufferResult) {
  assert.equal(frame.width, width)
  assert.equal(frame.height, height)

  // These are intentionally conservative raster checks: native font fallback
  // and antialiasing can vary, but each line must produce colored glyph pixels.
  assert.ok(changedPixels(frame, 10, 40, (pixel) => pixel[2] > 100 && pixel[1] > 80 && pixel[0] < 150) > 8, "ASCII glyphs are absent")
  // This band contains only the UTF-8 sample (no ASCII prefix), so a renderer
  // that drops non-ASCII text cannot satisfy the check with the first line.
  assert.ok(changedPixels(frame, 40, 80, (pixel) => pixel[0] > 140 && pixel[1] < 180) > 8, "UTF-8 glyphs are absent")
  assert.ok(changedPixels(frame, 78, 140, (pixel) => pixel[0] > 70 && pixel[2] > 100 && pixel[1] < 190) > 12, "large native glyphs are absent")

  const background = frame.pixels.slice(0, 3)
  assert.deepEqual(background, new Uint8Array(BACKGROUND), "background probe changed unexpectedly")
}
