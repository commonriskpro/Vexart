import { createSignal, For } from "solid-js"
import { VoidButton, VoidInput, VoidPopover, VoidScrollView, themeColors } from "@vexart/styled"
import type { ScrollHandle } from "@vexart/headless"
import { createTerminal, type Terminal } from "../packages/engine/src/terminal/index"
import { createRenderLoop, setFrameProfileSink, type RenderLoop } from "../packages/engine/src/loop/loop"
import { render } from "../packages/engine/src/reconciler/reconciler"
import { bindLoop, unbindLoop } from "../packages/engine/src/reconciler/pointer"
import { dispatchInput } from "../packages/engine/src/loop/input"
import { markDirty } from "../packages/engine/src/reconciler/dirty"
import { resetFocus, setFocus, setFocusedId } from "../packages/engine/src/reconciler/focus"
import { clearSelection } from "../packages/engine/src/reconciler/selection"
import { getRendererBackend, type RendererBackend } from "../packages/engine/src/ffi/renderer-backend"
import { createParser } from "../packages/engine/src/input/parser"
import type { TGENode } from "../packages/engine/src/ffi/node"
import {
  getLastNativePresentationStatsForTest,
  waitForTmuxPresentationForTest,
} from "../packages/engine/src/ffi/gpu-renderer-backend"
import { wrapPassthrough } from "../packages/engine/src/terminal/tmux"
import type { NodeHandle } from "../packages/engine/src/reconciler/handle"
import type { FrameProfile } from "../packages/engine/src/loop/composite"
import type { NativePresentationStats } from "../packages/engine/src/ffi/native-presentation-stats"
import { existsSync } from "node:fs"
import { unlink, writeFile } from "node:fs/promises"
import { resolve, join } from "node:path"

type Route = "plain" | "tmux"
type PhaseName = "idle" | "typing" | "hover" | "scroll" | "overlay" | "animation" | "full-repaint"
type MeasurementScope = "synthetic-pty" | "live actual-terminal-unobserved"
type ReceiverMode = "synthetic-pty" | "actual-terminal-unobserved"

type Options = {
  out: string
  route: Route
  frames: number
  warmup: number
  intervalMs: number
  live: boolean
}

type SceneDimensions = {
  width: number
  height: number
  padding: number
  gap: number
  innerWidth: number
  headerHeight: number
  bodyHeight: number
  footerHeight: number
  sidebarWidth: number
  contentWidth: number
  statWidth: number
  statsHeight: number
  scrollHeight: number
  brandWidth: number
  inputWidth: number
  hoverWidth: number
  rowWidth: number
}

type SceneControl = {
  query: () => string
  setQuery: (value: string) => void
  hovered: () => boolean
  hoverTarget: () => NodeHandle | undefined
  scroll: () => ScrollHandle | undefined
  overlayOpen: () => boolean
  setOverlayOpen: (value: boolean) => void
  animationOffset: () => number
  setAnimationOffset: (value: number) => void
  fullColor: () => number
  setFullColor: (value: number) => void
  phaseLabel: () => string
  setPhaseLabel: (value: string) => void
}

type ResourceSnapshot = {
  cpuUserUs: number
  cpuSystemUs: number
  rssBytes: number
}

type NumericSummary = {
  count: number
  min: number | null
  p50: number | null
  p95: number | null
  p99: number | null
  max: number | null
  avg: number | null
}

type SampleSummary = NumericSummary & { samples: number[] }

type PhaseMeasurement = {
  phase: PhaseName
  requestedFrames: number
  renderedProfiles: number
  distinctMutations: number
  wallTimeMs: number
  frameWallMs: SampleSummary
  cpuUsage: { userUs: number; systemUs: number; totalUs: number }
  rssBytes: { start: number; end: number; max: number }
  profiles: Record<string, NumericSummary>
  sampledNativeSnapshots: {
    observedCount: number
    transports: number[]
    modes: number[]
    distributions: Record<string, NumericSummary>
    note: string
  }
}

