import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import {
  applyCompositorTransform,
  compositorTransformValue,
  FRAME_BREAKDOWN_REPORT_VERSION,
  FULL_FRAME_PRESENTATION_PATH,
  hasChangingCompositorTransforms,
  MEASUREMENT_SCOPE,
  parseFrameBreakdownOptions,
  TRANSPORT_OBSERVATION,
} from "./frame-breakdown-contract"
process.env.VEXART_DEBUG_CADENCE = "1"

const SCENARIO = {
  DASHBOARD_SMOKE: "dashboard-800x600",
  DASHBOARD_1080P: "dashboard-1080p",
  NOOP_RETAINED: "noop-retained",
  DIRTY_REGION: "dirty-region",
  COMPOSITOR_ONLY: "compositor-only",
  HOVER_TRANSITION: "hover-transition",
  SCROLL_HEAVY: "scroll-heavy",
} as const

const CADENCE_LOG = "/tmp/tge-cadence.log"
type ScenarioName = (typeof SCENARIO)[keyof typeof SCENARIO]
type TransmissionMode = "direct" | "file" | "shm"

interface CliOptions {
  frames: number
  warmup: number
  output: string
  transport: TransmissionMode
  nativePresentation: boolean
  scenarioFilter: string | null
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
  transmissionMode: TransmissionMode
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
  scrollMs: number
  walkTreeMs: number
  layoutComputeMs: number
  layoutWritebackMs: number
  interactionMs: number
  relayoutMs: number
  layoutMs: number
  layerAssignMs: number
  prepMs: number
  paintNativeSnapshotMs: number
  paintLayerPrepMs: number
  paintFrameContextMs: number
  paintBackendBeginMs: number
  paintReuseMs: number
  paintRenderGraphMs: number
  paintBackendPaintMs: number
  paintBackendCompositeMs: number
  paintBackendReadbackMs: number
  paintBackendNativeEmitMs: number
  paintBackendNativeReadbackMs: number
  paintBackendNativeCompressMs: number
  paintBackendNativeShmPrepareMs: number
  paintBackendNativeWriteMs: number
  paintBackendNativeRawBytes: number
  paintBackendNativePayloadBytes: number
  paintBackendUniformMs: number
  paintLayerCleanupMs: number
  paintBackendEndMs: number
  paintPresentationMs: number
  paintInteractionStatsMs: number
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
  scrollMs: PercentileSummary
  walkTreeMs: PercentileSummary
  layoutComputeMs: PercentileSummary
  layoutWritebackMs: PercentileSummary
  interactionMs: PercentileSummary
  relayoutMs: PercentileSummary
  layoutMs: PercentileSummary
  layerAssignMs: PercentileSummary
  prepMs: PercentileSummary
  paintNativeSnapshotMs: PercentileSummary
  paintLayerPrepMs: PercentileSummary
  paintFrameContextMs: PercentileSummary
  paintBackendBeginMs: PercentileSummary
  paintReuseMs: PercentileSummary
  paintRenderGraphMs: PercentileSummary
  paintBackendPaintMs: PercentileSummary
  paintBackendCompositeMs: PercentileSummary
  paintBackendReadbackMs: PercentileSummary
  paintBackendNativeEmitMs: PercentileSummary
  paintBackendNativeReadbackMs: PercentileSummary
  paintBackendNativeCompressMs: PercentileSummary
  paintBackendNativeShmPrepareMs: PercentileSummary
  paintBackendNativeWriteMs: PercentileSummary
  paintBackendNativeRawBytes: PercentileSummary
  paintBackendNativePayloadBytes: PercentileSummary
  paintBackendUniformMs: PercentileSummary
  paintLayerCleanupMs: PercentileSummary
  paintBackendEndMs: PercentileSummary
  paintPresentationMs: PercentileSummary
  paintInteractionStatsMs: PercentileSummary
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
  compositorTransformValues?: number[]
  compositorTransformChanged?: boolean
}

interface BenchmarkReport {
  version: typeof FRAME_BREAKDOWN_REPORT_VERSION
  generatedAt: string
  runtime: string
  platform: string
  arch: string
  frames: number
  warmup: number
  transport: TransmissionMode
  nativePresentation: boolean
  nativePresentationRequested: boolean
  measurementScope: typeof MEASUREMENT_SCOPE
  visibleTerminalLatencyMeasured: false
  presentationPath: typeof FULL_FRAME_PRESENTATION_PATH
  transportObservation: typeof TRANSPORT_OBSERVATION
  deprecatedMetrics: string[]
  scenarios: ScenarioReport[]
}

