import { existsSync, readFileSync } from "node:fs"
import {
  DEFAULT_FRAME_BREAKDOWN_REPORT_PATH,
  FRAME_BREAKDOWN_REPORT_VERSION,
  FULL_FRAME_PRESENTATION_PATH,
  MEASUREMENT_SCOPE,
  SCENARIO,
  TRANSPORT_OBSERVATION,
  type ScenarioName,
  type TransmissionMode,
} from "./frame-breakdown-contract"

export type Transport = TransmissionMode
export type Scenario = ScenarioName

const TRANSPORTS: readonly Transport[] = ["direct", "file", "shm"]
const REQUIRED_SCENARIOS: readonly Scenario[] = [
  SCENARIO.DASHBOARD_1080P,
  SCENARIO.DIRTY_REGION,
  SCENARIO.COMPOSITOR_ONLY,
  SCENARIO.NOOP_RETAINED,
]

export const PRD_THRESHOLDS = {
  [SCENARIO.DASHBOARD_1080P]: { percentile: "p95", maxMs: 10 },
  [SCENARIO.DIRTY_REGION]: { percentile: "p95", maxMs: 5 },
  [SCENARIO.COMPOSITOR_ONLY]: { percentile: "p95", maxMs: 8.33 },
  [SCENARIO.NOOP_RETAINED]: { percentile: "p99", maxMs: 1 },
} as const satisfies Record<Scenario, { percentile: "p95" | "p99"; maxMs: number }>

type Percentile = "p50" | "p95" | "p99" | "avg" | "min" | "max"

interface PercentileSummary {
  [key: string]: unknown
}

interface ScenarioReport {
  name: Scenario
  width: number
  height: number
  framesRequested: number
  framesMeasured: number
  summary: Record<string, unknown>
  compositorTransformValues?: unknown
  compositorTransformChanged?: unknown
}

interface BenchmarkReport {
  version: number
  transport: Transport
  frames: number
  warmup: number
  nativePresentation: boolean
  measurementScope: string
  visibleTerminalLatencyMeasured: boolean
  presentationPath: string
  transportObservation: string
  scenarios: ScenarioReport[]
}

export interface ReportValidation {
  report: BenchmarkReport | null
  errors: string[]
}

export interface ScenarioGateResult {
  scenario: Scenario
  percentile: "p95" | "p99"
  valueMs: number
  maxMs: number
  passed: boolean
}

export interface SupplementalStageResult {
  scenario: Scenario
  stage: string
  p95Ms: number
  maxMs: number
  passed: boolean
}

export interface GateResult {
  passed: boolean
  transport: Transport | null
  compatibilityOnly: boolean
  errors: string[]
  checks: ScenarioGateResult[]
  supplemental: SupplementalStageResult[]
}

interface SupplementalStageGate {
  scenario: Scenario
  stage: string
  maxMs: number
}

// Historical stage budgets remain useful diagnostics, but are deliberately not
// release gates. PRD 7.3 total-frame budgets are the only pass/fail thresholds.
const SUPPLEMENTAL_STAGE_GATES: Partial<Record<Transport, readonly SupplementalStageGate[]>> = {
  shm: [
    { scenario: SCENARIO.DASHBOARD_1080P, stage: "layoutMs", maxMs: 2 },
    { scenario: SCENARIO.DASHBOARD_1080P, stage: "walkTreeMs", maxMs: 1 },
    { scenario: SCENARIO.DASHBOARD_1080P, stage: "layoutComputeMs", maxMs: 1 },
    { scenario: SCENARIO.DASHBOARD_1080P, stage: "relayoutMs", maxMs: 1.5 },
    { scenario: SCENARIO.DASHBOARD_1080P, stage: "paintRenderGraphMs", maxMs: 1 },
    { scenario: SCENARIO.DASHBOARD_1080P, stage: "paintBackendPaintMs", maxMs: 4 },
    { scenario: SCENARIO.DIRTY_REGION, stage: "layoutMs", maxMs: 1.5 },
    { scenario: SCENARIO.DIRTY_REGION, stage: "relayoutMs", maxMs: 1 },
    { scenario: SCENARIO.DIRTY_REGION, stage: "interactionMs", maxMs: 0.5 },
  ],
  file: [
    { scenario: SCENARIO.DASHBOARD_1080P, stage: "layoutMs", maxMs: 2 },
    { scenario: SCENARIO.DASHBOARD_1080P, stage: "walkTreeMs", maxMs: 1 },
    { scenario: SCENARIO.DASHBOARD_1080P, stage: "layoutComputeMs", maxMs: 1 },
    { scenario: SCENARIO.DASHBOARD_1080P, stage: "relayoutMs", maxMs: 1.5 },
    { scenario: SCENARIO.DASHBOARD_1080P, stage: "paintRenderGraphMs", maxMs: 1 },
    { scenario: SCENARIO.DASHBOARD_1080P, stage: "paintBackendPaintMs", maxMs: 4 },
    { scenario: SCENARIO.DIRTY_REGION, stage: "layoutMs", maxMs: 1.5 },
    { scenario: SCENARIO.DIRTY_REGION, stage: "relayoutMs", maxMs: 1 },
    { scenario: SCENARIO.DIRTY_REGION, stage: "interactionMs", maxMs: 0.5 },
  ],
}

