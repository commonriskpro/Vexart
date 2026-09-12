import { lstat, open, opendir, realpath } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { detectRepo } from "./git"
import { readHistory } from "./history-db"
import { profileStats } from "./profiles"
import type { RepoInfo } from "./types"

const DEFAULT_PORT = 4318
const MAX_STATE_BYTES = 256 * 1024
const MAX_RECEIPT_BYTES = 512 * 1024
const MAX_RECEIPTS = 200
const MAX_AGENTS = 200

type DashboardState = {
  id: string
  status: string
  phase: string
  cycle: number
  cycles: number
  startedAt: string
  deadlineAt: string
  completedAt?: string
  baselineSha: string
  branch: string
  worktree: string
  error?: string
  stars: number
  findings: string[]
}

type DashboardEvent = {
  at: string
  type: string
  runId: string
  role?: string
  agentKey?: string
  attemptId?: string
  scope?: string
  findingId?: string
  reason?: string
  commitSha?: string
  worktree?: string
  branch?: string
  alternatives?: string[]
  disadvantages?: string[]
  baselineSha?: string
  analysis?: DashboardAnalysis
  roundId?: string
  profileId?: string
  profileVersion?: number
  model?: string
  effort?: string
  status?: string
  mode?: string
  channel?: string
  formula?: string
  tieBreak?: string
  selected?: { profileId: string; profileVersion: number; label: string; reason: string; score: number; eligibleAttempts: number; invitations: number }[]
  slot?: number
  contribution?: string
  topic?: { kind: string; id: string; scope: string; baselineSha: string }
  proposal?: DashboardProposal
  contributors?: { agentKey: string; attemptId: string; contribution: string }[]
  allocations?: { agentKey: string; attemptId: string; points: number }[]
}

type DashboardProposal = {
  rootCause: string
  invariant: string
  ownership: string
  lifecycle: string
  tradeoffs: string
  approvedPaths: string[]
  alternatives: string[]
  testPlan: string[]
}

type DashboardEvidence = { path: string; startLine: number; endLine: number; excerpt: string }
type DashboardAnalysis = {
  evidence: DashboardEvidence[]
  flow: string
  responsibilities: string[]
  invariants: string[]
  scenarios: string[]
  counterevidence: string[]
  opportunities: { title: string; evidence: DashboardEvidence[]; expectedBenefit: string; tradeoffs: string[]; validationPlan: string[] }[]
}

type DashboardReceipt = {
  agentKey: string
  attemptId: string
  role: string
  scope: string
  startedAt: string
  endedAt: string
  exitCode: number | null
  model: string | null
  effort: string | null
  summary: string | null
  status: string
  paths: string[]
  evidence: DashboardEvidence[]
  disadvantages: string[]
  evidenceProvenance?: { kind: "controller-extracted"; baselineSha: string; snapshotKind?: "post-apply"; snapshotId?: string }
  profileId?: string
  profileVersion?: number
}

type DashboardAttempt = {
  attemptId: string
  role: string
  scope: string
  startedAt: string
  status: string
  model: string | null
  effort: string | null
  profileId?: string
  profileVersion?: number
}

type DashboardAgent = {
  agentKey: string
  scope: string
  strategy: string
  profileId?: string
  profileVersion?: number
  stars: number
  solutionStars: number
  lastRole: string | null
  lastEndedAt: string | null
  lastExitCode: number | null
  model: string | null
  effort: string | null
}

export type DashboardSnapshot = {
  observedAt: string
  state: DashboardState | null
  processAlive: boolean | null
  events: DashboardEvent[]
  agents: DashboardAgent[]
  receipts: DashboardReceipt[]
  attempts: DashboardAttempt[]
  profiles: ReturnType<typeof profileStats>
  historyComplete: boolean
  totals: { stars: number | null; solutionStars: number | null; commits: number | null; decisions: number | null }
  warnings: string[]
}

