import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { normalizeOptions, runBaseline } from "./baseline"

describe("G-005 Flexily baseline", () => {
  it("runs the real pinned tarball and workspace with identical small fixtures", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "vexart-grid-baseline-test-"))
    const result = await runBaseline({
      outputDir,
      runId: "test-real-pinned",
      runs: 1,
      warmupFrames: 1,
      measuredFrames: 2,
      sizes: [10],
    })
    const tarball = JSON.parse(await readFile(result.reports.tarball, "utf8"))
    const workspace = JSON.parse(await readFile(result.reports.workspace, "utf8"))

    expect(tarball.variant).toBe("tarball")
    expect(workspace.variant).toBe("workspace")
    expect(tarball.source.tarballIntegrity).toBe("sha512-V2z9Nx+a77dicQUM5ktU6A4wSoNUbbVRocOCjXgLHIkhl/pdmrtX8MWQTwBJ3mCuB4pkniitvKW5C4tBo94XIg==")
    expect(workspace.source.resolution).toContain("packages/internal-flexily")
    expect(workspace.source.resolution).not.toContain("node_modules/flexily")
    expect(tarball.configuration).toEqual(workspace.configuration)
    expect(tarball.results).toHaveLength(5)
    expect(workspace.results).toHaveLength(5)

    for (const report of [tarball, workspace]) {
      for (const result of report.results) {
        expect(result.runs).toHaveLength(1)
        expect(result.aggregate.frames).toBe(2)
        expect(result.aggregate.stages.sync.count).toBe(2)
        expect(result.aggregate.stages.calculate.count).toBe(2)
        expect(result.aggregate.stages.writeback.count).toBe(2)
        expect(result.aggregate.stages.render.count).toBe(2)
      }
      const noOp = report.results.find((entry: { scenario: string }) => entry.scenario === "no-op")
      expect(noOp.aggregate.noOpFrames).toBe(2)
      expect(noOp.aggregate.counters.layoutNodeCalls).toBe(0)
      expect(noOp.aggregate.counters.layoutPositioningCalls).toBe(0)
    }

    const tarballSeeds = tarball.results.map((entry: { fixtureSeed: number }) => entry.fixtureSeed)
    const workspaceSeeds = workspace.results.map((entry: { fixtureSeed: number }) => entry.fixtureSeed)
    expect(tarballSeeds).toEqual(workspaceSeeds)
  })

  it("keeps the acceptance defaults and rejects incomplete sizes", () => {
    const defaults = normalizeOptions({ runId: "test-defaults" })
    expect(defaults.runs).toBe(5)
    expect(defaults.warmupFrames).toBe(100)
    expect(defaults.measuredFrames).toBe(1000)
    expect(defaults.sizes).toEqual([100, 400, 1000])
    expect(defaults.scenarios).toEqual(["initial", "no-op", "leaf-dirty", "resize", "nesting"])
    expect(() => normalizeOptions({ sizes: [1] })).toThrow("sizes")
  })
})