export interface CliOptions {
  report: string
  transport: string | null
}

export function parseCli(args = process.argv.slice(2)): CliOptions {
  let report = DEFAULT_FRAME_BREAKDOWN_REPORT_PATH
  let transport: string | null = null

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--report") report = args[++i] ?? ""
    else if (arg.startsWith("--report=")) report = arg.slice("--report=".length)
    else if (arg === "--transport") transport = args[++i] ?? ""
    else if (arg.startsWith("--transport=")) transport = arg.slice("--transport=".length)
  }

  return { report, transport }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function isTransport(value: unknown): value is Transport {
  return typeof value === "string" && TRANSPORTS.includes(value as Transport)
}

function hasRequiredTransformChange(values: number[]): boolean {
  return values.length >= 2 && values.some((value, index) => index > 0 && value !== values[index - 1])
}

function validateScenario(value: unknown, index: number, errors: string[]): ScenarioReport | null {
  if (!isRecord(value)) {
    errors.push(`scenarios[${index}] must be an object`)
    return null
  }

  const name = value.name
  if (typeof name !== "string") {
    errors.push(`scenarios[${index}].name is missing or invalid`)
    return null
  }

  return value as unknown as ScenarioReport
}

function validatePercentile(summary: PercentileSummary, scenario: Scenario, percentile: Percentile, errors: string[]) {
  const value = summary[percentile]
  if (!isFiniteNonnegative(value)) errors.push(`${scenario}.summary.totalMs.${percentile} must be finite and nonnegative`)
}

