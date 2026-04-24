import { ptr } from "bun:ffi"
import type { NativePresentationStats } from "./native-presentation-stats"
import { openVexartLibrary } from "./vexart-bridge"

/** @public */
export const NATIVE_FRAME_STRATEGY = {
  SKIP_PRESENT: "skip-present",
  LAYERED_DIRTY: "layered-dirty",
  LAYERED_REGION: "layered-region",
  FINAL_FRAME: "final-frame",
} as const

/** @public */
export type NativeFrameStrategy = (typeof NATIVE_FRAME_STRATEGY)[keyof typeof NATIVE_FRAME_STRATEGY]

/** @public */
export const NATIVE_FRAME_TRANSPORT = {
  DIRECT: 0,
  FILE: 1,
  SHM: 2,
} as const

/** @public */
export const NATIVE_FRAME_REASON = {
  NO_DAMAGE: 1 << 0,
  TRANSFORMS: 1 << 1,
  FULL_REPAINT: 1 << 2,
  ACTIVE_INTERACTION: 1 << 3,
  REGION_CANDIDATE: 1 << 4,
  LAYERED_CANDIDATE: 1 << 5,
  BYTES_FAVOR_LAYERED: 1 << 6,
  HYSTERESIS_HELD: 1 << 7,
} as const

/** @public */
export interface NativeFramePlanInput {
  dirtyLayerCount: number
  dirtyPixelArea: number
  totalPixelArea: number
  overlapPixelArea: number
  overlapRatio: number
  fullRepaint: boolean
  hasSubtreeTransforms: boolean
  hasActiveInteraction: boolean
  transmissionMode: number
  lastStrategy: NativeFrameStrategy | null
  framesSinceChange: number
  estimatedLayeredBytes: number
  estimatedFinalBytes: number
}

/** @public */
export interface NativeFramePlan {
  strategy: NativeFrameStrategy
  reasonFlags: number
}

/** @public */
export interface NativeFrameExecutionStats {
  strategy: NativeFrameStrategy | null
  reasonFlags: number | null
  dirtyLayerCount: number
  dirtyPixelArea: number
  totalPixelArea: number
  overlapPixelArea: number
  overlapRatio: number
  fullRepaint: boolean
  transmissionMode: "direct" | "file" | "shm" | null
  estimatedLayeredBytes: number
  estimatedFinalBytes: number
  repaintedCount: number
  stableReuseCount: number
  moveOnlyCount: number
  moveFallbackCount: number
  resourceBytes: number
  gpuResourceBytes: number
  resourceEntries: number
  rendererOutput: string | null
  nativePresentationStats: NativePresentationStats | null
  ffiCallCount: number
  ffiCallsBySymbol: Record<string, number>
}

/** @public */
export interface NativeFrameExecutionStatsInput {
  strategy: NativeFrameStrategy | null
  reasonFlags: number | null
  dirtyLayerCount: number
  dirtyPixelArea: number
  totalPixelArea: number
  overlapPixelArea: number
  overlapRatio: number
  fullRepaint: boolean
  transmissionMode: "direct" | "file" | "shm" | null
  estimatedLayeredBytes: number
  estimatedFinalBytes: number
  repaintedCount: number
  stableReuseCount: number
  moveOnlyCount: number
  moveFallbackCount: number
  resourceBytes: number
  gpuResourceBytes: number
  resourceEntries: number
  rendererOutput: string | null
  nativePresentationStats: NativePresentationStats | null
  ffiCallCount: number
  ffiCallsBySymbol: Record<string, number>
}

/** @public */
export function formatNativeFrameReasonFlags(reasonFlags: number) {
  const tags: string[] = []
  if ((reasonFlags & NATIVE_FRAME_REASON.NO_DAMAGE) !== 0) tags.push("no-damage")
  if ((reasonFlags & NATIVE_FRAME_REASON.TRANSFORMS) !== 0) tags.push("transforms")
  if ((reasonFlags & NATIVE_FRAME_REASON.FULL_REPAINT) !== 0) tags.push("full-repaint")
  if ((reasonFlags & NATIVE_FRAME_REASON.ACTIVE_INTERACTION) !== 0) tags.push("active-interaction")
  if ((reasonFlags & NATIVE_FRAME_REASON.REGION_CANDIDATE) !== 0) tags.push("region")
  if ((reasonFlags & NATIVE_FRAME_REASON.LAYERED_CANDIDATE) !== 0) tags.push("layered")
  if ((reasonFlags & NATIVE_FRAME_REASON.BYTES_FAVOR_LAYERED) !== 0) tags.push("bytes")
  if ((reasonFlags & NATIVE_FRAME_REASON.HYSTERESIS_HELD) !== 0) tags.push("hysteresis")
  return tags.join(",")
}