type JsonObject = Record<string, unknown>
type Reader = { warnings: string[] }

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value)
const stringValue = (value: unknown) => typeof value === "string" && value.trim().length > 0 ? value : null
const numberValue = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null
const nonEmptyStrings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []
const clipped = (value: string | null, limit = 1_000) => value ? value.slice(0, limit) : null
const inside = (root: string, path: string) => path === root || path.startsWith(`${root}/`)

const readSafe = async (path: string, root: string, limit: number, reader: Reader) => {
  try {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink()) { reader.warnings.push(`metadata rejected: ${relative(root, path)}`); return null }
    const resolved = await realpath(path)
    if (!inside(root, resolved)) { reader.warnings.push(`metadata escapes store: ${relative(root, path)}`); return null }
    const handle = await open(path, "r")
    try {
      const size = Number((await handle.stat()).size)
      const start = Math.max(0, size - limit)
      const buffer = Buffer.alloc(size - start)
      await handle.read(buffer, 0, buffer.length, start)
      if (start > 0) reader.warnings.push(relative(root, path) === "events.jsonl" ? "events.jsonl tail truncated; lifetime totals may be partial" : `metadata truncated: ${relative(root, path)}`)
      return buffer.toString("utf8")
    } finally { await handle.close() }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : ""
    if (code !== "ENOENT") reader.warnings.push(`metadata unreadable: ${relative(root, path)}`)
    return null
  }
}

const parseJson = (text: string, reader: Reader, label: string) => {
  try { return JSON.parse(text) as unknown }
  catch { reader.warnings.push(`malformed metadata: ${label}`); return null }
}

const sanitizeState = (value: unknown, reader: Reader): DashboardState | null => {
  if (!isObject(value)) return null
  const id = stringValue(value.id)
  const status = stringValue(value.status)
  const phase = stringValue(value.phase)
  const startedAt = stringValue(value.startedAt)
  const deadlineAt = stringValue(value.deadlineAt)
  const baselineSha = stringValue(value.baselineSha)
  const branch = stringValue(value.branch)
  const worktree = stringValue(value.worktree)
  const cycle = numberValue(value.cycle)
  const cycles = numberValue(value.cycles)
  const stars = numberValue(value.stars)
  const findings = nonEmptyStrings(value.findings)
  if (!id || !status || !phase || !startedAt || !deadlineAt || !baselineSha || !branch || !worktree || cycle === null || cycles === null || stars === null || !Array.isArray(value.findings)) {
    reader.warnings.push("state metadata is incomplete")
    return null
  }
  const result: DashboardState = { id, status, phase, cycle, cycles, startedAt, deadlineAt, baselineSha, branch, worktree, stars, findings }
  if (typeof value.completedAt === "string") result.completedAt = value.completedAt
  if (typeof value.error === "string" && value.error.trim()) result.error = value.error
  return result
}

