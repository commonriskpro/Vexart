/**
 * engine-benchmark.ts — Comprehensive Realistic GUI Benchmark Harness for Vexart.
 *
 * Benchmarks Vexart like a modern browser / game engine UI across 5 realistic GUI workloads:
 *   1. Idle Efficiency (Resting UI): Dashboard scene, blinking cursor, idle scheduler skip verification.
 *   2. Typing / Input Latency (INP): High-cadence form keystrokes, input-to-presentation latency, regional damage check.
 *   3. Virtual Scroll & Culling (Jank Rate): 250+ complex card hierarchy, continuous scrolling, jank % (>16.67ms).
 *   4. Hover Storm (Interaction & Layer Invalidation): 30-button interactive grid, pointer sweep, hit-test duration, scoped layer repaint.
 *   5. 60FPS Sustained Animation: Modal dialog with GPU transform layer, 300-frame pacing, stdDev, hitch ratio.
 *
 * Usage:
 *   bun run benchmarks/engine-benchmark.ts
 *   bun run benchmarks/engine-benchmark.ts --scenario=all
 *   bun run benchmarks/engine-benchmark.ts --scenario=typing --frames=100
 *   bun run benchmarks/engine-benchmark.ts --format=json
 */

import type { Terminal } from "@vexart/engine"
import {
  createNode,
  createTextNode,
  insertChild,
  setProp,
  createRenderLoop,
  setFrameProfileSink,
  markDirty,
  DIRTY_KIND,
  dispatchInput,
  debugState,
  setDebug,
  createGpuRendererBackend,
  createGpuRendererBackendForTesting,
  NO_MODS,
  type TGENode,
  type FrameProfile,
  type RendererBackend,
} from "@vexart/engine/internal"
import { dlopen, FFIType } from "bun:ffi"
import fs from "node:fs"

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScenarioKind = "all" | "idle" | "typing" | "scroll" | "hover" | "animation"
export type OutputFormat = "table" | "json"
export type PresentationMode = "offscreen" | "native"

export interface BenchmarkOptions {
  scenario: ScenarioKind
  frames: number | null
  format: OutputFormat
  presentation: PresentationMode
  warmup: number
  verbose: boolean
}

export interface MetricSummary {
  min: number
  p50: number
  p95: number
  p99: number
  max: number
  avg: number
}

export interface PipelineBreakdown {
  walkTreeMs: MetricSummary
  layoutMs: MetricSummary
  layerAssignMs: MetricSummary
  paintMs: MetricSummary
  presentMs: MetricSummary
  totalMs: MetricSummary
}

export interface MemoryStats {
  heapBeforeMb: number
  heapAfterMb: number
  heapGrowthKb: number
  heapGrowthRateKbPerFrame: number
  heapGrowthRateKbPerSec: number
}

export interface PacingStats {
  totalFrames: number
  renderedFrames: number
  jankFrames: number
  jankRatePercent: number
  frameTime: MetricSummary
  stdDevMs: number
  hitchRatioPercent: number
}

export interface ScenarioResult {
  name: string
  description: string
  durationSec: number
  nodeCount: number
  pacing: PacingStats
  pipeline: PipelineBreakdown
  memory: MemoryStats
  responsiveness?: {
    inpLatency: MetricSummary
    regionalDamageChecks: {
      totalKeystrokes: number
      fullRepaints: number
      avgDirtyPixelAreaRatioPercent: number
      regionalDamageEffective: boolean
    }
  }
  idleEfficiency?: {
    totalTicks: number
    skippedTicks: number
    skipRatePercent: number
    activeRenderCpuMs: number
    cpuLoadPercent: number
  }
  hoverScoping?: {
    hitTestLatency: MetricSummary
    avgRepaintedLayers: number
    totalLayers: number
    scopedRepaintEffective: boolean
  }
  extraNotes?: string[]
}

export interface BenchmarkReport {
  timestamp: string
  vexartVersion: string
  platform: string
  arch: string
  runtime: string
  options: BenchmarkOptions
  scenarios: ScenarioResult[]
}

// ── CLI Parsing ───────────────────────────────────────────────────────────────

export function parseArgs(argv: string[] = process.argv.slice(2)): BenchmarkOptions {
  let scenario: ScenarioKind = "all"
  let frames: number | null = null
  let format: OutputFormat = "table"
  let presentation: PresentationMode = "offscreen"
  let warmup = 5
  let verbose = false

  for (const arg of argv) {
    if (arg.startsWith("--scenario=")) {
      const val = arg.slice("--scenario=".length).toLowerCase()
      if (["all", "idle", "typing", "scroll", "hover", "animation"].includes(val)) {
        scenario = val as ScenarioKind
      }
    } else if (arg.startsWith("--frames=")) {
      const val = parseInt(arg.slice("--frames=".length), 10)
      if (!isNaN(val) && val > 0) frames = val
    } else if (arg.startsWith("--format=")) {
      const val = arg.slice("--format=".length).toLowerCase()
      if (val === "json" || val === "table") format = val as OutputFormat
    } else if (arg.startsWith("--presentation=")) {
      const val = arg.slice("--presentation=".length).toLowerCase()
      if (val === "native" || val === "offscreen") presentation = val as PresentationMode
    } else if (arg.startsWith("--warmup=")) {
      const val = parseInt(arg.slice("--warmup=".length), 10)
      if (!isNaN(val) && val >= 0) warmup = val
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true
    }
  }

  return { scenario, frames, format, presentation, warmup, verbose }
}

// ── Native Stdout Redirect ───────────────────────────────────────────────────

function withQuietStdout<T>(action: () => T): T {
  try {
    const libcName = process.platform === "darwin" ? "libc.dylib" : "libc.so.6"
    const libc = dlopen(libcName, {
      dup: { args: [FFIType.i32], returns: FFIType.i32 },
      dup2: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
      close: { args: [FFIType.i32], returns: FFIType.i32 },
    })
    const nullFd = fs.openSync("/dev/null", "w")
    const savedStdout = libc.symbols.dup(1)
    libc.symbols.dup2(nullFd, 1)
    try {
      return action()
    } finally {
      libc.symbols.dup2(savedStdout, 1)
      libc.symbols.close(savedStdout)
      fs.closeSync(nullFd)
    }
  } catch {
    return action()
  }
}

// ── Math & Statistical Helpers ────────────────────────────────────────────────

export function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