interface EngineModules {
  createRenderLoop: typeof import("../packages/engine/src/loop/loop").createRenderLoop
  setFrameProfileSink: typeof import("../packages/engine/src/loop/loop").setFrameProfileSink
  solidRender: typeof import("../packages/engine/src/reconciler/reconciler").render
  setProp: typeof import("../packages/engine/src/reconciler/reconciler").setProp
  markDirty: typeof import("../packages/engine/src/reconciler/dirty").markDirty
  resetFocus: typeof import("../packages/engine/src/reconciler/focus").resetFocus
  resetSelection: typeof import("../packages/engine/src/reconciler/selection").resetSelection
  bindLoop: typeof import("../packages/engine/src/reconciler/pointer").bindLoop
  unbindLoop: typeof import("../packages/engine/src/reconciler/pointer").unbindLoop
  registerAnimationDescriptor: typeof import("../packages/engine/src/animation/compositor-path").registerAnimationDescriptor
  resetVexartFfiCallCounts: typeof import("../packages/engine/src/ffi/vexart-bridge").resetVexartFfiCallCounts
  getVexartFfiCallCount: typeof import("../packages/engine/src/ffi/vexart-bridge").getVexartFfiCallCount
  getVexartFfiCallCountsBySymbol: typeof import("../packages/engine/src/ffi/vexart-bridge").getVexartFfiCallCountsBySymbol
  configureKittyTransportManager: typeof import("../packages/engine/src/output/transport-manager").configureKittyTransportManager
}

function parseCli(): CliOptions {
  return parseFrameBreakdownOptions(process.argv.slice(2))
}

