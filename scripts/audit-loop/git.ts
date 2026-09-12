import { mkdir, readFile, realpath } from "node:fs/promises"
import { createHash } from "node:crypto"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import type { RepoInfo } from "./types"

export type ProcessResult = {
  code: number
  signal?: string
  stdout: string
  stderr: string
  timedOut?: boolean
}

const TERMINATION_GRACE_MS = 1_000
const ownedProcesses = new Map<number, string>()

const decode = async (value: ReadableStream<Uint8Array> | null) => {
  if (!value) return ""
  return new Response(value).text()
}

const processTree = async (pid: number, cwd: string) => {
  if (process.platform === "win32") return [pid]
  const probe = Bun.spawn(["ps", "-axo", "pid=,ppid="], { cwd, stdout: "pipe", stderr: "ignore" })
  const [text, code] = await Promise.all([decode(probe.stdout), probe.exited])
  if (code !== 0) return [pid]
  const children = new Map<number, number[]>()
  for (const line of text.split("\n")) {
    const values = line.trim().split(/\s+/).map(Number)
    if (values.length !== 2 || values.some((value) => !Number.isInteger(value))) continue
    const [child, parent] = values
    children.set(parent, [...(children.get(parent) ?? []), child])
  }
  const result = [pid]
  const visit = (parent: number) => {
    for (const child of children.get(parent) ?? []) {
      visit(child)
      result.unshift(child)
    }
  }
  visit(pid)
  return result
}

const terminate = (pids: number[], signal: "SIGTERM" | "SIGKILL") => {
  for (const pid of pids) {
    try { process.kill(pid, signal) } catch { /* the owned process may have exited */ }
  }
}

export const runProcess = async (args: string[], cwd: string, timeoutMs?: number, killTree = false): Promise<ProcessResult> => {
  const proc = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" })
  ownedProcesses.set(proc.pid, cwd)
  const stdoutPromise = decode(proc.stdout)
  const stderrPromise = decode(proc.stderr)
  const exitPromise = proc.exited
  let timedOut = false
  if (timeoutMs !== undefined) {
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<{ done: false }>((resolve) => { deadlineTimer = setTimeout(() => resolve({ done: false }), Math.max(1, timeoutMs)) })
    const result = await Promise.race([exitPromise.then((code) => ({ code, done: true as const })), deadline])
    if (deadlineTimer) clearTimeout(deadlineTimer)
    if (!result.done) {
      timedOut = true
      const pids = killTree ? await processTree(proc.pid, cwd) : [proc.pid]
      terminate(pids, "SIGTERM")
      await new Promise((resolve) => setTimeout(resolve, TERMINATION_GRACE_MS))
      terminate(pids, "SIGKILL")
    }
  }
  const [stdout, stderr, code] = await Promise.all([stdoutPromise, stderrPromise, exitPromise])
  ownedProcesses.delete(proc.pid)
  return { code, signal: undefined, stdout, stderr, timedOut }
}

export const stopOwnedProcesses = () => {
  for (const [pid, cwd] of ownedProcesses) void processTree(pid, cwd).then((pids) => {
    terminate(pids, "SIGTERM")
    setTimeout(() => terminate(pids, "SIGKILL"), TERMINATION_GRACE_MS)
  })
}

