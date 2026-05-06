import { existsSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const TRANSPORT = {
  DIRECT: "direct",
  FILE: "file",
  SHM: "shm",
} as const

const SCENARIO = {
  DASHBOARD_1080P: "dashboard-1080p",
  DIRTY_REGION: "dirty-region",
  COMPOSITOR_ONLY: "compositor-only",
  NOOP_RETAINED: "noop-retained",
} as const

type Transport = (typeof TRANSPORT)[keyof typeof TRANSPORT]
type Scenario = (typeof SCENARIO)[keyof typeof SCENARIO]

interface PercentileSummary {
  p50: number
  p95: number
  p99: number
  avg: number
}

interface StageSummary {
  totalMs: PercentileSummary
  walkTreeMs: PercentileSummary
  layoutComputeMs: PercentileSummary
  layoutWritebackMs: PercentileSummary
  interactionMs: PercentileSummary
  relayoutMs: PercentileSummary
  layoutMs: PercentileSummary
  paintRenderGraphMs: PercentileSummary
  paintBackendPaintMs: PercentileSummary
  paintMs: PercentileSummary
  ffiCallCount: PercentileSummary
}

interface ScenarioReport {
  name: string
  summary: StageSummary
}

interface BenchmarkReport {
  transport?: Transport
  scenarios: ScenarioReport[]
}

type StageKey = keyof StageSummary

interface StageGate {
  stage: StageKey
  p95MaxMs: number
}

interface ScenarioGate {
  scenario: Scenario
  totalP95MaxMs: number
  /** Per-stage p95 gates — if ANY stage exceeds its threshold, the gate fails. */
  stages?: StageGate[]
}

interface TransportGate {
  transport: Transport
  gates: ScenarioGate[]
}

const DEFAULT_REPORT = join(dirname(fileURLToPath(import.meta.url)), "frame-breakdown-report.json")

const GATES: TransportGate[] = [
  {
    transport: TRANSPORT.SHM,
    gates: [
      {
        scenario: SCENARIO.DASHBOARD_1080P,
        totalP95MaxMs: 9.0,
        stages: [
          { stage: "layoutMs", p95MaxMs: 2.0 },
          { stage: "walkTreeMs", p95MaxMs: 1.0 },
          { stage: "layoutComputeMs", p95MaxMs: 1.0 },
          { stage: "relayoutMs", p95MaxMs: 1.5 },
          { stage: "paintRenderGraphMs", p95MaxMs: 1.0 },
          { stage: "paintBackendPaintMs", p95MaxMs: 4.0 },
        ],
      },
      {
        scenario: SCENARIO.DIRTY_REGION,
        totalP95MaxMs: 5.0,
        stages: [
          { stage: "layoutMs", p95MaxMs: 1.5 },
          { stage: "relayoutMs", p95MaxMs: 1.0 },
          { stage: "interactionMs", p95MaxMs: 0.5 },
        ],
      },
      { scenario: SCENARIO.COMPOSITOR_ONLY, totalP95MaxMs: 4.0 },
      { scenario: SCENARIO.NOOP_RETAINED, totalP95MaxMs: 1.0 },
    ],
  },
  {
    transport: TRANSPORT.FILE,
    gates: [
      {
        scenario: SCENARIO.DASHBOARD_1080P,
        totalP95MaxMs: 10.0,
        stages: [
          { stage: "layoutMs", p95MaxMs: 2.0 },
          { stage: "walkTreeMs", p95MaxMs: 1.0 },
          { stage: "layoutComputeMs", p95MaxMs: 1.0 },
          { stage: "relayoutMs", p95MaxMs: 1.5 },
          { stage: "paintRenderGraphMs", p95MaxMs: 1.0 },
          { stage: "paintBackendPaintMs", p95MaxMs: 4.0 },
        ],
      },
      {
        scenario: SCENARIO.DIRTY_REGION,
        totalP95MaxMs: 5.5,
        stages: [
          { stage: "layoutMs", p95MaxMs: 1.5 },
          { stage: "relayoutMs", p95MaxMs: 1.0 },
          { stage: "interactionMs", p95MaxMs: 0.5 },
        ],
      },
      { scenario: SCENARIO.COMPOSITOR_ONLY, totalP95MaxMs: 4.0 },
      { scenario: SCENARIO.NOOP_RETAINED, totalP95MaxMs: 1.0 },
    ],
  },
]

function parseCli() {
  const args = process.argv.slice(2)
  let report = DEFAULT_REPORT
  let transport: Transport | null = null
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--report") report = args[++i] ?? report
    else if (arg.startsWith("--report=")) report = arg.slice("--report=".length)
    else if (arg === "--transport") transport = parseTransport(args[++i]) ?? transport
    else if (arg.startsWith("--transport=")) transport = parseTransport(arg.slice("--transport=".length)) ?? transport
  }
  return { report, transport }
}

function parseTransport(value: string | undefined): Transport | null {
  if (value === TRANSPORT.SHM || value === TRANSPORT.FILE || value === TRANSPORT.DIRECT) return value
  return null
}

function isBenchmarkReport(value: unknown): value is BenchmarkReport {
  if (typeof value !== "object" || value === null) return false
  if (!("scenarios" in value)) return false
  return Array.isArray(value.scenarios)
}

function loadReport(path: string): BenchmarkReport {
  if (!existsSync(path)) throw new Error(`Frame breakdown report not found: ${path}`)
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
  if (!isBenchmarkReport(parsed)) throw new Error(`Invalid frame breakdown report: ${path}`)
  return parsed
}

function getGate(transport: Transport) {
  return GATES.find((gate) => gate.transport === transport) ?? null
}

function scenarioByName(report: BenchmarkReport, scenario: Scenario) {
  return report.scenarios.find((item) => item.name === scenario) ?? null
}

const options = parseCli()
const report = loadReport(options.report)
const transport = options.transport ?? report.transport ?? TRANSPORT.SHM
const gate = getGate(transport)

if (!gate) {
  console.log(`ℹ️ no p95 performance gate for transport=${transport}; direct is compatibility-only`)
  process.exit(0)
}

let failed = false
console.log(`\n🚦 Vexart frame breakdown gate — transport=${transport}`)

for (const item of gate.gates) {
  const scenario = scenarioByName(report, item.scenario)
  if (!scenario) {
    console.error(`❌ missing scenario: ${item.scenario}`)
    failed = true
    continue
  }
  const p95 = scenario.summary.totalMs.p95
  const ok = p95 <= item.totalP95MaxMs
  const status = ok ? "✅" : "❌"
  console.log(`  ${status} ${item.scenario.padEnd(18)} p95=${p95.toFixed(2)}ms threshold=${item.totalP95MaxMs.toFixed(2)}ms`)
  if (!ok) failed = true

  // Per-stage gates
  if (item.stages) {
    for (const stageGate of item.stages) {
      const stageSummary = (scenario.summary as Record<string, PercentileSummary>)[stageGate.stage]
      if (!stageSummary) continue
      const stageP95 = stageSummary.p95
      const stageOk = stageP95 <= stageGate.p95MaxMs
      if (!stageOk) {
        console.log(`     ❌ ${stageGate.stage.padEnd(24)} p95=${stageP95.toFixed(2)}ms threshold=${stageGate.p95MaxMs.toFixed(2)}ms`)
        failed = true
      }
    }
  }
}

if (failed) {
  console.error("\n❌ frame breakdown gate failed")
  process.exit(1)
}

console.log("\n✅ frame breakdown gate passed")
