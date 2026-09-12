import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { detectRepo, runProcess } from "./git"
import { jsonSchema, recordInvestigationAnalysis, saveAgentReceipt, validateFinding, validateGate, validateGateEvidence } from "./index"
import { parseGate, parseInvestigator, type AgentReceipt } from "./types"

const fixtures: string[] = []
const source = "// First comment\n\nexport const value = `literal`\n  // indentation stays\n\texport const tabbed = 1\n"
const reference = { path: "src/value.ts", startLine: 1, endLine: 5 }
const related = { path: "src/consumer.ts", startLine: 1, endLine: 1 }

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "audit-evidence-capture-"))
  fixtures.push(root)
  await runProcess(["git", "init", "-q"], root)
  await runProcess(["git", "config", "user.email", "audit@example.test"], root)
  await runProcess(["git", "config", "user.name", "audit-test"], root)
  await mkdir(join(root, "src"))
  await writeFile(join(root, "src/value.ts"), source)
  await writeFile(join(root, "src/consumer.ts"), 'import { value } from "./value"\n')
  await symlink("value.ts", join(root, "src/link.ts"))
  await runProcess(["git", "add", "--", "src/value.ts", "src/consumer.ts", "src/link.ts"], root)
  const commit = await runProcess(["git", "commit", "-qm", "source baseline"], root)
  if (commit.code !== 0) throw new Error(commit.stderr)
  const repo = await detectRepo(root)
  return { root, repo, snapshot: { root, baselineSha: repo.baselineSha, readScope: "src" } }
}

const investigation = () => ({
  kind: "investigator", status: "finding", scope: "src/value.ts", strategy: "ownership",
  finding: { id: "fixture", canonicalRootCauseKey: "fixture:value", scope: "src/value.ts", summary: "fixture claim", impact: "unproven", evidence: [reference], expectedContract: "requires independent confirmation", reproduction: { command: ["bun", "test", "fixture.test.ts"], exitCode: 1, output: "AssertionError: fixture", observed: true }, paths: ["src/value.ts"] },
  analysis: { evidence: [related], flow: "consumer imports value", responsibilities: ["module owns constant"], invariants: ["constant initialized once"], scenarios: ["import value"], counterevidence: ["fixture does not establish a defect"], opportunities: [{ title: "Review caller behavior", evidence: [reference], expectedBenefit: "understand actual use", tradeoffs: ["may show no improvement needed"], validationPlan: ["inspect callers"] }] },
  negative: null, disadvantages: [],
})

const receipt = (response: unknown, role: AgentReceipt["role"] = "investigator"): Omit<AgentReceipt, "response" | "parseError" | "evidenceProvenance"> => ({ attemptId: "attempt", agentKey: "agent", role, scope: "src/value.ts", strategy: "ownership", command: ["codex", "exec"], prompt: "fixture prompt", startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:01.000Z", exitCode: 0, stdout: "fixture events", stderr: "", responseText: JSON.stringify(response) })
const witness = JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "bun test fixture.test.ts", exit_code: 1, aggregated_output: "AssertionError: fixture" } })

