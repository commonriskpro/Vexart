import { Database } from "bun:sqlite"
import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { join } from "node:path"
import { createProfileReducer, profileMetrics, reduceProfileEvent } from "./profiles"

export const HISTORY_VERSION = 1
const CHUNK_BYTES = 64 * 1024
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const initial = () => ({ profiles: createProfileReducer(), stars: new Set<string>(), commits: new Set<string>(), decisions: new Set<string>(), agents: new Map<string, Set<string>>(), solutions: new Map<string, number>() })
type Reducer = ReturnType<typeof initial>
const encode = (value: unknown) => JSON.stringify(value, (_key, item) => item instanceof Map ? { $map: [...item] } : item instanceof Set ? { $set: [...item] } : item)
const decode = (value: string): Reducer => JSON.parse(value, (_key, item) => record(item) && Array.isArray(item.$map) ? new Map(item.$map as [unknown, unknown][]) : record(item) && Array.isArray(item.$set) ? new Set(item.$set) : item)

const reduce = (state: Reducer, value: unknown) => {
  const award = reduceProfileEvent(state.profiles, value)
  if (award) for (const allocation of award.allocations) state.solutions.set(allocation.agentKey, (state.solutions.get(allocation.agentKey) ?? 0) + allocation.points)
  if (!record(value)) return
  if (value.type === "star_awarded" && typeof value.canonicalRootCauseKey === "string") {
    state.stars.add(value.canonicalRootCauseKey)
    const agent = typeof value.investigatorAgentKey === "string" ? value.investigatorAgentKey : typeof value.agentKey === "string" ? value.agentKey : null
    if (agent) {
      const stars = state.agents.get(agent) ?? new Set<string>()
      stars.add(value.canonicalRootCauseKey)
      state.agents.set(agent, stars)
    }
  }
  if (value.type === "fix_committed" && typeof value.commitSha === "string" && value.commitSha) state.commits.add(value.commitSha)
  if (["decision_deferred", "solution_parked"].includes(String(value.type)) && (typeof value.decisionKey === "string" || typeof value.worktree === "string")) state.decisions.add(typeof value.decisionKey === "string" ? value.decisionKey : value.worktree as string)
}
const project = (state: Reducer) => ({ profiles: profileMetrics(state.profiles), totals: { stars: state.stars.size, solutionStars: [...state.solutions.values()].reduce((sum, value) => sum + value, 0), commits: state.commits.size, decisions: state.decisions.size }, starsByAgent: [...state.agents].map(([agent, stars]) => [agent, stars.size] as const), solutionsByAgent: [...state.solutions] })
type Projection = ReturnType<typeof project>
type Checkpoint = { identity: string; cursor: number; size: number; modified: number; malformed: number; state: string; projection: string }
export type HistoryView<T> = Projection & { events: T[]; historyComplete: boolean; warnings: string[]; cursor: number; bytesRead: number }

// Serialize readers/projectors within this observer. SQLite's writer transaction
// also serializes separate observers; no read-model update touches the ledger.
const pending = new Map<string, Promise<unknown>>()
export const readHistory = async <T extends { runId: string }>(store: string, sanitize: (value: unknown) => T | null, runId?: string): Promise<HistoryView<T>> => {
  const prior = pending.get(store) ?? Promise.resolve()
  const task = prior.catch(() => {}).then(() => query(store, sanitize, runId))
  pending.set(store, task)
  try { return await task }
  finally { if (pending.get(store) === task) pending.delete(store) }
}

const safeFile = async (path: string, root: string, optional = false) => {
  try {
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink() || !(await realpath(path)).startsWith(`${root}/`)) throw new Error("history path is unsafe")
    return stat
  } catch (error) {
    if (optional && record(error) && error.code === "ENOENT") return null
    throw error
  }
}

