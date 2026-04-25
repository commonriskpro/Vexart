import { describe, expect, test } from "bun:test"
import { createNode, insertChild } from "../ffi/node"
import { CMD, type RenderCommand } from "../ffi/render-graph"
import { damageRectForLayoutTransition, sortNodesByStackingPaintOrder, updateCommandsToLayoutMap } from "./layout"

describe("updateCommandsToLayoutMap", () => {
  test("realigns regular and scissor commands by nodeId", () => {
    const commands: RenderCommand[] = [
      { type: CMD.RECTANGLE, x: 1, y: 2, width: 3, height: 4, color: [0, 0, 0, 0], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: 10 },
      { type: CMD.SCISSOR_START, x: 5, y: 6, width: 7, height: 8, color: [0, 0, 0, 0], cornerRadius: 0, extra1: 0, extra2: 0, nodeId: 20 },
      { type: CMD.SCISSOR_END, x: 9, y: 10, width: 11, height: 12, color: [0, 0, 0, 0], cornerRadius: 0, extra1: 0, extra2: 0 },
    ]

    const layoutMap = new Map([
      [10, { nodeId: 10, x: 100, y: 200, width: 300, height: 400, contentX: 0, contentY: 0, contentW: 0, contentH: 0 }],
      [20, { nodeId: 20, x: 50, y: 60, width: 70, height: 80, contentX: 0, contentY: 0, contentW: 0, contentH: 0 }],
    ])

    updateCommandsToLayoutMap(commands, layoutMap)

    expect(commands[0]).toMatchObject({ x: 100, y: 200, width: 300, height: 400 })
    expect(commands[1]).toMatchObject({ x: 50, y: 60, width: 70, height: 80 })
    expect(commands[2]).toMatchObject({ x: 9, y: 10, width: 11, height: 12 })
  })
})

describe("damageRectForLayoutTransition", () => {
  test("returns union of previous and next rects when layout moves", () => {
    expect(
      damageRectForLayoutTransition(
        { x: 10, y: 20, width: 30, height: 40 },
        { x: 25, y: 15, width: 30, height: 40 },
      ),
    ).toEqual({ x: 10, y: 15, width: 45, height: 45 })
  })

  test("returns next rect when node appears from empty layout", () => {
    expect(
      damageRectForLayoutTransition(
        { x: 0, y: 0, width: 0, height: 0 },
        { x: 5, y: 6, width: 7, height: 8 },
      ),
    ).toEqual({ x: 5, y: 6, width: 7, height: 8 })
  })
})

describe("sortNodesByStackingPaintOrder", () => {
  test("keeps descendant z-index scoped to its parent context", () => {
    const root = createNode("box")
    const upper = createNode("box")
    const upperChild = createNode("box")
    const lower = createNode("box")
    const escapingChild = createNode("box")

    upper.props = { floating: "parent", zIndex: 20 }
    lower.props = { floating: "parent", zIndex: 10 }
    escapingChild.props = { floating: "parent", zIndex: 999 }

    insertChild(root, upper)
    insertChild(root, lower)
    insertChild(upper, upperChild)
    insertChild(lower, escapingChild)

    expect(sortNodesByStackingPaintOrder([upperChild, escapingChild, upper, lower])).toEqual([
      lower,
      escapingChild,
      upper,
      upperChild,
    ])
  })
})
