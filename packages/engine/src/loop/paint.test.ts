import { describe, expect, test } from "bun:test"
import { CMD } from "../ffi/render-graph"
import { canUseNativeRenderGraphForLayer } from "./paint"

describe("canUseNativeRenderGraphForLayer", () => {
  test("allows fully covered rect/text layers", () => {
    const snapshot = {
      ops: [
        { kind: "rect", nodeId: 11 },
        { kind: "text", nodeId: 12 },
      ],
    } as const
    const commands = [
      { type: CMD.RECTANGLE, nodeId: 1 },
      { type: CMD.TEXT, nodeId: 2 },
    ] as any
    const nativeToTs = new Map([[11, 1], [12, 2]])

    expect(canUseNativeRenderGraphForLayer(snapshot as any, commands, nativeToTs)).toBe(true)
  })

  test("allows partially covered layers so uncovered commands can still fall back", () => {
    const snapshot = {
      ops: [{ kind: "rect", nodeId: 11 }],
    } as const
    const commands = [
      { type: CMD.RECTANGLE, nodeId: 1 },
      { type: CMD.TEXT, nodeId: 2 },
    ] as any
    const nativeToTs = new Map([[11, 1]])

    expect(canUseNativeRenderGraphForLayer(snapshot as any, commands, nativeToTs)).toBe(true)
  })

  test("allows covered effect image and canvas layers", () => {
    const snapshot = {
      ops: [
        { kind: "effect", nodeId: 21 },
        { kind: "image", nodeId: 22 },
        { kind: "canvas", nodeId: 23 },
      ],
    } as const
    const commands = [
      { type: CMD.RECTANGLE, nodeId: 3 },
      { type: CMD.RECTANGLE, nodeId: 4 },
      { type: CMD.RECTANGLE, nodeId: 5 },
    ] as any
    const nativeToTs = new Map([[21, 3], [22, 4], [23, 5]])

    expect(canUseNativeRenderGraphForLayer(snapshot as any, commands, nativeToTs)).toBe(true)
  })
})
