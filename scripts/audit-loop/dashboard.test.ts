import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDashboardServer, parseDashboardArgs, readDashboardSnapshot } from "./dashboard"
import { detectRepo, runProcess } from "./git"

const fixtures: string[] = []

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "vexart-dashboard-"))
  fixtures.push(root)
  await runProcess(["git", "init", "-q"], root)
  await runProcess(["git", "config", "user.email", "dashboard@example.test"], root)
  await runProcess(["git", "config", "user.name", "dashboard-test"], root)
  await writeFile(join(root, "value.ts"), "export const value = 1\n")
  await runProcess(["git", "add", "--", "value.ts"], root)
  await runProcess(["git", "commit", "-m", "baseline"], root)
  const repo = await detectRepo(root)
  const store = join(repo.commonDir, "audit-loop")
  await mkdir(join(store, "runs", "run-1", "receipts", "agent-1"), { recursive: true })
  await mkdir(join(store, "agents"), { recursive: true })
  const state = { id: "run-1", pid: process.pid, status: "running", phase: "investigating", cycle: 1, cycles: 3, startedAt: "2026-01-01T00:00:00.000Z", deadlineAt: "2099-01-01T00:00:00.000Z", baselineSha: repo.baselineSha, branch: "codex/audit-run-1", worktree: "/tmp/audit-worktree", stars: 1, findings: ["root-cause:key"] }
  await writeFile(join(store, "state.json"), JSON.stringify(state))
  await mkdir(join(store, "lock"), { recursive: true })
  await writeFile(join(store, "lock", "owner.json"), JSON.stringify({ runId: "run-1", pid: process.pid }))
  const events = [
    { at: "2026-01-01T00:00:00.000Z", type: "run_started", runId: "run-1", config: { secret: "PRIVATE_CONFIG" } },
    { at: "2026-01-01T00:00:01.000Z", type: "agent_receipt", runId: "run-1", role: "investigator", agentKey: "agent-1", attemptId: "attempt-1", prompt: "PRIVATE_PROMPT", stdout: "PRIVATE_STDOUT", command: ["PRIVATE_COMMAND"] },
    { at: "2026-01-01T00:00:02.000Z", type: "star_awarded", runId: "run-1", canonicalRootCauseKey: "root-cause:key", investigatorAgentKey: "agent-1" },
    { at: "2026-01-01T00:00:03.000Z", type: "star_awarded", runId: "run-1", canonicalRootCauseKey: "root-cause:key", investigatorAgentKey: "agent-1" },
    { at: "2026-01-01T00:00:04.000Z", type: "fix_committed", runId: "run-1", commitSha: "abc123" },
    { at: "2026-01-01T00:00:05.000Z", type: "decision_deferred", runId: "run-1", decisionKey: "root-cause:key\\u0000base", alternatives: ["keep"], disadvantages: ["tradeoff"] },
  ]
  await writeFile(join(store, "events.jsonl"), events.map((event) => JSON.stringify(event)).join("\n") + "\n{malformed\n")
  await writeFile(join(store, "agents", "agent-1.json"), JSON.stringify({ agentKey: "agent-1", scope: "src", strategy: "invariant" }))
  await writeFile(join(store, "runs", "run-1", "receipts", "agent-1", "attempt-1.json"), JSON.stringify({
    agentKey: "agent-1", attemptId: "attempt-1", role: "investigator", scope: "src", strategy: "invariant", startedAt: "2026-01-01T00:00:01.000Z", endedAt: "2026-01-01T00:00:02.000Z", exitCode: 0,
    command: ["codex", "exec", "-m", "gpt-5.6-luna", "-c", "model_reasoning_effort=\\\"xhigh\\\""], prompt: "PRIVATE_PROMPT", stdout: "PRIVATE_STDOUT", stderr: "PRIVATE_STDERR", env: "PRIVATE_ENV",
    response: { kind: "investigator", status: "finding", summary: "private summary", finding: { summary: "real summary", paths: ["src/a.ts"], evidence: [{ path: "src/a.ts", startLine: 1, endLine: 1, excerpt: "const" }] }, disadvantages: ["tradeoff"]
  }}))
  return { root, repo, store }
}