afterEach(async () => { await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe("controller evidence capture boundary", () => {
  test("investigator and gate evidence schemas request references, not transcription", () => {
    const schema = jsonSchema("gate")
    expect(schema.properties.sourceEvidence?.items.required).toEqual(["path", "startLine", "endLine"])
    expect(schema.properties.sourceEvidence?.items.properties).not.toHaveProperty("excerpt")
    expect(JSON.stringify(jsonSchema("investigator"))).not.toContain('"excerpt":')
  })

  test("actual receipt serialization preserves raw response and literal evidence at every supported position", async () => {
    const { root, repo, snapshot } = await fixture()
    const raw = investigation()
    const original = JSON.stringify(raw)
    const path = join(root, "receipt.json")
    const saved = await saveAgentReceipt(path, snapshot, receipt(raw))
    const disk = JSON.parse(await readFile(path, "utf8")) as AgentReceipt
    expect(disk).toEqual(saved)
    expect(disk.responseText).toBe(original)
    expect(JSON.stringify(raw)).toBe(original)
    expect(disk.parseError).toBeUndefined()
    expect(disk.evidenceProvenance).toEqual({ kind: "controller-extracted", baselineSha: repo.baselineSha, readScope: "src", references: [
      { location: "finding.evidence[0]", ...reference },
      { location: "analysis.evidence[0]", ...related },
      { location: "analysis.opportunities[0].evidence[0]", ...reference },
    ] })
    const parsed = parseInvestigator(disk.response)
    expect(parsed?.finding?.evidence[0].excerpt).toBe(source.slice(0, -1))
    expect(parsed?.analysis?.evidence[0].excerpt).toBe('import { value } from "./value"')
    expect(parsed?.analysis?.opportunities[0].evidence[0].excerpt).toBe(source.slice(0, -1))
    expect(parsed?.finding?.paths).toEqual(["src/value.ts"])
    expect(await validateFinding(repo, parsed!.finding!, witness, "src")).toBeNull()
    // Extraction is not a regression witness or semantic approval.
    expect(await validateFinding(repo, parsed!.finding!, "", "src")).toContain("matching failing")
    expect(await validateFinding(repo, parsed!.finding!, witness.replace("AssertionError: fixture", "different failure"), "src")).toContain("matching failing")
  })

  test("gate enrichment retains the independent witness and architecture gates", async () => {
    const { root, repo, snapshot } = await fixture()
    const candidate = await saveAgentReceipt(join(root, "investigator.json"), snapshot, receipt(investigation()))
    const finding = parseInvestigator(candidate.response)!.finding!
    const raw = { kind: "gate", verdict: "approved", findingId: finding.id, canonicalRootCauseKey: finding.canonicalRootCauseKey, baseSha: repo.baselineSha, reason: "must independently establish relevance", sourceEvidence: [related], disadvantages: [], proposal: { baseSha: repo.baselineSha, approvedPaths: finding.paths, changeType: "internal-fix", rootCause: "fixture", invariant: "fixture", ownership: "fixture", lifecycle: "fixture", tradeoffs: "fixture", alternatives: [], testPlan: ["independent failing regression"], requiresHumanDecision: false, contractChange: false, apiChange: false, ownershipChange: false, adHoc: false, hotfix: false, migration: false } }
    const saved = await saveAgentReceipt(join(root, "gate.json"), snapshot, receipt(raw, "gate"))
    const gate = parseGate(saved.response)!
    expect(gate.sourceEvidence[0].excerpt).toBe('import { value } from "./value"')
    expect(await validateGateEvidence(repo, finding, gate, "src")).toBeNull()
    expect(validateGate(repo, finding, gate, "")).toContain("independent matching reproduction")
    expect(validateGate(repo, finding, gate, witness)).toBeNull()
    expect(validateGate(repo, finding, { ...gate, proposal: { ...gate.proposal!, requiresHumanDecision: true } }, witness)).toContain("human contract decision")
    expect(validateGate(repo, finding, { ...gate, baseSha: "stale" }, witness)).toContain("stale")
  })

  test("captured SHA remains authoritative after current source and HEAD advance", async () => {
    const { root, repo, snapshot } = await fixture()
    const original = snapshot.baselineSha
    await writeFile(join(root, "src/value.ts"), "changed current source\n")
    await runProcess(["git", "add", "--", "src/value.ts"], root)
    await runProcess(["git", "commit", "-qm", "advance current source"], root)
    repo.baselineSha = (await detectRepo(root)).baselineSha
    expect(repo.baselineSha).not.toBe(original)
    const saved = await saveAgentReceipt(join(root, "captured.json"), snapshot, receipt(investigation()))
    expect(saved.evidenceProvenance?.baselineSha).toBe(original)
    expect(parseInvestigator(saved.response)?.finding?.evidence[0].excerpt).toBe(source.slice(0, -1))
  })

  test("bad finding references fail closed while retaining only valid analysis", async () => {
    const { root, snapshot } = await fixture()
    const cases: { ref: unknown; error: string }[] = [
      { ref: { ...reference, excerpt: "forged or legacy quotation" }, error: "agent excerpts" },
      { ref: { ...reference, unknown: true }, error: "unknown fields" },
      { ref: { ...reference, startLine: 0 }, error: "invalid inclusive range" },
      { ref: { ...reference, startLine: 1.5 }, error: "invalid inclusive range" },
      { ref: { ...reference, endLine: 0 }, error: "invalid inclusive range" },
      { ref: { ...reference, endLine: Infinity }, error: "invalid inclusive range" },
      { ref: { ...reference, endLine: 6 }, error: "range exceeds 5 baseline lines" },
      { ref: { ...reference, path: "src/link.ts" }, error: "not a regular blob" },
      { ref: { ...reference, path: "src" }, error: "not a regular blob" },
      { ref: { ...reference, path: "src/missing.ts" }, error: "unavailable" },
      { ref: { ...reference, path: ".private/token" }, error: "unsafe" },
      { ref: { ...reference, path: "scripts/audit-loop/index.ts" }, error: "unsafe" },
      { ref: { ...reference, path: "package.json" }, error: "unsafe" },
      { ref: { ...reference, path: "outside.ts" }, error: "out-of-scope" },
    ]
    for (const item of cases) {
      const raw = investigation()
      const response = { ...raw, finding: { ...raw.finding, evidence: [item.ref] } }
      const saved = await saveAgentReceipt(join(root, "rejected.json"), snapshot, receipt(response))
      expect(saved.parseError).toContain("finding.evidence[0]")
      expect(saved.parseError).toContain(item.error)
      expect(saved.response).toMatchObject({ finding: null })
      expect(saved.evidenceProvenance?.references.every((ref) => ref.location.startsWith("analysis."))).toBe(true)
      expect(saved.responseText).toBe(JSON.stringify(response))
      expect(parseInvestigator(saved.response)).toBeNull()
    }
  })

  test("malformed nested arrays and forged gate excerpts are not silently ignored", async () => {
    const { root, snapshot } = await fixture()
    const raw = investigation()
    for (const [response, location] of [
      [{ ...raw, analysis: { ...raw.analysis, evidence: "not an array" } }, "analysis.evidence"],
      [{ ...raw, analysis: { ...raw.analysis, opportunities: [null] } }, "analysis.opportunities[0]"],
      [{ ...raw, analysis: { ...raw.analysis, opportunities: [{ ...raw.analysis.opportunities[0], evidence: [{}] }] } }, "analysis.opportunities[0].evidence[0]"],
    ] as const) {
      const saved = await saveAgentReceipt(join(root, "nested.json"), snapshot, receipt(response))
      expect(saved.parseError).toContain(location)
      expect(saved.response).toMatchObject({ analysis: null })
      expect(saved.evidenceProvenance?.references.map((ref) => ref.location)).toEqual(["finding.evidence[0]"])
    }
    const gate = await saveAgentReceipt(join(root, "gate-rejected.json"), snapshot, receipt({ sourceEvidence: [{ ...reference, excerpt: "forged" }] }, "gate"))
    expect(gate.parseError).toContain("sourceEvidence[0]")
    expect(gate.response).toBeUndefined()
  })

  test("a rejected finding preserves independently captured analysis through event recording", async () => {
    const { root, repo, snapshot } = await fixture()
    const raw = investigation()
    const response = { ...raw, finding: { ...raw.finding, evidence: [reference, { ...reference, endLine: 500 }] } }
    const saved = await saveAgentReceipt(join(root, "partial.json"), snapshot, receipt(response))
    expect(saved.parseError).toContain("finding.evidence[1]")
    expect(saved.responseText).toBe(JSON.stringify(response))
    expect(parseInvestigator(saved.response)).toBeNull()
    const store = join(root, "events")
    await mkdir(store)
    await recordInvestigationAnalysis(repo, { store, runId: "partial", cycle: 1, scope: "src/value.ts", agentKey: saved.agentKey, attemptId: saved.attemptId }, saved.response, saved.exitCode, "src")
    const event = JSON.parse((await readFile(join(store, "events.jsonl"), "utf8")).trim())
    expect(event.type).toBe("analysis_recorded")
    expect(event.analysis.evidence[0].excerpt).toBe('import { value } from "./value"')
    expect(saved.evidenceProvenance?.references.map((item) => item.location)).toEqual(["analysis.evidence[0]", "analysis.opportunities[0].evidence[0]"])
  })

  test("blank and whitespace-only slices fail before receiving extraction provenance", async () => {
    const { root, snapshot } = await fixture()
    await writeFile(join(root, "src/spaces.ts"), "  \t\n")
    await runProcess(["git", "add", "--", "src/spaces.ts"], root)
    await runProcess(["git", "commit", "-qm", "whitespace fixture"], root)
    const baselineSha = (await detectRepo(root)).baselineSha
    for (const ref of [{ ...reference, startLine: 2, endLine: 2 }, { path: "src/spaces.ts", startLine: 1, endLine: 1 }]) {
      const saved = await saveAgentReceipt(join(root, "blank.json"), { ...snapshot, baselineSha }, receipt({ sourceEvidence: [ref] }, "gate"))
      expect(saved.parseError).toContain("empty or whitespace-only evidence")
      expect(saved.parseError).toContain("sourceEvidence[0]")
      expect(saved.response).toBeUndefined()
      expect(saved.evidenceProvenance).toBeUndefined()
    }
  })

  test("non-evidence roles are not recursively rewritten or given extraction provenance", async () => {
    const { root, snapshot } = await fixture()
    const response = { kind: "planner", lessons: { evidence: [{ ...reference, excerpt: "data, not a supported ref position" }] } }
    const saved = await saveAgentReceipt(join(root, "planner.json"), snapshot, receipt(response, "planner"))
    expect(saved.response).toEqual(response)
    expect(saved.evidenceProvenance).toBeUndefined()
    const malformed = await saveAgentReceipt(join(root, "malformed.json"), snapshot, { ...receipt(null), responseText: "not JSON" })
    expect(malformed.parseError).toBeDefined()
    expect(malformed.responseText).toBe("not JSON")
    expect(malformed.response).toBeUndefined()
  })
})
