import { afterEach, describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import {
  bindLoop,
  createComponent,
  createElement,
  createScrollHandle,
  onGlobalDirty,
  unbindLoop,
  updateScrollContainerGeometry,
  type RenderLoop,
  type TGENode,
} from "@vexart/engine"
import { VirtualList } from "./virtual-list"

describe("VirtualList windowing", () => {
  test("startIndex and endIndex calculate correct window", () => {
    const itemHeight = 20
    const height = 100
    const overscan = 2
    const totalItems = 1000
    const viewportItems = Math.ceil(height / itemHeight)

    const scrollPos = 0
    const startIndex = Math.max(0, Math.floor(scrollPos / itemHeight) - overscan)
    const endIndex = Math.min(totalItems, Math.floor(scrollPos / itemHeight) + viewportItems + overscan)

    expect(startIndex).toBe(0)
    expect(endIndex).toBe(7)

    const scrollPos2 = 500
    const startIndex2 = Math.max(0, Math.floor(scrollPos2 / itemHeight) - overscan)
    const endIndex2 = Math.min(totalItems, Math.floor(scrollPos2 / itemHeight) + viewportItems + overscan)

    expect(startIndex2).toBe(23)
    expect(endIndex2).toBe(32)
  })
})

describe("VirtualList onPostScroll governance", () => {
  afterEach(() => {
    unbindLoop()
  })

  test("onPostScroll does not invoke markDirty and only triggers reactive updates when scroll position changes", () => {
    let postScrollCb: (() => void) | null = null
    const loop = {
      onPostScroll(cb: () => void) {
        postScrollCb = cb
        return () => {
          postScrollCb = null
        }
      },
      markNodeLayerDamaged() {},
    } as unknown as RenderLoop
    bindLoop(loop)

    let dirtyCalls = 0
    let directOnPostScrollDirty = 0
    const unsubDirty = onGlobalDirty(() => {
      dirtyCalls++
      const stack = new Error().stack || ""
      // Detect any direct calls to markDirty originating from onPostScroll callback
      if (stack.includes("unsubPostScroll") || stack.includes("onPostScroll")) {
        directOnPostScrollDirty++
      }
    })

    let dispose: () => void = () => {}
    let listNode: TGENode | null = null
    let renderCalls = 0

    createRoot((d) => {
      dispose = d
      listNode = createComponent(VirtualList as any, {
        items: Array.from({ length: 50 }, (_, i) => `item-${i}`),
        itemHeight: 20,
        height: 100,
        overscan: 0,
        renderItem: () => {
          renderCalls++
          return createElement("box")
        },
      }) as TGENode
    })

    try {
      expect(postScrollCb).toBeFunction()
      // Initial mount rendered the first visible window (items 0..4)
      expect(renderCalls).toBe(5)

      // First tick syncs lastTop / lastVh with initial scroll state (0, 0)
      postScrollCb!()

      // 1. Subsequent onPostScroll calls without scroll change must NOT invoke markDirty()
      // and must NOT trigger reactive updates (change guard prevents setScrollTick)
      dirtyCalls = 0
      const rendersBefore = renderCalls
      postScrollCb!()
      postScrollCb!()
      postScrollCb!()

      expect(dirtyCalls).toBe(0)
      expect(directOnPostScrollDirty).toBe(0)
      expect(renderCalls).toBe(rendersBefore)

      // 2. Scroll to new position (item 3 at top -> 60px down)
      const scrollId = (listNode!.props as Record<string, unknown>).scrollId as string
      updateScrollContainerGeometry(scrollId, 100, 100, 100, 1000)
      const handle = createScrollHandle(scrollId)
      handle.scrollTo(-60)

      // Invoking onPostScroll with changed scroll position triggers reactive update:
      // new items (5..7) enter visible window, but onPostScroll itself must NOT call markDirty()
      postScrollCb!()

      expect(directOnPostScrollDirty).toBe(0)
      expect(renderCalls).toBeGreaterThan(rendersBefore)

      // 3. Subsequent onPostScroll calls with identical scroll position (60px)
      // must be no-ops: zero dirty calls and zero reactive re-renders
      dirtyCalls = 0
      const rendersAfterScroll = renderCalls
      postScrollCb!()
      postScrollCb!()

      expect(dirtyCalls).toBe(0)
      expect(directOnPostScrollDirty).toBe(0)
      expect(renderCalls).toBe(rendersAfterScroll)
    } finally {
      unsubDirty()
      dispose()
    }
  })

  test("change guard triggers callback only when scroll position or viewport dimensions actually change", () => {
    let tickCount = 0
    let lastTop = -1
    let lastVh = -1

    const onScrollChange = (top: number, vh: number) => {
      if (top !== lastTop || vh !== lastVh) {
        lastTop = top
        lastVh = vh
        tickCount++
      }
    }

    // Initial tick with (0, 0)
    onScrollChange(0, 0)
    expect(tickCount).toBe(1)

    // Repeated ticks with identical values must be no-ops
    onScrollChange(0, 0)
    onScrollChange(0, 0)
    expect(tickCount).toBe(1)

    // Viewport height changes
    onScrollChange(0, 200)
    expect(tickCount).toBe(2)

    // Unchanged
    onScrollChange(0, 200)
    expect(tickCount).toBe(2)

    // Scroll top changes
    onScrollChange(50, 200)
    expect(tickCount).toBe(3)

    // Unchanged
    onScrollChange(50, 200)
    expect(tickCount).toBe(3)
  })
})
