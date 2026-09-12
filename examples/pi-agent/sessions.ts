import { readdir, readFile, stat } from "node:fs/promises"
import type { Dirent } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { isJsonRecord, type JsonRecord } from "./protocol"

export interface SessionSummary {
  path: string
  id: string
  cwd: string
  name?: string
  parentSessionPath?: string
  created: string
  modified: string
  messageCount: number
}

export interface SessionListOptions {
  cwd: string
  agentDir?: string
  sessionDir?: string
  all?: boolean
}

export function resolveAgentDir(agentDir?: string): string {
  return resolve(expandPath(agentDir ?? process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")))
}

export function resolveSessionRoot(options: Pick<SessionListOptions, "agentDir" | "sessionDir">): string {
  if (options.sessionDir) return resolve(expandPath(options.sessionDir))
  const envDir = process.env.PI_CODING_AGENT_SESSION_DIR
  if (envDir && !options.agentDir) return resolve(expandPath(envDir))
  return join(resolveAgentDir(options.agentDir), "sessions")
}

/** Pi's directory encoding for its default per-project session directory. */
export function defaultSessionDirectory(cwd: string, agentDir?: string): string {
  const resolvedCwd = resolve(cwd)
  const safePath = `--${resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`
  return join(resolveAgentDir(agentDir), "sessions", safePath)
}

export async function listSessions(options: SessionListOptions): Promise<SessionSummary[]> {
  const cwd = resolve(options.cwd)
  const root = resolveSessionRoot(options)
  const customRoot = Boolean(options.sessionDir || (process.env.PI_CODING_AGENT_SESSION_DIR && !options.agentDir))
  const dirs = options.all ? (customRoot ? [root] : await childDirectories(root)) : [customRoot ? root : defaultSessionDirectory(cwd, options.agentDir)]
  const files = (await Promise.all(dirs.map((dir) => jsonlFiles(dir)))).flat()
  const summaries = await Promise.all(files.map((path) => readSessionSummary(path, cwd, options.all ?? false)))
  return summaries.filter((summary): summary is SessionSummary => summary !== null).sort((a, b) => b.modified.localeCompare(a.modified))
}

async function childDirectories(root: string): Promise<string[]> {
  const entries = await safeReadDirectory(root)
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name))
  const rootFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl")).map((entry) => join(root, entry.name))
  return dirs.concat(rootFiles.length > 0 ? [root] : [])
}

async function jsonlFiles(dir: string): Promise<string[]> {
  const entries = await safeReadDirectory(dir)
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl")).map((entry) => join(dir, entry.name))
}

async function safeReadDirectory(path: string): Promise<Dirent[]> {
  try {
    return await readdir(path, { withFileTypes: true })
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return []
    throw error
  }
}

async function readSessionSummary(path: string, cwd: string, all: boolean): Promise<SessionSummary | null> {
  let metadata: SessionMetadata | null = null
  try {
    const file = await readFile(path, "utf8")
    const lines = file.split("\n")
    for (const line of lines) {
      if (!line.trim()) continue
      let entry: unknown
      try {
        entry = JSON.parse(line) as unknown
      } catch {
        continue
      }
      if (!isJsonRecord(entry)) continue
      if (!metadata) {
        metadata = readHeader(entry)
        if (!metadata) return null
        continue
      }
      if (entry.type === "session_info") metadata.name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : undefined
      if (entry.type === "message") {
        metadata.messageCount++
        const message = isJsonRecord(entry.message) ? entry.message : null
        if (message && typeof message.timestamp === "number") metadata.lastActivity = Math.max(metadata.lastActivity ?? 0, message.timestamp)
      }
    }
    if (!metadata || (!all && (metadata.cwd === "" || resolve(metadata.cwd) !== cwd))) return null
    const details = await stat(path)
    return {
      path: resolve(path),
      id: metadata.id,
      cwd: metadata.cwd,
      ...(metadata.name ? { name: metadata.name } : {}),
      ...(metadata.parentSessionPath ? { parentSessionPath: metadata.parentSessionPath } : {}),
      created: metadata.created,
      modified: sessionModified(metadata, details.mtime),
      messageCount: metadata.messageCount,
    }
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null
    throw error
  }
}

interface SessionMetadata {
  id: string
  cwd: string
  created: string
  parentSessionPath?: string
  name?: string
  messageCount: number
  lastActivity?: number
}

function readHeader(entry: JsonRecord): SessionMetadata | null {
  if (entry.type !== "session" || typeof entry.id !== "string" || typeof entry.cwd !== "string" || typeof entry.timestamp !== "string") return null
  return {
    id: entry.id,
    cwd: entry.cwd,
    created: entry.timestamp,
    ...(typeof entry.parentSession === "string" ? { parentSessionPath: entry.parentSession } : {}),
    messageCount: 0,
  }
}

function expandPath(path: string): string {
  return path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path
}

function sessionModified(metadata: SessionMetadata, fallback: Date): string {
  if (metadata.lastActivity && metadata.lastActivity > 0) return new Date(metadata.lastActivity).toISOString()
  const created = new Date(metadata.created)
  return Number.isNaN(created.getTime()) ? fallback.toISOString() : created.toISOString()
}