const query = async <T extends { runId: string }>(store: string, sanitize: (value: unknown) => T | null, runId?: string): Promise<HistoryView<T>> => {
  let db: Database | undefined
  let checkpoint: Checkpoint | null = null
  let projection = project(initial())
  let events: T[] = []
  let bytesRead = 0
  let transaction = false
  try {
    const directory = await lstat(store)
    if (!directory.isDirectory() || directory.isSymbolicLink() || await realpath(store) !== store) throw new Error("history store is unsafe or unavailable")
    const path = join(store, "history.sqlite")
    const ledger = join(store, "events.jsonl")
    const stat = await safeFile(ledger, store)
    for (const suffix of ["", "-journal", "-wal", "-shm"]) await safeFile(`${path}${suffix}`, store, true)
    let created = false
    try { const file = await open(path, "wx", 0o600); await file.close(); created = true }
    catch (error) { if (!record(error) || error.code !== "EEXIST") throw error }
    db = new Database(path, { create: false, strict: true })
    db.exec("PRAGMA busy_timeout = 5000")
    const version = db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version
    if (created) {
      db.transaction(() => {
        db!.exec("CREATE TABLE checkpoint (id INTEGER PRIMARY KEY CHECK(id=1), identity TEXT NOT NULL, cursor INTEGER NOT NULL, size INTEGER NOT NULL, modified REAL NOT NULL, malformed INTEGER NOT NULL, state TEXT NOT NULL, projection TEXT NOT NULL); CREATE TABLE recent (seq INTEGER PRIMARY KEY AUTOINCREMENT, runId TEXT NOT NULL, event TEXT NOT NULL); CREATE INDEX recent_run ON recent(runId,seq)")
        db!.exec(`PRAGMA user_version = ${HISTORY_VERSION}`)
      })()
    } else if (version !== HISTORY_VERSION) throw new Error("history schema/reducer version mismatch; explicit rebuild required")
    // Load the small ready projection first. No checkpoint replay on unchanged polls.
    const read = () => {
      const row = db!.query<Pick<Checkpoint, "identity" | "cursor" | "size" | "modified" | "malformed" | "projection">, []>("SELECT identity,cursor,size,modified,malformed,projection FROM checkpoint WHERE id=1").get()
      if (row) projection = JSON.parse(row.projection) as Projection
      events = runId ? db!.query<{ event: string }, [string]>("SELECT event FROM (SELECT seq,event FROM recent WHERE runId=? ORDER BY seq DESC LIMIT 200) ORDER BY seq").all(runId).map((item) => JSON.parse(item.event) as T) : []
      return row
    }
    let row = read()
    const identity = `${ledger}:${stat!.dev}:${stat!.ino}:${stat!.birthtimeMs}`
    const mismatch = (row: Pick<Checkpoint, "identity" | "size" | "modified">) => row.identity !== identity || stat!.size < row.size || (stat!.size === row.size && stat!.mtimeMs !== row.modified)
    if (row && mismatch(row)) throw new Error("history ledger replaced, truncated or rewritten; explicit rebuild required")
    if (!row || stat!.size !== row.size || stat!.mtimeMs !== row.modified) {
      db.exec("BEGIN IMMEDIATE")
      transaction = true
      row = read() // another observer may have advanced the checkpoint
      if (row && mismatch(row)) throw new Error("history ledger changed while projecting")
      checkpoint = db.query<Checkpoint, []>("SELECT * FROM checkpoint WHERE id=1").get()
      const state = checkpoint ? decode(checkpoint.state) : initial()
      let cursor = checkpoint?.cursor ?? 0
      let malformed = checkpoint?.malformed ?? 0
      const handle = await open(ledger, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const actual = await handle.stat()
        if (`${ledger}:${actual.dev}:${actual.ino}:${actual.birthtimeMs}` !== identity || actual.size !== stat!.size || actual.mtimeMs !== stat!.mtimeMs) throw new Error("history ledger changed before import")
        let position = cursor
        let chunks: Buffer[] = []
        let length = 0
        while (position < stat!.size) {
          const buffer = Buffer.alloc(Math.min(CHUNK_BYTES, stat!.size - position))
          const result = await handle.read(buffer, 0, buffer.length, position)
          if (!result.bytesRead) throw new Error("history ledger truncated during import")
          bytesRead += result.bytesRead
          let start = 0
          for (let index = 0; index < result.bytesRead; index += 1) {
            if (buffer[index] !== 10) continue
            const part = buffer.subarray(start, index)
            chunks.push(part); length += part.length
            const line = Buffer.concat(chunks, length).toString("utf8")
            if (line.trim()) {
              let value: unknown
              try { value = JSON.parse(line) } catch { malformed += 1 }
              if (value !== undefined) {
                reduce(state, value)
                const event = sanitize(value)
                if (event) db.query("INSERT INTO recent(runId,event) VALUES (?,?)").run(event.runId, JSON.stringify(event))
              }
            }
            cursor = position + index + 1
            chunks = []; length = 0; start = index + 1
          }
          if (start < result.bytesRead) { const part = buffer.subarray(start, result.bytesRead); chunks.push(part); length += part.length }
          position += result.bytesRead
        }
        const final = await handle.stat()
        const current = await safeFile(ledger, store)
        if (`${ledger}:${current!.dev}:${current!.ino}:${current!.birthtimeMs}` !== identity || final.size !== stat!.size || final.mtimeMs !== stat!.mtimeMs || current!.size !== stat!.size || current!.mtimeMs !== stat!.mtimeMs) throw new Error("history ledger changed during import")
      } finally { await handle.close() }
      projection = project(state)
      db.query("INSERT OR REPLACE INTO checkpoint(id,identity,cursor,size,modified,malformed,state,projection) VALUES (1,?,?,?,?,?,?,?)").run(identity, cursor, stat!.size, stat!.mtimeMs, malformed, encode(state), JSON.stringify(projection))
      db.exec("DELETE FROM recent WHERE seq NOT IN (SELECT seq FROM (SELECT seq, row_number() OVER (PARTITION BY runId ORDER BY seq DESC) AS rank FROM recent) WHERE rank<=200)")
      db.exec("COMMIT")
      transaction = false
      row = read()
    }
    return { ...projection, events, historyComplete: Boolean(row && row.malformed === 0 && row.cursor === stat!.size), warnings: row?.malformed ? [`malformed history records: ${row.malformed}; lifetime totals unavailable`] : row && row.cursor < stat!.size ? ["history has an incomplete final record; awaiting append"] : [], cursor: row?.cursor ?? 0, bytesRead }
  } catch (error) {
    if (transaction) { db?.exec("ROLLBACK"); transaction = false }
    // A failed transaction never publishes the uncommitted projection.
    if (db) {
      try {
        const row = db.query<Pick<Checkpoint, "projection" | "cursor">, []>("SELECT projection,cursor FROM checkpoint WHERE id=1").get()
        projection = row ? JSON.parse(row.projection) as Projection : project(initial())
        events = runId ? db.query<{ event: string }, [string]>("SELECT event FROM (SELECT seq,event FROM recent WHERE runId=? ORDER BY seq DESC LIMIT 200) ORDER BY seq").all(runId).map((item) => JSON.parse(item.event) as T) : []
        return { ...projection, events, historyComplete: false, warnings: [`history unavailable/stale: ${error instanceof Error ? error.message : String(error)}`], cursor: row?.cursor ?? 0, bytesRead }
      } catch { /* incompatible or unavailable DB: never invent lifetime totals */ }
    }
    return { ...project(initial()), events: [], historyComplete: false, warnings: [`history unavailable/stale: ${error instanceof Error ? error.message : String(error)}`], cursor: 0, bytesRead }
  } finally { db?.close() }
}
