import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { appendFileSync } from "node:fs"
import { appendFile, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readHistory } from "./history-db"
import { profileStats } from "./profiles"
import { validatedSolutionAwards } from "./solutions"

const fixtures: string[] = []
const fixture = async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "audit-history-")))
  fixtures.push(root)
  const store = join(root, "audit-loop")
  await mkdir(store)
  await writeFile(join(store, "events.jsonl"), "")
  return store
}
afterEach(async () => { await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })
const sanitize = (value: unknown) => {
  const item = value as Record<string, unknown> | null
  return item && typeof item.runId === "string" && typeof item.type === "string" ? { runId: item.runId, type: item.type, reason: typeof item.reason === "string" ? item.reason.slice(0, 100) : undefined } : null
}
const append = (store: string, events: unknown[]) => appendFile(join(store, "events.jsonl"), events.map((event) => JSON.stringify(event)).join("\n") + "\n")
const discovery = (id = "one", scope = "src/a.ts") => {
  const identity = { runId: `run-${id}`, profileId: "lifecycle", profileVersion: 1, agentKey: `agent-${id}`, attemptId: id }
  return [
    { ...identity, type: "agent_started", role: "investigator", scope },
    { ...identity, type: "profile_outcome", channel: "discovery", status: "eligible" },
    { ...identity, type: "star_awarded", canonicalRootCauseKey: `root-${id}`, investigatorAgentKey: identity.agentKey, investigatorAttemptId: id },
  ]
}
const solution = () => {
  const baselineSha = "a".repeat(40), commitSha = "b".repeat(40)
  const evidence = [{ path: "value.ts", startLine: 1, endLine: 1, excerpt: "const value = 1" }]
  const topic = { kind: "bug", id: "root-solution", scope: ".", baselineSha, paths: ["value.ts"], evidence, description: "source-backed" }
  const common = { runId: "run-solution", cycle: 1, roundId: "round", baselineSha }
  const identity = { agentKey: "solver", attemptId: "solver-attempt", profileId: "contract-flow", profileVersion: 1 }
  const proposal = { baseSha: baselineSha, approvedPaths: ["value.ts"], changeType: "internal-fix", rootCause: "wrong invariant", invariant: "correct value", ownership: "module", lifecycle: "unchanged", tradeoffs: "none", alternatives: ["keep"], testPlan: ["test consumer"], requiresHumanDecision: false, contractChange: false, apiChange: false, ownershipChange: false, adHoc: false, hotfix: false, migration: false }
  const contributor = { candidateId: "candidate", ...identity, contribution: "restore invariant" }
  return [
    { ...common, type: "solution_round_started", topic },
    { ...common, ...identity, type: "agent_started", role: "solver" },
    { ...common, ...identity, type: "solution_proposal", slot: 1, candidateId: "candidate", status: "propose", reason: "minimal", evidence, proposal, contribution: contributor.contribution },
    { ...common, type: "solution_selected", mode: "winner", reason: "best", evidence, proposal, contributors: [contributor] },
    { ...common, type: "verification_passed", solutionContributions: [{ attemptId: identity.attemptId, implemented: true, evidence }] },
    { ...common, type: "fix_committed", canonicalRootCauseKey: topic.id, commitSha },
    { ...common, type: "solution_awarded", mode: "winner", awardKey: `${topic.id}\u0000${commitSha}`, canonicalRootCauseKey: topic.id, commitSha, allocations: [{ ...identity, points: 1 }] },
    // The batch profile replay historically credits an award once an eligible
    // outcome eventually appears, even if that outcome follows the award.
    { ...common, ...identity, type: "profile_outcome", channel: "solution", status: "eligible" },
  ]
}

