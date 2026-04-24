import { afterEach, describe, expect, test } from "bun:test"
import { createElement, setProp } from "./reconciler"
import { bindLoop, unbindLoop } from "./pointer"
import type { RenderLoop } from "../loop/loop"

describe("reconciler visual damage bridge", () => {
  afterEach(() => {
    unbindLoop()
  })

  test("visual prop changes mark bounded layer damage", () => {
    const calls: Array<{ nodeId: number; rect?: { x: number; y: number; width: number; height: number } }> = []
    const loop = {
      markNodeLayerDamaged(nodeId: number, rect?: { x: number; y: number; width: number; height: number }) {
        calls.push({ nodeId, rect })
      },
    } as unknown as RenderLoop
    bindLoop(loop)

    const node = createElement("box")
    node.layout.x = 10
    node.layout.y = 20
    node.layout.width = 30
    node.layout.height = 40

    setProp(node, "backgroundColor", 0xff00ffff)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      nodeId: node.id,
      rect: { x: 10, y: 20, width: 30, height: 40 },
    })
  })
})
