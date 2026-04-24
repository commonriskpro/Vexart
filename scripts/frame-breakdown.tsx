import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

process.env.TGE_DEBUG_CADENCE = "1"
process.env.TGE_GPU_FORCE_LAYER_STRATEGY = process.env.TGE_GPU_FORCE_LAYER_STRATEGY ?? "final-frame-raw"

const SCENARIO = {
  DASHBOARD_SMOKE: "dashboard-800x600",
  DASHBOARD_1080P: "dashboard-1080p",
  NOOP_RETAINED: "noop-retained",
  DIRTY_REGION: "dirty-region",
  COMPOSITOR_ONLY: "compositor-only",
} as const

const CADENCE_LOG = "/tmp/tge-cadence.log"
const DEFAULT_FRAMES = 300
const DEFAULT_WARMUP = 5
const REPORT_PATH = join(dirname(fileURLToPath(import.meta.url)), "frame-breakdown-report.json")

type ScenarioName = (typeof SCENARIO)[keyof typeof SCENARIO]

interface CliOptions {
  frames: number
  warmup: number
  output: string
}

interface Size {
  width: number
  height: number
}

interface TerminalSize {
  cols: number
  rows: number
  pixelWidth: number
  pixelHeight: number
  cellWidth: number
  cellHeight: number
}

interface TerminalCaps {
  kind: "kitty"
  kittyGraphics: boolean
  kittyPlaceholder: boolean
  kittyKeyboard: boolean
  sixel: boolean
  truecolor: boolean
  mouse: boolean
  focus: boolean
  bracketedPaste: boolean
  syncOutput: boolean
  tmux: boolean
  parentKind: null
  transmissionMode: "direct"
}

interface MockTerminal {
  kind: "kitty"
  caps: TerminalCaps
  size: TerminalSize
  write: () => void
  rawWrite: () => void
  writeBytes: () => void
  beginSync: () => void
  endSync: () => void
  onResize: () => () => void
  onData: () => () => void
  bgColor: null
  fgColor: null
  isDark: boolean
  setTitle: () => void
  writeClipboard: () => void
  suspend: () => void
  resume: () => void
  destroy: () => void
}

interface CadenceFrame {
  totalMs: number
  layoutMs: number
  prepMs: number
  paintMs: number
  ioMs: number
  beginSyncMs: number
  endSyncMs: number
  commands: number
  repainted: number
  dirtyBefore: number
  ffiCallCount: number
}

interface PercentileSummary {
  min: number
  p50: number
  p95: number
  p99: number
  max: number
  avg: number
}

interface StageSummary {
  totalMs: PercentileSummary
  layoutMs: PercentileSummary
  prepMs: PercentileSummary
  paintMs: PercentileSummary
  ioMs: PercentileSummary
  beginSyncMs: PercentileSummary
  endSyncMs: PercentileSummary
  ffiCallCount: PercentileSummary
}

interface SymbolCount {
  symbol: string
  count: number
}

interface ScenarioReport {
  name: ScenarioName
  width: number
  height: number
  framesRequested: number
  framesMeasured: number
  summary: StageSummary
  topFfiSymbols: SymbolCount[]
  frames: CadenceFrame[]
}

interface BenchmarkReport {
  version: 1
  generatedAt: string
  runtime: string
  platform: string
  arch: string
  frames: number
  warmup: number
  scenarios: ScenarioReport[]
}

