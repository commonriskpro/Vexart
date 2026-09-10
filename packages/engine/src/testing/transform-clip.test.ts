import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { createNode, insertChild } from "../ffi/node"
import { multiply, transformPoint, translate } from "../ffi/matrix"
import { setProp } from "../reconciler/reconciler"
import { computeNodeLocalTransform, computeNodeSubtreeTransformQuad } from "../loop/composite-retained"
import { renderNodeToBuffer, renderNodeToBufferAfterInteractions } from "./render-to-buffer"

const imagePath = resolve(import.meta.dir, "../../../../scripts/visual-test/tmux-scenes/fixtures/quadrants.png")
const viewportWidth = 110
const viewportHeight = 50
const rowWidth = 230
const cardWidth = 30
const cardGap = 10
const rowOffset = -40
const viewportBackground = [9, 12, 17] as const
const rootBackground = [11, 13, 16] as const
const wideViewportWidth = 2048
const wideRowWidth = 4850

function prop(node: ReturnType<typeof createNode>, name: string, value: unknown) {
  setProp(node, name, value)
  return node
}

function pixel(frame: { pixels: Uint8Array; width: number }, x: number, y: number) {
  const offset = (y * frame.width + x) * 4
  return frame.pixels.slice(offset, offset + 4)
}

function variedPixels(frame: { pixels: Uint8Array; width: number }, x: number, y: number, width: number, height: number, background: readonly number[]) {
  let count = 0
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) {
      const actual = pixel(frame, col, row)
      const delta = Math.abs(actual[0] - background[0]) + Math.abs(actual[1] - background[1]) + Math.abs(actual[2] - background[2])
      if (delta > 20) count++
    }
  }
  return count
}

function imagePixels(frame: { pixels: Uint8Array; width: number }, x: number, y: number, width: number, height: number) {
  let count = 0
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) {
      const actual = pixel(frame, col, row)
      // Bottom-right quadrant of the deterministic 2×2 fixture. This cannot
      // be produced by the card or viewport placeholders.
      if (actual[0] > 180 && actual[1] > 120 && actual[2] < 100) count++
    }
  }
  return count
}

function pixelDelta(left: Uint8Array, right: Uint8Array) {
  let changed = 0
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) changed++
  }
  return changed
}

function createClipFixture(options: { scrollLayer?: boolean; rowLayer?: boolean; cardLayer?: boolean; leadingHeight?: number; rowWidth?: number; blur?: number; offset?: number } = {}) {
  const root = prop(createNode("box"), "width", 180)
  prop(root, "height", Math.max(80, (options.leadingHeight ?? 0) + 80))
  prop(root, "backgroundColor", 0x0b0d10ff)

  if (options.leadingHeight) {
    const leading = prop(createNode("box"), "width", 180)
    prop(leading, "height", options.leadingHeight)
    prop(leading, "backgroundColor", 0x161a20ff)
    insertChild(root, leading)
  }

  const viewport = prop(createNode("box"), "width", viewportWidth)
  prop(viewport, "height", viewportHeight)
  prop(viewport, "scrollX", true)
  prop(viewport, "backgroundColor", 0x090c11ff)
  if (options.scrollLayer) prop(viewport, "layer", true)

  const row = prop(createNode("box"), "width", options.rowWidth ?? rowWidth)
  prop(row, "height", viewportHeight)
  prop(row, "direction", "row")
  prop(row, "gap", cardGap)
  prop(row, "flexShrink", 0)
  prop(row, "transform", { translateX: options.offset ?? rowOffset })
  if (options.blur !== undefined) prop(row, "filter", { blur: options.blur })
  if (options.rowLayer) prop(row, "layer", true)

  const colors = [0xba8b5aff, 0x4a77baff, 0x5d3b8fff, 0x303640ff, 0x2f8c77ff]
  for (let index = 0; index < colors.length; index++) {
    const card = prop(createNode("box"), "width", cardWidth)
    prop(card, "height", viewportHeight)
    prop(card, "flexShrink", 0)
    prop(card, "backgroundColor", colors[index])
    if (options.cardLayer && index === 3) prop(card, "layer", true)
    if (index === 3) {
      const image = prop(createNode("img"), "src", imagePath)
      prop(image, "width", cardWidth)
      prop(image, "height", viewportHeight)
      prop(image, "objectFit", "cover")
      insertChild(card, image)
    }
    insertChild(row, card)
  }
  insertChild(viewport, row)
  insertChild(root, viewport)
  return { root, row }
}

