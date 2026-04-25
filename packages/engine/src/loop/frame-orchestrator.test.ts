import { afterEach, describe, expect, test } from "bun:test"
import { deregisterAllDescriptors, allDescriptors, resetFrameTracking, unmarkLayerBacked } from "../animation/compositor-path"
import { createNode, insertChild } from "../ffi/node"
import { setNativeResourceBudget, getNativeResourceStats } from "../ffi/resource-stats"
import { getVexartFfiCallCount, resetVexartFfiCallCounts } from "../ffi/vexart-bridge"
import { createRenderLoop } from "./loop"
import { markDirty } from "../reconciler/dirty"

function createMockTerminal(width: number, height: number, transmissionMode: "direct" | "file" | "shm" = "direct") {
  const resizeHandlers: Array<(size: any) => void> = []
  const cellWidth = 8
  const cellHeight = 16
  const size = {
    cols: Math.ceil(width / cellWidth),
    rows: Math.ceil(height / cellHeight),
    pixelWidth: width,
    pixelHeight: height,
    cellWidth,
    cellHeight,
  }
  return {
    term: {
      kind: "kitty" as const,
      caps: {
        kind: "kitty" as const,
        kittyGraphics: true,
        kittyPlaceholder: false,
        kittyKeyboard: false,
        sixel: false,
        truecolor: true,
        mouse: false,
        focus: false,
        bracketedPaste: false,
        syncOutput: false,
        tmux: false,
        parentKind: null,
        transmissionMode,
      },
      size,
      write() {},
      rawWrite() {},
      writeBytes() {},
      beginSync() {},
      endSync() {},
      onResize(cb: (size: any) => void) { resizeHandlers.push(cb); return () => {} },
      onData() { return () => {} },
      bgColor: null,
      fgColor: null,
      isDark: true,
      setTitle() {},
      writeClipboard() {},
      suspend() {},
      resume() {},
      destroy() {},
    },
    emitResize(nextWidth: number, nextHeight: number) {
      const nextSize = {
        cols: Math.ceil(nextWidth / cellWidth),
        rows: Math.ceil(nextHeight / cellHeight),
        pixelWidth: nextWidth,
        pixelHeight: nextHeight,
        cellWidth,
        cellHeight,
      }
      for (const handler of resizeHandlers) handler(nextSize)
    },
  }
}

function clearCompositorState() {
  resetFrameTracking()
  for (const descriptor of allDescriptors()) {
    deregisterAllDescriptors(descriptor.nodeId)
    unmarkLayerBacked(descriptor.nodeId)
  }
}

afterEach(() => {
  clearCompositorState()
  setNativeResourceBudget(128)
})

describe("Phase 3e frame orchestrator", () => {
  test("dirty frame uses at most six FFI calls", () => {
    const { term } = createMockTerminal(200, 120)
    const loop = createRenderLoop(term, { experimental: { forceLayerRepaint: true } })
    const box = createNode("box")
    box.props.width = 100
    box.props.height = 40
    box.props.backgroundColor = 0xff00ffff
    insertChild(loop.root, box)
    markDirty()
    loop.frame()
    loop.frame()

    resetVexartFfiCallCounts()
    box.props.backgroundColor = 0x00ff00ff
    markDirty()
    loop.frame()

    expect(getVexartFfiCallCount()).toBeLessThanOrEqual(8)
    loop.destroy()
  })

  test("resize invalidation recomputes layout and updates root dimensions", () => {
    const mock = createMockTerminal(200, 120)
    const loop = createRenderLoop(mock.term, { experimental: { forceLayerRepaint: true } })
    const box = createNode("box")
    box.props.width = 100
    box.props.height = 40
    box.props.backgroundColor = 0xff00ffff
    insertChild(loop.root, box)
    markDirty()
    loop.start()

    mock.emitResize(320, 180)

    expect(loop.root.props.width).toBe(320)
    expect(loop.root.props.height).toBe(180)
    loop.stop()
    loop.destroy()
  })

  test("survives low native resource budget under layer pressure", () => {
    setNativeResourceBudget(32)
    const { term } = createMockTerminal(800, 600)
    const loop = createRenderLoop(term, { experimental: { forceLayerRepaint: true } })
    for (let i = 0; i < 20; i++) {
      const box = createNode("box")
      box.props.layer = true
      box.props.width = 800
      box.props.height = 600
      box.props.backgroundColor = (0x101010ff + i) >>> 0
      insertChild(loop.root, box)
    }

    expect(() => {
      markDirty()
      loop.frame()
    }).not.toThrow()
    expect(getNativeResourceStats()).not.toBeNull()
    loop.destroy()
  })
})
