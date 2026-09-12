import { appendFile, readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseEvidence, parseProposal, type Evidence, type Proposal } from "./types"

export type SolutionTopic = {
  kind: "bug" | "opportunity"
  id: string
  scope: string
  baselineSha: string
  paths: string[]
  evidence: Evidence[]
  description: string
}
export type SolutionRound = { runId: string; cycle: number; roundId: string; topic: SolutionTopic; baselineSha: string }
export type SolverResult = {
  kind: "solver"
  status: "propose" | "abstain"
  baseSha: string
  reason: string
  evidence: Evidence[]
  contribution: string | null
  proposal: Proposal | null
}
export type SolutionSubmission = SolverResult & { slot: number; candidateId: string; agentKey: string; attemptId: string; profileId: string; profileVersion: number }
export type Evaluation = {
  kind: "solution_evaluator"
  baseSha: string
  mode: "winner" | "synthesis" | "none"
  reason: string
  evidence: Evidence[]
  proposal: Proposal | null
  contributions: { candidateId: string; contribution: string }[]
}
export type SolutionSelection = {
  mode: "winner" | "synthesis"
  reason: string
  evidence: Evidence[]
  proposal: Proposal
  contributors: { candidateId: string; agentKey: string; attemptId: string; profileId: string; profileVersion: number; contribution: string }[]
}
export type ImplementedContribution = { attemptId: string; implemented: boolean; evidence: Evidence[] }
export type SolutionAward = SolutionRound & {
  type: "solution_awarded"
  mode: "winner" | "synthesis"
  awardKey: string
  canonicalRootCauseKey: string
  commitSha: string
  allocations: { agentKey: string; attemptId: string; profileId: string; profileVersion: number; points: 1 | 0.5 }[]
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const string = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0
const keys = (value: Record<string, unknown>, names: string[]) => Object.keys(value).length === names.length && names.every((name) => name in value)
const evidence = (value: unknown) => {
  if (!Array.isArray(value)) return null
  const refs = value.map(parseEvidence)
  return refs.every((ref): ref is Evidence => ref !== null) ? refs : null
}

export const parseSolver = (value: unknown): SolverResult | null => {
  if (!record(value) || !keys(value, ["kind", "status", "baseSha", "reason", "evidence", "contribution", "proposal"]) || value.kind !== "solver" || !["propose", "abstain"].includes(String(value.status)) || !string(value.baseSha) || !string(value.reason)) return null
  const refs = evidence(value.evidence)
  if (!refs) return null
  if (value.status === "abstain") return value.proposal === null && value.contribution === null && refs.length === 0 ? { kind: "solver", status: "abstain", baseSha: value.baseSha, reason: value.reason, evidence: [], contribution: null, proposal: null } : null
  const proposal = parseProposal(value.proposal)
  return proposal && refs.length > 0 && string(value.contribution) ? { kind: "solver", status: "propose", baseSha: value.baseSha, reason: value.reason, evidence: refs, contribution: value.contribution, proposal } : null
}

export const parseEvaluation = (value: unknown): Evaluation | null => {
  if (!record(value) || !keys(value, ["kind", "baseSha", "mode", "reason", "evidence", "proposal", "contributions"]) || value.kind !== "solution_evaluator" || !string(value.baseSha) || !string(value.reason) || !["winner", "synthesis", "none"].includes(String(value.mode)) || !Array.isArray(value.contributions)) return null
  const refs = evidence(value.evidence)
  const contributions = value.contributions.map((item) => record(item) && keys(item, ["candidateId", "contribution"]) && string(item.candidateId) && string(item.contribution) ? { candidateId: item.candidateId, contribution: item.contribution } : null)
  if (!refs || contributions.some((item) => !item)) return null
  if (value.mode === "none") return value.proposal === null && contributions.length === 0 ? { kind: "solution_evaluator", baseSha: value.baseSha, mode: "none", reason: value.reason, evidence: refs, proposal: null, contributions: [] } : null
  const proposal = parseProposal(value.proposal)
  return proposal && refs.length ? { kind: "solution_evaluator", baseSha: value.baseSha, mode: value.mode as "winner" | "synthesis", reason: value.reason, evidence: refs, proposal, contributions: contributions as Evaluation["contributions"] } : null
}

export const sameProposal = (left: Proposal | null, right: Proposal | null) => JSON.stringify(left) === JSON.stringify(right)

export const proposalScopeError = (topic: SolutionTopic, proposal: Proposal) => {
  if (proposal.baseSha !== topic.baselineSha) return "stale proposal baseline"
  const paths = proposal.approvedPaths
  if (!paths.length || new Set(paths).size !== paths.length || paths.some((path) => !topic.paths.includes(path))) return "proposal paths exceed the source-backed topic"
  if (topic.kind === "bug" && paths.length !== topic.paths.length) return "bug proposal must retain exact complete finding paths"
  if (proposal.hotfix || proposal.adHoc || proposal.migration) return "unsafe proposal change type"
  return null
}

export const selectSolution = (round: SolutionRound, submissions: SolutionSubmission[], evaluation: Evaluation): { selection: SolutionSelection | null; error: string | null } => {
  if (evaluation.baseSha !== round.baselineSha || round.topic.baselineSha !== round.baselineSha) return { selection: null, error: "stale evaluation baseline" }
  if (evaluation.mode === "none") return { selection: null, error: null }
  if (!evaluation.proposal) return { selection: null, error: "selection has no proposal" }
  const scope = proposalScopeError(round.topic, evaluation.proposal)
  if (scope) return { selection: null, error: scope }
  const contributors = evaluation.contributions.map((item) => {
    const matches = submissions.filter((submission) => submission.candidateId === item.candidateId && submission.status === "propose" && submission.baseSha === round.baselineSha && submission.proposal && !proposalScopeError(round.topic, submission.proposal) && submission.contribution === item.contribution)
    return matches.length === 1 ? { candidateId: matches[0].candidateId, agentKey: matches[0].agentKey, attemptId: matches[0].attemptId, profileId: matches[0].profileId, profileVersion: matches[0].profileVersion, contribution: item.contribution } : null
  })
  if (contributors.some((item) => !item)) return { selection: null, error: "selection references an abstainer, foreign attempt, stale, or changed contribution" }
  const selected = contributors as SolutionSelection["contributors"]
  if (new Set(selected.map((item) => item.attemptId)).size !== selected.length || new Set(selected.map((item) => item.agentKey)).size !== selected.length) return { selection: null, error: "contributors must be distinct controller-owned identities" }
  if (evaluation.mode === "winner" && (selected.length !== 1 || !sameProposal(evaluation.proposal, submissions.find((item) => item.attemptId === selected[0].attemptId)?.proposal ?? null))) return { selection: null, error: "winner must be one exact submitted proposal" }
  if (evaluation.mode === "synthesis" && (selected.length < 2 || new Set(selected.map((item) => item.contribution.trim().toLowerCase())).size !== selected.length || submissions.some((item) => sameProposal(item.proposal, evaluation.proposal)))) return { selection: null, error: "synthesis needs distinct substantive contributions and a genuinely combined proposal" }
  return { selection: { mode: evaluation.mode, reason: evaluation.reason, evidence: evaluation.evidence, proposal: evaluation.proposal, contributors: selected }, error: null }
}

export const parseImplementedContributions = (value: unknown): ImplementedContribution[] | null => {
  if (!Array.isArray(value)) return null
  const parsed = value.map((item) => {
    if (!record(item) || !keys(item, ["attemptId", "implemented", "evidence"]) || !string(item.attemptId) || typeof item.implemented !== "boolean") return null
    const refs = evidence(item.evidence)
    return refs ? { attemptId: item.attemptId, implemented: item.implemented, evidence: refs } : null
  })
  return parsed.every((item): item is ImplementedContribution => item !== null) ? parsed : null
}

export const contributionsImplemented = (selection: SolutionSelection, confirmations: ImplementedContribution[]) =>
  confirmations.length === selection.contributors.length && new Set(confirmations.map((item) => item.attemptId)).size === confirmations.length && selection.contributors.every((contributor) => confirmations.some((item) => item.attemptId === contributor.attemptId && item.implemented && item.evidence.length > 0 && item.evidence.every((ref) => selection.proposal.approvedPaths.includes(ref.path))))

export const blindCandidates = (submissions: SolutionSubmission[]) => submissions.filter((item) => item.status === "propose").map((item) => ({ candidateId: item.candidateId, proposal: item.proposal, evidence: item.evidence, contribution: item.contribution }))

export const solutionSchema = (role: "solver" | "solution_evaluator", proposal: unknown, ref: unknown) => {
  const text = { type: "string", minLength: 1 }
  const refs = { type: "array", items: ref }
  const plan = { anyOf: [proposal, { type: "null" }] }
  if (role === "solver") return { type: "object", additionalProperties: false, required: ["kind", "status", "baseSha", "reason", "evidence", "contribution", "proposal"], properties: { kind: { const: "solver", type: "string" }, status: { enum: ["propose", "abstain"] }, baseSha: text, reason: text, evidence: refs, contribution: { type: ["string", "null"] }, proposal: plan } }
  return { type: "object", additionalProperties: false, required: ["kind", "baseSha", "mode", "reason", "evidence", "proposal", "contributions"], properties: { kind: { const: "solution_evaluator", type: "string" }, baseSha: text, mode: { enum: ["winner", "synthesis", "none"] }, reason: text, evidence: refs, proposal: plan, contributions: { type: "array", items: { type: "object", additionalProperties: false, required: ["candidateId", "contribution"], properties: { candidateId: text, contribution: text } } } } }
}

// Replay shared by the controller and dashboard. Only a complete, ordered chain
// of controller-attributed submissions, selection, implementation and commit earns points.
export const validatedSolutionAwards = (events: unknown[]): SolutionAward[] => {
  const rounds = new Map<string, { round: SolutionRound; submissions: SolutionSubmission[]; selection: SolutionSelection | null; verified: boolean; commit: string | null }>()
  const awards: SolutionAward[] = []
  const seen = new Set<string>()
  const submitted = new Set<string>()
  for (const event of events) {
    if (!record(event) || !string(event.roundId)) continue
    if (event.type === "solution_round_started") {
      const topic = event.topic
      if (!rounds.has(event.roundId) && record(topic) && ["bug", "opportunity"].includes(String(topic.kind)) && string(topic.id) && string(topic.scope) && string(topic.baselineSha) && topic.baselineSha === event.baselineSha && Array.isArray(topic.paths) && topic.paths.every(string) && evidence(topic.evidence) && string(topic.description) && string(event.runId) && typeof event.cycle === "number") rounds.set(event.roundId, { round: { runId: event.runId, cycle: event.cycle, roundId: event.roundId, baselineSha: topic.baselineSha, topic: topic as SolutionTopic }, submissions: [], selection: null, verified: false, commit: null })
      continue
    }
    const state = rounds.get(event.roundId)
    if (!state || state.round.runId !== event.runId || state.round.baselineSha !== event.baselineSha || state.round.cycle !== event.cycle) continue
    if (event.type === "solution_proposal" && !state.selection) {
      const result = parseSolver({ kind: "solver", status: event.status, baseSha: event.baselineSha, reason: event.reason, evidence: event.evidence, contribution: event.contribution, proposal: event.proposal })
      if (result && string(event.candidateId) && string(event.profileId) && typeof event.profileVersion === "number" && typeof event.slot === "number" && Number.isInteger(event.slot) && event.slot >= 1 && event.slot <= 3 && string(event.agentKey) && string(event.attemptId) && !submitted.has(event.attemptId) && !state.submissions.some((item) => item.slot === event.slot || item.candidateId === event.candidateId || item.agentKey === event.agentKey)) {
        state.submissions.push({ ...result, slot: event.slot, candidateId: event.candidateId, agentKey: event.agentKey, attemptId: event.attemptId, profileId: event.profileId, profileVersion: event.profileVersion })
        submitted.add(event.attemptId)
      }
      continue
    }
    if (event.type === "solution_selected" && !state.selection && Array.isArray(event.contributors)) {
      const evaluation = parseEvaluation({ kind: "solution_evaluator", baseSha: event.baselineSha, mode: event.mode, reason: event.reason, evidence: event.evidence, proposal: event.proposal, contributions: event.contributors.map((item) => record(item) ? { candidateId: item.candidateId, contribution: item.contribution } : item) })
      if (evaluation) {
        const selection = selectSolution(state.round, state.submissions, evaluation).selection
        if (selection && JSON.stringify(selection.contributors) === JSON.stringify(event.contributors)) state.selection = selection
      }
      continue
    }
    if (!state.selection || state.round.topic.kind !== "bug") continue
    if (event.type === "verification_passed" && !state.commit) {
      const confirmations = parseImplementedContributions(event.solutionContributions)
      state.verified = confirmations !== null && contributionsImplemented(state.selection, confirmations)
      continue
    }
    if (event.type === "fix_committed" && state.verified && event.canonicalRootCauseKey === state.round.topic.id && typeof event.commitSha === "string" && /^[a-f0-9]{40,64}$/.test(event.commitSha)) {
      state.commit = event.commitSha
      continue
    }
    const key = `${state.round.topic.id}\u0000${state.commit}`
    if (event.type !== "solution_awarded" || !state.verified || !state.commit || event.commitSha !== state.commit || event.canonicalRootCauseKey !== state.round.topic.id || event.awardKey !== key || event.mode !== state.selection.mode || seen.has(key)) continue
    const allocations = state.selection.contributors.map((item) => ({ agentKey: item.agentKey, attemptId: item.attemptId, profileId: item.profileId, profileVersion: item.profileVersion, points: state.selection!.mode === "winner" ? 1 as const : 0.5 as const }))
    if (JSON.stringify(event.allocations) !== JSON.stringify(allocations)) continue
    seen.add(key)
    awards.push({ ...state.round, type: "solution_awarded", mode: state.selection.mode, awardKey: key, canonicalRootCauseKey: state.round.topic.id, commitSha: state.commit, allocations })
  }
  return awards
}

export const awardSolution = async (store: string, round: SolutionRound, selection: SolutionSelection, commitSha: string) => {
  if (round.topic.kind !== "bug") return null
  const events = (await readFile(join(store, "events.jsonl"), "utf8").catch(() => "")).split("\n").flatMap((line) => { try { return [JSON.parse(line) as unknown] } catch { return [] } })
  const event: SolutionAward = { ...round, type: "solution_awarded", mode: selection.mode, awardKey: `${round.topic.id}\u0000${commitSha}`, canonicalRootCauseKey: round.topic.id, commitSha, allocations: selection.contributors.map((item) => ({ agentKey: item.agentKey, attemptId: item.attemptId, profileId: item.profileId, profileVersion: item.profileVersion, points: selection.mode === "winner" ? 1 : 0.5 })) }
  const prior = validatedSolutionAwards(events)
  if (prior.some((item) => item.awardKey === event.awardKey) || !validatedSolutionAwards([...events, event]).some((item) => item.awardKey === event.awardKey)) return null
  // The existing per-repository run lock owns this single append; allocations
  // are one event, never individually payable partial records.
  await appendFile(join(store, "events.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, "utf8")
  return event
}
