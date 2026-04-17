import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { readFile, rm, writeFile } from "node:fs/promises"

type Sample = {
  fps: number
  ms: number
  strategy: string
  output: string
  readback: number
  resBytes: number
  gpuBytes: number
  resEntries: number
}

const ROOT = process.cwd()
const PERF = "/tmp/lightcode-perf.log"
const DEBUG = "/tmp/lightcode-debug.log"
const GPU = "/tmp/tge-gpu-renderer.log"
const OUT = process.env.LIGHTCODE_STEP7_STRESS_OUT ?? `/tmp/lightcode-step7-stress-${Date.now()}.json`

function parseSamples(text: string): Sample[] {
  return text.split("\n").map((line) => {
    const match = line.match(/fps=(\d+) ms=([\d.]+).*strategy=([^\s]+) output=([^\s]+).*readback=(\d+) resBytes=(\d+) gpuBytes=(\d+) resEntries=(\d+)/)
    if (!match) return null
    return {
      fps: Number(match[1]),
      ms: Number(match[2]),
      strategy: match[3],
      output: match[4],
      readback: Number(match[5]),
      resBytes: Number(match[6]),
      gpuBytes: Number(match[7]),
      resEntries: Number(match[8]),
    }
  }).filter((value): value is Sample => value !== null)
}

function maxBy(samples: Sample[], key: keyof Pick<Sample, "ms" | "resBytes" | "gpuBytes" | "resEntries">) {
  return samples.reduce((max, sample) => Math.max(max, sample[key] as number), 0)
}

function avg(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

await Promise.all([
  rm(PERF, { force: true }),
  rm(DEBUG, { force: true }),
  rm(GPU, { force: true }),
])

const env = {
  ...process.env,
  LIGHTCODE_CANVAS_BACKEND: "wgpu",
  LIGHTCODE_LOG_FPS: process.env.LIGHTCODE_LOG_FPS ?? "1",
  LIGHTCODE_FORCE_REPAINT: process.env.LIGHTCODE_FORCE_REPAINT ?? "1",
  LIGHTCODE_FORCE_LAYER_REPAINT: process.env.LIGHTCODE_FORCE_LAYER_REPAINT ?? "0",
  LIGHTCODE_EXIT_AFTER_MS: process.env.LIGHTCODE_EXIT_AFTER_MS ?? "20000",
}

const result = spawnSync("bun", ["--conditions=browser", "run", "examples/lightcode.tsx"], {
  cwd: ROOT,
  env,
  stdio: ["inherit", "inherit", "inherit"],
})

const perf = existsSync(PERF) ? await readFile(PERF, "utf8") : ""
const samples = parseSamples(perf)
const steady = samples.slice(1)
const summary = {
  exitCode: result.status,
  sampleCount: samples.length,
  steadyCount: steady.length,
  avgMs: avg(steady.map((sample) => sample.ms)),
  maxMs: maxBy(steady, "ms"),
  avgResBytes: avg(steady.map((sample) => sample.resBytes)),
  maxResBytes: maxBy(steady, "resBytes"),
  avgGpuBytes: avg(steady.map((sample) => sample.gpuBytes)),
  maxGpuBytes: maxBy(steady, "gpuBytes"),
  avgResEntries: avg(steady.map((sample) => sample.resEntries)),
  maxResEntries: maxBy(steady, "resEntries"),
  strategies: Array.from(new Set(samples.map((sample) => sample.strategy))),
  outputs: Array.from(new Set(samples.map((sample) => sample.output))),
  samples,
}

await writeFile(OUT, JSON.stringify(summary, null, 2))
console.log(`saved stress summary in ${OUT}`)
console.log(JSON.stringify({
  exitCode: summary.exitCode,
  steadyCount: summary.steadyCount,
  avgMs: Number(summary.avgMs.toFixed(2)),
  maxMs: Number(summary.maxMs.toFixed(2)),
  avgResBytes: Math.round(summary.avgResBytes),
  maxResBytes: summary.maxResBytes,
  avgGpuBytes: Math.round(summary.avgGpuBytes),
  maxGpuBytes: summary.maxGpuBytes,
  avgResEntries: Number(summary.avgResEntries.toFixed(2)),
  maxResEntries: summary.maxResEntries,
  strategies: summary.strategies,
  outputs: summary.outputs,
}, null, 2))