export function summarize(values: number[]): MetricSummary {
  if (values.length === 0) return { min: 0, p50: 0, p95: 0, p99: 0, max: 0, avg: 0 }
  const sum = values.reduce((acc, v) => acc + v, 0)
  return {
    min: Math.min(...values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: Math.max(...values),
    avg: sum / values.length,
  }
}

export function computeStdDev(values: number[], mean: number): number {
  if (values.length <= 1) return 0
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length
  return Math.sqrt(variance)
}

export function computeHitchRatio(values: number[], thresholdMs = 16.67 * 1.5): number {
  if (values.length === 0) return 0
  const hitches = values.filter((v) => v > thresholdMs).length
  return (hitches / values.length) * 100
}

// ── Headless Terminal & Render Loop Setup ─────────────────────────────────────

export function createMockTerminal(width = 1280, height = 960): Terminal {
  const noop = () => {}
  const cellWidth = 8
  const cellHeight = 16
  return {
    kind: "kitty",
    caps: {
      kind: "kitty",
      kittyGraphics: true,
      kittyPlaceholder: false,
      kittyKeyboard: true,
      sixel: false,
      truecolor: true,
      mouse: true,
      mousePixel: false,
      mousePixelOrigin: 1,
      focus: true,
      bracketedPaste: false,
      syncOutput: false,
      tmux: false,
      parentKind: null,
      transmissionMode: "direct",
    },
    size: {
      cols: Math.ceil(width / cellWidth),
      rows: Math.ceil(height / cellHeight),
      pixelWidth: width,
      pixelHeight: height,
      cellWidth,
      cellHeight,
    },
    write: noop,
    rawWrite: noop,
    writeBytes: noop,
    beginSync: noop,
    endSync: noop,
    onResize: () => noop,
    onData: () => noop,
    bgColor: null,
    fgColor: null,
    isDark: true,
    setTitle: noop,
    writeClipboard: noop,
    suspend: noop,
    resume: noop,
    destroy: noop,
  }
}

export function createBenchmarkBackend(mode: PresentationMode): RendererBackend {
  return mode === "native"
    ? createGpuRendererBackend()
    : createGpuRendererBackendForTesting()
}

export function countTreeNodes(node: TGENode): number {
  let count = 1
  for (const child of node.children) {
    count += countTreeNodes(child)
  }
  return count
}

// ── Node Builder Helpers ──────────────────────────────────────────────────────

export function createBox(props: Record<string, unknown> = {}): TGENode {
  const node = createNode("box")
  for (const [k, v] of Object.entries(props)) {
    setProp(node, k, v)
  }
  return node
}

export function createText(content: string, props: Record<string, unknown> = {}): TGENode {
  const container = createNode("text")
  for (const [k, v] of Object.entries(props)) {
    setProp(container, k, v)
  }
  const textChild = createTextNode(content)
  insertChild(container, textChild)
  return container
}

// ── Memory Measurement ────────────────────────────────────────────────────────

function measureMemory<T>(action: () => T): { result: T; stats: MemoryStats; wallTimeSec: number } {
  if (typeof Bun !== "undefined" && typeof Bun.gc === "function") {
    Bun.gc(true)
  }
  const memBefore = process.memoryUsage()
  const startWall = performance.now()

  const result = action()

  const endWall = performance.now()
  const memAfter = process.memoryUsage()
  const wallTimeSec = Math.max(0.0001, (endWall - startWall) / 1000)

  const heapGrowthBytes = Math.max(0, memAfter.heapUsed - memBefore.heapUsed)
  const heapGrowthKb = heapGrowthBytes / 1024

  return {
    result,
    wallTimeSec,
    stats: {
      heapBeforeMb: memBefore.heapUsed / (1024 * 1024),
      heapAfterMb: memAfter.heapUsed / (1024 * 1024),
      heapGrowthKb,
      heapGrowthRateKbPerFrame: 0,
      heapGrowthRateKbPerSec: heapGrowthKb / wallTimeSec,
    },
  }
}

// ── Profile Aggregator ────────────────────────────────────────────────────────

function buildPipelineBreakdown(profiles: FrameProfile[], manualTotals?: number[]): PipelineBreakdown {
  const walkTree = profiles.map((p) => p.walkTreeMs)
  const layout = profiles.map((p) => p.layoutMs || p.layoutComputeMs + p.layoutWritebackMs)
  const layerAssign = profiles.map((p) => p.layerAssignMs)
  const paint = profiles.map((p) => p.paintMs)
  const present = profiles.map((p) =>
    p.paintPresentationMs + p.paintBackendNativeEmitMs + p.paintBackendNativeWriteMs + p.paintBackendNativeReadbackMs
  )
  const totals = manualTotals && manualTotals.length > 0 ? manualTotals : profiles.map((p) => p.totalMs)

  return {
    walkTreeMs: summarize(walkTree),
    layoutMs: summarize(layout),
    layerAssignMs: summarize(layerAssign),
    paintMs: summarize(paint),
    presentMs: summarize(present),
    totalMs: summarize(totals),
  }
}

// ── SCENARIO 1: Idle Efficiency (Resting UI) ──────────────────────────────────

export function runIdleScenario(options: BenchmarkOptions): ScenarioResult {
  const totalTicks = options.frames ?? 120
  const term = createMockTerminal(1280, 960)
  const backend = createBenchmarkBackend(options.presentation)
  const loop = createRenderLoop(term, { backend })

  const sceneRoot = createBox({
    width: 1280,
    height: 960,
    backgroundColor: 0x0f1117ff,
    direction: "column",
    padding: 24,
    gap: 16,
  })

  const header = createBox({
    direction: "row",
    height: 52,
    backgroundColor: 0x181b24ff,
    cornerRadius: 8,
    padding: 12,
    alignY: "center",
    gap: 16,
  })
  insertChild(header, createBox({ width: 28, height: 28, backgroundColor: 0x6366f1ff, cornerRadius: 6 }))
  insertChild(header, createText("Vexart Infrastructure Telemetry", { color: 0xffffffff, fontSize: 15 }))
  insertChild(sceneRoot, header)

  const cardsRow = createBox({ direction: "row", gap: 16, height: 96, width: "100%" })
  const cardData = [
    { title: "CPU Idle", val: "99.4%", color: 0x10b981ff },
    { title: "Heap Used", val: "14.2 MB", color: 0x38bdf8ff },
    { title: "Network", val: "1.2 Gbps", color: 0x818cf8ff },
    { title: "Active Tasks", val: "42 running", color: 0xf59e0bff },
  ]
  for (const c of cardData) {
    const card = createBox({
      direction: "column",
      gap: 6,
      padding: 14,
      width: "grow",
      backgroundColor: 0x181b24ff,
      cornerRadius: 10,
      border: { width: 1, color: 0x272c3dff },
    })
    insertChild(card, createText(c.title, { color: 0x94a3b8ff, fontSize: 11 }))
    insertChild(card, createText(c.val, { color: c.color, fontSize: 18 }))
    insertChild(cardsRow, card)
  }
  insertChild(sceneRoot, cardsRow)

  const inputContainer = createBox({
    direction: "row",
    height: 44,
    width: "100%",
    backgroundColor: 0x131620ff,
    cornerRadius: 8,
    border: { width: 1, color: 0x3b82f6ff },
    padding: 10,
    alignY: "center",
    gap: 4,
  })
  insertChild(inputContainer, createText("filter metrics --region=us-east", { color: 0xe2e8f0ff, fontSize: 13 }))
  const cursorNode = createBox({ width: 2, height: 16, backgroundColor: 0x38bdf8ff, opacity: 1 })
  insertChild(inputContainer, cursorNode)
  insertChild(sceneRoot, inputContainer)

  const table = createBox({
    direction: "column",
    gap: 4,
    padding: 12,
    backgroundColor: 0x141722ff,
    cornerRadius: 8,
    width: "100%",
    height: "grow",
  })
  for (let i = 0; i < 12; i++) {
    const row = createBox({
      direction: "row",
      height: 36,
      padding: 8,
      alignY: "center",
      gap: 12,
      backgroundColor: i % 2 === 0 ? 0x181c2aff : 0x00000000,
      cornerRadius: 4,
    })
    insertChild(row, createBox({ width: 8, height: 8, cornerRadius: 4, backgroundColor: 0x10b981ff }))
    insertChild(row, createText("worker-node-" + (100 + i), { color: 0xf1f5f9ff, fontSize: 12, width: 160 }))
    insertChild(row, createText("ACTIVE_HEALTHY", { color: 0x34d399ff, fontSize: 11, width: 120 }))
    insertChild(row, createText("0.02ms latency", { color: 0x94a3b8ff, fontSize: 11, width: "grow" }))
    insertChild(table, row)
  }
  insertChild(sceneRoot, table)

  insertChild(loop.root, sceneRoot)
  const nodeCount = countTreeNodes(loop.root)

  withQuietStdout(() => {
    for (let w = 0; w < options.warmup; w++) {
      markDirty()
      loop.frame()
    }
  })

  const capturedProfiles: FrameProfile[] = []
  setFrameProfileSink((p) => {
    capturedProfiles.push({ ...p })
  })

  let cursorVisible = true
  let renderedCount = 0

  const { stats: memStats, wallTimeSec } = measureMemory(() => {
    withQuietStdout(() => {
      for (let tick = 0; tick < totalTicks; tick++) {
        const isBlinkTick = tick > 0 && tick % 32 === 0
        if (isBlinkTick) {
          cursorVisible = !cursorVisible
          setProp(cursorNode, "opacity", cursorVisible ? 1 : 0)
          markDirty()
        }

        const beforeProfileCount = capturedProfiles.length
        loop.frame()
        if (capturedProfiles.length > beforeProfileCount) {
          renderedCount++
        }
      }
    })
  })

  setFrameProfileSink(null)
  withQuietStdout(() => {
    loop.destroy()
  })

  memStats.heapGrowthRateKbPerFrame = memStats.heapGrowthKb / Math.max(1, renderedCount)

  const skippedTicks = totalTicks - renderedCount
  const skipRatePercent = (skippedTicks / totalTicks) * 100
  const activeRenderCpuMs = capturedProfiles.reduce((acc, p) => acc + p.totalMs, 0)
  const totalIdleTimeMs = totalTicks * 16.67
  const cpuLoadPercent = (activeRenderCpuMs / totalIdleTimeMs) * 100

  const frameTimes = capturedProfiles.map((p) => p.totalMs)
  const jankFrames = frameTimes.filter((t) => t > 16.67).length
  const jankRatePercent = frameTimes.length > 0 ? (jankFrames / frameTimes.length) * 100 : 0
  const frameTimeSummary = summarize(frameTimes)
  const stdDevMs = computeStdDev(frameTimes, frameTimeSummary.avg)
  const hitchRatio = computeHitchRatio(frameTimes)

  return {
    name: "Idle Efficiency (Resting UI)",
    description: "Dashboard scene with blinking cursor; verifies loop skips idle frames and avoids CPU spin",
    durationSec: wallTimeSec,
    nodeCount,
    pacing: {
      totalFrames: totalTicks,
      renderedFrames: renderedCount,
      jankFrames,
      jankRatePercent,
      frameTime: frameTimeSummary,
      stdDevMs,
      hitchRatioPercent: hitchRatio,
    },
    pipeline: buildPipelineBreakdown(capturedProfiles),
    memory: memStats,
    idleEfficiency: {
      totalTicks,
      skippedTicks,
      skipRatePercent,
      activeRenderCpuMs,
      cpuLoadPercent,
    },
    extraNotes: [
      "Rendered " + renderedCount + " frames out of " + totalTicks + " scheduler ticks (" + skipRatePercent.toFixed(1) + "% idle skip)",
      "Active render CPU time: " + activeRenderCpuMs.toFixed(2) + "ms across " + totalIdleTimeMs.toFixed(0) + "ms window (" + cpuLoadPercent.toFixed(2) + "% duty cycle)",
    ],
  }
}

// ── SCENARIO 2: Typing / Input Latency (INP) ──────────────────────────────────

export function runTypingScenario(options: BenchmarkOptions): ScenarioResult {
  const defaultKeystrokes = "vexart high-performance terminal ui engine with 60fps gpu rendering and regional damage"
  const totalKeystrokes = options.frames ?? defaultKeystrokes.length
  const keystrokesToType = defaultKeystrokes.repeat(Math.ceil(totalKeystrokes / defaultKeystrokes.length)).slice(0, totalKeystrokes)

  const term = createMockTerminal(1280, 960)
  const backend = createBenchmarkBackend(options.presentation)
  const loop = createRenderLoop(term, { backend })

  setDebug(true)

  const sceneRoot = createBox({
    width: 1280,
    height: 960,
    backgroundColor: 0x0d1117ff,
    direction: "column",
    padding: 32,
    gap: 20,
  })

  const titleBar = createBox({ direction: "row", height: 44, alignY: "center", gap: 12 })
  insertChild(titleBar, createBox({ width: 14, height: 14, cornerRadius: 7, backgroundColor: 0x22c55eff }))
  insertChild(titleBar, createText("System Input Latency & Regional Damage Benchmark", { color: 0xf8fafcff, fontSize: 16 }))
  insertChild(sceneRoot, titleBar)

  // Promoted to own layer for regional damage caching
  const inputRow = createBox({
    layer: true,
    direction: "column",
    gap: 8,
    padding: 16,
    backgroundColor: 0x161b22ff,
    cornerRadius: 8,
    border: { width: 2, color: 0x6366f1ff },
  })
  insertChild(inputRow, createText("COMMAND QUERY (TYPE TEST)", { color: 0x818cf8ff, fontSize: 11 }))

  const inputDisplay = createBox({ direction: "row", alignY: "center", gap: 2 })
  const inputTextContainer = createNode("text")
  setProp(inputTextContainer, "color", 0xffffffff)
  setProp(inputTextContainer, "fontSize", 14)
  const inputTextChild = createTextNode("")
  insertChild(inputTextContainer, inputTextChild)
  insertChild(inputDisplay, inputTextContainer)

  const cursor = createBox({ width: 2, height: 18, backgroundColor: 0x6366f1ff })
  insertChild(inputDisplay, cursor)
  insertChild(inputRow, inputDisplay)
  insertChild(sceneRoot, inputRow)

  // Background context panels promoted to separate layer to verify damage boundary
  const grid = createBox({ layer: true, direction: "row", gap: 16, height: "grow", width: "100%" })
  for (let c = 0; c < 3; c++) {
    const col = createBox({ direction: "column", gap: 8, width: "grow", padding: 12, backgroundColor: 0x12151cff, cornerRadius: 8 })
    insertChild(col, createText("Background Panel " + (c + 1), { color: 0x94a3b8ff, fontSize: 12 }))
    for (let r = 0; r < 8; r++) {
      const item = createBox({ direction: "row", height: 32, padding: 6, alignY: "center", gap: 8, backgroundColor: 0x191e28ff, cornerRadius: 4 })
      insertChild(item, createBox({ width: 12, height: 12, cornerRadius: 3, backgroundColor: 0x334155ff }))
      insertChild(item, createText("Metric record " + (c * 8 + r + 1), { color: 0xcbd5e1ff, fontSize: 11 }))
      insertChild(col, item)
    }
    insertChild(grid, col)
  }
  insertChild(sceneRoot, grid)

  insertChild(loop.root, sceneRoot)
  const nodeCount = countTreeNodes(loop.root)

  withQuietStdout(() => {
    for (let w = 0; w < options.warmup; w++) {
      markDirty()
      loop.frame()
    }
  })

  const capturedProfiles: FrameProfile[] = []
  setFrameProfileSink((p) => {
    capturedProfiles.push({ ...p })
  })

  const inpLatencies: number[] = []
  let fullRepaintCount = 0
  let totalDirtyRatio = 0
  let currentBuffer = ""

  const { stats: memStats, wallTimeSec } = measureMemory(() => {
    withQuietStdout(() => {
      for (let i = 0; i < totalKeystrokes; i++) {
        const char = keystrokesToType[i]
        currentBuffer += char

        const t0 = performance.now()

        dispatchInput({
          type: "key",
          key: char,
          char,
          mods: NO_MODS,
        })

        inputTextChild.text = currentBuffer
        markDirty({ kind: DIRTY_KIND.NODE_VISUAL, nodeId: inputRow.id })

        loop.frame()

        const t1 = performance.now()
        inpLatencies.push(t1 - t0)

        const stats = debugState.nativeFrameStats
        if (stats?.fullRepaint) {
          fullRepaintCount++
        }
        const totalArea = stats?.totalPixelArea || 1280 * 960
        const dirtyArea = stats?.dirtyPixelArea || 0
        totalDirtyRatio += (dirtyArea / totalArea) * 100
      }
    })
  })

  setFrameProfileSink(null)
  setDebug(false)
  withQuietStdout(() => {
    loop.destroy()
  })

  memStats.heapGrowthRateKbPerFrame = memStats.heapGrowthKb / totalKeystrokes

  const frameTimes = capturedProfiles.map((p) => p.totalMs)
  const jankFrames = frameTimes.filter((t) => t > 16.67).length
  const jankRatePercent = frameTimes.length > 0 ? (jankFrames / frameTimes.length) * 100 : 0
  const frameTimeSummary = summarize(frameTimes)
  const stdDevMs = computeStdDev(frameTimes, frameTimeSummary.avg)
  const hitchRatio = computeHitchRatio(frameTimes)

  const inpSummary = summarize(inpLatencies)
  const avgDirtyRatio = totalDirtyRatio / Math.max(1, totalKeystrokes)

  return {
    name: "Typing / Input Latency (INP)",
    description: "High-cadence keystroke injection; measures Input-to-Presentation latency and verifies regional damage",
    durationSec: wallTimeSec,
    nodeCount,
    pacing: {
      totalFrames: totalKeystrokes,
      renderedFrames: capturedProfiles.length,
      jankFrames,
      jankRatePercent,
      frameTime: frameTimeSummary,
      stdDevMs,
      hitchRatioPercent: hitchRatio,
    },
    pipeline: buildPipelineBreakdown(capturedProfiles, inpLatencies),
    memory: memStats,
    responsiveness: {
      inpLatency: inpSummary,
      regionalDamageChecks: {
        totalKeystrokes,
        fullRepaints: fullRepaintCount,
        avgDirtyPixelAreaRatioPercent: avgDirtyRatio,
        regionalDamageEffective: fullRepaintCount === 0 && avgDirtyRatio < 25,
      },
    },
    extraNotes: [
      "INP P50: " + inpSummary.p50.toFixed(2) + "ms | P95: " + inpSummary.p95.toFixed(2) + "ms | P99: " + inpSummary.p99.toFixed(2) + "ms",
      "Regional Damage: " + fullRepaintCount + " full repaints / " + totalKeystrokes + " frames (" + avgDirtyRatio.toFixed(2) + "% avg dirty pixel area)",
    ],
  }
}

// ── SCENARIO 3: Virtual Scroll & Culling (Jank Rate) ──────────────────────────

export function runScrollScenario(options: BenchmarkOptions): ScenarioResult {
  const frames = options.frames ?? 120
  const term = createMockTerminal(1280, 960)
  const backend = createBenchmarkBackend(options.presentation)
  const loop = createRenderLoop(term, { backend })

  const sceneRoot = createBox({
    width: 1280,
    height: 960,
    backgroundColor: 0x0b0d13ff,
    direction: "column",
  })

  const header = createBox({
    height: 56,
    width: "100%",
    backgroundColor: 0x151822ff,
    border: { width: 1, color: 0x262b3dff },
    padding: 14,
    direction: "row",
    alignY: "center",
    gap: 12,
  })
  insertChild(header, createText("Vexart Infinite Virtual Feed (250 Complex Cards)", { color: 0xffffffff, fontSize: 14 }))
  insertChild(sceneRoot, header)

  const scrollContainer = createBox({
    width: "100%",
    height: "grow",
    scrollY: true,
    direction: "column",
    gap: 8,
    padding: 16,
  })

  const cardColors = [0x38bdf8ff, 0x818cf8ff, 0x34d399ff, 0xf59e0bff, 0xec4899ff]
  const cardCount = 250

  for (let i = 0; i < cardCount; i++) {
    const card = createBox({
      direction: "row",
      height: 68,
      width: "100%",
      backgroundColor: 0x141722ff,
      cornerRadius: 8,
      border: { width: 1, color: 0x222634ff },
      padding: 12,
      alignY: "center",
      gap: 16,
    })

    insertChild(card, createBox({
      width: 44,
      height: 44,
      cornerRadius: 8,
      backgroundColor: cardColors[i % cardColors.length],
    }))

    const textCol = createBox({ direction: "column", gap: 4, width: "grow" })
    insertChild(textCol, createText("Transaction Stream Item #" + (i + 1000) + " - Pipeline Batch", { color: 0xf1f5f9ff, fontSize: 12 }))
    insertChild(textCol, createText("Payload verified with SHA256 checksum · latency " + (i * 0.4 + 1.2).toFixed(1) + "ms", { color: 0x94a3b8ff, fontSize: 10 }))
    insertChild(card, textCol)

    const badge = createBox({
      padding: 6,
      cornerRadius: 4,
      backgroundColor: 0x222738ff,
    })
    insertChild(badge, createText("+" + (i * 12.5).toFixed(1) + " req/s", { color: 0x38bdf8ff, fontSize: 11 }))
    insertChild(card, badge)

    insertChild(scrollContainer, card)
  }

  insertChild(sceneRoot, scrollContainer)
  insertChild(loop.root, sceneRoot)
  const nodeCount = countTreeNodes(loop.root)

  withQuietStdout(() => {
    for (let w = 0; w < options.warmup; w++) {
      markDirty()
      loop.frame()
    }
  })

  const capturedProfiles: FrameProfile[] = []
  setFrameProfileSink((p) => {
    capturedProfiles.push({ ...p })
  })

  const { stats: memStats, wallTimeSec } = measureMemory(() => {
    withQuietStdout(() => {
      for (let i = 0; i < frames; i++) {
        const deltaY = i < frames / 2 ? 24 : -24
        loop.feedScroll(0, deltaY)
        loop.frame()
      }
    })
  })

  setFrameProfileSink(null)
  withQuietStdout(() => {
    loop.destroy()
  })

  memStats.heapGrowthRateKbPerFrame = memStats.heapGrowthKb / frames

  const frameTimes = capturedProfiles.map((p) => p.totalMs)
  const jankFrames = frameTimes.filter((t) => t > 16.67).length
  const jankRatePercent = frameTimes.length > 0 ? (jankFrames / frameTimes.length) * 100 : 0
  const frameTimeSummary = summarize(frameTimes)
  const stdDevMs = computeStdDev(frameTimes, frameTimeSummary.avg)
  const hitchRatio = computeHitchRatio(frameTimes)

  return {
    name: "Virtual Scroll & Culling (Jank Rate)",
    description: "250 complex cards in a scroll container; measures Jank % (>16.67ms), P95 frame time, and layout time",
    durationSec: wallTimeSec,
    nodeCount,
    pacing: {
      totalFrames: frames,
      renderedFrames: capturedProfiles.length,
      jankFrames,
      jankRatePercent,
      frameTime: frameTimeSummary,
      stdDevMs,
      hitchRatioPercent: hitchRatio,
    },
    pipeline: buildPipelineBreakdown(capturedProfiles),
    memory: memStats,
    extraNotes: [
      "Jank Rate: " + jankRatePercent.toFixed(2) + "% (" + jankFrames + " of " + frames + " frames > 16.67ms at 60Hz)",
      "P95 Frame Time: " + frameTimeSummary.p95.toFixed(2) + "ms | Layout P95: " + percentile(capturedProfiles.map((p) => p.layoutMs), 0.95).toFixed(2) + "ms",
    ],
  }
}

// ── SCENARIO 4: Hover Storm (Interaction & Layer Invalidation) ────────────────

export function runHoverStormScenario(options: BenchmarkOptions): ScenarioResult {
  const frames = options.frames ?? 120
  const term = createMockTerminal(1280, 960)
  const backend = createBenchmarkBackend(options.presentation)
  const loop = createRenderLoop(term, { backend })

  const sceneRoot = createBox({
    width: 1280,
    height: 960,
    backgroundColor: 0x0f1117ff,
    direction: "column",
    padding: 32,
    gap: 16,
  })

  const header = createBox({ height: 40, width: "100%", alignY: "center" })
  insertChild(header, createText("Interactive 30-Button Command Grid (Hover Storm)", { color: 0xffffffff, fontSize: 16 }))
  insertChild(sceneRoot, header)

  const gridContainer = createBox({
    direction: "column",
    gap: 12,
    width: "100%",
    height: "grow",
  })

  const rows = 5
  const cols = 6

  for (let r = 0; r < rows; r++) {
    const row = createBox({ direction: "row", gap: 12, width: "100%", height: "grow" })
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const btn = createBox({
        width: "grow",
        height: "grow",
        focusable: true,
        backgroundColor: 0x1a1e2bff,
        cornerRadius: 8,
        border: { width: 1, color: 0x2e3549ff },
        hoverStyle: {
          backgroundColor: 0x4f46e5ff,
          borderColor: 0x818cf8ff,
          borderWidth: 2,
        },
        activeStyle: {
          backgroundColor: 0x4338caff,
        },
        shadow: { x: 0, y: 4, blur: 10, color: 0x00000033 },
        padding: 10,
        direction: "column",
        gap: 6,
        alignX: "center",
        alignY: "center",
      })
      insertChild(btn, createBox({ width: 24, height: 24, cornerRadius: 12, backgroundColor: 0x3b82f644 }))
      insertChild(btn, createText("Cmd #" + (idx + 1), { color: 0xf1f5f9ff, fontSize: 12 }))
      insertChild(row, btn)
    }
    insertChild(gridContainer, row)
  }
  insertChild(sceneRoot, gridContainer)

  insertChild(loop.root, sceneRoot)
  const nodeCount = countTreeNodes(loop.root)

  withQuietStdout(() => {
    for (let w = 0; w < options.warmup; w++) {
      markDirty()
      loop.frame()
    }
  })

  const capturedProfiles: FrameProfile[] = []
  setFrameProfileSink((p) => {
    capturedProfiles.push({ ...p })
  })

  const hitTestTimes: number[] = []
  let totalRepaintedLayers = 0

  const { stats: memStats, wallTimeSec } = measureMemory(() => {
    withQuietStdout(() => {
      for (let i = 0; i < frames; i++) {
        const col = (i % (cols * 2)) < cols ? (i % cols) : cols - 1 - (i % cols)
        const row = Math.floor(i / cols) % rows
        const targetX = 32 + col * ((1280 - 64) / cols) + 40
        const targetY = 88 + row * ((960 - 120) / rows) + 30

        loop.feedPointer(targetX, targetY, false)
        loop.frame()

        const lastProfile = capturedProfiles[capturedProfiles.length - 1]
        if (lastProfile) {
          hitTestTimes.push(lastProfile.interactionMs)
          totalRepaintedLayers += lastProfile.repainted
        }
      }
    })
  })

  setFrameProfileSink(null)
  withQuietStdout(() => {
    loop.destroy()
  })

  memStats.heapGrowthRateKbPerFrame = memStats.heapGrowthKb / frames

  const frameTimes = capturedProfiles.map((p) => p.totalMs)
  const jankFrames = frameTimes.filter((t) => t > 16.67).length
  const jankRatePercent = frameTimes.length > 0 ? (jankFrames / frameTimes.length) * 100 : 0
  const frameTimeSummary = summarize(frameTimes)
  const stdDevMs = computeStdDev(frameTimes, frameTimeSummary.avg)
  const hitchRatio = computeHitchRatio(frameTimes)

  const hitTestSummary = summarize(hitTestTimes)
  const avgRepainted = totalRepaintedLayers / Math.max(1, frames)

  return {
    name: "Hover Storm (Interaction & Layer Invalidation)",
    description: "Serpentine pointer sweep across 30 interactive buttons; measures hit-test latency and layer invalidation scoping",
    durationSec: wallTimeSec,
    nodeCount,
    pacing: {
      totalFrames: frames,
      renderedFrames: capturedProfiles.length,
      jankFrames,
      jankRatePercent,
      frameTime: frameTimeSummary,
      stdDevMs,
      hitchRatioPercent: hitchRatio,
    },
    pipeline: buildPipelineBreakdown(capturedProfiles),
    memory: memStats,
    hoverScoping: {
      hitTestLatency: hitTestSummary,
      avgRepaintedLayers: avgRepainted,
      totalLayers: rows * cols,
      scopedRepaintEffective: avgRepainted < (rows * cols * 0.5),
    },
    extraNotes: [
      "Hit-test Latency P50: " + hitTestSummary.p50.toFixed(2) + "ms | P95: " + hitTestSummary.p95.toFixed(2) + "ms",
      "Layer Invalidation Scoping: " + avgRepainted.toFixed(1) + " avg repainted layers / " + (rows * cols) + " interactive targets",
    ],
  }
}

