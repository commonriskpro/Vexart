import { afterEach, describe, expect, test } from "bun:test"
import { createNode, type TGENode } from "../ffi/node"
import { createLayerStore, type Layer } from "../ffi/layers"
import { CMD, type RenderGraphOp } from "../ffi/render-graph"
import { createScrollHandle, resetScrollHandles } from "./scroll"
import { routeScrollDeltas } from "./composite-scroll"
import { applyScrollOffsetsToOps, getParentScrollContainer } from "./pipeline-scroll"
import type { LayerOpBucket } from "./pipeline-types"
import { bindLayerDirtyStore, markLayerDirtyByKey, markLayerDamageByKey } from "./composite"
import { getEffectivePosition } from "../reconciler/hit-test"

afterEach(() => {
  resetScrollHandles()
  bindLayerDirtyStore(new Map<string, Layer>())
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

function state(scrollContainers: TGENode[]) {
  return {
    pointer: { x: 0, y: 0 },
    boxNodes: [] as TGENode[],
    scrollContainers,
    scrollOffsets: new Map<number, { x: number; y: number }>(),
    nodeRefById: new Map<number, TGENode>(),
  }
}

describe("applyScrollOffsets scroll geometry", () => {
  test("includes direct text children in content extent and clamps scroll", () => {
    const scroller = rect(createNode("box"), 20, 40, 100, 50)
    scroller.props.scrollY = true
    scroller.props.scrollId = "direct-text"
    child(scroller, rect(createNode("text"), 20, 40, 90, 30))
    child(scroller, rect(createNode("text"), 20, 70, 90, 40))

    applyScrollOffsetsToOps([], [scroller], new Map(), markLayerDirtyByKey)

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

    applyScrollOffsetsToOps([], [outer, inner], new Map(), markLayerDirtyByKey)

    const outerHandle = createScrollHandle("outer")
    const innerHandle = createScrollHandle("inner")
    expect(outerHandle.contentHeight).toBe(160)
    expect(innerHandle.contentHeight).toBe(200)

    outerHandle.scrollTo(-1000)
    innerHandle.scrollTo(-1000)
    expect(outerHandle.scrollY).toBe(-60)
    expect(innerHandle.scrollY).toBe(-170)
  })

  test("marks the scrolled layer dirty through the injected callback", () => {
    const scroller = rect(createNode("box"), 0, 0, 100, 50)
    scroller.props.scrollY = true
    scroller.props.scrollId = "dirty-layer"
    child(scroller, rect(createNode("text"), 0, 0, 100, 120))

    const layerStore = createLayerStore()
    const layer = layerStore.createLayer(0)
    layer.x = 0
    layer.y = 0
    layer.width = 100
    layer.height = 50
    bindLayerDirtyStore(new Map([["bg", layer]]))

    const frame = state([scroller])
    applyScrollOffsetsToOps([], frame.scrollContainers, frame.nodeRefById, { scrollOffsets: frame.scrollOffsets, markDirtyLayer: markLayerDirtyByKey })
    createScrollHandle("dirty-layer").scrollTo(-100)
    layer.dirty = false
    applyScrollOffsetsToOps([], frame.scrollContainers, frame.nodeRefById, { scrollOffsets: frame.scrollOffsets, markDirtyLayer: markLayerDirtyByKey })

    expect(layer.dirty).toBe(true)
    expect(layer.damageRect).toEqual({ x: 0, y: 0, width: 100, height: 50 })
  })

  test("limits layer.damageRect to scroll container bounds instead of full layer", () => {
    const scroller = rect(createNode("box"), 50, 60, 100, 50)
    scroller.props.scrollY = true
    scroller.props.scrollId = "regional-damage"
    child(scroller, rect(createNode("text"), 50, 60, 100, 200))

    const layerStore = createLayerStore()
    const layer = layerStore.createLayer(0)
    layer.x = 0
    layer.y = 0
    layer.width = 500
    layer.height = 500
    bindLayerDirtyStore(new Map([["bg", layer]]))

    const frame = state([scroller])
    applyScrollOffsetsToOps([], frame.scrollContainers, frame.nodeRefById, {
      scrollOffsets: frame.scrollOffsets,
      markDamageLayer: markLayerDamageByKey,
    })
    createScrollHandle("regional-damage").scrollTo(-50)
    layer.dirty = false
    layer.damageRect = null

    applyScrollOffsetsToOps([], frame.scrollContainers, frame.nodeRefById, {
      scrollOffsets: frame.scrollOffsets,
      markDamageLayer: markLayerDamageByKey,
    })

    expect(layer.dirty).toBe(true)
    expect(layer.damageRect as unknown).toEqual({ x: 50, y: 60, width: 100, height: 50 })
  })
})

describe("compounded scroll map (Decision 8 Option C)", () => {
  test("nested scroll containers compound parent offsets", () => {
    const containerA = rect(createNode("box"), 0, 0, 200, 100)
    containerA.props.scrollY = true
    containerA.props.scrollId = "container-a"
    containerA._scrollContainerId = 0

    const containerB = rect(createNode("box"), 10, 20, 180, 80)
    containerB.props.scrollY = true
    containerB.props.scrollId = "container-b"
    containerB._scrollContainerId = containerA.id
    child(containerA, containerB)

    const childC = rect(createNode("text"), 15, 25, 100, 200)
    childC._scrollContainerId = containerB.id
    child(containerB, childC)

    // Give containerA overflow so it can scroll by -50
    child(containerA, rect(createNode("text"), 0, 150, 100, 50))

    const s = state([containerA, containerB])
    s.nodeRefById.set(containerA.id, containerA)
    s.nodeRefById.set(containerB.id, containerB)
    s.nodeRefById.set(childC.id, childC)

    // First pass to set up content extents
    applyScrollOffsetsToOps([], s.scrollContainers, s.nodeRefById, { scrollOffsets: s.scrollOffsets, markDirtyLayer: markLayerDirtyByKey })

    createScrollHandle("container-a").scrollTo(-50)
    createScrollHandle("container-b").scrollTo(-20)

    applyScrollOffsetsToOps([], s.scrollContainers, s.nodeRefById, { scrollOffsets: s.scrollOffsets, markDirtyLayer: markLayerDirtyByKey })

    expect(s.scrollOffsets.get(containerA.id)).toEqual({ x: 0, y: -50 })
    expect(s.scrollOffsets.get(containerB.id)).toEqual({ x: 0, y: -70 })
  })

  test("zero local scroll in scrolled parent gets parent offset", () => {
    const containerA = rect(createNode("box"), 0, 0, 200, 100)
    containerA.props.scrollY = true
    containerA.props.scrollId = "container-a-zero"
    containerA._scrollContainerId = 0

    const containerB = rect(createNode("box"), 10, 20, 180, 80)
    containerB.props.scrollY = true
    containerB.props.scrollId = "container-b-zero"
    containerB._scrollContainerId = containerA.id
    child(containerA, containerB)

    const childC = rect(createNode("text"), 15, 25, 100, 200)
    childC._scrollContainerId = containerB.id
    child(containerB, childC)

    child(containerA, rect(createNode("text"), 0, 150, 100, 50))

    const s = state([containerA, containerB])
    s.nodeRefById.set(containerA.id, containerA)
    s.nodeRefById.set(containerB.id, containerB)
    s.nodeRefById.set(childC.id, childC)

    applyScrollOffsetsToOps([], s.scrollContainers, s.nodeRefById, { scrollOffsets: s.scrollOffsets, markDirtyLayer: markLayerDirtyByKey })

    createScrollHandle("container-a-zero").scrollTo(-50)
    createScrollHandle("container-b-zero").scrollTo(0)

    applyScrollOffsetsToOps([], s.scrollContainers, s.nodeRefById, { scrollOffsets: s.scrollOffsets, markDirtyLayer: markLayerDirtyByKey })

    expect(s.scrollOffsets.get(containerA.id)).toEqual({ x: 0, y: -50 })
    expect(s.scrollOffsets.get(containerB.id)).toEqual({ x: 0, y: -50 })
  })

  test("render op shifting: root op unshifted, nested op shifted by parent, child shifted by compounded", () => {
    const containerA = rect(createNode("box"), 0, 0, 200, 100)
    containerA.props.scrollY = true
    containerA.props.scrollId = "shift-a"
    containerA._scrollContainerId = 0

    const containerB = rect(createNode("box"), 10, 20, 180, 80)
    containerB.props.scrollY = true
    containerB.props.scrollId = "shift-b"
    containerB._scrollContainerId = containerA.id
    child(containerA, containerB)

    const childC = rect(createNode("text"), 15, 25, 100, 200)
    childC._scrollContainerId = containerB.id
    child(containerB, childC)

    child(containerA, rect(createNode("text"), 0, 150, 100, 50))

    const s = state([containerA, containerB])
    s.nodeRefById.set(containerA.id, containerA)
    s.nodeRefById.set(containerB.id, containerB)
    s.nodeRefById.set(childC.id, childC)

    applyScrollOffsetsToOps([], s.scrollContainers, s.nodeRefById, { scrollOffsets: s.scrollOffsets, markDirtyLayer: markLayerDirtyByKey })

    createScrollHandle("shift-a").scrollTo(-50)
    createScrollHandle("shift-b").scrollTo(-20)

    const rootOp: RenderGraphOp = {
      kind: "rectangle",
      renderObjectId: containerA.id,
      type: CMD.RECTANGLE,
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      color: 0,
      cornerRadius: 0,
      radius: 0,
      extra1: 0,
      extra2: 0,
      nodeId: containerA.id,
      image: null,
      canvas: null,
      effect: null,
      clipBounds: null,
    }
    const containerBOp: RenderGraphOp = {
      kind: "rectangle",
      renderObjectId: containerB.id,
      type: CMD.RECTANGLE,
      x: 10,
      y: 20,
      width: 180,
      height: 80,
      color: 0,
      cornerRadius: 0,
      radius: 0,
      extra1: 0,
      extra2: 0,
      nodeId: containerB.id,
      image: null,
      canvas: null,
      effect: null,
      clipBounds: null,
    }
    const childCOp: RenderGraphOp = {
      kind: "text",
      renderObjectId: null,
      type: CMD.TEXT,
      x: 15,
      y: 25,
      width: 100,
      height: 20,
      color: 0,
      cornerRadius: 0,
      extra1: 0,
      extra2: 0,
      nodeId: childC.id,
      text: "hello",
      fontId: 0,
      fontSize: 14,
      lineHeight: 16,
      maxWidth: 100,
      textHeight: 20,
      fontFamily: undefined,
      fontWeight: undefined,
      fontStyle: undefined,
      clipBounds: null,
    }

    const buckets: LayerOpBucket[] = [
      { key: "root", ops: [rootOp, containerBOp, childCOp], nodeId: 0 },
    ]

    applyScrollOffsetsToOps(buckets, s.scrollContainers, s.nodeRefById, { scrollOffsets: s.scrollOffsets, markDirtyLayer: markLayerDirtyByKey })

    // Root container A op: unshifted (containerA has no scroll parent)
    expect(rootOp.x).toBe(0)
    expect(rootOp.y).toBe(0)

    // Container B op: shifted by parent A offset (-50)
    expect(containerBOp.x).toBe(10)
    expect(containerBOp.y).toBe(20 - 50) // -30

    // Child C op: shifted by compounded offset (-70)
    expect(childCOp.x).toBe(15)
    expect(childCOp.y).toBe(25 - 70) // -45
  })

  test("getEffectivePosition integrates with compounded scroll offsets and routes scroll deltas", () => {
    const containerA = rect(createNode("box"), 0, 0, 200, 100)
    containerA.props.scrollY = true
    containerA.props.scrollId = "eff-a"
    containerA._scrollContainerId = 0

    const containerB = rect(createNode("box"), 10, 20, 180, 80)
    containerB.props.scrollY = true
    containerB.props.scrollId = "eff-b"
    containerB._scrollContainerId = containerA.id
    child(containerA, containerB)

    const childC = rect(createNode("text"), 15, 25, 100, 200)
    childC._scrollContainerId = containerB.id
    child(containerB, childC)

    child(containerA, rect(createNode("text"), 0, 150, 100, 50))

    const s = state([containerA, containerB])
    s.boxNodes = [containerA, containerB]
    s.nodeRefById.set(containerA.id, containerA)
    s.nodeRefById.set(containerB.id, containerB)
    s.nodeRefById.set(childC.id, childC)

    applyScrollOffsetsToOps([], s.scrollContainers, s.nodeRefById, { scrollOffsets: s.scrollOffsets, markDirtyLayer: markLayerDirtyByKey })

    createScrollHandle("eff-a").scrollTo(-50)
    createScrollHandle("eff-b").scrollTo(-20)

    applyScrollOffsetsToOps([], s.scrollContainers, s.nodeRefById, { scrollOffsets: s.scrollOffsets, markDirtyLayer: markLayerDirtyByKey })

    // getEffectivePosition checks:
    // Root container has no scroll container -> layout position
    const posA = getEffectivePosition(containerA, s.scrollOffsets)
    expect(posA).toEqual({ x: 0, y: 0 })

    // Nested container B has containerA as scroll container -> shifted by A's offset (-50)
    const posB = getEffectivePosition(containerB, s.scrollOffsets)
    expect(posB).toEqual({ x: 10, y: 20 - 50 }) // { x: 10, y: -30 }

    // Child C has containerB as scroll container -> shifted by B's compounded offset (-70)
    const posC = getEffectivePosition(childC, s.scrollOffsets)
    expect(posC).toEqual({ x: 15, y: 25 - 70 }) // { x: 15, y: -45 }

    // routeScrollDeltas integration:
    // Pointer is at (20, -10).
    // containerB's effective bounds are: x: 10..190, y: -30..50.
    // Pointer (20, -10) is inside containerB's effective bounds!
    // Without getEffectivePosition (using layout bounds y: 20..100), (20, -10) would miss containerB.
    s.pointer = { x: 20, y: -10 }
    routeScrollDeltas(s, 0, -5)
    expect(createScrollHandle("eff-b").scrollY).toBe(-25)
  })

  test("getParentScrollContainer falls back to tree climbing when _scrollContainerId is 0", () => {
    const parent = rect(createNode("box"), 0, 0, 200, 100)
    parent.props.scrollY = true
    parent._scrollContainerId = 0

    const intermediate = rect(createNode("box"), 0, 0, 100, 50)
    intermediate._scrollContainerId = 0
    child(parent, intermediate)

    const childNode = rect(createNode("box"), 10, 10, 50, 20)
    childNode._scrollContainerId = 0
    child(intermediate, childNode)

    const map = new Map<number, TGENode>()
    // Neither intermediate nor childNode have _scrollContainerId set.
    // getParentScrollContainer should climb ancestors to find parent
    const result = getParentScrollContainer(childNode, map)
    expect(result).toBe(parent)

    // And parent itself has no scroll parent -> returns null
    expect(getParentScrollContainer(parent, map)).toBeNull()
  })
})