const sanitizeEvent = (value: unknown): DashboardEvent | null => {
  if (!isObject(value)) return null
  const at = stringValue(value.at)
  const type = stringValue(value.type)
  const runId = stringValue(value.runId)
  if (!at || !type || !runId) return null
  const event: DashboardEvent = { at, type, runId }
  for (const key of ["role", "agentKey", "attemptId", "scope", "findingId", "reason", "commitSha", "worktree", "branch", "baselineSha", "roundId", "status", "mode", "contribution", "profileId", "model", "effort"] as const) {
    if (typeof value[key] === "string") event[key] = value[key] as string
  }
  if (typeof value.profileVersion === "number" && Number.isSafeInteger(value.profileVersion) && value.profileVersion > 0) event.profileVersion = value.profileVersion
  if (!event.agentKey && typeof value.investigatorAgentKey === "string") event.agentKey = value.investigatorAgentKey
  for (const key of ["alternatives", "disadvantages"] as const) if (Array.isArray(value[key])) event[key] = nonEmptyStrings(value[key])
  if (type === "analysis_recorded") {
    const analysis = sanitizeAnalysis(value.analysis)
    if (analysis) event.analysis = analysis
  }
  if (type === "profile_selection") {
    for (const key of ["channel", "formula", "tieBreak"] as const) if (typeof value[key] === "string") event[key] = clipped(value[key]) ?? ""
    if (Array.isArray(value.selected)) event.selected = value.selected.slice(0, 3).flatMap((item) => isObject(item) && typeof item.profileId === "string" && typeof item.label === "string" && typeof item.profileVersion === "number" && Number.isSafeInteger(item.profileVersion) && item.profileVersion > 0 && ["weighted", "exploration"].includes(String(item.reason)) && [item.score, item.eligibleAttempts, item.invitations].every((count) => typeof count === "number" && Number.isFinite(count) && count >= 0) ? [{ profileId: item.profileId, profileVersion: item.profileVersion, label: item.label, reason: String(item.reason), score: Number(item.score), eligibleAttempts: Number(item.eligibleAttempts), invitations: Number(item.invitations) }] : [])
  }
  if (type.startsWith("solution_")) {
    if (numberValue(value.slot) !== null) event.slot = Number(value.slot)
    const topic = value.topic
    if (isObject(topic) && ["bug", "opportunity"].includes(String(topic.kind)) && ["id", "scope", "baselineSha"].every((key) => typeof topic[key] === "string")) {
      event.topic = { kind: String(topic.kind), id: String(topic.id), scope: String(topic.scope), baselineSha: String(topic.baselineSha) }
    }
    if (isObject(value.proposal)) event.proposal = sanitizeProposal(value.proposal)
    if (Array.isArray(value.contributors)) event.contributors = value.contributors.slice(0, 3).flatMap((item) => isObject(item) && typeof item.agentKey === "string" && typeof item.attemptId === "string" && typeof item.contribution === "string" ? [{ agentKey: item.agentKey, attemptId: item.attemptId, contribution: item.contribution }] : [])
    if (Array.isArray(value.allocations)) event.allocations = value.allocations.slice(0, 3).flatMap((item) => isObject(item) && typeof item.agentKey === "string" && typeof item.attemptId === "string" && (item.points === 1 || item.points === 0.5) ? [{ agentKey: item.agentKey, attemptId: item.attemptId, points: item.points }] : [])
  }
  return event
}

const sanitizeProposal = (value: JsonObject): DashboardProposal => ({
  rootCause: clipped(stringValue(value.rootCause)) ?? "",
  invariant: clipped(stringValue(value.invariant)) ?? "",
  ownership: clipped(stringValue(value.ownership)) ?? "",
  lifecycle: clipped(stringValue(value.lifecycle)) ?? "",
  tradeoffs: clipped(stringValue(value.tradeoffs)) ?? "",
  approvedPaths: nonEmptyStrings(value.approvedPaths),
  alternatives: nonEmptyStrings(value.alternatives),
  testPlan: nonEmptyStrings(value.testPlan),
})

const sanitizeAnalysis = (value: unknown): DashboardAnalysis | null => {
  if (!isObject(value) || typeof value.flow !== "string") return null
  return {
    flow: value.flow,
    evidence: evidence(value.evidence),
    responsibilities: nonEmptyStrings(value.responsibilities),
    invariants: nonEmptyStrings(value.invariants),
    scenarios: nonEmptyStrings(value.scenarios),
    counterevidence: nonEmptyStrings(value.counterevidence),
    opportunities: Array.isArray(value.opportunities) ? value.opportunities.flatMap((item) => {
      if (!isObject(item) || typeof item.title !== "string" || typeof item.expectedBenefit !== "string") return []
      return [{ title: item.title, evidence: evidence(item.evidence), expectedBenefit: item.expectedBenefit, tradeoffs: nonEmptyStrings(item.tradeoffs), validationPlan: nonEmptyStrings(item.validationPlan) }]
    }) : [],
  }
}