export function validateReport(value: unknown, requestedTransport: string | null = null): ReportValidation {
  const errors: string[] = []
  if (!isRecord(value)) return { report: null, errors: ["report must be a JSON object"] }

  if (value.version !== FRAME_BREAKDOWN_REPORT_VERSION) {
    errors.push(`report.version must be ${FRAME_BREAKDOWN_REPORT_VERSION}`)
  }
  if (!isPositiveInteger(value.frames)) errors.push("report.frames must be a positive integer")
  if (!isNonnegativeInteger(value.warmup)) errors.push("report.warmup must be a nonnegative integer")
  if (!isTransport(value.transport)) errors.push("report.transport is missing or invalid")
  if (requestedTransport !== null && !isTransport(requestedTransport)) {
    errors.push(`--transport is invalid: ${requestedTransport || "<missing value>"}`)
  }
  if (isTransport(value.transport) && isTransport(requestedTransport) && value.transport !== requestedTransport) {
    errors.push(`transport mismatch: report=${value.transport}, requested=${requestedTransport}`)
  }
  if (value.nativePresentation !== true && value.nativePresentation !== false) {
    errors.push("report.nativePresentation must be a boolean")
  }
  if (value.measurementScope !== MEASUREMENT_SCOPE) errors.push(`report.measurementScope must be ${MEASUREMENT_SCOPE}`)
  if (value.visibleTerminalLatencyMeasured !== false) errors.push("report.visibleTerminalLatencyMeasured must be false")
  if (value.presentationPath !== FULL_FRAME_PRESENTATION_PATH) errors.push(`report.presentationPath must be ${FULL_FRAME_PRESENTATION_PATH}`)
  if (value.transportObservation !== TRANSPORT_OBSERVATION) errors.push(`report.transportObservation must be ${TRANSPORT_OBSERVATION}`)

  const scenariosValue = value.scenarios
  if (!Array.isArray(scenariosValue)) return { report: null, errors: [...errors, "report.scenarios must be an array"] }

  const scenarios: ScenarioReport[] = []
  const names = new Set<string>()
  scenariosValue.forEach((item, index) => {
    const scenario = validateScenario(item, index, errors)
    if (!scenario) return
    if (names.has(scenario.name)) errors.push(`duplicate scenario: ${scenario.name}`)
    names.add(scenario.name)
    scenarios.push(scenario)
  })

  REQUIRED_SCENARIOS.forEach((name) => {
    const matches = scenarios.filter((scenario) => scenario.name === name)
    if (matches.length === 0) {
      errors.push(`missing scenario: ${name}`)
      return
    }

    // Duplicate names have already been diagnosed. Validate the first entry so
    // one malformed duplicate cannot hide a valid scenario or vice versa.
    const scenario = matches[0]
    if (scenario.width !== 1920 || scenario.height !== 1080) {
      errors.push(`${name} dimensions must be 1920×1080 (got ${String(scenario.width)}×${String(scenario.height)})`)
    }
    if (!isPositiveInteger(scenario.framesRequested)) errors.push(`${name}.framesRequested must be a positive integer`)
    if (!isPositiveInteger(scenario.framesMeasured)) errors.push(`${name}.framesMeasured must be a positive integer`)
    if (isPositiveInteger(scenario.framesRequested) && isPositiveInteger(scenario.framesMeasured)) {
      if (scenario.framesMeasured !== scenario.framesRequested) {
        errors.push(`${name} sample count mismatch: requested=${scenario.framesRequested}, measured=${scenario.framesMeasured}`)
      }
      if (isPositiveInteger(value.frames) && scenario.framesRequested !== value.frames) {
        errors.push(`${name}.framesRequested must match report.frames (${value.frames})`)
      }
    }

    const summary = isRecord(scenario.summary) ? scenario.summary : null
    const total = summary && isRecord(summary.totalMs) ? summary.totalMs as PercentileSummary : null
    if (!summary) {
      errors.push(`${name}.summary is missing or invalid`)
    } else if (!total) {
      errors.push(`${name}.summary.totalMs is missing or invalid`)
    } else {
      validatePercentile(total, name, "p95", errors)
      validatePercentile(total, name, "p99", errors)
    }

    if (name === SCENARIO.COMPOSITOR_ONLY) {
      const values = scenario.compositorTransformValues
      if (!Array.isArray(values)) {
        errors.push(`${name}.compositorTransformValues is missing or invalid`)
      } else {
        if (isPositiveInteger(scenario.framesMeasured) && values.length !== scenario.framesMeasured) {
          errors.push(`${name}.compositorTransformValues length must match framesMeasured`)
        }
        const numericValues = values.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
        if (numericValues.length !== values.length) errors.push(`${name}.compositorTransformValues must contain finite numbers`)
        if (!hasRequiredTransformChange(numericValues)) errors.push(`${name}.compositorTransformValues must change between measured frames`)
      }
      if (scenario.compositorTransformChanged !== true) errors.push(`${name}.compositorTransformChanged must be true`)
    }
  })

  const report: BenchmarkReport = {
    version: value.version as number,
    transport: value.transport as Transport,
    frames: value.frames as number,
    warmup: value.warmup as number,
    nativePresentation: value.nativePresentation as boolean,
    measurementScope: value.measurementScope as string,
    visibleTerminalLatencyMeasured: value.visibleTerminalLatencyMeasured as boolean,
    presentationPath: value.presentationPath as string,
    transportObservation: value.transportObservation as string,
    scenarios,
  }
  return { report, errors }
}

