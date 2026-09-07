import { expect, test } from "bun:test"
import { CanvasContext } from "../ffi/canvas"
import { createNode, createTextNode, insertChild } from "../ffi/node"
import { setProp } from "../reconciler/reconciler"
import { renderNodeToBuffer } from "./render-to-buffer"

const WIDTH = 64
const HEIGHT = 48

function prop(node: ReturnType<typeof createNode>, name: string, value: unknown) {
  setProp(node, name, value)
  return node
}

function pixel(frame: { pixels: Uint8Array; width: number }, x: number, y: number) {
  const offset = (y * frame.width + x) * 4
  return frame.pixels.slice(offset, offset + 4)
}

function countColor(frame: { pixels: Uint8Array }, color: readonly number[]) {
  let count = 0
  for (let offset = 0; offset < frame.pixels.length; offset += 4) {
    if (color.every((channel, index) => frame.pixels[offset + index] === channel)) count++
  }
  return count
}

function canvas(onDraw: (ctx: CanvasContext) => void, width = WIDTH, height = HEIGHT) {
  return prop(prop(prop(createNode("canvas"), "width", width), "height", height), "onDraw", onDraw)
}

test("renders a public canvas rectangle through native readback", async () => {
  const frame = await renderNodeToBuffer(canvas((ctx) => {
    ctx.rect(0, 0, WIDTH, HEIGHT, { fill: 0xff0000ff })
  }), WIDTH, HEIGHT)

  expect(frame.width).toBe(WIDTH)
  expect(frame.height).toBe(HEIGHT)
  expect(pixel(frame, WIDTH / 2, HEIGHT / 2)).toEqual(new Uint8Array([255, 0, 0, 255]))
})

test("renders a rounded Box border after its fill through native readback", async () => {
  const node = prop(
    prop(
      prop(
        prop(
          prop(createNode("box"), "width", WIDTH),
          "height", HEIGHT,
        ),
        "backgroundColor", 0x112233ff,
      ),
      "borderColor", 0xff0000ff,
    ),
    "borderWidth", 3,
  )
  prop(node, "cornerRadius", 10)

  const frame = await renderNodeToBuffer(node, WIDTH, HEIGHT)

  expect(countColor(frame, [255, 0, 0, 255])).toBeGreaterThan(0)
  expect(pixel(frame, WIDTH / 2, 1)).toEqual(new Uint8Array([255, 0, 0, 255]))
  expect(pixel(frame, 0, 0)[3]).toBe(0)
  expect(pixel(frame, WIDTH / 2, HEIGHT / 2)).toEqual(new Uint8Array([17, 34, 51, 255]))
})

test("renders a rounded indicator border with a transparent outside corner", async () => {
  const node = prop(
    prop(
      prop(
        prop(
          prop(createNode("box"), "width", 18),
          "height", 18,
        ),
        "backgroundColor", 0x112233ff,
      ),
      "borderColor", 0xffffffff,
    ),
    "borderWidth", 1,
  )
  prop(node, "cornerRadius", 9)

  const frame = await renderNodeToBuffer(node, 18, 18)

  expect(pixel(frame, 9, 0)).toEqual(new Uint8Array([255, 255, 255, 255]))
  expect(pixel(frame, 0, 0)[3]).toBe(0)
  expect(pixel(frame, 9, 9)).toEqual(new Uint8Array([17, 34, 51, 255]))
})

test("renders non-uniform Box border sides with their resolved widths", async () => {
  const node = prop(
    prop(
      prop(
        prop(
          prop(createNode("box"), "width", WIDTH),
          "height", HEIGHT,
        ),
        "backgroundColor", 0x112233ff,
      ),
      "borderColor", 0xff0000ff,
    ),
    "borderTop", 3,
  )
  prop(node, "borderBottom", 2)

  const frame = await renderNodeToBuffer(node, WIDTH, HEIGHT)

  expect(pixel(frame, WIDTH / 2, 1)).toEqual(new Uint8Array([255, 0, 0, 255]))
  expect(pixel(frame, WIDTH / 2, HEIGHT / 2)).toEqual(new Uint8Array([17, 34, 51, 255]))
  expect(pixel(frame, 1, HEIGHT / 2)).toEqual(new Uint8Array([17, 34, 51, 255]))
})

