/**
 * Debug overlay system — development tools for TGE apps.
 *
 * Provides:
 *   - FPS counter (frames per second, frame time ms)
 *   - Frame stats (layer count, dirty count, node count)
 *   - Toggle via hotkey or API
 *
 * Architecture:
 *   - DebugState is a reactive SolidJS store
 *   - The render loop updates stats every frame
 *   - Components can read debug state to show overlays
 *   - toggleDebug() / setDebug(enabled) control visibility
 *
 * Usage:
 *   import { toggleDebug, debugState } from "@tge/runtime"
 *
 *   // Toggle with Ctrl+Shift+D:
 *   onInput((e) => {
 *     if (e.type === "key" && e.key === "d" && e.mods.ctrl && e.mods.shift) toggleDebug()
 *   })
 *
 *   // Read stats reactively:
 *   <text>{debugState.fps} FPS</text>
 */

import { createSignal } from "solid-js"
import type { NodeHandle } from "./handle"
import type { TGENode } from "../../engine/src/ffi/node"

// ── Debug state ──

export type DebugStats = {
  /** Whether debug overlay is visible */
  enabled: boolean
  /** Frames per second */
  fps: number
  /** Frame time in milliseconds */
  frameTimeMs: number
  /** Number of compositing layers */
  layerCount: number
  /** Layers moved via placement-only compositor updates this frame */
  moveOnlyCount: number
  /** Layers that wanted move-only but had to repaint instead */
  moveFallbackCount: number
  /** Stable layers reused without repaint */
  stableReuseCount: number
  /** Dirty layers before rendering this frame */
  dirtyBeforeCount: number
  /** Layers actually repainted this frame */
  repaintedCount: number
  /** Total TGENode count in the tree */
  nodeCount: number
  /** Total render commands from Clay */
  commandCount: number
  /** Selected renderer strategy for the current frame */
  rendererStrategy: string | null
  /** Actual presentation/output path used for the current frame */
  rendererOutput: string | null
  /** Total tracked renderer/cache bytes */
  resourceBytes: number
  /** GPU-side tracked bytes subset */
  gpuResourceBytes: number
  /** Total tracked cache/resource entries */
  resourceEntries: number
  /** Active terminal transmission mode used for output cost decisions */
  transmissionMode: string | null
  /** Estimated layered output bytes for this frame */
  estimatedLayeredBytes: number
  /** Estimated final-frame output bytes for this frame */
  estimatedFinalBytes: number
  /** Latency from latest input event to presented frame, if measured */
  interactionLatencyMs: number
  /** Last interaction kind that produced the measured latency */
  interactionType: string | null
  /** Monotonic sequence of the last interaction that reached presentation */
  presentedInteractionSeq: number
}

const [debugEnabled, setDebugEnabled] = createSignal(false)
const [fps, setFps] = createSignal(0)
const [frameTimeMs, setFrameTimeMs] = createSignal(0)
const [layerCount, setLayerCount] = createSignal(0)
const [moveOnlyCount, setMoveOnlyCount] = createSignal(0)
const [moveFallbackCount, setMoveFallbackCount] = createSignal(0)
const [stableReuseCount, setStableReuseCount] = createSignal(0)
const [dirtyBeforeCount, setDirtyBeforeCount] = createSignal(0)
const [repaintedCount, setRepaintedCount] = createSignal(0)
const [nodeCount, setNodeCount] = createSignal(0)
const [commandCount, setCommandCount] = createSignal(0)
const [rendererStrategy, setRendererStrategy] = createSignal<string | null>(null)
const [rendererOutput, setRendererOutput] = createSignal<string | null>(null)
const [resourceBytes, setResourceBytes] = createSignal(0)
const [gpuResourceBytes, setGpuResourceBytes] = createSignal(0)
const [resourceEntries, setResourceEntries] = createSignal(0)
const [transmissionMode, setTransmissionMode] = createSignal<string | null>(null)
const [estimatedLayeredBytes, setEstimatedLayeredBytes] = createSignal(0)
const [estimatedFinalBytes, setEstimatedFinalBytes] = createSignal(0)
const [interactionLatencyMs, setInteractionLatencyMs] = createSignal(0)
const [interactionType, setInteractionType] = createSignal<string | null>(null)
const [presentedInteractionSeq, setPresentedInteractionSeq] = createSignal(0)

// FPS tracking
let frameTimestamps: number[] = []
let lastFrameStart = 0

/** Toggle debug overlay on/off. */
export function toggleDebug() {
  setDebugEnabled((v) => !v)
}

/** Set debug overlay state explicitly. */
export function setDebug(enabled: boolean) {
  setDebugEnabled(enabled)
}

/** Check if debug is enabled (reactive). */
export function isDebugEnabled(): boolean {
  return debugEnabled()
}

/**
 * Call at the START of each frame to track timing.
 * Returns a finish callback to call at the END of the frame.
 */
export function debugFrameStart(): () => void {
  if (!debugEnabled()) return () => {}

  lastFrameStart = performance.now()

  return () => {
    const elapsed = performance.now() - lastFrameStart
    setFrameTimeMs(Math.round(elapsed * 100) / 100)

    // Track FPS over a rolling 1-second window
    const now = performance.now()
    frameTimestamps.push(now)
    frameTimestamps = frameTimestamps.filter((t) => now - t < 1000)
    setFps(frameTimestamps.length)
  }
}

