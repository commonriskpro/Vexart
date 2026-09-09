/**
 * G-005 — Flexily 0.6.0 baseline.
 *
 * This benchmark deliberately exercises Flexily only. It is not a Grid
 * implementation and its incremental results are timing/cache observations,
 * never a conformance oracle. The tarball and workspace variants are loaded
 * in this process and receive the same fixture seeds and operation sequence.
 *
 * Default run (the acceptance run):
 *   bun run scripts/grid/baseline.ts
 *
 * A smaller run is useful for a focused smoke check, for example:
 *   bun run scripts/grid/baseline.ts --runs=1 --warmup=1 --frames=2 --sizes=100
 */

import { createHash } from "node:crypto"
import { cpus, homedir, platform, release, tmpdir, totalmem } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"

const PINNED_VERSION = "0.6.0"
const PINNED_COMMIT = "e9a752aacef9d84d20c383443b9c89f2ad2daf4a"
const TARBALL_URL = "https://registry.npmjs.org/flexily/-/flexily-0.6.0.tgz"
const TARBALL_INTEGRITY =
  "sha512-V2z9Nx+a77dicQUM5ktU6A4wSoNUbbVRocOCjXgLHIkhl/pdmrtX8MWQTwBJ3mCuB4pkniitvKW5C4tBo94XIg=="
const DEFAULT_SEED = 0x5eed_c0de
const DEFAULT_SIZES = [100, 400, 1000]
const SCENARIOS = ["initial", "no-op", "leaf-dirty", "resize", "nesting"] as const

export type Scenario = (typeof SCENARIOS)[number]

type FlexNode = {
  setWidth(value: number): void
  setHeight(value: number): void
  setFlexDirection(value: number): void
  setFlexWrap(value: number): void
  setAlignItems(value: number): void
  setJustifyContent(value: number): void
  setFlexGrow(value: number): void
  setFlexShrink(value: number): void
  setGap(gutter: number, value: number): void
  setPadding(edge: number, value: number): void
  insertChild(child: FlexNode, index: number): void
  getChildCount(): number
  getChild(index: number): FlexNode | undefined
  calculateLayout(width?: number, height?: number, direction?: number): void
  markLayoutSeen(): void
  freeRecursive(): void
  getComputedLeft(): number
  getComputedTop(): number
  getComputedWidth(): number
  getComputedHeight(): number
}

type FlexilyModule = {
  Node: {
    create(): FlexNode
    resetMeasureStats(): void
    measureCalls: number
    measureCacheHits: number
  }
  DIRECTION_LTR: number
  FLEX_DIRECTION_ROW: number
  FLEX_DIRECTION_COLUMN: number
  WRAP_WRAP: number
  ALIGN_STRETCH: number
  JUSTIFY_SPACE_BETWEEN: number
  GUTTER_ALL: number
  EDGE_ALL: number
  layoutNodeCalls: number
  layoutSizingCalls: number
  layoutPositioningCalls: number
  layoutCacheHits: number
  resetLayoutStats(): void
}

type Counters = {
  layoutNodeCalls: number
  layoutSizingCalls: number
  layoutPositioningCalls: number
  layoutCacheHits: number
  measureCalls: number
  measureCacheHits: number
}

type StageSamples = {
  sync: number[]
  calculate: number[]
  writeback: number[]
  render: number[]
}

type StageSummary = {
  count: number
  totalMs: number
  meanMs: number
  p50Ms: number
  p95Ms: number
  minMs: number
  maxMs: number
}

type PassSummary = {
  frames: number
  stages: Record<keyof StageSamples, StageSummary>
  counters: Counters
  noOpFrames: number
}

type ScenarioRun = {
  run: number
  seed: number
  warmup: PassSummary
  measured: PassSummary
}

export type BaselineOptions = {
  outputDir?: string
  runId?: string
  runs?: number
  warmupFrames?: number
  measuredFrames?: number
  sizes?: number[]
  seed?: number
  scenarios?: Scenario[]
  tarballEntry?: string
}

type NormalizedOptions = {
  outputDir: string
  runId: string
  runs: number
  warmupFrames: number
  measuredFrames: number
  sizes: number[]
  seed: number
  scenarios: Scenario[]
  tarballEntry?: string
}

