import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  Node,
  EDGE_ALL,
  EDGE_LEFT,
  EDGE_TOP,
  FLEX_DIRECTION_COLUMN,
  FLEX_DIRECTION_ROW,
  ALIGN_CENTER,
  JUSTIFY_CENTER,
  UNIT_AUTO,
  UNIT_POINT,
  UNIT_UNDEFINED,
} from "flexily"
import {
  acquireFlexNode,
  clearFlexNodePool,
  getFlexNodePoolCapacity,
  getFlexNodePoolSize,
  releaseFlexNode,
  resetFlexNodePoolCapacity,
  setFlexNodePoolCapacity,
  DEFAULT_MAX_FLEX_NODE_POOL_SIZE,
} from "./flex-pool"
import {
  createNode,
  createTextNode,
  insertChild,
  removeChild,
} from "./node"
import { createTextFlexNode, syncAllLayoutProps } from "./flex-sync"

describe("flex-pool unit tests", () => {
  beforeEach(() => {
    clearFlexNodePool()
    resetFlexNodePoolCapacity()
  })

  afterEach(() => {
    clearFlexNodePool()
    resetFlexNodePoolCapacity()
  })

  test("initial pool is empty", () => {
    expect(getFlexNodePoolSize()).toBe(0)
    expect(getFlexNodePoolCapacity()).toBe(DEFAULT_MAX_FLEX_NODE_POOL_SIZE)
  })

  test("acquireFlexNode creates a fresh node when pool is empty", () => {
    const node = acquireFlexNode()
    expect(node).toBeInstanceOf(Node)
    expect(node.getParent()).toBeNull()
    expect(node.getChildCount()).toBe(0)
    expect(getFlexNodePoolSize()).toBe(0)
  })

  test("releaseFlexNode returns node to pool", () => {
    const node = acquireFlexNode()
    releaseFlexNode(node)
    expect(getFlexNodePoolSize()).toBe(1)

    const reused = acquireFlexNode()
    expect(reused).toBe(node)
    expect(getFlexNodePoolSize()).toBe(0)
  })

  test("releaseFlexNode safely handles null and undefined", () => {
    releaseFlexNode(null)
    releaseFlexNode(undefined)
    expect(getFlexNodePoolSize()).toBe(0)
  })

  test("releaseFlexNode does not pool duplicate references", () => {
    const node = acquireFlexNode()
    releaseFlexNode(node)
    releaseFlexNode(node)
    expect(getFlexNodePoolSize()).toBe(1)
  })

  test("pool capacity is bounded", () => {
    setFlexNodePoolCapacity(3)
    expect(getFlexNodePoolCapacity()).toBe(3)

    const nodes = [
      acquireFlexNode(),
      acquireFlexNode(),
      acquireFlexNode(),
      acquireFlexNode(),
      acquireFlexNode(),
    ]

    for (const n of nodes) {
      releaseFlexNode(n)
    }

    expect(getFlexNodePoolSize()).toBe(3)
  })

  test("clearFlexNodePool empties the pool", () => {
    const a = acquireFlexNode()
    const b = acquireFlexNode()
    releaseFlexNode(a)
    releaseFlexNode(b)
    expect(getFlexNodePoolSize()).toBe(2)

    clearFlexNodePool()
    expect(getFlexNodePoolSize()).toBe(0)
  })

  test("Node.reset() clears styles back to default", () => {
    const node = acquireFlexNode()
    node.setWidth(250)
    node.setHeight(150)
    node.setFlexDirection(FLEX_DIRECTION_COLUMN)
    node.setAlignItems(ALIGN_CENTER)
    node.setJustifyContent(JUSTIFY_CENTER)
    node.setPadding(EDGE_ALL, 16)
    node.setMargin(EDGE_LEFT, 8)
    node.setFlexGrow(2)
    node.setFlexShrink(3)

    expect(node.getWidth().unit).toBe(UNIT_POINT)
    expect(node.getWidth().value).toBe(250)
    expect(node.getFlexDirection()).toBe(FLEX_DIRECTION_COLUMN)

    releaseFlexNode(node)
    const reused = acquireFlexNode()
    expect(reused).toBe(node)

    // Default styles restored
    expect(reused.getWidth().unit).toBe(UNIT_AUTO)
    expect(reused.getHeight().unit).toBe(UNIT_AUTO)
    expect(reused.getFlexDirection()).toBe(FLEX_DIRECTION_ROW)
    expect(reused.getFlexGrow()).toBe(0)
    expect(reused.getFlexShrink()).toBe(0)
    expect(reused.getPadding(EDGE_TOP).unit).toBe(UNIT_UNDEFINED)
    expect(reused.getMargin(EDGE_LEFT).unit).toBe(UNIT_UNDEFINED)
  })

  test("Node.reset() clears measure and baseline functions to prevent closure leaks", () => {
    const node = acquireFlexNode()
    let closureRetained = false
    const measureCallback = () => {
      closureRetained = true
      return { width: 42, height: 24 }
    }
    node.setMeasureFunc(measureCallback)

    // Compute layout - measure func will be called
    node.calculateLayout(100, 100)
    expect(closureRetained).toBe(true)

    releaseFlexNode(node)
    const reused = acquireFlexNode()
    expect(reused).toBe(node)

    // Measure func is cleared; calculating layout won't call old callback
    closureRetained = false
    reused.calculateLayout(100, 100)
    expect(closureRetained).toBe(false)
  })

  test("Node.reset() clears Grid state", () => {
    const node = acquireFlexNode()
    node.setLayoutMode("grid")
    node.setGridStyle({
      columns: [100, 100],
      rows: [50],
      gap: 10,
      autoColumns: "auto",
      autoRows: "auto",
      autoFlow: "row",
      areas: [],
      justifyContent: "start",
      alignContent: "start",
      justifyItems: "start",
      alignItems: "start",
    })
    node.setGridItemStyle({ column: { start: 1, end: 2 } })

    expect(node.isGridMode()).toBe(true)
    expect(node.getLayoutMode()).toBe("grid")
    expect(node.getGridStyle()).not.toBeNull()
    expect(node.getGridItemStyle()).toEqual({ column: { start: 1, end: 2 } })

    releaseFlexNode(node)
    const reused = acquireFlexNode()
    expect(reused).toBe(node)

    expect(reused.isGridMode()).toBe(false)
    expect(reused.getLayoutMode()).toBe("flex")
    expect(reused.getGridStyle()).toBeNull()
    expect(reused.getGridItemStyle()).toEqual({})
  })

  test("Node.reset() disconnects parent and children references", () => {
    const parent = acquireFlexNode()
    const child1 = acquireFlexNode()
    const child2 = acquireFlexNode()

    parent.insertChild(child1, 0)
    parent.insertChild(child2, 1)
    expect(parent.getChildCount()).toBe(2)
    expect(child1.getParent()).toBe(parent)
    expect(child2.getParent()).toBe(parent)

    // Resetting parent detaches children and sets their parent to null
    releaseFlexNode(parent)

    expect(parent.getChildCount()).toBe(0)
    expect(parent.getParent()).toBeNull()
    expect(child1.getParent()).toBeNull()
    expect(child2.getParent()).toBeNull()
  })

  test("Node.reset() removes itself from parent if released while attached", () => {
    const parent = acquireFlexNode()
    const child = acquireFlexNode()

    parent.insertChild(child, 0)
    expect(parent.getChildCount()).toBe(1)
    expect(child.getParent()).toBe(parent)

    releaseFlexNode(child)

    expect(child.getParent()).toBeNull()
    expect(parent.getChildCount()).toBe(0)
  })
})

