import { afterEach, describe, expect, test } from "bun:test"
import { createElement, setProp, solidCreateTextNode } from "./reconciler"
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

  test("interactive style changes mark bounded layer damage", () => {
    const calls: Array<{ nodeId: number; rect?: { x: number; y: number; width: number; height: number } }> = []
    const loop = {
      markNodeLayerDamaged(nodeId: number, rect?: { x: number; y: number; width: number; height: number }) {
        calls.push({ nodeId, rect })
      },
    } as unknown as RenderLoop
    bindLoop(loop)

    const node = createElement("box")
    node.layout.x = 4
    node.layout.y = 5
    node.layout.width = 60
    node.layout.height = 20

    setProp(node, "hoverStyle", { backgroundColor: "#112233" })
    setProp(node, "focusStyle", { borderColor: "#445566", borderWidth: 2 })

    expect(calls).toEqual([
      { nodeId: node.id, rect: { x: 4, y: 5, width: 60, height: 20 } },
      { nodeId: node.id, rect: { x: 4, y: 5, width: 60, height: 20 } },
    ])
  })

  test("text visual prop changes mark bounded text damage", () => {
    const calls: Array<{ nodeId: number; rect?: { x: number; y: number; width: number; height: number } }> = []
    const loop = {
      markNodeLayerDamaged(nodeId: number, rect?: { x: number; y: number; width: number; height: number }) {
        calls.push({ nodeId, rect })
      },
    } as unknown as RenderLoop
    bindLoop(loop)

    const node = solidCreateTextNode("before")
    node.layout.x = 8
    node.layout.y = 9
    node.layout.width = 70
    node.layout.height = 18

    setProp(node, "color", "#abcdef")

    expect(calls).toEqual([
      { nodeId: node.id, rect: { x: 8, y: 9, width: 70, height: 18 } },
    ])
  })
})
