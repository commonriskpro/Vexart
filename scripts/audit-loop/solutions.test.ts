import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createWorktree, detectRepo, runProcess, worktreeClean } from "./git"
import { agentCommand, agentTimeout, evaluatorPrompt, freezeContributionEvidence, jsonSchema, parkSolution, saveAgentReceipt, solutionTimeout } from "./index"
import { awardSolution, blindCandidates, contributionsImplemented, parseEvaluation, parseSolver, proposalScopeError, selectSolution, validatedSolutionAwards, type Evaluation, type SolutionRound, type SolutionSelection, type SolutionSubmission } from "./solutions"
import { profileStats } from "./profiles"
import { parseVerifier, type AgentReceipt, type Proposal, type RunState } from "./types"

const sha = "a".repeat(40)
const commit = "b".repeat(40)
const evidence = [{ path: "value.ts", startLine: 1, endLine: 1, excerpt: "export const value = 1" }]
const proposal = (baseSha = sha): Proposal => ({ baseSha, approvedPaths: ["value.ts"], changeType: "internal-fix", rootCause: "producer value invariant", invariant: "one value per consumer", ownership: "module owns value", lifecycle: "no resource transfer", tradeoffs: "preserve source contract", alternatives: ["leave unchanged"], testPlan: ["test actual consumer"], requiresHumanDecision: false, contractChange: false, apiChange: false, ownershipChange: false, adHoc: false, hotfix: false, migration: false })
const round = (baselineSha = sha, kind: "bug" | "opportunity" = "bug"): SolutionRound => ({ runId: "run", cycle: 1, roundId: "round", baselineSha, topic: { kind, id: "root-key", scope: ".", baselineSha, paths: ["value.ts"], evidence, description: "source-backed fixture" } })
const submission = (slot = 1, baselineSha = sha): SolutionSubmission => ({ kind: "solver", status: "propose", baseSha: baselineSha, reason: "source-backed proposal", evidence, contribution: slot === 1 ? "preserve producer invariant" : "preserve consumer ordering", proposal: { ...proposal(baselineSha), rootCause: `root ${slot}` }, slot, candidateId: `candidate-${slot}`, agentKey: `agent-${slot}`, attemptId: `attempt-${slot}`, profileId: slot === 1 ? "lifecycle" : "contract-flow", profileVersion: 1 })
const evaluation = (candidate = submission()): Evaluation => ({ kind: "solution_evaluator", baseSha: candidate.baseSha, mode: "winner", reason: `${candidate.candidateId}: best invariant-preserving change, cost retained`, evidence, proposal: candidate.proposal, contributions: [{ candidateId: candidate.candidateId, contribution: candidate.contribution! }] })
const selected = (context = round(), candidate = submission()) => selectSolution(context, [candidate], evaluation(candidate)).selection!
const sequence = (context = round(), candidates = [submission()], selection = selected(context, candidates[0])): unknown[] => [
  { ...context, type: "solution_round_started", slots: 3 },
  ...candidates.flatMap((candidate) => [
    { type: "agent_started", runId: context.runId, role: "solver", agentKey: candidate.agentKey, attemptId: candidate.attemptId, profileId: candidate.profileId, profileVersion: candidate.profileVersion },
    { type: "profile_outcome", runId: context.runId, channel: "solution", status: context.topic.kind === "bug" ? "eligible" : "opportunity", agentKey: candidate.agentKey, attemptId: candidate.attemptId, profileId: candidate.profileId, profileVersion: candidate.profileVersion },
    { ...candidate, ...context, type: "solution_proposal" },
  ]),
  { ...context, ...selection, type: "solution_selected" },
  { ...context, type: "verification_passed", solutionSnapshotId: "frozen-hash", solutionContributions: selection.contributors.map((item) => ({ attemptId: item.attemptId, implemented: true, evidence })) },
  { ...context, type: "fix_committed", canonicalRootCauseKey: context.topic.id, commitSha: commit },
]
const award = (context = round(), selection = selected()) => ({ ...context, type: "solution_awarded", mode: selection.mode, canonicalRootCauseKey: context.topic.id, commitSha: commit, awardKey: `${context.topic.id}\u0000${commit}`, allocations: selection.contributors.map((item) => ({ agentKey: item.agentKey, attemptId: item.attemptId, profileId: item.profileId, profileVersion: item.profileVersion, points: selection.mode === "winner" ? 1 : 0.5 })) })
const fixtures: string[] = []
afterEach(async () => { await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })
const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "audit-solutions-")); fixtures.push(root)
  await runProcess(["git", "init", "-q"], root)
  await runProcess(["git", "config", "user.email", "audit@example.test"], root)
  await runProcess(["git", "config", "user.name", "audit-test"], root)
  await writeFile(join(root, "value.ts"), "export const value = 1\n")
  await runProcess(["git", "add", "--", "value.ts"], root)
  const result = await runProcess(["git", "commit", "-qm", "baseline"], root)
  if (result.code) throw new Error(result.stderr)
  return { root, repo: await detectRepo(root) }
}

