/**
 * Debug overlay system — development tools for Vexart apps.
 *
 * Provides:
 *   - FPS counter (frames per second, frame time ms)
 *   - Frame stats (layer count, dirty count, node count)
 *   - Toggle via hotkey or API
 *
 * Architecture:
 *   - DebugState is a reactive SolidJS store (single store, per-property tracking)
 *   - The render loop updates stats every frame
 *   - Components can read debug state to show overlays
 *   - toggleDebug() / setDebug(enabled) control visibility
 *
 * Usage:
 *   import { toggleDebug, debugState } from "@vexart/engine"
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
import type { NodeHandle } from "../reconciler/handle"
import type { TGENode } from "../ffi/node"
import { buildNativeFrameExecutionStats, formatNativeFrameReasonFlags, type NativeFrameExecutionStats, type NativeFrameStrategy } from "../ffi/gpu-layer-strategy"
import { getNativePresentationFallbackReason } from "../ffi/native-presentation-flags"
import { formatNativeStats, type NativePresentationStats } from "../ffi/native-presentation-stats"

// ── Debug state ──

/** @public */
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
  /** Total render commands from the layout adapter */
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
  /** Whether native presentation is active for this frame */
  nativePresentationActive: boolean
  /** Fallback reason if native presentation was disabled */
  nativePresentationFallbackReason: string | null
  /** Last native presentation stats (if available) */
  nativeStats: NativePresentationStats | null
  /** Native frame planner reason flags for the chosen strategy, if available */
  nativeFrameReasonFlags: number | null
  /** Structured native frame execution stats for debug/inspection */
  nativeFrameStats: NativeFrameExecutionStats | null
  /** FFI call count recorded for the latest frame */
  ffiCallCount: number
}

// ── Reactive store ──
// One mutable store object + per-property signal tracking via getters.
// Replaces 28 individual createSignal pairs with a single store.

const _store: DebugStats = {
  enabled: false,
  fps: 0,
  frameTimeMs: 0,
  layerCount: 0,
  moveOnlyCount: 0,
  moveFallbackCount: 0,
  stableReuseCount: 0,
  dirtyBeforeCount: 0,
  repaintedCount: 0,
  nodeCount: 0,
  commandCount: 0,
  rendererStrategy: null,
  rendererOutput: null,
  resourceBytes: 0,
  gpuResourceBytes: 0,
  resourceEntries: 0,
  transmissionMode: null,
  estimatedLayeredBytes: 0,
  estimatedFinalBytes: 0,
  interactionLatencyMs: 0,
  interactionType: null,
  presentedInteractionSeq: 0,
  nativePresentationActive: false,
  nativePresentationFallbackReason: null,
  nativeStats: null,
  nativeFrameReasonFlags: null,
  nativeFrameStats: null,
  ffiCallCount: 0,
}

// Per-property signals for fine-grained reactivity (like createStore but no dependency).
// Map from property name → [getter, setter] signal pair.
const _signals = new Map<string, [() => unknown, (v: unknown) => void]>()

function getSignal<K extends keyof DebugStats>(key: K): [() => DebugStats[K], (v: DebugStats[K]) => void] {
  let entry = _signals.get(key)
  if (!entry) {
    const [get, set] = createSignal(_store[key] as never)
    entry = [get as () => unknown, set as (v: unknown) => void]
    _signals.set(key, entry)
  }
  return entry as [() => DebugStats[K], (v: DebugStats[K]) => void]
}

function setField<K extends keyof DebugStats>(key: K, value: DebugStats[K]) {
  if (_store[key] === value) return
  ;(_store as Record<string, unknown>)[key] = value
  const entry = _signals.get(key)
  if (entry) entry[1](value)
}

function readField<K extends keyof DebugStats>(key: K): DebugStats[K] {
  const entry = _signals.get(key)
  if (entry) return entry[0]() as DebugStats[K]
  // Lazy init: create signal on first reactive read
  return getSignal(key)[0]()
}

// FPS tracking
let frameTimestamps: number[] = []
let lastFrameStart = 0

/** Toggle debug overlay on/off. */
/** @public */
export function toggleDebug() {
  setField("enabled", !_store.enabled)
}

/** Set debug overlay state explicitly. */
/** @public */
export function setDebug(enabled: boolean) {
  setField("enabled", enabled)
}

/** Check if debug is enabled (reactive). */
/** @public */
export function isDebugEnabled(): boolean {
  return readField("enabled")
}

/**
 * Call at the START of each frame to track timing.
 * Returns a finish callback to call at the END of the frame.
 */
