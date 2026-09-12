import { createHash } from "node:crypto"

export type Phase =
  | "starting"
  | "planning"
  | "investigating"
  | "gating"
  | "applying"
  | "verifying"
  | "ready_for_review"
  | "completed"
  | "stopped"
  | "timed_out"
  | "blocked"

export type AgentRole = "planner" | "investigator" | "gate" | "apply" | "verifier"

export type EvidenceReference = {
  path: string
  startLine: number
  endLine: number
}

export type Evidence = EvidenceReference & { excerpt: string }

export type EvidenceProvenance = {
  kind: "controller-extracted"
  baselineSha: string
  readScope: string
  references: (EvidenceReference & { location: string })[]
}

export type Reproduction = {
  command: string[]
  exitCode: number
  output: string
  observed: boolean
}

export type Finding = {
  id: string
  canonicalRootCauseKey: string
  scope: string
  summary: string
  impact: string
  evidence: Evidence[]
  expectedContract: string
  reproduction: Reproduction
  paths: string[]
}

export type Analysis = {
  evidence: Evidence[]
  flow: string
  responsibilities: string[]
  invariants: string[]
  scenarios: string[]
  counterevidence: string[]
  opportunities: {
    title: string
    evidence: Evidence[]
    expectedBenefit: string
    tradeoffs: string[]
    validationPlan: string[]
  }[]
}

export type InvestigatorResult = {
  kind: "investigator"
  status: "finding" | "negative" | "blocked"
  scope: string
  strategy: string
  finding: Finding | null
  analysis: Analysis | null
  negative: string | null
  disadvantages?: string[]
}

export type PlannerAssignment = {
  scope: string
  strategy: string
  priority: number
  reason: string
}

export type PlannerResult = {
  kind: "planner"
  status: "ready" | "negative" | "blocked"
  assignments: PlannerAssignment[]
  lessons: {
    falsePositives: string[]
    regressions: string[]
    coverage: string[]
    disadvantages: string[]
  }
  reason: string | null
}

export type Proposal = {
  baseSha: string
  approvedPaths: string[]
  changeType: "internal-fix"
  rootCause: string
  invariant: string
  ownership: string
  lifecycle: string
  tradeoffs: string
  alternatives: string[]
  testPlan: string[]
  requiresHumanDecision: boolean
  contractChange: boolean
  apiChange: boolean
  ownershipChange: boolean
  adHoc: boolean
  hotfix: boolean
  migration: boolean
}

export type GateResult = {
  kind: "gate"
  verdict: "approved" | "rejected" | "blocked"
  findingId: string
  canonicalRootCauseKey: string
  baseSha: string
  reason: string
  sourceEvidence: Evidence[]
  proposal: Proposal | null
  disadvantages: string[]
}

export type ApplyResult = {
  kind: "apply"
  status: "applied" | "blocked" | "rejected"
  findingId: string
  changedPaths: string[]
  summary: string
  reason?: string
}

export type VerifierResult = {
  kind: "verifier"
  verdict: "approved" | "rejected" | "blocked"
  findingId: string
  changedPaths: string[]
  regressions: string[]
  architecture: string
  checks: string[]
  reproduction: Reproduction
  reason: string
}

export type RunConfig = {
  cycles: number
  minutes: number
  scope?: string
}

export type RepoInfo = {
  root: string
  commonDir: string
  baselineSha: string
  dirty: string[]
}

export type RunState = {
  id: string
  pid: number
  root: string
  commonDir: string
  store: string
  initialBaselineSha: string
  baselineSha: string
  dirtyExcluded: string[]
  branch: string
  worktree: string
  scope?: string
  cycles: number
  minutes: number
  startedAt: string
  deadlineAt: string
  status: "running" | "completed" | "stopped" | "timed_out" | "blocked" | "ready_for_review"
  phase: Phase
  cycle: number
  stars: number
  findings: string[]
  stopRequested?: boolean
  error?: string
  completedAt?: string
}

export type AgentReceipt = {
  attemptId: string
  agentKey: string
  role: AgentRole
  scope: string
  strategy: string
  command: string[]
  prompt: string
  startedAt: string
  endedAt: string
  exitCode: number | null
  signal?: string
  stdout: string
  stderr: string
  responseText: string
  response?: unknown
  evidenceProvenance?: EvidenceProvenance
  parseError?: string
}

