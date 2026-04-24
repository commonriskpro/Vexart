import { readdir, readFile } from "node:fs/promises"
import { join, relative } from "node:path"

const roots = ["packages/engine/src", "docs"]
const extensions = new Set([".ts", ".tsx", ".md"])
const ignored = ["docs/archive/", "docs/PRD-RUST-RETAINED-ENGINE.md", "docs/ROADMAP-RUST-RETAINED-ENGINE.md"]
const forbidden = [
  "wgpu-mixed-scene",
  "gpu-raster-staging",
  "legacy CPU paint path",
  "current hybrid codebase",
  "TS fallback path remains active",
]

function hasCheckedExtension(path: string) {
  const dot = path.lastIndexOf(".")
  return dot >= 0 && extensions.has(path.slice(dot))
}

function isIgnored(path: string) {
  return ignored.some((entry) => path === entry || path.startsWith(entry))
}

async function collect(dir: string, files: string[] = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    const rel = relative(process.cwd(), path)
    if (isIgnored(rel)) continue
    if (entry.isDirectory()) {
      await collect(path, files)
      continue
    }
    if (entry.isFile() && hasCheckedExtension(path)) files.push(path)
  }
  return files
}

const findings: string[] = []
for (const root of roots) {
  for (const file of await collect(root)) {
    const text = await readFile(file, "utf8")
    const lines = text.split("\n")
    for (const phrase of forbidden) {
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes(phrase)) continue
        findings.push(`${relative(process.cwd(), file)}:${i + 1}: ${phrase}`)
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Retained cleanup gate failed:")
  for (const finding of findings) console.error(`  ${finding}`)
  process.exit(1)
}

console.log("retained cleanup gate passed")