function scenarioByName(report: BenchmarkReport, name: Scenario): ScenarioReport | null {
  return report.scenarios.find((scenario) => scenario.name === name) ?? null
}

function supplementalResults(report: BenchmarkReport): SupplementalStageResult[] {
  const stageGates = SUPPLEMENTAL_STAGE_GATES[report.transport] ?? []
  return stageGates.flatMap((stageGate) => {
    const scenario = scenarioByName(report, stageGate.scenario)
    if (!scenario || !isRecord(scenario.summary)) return []
    const summary = scenario.summary[stageGate.stage]
    if (!isRecord(summary) || !isFiniteNonnegative(summary.p95)) return []
    return [{
      scenario: stageGate.scenario,
      stage: stageGate.stage,
      p95Ms: summary.p95,
      maxMs: stageGate.maxMs,
      passed: summary.p95 < stageGate.maxMs,
    }]
  })
}

export function evaluateReport(value: unknown, requestedTransport: string | null = null): GateResult {
  const validation = validateReport(value, requestedTransport)
  if (!validation.report || validation.errors.length > 0) {
    return {
      passed: false,
      transport: isTransport(validation.report?.transport) ? validation.report.transport : null,
      compatibilityOnly: false,
      errors: validation.errors,
      checks: [],
      supplemental: [],
    }
  }

  const report = validation.report
  const compatibilityOnly = report.transport === "direct"
  const supplemental = supplementalResults(report)
  if (compatibilityOnly) return { passed: true, transport: report.transport, compatibilityOnly, errors: [], checks: [], supplemental }

  const checks = REQUIRED_SCENARIOS.map((scenario) => {
    const gate = PRD_THRESHOLDS[scenario]
    const reportScenario = scenarioByName(report, scenario)!
    const total = reportScenario.summary.totalMs as Record<string, unknown>
    const valueMs = total[gate.percentile] as number
    return {
      scenario,
      percentile: gate.percentile,
      valueMs,
      maxMs: gate.maxMs,
      passed: valueMs < gate.maxMs,
    }
  })
  const errors = checks.filter((check) => !check.passed).map((check) => (
    `${check.scenario}.summary.totalMs.${check.percentile}=${check.valueMs.toFixed(2)}ms must be < ${check.maxMs.toFixed(2)}ms (PRD 7.3)`
  ))
  return { passed: errors.length === 0, transport: report.transport, compatibilityOnly, errors, checks, supplemental }
}

export function loadReport(path: string): unknown {
  if (!existsSync(path)) throw new Error(`Frame breakdown report not found: ${path}`)
  return JSON.parse(readFileSync(path, "utf8")) as unknown
}

export function runCli(args = process.argv.slice(2)): number {
  const options = parseCli(args)
  let report: unknown
  try {
    report = loadReport(options.report)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }

  const result = evaluateReport(report, options.transport)
  const transportLabel = result.transport ?? options.transport ?? "invalid"
  console.log(`\n🚦 Vexart frame breakdown gate — transport=${transportLabel}`)
  result.errors.forEach((error) => console.error(`❌ ${error}`))
  result.checks.forEach((check) => {
    const status = check.passed ? "✅" : "❌"
    console.log(`  ${status} ${check.scenario.padEnd(18)} ${check.percentile}=${check.valueMs.toFixed(2)}ms threshold<${check.maxMs.toFixed(2)}ms (PRD 7.3)`)
  })
  result.supplemental.forEach((stage) => {
    const status = stage.passed ? "✅" : "⚠️"
    console.log(`  ${status} supplemental ${stage.scenario.padEnd(18)} ${stage.stage.padEnd(24)} p95=${stage.p95Ms.toFixed(2)}ms threshold=${stage.maxMs.toFixed(2)}ms (diagnostic; not PRD gate)`)
  })

  if (!result.passed) {
    console.error("\n❌ frame breakdown gate failed")
    return 1
  }
  if (result.compatibilityOnly) {
    console.log("\n✅ direct transport is compatibility-only; no PRD performance threshold applied")
  } else {
    console.log("\n✅ frame breakdown gate passed")
  }
  return 0
}

if (import.meta.main) process.exitCode = runCli()
