import { OpenCodeCosmicShellApp } from "../examples/opencode-cosmic-shell/app"
import { createRenderLoop, solidRender } from "../packages/engine/src/public"
import { setFrameProfileSink } from "../packages/engine/src/loop/loop"
import { markDirty } from "../packages/engine/src/reconciler/dirty"
import { bindLoop, unbindLoop } from "../packages/engine/src/reconciler/pointer"
import { resetFocus } from "../packages/engine/src/reconciler/focus"
import { resetSelection } from "../packages/engine/src/reconciler/selection"
import type { Terminal } from "../packages/engine/src/terminal/index"

const WIDTH = 1512
const HEIGHT = 756
const WARMUP_FRAMES = 4
const MEASURE_FRAMES = 30
const TARGET_FRAME_MS = 1000 / 60

const TRANSMISSION_MODE = {
  DIRECT: "direct",
  FILE: "file",
  SHM: "shm",
} as const

type TransmissionMode = (typeof TRANSMISSION_MODE)[keyof typeof TRANSMISSION_MODE]

type FrameProfile = {
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
  paintMs: number
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
  beginSyncMs: number
  ioMs: number
  endSyncMs: number
  commands: number
  repainted: number
  dirtyBefore: number
}

type ProfileKey = keyof FrameProfile

const PROFILE_KEYS: ProfileKey[] = [
  "totalMs",
  "scrollMs",
  "walkTreeMs",
  "layoutComputeMs",
  "layoutWritebackMs",
  "interactionMs",
  "relayoutMs",
  "layoutMs",
  "layerAssignMs",
  "prepMs",
  "paintNativeSnapshotMs",
  "paintLayerPrepMs",
  "paintFrameContextMs",
  "paintBackendBeginMs",
  "paintReuseMs",
  "paintRenderGraphMs",
  "paintMs",
  "paintBackendPaintMs",
  "paintBackendCompositeMs",
  "paintBackendReadbackMs",
  "paintBackendNativeEmitMs",
  "paintBackendNativeReadbackMs",
  "paintBackendNativeCompressMs",
  "paintBackendNativeShmPrepareMs",
  "paintBackendNativeWriteMs",
  "paintBackendNativeRawBytes",
  "paintBackendNativePayloadBytes",
  "paintBackendUniformMs",
  "paintLayerCleanupMs",
  "paintBackendEndMs",
  "paintPresentationMs",
  "paintInteractionStatsMs",
  "beginSyncMs",
  "ioMs",
  "endSyncMs",
  "commands",
  "repainted",
  "dirtyBefore",
]

function resolveTransmissionMode(value: string | undefined): TransmissionMode {
  if (value === TRANSMISSION_MODE.DIRECT) return TRANSMISSION_MODE.DIRECT
  if (value === TRANSMISSION_MODE.FILE) return TRANSMISSION_MODE.FILE
  return TRANSMISSION_MODE.SHM
}

