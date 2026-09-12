import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createWorktree, detectRepo, runProcess, changedPaths, snapshotPaths } from "./git"
import { commitVerifiedFix, loadLessons, loadStarKeys, prepareDependencies } from "./index"

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

  test("rejects nested dependency links that escape the isolated worktree", async () => {
    const { root, repo } = await fixture()
    await mkdir(join(root, "node_modules", "nested", "deep"), { recursive: true })
    await symlink(root, join(root, "node_modules", "nested", "deep", "leak"))
    const store = join(repo.commonDir, "audit-loop")
    const worktreeInfo = await createWorktree(repo, store, "dependency-links")
    await expect(prepareDependencies(repo, worktreeInfo.worktree)).rejects.toThrow("escapes worktree")
  })
})
