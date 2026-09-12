import { expect, test } from "bun:test"
import { unlink } from "node:fs/promises"
import { join } from "node:path"
import sharp from "sharp"
import { CanvasContext } from "../ffi/canvas"
import { createNode, createTextNode, ensureImageExtra, insertChild } from "../ffi/node"
import { setProp } from "../reconciler/reconciler"
import { renderNodeToBuffer, renderNodeToBufferAfterInteractions } from "./render-to-buffer"

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

function imageFixtureRoot(source: string, width: number, height: number, fit: "contain" | "cover" | "fill" | "none", radius = 0, opacity?: number) {
  const root = prop(
    prop(
      prop(createNode("box"), "width", width),
      "height", height,
    ),
    "backgroundColor", 0x102030ff,
  )
  const image = prop(
    prop(
      prop(
        prop(
          prop(createNode("img"), "src", source),
          "width", width,
        ),
        "height", height,
      ),
      "objectFit", fit,
    ),
    "cornerRadius", radius,
  )
  insertChild(root, image)
  if (opacity !== undefined) prop(image, "opacity", opacity)
  return root
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

test("renders a uniform 1px border without painting into the fill", async () => {
  const fill = new Uint8Array([17, 34, 51, 255])
  const border = new Uint8Array([238, 238, 238, 255])
  const width = 24
  const height = 18
  const node = prop(
    prop(
      prop(
        prop(
          prop(createNode("box"), "width", width),
          "height", height,
        ),
        "backgroundColor", 0x112233ff,
      ),
      "borderColor", 0xeeeeeeff,
    ),
    "borderWidth", 1,
  )

  const frame = await renderNodeToBuffer(node, width, height)

  expect(pixel(frame, width / 2, 0)).toEqual(border)
  expect(pixel(frame, width / 2, 1)).toEqual(fill)
  expect(pixel(frame, 0, height / 2)).toEqual(border)
  expect(pixel(frame, 1, height / 2)).toEqual(fill)
  expect(pixel(frame, width / 2, height - 1)).toEqual(border)
  expect(pixel(frame, width / 2, height - 2)).toEqual(fill)
  expect(pixel(frame, width - 1, height / 2)).toEqual(border)
  expect(pixel(frame, width - 2, height / 2)).toEqual(fill)
})

test("renders a uniform border with exactly its requested width", async () => {
  const fill = new Uint8Array([17, 34, 51, 255])
  const border = new Uint8Array([238, 238, 238, 255])
  const width = 24
  const height = 18
  const node = prop(
    prop(
      prop(
        prop(
          prop(createNode("box"), "width", width),
          "height", height,
        ),
        "backgroundColor", 0x112233ff,
      ),
      "borderColor", 0xeeeeeeff,
    ),
    "borderWidth", 2,
  )

  const frame = await renderNodeToBuffer(node, width, height)

  expect(pixel(frame, width / 2, 0)).toEqual(border)
  expect(pixel(frame, width / 2, 1)).toEqual(border)
  expect(pixel(frame, width / 2, 2)).toEqual(fill)
  expect(pixel(frame, 0, height / 2)).toEqual(border)
  expect(pixel(frame, 1, height / 2)).toEqual(border)
  expect(pixel(frame, 2, height / 2)).toEqual(fill)
  expect(pixel(frame, width / 2, height - 1)).toEqual(border)
  expect(pixel(frame, width / 2, height - 2)).toEqual(border)
  expect(pixel(frame, width / 2, height - 3)).toEqual(fill)
  expect(pixel(frame, width - 1, height / 2)).toEqual(border)
  expect(pixel(frame, width - 2, height / 2)).toEqual(border)
  expect(pixel(frame, width - 3, height / 2)).toEqual(fill)
})

test("renders per-corner borders without painting into translucent themed fill", async () => {
  const width = 32
  const height = 24
  // Native readback keeps translucent RGB premultiplied by alpha.
  const fill = new Uint8Array([17, 34, 51, 217])
  const fillReadback = new Uint8Array([14, 29, 43, 217])
  const node = prop(
    prop(
      prop(
        prop(
          prop(createNode("box"), "width", width),
          "height", height,
        ),
        "backgroundColor", 0x112233d9,
      ),
      "borderColor", 0xffffff80,
    ),
    "borderWidth", 1,
  )
  prop(node, "cornerRadii", { tl: 7, tr: 5, br: 8, bl: 6 })

  const frame = await renderNodeToBuffer(node, width, height)
  const fillTop = pixel(frame, width / 2, 1)
  const fillLeft = pixel(frame, 1, height / 2)
  const fillBottom = pixel(frame, width / 2, height - 2)
  const fillRight = pixel(frame, width - 2, height / 2)

  expect(pixel(frame, width / 2, 0)[3]).toBeGreaterThan(fill[3])
  expect(pixel(frame, width / 2, height - 1)[3]).toBeGreaterThan(fill[3])
  expect(pixel(frame, 0, height / 2)[3]).toBeGreaterThan(fill[3])
  expect(pixel(frame, width - 1, height / 2)[3]).toBeGreaterThan(fill[3])
  expect(fillTop).toEqual(fillReadback)
  expect(fillLeft).toEqual(fillReadback)
  expect(fillBottom).toEqual(fillReadback)
  expect(fillRight).toEqual(fillReadback)
  expect(pixel(frame, 0, 0)[3]).toBe(0)
  expect(pixel(frame, width - 1, 0)[3]).toBe(0)
  expect(pixel(frame, 0, height - 1)[3]).toBe(0)
  expect(pixel(frame, width - 1, height - 1)[3]).toBe(0)
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
  const text = prop(prop(prop(prop(createNode("text"), "fontSize", 12), "color", 0xffffffff), "floating", "parent"), "zIndex", 3)
  insertChild(text, createTextNode("FG"))
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

test("renders public img object-fit modes and cornerRadius through the GPU path", async () => {
  const sourcePath = join("/tmp", `vexart-engine-image-style-${process.pid}.png`)
  const rgba = Buffer.from([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
  ])
  await sharp(rgba, { raw: { width: 4, height: 2, channels: 4 } }).png().toFile(sourcePath)
  try {
    const fill = await renderNodeToBuffer(imageFixtureRoot(sourcePath, 24, 24, "fill"), 24, 24, 8)
    const cover = await renderNodeToBuffer(imageFixtureRoot(sourcePath, 24, 24, "cover"), 24, 24, 8)
    const contain = await renderNodeToBuffer(imageFixtureRoot(sourcePath, 24, 24, "contain"), 24, 24, 8)
    const none = await renderNodeToBuffer(imageFixtureRoot(sourcePath, 24, 24, "none"), 24, 24, 8)
    const rounded = await renderNodeToBuffer(imageFixtureRoot(sourcePath, 24, 24, "fill", 12), 24, 24, 8)

    expect(pixel(fill, 3, 12).slice(0, 3)).toEqual(new Uint8Array([255, 0, 0]))
    expect(pixel(fill, 9, 12).slice(0, 3)).toEqual(new Uint8Array([0, 255, 0]))
    expect(pixel(fill, 15, 12).slice(0, 3)).toEqual(new Uint8Array([0, 0, 255]))
    expect(pixel(fill, 21, 12).slice(0, 3)).toEqual(new Uint8Array([255, 255, 0]))
    expect(pixel(cover, 3, 12).slice(0, 3)).toEqual(new Uint8Array([0, 255, 0]))
    expect(pixel(cover, 9, 12).slice(0, 3)).toEqual(new Uint8Array([0, 255, 0]))
    expect(pixel(cover, 15, 12).slice(0, 3)).toEqual(new Uint8Array([0, 0, 255]))
    expect(pixel(cover, 21, 12).slice(0, 3)).toEqual(new Uint8Array([0, 0, 255]))
    expect(pixel(contain, 3, 1)).toEqual(new Uint8Array([16, 32, 48, 255]))
    expect(pixel(contain, 3, 12).slice(0, 3)).toEqual(new Uint8Array([255, 0, 0]))
    expect(pixel(none, 0, 1).slice(0, 3)).toEqual(new Uint8Array([255, 0, 0]))
    expect(pixel(none, 3, 1).slice(0, 3)).toEqual(new Uint8Array([255, 255, 0]))
    expect(pixel(none, 5, 5)).toEqual(new Uint8Array([16, 32, 48, 255]))
    expect(pixel(rounded, 0, 0)).toEqual(new Uint8Array([16, 32, 48, 255]))
    expect(pixel(rounded, 12, 12).slice(0, 3)).toEqual(new Uint8Array([0, 0, 255]))
  } finally {
    await unlink(sourcePath).catch(() => undefined)
  }
})

test("forwards img opacity through the GPU compositor", async () => {
  const sourcePath = join("/tmp", `vexart-engine-image-opacity-${process.pid}.png`)
  const rgba = Buffer.from([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
  ])
  await sharp(rgba, { raw: { width: 4, height: 2, channels: 4 } }).png().toFile(sourcePath)
  try {
    const opaque = await renderNodeToBuffer(imageFixtureRoot(sourcePath, 24, 24, "fill"), 24, 24, 8)
    const translucentRoot = imageFixtureRoot(sourcePath, 24, 24, "fill", 0, 0.5)
    const translucent = await renderNodeToBuffer(translucentRoot, 24, 24, 8)
    const hidden = await renderNodeToBuffer(imageFixtureRoot(sourcePath, 24, 24, "fill", 0, 0), 24, 24, 8)
    const roundedCover = await renderNodeToBuffer(imageFixtureRoot(sourcePath, 24, 24, "cover", 12, 0.5), 24, 24, 8)
    const contained = await renderNodeToBuffer(imageFixtureRoot(sourcePath, 24, 24, "contain", 0, 0.5), 24, 24, 8)
    const opaqueRed = pixel(opaque, 3, 12)
    const translucentRed = pixel(translucent, 3, 12)
    const expectBlend = (actual: Uint8Array, sourcePixel: readonly number[]) => {
      const expected = sourcePixel.map((channel, index) => (
        index < 3 ? Math.round(channel * 0.5 + [16, 32, 48][index] * 0.5) : 255
      ))
      for (let index = 0; index < 3; index++) expect(Math.abs(actual[index] - expected[index])).toBeLessThanOrEqual(1)
      expect(actual[3]).toBe(255)
    }

    expect(opaqueRed).toEqual(new Uint8Array([255, 0, 0, 255]))
    expectBlend(translucentRed, [255, 0, 0, 255])
    expect(pixel(hidden, 12, 12)).toEqual(new Uint8Array([16, 32, 48, 255]))
    expect(pixel(roundedCover, 0, 0)).toEqual(new Uint8Array([16, 32, 48, 255]))
    expectBlend(pixel(roundedCover, 3, 12), [0, 255, 0, 255])
    expect(pixel(contained, 3, 1)).toEqual(new Uint8Array([16, 32, 48, 255]))
    expectBlend(pixel(contained, 3, 12), [255, 0, 0, 255])

    const reactiveRoot = imageFixtureRoot(sourcePath, 24, 24, "fill", 0, 0.5)
    const reactiveImage = reactiveRoot.children[0]
    const reactive = await renderNodeToBufferAfterInteractions(reactiveRoot, 24, 24, async ({ frame }) => {
      prop(reactiveImage, "opacity", 1)
      await frame()
    }, 8)
    expect(pixel(reactive, 3, 12)).toEqual(new Uint8Array([255, 0, 0, 255]))
  } finally {
    await unlink(sourcePath).catch(() => undefined)
  }
})

test("renders a clipped oversized styled image from a viewport-sized GPU crop", async () => {
  const root = prop(
    prop(
      prop(createNode("box"), "width", 180),
      "height", 80,
    ),
    "backgroundColor", 0x0b0d10ff,
  )
  const viewport = prop(
    prop(
      prop(
        prop(createNode("box"), "width", 110),
        "height", 50,
      ),
      "scrollX", true,
    ),
    "backgroundColor", 0x090c11ff,
  )
  const row = prop(
    prop(
      prop(
        prop(createNode("box"), "width", 110),
        "height", 50,
      ),
      "flexShrink", 0,
    ),
    "transform", { translateX: 0 },
  )
  prop(row, "direction", "row")
  const image = prop(
    prop(
      prop(
        prop(
          createNode("img"),
          "width", 2400,
        ),
        "height", 50,
      ),
      "objectFit", "cover",
    ),
    "cornerRadius", 12,
  )
  prop(image, "flexShrink", 0)
  ensureImageExtra(image).state = "loaded"
  ensureImageExtra(image).buffer = {
    data: new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
    ]),
    width: 4,
    height: 2,
  }
  insertChild(row, image)
  insertChild(viewport, row)
  insertChild(root, viewport)

  const frame = await renderNodeToBuffer(root, 180, 80, 8)
  expect(countColor(frame, [9, 12, 17, 255])).toBeLessThan(110 * 50)
  expect(countColor(frame, [11, 13, 16, 255])).toBeGreaterThan(0)
  expect(pixel(frame, 20, 25).slice(0, 3)).toEqual(new Uint8Array([255, 0, 0]))
  expect(pixel(frame, 0, 0)).toEqual(new Uint8Array([9, 12, 17, 255]))
  expect(pixel(frame, 112, 25)).toEqual(new Uint8Array([11, 13, 16, 255]))
})

test("preserves the horizontal source offset for a translated retained image layer", async () => {
  const root = prop(
    prop(
      prop(createNode("box"), "width", 24),
      "height", 24,
    ),
    "backgroundColor", 0x090c11ff,
  )
  const row = prop(prop(prop(createNode("box"), "width", 48), "height", 24), "transform", { translateX: -5 })
  prop(row, "layer", true)
  const image = prop(prop(prop(createNode("img"), "width", 48), "height", 24), "objectFit", "fill")
  ensureImageExtra(image).state = "loaded"
  ensureImageExtra(image).buffer = {
    data: new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
    ]),
    width: 4,
    height: 2,
  }
  insertChild(row, image)
  insertChild(root, row)

  const frame = await renderNodeToBuffer(root, 24, 24, 8)
  expect(pixel(frame, 3, 12).slice(0, 3)).toEqual(new Uint8Array([255, 0, 0]))
  expect(pixel(frame, 8, 12).slice(0, 3)).toEqual(new Uint8Array([0, 255, 0]))
  expect(pixel(frame, 20, 12).slice(0, 3)).toEqual(new Uint8Array([0, 0, 255]))
})

