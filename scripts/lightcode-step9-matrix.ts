import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

type Run = {
  key: string
  mode: "auto" | "direct" | "file" | "shm"
}

type Sample = {
  fps: number
  ms: number
  strategy: string
  output: string
  tx: string
  estLayered: number
  estFinal: number
  txPayload: number
  txTty: number
  txCalls: number
  txPatch: number
}

const ROOT = process.cwd()
const PERF = "/tmp/lightcode-perf.log"
const DEBUG = "/tmp/lightcode-debug.log"
const GPU = "/tmp/tge-gpu-renderer.log"
const OUT = process.env.LIGHTCODE_STEP9_MATRIX_DIR ?? `/tmp/lightcode-step9-matrix-${Date.now()}`
const RUNS: Run[] = [
  { key: "auto", mode: "auto" },
  { key: "direct", mode: "direct" },
  { key: "file", mode: "file" },
  { key: "shm", mode: "shm" },
]

function parseSamples(text: string): Sample[] {
  return text.split("\n").map((line) => {
    const match = line.match(/fps=(\d+) ms=([\d.]+).*strategy=([^\s]+) output=([^\s]+) tx=([^\s]+) estLayered=(\d+) estFinal=(\d+).*txPayload=(\d+) txTty=(\d+) txCalls=(\d+) txPatch=(\d+)/)
    if (!match) return null
    return {
      fps: Number(match[1]),
      ms: Number(match[2]),
      strategy: match[3],
      output: match[4],
      tx: match[5],
      estLayered: Number(match[6]),
      estFinal: Number(match[7]),
      txPayload: Number(match[8]),
      txTty: Number(match[9]),
      txCalls: Number(match[10]),
      txPatch: Number(match[11]),
    }
  }).filter((value): value is Sample => value !== null)
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

async function clearLogs() {
  await Promise.all([rm(PERF, { force: true }), rm(DEBUG, { force: true }), rm(GPU, { force: true })])
}

async function readText(path: string) {
  if (!existsSync(path)) return ""
  return readFile(path, "utf8")
}

function runOne(run: Run) {
  const env: Record<string, string> = {
    ...process.env,
    LIGHTCODE_CANVAS_BACKEND: "wgpu",
    LIGHTCODE_LOG_FPS: process.env.LIGHTCODE_LOG_FPS ?? "1",
    LIGHTCODE_FORCE_REPAINT: process.env.LIGHTCODE_FORCE_REPAINT ?? "1",
    LIGHTCODE_FORCE_LAYER_REPAINT: process.env.LIGHTCODE_FORCE_LAYER_REPAINT ?? "1",
    LIGHTCODE_EXIT_AFTER_MS: process.env.LIGHTCODE_EXIT_AFTER_MS ?? "2500",
  }
  if (run.mode === "auto") delete env.TGE_FORCE_TRANSMISSION_MODE
  else env.TGE_FORCE_TRANSMISSION_MODE = run.mode
  return spawnSync("bun", ["--conditions=browser", "run", "examples/lightcode-gpu.tsx"], {
    cwd: ROOT,
    env,
    stdio: ["inherit", "inherit", "inherit"],
  }).status
}

await mkdir(OUT, { recursive: true })

const reports: any[] = []
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
    mode: run.mode,
    exitCode,
    steadyMedianMs: median(steady.map((sample) => sample.ms)),
    strategy: steady[steady.length - 1]?.strategy ?? null,
    output: steady[steady.length - 1]?.output ?? null,
    tx: steady[steady.length - 1]?.tx ?? null,
    txPayload: steady[steady.length - 1]?.txPayload ?? 0,
    txTty: steady[steady.length - 1]?.txTty ?? 0,
    txCalls: steady[steady.length - 1]?.txCalls ?? 0,
    txPatch: steady[steady.length - 1]?.txPatch ?? 0,
  })
}

const summary = { reports }
await writeFile(join(OUT, "summary.json"), JSON.stringify(summary, null, 2))
const md = [
  "# Lightcode Step 9 Matrix",
  "",
  `Output dir: ${OUT}`,
  "",
  "| run | forced mode | strategy | output | tx | steady median ms | txPayload | txTty | txCalls | txPatch |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...reports.map((report) => `| ${report.key} | ${report.mode} | ${report.strategy ?? "none"} | ${report.output ?? "none"} | ${report.tx ?? "none"} | ${report.steadyMedianMs ?? "n/a"} | ${report.txPayload} | ${report.txTty} | ${report.txCalls} | ${report.txPatch} |`),
].join("\n")
await writeFile(join(OUT, "summary.md"), md)
console.log(`saved matrix summary in ${join(OUT, "summary.md")}`)