const runGit = async (args: string[], cwd: string) => {
  const result = await runProcess(["git", ...args], cwd)
  if (result.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`)
  return result.stdout.trim()
}

export const detectRepo = async (cwd: string): Promise<RepoInfo> => {
  const rootRaw = await runGit(["rev-parse", "--show-toplevel"], cwd)
  const root = await realpath(rootRaw)
  const commonRaw = await runGit(["rev-parse", "--git-common-dir"], root)
  const commonDir = await realpath(isAbsolute(commonRaw) ? commonRaw : resolve(root, commonRaw))
  const baselineSha = await runGit(["rev-parse", "HEAD"], root)
  const status = await runGit(["status", "--porcelain=v1", "--untracked-files=all"], root)
  const dirty = status ? status.split("\n") : []
  return { root, commonDir, baselineSha, dirty }
}

export const ensureInside = (root: string, value: string) => {
  const candidate = resolve(root, value)
  const rel = relative(root, candidate)
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`path escapes repository: ${value}`)
  return candidate
}

export const pathInside = (root: string, value: string) => {
  if (isAbsolute(value) || value.includes("\0") || value.split("/").includes("..")) return false
  const candidate = resolve(root, value)
  const rel = relative(root, candidate)
  return !rel.startsWith("..") && !isAbsolute(rel)
}

export const sourceAt = async (root: string, sha: string, path: string) => {
  if (!pathInside(root, path) || path.startsWith(".git/")) return null
  const entry = await runProcess(["git", "ls-tree", sha, "--", path], root)
  const mode = entry.stdout.trim().split(/\s+/, 1)[0]
  if (entry.code !== 0 || (mode !== "100644" && mode !== "100755")) return null
  const result = await runProcess(["git", "show", `${sha}:${path}`], root)
  return result.code === 0 ? result.stdout : null
}

export const createWorktree = async (repo: RepoInfo, store: string, id: string) => {
  const branch = `codex/audit-${id}`
  const worktree = join(store, "worktrees", id)
  await mkdir(dirname(worktree), { recursive: true })
  const result = await runProcess(["git", "worktree", "add", "-b", branch, worktree, repo.baselineSha], repo.root)
  if (result.code !== 0) throw new Error(`cannot create audit worktree: ${result.stderr.trim() || result.stdout.trim()}`)
  return { branch, worktree }
}

export const worktreeHead = async (worktree: string) => runGit(["rev-parse", "HEAD"], worktree)

export const changedPaths = async (worktree: string) => {
  const result = await runProcess(["git", "status", "--porcelain=v1", "--untracked-files=all"], worktree)
  if (result.code !== 0) throw new Error(`git status failed: ${result.stderr.trim() || result.stdout.trim()}`)
  return result.stdout.trimEnd()
    ? result.stdout.trimEnd().split("\n").map((line) => {
        const value = line.slice(3)
        if (value.includes(" -> ")) return value.slice(value.lastIndexOf(" -> ") + 4)
        return value
      })
    : []
}

export const worktreeClean = async (worktree: string) => (await changedPaths(worktree)).length === 0

export const indexClean = async (worktree: string) => {
  const result = await runProcess(["git", "diff", "--cached", "--quiet"], worktree)
  return result.code === 0
}

export const stagedPaths = async (worktree: string) => {
  const result = await runProcess(["git", "diff", "--cached", "--name-only", "--no-renames"], worktree)
  if (result.code !== 0) throw new Error(`git staged path inspection failed: ${result.stderr.trim() || result.stdout.trim()}`)
  return result.stdout.trim() ? result.stdout.trim().split("\n") : []
}

export const stageNamed = async (worktree: string, paths: string[]) => {
  if (!paths.length || paths.some((path) => !path || path === "." || path.startsWith("-"))) throw new Error("named staging requires explicit paths")
  const result = await runProcess(["git", "add", "--", ...paths], worktree)
  if (result.code !== 0) throw new Error(`git add failed: ${result.stderr.trim() || result.stdout.trim()}`)
}

export const commitNamed = async (worktree: string, paths: string[], message: string) => {
  const result = await runProcess(["git", "commit", "-m", message, "--", ...paths], worktree)
  if (result.code !== 0) throw new Error(`git commit failed: ${result.stderr.trim() || result.stdout.trim()}`)
  return worktreeHead(worktree)
}

export const diffCheck = async (worktree: string) => {
  const result = await runProcess(["git", "diff", "--check"], worktree)
  return { ok: result.code === 0, output: result.stderr || result.stdout }
}

export const snapshotPaths = async (worktree: string, paths: string[]) => {
  const hash = createHash("sha256")
  for (const path of [...paths].sort()) {
    hash.update(path)
    try { hash.update(await readFile(join(worktree, path))) } catch { hash.update("<missing>") }
  }
  return hash.digest("hex")
}

export const packageHasScript = async (worktree: string, name: string) => {
  try {
    const raw = await readFile(join(worktree, "package.json"), "utf8")
    const parsed = JSON.parse(raw) as { scripts?: Record<string, unknown> }
    return typeof parsed.scripts?.[name] === "string"
  } catch {
    return false
  }
}

export const worktreeDependencyState = async (worktree: string) => {
  try {
    await realpath(join(worktree, "node_modules"))
    return "available" as const
  } catch {
    return "missing" as const
  }
}