describe("incremental SQLite dashboard history", () => {
  test("restarts between invitation, outcome and credit with static expected counts across scopes", async () => {
    const store = await fixture()
    const events = [...discovery(), ...discovery("two", "native/second.rs")]
    for (let index = 0; index < events.length; index += 1) {
      await append(store, [events[index]])
      const view = await readHistory(store, sanitize)
      expect(view.historyComplete).toBe(true)
      expect(view.profiles).toEqual(profileStats(events.slice(0, index + 1)))
      expect(view.profiles[0].discoveryStars).toBe(index < 2 ? 0 : index < 5 ? 1 : 2)
      expect(view.profiles[0].discoveryAttempts).toBe(index < 1 ? 0 : index < 4 ? 1 : 2)
    }
    await append(store, events)
    const duplicate = await readHistory(store, sanitize)
    expect(duplicate.profiles[0]).toMatchObject({ discoveryStars: 2, discoveryAttempts: 2, discoveryScore: 0.75 })
    expect(duplicate.totals.stars).toBe(2)
    const unchanged = await readHistory(store, sanitize)
    expect(unchanged.bytesRead).toBe(0)
    expect(unchanged.cursor).toBe(duplicate.cursor)
  })

  test("serializes concurrent projector requests without duplicate import or credit", async () => {
    const store = await fixture()
    await append(store, discovery())
    const views = await Promise.all(Array.from({ length: 4 }, () => readHistory(store, sanitize)))
    expect(views.every((view) => view.historyComplete && view.totals.stars === 1 && view.profiles[0].discoveryStars === 1)).toBe(true)
    expect(views.reduce((sum, view) => sum + view.bytesRead, 0)).toBe((await lstat(join(store, "events.jsonl"))).size)
  })

  test("canonical discovery is consumed before attribution, while legacy global counts remain separate", async () => {
    const store = await fixture()
    const events = discovery()
    await append(store, [{ ...events[2], profileVersion: 99 }, ...events, { type: "star_awarded", canonicalRootCauseKey: "legacy", investigatorAgentKey: "old" }])
    const view = await readHistory(store, sanitize)
    expect(view.profiles[0].discoveryStars).toBe(0)
    expect(view.profiles[0].discoveryAttempts).toBe(1)
    expect(view.totals.stars).toBe(2)
    expect(new Map(view.starsByAgent).get("old")).toBe(1)
  })

  test("ordered solution proof and pending late outcome survive every persisted prefix", async () => {
    const store = await fixture()
    const chain = solution()
    const events = [chain[6], ...chain, chain[6], ...chain.map((event) => ({ ...event, roundId: "duplicate-round" }))]
    for (let index = 0; index < events.length; index += 1) {
      await append(store, [events[index]])
      const view = await readHistory(store, sanitize)
      const prefix = events.slice(0, index + 1)
      expect(view.totals.solutionStars).toBe(index < 7 ? 0 : 1)
      expect(view.profiles[1].solutionStars).toBe(index < 8 ? 0 : 1)
      expect(view.profiles).toEqual(profileStats(prefix))
      expect(validatedSolutionAwards(prefix).length).toBe(index < 7 ? 0 : 1)
    }
    const opportunity = await fixture()
    await append(opportunity, chain.map((event) => "topic" in event ? { ...event, topic: { ...event.topic, kind: "opportunity" } } : event))
    expect((await readHistory(opportunity, sanitize)).totals.solutionStars).toBe(0)
  })

  test("huge complete record imports once without retaining raw logs; append reads only new bytes", async () => {
    const store = await fixture()
    const initial = [...discovery(), { type: "verification_failed", runId: "run-one", checks: "PRIVATE_LOG".repeat(1_000_000) }]
    await append(store, initial)
    const first = await readHistory(store, sanitize, "run-one")
    expect(first.historyComplete).toBe(true)
    expect(first.totals.stars).toBe(1)
    expect(first.bytesRead).toBe((await lstat(join(store, "events.jsonl"))).size)
    expect((await lstat(join(store, "history.sqlite"))).size).toBeLessThan(128 * 1024)
    expect((await readFile(join(store, "history.sqlite"))).includes(Buffer.from("PRIVATE_LOG"))).toBe(false)
    expect((await readHistory(store, sanitize, "run-one")).bytesRead).toBe(0)
    const extra = { type: "fix_committed", runId: "run-one", commitSha: "commit" }
    await append(store, [extra])
    const second = await readHistory(store, sanitize, "run-one")
    expect(second.bytesRead).toBe(Buffer.byteLength(JSON.stringify(extra) + "\n"))
    expect(second.totals).toMatchObject({ stars: 1, commits: 1 })
  })

  test("partial final records and split UTF8 retain a byte cursor and wait without rereading unchanged content", async () => {
    const store = await fixture()
    await append(store, discovery())
    const prior = await readHistory(store, sanitize)
    const line = Buffer.from(JSON.stringify({ type: "coverage", runId: "run-one", reason: "before 🐈 after" }) + "\n")
    const split = line.indexOf(Buffer.from("🐈")) + 2
    await appendFile(join(store, "events.jsonl"), line.subarray(0, split))
    const partial = await readHistory(store, sanitize)
    expect(partial.historyComplete).toBe(false)
    expect(partial.cursor).toBe(prior.cursor)
    expect((await readHistory(store, sanitize)).bytesRead).toBe(0)
    await appendFile(join(store, "events.jsonl"), line.subarray(split))
    const complete = await readHistory(store, sanitize, "run-one")
    expect(complete.historyComplete).toBe(true)
    expect(complete.cursor).toBe(prior.cursor + line.length)
    expect(complete.events.at(-1)?.reason).toBe("before 🐈 after")
  })

  test("observed append during import rolls back instead of publishing a stale complete snapshot", async () => {
    const store = await fixture()
    await append(store, discovery())
    const prior = await readHistory(store, sanitize)
    await append(store, [{ type: "coverage", runId: "run-one", reason: "append-trigger" }])
    let appended = false
    const during = (value: unknown) => {
      const event = sanitize(value)
      if (event?.reason === "append-trigger" && !appended) {
        // The projection callback runs inside the real import transaction. A
        // synchronous fixture append provides ordering without sleeps or races.
        appendFileSync(join(store, "events.jsonl"), discovery("two").map((item) => JSON.stringify(item)).join("\n") + "\n")
        appended = true
      }
      return event
    }
    const incomplete = await readHistory(store, during, "run-two")
    expect(appended).toBe(true)
    expect(incomplete.historyComplete).toBe(false)
    expect(incomplete.warnings.join()).toContain("changed during import")
    expect(incomplete.cursor).toBe(prior.cursor)
    expect(incomplete.totals.stars).toBe(1)
    expect(incomplete.profiles[0].discoveryStars).toBe(1)
    expect(incomplete.events).toEqual([])
    const retry = await readHistory(store, sanitize, "run-two")
    expect(retry.historyComplete).toBe(true)
    expect(retry.totals.stars).toBe(2)
    expect(retry.profiles[0]).toMatchObject({ discoveryStars: 2, discoveryAttempts: 2 })
    expect(retry.events).toHaveLength(3)
    expect(retry.cursor).toBe((await lstat(join(store, "events.jsonl"))).size)
    const stable = await readHistory(store, sanitize, "run-two")
    expect(stable.bytesRead).toBe(0)
    expect(stable.totals).toEqual(retry.totals)
  })

  test("transaction storage failure rolls back cursor, reducers and recent events together, then retries", async () => {
    const store = await fixture()
    await append(store, discovery())
    const prior = await readHistory(store, sanitize, "run-one")
    const db = new Database(join(store, "history.sqlite"))
    db.exec("CREATE TRIGGER fail_projection BEFORE INSERT ON recent BEGIN SELECT RAISE(ABORT, 'fixture storage failure'); END")
    db.close()
    await append(store, discovery("two"))
    const failure = await readHistory(store, sanitize, "run-two")
    expect(failure.historyComplete).toBe(false)
    expect(failure.warnings.join()).toContain("storage failure")
    expect(failure.cursor).toBe(prior.cursor)
    expect(failure.totals.stars).toBe(1)
    expect(failure.events).toEqual([])
    const repaired = new Database(join(store, "history.sqlite"))
    repaired.exec("DROP TRIGGER fail_projection")
    repaired.close()
    const retried = await readHistory(store, sanitize, "run-two")
    expect(retried.historyComplete).toBe(true)
    expect(retried.totals.stars).toBe(2)
    expect(retried.profiles[0].discoveryStars).toBe(2)
    expect(retried.events).toHaveLength(3)
  })

  test("malformed complete records stay incomplete, rotation/truncation/version mismatches preserve stale projections", async () => {
    const malformed = await fixture()
    await append(malformed, discovery())
    await appendFile(join(malformed, "events.jsonl"), "{broken\n")
    expect((await readHistory(malformed, sanitize)).historyComplete).toBe(false)
    await append(malformed, discovery("two"))
    expect((await readHistory(malformed, sanitize)).warnings.join()).toContain("malformed")
    for (const change of ["replace", "truncate", "version"]) {
      const store = await fixture()
      await append(store, discovery())
      const prior = await readHistory(store, sanitize)
      if (change === "replace") { await rename(join(store, "events.jsonl"), join(store, "original.jsonl")); await append(store, discovery("new")) }
      if (change === "truncate") await writeFile(join(store, "events.jsonl"), "")
      if (change === "version") { const db = new Database(join(store, "history.sqlite")); db.exec("PRAGMA user_version=999"); db.close() }
      const stale = await readHistory(store, sanitize)
      expect(stale.historyComplete).toBe(false)
      expect(stale.totals.stars).toBe(1)
      expect(stale.cursor).toBe(prior.cursor)
      expect(stale.bytesRead).toBe(0)
      expect(stale.warnings.join()).toContain(change === "version" ? "version mismatch" : "replaced, truncated")
    }
  })

  test("rejects symlinked ledger/database paths and bounds recent events without losing totals", async () => {
    const store = await fixture()
    await append(store, Array.from({ length: 250 }, (_, index) => ({ type: "star_awarded", runId: "run", canonicalRootCauseKey: String(index) })))
    const view = await readHistory(store, sanitize, "run")
    expect(view.events).toHaveLength(200)
    expect(view.totals.stars).toBe(250)
    const other = await fixture()
    await rm(join(other, "events.jsonl"))
    await symlink(join(store, "events.jsonl"), join(other, "events.jsonl"))
    expect((await readHistory(other, sanitize)).historyComplete).toBe(false)
    const database = await fixture()
    await symlink(join(store, "history.sqlite"), join(database, "history.sqlite"))
    expect((await readHistory(database, sanitize)).warnings.join()).toContain("unsafe")
  })
})
