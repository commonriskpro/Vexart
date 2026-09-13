import { mkdir, readFile, realpath } from "node:fs/promises"
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import type { Readable } from "node:stream"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import type { RepoInfo } from "./types"

export type ProcessResult = {
  code: number
  signal?: string
  stdout: string
  stderr: string
  timedOut?: boolean
  cancelled?: boolean
  exitCode?: number | null
  error?: { kind: "spawn" | "stdin" | "stdout" | "stderr"; message: string }
}

const TERMINATION_GRACE_MS = 1_000
const ownedProcesses = new Map<number, () => void>()

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

export const runProcess = async (args: string[], cwd: string, timeoutMs?: number, killTree = false, options: { input?: string | Uint8Array; signal?: AbortSignal; env?: Record<string, string> } = {}): Promise<ProcessResult> => {
  if (options.signal?.aborted) return { code: -1, exitCode: null, stdout: "", stderr: "", cancelled: true }
  // Incremental writable callbacks expose delivery failures (including EPIPE).
  // A single end(payload) can hide pipe errors in Bun's compatibility layer.
  let proc: ReturnType<typeof spawn>
  try { proc = spawn(args[0], args.slice(1), { cwd, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ...options.env } }) }
  catch (error) { return { code: -1, exitCode: null, stdout: "", stderr: "", error: { kind: "spawn", message: error instanceof Error ? error.message : String(error) } } }
  let stop: (reason: "timeout" | "cancelled" | "error") => void = () => {}
  const stopped = new Promise<"timeout" | "cancelled" | "error">((resolve) => { stop = resolve })
  let error: ProcessResult["error"]
  const fail = (kind: NonNullable<ProcessResult["error"]>["kind"], value: unknown) => {
    if (!error || kind === "spawn") error = { kind, message: value instanceof Error ? value.message : String(value) }
    stop("error")
  }
  const drain = (stream: Readable, kind: "stdout" | "stderr") => new Promise<string>((resolve) => {
    const chunks: string[] = []
    stream.setEncoding("utf8")
    stream.on("data", (chunk: string) => chunks.push(chunk))
    stream.once("error", (error) => { fail(kind, error); resolve(chunks.join("")) })
    stream.once("end", () => resolve(chunks.join("")))
    stream.once("close", () => resolve(chunks.join("")))
  })
  const stdout = drain(proc.stdout!, "stdout")
  const stderr = drain(proc.stderr!, "stderr")
  const exited = new Promise<{ code: number | null; signal: string | undefined }>((resolve) => {
    proc.once("exit", (code, signal) => resolve({ code, signal: signal ?? undefined }))
    proc.once("error", (error) => { fail("spawn", error); resolve({ code: null, signal: undefined }) })
  })
  proc.stdin!.on("error", (error) => fail("stdin", error))
  const input = (async () => {
    const bytes = typeof options.input === "string" ? Buffer.from(options.input) : options.input ?? new Uint8Array()
    const write = (chunk?: Uint8Array) => new Promise<void>((resolve, reject) => {
      const closed = () => reject(new Error("stdin closed before delivery completed"))
      proc.stdin!.once("close", closed)
      const done = (error?: Error | null) => {
        proc.stdin!.removeListener("close", closed)
        if (error) reject(error)
        else resolve()
      }
      if (chunk) proc.stdin!.write(chunk, done)
      else proc.stdin!.end(done)
    })
    try {
      // This is flow control, not a payload limit. Every byte is delivered.
      const size = proc.stdin!.writableHighWaterMark
      for (let offset = 0; offset < bytes.length; offset += size) await write(bytes.subarray(offset, offset + size))
      await write()
    } catch (error) { fail("stdin", error) }
  })()
  const cancel = () => stop("cancelled")
  if (proc.pid) ownedProcesses.set(proc.pid, cancel)
  options.signal?.addEventListener("abort", cancel, { once: true })
  const timer = timeoutMs === undefined ? undefined : setTimeout(() => stop("timeout"), Math.max(1, timeoutMs))
  const complete = Promise.all([stdout, stderr, exited, input])
  const result = await Promise.race([complete.then(() => "complete" as const), stopped])
  if (result !== "complete") {
    const alive = proc.pid && proc.exitCode === null && proc.signalCode === null
    const pids = alive ? killTree ? await processTree(proc.pid!, cwd) : [proc.pid!] : []
    terminate(pids, "SIGTERM")
    proc.stdin!.destroy()
    if (pids.length) {
      await new Promise((resolve) => setTimeout(resolve, TERMINATION_GRACE_MS))
      terminate(pids.filter((pid) => pid !== proc.pid || (proc.exitCode === null && proc.signalCode === null)), "SIGKILL")
    }
    // An exited parent can leave inherited pipes open; cancellation still owns
    // our readers and must not wait forever for an untracked pipe holder.
    proc.stdout!.destroy()
    proc.stderr!.destroy()
  }
  const [out, err, exit] = await complete
  if (timer) clearTimeout(timer)
  options.signal?.removeEventListener("abort", cancel)
  if (proc.pid) ownedProcesses.delete(proc.pid)
  return { code: result === "complete" && !error ? exit.code ?? -1 : -1, exitCode: exit.code, signal: exit.signal, stdout: out, stderr: err, timedOut: result === "timeout", cancelled: result === "cancelled", error }
}

export const stopOwnedProcesses = () => {
  for (const cancel of ownedProcesses.values()) cancel()
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
