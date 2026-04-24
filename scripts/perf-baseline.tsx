/**
 * perf-baseline.ts — Performance regression baseline for Vexart.
 *
 * Renders a standard multi-element scene offscreen and measures frame times.
 * Reports: layout ms, paint ms, total ms.
 *
 * Usage:
 *   bun --conditions=browser run scripts/perf-baseline.ts          ← save baseline
 *   bun --conditions=browser run scripts/perf-baseline.ts --check  ← compare vs saved baseline
 *
 * Saves/reads: scripts/perf-baseline.json
 *
 * Exit code:
 *   0 — baseline saved, or check passed
 *   1 — check failed (regression detected)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { renderToBuffer } from "../packages/engine/src/testing/render-to-buffer"

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_FILE = join(__dirname, "perf-baseline.json")

// ── Scene definition ─────────────────────────────────────────────────────────

/**
 * Standard benchmark scene: dashboard-style layout with shadows, gradient,
 * rounded rects, and text — representative of a real-world app frame.
 */
function BenchScene() {
  return (
    <box
      width={800}
      height={600}
      backgroundColor={0x141414ff}
      direction="column"
      gap={16}
      padding={24}
    >
      {/* Header row */}
      <box direction="row" gap={12} width="100%" height={48}>
        <box
          width={48}
          height={48}
          backgroundColor={0x4eaed0ff}
          cornerRadius={24}
          shadow={{ x: 0, y: 4, blur: 12, color: 0x00000060 }}
        />
        <box
          height={48}
          width="grow"
          backgroundColor={0x262626ff}
          cornerRadius={8}
          padding={12}
        >
          <text color={0xfafafaff} fontSize={14}>Vexart Performance Benchmark</text>
        </box>
      </box>

      {/* Card grid */}
      <box direction="row" gap={12} width="100%">
        {[0x4eaed0ff, 0xa78bfaff, 0x34d399ff, 0xfbbf24ff].map((color) => (
          <box
            width="grow"
            height={80}
            backgroundColor={0x1e1e2eff}
            cornerRadius={12}
            padding={16}
            shadow={{ x: 0, y: 2, blur: 8, color: 0x00000040 }}
          >
            <box width={24} height={24} backgroundColor={color} cornerRadius={6} />
            <text color={0xa3a3a3ff} fontSize={11}>Metric</text>
          </box>
        ))}
      </box>

      {/* Content area with gradient + blur */}
      <box
        width="100%"
        height="grow"
        gradient={{ type: "linear", from: 0x1a1a2eff, to: 0x0a0a0fff, angle: 135 }}
        cornerRadius={16}
        padding={20}
        direction="column"
        gap={8}
      >
        {Array.from({ length: 8 }, (_, i) => (
          <box
            width="100%"
            height={32}
            backgroundColor={i % 2 === 0 ? 0xffffff08 : 0x00000000}
            cornerRadius={4}
            padding={8}
            direction="row"
            gap={8}
          >
            <text color={0x6b7280ff} fontSize={11}>{String(i + 1).padStart(2, "0")}</text>
            <box
              width={`${40 + i * 8}%` as any}
              height={16}
              backgroundColor={0x4eaed020}
              cornerRadius={3}
            />
            <text color={0xfafafaff} fontSize={11}>Item {i + 1}</text>
          </box>
        ))}
      </box>
    </box>
  )
}

// ── Measurement ──────────────────────────────────────────────────────────────

type FrameMeasurement = {
  totalMs: number
  frames: number
  avgFrameMs: number
}

type Baseline = {
  version: string
  date: string
  scene: string
  frameCount: number
  avgFrameMs: number
  totalMs: number
  thresholdMs: number
}

const WARMUP_FRAMES = 2
const MEASURE_FRAMES = 5
// Regression threshold: 30% over saved baseline triggers failure
const REGRESSION_THRESHOLD_PERCENT = 30

async function measureFrameTimes(): Promise<FrameMeasurement> {
  // Warmup — don't count
  await renderToBuffer(BenchScene, 800, 600, WARMUP_FRAMES)

  const start = performance.now()
  await renderToBuffer(BenchScene, 800, 600, MEASURE_FRAMES)
  const elapsed = performance.now() - start

  return {
    totalMs: elapsed,
    frames: MEASURE_FRAMES,
    avgFrameMs: elapsed / MEASURE_FRAMES,
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const CHECK_MODE = process.argv.includes("--check")

console.log(`\n🔬 Vexart perf ${CHECK_MODE ? "check" : "baseline"} — ${MEASURE_FRAMES} frames, 800×600\n`)
console.log("   Warming up...")

const result = await measureFrameTimes()

console.log(`\n   Results:`)
console.log(`     Total time  : ${result.totalMs.toFixed(2)} ms`)
console.log(`     Frames      : ${result.frames}`)
console.log(`     Avg / frame : ${result.avgFrameMs.toFixed(2)} ms\n`)

if (CHECK_MODE) {
  if (!existsSync(BASELINE_FILE)) {
    console.error("❌ No baseline file found. Run without --check first to save a baseline.")
    process.exit(1)
  }

  const saved = JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Baseline
  const threshold = saved.thresholdMs
  const diff = result.avgFrameMs - saved.avgFrameMs
  const diffPct = (diff / saved.avgFrameMs) * 100

  console.log(`   Saved baseline: ${saved.avgFrameMs.toFixed(2)} ms/frame (${saved.date})`)
  console.log(`   Current       : ${result.avgFrameMs.toFixed(2)} ms/frame`)
  console.log(`   Delta         : ${diff >= 0 ? "+" : ""}${diff.toFixed(2)} ms (${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}%)`)
  console.log(`   Threshold     : ±${REGRESSION_THRESHOLD_PERCENT}% (${threshold.toFixed(2)} ms)\n`)

  if (result.avgFrameMs > threshold) {
    console.error(`❌ REGRESSION: ${result.avgFrameMs.toFixed(2)} ms > ${threshold.toFixed(2)} ms threshold`)
    console.error(`   Run without --check to save a new baseline if this is intentional.`)
    process.exit(1)
  }

  console.log("✅ perf check passed — no regression detected")
} else {
  const thresholdMs = result.avgFrameMs * (1 + REGRESSION_THRESHOLD_PERCENT / 100)

  const baseline: Baseline = {
    version: "0.9.0-preview",
    date: new Date().toISOString(),
    scene: "dashboard-800x600",
    frameCount: result.frames,
    avgFrameMs: result.avgFrameMs,
    totalMs: result.totalMs,
    thresholdMs,
  }

  writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2) + "\n")

  console.log(`✅ Baseline saved to scripts/perf-baseline.json`)
  console.log(`   Regression threshold: ${thresholdMs.toFixed(2)} ms/frame (+${REGRESSION_THRESHOLD_PERCENT}%)`)
  console.log(`   Run with --check to compare future measurements.\n`)
}
