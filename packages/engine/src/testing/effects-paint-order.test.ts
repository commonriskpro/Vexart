import { describe, expect, test } from "bun:test"
import { createNode, insertChild } from "../ffi/node"
import { setProp } from "../reconciler/reconciler"
import { renderNodeToBuffer } from "./render-to-buffer"

function prop(node: ReturnType<typeof createNode>, name: string, value: unknown) {
  setProp(node, name, value)
  return node
}

function pixel(frame: { pixels: Uint8Array; width: number }, x: number, y: number) {
  const offset = (y * frame.width + x) * 4
  return frame.pixels.slice(offset, offset + 4)
}

describe("GPU paint effect ordering", () => {
  test("paints a positive-y shadow behind the opaque source fill", async () => {
    const root = createNode("box")
    prop(root, "width", 240)
    prop(root, "height", 240)
    prop(root, "padding", 80)
    prop(root, "backgroundColor", 0x181818ff)

    const child = createNode("box")
    prop(child, "width", 88)
    prop(child, "height", 76)
    prop(child, "backgroundColor", 0x22c55eff)
    prop(child, "shadow", { x: 0, y: 10, blur: 18, color: 0x000000aa })
    insertChild(root, child)

    const frame = await renderNodeToBuffer(root, 240, 240)
    expect(pixel(frame, 120, 82)).toEqual(new Uint8Array([34, 197, 94, 255]))
    expect(pixel(frame, 120, 88)).toEqual(new Uint8Array([34, 197, 94, 255]))
  })

  test("keeps signed shadow offsets and multi-shadow channels outside the source", async () => {
    const root = createNode("box")
    prop(root, "width", 96)
    prop(root, "height", 64)
    prop(root, "backgroundColor", 0x000000ff)

    const child = createNode("box")
    prop(child, "floating", "parent")
    prop(child, "floatOffset", { x: 32, y: 16 })
    prop(child, "width", 32)
    prop(child, "height", 32)
    prop(child, "backgroundColor", 0xffffffff)
    prop(child, "shadow", [
      { x: -8, y: 0, blur: 6, color: 0xff0000aa },
      { x: 8, y: 0, blur: 6, color: 0x0000ffaa },
    ])
    insertChild(root, child)

    const frame = await renderNodeToBuffer(root, 96, 64)
    expect(pixel(frame, 48, 32)).toEqual(new Uint8Array([255, 255, 255, 255]))
    const left = pixel(frame, 22, 32)
    const right = pixel(frame, 72, 32)
    expect(left[0]).toBeGreaterThan(left[2] + 20)
    expect(right[2]).toBeGreaterThan(right[0] + 20)
  })
})
