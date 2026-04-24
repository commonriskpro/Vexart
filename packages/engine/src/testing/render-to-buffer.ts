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
import {
  nativeSceneCreateNode,
  nativeSceneDestroyNode,
  nativeSceneInsert,
  nativeSceneRemove,
  nativeSceneSetProp,
  nativeSceneSetText,
} from "../ffi/native-scene"
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

export type RenderLoopInteractionHelpers = {
  clickAt: (x: number, y: number) => Promise<void>
  keyPress: (key: string, char?: string) => Promise<void>
  frame: () => Promise<void>
}

function nativeKindForNode(node: TGENode) {
  if (node.kind === "root") return "root"
  if (node.kind === "text") return "text"
  if (node.kind === "img") return "img"
  if (node.kind === "canvas") return "canvas"
  return "box"
}

function mirrorNodeToNative(node: TGENode, parentNativeId?: bigint | null) {
  node._nativeId = nativeSceneCreateNode(nativeKindForNode(node))
  if (parentNativeId && node._nativeId) nativeSceneInsert(parentNativeId, node._nativeId)
  for (const [key, value] of Object.entries(node.props)) {
    if (value !== undefined) nativeSceneSetProp(node._nativeId, key, value)
  }
  if (node.kind === "text") nativeSceneSetText(node._nativeId, node.text)
  for (const child of node.children) mirrorNodeToNative(child, node._nativeId)
}

