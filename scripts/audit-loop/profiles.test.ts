import { describe, expect, test } from "bun:test"
import { PROFILES, profileStats, selectProfiles } from "./profiles"

const attempt = (profile: typeof PROFILES[number], id: string, scope = "src/a.ts", channel = "discovery", status = "eligible") => [
  { type: "agent_started", runId: `run-${id}`, role: channel === "discovery" ? "investigator" : "solver", agentKey: `agent-${scope}-${id}`, attemptId: id, scope, profileId: profile.profileId, profileVersion: profile.profileVersion },
  { type: "profile_outcome", runId: `run-${id}`, channel, status, agentKey: `agent-${scope}-${id}`, attemptId: id, profileId: profile.profileId, profileVersion: profile.profileVersion },
]
const star = (profile: typeof PROFILES[number], id: string, scope = "src/a.ts") => ({ type: "star_awarded", runId: `run-${id}`, canonicalRootCauseKey: `root-${id}`, investigatorAgentKey: `agent-${scope}-${id}`, investigatorAttemptId: id, profileId: profile.profileId, profileVersion: profile.profileVersion })

describe("versioned strategy profiles", () => {
  test("accumulates one profile across assignments, scopes, agents and runs without merging legacy identities", () => {
    const profile = PROFILES[1]
    const events = [...attempt(profile, "a", "src/first.ts"), star(profile, "a", "src/first.ts"), ...attempt(profile, "b", "native/second.rs"), star(profile, "b", "native/second.rs"), { type: "star_awarded", canonicalRootCauseKey: "legacy", investigatorAgentKey: "old", investigatorAttemptId: "unmapped" }]
    const stats = profileStats(events)
    expect(stats).toHaveLength(4)
    expect(stats[1]).toMatchObject({ profileId: "contract-flow", profileVersion: 1, discoveryStars: 2, discoveryAttempts: 2, discoveryInvitations: 2, solutionStars: 0, solutionAttempts: 0, discoveryScore: 0.75 })
    expect(profileStats([...events, ...events])[1]).toEqual(stats[1])
  })

  test("stars change consultations while an exploration slot remains reserved", () => {
    const events = PROFILES.flatMap((profile, index) => attempt(profile, String(index)))
    const before = selectProfiles(events, "discovery", 3)
    const after = selectProfiles([...events, star(PROFILES[3], "3")], "discovery", 3)
    expect(before.filter((item) => item.reason === "weighted").map((item) => item.profileId)).toEqual(["contract-flow", "state-transitions"])
    expect(after.filter((item) => item.reason === "weighted").map((item) => item.profileId)).toEqual(["minimal-invariant", "contract-flow"])
    expect(after.find((item) => item.reason === "exploration")?.profileId).toBe("lifecycle")
    expect(new Set(after.map((item) => item.profileId)).size).toBe(3)
    expect(selectProfiles([], "solution", 3)).toEqual(selectProfiles([], "solution", 3))
  })

  test("weighted invitations rank smoothed scores above mere eligible history", () => {
    const events = Array.from({ length: 100 }, (_, index) => attempt(PROFILES[1], `failed-${index}`)).flat()
    const chosen = selectProfiles(events, "discovery", 3)
    expect(profileStats(events)[1].discoveryScore).toBe(1 / 102)
    expect(chosen.filter((item) => item.reason === "weighted").map((item) => item.profileId)).toEqual(["state-transitions", "minimal-invariant"])
    expect(chosen.find((item) => item.reason === "exploration")?.profileId).toBe("lifecycle")
  })

  test("abstention, malformed output, timeout and opportunity are not unsuccessful solution proposals", () => {
    const events = ["abstain", "format", "timeout", "blocked", "opportunity"].flatMap((status, index) => attempt(PROFILES[0], String(index), "src/a.ts", "solution", status))
    const stats = profileStats(events)[0]
    expect(stats).toMatchObject({ invitations: 5, solutionInvitations: 5, solutionAttempts: 0, discoveryAttempts: 0, abstentions: 1, technicalErrors: 3, solutionScore: 0.5 })
    expect(profileStats([...events, ...attempt(PROFILES[0], "eligible", "src/b.ts", "solution")])[0].solutionAttempts).toBe(1)
  })

  test("rejects foreign run/profile/agent star attribution and caps one discovery credit per attempt", () => {
    const events = attempt(PROFILES[0], "a")
    for (const invalid of [
      { ...star(PROFILES[0], "a"), runId: "foreign" },
      { ...star(PROFILES[0], "a"), profileVersion: 2 },
      { ...star(PROFILES[0], "a"), profileId: "unknown" },
      { ...star(PROFILES[0], "a"), investigatorAgentKey: "foreign" },
      { ...star(PROFILES[0], "a"), investigatorAttemptId: "foreign" },
      { type: "star_awarded", canonicalRootCauseKey: "legacy", investigatorAttemptId: "a" },
    ]) expect(profileStats([...events, invalid])[0].discoveryStars).toBe(0)
    expect(profileStats([...events, star(PROFILES[0], "a"), { ...star(PROFILES[0], "a"), canonicalRootCauseKey: "another-root" }])[0].discoveryStars).toBe(1)
    expect(profileStats([{ ...events[1] }])[0].discoveryAttempts).toBe(0)
    expect(selectProfiles(events, "discovery", 2).find((item) => item.reason === "exploration")?.profileId).toBe("contract-flow")
  })
})