function createWideClipFixture(options: { opacity?: number; filter?: boolean; nestedTransform?: boolean; cardGlow?: boolean; rowWidth?: number } = {}) {
  const root = prop(createNode("box"), "width", wideViewportWidth)
  prop(root, "height", 80)
  prop(root, "backgroundColor", 0x0b0d10ff)

  const viewport = prop(createNode("box"), "width", wideViewportWidth)
  prop(viewport, "height", 50)
  prop(viewport, "scrollX", true)
  prop(viewport, "layer", true)
  prop(viewport, "backgroundColor", 0x090c11ff)

  const row = prop(createNode("box"), "width", options.rowWidth ?? wideRowWidth)
  prop(row, "height", 50)
  prop(row, "direction", "row")
  prop(row, "gap", 10)
  prop(row, "flexShrink", 0)
  prop(row, "transform", { translateX: -900 })
  if (options.opacity !== undefined) prop(row, "opacity", options.opacity)
  if (options.filter) prop(row, "filter", { grayscale: 100 })
  for (let index = 0; index < 120; index++) {
    const card = prop(createNode("box"), "width", 30)
    prop(card, "height", 50)
    prop(card, "flexShrink", 0)
    prop(card, "backgroundColor", index % 2 === 0 ? 0x4a77baff : 0x5d3b8fff)
    if (options.cardGlow) prop(card, "glow", { radius: 4, color: 0x7dd3fcff, intensity: 60 })
    if (options.nestedTransform && index === 70) prop(card, "transform", { translateX: 5 })
    if (index === 70) {
      const image = prop(createNode("img"), "src", imagePath)
      prop(image, "width", 30)
      prop(image, "height", 50)
      prop(image, "objectFit", "cover")
      insertChild(card, image)
    }
    insertChild(row, card)
  }
  insertChild(viewport, row)
  insertChild(root, viewport)
  return root
}

function expectTranslatedRow(frame: { pixels: Uint8Array; width: number; height: number }, yOffset = 0) {
  // After -40, card 1 and card 2 land at the first two centers in the
  // viewport; card 3's local image enters at x=80..110.
  expect(pixel(frame, 15, yOffset + 25).slice(0, 3)).toEqual(new Uint8Array([74, 119, 186]))
  expect(pixel(frame, 55, yOffset + 25).slice(0, 3)).toEqual(new Uint8Array([93, 59, 143]))
  expect(variedPixels(frame, 82, yOffset + 5, 26, 40, viewportBackground)).toBeGreaterThan(40)
  expect(imagePixels(frame, 82, yOffset + 5, 26, 40)).toBeGreaterThan(40)
  expect(variedPixels(frame, viewportWidth + 2, yOffset + 5, 38, 40, rootBackground)).toBe(0)
}

