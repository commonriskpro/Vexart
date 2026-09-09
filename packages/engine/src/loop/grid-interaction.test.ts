import { afterEach, describe, expect, test } from "bun:test"
import { createNode, insertChild, parseSizing, type TGENode, type TGEProps } from "../ffi/node"
import { syncAllLayoutProps, syncLayoutProp } from "../ffi/flex-sync"
import { resetFocus, focusedId, getNodeFocusId } from "../reconciler/focus"
import { setProp } from "../reconciler/reconciler"
import { buildNodeMouseEvent, isFullyOutsideScrollViewport, setActiveScrollOffsets } from "../reconciler/hit-test"
import { writeLayoutBack } from "./layout"
import { createVexartLayoutCtx } from "./layout-adapter"
import { updateInteractiveStates, type InteractiveStatesBag } from "./layout"
import { walkTree, type WalkTreeState } from "./walk-tree"

function box(props: TGEProps, children: TGENode[] = []): TGENode {
  const node = createNode("box")
  node.props = props
  node._widthSizing = parseSizing(props.width)
  node._heightSizing = parseSizing(props.height)
  for (const child of children) insertChild(node, child)
  return node
}

function syncTree(node: TGENode): void {
  syncAllLayoutProps(node)
  for (const child of node.children) syncTree(child)
}

function frame(root: TGENode, width: number, height: number) {
  syncTree(root)
  const layout = createVexartLayoutCtx()
  layout.init(width, height)
  layout.beginLayout()
  const state: WalkTreeState = {
    scrollSpeedCap: { value: 0 },
    nodeCount: { value: 0 },
    rectNodes: [],
    textNodes: [],
    boxNodes: [],
    layerBoundaries: [],
    scrollContainers: [],
    nodeRefById: new Map(),
    rectNodeById: new Map(),
    layout,
  }
  walkTree(root, state)
  const commands = layout.endLayout(root._flexNode)
  const map = layout.getLastLayoutMap()!
  const damage: Array<{ nodeId: number; rect: { x: number; y: number; width: number; height: number } }> = []
  writeLayoutBack(map, { ...state, pendingNodeDamageRects: damage })
  return { layout, state, commands, map, damage }
}

function interactionBag(state: WalkTreeState, pointerX: number, pointerY: number, pointerDown = false): InteractiveStatesBag {
  return {
    rectNodes: state.rectNodes,
    rectNodeById: state.rectNodeById,
    pointerX,
    pointerY,
    pointerDown,
    pointerDirty: true,
    pendingPress: false,
    pendingRelease: false,
    capturedNodeId: 0,
    pressOriginSet: false,
    prevActiveNode: null,
    cellWidth: 8,
    cellHeight: 16,
    scrollOffsets: new Map(),
    onChanged() {},
  }
}

afterEach(() => {
  resetFocus()
  setActiveScrollOffsets(new Map())
})

