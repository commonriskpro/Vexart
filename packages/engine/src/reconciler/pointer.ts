/** Pointer capture runtime boundary with multi-instance support. */

import type { RenderLoop } from "../loop/types"
import type { DamageRect } from "../ffi/damage"
import { useEngineContext } from "../context"

// Module-level fallback — prefers useEngineContext()?.loop.
let activeLoop: RenderLoop | null = null

function resolveLoop(): RenderLoop | null {
  return useEngineContext()?.loop ?? activeLoop
}

/** @public */
export function bindLoop(loop: RenderLoop) {
  activeLoop = loop
}

/** @public */
export function unbindLoop(loop?: RenderLoop) {
  if (!loop || activeLoop === loop) {
    activeLoop = null
  }
}

/** @public */
export function setPointerCapture(nodeId: number): void {
  resolveLoop()?.setPointerCapture(nodeId)
}

/** @public */
export function releasePointerCapture(nodeId: number): void {
  resolveLoop()?.releasePointerCapture(nodeId)
}

/** @public */
export function getCapturedNodeId(): number {
  return resolveLoop()?.getCapturedNodeId?.() ?? 0
}

/** @public */
export function onPostScroll(cb: () => void): () => void {
  return resolveLoop()?.onPostScroll(cb) ?? (() => {})
}

/** @public */
export function markNodeLayerDamaged(nodeId: number, rect?: DamageRect): void {
  resolveLoop()?.markNodeLayerDamaged(nodeId, rect)
}

/** @public */
export function requestInteractionFrame(kind: "pointer" | "scroll" | "key"): void {
  resolveLoop()?.requestInteractionFrame(kind)
}