interface EngineModules {
  createRenderLoop: typeof import("../packages/engine/src/loop/loop").createRenderLoop
  setFrameProfileSink: typeof import("../packages/engine/src/loop/loop").setFrameProfileSink
  solidRender: typeof import("../packages/engine/src/reconciler/reconciler").render
  markDirty: typeof import("../packages/engine/src/reconciler/dirty").markDirty
  resetFocus: typeof import("../packages/engine/src/reconciler/focus").resetFocus
  resetSelection: typeof import("../packages/engine/src/reconciler/selection").resetSelection
  bindLoop: typeof import("../packages/engine/src/reconciler/pointer").bindLoop
  unbindLoop: typeof import("../packages/engine/src/reconciler/pointer").unbindLoop
  registerAnimationDescriptor: typeof import("../packages/engine/src/animation/compositor-path").registerAnimationDescriptor
  resetVexartFfiCallCounts: typeof import("../packages/engine/src/ffi/vexart-bridge").resetVexartFfiCallCounts
  getVexartFfiCallCount: typeof import("../packages/engine/src/ffi/vexart-bridge").getVexartFfiCallCount
  getVexartFfiCallCountsBySymbol: typeof import("../packages/engine/src/ffi/vexart-bridge").getVexartFfiCallCountsBySymbol
}

function parseCli(): CliOptions {
  const args = process.argv.slice(2)
  let frames = DEFAULT_FRAMES
  let warmup = DEFAULT_WARMUP
  let output = REPORT_PATH
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--frames") frames = Number(args[++i] ?? frames)
    else if (arg.startsWith("--frames=")) frames = Number(arg.slice("--frames=".length))
    else if (arg === "--warmup") warmup = Number(args[++i] ?? warmup)
    else if (arg.startsWith("--warmup=")) warmup = Number(arg.slice("--warmup=".length))
    else if (arg === "--output") output = args[++i] ?? output
    else if (arg.startsWith("--output=")) output = arg.slice("--output=".length)
  }
  return {
    frames: Number.isFinite(frames) && frames > 0 ? Math.floor(frames) : DEFAULT_FRAMES,
    warmup: Number.isFinite(warmup) && warmup >= 0 ? Math.floor(warmup) : DEFAULT_WARMUP,
    output,
  }
}

