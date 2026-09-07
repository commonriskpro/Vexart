import { afterEach, describe, expect, test } from "bun:test"
import { createNode, type TGENode } from "../ffi/node"
import { createScrollHandle, resetScrollHandles } from "./scroll"
import { applyScrollOffsets } from "./composite-scroll"
import type { CompositeFrameState } from "./composite"

afterEach(() => {
  resetScrollHandles()
})

function rect(node: TGENode, x: number, y: number, width: number, height: number) {
  node.layout = { x, y, width, height }
  return node
}

function child(parent: TGENode, node: TGENode) {
  node.parent = parent
  parent.children.push(node)
  return node
}

function state(scrollContainers: TGENode[]): CompositeFrameState {
  return {
    scrollContainers,
    scrollOffsets: new Map(),
    nodeRefById: new Map(),
  } as unknown as CompositeFrameState
}

describe("applyScrollOffsets scroll geometry", () => {
  test("includes direct text children in content extent and clamps scroll", () => {
    const scroller = rect(createNode("box"), 20, 40, 100, 50)
    scroller.props.scrollY = true
    scroller.props.scrollId = "direct-text"
    child(scroller, rect(createNode("text"), 20, 40, 90, 30))
    child(scroller, rect(createNode("text"), 20, 70, 90, 40))

    applyScrollOffsets([], state([scroller]))

    const handle = createScrollHandle("direct-text")
    expect(handle.contentHeight).toBe(70)
    expect(handle.contentWidth).toBe(100)

    handle.scrollTo(-100)
    expect(handle.scrollY).toBe(-20)
  })

  test("walks ordinary descendants but stops at nested scroll boundaries", () => {
    const outer = rect(createNode("box"), 0, 0, 120, 100)
    outer.props.scrollY = true
    outer.props.scrollId = "outer"

    const wrapper = child(outer, rect(createNode("box"), 0, 0, 100, 20))
    child(wrapper, rect(createNode("text"), 0, 20, 100, 80))

    const inner = child(outer, rect(createNode("box"), 0, 60, 120, 30))
    inner.props.scrollY = true
    inner.props.scrollId = "inner"
    child(inner, rect(createNode("text"), 0, 60, 120, 200))

    child(outer, rect(createNode("text"), 0, 140, 100, 20))

    applyScrollOffsets([], state([outer, inner]))

    const outerHandle = createScrollHandle("outer")
    const innerHandle = createScrollHandle("inner")
    expect(outerHandle.contentHeight).toBe(160)
    expect(innerHandle.contentHeight).toBe(200)

    outerHandle.scrollTo(-1000)
    innerHandle.scrollTo(-1000)
    expect(outerHandle.scrollY).toBe(-60)
    expect(innerHandle.scrollY).toBe(-170)
  })
})