test("keeps a translucent border visible over a backdrop-blurred surface", async () => {
  const root = prop(
    prop(
      prop(createNode("box"), "width", WIDTH),
      "height", HEIGHT,
    ),
    "backgroundColor", 0x204060ff,
  )
  const overlay = prop(
    prop(
      prop(
        prop(
          prop(
            prop(createNode("box"), "width", WIDTH / 2),
            "height", HEIGHT / 2,
          ),
          "backgroundColor", 0xffffff22,
        ),
        "backdropBlur", 4,
      ),
      "borderColor", 0xffffff80,
    ),
    "borderWidth", 1,
  )
  prop(overlay, "cornerRadius", 8)
  prop(overlay, "floating", "parent")
  prop(overlay, "floatOffset", { x: WIDTH / 4, y: HEIGHT / 4 })
  insertChild(root, overlay)

  const frame = await renderNodeToBuffer(root, WIDTH, HEIGHT)
  const rim = pixel(frame, WIDTH / 2, HEIGHT / 4)
  const interior = pixel(frame, WIDTH / 2, HEIGHT / 2)

  expect(rim[0]).toBeGreaterThan(interior[0])
  expect(rim[1]).toBeGreaterThan(interior[1])
  expect(rim[2]).toBeGreaterThan(interior[2])
  expect(rim[3]).toBe(255)
})

test("renders a pre-decoded canvas image at its requested size", async () => {
  const source = new Uint8Array([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255,
  ])
  const frame = await renderNodeToBuffer(canvas((ctx) => {
    ctx.drawImage(0, 0, WIDTH, HEIGHT, source, 2, 2, 1, true)
  }), WIDTH, HEIGHT)

  expect(frame.width).toBe(WIDTH)
  expect(frame.height).toBe(HEIGHT)
  expect(pixel(frame, 8, 8)).toEqual(new Uint8Array([255, 0, 0, 255]))
  expect(pixel(frame, WIDTH - 8, 8)).toEqual(new Uint8Array([0, 255, 0, 255]))
  expect(pixel(frame, 8, HEIGHT - 8)).toEqual(new Uint8Array([0, 0, 255, 255]))
  expect(pixel(frame, WIDTH - 8, HEIGHT - 8)).toEqual(new Uint8Array([255, 255, 255, 255]))
})