type FixtureReport = {
  version: 1
  status: "PASS" | "FAIL"
  workload: "representative controlled workload"
  measurementScope: MeasurementScope
  receiver: ReceiverMode
  visibleFpsMeasured: false
  measurementNote: "Internal frame timings do not measure visible FPS or complete terminal presentation latency."
  route: Route
  requestedFrames: number
  warmup: number
  intervalMs: number
  terminal?: {
    kind: string
    tmux: boolean
    kittyGraphics: boolean
    kittyPlaceholder: boolean
    transmissionMode: string
    pixelWidth: number
    pixelHeight: number
    cols: number
    rows: number
    cellWidth: number
    cellHeight: number
  }
  strategy: {
    layerStrategy: string
    shmCompression: string
    nativePresentationRequested: true
    nativeLayerRegistryRequested: true
  }
  phases: PhaseMeasurement[]
  error?: string
  stack?: string
}

const WIDTH = 1920
const HEIGHT = 1080
const MIN_LIVE_WIDTH = 960
const MIN_LIVE_HEIGHT = 540
const LIVE_BUDGET_MS = 85_000
const ROWS = Array.from({ length: 96 }, (_, index) => ({
  index,
  title: `Worker ${String(index + 1).padStart(3, "0")}`,
  detail: index % 3 === 0 ? "healthy · 99.9%" : index % 3 === 1 ? "queued · 4 jobs" : "idle · 0 jobs",
}))
const PHASES: PhaseName[] = ["idle", "typing", "hover", "scroll", "overlay", "animation", "full-repaint"]
const NATIVE_FIELDS = ["rgbaBytesRead", "kittyBytesEmitted", "readbackUs", "encodeUs", "writeUs", "totalUs", "compressUs", "shmPrepareUs", "rawBytes", "payloadBytes"] as const
const PROFILE_FIELDS: Array<keyof FrameProfile> = [
  "scheduledIntervalMs", "scheduledDelayMs", "timerDelayMs", "sincePrevFrameMs",
  "scrollMs", "walkTreeMs", "layoutComputeMs", "layoutWritebackMs", "interactionMs",
  "relayoutMs", "layoutMs", "layerAssignMs", "prepMs", "paintNativeSnapshotMs",
  "paintLayerPrepMs", "paintFrameContextMs", "paintBackendBeginMs", "paintReuseMs",
  "paintRenderGraphMs", "paintBackendPaintMs", "paintBackendCompositeMs",
  "paintBackendReadbackMs", "paintBackendNativeEmitMs", "paintBackendNativeReadbackMs",
  "paintBackendNativeCompressMs", "paintBackendNativeShmPrepareMs", "paintBackendNativeWriteMs",
  "paintBackendNativeRawBytes", "paintBackendNativePayloadBytes", "paintBackendUniformMs",
  "paintLayerCleanupMs", "paintBackendEndMs", "paintPresentationMs", "paintInteractionStatsMs",
  "paintMs", "beginSyncMs", "ioMs", "endSyncMs", "totalMs", "commands", "repainted", "dirtyBefore",
]

