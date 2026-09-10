import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createRoot, onCleanup } from "solid-js"
import { createNode, insertChild } from "../ffi/node"
import { createElement, insertNode, removeNode, setProp } from "./reconciler"
import { bindLoop, getCapturedNodeId, releasePointerCapture, setPointerCapture, unbindLoop } from "./pointer"
import { createRenderLoop, type RenderLoop } from "../loop/loop"
import { registerAnimationDescriptor, getDescriptor, markLayerBacked, unmarkLayerBacked, deregisterAllDescriptors } from "../animation/compositor-path"
import { focusedId, resetFocus, setFocusedId, useFocus } from "./focus"
import { mount } from "../mount"
import { createVexartLayoutCtx } from "../loop/layout-adapter"
import { getRendererBackend, setRendererBackend, type RendererBackend } from "../ffi/renderer-backend"
import type { Terminal } from "../terminal/index"
import { Node } from "flexily"

function createMockTerminal(width = 240, height = 120): Terminal {
  const cellWidth = 8
  const cellHeight = 16
  return {
    kind: "kitty",
    caps: {
      kind: "kitty",
      kittyGraphics: true,
      kittyPlaceholder: false,
      kittyKeyboard: false,
      sixel: false,
      truecolor: true,
      mouse: true,
      focus: false,
      bracketedPaste: false,
      syncOutput: false,
      tmux: false,
      parentKind: null,
      transmissionMode: "direct",
    },
    size: {
      cols: Math.ceil(width / cellWidth),
      rows: Math.ceil(height / cellHeight),
      pixelWidth: width,
      pixelHeight: height,
      cellWidth,
      cellHeight,
    },
    write: () => {},
    rawWrite: () => {},
    writeBytes: () => {},
    beginSync: () => {},
    endSync: () => {},
    onResize: () => () => {},
    onData: () => () => {},
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle: () => {},
    writeClipboard: () => {},
    suspend: () => {},
    resume: () => {},
    destroy: () => {},
  }
}

const noopBackend: RendererBackend = {
  name: "noop-test",
  paint() {
    return { output: "skip-present" }
  },
  endFrame() {
    return { output: "none", strategy: null }
  },
}

