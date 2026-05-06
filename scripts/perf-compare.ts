/**
 * perf-compare.ts — Compare two frame-breakdown reports side by side.
 *
 * Usage:
 *   bun run scripts/perf-compare.ts --before scripts/frame-breakdown-pre-optimization.json --after scripts/frame-breakdown-report.json
 *   bun run scripts/perf-compare.ts --before scripts/frame-breakdown-pre-optimization.json --after scripts/frame-breakdown-report.json --fail-on-regression
 *
 * Compares p50, p95, and avg for key pipeline stages across all shared scenarios.
 * With --fail-on-regression, exits 1 if any stage p95 regressed by more than 15%.
 */

import { existsSync, readFileSync } from "node:fs"

const REGRESSION_THRESHOLD = 0.15 // 15% regression triggers failure

interface PercentileSummary {
  min: number
  p50: number
  p95: number
  p99: number
  max: number
  avg: number
}

interface StageSummary {
  [key: string]: PercentileSummary
}

interface ScenarioReport {
  name: string
  width: number
  height: number
  framesMeasured: number
  summary: StageSummary
}

interface BenchmarkReport {
  generatedAt: string
  scenarios: ScenarioReport[]
}

// Stages that matter for our hotpath audit, ordered by pipeline position
const KEY_STAGES = [
  "totalMs",
  "walkTreeMs",
  "layoutComputeMs",
  "layoutWritebackMs",
  "layoutMs",
  "interactionMs",
  "relayoutMs",
  "paintRenderGraphMs",
  "paintBackendPaintMs",
  "paintBackendCompositeMs",
  "paintBackendReadbackMs",
  "paintMs",
  "ffiCallCount",
]

function parseCli() {
  const args = process.argv.slice(2)
  let before = ""
  let after = ""
  let failOnRegression = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--before") before = args[++i] ?? ""
    else if (arg.startsWith("--before=")) before = arg.slice("--before=".length)
    else if (arg === "--after") after = args[++i] ?? ""
    else if (arg.startsWith("--after=")) after = arg.slice("--after=".length)
    else if (arg === "--fail-on-regression") failOnRegression = true
  }
  return { before, after, failOnRegression }
}

function loadReport(path: string): BenchmarkReport {
  if (!existsSync(path)) throw new Error(`Report not found: ${path}`)
  return JSON.parse(readFileSync(path, "utf8"))
}

function delta(before: number, after: number): string {
  if (before === 0 && after === 0) return "  ─"
  if (before === 0) return ` +${after.toFixed(2)}`
  const diff = after - before
  const pct = (diff / before) * 100
  const sign = diff >= 0 ? "+" : ""
  const arrow = pct > 15 ? " ⚠️" : pct < -10 ? " ✨" : ""
  return `${sign}${diff.toFixed(2)} (${sign}${pct.toFixed(0)}%)${arrow}`
}

function fmtMs(v: number) {
  return v.toFixed(2).padStart(7)
}

const options = parseCli()
if (!options.before || !options.after) {
  console.error("Usage: bun run scripts/perf-compare.ts --before <report.json> --after <report.json> [--fail-on-regression]")
  process.exit(1)
}

const before = loadReport(options.before)
const after = loadReport(options.after)

console.log(`\n📊 Vexart Performance Comparison`)
console.log(`   Before: ${options.before} (${before.generatedAt})`)
console.log(`   After:  ${options.after} (${after.generatedAt})\n`)

let regressionDetected = false

for (const afterScenario of after.scenarios) {
  const beforeScenario = before.scenarios.find((s) => s.name === afterScenario.name)
  if (!beforeScenario) {
    console.log(`  ℹ️ ${afterScenario.name} — NEW scenario (no before data)\n`)
    continue
  }

  console.log(`  ── ${afterScenario.name} (${afterScenario.width}×${afterScenario.height}) ──`)
  console.log(`  ${"Stage".padEnd(28)} ${"Before p95".padStart(10)} ${"After p95".padStart(10)} ${"Delta".padStart(20)}`)
  console.log(`  ${"─".repeat(70)}`)

  for (const stage of KEY_STAGES) {
    const bSummary = beforeScenario.summary[stage] as PercentileSummary | undefined
    const aSummary = afterScenario.summary[stage] as PercentileSummary | undefined
    if (!bSummary && !aSummary) continue

    const bp95 = bSummary?.p95 ?? 0
    const ap95 = aSummary?.p95 ?? 0

    // Skip if both are effectively zero
    if (bp95 < 0.01 && ap95 < 0.01) continue

    const d = delta(bp95, ap95)
    const unit = stage === "ffiCallCount" ? "" : "ms"
    console.log(`  ${stage.padEnd(28)} ${fmtMs(bp95)}${unit} ${fmtMs(ap95)}${unit} ${d}`)

    // Check regression
    if (bp95 > 0.1 && ap95 > bp95 * (1 + REGRESSION_THRESHOLD)) {
      regressionDetected = true
    }
  }
  console.log()
}

if (options.failOnRegression && regressionDetected) {
  console.error(`❌ Performance regression detected (>${(REGRESSION_THRESHOLD * 100).toFixed(0)}% p95 increase in at least one stage)`)
  process.exit(1)
}

if (regressionDetected) {
  console.log(`⚠️  Some stages show regression (>${(REGRESSION_THRESHOLD * 100).toFixed(0)}% p95 increase)`)
} else {
  console.log(`✅ No regressions detected`)
}