/** @public */
export function debugFrameStart(): () => void {
  if (!_store.enabled) return () => {}

  lastFrameStart = performance.now()

  return () => {
    const elapsed = performance.now() - lastFrameStart
    setField("frameTimeMs", Math.round(elapsed * 100) / 100)

    // Track FPS over a rolling 1-second window
    const now = performance.now()
    frameTimestamps.push(now)
    frameTimestamps = frameTimestamps.filter((t) => now - t < 1000)
    setField("fps", frameTimestamps.length)
  }
}

/** Input type for debugUpdateStats — matches the inline parameter object. */
export type DebugUpdateStatsInput = {
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
  dirtyPixelArea?: number
  totalPixelArea?: number
  overlapPixelArea?: number
  overlapRatio?: number
  fullRepaint?: boolean
  resourceBytes?: number
  gpuResourceBytes?: number
  resourceEntries?: number
  transmissionMode?: string | null
  estimatedLayeredBytes?: number
  estimatedFinalBytes?: number
  interactionLatencyMs?: number
  interactionType?: string | null
  presentedInteractionSeq?: number
  nativeStats?: NativePresentationStats | null
  nativeFrameReasonFlags?: number | null
  ffiCallCount?: number
  ffiCallsBySymbol?: Record<string, number>
}

/** Update debug stats from the render loop. */
/** @public */
export function debugUpdateStats(stats: DebugUpdateStatsInput) {
  if (!_store.enabled) return
  setField("layerCount", stats.layerCount)
  setField("moveOnlyCount", stats.moveOnlyCount ?? 0)
  setField("moveFallbackCount", stats.moveFallbackCount ?? 0)
  setField("stableReuseCount", stats.stableReuseCount ?? 0)
  setField("dirtyBeforeCount", stats.dirtyBeforeCount)
  setField("repaintedCount", stats.repaintedCount)
  setField("nodeCount", stats.nodeCount)
  setField("commandCount", stats.commandCount)
  setField("rendererStrategy", stats.rendererStrategy ?? null)
  setField("rendererOutput", stats.rendererOutput ?? null)
  setField("resourceBytes", stats.resourceBytes ?? 0)
  setField("gpuResourceBytes", stats.gpuResourceBytes ?? 0)
  setField("resourceEntries", stats.resourceEntries ?? 0)
  setField("transmissionMode", stats.transmissionMode ?? null)
  setField("estimatedLayeredBytes", stats.estimatedLayeredBytes ?? 0)
  setField("estimatedFinalBytes", stats.estimatedFinalBytes ?? 0)
  setField("interactionLatencyMs", stats.interactionLatencyMs ?? 0)
  setField("interactionType", stats.interactionType ?? null)
  setField("presentedInteractionSeq", stats.presentedInteractionSeq ?? 0)
  // Native presentation stats (Phase 2b)
  const isNative = stats.rendererOutput === "native-presented"
  setField("nativePresentationActive", isNative)
  setField("nativePresentationFallbackReason", getNativePresentationFallbackReason())
  setField("nativeStats", stats.nativeStats ?? null)
  const nextReasonFlags = stats.nativeFrameReasonFlags ?? null
  setField("nativeFrameReasonFlags", nextReasonFlags)
  setField("ffiCallCount", stats.ffiCallCount ?? 0)
  setField("nativeFrameStats", buildNativeFrameExecutionStats({
    strategy: (stats.rendererStrategy as NativeFrameStrategy | null) ?? null,
    reasonFlags: nextReasonFlags,
    dirtyLayerCount: stats.dirtyBeforeCount,
    dirtyPixelArea: stats.dirtyPixelArea ?? 0,
    totalPixelArea: stats.totalPixelArea ?? 0,
    overlapPixelArea: stats.overlapPixelArea ?? 0,
    overlapRatio: stats.overlapRatio ?? 0,
    fullRepaint: stats.fullRepaint ?? false,
    transmissionMode: (stats.transmissionMode as "direct" | "file" | "shm" | null) ?? null,
    estimatedLayeredBytes: stats.estimatedLayeredBytes ?? 0,
    estimatedFinalBytes: stats.estimatedFinalBytes ?? 0,
    repaintedCount: stats.repaintedCount,
    stableReuseCount: stats.stableReuseCount ?? 0,
    moveOnlyCount: stats.moveOnlyCount ?? 0,
    moveFallbackCount: stats.moveFallbackCount ?? 0,
    resourceBytes: stats.resourceBytes ?? 0,
    gpuResourceBytes: stats.gpuResourceBytes ?? 0,
    resourceEntries: stats.resourceEntries ?? 0,
    rendererOutput: stats.rendererOutput ?? null,
    nativePresentationStats: stats.nativeStats ?? null,
    ffiCallCount: stats.ffiCallCount ?? 0,
    ffiCallsBySymbol: stats.ffiCallsBySymbol ?? {},
  }))
}

