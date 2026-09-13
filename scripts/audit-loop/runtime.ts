import { lstat, readFile, realpath } from "node:fs/promises"
import { isAbsolute, relative } from "node:path"

export type AgentRuntime = { provider: "codex" | "cpamc"; model: string; effort: "high" | "xhigh"; baseUrl?: string }
type CpamcConfig = { provider: "cpamc"; baseUrl: string; model: string; effort: "high"; apiKeyFile: string }

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const loopback = (value: string) => {
  try { const url = new URL(value); return url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname) && url.pathname.replace(/\/$/, "") === "/v1" ? url.toString().replace(/\/$/, "") : null } catch { return null }
}

export const defaultRuntime = (): AgentRuntime => ({ provider: "codex", model: "gpt-6-astra", effort: "high" })

export const loadRuntime = async (path: string): Promise<{ runtime: AgentRuntime; secret?: string }> => {
  const raw = await readFile(path, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  })
  if (raw === null) return { runtime: defaultRuntime() }
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error("audit runtime configuration is invalid JSON") }
  if (!record(value) || Object.keys(value).sort().join(",") !== "apiKeyFile,baseUrl,effort,model,provider" || value.provider !== "cpamc" || typeof value.baseUrl !== "string" || typeof value.model !== "string" || value.model !== "gemini-3.8-flash-high" || value.effort !== "high" || typeof value.apiKeyFile !== "string" || !isAbsolute(value.apiKeyFile)) throw new Error("audit runtime configuration is invalid")
  const baseUrl = loopback(value.baseUrl)
  if (!baseUrl) throw new Error("CPAMC endpoint must be local http://localhost/127.0.0.1/.../v1")
  const stat = await lstat(value.apiKeyFile)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("CPAMC credential file is unsafe")
  const secret = (await readFile(value.apiKeyFile, "utf8")).trim()
  if (!secret) throw new Error("CPAMC credential file is empty")
  return { runtime: { provider: "cpamc", baseUrl, model: value.model, effort: value.effort }, secret }
}

export const sameRuntime = (left: AgentRuntime, right: AgentRuntime) => left.provider === right.provider && left.model === right.model && left.effort === right.effort && left.baseUrl === right.baseUrl

export const cpamcArgs = (runtime: AgentRuntime) => runtime.provider === "cpamc" ? ["-c", 'model_provider="audit_cpamc"', "-c", 'model_providers.audit_cpamc.name="CPAMC"', "-c", `model_providers.audit_cpamc.base_url=${JSON.stringify(runtime.baseUrl)}`, "-c", 'model_providers.audit_cpamc.wire_api="responses"', "-c", 'model_providers.audit_cpamc.env_key="AUDIT_CPAMC_API_KEY"', "-c", "model_providers.audit_cpamc.requires_openai_auth=false", "-c", 'shell_environment_policy.exclude=["AUDIT_CPAMC_API_KEY"]'] : []
