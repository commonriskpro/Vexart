import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { agentCommand } from "./index"
import { defaultSecretPath, loadRuntime } from "./runtime"

const roots: string[] = []
const fixture = async () => { const root = await mkdtemp(join(tmpdir(), "audit-runtime-")); roots.push(root); return root }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe("CPAMC runtime", () => {
  test("defaults to local CPAMC Gemini 3.8 runtime", async () => {
    const root = await fixture()
    const loaded = await loadRuntime(join(root, "runtime.json"))
    expect(loaded.runtime).toMatchObject({ provider: "cpamc", baseUrl: "http://127.0.0.1:8317/v1", model: "gemini-3.8-flash-high", effort: "high" })
    expect(defaultSecretPath()).toContain(".cli-proxy-api")
    const command = agentCommand("gate", "/worktree", "/schema", "/message", "prompt")
    expect(command).toContain("gemini-3.8-flash-high")
    expect(command).toContain('model_provider="audit_cpamc"')
  })

  test("resolves secret from AUDIT_CPAMC_API_KEY environment variable when no runtime.json exists", async () => {
    const root = await fixture()
    const originalEnv = process.env.AUDIT_CPAMC_API_KEY
    try {
      process.env.AUDIT_CPAMC_API_KEY = "env-secret-key"
      const loaded = await loadRuntime(join(root, "runtime.json"))
      expect(loaded.secret).toBe("env-secret-key")
    } finally {
      if (originalEnv !== undefined) process.env.AUDIT_CPAMC_API_KEY = originalEnv
      else delete process.env.AUDIT_CPAMC_API_KEY
    }
  })

  test("explicit codex configuration preserves the legacy role mapping", async () => {
    const root = await fixture()
    await writeFile(join(root, "runtime.json"), JSON.stringify({ provider: "codex", model: "gpt-6-astra", effort: "high" }))
    const loaded = await loadRuntime(join(root, "runtime.json"))
    expect(loaded.runtime).toMatchObject({ provider: "codex", model: "gpt-6-astra", effort: "high" })
    expect(agentCommand("gate", "/worktree", "/schema", "/message", "prompt", loaded.runtime)).toContain("gpt-5.6-luna")
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
    expect(command).toContain('shell_environment_policy.excludes=["AUDIT_CPAMC_API_KEY"]')
  })

  test("fails closed for remote endpoints, other models, or unsafe credentials", async () => {
    const root = await fixture(), key = join(root, "key")
    await writeFile(key, "secret")
    const symlinkKey = join(root, "symlink-key")
    await symlink(key, symlinkKey)
    const emptyKey = join(root, "empty-key")
    await writeFile(emptyKey, "")

    for (const config of [
      { provider: "cpamc", baseUrl: "https://example.test/v1", model: "gemini-3.8-flash-high", effort: "high", apiKeyFile: key },
      { provider: "cpamc", baseUrl: "http://127.0.0.1:8317/v1", model: "other", effort: "high", apiKeyFile: key },
      { provider: "cpamc", baseUrl: "http://127.0.0.1:8317/v1", model: "gemini-3.8-flash-high", effort: "xhigh", apiKeyFile: key },
      { provider: "cpamc", baseUrl: "http://127.0.0.1:8317/v1", model: "gemini-3.8-flash-high", effort: "high", apiKeyFile: key, extra: "disallowed" },
      { provider: "codex", model: "gpt-6-astra", effort: "high", extra: "disallowed" },
      { provider: "cpamc", baseUrl: "http://127.0.0.1:8317/v1", model: "gemini-3.8-flash-high", effort: "high", apiKeyFile: "relative/path" },
      { provider: "cpamc", baseUrl: "http://127.0.0.1:8317/v1", model: "gemini-3.8-flash-high", effort: "high", apiKeyFile: symlinkKey },
      { provider: "cpamc", baseUrl: "http://127.0.0.1:8317/v1", model: "gemini-3.8-flash-high", effort: "high", apiKeyFile: emptyKey },
    ]) {
      await writeFile(join(root, "runtime.json"), JSON.stringify(config))
      await expect(loadRuntime(join(root, "runtime.json"))).rejects.toThrow()
    }
  })
})
