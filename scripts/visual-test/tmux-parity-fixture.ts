/**
 * One isolated child of tmux-parity.ts.
 *
 * The child is deliberately quiet on stdout: native Kitty bytes are the only
 * output captured there. The readback and status are written to sidecars so a
 * scene cannot accidentally make the packet decoder consume diagnostic text.
 */

import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  renderToBuffer,
  type RenderToBufferOptions,
  type RenderToBufferResult,
} from "../../packages/engine/src/testing/render-to-buffer"
import { getLastNativePresentationStatsForTest } from "../../packages/engine/src/ffi/gpu-renderer-backend"

type SceneModule = {
  width: number
  height: number
  Scene?: () => unknown
  render?: (options?: RenderToBufferOptions) => Promise<RenderToBufferResult>
  verify?: (frame: RenderToBufferResult) => void | Promise<void>
}

type FixtureArgs = {
  scene: string
  mode: "direct" | "tmux-shm"
  pixels: string
  meta: string
}

type OracleResult = {
  status: "passed" | "failed" | "not-provided"
  error?: string
}

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3)
}

function parseArgs(): FixtureArgs {
  const scene = argument("scene")
  const mode = argument("mode")
  const pixels = argument("pixels")
  const meta = argument("meta")
  if (!scene || !pixels || !meta || (mode !== "direct" && mode !== "tmux-shm")) {
    throw new Error("usage: tmux-parity-fixture --scene=<file> --mode=direct|tmux-shm --pixels=<file> --meta=<file>")
  }
  return { scene: resolve(scene), mode, pixels: resolve(pixels), meta: resolve(meta) }
}

function validateModule(mod: SceneModule, scene: string): void {
  if (!Number.isSafeInteger(mod.width) || mod.width <= 0 || !Number.isSafeInteger(mod.height) || mod.height <= 0) {
    throw new Error(`Scene ${scene} must export positive integer width and height`)
  }
  if (typeof mod.Scene !== "function" && typeof mod.render !== "function") {
    throw new Error(`Scene ${scene} must export either Scene or render`)
  }
}

async function renderScene(mod: SceneModule, options: RenderToBufferOptions): Promise<RenderToBufferResult> {
  if (mod.render) return mod.render(options)
  return renderToBuffer(() => mod.Scene!(), mod.width, mod.height, 2, options)
}

async function main(): Promise<void> {
  const args = parseArgs()
  const mod = await import(pathToFileURL(args.scene).href) as SceneModule
  validateModule(mod, args.scene)

  const result = await renderScene(mod, { presentation: args.mode })
  if (result.width !== mod.width || result.height !== mod.height) {
    throw new Error(`Scene ${args.scene} returned ${result.width}x${result.height}; expected ${mod.width}x${mod.height}`)
  }
  const expectedBytes = result.width * result.height * 4
  if (result.pixels.byteLength !== expectedBytes) {
    throw new Error(`Scene ${args.scene} returned ${result.pixels.byteLength} RGBA bytes; expected ${expectedBytes}`)
  }

  let oracle: OracleResult = { status: "not-provided" }
  if (mod.verify) {
    try {
      await mod.verify(result)
      oracle = { status: "passed" }
    } catch (error) {
      // Keep the frame and native bytes available for inspection. The child
      // still exits non-zero below so an oracle failure cannot look like a
      // passing parity result.
      oracle = { status: "failed", error: error instanceof Error ? error.message : String(error) }
    }
  }
  const stats = getLastNativePresentationStatsForTest()
  if (!stats) throw new Error(`Scene ${args.scene} produced no native presentation stats`)

  // wx is intentional: the parent pre-allocates unique sidecar names and a
  // child must never replace an artifact if invoked incorrectly.
  writeFileSync(args.pixels, Buffer.from(result.pixels), { flag: "wx" })
  const metadata = {
    version: 1,
    scene: args.scene,
    mode: args.mode,
    width: result.width,
    height: result.height,
    pixelBytes: result.pixels.byteLength,
    oracle,
    nativeStats: stats,
  }
  writeFileSync(args.meta, `${JSON.stringify(metadata)}\n`, { flag: "wx" })
  process.stderr.write(`__VEXART_TMUX_PARITY__${JSON.stringify(metadata)}\n`)
  if (oracle.status === "failed") throw new Error(`scene oracle failed: ${oracle.error}`)
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
