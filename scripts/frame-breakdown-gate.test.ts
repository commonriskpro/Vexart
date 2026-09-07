import { describe, expect, test } from "bun:test"
import {
  evaluateReport,
  parseCli,
  PRD_THRESHOLDS,
  validateReport,
} from "./frame-breakdown-gate"
import {
  FRAME_BREAKDOWN_REPORT_VERSION,
  FULL_FRAME_PRESENTATION_PATH,
  MEASUREMENT_SCOPE,
  SCENARIO,
  TRANSPORT_OBSERVATION,
} from "./frame-breakdown-contract"

type Report = Record<string, unknown> & {
  scenarios: Array<Record<string, unknown>>
}

const required = [
  SCENARIO.DASHBOARD_1080P,
  SCENARIO.DIRTY_REGION,
  SCENARIO.COMPOSITOR_ONLY,
  SCENARIO.NOOP_RETAINED,
] as const

function scenario(name: string, p95: number, p99 = p95): Record<string, unknown> {
  return {
    name,
    width: 1920,
    height: 1080,
    framesRequested: 3,
    framesMeasured: 3,
    summary: {
      totalMs: { p50: p95, p95, p99, avg: p95 },
      layoutMs: { p95: 0.1 },
    },
    ...(name === SCENARIO.COMPOSITOR_ONLY
      ? { compositorTransformValues: [-8, 8, -8], compositorTransformChanged: true }
      : {}),
  }
}

function report(): Report {
  return {
    version: FRAME_BREAKDOWN_REPORT_VERSION,
    generatedAt: "2026-09-07T00:00:00.000Z",
    runtime: "bun test",
    platform: "darwin",
    arch: "arm64",
    frames: 3,
    warmup: 1,
    transport: "shm",
    nativePresentation: true,
    measurementScope: MEASUREMENT_SCOPE,
    visibleTerminalLatencyMeasured: false,
    presentationPath: FULL_FRAME_PRESENTATION_PATH,
    transportObservation: TRANSPORT_OBSERVATION,
    deprecatedMetrics: [],
    scenarios: [
      scenario(SCENARIO.DASHBOARD_1080P, 9.99),
      scenario(SCENARIO.DIRTY_REGION, 4.99),
      scenario(SCENARIO.COMPOSITOR_ONLY, 8.32),
      scenario(SCENARIO.NOOP_RETAINED, 0.99),
    ],
  }
}

function cloneReport(): Report {
  return structuredClone(report())
}

function getScenario(value: Report, name: string): Record<string, unknown> {
  const found = value.scenarios.find((item) => item.name === name)
  if (!found) throw new Error(`fixture missing ${name}`)
  return found
}