afterEach(async () => { await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe("audit dashboard observer", () => {
  test("builds a bounded sanitized snapshot with truthful process state", async () => {
    const { root } = await fixture()
    const snapshot = await readDashboardSnapshot(root)
    expect(snapshot.state?.id).toBe("run-1")
    expect(snapshot.processAlive).toBeNull()
    expect(snapshot.warnings.some((warning) => warning.includes("executable identity"))).toBe(true)
    expect(snapshot.events.map((event) => event.type)).toEqual(["run_started", "agent_receipt", "star_awarded", "star_awarded", "fix_committed", "decision_deferred"])
    expect(snapshot.receipts).toHaveLength(1)
    expect(snapshot.receipts[0]).toMatchObject({ model: "gpt-5.6-luna", effort: "xhigh", status: "finding", paths: ["src/a.ts"] })
    expect(snapshot.agents[0]?.stars).toBe(1)
    expect(snapshot.historyComplete).toBe(false)
    expect(snapshot.totals).toEqual({ stars: null, solutionStars: null, commits: null, decisions: null })
    expect(snapshot.warnings.some((warning) => warning.includes("malformed"))).toBe(true)
    const raw = JSON.stringify(snapshot)
    for (const secret of ["PRIVATE_CONFIG", "PRIVATE_PROMPT", "PRIVATE_STDOUT", "PRIVATE_STDERR", "PRIVATE_COMMAND", "PRIVATE_ENV"]) expect(raw).not.toContain(secret)
  })

  test("serves only the fixed observer routes and refreshes persisted state", async () => {
    const { root, store } = await fixture()
    const running = await createDashboardServer(root, 0)
    try {
      const good = await fetch(`${running.origin}/api/snapshot`)
      expect(good.status).toBe(200)
      expect(good.headers.get("access-control-allow-origin")).toBeNull()
      const first = await good.json() as { state: { status: string } }
      expect(first.state.status).toBe("running")
      const origin = await fetch(`${running.origin}/api/snapshot`, { headers: { origin: running.origin } })
      expect(origin.status).toBe(200)
      expect((await fetch(`${running.origin}/api/snapshot`, { headers: { origin: "http://evil.test" } })).status).toBe(403)
      expect((await fetch(`${running.origin}/api/snapshot`, { headers: { host: "evil.test" } })).status).toBe(403)
      expect((await fetch(`${running.origin}/api/snapshot`, { method: "POST" })).status).toBe(405)
      expect((await fetch(`${running.origin}/api/snapshot/../secret`)).status).toBe(404)
      expect((await fetch(`${running.origin}/api/snapshot?path=../../secret`)).status).toBe(400)
      await writeFile(join(store, "state.json"), JSON.stringify({ ...(await Bun.file(join(store, "state.json")).json()), status: "completed", completedAt: "2026-01-01T00:01:00.000Z", stars: 2 }))
      const refreshed = await (await fetch(`${running.origin}/api/snapshot`)).json() as { state: { status: string; stars: number }; processAlive: boolean }
      expect(refreshed.state).toMatchObject({ status: "completed", stars: 2 })
      expect(refreshed.processAlive).toBe(false)
      expect((await fetch(running.origin)).status).toBe(200)
    } finally { running.server.stop() }
  })

  test("shows source-backed analysis separately from confirmed bugs and strips raw fields", async () => {
    const { root, store, repo } = await fixture()
    const ref = { path: "value.ts", startLine: 1, endLine: 1, excerpt: "export const value = 1" }
    const analysis = {
      evidence: [ref], flow: "The consumer imports the immutable value.", responsibilities: ["The module owns the constant."],
      invariants: ["Imports observe one value."], scenarios: ["Multiple consumers import the module."], counterevidence: ["No current behavioral failure demonstrated."],
      opportunities: [{ title: "Document the internal ownership", evidence: [ref], expectedBenefit: "Keep consumers aligned.", tradeoffs: ["Documentation upkeep"], validationPlan: ["Review consumers and unchanged behavior"], prompt: "PRIVATE_OPPORTUNITY_PROMPT" }],
      stdout: "PRIVATE_ANALYSIS_STDOUT",
    }
    await writeFile(join(store, "events.jsonl"), JSON.stringify({ at: "2026-01-01T00:00:00.000Z", type: "analysis_recorded", runId: "run-1", attemptId: "attempt-analysis", agentKey: "agent-1", scope: ".", baselineSha: repo.baselineSha, analysis }) + "\n")
    const snapshot = await readDashboardSnapshot(root)
    expect(snapshot.events[0]?.baselineSha).toBe(repo.baselineSha)
    expect(snapshot.events[0]?.analysis?.flow).toBe(analysis.flow)
    expect(snapshot.events[0]?.analysis?.opportunities[0]?.expectedBenefit).toBe("Keep consumers aligned.")
    expect(snapshot.totals).toEqual({ stars: 0, solutionStars: 0, commits: 0, decisions: 0 })
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_ANALYSIS_STDOUT")
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_OPPORTUNITY_PROMPT")
  })

  test("exposes tournament decisions without leaking raw agent fields or granting selection stars", async () => {
    const { root, store, repo } = await fixture()
    const topic = { kind: "opportunity", id: "candidate-1", scope: ".", baselineSha: repo.baselineSha, prompt: "PRIVATE_TOPIC" }
    const common = { at: "2026-01-01T00:00:00.000Z", runId: "run-1", roundId: "round-1", topic, baselineSha: repo.baselineSha }
    const proposal = { rootCause: "duplicated ownership", invariant: "one owner", ownership: "module", lifecycle: "paired", tradeoffs: "review cost", approvedPaths: ["value.ts"], alternatives: ["keep"], testPlan: ["compare consumers"], stdout: "PRIVATE_PROPOSAL" }
    await writeFile(join(store, "events.jsonl"), [
      { ...common, type: "solution_round_started", slots: 3 },
      { ...common, type: "solution_proposal", slot: 1, agentKey: "solver-1", attemptId: "s1", status: "propose", reason: "source-backed", proposal, contribution: "one owner", command: ["PRIVATE_COMMAND"] },
      { ...common, type: "solution_proposal", slot: 2, agentKey: "solver-2", attemptId: "s2", status: "abstain", reason: "no distinct alternative" },
      { ...common, type: "solution_selected", mode: "winner", reason: "simplest architecture", proposal, contributors: [{ agentKey: "solver-1", attemptId: "s1", contribution: "one owner", prompt: "PRIVATE_CONTRIBUTION" }] },
      { ...common, type: "solution_parked", reason: "benefit proof pending", worktree: "/tmp/decision-1", branch: "codex/decision-1" },
    ].map((item) => JSON.stringify(item)).join("\n") + "\n")
    const snapshot = await readDashboardSnapshot(root)
    expect(snapshot.events).toHaveLength(5)
    expect(snapshot.events[1]).toMatchObject({ roundId: "round-1", slot: 1, status: "propose", contribution: "one owner", proposal: { invariant: "one owner" } })
    expect(snapshot.events[2]?.status).toBe("abstain")
    expect(snapshot.events[3]?.contributors).toEqual([{ agentKey: "solver-1", attemptId: "s1", contribution: "one owner" }])
    expect(snapshot.totals.stars).toBe(0)
    expect(snapshot.totals.solutionStars).toBe(0)
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_")
  })

  test("counts solution awards separately only with complete ordered provenance, once across rounds", async () => {
    const { root, store, repo } = await fixture()
    const ref = { path: "value.ts", startLine: 1, endLine: 1, excerpt: "export const value = 1" }
    const topic = { kind: "bug", id: "root:key", scope: ".", baselineSha: repo.baselineSha, paths: ["value.ts"], evidence: [ref], description: "fixture defect" }
    const common = { at: "2026-01-01T00:00:00.000Z", runId: "run-1", cycle: 1, roundId: "round-1", topic, baselineSha: repo.baselineSha }
    const proposal = { baseSha: repo.baselineSha, approvedPaths: ["value.ts"], changeType: "internal-fix", rootCause: "one wrong value", invariant: "correct value", ownership: "module", lifecycle: "unchanged", tradeoffs: "none", alternatives: ["keep wrong value"], testPlan: ["assert value"], requiresHumanDecision: false, contractChange: false, apiChange: false, ownershipChange: false, adHoc: false, hotfix: false, migration: false }
    const commitSha = "a".repeat(40)
    const contributors = [{ candidateId: "candidate-1", agentKey: "solver-1", attemptId: "s1", profileId: "lifecycle", profileVersion: 1, contribution: "correct invariant" }]
    const award = { ...common, type: "solution_awarded", awardKey: "root:key\u0000" + commitSha, canonicalRootCauseKey: "root:key", commitSha, mode: "winner", allocations: [{ agentKey: "solver-1", attemptId: "s1", profileId: "lifecycle", profileVersion: 1, points: 1 }] }
    const chain = [
      { ...common, type: "solution_round_started", slots: 3 },
      { ...common, type: "solution_proposal", slot: 1, candidateId: "candidate-1", agentKey: "solver-1", attemptId: "s1", profileId: "lifecycle", profileVersion: 1, status: "propose", reason: "minimal root fix", evidence: [ref], proposal, contribution: "correct invariant" },
      { ...common, type: "solution_selected", mode: "winner", reason: "best", evidence: [ref], proposal, contributors },
      { ...common, type: "verification_passed", solutionContributions: [{ attemptId: "s1", implemented: true, evidence: [ref] }] },
      { ...common, type: "fix_committed", canonicalRootCauseKey: "root:key", commitSha },
      award,
    ]
    // A premature award and its duplicate cannot inflate an eventual valid award.
    await writeFile(join(store, "events.jsonl"), [award, ...chain, award, ...chain.map((event) => ({ ...event, roundId: "another-round" }))].map((item) => JSON.stringify(item)).join("\n") + "\n")
    const snapshot = await readDashboardSnapshot(root)
    expect(snapshot.totals.solutionStars).toBe(1)
    expect(snapshot.totals.stars).toBe(0)
    expect(snapshot.agents.find((agent) => agent.agentKey === "solver-1")).toMatchObject({ stars: 0, solutionStars: 1 })
    // A parked improvement with an otherwise identical forged chain earns zero.
    await writeFile(join(store, "events.jsonl"), chain.map((event) => JSON.stringify({ ...event, topic: { ...topic, kind: "opportunity" } })).join("\n") + "\n")
    expect((await readDashboardSnapshot(root)).totals.solutionStars).toBe(0)
  })

  test("separates persistent profile scores from assignment attempts and unmapped historical identities", async () => {
    const { root, store } = await fixture()
    const common = { at: "2026-01-01T00:00:00.000Z", runId: "run-1", profileId: "lifecycle", profileVersion: 1 }
    const events = [
      { ...common, type: "agent_started", role: "investigator", agentKey: "profile-lifecycle", attemptId: "new-attempt", scope: "src/new.ts", model: "gpt-6-astra", effort: "high", prompt: "PRIVATE_START" },
      { ...common, type: "profile_outcome", channel: "discovery", status: "eligible", agentKey: "profile-lifecycle", attemptId: "new-attempt" },
      { ...common, type: "star_awarded", investigatorAgentKey: "profile-lifecycle", investigatorAttemptId: "new-attempt", canonicalRootCauseKey: "one-discovery" },
    ]
    await writeFile(join(store, "events.jsonl"), events.map((item) => JSON.stringify(item)).join("\n") + "\n")
    const snapshot = await readDashboardSnapshot(root)
    expect(snapshot.profiles).toHaveLength(4)
    expect(snapshot.profiles.find((profile) => profile.profileId === "lifecycle")).toMatchObject({ discoveryStars: 1, discoveryAttempts: 1, discoveryInvitations: 1, discoveryScore: 2 / 3 })
    expect(snapshot.attempts.find((attempt) => attempt.attemptId === "new-attempt")).toMatchObject({ profileId: "lifecycle", scope: "src/new.ts", status: "in_progress", model: "gpt-6-astra", effort: "high" })
    expect(snapshot.agents.find((agent) => agent.agentKey === "agent-1")?.profileId).toBeUndefined()
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_START")
    events.push({ ...common, type: "agent_receipt", role: "investigator", agentKey: "profile-lifecycle", attemptId: "new-attempt", scope: "src/new.ts", model: "gpt-6-astra", effort: "high", prompt: "PRIVATE_END" })
    await writeFile(join(store, "events.jsonl"), events.map((item) => JSON.stringify(item)).join("\n") + "\n")
    expect((await readDashboardSnapshot(root)).attempts.find((attempt) => attempt.attemptId === "new-attempt")?.status).toBe("finished_receipt_unavailable")
  })

  test("does not publish partial ledger counts as exact lifetime metrics", async () => {
    const { root, store } = await fixture()
    const award = JSON.stringify({ type: "star_awarded", runId: "run-1", at: "2026-01-01T00:00:00.000Z", canonicalRootCauseKey: "one" }) + "\n"
    await writeFile(join(store, "events.jsonl"), award + JSON.stringify({ type: "verification_failed", checks: "x".repeat(9 * 1024 * 1024) }) + "\n")
    const partial = await readDashboardSnapshot(root)
    expect(partial.historyComplete).toBe(false)
    expect(partial.totals).toEqual({ stars: null, solutionStars: null, commits: null, decisions: null })
    expect(partial.state?.stars).toBe(1)
    await writeFile(join(store, "events.jsonl"), award)
    const complete = await readDashboardSnapshot(root)
    expect(complete.historyComplete).toBe(true)
    expect(complete.totals.stars).toBe(1)
  })

  test("exposes auditable profile invitation metrics without exposing strategy prompts", async () => {
    const { root, store } = await fixture()
    const event = { type: "profile_selection", runId: "run-1", at: "2026-01-01T00:00:00.000Z", channel: "solution", formula: "(stars + 1) / (eligibleAttempts + 2)", tieBreak: "score descending; fixed order; exploration", selected: [{ profileId: "lifecycle", profileVersion: 1, label: "Lifecycle", reason: "weighted", score: 0.75, eligibleAttempts: 2, invitations: 3, strategy: "PRIVATE_STRATEGY" }] }
    await writeFile(join(store, "events.jsonl"), JSON.stringify(event) + "\n")
    const snapshot = await readDashboardSnapshot(root)
    expect(snapshot.events[0]).toMatchObject({ channel: "solution", formula: event.formula, tieBreak: event.tieBreak, selected: [{ profileId: "lifecycle", profileVersion: 1, label: "Lifecycle", reason: "weighted", score: 0.75, eligibleAttempts: 2, invitations: 3 }] })
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_STRATEGY")
  })

  test("labels controller-extracted quote provenance without exposing raw metadata", async () => {
    const { root, store, repo } = await fixture()
    const path = join(store, "runs", "run-1", "receipts", "agent-1", "attempt-1.json")
    const receipt = await Bun.file(path).json()
    receipt.evidenceProvenance = { kind: "controller-extracted", baselineSha: repo.baselineSha, readScope: "src", references: [], prompt: "PRIVATE_PROVENANCE" }
    await writeFile(path, JSON.stringify(receipt))
    const snapshot = await readDashboardSnapshot(root)
    expect(snapshot.receipts[0]?.evidenceProvenance).toEqual({ kind: "controller-extracted", baselineSha: repo.baselineSha })
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_PROVENANCE")
    receipt.evidenceProvenance = { ...receipt.evidenceProvenance, snapshotKind: "post-apply", snapshotId: "a".repeat(64) }
    await writeFile(path, JSON.stringify(receipt))
    expect((await readDashboardSnapshot(root)).receipts[0]?.evidenceProvenance).toEqual({ kind: "controller-extracted", baselineSha: repo.baselineSha, snapshotKind: "post-apply", snapshotId: "a".repeat(64) })
    receipt.evidenceProvenance.baselineSha = "untrusted prose"
    await writeFile(path, JSON.stringify(receipt))
    expect((await readDashboardSnapshot(root)).receipts[0]?.evidenceProvenance).toBeUndefined()
    const html = await Bun.file(join(import.meta.dir, "dashboard.html")).text()
    expect(html).toContain("Esto no acredita su lectura ni confirma la interpretación o el fallo.")
  })

  test("represents missing state as unknown instead of inventing a run", async () => {
    const { root, store } = await fixture()
    await rm(join(store, "state.json"))
    const snapshot = await readDashboardSnapshot(root)
    expect(snapshot.state).toBeNull()
    expect(snapshot.processAlive).toBeNull()
    expect(snapshot.warnings).toContain("state unavailable")
  })

  test("does not mistake an unrelated live PID for the audit runner", async () => {
    const { root, store } = await fixture()
    const unrelated = Bun.spawn(["sleep", "30"], { stdout: "ignore", stderr: "ignore" })
    try {
      const state = await Bun.file(join(store, "state.json")).json() as Record<string, unknown>
      state.pid = unrelated.pid
      await writeFile(join(store, "state.json"), JSON.stringify(state))
      await writeFile(join(store, "lock", "owner.json"), JSON.stringify({ runId: "run-1", pid: unrelated.pid }))
      const snapshot = await readDashboardSnapshot(root)
      expect(snapshot.processAlive).toBeNull()
      expect(snapshot.warnings.some((warning) => warning.includes("executable identity"))).toBe(true)
    } finally {
      try { process.kill(unrelated.pid, "SIGTERM") } catch { /* already exited */ }
      await unrelated.exited
    }
  })

  test("parses bounded dashboard arguments without starting a server", () => {
    expect(parseDashboardArgs([])).toEqual({ help: false, port: 4318 })
    expect(parseDashboardArgs(["--port", "4320"])).toEqual({ help: false, port: 4320 })
    expect(parseDashboardArgs(["--help"])).toEqual({ help: true, port: 4318 })
    expect(() => parseDashboardArgs(["--port", "0"])).toThrow()
  })
})
