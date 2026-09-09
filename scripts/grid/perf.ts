/**
 * G-039 — serial Flex/Grid performance gate.
 *
 * This is an offscreen layout-consumer benchmark. It uses the real vendored
 * Flexily Node (never a mock), keeps Flex and Grid fixtures deterministic, and
 * measures the four observable layers separately. Incremental/no-op numbers
 * are cache observations only; this file is not a CSS conformance oracle.
 *
 * Acceptance run:
 *   bun run scripts/grid/perf.ts
 *
 * A focused run may override the frame counts for development. The acceptance
 * defaults remain five serial runs, 100 warmup frames, and 1000 measured
 * frames. Every invocation writes a new report directory.
 */

import { createHash } from "node:crypto"
import { cpus, platform, release, tmpdir, totalmem } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import * as Flexily from "flexily"
import type { GridStyle } from "flexily"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const DEFAULT_OUTPUT_DIR = join(ROOT, "artifacts/perf/grid")
const BASELINE_PATH = join(ROOT, "artifacts/perf/grid-baseline/grid-g005-acceptance/workspace/report.json")
const TARBALL_URL = "https://registry.npmjs.org/flexily/-/flexily-0.6.0.tgz"
const TARBALL_INTEGRITY = "sha512-V2z9Nx+a77dicQUM5ktU6A4wSoNUbbVRocOCjXgLHIkhl/pdmrtX8MWQTwBJ3mCuB4pkniitvKW5C4tBo94XIg=="
const PINNED_VERSION = "0.6.0"
const PINNED_COMMIT = "e9a752aacef9d84d20c383443b9c89f2ad2daf4a"
const DEFAULT_SEED = 0x5eed_c0de
const NODE_COUNT = 400
const WIDTH = 640
const HEIGHT = 360
const GRID_COLUMNS = [145, 145, 145, 145] as const
const GRID_ROWS = 100
const GRID_ROW_HEIGHT = 32
const STAGES = ["sync", "calculate", "writeback", "render"] as const
const SCENARIOS = ["initial", "no-op", "leaf-dirty", "resize"] as const

/** Shared fixture contract: the Flex half mirrors G-005 exactly. */
export const PERF_FIXTURE_CONTRACT = Object.freeze({
  totalNodes: NODE_COUNT,
  childNodes: NODE_COUNT - 1,
  rootWidth: 640,
  rootHeight: 360,
  gap: 4,
  padding: 8,
  childWidthMin: 24,
  childWidthMaxExclusive: 80,
  childHeightMin: 16,
  childHeightMaxExclusive: 48,
  flexGrowPeriod: 11,
  rootIncludedInNodeCount: true,
})

export type PerfScenario = (typeof SCENARIOS)[number]
export type PerfVariant = "flex-comparable" | "grid400" | "flex-tarball-control"
export type PerfStage = (typeof STAGES)[number]

export type PerfOptions = {
  outputDir?: string
  runId?: string
  runs?: number
  warmupFrames?: number
  measuredFrames?: number
  seed?: number
  scenarios?: PerfScenario[]
  enforceGates?: boolean
  /** Test-only local dist/index.mjs; the acceptance path downloads the pin. */
  tarballEntry?: string
}

type NormalizedOptions = {
  outputDir: string
  runId: string
  runs: number
  warmupFrames: number
  measuredFrames: number
  seed: number
  scenarios: PerfScenario[]
  enforceGates: boolean
  tarballEntry?: string
}

type StageSamples = Record<PerfStage, number[]>
type Counters = {
  layoutNodeCalls: number
  layoutSizingCalls: number
  layoutPositioningCalls: number
  layoutCacheHits: number
  measureCalls: number
  measureCacheHits: number
  gridLayoutCalls: number
  gridNoOp: number
  gridErrors: number
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
  stages: Record<PerfStage, StageSummary>
  /** Sum of stage p95 values; this is the comparable gate metric. */
  p95SumMs: number
  counters: Counters
  noOpFrames: number
}

type ScenarioRun = {
  run: number
  seed: number
  warmup: PassSummary
  measured: PassSummary
}

