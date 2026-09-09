import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { normalizeBaseline, normalizeOptions, PERF_FIXTURE_CONTRACT, runGridPerf } from "./perf"

describe("G-039 serial Grid performance gate", () => {
  test("keeps the acceptance configuration explicit", () => {
    const options = normalizeOptions()
    expect(options.runs).toBe(5)
    expect(options.warmupFrames).toBe(100)
    expect(options.measuredFrames).toBe(1000)
    expect(options.scenarios).toEqual(["initial", "no-op", "leaf-dirty", "resize"])
    expect(options.enforceGates).toBe(false)
    expect(PERF_FIXTURE_CONTRACT).toMatchObject({
      totalNodes: 400,
      childNodes: 399,
      rootIncludedInNodeCount: true,
      gap: 4,
      padding: 8,
      childWidthMin: 24,
      childWidthMaxExclusive: 80,
      childHeightMin: 16,
      childHeightMaxExclusive: 48,
      flexGrowPeriod: 11,
    })
  })

  test("normalizes the historical baseline only through the contemporary tarball control", () => {
    const normalized = normalizeBaseline(0.17, 0.16, 0.4)
    expect(normalized.formula).toBe("historicalWorkspaceP95Ms * (contemporaryTarballP95Ms / historicalTarballP95Ms)")
    expect(normalized.contemporaryTarballToHistoricalTarballRatio).toBe(2.5)
    expect(normalized.normalizedBaselineP95Ms).toBeCloseTo(0.425, 12)
    expect(normalized.status).toBe("PASS")
    expect(normalizeBaseline(0.17, null, 0.4).status).toBe("BLOCKED")
  })

  test("runs real Flex and Grid nodes serially and writes separated stages", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "vexart-grid-perf-test-"))
    const result = await runGridPerf({
      outputDir,
      runId: "focused-real-node",
      runs: 1,
      warmupFrames: 1,
      measuredFrames: 2,
      scenarios: ["initial", "no-op", "leaf-dirty"],
      seed: 0x1234,
      enforceGates: false,
    })
    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as {
      configuration: { serial: boolean; runs: number; warmupFrames: number; measuredFrames: number; nodeCount: number; fixture: typeof PERF_FIXTURE_CONTRACT }
      results: Array<{ variant: string; nodeCount: number; scenario: string; runs: Array<{ measured: { frames: number; stages: Record<string, { count: number }>; counters: Record<string, number> } }> }>
      oraclePolicy: { conformanceOracle: string; incrementalVsFresh: string; realImplementation: boolean }
      baseline: {
        source: string
        historicalRaw: { workspaceP95Ms: number | null; tarballP95Ms: number | null }
        contemporaryTarballControl: { sameProcess: boolean; sameFixtureSeedAndFrames: boolean; source: { version: string; commit: string; tarballIntegrity: string } }
        normalization: { formula: string; normalizedBaselineP95Ms: number | null }
      }
    }
    expect(result.reportPath).toBe(join(outputDir, "focused-real-node", "report.json"))
    expect(report.configuration).toMatchObject({ serial: true, runs: 1, warmupFrames: 1, measuredFrames: 2, nodeCount: 400 })
    expect(report.configuration.fixture).toEqual(PERF_FIXTURE_CONTRACT)
    expect(report.baseline.source).toBe("G-005 historical tarball/workspace Flexily baselines")
    expect(report.baseline.contemporaryTarballControl).toMatchObject({
      sameProcess: true,
      sameFixtureSeedAndFrames: true,
      source: { version: "0.6.0", commit: "e9a752aacef9d84d20c383443b9c89f2ad2daf4a" },
    })
    expect(report.baseline.contemporaryTarballControl.source.tarballIntegrity).toMatch(/^sha512-/)
    expect(report.baseline.normalization.formula).toContain("contemporaryTarballP95Ms / historicalTarballP95Ms")
    expect(report.results.map((entry) => entry.variant)).toEqual([
      "flex-comparable", "flex-comparable", "flex-comparable",
      "flex-tarball-control", "flex-tarball-control", "flex-tarball-control",
      "grid400", "grid400", "grid400",
    ])
    for (const entry of report.results) {
      expect(entry.nodeCount).toBe(400)
      expect(entry.runs[0]?.measured.frames).toBe(2)
      expect(Object.values(entry.runs[0]!.measured.stages).every((stage) => stage.count === 2)).toBe(true)
    }
    const flexInitial = report.results.find((entry) => entry.variant === "flex-comparable" && entry.scenario === "initial")!
    const gridInitial = report.results.find((entry) => entry.variant === "grid400" && entry.scenario === "initial")!
    expect(flexInitial.runs[0]!.measured.counters.layoutNodeCalls).toBe(800)
    expect(gridInitial.runs[0]!.measured.counters.gridLayoutCalls).toBe(2)
    expect(report.oraclePolicy).toMatchObject({ conformanceOracle: "none", incrementalVsFresh: "cache-and-dirty-observation-only", realImplementation: true })
  })
})
