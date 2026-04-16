import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

type Run = {
  key: string
  env: Record<string, string>
}

type Sample = {
  fps: number
  ms: number
  strategy: string
  output: string
  tx: string
  input: string
  latency: number
  surfaces: string
}

const ROOT = process.cwd()
const PERF = "/tmp/lightcode-gpu-first-perf.log"
const DEBUG = "/tmp/lightcode-gpu-first-debug.log"
const OUT = process.env.LIGHTCODE_GPU_FIRST_MATRIX_DIR ?? `/tmp/lightcode-gpu-first-matrix-${Date.now()}`

const baseEnv = {
  ...process.env,
  TGE_FORCE_TRANSMISSION_MODE: process.env.TGE_FORCE_TRANSMISSION_MODE ?? "file",
  LIGHTCODE_LOG_FPS: "1",
  LIGHTCODE_FORCE_REPAINT: process.env.LIGHTCODE_FORCE_REPAINT ?? "1",
  LIGHTCODE_EXIT_AFTER_MS: process.env.LIGHTCODE_EXIT_AFTER_MS ?? "2200",
}

const RUNS: Run[] = [
  { key: "all", env: {} },
  { key: "no-space", env: { LIGHTCODE_GPU_FIRST_SHOW_SPACE: "0" } },
  { key: "no-graph-bg", env: { LIGHTCODE_GPU_FIRST_SHOW_GRAPH_BG: "0" } },
  { key: "no-edges", env: { LIGHTCODE_GPU_FIRST_SHOW_GRAPH_EDGES: "0" } },
  { key: "no-overlay", env: { LIGHTCODE_GPU_FIRST_SHOW_GRAPH_OVERLAY: "0" } },
  { key: "no-shell", env: { LIGHTCODE_GPU_FIRST_SHOW_SHELL: "0", LIGHTCODE_GPU_FIRST_SHOW_HEADER: "0", LIGHTCODE_GPU_FIRST_SHOW_FOOTER: "0" } },
  { key: "editor-only", env: { LIGHTCODE_GPU_FIRST_SHOW_MEMORY: "0", LIGHTCODE_GPU_FIRST_SHOW_DIFF: "0", LIGHTCODE_GPU_FIRST_SHOW_AGENT: "0" } },
  { key: "no-panel-shadows", env: { LIGHTCODE_GPU_FIRST_PANEL_SHADOWS: "0" } },
  { key: "no-panel-gradients", env: { LIGHTCODE_GPU_FIRST_PANEL_GRADIENTS: "0" } },
]

function parseSamples(text: string) {
  return text.split("\n").map((line) => {
    const match = line.match(/fps=(\d+) ms=([\d.]+).*strategy=([^\s]+) output=([^\s]+) tx=([^\s]+) input=([^\s]+) latency=([\d.]+) surfaces=([^\n]+?) txPayload=/)
    if (!match) return null
    return {
      fps: Number(match[1]),
      ms: Number(match[2]),
      strategy: match[3],
      output: match[4],
      tx: match[5],
      input: match[6],
      latency: Number(match[7]),
      surfaces: match[8],
    } satisfies Sample
  }).filter((value): value is Sample => value !== null)
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

async function clearLogs() {
  await Promise.all([rm(PERF, { force: true }), rm(DEBUG, { force: true })])
}

async function readText(path: string) {
  if (!existsSync(path)) return ""
  return readFile(path, "utf8")
}

function runOne(run: Run) {
  return spawnSync("bun", ["--conditions=browser", "run", "examples/lightcode-gpu-first.tsx"], {
    cwd: ROOT,
    env: { ...baseEnv, ...run.env },
    stdio: ["inherit", "inherit", "inherit"],
  }).status
}

await mkdir(OUT, { recursive: true })

const reports: Array<Record<string, unknown>> = []
for (const run of RUNS) {
  console.log(`→ running ${run.key}`)
  await clearLogs()
  const exitCode = runOne(run)
  const perf = await readText(PERF)
  const debug = await readText(DEBUG)
  const samples = parseSamples(perf)
  const steady = samples.slice(1)
  if (existsSync(PERF)) await copyFile(PERF, join(OUT, `${run.key}.perf.log`))
  if (existsSync(DEBUG)) await copyFile(DEBUG, join(OUT, `${run.key}.debug.log`))
  reports.push({
    key: run.key,
    exitCode,
    steadyMedianMs: median(steady.map((sample) => sample.ms)),
    strategy: steady[steady.length - 1]?.strategy ?? null,
    output: steady[steady.length - 1]?.output ?? null,
    tx: steady[steady.length - 1]?.tx ?? null,
    surfaces: steady[steady.length - 1]?.surfaces ?? null,
  })
}

await writeFile(join(OUT, "summary.json"), JSON.stringify({ reports }, null, 2))
const md = [
  "# Lightcode GPU-First Layer Matrix",
  "",
  `Output dir: ${OUT}`,
  "",
  "| run | strategy | output | tx | steady median ms | surfaces |",
  "| --- | --- | --- | --- | --- | --- |",
  ...reports.map((report) => `| ${report.key} | ${report.strategy ?? "none"} | ${report.output ?? "none"} | ${report.tx ?? "none"} | ${report.steadyMedianMs ?? "n/a"} | ${report.surfaces ?? "n/a"} |`),
].join("\n")
await writeFile(join(OUT, "summary.md"), md)

console.log(`saved matrix summary in ${join(OUT, "summary.md")}`)
