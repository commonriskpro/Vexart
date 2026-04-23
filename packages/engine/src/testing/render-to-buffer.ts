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
import { setRendererBackend, getRendererBackend } from "../ffi/renderer-backend"
import { createGpuRendererBackend } from "../ffi/gpu-renderer-backend"
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

type LoopInstance = ReturnType<typeof createRenderLoop>

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
 * Wraps the GPU backend to intercept endFrame and capture RGBA pixels.
 * Returns `{ output: "none" }` from endFrame to suppress Kitty I/O.
 */
function createCapturingBackend(gpuBackend: RendererBackend): {
  backend: RendererBackend
  getCaptured: () => Uint8Array | null
  capturedWidth: () => number
  capturedHeight: () => number
} {
  let captured: Uint8Array | null = null
  let capturedW = 0
  let capturedH = 0

  const backend: RendererBackend = {
    name: "capturing",
    beginFrame: (ctx) => gpuBackend.beginFrame?.(ctx),
    paint: (ctx) => gpuBackend.paint(ctx),
    reuseLayer: (ctx) => gpuBackend.reuseLayer?.(ctx),
    endFrame(ctx: RendererBackendFrameContext): RendererBackendFrameResult | null {
      const result = gpuBackend.endFrame?.(ctx)
      if (result?.output === "final-frame-raw" && result.finalFrame) {
        // Copy RGBA pixels — don't retain the backend's buffer reference
        captured = new Uint8Array(result.finalFrame.data)
        capturedW = result.finalFrame.width
        capturedH = result.finalFrame.height
        // Return none — suppress Kitty output
        return { output: "none", strategy: result.strategy }
      }
      // Fallback: layered-raw strategy — no full-frame buffer available yet.
      // The caller will retry with forceLayerRepaint or rely on layer kittyPayloads.
      return result ?? null
    },
  }

  return {
    backend,
    getCaptured: () => captured,
    capturedWidth: () => capturedW,
    capturedHeight: () => capturedH,
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
): Promise<RenderToBufferResult> {
  return captureToBuffer(width, height, frames, (loop) => solidRender(component as () => TGENode, loop.root))
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
): Promise<RenderToBufferResult> {
  return captureToBuffer(width, height, frames, (loop) => {
    insertChild(loop.root, node)
    return () => removeChild(loop.root, node)
  })
}

async function captureToBuffer(
  width: number,
  height: number,
  frames: number,
  mountScene: (loop: LoopInstance) => () => void,
): Promise<RenderToBufferResult> {
  // Force final-frame-raw so the GPU backend composites all layers into a
  // single RGBA buffer that endFrame can return to us.
  const prevStrategy = process.env["TGE_GPU_FORCE_LAYER_STRATEGY"]
  process.env["TGE_GPU_FORCE_LAYER_STRATEGY"] = "final-frame-raw"

  const term = createMockTerminal(width, height)

  const gpuBackend = createGpuRendererBackend()
  const { backend, getCaptured, capturedWidth, capturedHeight } = createCapturingBackend(gpuBackend)

  // Save + replace the active backend
  const prevBackend = getRendererBackend()
  setRendererBackend(backend)

  const loop = createRenderLoop(term, {
    experimental: { forceLayerRepaint: true },
  })

  const dispose = mountScene(loop)
  bindLoop(loop)
  markDirty()

  // Run frames — first frame initialises layout, second stabilises
  for (let i = 0; i < frames; i++) {
    loop.frame()
    // Give SolidJS effects a tick to settle between frames
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    markDirty()
  }

  // Tear down
  unbindLoop()
  resetFocus()
  resetSelection()
  dispose()
  loop.destroy()

  // Restore backend + env
  setRendererBackend(prevBackend)
  if (prevStrategy === undefined) {
    delete process.env["TGE_GPU_FORCE_LAYER_STRATEGY"]
  } else {
    process.env["TGE_GPU_FORCE_LAYER_STRATEGY"] = prevStrategy
  }

  const pixels = getCaptured()
  if (!pixels) {
    throw new Error(
      `renderToBuffer: no pixels captured after ${frames} frames. ` +
      `Make sure libvexart is built (cargo build --release) and the scene has visible content.`,
    )
  }

  return {
    pixels,
    width: capturedWidth(),
    height: capturedHeight(),
  }
}