type Fixture = {
  root: FlexNode
  nodes: FlexNode[]
  leaf: FlexNode
}

type VariantReport = {
  schemaVersion: "vexart/grid-flexily-baseline@1"
  runId: string
  variant: "tarball" | "workspace"
  source: {
    package: "flexily"
    version: string
    commit: string
    resolution: string
    tarballIntegrity?: string
    tarballUrl?: string
  }
  process: {
    pid: number
    mode: "serial-same-process"
    startedAt: string
  }
  configuration: {
    runs: number
    warmupFrames: number
    measuredFrames: number
    nodeCounts: number[]
    scenarios: Scenario[]
    seed: number
    serial: true
  }
  environment: EnvironmentReport
  oraclePolicy: {
    conformanceOracle: "none"
    incrementalVsFresh: "cache-and-timing-observation-only"
    realImplementation: true
    renderLayer: "layout-consumer-offscreen"
  }
  results: Array<{
    nodeCount: number
    scenario: Scenario
    fixtureSeed: number
    runs: ScenarioRun[]
    aggregate: PassSummary
  }>
}

type EnvironmentReport = {
  platform: string
  release: string
  arch: string
  bun: string
  node: string
  commit: string
  cpu: { model: string; cores: number; totalMemoryBytes: number }
  gpu: string
  terminal: {
    kind: "offscreen"
    transport: "none"
    term: string | null
    termProgram: string | null
    tmux: boolean
    physicalUi: false
  }
}