const modelInfo = (command: unknown) => {
  if (!Array.isArray(command) || !command.every((item) => typeof item === "string")) return { model: null, effort: null }
  const args = command as string[]
  const modelIndex = args.indexOf("-m")
  const configIndex = args.indexOf("-c")
  const model = modelIndex >= 0 && typeof args[modelIndex + 1] === "string" ? args[modelIndex + 1] : null
  const config = configIndex >= 0 && typeof args[configIndex + 1] === "string" ? args[configIndex + 1] : ""
  const effort = config.match(/model_reasoning_effort=\\?"?([A-Za-z0-9_-]+)/)?.[1] ?? null
  return { model, effort }
}

const evidence = (value: unknown): DashboardEvidence[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isObject(item) || typeof item.path !== "string" || typeof item.startLine !== "number" || typeof item.endLine !== "number" || typeof item.excerpt !== "string") return []
    return [{ path: item.path.slice(0, 512), startLine: item.startLine, endLine: item.endLine, excerpt: item.excerpt.slice(0, 1_000) }]
  })
}

const responseData = (value: unknown) => isObject(value) ? value : {}

const sanitizeReceipt = (value: unknown): DashboardReceipt | null => {
  if (!isObject(value)) return null
  const agentKey = stringValue(value.agentKey)
  const attemptId = stringValue(value.attemptId)
  const role = stringValue(value.role)
  const scope = stringValue(value.scope)
  const startedAt = stringValue(value.startedAt)
  const endedAt = stringValue(value.endedAt)
  if (!agentKey || !attemptId || !role || !scope || !startedAt || !endedAt) return null
  const exitCode = value.exitCode === null ? null : numberValue(value.exitCode)
  const response = responseData(value.response)
  const finding = responseData(response.finding)
  const proposal = responseData(response.proposal)
  const assignmentSummary = Array.isArray(response.assignments) ? response.assignments.flatMap((item) => {
    if (!isObject(item)) return []
    const scope = stringValue(item.scope)
    const strategy = stringValue(item.strategy)
    const reason = stringValue(item.reason)
    return scope && strategy && reason ? [`${scope}: ${strategy} — ${reason}`] : []
  }).join("; ") : null
  const decisionSummary = [stringValue(proposal.rootCause), stringValue(proposal.invariant), stringValue(proposal.tradeoffs)].filter((item): item is string => Boolean(item)).join("; ") || null
  const summary = clipped(stringValue(finding.summary) ?? stringValue(response.summary) ?? stringValue(response.negative) ?? (response.verdict === "approved" ? decisionSummary : null) ?? stringValue(response.reason) ?? assignmentSummary)
  const status = stringValue(response.status) ?? stringValue(response.mode) ?? stringValue(response.verdict) ?? (exitCode === null ? "timed_out" : exitCode === 0 ? "completed" : "failed")
  const paths = nonEmptyStrings(response.changedPaths ?? proposal.approvedPaths ?? finding.paths).map((path) => path.slice(0, 512))
  const refs = evidence(finding.evidence ?? response.sourceEvidence)
  const disadvantages = nonEmptyStrings(response.disadvantages).map((item) => item.slice(0, 1_000))
  const info = modelInfo(value.command)
  const rawProvenance = value.evidenceProvenance
  const provenance = isObject(rawProvenance) && rawProvenance.kind === "controller-extracted" && typeof rawProvenance.baselineSha === "string" && /^[a-f0-9]{40,64}$/.test(rawProvenance.baselineSha) ? { evidenceProvenance: { kind: "controller-extracted" as const, baselineSha: rawProvenance.baselineSha, ...(rawProvenance.snapshotKind === "post-apply" && typeof rawProvenance.snapshotId === "string" && /^[a-f0-9]{40,64}$/.test(rawProvenance.snapshotId) ? { snapshotKind: "post-apply" as const, snapshotId: rawProvenance.snapshotId } : {}) } } : {}
  const profile = typeof value.profileId === "string" && typeof value.profileVersion === "number" && Number.isSafeInteger(value.profileVersion) && value.profileVersion > 0 ? { profileId: value.profileId, profileVersion: value.profileVersion } : {}
  return { agentKey, attemptId, role, scope, startedAt, endedAt, exitCode, ...info, summary, status: value.parseError ? "invalid_output" : status, paths, evidence: refs, disadvantages, ...provenance, ...profile }
}

