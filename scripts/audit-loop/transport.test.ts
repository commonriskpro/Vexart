import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { agentCommand, recordAgentResult, saveAgentReceipt, verificationArtifacts } from "./index"
import { runProcess } from "./git"
import { persistCheckArtifacts } from "./process-artifacts"

const fixtures: string[] = []
afterEach(async () => { await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })
const directory = async () => { const root = await mkdtemp(join(tmpdir(), "audit-process-")); fixtures.push(root); return root }

describe("prompt transport and full check artifacts", () => {
  test("agent argv names stdin instead of carrying the prompt payload", () => {
    const prompt = "payload".repeat(300_000)
    const command = agentCommand("apply", "/worktree", "/schema", "/message", prompt)
    expect(command.at(-1)).toBe("-")
    expect(command).not.toContain(prompt)
  })

  test("round-trips exact UTF-8 prompt bytes larger than ARG_MAX with EOF", async () => {
    const input = "\n  α\t`quoted`\0" + "payload".repeat(500_000) + "\nfinal\n"
    const result = await runProcess(["cat"], process.cwd(), 5_000, true, { input })
    expect(result.code).toBe(0)
    expect(result.error).toBeUndefined()
    expect(Buffer.byteLength(result.stdout)).toBe(Buffer.byteLength(input))
    expect(createHash("sha256").update(result.stdout).digest("hex")).toBe(createHash("sha256").update(input).digest("hex"))
    expect(result.stdout).toBe(input)
  })

  test("receipt boundary preserves the complete prompt and raw response while rejecting transport failure", async () => {
    const root = await directory()
    const path = join(root, "receipt.json")
    const prompt = "exact prompt\n".repeat(250_000)
    const responseText = JSON.stringify({ kind: "apply", status: "blocked", changedPaths: [], summary: "no changes", checks: [], concerns: [] })
    const receipt = { attemptId: "attempt", agentKey: "agent", role: "apply" as const, scope: ".", strategy: "fixture", command: agentCommand("apply", root, "schema", "message", prompt), prompt, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), exitCode: -1, stdout: "events", stderr: "diagnostic", responseText }
    const saved = await saveAgentReceipt(path, { root, baselineSha: "captured", readScope: "." }, receipt, "stdin transport failure: EPIPE")
    const disk = JSON.parse(await readFile(path, "utf8"))
    expect(disk).toEqual(saved)
    expect(disk.prompt).toBe(prompt)
    expect(disk.responseText).toBe(responseText)
    expect(disk.command.at(-1)).toBe("-")
    expect(disk.command).not.toContain(prompt)
    expect(disk.parseError).toBe("stdin transport failure: EPIPE")
    expect(disk.exitCode).not.toBe(0)
  })

  test("drains both large output channels while delivering stdin, not sequentially", async () => {
    const size = 2 * 1024 * 1024
    const input = "i".repeat(size)
    const script = `process.stdout.write("o".repeat(${size})); process.stderr.write("e".repeat(${size})); const input = await Bun.stdin.text(); process.stdout.write("\\n" + input.length);`
    const result = await runProcess([process.execPath, "-e", script], process.cwd(), 5_000, true, { input })
    expect(result.code).toBe(0)
    expect(result.stdout).toBe("o".repeat(size) + `\n${size}`)
    expect(result.stderr).toBe("e".repeat(size))
  })

  test("timeout owns input backpressure and releases the process", async () => {
    const start = Date.now()
    const result = await runProcess([process.execPath, "-e", "setInterval(() => {}, 10000)"], process.cwd(), 60, true, { input: "x".repeat(8 * 1024 * 1024) })
    expect(result.timedOut).toBe(true)
    expect(result.code).not.toBe(0)
    expect(Date.now() - start).toBeLessThan(2_500)
  })

  test("abort cancellation includes pending stdin and cannot report success", async () => {
    const controller = new AbortController()
    const root = await directory()
    const ready = join(root, "ready")
    const task = runProcess([process.execPath, "-e", `process.on('SIGTERM', () => process.exit(0)); await Bun.write(${JSON.stringify(ready)}, "ready"); setInterval(() => {}, 10000)`], process.cwd(), 5_000, true, { input: "x".repeat(8 * 1024 * 1024), signal: controller.signal })
    const deadline = Date.now() + 2_000
    while (!(await Bun.file(ready).exists()) && Date.now() < deadline) await Bun.sleep(10)
    controller.abort()
    const result = await task
    expect(await Bun.file(ready).exists()).toBe(true)
    expect(result.cancelled).toBe(true)
    expect(result.code).not.toBe(0)
    expect(result.exitCode).toBe(0)
    const aborted = await runProcess(["nonexistent-command-must-not-spawn"], process.cwd(), 100, false, { signal: controller.signal })
    expect(aborted.cancelled).toBe(true)
    expect(aborted.error).toBeUndefined()
  })

  test("spawn failure and early stdin close are explicit non-successes", async () => {
    const missing = await runProcess(["/nonexistent/audit-process-fixture"], process.cwd(), 1_000, true, { input: "prompt" })
    expect(missing.code).not.toBe(0)
    expect(missing.error?.kind).toBe("spawn")
    const closed = await runProcess([process.execPath, "-e", "process.stdin.destroy(); process.exit(0)"], process.cwd(), 2_000, true, { input: "x".repeat(8 * 1024 * 1024) })
    expect(closed.code).not.toBe(0)
    expect(closed.error?.kind).toBe("stdin")
    expect(closed.exitCode).toBe(0)
    const root = await directory()
    const path = join(root, "receipt.json")
    const responseText = JSON.stringify({ kind: "apply", status: "blocked", changedPaths: [], summary: "no changes", checks: [], concerns: [] })
    const saved = await recordAgentResult({ store: root, runId: "run", path, snapshot: { root, baselineSha: "captured", readScope: "." } }, { profileId: "lifecycle", profileVersion: 1, attemptId: "attempt", agentKey: "agent", role: "apply", scope: ".", strategy: "fixture", command: [process.execPath, "-e", "process.stdin.destroy(); process.exit(0)"], prompt: "x".repeat(8 * 1024 * 1024), startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), responseText }, closed)
    const disk = JSON.parse(await readFile(path, "utf8"))
    const event = JSON.parse((await readFile(join(root, "events.jsonl"), "utf8")).trim())
    expect(disk).toEqual(saved)
    expect(disk).toMatchObject({ originalExitCode: 0, exitCode: -1, responseText })
    expect(disk.parseError).toContain("stdin transport failure")
    expect(event).toMatchObject({ type: "agent_receipt", runId: "run", attemptId: "attempt", originalExitCode: 0, exitCode: -1, parseOk: false, profileId: "lifecycle", profileVersion: 1, scope: ".", error: { kind: "stdin" } })
    expect(event.error.message).toContain("stdin transport failure")

  })

  test("publishes compact failed-check metadata only after full stdout and stderr artifacts exist", async () => {
    const root = await directory()
    const stdout = "out\n".repeat(1_000_000)
    const stderr = "err\n".repeat(1_000_000)
    const check = await persistCheckArtifacts(root, ["bun", "run", "test"], { code: 1, exitCode: 1, stdout, stderr })
    expect(check.result.ok).toBe(false)
    expect(check.result.exitCode).toBe(1)
    expect(check.result.logs).toBe("complete")
    expect(await readFile(check.result.stdout.path, "utf8")).toBe(stdout)
    expect(await readFile(check.result.stderr.path, "utf8")).toBe(stderr)
    expect(check.result.stdout.bytes).toBe(Buffer.byteLength(stdout))
    expect(check.result.stderr.bytes).toBe(Buffer.byteLength(stderr))
    expect(JSON.parse(await readFile(check.manifest, "utf8"))).toEqual(check)
    const evidence = verificationArtifacts({ store: root, id: "run" }, { agentKey: "verifier", attemptId: "attempt" }, "rejected", [check])
    const ledger = JSON.stringify({ type: "verification_failed", ...evidence })
    expect(ledger.length).toBeLessThan(2_048)
    expect(ledger).not.toContain("out\nout\n")
    expect(ledger).not.toContain("err\nerr\n")
    expect(evidence.verifier.receiptPath).toBe(join(root, "runs", "run", "receipts", "verifier", "attempt.json"))
    const folders = await readdir(root)
    expect((await readdir(join(root, folders[0]))).sort()).toEqual(["check.json", "stderr.log", "stdout.log"])
  })

  test("storage failures reject instead of publishing references to missing artifacts", async () => {
    const root = await directory()
    const file = join(root, "not-a-directory")
    await writeFile(file, "owned fixture")
    await expect(persistCheckArtifacts(file, ["fixture"], { code: 1, stdout: "full out", stderr: "full err" })).rejects.toThrow()
    expect(await readFile(file, "utf8")).toBe("owned fixture")
    expect(await readdir(root)).toEqual(["not-a-directory"])
  })

  test("artifact failure metadata retains original exit status and transport failure", async () => {
    const root = await directory()
    const check = await persistCheckArtifacts(root, ["fixture"], { code: -1, exitCode: 0, stdout: "before cancel", stderr: "diagnostic", cancelled: true, error: { kind: "stdin", message: "EPIPE" } })
    expect(check.result).toMatchObject({ ok: false, logs: "partial", exitCode: 0, cancelled: true, error: { kind: "stdin", message: "EPIPE" } })
  })
})