function parseOptions(): Options {
  const value = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  const live = process.argv.includes("--live")
  const route = value("route")
  if (route !== "plain" && route !== "tmux") throw new Error("--route must be plain or tmux")
  const selectedRoute: Route = route
  const out = value("out")
  if (!out) throw new Error("--out=<existing run directory> is required")
  const positive = (name: string, fallback: number) => {
    const parsed = Number(value(name) ?? fallback)
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--${name} must be positive`)
    return parsed
  }
  const integer = (name: string, fallback: number) => {
    const parsed = Number(value(name) ?? fallback)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`--${name} must be a positive integer`)
    return parsed
  }
  const nonNegativeInteger = (name: string, fallback: number) => {
    const parsed = Number(value(name) ?? fallback)
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`--${name} must be a non-negative integer`)
    return parsed
  }
  const options = {
    out: resolve(out),
    route: selectedRoute,
    frames: integer("frames", 120),
    warmup: nonNegativeInteger("warmup", 20),
    intervalMs: positive("interval", 16.667),
    live,
  }
  if (live && options.frames * options.intervalMs * PHASES.length > LIVE_BUDGET_MS) {
    throw new Error(`live run exceeds ${LIVE_BUDGET_MS}ms budget; reduce --frames or --interval`)
  }
  return options
}

function createControl(): SceneControl {
  return {
    query: () => "",
    setQuery() {},
    hovered: () => false,
    hoverTarget: () => undefined,
    scroll: () => undefined,
    overlayOpen: () => false,
    setOverlayOpen() {},
    animationOffset: () => 0,
    setAnimationOffset() {},
    fullColor: () => 0x111827ff,
    setFullColor() {},
    phaseLabel: () => "ready",
    setPhaseLabel() {},
  }
}

function colorFor(index: number) {
  const red = 12 + (index % 120)
  const green = 18 + ((index * 3) % 120)
  const blue = 28 + ((index * 5) % 120)
  return ((red << 24) | (green << 16) | (blue << 8) | 0xff) >>> 0
}

function sceneDimensions(width: number, height: number): SceneDimensions {
  const minSide = Math.min(width, height)
  const padding = Math.min(32, Math.max(16, Math.round(minSide * 0.03)))
  const gap = Math.min(20, Math.max(12, Math.round(minSide * 0.018)))
  const innerWidth = Math.max(1, width - padding * 2)
  const innerHeight = Math.max(1, height - padding * 2)
  const headerHeight = Math.min(72, Math.max(60, Math.round(innerHeight * 0.08)))
  const footerHeight = Math.min(28, Math.max(24, Math.round(innerHeight * 0.03)))
  const bodyHeight = Math.max(1, innerHeight - headerHeight - footerHeight - gap * 2)
  const sidebarWidth = Math.min(260, Math.max(180, Math.round(innerWidth * 0.14)))
  const contentWidth = Math.max(1, innerWidth - sidebarWidth - gap)
  const statsHeight = Math.min(148, Math.max(100, Math.round(bodyHeight * 0.18)))
  const scrollHeight = Math.max(1, bodyHeight - statsHeight - gap)
  const brandWidth = Math.min(250, Math.max(150, Math.round(innerWidth * 0.14)))
  const inputWidth = Math.min(420, Math.max(180, Math.round(innerWidth * 0.23)))
  const hoverWidth = Math.min(188, Math.max(120, Math.round(innerWidth * 0.1)))
  const statWidth = Math.max(1, Math.floor((contentWidth - gap * 3) / 4))
  const rowWidth = Math.max(1, contentWidth - 16)
  return {
    width,
    height,
    padding,
    gap,
    innerWidth,
    headerHeight,
    bodyHeight,
    footerHeight,
    sidebarWidth,
    contentWidth,
    statWidth,
    statsHeight,
    scrollHeight,
    brandWidth,
    inputWidth,
    hoverWidth,
    rowWidth,
  }
}

function PerformanceScene(props: { control: SceneControl; width: number; height: number }) {
  const dims = sceneDimensions(props.width, props.height)
  const [query, setQuery] = createSignal("")
  const [hovered, setHovered] = createSignal(false)
  const [overlayOpen, setOverlayOpen] = createSignal(false)
  const [animationOffset, setAnimationOffset] = createSignal(0)
  const [fullColor, setFullColor] = createSignal(0x111827ff)
  const [phaseLabel, setPhaseLabel] = createSignal("ready")
  let hoverNode: NodeHandle | undefined

  props.control.query = query
  props.control.setQuery = setQuery
  props.control.hovered = hovered
  props.control.hoverTarget = () => hoverNode
  props.control.overlayOpen = overlayOpen
  props.control.setOverlayOpen = setOverlayOpen
  props.control.animationOffset = animationOffset
  props.control.setAnimationOffset = setAnimationOffset
  props.control.fullColor = fullColor
  props.control.setFullColor = setFullColor
  props.control.phaseLabel = phaseLabel
  props.control.setPhaseLabel = setPhaseLabel

  return (
    <box width={dims.width} height={dims.height} direction="column" padding={dims.padding} gap={dims.gap} backgroundColor={fullColor()}>
      <box width={dims.innerWidth} height={dims.headerHeight} direction="row" alignY="center" gap={16} padding={16} backgroundColor={themeColors.card} cornerRadius={12}>
        <box width={dims.brandWidth} direction="column" gap={4}>
          <text color={themeColors.foreground} fontSize={20} fontWeight={600}>Vexart Runtime</text>
          <text color={themeColors.mutedForeground} fontSize={12}>terminal performance matrix</text>
        </box>
        <VoidInput value={query()} onChange={setQuery} placeholder="Type to filter workers" focusId="perf-search" width={dims.inputWidth} />
        <VoidPopover
          open={overlayOpen()}
          onOpenChange={setOverlayOpen}
          placement="bottom"
          offset={8}
          width={300}
          trigger={<VoidButton focusId="perf-overlay-trigger" variant="outline" size="sm">Actions</VoidButton>}
        >
          <text color={themeColors.popoverForeground} fontSize={13}>Live overlay payload</text>
          <text color={themeColors.mutedForeground} fontSize={12}>Rendered from the real floating layer path.</text>
        </VoidPopover>
        <box
          ref={(handle) => { hoverNode = handle }}
          width={dims.hoverWidth}
          height={40}
          padding={4}
          focusable
          backgroundColor={hovered() ? themeColors.accent : themeColors.secondary}
          hoverStyle={{ backgroundColor: themeColors.accent }}
          onMouseOver={() => setHovered(true)}
          onMouseOut={() => setHovered(false)}
          alignX="center"
          alignY="center"
          cornerRadius={8}
        >
          <text color={themeColors.secondaryForeground} fontSize={12}>Hover target</text>
        </box>
        <box width="grow" />
        <text color={themeColors.mutedForeground} fontSize={12}>{`query=${query().slice(-24)}`}</text>
      </box>

      <box width={dims.innerWidth} height={dims.bodyHeight} direction="row" gap={dims.gap}>
        <box width={dims.sidebarWidth} height={dims.bodyHeight} direction="column" gap={12} padding={16} backgroundColor={themeColors.card} cornerRadius={12}>
          <text color={themeColors.foreground} fontSize={14} fontWeight={600}>Workspaces</text>
          <For each={["Overview", "Workers", "Queues", "Deployments", "Audit log"]}>
            {(label, index) => (
              <box width="100%" height={36} paddingX={12} alignY="center" backgroundColor={index() === 1 ? themeColors.accent : themeColors.muted} cornerRadius={6}>
                <text color={themeColors.foreground} fontSize={12}>{label}</text>
              </box>
            )}
          </For>
          <box height="grow" />
          <text color={themeColors.mutedForeground} fontSize={11}>96 worker records</text>
          <text color={themeColors.mutedForeground} fontSize={11}>Native SHM transport</text>
        </box>

        <box width={dims.contentWidth} height={dims.bodyHeight} direction="column" gap={dims.gap}>
          <box width={dims.contentWidth} height={dims.statsHeight} direction="row" gap={dims.gap}>
            <box width={dims.statWidth} height={dims.statsHeight} direction="column" gap={8} padding={20} backgroundColor={themeColors.card} cornerRadius={12}>
              <text color={themeColors.mutedForeground} fontSize={12}>Throughput</text>
              <text color={themeColors.foreground} fontSize={28} fontWeight={600}>1,284</text>
              <text color={themeColors.accent} fontSize={12}>+12.8% from yesterday</text>
            </box>
            <box width={dims.statWidth} height={dims.statsHeight} direction="column" gap={8} padding={20} backgroundColor={themeColors.card} cornerRadius={12}>
              <text color={themeColors.mutedForeground} fontSize={12}>Active queue</text>
              <text color={themeColors.foreground} fontSize={28} fontWeight={600}>42</text>
              <text color={themeColors.destructive} fontSize={12}>3 waiting for capacity</text>
            </box>
            <box width={dims.statWidth} height={dims.statsHeight} direction="column" gap={8} padding={20} backgroundColor={themeColors.card} cornerRadius={12}>
              <text color={themeColors.mutedForeground} fontSize={12}>Memory</text>
              <text color={themeColors.foreground} fontSize={28} fontWeight={600}>68.4%</text>
              <text color={themeColors.mutedForeground} fontSize={12}>within service budget</text>
            </box>
            <box width={dims.statWidth} height={dims.statsHeight} direction="column" gap={8} padding={20} backgroundColor={themeColors.card} cornerRadius={12}>
              <text color={themeColors.mutedForeground} fontSize={12}>Frame offset</text>
              <text color={themeColors.foreground} fontSize={28} fontWeight={600}>{String(Math.round(animationOffset()))}</text>
              <box width={64} height={16} layer backgroundColor={themeColors.primary} transform={{ translateX: animationOffset() }} cornerRadius={4} />
            </box>
          </box>

          <VoidScrollView ref={(handle) => { props.control.scroll = () => handle; }} width={dims.contentWidth} height={dims.scrollHeight} scrollY showScrollbar={false} gap={4} padding={8}>
            <For each={ROWS}>
              {(row) => (
                <box width={dims.rowWidth} height={36} direction="row" alignY="center" paddingX={16} gap={24} backgroundColor={row.index % 2 === 0 ? themeColors.card : themeColors.secondary}>
                  <text color={themeColors.mutedForeground} fontSize={12}>{`#${String(row.index + 1).padStart(3, "0")}`}</text>
                  <text color={themeColors.foreground} fontSize={12}>{row.title}</text>
                  <text color={themeColors.mutedForeground} fontSize={12}>{row.detail}</text>
                  <box width="grow" />
                  <text color={row.index % 3 === 0 ? themeColors.accent : themeColors.mutedForeground} fontSize={12}>{row.index % 3 === 0 ? "running" : "standby"}</text>
                </box>
              )}
            </For>
          </VoidScrollView>
        </box>
      </box>

      <box width={dims.innerWidth} height={dims.footerHeight} direction="row" alignY="center" gap={20}>
        <text color={themeColors.mutedForeground} fontSize={11}>{`phase=${phaseLabel()}`}</text>
        <text color={themeColors.mutedForeground} fontSize={11}>{`scroll=${Math.round(-(props.control.scroll()?.scrollY ?? 0))}`}</text>
        <text color={themeColors.mutedForeground} fontSize={11}>{`hover=${hovered() ? "in" : "out"}`}</text>
        <text color={themeColors.mutedForeground} fontSize={11}>{`overlay=${overlayOpen() ? "open" : "closed"}`}</text>
        <text color={themeColors.mutedForeground} fontSize={11}>GPU-backed retained scene</text>
      </box>
    </box>
  )
}