describe("GPU transform and scroll clipping", () => {
  test("keeps a multi-child transformed row clipped and shows the entering image with or without a scroll layer", async () => {
    const variants = [
      await renderNodeToBuffer(createClipFixture().root, 180, 80, 6),
      await renderNodeToBuffer(createClipFixture({ scrollLayer: true }).root, 180, 80, 6),
      await renderNodeToBuffer(createClipFixture({ rowLayer: true }).root, 180, 80, 6),
      await renderNodeToBuffer(createClipFixture({ cardLayer: true }).root, 180, 80, 6),
    ]

    for (const frame of variants) expectTranslatedRow(frame)
  })

  test("repaints the translated row to the same pixels as the settled frame", async () => {
    const settled = await renderNodeToBuffer(createClipFixture().root, 180, 80, 6)
    const fixture = createClipFixture({ offset: 0 })
    const repainted = await renderNodeToBufferAfterInteractions(fixture.root, 180, 80, async ({ frame }) => {
      prop(fixture.row, "transform", { translateX: rowOffset })
      await frame()
    }, 6)

    expectTranslatedRow(repainted)
    expect(pixelDelta(settled.pixels, repainted.pixels)).toBeLessThan(400)
  })

  test("retained scroll-layer reuse preserves the same clipped row pixels", async () => {
    const retained = await renderNodeToBuffer(
      createClipFixture({ scrollLayer: true }).root,
      180,
      80,
      8,
      { forceLayerRepaint: false },
    )

    expectTranslatedRow(retained)
  })

  test("keeps a retained scroll layer local when preceding content moves it down", async () => {
    const leadingHeight = 280
    const frame = await renderNodeToBuffer(
      createClipFixture({ scrollLayer: true, leadingHeight }).root,
      180,
      leadingHeight + 80,
      8,
    )

    expectTranslatedRow(frame, leadingHeight)
  })

  test("bounds a full-width translated home row to the native target limit", async () => {
    const frame = await renderNodeToBuffer(createWideClipFixture(), wideViewportWidth, 80, 8)

    expect(variedPixels(frame, 1840, 5, 180, 40, viewportBackground)).toBeGreaterThan(200)
    expect(imagePixels(frame, 1880, 5, 120, 40)).toBeGreaterThan(100)
  })

  test("preserves blur edge parity between narrow and wide source captures", async () => {
    const narrow = await renderNodeToBuffer(createClipFixture({ blur: 2 }).root, 180, 80, 8)
    const wide = await renderNodeToBuffer(createClipFixture({ blur: 2, rowWidth: 1800 }).root, 180, 80, 8)

    expect(pixelDelta(narrow.pixels, wide.pixels)).toBeLessThan(800)
  })

  test("keeps a full-width group-opacity row bounded while cards enter", async () => {
    const frame = await renderNodeToBuffer(
      createWideClipFixture({ opacity: 0.8, nestedTransform: true }),
      wideViewportWidth,
      80,
      8,
    )

    expect(variedPixels(frame, 1840, 5, 180, 40, viewportBackground)).toBeGreaterThan(200)
  })

  test("reuses a retained scroll layer for a bounded full-width row", async () => {
    const frame = await renderNodeToBuffer(
      createWideClipFixture(),
      wideViewportWidth,
      80,
      8,
      { forceLayerRepaint: false },
    )

    expect(variedPixels(frame, 1840, 5, 180, 40, viewportBackground)).toBeGreaterThan(200)
    expect(imagePixels(frame, 1880, 5, 120, 40)).toBeGreaterThan(100)
  })

  test("keeps analytic card glows consistent after wide-source cropping", async () => {
    const narrow = await renderNodeToBuffer(createWideClipFixture({ cardGlow: true, rowWidth: 1800 }), wideViewportWidth, 80, 8)
    const wide = await renderNodeToBuffer(createWideClipFixture({ cardGlow: true }), wideViewportWidth, 80, 8)

    expect(pixelDelta(narrow.pixels, wide.pixels)).toBeLessThan(1200)
  })

  test("keeps a full-width filtered row bounded with a nested transform", async () => {
    const frame = await renderNodeToBuffer(
      createWideClipFixture({ filter: true, nestedTransform: true }),
      wideViewportWidth,
      80,
      8,
    )

    expect(variedPixels(frame, 1840, 5, 180, 40, viewportBackground)).toBeGreaterThan(200)
    const filtered = pixel(frame, 1905, 25)
    expect(Math.max(filtered[0], filtered[1], filtered[2]) - Math.min(filtered[0], filtered[1], filtered[2])).toBeLessThan(8)
  })

  test("preserves an internal scroll clip while the isolated transformed parent is filtered", async () => {
    const root = prop(createNode("box"), "width", 140)
    prop(root, "height", 70)
    prop(root, "backgroundColor", 0xffffffff)

    const outer = prop(createNode("box"), "width", 100)
    prop(outer, "height", 50)
    prop(outer, "scrollX", true)
    prop(outer, "backgroundColor", 0x090c11ff)

    const transformed = prop(createNode("box"), "width", 160)
    prop(transformed, "height", 40)
    prop(transformed, "transform", { translateX: -20 })
    prop(transformed, "filter", { grayscale: 100 })

    const inner = prop(createNode("box"), "width", 60)
    prop(inner, "height", 30)
    prop(inner, "scrollX", true)
    const innerRow = prop(createNode("box"), "width", 120)
    prop(innerRow, "height", 30)
    prop(innerRow, "direction", "row")
    const red = prop(createNode("box"), "width", 60)
    prop(red, "height", 30)
    prop(red, "backgroundColor", 0xff0000ff)
    const blue = prop(createNode("box"), "width", 60)
    prop(blue, "height", 30)
    prop(blue, "backgroundColor", 0x0000ffff)
    insertChild(innerRow, red)
    insertChild(innerRow, blue)
    insertChild(inner, innerRow)
    insertChild(transformed, inner)
    insertChild(outer, transformed)
    insertChild(root, outer)

    const frame = await renderNodeToBuffer(root, 140, 70, 6)
    const clippedRed = pixel(frame, 10, 15)
    const clippedBlue = pixel(frame, 50, 15)
    // The parent grayscale filter equalizes the channels, while the clipped
    // first child remains visibly brighter than the viewport background.
    expect(clippedRed[0]).toBeGreaterThan(40)
    expect(clippedRed[0]).toBe(clippedRed[1])
    expect(clippedRed[1]).toBe(clippedRed[2])
    expect(clippedBlue.slice(0, 3)).toEqual(new Uint8Array([9, 12, 17]))
  })

  test("applies a boundary transform once when composing an explicit layer", async () => {
    const root = prop(createNode("box"), "width", 100)
    prop(root, "height", 50)
    prop(root, "backgroundColor", 0xffffffff)
    const transformed = prop(createNode("box"), "width", 30)
    prop(transformed, "height", 30)
    prop(transformed, "layer", true)
    prop(transformed, "transform", { translateX: 20 })
    const child = prop(createNode("box"), "width", 30)
    prop(child, "height", 30)
    prop(child, "backgroundColor", 0x3b82f6ff)
    insertChild(transformed, child)
    insertChild(root, transformed)

    const frame = await renderNodeToBuffer(root, 100, 50, 6)
    expect(pixel(frame, 5, 15).slice(0, 3)).toEqual(new Uint8Array([255, 255, 255]))
    expect(pixel(frame, 25, 15).slice(0, 3)).toEqual(new Uint8Array([59, 130, 246]))
  })

  test("keeps a retained transformed owner consistent with group opacity and edge glow", async () => {
    const createOwnerFixture = () => {
      const root = prop(createNode("box"), "width", 100)
      prop(root, "height", 50)
      prop(root, "backgroundColor", 0xffffffff)
      const transformed = prop(createNode("box"), "width", 70)
      prop(transformed, "height", 30)
      prop(transformed, "layer", true)
      prop(transformed, "transform", { translateX: 50 })
      prop(transformed, "opacity", 0.8)
      const child = prop(createNode("box"), "width", 70)
      prop(child, "height", 30)
      prop(child, "backgroundColor", 0x3b82f6ff)
      prop(child, "glow", { radius: 4, color: 0x7dd3fcff, intensity: 60 })
      insertChild(transformed, child)
      insertChild(root, transformed)
      return root
    }

    const painted = await renderNodeToBuffer(createOwnerFixture(), 100, 50, 8)
    const retained = await renderNodeToBuffer(createOwnerFixture(), 100, 50, 8, { forceLayerRepaint: false })

    expect(pixelDelta(painted.pixels, retained.pixels)).toBeLessThan(500)
    expect(variedPixels(retained, 75, 5, 25, 30, [255, 255, 255])).toBeGreaterThan(200)
  })
})