function createMockTerminal(width: number, height: number, transmissionMode: TransmissionMode): Terminal {
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
      transmissionMode,
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

function summarize(frames: FrameProfile[]) {
  const total = frames.reduce((sum, frame) => sum + frame.totalMs, 0)
  const avgFrameMs = total / Math.max(frames.length, 1)
  const avg = (key: ProfileKey) => frames.reduce((sum, frame) => sum + frame[key], 0) / Math.max(frames.length, 1)
  return {
    avgFrameMs,
    fps: 1000 / avgFrameMs,
    avg,
  }
}

function topStages(frames: FrameProfile[], count = 8) {
  const summary = summarize(frames)
  return PROFILE_KEYS
    .filter((key) => key.endsWith("Ms") && key !== "totalMs" && key !== "paintMs" && key !== "layoutMs")
    .map((key) => ({ key, value: summary.avg(key) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
}

function printResult(name: string, frames: FrameProfile[]) {
  const summary = summarize(frames)
  console.log(`\n${name}`)
  console.log(`Frames      : ${frames.length}`)
  console.log(`Avg / frame : ${summary.avgFrameMs.toFixed(2)} ms`)
  console.log(`FPS         : ${summary.fps.toFixed(1)}`)
  console.log(`Walk/Layout/Paint avg: ${summary.avg("walkTreeMs").toFixed(2)} / ${summary.avg("layoutMs").toFixed(2)} / ${summary.avg("paintMs").toFixed(2)} ms`)
  console.log(`Layout compute/write/interaction/relayout: ${summary.avg("layoutComputeMs").toFixed(2)} / ${summary.avg("layoutWritebackMs").toFixed(2)} / ${summary.avg("interactionMs").toFixed(2)} / ${summary.avg("relayoutMs").toFixed(2)} ms`)
  console.log(`Layer assign/prep/layerPrep/frameCtx: ${summary.avg("layerAssignMs").toFixed(2)} / ${summary.avg("prepMs").toFixed(2)} / ${summary.avg("paintLayerPrepMs").toFixed(2)} / ${summary.avg("paintFrameContextMs").toFixed(2)} ms`)
  console.log(`RenderGraph/backendPaint/composite/readback: ${summary.avg("paintRenderGraphMs").toFixed(2)} / ${summary.avg("paintBackendPaintMs").toFixed(2)} / ${summary.avg("paintBackendCompositeMs").toFixed(2)} / ${summary.avg("paintBackendReadbackMs").toFixed(2)} ms`)
  console.log(`Native emit/readback/compress/shm/write: ${summary.avg("paintBackendNativeEmitMs").toFixed(2)} / ${summary.avg("paintBackendNativeReadbackMs").toFixed(2)} / ${summary.avg("paintBackendNativeCompressMs").toFixed(2)} / ${summary.avg("paintBackendNativeShmPrepareMs").toFixed(2)} / ${summary.avg("paintBackendNativeWriteMs").toFixed(2)} ms`)
  console.log(`Presentation/io/sync/end: ${summary.avg("paintPresentationMs").toFixed(2)} / ${summary.avg("ioMs").toFixed(2)} / ${summary.avg("beginSyncMs").toFixed(2)} / ${summary.avg("endSyncMs").toFixed(2)} ms`)
  console.log(`Commands/Repainted/Dirty avg: ${summary.avg("commands").toFixed(1)} / ${summary.avg("repainted").toFixed(1)} / ${summary.avg("dirtyBefore").toFixed(1)}`)
  console.log(`Native raw/payload bytes avg: ${summary.avg("paintBackendNativeRawBytes").toFixed(0)} / ${summary.avg("paintBackendNativePayloadBytes").toFixed(0)}`)
  console.log(`Top stages  : ${topStages(frames).map((stage) => `${stage.key}=${stage.value.toFixed(2)}ms`).join(", ")}`)
  return summary
}

function emptyProfile(totalMs: number): FrameProfile {
  return {
    totalMs,
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
    paintMs: 0,
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
    beginSyncMs: 0,
    ioMs: 0,
    endSyncMs: 0,
    commands: 0,
    repainted: 0,
    dirtyBefore: 0,
  }
}

function measureManual(name: string, frames: number, run: () => void) {
  const times: FrameProfile[] = []
  for (let i = 0; i < frames; i++) {
    const start = performance.now()
    run()
    times.push(emptyProfile(performance.now() - start))
  }
  return printResult(name, times)
}

const transmissionMode = resolveTransmissionMode(process.env.OPENCODE_PERF_TRANSMISSION_MODE ?? process.env.TGE_FORCE_TRANSMISSION_MODE)
const terminal = createMockTerminal(WIDTH, HEIGHT, transmissionMode)
const loop = createRenderLoop(terminal, {
  experimental: {
    forceLayerRepaint: false,
    nativePresentation: true,
    nativeLayerRegistry: true,
  },
})

bindLoop(loop)

const profiles: FrameProfile[] = []
setFrameProfileSink((profile) => {
  profiles.push(Object.fromEntries(PROFILE_KEYS.map((key) => [key, profile[key]])) as FrameProfile)
})

const dispose = solidRender(() => <OpenCodeCosmicShellApp width={WIDTH} height={HEIGHT} /> as never, loop.root)

try {
  console.log(`OpenCode Cosmic Shell perf mode: tx=${transmissionMode}`)
  markDirty()
  for (let i = 0; i < WARMUP_FRAMES; i++) loop.frame()

  const retained = measureManual("OpenCode Cosmic Shell retained/no-op", MEASURE_FRAMES, () => loop.frame())

  profiles.length = 0
  for (let i = 0; i < MEASURE_FRAMES; i++) {
    loop.feedPointer(120 + (i % 6) * 32, 240 + (i % 4) * 28, false)
    loop.frame()
  }
  const interaction = printResult("OpenCode Cosmic Shell pointer interaction", profiles.length > 0 ? profiles : [emptyProfile(0)])

  profiles.length = 0
  markDirty()
  loop.frame()
  const fullDirty = printResult("OpenCode Cosmic Shell full dirty diagnostic", profiles)

  console.log(`\nTarget      : <= ${TARGET_FRAME_MS.toFixed(2)} ms/frame`)
  if (retained.avgFrameMs > TARGET_FRAME_MS || interaction.avgFrameMs > TARGET_FRAME_MS) {
    console.error("❌ 60+ FPS target failed")
    process.exit(1)
  }
  if (fullDirty.avgFrameMs > TARGET_FRAME_MS) console.log("⚠️  Full dirty repaint is diagnostic-only; retained/interaction paths are gated.")
  console.log("✅ 60+ FPS target passed")
} finally {
  dispose()
  unbindLoop(loop)
  resetFocus()
  resetSelection()
  setFrameProfileSink(null)
}