describe("frame breakdown gate", () => {
  test("accepts a complete report and uses PRD percentiles", () => {
    const result = evaluateReport(report())
    expect(result.passed).toBe(true)
    expect(result.checks.map((check) => check.percentile)).toEqual(["p95", "p95", "p95", "p99"])
  })

  test("defaults to the shared report path and leaves transport unspecified", () => {
    expect(parseCli([])).toEqual({ report: "/tmp/vexart-frame-breakdown-report.json", transport: null })
    expect(parseCli(["--transport=bogus"])).toEqual({ report: "/tmp/vexart-frame-breakdown-report.json", transport: "bogus" })
  })

  test.each(required)("fails when %s is missing", (name) => {
    const value = cloneReport()
    value.scenarios = value.scenarios.filter((item) => item.name !== name)
    const result = evaluateReport(value)
    expect(result.passed).toBe(false)
    expect(result.errors.join(" ")).toContain(`missing scenario: ${name}`)
  })

  test("fails duplicate scenarios instead of selecting one", () => {
    const value = cloneReport()
    value.scenarios.push(structuredClone(value.scenarios[0]))
    const result = evaluateReport(value)
    expect(result.passed).toBe(false)
    expect(result.errors.join(" ")).toContain("duplicate scenario: dashboard-1080p")
  })

  test("fails missing and invalid required total metrics", () => {
    const missing = cloneReport()
    const total = getScenario(missing, SCENARIO.DASHBOARD_1080P).summary as Record<string, unknown>
    total.totalMs = { p99: 2 }
    const missingResult = evaluateReport(missing)
    expect(missingResult.errors.join(" ")).toContain("dashboard-1080p.summary.totalMs.p95")

    const invalid = cloneReport()
    const invalidTotal = getScenario(invalid, SCENARIO.NOOP_RETAINED).summary as Record<string, unknown>
    invalidTotal.totalMs = { p95: 0, p99: Number.NaN }
    const invalidResult = evaluateReport(invalid)
    expect(invalidResult.errors.join(" ")).toContain("noop-retained.summary.totalMs.p99")
  })

  test("fails duplicate, incoherent, and non-positive sample counts", () => {
    const value = cloneReport()
    const item = getScenario(value, SCENARIO.DIRTY_REGION)
    item.framesMeasured = 2
    const result = evaluateReport(value)
    expect(result.errors.join(" ")).toContain("dirty-region sample count mismatch")

    item.framesRequested = 0
    const invalidResult = evaluateReport(value)
    expect(invalidResult.errors.join(" ")).toContain("dirty-region.framesRequested must be a positive integer")
  })

  test("requires 1080p dimensions and matching transport", () => {
    const value = cloneReport()
    getScenario(value, SCENARIO.DASHBOARD_1080P).width = 800
    const result = evaluateReport(value, "file")
    expect(result.errors.join(" ")).toContain("dimensions must be 1920×1080")
    expect(result.errors.join(" ")).toContain("transport mismatch: report=shm, requested=file")
  })

  test("requires compositor evidence to be present and changing", () => {
    const missing = cloneReport()
    const compositor = getScenario(missing, SCENARIO.COMPOSITOR_ONLY)
    delete compositor.compositorTransformValues
    const missingResult = evaluateReport(missing)
    expect(missingResult.errors.join(" ")).toContain("compositorTransformValues is missing")

    const unchanged = cloneReport()
    const unchangedCompositor = getScenario(unchanged, SCENARIO.COMPOSITOR_ONLY)
    unchangedCompositor.compositorTransformValues = [4, 4, 4]
    const unchangedResult = evaluateReport(unchanged)
    expect(unchangedResult.errors.join(" ")).toContain("must change between measured frames")
  })

  test("threshold equality fails because PRD limits are strict", () => {
    for (const name of required) {
      const value = cloneReport()
      const gate = PRD_THRESHOLDS[name]
      const total = getScenario(value, name).summary as Record<string, unknown>
      total.totalMs = { [gate.percentile]: gate.maxMs, p95: gate.maxMs, p99: gate.maxMs }
      const result = evaluateReport(value)
      expect(result.passed).toBe(false)
      expect(result.errors.join(" ")).toContain(`PRD 7.3`)
    }
  })

  test("reports historical stage limits without turning them into PRD gates", () => {
    const value = cloneReport()
    const summary = getScenario(value, SCENARIO.DASHBOARD_1080P).summary as Record<string, unknown>
    summary.layoutMs = { p95: 999 }
    const result = evaluateReport(value)
    expect(result.passed).toBe(true)
    expect(result.supplemental.some((stage) => stage.stage === "layoutMs" && !stage.passed)).toBe(true)
  })

  test("keeps direct transport compatibility-only after validation", () => {
    const value = cloneReport()
    value.transport = "direct"
    const result = evaluateReport(value, "direct")
    expect(result.passed).toBe(true)
    expect(result.compatibilityOnly).toBe(true)
    expect(result.checks).toEqual([])
  })

  test("fails closed on invalid transport and report metadata", () => {
    const value = cloneReport()
    value.transport = "udp"
    const validation = validateReport(value, "bogus")
    expect(validation.errors.join(" ")).toContain("report.transport is missing or invalid")
    expect(validation.errors.join(" ")).toContain("--transport is invalid")
  })
})