function positiveInt(value: string, flag: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer; received ${value}`)
  }
  return parsed
}

function parseScenario(value: string): Scenario {
  if ((SCENARIOS as readonly string[]).includes(value)) return value as Scenario
  throw new Error(`--scenario must be one of ${SCENARIOS.join(", ")}; received ${value}`)
}

export function normalizeOptions(options: BaselineOptions = {}): NormalizedOptions {
  const runId = options.runId ?? `grid-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${process.pid}`
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) throw new Error(`Invalid run id: ${runId}`)
  const runs = options.runs ?? 5
  const warmupFrames = options.warmupFrames ?? 100
  const measuredFrames = options.measuredFrames ?? 1000
  const sizes = options.sizes ?? DEFAULT_SIZES
  const scenarios = options.scenarios ?? [...SCENARIOS]
  if (!Number.isInteger(runs) || runs < 1) throw new Error("runs must be a positive integer")
  if (!Number.isInteger(warmupFrames) || warmupFrames < 0) throw new Error("warmupFrames must be a non-negative integer")
  if (!Number.isInteger(measuredFrames) || measuredFrames < 1) throw new Error("measuredFrames must be a positive integer")
  if (sizes.length === 0 || sizes.some((size) => !Number.isInteger(size) || size < 2)) {
    throw new Error("sizes must contain integers >= 2 (the root plus at least one child)")
  }
  if (scenarios.length === 0) throw new Error("at least one scenario is required")
  const root = options.outputDir ?? join(dirname(fileURLToPath(import.meta.url)), "../../artifacts/perf/grid-baseline", runId)
  return {
    outputDir: root,
    runId,
    runs,
    warmupFrames,
    measuredFrames,
    sizes: [...sizes],
    seed: options.seed ?? DEFAULT_SEED,
    scenarios: scenarios.map(parseScenario),
    tarballEntry: options.tarballEntry,
  }
}

function emptyCounters(): Counters {
  return {
    layoutNodeCalls: 0,
    layoutSizingCalls: 0,
    layoutPositioningCalls: 0,
    layoutCacheHits: 0,
    measureCalls: 0,
    measureCacheHits: 0,
  }
}

function addCounters(target: Counters, source: Counters): void {
  target.layoutNodeCalls += source.layoutNodeCalls
  target.layoutSizingCalls += source.layoutSizingCalls
  target.layoutPositioningCalls += source.layoutPositioningCalls
  target.layoutCacheHits += source.layoutCacheHits
  target.measureCalls += source.measureCalls
  target.measureCacheHits += source.measureCacheHits
}

function readCounters(module: FlexilyModule): Counters {
  return {
    layoutNodeCalls: module.layoutNodeCalls,
    layoutSizingCalls: module.layoutSizingCalls,
    layoutPositioningCalls: module.layoutPositioningCalls,
    layoutCacheHits: module.layoutCacheHits,
    measureCalls: module.Node.measureCalls,
    measureCacheHits: module.Node.measureCacheHits,
  }
}

function resetCounters(module: FlexilyModule): void {
  module.resetLayoutStats()
  module.Node.resetMeasureStats()
}

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

function createFixture(module: FlexilyModule, nodeCount: number, nested: boolean, seed: number): Fixture {
  const random = seeded(seed)
  const root = module.Node.create()
  root.setWidth(640)
  root.setHeight(360)
  root.setFlexDirection(module.FLEX_DIRECTION_ROW)
  root.setFlexWrap(module.WRAP_WRAP)
  root.setAlignItems(module.ALIGN_STRETCH)
  root.setJustifyContent(module.JUSTIFY_SPACE_BETWEEN)
  root.setGap(module.GUTTER_ALL, 4)
  root.setPadding(module.EDGE_ALL, 8)

  const nodes: FlexNode[] = [root]
  if (!nested) {
    for (let index = 1; index < nodeCount; index++) {
      const child = module.Node.create()
      child.setWidth(24 + Math.floor(random() * 56))
      child.setHeight(16 + Math.floor(random() * 32))
      child.setFlexGrow(index % 11 === 0 ? 1 : 0)
      child.setFlexShrink(1)
      root.insertChild(child, root.getChildCount())
      nodes.push(child)
    }
  } else {
    // A bounded breadth-first tree gives every requested size the same shape.
    // It avoids a deep recursive fixture while still exercising nested layout.
    const parents: FlexNode[] = [root]
    let parentIndex = 0
    while (nodes.length < nodeCount) {
      const parent = parents[parentIndex % parents.length]!
      const child = module.Node.create()
      child.setWidth(80 + Math.floor(random() * 100))
      child.setHeight(20 + Math.floor(random() * 40))
      child.setFlexDirection(nodes.length % 2 === 0 ? module.FLEX_DIRECTION_COLUMN : module.FLEX_DIRECTION_ROW)
      child.setFlexGrow(nodes.length % 7 === 0 ? 1 : 0)
      child.setFlexShrink(1)
      parent.insertChild(child, parent.getChildCount())
      nodes.push(child)
      if (parent.getChildCount() < 4) parents.push(child)
      parentIndex++
    }
  }

  const leaf = [...nodes].reverse().find((node) => node.getChildCount() === 0)
  if (!leaf) throw new Error(`fixture ${nodeCount} has no leaf`)
  return { root, nodes, leaf }
}

function emptySamples(): StageSamples {
  return { sync: [], calculate: [], writeback: [], render: [] }
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))
  return sorted[index]!
}

function summarizeSamples(values: number[]): StageSummary {
  if (values.length === 0) {
    return { count: 0, totalMs: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, minMs: 0, maxMs: 0 }
  }
  const totalMs = values.reduce((total, value) => total + value, 0)
  return {
    count: values.length,
    totalMs,
    meanMs: totalMs / values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    minMs: Math.min(...values),
    maxMs: Math.max(...values),
  }
}

function summarizePass(samples: StageSamples, counters: Counters, noOpFrames: number, frames: number): PassSummary {
  return {
    frames,
    stages: {
      sync: summarizeSamples(samples.sync),
      calculate: summarizeSamples(samples.calculate),
      writeback: summarizeSamples(samples.writeback),
      render: summarizeSamples(samples.render),
    },
    counters,
    noOpFrames,
  }
}

function mergeSamples(target: StageSamples, source: StageSamples): void {
  target.sync.push(...source.sync)
  target.calculate.push(...source.calculate)
  target.writeback.push(...source.writeback)
  target.render.push(...source.render)
}

function renderLayout(boxes: Array<{ left: number; top: number; width: number; height: number }>): number {
  // Flexily has no renderer. This is the real-layout adapter's final consumer:
  // it reads every written local rectangle and computes a stable checksum. It
  // intentionally does not compare against a fresh/incremental result.
  let checksum = 0
  for (const box of boxes) checksum += box.left * 3 + box.top * 5 + box.width * 7 + box.height * 11
  return checksum
}

function frame(module: FlexilyModule, scenario: Scenario, fixture: Fixture | undefined, nodeCount: number, seed: number, frameIndex: number): { fixture?: Fixture; stages: [number, number, number, number]; counters: Counters; noOp: boolean } {
  let current = fixture
  const syncStart = performance.now()
  if (scenario === "initial") current = createFixture(module, nodeCount, false, seed + frameIndex)
  if (!current) throw new Error(`fixture missing for ${scenario}`)
  if (scenario === "leaf-dirty") current.leaf.setWidth(20 + (frameIndex % 2))
  if (scenario === "resize") current.root.setWidth(640 + (frameIndex % 2))
  if (scenario === "nesting") current.leaf.setHeight(24 + (frameIndex % 2))
  const syncMs = performance.now() - syncStart

  resetCounters(module)
  const calculateStart = performance.now()
  current.root.calculateLayout(640 + (scenario === "resize" ? frameIndex % 2 : 0), 360, module.DIRECTION_LTR)
  const calculateMs = performance.now() - calculateStart

  const writebackStart = performance.now()
  const boxes = current.nodes.map((node) => ({
    left: node.getComputedLeft(),
    top: node.getComputedTop(),
    width: node.getComputedWidth(),
    height: node.getComputedHeight(),
  }))
  current.root.markLayoutSeen()
  const writebackMs = performance.now() - writebackStart

  const renderStart = performance.now()
  const checksum = renderLayout(boxes)
  if (!Number.isFinite(checksum)) throw new Error(`non-finite render checksum for ${scenario}/${nodeCount}`)
  const renderMs = performance.now() - renderStart
  const counters = readCounters(module)
  const noOp = counters.layoutNodeCalls === 0 && counters.layoutSizingCalls === 0 && counters.layoutPositioningCalls === 0

  if (scenario === "initial") {
    current.root.freeRecursive()
    return { stages: [syncMs, calculateMs, writebackMs, renderMs], counters, noOp }
  }
  return { fixture: current, stages: [syncMs, calculateMs, writebackMs, renderMs], counters, noOp }
}

function runPass(module: FlexilyModule, scenario: Scenario, fixture: Fixture | undefined, nodeCount: number, seed: number, frames: number, capture: boolean): { fixture?: Fixture; pass: PassSummary; samples: StageSamples } {
  const samples = emptySamples()
  const counters = emptyCounters()
  let noOpFrames = 0
  let current = fixture
  for (let frameIndex = 0; frameIndex < frames; frameIndex++) {
    const result = frame(module, scenario, current, nodeCount, seed, frameIndex)
    current = result.fixture
    addCounters(counters, result.counters)
    if (result.noOp) noOpFrames++
    if (capture) {
      samples.sync.push(result.stages[0])
      samples.calculate.push(result.stages[1])
      samples.writeback.push(result.stages[2])
      samples.render.push(result.stages[3])
    }
  }
  return { fixture: current, pass: summarizePass(samples, counters, noOpFrames, frames), samples }
}

function scenarioSeed(seed: number, nodeCount: number, scenario: Scenario, run: number): number {
  let value = (seed ^ Math.imul(nodeCount, 2654435761) ^ Math.imul(run, 2246822519)) >>> 0
  for (const character of scenario) value = (Math.imul(value ^ character.charCodeAt(0), 16777619) + 1013904223) >>> 0
  return value >>> 0
}

async function commandText(command: string[]): Promise<string> {
  const result = Bun.spawnSync(command, { stdout: "pipe", stderr: "ignore" })
  if (result.exitCode !== 0) return "unknown"
  return new TextDecoder().decode(result.stdout).trim() || "unknown"
}

async function environmentReport(): Promise<EnvironmentReport> {
  const cpu = cpus()[0]
  return {
    platform: platform(),
    release: release(),
    arch: process.arch,
    bun: Bun.version,
    node: process.version,
    commit: await commandText(["git", "rev-parse", "HEAD"]),
    cpu: {
      model: cpu?.model ?? "unknown",
      cores: cpus().length,
      totalMemoryBytes: totalmem(),
    },
    gpu: await commandText(["system_profiler", "SPDisplaysDataType"]),
    terminal: {
      kind: "offscreen",
      transport: "none",
      term: process.env.TERM ?? null,
      termProgram: process.env.TERM_PROGRAM ?? null,
      tmux: Boolean(process.env.TMUX),
      physicalUi: false,
    },
  }
}

async function sha512Integrity(path: string): Promise<string> {
  const bytes = await readFile(path)
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`
}