export function debugRecordFfiCounts(count: number, callsBySymbol: Record<string, number>) {
  if (!_store.enabled) return
  setField("ffiCallCount", count)
  const current = _store.nativeFrameStats
  if (!current) return
  setField("nativeFrameStats", {
    ...current,
    ffiCallCount: count,
    ffiCallsBySymbol: callsBySymbol,
  })
}

/**
 * Reactive debug stats — read in SolidJS components.
 * Property access triggers fine-grained signal tracking.
 * @public
 */
export const debugState: Readonly<DebugStats> = new Proxy(_store, {
  get(_target, prop: string) {
    if (prop in _store) return readField(prop as keyof DebugStats)
    return undefined
  },
}) as Readonly<DebugStats>

/**
 * Format debug stats as a single-line string.
 * Useful for rendering in a text overlay.
 */
/** @public */
export function debugStatsLine(): string {
  if (!_store.enabled) return ""
  const native = _store.nativePresentationActive ? "on" : "off"
  const fallback = _store.nativePresentationFallbackReason ? ` [${_store.nativePresentationFallbackReason}]` : ""
  const nStatsStr = _store.nativeStats ? ` | ${formatNativeStats(_store.nativeStats)}` : ""
  const frameReason = _store.nativeFrameReasonFlags
  const frameReasonStr = frameReason !== null && frameReason !== 0 ? ` reasons=${formatNativeFrameReasonFlags(frameReason)}` : ""
  return `${_store.fps} FPS | ${_store.frameTimeMs}ms | ${_store.layerCount} layers | move=${_store.moveOnlyCount}/${_store.moveFallbackCount}/${_store.stableReuseCount} | ${_store.dirtyBeforeCount} dirty before | ${_store.repaintedCount} repainted | ${_store.nodeCount} nodes | ${_store.commandCount} cmds | ffi=${_store.ffiCallCount} | strategy=${_store.rendererStrategy ?? "none"}${frameReasonStr} | output=${_store.rendererOutput ?? "none"} | tx=${_store.transmissionMode ?? "none"} | est=${_store.estimatedLayeredBytes}/${_store.estimatedFinalBytes}B | input=${_store.interactionType ?? "none"}@${_store.interactionLatencyMs}ms | res=${_store.resourceEntries}@${_store.resourceBytes}B gpu=${_store.gpuResourceBytes}B | native=${native}${fallback}${nStatsStr}`
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

/** @public */
export function debugDumpTree(target: NodeHandle | TGENode): string {
  const node = "_node" in target ? target._node : target
  return describeNode(node, 0)
}

/**
 * Dump nodes that were culled by AABB viewport culling.
 * Only meaningful when cullingEnabled is true in the WalkTreeState.
 *
 * @param root       - TGENode root to traverse
 * @param viewport   - Current viewport rect for AABB comparison
 * @returns Human-readable dump of all culled node subtree roots.
 */
/** @public */
export function debugDumpCulledNodes(
  root: TGENode,
  viewport: { width: number; height: number },
): string {
  const lines: string[] = []

  function visit(node: TGENode, depth: number) {
    if (node.kind === "text") return
    const isScrollContainer = !!(node.props.scrollX || node.props.scrollY)
    const l = node.layout
    if (!isScrollContainer && l.width > 0 && l.height > 0 && node.children.length > 0) {
      const fullyLeft = l.x + l.width <= 0
      const fullyRight = l.x >= viewport.width
      const fullyAbove = l.y + l.height <= 0
      const fullyBelow = l.y >= viewport.height
      if (fullyLeft || fullyRight || fullyAbove || fullyBelow) {
        const pad = "  ".repeat(depth)
        const reason = fullyLeft ? "left" : fullyRight ? "right" : fullyAbove ? "above" : "below"
        lines.push(`${pad}[culled:${reason}] ${node.kind}#${node.id} bounds=(${l.x},${l.y},${l.width}x${l.height})`)
        return // Don't recurse — entire subtree is culled
      }
    }
    for (const child of node.children) visit(child, depth + 1)
  }

  visit(root, 0)
  return lines.length > 0 ? lines.join("\n") : "(no culled nodes)"
}