const processAlive = async (state: DashboardState | null, statePid: number | null, lock: unknown, cwd: string, reader: Reader) => {
  if (!state) return null
  if (state.status !== "running") return false
  if (!isObject(lock) || lock.runId !== state.id || typeof lock.pid !== "number" || statePid !== lock.pid) { reader.warnings.push("runner process identity is unavailable"); return null }
  const probe = Bun.spawn(["ps", "-p", String(lock.pid), "-o", "pid=,lstart=,command="], { cwd, stdout: "pipe", stderr: "ignore" })
  const [output, code] = await Promise.all([new Response(probe.stdout).text(), probe.exited])
  if (code !== 0 || !output.trim()) return false
  const line = output.trim().split("\n")[0].trim()
  const match = line.match(/^\d+\s+(.{24})\s+(.*)$/)
  const command = match?.[2] ?? ""
  if (!/(?:^|\s)(?:\S+\/)?(?:bun|node|deno)(?:\s|$)/.test(command) || !/(?:^|\s)(?:run\s+)?(?:\S+\/)?scripts\/audit-loop\/index\.ts(?:\s|$)/.test(command)) {
    reader.warnings.push("runner PID is live but executable identity does not match audit loop")
    return null
  }
  if (match && Number.isFinite(Date.parse(match[1])) && Number.isFinite(Date.parse(state.startedAt))) {
    const processStarted = Date.parse(match[1])
    const runStarted = Date.parse(state.startedAt)
    if (processStarted > runStarted + 5_000 || processStarted < runStarted - 86_400_000) {
      reader.warnings.push("runner process start time is not credible for this run")
      return null
    }
  }
  return true
}

const directoryEntries = async (path: string, max: number) => {
  const directory = await opendir(path)
  const entries = []
  for await (const entry of directory) {
    entries.push(entry)
    if (entries.length >= max) break
  }
  return entries
}

const filesIn = async (path: string, root: string, reader: Reader, max: number) => {
  try {
    const entries = await directoryEntries(path, max)
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !entry.name.endsWith(".message.json")).map((entry) => join(path, entry.name))
  } catch (error) {
    if (existsSync(path)) reader.warnings.push(`metadata directory rejected: ${relative(root, path)}`)
    return []
  }
}

const readReceipts = async (store: string, state: DashboardState | null, reader: Reader) => {
  if (!state) return []
  if (!/^[A-Za-z0-9_-]+$/.test(state.id)) { reader.warnings.push("state run identifier is unsafe"); return [] }
  const root = join(store, "runs", state.id, "receipts")
  let agentDirs: string[] = []
  try { agentDirs = (await directoryEntries(root, MAX_AGENTS)).filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name)) }
  catch { return [] }
  const paths: string[] = []
  for (const dir of agentDirs) paths.push(...await filesIn(dir, store, reader, MAX_RECEIPTS - paths.length))
  const result: DashboardReceipt[] = []
  for (const path of paths.slice(0, MAX_RECEIPTS)) {
    const raw = await readSafe(path, store, MAX_RECEIPT_BYTES, reader)
    if (!raw) continue
    const receipt = sanitizeReceipt(parseJson(raw, reader, relative(store, path)))
    if (receipt) result.push(receipt)
    else reader.warnings.push(`receipt omitted: ${relative(store, path)}`)
  }
  return result.sort((left, right) => left.endedAt.localeCompare(right.endedAt))
}

