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
 *   import { toggleDebug, debugState } from "@tge/renderer"
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
  /** Number of dirty layers this frame */
  dirtyCount: number
  /** Total TGENode count in the tree */
  nodeCount: number
  /** Total render commands from Clay */
  commandCount: number
}

const [debugEnabled, setDebugEnabled] = createSignal(false)
const [fps, setFps] = createSignal(0)
const [frameTimeMs, setFrameTimeMs] = createSignal(0)
const [layerCount, setLayerCount] = createSignal(0)
const [dirtyCount, setDirtyCount] = createSignal(0)
const [nodeCount, setNodeCount] = createSignal(0)
const [commandCount, setCommandCount] = createSignal(0)

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
  dirtyCount: number
  nodeCount: number
  commandCount: number
}) {
  if (!debugEnabled()) return
  setLayerCount(stats.layerCount)
  setDirtyCount(stats.dirtyCount)
  setNodeCount(stats.nodeCount)
  setCommandCount(stats.commandCount)
}

/** Reactive debug stats — read in SolidJS components. */
export const debugState = {
  get enabled() { return debugEnabled() },
  get fps() { return fps() },
  get frameTimeMs() { return frameTimeMs() },
  get layerCount() { return layerCount() },
  get dirtyCount() { return dirtyCount() },
  get nodeCount() { return nodeCount() },
  get commandCount() { return commandCount() },
}

/**
 * Format debug stats as a single-line string.
 * Useful for rendering in a text overlay.
 */
export function debugStatsLine(): string {
  if (!debugEnabled()) return ""
  return `${fps()} FPS | ${frameTimeMs()}ms | ${layerCount()} layers | ${dirtyCount()} dirty | ${nodeCount()} nodes | ${commandCount()} cmds`
}