async function extractTarball(tarballPath: string, destination: string): Promise<string> {
  const result = Bun.spawnSync(["tar", "-xzf", tarballPath, "-C", destination], { stdout: "ignore", stderr: "pipe" })
  if (result.exitCode !== 0) {
    throw new Error(`cannot extract Flexily tarball: ${new TextDecoder().decode(result.stderr)}`)
  }
  return join(destination, "package", "dist", "index.mjs")
}

async function materializeTarball(entry?: string): Promise<{ entry: string; integrity: string; url: string }> {
  if (entry) return { entry, integrity: "provided-local-entry", url: TARBALL_URL }
  const directory = await mkdtemp(join(tmpdir(), "vexart-flexily-tarball-"))
  const tarball = join(directory, "flexily-0.6.0.tgz")
  const response = await fetch(TARBALL_URL)
  if (!response.ok) throw new Error(`failed to fetch ${TARBALL_URL}: HTTP ${response.status}`)
  await writeFile(tarball, Buffer.from(await response.arrayBuffer()))
  const integrity = await sha512Integrity(tarball)
  if (integrity !== TARBALL_INTEGRITY) throw new Error(`tarball integrity mismatch: ${integrity}`)
  return { entry: await extractTarball(tarball, directory), integrity, url: TARBALL_URL }
}