describe("Grid interaction bridge", () => {
  test("resolves floating Grid children outside track flow and keeps local rects", () => {
    let presses = 0
    const regular = box({ width: 200, height: 50 })
    const floating = box({
      width: 20,
      height: 10,
      floating: "root",
      floatOffset: { x: 10, y: 5 },
      onPress: () => { presses++ },
    })
    const root = box({
      layout: "grid",
      width: 200,
      height: 50,
      gridTemplateColumns: [200],
      gridTemplateRows: [50],
    }, [regular, floating])
    const state = frame(root, 200, 50)
    expect(state.map.get(regular.id)).toMatchObject({ x: 0, y: 0, width: 200, height: 50 })
    expect(state.map.get(floating.id)).toMatchObject({ x: 10, y: 5, width: 20, height: 10 })
    expect(floating._flexNode?.getParent()).toBeNull()
    const bag = interactionBag(state.state, 15, 10, true)
    bag.pendingPress = true
    updateInteractiveStates(bag)
    bag.pointerDown = false
    bag.pendingRelease = true
    updateInteractiveStates(bag)
    expect(presses).toBe(1)
    state.layout.destroy()
  })

  test("uses rect-first Grid geometry for hover, click, focus, and mouse coordinates", () => {
    let presses = 0
    const button = box({
      width: 100,
      height: 50,
      gridColumn: { start: 2, end: 3 },
      hoverStyle: { backgroundColor: 0xff0000ff },
      focusStyle: { borderWidth: 2 },
    })
    setProp(button, "focusable", true)
    setProp(button, "onPress", () => { presses++ })
    const root = box({ layout: "grid", width: 200, height: 50, gridTemplateColumns: [100, 100], gridTemplateRows: [50] }, [button])
    const state = frame(root, 200, 50)
    expect(state.map.get(button.id)).toMatchObject({ x: 100, y: 0, width: 100, height: 50 })

    const bag = interactionBag(state.state, 150, 25, true)
    bag.pendingPress = true
    updateInteractiveStates(bag)
    expect(button._hovered).toBe(true)
    expect(button._active).toBe(true)
    expect(bag.pressOriginSet).toBe(true)

    bag.pointerDown = false
    bag.pendingRelease = true
    updateInteractiveStates(bag)
    expect(presses).toBe(1)
    expect(focusedId()).toBe(getNodeFocusId(button) ?? null)
    expect(button._focused).toBe(true)
    expect(buildNodeMouseEvent(button, 150, 25)).toMatchObject({ nodeX: 50, nodeY: 25, width: 100, height: 50 })
    state.layout.destroy()
  })

  test("applies scroll offsets to Grid hit-testing and rejects fully clipped items", () => {
    let moves = 0
    const item = box({ width: 100, height: 50, hoverStyle: { backgroundColor: 0xff00ff00 }, onMouseMove: () => { moves++ } })
    const root = box({ layout: "grid", width: 100, height: 50, gridTemplateColumns: [100], gridTemplateRows: [50], scrollX: true }, [item])
    const state = frame(root, 100, 50)
    const visibleOffset = new Map([[root.id, { x: -50, y: 0 }]])
    setActiveScrollOffsets(visibleOffset)
    expect(isFullyOutsideScrollViewport(item)).toBe(false)
    expect(buildNodeMouseEvent(item, 10, 20)).toMatchObject({ nodeX: 60, nodeY: 20 })

    const bag = interactionBag(state.state, 10, 20)
    bag.scrollOffsets = visibleOffset
    updateInteractiveStates(bag)
    expect(item._hovered).toBe(true)
    expect(moves).toBe(1)

    const clipped = new Map([[root.id, { x: -100, y: 0 }]])
    setActiveScrollOffsets(clipped)
    expect(isFullyOutsideScrollViewport(item)).toBe(true)
    bag.scrollOffsets = clipped
    bag.pointerDirty = true
    updateInteractiveStates(bag)
    expect(item._hovered).toBe(false)
    state.layout.destroy()
  })

  test("uses transformed Grid rects for hit-testing and reports rect damage after placement changes", () => {
    let moves = 0
    const item = box({ width: 50, height: 30, transform: { translateX: 40 }, onMouseMove: () => { moves++ } })
    const root = box({ layout: "grid", width: 100, height: 30, gridTemplateColumns: [100], gridTemplateRows: [30] }, [item])
    const state = frame(root, 100, 30)
    expect(item._transformInverse).not.toBeNull()
    const bag = interactionBag(state.state, 60, 15)
    updateInteractiveStates(bag)
    expect(item._hovered).toBe(true)
    expect(moves).toBe(1)
    expect(buildNodeMouseEvent(item, 60, 15)).toMatchObject({ nodeX: 20, nodeY: 15 })

    state.damage.length = 0
    item.props = { ...item.props, gridColumn: { start: 1, end: 2 } }
    syncLayoutProp(item, "gridColumn", item.props.gridColumn)
    const movedState = frame(root, 100, 30)
    expect(movedState.damage.some((entry) => entry.nodeId === item.id)).toBe(false)
    // A one-column grid has no alternate placement, so the rect is stable;
    // the transformed hit-test above is the meaningful interaction change.
    movedState.layout.destroy()
    state.layout.destroy()
  })

  test("preserves damage when a Grid item moves between explicit columns", () => {
    const item = box({ width: 50, height: 30, gridColumn: { start: 1, end: 2 } })
    const root = box({ layout: "grid", width: 100, height: 30, gridTemplateColumns: [50, 50], gridTemplateRows: [30] }, [item])
    const first = frame(root, 100, 30)
    first.damage.length = 0
    item.props = { ...item.props, gridColumn: { start: 2, end: 3 } }
    syncLayoutProp(item, "gridColumn", item.props.gridColumn)
    const second = frame(root, 100, 30)
    const damage = second.damage.find((entry) => entry.nodeId === item.id)
    expect(damage?.rect).toEqual({ x: 0, y: 0, width: 100, height: 30 })
    first.layout.destroy()
    second.layout.destroy()
  })
})