function snapshot(): ResourceSnapshot {
  const cpu = process.cpuUsage()
  const memory = process.memoryUsage()
  return { cpuUserUs: cpu.user, cpuSystemUs: cpu.system, rssBytes: memory.rss }
}

function summarize(values: number[]): NumericSummary {
  if (values.length === 0) return { count: 0, min: null, p50: null, p95: null, p99: null, max: null, avg: null }
  const sorted = [...values].sort((a, b) => a - b)
  const at = (p: number) => {
    const index = (sorted.length - 1) * p
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    if (lower === upper) return sorted[lower]
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
  }
  return {
    count: values.length,
    min: sorted[0],
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted[sorted.length - 1],
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
  }
}

function sampleSummary(values: number[]): SampleSummary {
  return { ...summarize(values), samples: [...values] }
}

function profileSummary(profiles: FrameProfile[]): Record<string, NumericSummary> {
  const result: Record<string, NumericSummary> = {}
  for (const field of PROFILE_FIELDS) result[field] = summarize(profiles.map((profile) => Number(profile[field])))
  return result
}

function nativeSummary(samples: NativePresentationStats[]) {
  const distributions: Record<string, NumericSummary> = {}
  for (const field of NATIVE_FIELDS) distributions[field] = summarize(samples.map((sample) => sample[field]))
  return {
    observedCount: samples.length,
    transports: [...new Set(samples.map((sample) => sample.transport))],
    modes: [...new Set(samples.map((sample) => sample.mode))],
    distributions,
    note: "Sampled snapshots only; native stats are asynchronous and are not attributed to individual JS frames or SHM uploads. kittyBytesEmitted is approximate. Use receiver upload records for transport totals.",
  }
}

