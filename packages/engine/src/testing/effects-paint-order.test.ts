import { describe, expect, spyOn, test } from "bun:test"
import * as gpuPack from "../ffi/gpu-pack"
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

  test("generates unclipped shadow NDC coordinates and renders without affine distortion near or across viewport edge", async () => {
    const shadowPackCalls: Array<{ x: number; y: number; w: number; h: number; boxW: number; boxH: number }> = []
    const originalPackShadowInstance = gpuPack.packShadowInstance
    const spy = spyOn(gpuPack, "packShadowInstance").mockImplementation((...args) => {
      shadowPackCalls.push({
        x: args[0],
        y: args[1],
        w: args[2],
        h: args[3],
        boxW: args[6],
        boxH: args[7],
      })
      return originalPackShadowInstance(...args)
    })

    try {
      const root = createNode("box")
      prop(root, "width", 120)
      prop(root, "height", 80)
      prop(root, "backgroundColor", 0x000000ff)

      const child = createNode("box")
      prop(child, "floating", "parent")
      prop(child, "floatOffset", { x: 0, y: 20 })
      prop(child, "width", 40)
      prop(child, "height", 40)
      prop(child, "backgroundColor", 0xffffffff)
      prop(child, "shadow", { x: 0, y: 0, blur: 10, color: 0x00ff00ff })
      insertChild(root, child)

      const frame = await renderNodeToBuffer(root, 120, 80)

      expect(shadowPackCalls.length).toBeGreaterThan(0)
      const lastCall = shadowPackCalls[shadowPackCalls.length - 1]
      expect(lastCall.x).toBeLessThan(-1.0)
      expect(lastCall.boxW).toBe(40)
      expect(lastCall.boxH).toBe(40)

      const topEdge = pixel(frame, 20, 15)
      const rightEdge = pixel(frame, 44, 40)
      expect(topEdge[1]).toBeGreaterThan(50)
      expect(Math.abs(topEdge[1] - rightEdge[1])).toBeLessThanOrEqual(2)
    } finally {
      spy.mockRestore()
    }
  })

  test("generates unclipped shadow NDC coordinates for negative offset extending past viewport edge", async () => {
    const shadowPackCalls: Array<{ x: number; y: number; w: number; h: number; boxW: number; boxH: number }> = []
    const originalPackShadowInstance = gpuPack.packShadowInstance
    const spy = spyOn(gpuPack, "packShadowInstance").mockImplementation((...args) => {
      shadowPackCalls.push({
        x: args[0],
        y: args[1],
        w: args[2],
        h: args[3],
        boxW: args[6],
        boxH: args[7],
      })
      return originalPackShadowInstance(...args)
    })

    try {
      const root = createNode("box")
      prop(root, "width", 120)
      prop(root, "height", 80)
      prop(root, "backgroundColor", 0x000000ff)

      const child = createNode("box")
      prop(child, "floating", "parent")
      prop(child, "floatOffset", { x: 8, y: 20 })
      prop(child, "width", 40)
      prop(child, "height", 40)
      prop(child, "backgroundColor", 0xffffffff)
      prop(child, "shadow", { x: -16, y: 0, blur: 8, color: 0xff0000ff })
      insertChild(root, child)

      const frame = await renderNodeToBuffer(root, 120, 80)

      expect(shadowPackCalls.length).toBeGreaterThan(0)
      const lastCall = shadowPackCalls[shadowPackCalls.length - 1]
      expect(lastCall.x).toBeLessThan(-1.0)
      expect(lastCall.boxW).toBe(40)

      const leftViewportEdge = pixel(frame, 0, 40)
      expect(leftViewportEdge[0]).toBeGreaterThan(150)
    } finally {
      spy.mockRestore()
    }
  })
})