export const identityFor = (scope: string, strategy: string) => {
  const value = `${scope}\u0000${strategy}`
  return createHash("sha256").update(value).digest("hex").slice(0, 20)
}

export const attemptId = () => `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const exactKeys = (value: Record<string, unknown>, keys: string[]) => {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => key in value)
}

const stringValue = (value: unknown) => (typeof value === "string" && value.trim() ? value : null)

const nonEmptyStrings = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim())
    ? value.map((item) => item.trim())
    : null

const positiveInteger = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null

const evidenceValue = (value: unknown): Evidence | null => {
  if (!record(value) || !exactKeys(value, ["path", "startLine", "endLine", "excerpt"])) return null
  const path = stringValue(value.path)
  const startLine = positiveInteger(value.startLine)
  const endLine = positiveInteger(value.endLine)
  const excerpt = stringValue(value.excerpt)
  if (!path || !startLine || !endLine || !excerpt || endLine < startLine) return null
  return { path, startLine, endLine, excerpt }
}

const reproductionValue = (value: unknown): Reproduction | null => {
  if (!record(value) || !exactKeys(value, ["command", "exitCode", "output", "observed"])) return null
  const command = Array.isArray(value.command) && value.command.length > 0 && typeof value.command[0] === "string" && value.command[0].trim() && value.command.every((arg) => typeof arg === "string") ? value.command as string[] : null
  const output = stringValue(value.output)
  if (!command || typeof value.exitCode !== "number" || !output || typeof value.observed !== "boolean") return null
  return { command, exitCode: value.exitCode, output, observed: value.observed }
}

export const parseFinding = (value: unknown): Finding | null => {
  if (!record(value) || !exactKeys(value, ["id", "canonicalRootCauseKey", "scope", "summary", "impact", "evidence", "expectedContract", "reproduction", "paths"])) return null
  const id = stringValue(value.id)
  const canonicalRootCauseKey = stringValue(value.canonicalRootCauseKey)?.trim().toLowerCase() ?? null
  const scope = stringValue(value.scope)
  const summary = stringValue(value.summary)
  const impact = stringValue(value.impact)
  const expectedContract = stringValue(value.expectedContract)
  const evidence = Array.isArray(value.evidence) ? value.evidence.map(evidenceValue) : null
  const reproduction = reproductionValue(value.reproduction)
  const paths = nonEmptyStrings(value.paths)
  if (!id || !canonicalRootCauseKey || !scope || !summary || !impact || !expectedContract || !evidence || evidence.some((item) => !item) || !evidence.length || !reproduction || reproduction.exitCode === 0 || !paths || !paths.length) return null
  return { id, canonicalRootCauseKey, scope, summary, impact, evidence: evidence as Evidence[], expectedContract, reproduction, paths }
}

export const parseAnalysis = (value: unknown): Analysis | null => {
  if (!record(value) || !exactKeys(value, ["evidence", "flow", "responsibilities", "invariants", "scenarios", "counterevidence", "opportunities"])) return null
  const evidence = Array.isArray(value.evidence) ? value.evidence.map(evidenceValue) : null
  const flow = stringValue(value.flow)
  const responsibilities = nonEmptyStrings(value.responsibilities)
  const invariants = nonEmptyStrings(value.invariants)
  const scenarios = nonEmptyStrings(value.scenarios)
  const counterevidence = nonEmptyStrings(value.counterevidence)
  if (!evidence?.length || evidence.some((item) => !item) || !flow || !responsibilities?.length || !invariants?.length || !scenarios?.length || !counterevidence || !Array.isArray(value.opportunities)) return null
  const opportunities = value.opportunities.map((item) => {
    if (!record(item) || !exactKeys(item, ["title", "evidence", "expectedBenefit", "tradeoffs", "validationPlan"])) return null
    const title = stringValue(item.title)
    const refs = Array.isArray(item.evidence) ? item.evidence.map(evidenceValue) : null
    const expectedBenefit = stringValue(item.expectedBenefit)
    const tradeoffs = nonEmptyStrings(item.tradeoffs)
    const validationPlan = nonEmptyStrings(item.validationPlan)
    if (!title || !refs?.length || refs.some((ref) => !ref) || !expectedBenefit || !tradeoffs?.length || !validationPlan?.length) return null
    return { title, evidence: refs as Evidence[], expectedBenefit, tradeoffs, validationPlan }
  })
  if (opportunities.some((item) => !item)) return null
  return { evidence: evidence as Evidence[], flow, responsibilities, invariants, scenarios, counterevidence, opportunities: opportunities as Analysis["opportunities"] }
}

export const parseInvestigator = (value: unknown): InvestigatorResult | null => {
  // Legacy receipts can lack analysis; normalize to null, never fabricate source analysis.
  if (!record(value) || !exactKeys(value, ["kind", "status", "scope", "strategy", "finding", "negative", "disadvantages", ...("analysis" in value ? ["analysis"] : [])])) return null
  if (value.kind !== "investigator" || !["finding", "negative", "blocked"].includes(String(value.status))) return null
  const scope = stringValue(value.scope)
  const strategy = stringValue(value.strategy)
  const disadvantages = value.disadvantages === undefined ? [] : nonEmptyStrings(value.disadvantages)
  if (!scope || !strategy || !disadvantages) return null
  const analysis = parseAnalysis(value.analysis)
  const status = value.status as InvestigatorResult["status"]
  if (status === "finding") {
    const finding = parseFinding(value.finding)
    if (!finding || value.negative !== null) return null
    return { kind: "investigator", status, scope, strategy, finding, analysis, negative: null, disadvantages }
  }
  const negative = value.negative === undefined ? "" : stringValue(value.negative)
  if (value.finding !== null || negative === null) return null
  return { kind: "investigator", status, scope, strategy, finding: null, analysis, negative, disadvantages }
}

export const parsePlanner = (value: unknown): PlannerResult | null => {
  if (!record(value) || !exactKeys(value, ["kind", "status", "assignments", "lessons", "reason"])) return null
  if (value.kind !== "planner" || !["ready", "negative", "blocked"].includes(String(value.status)) || !Array.isArray(value.assignments) || !record(value.lessons) || !exactKeys(value.lessons, ["falsePositives", "regressions", "coverage", "disadvantages"])) return null
  const assignments = value.assignments.map((item) => {
    if (!record(item) || !exactKeys(item, ["scope", "strategy", "priority", "reason"])) return null
    const scope = stringValue(item.scope)
    const strategy = stringValue(item.strategy)
    const reason = stringValue(item.reason)
    return scope && strategy && reason && typeof item.priority === "number" && Number.isFinite(item.priority) ? { scope, strategy, priority: item.priority, reason } : null
  })
  const falsePositives = nonEmptyStrings(value.lessons.falsePositives)
  const regressions = nonEmptyStrings(value.lessons.regressions)
  const coverage = nonEmptyStrings(value.lessons.coverage)
  const disadvantages = nonEmptyStrings(value.lessons.disadvantages)
  if (assignments.some((item) => !item) || !falsePositives || !regressions || !coverage || !disadvantages) return null
  let reason: string | null = null
  if (value.reason !== null) {
    const parsedReason = stringValue(value.reason)
    if (!parsedReason) return null
    reason = parsedReason
  }
  return { kind: "planner", status: value.status as PlannerResult["status"], assignments: assignments as PlannerAssignment[], lessons: { falsePositives, regressions, coverage, disadvantages }, reason }
}

const proposalValue = (value: unknown): Proposal | null => {
  if (!record(value) || !exactKeys(value, ["baseSha", "approvedPaths", "changeType", "rootCause", "invariant", "ownership", "lifecycle", "tradeoffs", "alternatives", "testPlan", "requiresHumanDecision", "contractChange", "apiChange", "ownershipChange", "adHoc", "hotfix", "migration"])) return null
  const baseSha = stringValue(value.baseSha)
  const approvedPaths = nonEmptyStrings(value.approvedPaths)
  const rootCause = stringValue(value.rootCause)
  const invariant = stringValue(value.invariant)
  const ownership = stringValue(value.ownership)
  const lifecycle = stringValue(value.lifecycle)
  const tradeoffs = stringValue(value.tradeoffs)
  const alternatives = nonEmptyStrings(value.alternatives)
  const testPlan = nonEmptyStrings(value.testPlan)
  if (!baseSha || !approvedPaths || !approvedPaths.length || value.changeType !== "internal-fix" || !rootCause || !invariant || !ownership || !lifecycle || !tradeoffs || !alternatives || !testPlan || !testPlan.length) return null
  const booleans = ["requiresHumanDecision", "contractChange", "apiChange", "ownershipChange", "adHoc", "hotfix", "migration"]
  if (booleans.some((key) => typeof value[key] !== "boolean")) return null
  return { baseSha, approvedPaths, changeType: "internal-fix", rootCause, invariant, ownership, lifecycle, tradeoffs, alternatives, testPlan, requiresHumanDecision: value.requiresHumanDecision as boolean, contractChange: value.contractChange as boolean, apiChange: value.apiChange as boolean, ownershipChange: value.ownershipChange as boolean, adHoc: value.adHoc as boolean, hotfix: value.hotfix as boolean, migration: value.migration as boolean }
}

export const parseGate = (value: unknown): GateResult | null => {
  if (!record(value) || !exactKeys(value, ["kind", "verdict", "findingId", "canonicalRootCauseKey", "baseSha", "reason", "sourceEvidence", "proposal", "disadvantages"])) return null
  if (value.kind !== "gate" || !["approved", "rejected", "blocked"].includes(String(value.verdict))) return null
  const findingId = stringValue(value.findingId)
  const canonicalRootCauseKey = stringValue(value.canonicalRootCauseKey)?.trim().toLowerCase() ?? null
  const baseSha = stringValue(value.baseSha)
  const reason = stringValue(value.reason)
  const sourceEvidence = Array.isArray(value.sourceEvidence) ? value.sourceEvidence.map(evidenceValue) : null
  const disadvantages = nonEmptyStrings(value.disadvantages)
  if (!findingId || !canonicalRootCauseKey || !baseSha || !reason || !sourceEvidence || sourceEvidence.some((item) => !item) || !sourceEvidence.length || !disadvantages) return null
  let proposal: Proposal | null = null
  if (value.proposal !== null) {
    const parsedProposal = proposalValue(value.proposal)
    if (!parsedProposal) return null
    proposal = parsedProposal
  }
  if (value.verdict === "approved" && !proposal) return null
  return { kind: "gate", verdict: value.verdict as GateResult["verdict"], findingId, canonicalRootCauseKey, baseSha, reason, sourceEvidence: sourceEvidence as Evidence[], proposal, disadvantages }
}

export const parseApply = (value: unknown): ApplyResult | null => {
  if (!record(value) || !exactKeys(value, ["kind", "status", "findingId", "changedPaths", "summary", "reason"])) return null
  if (value.kind !== "apply" || !["applied", "blocked", "rejected"].includes(String(value.status))) return null
  const findingId = stringValue(value.findingId)
  const changedPaths = nonEmptyStrings(value.changedPaths)
  const summary = stringValue(value.summary)
  let reason: string | undefined
  if (value.reason !== null) {
    const parsedReason = stringValue(value.reason)
    if (!parsedReason) return null
    reason = parsedReason
  }
  if (!findingId || !changedPaths || !summary) return null
  return { kind: "apply", status: value.status as ApplyResult["status"], findingId, changedPaths, summary, reason }
}

export const parseVerifier = (value: unknown): VerifierResult | null => {
  if (!record(value) || !exactKeys(value, ["kind", "verdict", "findingId", "changedPaths", "regressions", "architecture", "checks", "reproduction", "reason"])) return null
  if (value.kind !== "verifier" || !["approved", "rejected", "blocked"].includes(String(value.verdict))) return null
  const findingId = stringValue(value.findingId)
  const changedPaths = nonEmptyStrings(value.changedPaths)
  const regressions = nonEmptyStrings(value.regressions)
  const architecture = stringValue(value.architecture)
  const checks = nonEmptyStrings(value.checks)
  const reproduction = reproductionValue(value.reproduction)
  const reason = stringValue(value.reason)
  if (!findingId || !changedPaths || !regressions || !architecture || !checks || !reproduction || reproduction.exitCode !== 0 || !reason) return null
  return { kind: "verifier", verdict: value.verdict as VerifierResult["verdict"], findingId, changedPaths, regressions, architecture, checks, reproduction, reason }
}

export const parseJsonObject = (text: string) => {
  const parsed = JSON.parse(text) as unknown
  if (!record(parsed)) throw new Error("structured response must be a JSON object")
  return parsed
}
