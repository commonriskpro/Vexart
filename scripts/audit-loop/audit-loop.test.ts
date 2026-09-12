import { describe, expect, test } from "bun:test"
import { detectRepo, runProcess, sourceAt } from "./git"
import { agentCommand, commandMatches, jsonSchema, parseArgs, validateFinding, validateGate } from "./index"
import { parseAnalysis, parseFinding, parseGate, parseInvestigator, parsePlanner } from "./types"

describe("audit loop safety contracts", () => {
  test("help and bounded defaults never start a run", () => {
    expect(parseArgs([])).toEqual({ command: "help", config: { cycles: 3, minutes: 60 } })
    expect(parseArgs(["run", "--cycles", "2", "--minutes", "5", "--scope", "packages/engine"]).config).toEqual({ cycles: 2, minutes: 5, scope: "packages/engine" })
    expect(() => parseArgs(["run", "--cycles", "0"])).toThrow()
  })

  test("strict parsers retain negative and approved branches after JSON round trip", () => {
    const negative = { kind: "investigator" as const, status: "negative" as const, scope: "packages/engine", strategy: "invariant", finding: null, negative: "No reproducible failure", disadvantages: ["coverage remains partial"] }
    expect(parseInvestigator(JSON.parse(JSON.stringify(negative)))).toEqual({ ...negative, analysis: null })
    const planner = { kind: "planner", status: "ready", assignments: [], lessons: { falsePositives: [], regressions: [], coverage: ["engine"], disadvantages: [] }, reason: null }
    expect(parsePlanner(JSON.parse(JSON.stringify(planner)))).toEqual(JSON.parse(JSON.stringify(planner)))
    const rejected = { kind: "gate", verdict: "rejected", findingId: "f-1", canonicalRootCauseKey: "engine:invariant", baseSha: "abc", reason: "not real", sourceEvidence: [{ path: "README.md", startLine: 1, endLine: 1, excerpt: "# Vexart" }], proposal: null, disadvantages: [] }
    expect(parseGate(JSON.parse(JSON.stringify(rejected)))).toEqual(JSON.parse(JSON.stringify(rejected)))
    expect(parseGate({ ...rejected, unexpected: true })).toBeNull()
  })

  test("analysis is strict and cannot smuggle approval fields", () => {
    const analysis = { evidence: [{ path: "README.md", startLine: 1, endLine: 1, excerpt: "# Vexart" }], flow: "caller to consumer", responsibilities: ["consumer owns state"], invariants: ["release acquired state"], scenarios: ["mount and unmount"], counterevidence: [], opportunities: [] }
    expect(parseAnalysis(analysis)).toEqual(analysis)
    expect(parseAnalysis({ ...analysis, evidence: [] })).toBeNull()
    expect(parseAnalysis({ ...analysis, approvedPaths: ["README.md"] })).toBeNull()
    expect(parseAnalysis({ ...analysis, opportunities: [{ title: "simplify", evidence: analysis.evidence, expectedBenefit: "fewer branches", tradeoffs: [], validationPlan: ["trace callers"] }] })).toBeNull()
    expect(jsonSchema("investigator").required).toContain("analysis")
  })

  test("actual agent argv uses Astra high for source work and Luna xhigh for reviews", () => {
    for (const role of ["planner", "investigator", "apply", "gate", "verifier"] as const) {
      const command = agentCommand(role, "/worktree", "/schema.json", "/message.json", "prompt")
      const review = role === "gate" || role === "verifier"
      expect(command[command.indexOf("-m") + 1]).toBe(review ? "gpt-5.6-luna" : "gpt-6-astra")
      expect(command[command.indexOf("-c") + 1]).toBe(`model_reasoning_effort="${review ? "xhigh" : "high"}"`)
      expect(command[command.indexOf("-s") + 1]).toBe(role === "apply" ? "workspace-write" : "read-only")
      expect(command).toContain("multi_agent")
      expect(command).toContain("multi_agent_v2")
    }
  })

  test("literal receipt decoding preserves exact argv across shell quoting", () => {
    // Scheduler-style CLI receipt: quotes embedded in a single-quoted Bun program
    // are represented by adjacent single/double-quoted segments, not extra argv.
    const script = "import { scheduler } from './scheduler';\nconsole.log('assertion', { value: '$literal; > |' });"
    const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'"
    const command = ["bun", "--conditions=browser", "-e", script]
    const inner = command.map(quote).join(" ")
    const witness = { command: `/bin/zsh -lc ${quote(inner)}`, exit_code: 1 }
    expect(commandMatches(command, witness)).toBe(true)
    expect(commandMatches(command, { ...witness, command: inner })).toBe(true)
    expect(commandMatches(["bun", "-e", "a  b", ""], { command: `bun -e 'a  b' ''`, exit_code: 1 })).toBe(true)
    expect(commandMatches(["bun", "-e", "a\\q"], { command: 'bun -e "a\\q"', exit_code: 1 })).toBe(true)
    expect(commandMatches(["bun", "-e", "a b"], { command: 'bun -e a\\ b', exit_code: 1 })).toBe(true)
    expect(commandMatches(["bun", "-e", "a b"], { command: `bun -e 'a  b'`, exit_code: 1 })).toBe(false)
    expect(commandMatches(["bun", "-e", "a", "b"], { command: `bun -e 'a b'`, exit_code: 1 })).toBe(false)
    expect(commandMatches(["bun", "-e", "a b"], { command: `bun -e 'a b' ''`, exit_code: 1 })).toBe(false)
    expect(commandMatches(command, { ...witness, exit_code: undefined })).toBe(false)
    for (const invalid of [
      `echo ignored && ${inner}`, `${inner};`, `${inner} | cat`, `${inner} > output`,
      `bun -e "$PROGRAM"`, "bun -e `echo program`", "bun -e $(echo program)",
      "bun -e $'program'", "bun -e *.ts", "bun -e 'unfinished", "bun -e trailing\\",
      `${inner} # comment`, `/bin/fish -c ${quote(inner)}`,
      `/bin/zsh -lc ${quote(`/bin/sh -c ${quote(inner)}`)}`,
      `/bin/zsh -lc ${quote(inner)} extra`,
    ]) expect(commandMatches(command, { command: invalid, exit_code: 1 })).toBe(false)
  })

  test("actual scheduler receipt decodes the observed Homebrew zsh wrapper", () => {
    // Only command/argv copied from the scheduler receipt; no prompt or output.
    const fixture = {"expected": ["bun", "--conditions=browser", "-e", "import { createFrameScheduler } from \"./packages/engine/src/scheduler/index.ts\"; const scheduler = createFrameScheduler(); let idle = true; const ran = []; scheduler.scheduleTask(\"background\", () => { ran.push(\"first\"); idle = false; }); scheduler.scheduleTask(\"background\", () => ran.push(\"second\")); scheduler.drainFrame(100, () => idle); if (ran.join(\",\") !== \"first\" || scheduler.pendingInLane(\"background\") !== 1) { console.error(\"AssertionError: background task executed after idle state changed\"); process.exit(1); }"], "command": "/opt/homebrew/bin/zsh -lc \"bun --conditions=browser -e 'import { createFrameScheduler } from \\\"./packages/engine/src/scheduler/index.ts\\\"; const scheduler = createFrameScheduler(); let idle = true; const ran = []; scheduler.scheduleTask(\\\"background\\\", () => { ran.push(\\\"first\\\"); idle = false; }); scheduler.scheduleTask(\\\"background\\\", () => ran.push(\\\"second\\\")); scheduler.drainFrame(100, () => idle); if (ran.join(\\\",\\\") \"'!== \"first\" || scheduler.pendingInLane(\"background\") !== 1) { console.error(\"AssertionError: background task executed after idle state changed\"); process.exit(1); }'\"'\""}
    expect(commandMatches(fixture.expected, { command: fixture.command, exit_code: 1 })).toBe(true)
    expect(commandMatches(fixture.expected, { command: fixture.command.replace("/opt/homebrew/bin/zsh", "/untrusted/bin/zsh"), exit_code: 1 })).toBe(false)
  })

  test("baseline source and successful witness are required for a finding", async () => {
    const repo = await detectRepo(process.cwd())
    const source = await sourceAt(repo.root, repo.baselineSha, "README.md")
    expect(source).toBeTruthy()
    const first = source!.split("\n")[0]
    const finding = { id: "f-1", canonicalRootCauseKey: "readme:baseline", scope: ".", summary: "test fixture", impact: "none", evidence: [{ path: "README.md", startLine: 1, endLine: 1, excerpt: first }], expectedContract: "source is readable", reproduction: { command: ["printf", "witness"], exitCode: 1, output: "witness", observed: true }, paths: ["README.md"] }
    const events = JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "printf witness", exit_code: 1, aggregated_output: "witness" } })
    expect(parseFinding({ ...finding, reproduction: { ...finding.reproduction, command: ["bun", "-e", "  exact program\n", ""] } })?.reproduction.command).toEqual(["bun", "-e", "  exact program\n", ""])
    expect(await validateFinding(repo, finding, events)).toBeNull()
    expect(await validateFinding(repo, finding, events.replace('"exit_code":1', '"exit_code":2'))).toContain("matching failing")
    expect(await validateFinding(repo, finding, events.replace('"aggregated_output":"witness"', '"aggregated_output":"different"'))).toContain("matching failing")
    expect(await validateFinding(repo, { ...finding, evidence: [{ ...finding.evidence[0], excerpt: "not in baseline" }] }, events)).toContain("does not match")
  })

  test("read-only evidence may reference another in-scope file without widening write paths", async () => {
    const repo = await detectRepo(process.cwd())
    const source = await sourceAt(repo.root, repo.baselineSha, "docs/ARCHITECTURE.md")
    const contract = await sourceAt(repo.root, repo.baselineSha, "docs/API-POLICY.md")
    expect(source).toBeTruthy()
    expect(contract).toBeTruthy()
    const finding = { id: "f-read", canonicalRootCauseKey: "read:scope", scope: "docs", summary: "test fixture", impact: "none", evidence: [{ path: "docs/API-POLICY.md", startLine: 1, endLine: 1, excerpt: contract!.split("\n")[0] }], expectedContract: "source is readable", reproduction: { command: ["printf", "witness"], exitCode: 1, output: "witness", observed: true }, paths: ["docs/ARCHITECTURE.md"] }
    const events = JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "printf witness", exit_code: 1, aggregated_output: "witness" } })
    expect(await validateFinding(repo, finding, events, "docs")).toBeNull()
    expect(await validateFinding(repo, finding, events, "docs/ARCHITECTURE.md")).toContain("out-of-scope")
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
