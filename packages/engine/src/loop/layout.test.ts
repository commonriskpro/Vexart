import { describe, expect, test } from "bun:test"
import { createNode, insertChild } from "../ffi/node"
import { damageRectForLayoutTransition } from "./pipeline-traverse"
import { sortNodesByStackingPaintOrder } from "./layout"

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