function markerPayload(route: Route, phase: PhaseName, event: "start" | "end", extra: Record<string, unknown> = {}) {
  return JSON.stringify({ event, phase, route, atMs: performance.now(), ...extra })
}

function writeMarker(term: Terminal, route: Route, phase: PhaseName, event: "start" | "end", extra: Record<string, unknown> = {}) {
  const marker = `\x1b]777;vexart-perf;${markerPayload(route, phase, event, extra)}\x07`
  term.rawWrite(route === "tmux" ? wrapPassthrough(marker) : marker)
}

async function settle() {
  await Bun.sleep(0)
}

async function waitForAck(out: string, phase: PhaseName) {
  const path = join(out, `${phase}.ack`)
  const deadline = Date.now() + 60_000
  while (true) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for receiver ack: ${phase}`)
    if (existsSync(path)) {
      const ack = (await Bun.file(path).text()).trim()
      if (ack) return
    }
    await Bun.sleep(10)
  }
}

function mutation(phase: PhaseName, index: number, loop: RenderLoop, control: SceneControl) {
  switch (phase) {
    case "idle":
      return { before: "idle", read: () => "idle", changed: false }
    case "typing": {
      if (index === 0) setFocus("perf-search")
      const before = control.query()
      const char = String.fromCharCode(97 + (index % 26))
      dispatchInput({ type: "key", key: char, char, mods: { shift: false, alt: false, ctrl: false, meta: false } })
      return { before, read: control.query, changed: true }
    }
    case "hover": {
      const target = control.hoverTarget()
      if (!target) throw new Error("hover target did not receive a layout handle")
      const inside = index % 2 === 0
      const layout = target.layout
      const x = inside ? layout.x + layout.width / 2 : layout.x + layout.width + 24
      const y = layout.y + layout.height / 2
      const before = String(control.hovered())
      loop.feedPointer(x, y, false)
      return { before, read: () => String(control.hovered()), changed: true }
    }
    case "scroll": {
      const handle = control.scroll()
      if (!handle) throw new Error("scroll view did not receive a handle")
      const before = String(handle.scrollTop)
      const max = Math.max(1, handle.contentHeight - handle.viewportHeight)
      let target = (index * 41 + 17) % (max + 1)
      if (String(target) === before) target = (target + 1) % (max + 1)
      handle.scrollTo(-target)
      return { before, read: () => String(handle.scrollTop), changed: true }
    }
    case "overlay": {
      const before = String(control.overlayOpen())
      control.setOverlayOpen(index % 2 === 0)
      return { before, read: () => String(control.overlayOpen()), changed: true }
    }
    case "animation": {
      const before = String(control.animationOffset())
      const next = (index * 7 + 11) % 220
      control.setAnimationOffset(next)
      return { before, read: () => String(control.animationOffset()), changed: true }
    }
    case "full-repaint": {
      const before = String(control.fullColor())
      control.setFullColor(colorFor(index))
      // A full dirty mark is intentional only for this phase; other phases
      // exercise scoped signal, interaction, and retained-layer updates.
      markDirty()
      return { before, read: () => String(control.fullColor()), changed: true }
    }
  }
}

async function main(): Promise<number> {
  const options = parseOptions()
  if (!existsSync(options.out)) throw new Error(`--out must already exist: ${options.out}`)

  let term: Terminal | undefined
  let loop: RenderLoop | undefined
  let dispose: (() => void) | undefined
  let backend: RendererBackend | undefined
  let removeLiveInput: (() => void) | undefined
  let removeLiveResize: (() => void) | undefined
  let abortRequested = false
  let liveResizeError: string | undefined
  const control = createControl()
  const phases: PhaseMeasurement[] = []
  const reportPath = join(options.out, "fixture.json")
  const reportBase: FixtureReport = {
    version: 1,
    status: "FAIL",
    workload: "representative controlled workload",
    measurementScope: options.live ? "live actual-terminal-unobserved" : "synthetic-pty",
    receiver: options.live ? "actual-terminal-unobserved" : "synthetic-pty",
    visibleFpsMeasured: false,
    measurementNote: "Internal frame timings do not measure visible FPS or complete terminal presentation latency.",
    route: options.route,
    requestedFrames: options.frames,
    warmup: options.warmup,
    intervalMs: options.intervalMs,
    terminal: undefined,
    strategy: {
      layerStrategy: process.env.VEXART_GPU_FORCE_LAYER_STRATEGY ?? "default",
      shmCompression: process.env.VEXART_KITTY_SHM_COMPRESSION ?? "default",
      nativePresentationRequested: true,
      nativeLayerRegistryRequested: true,
    },
    phases,
  }

  try {
    term = await createTerminal({ skipColors: true, probeTimeout: 2000 })
    if (term.caps.tmux !== (options.route === "tmux")) throw new Error(`route=${options.route} disagrees with actual caps.tmux=${term.caps.tmux}`)
    if (term.caps.transmissionMode !== "shm") throw new Error(`expected actual SHM transport, received ${term.caps.transmissionMode}`)
    if (!options.live && (term.size.pixelWidth !== WIDTH || term.size.pixelHeight !== HEIGHT)) {
      throw new Error(`expected 1920x1080 terminal pixels, received ${term.size.pixelWidth}x${term.size.pixelHeight}`)
    }
    if (options.live && (term.size.pixelWidth < MIN_LIVE_WIDTH || term.size.pixelHeight < MIN_LIVE_HEIGHT)) {
      throw new Error(`live terminal is too small; need at least ${MIN_LIVE_WIDTH}x${MIN_LIVE_HEIGHT}, received ${term.size.pixelWidth}x${term.size.pixelHeight}`)
    }
    if (options.live) {
      const parser = createParser((event) => {
        if (event.type === "key" && (event.key === "q" || (event.key === "c" && event.mods.ctrl))) abortRequested = true
      })
      const unsubscribe = term.onData((data) => parser.feed(data))
      removeLiveInput = () => { unsubscribe(); parser.destroy() }
    }
    reportBase.terminal = {
      kind: term.kind,
      tmux: term.caps.tmux,
      kittyGraphics: term.caps.kittyGraphics,
      kittyPlaceholder: term.caps.kittyPlaceholder,
      transmissionMode: term.caps.transmissionMode,
      pixelWidth: term.size.pixelWidth,
      pixelHeight: term.size.pixelHeight,
      cols: term.size.cols,
      rows: term.size.rows,
      cellWidth: term.size.cellWidth,
      cellHeight: term.size.cellHeight,
    }

    loop = createRenderLoop(term, { experimental: { nativePresentation: true, nativeLayerRegistry: true } })
    bindLoop(loop)
    backend = getRendererBackend() ?? undefined
    if (!backend) throw new Error("render loop did not install a renderer backend")
    const profiles: FrameProfile[] = []
    const nativeSamples: NativePresentationStats[] = []
    setFrameProfileSink((profile) => profiles.push({ ...profile }))
    const sceneWidth = options.live ? term.size.pixelWidth : WIDTH
    const sceneHeight = options.live ? term.size.pixelHeight : HEIGHT
    if (options.live) {
      removeLiveResize = term.onResize((size) => {
        if (size.pixelWidth !== sceneWidth || size.pixelHeight !== sceneHeight) {
          liveResizeError = `live terminal resized from ${sceneWidth}x${sceneHeight} to ${size.pixelWidth}x${size.pixelHeight}; restart without resizing`
        }
      })
    }
    dispose = render(() => <PerformanceScene control={control} width={sceneWidth} height={sceneHeight} /> as unknown as TGENode, loop.root)
    markDirty()
    loop.frame()
    await settle()
    await waitForTmuxPresentationForTest(backend)
    const liveDeadline = performance.now() + LIVE_BUDGET_MS
    const checkLiveState = () => {
      if (liveResizeError) throw new Error(liveResizeError)
      if (abortRequested) throw new Error("live run aborted by user")
      if (options.live && performance.now() > liveDeadline) throw new Error("live run exceeded its time budget")
    }

    for (const phase of PHASES) {
      checkLiveState()
      control.setPhaseLabel(phase)
      if (phase !== "typing") {
        // Input owns a caret-blink timer while focused. Clear it before each
        // later workload so its timer cannot mutate another phase's scene.
        // Keep the focus registry subscribed while the scene is mounted;
        // resetFocus() is reserved for final teardown below.
        setFocusedId(null)
      }
      await settle()
      loop.frame()
      await settle()
      await waitForTmuxPresentationForTest(backend)
      for (let index = 0; index < options.warmup; index++) {
        checkLiveState()
        mutation(phase, index, loop, control)
        loop.frame()
        await settle()
      }
      await waitForTmuxPresentationForTest(backend)
      await settle()
      profiles.length = 0
      nativeSamples.length = 0
      if (!options.live) {
        await unlink(join(options.out, `${phase}.ack`)).catch(() => {})
        writeMarker(term, options.route, phase, "start", { requestedFrames: options.frames, warmup: options.warmup, intervalMs: options.intervalMs })
      }
      const phaseStart = performance.now()
      const resourceStart = snapshot()
      const wallSamples: number[] = []
      const distinct = new Set<string>()
      let rssMaxBytes = resourceStart.rssBytes
      let nextDeadline = phaseStart

      for (let index = 0; index < options.frames; index++) {
        checkLiveState()
        nextDeadline += options.intervalMs
        const wait = nextDeadline - performance.now()
        if (wait > 0) await Bun.sleep(wait)
        const beforeProfiles = profiles.length
        const started = performance.now()
        const change = mutation(phase, index, loop, control)
        loop.frame()
        wallSamples.push(performance.now() - started)
        rssMaxBytes = Math.max(rssMaxBytes, process.memoryUsage().rss)
        await settle()
        if (change.changed && change.read() === change.before) throw new Error(`${phase} mutation ${index} did not change visible state`)
        if (change.changed) distinct.add(change.read())
        if (profiles.length > beforeProfiles) {
          const stats = getLastNativePresentationStatsForTest()
          if (stats) nativeSamples.push({ ...stats })
        }
      }
      await waitForTmuxPresentationForTest(backend)
      checkLiveState()
      const phaseEnd = performance.now()
      const resourceEnd = snapshot()
      const measurement: PhaseMeasurement = {
        phase,
        requestedFrames: options.frames,
        renderedProfiles: profiles.length,
        distinctMutations: distinct.size,
        wallTimeMs: phaseEnd - phaseStart,
        frameWallMs: sampleSummary(wallSamples),
        cpuUsage: {
          userUs: resourceEnd.cpuUserUs - resourceStart.cpuUserUs,
          systemUs: resourceEnd.cpuSystemUs - resourceStart.cpuSystemUs,
          totalUs: resourceEnd.cpuUserUs - resourceStart.cpuUserUs + resourceEnd.cpuSystemUs - resourceStart.cpuSystemUs,
        },
        rssBytes: { start: resourceStart.rssBytes, end: resourceEnd.rssBytes, max: rssMaxBytes },
        profiles: profileSummary(profiles),
        sampledNativeSnapshots: nativeSummary(nativeSamples),
      }
      if (!options.live) {
        writeMarker(term, options.route, phase, "end", {
          requestedFrames: measurement.requestedFrames,
          renderedProfiles: measurement.renderedProfiles,
          distinctMutations: measurement.distinctMutations,
          wallTimeMs: measurement.wallTimeMs,
        })
        await waitForAck(options.out, phase)
      }
      phases.push(measurement)
    }

    const report: FixtureReport = { ...reportBase, status: "PASS", phases }
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    return 0
  } catch (error) {
    const report: FixtureReport = {
      ...reportBase,
      status: "FAIL",
      phases,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`).catch(() => {})
    return 1
  } finally {
    setFrameProfileSink(null)
    removeLiveInput?.()
    removeLiveResize?.()
    if (loop) {
      unbindLoop()
      resetFocus()
      clearSelection()
    }
    dispose?.()
    loop?.destroy()
    term?.destroy()
    if (options.live) process.stdout.write(`\nVexart live performance report: ${reportPath}\n`)
  }
}

if (import.meta.main) {
  main().then((code) => process.exit(code)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exit(1)
  })
}
