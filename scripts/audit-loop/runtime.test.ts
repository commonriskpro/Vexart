import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { agentCommand } from "./index"
import { loadRuntime } from "./runtime"

const roots: string[] = []
const fixture = async () => { const root = await mkdtemp(join(tmpdir(), "audit-runtime-")); roots.push(root); return root }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe("CPAMC runtime", () => {
  test("defaults preserve the legacy role mapping", async () => {
    const root = await fixture()
    expect((await loadRuntime(join(root, "runtime.json"))).runtime).toMatchObject({ provider: "codex", model: "gpt-6-astra", effort: "high" })
    expect(agentCommand("gate", "/worktree", "/schema", "/message", "prompt")).toContain("gpt-5.6-luna")
  })
  test("accepts only the fixed local Gemini runtime and keeps the key out of argv", async () => {
    const root = await fixture(), key = join(root, "key")
    await writeFile(key, "synthetic-secret")
    const config = { provider: "cpamc", baseUrl: "http://127.0.0.1:8317/v1", model: "gemini-3.8-flash-high", effort: "high", apiKeyFile: key }
    await writeFile(join(root, "runtime.json"), JSON.stringify(config))
    const loaded = await loadRuntime(join(root, "runtime.json"))
    expect(loaded.runtime).toEqual({ provider: "cpamc", baseUrl: config.baseUrl, model: config.model, effort: "high" })
    expect(loaded.secret).toBe("synthetic-secret")
    const command = agentCommand("verifier", "/worktree", "/schema", "/message", "prompt", loaded.runtime)
    expect(command).toContain("gemini-3.8-flash-high")
    expect(command).toContain('model_providers.audit_cpamc.env_key="AUDIT_CPAMC_API_KEY"')
    expect(command.join(" ")).not.toContain("synthetic-secret")
    expect(command).toContain('shell_environment_policy.exclude=["AUDIT_CPAMC_API_KEY"]')
  })
  test("fails closed for remote endpoints, other models, or unsafe credentials", async () => {
    const root = await fixture(), key = join(root, "key")
    await writeFile(key, "secret")
    for (const config of [
      { provider: "cpamc", baseUrl: "https://example.test/v1", model: "gemini-3.8-flash-high", effort: "high", apiKeyFile: key },
      { provider: "cpamc", baseUrl: "http://127.0.0.1:8317/v1", model: "other", effort: "high", apiKeyFile: key },
      { provider: "cpamc", baseUrl: "http://127.0.0.1:8317/v1", model: "gemini-3.8-flash-high", effort: "xhigh", apiKeyFile: key },
    ]) { await writeFile(join(root, "runtime.json"), JSON.stringify(config)); await expect(loadRuntime(join(root, "runtime.json"))).rejects.toThrow() }
  })
})