describe("retained transform composition", () => {
  test("applies a child transform before its non-commuting parent transform", () => {
    const root = createNode("root")
    const parent = createNode("box")
    const child = createNode("box")
    parent.layout = { x: 10, y: 10, width: 100, height: 100 }
    child.layout = { x: 30, y: 30, width: 20, height: 20 }
    prop(parent, "transform", { rotate: 90 })
    prop(child, "transform", { translateX: 15, translateY: 5 })
    insertChild(parent, child)
    insertChild(root, parent)

    const parentLocal = computeNodeLocalTransform(parent)!
    const childLocal = computeNodeLocalTransform(child)!
    const parentAbsolute = multiply(multiply(translate(parent.layout.x, parent.layout.y), parentLocal), translate(-parent.layout.x, -parent.layout.y))
    const childAbsolute = multiply(multiply(translate(child.layout.x, child.layout.y), childLocal), translate(-child.layout.x, -child.layout.y))
    const childPoint = transformPoint(childAbsolute, child.layout.x, child.layout.y)
    const expected = transformPoint(parentAbsolute, childPoint.x, childPoint.y)
    const quad = computeNodeSubtreeTransformQuad(child)!

    expect(quad.p0.x).toBeCloseTo(expected.x, 6)
    expect(quad.p0.y).toBeCloseTo(expected.y, 6)
    expect(quad.p0.x).toBeCloseTo(85, 6)
    expect(quad.p0.y).toBeCloseTo(45, 6)
  })
})
