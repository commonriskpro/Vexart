/**
 * visual-test/runner.ts — Golden image test runner.
 *
 * Discovers scene files under scripts/visual-test/scenes/, renders each to
 * a pixel buffer, compares against reference PNGs in scripts/visual-test/references/,
 * and reports pass/fail with pixel diff percentage.
 *
 * Usage:
 *   bun run scripts/visual-test/runner.ts          — compare mode
 *   bun run scripts/visual-test/runner.ts --update  — regenerate references
 *
 * Scene contract (each .tsx file must export):
 *   export const width: number
 *   export const height: number
 *   export function Scene(): JSX (no-arg function)
 */

import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { join, basename, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createCanvas, loadImage } from "@napi-rs/canvas"
import { renderToBuffer } from "../../packages/engine/src/testing/render-to-buffer"

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCENES_DIR = join(__dirname, "scenes")
const REFS_DIR = join(__dirname, "references")
const UPDATE = process.argv.includes("--update")

// Diff threshold: percentage of pixels allowed to differ before FAIL
const DIFF_THRESHOLD = 1.5

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Encode raw RGBA bytes to PNG and return Buffer */
async function rgbaToPng(pixels: Uint8Array, width: number, height: number): Promise<Buffer> {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext("2d")
  // Write raw RGBA into an ImageData
  const imageData = ctx.createImageData(width, height)
  imageData.data.set(pixels)
  ctx.putImageData(imageData, 0, 0)
  return canvas.toBuffer("image/png")
}

/** Decode a PNG file to raw RGBA Uint8Array */
async function pngToRgba(pngPath: string): Promise<{ pixels: Uint8Array; width: number; height: number }> {
  const img = await loadImage(pngPath)
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext("2d")
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(0, 0, img.width, img.height)
  return {
    pixels: new Uint8Array(imageData.data.buffer),
    width: img.width,
    height: img.height,
  }
}

/** Returns percentage of pixels that differ (0–100) */
function diffPixels(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return 100
  let diff = 0
  const total = a.length / 4
  for (let i = 0; i < a.length; i += 4) {
    const dr = Math.abs(a[i] - b[i])
    const dg = Math.abs(a[i + 1] - b[i + 1])
    const db = Math.abs(a[i + 2] - b[i + 2])
    const da = Math.abs(a[i + 3] - b[i + 3])
    // Count pixel as different if any channel differs by more than 4 (tolerance)
    if (dr > 4 || dg > 4 || db > 4 || da > 4) diff++
  }
  return (diff / total) * 100
}

type SceneModule = {
  width: number
  height: number
  Scene: () => unknown
}

async function loadScene(scenePath: string): Promise<SceneModule> {
  const mod = await import(scenePath) as SceneModule
  if (typeof mod.width !== "number") throw new Error(`Scene ${scenePath} must export \`width: number\``)
  if (typeof mod.height !== "number") throw new Error(`Scene ${scenePath} must export \`height: number\``)
  if (typeof mod.Scene !== "function") throw new Error(`Scene ${scenePath} must export \`Scene\` function`)
  return mod
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function runScene(scenePath: string): Promise<{ name: string; pass: boolean; diff: number; message: string }> {
  const name = basename(scenePath, ".tsx")
  const refPath = join(REFS_DIR, `${name}.png`)

  let result
  try {
    const mod = await loadScene(scenePath)
    result = await renderToBuffer(() => mod.Scene(), mod.width, mod.height)
  } catch (err) {
    return {
      name,
      pass: false,
      diff: 100,
      message: `render failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const png = await rgbaToPng(result.pixels, result.width, result.height)

  if (UPDATE) {
    mkdirSync(REFS_DIR, { recursive: true })
    writeFileSync(refPath, png)
    return { name, pass: true, diff: 0, message: "reference updated" }
  }

  if (!existsSync(refPath)) {
    return {
      name,
      pass: false,
      diff: 100,
      message: `no reference PNG found. Run with --update to create it.`,
    }
  }

  let ref
  try {
    ref = await pngToRgba(refPath)
  } catch (err) {
    return {
      name,
      pass: false,
      diff: 100,
      message: `failed to load reference: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  if (ref.width !== result.width || ref.height !== result.height) {
    return {
      name,
      pass: false,
      diff: 100,
      message: `size mismatch: got ${result.width}x${result.height}, reference is ${ref.width}x${ref.height}`,
    }
  }

  const diff = diffPixels(result.pixels, ref.pixels)
  const pass = diff <= DIFF_THRESHOLD

  return {
    name,
    pass,
    diff,
    message: pass
      ? `diff=${diff.toFixed(2)}%`
      : `diff=${diff.toFixed(2)}% exceeds threshold of ${DIFF_THRESHOLD}%`,
  }
}

async function main() {
  if (!existsSync(SCENES_DIR)) {
    console.error(`scenes directory not found: ${SCENES_DIR}`)
    process.exit(1)
  }

  const scenes = readdirSync(SCENES_DIR)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(SCENES_DIR, f))

  if (scenes.length === 0) {
    console.error("no .tsx scene files found in", SCENES_DIR)
    process.exit(1)
  }

  console.log(`\n  Visual tests (${UPDATE ? "UPDATE" : "compare"} mode)\n`)

  let passed = 0
  let failed = 0

  for (const scenePath of scenes) {
    const { name, pass, diff, message } = await runScene(scenePath)
    const icon = pass ? "✓" : "✗"
    const label = pass ? "\x1b[32m" : "\x1b[31m"
    const reset = "\x1b[0m"
    const diffStr = pass ? `\x1b[2m${message}\x1b[0m` : `\x1b[31m${message}\x1b[0m`
    console.log(`  ${label}${icon}${reset}  ${name.padEnd(20)} ${diffStr}`)
    if (pass) passed++; else failed++
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`)

  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
