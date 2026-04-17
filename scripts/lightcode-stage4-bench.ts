import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

type Run = {
  key: string
  canvas: "wgpu"
  force: "auto" | "layered-raw" | "final-frame-raw"
}

type Sample = {
  fps: number
  ms: number
  strategy: string
  output: string
  readback: number
}

type Report = {
  key: string
  canvas: string
  force: string
  exitCode: number | null
  kitty: boolean
  mode: string | null
  samples: Sample[]
  medianMs: number | null
  avgMs: number | null
  steadyMedianMs: number | null
  steadyAvgMs: number | null
}

const ROOT = process.cwd()
const PERF = "/tmp/lightcode-perf.log"
const DEBUG = "/tmp/lightcode-debug.log"
const GPU = "/tmp/tge-gpu-renderer.log"
const OUT = process.env.LIGHTCODE_STAGE4_BENCH_DIR ?? `/tmp/lightcode-stage4-bench-${Date.now()}`
const RUNS: Run[] = [
  { key: "gpu-auto", canvas: "wgpu", force: "auto" },
  { key: "gpu-layered", canvas: "wgpu", force: "layered-raw" },
  { key: "gpu-final", canvas: "wgpu", force: "final-frame-raw" },
]

function nums(values: number[]) {
  return values.filter((value) => Number.isFinite(value))
}

function avg(values: number[]) {
  const list = nums(values)
  if (list.length === 0) return null
  return list.reduce((sum, value) => sum + value, 0) / list.length
}

function median(values: number[]) {
  const list = nums(values).slice().sort((a, b) => a - b)
  if (list.length === 0) return null
  const mid = Math.floor(list.length / 2)
  if (list.length % 2 === 1) return list[mid]
  return (list[mid - 1] + list[mid]) / 2
}

function round(value: number | null) {
  if (value === null) return null
  return Number(value.toFixed(2))
}

function parseSamples(text: string) {
  const lines = text.split("\n")
  return lines
    .map((line) => {
      const match = line.match(/fps=(\d+) ms=([\d.]+).*strategy=([^\s]+) output=([^\s]+).*readback=(\d+)/)
      if (!match) return null
      return {
        fps: Number(match[1]),
        ms: Number(match[2]),
        strategy: match[3],
        output: match[4],
        readback: Number(match[5]),
      } satisfies Sample
    })
    .filter((value): value is Sample => value !== null)
}

function parseKitty(debug: string) {
  const line = debug.split("\n").find((entry) => entry.includes("terminal created")) ?? ""
  const kitty = line.includes("kitty=true")
  const match = line.match(/mode=([^\s]+)/)
  return {
    kitty,
    mode: match ? match[1] : null,
  }
}

async function readText(path: string) {
  if (!existsSync(path)) return ""
  return readFile(path, "utf8")
}

async function clearLogs() {
  await Promise.all([
    rm(PERF, { force: true }),
    rm(DEBUG, { force: true }),
    rm(GPU, { force: true }),
  ])
}

function runOne(item: Run, outDir: string) {
  const env: Record<string, string> = {
    ...process.env,
    LIGHTCODE_CANVAS_BACKEND: item.canvas,
    LIGHTCODE_LOG_FPS: process.env.LIGHTCODE_LOG_FPS ?? "1",
    LIGHTCODE_FORCE_REPAINT: process.env.LIGHTCODE_FORCE_REPAINT ?? "1",
    LIGHTCODE_FORCE_LAYER_REPAINT: process.env.LIGHTCODE_FORCE_LAYER_REPAINT ?? "1",
    LIGHTCODE_EXIT_AFTER_MS: process.env.LIGHTCODE_EXIT_AFTER_MS ?? "2500",
  }

  if (item.force === "auto") delete env.TGE_GPU_FORCE_LAYER_STRATEGY
  if (item.force !== "auto") env.TGE_GPU_FORCE_LAYER_STRATEGY = item.force

  const result = spawnSync("bun", ["--conditions=browser", "run", "examples/lightcode.tsx"], {
    cwd: ROOT,
    env,
    stdio: ["inherit", "inherit", "inherit"],
  })

  return result.status
}

async function saveLogs(item: Run, outDir: string, code: number | null): Promise<Report> {
  const perfPath = join(outDir, `${item.key}.perf.log`)
  const debugPath = join(outDir, `${item.key}.debug.log`)
  const gpuPath = join(outDir, `${item.key}.gpu.log`)

  if (existsSync(PERF)) await copyFile(PERF, perfPath)
  if (existsSync(DEBUG)) await copyFile(DEBUG, debugPath)
  if (existsSync(GPU)) await copyFile(GPU, gpuPath)

  const perf = await readText(PERF)
  const debug = await readText(DEBUG)
  const samples = parseSamples(perf)
  const steady = samples.slice(1)
  const kitty = parseKitty(debug)

  return {
    key: item.key,
    canvas: item.canvas,
    force: item.force,
    exitCode: code,
    kitty: kitty.kitty,
    mode: kitty.mode,
    samples,
    medianMs: round(median(samples.map((sample) => sample.ms))),
    avgMs: round(avg(samples.map((sample) => sample.ms))),
    steadyMedianMs: round(median(steady.map((sample) => sample.ms))),
    steadyAvgMs: round(avg(steady.map((sample) => sample.ms))),
  } satisfies Report
}

function reportLine(item: Report) {
  const last = item.samples[item.samples.length - 1]
  const strategy = last ? last.strategy : "none"
  const output = last ? last.output : "none"
  return [
    item.key.padEnd(12),
    `kitty=${String(item.kitty).padEnd(5)}`,
    `mode=${String(item.mode ?? "none").padEnd(6)}`,
    `strategy=${strategy.padEnd(15)}`,
    `output=${output.padEnd(15)}`,
    `steadyMedianMs=${String(item.steadyMedianMs ?? "n/a").padEnd(6)}`,
    `steadyAvgMs=${String(item.steadyAvgMs ?? "n/a").padEnd(6)}`,
  ].join("  ")
}

function reportMd(item: Report) {
  const last = item.samples[item.samples.length - 1]
  const strategy = last ? last.strategy : "none"
  const output = last ? last.output : "none"
  return `| ${item.key} | ${item.kitty} | ${item.mode ?? "none"} | ${strategy} | ${output} | ${item.steadyMedianMs ?? "n/a"} | ${item.steadyAvgMs ?? "n/a"} |`
}

await mkdir(OUT, { recursive: true })

const reports: Report[] = []
for (const item of RUNS) {
  console.log(`→ running ${item.key}`)
  await clearLogs()
  const code = runOne(item, OUT)
  const report = await saveLogs(item, OUT, code)
  reports.push(report)
}

const summaryJson = join(OUT, "summary.json")
const summaryMd = join(OUT, "summary.md")
const lines = reports.map((item) => reportLine(item))
const md = [
  "# Lightcode Stage 4 Bench Summary",
  "",
  `Output dir: \
${OUT}`,
  "",
  "| run | kitty | mode | strategy | output | steady median ms | steady avg ms |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...reports.map((item) => reportMd(item)),
  "",
  "Artifacts:",
  ...RUNS.flatMap((item) => [
    `- ${item.key}.perf.log`,
    `- ${item.key}.debug.log`,
    `- ${item.key}.gpu.log`,
  ]),
].join("\n")

await writeFile(summaryJson, JSON.stringify(reports, null, 2))
await writeFile(summaryMd, md)

console.log("")
console.log(`saved logs in ${OUT}`)
lines.forEach((line) => console.log(line))
console.log("")
console.log(`summary: ${summaryMd}`)