/** @public */
export function buildNativeFrameExecutionStats(input: NativeFrameExecutionStatsInput): NativeFrameExecutionStats {
  return {
    strategy: input.strategy,
    reasonFlags: input.reasonFlags,
    dirtyLayerCount: input.dirtyLayerCount,
    dirtyPixelArea: input.dirtyPixelArea,
    totalPixelArea: input.totalPixelArea,
    overlapPixelArea: input.overlapPixelArea,
    overlapRatio: input.overlapRatio,
    fullRepaint: input.fullRepaint,
    transmissionMode: input.transmissionMode,
    estimatedLayeredBytes: input.estimatedLayeredBytes,
    estimatedFinalBytes: input.estimatedFinalBytes,
    repaintedCount: input.repaintedCount,
    stableReuseCount: input.stableReuseCount,
    moveOnlyCount: input.moveOnlyCount,
    moveFallbackCount: input.moveFallbackCount,
    resourceBytes: input.resourceBytes,
    gpuResourceBytes: input.gpuResourceBytes,
    resourceEntries: input.resourceEntries,
    rendererOutput: input.rendererOutput,
    nativePresentationStats: input.nativePresentationStats,
    ffiCallCount: input.ffiCallCount,
    ffiCallsBySymbol: input.ffiCallsBySymbol,
  }
}

const INPUT_VERSION = 1
const INPUT_BYTE_SIZE = 76
const OUTPUT_VERSION = 1
const OUTPUT_BYTE_SIZE = 12
const STRATEGY_NONE = 0xffffffff

function u64(view: DataView, offset: number, value: number) {
  view.setBigUint64(offset, BigInt(Math.max(0, Math.round(value))), true)
}

function strategyCode(strategy: NativeFrameStrategy | null) {
  if (strategy === NATIVE_FRAME_STRATEGY.SKIP_PRESENT) return 0
  if (strategy === NATIVE_FRAME_STRATEGY.LAYERED_DIRTY) return 1
  if (strategy === NATIVE_FRAME_STRATEGY.LAYERED_REGION) return 2
  if (strategy === NATIVE_FRAME_STRATEGY.FINAL_FRAME) return 3
  return STRATEGY_NONE
}

function decodeStrategy(code: number): NativeFrameStrategy | null {
  if (code === 0) return NATIVE_FRAME_STRATEGY.SKIP_PRESENT
  if (code === 1) return NATIVE_FRAME_STRATEGY.LAYERED_DIRTY
  if (code === 2) return NATIVE_FRAME_STRATEGY.LAYERED_REGION
  if (code === 3) return NATIVE_FRAME_STRATEGY.FINAL_FRAME
  return null
}

/** @public */
export function nativeChooseFrameStrategy(input: NativeFramePlanInput): NativeFramePlan | null {
  const inBuf = new Uint8Array(INPUT_BYTE_SIZE)
  const inView = new DataView(inBuf.buffer)
  inView.setUint32(0, INPUT_VERSION, true)
  inView.setUint32(4, input.dirtyLayerCount, true)
  u64(inView, 8, input.dirtyPixelArea)
  u64(inView, 16, input.totalPixelArea)
  u64(inView, 24, input.overlapPixelArea)
  inView.setFloat32(32, input.overlapRatio, true)
  inView.setUint32(36, input.fullRepaint ? 1 : 0, true)
  inView.setUint32(40, input.hasSubtreeTransforms ? 1 : 0, true)
  inView.setUint32(44, input.hasActiveInteraction ? 1 : 0, true)
  inView.setUint32(48, input.transmissionMode, true)
  inView.setUint32(52, strategyCode(input.lastStrategy), true)
  inView.setUint32(56, input.framesSinceChange, true)
  u64(inView, 60, input.estimatedLayeredBytes)
  u64(inView, 68, input.estimatedFinalBytes)

  const outBuf = new Uint8Array(OUTPUT_BYTE_SIZE)
  const { symbols } = openVexartLibrary()
  const rc = symbols.vexart_frame_choose_strategy(1n, ptr(inBuf), inBuf.byteLength, ptr(outBuf)) as number
  if (rc !== 0) return null

  const outView = new DataView(outBuf.buffer)
  if (outView.getUint32(0, true) !== OUTPUT_VERSION) return null
  const strategy = decodeStrategy(outView.getUint32(4, true))
  if (!strategy) return null
  return {
    strategy,
    reasonFlags: outView.getUint32(8, true),
  }
}