test("keeps canvas sizing, distinct image sources, layers, and foreground output intact", async () => {
  const root = prop(prop(createNode("box"), "width", WIDTH), "height", HEIGHT)
  const bottom = prop(prop(prop(createNode("box"), "width", WIDTH), "height", HEIGHT), "backgroundColor", 0x101010ff)
  const left = canvas((ctx) => {
    ctx.drawImage(0, 0, WIDTH / 2, HEIGHT, new Uint8Array([
      255, 0, 0, 255,
      255, 0, 0, 255,
      255, 0, 0, 255,
      255, 0, 0, 255,
    ]), 2, 2, 1, true)
  }, WIDTH / 2, HEIGHT)
  prop(left, "floating", "parent")
  prop(left, "floatOffset", { x: 0, y: 0 })
  prop(left, "zIndex", 1)
  prop(left, "layer", true)
  const right = canvas((ctx) => {
    ctx.drawImage(0, 0, WIDTH / 2, HEIGHT, new Uint8Array([
      0, 0, 255, 255,
      0, 0, 255, 255,
      0, 0, 255, 255,
      0, 0, 255, 255,
    ]), 2, 2, 1, true)
  }, WIDTH / 2, HEIGHT)
  prop(right, "floating", "parent")
  prop(right, "floatOffset", { x: WIDTH / 2, y: 0 })
  prop(right, "zIndex", 1)
  prop(right, "layer", true)
  const foreground = prop(prop(prop(prop(createNode("box"), "width", 16), "height", 8), "backgroundColor", 0x00ff00ff), "floating", "parent")
  prop(foreground, "floatOffset", { x: 24, y: 20 })
  prop(foreground, "zIndex", 2)
  prop(foreground, "layer", true)
  const text = prop(prop(prop(prop(createTextNode("FG"), "fontSize", 12), "color", 0xffffffff), "floating", "parent"), "zIndex", 3)
  prop(text, "floatOffset", { x: 24, y: 8 })
  insertChild(root, bottom)
  insertChild(root, left)
  insertChild(root, right)
  insertChild(root, foreground)
  insertChild(root, text)

  const frame = await renderNodeToBuffer(root, WIDTH, HEIGHT)

  expect(frame.width).toBe(WIDTH)
  expect(frame.height).toBe(HEIGHT)
  expect(pixel(frame, 8, HEIGHT / 2)).toEqual(new Uint8Array([255, 0, 0, 255]))
  expect(pixel(frame, WIDTH - 8, HEIGHT / 2)).toEqual(new Uint8Array([0, 0, 255, 255]))
  expect(pixel(frame, 28, 24)).toEqual(new Uint8Array([0, 255, 0, 255]))
})

test("composites a same-layer canvas below a translucent backdrop overlay", async () => {
  const renderOverlay = async (backdropBlur?: number) => {
    const root = prop(prop(createNode("box"), "width", WIDTH), "height", HEIGHT)
    const background = canvas((ctx) => {
      ctx.drawImage(0, 0, WIDTH / 2, HEIGHT, new Uint8Array([
        255, 0, 0, 255,
        255, 0, 0, 255,
        255, 0, 0, 255,
        255, 0, 0, 255,
      ]), 2, 2, 1, true)
      ctx.drawImage(WIDTH / 2, 0, WIDTH / 2, HEIGHT, new Uint8Array([
        0, 0, 255, 255,
        0, 0, 255, 255,
        0, 0, 255, 255,
        0, 0, 255, 255,
      ]), 2, 2, 1, true)
    })
    const overlay = prop(prop(prop(createNode("box"), "width", WIDTH / 2), "height", HEIGHT / 2), "backgroundColor", 0xffffff80)
    if (backdropBlur !== undefined) prop(overlay, "backdropBlur", backdropBlur)
    prop(overlay, "floating", "parent")
    prop(overlay, "floatOffset", { x: WIDTH / 4, y: HEIGHT / 4 })
    insertChild(root, background)
    insertChild(root, overlay)
    return renderNodeToBuffer(root, WIDTH, HEIGHT)
  }

  const frame = await renderOverlay(4)
  const control = await renderOverlay()
  const baseLeft = pixel(frame, 8, HEIGHT / 2)
  const baseRight = pixel(frame, WIDTH - 8, HEIGHT / 2)
  const overLeft = pixel(frame, WIDTH / 4 + 4, HEIGHT / 2)
  const overRight = pixel(frame, WIDTH / 2 + 4, HEIGHT / 2)
  const controlLeft = pixel(control, WIDTH / 4 + 4, HEIGHT / 2)
  const controlRight = pixel(control, WIDTH / 2 + 4, HEIGHT / 2)

  expect(baseLeft).toEqual(new Uint8Array([255, 0, 0, 255]))
  expect(baseRight).toEqual(new Uint8Array([0, 0, 255, 255]))
  expect(overLeft[1]).toBeGreaterThan(baseLeft[1])
  expect(overRight[0]).toBeGreaterThan(baseRight[0])
  expect(controlLeft[1]).toBeGreaterThan(baseLeft[1])
  expect(controlRight[0]).toBeGreaterThan(baseRight[0])
})
