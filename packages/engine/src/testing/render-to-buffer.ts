/**
 * render-to-buffer.ts — Offscreen render path for visual testing.
 *
 * Renders a JSX scene to a raw RGBA pixel buffer without a terminal.
 * Used by scripts/visual-test/runner.ts for golden-image tests.
 *
 * Strategy:
 *   1. Create a mock Terminal (no I/O, kittyGraphics=true)
 *   2. Wrap the GPU backend to capture RGBA pixels from endFrame
 *   3. Mount the component and run one frame
 *   4. Return the captured pixel buffer
 *
 * The GPU backend is GPU-only and works headlessly — libvexart uses wgpu
 * which initialises without a display via offscreen surface.
 *
 * Important: forces final-frame-raw strategy so the composited frame is
 * always available as a single RGBA buffer from endFrame.
 */

import { render as solidRender } from "../reconciler/reconciler"
import type { TGENode } from "../ffi/node"
import { insertChild, removeChild } from "../ffi/node"
import { createRenderLoop } from "../loop/loop"
import { markDirty } from "../reconciler/dirty"
import { dispatchInput } from "../loop/input"
import { setRendererBackend, getRendererBackend } from "../ffi/renderer-backend"
import { createGpuRendererBackend, type GpuRendererBackend } from "../ffi/gpu-renderer-backend"
import { bindLoop, unbindLoop } from "../reconciler/pointer"
import { resetFocus } from "../reconciler/focus"
import { resetSelection } from "../reconciler/selection"
import type { Terminal } from "../terminal/index"
import type { RendererBackend, RendererBackendFrameContext, RendererBackendFrameResult } from "../ffi/renderer-backend"

export type RenderToBufferResult = {
  pixels: Uint8Array
  width: number
  height: number
}

export interface RenderToBufferOptions {
}

type LoopInstance = ReturnType<typeof createRenderLoop>

export type RenderLoopInteractionHelpers = {
  clickAt: (x: number, y: number) => Promise<void>
  pointerMove: (x: number, y: number) => Promise<void>
  keyPress: (key: string, char?: string) => Promise<void>
  frame: () => Promise<void>
}

// ── Mock terminal ────────────────────────────────────────────────────────────

function createMockTerminal(width: number, height: number): Terminal {
  const noop = () => {}
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
      transmissionMode: "direct" as const,
    },
    size,
    write: noop,
    rawWrite: noop,
    writeBytes: noop,
    beginSync: noop,
    endSync: noop,
    onResize: () => noop,
    onData: () => noop,
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle: noop,
    writeClipboard: noop,
    suspend: noop,
    resume: noop,
    destroy: noop,
  }
}

// ── Capturing backend ────────────────────────────────────────────────────────

/**
 * Wraps the GPU backend to suppress Kitty output during test rendering.
 * After all frames are rendered, use gpuBackend.readbackForTest() to
 * capture the final composited pixels.
 */