const readAgents = async (store: string, receipts: DashboardReceipt[], starsByAgent: Map<string, number>, solutionsByAgent: Map<string, number>, reader: Reader) => {
  const root = join(store, "agents")
  let paths: string[] = []
  try { paths = (await directoryEntries(root, MAX_AGENTS)).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => join(root, entry.name)) }
  catch { /* agents may not exist before the first cycle */ }
  const agents = new Map<string, DashboardAgent>()
  for (const path of paths) {
    const raw = await readSafe(path, store, MAX_STATE_BYTES, reader)
    const value = raw ? parseJson(raw, reader, relative(store, path)) : null
    if (!isObject(value) || typeof value.agentKey !== "string" || typeof value.scope !== "string" || typeof value.strategy !== "string") continue
    agents.set(value.agentKey, { agentKey: value.agentKey, scope: value.scope, strategy: value.strategy, profileId: typeof value.profileId === "string" ? value.profileId : undefined, profileVersion: typeof value.profileVersion === "number" ? value.profileVersion : undefined, stars: 0, solutionStars: 0, lastRole: null, lastEndedAt: null, lastExitCode: null, model: null, effort: null })
  }
  for (const receipt of receipts) {
    const agent = agents.get(receipt.agentKey) ?? { agentKey: receipt.agentKey, scope: receipt.scope, strategy: "unknown", stars: 0, solutionStars: 0, lastRole: null, lastEndedAt: null, lastExitCode: null, model: null, effort: null }
    if (!agent.lastEndedAt || receipt.endedAt >= agent.lastEndedAt) Object.assign(agent, { profileId: receipt.profileId, profileVersion: receipt.profileVersion, scope: receipt.scope, lastRole: receipt.role, lastEndedAt: receipt.endedAt, lastExitCode: receipt.exitCode, model: receipt.model, effort: receipt.effort })
    agents.set(receipt.agentKey, agent)
  }
  for (const [agentKey, stars] of starsByAgent) {
    const agent = agents.get(agentKey) ?? { agentKey, scope: "unknown", strategy: "unknown", stars: 0, solutionStars: 0, lastRole: null, lastEndedAt: null, lastExitCode: null, model: null, effort: null }
    agent.stars = stars
    agents.set(agentKey, agent)
  }
  for (const [agentKey, points] of solutionsByAgent) {
    const agent = agents.get(agentKey) ?? { agentKey, scope: "unknown", strategy: "unknown", stars: 0, solutionStars: 0, lastRole: null, lastEndedAt: null, lastExitCode: null, model: null, effort: null }
    agent.solutionStars = points
    agents.set(agentKey, agent)
  }
  return [...agents.values()].slice(0, MAX_AGENTS)
}

const readSnapshotFromRepo = async (repo: RepoInfo): Promise<DashboardSnapshot> => {
  const reader: Reader = { warnings: [] }
  const store = join(repo.commonDir, "audit-loop")
  const stateRaw = await readSafe(join(store, "state.json"), store, MAX_STATE_BYTES, reader)
  const state = stateRaw ? sanitizeState(parseJson(stateRaw, reader, "state.json"), reader) : null
  if (!stateRaw) reader.warnings.push("state unavailable")
  const lockRaw = await readSafe(join(store, "lock", "owner.json"), store, MAX_STATE_BYTES, reader)
  const lock = lockRaw ? parseJson(lockRaw, reader, "lock/owner.json") : null
  const history = await readHistory(store, sanitizeEvent, state?.id)
  reader.warnings.push(...history.warnings)
  const historyComplete = history.historyComplete
  const events = history.events
  const receipts = await readReceipts(store, state, reader)
  const agents = await readAgents(store, receipts, new Map(history.starsByAgent), new Map(history.solutionsByAgent), reader)
  const attempts = new Map<string, DashboardAttempt>()
  for (const event of events) {
    if (event.type === "agent_started" && event.attemptId && event.role && event.scope) attempts.set(event.attemptId, { attemptId: event.attemptId, role: event.role, scope: event.scope, startedAt: event.at, status: "in_progress", model: event.model ?? null, effort: event.effort ?? null, profileId: event.profileId, profileVersion: event.profileVersion })
    if (event.type === "agent_receipt" && event.attemptId && attempts.has(event.attemptId)) attempts.get(event.attemptId)!.status = "finished_receipt_unavailable"
  }
  for (const receipt of receipts) attempts.set(receipt.attemptId, { attemptId: receipt.attemptId, role: receipt.role, scope: receipt.scope, startedAt: receipt.startedAt, status: receipt.status, model: receipt.model, effort: receipt.effort, profileId: receipt.profileId, profileVersion: receipt.profileVersion })
  if (state?.status !== "running") for (const attempt of attempts.values()) if (attempt.status === "in_progress") attempt.status = "interrupted_or_unknown"
  const rawState = stateRaw ? parseJson(stateRaw, reader, "state.json") : null
  const statePid = isObject(rawState) && typeof rawState.pid === "number" ? rawState.pid : null
  return { observedAt: new Date().toISOString(), state, processAlive: await processAlive(state, statePid, lock, repo.root, reader), events, agents, receipts, profiles: history.profiles, attempts: [...attempts.values()].slice(-50), historyComplete, totals: historyComplete ? history.totals : { stars: null, solutionStars: null, commits: null, decisions: null }, warnings: reader.warnings.slice(0, 50) }
}