function createMockTerminal(width: number, height: number): MockTerminal {
  const noop = () => {}
  const cellWidth = 8
  const cellHeight = 16
  return {
    kind: "kitty",
    caps: {
      kind: "kitty",
      kittyGraphics: true,
      kittyPlaceholder: false,
      kittyKeyboard: false,
      sixel: false,
      truecolor: true,
      mouse: false,
      focus: false,
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

function DashboardScene(size: Size) {
  const cardColors = [0x4eaed0ff, 0xa78bfaff, 0x34d399ff, 0xfbbf24ff]
  const rows = size.height >= 1000 ? 18 : 8
  return (
    <box width={size.width} height={size.height} backgroundColor={0x141414ff} direction="column" gap={18} padding={32}>
      <box direction="row" gap={16} width="100%" height={64}>
        <box width={64} height={64} backgroundColor={0x4eaed0ff} cornerRadius={32} shadow={{ x: 0, y: 4, blur: 12, color: 0x00000060 }} />
        <box height={64} width="grow" backgroundColor={0x262626ff} cornerRadius={12} padding={16}>
          <text color={0xfafafaff} fontSize={18}>Vexart 120fps Dashboard Benchmark</text>
          <text color={0xa3a3a3ff} fontSize={12}>Retained Rust runtime · {size.width}×{size.height}</text>
        </box>
      </box>

      <box direction="row" gap={16} width="100%">
        {cardColors.map((color, index) => (
          <box width="grow" height={112} backgroundColor={0x1e1e2eff} cornerRadius={14} padding={18} shadow={{ x: 0, y: 2, blur: 8, color: 0x00000040 }}>
            <box width={32} height={32} backgroundColor={color} cornerRadius={8} />
            <text color={0xa3a3a3ff} fontSize={12}>Metric {index + 1}</text>
            <text color={0xfafafaff} fontSize={18}>{String((index + 1) * 24)}%</text>
          </box>
        ))}
      </box>

      <box width="100%" height="grow" gradient={{ type: "linear", from: 0x1a1a2eff, to: 0x0a0a0fff, angle: 135 }} cornerRadius={18} padding={24} direction="column" gap={8}>
        {Array.from({ length: rows }, (_, i) => (
          <box width="100%" height={34} backgroundColor={i % 2 === 0 ? 0xffffff08 : 0x00000000} cornerRadius={5} padding={8} direction="row" gap={10}>
            <text color={0x6b7280ff} fontSize={12}>{String(i + 1).padStart(2, "0")}</text>
            <box width={`${32 + (i % 9) * 7}%`} height={18} backgroundColor={0x4eaed020} cornerRadius={4} />
            <text color={0xfafafaff} fontSize={12}>Pipeline item {i + 1}</text>
          </box>
        ))}
      </box>
    </box>
  )
}

function DirtyRegionScene(size: Size) {
  return (
    <box width={size.width} height={size.height} backgroundColor={0x101014ff} padding={48}>
      <box width={220} height={80} focusable backgroundColor={0x262626ff} hoverStyle={{ backgroundColor: 0x3a3a4aff, borderWidth: 2, borderColor: 0x4eaed0ff }} cornerRadius={12} padding={18}>
        <text color={0xfafafaff} fontSize={18}>Hover target</text>
        <text color={0xa3a3a3ff} fontSize={12}>dirty-region benchmark</text>
      </box>
    </box>
  )
}

function CompositorScene(size: Size) {
  return (
    <box width={size.width} height={size.height} backgroundColor={0x101014ff} padding={80}>
      <box layer willChange="transform" width={320} height={180} backgroundColor={0x262626ff} cornerRadius={18} padding={24} shadow={{ x: 0, y: 8, blur: 20, color: 0x00000060 }}>
        <text color={0xfafafaff} fontSize={22}>Compositor layer</text>
        <text color={0xa3a3a3ff} fontSize={13}>transform/opacity fast path</text>
      </box>
    </box>
  )
}

async function loadEngine(): Promise<EngineModules> {
  const loop = await import("../packages/engine/src/loop/loop")
  const reconciler = await import("../packages/engine/src/reconciler/reconciler")
  const dirty = await import("../packages/engine/src/reconciler/dirty")
  const focus = await import("../packages/engine/src/reconciler/focus")
  const selection = await import("../packages/engine/src/reconciler/selection")
  const pointer = await import("../packages/engine/src/reconciler/pointer")
  const compositor = await import("../packages/engine/src/animation/compositor-path")
  const bridge = await import("../packages/engine/src/ffi/vexart-bridge")
  return {
    createRenderLoop: loop.createRenderLoop,
    setFrameProfileSink: loop.setFrameProfileSink,
    solidRender: reconciler.render,
    markDirty: dirty.markDirty,
    resetFocus: focus.resetFocus,
    resetSelection: selection.resetSelection,
    bindLoop: pointer.bindLoop,
    unbindLoop: pointer.unbindLoop,
    registerAnimationDescriptor: compositor.registerAnimationDescriptor,
    resetVexartFfiCallCounts: bridge.resetVexartFfiCallCounts,
    getVexartFfiCallCount: bridge.getVexartFfiCallCount,
    getVexartFfiCallCountsBySymbol: bridge.getVexartFfiCallCountsBySymbol,
  }
}

async function clearCadenceLog() {
  if (existsSync(CADENCE_LOG)) await rm(CADENCE_LOG)
}

async function readCadenceFrames(): Promise<CadenceFrame[]> {
  if (!existsSync(CADENCE_LOG)) return []
  const text = await readFile(CADENCE_LOG, "utf8")
  return text.split("\n").flatMap((line) => {
    const frame = parseCadenceLine(line)
    return frame ? [frame] : []
  })
}

function parseCadenceLine(line: string): CadenceFrame | null {
  if (!line.startsWith("[frame]")) return null
  const value = (key: string) => {
    const match = line.match(new RegExp(`${key}=([0-9.]+)`))
    return match ? Number(match[1]) : 0
  }
  return {
    totalMs: value("total"),
    layoutMs: value("layout"),
    prepMs: value("prep"),
    paintMs: value("paint"),
    ioMs: value("io"),
    beginSyncMs: value("beginSync"),
    endSyncMs: value("endSync"),
    commands: value("cmds"),
    repainted: value("repainted"),
    dirtyBefore: value("dirty"),
    ffiCallCount: 0,
  }
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

function summarize(values: number[]): PercentileSummary {
  if (values.length === 0) return { min: 0, p50: 0, p95: 0, p99: 0, max: 0, avg: 0 }
  const sum = values.reduce((acc, value) => acc + value, 0)
  return {
    min: Math.min(...values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: Math.max(...values),
    avg: sum / values.length,
  }
}

function summarizeFrames(frames: CadenceFrame[]): StageSummary {
  return {
    totalMs: summarize(frames.map((frame) => frame.totalMs)),
    layoutMs: summarize(frames.map((frame) => frame.layoutMs)),
    prepMs: summarize(frames.map((frame) => frame.prepMs)),
    paintMs: summarize(frames.map((frame) => frame.paintMs)),
    ioMs: summarize(frames.map((frame) => frame.ioMs)),
    beginSyncMs: summarize(frames.map((frame) => frame.beginSyncMs)),
    endSyncMs: summarize(frames.map((frame) => frame.endSyncMs)),
    ffiCallCount: summarize(frames.map((frame) => frame.ffiCallCount)),
  }
}

function topSymbols(counts: Map<string, number>): SymbolCount[] {
  return Array.from(counts.entries())
    .map(([symbol, count]) => ({ symbol, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
}

async function runScenario(engine: EngineModules, name: ScenarioName, size: Size, frames: number, warmup: number): Promise<ScenarioReport> {
  await clearCadenceLog()
  engine.resetVexartFfiCallCounts()
  const capturedProfiles: CadenceFrame[] = []
  engine.setFrameProfileSink((profile) => {
    capturedProfiles.push({
      totalMs: profile.totalMs,
      layoutMs: profile.layoutMs,
      prepMs: profile.prepMs,
      paintMs: profile.paintMs,
      ioMs: profile.ioMs,
      beginSyncMs: profile.beginSyncMs,
      endSyncMs: profile.endSyncMs,
      commands: profile.commands,
      repainted: profile.repainted,
      dirtyBefore: profile.dirtyBefore,
      ffiCallCount: 0,
    })
  })
  const term = createMockTerminal(size.width, size.height)
  const loop = engine.createRenderLoop(term as never, {
    experimental: {
      forceLayerRepaint: true,
      nativePresentation: false,
      nativeLayerRegistry: false,
      nativeSceneGraph: true,
      nativeEventDispatch: true,
      nativeSceneLayout: true,
      nativeRenderGraph: true,
    },
  })
  engine.bindLoop(loop)
  const dispose = engine.solidRender(() => renderScenario(name, size) as never, loop.root)

  try {
    engine.markDirty()
    for (let i = 0; i < warmup; i++) {
      if (name === SCENARIO.NOOP_RETAINED && i > 0) {
        loop.frame()
      } else {
        engine.markDirty()
        loop.frame()
      }
      await tick()
    }

    await clearCadenceLog()
    capturedProfiles.length = 0
    engine.resetVexartFfiCallCounts()
    const manualFrames: CadenceFrame[] = []
    for (let i = 0; i < frames; i++) {
      const beforeFfi = engine.getVexartFfiCallCount()
      const start = performance.now()
      if (name === SCENARIO.NOOP_RETAINED) {
        loop.frame()
      } else if (name === SCENARIO.DIRTY_REGION) {
        const x = i % 2 === 0 ? 80 : 420
        loop.feedPointer(x, 90, false)
        loop.frame()
      } else if (name === SCENARIO.COMPOSITOR_ONLY) {
        const target = loop.root.children[0]?.children[0]
        if (target) {
          engine.registerAnimationDescriptor({
            nodeId: target.id,
            property: "transform",
            from: 0,
            to: 1,
            startTime: performance.now(),
            physics: { kind: "transition", easing: (t: number) => t, duration: 1000 },
          })
        }
        engine.markDirty()
        loop.frame()
      } else {
        engine.markDirty()
        loop.frame()
      }
      const elapsed = performance.now() - start
      const ffiCallCount = engine.getVexartFfiCallCount() - beforeFfi
      manualFrames.push({ totalMs: elapsed, layoutMs: 0, prepMs: 0, paintMs: 0, ioMs: 0, beginSyncMs: 0, endSyncMs: 0, commands: 0, repainted: 0, dirtyBefore: 0, ffiCallCount })
      await tick()
    }

    const parsed = capturedProfiles.length > 0 ? capturedProfiles : await readCadenceFrames()
    const framesMeasured = name === SCENARIO.NOOP_RETAINED
      ? manualFrames
      : parsed.slice(-frames).map((frame, index) => ({ ...frame, ffiCallCount: manualFrames[index]?.ffiCallCount ?? 0 }))
    return {
      name,
      width: size.width,
      height: size.height,
      framesRequested: frames,
      framesMeasured: framesMeasured.length,
      summary: summarizeFrames(framesMeasured),
      topFfiSymbols: topSymbols(engine.getVexartFfiCallCountsBySymbol()),
      frames: framesMeasured,
    }
  } finally {
    engine.unbindLoop()
    engine.resetFocus()
    engine.resetSelection()
    dispose()
    loop.destroy()
    engine.setFrameProfileSink(null)
  }
}

function renderScenario(name: ScenarioName, size: Size) {
  if (name === SCENARIO.DIRTY_REGION) return <DirtyRegionScene width={size.width} height={size.height} />
  if (name === SCENARIO.COMPOSITOR_ONLY) return <CompositorScene width={size.width} height={size.height} />
  return <DashboardScene width={size.width} height={size.height} />
}

function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function printScenario(report: ScenarioReport) {
  const total = report.summary.totalMs
  const layout = report.summary.layoutMs
  const paint = report.summary.paintMs
  const ffi = report.summary.ffiCallCount
  console.log(`  ${report.name.padEnd(18)} ${report.width}×${report.height} frames=${report.framesMeasured}`)
  console.log(`    total p50=${total.p50.toFixed(2)} p95=${total.p95.toFixed(2)} p99=${total.p99.toFixed(2)} avg=${total.avg.toFixed(2)} ms`)
  console.log(`    layout p95=${layout.p95.toFixed(2)} paint p95=${paint.p95.toFixed(2)} ffi avg=${ffi.avg.toFixed(1)}`)
  if (report.topFfiSymbols.length > 0) {
    console.log(`    top ffi: ${report.topFfiSymbols.slice(0, 4).map((entry) => `${entry.symbol}:${entry.count}`).join(", ")}`)
  }
}

async function main() {
  const options = parseCli()
  const engine = await loadEngine()
  const scenarios: Array<{ name: ScenarioName; size: Size }> = [
    { name: SCENARIO.DASHBOARD_SMOKE, size: { width: 800, height: 600 } },
    { name: SCENARIO.DASHBOARD_1080P, size: { width: 1920, height: 1080 } },
    { name: SCENARIO.NOOP_RETAINED, size: { width: 1920, height: 1080 } },
    { name: SCENARIO.DIRTY_REGION, size: { width: 1920, height: 1080 } },
    { name: SCENARIO.COMPOSITOR_ONLY, size: { width: 1920, height: 1080 } },
  ]

  console.log(`\n🔬 Vexart frame breakdown — frames=${options.frames} warmup=${options.warmup}\n`)
  const reports: ScenarioReport[] = []
  for (const scenario of scenarios) {
    const report = await runScenario(engine, scenario.name, scenario.size, options.frames, options.warmup)
    reports.push(report)
    printScenario(report)
  }

  const output: BenchmarkReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    runtime: `bun ${Bun.version}`,
    platform: process.platform,
    arch: process.arch,
    frames: options.frames,
    warmup: options.warmup,
    scenarios: reports,
  }
  await mkdir(dirname(options.output), { recursive: true })
  await writeFile(options.output, JSON.stringify(output, null, 2) + "\n")
  console.log(`\n✅ wrote ${options.output}\n`)
}

await main()