/** Update debug stats from the render loop. */
export function debugUpdateStats(stats: {
  layerCount: number
  moveOnlyCount?: number
  moveFallbackCount?: number
  stableReuseCount?: number
  dirtyBeforeCount: number
  repaintedCount: number
  nodeCount: number
  commandCount: number
  rendererStrategy?: string | null
  rendererOutput?: string | null
  resourceBytes?: number
  gpuResourceBytes?: number
  resourceEntries?: number
  transmissionMode?: string | null
  estimatedLayeredBytes?: number
  estimatedFinalBytes?: number
  interactionLatencyMs?: number
  interactionType?: string | null
  presentedInteractionSeq?: number
}) {
  if (!debugEnabled()) return
  setLayerCount(stats.layerCount)
  setMoveOnlyCount(stats.moveOnlyCount ?? 0)
  setMoveFallbackCount(stats.moveFallbackCount ?? 0)
  setStableReuseCount(stats.stableReuseCount ?? 0)
  setDirtyBeforeCount(stats.dirtyBeforeCount)
  setRepaintedCount(stats.repaintedCount)
  setNodeCount(stats.nodeCount)
  setCommandCount(stats.commandCount)
  setRendererStrategy(stats.rendererStrategy ?? null)
  setRendererOutput(stats.rendererOutput ?? null)
  setResourceBytes(stats.resourceBytes ?? 0)
  setGpuResourceBytes(stats.gpuResourceBytes ?? 0)
  setResourceEntries(stats.resourceEntries ?? 0)
  setTransmissionMode(stats.transmissionMode ?? null)
  setEstimatedLayeredBytes(stats.estimatedLayeredBytes ?? 0)
  setEstimatedFinalBytes(stats.estimatedFinalBytes ?? 0)
  setInteractionLatencyMs(stats.interactionLatencyMs ?? 0)
  setInteractionType(stats.interactionType ?? null)
  setPresentedInteractionSeq(stats.presentedInteractionSeq ?? 0)
}

/** Reactive debug stats — read in SolidJS components. */
export const debugState = {
  get enabled() { return debugEnabled() },
  get fps() { return fps() },
  get frameTimeMs() { return frameTimeMs() },
  get layerCount() { return layerCount() },
  get moveOnlyCount() { return moveOnlyCount() },
  get moveFallbackCount() { return moveFallbackCount() },
  get stableReuseCount() { return stableReuseCount() },
  get dirtyBeforeCount() { return dirtyBeforeCount() },
  get repaintedCount() { return repaintedCount() },
  get nodeCount() { return nodeCount() },
  get commandCount() { return commandCount() },
  get rendererStrategy() { return rendererStrategy() },
  get rendererOutput() { return rendererOutput() },
  get resourceBytes() { return resourceBytes() },
  get gpuResourceBytes() { return gpuResourceBytes() },
  get resourceEntries() { return resourceEntries() },
  get transmissionMode() { return transmissionMode() },
  get estimatedLayeredBytes() { return estimatedLayeredBytes() },
  get estimatedFinalBytes() { return estimatedFinalBytes() },
  get interactionLatencyMs() { return interactionLatencyMs() },
  get interactionType() { return interactionType() },
  get presentedInteractionSeq() { return presentedInteractionSeq() },
}

/**
 * Format debug stats as a single-line string.
 * Useful for rendering in a text overlay.
 */
export function debugStatsLine(): string {
  if (!debugEnabled()) return ""
  return `${fps()} FPS | ${frameTimeMs()}ms | ${layerCount()} layers | move=${moveOnlyCount()}/${moveFallbackCount()}/${stableReuseCount()} | ${dirtyBeforeCount()} dirty before | ${repaintedCount()} repainted | ${nodeCount()} nodes | ${commandCount()} cmds | strategy=${rendererStrategy() ?? "none"} | output=${rendererOutput() ?? "none"} | tx=${transmissionMode() ?? "none"} | est=${estimatedLayeredBytes()}/${estimatedFinalBytes()}B | input=${interactionType() ?? "none"}@${interactionLatencyMs()}ms | res=${resourceEntries()}@${resourceBytes()}B gpu=${gpuResourceBytes()}B`
}

function describeNode(node: TGENode, depth: number): string {
  const pad = "  ".repeat(depth)
  if (node.kind === "text") {
    const raw = node.text ?? ""
    const text = raw.length === 0 ? "<empty>" : JSON.stringify(raw)
    return `${pad}- text#${node.id} ${text}`
  }

  const tags: string[] = []
  if (node.kind === "canvas") tags.push("canvas")
  if (node.kind === "img") tags.push("img")
  if (node.kind === "root") tags.push("root")
  if (node.props.layer) tags.push("layer")
  if (node.props.floating) tags.push(`floating=${typeof node.props.floating === "string" ? node.props.floating : "attach"}`)
  if (node.props.width !== undefined) tags.push(`w=${String(node.props.width)}`)
  if (node.props.height !== undefined) tags.push(`h=${String(node.props.height)}`)

  const suffix = tags.length > 0 ? ` [${tags.join(", ")}]` : ""
  const lines = [`${pad}- ${node.kind}#${node.id}${suffix}`]
  for (const child of node.children) lines.push(describeNode(child, depth + 1))
  return lines.join("\n")
}

export function debugDumpTree(target: NodeHandle | TGENode): string {
  const node = "_node" in target ? target._node : target
  return describeNode(node, 0)
}