describe("bounded independent solution competition", () => {
  test("strict parsers permit abstention but reject fabricated attribution and malformed proposals", () => {
    const candidate = submission()
    const raw = { kind: candidate.kind, status: candidate.status, baseSha: candidate.baseSha, reason: candidate.reason, evidence: candidate.evidence, contribution: candidate.contribution, proposal: candidate.proposal }
    expect(parseSolver(raw)).toEqual(raw)
    expect(parseSolver({ ...raw, agentKey: "agent-claimed" })).toBeNull()
    expect(parseSolver({ ...raw, status: "abstain", contribution: null, proposal: null, evidence: [] })?.status).toBe("abstain")
    expect(parseSolver({ ...raw, status: "abstain" })).toBeNull()
    expect(parseEvaluation(evaluation())).toEqual(evaluation())
    expect(parseEvaluation({ ...evaluation(), mode: "none", proposal: null, contributions: [] })?.mode).toBe("none")
    expect(parseEvaluation({ ...evaluation(), profileId: "lifecycle" })).toBeNull()
  })

  test("winner selection must retain exact plan, baseline, scope, candidate and contribution", () => {
    expect(selected().contributors[0]).toMatchObject({ agentKey: "agent-1", attemptId: "attempt-1", profileId: "lifecycle", profileVersion: 1 })
    for (const changed of [
      { ...evaluation(), baseSha: "stale" },
      { ...evaluation(), proposal: { ...proposal(), rootCause: "new unsubmitted plan" } },
      { ...evaluation(), proposal: { ...submission().proposal!, approvedPaths: ["other.ts"] } },
      { ...evaluation(), contributions: [{ candidateId: "foreign", contribution: "preserve producer invariant" }] },
      { ...evaluation(), contributions: [{ candidateId: "candidate-1", contribution: "invented contribution" }] },
    ]) expect(selectSolution(round(), [submission()], changed).selection).toBeNull()
    expect(selectSolution(round(), [{ ...submission(), status: "abstain", proposal: null, contribution: null, evidence: [] }], evaluation()).selection).toBeNull()
    expect(proposalScopeError(round().topic, { ...proposal(), hotfix: true })).toContain("unsafe")
  })

  test("synthesis requires two distinct actual contributions, not cosmetic attribution", () => {
    const candidates = [submission(), submission(2)]
    const comparison: Evaluation = { ...evaluation(), mode: "synthesis", proposal: { ...proposal(), rootCause: "combined producer invariant and consumer ordering" }, contributions: candidates.map((item) => ({ candidateId: item.candidateId, contribution: item.contribution! })) }
    const selection = selectSolution(round(), candidates, comparison).selection!
    expect(selection.contributors).toHaveLength(2)
    expect(selectSolution(round(), candidates, { ...comparison, contributions: comparison.contributions.slice(0, 1) }).selection).toBeNull()
    expect(selectSolution(round(), candidates, { ...comparison, proposal: candidates[0].proposal }).selection).toBeNull()
    expect(selectSolution(round(), candidates, { ...comparison, contributions: [comparison.contributions[0], comparison.contributions[0]] }).selection).toBeNull()
    const confirmations = selection.contributors.map((item) => ({ attemptId: item.attemptId, implemented: true, evidence }))
    expect(contributionsImplemented(selection, confirmations)).toBe(true)
    expect(contributionsImplemented(selection, confirmations.slice(0, 1))).toBe(false)
    expect(contributionsImplemented(selection, [{ ...confirmations[0], implemented: false }, confirmations[1]])).toBe(false)
    const events = [...sequence(round(), candidates, selection), award(round(), selection)]
    expect(validatedSolutionAwards(events)[0].allocations.map((item) => item.points)).toEqual([0.5, 0.5])
  })

  test("blind evaluator sees opaque candidates but no profile, attempt, agent or score data", () => {
    const candidates = [submission(), submission(2)]
    const prompt = evaluatorPrompt(round().topic, candidates)
    for (const forbidden of ["agent-1", "attempt-1", '"profileId"', '"profileVersion"', '"discoveryStars"', '"solutionStars"']) expect(prompt).not.toContain(forbidden)
    expect(blindCandidates(candidates)[0]).toHaveProperty("candidateId", "candidate-1")
    expect(prompt).toContain("EVERY candidate")
  })

  test("new agents use required models, read-only sandboxes, ref-only schemas and bounded timeouts", () => {
    for (const role of ["solver", "solution_evaluator"] as const) {
      const command = agentCommand(role, "/worktree", "/schema", "/message", "prompt")
      expect(command[command.indexOf("-m") + 1]).toBe("gemini-3.8-flash-high")
      expect(command).toContain('model_provider="audit_cpamc"')
      expect(command[command.indexOf("-s") + 1]).toBe("read-only")
      expect(JSON.stringify(jsonSchema(role))).not.toContain('"excerpt":')

      const legacy = agentCommand(role, "/worktree", "/schema", "/message", "prompt", { provider: "codex", model: "gpt-6-astra", effort: "high" })
      expect(legacy[legacy.indexOf("-m") + 1]).toBe(role === "solver" ? "gpt-6-astra" : "gpt-5.6-luna")
      expect(legacy[legacy.indexOf("-c") + 1]).toBe(`model_reasoning_effort="${role === "solver" ? "high" : "xhigh"}"`)
    }
    expect(solutionTimeout(new Date(900_000).toISOString(), 0)).toBe(300_000)
    expect(solutionTimeout(new Date(30_000).toISOString(), 10_000)).toBe(20_000)
    expect(solutionTimeout(new Date(10_000).toISOString(), 20_000)).toBe(0)
    expect(agentTimeout(new Date(900_000).toISOString(), 0)).toBe(300_000)
    expect(agentTimeout(new Date(30_000).toISOString(), 10_000)).toBe(20_000)
    expect(agentTimeout(new Date(10_000).toISOString(), 20_000)).toBe(1)
  })

  test("reward replay requires ordered provenance, implementation and commit; replays award once", () => {
    const events = sequence()
    expect(validatedSolutionAwards([...events, award()])).toHaveLength(1)
    expect(profileStats([...events, award()])[0]).toMatchObject({ solutionStars: 1, solutionAttempts: 1, discoveryStars: 0 })
    expect(validatedSolutionAwards([...events, award(), ...events, award()])).toHaveLength(1)
    const foreign = [...events, award()].map((item) => ({ ...(item as Record<string, unknown>), roundId: "foreign-round", commitSha: "c".repeat(40), awardKey: `root-key\u0000${"c".repeat(40)}` }))
    expect(validatedSolutionAwards([...events, award(), ...foreign])).toHaveLength(1)
    expect(validatedSolutionAwards([award(), ...events])).toHaveLength(0)
    for (const type of ["solution_round_started", "solution_proposal", "solution_selected", "verification_passed", "fix_committed"]) expect(validatedSolutionAwards([...events.filter((item) => (item as { type: string }).type !== type), award()])).toHaveLength(0)
    expect(validatedSolutionAwards([...events, { ...award(), allocations: [{ ...award().allocations[0], points: 2 }] }])).toHaveLength(0)
    expect(validatedSolutionAwards([...events, { ...award(), runId: "foreign" }])).toHaveLength(0)
  })

  test("atomic persistence refuses premature and duplicate credit", async () => {
    const { root } = await fixture()
    await writeFile(join(root, "events.jsonl"), sequence().slice(0, -1).map((item) => JSON.stringify(item)).join("\n") + "\n")
    expect(await awardSolution(root, round(), selected(), commit)).toBeNull()
    await writeFile(join(root, "events.jsonl"), sequence().map((item) => JSON.stringify(item)).join("\n") + "\n")
    expect((await awardSolution(root, round(), selected(), commit))?.allocations[0].points).toBe(1)
    expect(await awardSolution(root, round(), selected(), commit)).toBeNull()
    expect((await readFile(join(root, "events.jsonl"), "utf8")).split("\n").filter((line) => line.includes('"type":"solution_awarded"'))).toHaveLength(1)
  })

  test("post-verifier references hydrate from frozen applied source, never old HEAD or later edits", async () => {
    const { root, repo } = await fixture()
    await writeFile(join(root, "value.ts"), "export const value = 2\n")
    const snapshot = await freezeContributionEvidence({ worktree: root, baselineSha: repo.baselineSha }, ["value.ts"])
    await writeFile(join(root, "value.ts"), "export const value = 3\n")
    const response = { kind: "verifier", verdict: "approved", findingId: "fixture", changedPaths: ["value.ts"], regressions: [], architecture: "same ownership", checks: ["regression"], reproduction: { command: ["bun", "test"], exitCode: 0, output: "pass", observed: true }, reason: "verified", solutionContributions: [{ attemptId: "attempt-1", implemented: true, evidence: [{ path: "value.ts", startLine: 1, endLine: 1 }] }] }
    const receipt: Omit<AgentReceipt, "response"> = { role: "verifier", attemptId: "verify", agentKey: "verifier", scope: ".", strategy: "verify", command: [], prompt: "fixture", startedAt: "start", endedAt: "end", exitCode: 0, stdout: "", stderr: "", responseText: JSON.stringify(response) }
    const saved = await saveAgentReceipt(join(root, "receipt.json"), snapshot, receipt)
    expect(parseVerifier(saved.response)?.solutionContributions[0].evidence[0].excerpt).toBe("export const value = 2")
    expect(saved.evidenceProvenance).toMatchObject({ kind: "controller-extracted", snapshotKind: "post-apply", snapshotId: snapshot.snapshotId })
    const failed = await saveAgentReceipt(join(root, "no-snapshot.json"), { root, baselineSha: repo.baselineSha, readScope: "." }, receipt)
    expect(failed.parseError).toContain("frozen post-apply snapshot")
  })

  test("opportunity selection parks a clean worktree/artifact without apply, denominator or reward", async () => {
    const { repo } = await fixture()
    const store = join(repo.commonDir, "audit-loop")
    const tree = await createWorktree(repo, store, "opportunity-fixture")
    const context = round(repo.baselineSha, "opportunity")
    const candidate = submission(1, repo.baselineSha)
    const selection = selected(context, candidate)
    const state: RunState = { id: "run", pid: process.pid, root: repo.root, commonDir: repo.commonDir, store, initialBaselineSha: repo.baselineSha, baselineSha: repo.baselineSha, dirtyExcluded: [], ...tree, cycles: 1, minutes: 1, startedAt: new Date().toISOString(), deadlineAt: new Date(Date.now() + 60_000).toISOString(), status: "running", phase: "evaluating", cycle: 1, stars: 0, findings: [] }
    const parked = await parkSolution(repo, state, context, selection, "human review only")
    expect(await worktreeClean(parked.worktree)).toBe(true)
    expect(await worktreeClean(state.worktree)).toBe(true)
    expect(JSON.parse(await readFile(parked.artifact, "utf8")).topic.kind).toBe("opportunity")
    expect(await awardSolution(store, context, selection, commit)).toBeNull()
    const events = [...sequence(context, [candidate], selection), award(context, selection)]
    expect(validatedSolutionAwards(events)).toHaveLength(0)
    expect(profileStats(events)[0]).toMatchObject({ solutionStars: 0, solutionAttempts: 0, solutionInvitations: 1 })
    expect(await readFile(join(store, "events.jsonl"), "utf8")).not.toContain("fix_committed")
  })
})
