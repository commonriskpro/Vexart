/**
 * visual-correctness-gate.tsx — Golden image regression test.
 *
 * Renders the benchmark dashboard scene to an offscreen buffer and compares
 * the pixel output against a saved golden snapshot. If no snapshot exists,
 * saves the current output as the golden reference.
 *
 * Usage:
 *   bun --conditions=browser run scripts/visual-correctness-gate.tsx          ← save golden
 *   bun --conditions=browser run scripts/visual-correctness-gate.tsx --check  ← compare vs golden
 *
 * The golden files are raw RGBA bytes + a JSON metadata sidecar.
 * They live in scripts/golden/ and SHOULD be committed to track regressions.
 *
 * Exit code:
 *   0 — golden saved, or check passed
 *   1 — check failed (pixel mismatch detected)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { renderToBuffer } from "../packages/engine/src/testing/render-to-buffer"

const __dirname = dirname(fileURLToPath(import.meta.url))
const GOLDEN_DIR = join(__dirname, "golden")
const CHECK_MODE = process.argv.includes("--check")

// ── Scenes to test ──

interface GoldenScene {
  name: string
  width: number
  height: number
  component: () => unknown
}

function DashboardGolden() {
  return (
    <box width={800} height={600} backgroundColor={0x141414ff} direction="column" gap={16} padding={24}>
      <box direction="row" gap={12} width="100%" height={48}>
        <box width={48} height={48} backgroundColor={0x4eaed0ff} cornerRadius={24} shadow={{ x: 0, y: 4, blur: 12, color: 0x00000060 }} />
        <box height={48} width="grow" backgroundColor={0x262626ff} cornerRadius={8} padding={12}>
          <text color={0xfafafaff} fontSize={14}>Vexart Golden Test</text>
        </box>
      </box>
      <box direction="row" gap={12} width="100%">
        {[0x4eaed0ff, 0xa78bfaff, 0x34d399ff, 0xfbbf24ff].map((color) => (
          <box width="grow" height={80} backgroundColor={0x1e1e2eff} cornerRadius={12} padding={16} shadow={{ x: 0, y: 2, blur: 8, color: 0x00000040 }}>
            <box width={24} height={24} backgroundColor={color} cornerRadius={6} />
            <text color={0xa3a3a3ff} fontSize={11}>Metric</text>
          </box>
        ))}
      </box>
      <box width="100%" height="grow" gradient={{ type: "linear", from: 0x1a1a2eff, to: 0x0a0a0fff, angle: 135 }} cornerRadius={16} padding={20} direction="column" gap={8}>
        {Array.from({ length: 6 }, (_, i) => (
          <box width="100%" height={32} backgroundColor={i % 2 === 0 ? 0xffffff08 : 0x00000000} cornerRadius={4} padding={8} direction="row" gap={8}>
            <text color={0x6b7280ff} fontSize={11}>{String(i + 1).padStart(2, "0")}</text>
            <box width={`${40 + i * 8}%` as any} height={16} backgroundColor={0x4eaed020} cornerRadius={3} />
            <text color={0xfafafaff} fontSize={11}>Item {i + 1}</text>
          </box>
        ))}
      </box>
    </box>
  )
}

const SCENES: GoldenScene[] = [
  { name: "dashboard-800x600", width: 800, height: 600, component: DashboardGolden },
]

// ── Comparison ──

interface GoldenMeta {
  name: string
  width: number
  height: number
  byteLength: number
  date: string
}

/**
 * Compare two RGBA buffers. Returns the number of pixels that differ
 * beyond the tolerance threshold.
 */
function comparePixels(a: Uint8Array, b: Uint8Array, tolerance = 2): { diffCount: number; totalPixels: number; maxChannelDiff: number } {
  const totalPixels = Math.min(a.length, b.length) / 4
  let diffCount = 0
  let maxChannelDiff = 0
  const len = Math.min(a.length, b.length)

  for (let i = 0; i < len; i += 4) {
    const dr = Math.abs(a[i] - b[i])
    const dg = Math.abs(a[i + 1] - b[i + 1])
    const db = Math.abs(a[i + 2] - b[i + 2])
    const da = Math.abs(a[i + 3] - b[i + 3])
    const maxDiff = Math.max(dr, dg, db, da)
    if (maxDiff > maxChannelDiff) maxChannelDiff = maxDiff
    if (maxDiff > tolerance) diffCount++
  }

  return { diffCount, totalPixels, maxChannelDiff }
}

// ── Main ──

if (!existsSync(GOLDEN_DIR)) mkdirSync(GOLDEN_DIR, { recursive: true })

console.log(`\n🖼️  Vexart visual correctness ${CHECK_MODE ? "check" : "capture"}\n`)

let failed = false

for (const scene of SCENES) {
  const pixelPath = join(GOLDEN_DIR, `${scene.name}.rgba`)
  const metaPath = join(GOLDEN_DIR, `${scene.name}.json`)

  console.log(`   ${scene.name} (${scene.width}×${scene.height})...`)
  const result = await renderToBuffer(scene.component, scene.width, scene.height, 3)

  if (CHECK_MODE) {
    if (!existsSync(pixelPath) || !existsSync(metaPath)) {
      console.error(`   ❌ No golden snapshot found. Run without --check first.`)
      failed = true
      continue
    }

    const goldenMeta = JSON.parse(readFileSync(metaPath, "utf8")) as GoldenMeta
    const goldenPixels = new Uint8Array(readFileSync(pixelPath))

    if (goldenMeta.width !== result.width || goldenMeta.height !== result.height) {
      console.error(`   ❌ Size mismatch: golden=${goldenMeta.width}×${goldenMeta.height} current=${result.width}×${result.height}`)
      failed = true
      continue
    }

    const { diffCount, totalPixels, maxChannelDiff } = comparePixels(goldenPixels, result.pixels)
    const diffPct = (diffCount / totalPixels) * 100

    if (diffCount === 0) {
      console.log(`   ✅ Pixel-perfect match (${totalPixels} pixels)`)
    } else if (diffPct < 0.1) {
      // Allow tiny floating-point dithering (< 0.1% of pixels, max 2 channel diff)
      console.log(`   ✅ Near-match: ${diffCount}/${totalPixels} pixels differ (${diffPct.toFixed(3)}%, max channel diff=${maxChannelDiff})`)
    } else {
      console.error(`   ❌ MISMATCH: ${diffCount}/${totalPixels} pixels differ (${diffPct.toFixed(2)}%, max channel diff=${maxChannelDiff})`)
      failed = true
    }
  } else {
    const meta: GoldenMeta = {
      name: scene.name,
      width: result.width,
      height: result.height,
      byteLength: result.pixels.byteLength,
      date: new Date().toISOString(),
    }
    writeFileSync(pixelPath, result.pixels)
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n")
    console.log(`   ✅ Saved golden: ${result.width}×${result.height} (${(result.pixels.byteLength / 1024).toFixed(0)} KB)`)
  }
}

console.log()
if (CHECK_MODE) {
  if (failed) {
    console.error("❌ Visual correctness check FAILED")
    process.exit(1)
  }
  console.log("✅ Visual correctness check passed")
} else {
  console.log("✅ Golden snapshots saved to scripts/golden/")
  console.log("   Run with --check to compare future renders.\n")
}
