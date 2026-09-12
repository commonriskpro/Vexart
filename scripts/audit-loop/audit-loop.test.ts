import { describe, expect, test } from "bun:test"
import { detectRepo, runProcess, sourceAt } from "./git"
import { parseArgs, validateFinding, validateGate } from "./index"
import { parseGate, parseInvestigator, parsePlanner } from "./types"

describe("audit loop safety contracts", () => {
  test("help and bounded defaults never start a run", () => {
    expect(parseArgs([])).toEqual({ command: "help", config: { cycles: 3, minutes: 60 } })
    expect(parseArgs(["run", "--cycles", "2", "--minutes", "5", "--scope", "packages/engine"]).config).toEqual({ cycles: 2, minutes: 5, scope: "packages/engine" })
    expect(() => parseArgs(["run", "--cycles", "0"])).toThrow()
  })

  test("strict parsers retain negative and approved branches after JSON round trip", () => {
    const negative = { kind: "investigator", status: "negative", scope: "packages/engine", strategy: "invariant", finding: null, negative: "No reproducible failure", disadvantages: ["coverage remains partial"] }
    expect(parseInvestigator(JSON.parse(JSON.stringify(negative)))).toEqual(JSON.parse(JSON.stringify(negative)))
    const planner = { kind: "planner", status: "ready", assignments: [], lessons: { falsePositives: [], regressions: [], coverage: ["engine"], disadvantages: [] }, reason: null }
    expect(parsePlanner(JSON.parse(JSON.stringify(planner)))).toEqual(JSON.parse(JSON.stringify(planner)))
    const rejected = { kind: "gate", verdict: "rejected", findingId: "f-1", canonicalRootCauseKey: "engine:invariant", baseSha: "abc", reason: "not real", sourceEvidence: [{ path: "README.md", startLine: 1, endLine: 1, excerpt: "# Vexart" }], proposal: null, disadvantages: [] }
    expect(parseGate(JSON.parse(JSON.stringify(rejected)))).toEqual(JSON.parse(JSON.stringify(rejected)))
    expect(parseGate({ ...rejected, unexpected: true })).toBeNull()
  })

  test("baseline source and successful witness are required for a finding", async () => {
    const repo = await detectRepo(process.cwd())
    const source = await sourceAt(repo.root, repo.baselineSha, "README.md")
    expect(source).toBeTruthy()
    const first = source!.split("\n")[0]
    const finding = { id: "f-1", canonicalRootCauseKey: "readme:baseline", scope: ".", summary: "test fixture", impact: "none", evidence: [{ path: "README.md", startLine: 1, endLine: 1, excerpt: first }], expectedContract: "source is readable", reproduction: { command: ["printf", "witness"], exitCode: 1, output: "witness", observed: true }, paths: ["README.md"] }
    const events = JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "printf witness", exit_code: 1, aggregated_output: "witness" } })
    expect(await validateFinding(repo, finding, events)).toBeNull()
    expect(await validateFinding(repo, { ...finding, evidence: [{ ...finding.evidence[0], excerpt: "not in baseline" }] }, events)).toContain("does not match")
  })

  test("stale or unsafe gates fail closed", async () => {
    const repo = await detectRepo(process.cwd())
    const finding = { id: "f-1", canonicalRootCauseKey: "readme:baseline", scope: ".", summary: "test fixture", impact: "none", evidence: [{ path: "README.md", startLine: 1, endLine: 1, excerpt: "# Vexart" }], expectedContract: "source is readable", reproduction: { command: ["printf", "witness"], exitCode: 1, output: "witness", observed: true }, paths: ["README.md"] }
    const gate = { kind: "gate" as const, verdict: "approved" as const, findingId: "f-1", canonicalRootCauseKey: "readme:baseline", baseSha: repo.baselineSha, reason: "confirmed", sourceEvidence: finding.evidence, disadvantages: [], proposal: { baseSha: repo.baselineSha, approvedPaths: ["README.md"], changeType: "internal-fix" as const, rootCause: "fixture", invariant: "fixture", ownership: "fixture", lifecycle: "fixture", tradeoffs: "fixture", alternatives: ["none"], testPlan: ["git diff --check"], requiresHumanDecision: false, contractChange: false, apiChange: false, ownershipChange: false, adHoc: false, hotfix: false, migration: false } }
    const events = JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "printf witness", exit_code: 1, aggregated_output: "witness" } })
    expect(validateGate(repo, finding, gate, events)).toBeNull()
    expect(validateGate(repo, finding, { ...gate, baseSha: "stale" }, events)).toContain("stale")
    expect(validateGate(repo, finding, { ...gate, proposal: { ...gate.proposal, approvedPaths: ["scripts/audit-loop/index.ts"] } }, events)).toContain("exact")
  })

  test("timeout marks a process and does not wait for its normal sleep", async () => {
    const started = Date.now()
    const result = await runProcess(["sh", "-c", "trap 'exit 0' TERM; (trap '' TERM; sleep 3) & wait"], process.cwd(), 50, true)
    expect(result.timedOut).toBe(true)
    expect(Date.now() - started).toBeLessThan(1500)
  })
})