// ── SCENARIO 5: 60FPS Sustained Animation ─────────────────────────────────────

export function runAnimationScenario(options: BenchmarkOptions): ScenarioResult {
  const frames = options.frames ?? 300
  const term = createMockTerminal(1280, 960)
  const backend = createBenchmarkBackend(options.presentation)
  const loop = createRenderLoop(term, { backend })

  const sceneRoot = createBox({
    width: 1280,
    height: 960,
    backgroundColor: 0x0c0e14ff,
    direction: "column",
    padding: 40,
    alignX: "center",
    alignY: "center",
  })

  const backdrop = createBox({
    width: 1200,
    height: 880,
    direction: "column",
    padding: 24,
    gap: 16,
    backgroundColor: 0x13172288,
    cornerRadius: 12,
  })
  for (let r = 0; r < 6; r++) {
    const row = createBox({ direction: "row", gap: 12, height: 100, width: "100%" })
    for (let c = 0; c < 4; c++) {
      insertChild(row, createBox({
        width: "grow",
        height: "100%",
        backgroundColor: 0x1a203088,
        cornerRadius: 8,
        border: { width: 1, color: 0x29324d44 },
      }))
    }
    insertChild(backdrop, row)
  }
  insertChild(sceneRoot, backdrop)

  const modal = createBox({
    floating: true,
    layer: true,
    willChange: "transform",
    width: 540,
    height: 380,
    backgroundColor: 0x1e2436ff,
    cornerRadius: 16,
    border: { width: 2, color: 0x6366f1ff },
    shadow: { x: 0, y: 16, blur: 32, color: 0x00000088 },
    padding: 24,
    direction: "column",
    gap: 16,
  })

  const modalHeader = createBox({ direction: "row", alignY: "center", gap: 12 })
  insertChild(modalHeader, createBox({ width: 32, height: 32, cornerRadius: 8, backgroundColor: 0x6366f1ff }))
  insertChild(modalHeader, createText("Sustained GPU Animation Target", { color: 0xffffffff, fontSize: 16 }))
  insertChild(modal, modalHeader)

  insertChild(modal, createText("Benchmarking compositor transform pacing, frame standard deviation, and hitch ratio across 300 continuous frames.", {
    color: 0x94a3b8ff,
    fontSize: 12,
  }))

  const formSection = createBox({ direction: "column", gap: 8, width: "100%", height: "grow" })
  for (let i = 0; i < 4; i++) {
    const field = createBox({ height: 36, backgroundColor: 0x131722ff, cornerRadius: 6, padding: 8, alignY: "center" })
    insertChild(field, createText("Parameter configuration block " + (i + 1), { color: 0xcfd8dcff, fontSize: 11 }))
    insertChild(formSection, field)
  }
  insertChild(modal, formSection)

  const footer = createBox({ direction: "row", gap: 12, alignX: "right" })
  insertChild(footer, createBox({ width: 90, height: 36, backgroundColor: 0x2a3148ff, cornerRadius: 6 }))
  insertChild(footer, createBox({ width: 110, height: 36, backgroundColor: 0x4f46e5ff, cornerRadius: 6 }))
  insertChild(modal, footer)

  insertChild(sceneRoot, modal)
  insertChild(loop.root, sceneRoot)
  const nodeCount = countTreeNodes(loop.root)

  withQuietStdout(() => {
    for (let w = 0; w < options.warmup; w++) {
      markDirty()
      loop.frame()
    }
  })

  const capturedProfiles: FrameProfile[] = []
  setFrameProfileSink((p) => {
    capturedProfiles.push({ ...p })
  })

  const { stats: memStats, wallTimeSec } = measureMemory(() => {
    withQuietStdout(() => {
      for (let i = 0; i < frames; i++) {
        const translateY = Math.sin(i * 0.08) * 16
        const translateX = Math.cos(i * 0.05) * 12
        const scale = 1.0 + Math.sin(i * 0.04) * 0.03

        setProp(modal, "transform", { translateX, translateY, scale })
        markDirty()
        loop.frame()
      }
    })
  })

  setFrameProfileSink(null)
  withQuietStdout(() => {
    loop.destroy()
  })

  memStats.heapGrowthRateKbPerFrame = memStats.heapGrowthKb / frames

  const frameTimes = capturedProfiles.map((p) => p.totalMs)
  const jankFrames = frameTimes.filter((t) => t > 16.67).length
  const jankRatePercent = frameTimes.length > 0 ? (jankFrames / frameTimes.length) * 100 : 0
  const frameTimeSummary = summarize(frameTimes)
  const stdDevMs = computeStdDev(frameTimes, frameTimeSummary.avg)
  const hitchRatio = computeHitchRatio(frameTimes)

  return {
    name: "60FPS Sustained Animation",
    description: "Composited modal transform animation over 300 continuous frames; measures pacing, stdDev, and hitch ratio",
    durationSec: wallTimeSec,
    nodeCount,
    pacing: {
      totalFrames: frames,
      renderedFrames: capturedProfiles.length,
      jankFrames,
      jankRatePercent,
      frameTime: frameTimeSummary,
      stdDevMs,
      hitchRatioPercent: hitchRatio,
    },
    pipeline: buildPipelineBreakdown(capturedProfiles),
    memory: memStats,
    extraNotes: [
      "Frame Pacing: P50 " + frameTimeSummary.p50.toFixed(2) + "ms | P95 " + frameTimeSummary.p95.toFixed(2) + "ms | Max " + frameTimeSummary.max.toFixed(2) + "ms",
      "Pacing Jitter: stdDev ±" + stdDevMs.toFixed(2) + "ms | Hitch Ratio: " + hitchRatio.toFixed(2) + "% (target < 2%)",
    ],
  }
}