function unmirrorNodeFromNative(node: TGENode, parentNativeId?: bigint | null) {
  for (const child of node.children) unmirrorNodeFromNative(child, node._nativeId)
  if (parentNativeId && node._nativeId) nativeSceneRemove(parentNativeId, node._nativeId)
  if (node._nativeId) nativeSceneDestroyNode(node._nativeId)
  node._nativeId = null
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
 * Wraps the GPU backend to intercept endFrame and capture RGBA pixels.
 * Returns `{ output: "none" }` from endFrame to suppress Kitty I/O.
 */
function createCapturingBackend(gpuBackend: RendererBackend): {
  backend: RendererBackend
  getCaptured: () => Uint8Array | null
  capturedWidth: () => number
  capturedHeight: () => number
  getLastFrameStrategy: () => string | null
  getLastFrameOutput: () => string | null
} {
  let captured: Uint8Array | null = null
  let capturedW = 0
  let capturedH = 0
  let layeredCapture: Uint8Array | null = null
  let layeredW = 0
  let layeredH = 0
  let lastFrameStrategy: string | null = null
  let lastFrameOutput: string | null = null

  const compositeLayerIntoFrame = (
    frame: Uint8Array,
    frameWidth: number,
    frameHeight: number,
    layer: Uint8Array,
    layerWidth: number,
    layerHeight: number,
    offsetX: number,
    offsetY: number,
  ) => {
    for (let y = 0; y < layerHeight; y++) {
      const dstY = offsetY + y
      if (dstY < 0 || dstY >= frameHeight) continue
      for (let x = 0; x < layerWidth; x++) {
        const dstX = offsetX + x
        if (dstX < 0 || dstX >= frameWidth) continue
        const srcIndex = (y * layerWidth + x) * 4
        const dstIndex = (dstY * frameWidth + dstX) * 4
        const srcA = layer[srcIndex + 3] / 255
        if (srcA <= 0) continue
        const dstA = frame[dstIndex + 3] / 255
        const outA = srcA + dstA * (1 - srcA)
        if (outA <= 0) continue
        const srcR = layer[srcIndex] / 255
        const srcG = layer[srcIndex + 1] / 255
        const srcB = layer[srcIndex + 2] / 255
        const dstR = frame[dstIndex] / 255
        const dstG = frame[dstIndex + 1] / 255
        const dstB = frame[dstIndex + 2] / 255
        const outR = (srcR * srcA + dstR * dstA * (1 - srcA)) / outA
        const outG = (srcG * srcA + dstG * dstA * (1 - srcA)) / outA
        const outB = (srcB * srcA + dstB * dstA * (1 - srcA)) / outA
        frame[dstIndex] = Math.max(0, Math.min(255, Math.round(outR * 255)))
        frame[dstIndex + 1] = Math.max(0, Math.min(255, Math.round(outG * 255)))
        frame[dstIndex + 2] = Math.max(0, Math.min(255, Math.round(outB * 255)))
        frame[dstIndex + 3] = Math.max(0, Math.min(255, Math.round(outA * 255)))
      }
    }
  }

  const backend: RendererBackend = {
    name: "capturing",
    beginFrame(ctx) {
      layeredW = ctx.viewportWidth
      layeredH = ctx.viewportHeight
      layeredCapture = new Uint8Array(layeredW * layeredH * 4)
      const plan = gpuBackend.beginFrame?.(ctx)
      lastFrameStrategy = plan?.strategy ?? null
      return plan
    },
    paint(ctx) {
      const result = gpuBackend.paint(ctx)
      if (result?.output === "kitty-payload" && result.kittyPayload && ctx.layer && layeredCapture) {
        compositeLayerIntoFrame(
          layeredCapture,
          layeredW,
          layeredH,
          result.kittyPayload.data,
          result.kittyPayload.width,
          result.kittyPayload.height,
          ctx.layer.bounds.x,
          ctx.layer.bounds.y,
        )
      }
      return result
    },
    reuseLayer: (ctx) => gpuBackend.reuseLayer?.(ctx),
    endFrame(ctx: RendererBackendFrameContext): RendererBackendFrameResult | null {
      const result = gpuBackend.endFrame?.(ctx)
      lastFrameOutput = result?.output ?? null
      if (result?.output === "final-frame-raw" && result.finalFrame) {
        // Copy RGBA pixels — don't retain the backend's buffer reference
        captured = new Uint8Array(result.finalFrame.data)
        capturedW = result.finalFrame.width
        capturedH = result.finalFrame.height
        // Return none — suppress Kitty output
        return { output: "none", strategy: result.strategy }
      }
      if (!captured && layeredCapture) {
        captured = new Uint8Array(layeredCapture)
        capturedW = layeredW
        capturedH = layeredH
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
    getLastFrameStrategy: () => lastFrameStrategy,
    getLastFrameOutput: () => lastFrameOutput,
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
    if (loop.root._nativeId) mirrorNodeToNative(node, loop.root._nativeId)
    insertChild(loop.root, node)
    return () => {
      if (loop.root._nativeId) unmirrorNodeFromNative(node, loop.root._nativeId)
      removeChild(loop.root, node)
    }
  })
}

export async function renderNodeToBufferAfterInteractions(
  node: TGENode,
  width: number,
  height: number,
  interact: (helpers: RenderLoopInteractionHelpers) => Promise<void> | void,
  frames = 2,
): Promise<RenderToBufferResult> {
  return captureToBuffer(width, height, frames, (loop) => {
    if (loop.root._nativeId) mirrorNodeToNative(node, loop.root._nativeId)
    insertChild(loop.root, node)
    return () => {
      if (loop.root._nativeId) unmirrorNodeFromNative(node, loop.root._nativeId)
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
      async keyPress(key, char = "") {
        dispatchInput({ type: "key", key, char, mods: { shift: false, alt: false, ctrl: false, meta: false } })
        markDirty()
        await nextFrame()
      },
      frame: nextFrame,
    }
    await interact(helpers)
  })
}

async function captureToBuffer(
  width: number,
  height: number,
  frames: number,
  mountScene: (loop: LoopInstance) => () => void,
  interact?: (loop: LoopInstance) => Promise<void> | void,
): Promise<RenderToBufferResult> {
  // Force final-frame-raw so the GPU backend composites all layers into a
  // single RGBA buffer that endFrame can return to us.
  const prevStrategy = process.env["TGE_GPU_FORCE_LAYER_STRATEGY"]
  process.env["TGE_GPU_FORCE_LAYER_STRATEGY"] = "final-frame-raw"

  const term = createMockTerminal(width, height)

  const gpuBackend = createGpuRendererBackend()
  const { backend, getCaptured, capturedWidth, capturedHeight, getLastFrameStrategy, getLastFrameOutput } = createCapturingBackend(gpuBackend)

  // Save + replace the active backend
  const prevBackend = getRendererBackend()
  setRendererBackend(backend)

  const loop = createRenderLoop(term, {
    experimental: {
      forceLayerRepaint: true,
      // Offscreen visual tests need a deterministic retained render path, but
      // screenshots intentionally capture explicit raw readback instead of the
      // runtime terminal presentation path.
      nativePresentation: false,
      nativeLayerRegistry: false,
      nativeSceneGraph: true,
      nativeEventDispatch: true,
      nativeSceneLayout: true,
        nativeRenderGraph: false,
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
      `Make sure libvexart is built (cargo build --release) and the scene has visible content. ` +
      `lastStrategy=${getLastFrameStrategy() ?? "none"} lastOutput=${getLastFrameOutput() ?? "none"}`,
    )
  }

  return {
    pixels,
    width: capturedWidth(),
    height: capturedHeight(),
  }
}