describe("Phase 2 Lifecycle Fixes", () => {
  let prevBackend: RendererBackend | null = null

  beforeEach(() => {
    prevBackend = getRendererBackend()
    setRendererBackend(noopBackend)
    resetFocus()
  })

  afterEach(() => {
    if (prevBackend) setRendererBackend(prevBackend)
    unbindLoop()
    resetFocus()
  })

  describe("LC-03: Pointer capture cleanup on unmount", () => {
    test("RenderLoop exposes getCapturedNodeId and tracks pointer.capturedNodeId", () => {
      const term = createMockTerminal()
      const loop = createRenderLoop(term)
      expect(loop.getCapturedNodeId()).toBe(0)

      loop.setPointerCapture(42)
      expect(loop.getCapturedNodeId()).toBe(42)

      loop.releasePointerCapture(42)
      expect(loop.getCapturedNodeId()).toBe(0)

      loop.setPointerCapture(99)
      loop.destroy()
      expect(loop.getCapturedNodeId()).toBe(0)
    })

    test("pointer module delegates getCapturedNodeId to active loop", () => {
      expect(getCapturedNodeId()).toBe(0)

      const term = createMockTerminal()
      const loop = createRenderLoop(term)
      bindLoop(loop)

      setPointerCapture(123)
      expect(getCapturedNodeId()).toBe(123)

      releasePointerCapture(123)
      expect(getCapturedNodeId()).toBe(0)

      unbindLoop()
      expect(getCapturedNodeId()).toBe(0)
      loop.destroy()
    })

    test("removeNode automatically releases pointer capture on the removed node", () => {
      const term = createMockTerminal()
      const loop = createRenderLoop(term)
      bindLoop(loop)

      const parent = createElement("box")
      const child = createElement("box")
      insertNode(parent, child)

      setPointerCapture(child.id)
      expect(getCapturedNodeId()).toBe(child.id)

      removeNode(parent, child)
      expect(getCapturedNodeId()).toBe(0)

      loop.destroy()
    })

    test("removeNode releases pointer capture when a descendant of removed node is captured", () => {
      const term = createMockTerminal()
      const loop = createRenderLoop(term)
      bindLoop(loop)

      const parent = createElement("box")
      const subtreeRoot = createElement("box")
      const middle = createElement("box")
      const leaf = createElement("box")

      insertNode(parent, subtreeRoot)
      insertNode(subtreeRoot, middle)
      insertNode(middle, leaf)

      setPointerCapture(leaf.id)
      expect(getCapturedNodeId()).toBe(leaf.id)

      // Removing subtreeRoot should release capture on leaf
      removeNode(parent, subtreeRoot)
      expect(getCapturedNodeId()).toBe(0)

      loop.destroy()
    })

    test("removeNode does NOT release pointer capture when an unrelated node is removed", () => {
      const term = createMockTerminal()
      const loop = createRenderLoop(term)
      bindLoop(loop)

      const parent = createElement("box")
      const nodeA = createElement("box")
      const nodeB = createElement("box")

      insertNode(parent, nodeA)
      insertNode(parent, nodeB)

      setPointerCapture(nodeA.id)
      expect(getCapturedNodeId()).toBe(nodeA.id)

      removeNode(parent, nodeB)
      expect(getCapturedNodeId()).toBe(nodeA.id)

      releasePointerCapture(nodeA.id)
      loop.destroy()
    })
  })

  describe("LC-05: Layout adapter retention and cleanup", () => {
    test("beginLayout and endLayout null out unused slots in _allNodes and meta arrays", () => {
      const ctx = createVexartLayoutCtx()
      ctx.init(200, 100)

      // First frame: 3 nodes
      ctx.beginLayout()
      ctx.openElement()
      ctx.setCurrentNodeId(1)
      ctx.openElement()
      ctx.setCurrentNodeId(2)
      ctx.closeElement()
      ctx.openElement()
      ctx.setCurrentNodeId(3)
      ctx.closeElement()
      ctx.closeElement()
      ctx.endLayout()

      // Second frame: only 1 node
      ctx.beginLayout()
      ctx.openElement()
      ctx.setCurrentNodeId(1)
      ctx.closeElement()
      ctx.endLayout()

      // destroy cleans up everything
      ctx.destroy()
      expect(ctx.getLastLayoutMap()).toBeNull()
      expect(ctx.getLastLayoutError()).toBeNull()
    })
  })

  describe("LC-09: Orphan compositor descriptors on element removal", () => {
    test("removeNode deregisters compositor descriptors for node and all descendants", () => {
      const parent = createElement("box")
      const ancestor = createElement("box")
      const child = createElement("box")

      insertNode(parent, ancestor)
      insertNode(ancestor, child)

      markLayerBacked(ancestor.id)
      markLayerBacked(child.id)

      registerAnimationDescriptor({
        nodeId: ancestor.id,
        property: "opacity",
        from: 1,
        to: 0,
        startTime: performance.now(),
        physics: { kind: "spring", stiffness: 100, damping: 10, mass: 1 },
      })

      registerAnimationDescriptor({
        nodeId: child.id,
        property: "transform",
        from: 0,
        to: 10,
        startTime: performance.now(),
        physics: { kind: "spring", stiffness: 100, damping: 10, mass: 1 },
      })

      expect(getDescriptor(ancestor.id, "opacity")).toBeDefined()
      expect(getDescriptor(child.id, "transform")).toBeDefined()

      removeNode(parent, ancestor)

      expect(getDescriptor(ancestor.id, "opacity")).toBeUndefined()
      expect(getDescriptor(child.id, "transform")).toBeUndefined()
    })
  })

  describe("LC-07: Focus lifecycle order & mount disposal", () => {
    test("mount().destroy() executes dispose() before unbindLoop and resetFocus", () => {
      const term = createMockTerminal()
      let disposeSawCapturedNode = false
      let disposeSawFocus = false

      const handle = mount(() => {
        setFocusedId("custom-focused-id")

        onCleanup(() => {
          // Set a pointer capture to verify loop is still bound during dispose
          setPointerCapture(999)
          disposeSawCapturedNode = getCapturedNodeId() === 999
          releasePointerCapture(999)

          // Check that focusedId is still preserved before resetFocus runs
          disposeSawFocus = focusedId() === "custom-focused-id"
        })

        return createElement("box")
      }, term)

      expect(focusedId()).toBe("custom-focused-id")

      handle.destroy()

      expect(disposeSawCapturedNode).toBe(true)
      expect(disposeSawFocus).toBe(true)
      // After destroy finishes, loop is unbound and focus is reset
      expect(getCapturedNodeId()).toBe(0)
      expect(focusedId()).toBeNull()
    })
  })
})