async function loadWorkspace(): Promise<{ module: FlexilyModule; resolution: string }> {
  const module = (await import("flexily")) as unknown as FlexilyModule
  return { module, resolution: await import.meta.resolve("flexily") }
}

async function loadTarball(entry?: string): Promise<{ module: FlexilyModule; source: { entry: string; integrity: string; url: string } }> {
  const source = await materializeTarball(entry)
  const module = (await import(pathToFileURL(source.entry).href)) as unknown as FlexilyModule
  return { module, source }
}

async function runVariant(module: FlexilyModule, variant: VariantReport["variant"], options: NormalizedOptions, source: VariantReport["source"]): Promise<VariantReport> {
  const environment = await environmentReport()
  const result: VariantReport["results"] = []
  for (const nodeCount of options.sizes) {
    for (const scenario of options.scenarios) {
      const fixtureSeed = scenarioSeed(options.seed, nodeCount, scenario, 0)
      const runs: ScenarioRun[] = []
      const aggregateSamples = emptySamples()
      const aggregateCounters = emptyCounters()
      let aggregateNoOpFrames = 0
      let aggregateFrames = 0
      for (let run = 0; run < options.runs; run++) {
        const seed = scenarioSeed(options.seed, nodeCount, scenario, run)
        let fixture: Fixture | undefined
        if (scenario !== "initial") fixture = createFixture(module, nodeCount, scenario === "nesting", seed)
        const warmup = runPass(module, scenario, fixture, nodeCount, seed, options.warmupFrames, false)
        fixture = warmup.fixture
        const measured = runPass(module, scenario, fixture, nodeCount, seed, options.measuredFrames, true)
        fixture = measured.fixture
        if (fixture) fixture.root.freeRecursive()
        mergeSamples(aggregateSamples, measured.samples)
        addCounters(aggregateCounters, measured.pass.counters)
        aggregateNoOpFrames += measured.pass.noOpFrames
        aggregateFrames += measured.pass.frames
        runs.push({ run: run + 1, seed, warmup: warmup.pass, measured: measured.pass })
      }
      result.push({
        nodeCount,
        scenario,
        fixtureSeed,
        runs,
        aggregate: summarizePass(aggregateSamples, aggregateCounters, aggregateNoOpFrames, aggregateFrames),
      })
    }
  }
  return {
    schemaVersion: "vexart/grid-flexily-baseline@1",
    runId: options.runId,
    variant,
    source,
    process: { pid: process.pid, mode: "serial-same-process", startedAt: new Date().toISOString() },
    configuration: {
      runs: options.runs,
      warmupFrames: options.warmupFrames,
      measuredFrames: options.measuredFrames,
      nodeCounts: options.sizes,
      scenarios: options.scenarios,
      seed: options.seed,
      serial: true,
    },
    environment,
    oraclePolicy: {
      conformanceOracle: "none",
      incrementalVsFresh: "cache-and-timing-observation-only",
      realImplementation: true,
      renderLayer: "layout-consumer-offscreen",
    },
    results: result,
  }
}

