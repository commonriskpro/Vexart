import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createWorktree, detectRepo, runProcess, changedPaths, snapshotPaths } from "./git"
import { commitVerifiedFix, loadLessons, loadStarKeys, prepareDependencies, recordInvestigationAnalysis, validateFinding } from "./index"

import { parseInvestigator } from "./types"

const fixtures: string[] = []

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "vexart-audit-loop-"))
  fixtures.push(root)
  await runProcess(["git", "init", "-q"], root)
  await runProcess(["git", "config", "user.email", "audit@example.test"], root)
  await runProcess(["git", "config", "user.name", "audit-test"], root)
  await writeFile(join(root, "value.ts"), "export const value = 1\n")
  await runProcess(["git", "add", "--", "value.ts"], root)
  const committed = await runProcess(["git", "commit", "-m", "baseline"], root)
  if (committed.code !== 0) throw new Error(committed.stderr)
  return { root, repo: await detectRepo(root) }
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("audit loop repository invariants", () => {
  test("commits exactly approved named paths and advances the audit baseline", async () => {
    const { root, repo } = await fixture()
    const initial = repo.baselineSha
    const store = join(repo.commonDir, "audit-loop")
    const id = "commit-invariant"
    const worktreeInfo = await createWorktree(repo, store, id)
    const state = { id, pid: process.pid, root: repo.root, commonDir: repo.commonDir, store, initialBaselineSha: repo.baselineSha, baselineSha: repo.baselineSha, dirtyExcluded: [], branch: worktreeInfo.branch, worktree: worktreeInfo.worktree, cycles: 1, minutes: 1, startedAt: new Date().toISOString(), deadlineAt: new Date(Date.now() + 60_000).toISOString(), status: "running" as const, phase: "verifying" as const, cycle: 1, stars: 1, findings: ["fixture:key"] }
    await writeFile(join(worktreeInfo.worktree, "value.ts"), "export const value = 2\n")
    const finding = { id: "fixture", canonicalRootCauseKey: "fixture:key", scope: ".", summary: "fixture correction", impact: "fixture", evidence: [{ path: "value.ts", startLine: 1, endLine: 1, excerpt: "export const value = 1" }], expectedContract: "value changes", reproduction: { command: ["printf", "fixture"], exitCode: 0, output: "fixture", observed: true }, paths: ["value.ts"] }
    const reviewed = await snapshotPaths(worktreeInfo.worktree, ["value.ts"])
    await writeFile(join(worktreeInfo.worktree, "value.ts"), "export const value = 3\n")
    await expect(commitVerifiedFix(state, repo, finding, ["value.ts"], reviewed)).rejects.toThrow("reviewed content changed")
    await writeFile(join(worktreeInfo.worktree, "value.ts"), "export const value = 2\n")
    const sha = await commitVerifiedFix(state, repo, finding, ["value.ts"], reviewed)
    expect(sha).not.toBe(initial)
    expect(state.baselineSha).toBe(sha)
    expect(await changedPaths(worktreeInfo.worktree)).toEqual([])
    const log = await runProcess(["git", "log", "-1", "--format=%s"], worktreeInfo.worktree)
    expect(log.stdout.trim()).toContain("audit(fixture)")
  })

  test("deduplicates canonical stars and preserves bounded improvement lessons", async () => {
    const { repo } = await fixture()
    const store = join(repo.commonDir, "audit-loop")
    await mkdir(store, { recursive: true })
    await Bun.write(join(store, "events.jsonl"), [
      JSON.stringify({ type: "star_awarded", canonicalRootCauseKey: "fixture:key" }),
      JSON.stringify({ type: "star_awarded", canonicalRootCauseKey: "fixture:key" }),
      JSON.stringify({ type: "negative_result", reason: "false positive retained" }),
      JSON.stringify({ type: "verification_failed", correction: 0, verifier: { regressions: ["regression retained"] } }),
      JSON.stringify({ type: "coverage", status: "scope skipped" }),
    ].join("\n") + "\n")
    expect([...await loadStarKeys(store)]).toEqual(["fixture:key"])
    const lessons = await loadLessons(store)
    expect(lessons.some((lesson) => lesson.includes("false positive retained"))).toBe(true)
    expect(lessons.some((lesson) => lesson.includes("regression retained"))).toBe(true)
    expect(lessons.some((lesson) => lesson.includes("scope skipped"))).toBe(true)
  })

  test("source analysis survives negative, blocked, and rejected candidates without approval", async () => {
    const { repo } = await fixture()
    const store = join(repo.commonDir, "audit-loop")
    await mkdir(store, { recursive: true })
    const analysis = { evidence: [{ path: "value.ts", startLine: 1, endLine: 1, excerpt: "export const value = 1" }], flow: "value.ts exports a constant to its importers", responsibilities: ["module owns the constant"], invariants: ["all importers share one value"], scenarios: ["import the constant"], counterevidence: ["no runtime mutation is present"], opportunities: [{ title: "Inspect importer duplication", evidence: [{ path: "value.ts", startLine: 1, endLine: 1, excerpt: "export const value = 1" }], expectedBenefit: "could remove duplicated values if callers establish duplication", tradeoffs: ["no benefit if callers already reuse this export"], validationPlan: ["inspect actual importer source before proposing changes"] }] }
    const context = { store, runId: "analysis-run", cycle: 1, scope: ".", agentKey: "analysis-agent", attemptId: "negative-attempt" }
    const negative = { kind: "investigator", status: "negative", scope: ".", strategy: "flow", analysis, finding: null, negative: "no proven defect", disadvantages: [] }
    await recordInvestigationAnalysis(repo, context, negative, 0)
    expect(parseInvestigator(negative)?.finding).toBeNull()
    await recordInvestigationAnalysis(repo, { ...context, attemptId: "blocked-attempt" }, { ...negative, status: "blocked" }, 0)
    const finding = { id: "candidate", canonicalRootCauseKey: "value:unproven", scope: ".", summary: "unproven", impact: "unknown", evidence: analysis.evidence, expectedContract: "unestablished", reproduction: { command: ["bun", "test"], exitCode: 1, output: "assertion", observed: true }, paths: ["value.ts"] }
    await recordInvestigationAnalysis(repo, { ...context, attemptId: "rejected-attempt" }, { ...negative, status: "finding", negative: null, finding }, 0)
    expect(await validateFinding(repo, finding, "")).toContain("matching failing")
    // Malformed candidate syntax must not erase independently valid source analysis either.
    await recordInvestigationAnalysis(repo, { ...context, attemptId: "malformed-attempt" }, { ...negative, status: "finding", finding: {} }, 0)
    const events = (await readFile(join(store, "events.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line))
    expect(events).toHaveLength(4)
    expect(events.every((event) => event.type === "analysis_recorded" && event.baselineSha === repo.baselineSha)).toBe(true)
    expect(events[0]).toMatchObject({ runId: context.runId, cycle: 1, scope: ".", agentKey: context.agentKey, attemptId: context.attemptId, analysis })
    expect([...await loadStarKeys(store)]).toEqual([])
    expect(events.some((event) => ["star_awarded", "fix_committed", "gate_approved"].includes(event.type))).toBe(false)
    expect(await changedPaths(repo.root)).toEqual([])
    // Summaries keep attribution even when prose is too large for the old raw JSON slice.
    await recordInvestigationAnalysis(repo, { ...context, attemptId: "long-attempt" }, { ...negative, analysis: { ...analysis, flow: "source flow ".repeat(1_000) } }, 0)
    const lesson = JSON.parse((await loadLessons(store)).at(-1)!)
    expect(lesson).toMatchObject({ lesson: "DATA_ONLY", historical: true, event: { baselineSha: repo.baselineSha, runId: context.runId, agentKey: context.agentKey, attemptId: "long-attempt" } })
    expect(lesson.event.analysis.flow.length).toBeLessThanOrEqual(320)
    expect(lesson.event.analysis.opportunities[0].evidence[0].path).toBe("value.ts")
  })

  test("analysis rejects absent, malformed, stale, unsafe, and out-of-scope evidence", async () => {
    const { repo } = await fixture()
    const store = join(repo.commonDir, "audit-loop")
    await mkdir(store, { recursive: true })
    const evidence = [{ path: "value.ts", startLine: 1, endLine: 1, excerpt: "export const value = 1" }]
    const analysis = { evidence, flow: "source export", responsibilities: ["owns constant"], invariants: ["immutable"], scenarios: ["import"], counterevidence: [], opportunities: [] }
    const context = { store, runId: "invalid-analysis", cycle: 1, scope: ".", agentKey: "agent", attemptId: "attempt" }
    const cases = [
      { response: {}, readScope: "." },
      { response: { analysis: { ...analysis, extra: true } }, readScope: "." },
      { response: { analysis: { ...analysis, evidence: [{ ...evidence[0], excerpt: "stale source" }] } }, readScope: "." },
      { response: { analysis: { ...analysis, evidence: [{ ...evidence[0], path: "scripts/audit-loop/index.ts" }] } }, readScope: "." },
      { response: { analysis }, readScope: "other.ts" },
      { response: { analysis: { ...analysis, opportunities: [{ title: "unsupported", evidence: [{ ...evidence[0], excerpt: "invented" }], expectedBenefit: "unknown", tradeoffs: ["unknown"], validationPlan: ["inspect source"] }] } }, readScope: "." },
    ]
    for (const item of cases) await recordInvestigationAnalysis(repo, context, item.response, 0, item.readScope)
    await recordInvestigationAnalysis(repo, context, { analysis }, 1)
    const events = (await readFile(join(store, "events.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line))
    expect(events).toHaveLength(cases.length + 1)
    expect(events.every((event) => event.type === "analysis_rejected" && event.reason && !event.analysis)).toBe(true)
    expect([...await loadStarKeys(store)]).toEqual([])
  })

  test("relocates internal absolute dependency links without mutating the source", async () => {
    const { root, repo } = await fixture()
    await mkdir(join(root, "node_modules", "nested", "deep"), { recursive: true })
    const sourceLink = join(root, "node_modules", "nested", "deep", "internal")
    await symlink(join(root, "node_modules"), sourceLink)
    const store = join(repo.commonDir, "audit-loop")
    const worktreeInfo = await createWorktree(repo, store, "dependency-links")
    await prepareDependencies(repo, worktreeInfo.worktree)
    expect(await readlink(sourceLink)).toBe(join(root, "node_modules"))
    const copiedLink = join(worktreeInfo.worktree, "node_modules", "nested", "deep", "internal")
    expect(await readlink(copiedLink)).not.toBe(join(root, "node_modules"))
    expect(await realpath(copiedLink)).toBe(await realpath(join(worktreeInfo.worktree, "node_modules")))
  })

  test("rejects nested dependency links that resolve externally", async () => {
    const { root, repo } = await fixture()
    await mkdir(join(root, "node_modules", "nested", "deep"), { recursive: true })
    const external = join(tmpdir(), `vexart-audit-loop-external-${crypto.randomUUID()}`)
    const bridge = join(root, "node_modules", "nested", "bridge")
    await symlink(external, bridge)
    await symlink(bridge, join(root, "node_modules", "nested", "deep", "leak"))
    const store = join(repo.commonDir, "audit-loop")
    const worktreeInfo = await createWorktree(repo, store, "dependency-links-external")
    await expect(prepareDependencies(repo, worktreeInfo.worktree)).rejects.toThrow("escapes worktree")
  })
})