type ScenarioReport = {
  variant: PerfVariant
  nodeCount: number
  scenario: PerfScenario
  fixtureSeed: number
  runs: ScenarioRun[]
  aggregate: PassSummary
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

/** The common low-level API shared by workspace and pinned tarball Flexily. */
type LayoutModule = {
  Node: typeof Flexily.Node
  DIRECTION_LTR: number
  FLEX_DIRECTION_ROW: number
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
  getGridLayoutStats?: () => { layoutCalls: number; noOp: number; errors: number }
  resetGridLayoutStats?: () => void
}

type Fixture = {
  root: InstanceType<typeof Flexily.Node>
  nodes: InstanceType<typeof Flexily.Node>[]
  leaf: InstanceType<typeof Flexily.Node>
  boxes: Float64Array
  variant: PerfVariant
}

type FrameResult = {
  fixture?: Fixture
  stages: Record<PerfStage, number>
  counters: Counters
  noOp: boolean
}

type BaselineReport = {
  results?: Array<{
    nodeCount: number
    scenario: string
    aggregate?: { stages?: Record<string, { p95Ms?: number }> }
  }>
}

type BaselineFiles = {
  workspacePath: string
  tarballPath: string
  workspace?: BaselineReport
  tarball?: BaselineReport
  errors: { workspace?: string; tarball?: string }
}

export type BaselineNormalization = {
  formula: "historicalWorkspaceP95Ms * (contemporaryTarballP95Ms / historicalTarballP95Ms)"
  historicalWorkspaceP95Ms: number | null
  historicalTarballP95Ms: number | null
  contemporaryTarballP95Ms: number | null
  contemporaryTarballToHistoricalTarballRatio: number | null
  normalizedBaselineP95Ms: number | null
  status: "PASS" | "BLOCKED"
}

type Gate = {
  metric: string
  valueMs: number
  baselineMs: number
  ratio: number | null
  limit: number
  passed: boolean
  status: "PASS" | "BLOCKED"
}

function positiveInt(value: string, flag: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer; received ${value}`)
  return parsed
}

function parseScenario(value: string): PerfScenario {
  if ((SCENARIOS as readonly string[]).includes(value)) return value as PerfScenario
  throw new Error(`--scenario must be one of ${SCENARIOS.join(", ")}; received ${value}`)
}

export function normalizeOptions(options: PerfOptions = {}): NormalizedOptions {
  const runId = options.runId ?? `grid-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${process.pid}`
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) throw new Error(`Invalid run id: ${runId}`)
  const runs = options.runs ?? 5
  const warmupFrames = options.warmupFrames ?? 100
  const measuredFrames = options.measuredFrames ?? 1000
  const scenarios = options.scenarios ?? [...SCENARIOS]
  if (!Number.isInteger(runs) || runs < 1) throw new Error("runs must be a positive integer")
  if (!Number.isInteger(warmupFrames) || warmupFrames < 0) throw new Error("warmupFrames must be a non-negative integer")
  if (!Number.isInteger(measuredFrames) || measuredFrames < 1) throw new Error("measuredFrames must be a positive integer")
  if (scenarios.length === 0) throw new Error("at least one scenario is required")
  return {
    outputDir: options.outputDir ?? DEFAULT_OUTPUT_DIR,
    runId,
    runs,
    warmupFrames,
    measuredFrames,
    seed: options.seed ?? DEFAULT_SEED,
    scenarios: scenarios.map(parseScenario),
    // Library callers can collect a report without making a machine-dependent
    // timing assertion. The CLI is the acceptance gate and enables this.
    enforceGates: options.enforceGates ?? false,
    tarballEntry: options.tarballEntry,
  }
}

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

function scenarioSeed(seed: number, scenario: PerfScenario, run: number): number {
  let value = (seed ^ Math.imul(NODE_COUNT, 2654435761) ^ Math.imul(run, 2246822519)) >>> 0
  for (const character of scenario) value = (Math.imul(value ^ character.charCodeAt(0), 16777619) + 1013904223) >>> 0
  return value >>> 0
}

function createGridStyle(): GridStyle {
  return {
    columns: GRID_COLUMNS,
    rows: Array.from({ length: GRID_ROWS }, () => GRID_ROW_HEIGHT),
    autoColumns: "auto",
    autoRows: GRID_ROW_HEIGHT,
    autoFlow: "row",
    areas: [],
    gap: PERF_FIXTURE_CONTRACT.gap,
    justifyContent: "start",
    alignContent: "start",
    justifyItems: "stretch",
    alignItems: "stretch",
  }
}

function createFixture(module: LayoutModule, variant: PerfVariant, seed: number): Fixture {
  const random = seeded(seed)
  const root = module.Node.create()
  root.setWidth(WIDTH)
  root.setHeight(HEIGHT)
  // Keep the Flex fixture byte-for-byte equivalent to G-005's shape: same
  // root constraints, gap, padding, alignment, and child generation.
  root.setGap(module.GUTTER_ALL, PERF_FIXTURE_CONTRACT.gap)
  root.setPadding(module.EDGE_ALL, PERF_FIXTURE_CONTRACT.padding)
  if (variant !== "grid400") {
    root.setFlexDirection(module.FLEX_DIRECTION_ROW)
    root.setFlexWrap(module.WRAP_WRAP)
    root.setAlignItems(module.ALIGN_STRETCH)
    root.setJustifyContent(module.JUSTIFY_SPACE_BETWEEN)
  } else {
    root.setLayoutMode("grid")
    root.setGridStyle(createGridStyle())
  }

  const nodes: InstanceType<typeof Flexily.Node>[] = [root]
  // G-005's nodeCount includes the root and loops index=1..nodeCount-1.
  for (let index = 1; index < NODE_COUNT; index++) {
    const child = module.Node.create()
    child.setWidth(PERF_FIXTURE_CONTRACT.childWidthMin + Math.floor(random() * (PERF_FIXTURE_CONTRACT.childWidthMaxExclusive - PERF_FIXTURE_CONTRACT.childWidthMin)))
    child.setHeight(PERF_FIXTURE_CONTRACT.childHeightMin + Math.floor(random() * (PERF_FIXTURE_CONTRACT.childHeightMaxExclusive - PERF_FIXTURE_CONTRACT.childHeightMin)))
    child.setFlexShrink(1)
    if (variant !== "grid400") {
      child.setFlexGrow(index % PERF_FIXTURE_CONTRACT.flexGrowPeriod === 0 ? 1 : 0)
    } else {
      const itemIndex = index - 1
      const column = itemIndex % GRID_COLUMNS.length
      const row = Math.floor(itemIndex / GRID_COLUMNS.length)
      child.setGridItem({
        column: { start: column + 1, end: column + 2 },
        row: { start: row + 1, end: row + 2 },
      })
    }
    root.insertChild(child, root.getChildCount())
    nodes.push(child)
  }
  const leaf = nodes[nodes.length - 1]!
  return { root, nodes, leaf, boxes: new Float64Array(nodes.length * 4), variant }
}

function emptyCounters(): Counters {
  return {
    layoutNodeCalls: 0,
    layoutSizingCalls: 0,
    layoutPositioningCalls: 0,
    layoutCacheHits: 0,
    measureCalls: 0,
    measureCacheHits: 0,
    gridLayoutCalls: 0,
    gridNoOp: 0,
    gridErrors: 0,
  }
}

function addCounters(target: Counters, source: Counters): void {
  for (const key of Object.keys(target) as (keyof Counters)[]) target[key] += source[key]
}

function resetCounters(module: LayoutModule): void {
  module.resetLayoutStats()
  module.Node.resetMeasureStats()
  module.resetGridLayoutStats?.()
}

function readCounters(module: LayoutModule): Counters {
  const grid = module.getGridLayoutStats?.() ?? { layoutCalls: 0, noOp: 0, errors: 0 }
  return {
    layoutNodeCalls: module.layoutNodeCalls,
    layoutSizingCalls: module.layoutSizingCalls,
    layoutPositioningCalls: module.layoutPositioningCalls,
    layoutCacheHits: module.layoutCacheHits,
    measureCalls: module.Node.measureCalls,
    measureCacheHits: module.Node.measureCacheHits,
    gridLayoutCalls: grid.layoutCalls,
    gridNoOp: grid.noOp,
    gridErrors: grid.errors,
  }
}

function emptySamples(): StageSamples {
  return { sync: [], calculate: [], writeback: [], render: [] }
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))]!
}

function summarizeSamples(values: number[]): StageSummary {
  if (values.length === 0) return { count: 0, totalMs: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, minMs: 0, maxMs: 0 }
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
  const stages = {
    sync: summarizeSamples(samples.sync),
    calculate: summarizeSamples(samples.calculate),
    writeback: summarizeSamples(samples.writeback),
    render: summarizeSamples(samples.render),
  }
  return {
    frames,
    stages,
    p95SumMs: STAGES.reduce((total, stage) => total + stages[stage].p95Ms, 0),
    counters,
    noOpFrames,
  }
}

function mergeSamples(target: StageSamples, source: StageSamples): void {
  for (const stage of STAGES) target[stage].push(...source[stage])
}

function renderBoxes(boxes: Float64Array): number {
  let checksum = 0
  for (let index = 0; index < boxes.length; index += 4) {
    checksum += boxes[index]! * 3 + boxes[index + 1]! * 5 + boxes[index + 2]! * 7 + boxes[index + 3]! * 11
  }
  if (!Number.isFinite(checksum)) throw new Error("non-finite offscreen render checksum")
  return checksum
}

function frame(module: LayoutModule, variant: PerfVariant, scenario: PerfScenario, fixture: Fixture | undefined, seed: number, frameIndex: number): FrameResult {
  let current = fixture
  const stages = {} as Record<PerfStage, number>
  const syncStart = performance.now()
  if (scenario === "initial") current = createFixture(module, variant, seed + frameIndex)
  if (!current) throw new Error(`fixture missing for ${scenario}`)
  if (scenario === "leaf-dirty") current.leaf.setWidth(20 + (frameIndex % 2))
  if (scenario === "resize") current.root.setWidth(WIDTH + (frameIndex % 2))
  stages.sync = performance.now() - syncStart

  resetCounters(module)
  const calculateStart = performance.now()
  const result = current.root.calculateLayout(WIDTH + (scenario === "resize" ? frameIndex % 2 : 0), HEIGHT, module.DIRECTION_LTR)
  stages.calculate = performance.now() - calculateStart
  if (result && "error" in result && result.error) {
    current.root.freeRecursive()
    throw new Error(`Grid layout error ${result.error.code} at ${result.error.path} node=${result.error.nodeId}`)
  }

  const writebackStart = performance.now()
  for (let index = 0; index < current.nodes.length; index++) {
    const node = current.nodes[index]!
    const offset = index * 4
    current.boxes[offset] = node.getComputedLeft()
    current.boxes[offset + 1] = node.getComputedTop()
    current.boxes[offset + 2] = node.getComputedWidth()
    current.boxes[offset + 3] = node.getComputedHeight()
  }
  current.root.markLayoutSeen()
  stages.writeback = performance.now() - writebackStart

  const renderStart = performance.now()
  renderBoxes(current.boxes)
  stages.render = performance.now() - renderStart
  const counters = readCounters(module)
  const noOp = counters.gridNoOp > 0 || (
    counters.gridLayoutCalls === 0
    && counters.layoutNodeCalls === 0
    && counters.layoutSizingCalls === 0
    && counters.layoutPositioningCalls === 0
  )
  if (scenario === "initial") {
    current.root.freeRecursive()
    return { stages, counters, noOp }
  }
  return { fixture: current, stages, counters, noOp }
}

function runPass(
  module: LayoutModule,
  scenario: PerfScenario,
  variant: PerfVariant,
  fixture: Fixture | undefined,
  seed: number,
  frames: number,
  capture: boolean,
): { fixture?: Fixture; pass: PassSummary; samples: StageSamples } {
  const samples = emptySamples()
  const counters = emptyCounters()
  let noOpFrames = 0
  let current = fixture
  for (let frameIndex = 0; frameIndex < frames; frameIndex++) {
    const result = frame(module, variant, scenario, current, seed, frameIndex)
    current = result.fixture
    addCounters(counters, result.counters)
    if (result.noOp) noOpFrames++
    if (capture) for (const stage of STAGES) samples[stage].push(result.stages[stage])
  }
  // `variant` is passed explicitly to make accidental cross-variant fixture
  // reuse impossible if this loop is edited later.
  if (current && current.variant !== variant) throw new Error("benchmark fixture variant mismatch")
  return { fixture: current, pass: summarizePass(samples, counters, noOpFrames, frames), samples }
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
    cpu: { model: cpu?.model ?? "unknown", cores: cpus().length, totalMemoryBytes: totalmem() },
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

function sumBaselineP95(report: BaselineReport | undefined, scenario: PerfScenario): number | null {
  const result = report.results?.find((item) => item.nodeCount === NODE_COUNT && item.scenario === scenario)
  const stages = result?.aggregate?.stages
  if (!stages) return null
  const values = STAGES.map((stage) => stages[stage]?.p95Ms)
  return values.every((value): value is number => typeof value === "number" && Number.isFinite(value))
    ? values.reduce((total, value) => total + value, 0)
    : null
}

export function normalizeBaseline(
  historicalWorkspaceP95Ms: number | null,
  historicalTarballP95Ms: number | null,
  contemporaryTarballP95Ms: number | null,
): BaselineNormalization {
  const valid = [historicalWorkspaceP95Ms, historicalTarballP95Ms, contemporaryTarballP95Ms]
    .every((value) => value !== null && Number.isFinite(value) && value > 0)
  if (!valid) {
    return {
      formula: "historicalWorkspaceP95Ms * (contemporaryTarballP95Ms / historicalTarballP95Ms)",
      historicalWorkspaceP95Ms,
      historicalTarballP95Ms,
      contemporaryTarballP95Ms,
      contemporaryTarballToHistoricalTarballRatio: null,
      normalizedBaselineP95Ms: null,
      status: "BLOCKED",
    }
  }
  const ratio = contemporaryTarballP95Ms! / historicalTarballP95Ms!
  return {
    formula: "historicalWorkspaceP95Ms * (contemporaryTarballP95Ms / historicalTarballP95Ms)",
    historicalWorkspaceP95Ms,
    historicalTarballP95Ms,
    contemporaryTarballP95Ms,
    contemporaryTarballToHistoricalTarballRatio: ratio,
    normalizedBaselineP95Ms: historicalWorkspaceP95Ms! * ratio,
    status: "PASS",
  }
}

async function readBaselineFile(path: string): Promise<{ report?: BaselineReport; error?: string }> {
  if (!existsSync(path)) return { error: "G-005 baseline report is absent" }
  try {
    return { report: JSON.parse(await readFile(path, "utf8")) as BaselineReport }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

async function readBaseline(): Promise<BaselineFiles> {
  const tarballPath = join(dirname(BASELINE_PATH), "../tarball/report.json")
  const workspace = await readBaselineFile(BASELINE_PATH)
  const tarball = await readBaselineFile(tarballPath)
  return {
    workspacePath: BASELINE_PATH,
    tarballPath,
    workspace: workspace.report,
    tarball: tarball.report,
    errors: { workspace: workspace.error, tarball: tarball.error },
  }
}

type TarballSource = {
  entry: string
  integrity: string
  url: string
}

async function sha512Integrity(path: string): Promise<string> {
  return `sha512-${createHash("sha512").update(await readFile(path)).digest("base64")}`
}

async function extractTarball(tarballPath: string, destination: string): Promise<string> {
  const result = Bun.spawnSync(["tar", "-xzf", tarballPath, "-C", destination], { stdout: "ignore", stderr: "pipe" })
  if (result.exitCode !== 0) throw new Error(`cannot extract Flexily tarball: ${new TextDecoder().decode(result.stderr)}`)
  return join(destination, "package", "dist", "index.mjs")
}

async function loadTarball(entry?: string): Promise<{ module: LayoutModule; source: TarballSource }> {
  if (entry) {
    const module = await import(pathToFileURL(entry).href) as unknown as LayoutModule
    return { module, source: { entry, integrity: "provided-local-entry", url: TARBALL_URL } }
  }
  const directory = await mkdtemp(join(tmpdir(), "vexart-flexily-g039-"))
  const tarballPath = join(directory, "flexily-0.6.0.tgz")
  const response = await fetch(TARBALL_URL)
  if (!response.ok) throw new Error(`failed to fetch ${TARBALL_URL}: HTTP ${response.status}`)
  await writeFile(tarballPath, Buffer.from(await response.arrayBuffer()))
  const integrity = await sha512Integrity(tarballPath)
  if (integrity !== TARBALL_INTEGRITY) throw new Error(`tarball integrity mismatch: ${integrity}`)
  const entryPath = await extractTarball(tarballPath, directory)
  const module = await import(pathToFileURL(entryPath).href) as unknown as LayoutModule
  return { module, source: { entry: entryPath, integrity, url: TARBALL_URL } }
}

function findAggregate(reports: ScenarioReport[], scenario: PerfScenario, variant: PerfVariant): PassSummary {
  const report = reports.find((item) => item.scenario === scenario && item.variant === variant)
  if (!report) throw new Error(`missing ${variant}/${scenario} aggregate`)
  return report.aggregate
}

function makeGate(metric: string, valueMs: number, baselineMs: number | null, limit: number): Gate {
  const ratio = baselineMs && baselineMs > 0 ? valueMs / baselineMs : null
  const passed = ratio !== null && ratio <= limit
  return {
    metric,
    valueMs,
    baselineMs: baselineMs ?? 0,
    ratio,
    limit,
    passed,
    status: passed ? "PASS" : "BLOCKED",
  }
}

async function runVariant(module: LayoutModule, variant: PerfVariant, options: NormalizedOptions): Promise<ScenarioReport[]> {
  const reports: ScenarioReport[] = []
  for (const scenario of options.scenarios) {
    const fixtureReports: ScenarioRun[] = []
    const measuredSamples = emptySamples()
    const measuredCounters = emptyCounters()
    let measuredNoOpFrames = 0
    let measuredFrames = 0
    const fixtureSeed = scenarioSeed(options.seed, scenario, 0)
    for (let run = 0; run < options.runs; run++) {
      const seed = scenarioSeed(options.seed, scenario, run)
      let fixture: Fixture | undefined = scenario === "initial" ? undefined : createFixture(module, variant, seed)
      const warmup = runPass(module, scenario, variant, fixture, seed, options.warmupFrames, false)
      fixture = warmup.fixture
      const measured = runPass(module, scenario, variant, fixture, seed, options.measuredFrames, true)
      fixture = measured.fixture
      if (fixture) fixture.root.freeRecursive()
      mergeSamples(measuredSamples, measured.samples)
      addCounters(measuredCounters, measured.pass.counters)
      measuredNoOpFrames += measured.pass.noOpFrames
      measuredFrames += measured.pass.frames
      fixtureReports.push({ run: run + 1, seed, warmup: warmup.pass, measured: measured.pass })
    }
    reports.push({
      variant,
      nodeCount: NODE_COUNT,
      scenario,
      fixtureSeed,
      runs: fixtureReports,
      aggregate: summarizePass(measuredSamples, measuredCounters, measuredNoOpFrames, measuredFrames),
    })
  }
  return reports
}

export async function runGridPerf(options: PerfOptions = {}): Promise<{ runId: string; reportPath: string; report: unknown }> {
  const normalized = normalizeOptions(options)
  const environment = await environmentReport()
  const baseline = await readBaseline()
  const workspaceModule = Flexily as unknown as LayoutModule
  // The pinned tarball is a separate module graph. It is loaded into this
  // process and receives the same fixture factory, seeds, run count, warmup,
  // and measured frame count as the workspace control.
  const tarball = await loadTarball(normalized.tarballEntry)
  // Explicitly serial: do not replace these awaits with Promise.all.
  const flexReports = await runVariant(workspaceModule, "flex-comparable", normalized)
  const tarballReports = await runVariant(tarball.module, "flex-tarball-control", normalized)
  const gridReports = await runVariant(workspaceModule, "grid400", normalized)
  const comparisonScenario = normalized.scenarios.includes("leaf-dirty") ? "leaf-dirty" : normalized.scenarios[0]!
  const flexP95 = findAggregate(flexReports, comparisonScenario, "flex-comparable").p95SumMs
  const tarballP95 = findAggregate(tarballReports, comparisonScenario, "flex-tarball-control").p95SumMs
  const gridP95 = findAggregate(gridReports, comparisonScenario, "grid400").p95SumMs
  const historicalWorkspaceP95 = sumBaselineP95(baseline.workspace, comparisonScenario)
  const historicalTarballP95 = sumBaselineP95(baseline.tarball, comparisonScenario)
  const normalization = normalizeBaseline(historicalWorkspaceP95, historicalTarballP95, tarballP95)
  const gates = {
    flex: makeGate("flex-comparable p95 / contemporarily normalized baseline", flexP95, normalization.normalizedBaselineP95Ms, 1.05),
    grid: makeGate("grid400 p95 sum / flex-comparable p95 sum", gridP95, flexP95, 2),
  }
  const report = {
    schemaVersion: "vexart/grid-perf@2",
    runId: normalized.runId,
    profile: "v1.x @beta",
    process: { pid: process.pid, mode: "serial", startedAt: new Date().toISOString() },
    configuration: {
      runs: normalized.runs,
      warmupFrames: normalized.warmupFrames,
      measuredFrames: normalized.measuredFrames,
      nodeCount: NODE_COUNT,
      scenarios: normalized.scenarios,
      seed: normalized.seed,
      serial: true,
      variants: ["flex-comparable", "flex-tarball-control", "grid400"],
      fixture: PERF_FIXTURE_CONTRACT,
    },
    environment,
    baseline: {
      source: "G-005 historical tarball/workspace Flexily baselines",
      workspacePath: baseline.workspacePath,
      tarballPath: baseline.tarballPath,
      comparisonScenario,
      p95Metric: "sum of per-stage p95Ms; stage samples remain separate",
      historicalRaw: {
        workspaceP95Ms: historicalWorkspaceP95,
        tarballP95Ms: historicalTarballP95,
      },
      contemporaryTarballControl: {
        variant: "flex-tarball-control",
        p95Ms: tarballP95,
        source: {
          package: "flexily",
          version: PINNED_VERSION,
          commit: PINNED_COMMIT,
          tarballUrl: tarball.source.url,
          tarballIntegrity: tarball.source.integrity,
          resolution: tarball.source.entry,
        },
        sameProcess: true,
        sameFixtureSeedAndFrames: true,
      },
      normalization,
      errors: baseline.errors,
    },
    oraclePolicy: {
      conformanceOracle: "none",
      incrementalVsFresh: "cache-and-dirty-observation-only",
      realImplementation: true,
      renderLayer: "layout-consumer-offscreen",
      kittyAndTmux: "not measured",
    },
    results: [...flexReports, ...tarballReports, ...gridReports],
    gates,
  }
  // A run id is an immutable evidence directory. Never overwrite a prior
  // report, even when a caller supplied the id explicitly.
  await mkdir(normalized.outputDir, { recursive: true })
  await mkdir(join(normalized.outputDir, normalized.runId))
  const reportPath = join(normalized.outputDir, normalized.runId, "report.json")
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  if (normalized.enforceGates && (!gates.flex.passed || !gates.grid.passed)) {
    throw new Error(`G-039 performance gate BLOCKED (report: ${reportPath}): ${JSON.stringify(gates)}`)
  }
  return { runId: normalized.runId, reportPath, report }
}

function parseArgs(argv: string[]): PerfOptions {
  const options: PerfOptions = { enforceGates: true }
  for (const argument of argv) {
    if (!argument.startsWith("--")) continue
    const [flag, value] = argument.slice(2).split("=", 2)
    if (flag === "runs" && value) options.runs = positiveInt(value, "--runs")
    else if (flag === "warmup" && value) options.warmupFrames = Number(value) < 0 ? -1 : Number(value)
    else if (flag === "frames" && value) options.measuredFrames = positiveInt(value, "--frames")
    else if (flag === "seed" && value) options.seed = Number(value) >>> 0
    else if (flag === "run-id" && value) options.runId = value
    else if (flag === "out" && value) options.outputDir = value
    else if (flag === "scenario" && value) options.scenarios = [parseScenario(value)]
    else if (flag === "tarball-entry" && value) options.tarballEntry = value
    else if (flag === "no-gate") options.enforceGates = false
    else if (flag !== "help") throw new Error(`unknown or incomplete option: ${argument}`)
  }
  return options
}

if (import.meta.main) {
  try {
    const result = await runGridPerf(parseArgs(process.argv.slice(2)))
    console.log(JSON.stringify({ runId: result.runId, reportPath: result.reportPath, gates: (result.report as { gates: unknown }).gates }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
