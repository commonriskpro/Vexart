import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { findBrowser, runOracle, type OracleReport } from "./grid-oracle"

describe("G-035 external Grid oracle", () => {
  test("requires and records a real browser instead of skip-passing", async () => {
    const browser = await findBrowser()
    if (!browser) throw new Error("BLOCKED: a real Chromium/Chrome executable is required for G-035")

    const report = await runOracle({ runId: "test-real-browser" })
    expect(report.status).toBe("PASS")
    expect(report.spec.url).toBe("https://www.w3.org/TR/2025/CRD-css-grid-1-20250326/")
    expect(report.spec.revision).toBe("2025-03-26")
    expect(report.environment.browser).not.toBe("not found")
    expect(report.environment.browser).not.toBe("unknown")
    expect(report.environment.browserPath).toBe(browser)
    expect(report.policy.incrementalIsOracle).toBe(false)
    expect(report.policy.vexartImports).toBe(false)

    const checked = report.results.filter((entry) => entry.status === "checked")
    const deferred = report.results.filter((entry) => entry.status === "deferred")
    expect(checked.map((entry) => entry.fixtureId)).toEqual(["F-02", "F-03", "F-06", "F-07", "F-08", "F-09", "F-10", "F-14"])
    expect(deferred.map((entry) => entry.fixtureId)).toEqual(["F-01", "F-04", "F-05", "F-11", "F-12", "F-13", "F-15", "F-16"])
    expect(report.results.every((entry) => entry.status === "checked" || entry.status === "deferred")).toBe(true)
    expect(checked.every((entry) => !entry.reason)).toBe(true)
    const autoRepeat = checked.find((entry) => entry.fixtureId === "F-07")
    expect(Object.keys(autoRepeat?.observedVariants ?? {})).toEqual(["auto-fill", "auto-fit"])

    const saved = JSON.parse(await readFile(report.reportPath, "utf8")) as OracleReport
    expect(saved.status).toBe("PASS")
    expect(saved.environment.browser).toBe(report.environment.browser)
    expect(saved.results).toHaveLength(16)
  })

  test("keeps the oracle boundary independent from the Vexart solver", async () => {
    const source = await readFile(new URL("./grid-oracle.ts", import.meta.url), "utf8")
    expect(source).not.toContain("packages/internal-flexily/src/grid")
    expect(source).not.toContain("calculateLayout(")
    expect(source).not.toContain("layout-adapter")
    expect(source).not.toContain("node_modules/flexily")
  })
})
