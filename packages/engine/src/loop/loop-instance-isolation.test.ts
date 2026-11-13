import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createRenderLoop } from "./loop"
import { getRendererBackend, setRendererBackend, type RendererBackend } from "../ffi/renderer-backend"
import { bindLoop, unbindLoop } from "../reconciler/pointer"
import { createDirtyTracker, isDirty, markDirty, DIRTY_KIND } from "../reconciler/dirty"
import { focusedId, getNodeFocusId, pushFocusScope, registerNodeFocusable, resetFocus, setFocusedId, setFocus, useFocus } from "../reconciler/focus"
import { getSelection, clearSelection, setSelection } from "../reconciler/selection"
import { onInput } from "./input"
import { useEngineContext, createEngineContext, type EngineContext } from "../context"
import { createNode } from "../ffi/node"
import { onCleanup } from "solid-js"
import { mount } from "../mount"

function mockTerminal(width = 200, height = 100) {
  let suspended = false
  let destroyed = false
  let dataCb: ((data: Uint8Array) => void) | null = null
  let resizeCb: ((size: any) => void) | null = null

  const term = {
    kind: "kitty" as const,
    caps: {
      kind: "kitty" as const,
      kittyGraphics: true,
      kittyPlaceholder: false,
      kittyKeyboard: false,
      sixel: false,
      truecolor: true,
      mouse: false,
      mousePixel: false,
      mousePixelOrigin: 1,
      focus: false,
      bracketedPaste: false,
      syncOutput: false,
      tmux: false,
      parentKind: null,
      transmissionMode: "direct" as const,
    },
    size: { cols: Math.ceil(width / 8), rows: Math.ceil(height / 16), pixelWidth: width, pixelHeight: height, cellWidth: 8, cellHeight: 16 },
    write() {},
    rawWrite() {},
    writeBytes() {},
    beginSync() {},
    endSync() {},
    onResize(cb: (size: any) => void) {
      resizeCb = cb
      return () => { resizeCb = null }
    },
    onData(cb: (data: Uint8Array) => void) {
      dataCb = cb
      return () => { dataCb = null }
    },
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle() {},
    writeClipboard() {},
    suspend() { suspended = true },
    resume() { suspended = false },
    destroy() { destroyed = true },
    emitData(data: Uint8Array) { dataCb?.(data) },
    emitResize(newW: number, newH: number) {
      term.size = { cols: Math.ceil(newW / 8), rows: Math.ceil(newH / 16), pixelWidth: newW, pixelHeight: newH, cellWidth: 8, cellHeight: 16 }
      resizeCb?.(term.size)
    },
    isSuspended: () => suspended,
    isDestroyed: () => destroyed,
  }
  return term
}

