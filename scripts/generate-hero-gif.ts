/**
 * scripts/generate-hero-gif.ts
 *
 * Generates an animated Hero GIF of the Effects Playground demo showcasing:
 * - Native WGPU GPU acceleration with real-time backdrop blur (glassmorphism)
 * - SolidJS fine-grained reactivity dynamically updating JSX code and UI
 * - Pixel-native terminal UI rendering without webviews or ASCII fallbacks
 *
 * Architecture:
 * 1. Offscreen mock terminal and capturing GPU backend.
 * 2. Mounts EffectsPlaygroundApp at native 1536x1024 artboard resolution.
 * 3. Waits for image assets (ribbons.png, icons) to settle in the GPU texture cache.
 * 4. Animates the backdrop blur slider smoothly over 80 frames (~4s at 20fps).
 * 5. Streams raw RGBA frames directly into an ffmpeg pipe.
 * 6. Scales to 1200x800 and optimizes via 256-color differential palettegen + bayer dither.
 */

import { resolve } from "node:path"
import { mkdir, stat } from "node:fs/promises"
import { getImageCacheStats, clearFocus } from "vexart"
import { createRenderLoop } from "../packages/engine/src/loop/loop"
import { markDirty } from "../packages/engine/src/reconciler/dirty"
import { setRendererBackend, getRendererBackend } from "../packages/engine/src/ffi/renderer-backend"
import { createGpuRendererBackendForTesting } from "../packages/engine/src/ffi/gpu-renderer-backend"
import { bindLoop, unbindLoop } from "../packages/engine/src/reconciler/pointer"
import { resetFocus } from "../packages/engine/src/reconciler/focus"
import { clearSelection } from "../packages/engine/src/reconciler/selection"
import { render as solidRender } from "../packages/engine/src/reconciler/reconciler"
import { EffectsPlaygroundApp, createEffectsController } from "../examples/demos/effects-playground"

const WIDTH = 1536
const HEIGHT = 1024
const TARGET_WIDTH = 1200
const TARGET_HEIGHT = 800
const FPS = 20
const TOTAL_FRAMES = 80 // ~4.0 seconds at 20 fps
const OUTPUT_PATH = resolve(import.meta.dir, "../docs/assets/demos/hero.gif")

