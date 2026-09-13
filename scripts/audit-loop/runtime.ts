import { lstat, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join } from "node:path"

export type AgentRuntime = { provider: "codex" | "cpamc"; model: string; effort: "high" | "xhigh"; baseUrl?: string }
type CpamcConfig = { provider: "cpamc"; baseUrl: string; model: string; effort: "high"; apiKeyFile?: string }

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const loopback = (value: string) => {
  try { const url = new URL(value); return url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname) && url.pathname.replace(/\/$/, "") === "/v1" ? url.toString().replace(/\/$/, "") : null } catch { return null }
}

export const defaultRuntime = (): AgentRuntime => ({ provider: "cpamc", baseUrl: "http://127.0.0.1:8317/v1", model: "gemini-3.8-flash-high", effort: "high" })

export const defaultSecretPath = () => join(homedir(), ".cli-proxy-api", "api-key.txt")

const resolveSecret = async (customPath?: string): Promise<string | undefined> => {
  if (customPath) {
    if (!isAbsolute(customPath)) throw new Error("CPAMC credential file is unsafe")
    const stat = await lstat(customPath)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("CPAMC credential file is unsafe")
    const secret = (await readFile(customPath, "utf8")).trim()
    if (!secret) throw new Error("CPAMC credential file is empty")
    return secret
  }
  const envKey = process.env.AUDIT_CPAMC_API_KEY?.trim()
  if (envKey) return envKey
  const defaultPath = defaultSecretPath()
  const stat = await lstat(defaultPath).catch(() => null)
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) return undefined
  const secret = (await readFile(defaultPath, "utf8").catch(() => "")).trim()
  return secret || undefined
}

export const loadRuntime = async (path: string): Promise<{ runtime: AgentRuntime; secret?: string }> => {
  const raw = await readFile(path, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  })
  if (raw === null) {
    const runtime = defaultRuntime()
    const secret = await resolveSecret()
    return { runtime, secret }
  }
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error("audit runtime configuration is invalid JSON") }
  if (!record(value)) throw new Error("audit runtime configuration is invalid")
  const keys = Object.keys(value)
  if (value.provider === "codex") {
    const allowedCodexKeys = new Set(["provider", "model", "effort"])
    if (keys.some((k) => !allowedCodexKeys.has(k)) || value.model !== "gpt-6-astra" || (value.effort !== "high" && value.effort !== "xhigh")) throw new Error("audit runtime configuration is invalid")
    return { runtime: { provider: "codex", model: value.model, effort: value.effort } }
  }
  const allowedCpamcKeys = new Set(["provider", "baseUrl", "model", "effort", "apiKeyFile"])
  if (value.provider !== "cpamc" || keys.some((k) => !allowedCpamcKeys.has(k)) || typeof value.baseUrl !== "string" || typeof value.model !== "string" || value.model !== "gemini-3.8-flash-high" || value.effort !== "high") throw new Error("audit runtime configuration is invalid")
  const baseUrl = loopback(value.baseUrl)
  if (!baseUrl) throw new Error("CPAMC endpoint must be local http://localhost/127.0.0.1/.../v1")
  if (value.apiKeyFile !== undefined && typeof value.apiKeyFile !== "string") throw new Error("audit runtime configuration is invalid")
  const secret = await resolveSecret(typeof value.apiKeyFile === "string" ? value.apiKeyFile : undefined)
  if (!secret) throw new Error("CPAMC credential not found: set AUDIT_CPAMC_API_KEY or provide ~/.cli-proxy-api/api-key.txt")
  return { runtime: { provider: "cpamc", baseUrl, model: value.model, effort: value.effort }, secret }
}

export const sameRuntime = (left: AgentRuntime, right: AgentRuntime) => left.provider === right.provider && left.model === right.model && left.effort === right.effort && left.baseUrl === right.baseUrl

export const cpamcArgs = (runtime: AgentRuntime) => runtime.provider === "cpamc" ? ["-c", "model_provider=\"audit_cpamc\"", "-c", "model_providers.audit_cpamc.name=\"CPAMC\"", "-c", `model_providers.audit_cpamc.base_url=${JSON.stringify(runtime.baseUrl)}`, "-c", "model_providers.audit_cpamc.wire_api=\"responses\"", "-c", "model_providers.audit_cpamc.env_key=\"AUDIT_CPAMC_API_KEY\"", "-c", "model_providers.audit_cpamc.requires_openai_auth=false", "-c", "shell_environment_policy.excludes=[\"AUDIT_CPAMC_API_KEY\"]"] : []