test("keeps child overflow visible when a translated retained layer opts out of viewport clipping", async () => {
  const root = prop(
    prop(
      prop(createNode("box"), "width", 24),
      "height", 24,
    ),
    "backgroundColor", 0x090c11ff,
  )
  const row = prop(prop(prop(createNode("box"), "width", 24), "height", 24), "transform", { translateX: -5 })
  prop(row, "layer", true)
  prop(row, "viewportClip", false)
  const image = prop(
    prop(
      prop(prop(createNode("img"), "width", 64), "height", 24),
      "objectFit", "fill",
    ),
    "flexShrink", 0,
  )
  ensureImageExtra(image).state = "loaded"
  ensureImageExtra(image).buffer = {
    data: new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
    ]),
    width: 4,
    height: 2,
  }
  insertChild(row, image)
  insertChild(root, row)

  const frame = await renderNodeToBuffer(root, 24, 24, 8)
  expect(pixel(frame, 3, 12).slice(0, 3)).toEqual(new Uint8Array([255, 0, 0]))
  expect(pixel(frame, 20, 12).slice(0, 3)).toEqual(new Uint8Array([0, 255, 0]))
})

test("preserves an outside shadow on a translated retained layer", async () => {
  const root = prop(
    prop(
      prop(createNode("box"), "width", 24),
      "height", 24,
    ),
    "backgroundColor", 0x090c11ff,
  )
  const row = prop(prop(prop(createNode("box"), "width", 24), "height", 24), "transform", { translateX: -5 })
  prop(row, "layer", true)
  prop(row, "direction", "row")
  prop(row, "viewportClip", false)
  const spacer = prop(prop(createNode("box"), "width", 10), "height", 24)
  const child = prop(prop(prop(createNode("box"), "width", 20), "height", 20), "backgroundColor", 0xff0000ff)
  prop(child, "shadow", { x: 0, y: 0, blur: 4, color: 0x00ffffff })
  insertChild(row, spacer)
  insertChild(row, child)
  insertChild(root, row)

  const frame = await renderNodeToBuffer(root, 24, 24, 8)
  expect(pixel(frame, 0, 12)[1]).toBeGreaterThan(80)
  expect(pixel(frame, 2, 12)[1]).toBeGreaterThan(200)
  expect(pixel(frame, 3, 12).slice(0, 3)).toEqual(new Uint8Array([255, 0, 0]))
})

test("preserves an outside boxShadow on a translated retained layer", async () => {
  const root = prop(
    prop(
      prop(createNode("box"), "width", 24),
      "height", 24,
    ),
    "backgroundColor", 0x090c11ff,
  )
  const row = prop(prop(prop(createNode("box"), "width", 24), "height", 24), "transform", { translateX: -5 })
  prop(row, "layer", true)
  prop(row, "direction", "row")
  prop(row, "viewportClip", false)
  const spacer = prop(prop(createNode("box"), "width", 10), "height", 24)
  const child = prop(prop(prop(createNode("box"), "width", 20), "height", 20), "backgroundColor", 0xff0000ff)
  prop(child, "boxShadow", { x: 0, y: 0, blur: 4, color: 0x00ffffff })
  insertChild(row, spacer)
  insertChild(row, child)
  insertChild(root, row)

  const frame = await renderNodeToBuffer(root, 24, 24, 8)
  expect(pixel(frame, 0, 12)[1]).toBeGreaterThan(80)
  expect(pixel(frame, 2, 12)[1]).toBeGreaterThan(200)
  expect(pixel(frame, 3, 12).slice(0, 3)).toEqual(new Uint8Array([255, 0, 0]))
})