export const readDashboardSnapshot = async (cwd: string) => readSnapshotFromRepo(await detectRepo(cwd))

const headers = (contentType: string) => ({ "content-type": contentType, "cache-control": "no-store", "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:", "x-content-type-options": "nosniff" })

const reject = (status: number, message: string) => new Response(message, { status, headers: headers("text/plain; charset=utf-8") })

export const createDashboardServer = async (cwd: string, port = DEFAULT_PORT) => {
  const repo = await detectRepo(cwd)
  let server: Bun.Server<undefined>
  server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: async (request) => {
      const url = new URL(request.url)
      const origin = `http://127.0.0.1:${server.port}`
      if (request.headers.get("host") !== `127.0.0.1:${server.port}`) return reject(403, "forbidden host")
      const requestOrigin = request.headers.get("origin")
      if (requestOrigin !== null && requestOrigin !== origin) return reject(403, "forbidden origin")
      if (request.method !== "GET") return new Response("method not allowed", { status: 405, headers: { ...headers("text/plain; charset=utf-8"), allow: "GET" } })
      if (url.search) return reject(400, "query parameters are not supported")
      if (/%(?:2e|2f|5c)/i.test(request.url)) return reject(404, "not found")
      if (url.pathname === "/api/snapshot") return new Response(JSON.stringify(await readSnapshotFromRepo(repo)), { headers: headers("application/json; charset=utf-8") })
      if (url.pathname === "/") {
        const path = join(import.meta.dir, "dashboard.html")
        const html = await readSafe(path, import.meta.dir, 2 * 1024 * 1024, { warnings: [] })
        return html === null ? reject(404, "dashboard unavailable") : new Response(html, { headers: headers("text/html; charset=utf-8") })
      }
      return reject(404, "not found")
    },
  })
  return { server, origin: `http://127.0.0.1:${server.port}` }
}

export const parseDashboardArgs = (argv: string[]) => {
  let port = DEFAULT_PORT
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help" || arg === "-h") return { help: true, port }
    if (arg !== "--port") throw new Error(`unknown option: ${arg}`)
    const value = argv[++index]
    if (!value || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error("--port must be between 1 and 65535")
    port = Number(value)
  }
  return { help: false, port }
}

export const DASHBOARD_HELP = "Usage: bun run scripts/audit-loop/dashboard.ts [--port N] [--help]"

export const dashboardMain = async (argv = process.argv.slice(2)) => {
  const options = parseDashboardArgs(argv)
  if (options.help) { console.log(DASHBOARD_HELP); return }
  const running = await createDashboardServer(process.cwd(), options.port)
  console.log(`audit dashboard listening at ${running.origin}`)
}

if (import.meta.main) dashboardMain().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