describe("TGENode lifecycle with flex-pool", () => {
  beforeEach(() => {
    clearFlexNodePool()
    resetFlexNodePoolCapacity()
  })

  afterEach(() => {
    clearFlexNodePool()
    resetFlexNodePoolCapacity()
  })

  test("createNode acquires a flex node from the pool when available", () => {
    const spare = acquireFlexNode()
    releaseFlexNode(spare)
    expect(getFlexNodePoolSize()).toBe(1)

    const tge = createNode("box")
    expect(tge._flexNode).toBe(spare)
    expect(getFlexNodePoolSize()).toBe(0)
  })

  test("removeChild releases flex node and insertChild reuses it", () => {
    const parent = createNode("box")
    const child = createNode("box")
    child.props = { width: 100, height: 50 }
    syncAllLayoutProps(child)
    insertChild(parent, child)

    const originalFlex = child._flexNode!
    expect(originalFlex).toBeDefined()
    expect(getFlexNodePoolSize()).toBe(0)

    // Remove child: should pool its flex node
    removeChild(parent, child)
    expect(child._flexNode).toBeNull()
    expect(child.destroyed).toBe(true)
    expect(getFlexNodePoolSize()).toBe(1)

    // Re-insert child: should re-acquire from the pool
    insertChild(parent, child)
    expect(child._flexNode).toBe(originalFlex)
    expect(child.destroyed).toBe(false)
    expect(getFlexNodePoolSize()).toBe(0)
    expect(child._flexNode?.getParent()).toBe(parent._flexNode)
  })

  test("nested subtree detach releases all nodes to pool and re-acquires on reattach", () => {
    const root = createNode("box")
    const container = createNode("box")
    const itemA = createNode("box")
    const itemB = createNode("box")

    insertChild(container, itemA)
    insertChild(container, itemB)
    insertChild(root, container)

    expect(getFlexNodePoolSize()).toBe(0)

    // Remove container: releases container, itemA, itemB (3 nodes)
    removeChild(root, container)
    expect(getFlexNodePoolSize()).toBe(3)
    expect(container._flexNode).toBeNull()
    expect(itemA._flexNode).toBeNull()
    expect(itemB._flexNode).toBeNull()

    // Re-insert container: re-acquires all 3 nodes from pool
    insertChild(root, container)
    expect(getFlexNodePoolSize()).toBe(0)
    expect(container._flexNode).not.toBeNull()
    expect(itemA._flexNode).not.toBeNull()
    expect(itemB._flexNode).not.toBeNull()

    // Verify tree linkage
    expect(container._flexNode?.getParent()).toBe(root._flexNode)
    expect(itemA._flexNode?.getParent()).toBe(container._flexNode)
    expect(itemB._flexNode?.getParent()).toBe(container._flexNode)
  })

  test("text node flex node is pooled on remove and re-acquired without stale measure closures", () => {
    const parent = createNode("box")
    const text = createTextNode("initial text")
    insertChild(parent, text)
    createTextFlexNode(text)

    const textFlex = text._flexNode!
    expect(textFlex).toBeDefined()
    expect(getFlexNodePoolSize()).toBe(0)

    // Calculate layout with text
    parent._flexNode?.calculateLayout(200, 100)
    const initialWidth = text._flexNode?.getComputedWidth()

    // Remove text node
    removeChild(parent, text)
    expect(text._flexNode).toBeNull()
    expect(getFlexNodePoolSize()).toBe(1)

    // Change text content while detached
    text.text = "updated much longer text content that should have a different size"

    // Re-insert text node
    insertChild(parent, text)
    expect(text._flexNode).toBe(textFlex)
    expect(getFlexNodePoolSize()).toBe(0)

    // Calculate layout again
    parent._flexNode?.calculateLayout(200, 100)
    const updatedWidth = text._flexNode?.getComputedWidth()
    expect(updatedWidth).not.toBe(initialWidth)
  })

  test("re-acquired nodes do not retain stale grid mode or styles", () => {
    const parent = createNode("box")
    const gridChild = createNode("box")
    gridChild.props = {
      layout: "grid",
      width: 300,
      height: 200,
      gridTemplateColumns: [100, 100],
      gridTemplateRows: [50, 50],
    }
    insertChild(parent, gridChild)
    syncAllLayoutProps(gridChild)

    const flex = gridChild._flexNode!
    expect(flex.isGridMode()).toBe(true)

    // Detach gridChild
    removeChild(parent, gridChild)
    expect(getFlexNodePoolSize()).toBe(1)

    // Create a plain flex box node - should reuse the pooled node
    const plainBox = createNode("box")
    expect(plainBox._flexNode).toBe(flex)
    expect(flex.isGridMode()).toBe(false)
    expect(flex.getLayoutMode()).toBe("flex")
    expect(flex.getGridStyle()).toBeNull()
  })
})