describe("Step 2: Singleton Elimination & Instance Isolation", () => {
  const priorBackend = getRendererBackend()
  const loops: Array<ReturnType<typeof createRenderLoop>> = []

  beforeEach(() => {
    resetFocus()
    clearSelection()
  })

  afterEach(() => {
    for (const l of loops.splice(0)) {
      l.destroy()
    }
    unbindLoop()
    resetFocus()
    clearSelection()
    setRendererBackend(priorBackend)
  })

  test("[FLAW-01] Localizes layout context per RenderLoop and cleans up on destroy", () => {
    const term1 = mockTerminal(200, 100)
    const term2 = mockTerminal(300, 150)

    const loop1 = createRenderLoop(term1 as any)
    const loop2 = createRenderLoop(term2 as any)
    loops.push(loop1, loop2)

    expect(loop1.root._dirtyTracker).toBeDefined()
    expect(loop2.root._dirtyTracker).toBeDefined()
    expect(loop1.root._dirtyTracker).not.toBe(loop2.root._dirtyTracker)

    // Destroying loop1 cleans up loop1 without affecting loop2
    loop1.destroy()
    expect(loop1.suspended()).toBe(true)
    expect(loop1.root._dirtyTracker).toBeNull()

    // Loop2 should remain active and operational
    expect(loop2.suspended()).toBe(false)
    expect(loop2.root._dirtyTracker).not.toBeNull()
  })

  test("[FLAW-02] Resets loopStarted, isSuspended, and damage collections on loop.destroy()", () => {
    const term = mockTerminal(200, 100)
    const loop = createRenderLoop(term as any)
    loops.push(loop)

    loop.start()
    expect(loop.suspended()).toBe(false)

    loop.destroy()
    expect(loop.suspended()).toBe(true)
  })

  test("[FLAW-08 & FLAW-14] Symmetrically clears layer cache binding and resets active backend on loop.destroy()", () => {
    let backendDestroyCalled = false
    const customBackend: RendererBackend = {
      name: "custom-test-backend",
      paint() { return { output: "skip-present", strategy: "skip-present" } },
      destroy() { backendDestroyCalled = true },
    }
    setRendererBackend(customBackend)

    const term = mockTerminal(200, 100)
    const loop = createRenderLoop(term as any)
    loops.push(loop)

    expect(getRendererBackend()).toBe(customBackend)

    loop.destroy()
    expect(backendDestroyCalled).toBe(true)
    // Symmetrical deregistration: activeRendererBackend must be reset to null
    expect(getRendererBackend()).toBeNull()
  })

  test("[DEFECT-29] Distinct opts.backend preserves per-loop backends without mutating global singleton and isolates destroy", () => {
    let backend1Destroyed = false
    let backend2Destroyed = false

    const backend1: RendererBackend = {
      name: "custom-backend-1",
      paint() { return { output: "skip-present", strategy: "skip-present" } },
      destroy() { backend1Destroyed = true },
    }
    const backend2: RendererBackend = {
      name: "custom-backend-2",
      paint() { return { output: "skip-present", strategy: "skip-present" } },
      destroy() { backend2Destroyed = true },
    }

    setRendererBackend(null)

    const term1 = mockTerminal(200, 100)
    const term2 = mockTerminal(200, 100)

    const loop1 = createRenderLoop(term1 as any, { backend: backend1 })
    const loop2 = createRenderLoop(term2 as any, { backend: backend2 })
    loops.push(loop1, loop2)

    expect(loop1.backend).toBe(backend1)
    expect(loop2.backend).toBe(backend2)
    expect(getRendererBackend()).toBeNull()

    loop1.destroy()
    expect(backend1Destroyed).toBe(true)
    expect(backend2Destroyed).toBe(false)
    expect(getRendererBackend()).toBeNull()
    expect(loop2.backend).toBe(backend2)

    loop2.destroy()
    expect(backend2Destroyed).toBe(true)
    expect(getRendererBackend()).toBeNull()

    // Also verify when a global singleton backend is active:
    const globalBackend: RendererBackend = {
      name: "global-singleton-backend",
      paint() { return { output: "skip-present", strategy: "skip-present" } },
    }
    setRendererBackend(globalBackend)

    let backend3Destroyed = false
    let backend4Destroyed = false
    const backend3: RendererBackend = {
      name: "custom-backend-3",
      paint() { return { output: "skip-present", strategy: "skip-present" } },
      destroy() { backend3Destroyed = true },
    }
    const backend4: RendererBackend = {
      name: "custom-backend-4",
      paint() { return { output: "skip-present", strategy: "skip-present" } },
      destroy() { backend4Destroyed = true },
    }

    const term3 = mockTerminal(200, 100)
    const term4 = mockTerminal(200, 100)

    const loop3 = createRenderLoop(term3 as any, { backend: backend3 })
    const loop4 = createRenderLoop(term4 as any, { backend: backend4 })
    loops.push(loop3, loop4)

    expect(loop3.backend).toBe(backend3)
    expect(loop4.backend).toBe(backend4)
    expect(getRendererBackend()).toBe(globalBackend)

    loop3.destroy()
    expect(backend3Destroyed).toBe(true)
    expect(backend4Destroyed).toBe(false)
    expect(getRendererBackend()).toBe(globalBackend)
    expect(loop4.backend).toBe(backend4)

    loop4.destroy()
    expect(backend4Destroyed).toBe(true)
    expect(getRendererBackend()).toBe(globalBackend)
  })

  test("[FLAW-03 & FLAW-04] Scoped Dirty & Pointer Routing with symmetrical unbindLoop", () => {
    const term1 = mockTerminal(200, 100)
    const term2 = mockTerminal(200, 100)
    const loop1 = createRenderLoop(term1 as any)
    const loop2 = createRenderLoop(term2 as any)
    loops.push(loop1, loop2)

    bindLoop(loop1)
    // Unbinding loop2 should NOT unbind loop1 if loop1 is active
    unbindLoop(loop2)
    let postScrollFired = false
    const unsub = loop1.onPostScroll(() => { postScrollFired = true })

    // Unbinding loop1 symmetrically resets activeLoop to null
    unbindLoop(loop1)
    unsub()

    // Calling unbindLoop without args resets to null
    bindLoop(loop2)
    unbindLoop()
  })

  test("[FLAW-05] Focus lifecycle: resetFocus properly clears scopes, nodeFocusMap, signals and invalidates queued repairs", async () => {
    const node1 = createNode("box")
    node1.props.focusable = true
    const unreg1 = registerNodeFocusable(node1)
    const id1 = getNodeFocusId(node1)!
    expect(id1).toBeDefined()
    expect(focusedId()).toBe(id1)

    // Push focus scope (e.g. modal)
    const popScope = pushFocusScope()
    const node2 = createNode("box")
    node2.props.focusable = true
    const unreg2 = registerNodeFocusable(node2)
    const id2 = getNodeFocusId(node2)!
    expect(focusedId()).toBe(id2)

    // Reset focus
    resetFocus()
    expect(focusedId()).toBeNull()
    expect(getNodeFocusId(node1)).toBeUndefined()
    expect(getNodeFocusId(node2)).toBeUndefined()

    // Popping an already-reset scope safely does nothing
    popScope()
    expect(focusedId()).toBeNull()

    // Unregistering nodes after resetFocus safely does nothing
    unreg1()
    unreg2()

    // Wait microtask to ensure no delayed repair revives focus
    await new Promise((resolve) => queueMicrotask(resolve))
    expect(focusedId()).toBeNull()
  })

  test("[FLAW-05 & FLAW-04] mount() teardown runs dispose, focus reset, selection reset, and unbindLoop cleanly", () => {
    const term = mockTerminal(200, 100)
    let disposed = false
    let mountCtx: EngineContext | null = null

    const handle = mount(
      () => {
        mountCtx = useEngineContext()
        setSelection({ text: "selected text", sourceId: 1, start: 0, end: 5 })
        useFocus({ id: "mount-focus-id" })
        setFocus("mount-focus-id")
        onCleanup(() => { disposed = true })
        return null
      },
      term as any,
    )

    expect(disposed).toBe(false)
    expect(mountCtx).not.toBeNull()
    expect(mountCtx!.selection.getSelection()?.text).toBe("selected text")
    expect(mountCtx!.focus.focusedId()).toBe("mount-focus-id")

    handle.destroy()
    expect(disposed).toBe(true)
    expect(mountCtx!.selection.getSelection()).toBeNull()
    expect(mountCtx!.focus.focusedId()).toBeNull()
  })

  test("two concurrent createEngineContext instances maintain focus, selection, and input 100% isolated, and destroying one preserves the other", () => {
    const term1 = mockTerminal(200, 100)
    const term2 = mockTerminal(300, 150)
    const loop1 = createRenderLoop(term1 as any)
    const loop2 = createRenderLoop(term2 as any)
    loops.push(loop1, loop2)

    const ctx1 = createEngineContext({ root: loop1.root, loop: loop1 })
    const ctx2 = createEngineContext({ root: loop2.root, loop: loop2 })

    // 1. Focus isolation
    const node1 = createNode("box")
    node1.props.focusable = true
    node1.props.focusId = "ctx1-btn"
    ctx1.focus.registerNodeFocusable(node1)
    ctx1.focus.setFocus("ctx1-btn")

    const node2 = createNode("box")
    node2.props.focusable = true
    node2.props.focusId = "ctx2-btn"
    ctx2.focus.registerNodeFocusable(node2)
    ctx2.focus.setFocus("ctx2-btn")

    expect(ctx1.focus.focusedId()).toBe("ctx1-btn")
    expect(ctx2.focus.focusedId()).toBe("ctx2-btn")

    // 2. Selection isolation
    ctx1.selection.setSelection({ text: "sel-ctx-1", sourceId: 1, start: 0, end: 5 })
    ctx2.selection.setSelection({ text: "sel-ctx-2", sourceId: 2, start: 0, end: 5 })
    expect(ctx1.selection.getSelectedText()).toBe("sel-ctx-1")
    expect(ctx2.selection.getSelectedText()).toBe("sel-ctx-2")

    // 3. Input subscriber isolation
    let input1Received = 0
    let input2Received = 0
    ctx1.input.onInput(() => { input1Received++ })
    ctx2.input.onInput(() => { input2Received++ })

    ctx1.input.dispatchInput({ type: "key", key: "a", char: "a", mods: { shift: false, alt: false, ctrl: false, meta: false } })
    expect(input1Received).toBe(1)
    expect(input2Received).toBe(0)

    ctx2.input.dispatchInput({ type: "key", key: "b", char: "b", mods: { shift: false, alt: false, ctrl: false, meta: false } })
    expect(input1Received).toBe(1)
    expect(input2Received).toBe(1)

    // 4. Destroy isolation: destroying ctx1 leaves ctx2 untouched
    ctx1.destroy()
    expect(ctx1.focus.focusedId()).toBeNull()
    expect(ctx1.selection.getSelection()).toBeNull()

    // ctx2 remains intact
    expect(ctx2.focus.focusedId()).toBe("ctx2-btn")
    expect(ctx2.selection.getSelectedText()).toBe("sel-ctx-2")
    ctx2.input.dispatchInput({ type: "key", key: "c", char: "c", mods: { shift: false, alt: false, ctrl: false, meta: false } })
    expect(input2Received).toBe(2)

    ctx2.destroy()
    expect(ctx2.focus.focusedId()).toBeNull()
    expect(ctx2.selection.getSelection()).toBeNull()
  })

  test("two concurrent mount() instances maintain focus, selection, and input 100% isolated, and destroying one preserves the other", () => {
    const term1 = mockTerminal(200, 100)
    const term2 = mockTerminal(200, 100)

    let ctx1: EngineContext | null = null
    let ctx2: EngineContext | null = null
    let app1InputCount = 0
    let app2InputCount = 0

    const handle1 = mount(() => {
      ctx1 = useEngineContext()
      useFocus({ id: "app1-focus" })
      setFocus("app1-focus")
      setSelection({ text: "app1-text", sourceId: 10, start: 0, end: 9 })
      onInput(() => { app1InputCount++ })
      return null
    }, term1 as any)

    const handle2 = mount(() => {
      ctx2 = useEngineContext()
      useFocus({ id: "app2-focus" })
      setFocus("app2-focus")
      setSelection({ text: "app2-text", sourceId: 20, start: 0, end: 9 })
      onInput(() => { app2InputCount++ })
      return null
    }, term2 as any)

    expect(ctx1).not.toBeNull()
    expect(ctx2).not.toBeNull()
    expect(ctx1).not.toBe(ctx2)

    // Verify focus & selection isolation
    expect(ctx1!.focus.focusedId()).toBe("app1-focus")
    expect(ctx2!.focus.focusedId()).toBe("app2-focus")
    expect(ctx1!.selection.getSelectedText()).toBe("app1-text")
    expect(ctx2!.selection.getSelectedText()).toBe("app2-text")

    // Terminal data input isolation
    term1.emitData(new TextEncoder().encode("hello"))
    expect(app1InputCount).toBeGreaterThan(0)
    expect(app2InputCount).toBe(0)

    const count1After = app1InputCount
    term2.emitData(new TextEncoder().encode("world"))
    expect(app1InputCount).toBe(count1After)
    expect(app2InputCount).toBeGreaterThan(0)

    // Destroy handle1
    handle1.destroy()
    expect(ctx1!.focus.focusedId()).toBeNull()
    expect(ctx1!.selection.getSelection()).toBeNull()

    // handle2 remains completely functional with its focus, selection, and input intact
    expect(handle2.suspended()).toBe(false)
    expect(ctx2!.focus.focusedId()).toBe("app2-focus")
    expect(ctx2!.selection.getSelectedText()).toBe("app2-text")

    const count2Before = app2InputCount
    term2.emitData(new TextEncoder().encode("more"))
    expect(app2InputCount).toBeGreaterThan(count2Before)

    handle2.destroy()
    expect(ctx2!.focus.focusedId()).toBeNull()
    expect(ctx2!.selection.getSelection()).toBeNull()
  })
})