function createMockTerminal(width: number, height: number, transport: TransmissionMode): MockTerminal {
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
      transmissionMode: transport,
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

/**
 * Hover-transition scene: interactive buttons with hoverStyle.
 * Measures the double-layout path (HP-5) when pointer moves between elements.
 * Kept shallow (no nested .map()) to avoid SolidJS universal reconciler stack overflow.
 */
function HoverTransitionScene(size: Size) {
  return (
    <box width={size.width} height={size.height} backgroundColor={0x101014ff} padding={24} direction="column" gap={8}>
      <box direction="row" gap={8} width="100%">
        <box width="grow" height={48} focusable backgroundColor={0x1e1e2eff} cornerRadius={8} hoverStyle={{ backgroundColor: 0x3a3a4aff }} activeStyle={{ backgroundColor: 0x4a4a5aff }} padding={8}><text color={0xa3a3a3ff} fontSize={11}>Btn 1</text></box>
        <box width="grow" height={48} focusable backgroundColor={0x1e1e2eff} cornerRadius={8} hoverStyle={{ backgroundColor: 0x3a3a4aff }} activeStyle={{ backgroundColor: 0x4a4a5aff }} padding={8}><text color={0xa3a3a3ff} fontSize={11}>Btn 2</text></box>
        <box width="grow" height={48} focusable backgroundColor={0x1e1e2eff} cornerRadius={8} hoverStyle={{ backgroundColor: 0x3a3a4aff }} activeStyle={{ backgroundColor: 0x4a4a5aff }} padding={8}><text color={0xa3a3a3ff} fontSize={11}>Btn 3</text></box>
        <box width="grow" height={48} focusable backgroundColor={0x1e1e2eff} cornerRadius={8} hoverStyle={{ backgroundColor: 0x3a3a4aff }} activeStyle={{ backgroundColor: 0x4a4a5aff }} padding={8}><text color={0xa3a3a3ff} fontSize={11}>Btn 4</text></box>
      </box>
      <box direction="row" gap={8} width="100%">
        <box width="grow" height={48} focusable backgroundColor={0x1e1e2eff} cornerRadius={8} hoverStyle={{ backgroundColor: 0x3a3a4aff }} activeStyle={{ backgroundColor: 0x4a4a5aff }} padding={8}><text color={0xa3a3a3ff} fontSize={11}>Btn 5</text></box>
        <box width="grow" height={48} focusable backgroundColor={0x1e1e2eff} cornerRadius={8} hoverStyle={{ backgroundColor: 0x3a3a4aff }} activeStyle={{ backgroundColor: 0x4a4a5aff }} padding={8}><text color={0xa3a3a3ff} fontSize={11}>Btn 6</text></box>
        <box width="grow" height={48} focusable backgroundColor={0x1e1e2eff} cornerRadius={8} hoverStyle={{ backgroundColor: 0x3a3a4aff }} activeStyle={{ backgroundColor: 0x4a4a5aff }} padding={8}><text color={0xa3a3a3ff} fontSize={11}>Btn 7</text></box>
        <box width="grow" height={48} focusable backgroundColor={0x1e1e2eff} cornerRadius={8} hoverStyle={{ backgroundColor: 0x3a3a4aff }} activeStyle={{ backgroundColor: 0x4a4a5aff }} padding={8}><text color={0xa3a3a3ff} fontSize={11}>Btn 8</text></box>
      </box>
      <box direction="row" gap={8} width="100%">
        <box width="grow" height={48} focusable backgroundColor={0x1e1e2eff} cornerRadius={8} hoverStyle={{ backgroundColor: 0x3a3a4aff }} activeStyle={{ backgroundColor: 0x4a4a5aff }} padding={8}><text color={0xa3a3a3ff} fontSize={11}>Btn 9</text></box>
        <box width="grow" height={48} focusable backgroundColor={0x1e1e2eff} cornerRadius={8} hoverStyle={{ backgroundColor: 0x3a3a4aff }} activeStyle={{ backgroundColor: 0x4a4a5aff }} padding={8}><text color={0xa3a3a3ff} fontSize={11}>Btn 10</text></box>
        <box width="grow" height={48} focusable backgroundColor={0x1e1e2eff} cornerRadius={8} hoverStyle={{ backgroundColor: 0x3a3a4aff }} activeStyle={{ backgroundColor: 0x4a4a5aff }} padding={8}><text color={0xa3a3a3ff} fontSize={11}>Btn 11</text></box>
        <box width="grow" height={48} focusable backgroundColor={0x1e1e2eff} cornerRadius={8} hoverStyle={{ backgroundColor: 0x3a3a4aff }} activeStyle={{ backgroundColor: 0x4a4a5aff }} padding={8}><text color={0xa3a3a3ff} fontSize={11}>Btn 12</text></box>
      </box>
    </box>
  )
}

/**
 * Scroll-heavy scene: content inside a scroll container.
 * Measures applyOffsetToDescendants cost (HP-6).
 * Kept to 20 items (shallow structure) for SolidJS universal reconciler compat.
 */
function ScrollHeavyScene(size: Size) {
  return (
    <box width={size.width} height={size.height} backgroundColor={0x101014ff} padding={24}>
      <box width="100%" height="grow" scrollY direction="column" gap={4}>
        <box width="100%" height={36} backgroundColor={0x1a1a2eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 1</text></box>
        <box width="100%" height={36} backgroundColor={0x16161eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 2</text></box>
        <box width="100%" height={36} backgroundColor={0x1a1a2eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 3</text></box>
        <box width="100%" height={36} backgroundColor={0x16161eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 4</text></box>
        <box width="100%" height={36} backgroundColor={0x1a1a2eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 5</text></box>
        <box width="100%" height={36} backgroundColor={0x16161eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 6</text></box>
        <box width="100%" height={36} backgroundColor={0x1a1a2eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 7</text></box>
        <box width="100%" height={36} backgroundColor={0x16161eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 8</text></box>
        <box width="100%" height={36} backgroundColor={0x1a1a2eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 9</text></box>
        <box width="100%" height={36} backgroundColor={0x16161eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 10</text></box>
        <box width="100%" height={36} backgroundColor={0x1a1a2eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 11</text></box>
        <box width="100%" height={36} backgroundColor={0x16161eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 12</text></box>
        <box width="100%" height={36} backgroundColor={0x1a1a2eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 13</text></box>
        <box width="100%" height={36} backgroundColor={0x16161eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 14</text></box>
        <box width="100%" height={36} backgroundColor={0x1a1a2eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 15</text></box>
        <box width="100%" height={36} backgroundColor={0x16161eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 16</text></box>
        <box width="100%" height={36} backgroundColor={0x1a1a2eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 17</text></box>
        <box width="100%" height={36} backgroundColor={0x16161eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 18</text></box>
        <box width="100%" height={36} backgroundColor={0x1a1a2eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 19</text></box>
        <box width="100%" height={36} backgroundColor={0x16161eff} cornerRadius={4} padding={8}><text color={0xd4d4d4ff} fontSize={11}>Item 20</text></box>
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
  const transport = await import("../packages/engine/src/output/transport-manager")
  return {
    createRenderLoop: loop.createRenderLoop,
    setFrameProfileSink: loop.setFrameProfileSink,
    solidRender: reconciler.render,
    setProp: reconciler.setProp,
    markDirty: dirty.markDirty,
    resetFocus: focus.resetFocus,
    resetSelection: selection.resetSelection,
    bindLoop: pointer.bindLoop,
    unbindLoop: pointer.unbindLoop,
    registerAnimationDescriptor: compositor.registerAnimationDescriptor,
    resetVexartFfiCallCounts: bridge.resetVexartFfiCallCounts,
    getVexartFfiCallCount: bridge.getVexartFfiCallCount,
    getVexartFfiCallCountsBySymbol: bridge.getVexartFfiCallCountsBySymbol,
    configureKittyTransportManager: transport.configureKittyTransportManager,
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
    scrollMs: value("scroll"),
    walkTreeMs: value("walk"),
    layoutComputeMs: value("layoutCompute"),
    layoutWritebackMs: value("layoutWriteback"),
    interactionMs: value("interaction"),
    relayoutMs: value("relayout"),
    layoutMs: value("layout"),
    layerAssignMs: value("layerAssign"),
    prepMs: value("prep"),
    paintNativeSnapshotMs: value("nativeSnapshot"),
    paintLayerPrepMs: value("layerPrep"),
    paintFrameContextMs: value("frameCtx"),
    paintBackendBeginMs: value("backendBegin"),
    paintReuseMs: value("reuse"),
    paintRenderGraphMs: value("renderGraph"),
    paintBackendPaintMs: value("backendPaint"),
    paintBackendCompositeMs: value("backendComposite"),
    paintBackendReadbackMs: value("backendReadback"),
    paintBackendNativeEmitMs: value("backendNativeEmit"),
    paintBackendNativeReadbackMs: value("backendNativeReadback"),
    paintBackendNativeCompressMs: value("backendNativeCompress"),
    paintBackendNativeShmPrepareMs: value("backendNativeShmPrepare"),
    paintBackendNativeWriteMs: value("backendNativeWrite"),
    paintBackendNativeRawBytes: value("backendNativeRawBytes"),
    paintBackendNativePayloadBytes: value("backendNativePayloadBytes"),
    paintBackendUniformMs: value("backendUniform"),
    paintLayerCleanupMs: value("layerCleanup"),
    paintBackendEndMs: value("backendEnd"),
    paintPresentationMs: value("presentation"),
    paintInteractionStatsMs: value("interactionStats"),
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
    scrollMs: summarize(frames.map((frame) => frame.scrollMs)),
    walkTreeMs: summarize(frames.map((frame) => frame.walkTreeMs)),
    layoutComputeMs: summarize(frames.map((frame) => frame.layoutComputeMs)),
    layoutWritebackMs: summarize(frames.map((frame) => frame.layoutWritebackMs)),
    interactionMs: summarize(frames.map((frame) => frame.interactionMs)),
    relayoutMs: summarize(frames.map((frame) => frame.relayoutMs)),
    layoutMs: summarize(frames.map((frame) => frame.layoutMs)),
    layerAssignMs: summarize(frames.map((frame) => frame.layerAssignMs)),
    prepMs: summarize(frames.map((frame) => frame.prepMs)),
    paintNativeSnapshotMs: summarize(frames.map((frame) => frame.paintNativeSnapshotMs)),
    paintLayerPrepMs: summarize(frames.map((frame) => frame.paintLayerPrepMs)),
    paintFrameContextMs: summarize(frames.map((frame) => frame.paintFrameContextMs)),
    paintBackendBeginMs: summarize(frames.map((frame) => frame.paintBackendBeginMs)),
    paintReuseMs: summarize(frames.map((frame) => frame.paintReuseMs)),
    paintRenderGraphMs: summarize(frames.map((frame) => frame.paintRenderGraphMs)),
    paintBackendPaintMs: summarize(frames.map((frame) => frame.paintBackendPaintMs)),
    paintBackendCompositeMs: summarize(frames.map((frame) => frame.paintBackendCompositeMs)),
    paintBackendReadbackMs: summarize(frames.map((frame) => frame.paintBackendReadbackMs)),
    paintBackendNativeEmitMs: summarize(frames.map((frame) => frame.paintBackendNativeEmitMs)),
    paintBackendNativeReadbackMs: summarize(frames.map((frame) => frame.paintBackendNativeReadbackMs)),
    paintBackendNativeCompressMs: summarize(frames.map((frame) => frame.paintBackendNativeCompressMs)),
    paintBackendNativeShmPrepareMs: summarize(frames.map((frame) => frame.paintBackendNativeShmPrepareMs)),
    paintBackendNativeWriteMs: summarize(frames.map((frame) => frame.paintBackendNativeWriteMs)),
    paintBackendNativeRawBytes: summarize(frames.map((frame) => frame.paintBackendNativeRawBytes)),
    paintBackendNativePayloadBytes: summarize(frames.map((frame) => frame.paintBackendNativePayloadBytes)),
    paintBackendUniformMs: summarize(frames.map((frame) => frame.paintBackendUniformMs)),
    paintLayerCleanupMs: summarize(frames.map((frame) => frame.paintLayerCleanupMs)),
    paintBackendEndMs: summarize(frames.map((frame) => frame.paintBackendEndMs)),
    paintPresentationMs: summarize(frames.map((frame) => frame.paintPresentationMs)),
    paintInteractionStatsMs: summarize(frames.map((frame) => frame.paintInteractionStatsMs)),
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

function topStageP95(summary: StageSummary) {
  return Object.entries(summary)
    .filter(([stage]) => stage !== "totalMs" && stage !== "ffiCallCount" && !stage.endsWith("Bytes"))
    .map(([stage, value]) => ({ stage, p95: value.p95 }))
    .filter((entry) => entry.p95 > 0)
    .sort((a, b) => b.p95 - a.p95)
    .slice(0, 6)
}



async function runScenario(engine: EngineModules, name: ScenarioName, size: Size, frames: number, warmup: number, transport: TransmissionMode, nativePresentation: boolean): Promise<ScenarioReport> {
  await clearCadenceLog()
  engine.resetVexartFfiCallCounts()
  const capturedProfiles: CadenceFrame[] = []
  engine.setFrameProfileSink((profile) => {
    capturedProfiles.push({
      totalMs: profile.totalMs,
      scrollMs: profile.scrollMs,
      walkTreeMs: profile.walkTreeMs,
      layoutComputeMs: profile.layoutComputeMs,
      layoutWritebackMs: profile.layoutWritebackMs,
      interactionMs: profile.interactionMs,
      relayoutMs: profile.relayoutMs,
      layoutMs: profile.layoutMs,
      layerAssignMs: profile.layerAssignMs,
      prepMs: profile.prepMs,
      paintNativeSnapshotMs: profile.paintNativeSnapshotMs,
      paintLayerPrepMs: profile.paintLayerPrepMs,
      paintFrameContextMs: profile.paintFrameContextMs,
      paintBackendBeginMs: profile.paintBackendBeginMs,
      paintReuseMs: profile.paintReuseMs,
      paintRenderGraphMs: profile.paintRenderGraphMs,
      paintBackendPaintMs: profile.paintBackendPaintMs,
      paintBackendCompositeMs: profile.paintBackendCompositeMs,
      paintBackendReadbackMs: profile.paintBackendReadbackMs,
      paintBackendNativeEmitMs: profile.paintBackendNativeEmitMs,
      paintBackendNativeReadbackMs: profile.paintBackendNativeReadbackMs,
      paintBackendNativeCompressMs: profile.paintBackendNativeCompressMs,
      paintBackendNativeShmPrepareMs: profile.paintBackendNativeShmPrepareMs,
      paintBackendNativeWriteMs: profile.paintBackendNativeWriteMs,
      paintBackendNativeRawBytes: profile.paintBackendNativeRawBytes,
      paintBackendNativePayloadBytes: profile.paintBackendNativePayloadBytes,
      paintBackendUniformMs: profile.paintBackendUniformMs,
      paintLayerCleanupMs: profile.paintLayerCleanupMs,
      paintBackendEndMs: profile.paintBackendEndMs,
      paintPresentationMs: profile.paintPresentationMs,
      paintInteractionStatsMs: profile.paintInteractionStatsMs,
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
  engine.configureKittyTransportManager({
    preferredMode: transport,
    probe: { shm: transport === "shm", file: transport === "file" || transport === "shm" },
  })
  const term = createMockTerminal(size.width, size.height, transport)
  const forceLayerRepaint = name === SCENARIO.DASHBOARD_SMOKE || name === SCENARIO.DASHBOARD_1080P
  const loop = engine.createRenderLoop(term as never, {
    experimental: {
      forceLayerRepaint,
      nativePresentation,
      nativeLayerRegistry: nativePresentation,
    },
  })
  engine.bindLoop(loop)
  const dispose = engine.solidRender(() => renderScenario(name, size) as never, loop.root)
  const compositorTarget = name === SCENARIO.COMPOSITOR_ONLY
    ? loop.root.children[0]?.children[0]
    : null
  if (name === SCENARIO.COMPOSITOR_ONLY && !compositorTarget) {
    throw new Error("compositor-only scenario did not create a target node")
  }
  if (compositorTarget) {
    const registered = engine.registerAnimationDescriptor({
      nodeId: compositorTarget.id,
      property: "transform",
      from: -8,
      to: 8,
      startTime: performance.now(),
      physics: { kind: "transition", easing: (t: number) => t, duration: 1000 },
    })
    if (!registered) throw new Error("compositor-only target did not qualify for compositor path")
  }
  const compositorTransformValues: number[] = []

  try {
    engine.markDirty()
    for (let i = 0; i < warmup; i++) {
      if (compositorTarget) {
        applyCompositorTransform(compositorTarget, (node, prop, value) => engine.setProp(node, prop, value), i)
      }
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
      } else if (name === SCENARIO.HOVER_TRANSITION) {
        // Alternate pointer between button grid cells to trigger hover transitions.
        // 3 rows × 4 cols of buttons. Stresses interaction + relayout (HP-5).
        const col = i % 4
        const row = Math.floor(i / 4) % 3
        const x = 24 + col * (size.width - 48) / 4 + 60
        const y = 24 + row * 56 + 24
        loop.feedPointer(x, y, false)
        loop.frame()
      } else if (name === SCENARIO.SCROLL_HEAVY) {
        // Feed scroll deltas to stress applyOffsetToDescendants (HP-6).
        // Alternate direction every 20 frames to stay within content.
        const direction = Math.floor(i / 20) % 2 === 0 ? 3 : -3
        loop.feedScroll(0, direction)
        loop.frame()
      } else if (name === SCENARIO.COMPOSITOR_ONLY) {
        if (!compositorTarget) {
          throw new Error("compositor-only scenario target disappeared")
        }
        applyCompositorTransform(compositorTarget, (node, prop, value) => engine.setProp(node, prop, value), i)
        const transformValue = compositorTransformValue(compositorTarget)
        if (transformValue === null) throw new Error("compositor-only transform prop was not applied")
        compositorTransformValues.push(transformValue)
        engine.markDirty()
        loop.frame()
      } else {
        engine.markDirty()
        loop.frame()
      }
      const elapsed = performance.now() - start
      const ffiCallCount = engine.getVexartFfiCallCount() - beforeFfi
      manualFrames.push({
        totalMs: elapsed,
        scrollMs: 0,
        walkTreeMs: 0,
        layoutComputeMs: 0,
        layoutWritebackMs: 0,
        interactionMs: 0,
        relayoutMs: 0,
        layoutMs: 0,
        layerAssignMs: 0,
        prepMs: 0,
        paintNativeSnapshotMs: 0,
        paintLayerPrepMs: 0,
        paintFrameContextMs: 0,
        paintBackendBeginMs: 0,
        paintReuseMs: 0,
        paintRenderGraphMs: 0,
        paintBackendPaintMs: 0,
        paintBackendCompositeMs: 0,
        paintBackendReadbackMs: 0,
        paintBackendNativeEmitMs: 0,
        paintBackendNativeReadbackMs: 0,
        paintBackendNativeCompressMs: 0,
        paintBackendNativeShmPrepareMs: 0,
        paintBackendNativeWriteMs: 0,
        paintBackendNativeRawBytes: 0,
        paintBackendNativePayloadBytes: 0,
        paintBackendUniformMs: 0,
        paintLayerCleanupMs: 0,
        paintBackendEndMs: 0,
        paintPresentationMs: 0,
        paintInteractionStatsMs: 0,
        paintMs: 0,
        ioMs: 0,
        beginSyncMs: 0,
        endSyncMs: 0,
        commands: 0,
        repainted: 0,
        dirtyBefore: 0,
        ffiCallCount,
      })
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
      ...(name === SCENARIO.COMPOSITOR_ONLY
        ? {
            compositorTransformValues,
            compositorTransformChanged: hasChangingCompositorTransforms(compositorTransformValues),
          }
        : {}),
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
  if (name === SCENARIO.HOVER_TRANSITION) return <HoverTransitionScene width={size.width} height={size.height} />
  if (name === SCENARIO.SCROLL_HEAVY) return <ScrollHeavyScene width={size.width} height={size.height} />
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
  const stages = topStageP95(report.summary)
  console.log(`  ${report.name.padEnd(18)} ${report.width}×${report.height} frames=${report.framesMeasured}`)
  console.log(`    total p50=${total.p50.toFixed(2)} p95=${total.p95.toFixed(2)} p99=${total.p99.toFixed(2)} avg=${total.avg.toFixed(2)} ms`)
  console.log(`    layout p95=${layout.p95.toFixed(2)} paint p95=${paint.p95.toFixed(2)} ffi avg=${ffi.avg.toFixed(1)}`)
  if (stages.length > 0) {
    console.log(`    bottlenecks p95: ${stages.map((entry) => `${entry.stage}=${entry.p95.toFixed(2)}`).join(", ")}`)
  }
  if (report.summary.paintBackendNativeEmitMs.p95 > 0) {
    const raw = report.summary.paintBackendNativeRawBytes.p50
    const payload = report.summary.paintBackendNativePayloadBytes.p50
    const ratio = raw > 0 ? payload / raw : 0
    console.log(`    native emit p95: rb=${report.summary.paintBackendNativeReadbackMs.p95.toFixed(2)} compress=${report.summary.paintBackendNativeCompressMs.p95.toFixed(2)} shm=${report.summary.paintBackendNativeShmPrepareMs.p95.toFixed(2)} write=${report.summary.paintBackendNativeWriteMs.p95.toFixed(2)} ms payload=${(payload / 1024).toFixed(0)}KB raw=${(raw / 1024).toFixed(0)}KB ratio=${ratio.toFixed(2)}`)
  }
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
    { name: SCENARIO.HOVER_TRANSITION, size: { width: 1920, height: 1080 } },
    { name: SCENARIO.SCROLL_HEAVY, size: { width: 1920, height: 1080 } },
  ]

  console.log("\n🔬 Vexart frame breakdown — frames=" + String(options.frames) + " warmup=" + String(options.warmup) + " transport=" + options.transport + " transportObservation=requested-mode nativePresentationRequested=" + (options.nativePresentation ? "on" : "off") + " presentationPath=full-frame scope=internal-frame-timing visibleTerminalLatency=not-measured\n")
  const filtered = options.scenarioFilter
    ? scenarios.filter((s) => options.scenarioFilter!.split(",").map((x) => x.trim()).includes(s.name))
    : scenarios
  const reports: ScenarioReport[] = []
  for (const scenario of filtered) {
    const report = await runScenario(engine, scenario.name, scenario.size, options.frames, options.warmup, options.transport, options.nativePresentation)
    reports.push(report)
    printScenario(report)
  }

  const output: BenchmarkReport = {
    version: FRAME_BREAKDOWN_REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    runtime: `bun ${Bun.version}`,
    platform: process.platform,
    arch: process.arch,
    frames: options.frames,
    warmup: options.warmup,
    transport: options.transport,
    nativePresentation: options.nativePresentation,
    nativePresentationRequested: options.nativePresentation,
    measurementScope: MEASUREMENT_SCOPE,
    visibleTerminalLatencyMeasured: false,
    presentationPath: FULL_FRAME_PRESENTATION_PATH,
    transportObservation: TRANSPORT_OBSERVATION,
    deprecatedMetrics: ["paintNativeSnapshotMs"],
    scenarios: reports,
  }
  await mkdir(dirname(options.output), { recursive: true })
  await writeFile(options.output, JSON.stringify(output, null, 2) + "\n")
  console.log(`\n✅ wrote ${options.output}\n`)
}

await main()
