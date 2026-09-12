import { createHash, randomUUID } from "node:crypto"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ProcessResult } from "./git"

export type CheckArtifact = {
  command: string[]
  manifest: string
  result: {
    ok: boolean
    executed: boolean
    logs: "complete" | "partial" | "not-executed"
    exitCode: number | null
    signal?: string
    timedOut: boolean
    cancelled: boolean
    error?: ProcessResult["error"]
    stdout: { path: string; bytes: number; sha256: string }
    stderr: { path: string; bytes: number; sha256: string }
  }
}

// Full logs live outside the bounded ledger. Publish references only after both
// channels and the manifest are finalized; no truncation or stderr/stdout choice.
export const persistCheckArtifacts = async (directory: string, command: string[], process: ProcessResult, executed = true): Promise<CheckArtifact> => {
  const root = join(directory, randomUUID())
  await mkdir(root, { recursive: true })
  const save = async (name: string, content: string) => {
    const path = join(root, name)
    await writeFile(`${path}.tmp`, content, "utf8")
    await rename(`${path}.tmp`, path)
    return { path, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex") }
  }
  const [stdout, stderr] = await Promise.all([save("stdout.log", process.stdout), save("stderr.log", process.stderr)])
  const artifact: CheckArtifact = { command, manifest: join(root, "check.json"), result: { ok: process.code === 0 && !process.error && !process.timedOut && !process.cancelled, executed, logs: !executed ? "not-executed" : process.error || process.timedOut || process.cancelled ? "partial" : "complete", exitCode: process.exitCode === undefined ? process.code : process.exitCode, signal: process.signal, timedOut: process.timedOut ?? false, cancelled: process.cancelled ?? false, error: process.error, stdout, stderr } }
  await writeFile(`${artifact.manifest}.tmp`, JSON.stringify(artifact, null, 2), "utf8")
  await rename(`${artifact.manifest}.tmp`, artifact.manifest)
  return artifact
}