export async function runBaseline(options: BaselineOptions = {}): Promise<{ runId: string; outputDir: string; reports: { tarball: string; workspace: string }; manifest: string }> {
  const normalized = normalizeOptions(options)
  await mkdir(normalized.outputDir, { recursive: true })
  const startedAt = new Date().toISOString()

  // Load both implementations before measuring. The two loops below are
  // intentionally serial: no Promise.all and no worker/process isolation.
  const tarball = await loadTarball(normalized.tarballEntry)
  const workspace = await loadWorkspace()
  const tarballReport = await runVariant(tarball.module, "tarball", normalized, {
    package: "flexily",
    version: PINNED_VERSION,
    commit: PINNED_COMMIT,
    resolution: tarball.source.entry,
    tarballIntegrity: tarball.source.integrity,
    tarballUrl: tarball.source.url,
  })
  const workspaceReport = await runVariant(workspace.module, "workspace", normalized, {
    package: "flexily",
    version: PINNED_VERSION,
    commit: PINNED_COMMIT,
    resolution: workspace.resolution,
  })
  const tarballReportPath = join(normalized.outputDir, "tarball", "report.json")
  const workspaceReportPath = join(normalized.outputDir, "workspace", "report.json")
  await mkdir(dirname(tarballReportPath), { recursive: true })
  await mkdir(dirname(workspaceReportPath), { recursive: true })
  await writeFile(tarballReportPath, `${JSON.stringify(tarballReport, null, 2)}\n`)
  await writeFile(workspaceReportPath, `${JSON.stringify(workspaceReport, null, 2)}\n`)
  const manifestPath = join(normalized.outputDir, "manifest.json")
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: "vexart/grid-flexily-baseline-manifest@1",
        runId: normalized.runId,
        startedAt,
        completedAt: new Date().toISOString(),
        process: { pid: process.pid, mode: "serial-same-process" },
        configuration: normalized,
        pinned: { version: PINNED_VERSION, commit: PINNED_COMMIT, tarballUrl: TARBALL_URL, tarballIntegrity: TARBALL_INTEGRITY },
        reports: { tarball: "tarball/report.json", workspace: "workspace/report.json" },
      },
      null,
      2,
    )}\n`,
  )
  return { runId: normalized.runId, outputDir: normalized.outputDir, reports: { tarball: tarballReportPath, workspace: workspaceReportPath }, manifest: manifestPath }
}

function parseArgs(argv: string[]): BaselineOptions {
  const options: BaselineOptions = {}
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue
    const [flag, value] = argument.slice(2).split("=", 2)
    if (flag === "runs" && value) options.runs = positiveInt(value, "--runs")
    else if (flag === "warmup" && value) options.warmupFrames = positiveInt(value, "--warmup")
    else if (flag === "frames" && value) options.measuredFrames = positiveInt(value, "--frames")
    else if (flag === "sizes" && value) options.sizes = value.split(",").map((item) => positiveInt(item, "--sizes"))
    else if (flag === "seed" && value) options.seed = Number(value) >>> 0
    else if (flag === "run-id" && value) options.runId = value
    else if (flag === "out" && value) options.outputDir = value
    else if (flag === "scenario" && value) options.scenarios = [parseScenario(value)]
    else if (flag === "tarball-entry" && value) options.tarballEntry = value
    else if (flag !== "help") throw new Error(`unknown or incomplete option: ${argument}`)
  }
  return options
}

if (import.meta.main) {
  try {
    const result = await runBaseline(parseArgs(process.argv.slice(2)))
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
