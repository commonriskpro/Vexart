import { describe, expect, test } from "bun:test"
import { insertChild, createNode } from "../ffi/node"
import { setProp } from "../reconciler/reconciler"
import { renderNodeToBuffer, renderNodeToBufferAfterInteractions } from "./render-to-buffer"

function prop(node: ReturnType<typeof createNode>, name: string, value: unknown) {
  setProp(node, name, value)
  return node
}

function pixel(frame: { pixels: Uint8Array; width: number }, x: number, y: number) {
  const offset = (y * frame.width + x) * 4
  return frame.pixels.slice(offset, offset + 4)
}

function expectPixelNear(actual: Uint8Array, expected: number[], tolerance = 2) {
  expected.forEach((value, index) => {
    expect(Math.abs(actual[index] - value)).toBeLessThanOrEqual(tolerance)
  })
}

describe("GPU self-filter composition", () => {
  test("changes the intrinsic rect pixels instead of leaving the source orange", async () => {
    const sourceNode = createNode("box")
    prop(sourceNode, "width", 40)
    prop(sourceNode, "height", 40)
    prop(sourceNode, "backgroundColor", 0xf97316ff)

    const source = await renderNodeToBuffer(sourceNode, 80, 80)

    const node = createNode("box")
    prop(node, "width", 40)
    prop(node, "height", 40)
    prop(node, "backgroundColor", 0xf97316ff)
    prop(node, "filter", { grayscale: 72, contrast: 150 })
    const filtered = await renderNodeToBuffer(node, 80, 80)
    const sourcePixel = pixel(source, 20, 20)
    const filteredPixel = pixel(filtered, 20, 20)

    expect(sourcePixel).toEqual(new Uint8Array([249, 115, 22, 255]))
    expect(filteredPixel[2]).toBeGreaterThan(sourcePixel[2] + 40)
    expect(filteredPixel[0] - filteredPixel[2]).toBeLessThan(sourcePixel[0] - sourcePixel[2])
  })

  test("passes every self-filter channel to the source-bound GPU filter", async () => {
    const cases = [
      { filter: { brightness: 50 }, expected: [125, 58, 11, 255] },
      { filter: { contrast: 50 }, expected: [188, 121, 75, 255] },
      { filter: { saturate: 0 }, expected: [137, 137, 137, 255] },
      { filter: { grayscale: 100 }, expected: [137, 137, 137, 255] },
      { filter: { invert: 100 }, expected: [6, 140, 233, 255] },
      { filter: { sepia: 100 }, expected: [190, 169, 132, 255] },
      { filter: { hueRotate: 180 }, expected: [25, 159, 252, 255] },
    ]

    for (const item of cases) {
      const node = createNode("box")
      prop(node, "width", 40)
      prop(node, "height", 40)
      prop(node, "backgroundColor", 0xf97316ff)
      prop(node, "filter", item.filter)
      expectPixelNear(pixel(await renderNodeToBuffer(node, 80, 80), 20, 20), item.expected)
    }
  })

  test("filters descendants as one isolated output and leaves siblings untouched", async () => {
    const root = createNode("box")
    prop(root, "width", 80)
    prop(root, "height", 80)
    prop(root, "direction", "column")

    const filtered = createNode("box")
    prop(filtered, "width", 80)
    prop(filtered, "height", 40)
    prop(filtered, "backgroundColor", 0xf97316ff)
    prop(filtered, "filter", { grayscale: 100 })
    const child = createNode("box")
    prop(child, "width", 20)
    prop(child, "height", 20)
    prop(child, "backgroundColor", 0x3b82f6ff)
    insertChild(filtered, child)

    const sibling = createNode("box")
    prop(sibling, "width", 80)
    prop(sibling, "height", 40)
    prop(sibling, "backgroundColor", 0x22c55eff)
    insertChild(root, filtered)
    insertChild(root, sibling)

    const frame = await renderNodeToBuffer(root, 80, 80)
    const childPixel = pixel(frame, 10, 10)
    const siblingPixel = pixel(frame, 20, 60)

    expect(childPixel[0]).toBeGreaterThan(100)
    expect(Math.max(childPixel[0], childPixel[1], childPixel[2]) - Math.min(childPixel[0], childPixel[1], childPixel[2])).toBeLessThan(2)
    expect(siblingPixel).toEqual(new Uint8Array([34, 197, 94, 255]))
  })

  test("keeps a promoted descendant inside the filtered parent output", async () => {
    const root = createNode("box")
    prop(root, "width", 80)
    prop(root, "height", 80)
    prop(root, "backgroundColor", 0xffffffff)
    const filtered = createNode("box")
    prop(filtered, "width", 80)
    prop(filtered, "height", 40)
    prop(filtered, "filter", { grayscale: 100 })
    const promoted = createNode("box")
    prop(promoted, "width", 20)
    prop(promoted, "height", 20)
    prop(promoted, "backgroundColor", 0x3b82f6ff)
    prop(promoted, "layer", true)
    insertChild(filtered, promoted)
    insertChild(root, filtered)

    const frame = await renderNodeToBuffer(root, 80, 80)
    expectPixelNear(pixel(frame, 10, 10), [123, 123, 123, 255])
  })

  test("keeps a transformed descendant inside the filtered parent output", async () => {
    const root = createNode("box")
    prop(root, "width", 80)
    prop(root, "height", 80)
    prop(root, "backgroundColor", 0xffffffff)
    const filtered = createNode("box")
    prop(filtered, "width", 80)
    prop(filtered, "height", 40)
    prop(filtered, "filter", { grayscale: 100 })
    const transformed = createNode("box")
    prop(transformed, "width", 40)
    prop(transformed, "height", 20)
    prop(transformed, "transform", { translateX: 20 })
    const transformedChild = createNode("box")
    prop(transformedChild, "width", 20)
    prop(transformedChild, "height", 20)
    prop(transformedChild, "backgroundColor", 0x3b82f6ff)
    insertChild(transformed, transformedChild)
    insertChild(filtered, transformed)
    insertChild(root, filtered)

    const frame = await renderNodeToBuffer(root, 80, 80)
    expectPixelNear(pixel(frame, 25, 10), [123, 123, 123, 255])
    expectPixelNear(pixel(frame, 5, 10), [254, 254, 254, 255])
  })

  test("captures overflow descendants for filtered and group-opacity parents", async () => {
    const makeScene = (opacity: number | undefined, filter: object | undefined) => {
      const root = createNode("box")
      prop(root, "width", 100)
      prop(root, "height", 60)
      prop(root, "backgroundColor", 0xffffffff)
      const parent = createNode("box")
      prop(parent, "width", 40)
      prop(parent, "height", 40)
      if (opacity !== undefined) prop(parent, "opacity", opacity)
      if (filter !== undefined) prop(parent, "filter", filter)
      const child = createNode("box")
      prop(child, "width", 80)
      prop(child, "height", 20)
      prop(child, "backgroundColor", 0x3b82f6ff)
      insertChild(parent, child)
      insertChild(root, parent)
      return root
    }

    const filtered = await renderNodeToBuffer(makeScene(undefined, { grayscale: 100 }), 100, 60)
    expectPixelNear(pixel(filtered, 50, 10), [123, 123, 123, 255])
    expectPixelNear(pixel(filtered, 90, 10), [255, 255, 255, 255])

    const opaque = await renderNodeToBuffer(makeScene(0.5, undefined), 100, 60)
    expectPixelNear(pixel(opaque, 50, 10), [157, 193, 251, 255])
    expectPixelNear(pixel(opaque, 90, 10), [255, 255, 255, 255])
  })

  test("clips a transformed filtered child to its scroll viewport", async () => {
    const root = createNode("box")
    prop(root, "width", 80)
    prop(root, "height", 60)
    prop(root, "backgroundColor", 0xffffffff)
    const scroller = createNode("box")
    prop(scroller, "width", 40)
    prop(scroller, "height", 40)
    prop(scroller, "scrollX", true)
    prop(scroller, "scrollY", true)
    const filtered = createNode("box")
    prop(filtered, "width", 20)
    prop(filtered, "height", 20)
    prop(filtered, "backgroundColor", 0xf97316ff)
    prop(filtered, "filter", { invert: 100 })
    prop(filtered, "transform", { translateX: 30 })
    insertChild(scroller, filtered)
    insertChild(root, scroller)

    const frame = await renderNodeToBuffer(root, 80, 60)
    expectPixelNear(pixel(frame, 35, 10), [6, 140, 233, 255])
    expectPixelNear(pixel(frame, 45, 10), [255, 255, 255, 255])
  })

  test("applies opacity once while compositing the filtered output", async () => {
    const root = createNode("box")
    prop(root, "width", 80)
    prop(root, "height", 80)
    prop(root, "backgroundColor", 0xffffffff)
    const node = createNode("box")
    prop(node, "width", 40)
    prop(node, "height", 40)
    prop(node, "backgroundColor", 0xf97316ff)
    prop(node, "opacity", 0.5)
    prop(node, "filter", { grayscale: 100 })
    insertChild(root, node)

    const frame = await renderNodeToBuffer(root, 80, 80)
    const center = pixel(frame, 20, 20)

    // Source grayscale is 137. A single 0.5 alpha composite over white is
    // 196, whereas applying alpha to the isolated source and again on
    // composition incorrectly produces a dark premultiplied result (~34).
    expectPixelNear(center, [196, 196, 196, 255])
    expectPixelNear(pixel(frame, 60, 20), [255, 255, 255, 255])
  })

  test("composites group opacity over the subtree rather than each child", async () => {
    const root = createNode("box")
    prop(root, "width", 64)
    prop(root, "height", 64)
    prop(root, "backgroundColor", 0xffffffff)
    const group = createNode("box")
    prop(group, "width", 32)
    prop(group, "height", 32)
    prop(group, "opacity", 0.5)
    const child = createNode("box")
    prop(child, "width", 32)
    prop(child, "height", 32)
    prop(child, "backgroundColor", 0xff0000ff)
    prop(child, "layer", true)
    insertChild(group, child)
    insertChild(root, group)

    const frame = await renderNodeToBuffer(root, 64, 64)
    const blended = pixel(frame, 16, 16)
    expect(blended[0]).toBe(255)
    expect(blended[1]).toBeGreaterThanOrEqual(127)
    expect(blended[1]).toBeLessThanOrEqual(128)
    expect(blended[2]).toBe(blended[1])
    expect(blended[3]).toBe(255)
    expect(pixel(frame, 48, 48)).toEqual(new Uint8Array([255, 255, 255, 255]))
  })

  test("keeps filtered content correct at a clipped edge and through a transform", async () => {
    const clipped = createNode("box")
    prop(clipped, "width", 120)
    prop(clipped, "height", 40)
    prop(clipped, "backgroundColor", 0xf97316ff)
    prop(clipped, "filter", { invert: 100 })
    const clippedFrame = await renderNodeToBuffer(clipped, 80, 80)
    const edge = pixel(clippedFrame, 79, 20)
    expect(edge[2]).toBeGreaterThan(150)

    const transformed = createNode("box")
    prop(transformed, "width", 20)
    prop(transformed, "height", 20)
    prop(transformed, "backgroundColor", 0xf97316ff)
    prop(transformed, "filter", { invert: 100 })
    prop(transformed, "transform", { translateX: 20 })
    const transformedFrame = await renderNodeToBuffer(transformed, 80, 50)
    expect(pixel(transformedFrame, 5, 10)[3]).toBe(0)
    expect(pixel(transformedFrame, 25, 10)).toEqual(new Uint8Array([6, 140, 233, 255]))
  })

  test("rebuilds the filtered source when the filter prop changes", async () => {
    const node = createNode("box")
    prop(node, "width", 40)
    prop(node, "height", 40)
    prop(node, "backgroundColor", 0xf97316ff)
    prop(node, "filter", { invert: 100 })

    const frame = await renderNodeToBufferAfterInteractions(node, 80, 80, async ({ frame }) => {
      prop(node, "filter", { grayscale: 100 })
      await frame()
    })

    expect(pixel(frame, 20, 20)).toEqual(new Uint8Array([137, 137, 137, 255]))
  })
})
