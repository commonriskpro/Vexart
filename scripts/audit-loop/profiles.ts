import { createSolutionReducer, reduceSolutionEvent, type SolutionAward } from "./solutions"

// Profiles are versioned source, never mutable learned prompts. Outcomes affect
// consultation priority only; they cannot affect gate or commit policy.
export const PROFILES = [
  { profileId: "lifecycle", profileVersion: 1, label: "Lifecycle", strategy: "Trace acquire/release symmetry, lifetime ownership, cleanup and cancellation through real callers." },
  { profileId: "contract-flow", profileVersion: 1, label: "Contract flow", strategy: "Trace established public/internal contracts end-to-end through producers and consumers; challenge invented expectations." },
  { profileId: "state-transitions", profileVersion: 1, label: "State transitions", strategy: "Inspect actual state transitions, reentrancy and event ordering; test counterexamples against source invariants." },
  { profileId: "minimal-invariant", profileVersion: 1, label: "Minimal invariant", strategy: "Find the smallest invariant-preserving root-cause correction; compare costs and reject hypothetical redesign." },
] as const
export type Profile = typeof PROFILES[number]
export type ProfileChannel = "discovery" | "solution"
export type ProfileMetric = {
  profileId: string; profileVersion: number; label: string
  discoveryStars: number; solutionStars: number; discoveryAttempts: number; solutionAttempts: number
  discoveryInvitations: number; solutionInvitations: number; invitations: number
  abstentions: number; technicalErrors: number; discoveryScore: number; solutionScore: number
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
export const profileFor = (id: unknown, version: unknown) => PROFILES.find((profile) => profile.profileId === id && profile.profileVersion === version)

export const createProfileReducer = () => {
  const metrics = PROFILES.map((profile) => ({ profileId: profile.profileId, profileVersion: profile.profileVersion, label: profile.label, discoveryStars: 0, solutionStars: 0, discoveryAttempts: 0, solutionAttempts: 0, discoveryInvitations: 0, solutionInvitations: 0, invitations: 0, abstentions: 0, technicalErrors: 0, discoveryScore: 0, solutionScore: 0 }))
  const started = new Map<string, { profileId: string; channel: ProfileChannel; runId: unknown; agentKey: unknown }>()
  const outcomes = new Map<string, { profileId: string; channel: ProfileChannel; eligible: boolean; runId: unknown; agentKey: unknown }>()
  const stars = new Set<string>()
  const credited = new Set<string>()
  const pending = new Map<string, { runId: string; allocation: SolutionAward["allocations"][number] }[]>()
  return { metrics, started, outcomes, stars, credited, pending, solutions: createSolutionReducer() }
}
export type ProfileReducer = ReturnType<typeof createProfileReducer>

const reconcileSolutions = (state: ProfileReducer, attemptId: string) => {
  const outcome = state.outcomes.get(attemptId)
  if (!outcome) return
  for (const item of state.pending.get(attemptId) ?? []) {
    const allocation = item.allocation
    const metric = state.metrics.find((metric) => metric.profileId === outcome.profileId)!
    if (outcome.channel === "solution" && outcome.eligible && outcome.runId === item.runId && outcome.agentKey === allocation.agentKey && metric.profileId === allocation.profileId && metric.profileVersion === allocation.profileVersion) metric.solutionStars += allocation.points
  }
  state.pending.delete(attemptId)
}

export const reduceProfileEvent = (state: ProfileReducer, event: unknown) => {
  const { metrics, started, outcomes, stars, credited } = state
  const award = reduceSolutionEvent(state.solutions, event)
  if (award) for (const allocation of award.allocations) {
    state.pending.set(allocation.attemptId, [...(state.pending.get(allocation.attemptId) ?? []), { runId: award.runId, allocation }])
    reconcileSolutions(state, allocation.attemptId)
  }

  if (!record(event)) return award
  const profile = profileFor(event.profileId, event.profileVersion)
  const metric = profile ? metrics.find((item) => item.profileId === profile.profileId)! : null
  if (event.type === "agent_started" && metric && typeof event.attemptId === "string" && !started.has(event.attemptId) && (event.role === "investigator" || event.role === "solver")) {
    const channel = event.role === "investigator" ? "discovery" : "solution"
    started.set(event.attemptId, { profileId: metric.profileId, channel, runId: event.runId, agentKey: event.agentKey })
    metric.invitations += 1
    if (channel === "discovery") metric.discoveryInvitations += 1
    else metric.solutionInvitations += 1
  }
  if (event.type === "profile_outcome" && metric && typeof event.attemptId === "string" && !outcomes.has(event.attemptId)) {
    const invitation = started.get(event.attemptId)
    if (!invitation || invitation.profileId !== metric.profileId || invitation.channel !== event.channel || invitation.runId !== event.runId || invitation.agentKey !== event.agentKey || !["eligible", "abstain", "format", "timeout", "blocked", "opportunity"].includes(String(event.status))) return award
    const eligible = event.status === "eligible"
    outcomes.set(event.attemptId, { profileId: metric.profileId, channel: invitation.channel, eligible, runId: invitation.runId, agentKey: invitation.agentKey })
    if (eligible && invitation.channel === "discovery") metric.discoveryAttempts += 1
    if (eligible && invitation.channel === "solution") metric.solutionAttempts += 1
    if (event.status === "abstain") metric.abstentions += 1
    if (["format", "timeout", "blocked"].includes(String(event.status))) metric.technicalErrors += 1
  }
  if (event.type === "star_awarded" && typeof event.canonicalRootCauseKey === "string" && typeof event.investigatorAttemptId === "string" && !stars.has(event.canonicalRootCauseKey)) {
    stars.add(event.canonicalRootCauseKey)
    const outcome = outcomes.get(event.investigatorAttemptId)
    if (metric && outcome?.channel === "discovery" && outcome.eligible && outcome.runId === event.runId && outcome.agentKey === event.investigatorAgentKey && outcome.profileId === event.profileId && metric?.profileVersion === event.profileVersion && !credited.has(event.investigatorAttemptId)) {
      metric!.discoveryStars += 1
      credited.add(event.investigatorAttemptId)
    }
  }
  if (typeof event.attemptId === "string") reconcileSolutions(state, event.attemptId)
  return award
}

export const profileMetrics = (state: ProfileReducer): ProfileMetric[] => state.metrics.map((metric) => ({ ...metric, discoveryScore: (metric.discoveryStars + 1) / (metric.discoveryAttempts + 2), solutionScore: (metric.solutionStars + 1) / (metric.solutionAttempts + 2) }))

export const profileStats = (events: unknown[]): ProfileMetric[] => {
  const state = createProfileReducer()
  for (const event of events) reduceProfileEvent(state, event)
  return profileMetrics(state)
}

export const selectProfiles = (events: unknown[], channel: ProfileChannel, slots: 2 | 3) => {
  const metrics = profileStats(events)
  const invitations = (metric: ProfileMetric) => channel === "discovery" ? metric.discoveryInvitations : metric.solutionInvitations
  const score = (metric: ProfileMetric) => channel === "discovery" ? metric.discoveryScore : metric.solutionScore
  const eligible = (metric: ProfileMetric) => channel === "discovery" ? metric.discoveryAttempts : metric.solutionAttempts
  const order = (metric: ProfileMetric) => PROFILES.findIndex((profile) => profile.profileId === metric.profileId)
  const exploration = [...metrics].sort((a, b) => invitations(a) - invitations(b) || order(a) - order(b))[0]
  const weighted = metrics.filter((metric) => metric !== exploration).sort((a, b) => score(b) - score(a) || order(a) - order(b)).slice(0, slots - 1)
  return [...weighted.map((metric) => ({ ...profileFor(metric.profileId, metric.profileVersion)!, reason: "weighted" as const, score: score(metric), eligibleAttempts: eligible(metric), invitations: invitations(metric) })), { ...profileFor(exploration.profileId, exploration.profileVersion)!, reason: "exploration" as const, score: score(exploration), eligibleAttempts: eligible(exploration), invitations: invitations(exploration) }]
}
