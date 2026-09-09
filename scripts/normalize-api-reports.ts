/**
 * Keep API Extractor warning paths stable across local and CI checkouts.
 *
 * API Extractor includes the absolute `.api-extractor-temp` path in forgotten
 * export diagnostics. Those diagnostics are useful, but the checkout prefix
 * is not part of the API contract and made the snapshot gate host-dependent.
 */

import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export const API_REPORT_PATHS = [
  "packages/engine/etc/engine.api.md",
  "packages/headless/etc/headless.api.md",
  "packages/styled/etc/styled.api.md",
  "packages/app/etc/app.api.md",
] as const

const TEMP_PATH = ".api-extractor-temp/"
const REPORT_EOL: Record<(typeof API_REPORT_PATHS)[number], "\n" | "\r\n"> = {
  // gen:types already canonicalizes this report to LF; keep api:update in sync.
  "packages/engine/etc/engine.api.md": "\n",
  // These reports are tracked with CRLF and API Extractor emits CRLF.
  "packages/headless/etc/headless.api.md": "\r\n",
  "packages/styled/etc/styled.api.md": "\r\n",
  "packages/app/etc/app.api.md": "\r\n",
}

/** Replace only the absolute checkout prefix before the extractor temp path. */
export function normalizeApiReport(source: string, eol?: "\n" | "\r\n"): string {
  const outputEol = eol ?? (source.includes("\r\n") ? "\r\n" : "\n")
  const normalized = source.replace(/\r\n?/g, "\n").split("\n").map((line) => {
    const marker = line.indexOf(TEMP_PATH)
    if (marker < 0) return line
    const pathStart = line.lastIndexOf(" ", marker - 1) + 1
    if (pathStart >= marker) return line
    return `${line.slice(0, pathStart)}<repo>/${line.slice(marker)}`
  }).join("\n")
  return outputEol === "\n" ? normalized : normalized.replace(/\n/g, outputEol)
}

async function main(): Promise<void> {
  const root = join(import.meta.dir, "..")
  await Promise.all(API_REPORT_PATHS.map(async (path) => {
    const file = join(root, path)
    const source = await readFile(file, "utf8")
    const normalized = normalizeApiReport(source, REPORT_EOL[path])
    if (source !== normalized) await writeFile(file, normalized)
  }))
}

if (import.meta.main) await main()