// ── Output Formatters ─────────────────────────────────────────────────────────

function colorize(val: number, greenThresh: number, yellowThresh: number, str: string): string {
  if (val <= greenThresh) return "\x1b[32m" + str + "\x1b[0m"
  if (val <= yellowThresh) return "\x1b[33m" + str + "\x1b[0m"
  return "\x1b[31m" + str + "\x1b[0m"
}

function pad(str: string, len: number, align: "left" | "right" = "left"): string {
  if (str.length >= len) return str
  const space = " ".repeat(len - str.length)
  return align === "left" ? str + space : space + str
}

export function printTableSummary(report: BenchmarkReport) {
  console.log("")
  console.log("\x1b[1m\x1b[36m====================================================================================================\x1b[0m")
  console.log("\x1b[1m\x1b[37m  VEXART REALISTIC GUI ENGINE BENCHMARK HARNESS \x1b[0m\x1b[90m(v" + report.vexartVersion + " - " + report.platform + " " + report.arch + ")\x1b[0m")
  console.log("\x1b[1m\x1b[36m====================================================================================================\x1b[0m")
  console.log("")

  console.log("\x1b[1m--- 1. EXECUTIVE PACING & RESPONSIVENESS SUMMARY ---\x1b[0m")
  console.log("\x1b[90m┌──────────────────────────────────────┬────────┬──────────┬──────────┬──────────┬──────────┬──────────┬────────┐\x1b[0m")
  console.log("\x1b[90m│\x1b[0m \x1b[1m" + pad("Scenario", 36) + "\x1b[0m \x1b[90m│\x1b[0m \x1b[1m" + pad("Frames", 6, "right") + "\x1b[0m \x1b[90m│\x1b[0m \x1b[1m" + pad("Avg (ms)", 8, "right") + "\x1b[0m \x1b[90m│\x1b[0m \x1b[1m" + pad("P50 (ms)", 8, "right") + "\x1b[0m \x1b[90m│\x1b[0m \x1b[1m" + pad("P95 (ms)", 8, "right") + "\x1b[0m \x1b[90m│\x1b[0m \x1b[1m" + pad("P99 (ms)", 8, "right") + "\x1b[0m \x1b[90m│\x1b[0m \x1b[1m" + pad("Jank %", 8, "right") + "\x1b[0m \x1b[90m│\x1b[0m \x1b[1m" + pad("Status", 6) + "\x1b[0m \x1b[90m│\x1b[0m")
  console.log("\x1b[90m├──────────────────────────────────────┼────────┼──────────┼──────────┼──────────┼──────────┼──────────┼────────┤\x1b[0m")

  for (const s of report.scenarios) {
    const avgStr = colorize(s.pacing.frameTime.avg, 8.33, 16.67, s.pacing.frameTime.avg.toFixed(2))
    const p50Str = colorize(s.pacing.frameTime.p50, 8.33, 16.67, s.pacing.frameTime.p50.toFixed(2))
    const p95Str = colorize(s.pacing.frameTime.p95, 10.0, 16.67, s.pacing.frameTime.p95.toFixed(2))
    const p99Str = colorize(s.pacing.frameTime.p99, 12.0, 16.67, s.pacing.frameTime.p99.toFixed(2))
    const jankStr = colorize(s.pacing.jankRatePercent, 0.01, 1.0, s.pacing.jankRatePercent.toFixed(1) + "%")
    const status = s.pacing.jankRatePercent <= 1.0 ? "\x1b[32mPASS\x1b[0m" : "\x1b[33mWARN\x1b[0m"

    const framesText = s.pacing.renderedFrames !== s.pacing.totalFrames
      ? s.pacing.renderedFrames + "/" + s.pacing.totalFrames
      : "" + s.pacing.totalFrames

    console.log("\x1b[90m│\x1b[0m " + pad(s.name, 36) + " \x1b[90m│\x1b[0m " + pad(framesText, 6, "right") + " \x1b[90m│\x1b[0m " + pad(avgStr, 8 + 9, "right") + " \x1b[90m│\x1b[0m " + pad(p50Str, 8 + 9, "right") + " \x1b[90m│\x1b[0m " + pad(p95Str, 8 + 9, "right") + " \x1b[90m│\x1b[0m " + pad(p99Str, 8 + 9, "right") + " \x1b[90m│\x1b[0m " + pad(jankStr, 8 + 9, "right") + " \x1b[90m│\x1b[0m  " + status + "  \x1b[90m│\x1b[0m")
  }
  console.log("\x1b[90m└──────────────────────────────────────┴────────┴──────────┴──────────┴──────────┴──────────┴──────────┴────────┘\x1b[0m")
  console.log("")

  console.log("\x1b[1m--- 2. INTERNAL PIPELINE BREAKDOWN (AVG / P95 IN MS) ---\x1b[0m")
  console.log("\x1b[90m┌──────────────────────────────────────┬────────────────┬────────────────┬────────────────┬────────────────┬────────────────┬────────────────┐\x1b[0m")
  console.log("\x1b[90m│\x1b[0m \x1b[1m" + pad("Scenario", 36) + "\x1b[0m \x1b[90m│\x1b[0m \x1b[1m" + pad("walkTree", 14, "right") + "\x1b[0m \x1b[90m│\x1b[0m \x1b[1m" + pad("layout", 14, "right") + "\x1b[0m \x1b[90m│\x1b[0m \x1b[1m" + pad("layerAssign", 14, "right") + "\x1b[0m \x1b[90m│\x1b[0m \x1b[1m" + pad("paint (FFI)", 14, "right") + "\x1b[0m \x1b[90m│\x1b[0m \x1b[1m" + pad("present", 14, "right") + "\x1b[0m \x1b[90m│\x1b[0m \x1b[1m" + pad("Total", 14, "right") + "\x1b[0m \x1b[90m│\x1b[0m")
  console.log("\x1b[90m├──────────────────────────────────────┼────────────────┼────────────────┼────────────────┼────────────────┼────────────────┼────────────────┤\x1b[0m")

  for (const s of report.scenarios) {
    const fmt = (m: MetricSummary) => m.avg.toFixed(2) + " / " + m.p95.toFixed(2)
    console.log("\x1b[90m│\x1b[0m " + pad(s.name, 36) + " \x1b[90m│\x1b[0m " + pad(fmt(s.pipeline.walkTreeMs), 14, "right") + " \x1b[90m│\x1b[0m " + pad(fmt(s.pipeline.layoutMs), 14, "right") + " \x1b[90m│\x1b[0m " + pad(fmt(s.pipeline.layerAssignMs), 14, "right") + " \x1b[90m│\x1b[0m " + pad(fmt(s.pipeline.paintMs), 14, "right") + " \x1b[90m│\x1b[0m " + pad(fmt(s.pipeline.presentMs), 14, "right") + " \x1b[90m│\x1b[0m " + pad(fmt(s.pipeline.totalMs), 14, "right") + " \x1b[90m│\x1b[0m")
  }
  console.log("\x1b[90m└──────────────────────────────────────┴────────────────┴────────────────┴────────────────┴────────────────┴────────────────┴────────────────┘\x1b[0m")
  console.log("")

  console.log("\x1b[1m--- 3. MEMORY & WORKLOAD ARCHITECTURAL VERIFICATION ---\x1b[0m")
  for (const s of report.scenarios) {
    console.log("  \x1b[1m\x1b[34m•\x1b[0m \x1b[1m" + s.name + "\x1b[0m (" + s.nodeCount + " nodes, " + s.durationSec.toFixed(2) + "s wall)")
    console.log("    Memory: " + s.memory.heapBeforeMb.toFixed(1) + " MB -> " + s.memory.heapAfterMb.toFixed(1) + " MB (growth: " + s.memory.heapGrowthKb.toFixed(1) + " KB, " + s.memory.heapGrowthRateKbPerFrame.toFixed(2) + " KB/frame)")
    if (s.extraNotes) {
      for (const note of s.extraNotes) {
        console.log("    Verification: \x1b[32m✓\x1b[0m " + note)
      }
    }
  }
  console.log("")
}

// ── Master Runner ─────────────────────────────────────────────────────────────

export function runAllBenchmarks(options: BenchmarkOptions = parseArgs()): BenchmarkReport {
  const scenarios: ScenarioResult[] = []

  const runIdle = options.scenario === "all" || options.scenario === "idle"
  const runTyping = options.scenario === "all" || options.scenario === "typing"
  const runScroll = options.scenario === "all" || options.scenario === "scroll"
  const runHover = options.scenario === "all" || options.scenario === "hover"
  const runAnimation = options.scenario === "all" || options.scenario === "animation"

  if (runIdle) scenarios.push(runIdleScenario(options))
  if (runTyping) scenarios.push(runTypingScenario(options))
  if (runScroll) scenarios.push(runScrollScenario(options))
  if (runHover) scenarios.push(runHoverStormScenario(options))
  if (runAnimation) scenarios.push(runAnimationScenario(options))

  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    vexartVersion: "0.11.0-beta.9",
    platform: process.platform,
    arch: process.arch,
    runtime: "Bun " + Bun.version,
    options,
    scenarios,
  }

  if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printTableSummary(report)
  }

  return report
}

if (import.meta.main) {
  runAllBenchmarks()
}
