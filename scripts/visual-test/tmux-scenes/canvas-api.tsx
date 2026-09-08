import assert from "node:assert/strict"
import type { RenderToBufferResult } from "../../../packages/engine/src/testing/render-to-buffer"

export const width = 280
export const height = 200

type CanvasSceneOptions = {
  disableImage?: boolean
  disableGradients?: boolean
  disableText?: boolean
  disablePaths?: boolean
}

const SOURCE = new Uint8Array([
  0xef, 0x44, 0x44, 0xff,
  0x22, 0xc5, 0x5e, 0xff,
  0x38, 0x7f, 0xf6, 0xff,
  0xfa, 0xcc, 0x15, 0xff,
])
const BACKGROUND = [8, 11, 22, 255]

export function Scene(options: CanvasSceneOptions = {}) {
  return (
    <box width={width} height={height} backgroundColor={0x080b16ff} padding={16} direction="column">
      <canvas
        width={240}
        height={160}
        onDraw={(ctx) => {
          // A rect that extends above/left of the canvas proves its bounds clip.
          ctx.rect(0, 0, 240, 160, { fill: 0x111827ff })
          ctx.rect(-12, -12, 44, 44, { fill: 0xef4444ff })
          if (!options.disableImage) ctx.drawImage(80, 16, 80, 80, SOURCE, 2, 2, 1, true)
          if (!options.disableGradients) {
            ctx.linearGradient(16, 112, 96, 32, 0x0ea5e9ff, 0x8b5cf6ff, 0)
            ctx.radialGradient(176, 128, 26, 0xfde047ff, 0xef4444ff)
          }
          if (!options.disableText) ctx.text(178, 16, "OK", 0xffffffff)
          if (!options.disablePaths) {
            ctx.line(176, 52, 226, 92, { color: 0x22d3eeff, width: 2 })
            ctx.bezier(176, 104, 214, 80, 238, 112, { color: 0xf0abfcff, width: 2 })
          }
        }}
      />
    </box>
  )
}

function pixel(frame: RenderToBufferResult, x: number, y: number) {
  const index = (y * frame.width + x) * 4
  return frame.pixels.slice(index, index + 4)
}

function countPixels(frame: RenderToBufferResult, left: number, top: number, right: number, bottom: number, predicate: (pixel: Uint8Array) => boolean) {
  let count = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const index = (y * frame.width + x) * 4
      if (predicate(frame.pixels.slice(index, index + 4))) count++
    }
  }
  return count
}

export function verify(frame: RenderToBufferResult) {
  assert.equal(frame.width, width)
  assert.equal(frame.height, height)

  // The canvas begins at (16, 16). The clipped red rect is visible inside it,
  // while the pixel just outside remains the parent background.
  assert.deepEqual(pixel(frame, 18, 18), new Uint8Array([239, 68, 68, 255]))
  assert.deepEqual(pixel(frame, 10, 10), new Uint8Array(BACKGROUND))

  // Four probes cover all four source quadrants after drawImage scaling.
  assert.deepEqual(pixel(frame, 116, 52), new Uint8Array([239, 68, 68, 255]))
  assert.deepEqual(pixel(frame, 156, 52), new Uint8Array([34, 197, 94, 255]))
  assert.deepEqual(pixel(frame, 116, 92), new Uint8Array([56, 127, 246, 255]))
  assert.deepEqual(pixel(frame, 156, 92), new Uint8Array([250, 204, 21, 255]))

  // The rasterizer's fixed angle-0 formula gives a stable midpoint and end
  // point for this gradient; these fail if gradient commands are removed.
  assert.deepEqual(pixel(frame, 40, 144), new Uint8Array([87, 122, 241, 255]))
  assert.deepEqual(pixel(frame, 100, 144), new Uint8Array([139, 92, 246, 255]))
  assert.deepEqual(pixel(frame, 200, 144), new Uint8Array([248, 173, 70, 255]))

  const whiteGlyphs = countPixels(frame, 190, 28, 220, 50, (sample) => sample[0] > 220 && sample[1] > 220 && sample[2] > 220)
  assert.ok(whiteGlyphs > 12, `canvas text probe is empty (${whiteGlyphs} white pixels)`)

  const cyanLine = countPixels(frame, 190, 66, 246, 112, (sample) => sample[0] < 100 && sample[1] > 140 && sample[2] > 170)
  assert.ok(cyanLine > 20, `canvas line probe is empty (${cyanLine} colored pixels)`)
  const pinkBezier = countPixels(frame, 190, 118, 258, 144, (sample) => sample[0] > 180 && sample[1] < 210 && sample[2] > 180)
  assert.ok(pinkBezier > 20, `canvas bezier probe is empty (${pinkBezier} colored pixels)`)
}