function createCapturingBackend(gpuBackend: GpuRendererBackend): {
  backend: RendererBackend
  readbackPixels: (width: number, height: number) => Uint8Array | null
} {
  const backend: RendererBackend = {
    name: "capturing",
    beginFrame(ctx) {
      return gpuBackend.beginFrame?.(ctx)
    },
    paint(ctx) {
      return gpuBackend.paint(ctx)
    },
    reuseLayer: (ctx) => gpuBackend.reuseLayer?.(ctx),
    endFrame(ctx: RendererBackendFrameContext): RendererBackendFrameResult | null {
      const result = gpuBackend.endFrame?.(ctx)
      // Suppress any native output that would write to stdout
      return { output: "none", strategy: result?.strategy ?? null }
    },
  }

  return {
    backend,
    readbackPixels: (width, height) => {
      const raw = gpuBackend.readbackForTest(width, height)
      return raw ? new Uint8Array(raw) : null
    },
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Render a JSX component once to a raw RGBA pixel buffer.
 *
 * @param component - A zero-argument function returning JSX (SolidJS component)
 * @param width     - Viewport width in pixels
 * @param height    - Viewport height in pixels
 * @param frames    - Number of frames to render (default 2: first initialises, second stabilises)
 * @returns { pixels: Uint8Array, width, height }
 */
export async function renderToBuffer(
  component: () => unknown,
  width: number,
  height: number,
  frames = 2,
  options: RenderToBufferOptions = {},
): Promise<RenderToBufferResult> {
  return captureToBuffer(width, height, frames, (loop) => solidRender(component as () => TGENode, loop.root), undefined, options)
}

export async function renderToBufferAfterInteractions(
  component: () => unknown,
  width: number,
  height: number,
  interact: (helpers: RenderLoopInteractionHelpers) => Promise<void> | void,
  frames = 2,
  options: RenderToBufferOptions = {},
): Promise<RenderToBufferResult> {
  return captureToBuffer(width, height, frames, (loop) => solidRender(component as () => TGENode, loop.root), async (loop) => {
    const nextFrame = async () => {
      loop.frame()
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    const helpers: RenderLoopInteractionHelpers = {
      async clickAt(x, y) {
        loop.feedPointer(x, y, true)
        await nextFrame()
        loop.feedPointer(x, y, false)
        await nextFrame()
      },
      async pointerMove(x, y) {
        loop.feedPointer(x, y, false)
        await nextFrame()
      },
      async keyPress(key, char = "") {
        dispatchInput({ type: "key", key, char, mods: { shift: false, alt: false, ctrl: false, meta: false } })
        markDirty()
        await nextFrame()
      },
      frame: nextFrame,
    }
    await interact(helpers)
  }, options)
}

/**
 * Render a pre-built TGENode tree once to a raw RGBA pixel buffer.
 * Useful for low-level tests that want to bypass JSX/Solid compilation.
 */
export async function renderNodeToBuffer(
  node: TGENode,
  width: number,
  height: number,
  frames = 2,
  options: RenderToBufferOptions = {},
): Promise<RenderToBufferResult> {
  return captureToBuffer(width, height, frames, (loop) => {
    insertChild(loop.root, node)
    return () => {
      removeChild(loop.root, node)
    }
  }, undefined, options)
}

export async function renderNodeToBufferAfterInteractions(
  node: TGENode,
  width: number,
  height: number,
  interact: (helpers: RenderLoopInteractionHelpers) => Promise<void> | void,
  frames = 2,
  options: RenderToBufferOptions = {},
): Promise<RenderToBufferResult> {
  return captureToBuffer(width, height, frames, (loop) => {
    insertChild(loop.root, node)
    return () => {
      removeChild(loop.root, node)
    }
  }, async (loop) => {
    const nextFrame = async () => {
      loop.frame()
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    const helpers: RenderLoopInteractionHelpers = {
      async clickAt(x, y) {
        loop.feedPointer(x, y, true)
        await nextFrame()
        loop.feedPointer(x, y, false)
        await nextFrame()
      },
      async pointerMove(x, y) {
        loop.feedPointer(x, y, false)
        await nextFrame()
      },
      async keyPress(key, char = "") {
        dispatchInput({ type: "key", key, char, mods: { shift: false, alt: false, ctrl: false, meta: false } })
        markDirty()
        await nextFrame()
      },
      frame: nextFrame,
    }
    await interact(helpers)
  }, options)
}

async function captureToBuffer(
  width: number,
  height: number,
  frames: number,
  mountScene: (loop: LoopInstance) => () => void,
  interact?: (loop: LoopInstance) => Promise<void> | void,
  options: RenderToBufferOptions = {},
): Promise<RenderToBufferResult> {
  // Force final-frame strategy so the GPU backend composites all layers
  // into a single target that readbackForTest() can capture.
  const prevStrategy = process.env["VEXART_GPU_FORCE_LAYER_STRATEGY"]
  process.env["VEXART_GPU_FORCE_LAYER_STRATEGY"] = "final-frame"

  const term = createMockTerminal(width, height)

  const gpuBackend = createGpuRendererBackend()
  const { backend, readbackPixels } = createCapturingBackend(gpuBackend)

  // Save + replace the active backend
  const prevBackend = getRendererBackend()
  setRendererBackend(backend)

  const loop = createRenderLoop(term, {
    experimental: {
      forceLayerRepaint: true,
      // Native presentation is active but capturing backend suppresses output.
      // After all frames, readbackForTest() extracts pixels directly from GPU.
    },
  })

  bindLoop(loop)
  const dispose = mountScene(loop)
  markDirty()

  // Run frames — first frame initialises layout, second stabilises
  for (let i = 0; i < frames; i++) {
    loop.frame()
    // Give SolidJS effects a tick to settle between frames
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    markDirty()
  }

  if (interact) {
    await interact(loop)
    markDirty()
    loop.frame()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  // Capture pixels via test-only readback (not part of production path)
  const pixels = readbackPixels(width, height)

  // Tear down
  unbindLoop()
  resetFocus()
  resetSelection()
  dispose()
  loop.destroy()

  // Restore backend + env
  setRendererBackend(prevBackend)
  if (prevStrategy === undefined) {
    delete process.env["VEXART_GPU_FORCE_LAYER_STRATEGY"]
  } else {
    process.env["VEXART_GPU_FORCE_LAYER_STRATEGY"] = prevStrategy
  }

  if (!pixels) {
    throw new Error(
      `renderToBuffer: no pixels captured after ${frames} frames. ` +
      `Make sure libvexart is built (cargo build --release) and the scene has visible content.`,
    )
  }

  return { pixels, width, height }
}