function createMockTerminal(width: number, height: number) {
  const cellWidth = 8
  const cellHeight = 16
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

async function main() {
  console.log("=== Vexart Hero GIF Generator ===")
  console.log(`Source: 1536x1024 -> Target: ${TARGET_WIDTH}x${TARGET_HEIGHT} @ ${FPS}fps (${TOTAL_FRAMES} frames)`)
  console.log(`Output destination: ${OUTPUT_PATH}`)

  await mkdir(resolve(OUTPUT_PATH, ".."), { recursive: true })

  // Force final-frame composite strategy so readbackForTest receives the full frame
  const prevStrategy = process.env["VEXART_GPU_FORCE_LAYER_STRATEGY"]
  process.env["VEXART_GPU_FORCE_LAYER_STRATEGY"] = "final-frame"

  const term = createMockTerminal(WIDTH, HEIGHT)
  const gpuBackend = createGpuRendererBackendForTesting()
  const backend = {
    name: "capturing",
    beginFrame: (ctx: any) => gpuBackend.beginFrame?.(ctx),
    paint: (ctx: any) => gpuBackend.paint(ctx),
    reuseLayer: (ctx: any) => gpuBackend.reuseLayer?.(ctx),
    compositeRetainedFrame: (ctx: any) => gpuBackend.compositeRetainedFrame?.(ctx),
    endFrame: (ctx: any) => {
      const result = gpuBackend.endFrame?.(ctx)
      return { output: "none", strategy: result?.strategy ?? null }
    },
    destroy: () => gpuBackend.destroy?.(),
  }
  const readbackPixels = (w: number, h: number) => {
    const raw = gpuBackend.readbackForTest(w, h)
    return raw ? new Uint8Array(raw) : null
  }

  const prevBackend = getRendererBackend()
  setRendererBackend(backend as any)

  let loop: ReturnType<typeof createRenderLoop> | null = null
  let dispose: (() => void) | null = null

  try {
    loop = createRenderLoop(term as any, {
      experimental: {
        forceLayerRepaint: true,
      },
    })
    bindLoop(loop)

    const controller = createEffectsController()
    dispose = solidRender(() => EffectsPlaygroundApp({ width: WIDTH, height: HEIGHT, controller }), loop.root)

    // Initial positioning and focus reset
    clearFocus()
    loop.feedPointer(WIDTH + 1, HEIGHT + 1, false)
    markDirty()
    loop.frame()

    // Settle async assets (images and fonts)
    console.log("Settling image textures in WGPU cache...")
    const startSettle = performance.now()
    while (getImageCacheStats().pendingCount > 0) {
      if (performance.now() - startSettle > 10000) {
        throw new Error("Timeout waiting for textures to decode")
      }
      markDirty()
      loop.frame()
      await Bun.sleep(16)
    }
    // Extra stabilization frames
    for (let f = 0; f < 3; f++) {
      markDirty()
      loop.frame()
      await Bun.sleep(16)
    }
    console.log("Image cache settled.")

    // Launch ffmpeg with pipeline:
    // 1. Ingest raw RGBA at native resolution
    // 2. Downscale to 1200x800 with high-quality lanczos filter
    // 3. Generate optimal 256-color palette based on differential changes
    // 4. Quantize using bayer ordered dithering with rectangle difference mode
    const ffmpeg = Bun.spawn([
      "ffmpeg",
      "-y",
      "-f", "rawvideo",
      "-pix_fmt", "rgba",
      "-s", `${WIDTH}x${HEIGHT}`,
      "-r", String(FPS),
      "-i", "-",
      "-filter_complex",
      `[0:v] scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:flags=lanczos, split [a][b]; [a] palettegen=stats_mode=diff:max_colors=256 [p]; [b][p] paletteuse=dither=bayer:diff_mode=rectangle`,
      OUTPUT_PATH,
    ], {
      stdin: "pipe",
      stdout: "inherit",
      stderr: "inherit",
    })

    console.log(`Rendering and piping ${TOTAL_FRAMES} frames to ffmpeg...`)
    const startTime = performance.now()

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      // Smooth sinusoidal oscillation between 0 px and 48 px
      const progress = i / TOTAL_FRAMES
      const t = (1 - Math.cos(progress * 2 * Math.PI)) / 2
      const blur = Math.round(t * 48)

      controller.setValue("blur", blur)
      markDirty()
      loop.frame()

      const pixels = readbackPixels(WIDTH, HEIGHT)
      if (!pixels) {
        throw new Error(`Failed to read back pixels for frame ${i}`)
      }

      ffmpeg.stdin.write(pixels)
      ffmpeg.stdin.flush()

      if ((i + 1) % 20 === 0 || i === TOTAL_FRAMES - 1) {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
        console.log(`  Frame ${i + 1}/${TOTAL_FRAMES} (blur=${blur}px) - ${elapsed}s`)
      }
    }

    ffmpeg.stdin.end()
    const exitCode = await ffmpeg.exited
    if (exitCode !== 0) {
      throw new Error(`ffmpeg process failed with exit code ${exitCode}`)
    }

    const totalSeconds = ((performance.now() - startTime) / 1000).toFixed(2)
    const fileStat = await stat(OUTPUT_PATH)
    const sizeMb = (fileStat.size / (1024 * 1024)).toFixed(2)

    console.log(`\nDone! Generated ${OUTPUT_PATH}`)
    console.log(`Frames: ${TOTAL_FRAMES} | Duration: ~4.0s | Resolution: ${TARGET_WIDTH}x${TARGET_HEIGHT}`)
    console.log(`File Size: ${sizeMb} MB (${fileStat.size} bytes) | Elapsed: ${totalSeconds}s`)
  } finally {
    if (loop) {
      try {
        unbindLoop()
      } finally {
        try {
          resetFocus()
          clearSelection()
        } finally {
          try {
            dispose?.()
          } finally {
            loop.destroy()
          }
        }
      }
    } else {
      backend.destroy?.()
    }
    setRendererBackend(prevBackend)
    if (prevStrategy === undefined) {
      delete process.env["VEXART_GPU_FORCE_LAYER_STRATEGY"]
    } else {
      process.env["VEXART_GPU_FORCE_LAYER_STRATEGY"] = prevStrategy
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})

